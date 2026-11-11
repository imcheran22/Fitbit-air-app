import { prisma } from '../db/client';
import { enqueueStepsHistoryBackfill } from './queue';

// How far back the activity heat map's steps history reaches. Deliberately
// separate from the connect-time BACKFILL_WINDOW_DAYS (30, all four metrics):
// widening that would change the inputs to baselines and scores.
export const STEPS_HISTORY_DAYS = 365;

/** The half-open [start, end) window of the steps history, ending at (excluding) `today`. */
export function stepsHistoryWindow(today: Date = new Date()): { startDate: string; endDate: string } {
  const end = today.toISOString().slice(0, 10);
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - STEPS_HISTORY_DAYS);
  return { startDate: start.toISOString().slice(0, 10), endDate: end };
}

/**
 * Enqueues the steps history backfill for every connected user it has not yet
 * succeeded for. Runs once at server start, so users who connected before the
 * heat map existed get their history without reconnecting. Returns how many
 * were enqueued.
 */
export async function enqueuePendingStepsHistoryBackfills(): Promise<number> {
  const pending = await prisma.healthConnection.findMany({
    where: { status: 'CONNECTED', stepsHistoryBackfilledAt: null },
    select: { userId: true },
  });
  for (const { userId } of pending) {
    await enqueueStepsHistoryBackfill(userId);
  }
  return pending.length;
}
