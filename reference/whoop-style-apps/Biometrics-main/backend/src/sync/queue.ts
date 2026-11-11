import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { BiometricMetricType } from '../types';

export interface FetchJobData {
  userId: string;
  metricType: BiometricMetricType;
  date: string; // YYYY-MM-DD
}

export interface BackfillJobData {
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const syncQueue = new Queue('health-sync', { connection });

export const TOKEN_REFRESH_SWEEP_JOB = 'tokenRefreshSweep';
export const TOKEN_REFRESH_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export function enqueueFetchJob(data: FetchJobData) {
  return syncQueue.add('fetch', data);
}

export function enqueueBackfillJob(data: BackfillJobData) {
  return syncQueue.add('backfill', data);
}

export const STEPS_HISTORY_BACKFILL_JOB = 'backfillStepsHistory';

export interface StepsHistoryBackfillJobData {
  userId: string;
}

/**
 * One job per user at a time: the job id dedupes a connect that races the
 * startup sweep. Removed on completion AND failure so the id is free again for
 * the next reconnect or server start (the job is idempotent either way).
 */
export function enqueueStepsHistoryBackfill(userId: string) {
  return syncQueue.add(STEPS_HISTORY_BACKFILL_JOB, { userId } satisfies StepsHistoryBackfillJobData, {
    // BullMQ rejects a custom job id containing ':'.
    jobId: `${STEPS_HISTORY_BACKFILL_JOB}-${userId}`,
    removeOnComplete: true,
    removeOnFail: true,
  });
}

export const SLEEP_HISTORY_BACKFILL_JOB = 'backfillSleepHistory';

export interface SleepHistoryBackfillJobData {
  userId: string;
}

/**
 * Retries for the two sleep history jobs. Each is the only thing that sets its
 * marker, and without retries a 429 or a timeout dropped the job (removeOnFail)
 * until the next server start re-enqueued it -- leaving the app on "Reading
 * older nights..." meanwhile. The backoff is long because the usual cause is
 * Google's rate limit, and the job is idempotent, so a repeat is harmless.
 */
const SLEEP_HISTORY_RETRY = { attempts: 4, backoff: { type: 'exponential', delay: 60_000 } } as const;

/** The sleep counterpart of enqueueStepsHistoryBackfill, deduped the same way, and retried. */
export function enqueueSleepHistoryBackfill(userId: string) {
  return syncQueue.add(SLEEP_HISTORY_BACKFILL_JOB, { userId } satisfies SleepHistoryBackfillJobData, {
    jobId: `${SLEEP_HISTORY_BACKFILL_JOB}-${userId}`,
    removeOnComplete: true,
    removeOnFail: true,
    ...SLEEP_HISTORY_RETRY,
  });
}

export const SLEEP_STAGES_BACKFILL_JOB = 'backfillSleepStages';

export interface SleepStagesBackfillJobData {
  userId: string;
}

/** The one-off stage re-fetch for sleep history stored before stages, deduped and retried the same way. */
export function enqueueSleepStagesBackfill(userId: string) {
  return syncQueue.add(SLEEP_STAGES_BACKFILL_JOB, { userId } satisfies SleepStagesBackfillJobData, {
    jobId: `${SLEEP_STAGES_BACKFILL_JOB}-${userId}`,
    removeOnComplete: true,
    removeOnFail: true,
    ...SLEEP_HISTORY_RETRY,
  });
}

/**
 * Schedules the token refresh sweep as a repeatable queue job rather than a
 * per-process setInterval. Without this, every backend instance would sweep
 * independently, sending redundant refresh calls to Google for the same
 * connections and fanning out avoidable rate-limited requests. BullMQ hands
 * each scheduled execution to exactly one worker across all processes.
 * Registration is idempotent: re-registering the same job id just updates
 * the existing schedule.
 */
export function scheduleTokenRefreshSweep() {
  return syncQueue.upsertJobScheduler(
    TOKEN_REFRESH_SWEEP_JOB,
    { every: TOKEN_REFRESH_SWEEP_INTERVAL_MS },
    { name: TOKEN_REFRESH_SWEEP_JOB },
  );
}

/**
 * The repeatable schedule's first run is one full interval away, so kick off a
 * single sweep at startup too. Also deduplicated by job id, so N instances
 * booting together still produce one sweep.
 */
export function enqueueImmediateTokenRefreshSweep() {
  return syncQueue.add(
    TOKEN_REFRESH_SWEEP_JOB,
    {},
    // BullMQ rejects a custom job id containing ':'.
    { jobId: `${TOKEN_REFRESH_SWEEP_JOB}-startup`, removeOnComplete: true },
  );
}
