// Buddy requests (spec 2026-10-06 buddies §4). Every state the sender can't be told about looks
// exactly like an unanswered request that later expired: "pending" to the sender means PENDING or
// DECLINED, not withdrawn, sent less than 14 days ago. Hidden rows (swallowed after a decline, or
// to/from someone who blocked the sender) never reach the recipient and never push. A mutual ask
// pairs: sending to someone whose request to you they still see as pending (declined or hidden
// included) pairs the two, unless either has blocked the other.

import type { BuddyRequestStatus } from '@prisma/client';
import { prisma } from '../db/client';
import { RATE_LIMITS } from '../lib/rateLimit';
import { BuddyError, UUID_RE, isUniqueViolation, limitOrThrow } from './errors';
import { checkHandle } from './identity';
import { enqueueBuddyNotice } from './notifyQueue';
import { createPairTx, enqueuePaired, existingPairAfter, findPair, isBlockedEitherWay, pairingBlockedTx, requirePairingReady, type PairDeps, type PairResult } from './pairs';
import { PERSON_SELECT, toPerson, type PersonDTO } from './people';

export const REQUEST_TTL_DAYS = 14;
export const DECLINE_SWALLOW_DAYS = 30;
export const MAX_PENDING_OUTGOING = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const ttlCutoff = (now: Date) => new Date(now.getTime() - REQUEST_TTL_DAYS * DAY_MS);

export interface RequestRow {
  status: BuddyRequestStatus;
  hidden: boolean;
  createdAt: Date;
  withdrawnAt: Date | null;
}

export function senderSeesPending(row: RequestRow, now: Date): boolean {
  return (row.status === 'PENDING' || row.status === 'DECLINED') && row.withdrawnAt === null && row.createdAt > ttlCutoff(now);
}

export function recipientSees(row: RequestRow, now: Date): boolean {
  return row.status === 'PENDING' && !row.hidden && row.createdAt > ttlCutoff(now);
}

export const senderPendingWhere = (now: Date) => ({
  status: { in: ['PENDING', 'DECLINED'] as BuddyRequestStatus[] },
  withdrawnAt: null,
  createdAt: { gt: ttlCutoff(now) },
});

export const recipientVisibleWhere = (now: Date) => ({ status: 'PENDING' as const, hidden: false, createdAt: { gt: ttlCutoff(now) } });

/** Lazy sweep: PENDING rows 14 days old become EXPIRED (the partial unique index then frees the ordered pair). */
export async function expireStaleRequests(userId: string, now: Date): Promise<void> {
  await prisma.buddyRequest.updateMany({
    where: { status: 'PENDING', createdAt: { lte: ttlCutoff(now) }, OR: [{ fromUserId: userId }, { toUserId: userId }] },
    data: { status: 'EXPIRED' },
  });
}

/** Incoming requests the viewer may see: visible, and not from someone the viewer has blocked. */
const incomingWhere = (userId: string, now: Date) => ({
  toUserId: userId,
  ...recipientVisibleWhere(now),
  fromUser: { blocksReceived: { none: { blockerId: userId } } },
});

/** The original sender's request that they still see as pending (any of the states that read "Pending"). */
const crossedAsk = (fromId: string, toId: string, now: Date) =>
  prisma.buddyRequest.findFirst({ where: { fromUserId: fromId, toUserId: toId, ...senderPendingWhere(now) }, select: { id: true } });

interface TargetLookup {
  id: string;
  blockedByMe: boolean;
  blocksMe: boolean;
  declinedMe: boolean;
}

/**
 * The target by handle, both block directions and a recent decline of my request, in one statement
 * whatever the answer: a block or a decline costs no extra database work, so timing can't reveal it.
 */
async function lookupTarget(handle: string, fromId: string, now: Date): Promise<TargetLookup | null> {
  const swallowSince = new Date(now.getTime() - DECLINE_SWALLOW_DAYS * DAY_MS);
  const rows = await prisma.$queryRaw<TargetLookup[]>`
    SELECT u."id",
      EXISTS (SELECT 1 FROM "BuddyBlock" b WHERE b."blockerId" = ${fromId} AND b."blockedId" = u."id") AS "blockedByMe",
      EXISTS (SELECT 1 FROM "BuddyBlock" b WHERE b."blockerId" = u."id" AND b."blockedId" = ${fromId}) AS "blocksMe",
      EXISTS (
        SELECT 1 FROM "BuddyRequest" r
        WHERE r."fromUserId" = ${fromId} AND r."toUserId" = u."id" AND r."status" = 'DECLINED' AND r."respondedAt" > ${swallowSince}
      ) AS "declinedMe"
    FROM "User" u
    WHERE u."handle" = ${handle}`;
  return rows[0] ?? null;
}

/**
 * Crossed requests: pair in one transaction that re-checks a block either way first (a block made
 * meanwhile wins; the caller's request then stays as it is). buddy_paired is enqueued after commit.
 */
async function pairCrossed(a: string, b: string, now: Date, deps: PairDeps): Promise<boolean> {
  let result: PairResult | null;
  try {
    result = await prisma.$transaction(async (tx) => ((await pairingBlockedTx(tx, a, b)) ? null : createPairTx(tx, a, b, now)));
  } catch (err) {
    result = await existingPairAfter(err, a, b);
  }
  if (result?.created) await enqueuePaired(a, b, deps);
  return result !== null;
}

/**
 * POST to an exact handle. Only unknown/held/malformed handles answer not_found; a handle you
 * blocked answers blocked_by_you; everything else is the same success. Every call spends the daily
 * request bucket before the handle is looked at, so each answer costs the same and probing which
 * handles exist stops at the daily limit.
 */
export async function sendRequest(fromId: string, rawHandle: unknown, now: Date, deps: PairDeps = {}): Promise<void> {
  const me = await requirePairingReady(fromId);
  await limitOrThrow(RATE_LIMITS.buddyRequest, fromId);
  const check = checkHandle(rawHandle);
  if (!check.ok) throw new BuddyError('not_found');
  if (check.handle === me.handle) throw new BuddyError('own_handle');
  // A held handle has no owner, so it is not_found like an unknown one.
  const target = await lookupTarget(check.handle, fromId, now);
  if (!target) throw new BuddyError('not_found');
  if (target.blockedByMe) throw new BuddyError('blocked_by_you');
  if (await findPair(fromId, target.id)) return;
  await expireStaleRequests(fromId, now);
  const visible = await prisma.buddyRequest.findFirst({ where: { fromUserId: fromId, toUserId: target.id, ...senderPendingWhere(now) }, select: { id: true } });
  if (visible) return;

  // Crossed: the target already asked me and still sees it as pending (declined or hidden included).
  // Never across a block: the lookup's flag here, and a re-check inside the pairing transaction.
  if ((await crossedAsk(target.id, fromId, now)) && !target.blocksMe && (await pairCrossed(fromId, target.id, now, deps))) return;

  const pending = await prisma.buddyRequest.count({ where: { fromUserId: fromId, ...senderPendingWhere(now) } });
  if (pending >= MAX_PENDING_OUTGOING) throw new BuddyError('too_many_pending');

  const hidden = target.blocksMe || target.declinedMe;
  let row: { id: string };
  try {
    row = await prisma.buddyRequest.create({ data: { fromUserId: fromId, toUserId: target.id, hidden, createdAt: now, toHandleAtSend: check.handle }, select: { id: true } });
  } catch (err) {
    // The partial unique index: a concurrent identical send already stored the PENDING row.
    if (isUniqueViolation(err)) return;
    throw err;
  }
  // From here the path is the same for a hidden row and a visible one: the route's work and timing
  // never tell a swallowed or blocked request apart from a real one.

  // Re-checked after our row is committed: of two simultaneous crossed sends, the later check
  // always sees the other's row, so exactly one pair comes out. The query runs either way; across a
  // block it never pairs.
  if ((await crossedAsk(target.id, fromId, now)) && !target.blocksMe && (await pairCrossed(fromId, target.id, now, deps))) return;
  // One job per send, hidden or not. The job drops a hidden request, and writes the REQUEST
  // Activity row and sends the push for a visible one. Never awaited past its bound.
  await enqueueBuddyNotice({ kind: 'buddy_request', recipientId: target.id, actorId: fromId, refId: row.id, slots: {} }, deps.notifyQueue ? { queue: deps.notifyQueue } : {});
}

export interface IncomingRequestDTO { id: string; createdAt: string; from: PersonDTO }
export interface OutgoingRequestDTO { id: string; createdAt: string; toHandle: string }

/**
 * Writes a missing REQUEST Activity row for each incoming request the viewer may see (the same filter
 * as the incoming list: visible, and not from someone they blocked), so a lost enqueue never loses the
 * Activity item. Creates only; an existing row is left as it is.
 */
export async function backfillRequestActivity(userId: string, now: Date): Promise<void> {
  const incoming = await prisma.buddyRequest.findMany({ where: incomingWhere(userId, now), select: { id: true, fromUserId: true, createdAt: true } });
  if (incoming.length === 0) return;
  await prisma.buddyActivity.createMany({
    data: incoming.map((r) => ({ recipientId: userId, actorId: r.fromUserId, kind: 'REQUEST' as const, refId: r.id, createdAt: r.createdAt })),
    skipDuplicates: true,
  });
}

/**
 * Incoming: what the recipient may see. Outgoing: every row the sender sees as pending, with nothing
 * that tells their states apart. Reading the list also backfills the incoming REQUEST Activity rows.
 */
export async function listRequests(userId: string, now: Date): Promise<{ incoming: IncomingRequestDTO[]; outgoing: OutgoingRequestDTO[] }> {
  await expireStaleRequests(userId, now);
  const [incoming, outgoing] = await Promise.all([
    prisma.buddyRequest.findMany({
      where: incomingWhere(userId, now),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, fromUser: { select: PERSON_SELECT } },
    }),
    prisma.buddyRequest.findMany({
      where: { fromUserId: userId, ...senderPendingWhere(now) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, toHandleAtSend: true },
    }),
  ]);
  await backfillRequestActivity(userId, now);
  return {
    incoming: incoming.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), from: toPerson(r.fromUser) })),
    outgoing: outgoing.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), toHandle: r.toHandleAtSend ?? '' })),
  };
}

export async function countRequests(userId: string, now: Date): Promise<{ incoming: number; outgoing: number }> {
  const [incoming, outgoing] = await Promise.all([
    prisma.buddyRequest.count({ where: incomingWhere(userId, now) }),
    prisma.buddyRequest.count({ where: { fromUserId: userId, ...senderPendingWhere(now) } }),
  ]);
  return { incoming, outgoing };
}

async function requestFor(requestId: string) {
  if (!UUID_RE.test(requestId)) return null;
  return prisma.buddyRequest.findUnique({ where: { id: requestId } });
}

/**
 * Recipient only, on a request they can see. One transaction re-checks a block either way, marks the
 * request ACCEPTED (only while still visible and pending) and writes the pair; buddy_paired is enqueued
 * after commit, only for a new pair. A repeat, or a concurrent accept that lost the race, is a success.
 */
export async function acceptRequest(userId: string, requestId: string, now: Date, deps: PairDeps = {}): Promise<{ buddyId: string }> {
  await requirePairingReady(userId);
  const row = await requestFor(requestId);
  if (!row || row.toUserId !== userId) throw new BuddyError('request_gone');
  const buddyId = row.fromUserId;
  if (row.status === 'ACCEPTED') return { buddyId };
  if (!recipientSees(row, now)) throw new BuddyError('request_gone');
  let result: PairResult | null;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (await pairingBlockedTx(tx, userId, buddyId)) return null;
      const won = await tx.buddyRequest.updateMany({ where: { id: row.id, ...recipientVisibleWhere(now) }, data: { status: 'ACCEPTED', respondedAt: now } });
      if (won.count === 0) return null;
      return createPairTx(tx, userId, buddyId, now);
    });
  } catch (err) {
    result = await existingPairAfter(err, userId, buddyId);
  }
  if (result === null) {
    // Lost to a concurrent accept (success), or blocked / declined / cancelled meanwhile (gone).
    const again = await prisma.buddyRequest.findUnique({ where: { id: row.id }, select: { status: true } });
    if (again?.status === 'ACCEPTED') return { buddyId };
    throw new BuddyError('request_gone');
  }
  if (result.created) await enqueuePaired(userId, buddyId, deps);
  return { buddyId };
}

/** Recipient only. Silent: the sender keeps seeing "Pending" until 14 days after sending. A repeat is a success. */
export async function declineRequest(userId: string, requestId: string, now: Date): Promise<void> {
  const row = await requestFor(requestId);
  if (!row || row.toUserId !== userId) throw new BuddyError('request_gone');
  if (row.status === 'DECLINED') return;
  if (!recipientSees(row, now) || (await isBlockedEitherWay(userId, row.fromUserId))) throw new BuddyError('request_gone');
  const done = await prisma.buddyRequest.updateMany({ where: { id: row.id, ...recipientVisibleWhere(now) }, data: { status: 'DECLINED', respondedAt: now } });
  if (done.count === 0) {
    const again = await prisma.buddyRequest.findUnique({ where: { id: row.id }, select: { status: true } });
    if (again?.status !== 'DECLINED') throw new BuddyError('request_gone');
  }
}

/**
 * Sender only, whatever the row's state, so a hidden or declined request cancels exactly like a
 * pending one: PENDING → CANCELLED; a DECLINED row is withdrawn (it stays DECLINED for the 30-day
 * swallow). Both writes always run: the same work for every state, and a decline racing in between
 * is still withdrawn. Anything else, or a repeat, is a quiet success.
 */
export async function cancelRequest(userId: string, requestId: string, now: Date): Promise<void> {
  const row = await requestFor(requestId);
  if (!row || row.fromUserId !== userId) throw new BuddyError('request_gone');
  await prisma.buddyRequest.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: now } });
  await prisma.buddyRequest.updateMany({ where: { id: row.id, status: 'DECLINED', withdrawnAt: null }, data: { withdrawnAt: now } });
}
