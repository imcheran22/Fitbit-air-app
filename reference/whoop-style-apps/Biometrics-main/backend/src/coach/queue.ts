import type { Queue } from 'bullmq';
import { syncQueue } from '../sync/queue';

// Wired exactly like the nightly score sweep and the weekly habit sweep: the
// coach's scheduled jobs are repeatable schedulers on the existing
// 'health-sync' queue, dispatched in sync/worker.ts, and the queue is a
// parameter so tests hand in a fake instead of needing a live worker or Redis.

export const COACH_WEEKLY_DIGEST_JOB = 'coachWeeklyDigest';
export const COACH_RETENTION_JOB = 'coachRetentionSweep';

/** 04:15 server time, daily. */
export const COACH_RETENTION_CRON = '15 4 * * *';

export type CoachSchedulerQueue = Pick<Queue, 'upsertJobScheduler'>;

/** Idempotent; BullMQ hands each tick to exactly one worker across all instances. */
export function scheduleDailyCoachRetention(queue: CoachSchedulerQueue = syncQueue) {
  return queue.upsertJobScheduler(
    COACH_RETENTION_JOB,
    { pattern: COACH_RETENTION_CRON },
    { name: COACH_RETENTION_JOB },
  );
}

/**
 * The weekly digest is merged into the weekly recap (spec 2026-10-04 §2): the hourly recap sweep
 * replaces this scheduler, which startup removes. A tick already queued matches no worker branch.
 */
export function retireWeeklyCoachDigest(queue: Pick<Queue, 'removeJobScheduler'> = syncQueue) {
  return queue.removeJobScheduler(COACH_WEEKLY_DIGEST_JOB);
}
