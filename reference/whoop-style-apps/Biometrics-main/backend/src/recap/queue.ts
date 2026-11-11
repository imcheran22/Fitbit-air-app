// Recap jobs on the existing 'health-sync' queue (spec 2026-10-04 §2): an hourly sweep, and one
// build job per (user, kind, periodStart) whose id dedupes the sweep against itself and against
// the launch backfill. The queue is a parameter so tests hand in a fake.

import type { JobsOptions, Queue } from 'bullmq';
import { syncQueue } from '../sync/queue';
import type { RecapJobData, RecapKind } from './types';

export const RECAP_SWEEP_JOB = 'recapSweep';
export const RECAP_BUILD_JOB = 'recapBuild';
/** Every hour on the hour: due-ness is "past 08:00 local", so the 08:00 tick catches each whole-hour zone. */
export const RECAP_SWEEP_CRON = '0 * * * *';

export type RecapQueue = Pick<Queue, 'add'>;

/** No ':' in a BullMQ custom id. */
export function recapJobId(userId: string, kind: RecapKind, periodStart: string): string {
  return `recap-${userId}-${kind}-${periodStart}`;
}

/** BullMQ ignores an add whose id is queued or running, so a doubled sweep or a backfill race is harmless. */
export function enqueueRecapJob(data: RecapJobData, { queue = syncQueue }: { queue?: RecapQueue } = {}) {
  const opts: JobsOptions = {
    jobId: recapJobId(data.userId, data.kind, data.periodStart),
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 2,
    backoff: { type: 'exponential', delay: 60_000 },
  };
  return queue.add(RECAP_BUILD_JOB, data, opts);
}

export function scheduleRecapSweep(queue: Pick<Queue, 'upsertJobScheduler'> = syncQueue) {
  return queue.upsertJobScheduler(RECAP_SWEEP_JOB, { pattern: RECAP_SWEEP_CRON }, { name: RECAP_SWEEP_JOB });
}
