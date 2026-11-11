// Startup wiring (spec 2026-10-04 §2): retire the weekly digest scheduler, enqueue the one-off
// launch backfill (the last 4 weeks and 3 months per user, AI text as normal, no push), and only
// then register the hourly sweep, so the sweep finds those periods already queued or built. A
// failed backfill is logged and never stops the sweep from registering.
// Backfill jobs use the sweep's job ids and carry noPush.

import type { Queue } from 'bullmq';
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { retireWeeklyCoachDigest } from '../coach/queue';
import { connection, syncQueue } from '../sync/queue';
import { backfillPeriods } from './periods';
import { enqueueRecapJob, RecapQueue, scheduleRecapSweep } from './queue';
import { usersWithSleepData } from './sweep';

export const RECAP_BACKFILL_MARKER = 'recap:backfill:v1';

export interface MarkerStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export type RecapStartQueue = Pick<Queue, 'add' | 'upsertJobScheduler' | 'removeJobScheduler'>;

export async function enqueueRecapBackfillOnce({
  queue = syncQueue,
  store = connection,
  now = new Date(),
  userIds,
}: { queue?: RecapQueue; store?: MarkerStore; now?: Date; userIds?: string[] } = {}): Promise<number> {
  if (await store.get(RECAP_BACKFILL_MARKER)) return 0;
  let enqueued = 0;
  for await (const user of usersWithSleepData(userIds)) {
    for (const p of backfillPeriods(localCivilDateOrUtc(now, user.timezone))) {
      await enqueueRecapJob({ userId: user.id, kind: p.kind, periodStart: p.periodStart, noPush: true }, { queue });
      enqueued++;
    }
  }
  // Set last: a crash part-way re-runs the backfill on the next start, and the job ids dedupe repeats.
  await store.set(RECAP_BACKFILL_MARKER, now.toISOString());
  return enqueued;
}

export async function startRecaps(deps: { queue?: RecapStartQueue; store?: MarkerStore; now?: Date; userIds?: string[] } = {}): Promise<void> {
  const queue = deps.queue ?? syncQueue;
  await retireWeeklyCoachDigest(queue);
  try {
    await enqueueRecapBackfillOnce({
      queue,
      ...(deps.store ? { store: deps.store } : {}),
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.userIds ? { userIds: deps.userIds } : {}),
    });
  } catch (err) {
    // The digest scheduler is already gone, so the sweep must register regardless. The marker
    // stays unset, so the next start retries the backfill. Error class only.
    console.error(JSON.stringify({ event: 'recap.backfill_failed', error: err instanceof Error ? err.name : 'unknown' }));
  }
  await scheduleRecapSweep(queue);
}
