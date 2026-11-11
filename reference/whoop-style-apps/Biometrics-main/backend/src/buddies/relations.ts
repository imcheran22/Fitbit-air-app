// Unpair, block, unblock and mute (spec 2026-10-06 buddies §4). All silent: the other person is told
// nothing and nothing they can see changes shape (a blocked person's request stays "pending" to them).
// S3 (spec 2026-10-07 social §9): unpair and block also delete the pair's conversation for both people (its messages,
// reactions and reads cascade); reports keep their own excerpt and stay.

import { prisma } from '../db/client';
import { BuddyError, UUID_RE } from './errors';
import { findPair, lockPairSlot, orderedPair } from './pairs';
import { recipientSees } from './requests';

/** A buddy id from a path: malformed, or one's own, is not_buddies (never a bare 404). */
export function requireBuddyId(raw: string, viewerId: string): string {
  if (!UUID_RE.test(raw) || raw === viewerId) throw new BuddyError('not_buddies');
  return raw;
}

const eitherWay = (a: string, b: string) => ({ OR: [{ fromUserId: a, toUserId: b }, { fromUserId: b, toUserId: a }] });

const mutesEitherWay = (a: string, b: string) => ({ OR: [{ muterId: a, mutedId: b }, { muterId: b, mutedId: a }] });

/**
 * Either side, silent and idempotent. Only when a pair was actually removed: stickers between the
 * two, their conversation, both users' Activity about each other and mutes both ways go, and requests
 * between them close (PENDING → CANCELLED, DECLINED withdrawn). Without a pair nothing is written, so "unpairing" a
 * non-buddy can never make their request to you vanish early.
 */
export async function unpair(userId: string, buddyId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The pair is deleted BEFORE the Activity rows, and must stay first: the badge job reads the pair
    // FOR SHARE before writing BUDDY_BADGE rows (badges.ts writeBadgeRows), so either it waits for
    // this commit and skips the pair, or this delete waits for the job and the Activity delete below
    // then sees its rows.
    const removed = await tx.buddyPair.deleteMany({ where: orderedPair(userId, buddyId) });
    if (removed.count === 0) return;
    // Mutes go with the pair, both ways: a re-pair starts unmuted.
    await tx.buddyMute.deleteMany({ where: mutesEitherWay(userId, buddyId) });
    // The conversation goes with the pair, for both people (a send in flight committed first: it is in here too).
    // After the pair, never before: a send locks the pair row and then the conversation, so the same order here
    // makes one wait for the other instead of deadlocking.
    await tx.conversation.deleteMany({ where: orderedPair(userId, buddyId) });
    await tx.sticker.deleteMany({ where: eitherWay(userId, buddyId) });
    await tx.buddyActivity.deleteMany({ where: { OR: [{ recipientId: userId, actorId: buddyId }, { recipientId: buddyId, actorId: userId }] } });
    await tx.buddyRequest.updateMany({ where: { status: 'PENDING', ...eitherWay(userId, buddyId) }, data: { status: 'CANCELLED', respondedAt: now } });
    await tx.buddyRequest.updateMany({ where: { status: 'DECLINED', withdrawnAt: null, ...eitherWay(userId, buddyId) }, data: { withdrawnAt: now } });
  });
}

/**
 * One transaction, under the pair lock (a pairing in flight finishes first and its pair is removed
 * here; one that starts later sees the block). The block is stored first, right after the pair lock:
 * its foreign keys hold both User rows FOR KEY SHARE before any row lock is taken, so an account
 * deletion (User row first, then its cascades) waits for the whole block instead of deadlocking with
 * it; an account already gone (P2003) leaves nothing to block, so that ends quietly. If a pair is
 * removed, the unpair data goes too: stickers between the two and the blocked person's Activity about
 * the blocker. Always: the blocker's own Activity about them, mutes cleared both ways, the blocker's
 * outgoing request cancelled (PENDING → CANCELLED, DECLINED withdrawn) and the blocked person's
 * incoming PENDING hidden (it stays "pending" to them). Nothing the blocked person sees changes unless
 * they were buddies. The conversation between them goes either way, pair or not. Idempotent.
 */
export async function block(blockerId: string, blockedId: string, now: Date): Promise<void> {
  try {
    await blockTx(blockerId, blockedId, now);
  } catch (err) {
    // Only the BuddyBlock insert can hit a missing foreign key: the rest deletes or updates.
    if ((err as { code?: unknown } | null)?.code === 'P2003') return;
    throw err;
  }
}

async function blockTx(blockerId: string, blockedId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockPairSlot(tx, blockerId, blockedId);
    await tx.buddyBlock.createMany({ data: [{ blockerId, blockedId, createdAt: now }], skipDuplicates: true });
    // As in unpair: the pair goes BEFORE any Activity row, so a badge job in flight can't leave a row behind.
    const removed = await tx.buddyPair.deleteMany({ where: orderedPair(blockerId, blockedId) });
    if (removed.count > 0) {
      await tx.sticker.deleteMany({ where: eitherWay(blockerId, blockedId) });
      await tx.buddyActivity.deleteMany({ where: { recipientId: blockedId, actorId: blockerId } });
    }
    // Chats: the conversation goes, pair or not — nothing is left to read back. After the pair (send's lock order).
    await tx.conversation.deleteMany({ where: orderedPair(blockerId, blockedId) });
    await tx.buddyActivity.deleteMany({ where: { recipientId: blockerId, actorId: blockedId } });
    await tx.buddyMute.deleteMany({ where: mutesEitherWay(blockerId, blockedId) });
    await tx.buddyRequest.updateMany({ where: { fromUserId: blockerId, toUserId: blockedId, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: now } });
    await tx.buddyRequest.updateMany({ where: { fromUserId: blockerId, toUserId: blockedId, status: 'DECLINED', withdrawnAt: null }, data: { withdrawnAt: now } });
    await tx.buddyRequest.updateMany({ where: { fromUserId: blockedId, toUserId: blockerId, status: 'PENDING' }, data: { hidden: true } });
  });
}

/** Block from an incoming request row: only the recipient of a request they can see. */
export async function blockFromRequest(userId: string, requestId: string, now: Date): Promise<void> {
  const row = UUID_RE.test(requestId) ? await prisma.buddyRequest.findUnique({ where: { id: requestId } }) : null;
  if (!row || row.toUserId !== userId || !recipientSees(row, now)) throw new BuddyError('request_gone');
  await block(userId, row.fromUserId, now);
}

/** Block from a buddy's week: only a buddy. */
export async function blockBuddy(userId: string, buddyId: string, now: Date): Promise<void> {
  if (!(await findPair(userId, buddyId))) throw new BuddyError('not_buddies');
  await block(userId, buddyId, now);
}

/** Lifts the block only: rows already hidden stay hidden. */
export async function unblock(blockerId: string, blockedId: string): Promise<void> {
  await prisma.buddyBlock.deleteMany({ where: { blockerId, blockedId } });
}

export interface BlockedPersonDTO { userId: string; handle: string; displayName: string }

export async function listBlocked(userId: string): Promise<BlockedPersonDTO[]> {
  const rows = await prisma.buddyBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    select: { blocked: { select: { id: true, handle: true, displayName: true } } },
  });
  return rows.map(({ blocked }) => ({ userId: blocked.id, handle: blocked.handle ?? '', displayName: blocked.displayName ?? blocked.handle ?? '' }));
}

/** Muting needs a pair (not_buddies); unmuting never fails (any id; a no-op without a mute). The muted person can't tell. */
export async function setMuted(muterId: string, mutedId: string, muted: boolean): Promise<{ muted: boolean }> {
  if (!muted) {
    await prisma.buddyMute.deleteMany({ where: { muterId, mutedId } });
    return { muted: false };
  }
  if (!(await findPair(muterId, mutedId))) throw new BuddyError('not_buddies');
  await prisma.buddyMute.createMany({ data: [{ muterId, mutedId }], skipDuplicates: true });
  return { muted: true };
}
