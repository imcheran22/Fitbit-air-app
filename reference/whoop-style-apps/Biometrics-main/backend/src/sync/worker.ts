import { Job, Worker } from 'bullmq';
import type { HealthConnection, Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { connection, TOKEN_REFRESH_SWEEP_JOB } from './queue';
import { runTokenRefreshSweep } from './tokenRefreshJob';
import { fetchMetricRange, fetchSleepSessions, DailyMetricType } from '../health/client';
import { refreshHealthTokens } from '../health/oauth';
import { deleteUserSubscription } from '../health/subscriber';
import { decryptToken } from '../crypto/tokenCipher';
import { upsertBiometricRecords, storeSleepSessions, datesNeedingRescore } from '../biometrics/repository';
import { BiometricMetricType, HealthMetricPoint, SleepSessionPoint } from '../types';
import {
  FetchJobData,
  BackfillJobData,
  SLEEP_HISTORY_BACKFILL_JOB,
  SleepHistoryBackfillJobData,
  SLEEP_STAGES_BACKFILL_JOB,
  SleepStagesBackfillJobData,
  STEPS_HISTORY_BACKFILL_JOB,
  StepsHistoryBackfillJobData,
} from './queue';
import { isEmptyWindow } from './window';
import { stepsHistoryWindow } from './stepsHistory';
import { sleepHistoryWindow } from './sleepHistory';
import { isRevokedGrant, refreshedTokenUpdateData } from './tokenUpdate';
import { localCivilDate } from '../biometrics/civilDate';
import { CATCH_UP_JOB, CATCH_UP_SWEEP_JOB, CatchUpJobData, catchUpWindow, enqueueCatchUp } from './catchUp';
import { computeDailyScore } from '../scoring/compute';
import { runScoreSweep, SWEEP_LOOKBACK_DAYS } from '../scoring/sweep';
import { shiftDate } from '../scoring/dates';
import { COMPUTE_DAILY_SCORE_JOB, SCORE_SWEEP_JOB, enqueueScoreCompute, ComputeDailyScoreJobData } from '../scoring/queue';
import { runHabitCorrelations } from '../habits/job';
import { runHabitCorrelationSweep } from '../habits/sweep';
import {
  HABIT_CORRELATION_SWEEP_JOB,
  RUN_HABIT_CORRELATIONS_JOB,
  RunHabitCorrelationsJobData,
} from '../habits/queue';

import { COACH_RETENTION_JOB } from '../coach/queue';
import { getPushSender } from '../coach/config';
import { BUDDY_NOTIFY_JOB, runBuddyNotifyJob } from '../buddies/notifyQueue';
import { BUDDY_BADGE_JOB, runBuddyBadgeJob, type BuddyBadgeJobData } from '../buddies/badges';
import type { BuddyNotice } from '../buddies/notify';
import { defaultRecapDeps, runRecapJob } from '../recap/build';
import { RECAP_BUILD_JOB, RECAP_SWEEP_JOB } from '../recap/queue';
import { runRecapSweep } from '../recap/sweep';
import type { RecapJobData } from '../recap/types';
import { refreshDaySummaryAfterScore } from '../coach/daySummaryJob';
import { runCoachRetention } from '../coach/retention';
import { LoggerCoachTelemetry } from '../coach/telemetry';
import { recordStepGoal } from '../social/stepGoal';
import { runSocialSweep } from '../social/sweep';

const ALL_METRIC_TYPES: BiometricMetricType[] = ['HRV', 'RESTING_HR', 'SLEEP', 'STEPS'];
const SYNC_WORKER_CONCURRENCY = 5;

function isUnauthorized(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 401;
}

// YYYY-MM-DD -> the following calendar day, also YYYY-MM-DD (UTC arithmetic,
// so month/year rollovers are handled by Date).
function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid job date "${isoDate}": expected YYYY-MM-DD`);
  }
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid job date "${isoDate}": expected YYYY-MM-DD`);
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// SLEEP's day key is a local civil date but the fetch filter is on UTC
// instants, so a window covering exactly [start, end) can miss sessions that
// belong to its edge days. Widen by one day each side: for a single-day job
// [D, D+1) this is the spec's [D-1, D+2). Sessions are idempotent, so the
// overlap costs nothing; a session that is still missed is simply absent
// until a later window includes it, and the rollup converges then.
function sleepWindow(startDate: string, endDate: string): [string, string] {
  return [shiftDay(startDate, -1), shiftDay(endDate, 1)];
}

async function disconnect(userId: string, webhookSubscriptionId: string | null): Promise<void> {
  await prisma.healthConnection.update({
    where: { userId },
    data: { status: 'DISCONNECTED' },
  });
  if (webhookSubscriptionId) {
    try {
      await deleteUserSubscription(webhookSubscriptionId);
    } catch (err) {
      console.error(`Failed to delete Google Health subscription ${webhookSubscriptionId}`, err);
    }
  }
}

/**
 * Per-job access-token state. A 401 from Google can mean the grant was
 * revoked, but it can equally mean the access token merely expired between
 * the last refresh sweep and this job running (sweep lag, clock skew, a job
 * that sat in the queue). Tearing down the connection and its Google
 * subscription on the first 401 would destroy real state for a transient
 * condition, so each job gets exactly ONE in-line refresh attempt before a
 * 401 is treated as terminal.
 */
class JobTokenSession {
  accessToken: string;
  private refreshed = false;

  constructor(private readonly conn: HealthConnection) {
    this.accessToken = decryptToken(conn.encryptedAccessToken);
  }

  async fetch(metricType: DailyMetricType, startDate: string, endDate: string): Promise<HealthMetricPoint[]> {
    return this.withRefresh((token) => fetchMetricRange(token, metricType, startDate, endDate));
  }

  async fetchSleep(startDate: string, endDate: string): Promise<SleepSessionPoint[]> {
    return this.withRefresh((token) => fetchSleepSessions(token, startDate, endDate));
  }

  private async withRefresh<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    try {
      return await call(this.accessToken);
    } catch (err) {
      if (!isUnauthorized(err) || this.refreshed) throw err;

      // One refresh per job. If Google refuses the grant, surface the ORIGINAL
      // 401 so the caller's disconnect path runs. If Google could not be
      // reached, surface the refresh error instead: it is not a 401, so the
      // connection is kept and BullMQ retries the job.
      this.refreshed = true;
      let tokens;
      try {
        tokens = await refreshHealthTokens(decryptToken(this.conn.encryptedRefreshToken));
      } catch (refreshErr) {
        console.error(`In-line Google Health token refresh failed for user ${this.conn.userId}`, refreshErr);
        throw isRevokedGrant(refreshErr) ? err : refreshErr;
      }

      // Persist before retrying so a successful refresh is never lost even if
      // the retry fails for an unrelated reason. A DB failure here is a
      // transient infrastructure problem, not a revoked grant: it propagates
      // as a non-401 error and BullMQ retries the job.
      await prisma.healthConnection.update({
        where: { id: this.conn.id },
        data: refreshedTokenUpdateData(tokens),
      });
      this.accessToken = tokens.accessToken;

      // A second 401 with a freshly minted token means access really is gone;
      // let it propagate to the disconnect path.
      return await call(this.accessToken);
    }
  }
}

// SLEEP is stored as whole sessions (idempotent upsert) and the BiometricRecord
// row is a rollup re-derived for every touched local date -- see
// biometrics/repository.ts for why summing per-day rows was rejected.
async function syncSleep(session: JobTokenSession, userId: string, startDate: string, endDate: string): Promise<string[]> {
  const [from, to] = sleepWindow(startDate, endDate);
  const touched = await storeSleepSessions(userId, await session.fetchSleep(from, to));
  // A night is an input to its own day AND to every later day whose sleep-debt
  // window still contains it, so a night that arrives late (a delayed webhook,
  // a reconnect backfill, a night Google revised) invalidates the fortnight
  // after it too. The nightly sweep will not catch those days: its staleness
  // test is per day, and their own inputs never changed.
  return datesNeedingRescore(touched);
}

// HRV, RHR and SLEEP feed the Recovery Score (SLEEP also feeds the Sleep Score);
// STEPS does not (its only derived feature, ACWR, is stored but excluded from the composite).
const SCORE_INPUT_METRICS = new Set<BiometricMetricType>(['HRV', 'RESTING_HR', 'SLEEP']);

/**
 * Asks for the affected days' scores to be recomputed, debounced per user+day
 * so a burst of overnight sleep + HRV + RHR webhooks becomes one recompute.
 * Scoring is derived data: a failure to enqueue must never fail (and so
 * retry) a sync job whose data is already safely stored. The nightly sweep is
 * the backstop for anything missed here.
 */
async function requestScores(userId: string, dates: string[]): Promise<void> {
  for (const date of new Set(dates)) {
    try {
      await enqueueScoreCompute(userId, date);
    } catch (err) {
      console.error(`Failed to enqueue score recompute for user ${userId} on ${date}`, err);
    }
  }
}

const civilDateOf = (p: HealthMetricPoint) => p.recordedAt.toISOString().slice(0, 10);

async function handleFetchJob(data: FetchJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  try {
    const session = new JobTokenSession(conn);
    // fetchMetricRange's ranges are half-open (start inclusive, end exclusive):
    // dataPoints.list filters on `>= start AND < end`, and dailyRollUp's
    // confirmed-live usage retrieves the `start` bucket with end = start + 1.
    // Passing the same date for both bounds is an empty range, so a
    // single-day job must ask for [date, date + 1).
    const end = nextDay(data.date);
    if (data.metricType === 'SLEEP') {
      await requestScores(data.userId, await syncSleep(session, data.userId, data.date, end));
    } else {
      const points = await session.fetch(data.metricType, data.date, end);
      await upsertBiometricRecords(data.userId, data.metricType, points);
      if (data.metricType === 'STEPS') {
        // Social timeline event; a failure never fails the sync (logged with ids only).
        await recordStepGoal(data.userId, points, new Date()).catch((err: unknown) =>
          console.error(JSON.stringify({ event: 'social.step_goal_failed', userId: data.userId, error: err instanceof Error ? err.name : 'unknown' })),
        );
      }
      if (SCORE_INPUT_METRICS.has(data.metricType)) await requestScores(data.userId, points.map(civilDateOf));
    }
    await prisma.healthConnection.update({
      where: { userId: data.userId },
      data: { lastSyncedAt: new Date() },
    });
  } catch (err) {
    if (isUnauthorized(err)) {
      await disconnect(data.userId, conn.webhookSubscriptionId);
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

async function handleBackfillJob(data: BackfillJobData): Promise<void> {
  // Nothing to fetch, and Google answers an empty window with a 400 that would
  // fail the job (e.g. a reconnect on the same day as the last sync). Not a
  // sync, so lastSyncedAt is deliberately left alone.
  if (isEmptyWindow(data.startDate, data.endDate)) return;
  await syncWindow(data.userId, data.startDate, data.endDate);
}

/**
 * Pull every metric and sleep over [startDate, endDate), store it, request
 * the affected scores and stamp lastSyncedAt. Shared by the connect backfill
 * and the catch-up sync. Revoked access disconnects the user and returns.
 */
export async function syncWindow(userId: string, startDate: string, endDate: string): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  try {
    const session = new JobTokenSession(conn);
    const scoreDates: string[] = [];
    for (const metricType of ALL_METRIC_TYPES) {
      if (metricType === 'SLEEP') {
        scoreDates.push(...(await syncSleep(session, userId, startDate, endDate)));
        continue;
      }
      const points = await session.fetch(metricType, startDate, endDate);
      await upsertBiometricRecords(userId, metricType, points);
      if (metricType === 'STEPS') {
        // Social timeline event; a failure never fails the sync (logged with ids only).
        await recordStepGoal(userId, points, new Date()).catch((err: unknown) =>
          console.error(JSON.stringify({ event: 'social.step_goal_failed', userId, error: err instanceof Error ? err.name : 'unknown' })),
        );
      }
      if (SCORE_INPUT_METRICS.has(metricType)) scoreDates.push(...points.map(civilDateOf));
    }
    await requestScores(userId, scoreDates);
    await prisma.healthConnection.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
  } catch (err) {
    if (isUnauthorized(err)) {
      await disconnect(userId, conn.webhookSubscriptionId);
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

// The window is worked out when the job runs, not when it was queued, so a job
// that waited still covers up to now.
async function handleCatchUpJob(data: CatchUpJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId }, select: { status: true, lastSyncedAt: true } });
  if (!conn || conn.status === 'DISCONNECTED') return;
  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { timezone: true } });
  const timeZone = user?.timezone ?? 'UTC';
  const { startDate, endDate } = catchUpWindow(conn.lastSyncedAt, localCivilDate(new Date(), timeZone), timeZone);
  await syncWindow(data.userId, startDate, endDate);
}

async function handleCatchUpSweep(): Promise<void> {
  const connected = await prisma.healthConnection.findMany({ where: { status: 'CONNECTED' }, select: { userId: true } });
  for (const { userId } of connected) await enqueueCatchUp(userId);
}

/**
 * A year of daily STEPS for the activity heat map, and nothing else. Separate
 * from handleBackfillJob so the scoring inputs (a 30-day backfill of all four
 * metrics) are unchanged. STEPS is not a score input, so no scores are
 * requested, and lastSyncedAt is left alone: this is history, not a sync.
 */
async function handleStepsHistoryJob(data: StepsHistoryBackfillJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  const { startDate, endDate } = stepsHistoryWindow();
  try {
    if (!isEmptyWindow(startDate, endDate)) {
      // fetchMetricRange chunks the year into windows Google accepts.
      const points = await new JobTokenSession(conn).fetch('STEPS', startDate, endDate);
      await upsertBiometricRecords(data.userId, 'STEPS', points);
    }
    await prisma.healthConnection.update({
      where: { userId: data.userId },
      data: { stepsHistoryBackfilledAt: new Date() },
    });
  } catch (err) {
    if (isUnauthorized(err)) {
      await disconnect(data.userId, conn.webhookSubscriptionId);
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

/**
 * One pass over the sleep history window, shared by the history backfill and
 * the one-off stage backfill; only the marker each sets differs. Sessions go
 * through storeSleepSessions like any other sleep sync, so the SLEEP rollups
 * stay derived from sessions. Sleep IS a score input: a night just before the
 * 30-day connect backfill still sits in the sleep-debt window of days that
 * were already scored, and the nightly sweep's per-day staleness test cannot
 * see that. So the affected days are re-scored, but only inside the sweep's
 * own lookback: scoring a year of old days nobody asked for would be new
 * behaviour, not a backfill. lastSyncedAt is left alone: this is history, not
 * a sync.
 */
async function runSleepHistoryPass(
  conn: HealthConnection,
  marker: () => Prisma.HealthConnectionUpdateInput,
): Promise<void> {
  const { startDate, endDate } = sleepHistoryWindow();
  try {
    if (!isEmptyWindow(startDate, endDate)) {
      const rescore = await syncSleep(new JobTokenSession(conn), conn.userId, startDate, endDate);
      const oldest = shiftDate(endDate, -SWEEP_LOOKBACK_DAYS);
      await requestScores(conn.userId, rescore.filter((date) => date >= oldest));
    }
    await prisma.healthConnection.update({ where: { userId: conn.userId }, data: marker() });
  } catch (err) {
    if (isUnauthorized(err)) {
      await disconnect(conn.userId, conn.webhookSubscriptionId);
      return;
    }
    // Any other error (e.g. 429) fails this attempt without setting the marker.
    // The queue retries the job with exponential backoff (the pass is
    // idempotent: batches that landed are a no-op the second time); only once
    // every attempt has failed does removeOnFail drop it, and then the next
    // server start's pending sweep re-enqueues it.
    throw err;
  }
}

/** A year of sleep sessions for the Sleep page of the activity heat map. */
async function handleSleepHistoryJob(data: SleepHistoryBackfillJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  // This pull carries each night's stages, so the one-off stage backfill is done too.
  await runSleepHistoryPass(conn, () => {
    const now = new Date();
    return { sleepHistoryBackfilledAt: now, sleepStagesBackfilledAt: now };
  });
}

/**
 * The one-off stage re-fetch for connections whose history was stored before
 * stages were captured. storeSleepSessions only returns dates whose nights
 * changed (not ones that just gained stages or a summary), so a stage-only
 * pass asks for no scores, while a night Google revised meanwhile is re-scored
 * like any sync. Skipped when the stages are already in, e.g. because a
 * reconnect's history backfill finished first.
 */
async function handleSleepStagesJob(data: SleepStagesBackfillJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED' || conn.sleepStagesBackfilledAt) return;

  await runSleepHistoryPass(conn, () => ({ sleepStagesBackfilledAt: new Date() }));
}

/**
 * The social sweep's clock: `job.data.now` when a test pins it (a valid ISO instant), else the real clock. The
 * scheduler sends `{}`. Not a second processSyncJob parameter: BullMQ passes the worker token there. A pinned
 * clock is never later than now, so a job can't sweep live notes or current caches as if they were old.
 */
function sweepClock(job: Job): Date {
  const pinned = (job.data as { now?: unknown } | undefined)?.now;
  const at = typeof pinned === 'string' ? new Date(pinned) : null;
  const now = new Date();
  return at && !Number.isNaN(at.getTime()) && at.getTime() < now.getTime() ? at : now;
}

export async function processSyncJob(job: Job): Promise<void> {
  if (job.name === 'fetch') {
    await handleFetchJob(job.data as FetchJobData);
  } else if (job.name === 'backfill') {
    await handleBackfillJob(job.data as BackfillJobData);
  } else if (job.name === CATCH_UP_JOB) {
    await handleCatchUpJob(job.data as CatchUpJobData);
  } else if (job.name === CATCH_UP_SWEEP_JOB) {
    await handleCatchUpSweep();
  } else if (job.name === STEPS_HISTORY_BACKFILL_JOB) {
    await handleStepsHistoryJob(job.data as StepsHistoryBackfillJobData);
  } else if (job.name === SLEEP_HISTORY_BACKFILL_JOB) {
    await handleSleepHistoryJob(job.data as SleepHistoryBackfillJobData);
  } else if (job.name === SLEEP_STAGES_BACKFILL_JOB) {
    await handleSleepStagesJob(job.data as SleepStagesBackfillJobData);
  } else if (job.name === TOKEN_REFRESH_SWEEP_JOB) {
    // Scheduled through the queue so exactly one instance sweeps per tick.
    await runTokenRefreshSweep();
  } else if (job.name === COMPUTE_DAILY_SCORE_JOB) {
    const { userId, date } = job.data as ComputeDailyScoreJobData;
    // Today's scores just landed: the Coach page's day summary is rewritten from them, on the
    // separate 'coach-summary' queue so the model never holds a sync slot (never throws).
    if ((await computeDailyScore(userId, date)) === 'scored') await refreshDaySummaryAfterScore(userId, date);
  } else if (job.name === SCORE_SWEEP_JOB) {
    await runScoreSweep();
  } else if (job.name === HABIT_CORRELATION_SWEEP_JOB) {
    await runHabitCorrelationSweep();
  } else if (job.name === RUN_HABIT_CORRELATIONS_JOB) {
    const { userId, runKey } = job.data as RunHabitCorrelationsJobData;
    await runHabitCorrelations(userId, { runKey });
  } else if (job.name === RECAP_SWEEP_JOB) {
    // The hourly tick also runs the social sweep (expired camp and Chats notes, old highlight caches, old reports). It
    // goes first and never throws, so a social failure cannot stop recaps. Counts and the error's name only.
    await runSocialSweep(sweepClock(job)).then(
      (r) => console.info(JSON.stringify({ event: 'social.sweep', ...r })),
      (err: unknown) => console.error(JSON.stringify({ event: 'social.sweep_failed', error: err instanceof Error ? err.name : 'unknown' })),
    );
    await runRecapSweep();
  } else if (job.name === RECAP_BUILD_JOB) {
    // Not gated on COACH_ENABLED: recaps exist with the coach off (template text, app-level push).
    await runRecapJob(job.data as RecapJobData, defaultRecapDeps());
  } else if (job.name === BUDDY_NOTIFY_JOB) {
    // Not gated on COACH_ENABLED: buddy pushes are app-level, like the recap push.
    await runBuddyNotifyJob(job.data as BuddyNotice, { pushSender: getPushSender(), now: new Date() });
  } else if (job.name === BUDDY_BADGE_JOB) {
    // Not gated on COACH_ENABLED: buddy pushes are app-level, like the recap push.
    await runBuddyBadgeJob(job.data as BuddyBadgeJobData, { pushSender: getPushSender(), now: new Date() });
  } else if (job.name === COACH_RETENTION_JOB) {
    // Not gated on COACH_ENABLED: expiry must keep running if the coach is switched off.
    await runCoachRetention({ telemetry: new LoggerCoachTelemetry() });
  }
}

export function startSyncWorker(): Worker {
  return new Worker('health-sync', processSyncJob, {
    connection,
    concurrency: SYNC_WORKER_CONCURRENCY,
  });
}
