// The section-1 numbers (spec 2026-10-04 §1), computed from raw stored data only. The previous
// period's comparison and the milestones read raw data too, never a stored recap, so the first
// recap has a comparison whenever history exists. Every number is omitted, never zero-filled,
// when its own data is missing.

import { dateRange, shiftDate } from '../scoring/dates';
import { populationStdDev } from '../scoring/features';
import { MIN_NIGHTS, mondayOf, monthStartOf, periodEndOf, previousPeriodStart, shiftMonth } from './periods';
import type { DayData, RecapData, RecapKind, RecapMilestones, RecapStats, WeekStripEntry } from './types';

/** The regularity endpoint's minimum for a 7-night spread. */
export const MIN_SPREAD_NIGHTS = 4;
const STREAK_MILESTONE = 5;
const BEST_WEEK_MIN_DAYS = 4;
const STEADIEST_EARLIER_MONTHS = 3;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const defined = <T>(v: T | undefined): v is T => v !== undefined;
/** A SLEEP rollup of 0 is no night (as the coach's zeroIsMissing). */
const sleepOf = (d: DayData | undefined): number | undefined => (d?.sleepMinutes !== undefined && d.sleepMinutes > 0 ? d.sleepMinutes : undefined);

interface Core {
  dates: string[];
  nightsWithData: number;
  avgSleepMinutes?: number;
  bedtimes: number[];
  avgBedtime?: number;
  bedtimeSpreadMinutes?: number;
  avgRecovery?: number;
}

function coreOf(data: RecapData, from: string, to: string): Core {
  const dates = dateRange(from, to);
  const sleeps = dates.map((d) => sleepOf(data.get(d))).filter(defined);
  const bedtimes = dates.map((d) => data.get(d)?.bedtime).filter(defined);
  const recoveries = dates.map((d) => data.get(d)?.recovery).filter(defined);
  const core: Core = { dates, nightsWithData: sleeps.length, bedtimes };
  if (sleeps.length > 0) core.avgSleepMinutes = Math.round(mean(sleeps));
  if (bedtimes.length > 0) core.avgBedtime = mean(bedtimes);
  if (bedtimes.length >= MIN_SPREAD_NIGHTS) core.bedtimeSpreadMinutes = Math.round(populationStdDev(bedtimes));
  if (recoveries.length > 0) core.avgRecovery = Math.round(mean(recoveries));
  return core;
}

export function isEligible(kind: RecapKind, stats: Pick<RecapStats, 'nightsWithData'>): boolean {
  return stats.nightsWithData >= MIN_NIGHTS[kind];
}

function longestStreak(dates: string[], onGoal: (date: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (const date of dates) {
    run = onGoal(date) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Highest SLEEP score; ties → longer sleep; no scores → longest sleep; then the earliest date. */
function bestNightOf(dates: string[], data: RecapData): RecapStats['bestNight'] {
  let best: { date: string; minutes: number; score: number } | null = null;
  for (const date of dates) {
    const minutes = sleepOf(data.get(date));
    if (minutes === undefined) continue;
    const score = data.get(date)?.sleepScore ?? Number.NEGATIVE_INFINITY;
    if (!best || score > best.score || (score === best.score && minutes > best.minutes)) best = { date, minutes, score };
  }
  return best ? { date: best.date, minutesAsleep: Math.round(best.minutes) } : undefined;
}

function bestRecoveryOf(dates: string[], data: RecapData): RecapStats['bestRecovery'] {
  let best: { date: string; score: number } | undefined;
  for (const date of dates) {
    const r = data.get(date)?.recovery;
    if (r === undefined) continue;
    const score = Math.round(r);
    if (!best || score > best.score) best = { date, score };
  }
  return best;
}

function stepsOf(dates: string[], data: RecapData): RecapStats['steps'] {
  const days = dates.map((d) => data.get(d)?.steps).filter((v): v is number => v !== undefined && v > 0);
  if (days.length === 0) return undefined;
  const total = days.reduce((s, v) => s + v, 0);
  return { total: Math.round(total), dailyAverage: Math.round(total / days.length) };
}

function weekStripOf(dates: string[], data: RecapData, goal: number): WeekStripEntry[] {
  return dates.map((date) => {
    const minutes = sleepOf(data.get(date));
    const recovery = data.get(date)?.recovery;
    return {
      date,
      minutesAsleep: minutes === undefined ? null : Math.round(minutes),
      onGoal: minutes === undefined ? null : minutes >= goal,
      recovery: recovery === undefined ? null : Math.round(recovery),
    };
  });
}

/** The Monday-start week inside the month (its days in the month, ≥ 4 with RECOVERY) with the highest mean. */
function bestRecoveryWeek(data: RecapData, monthStart: string): { weekStart: string; avgRecovery: number } | undefined {
  const monthEnd = periodEndOf('MONTH', monthStart);
  let best: { weekStart: string; avgRecovery: number } | undefined;
  for (let w = mondayOf(monthStart); w <= monthEnd; w = shiftDate(w, 7)) {
    const days = dateRange(w, shiftDate(w, 6)).filter((d) => d >= monthStart && d <= monthEnd);
    const recs = days.map((d) => data.get(d)?.recovery).filter(defined);
    if (recs.length < BEST_WEEK_MIN_DAYS) continue;
    const avg = Math.round(mean(recs));
    if (!best || avg > best.avgRecovery) best = { weekStart: w, avgRecovery: avg };
  }
  return best;
}

/** Bedtime spreads of every eligible month before `monthStart` that the raw data can compute. */
function earlierMonthSpreads(data: RecapData, monthStart: string): number[] {
  const first = [...data.keys()].sort()[0];
  if (first === undefined) return [];
  const out: number[] = [];
  for (let m = monthStartOf(first); m < monthStart; m = shiftMonth(m, 1)) {
    const core = coreOf(data, m, periodEndOf('MONTH', m));
    if (core.nightsWithData >= MIN_NIGHTS.MONTH && core.bedtimeSpreadMinutes !== undefined) out.push(core.bedtimeSpreadMinutes);
  }
  return out;
}

function milestonesOf(monthStart: string, cur: Core, stats: RecapStats, data: RecapData): RecapMilestones {
  const m: RecapMilestones = {};
  if ((stats.longestOnGoalStreak ?? 0) >= STREAK_MILESTONE) m.streak = { nights: stats.longestOnGoalStreak! };
  const best = bestRecoveryWeek(data, monthStart);
  const previous = bestRecoveryWeek(data, previousPeriodStart('MONTH', monthStart));
  if (best && previous && best.avgRecovery - previous.avgRecovery >= 1) m.bestRecoveryWeek = best;
  if (cur.nightsWithData === cur.dates.length) m.everyDayLogged = { days: cur.dates.length };
  const spread = stats.bedtimeSpreadMinutes;
  if (spread !== undefined) {
    const earlier = earlierMonthSpreads(data, monthStart);
    if (earlier.length >= STEADIEST_EARLIER_MONTHS && earlier.every((s) => spread < s)) m.steadiestMonth = { spreadMinutes: spread };
  }
  return m;
}

/**
 * `goalMinutes` is the caller's goal snapshot for this recap (the one stored with it), never the
 * user's current goal, so a late-data rebuild after a goal change keeps the original yardstick.
 */
export function computeRecapStats(kind: RecapKind, periodStart: string, data: RecapData, goalMinutes: number): RecapStats {
  const cur = coreOf(data, periodStart, periodEndOf(kind, periodStart));
  const onGoal = (date: string) => (sleepOf(data.get(date)) ?? -1) >= goalMinutes;
  const stats: RecapStats = { nightsWithData: cur.nightsWithData };
  if (cur.avgSleepMinutes !== undefined) stats.avgSleepMinutes = cur.avgSleepMinutes;
  if (cur.nightsWithData > 0) {
    stats.nightsOnGoal = cur.dates.filter(onGoal).length;
    stats.longestOnGoalStreak = longestStreak(cur.dates, onGoal);
  }
  const bestNight = bestNightOf(cur.dates, data);
  if (bestNight) stats.bestNight = bestNight;
  const bestRecovery = bestRecoveryOf(cur.dates, data);
  if (bestRecovery) stats.bestRecovery = bestRecovery;
  if (cur.avgRecovery !== undefined) stats.avgRecovery = cur.avgRecovery;
  const steps = stepsOf(cur.dates, data);
  if (steps) stats.steps = steps;
  if (cur.bedtimeSpreadMinutes !== undefined) stats.bedtimeSpreadMinutes = cur.bedtimeSpreadMinutes;

  // The previous period, from raw data, only when it meets the same threshold (spec §1).
  const prev = coreOf(data, previousPeriodStart(kind, periodStart), shiftDate(periodStart, -1));
  if (prev.nightsWithData >= MIN_NIGHTS[kind]) {
    if (prev.avgBedtime !== undefined && cur.bedtimes.length > 0) {
      const before = prev.avgBedtime;
      stats.earlierBedtimes = { nights: cur.bedtimes.filter((b) => b < before).length, of: cur.bedtimes.length };
    }
    const comparison: NonNullable<RecapStats['comparison']> = {};
    if (cur.avgSleepMinutes !== undefined && prev.avgSleepMinutes !== undefined) comparison.avgSleepDelta = cur.avgSleepMinutes - prev.avgSleepMinutes;
    if (cur.bedtimeSpreadMinutes !== undefined && prev.bedtimeSpreadMinutes !== undefined) comparison.bedtimeSpreadDelta = cur.bedtimeSpreadMinutes - prev.bedtimeSpreadMinutes;
    if (cur.avgRecovery !== undefined && prev.avgRecovery !== undefined) comparison.avgRecoveryDelta = cur.avgRecovery - prev.avgRecovery;
    if (Object.keys(comparison).length > 0) stats.comparison = comparison;
  }

  if (kind === 'WEEK') stats.weekStrip = weekStripOf(cur.dates, data, goalMinutes);
  else stats.milestones = milestonesOf(periodStart, cur, stats, data);
  return stats;
}
