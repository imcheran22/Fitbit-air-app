// buddy_badge (spec 2026-10-06 buddies §6). evaluateAchievements hands over the rows it truly
// inserted; of those only the highest new level per family is announced, and only while the earner
// shares streaks & badges. Each announcement is a BullMQ job that fans out to the earner's current
// buddies (no block either way): one BUDDY_BADGE Activity row each (the (recipient, kind, refId) key
// dedupes retries) and, after commit, a push where the row was new. Nothing is sent from the GET
// request path. A failed enqueue loses that announcement (logged), never the badge.

import type { AchievementFamily } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { PushSender } from '../coach/push';
import { prisma } from '../db/client';
import { withTimeout } from '../lib/withTimeout';
import { syncQueue } from '../sync/queue';
import { pushName, sendBuddyNotice } from './notify';
import { BUDDY_SHARING_CONSENT_VERSION, SHARING_SELECT, effectiveSharing } from './sharing';

export const BUDDY_BADGE_JOB = 'buddyBadge';
/** All of one call's enqueues together give up after this long: GET /me/achievements must never wait on Redis. */
export const BADGE_ENQUEUE_TIMEOUT_MS = 300;

export interface BuddyBadgeJobData { earnerId: string; achievementId: string }
export interface AwardedRow { id: string; family: AchievementFamily; level: number }

export function highestNewPerFamily<T extends { family: AchievementFamily; level: number }>(rows: readonly T[]): T[] {
  const top = new Map<AchievementFamily, T>();
  for (const row of rows) {
    const seen = top.get(row.family);
    if (!seen || row.level > seen.level) top.set(row.family, row);
  }
  return [...top.values()];
}

async function sharesStreaks(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: SHARING_SELECT });
  return row !== null && effectiveSharing(row).streaks;
}

export async function announceBuddyBadges(
  earnerId: string,
  rows: readonly AwardedRow[],
  opts: { queue?: Pick<Queue, 'add'>; timeoutMs?: number } = {},
): Promise<void> {
  if (rows.length === 0) return;
  try {
    if (!(await sharesStreaks(earnerId))) return;
  } catch (err) {
    console.error(JSON.stringify({ event: 'buddies.badge_announce_failed', userId: earnerId, error: err instanceof Error ? err.name : 'unknown' }));
    return;
  }
  const queue = opts.queue ?? syncQueue;
  const logFailed = (achievementId: string, err: unknown) =>
    console.error(JSON.stringify({ event: 'buddies.badge_enqueue_failed', userId: earnerId, achievementId, error: err instanceof Error ? err.name : 'unknown' }));
  // Every family's enqueue starts at once and they share ONE bound, so the caller waits at most
  // about BADGE_ENQUEUE_TIMEOUT_MS in total. Each failure is logged once: as it fails, or as timed
  // out when the bound fires first.
  const top = highestNewPerFamily(rows);
  const settled = new Set<string>();
  let timedOut = false;
  const enqueues = top.map((row) =>
    queue
      .add(BUDDY_BADGE_JOB, { earnerId, achievementId: row.id } satisfies BuddyBadgeJobData, {
        // BullMQ rejects ':' in a custom id.
        jobId: `${BUDDY_BADGE_JOB}-${row.id}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      })
      .then(
        () => void settled.add(row.id),
        (err: unknown) => {
          settled.add(row.id);
          if (!timedOut) logFailed(row.id, err);
        },
      ),
  );
  try {
    await withTimeout(Promise.allSettled(enqueues), opts.timeoutMs ?? BADGE_ENQUEUE_TIMEOUT_MS, 'buddy badge enqueue timeout');
  } catch (err) {
    timedOut = true;
    for (const row of top) if (!settled.has(row.id)) logFailed(row.id, err);
  }
}

/**
 * The earner's current buddies with no block either way, and their BUDDY_BADGE rows, in one
 * transaction. The pair rows are read FOR SHARE: unpair and block both remove the pair with a DELETE
 * (unpair takes no pair-slot lock, so the advisory lock would not serialise with it; the row lock
 * does). A pair whose removal is in flight makes this wait, and once that commits the row is skipped;
 * a removal that starts after waits for this commit, and its Activity delete then sees these rows.
 * Either way no badge row outlives an unpair or block. The earner's sharing is read again first, with
 * their User row FOR SHARE: a switch-off that committed after the job's first read writes nothing
 * (and so pushes nothing), and one that starts now waits for this commit.
 *
 * The pair rows are locked one by one (ordered by id); an account deletion's cascade deletes them in
 * its own order, so the two can deadlock. Postgres then aborts one of them, and both are safe to
 * retry: this job is retried by BullMQ (attempts) and its writes dedupe, and account deletion can be
 * repeated. Returns the recipients whose row is new.
 */
async function writeBadgeRows(earnerId: string, achievementId: string, now: Date): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const [earner] = await tx.$queryRaw<Array<{ shares: boolean }>>`
      SELECT ("shareStreaks" AND "buddySharingConsentVersion" = ${BUDDY_SHARING_CONSENT_VERSION}) AS "shares"
      FROM "User" WHERE "id" = ${earnerId}
      FOR SHARE`;
    if (!earner?.shares) return [];
    const pairs = await tx.$queryRaw<Array<{ userAId: string; userBId: string }>>`
      SELECT p."userAId", p."userBId" FROM "BuddyPair" p
      WHERE (p."userAId" = ${earnerId} OR p."userBId" = ${earnerId})
        AND NOT EXISTS (
          SELECT 1 FROM "BuddyBlock" b
          WHERE (b."blockerId" = p."userAId" AND b."blockedId" = p."userBId")
             OR (b."blockerId" = p."userBId" AND b."blockedId" = p."userAId")
        )
      ORDER BY p."id"
      FOR SHARE OF p`;
    if (pairs.length === 0) return [];
    const created = await tx.buddyActivity.createManyAndReturn({
      data: pairs.map((p) => ({ recipientId: p.userAId === earnerId ? p.userBId : p.userAId, actorId: earnerId, kind: 'BUDDY_BADGE' as const, refId: achievementId, createdAt: now })),
      skipDuplicates: true,
      select: { recipientId: true },
    });
    return created.map((r) => r.recipientId);
  });
}

/** Returns how many Activity rows were new (each gets its push after commit, subject to the notice gate). */
export async function runBuddyBadgeJob(data: BuddyBadgeJobData, deps: { pushSender: PushSender; now: Date }): Promise<number> {
  const earner = await prisma.user.findUnique({ where: { id: data.earnerId }, select: { ...SHARING_SELECT, displayName: true, handle: true } });
  if (!earner || !effectiveSharing(earner).streaks) return 0;
  const achievement = await prisma.achievement.findFirst({ where: { id: data.achievementId, userId: data.earnerId }, select: { id: true, family: true, level: true } });
  if (!achievement) return 0;
  const recipients = await writeBadgeRows(data.earnerId, achievement.id, deps.now);
  for (const recipientId of recipients) {
    await sendBuddyNotice(deps.pushSender, {
      kind: 'buddy_badge',
      recipientId,
      actorId: data.earnerId,
      refId: data.earnerId,
      slots: { name: pushName(earner), family: achievement.family, level: achievement.level },
    }, deps.now);
  }
  return recipients.length;
}
