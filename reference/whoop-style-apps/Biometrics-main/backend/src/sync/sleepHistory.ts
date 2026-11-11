import { prisma } from '../db/client';
import { enqueueSleepHistoryBackfill, enqueueSleepStagesBackfill } from './queue';
import { stepsHistoryWindow } from './stepsHistory';

// The Sleep page of the activity heat map reaches as far back as the Steps
// page, so the two share a window. Like steps, this is separate from the
// 30-day connect backfill that feeds scoring.
export const sleepHistoryWindow = stepsHistoryWindow;

/**
 * Enqueues the sleep history backfill for every connected user it has not yet
 * succeeded for. Runs once at server start, so users who connected before the
 * Sleep page existed get their history without reconnecting. Returns how many
 * were enqueued.
 */
export async function enqueuePendingSleepHistoryBackfills(): Promise<number> {
  const pending = await prisma.healthConnection.findMany({
    where: { status: 'CONNECTED', sleepHistoryBackfilledAt: null },
    select: { userId: true },
  });
  for (const { userId } of pending) {
    await enqueueSleepHistoryBackfill(userId);
  }
  return pending.length;
}

/**
 * Enqueues the one-off stage backfill for every connected user whose sleep
 * history was stored before stages were captured. A history backfill pulls
 * stages itself and sets both markers, so a connection still waiting for its
 * history is left to that job. Runs once at server start. Returns how many
 * were enqueued.
 */
export async function enqueuePendingSleepStagesBackfills(): Promise<number> {
  const pending = await prisma.healthConnection.findMany({
    where: { status: 'CONNECTED', sleepHistoryBackfilledAt: { not: null }, sleepStagesBackfilledAt: null },
    select: { userId: true },
  });
  for (const { userId } of pending) {
    await enqueueSleepStagesBackfill(userId);
  }
  return pending.length;
}
