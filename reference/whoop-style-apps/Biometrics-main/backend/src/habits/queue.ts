import type { JobsOptions, Queue } from 'bullmq';
import { syncQueue } from '../sync/queue';

// Wired exactly like the nightly score sweep (scoring/queue.ts): the jobs ride
// the existing 'health-sync' queue and worker, and the queue is a parameter so
// tests can hand in a fake instead of needing a live worker.

export const HABIT_CORRELATION_SWEEP_JOB = 'habitCorrelationSweep';
export const RUN_HABIT_CORRELATIONS_JOB = 'runHabitCorrelations';

/** Mondays 05:00 server time. Weekly on purpose: a week is the smallest amount of new data worth re-testing (nightly would be noise chasing noise). */
export const HABIT_CORRELATION_CRON = '0 5 * * 1';

export interface RunHabitCorrelationsJobData {
  userId: string;
  /** ISO week key, so a retry or a doubled schedule of the same week is recognisable. */
  runKey: string;
}

export type HabitJobQueue = Pick<Queue, 'add'>;
export type HabitSchedulerQueue = Pick<Queue, 'upsertJobScheduler'>;

/** Deterministic per user+week: BullMQ ignores an add() whose id already exists. (No ':' in a BullMQ custom id.) */
export function habitCorrelationJobId(userId: string, runKey: string): string {
  return `habit-corr-${userId}-${runKey}`;
}

export function enqueueHabitCorrelations(
  userId: string,
  runKey: string,
  { queue = syncQueue }: { queue?: HabitJobQueue } = {},
) {
  const data: RunHabitCorrelationsJobData = { userId, runKey };
  const opts: JobsOptions = {
    jobId: habitCorrelationJobId(userId, runKey),
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  };
  return queue.add(RUN_HABIT_CORRELATIONS_JOB, data, opts);
}

/** Registers the weekly sweep as a repeatable scheduler (idempotent, one execution across all instances). */
export function scheduleWeeklyHabitCorrelationSweep(queue: HabitSchedulerQueue = syncQueue) {
  return queue.upsertJobScheduler(
    HABIT_CORRELATION_SWEEP_JOB,
    { pattern: HABIT_CORRELATION_CRON },
    { name: HABIT_CORRELATION_SWEEP_JOB },
  );
}
