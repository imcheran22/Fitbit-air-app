// The recap's database reads (spec 2026-10-04 §1–2): raw SLEEP and STEPS rollups, both daily
// scores, and each night's main-session bedtime (pickMainSession, noon-anchored minutes, the
// regularity maths). Plus the cheap late-data filters the hourly sweep's jobs run first.

import { civilDateToUtcMidnight, sessionStartMinutesSinceLocalNoon } from '../biometrics/civilDate';
import { pickMainSession } from '../biometrics/mainSession';
import { prisma } from '../db/client';
import { groupSessionsByNight } from '../scoring/features';
import { monthStartOf, periodEndOf, previousPeriodStart } from './periods';
import type { DayData, RecapData, RecapKind } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

function bounds(from: string, to: string): { gte: Date; lt: Date } {
  return { gte: civilDateToUtcMidnight(from), lt: new Date(civilDateToUtcMidnight(to).getTime() + DAY_MS) };
}

/** `bedtimes: false` skips the sleep-session read for a caller that never uses `bedtime`. */
export async function loadRecapData(userId: string, timeZone: string, from: string, to: string, opts: { bedtimes?: boolean } = {}): Promise<RecapData> {
  const { gte, lt } = bounds(from, to);
  const withBedtimes = opts.bedtimes ?? true;
  const [records, scores, sessions] = await Promise.all([
    prisma.biometricRecord.findMany({
      where: { userId, metricType: { in: ['SLEEP', 'STEPS'] }, recordedAt: { gte, lt } },
      select: { metricType: true, recordedAt: true, value: true },
    }),
    prisma.dailyScore.findMany({ where: { userId, date: { gte, lt } }, select: { date: true, type: true, score: true } }),
    // A local date spans at most [D - 14h, D + 1d + 12h) in UTC: a day of margin each side.
    withBedtimes
      ? prisma.sleepSession.findMany({
          where: { userId, endTime: { gte: new Date(gte.getTime() - DAY_MS), lt: new Date(lt.getTime() + DAY_MS) } },
          select: { startTime: true, endTime: true, minutesAsleep: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true },
        })
      : [],
  ]);
  const data: RecapData = new Map();
  const at = (date: string): DayData => {
    let day = data.get(date);
    if (!day) {
      day = {};
      data.set(date, day);
    }
    return day;
  };
  for (const r of records) {
    if (r.value <= 0) continue;
    if (r.metricType === 'SLEEP') at(dateKey(r.recordedAt)).sleepMinutes = r.value;
    else at(dateKey(r.recordedAt)).steps = r.value;
  }
  for (const s of scores) {
    if (s.score === null) continue;
    if (s.type === 'SLEEP') at(dateKey(s.date)).sleepScore = s.score;
    else at(dateKey(s.date)).recovery = s.score;
  }
  // A bedtime only on a night that counts (a positive SLEEP rollup), so earlierBedtimes' `of`
  // never exceeds nightsWithData. 01:00 reads 780: after midnight is late, not early.
  for (const [date, list] of groupSessionsByNight(sessions, timeZone)) {
    const day = data.get(date);
    if (day?.sleepMinutes === undefined) continue;
    const main = pickMainSession(list);
    if (main) day.bedtime = sessionStartMinutesSinceLocalNoon(main, timeZone);
  }
  return data;
}

/**
 * WEEK: this and the previous week (the comparison; a week has no milestones). MONTH: every month
 * since the first night, at least the previous month. steadiestMonth needs ≥ 3 earlier eligible
 * months and scans from the earliest loaded date, so the whole history is loaded: any shorter
 * window could hide an eligible month and award the milestone wrongly or never.
 */
export async function recapDataRange(userId: string, kind: RecapKind, periodStart: string): Promise<{ from: string; to: string }> {
  const to = periodEndOf(kind, periodStart);
  const previous = previousPeriodStart(kind, periodStart);
  if (kind === 'WEEK') return { from: previous, to };
  const earliest = await prisma.biometricRecord.findFirst({
    where: { userId, metricType: 'SLEEP', value: { gt: 0 } },
    orderBy: { recordedAt: 'asc' },
    select: { recordedAt: true },
  });
  const first = earliest ? monthStartOf(dateKey(earliest.recordedAt)) : previous;
  return { from: first < previous ? first : previous, to };
}

/** The cheap first filter (spec §2): any SLEEP/STEPS syncedAt or DailyScore updatedAt in the period newer than `since`. */
export async function hasNewerInputs(userId: string, from: string, to: string, since: Date): Promise<boolean> {
  const { gte, lt } = bounds(from, to);
  const [record, score] = await Promise.all([
    prisma.biometricRecord.findFirst({
      where: { userId, metricType: { in: ['SLEEP', 'STEPS'] }, recordedAt: { gte, lt }, syncedAt: { gt: since } },
      select: { id: true },
    }),
    prisma.dailyScore.findFirst({ where: { userId, date: { gte, lt }, updatedAt: { gt: since } }, select: { id: true } }),
  ]);
  return record !== null || score !== null;
}

/**
 * The nightly sweep's own staleness test (spec §2): every date in the period with a positive SLEEP
 * rollup has a SLEEP DailyScore row (as scoring/sweep.ts expects one for any day with a SLEEP
 * input), and every score row's updatedAt ≥ that date's SLEEP rollup syncedAt. Without the first
 * rule a late night synced before its debounced score exists would let the one rebuild run
 * without it. STEPS never trigger a rescore, so they are left out.
 */
export async function scoresCaughtUp(userId: string, from: string, to: string): Promise<boolean> {
  const { gte, lt } = bounds(from, to);
  const [sleeps, scores] = await Promise.all([
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte, lt } },
      select: { recordedAt: true, syncedAt: true, value: true },
    }),
    prisma.dailyScore.findMany({ where: { userId, date: { gte, lt } }, select: { date: true, type: true, updatedAt: true } }),
  ]);
  const sleepScored = new Set(scores.filter((s) => s.type === 'SLEEP').map((s) => dateKey(s.date)));
  if (sleeps.some((s) => s.value > 0 && !sleepScored.has(dateKey(s.recordedAt)))) return false;
  const synced = new Map(sleeps.map((s) => [dateKey(s.recordedAt), s.syncedAt]));
  return scores.every((s) => {
    const at = synced.get(dateKey(s.date));
    return at === undefined || s.updatedAt >= at;
  });
}
