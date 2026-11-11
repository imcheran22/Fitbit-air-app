import { localCivilDate } from '../biometrics/civilDate';
import { syncQueue } from './queue';

// Catch-up sync: whatever Google Health has that we don't, since the last
// successful sync. Requested by the app on returning to the foreground and by
// a 3-hourly backstop sweep, so data stays fresh even when webhooks don't arrive.

export const CATCH_UP_MAX_DAYS = 14;

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Half-open [startDate, endDate) in YYYY-MM-DD. Starts the day before the
 * last sync's civil date (late-arriving data from that day is picked up),
 * never earlier than 14 days back, and ends after today.
 */
export function catchUpWindow(lastSyncedAt: Date | null, today: string, timeZone: string): { startDate: string; endDate: string } {
  const endDate = shiftDay(today, 1);
  const floor = shiftDay(today, -(CATCH_UP_MAX_DAYS - 1));
  if (!lastSyncedAt) return { startDate: floor, endDate };
  const from = shiftDay(localCivilDate(lastSyncedAt, timeZone), -1);
  return { startDate: from < floor ? floor : from, endDate };
}

export const CATCH_UP_JOB = 'catchUp';
export const CATCH_UP_SWEEP_JOB = 'catchUpSweep';
export const CATCH_UP_SWEEP_INTERVAL_MS = 3 * 60 * 60 * 1000;

export interface CatchUpJobData {
  userId: string;
}

// BullMQ rejects a custom job id containing ':'.
export const catchUpJobId = (userId: string) => `${CATCH_UP_JOB}-${userId}`;

const RUNNING = new Set(['waiting', 'delayed', 'active', 'prioritized', 'waiting-children']);

/**
 * One catch-up per user at a time: a request while one is queued or running is
 * a no-op. A finished (or failed) job is cleared first so a new one can start;
 * failed jobs are kept until then so GET /me/sync can report the failure.
 */
export async function enqueueCatchUp(userId: string): Promise<void> {
  const existing = await syncQueue.getJob(catchUpJobId(userId));
  if (existing) {
    if (RUNNING.has(await existing.getState())) return;
    await existing.remove();
  }
  await syncQueue.add(CATCH_UP_JOB, { userId } satisfies CatchUpJobData, {
    jobId: catchUpJobId(userId),
    removeOnComplete: true,
    removeOnFail: false,
  });
}

/**
 * A failed catch-up only counts while nothing newer has synced: a webhook fetch
 * or a reconnect backfill can bring the data up to date after it failed.
 */
export async function catchUpState(userId: string, lastSyncedAt: Date | null = null): Promise<'idle' | 'syncing' | 'failed'> {
  const job = await syncQueue.getJob(catchUpJobId(userId));
  if (!job) return 'idle';
  const state = await job.getState();
  if (RUNNING.has(state)) return 'syncing';
  if (state === 'failed') {
    const supersededBySync = lastSyncedAt !== null && job.finishedOn !== undefined && job.finishedOn < lastSyncedAt.getTime();
    return supersededBySync ? 'idle' : 'failed';
  }
  return 'idle';
}

/** The 3-hourly backstop, as a repeatable job so one instance runs each tick. */
export function scheduleCatchUpSweep() {
  return syncQueue.upsertJobScheduler(CATCH_UP_SWEEP_JOB, { every: CATCH_UP_SWEEP_INTERVAL_MS }, { name: CATCH_UP_SWEEP_JOB });
}
