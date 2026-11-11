import { shiftDate } from '../scoring/dates';
import { getLiveConfig } from '../scoring/configs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { BiometricMetricType, HealthMetricPoint, SleepSessionPoint } from '../types';
import { sessionEndCivilDate, civilDateToUtcMidnight } from './civilDate';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function upsertBiometricRecords(
  userId: string,
  metricType: BiometricMetricType,
  points: HealthMetricPoint[],
): Promise<void> {
  for (const point of points) {
    await prisma.biometricRecord.upsert({
      where: { userId_metricType_recordedAt: { userId, metricType, recordedAt: point.recordedAt } },
      update: { value: point.value, syncedAt: new Date() },
      create: { userId, metricType, recordedAt: point.recordedAt, value: point.value },
    });
  }
}

/** A session end an upsert touched, with the offset that end was keyed under (null: the user's timezone). */
interface TouchedEnd {
  endTime: Date;
  endUtcOffsetSeconds: number | null;
}

/**
 * Serialises every sleep write for one user, for the rest of the transaction.
 * Two sync jobs used to read their own snapshot of the sessions, compute a
 * total from it, and then both write -- so whichever committed last could
 * persist a total that omitted the other's sessions. A per-user advisory lock
 * (rather than SERIALIZABLE) keeps that ordering without making unrelated
 * users retry each other.
 */
async function lockUserSleep(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}

// A store holds the lock while it writes every session in a batch, its stages
// and the touched rollups: each night is a few round trips, and a second job
// for the same user can queue behind the lock, so Prisma's 5s default is too
// tight; a minute is far above any one batch while still failing a wedged
// transaction.
const SLEEP_STORE_TIMEOUT_MS = 60_000;

// The most sessions storeSleepSessions writes in one locked transaction. A
// history or stage backfill passes a year of nights (~365 sessions, each with
// a few dozen stage rows); in one transaction that held the user's lock for the
// whole write, made every webhook sync for the user wait behind it, and against
// a remote database could outrun the timeout above -- with nothing to retry it.
export const SLEEP_STORE_BATCH_SIZE = 45;

/**
 * Stores whole sleep sessions, overwrite-on-match on (userId, startTime).
 * Re-fetching a session yields the same values, so every re-sync, retry and
 * overlapping window is a no-op; if Google revises a session the row converges
 * to the latest values, including its UTC offsets (so re-fetching a row stored
 * before the offsets were captured fills them in). (Summing into a per-day row
 * instead would double-count on every repeat webhook, retried job and re-run
 * backfill.)
 *
 * The night summary and stages are stored with the row. Stages are replaced
 * wholesale, and only when the point carries them (`stages` defined), so a
 * caller that never sends stages keeps the stored ones.
 *
 * Returns the ends of new or changed sessions only -- the new end of every
 * session that is new or whose end, minutes or offsets moved, AND the previous
 * end of each such session -- each with the offset it was keyed under, so the
 * caller can recompute every rollup date that may have changed, including the
 * one a revised (or newly offset-keyed) session just left.
 *
 * Runs on the caller's transaction, which must already hold lockUserSleep: the
 * change test reads the stored rows, and only the lock keeps them from moving
 * before the writes land.
 */
async function upsertSleepSessionsIn(
  tx: Prisma.TransactionClient,
  userId: string,
  sessions: SleepSessionPoint[],
): Promise<TouchedEnd[]> {
  if (sessions.length === 0) return [];

  // Last one wins if a batch repeats a startTime, matching what sequential
  // overwrite-upserts would leave behind.
  const byStart = new Map<number, SleepSessionPoint>();
  for (const s of sessions) byStart.set(s.startTime.getTime(), s);
  const unique = [...byStart.values()];

  const existing = await tx.sleepSession.findMany({
    where: { userId, startTime: { in: unique.map((s) => s.startTime) } },
    select: { startTime: true, endTime: true, minutesAsleep: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true },
  });
  const prevByStart = new Map(existing.map((e) => [e.startTime.getTime(), e]));
  // Only a session that is new, or whose end, minutes or offsets moved, can change a
  // rollup or a score. Stage and summary refreshes still write the row but touch no date,
  // so a stage backfill never makes the sweep rescore (spec 2026-10-03 §2).
  const changed = unique.filter((s) => {
    const p = prevByStart.get(s.startTime.getTime());
    return !p || p.endTime.getTime() !== s.endTime.getTime() || p.minutesAsleep !== s.minutesAsleep
      || p.startUtcOffsetSeconds !== (s.startUtcOffsetSeconds ?? null) || p.endUtcOffsetSeconds !== (s.endUtcOffsetSeconds ?? null);
  });

  for (const s of unique) {
    // `?? null`: a missing offset is stored as null (converge to the latest fetch), never left stale.
    const offsets = {
      startUtcOffsetSeconds: s.startUtcOffsetSeconds ?? null,
      endUtcOffsetSeconds: s.endUtcOffsetSeconds ?? null,
    };
    const summary = {
      sleepType: s.sleepType ?? null, mainSleep: s.mainSleep ?? null,
      minutesInSleepPeriod: s.minutesInSleepPeriod ?? null, minutesAwake: s.minutesAwake ?? null,
      minutesToFallAsleep: s.minutesToFallAsleep ?? null, minutesAfterWakeUp: s.minutesAfterWakeUp ?? null,
      deepMinutes: s.deepMinutes ?? null, lightMinutes: s.lightMinutes ?? null, remMinutes: s.remMinutes ?? null, awakeMinutes: s.awakeMinutes ?? null,
    };
    const stageRows = (s.stages ?? []).map((g) => ({ type: g.type, startTime: g.startTime, endTime: g.endTime }));
    await tx.sleepSession.upsert({
      where: { userId_startTime: { userId, startTime: s.startTime } },
      update: {
        endTime: s.endTime, minutesAsleep: s.minutesAsleep, ...offsets, ...summary, syncedAt: new Date(),
        ...(s.stages ? { stages: { deleteMany: {}, createMany: { data: stageRows } } } : {}),
      },
      create: {
        userId, startTime: s.startTime, endTime: s.endTime, minutesAsleep: s.minutesAsleep, ...offsets, ...summary,
        ...(s.stages ? { stages: { createMany: { data: stageRows } } } : {}),
      },
    });
  }

  const changedStarts = new Set(changed.map((s) => s.startTime.getTime()));
  return [
    ...changed.map((s) => ({ endTime: s.endTime, endUtcOffsetSeconds: s.endUtcOffsetSeconds ?? null })),
    ...existing
      .filter((e) => changedStarts.has(e.startTime.getTime()))
      .map((e) => ({ endTime: e.endTime, endUtcOffsetSeconds: e.endUtcOffsetSeconds })),
  ];
}

/** As upsertSleepSessionsIn in its own locked transaction, returning only the end instants. */
export async function upsertSleepSessions(userId: string, sessions: SleepSessionPoint[]): Promise<Date[]> {
  const touched = await prisma.$transaction(async (tx) => {
    await lockUserSleep(tx, userId);
    return upsertSleepSessionsIn(tx, userId, sessions);
  }, { timeout: SLEEP_STORE_TIMEOUT_MS });
  return touched.map((t) => t.endTime);
}

async function timezoneOf(client: Pick<Prisma.TransactionClient, 'user'>, userId: string): Promise<string> {
  const user = await client.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new Error(`Cannot compute sleep rollups: user ${userId} not found`);
  return user.timezone;
}

// Sum of minutesAsleep per local civil date of each session's end instant: the
// record's own end offset when it has one, else the user's timezone.
function totalsByLocalDate(
  sessions: { endTime: Date; endUtcOffsetSeconds: number | null; minutesAsleep: number }[],
  timeZone: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const date = sessionEndCivilDate(s, timeZone);
    totals.set(date, (totals.get(date) ?? 0) + s.minutesAsleep);
  }
  return totals;
}

// Materialize the rollup for each date from `totals`: overwrite when the date
// has sessions, delete the row when it has none left (e.g. its only session
// was revised onto another date). Always a full overwrite from the derived
// value, never an increment, so running it twice is a no-op.
type RollupClient = Pick<typeof prisma, 'biometricRecord'>;

function rollupWrites(client: RollupClient, userId: string, dates: string[], totals: Map<string, number>) {
  return dates.map((date) => {
    const recordedAt = civilDateToUtcMidnight(date);
    const total = totals.get(date);
    if (total === undefined) {
      return client.biometricRecord.deleteMany({ where: { userId, metricType: 'SLEEP', recordedAt } });
    }
    return client.biometricRecord.upsert({
      where: { userId_metricType_recordedAt: { userId, metricType: 'SLEEP', recordedAt } },
      update: { value: total, syncedAt: new Date() },
      create: { userId, metricType: 'SLEEP', recordedAt, value: total },
    });
  });
}

// The rollups for `dates` (sorted, unique, non-empty), read and written on the
// caller's transaction, which must already hold lockUserSleep: the read has to
// sit inside the same locked transaction as the write (see lockUserSleep).
async function recomputeSleepRollupsIn(
  tx: Prisma.TransactionClient,
  userId: string,
  dates: string[],
  timeZone: string,
): Promise<void> {
  // A local civil date spans at most [D 00:00 - 14h, D+1 00:00 + 12h) in UTC
  // across every real zone or record offset, so [D - 1d, D + 2d) always
  // contains its sessions. The exact bucketing is then done per-session.
  const from = new Date(civilDateToUtcMidnight(dates[0]!).getTime() - DAY_MS);
  const to = new Date(civilDateToUtcMidnight(dates[dates.length - 1]!).getTime() + 2 * DAY_MS);
  const sessions = await tx.sleepSession.findMany({
    where: { userId, endTime: { gte: from, lt: to } },
    select: { endTime: true, endUtcOffsetSeconds: true, minutesAsleep: true },
  });
  for (const write of rollupWrites(tx, userId, dates, totalsByLocalDate(sessions, timeZone))) {
    await write;
  }
}

/**
 * Recomputes the SLEEP BiometricRecord rollup for each given local civil date
 * (YYYY-MM-DD in the user's timezone) from the FULL stored session set.
 * A fetch that only returned part of a day's sessions therefore can never
 * lower a total below what the stored sessions support.
 */
export async function recomputeSleepRollups(userId: string, civilDates: string[]): Promise<void> {
  const dates = [...new Set(civilDates)].sort();
  if (dates.length === 0) return;

  const timeZone = await timezoneOf(prisma, userId);
  await prisma.$transaction(async (tx) => {
    await lockUserSleep(tx, userId);
    await recomputeSleepRollupsIn(tx, userId, dates, timeZone);
  });
}

/**
 * Rebuilds every SLEEP rollup for a user from scratch under their current
 * timezone. Used when the timezone changes: rollups keyed under the old zone
 * are dropped and the sessions re-bucketed, which is cheap because rollups
 * are derived. Sessions that carry their own UTC offset are keyed by it, so
 * they do not move with the timezone.
 */
export async function recomputeAllSleepRollups(userId: string): Promise<string[]> {
  const timeZone = await timezoneOf(prisma, userId);
  const touchedDates: string[] = [];

  await prisma.$transaction(async (tx) => {
    await lockUserSleep(tx, userId);
    const sessions = await tx.sleepSession.findMany({
      where: { userId },
      select: { endTime: true, endUtcOffsetSeconds: true, minutesAsleep: true },
    });
    const totals = totalsByLocalDate(sessions, timeZone);

    const existing = await tx.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP' },
      select: { recordedAt: true },
    });
    const dates = new Set(totals.keys());
    for (const r of existing) dates.add(r.recordedAt.toISOString().slice(0, 10));

    const sorted = [...dates].sort();
    touchedDates.push(...sorted);
    for (const write of rollupWrites(tx, userId, sorted, totals)) {
      await write;
    }
  });

  // Every SLEEP rollup was just re-keyed under the new zone, so every score
  // built on one is stale. The nightly sweep would eventually notice (the
  // rewrites bump syncedAt), but "eventually" here means the user sees scores
  // from their old day boundaries until tomorrow.
  return touchedDates;
}

/**
 * Upsert a batch of sessions, then refresh the rollup of every local date it
 * touched. Returns those dates so the caller can ask for the affected scores to
 * be recomputed.
 *
 * The sessions are written in batches of SLEEP_STORE_BATCH_SIZE (in start
 * order, so a batch covers a run of nearby dates), each in its own locked
 * transaction covering that batch's change test, session and stage writes and
 * rollup writes. Because only changed sessions touch a date, those must commit
 * together: if the rollup write failed after the sessions had committed, the
 * job's retry would find the new values already stored, touch nothing, and
 * leave the rollup (and the scores built on it) stale for good. A failed batch
 * rolls back alone; the batches before it are already whole (sessions and
 * rollups), so the retry touches only what did not land. A date two batches
 * both touch stays correct because each batch recomputes its rollups from the
 * full stored session set under the lock; the caller gets it once.
 */
export async function storeSleepSessions(userId: string, sessions: SleepSessionPoint[]): Promise<string[]> {
  if (sessions.length === 0) return [];
  // Stable, so a startTime repeated in the input still resolves last-one-wins.
  const ordered = [...sessions].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const dates = new Set<string>();
  for (let i = 0; i < ordered.length; i += SLEEP_STORE_BATCH_SIZE) {
    for (const date of await storeSleepBatch(userId, ordered.slice(i, i + SLEEP_STORE_BATCH_SIZE))) dates.add(date);
  }
  return [...dates].sort();
}

async function storeSleepBatch(userId: string, sessions: SleepSessionPoint[]): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await lockUserSleep(tx, userId);
    const touched = await upsertSleepSessionsIn(tx, userId, sessions);
    if (touched.length === 0) return [];
    const timeZone = await timezoneOf(tx, userId);
    const dates = [...new Set(touched.map((end) => sessionEndCivilDate(end, timeZone)))].sort();
    await recomputeSleepRollupsIn(tx, userId, dates, timeZone);
    return dates;
  }, { timeout: SLEEP_STORE_TIMEOUT_MS });
}

/**
 * The days whose scores a set of changed sleep nights invalidates.
 *
 * A night is not only an input to its own day: sleepDebtRolling sums the
 * deficit over a trailing window, so night D is still inside the window of
 * every day up to D + windowDays - 1. Returning only the touched dates meant a
 * late webhook, a reconnect backfill or a night Google revised re-scored day D
 * alone and left the following two weeks computed from a window that no longer
 * matched the data. The nightly sweep does not catch it either: its staleness
 * test is per day, and those days' own inputs never changed.
 *
 * Nothing is emitted past today -- there is no score to recompute for a day
 * that has not happened.
 */
export function datesNeedingRescore(touchedDates: string[], today = isoDateOf(new Date())): string[] {
  const windowDays = getLiveConfig().sleepDebtWindowDays;
  const out = new Set<string>();
  for (const date of touchedDates) {
    for (let i = 0; i < windowDays; i++) {
      const d = shiftDate(date, i);
      if (d > today) break;
      out.add(d);
    }
  }
  return [...out].sort();
}

function isoDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getBiometricsForUser(userId: string) {
  return prisma.biometricRecord.findMany({
    where: { userId },
    // Only what the dashboard actually renders; userId and syncedAt are
    // internal and need not be exposed to the client.
    select: { id: true, metricType: true, value: true, recordedAt: true },
    orderBy: { recordedAt: 'desc' },
  });
}
