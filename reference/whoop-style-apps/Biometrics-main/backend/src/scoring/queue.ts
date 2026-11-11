import type { JobsOptions, Queue } from 'bullmq';
import { syncQueue } from '../sync/queue';

// Score jobs ride the existing 'health-sync' queue and its worker (job names
// dispatched in sync/worker.ts) rather than a second queue + worker + Redis
// connection: one process to run, and the same retry/backoff machinery. The
// queue is a parameter everywhere below so tests can hand in a fake instead of
// needing a live worker.

export const COMPUTE_DAILY_SCORE_JOB = 'computeDailyScore';
export const SCORE_SWEEP_JOB = 'scoreSweep';

/** A burst of overnight sleep + HRV + RHR webhooks collapses into one recompute. */
export const SCORE_DEBOUNCE_MS = 5 * 60 * 1000;

/** 03:30 server time, nightly. A cron pattern (not `every`) so it stays at a fixed hour across restarts. */
export const SCORE_SWEEP_CRON = '30 3 * * *';

export interface ComputeDailyScoreJobData {
  userId: string;
  date: string; // YYYY-MM-DD
}

/** The slice of a BullMQ Queue the enqueue helpers need. */
export type ScoreQueue = Pick<Queue, 'add'>;
export type ScoreSchedulerQueue = Pick<Queue, 'upsertJobScheduler'>;

/**
 * Deterministic per user+date. BullMQ ignores an add() whose jobId already
 * exists, which is what makes the debounce work: the second..Nth webhook in a
 * burst finds the delayed job already queued and is a no-op. (BullMQ rejects
 * ':' in a custom job id, hence the dashes.)
 */
export function scoreJobId(userId: string, date: string): string {
  return `score-${userId}-${date}`;
}

/**
 * Queue one recompute of (userId, date), debounced. The job is removed when it
 * finishes or fails: a retained job would keep its id occupied and silently
 * swallow every later enqueue for that day. Data arriving while the job is
 * running is picked up by the nightly sweep, the backstop for this window.
 */
export function enqueueScoreCompute(
  userId: string,
  date: string,
  { queue = syncQueue, delayMs = SCORE_DEBOUNCE_MS }: { queue?: ScoreQueue; delayMs?: number } = {},
) {
  const data: ComputeDailyScoreJobData = { userId, date };
  const opts: JobsOptions = {
    jobId: scoreJobId(userId, date),
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  };
  return queue.add(COMPUTE_DAILY_SCORE_JOB, data, opts);
}

/** Registers the nightly sweep as a repeatable scheduler (idempotent, one execution across all instances). */
export function scheduleNightlyScoreSweep(queue: ScoreSchedulerQueue = syncQueue) {
  return queue.upsertJobScheduler(SCORE_SWEEP_JOB, { pattern: SCORE_SWEEP_CRON }, { name: SCORE_SWEEP_JOB });
}
