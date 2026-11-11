// backend/src/coach/daySummaryJob.ts
// Writes the Coach page's day summary right after a sync scores today (spec
// 2026-09-30 section 4). Each summary is a full model generation (up to the
// engine's budget, longer when it waits behind an in-flight run), so it runs on
// its own 'coach-summary' queue and worker, at COACH_SUMMARY_CONCURRENCY at a
// time (default 1): a morning burst queues up instead of taking the sync
// worker's slots and running several local generations at once. Kept out of
// answer/today.ts because importing the queue opens a Redis connection, which
// the HTTP routes do not need.

import { Job, Queue, Worker } from 'bullmq';
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { connection } from '../sync/queue';
import { generateTodaySummary, summaryEngineDeps, SummaryOutcome, TodayDeps } from './answer/today';
import { systemClock } from './clock';
import { getCoachProvider, getHostedProvider, getSummaryConcurrency, isCoachEnabled } from './config';
import { hasCurrentConsent } from './consent';
import { LoggerCoachTelemetry } from './telemetry';

export const COACH_SUMMARY_QUEUE = 'coach-summary';
export const coachSummaryQueue = new Queue(COACH_SUMMARY_QUEUE, { connection });

export const COACH_DAY_SUMMARY_JOB = 'coachDaySummary';

export interface DaySummaryJobData {
  userId: string;
  date: string; // YYYY-MM-DD, the user's local day that was scored
}

export type DaySummaryQueue = Pick<Queue, 'add' | 'getJob'>;

export type DaySummaryJobOutcome = SummaryOutcome | 'skipped_other_day';

/** One queued summary per user and day: a burst of rescoring collapses into one model call. */
export function daySummaryJobId(userId: string, date: string): string {
  return `coach-summary-${userId}-${date}`;
}

/**
 * The job id to queue under. BullMQ ignores an add whose id is already in the
 * queue: harmless while that job waits (it reads the sheet when it starts, so
 * it sees these scores too), but a job already running read the sheet before
 * them. So when the day's job is active, one follow-up is queued under a second
 * id. Scores landing while that follow-up is itself running (and the first job
 * still is too) are dropped; the next sync or the next day picks them up.
 */
async function jobIdFor(queue: DaySummaryQueue, userId: string, date: string): Promise<string> {
  const id = daySummaryJobId(userId, date);
  const existing = await queue.getJob(id);
  return existing && (await existing.isActive()) ? `${id}-again` : id;
}

/**
 * Called by the sync worker after computeDailyScore scored a day. Queues a summary
 * only for the user's local TODAY (not a backfilled or swept past day), only
 * while the coach is on and the user has the coach consent. Never throws: the
 * score is already stored, and the page falls back to the template anyway.
 */
export async function refreshDaySummaryAfterScore(
  userId: string,
  date: string,
  { queue = coachSummaryQueue, now = () => new Date() }: { queue?: DaySummaryQueue; now?: () => Date } = {},
): Promise<boolean> {
  try {
    if (!isCoachEnabled()) return false;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    if (!user || localCivilDateOrUtc(now(), user.timezone) !== date) return false;
    if (!(await hasCurrentConsent(userId))) return false;
    const data: DaySummaryJobData = { userId, date };
    await queue.add(COACH_DAY_SUMMARY_JOB, data, {
      jobId: await jobIdFor(queue, userId, date),
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1,
    });
    return true;
  } catch (err) {
    console.error(JSON.stringify({ event: 'coach.day_summary_enqueue_failed', error: err instanceof Error ? err.name : 'unknown' }));
    return false;
  }
}

/**
 * The job body: new data, so any sentence already stored for today is replaced.
 * Written by the same engine the user's messages go to (the routes build theirs
 * with summaryEngineDeps too). Consent and the coach flag are checked again
 * inside, as they may have changed since the job was queued. A job that only
 * starts after the user's local midnight is skipped: that day is over, and
 * the new day's sheet may not have data yet.
 */
export async function runDaySummaryJob(data: DaySummaryJobData, deps: TodayDeps = {}): Promise<DaySummaryJobOutcome> {
  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { timezone: true } });
  if (user && localCivilDateOrUtc((deps.now ?? (() => new Date()))(), user.timezone) !== data.date) {
    return 'skipped_other_day';
  }
  const engine = summaryEngineDeps({
    getProvider: getCoachProvider,
    getHostedProvider,
    clock: systemClock,
    telemetry: new LoggerCoachTelemetry(),
  });
  return generateTodaySummary(data.userId, { ...engine, ...deps, force: true });
}

/** The 'coach-summary' worker's processor; the outcome is kept as the job's return value. */
export async function processDaySummaryJob(job: Job): Promise<DaySummaryJobOutcome | null> {
  return job.name === COACH_DAY_SUMMARY_JOB ? runDaySummaryJob(job.data as DaySummaryJobData) : null;
}

/** Started next to the sync worker (server.ts) and closed with it on shutdown. */
export function startDaySummaryWorker(options: { autorun?: boolean } = {}): Worker {
  return new Worker(COACH_SUMMARY_QUEUE, processDaySummaryJob, {
    connection,
    concurrency: getSummaryConcurrency(),
    ...options,
  });
}
