// Pairs (spec 2026-10-06 buddies §3-§4). A pair is stored once, userAId < userBId. createPairTx is the
// only writer (inside the caller's transaction; enqueuePaired after commit; createPair wraps both):
// from a redeemed code, an accepted request, or crossed requests. An existing pair is success.

import type { BuddyPair, Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError, isUniqueViolation } from './errors';
import { pushName } from './notify';
import { enqueueBuddyNotice, type NotifyQueue } from './notifyQueue';

type Db = Prisma.TransactionClient | typeof prisma;

export interface PairDeps {
  /** Default: the shared buddy notify queue (getBuddyNotifyQueue). */
  notifyQueue?: NotifyQueue;
}

/** Ids are lowercase UUIDs (Prisma uuid()), so JS string order and the DB collation agree on which is userA. */
export function orderedPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export function findPair(a: string, b: string, db: Db = prisma): Promise<BuddyPair | null> {
  return db.buddyPair.findUnique({ where: { userAId_userBId: orderedPair(a, b) } });
}

export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  return (await prisma.buddyBlock.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } } })) !== null;
}

export async function isBlockedEitherWay(a: string, b: string, db: Db = prisma): Promise<boolean> {
  return (await db.buddyBlock.count({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } })) > 0;
}

/**
 * Serialises pairing and blocking for one pair of people: a transaction-scoped advisory lock on the
 * ordered ids. Every pairing transaction takes it before its block re-check (pairingBlockedTx) and
 * block takes it first, so a block can never land between a pairing's check and its insert: one
 * waits for the other, and block's unpair then removes a pair that won.
 */
export async function lockPairSlot(tx: Prisma.TransactionClient, a: string, b: string): Promise<void> {
  const { userAId, userBId } = orderedPair(a, b);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userAId}), hashtext(${userBId}))`;
}

/** Inside a pairing transaction: take the pair lock, then re-check a block either way. */
export async function pairingBlockedTx(tx: Prisma.TransactionClient, a: string, b: string): Promise<boolean> {
  await lockPairSlot(tx, a, b);
  return isBlockedEitherWay(a, b, tx);
}

export interface PairingUser {
  id: string;
  handle: string;
  displayName: string | null;
}

/** Every pairing action needs a handle (handle_required) and the mood notice (mood_notice_required). */
export async function requirePairingReady(userId: string): Promise<PairingUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, handle: true, displayName: true, buddyMoodNoticeAt: true } });
  if (!user?.handle) throw new BuddyError('handle_required');
  if (!user.buddyMoodNoticeAt) throw new BuddyError('mood_notice_required');
  return { id: user.id, handle: user.handle, displayName: user.displayName };
}

export interface PairResult {
  pairId: string;
  created: boolean;
}

/**
 * The pairing writes, inside the caller's transaction. The pair is inserted with ON CONFLICT DO NOTHING
 * (skipDuplicates), so an existing pair never aborts the transaction and a concurrent insert waits for
 * the other to commit. Only when new: every PENDING request between the two (either way, hidden or not)
 * becomes ACCEPTED, every DECLINED one is withdrawn and closed (gone for its sender, and its 30-day
 * swallow ends), and both get a PAIRED Activity item with refId = pair id. Sends nothing.
 */
export async function createPairTx(tx: Prisma.TransactionClient, a: string, b: string, now: Date): Promise<PairResult> {
  const inserted = await tx.buddyPair.createMany({ data: [{ ...orderedPair(a, b), createdAt: now, lastActivityAt: now }], skipDuplicates: true });
  const pair = await tx.buddyPair.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(a, b) }, select: { id: true } });
  if (inserted.count === 0) return { pairId: pair.id, created: false };
  await tx.buddyRequest.updateMany({
    where: { status: 'PENDING', OR: [{ fromUserId: a, toUserId: b }, { fromUserId: b, toUserId: a }] },
    data: { status: 'ACCEPTED', respondedAt: now },
  });
  // A declined request still reads "Pending" to its sender; once paired it must not sit next to the buddy.
  // The pairing supersedes the decline, so the row is also closed (CANCELLED): only a DECLINED row
  // swallows later requests, and after an unpair a new request from either side is an ordinary one.
  await tx.buddyRequest.updateMany({
    where: { status: 'DECLINED', OR: [{ fromUserId: a, toUserId: b }, { fromUserId: b, toUserId: a }] },
    data: { status: 'CANCELLED', withdrawnAt: now },
  });
  await tx.buddyActivity.createMany({
    data: [
      { recipientId: a, actorId: b, kind: 'PAIRED', refId: pair.id, createdAt: now },
      { recipientId: b, actorId: a, kind: 'PAIRED', refId: pair.id, createdAt: now },
    ],
    skipDuplicates: true,
  });
  return { pairId: pair.id, created: true };
}

/** A P2002 on the pair (defensive: the insert skips duplicates) means it already exists: success. Anything else is rethrown. */
export async function existingPairAfter(err: unknown, a: string, b: string): Promise<PairResult> {
  if (!isUniqueViolation(err)) throw err;
  const existing = await findPair(a, b);
  if (!existing) throw err;
  return { pairId: existing.id, created: false };
}

export async function createPair(a: string, b: string, now: Date, deps: PairDeps = {}): Promise<PairResult> {
  let result: PairResult;
  try {
    result = await prisma.$transaction((tx) => createPairTx(tx, a, b, now));
  } catch (err) {
    return existingPairAfter(err, a, b);
  }
  if (result.created) await enqueuePaired(a, b, deps);
  return result;
}

/** After commit, for a new pair only: one buddy_paired job per side. Enqueued, never sent here: the job decides mute and quiet hours. */
export async function enqueuePaired(a: string, b: string, deps: PairDeps = {}): Promise<void> {
  const people = await prisma.user.findMany({ where: { id: { in: [a, b] } }, select: { id: true, displayName: true, handle: true } });
  for (const recipient of people) {
    const other = people.find((p) => p.id !== recipient.id);
    if (!other) continue;
    await enqueueBuddyNotice(
      { kind: 'buddy_paired', recipientId: recipient.id, actorId: other.id, refId: other.id, slots: { name: pushName(other) } },
      deps.notifyQueue ? { queue: deps.notifyQueue } : {},
    );
  }
}
