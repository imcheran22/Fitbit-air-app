// Buddy codes (spec 2026-10-06 buddies §4): 8 characters without look-alikes, 24 h, one active per
// owner, single use. Every failure of a redeem is the same code_invalid (unknown, expired, used,
// own, blocked either way), reached through the same database work so timing can't tell them apart.
// Codes older than 7 days are swept when a new one is made.

import { randomInt } from 'crypto';
import { prisma } from '../db/client';
import { RATE_LIMITS } from '../lib/rateLimit';
import { BuddyError, isUniqueViolation, limitOrThrow } from './errors';
import { createPairTx, enqueuePaired, existingPairAfter, pairingBlockedTx, requirePairingReady, type PairDeps, type PairResult } from './pairs';

export interface RedeemDeps extends PairDeps {
  /** Test seam: the pairing writes run inside the redeem transaction. */
  createPairTx?: typeof createPairTx;
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const CODE_SWEEP_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

/** Upper-cased, spaces and dashes removed; null unless it is then a well-formed code. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}

/**
 * In one transaction holding the owner's row lock (so concurrent creates leave one active code): the
 * owner's active codes expire now and the new one is inserted. Retried on a code collision. The lock
 * is FOR NO KEY UPDATE: it still serialises creates, but doesn't conflict with the key-share lock a
 * concurrent redeem's BuddyPair foreign-key check takes on this row, so the two can't wait on each other.
 */
export async function createCode(ownerId: string, now: Date, opts: { generate?: () => string } = {}): Promise<{ code: string; expiresAt: Date }> {
  await requirePairingReady(ownerId);
  await prisma.buddyCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - CODE_SWEEP_MS) } } });
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = (opts.generate ?? generateCode)();
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${ownerId} FOR NO KEY UPDATE`;
        await tx.buddyCode.updateMany({ where: { ownerId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
        await tx.buddyCode.create({ data: { code, ownerId, createdAt: now, expiresAt } });
      });
      return { code, expiresAt };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error('buddy_code_collisions');
}

export async function getActiveCode(ownerId: string, now: Date): Promise<{ code: string; expiresAt: Date } | null> {
  return prisma.buddyCode.findFirst({
    where: { ownerId, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { code: true, expiresAt: true },
  });
}

interface CodeLookup {
  ownerId: string;
  usedAt: Date | null;
  expiresAt: Date;
  blocked: boolean;
}

/**
 * The code row and a block either way, in one statement whatever the outcome: unknown, used, expired,
 * own and blocked codes all cost exactly this query, so the response time doesn't reveal a block.
 */
async function lookupCode(code: string, userId: string): Promise<CodeLookup | null> {
  const rows = await prisma.$queryRaw<CodeLookup[]>`
    SELECT c."ownerId", c."usedAt", c."expiresAt",
      EXISTS (
        SELECT 1 FROM "BuddyBlock" b
        WHERE (b."blockerId" = c."ownerId" AND b."blockedId" = ${userId})
           OR (b."blockerId" = ${userId} AND b."blockedId" = c."ownerId")
      ) AS "blocked"
    FROM "BuddyCode" c
    WHERE c."code" = ${code}`;
  return rows[0] ?? null;
}

/**
 * One transaction: the conditional update on usedAt IS NULL (one winner on a concurrent redeem; the
 * other gets code_invalid), a block re-check, and the pairing writes. Any failure rolls the code back
 * to unused. buddy_paired is enqueued only after commit and only for a new pair.
 */
export async function redeemCode(userId: string, raw: unknown, now: Date, deps: RedeemDeps = {}): Promise<{ buddyId: string }> {
  await requirePairingReady(userId);
  await limitOrThrow(RATE_LIMITS.codeRedeem, userId);
  const code = normaliseCode(raw);
  if (!code) throw new BuddyError('code_invalid');
  const row = await lookupCode(code, userId);
  if (!row || row.usedAt || row.expiresAt <= now || row.ownerId === userId || row.blocked) throw new BuddyError('code_invalid');
  const ownerId = row.ownerId;
  let result: PairResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const taken = await tx.buddyCode.updateMany({ where: { code, ownerId, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now, usedById: userId } });
      if (taken.count === 0) throw new BuddyError('code_invalid');
      // A block made since the lookup still wins.
      if (await pairingBlockedTx(tx, userId, ownerId)) throw new BuddyError('code_invalid');
      return (deps.createPairTx ?? createPairTx)(tx, userId, ownerId, now);
    });
  } catch (err) {
    if (err instanceof BuddyError) throw err;
    result = await existingPairAfter(err, userId, ownerId);
  }
  if (result.created) await enqueuePaired(userId, ownerId, deps);
  return { buddyId: ownerId };
}
