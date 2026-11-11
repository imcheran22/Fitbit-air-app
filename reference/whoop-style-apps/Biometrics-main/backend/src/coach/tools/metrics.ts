// Readers over the user's own daily metrics, for the fact sheet. Same contract
// as the score readers: read-only, structured fields only, every comparison
// (delta, direction, percent of goal, averages) computed HERE so the model
// never does arithmetic, and ready-made display strings for values a person
// reads with separators or units ("9,234", "7h 12m"), so the sheet shows them
// exactly as the app does.

import { civilDateToUtcMidnight } from '../../biometrics/civilDate';
import { prisma } from '../../db/client';
import { shiftDate } from '../../scoring/dates';
import { getSleepGoalMinutes } from '../../users/goals';
import { compareScores, Direction } from './dailyScore';

export const METRIC_KEYS = ['STEPS', 'RESTING_HR', 'HRV', 'SLEEP'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

// The same goal the app draws the steps ring and heat map against (mobile METRIC_CONFIG).
export const STEPS_GOAL = 10_000;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-metric rounding: counts and bpm are whole numbers, HRV keeps one decimal. */
export function roundMetric(metric: MetricKey, value: number): number {
  return metric === 'HRV' ? round1(value) : Math.round(value);
}

export function formatSteps(steps: number): string {
  return Math.round(steps).toLocaleString('en-US');
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function display(metric: MetricKey, value: number): string {
  switch (metric) {
    case 'STEPS':
      return `${formatSteps(value)} steps`;
    case 'RESTING_HR':
      return `${Math.round(value)} bpm`;
    case 'HRV':
      return `${round1(value)} ms`;
    case 'SLEEP':
      return formatDuration(value);
  }
}

const percentOf = (value: number, goal: number) => (goal > 0 ? Math.round((value / goal) * 100) : null);
const percentDisplay = (pct: number | null) => (pct === null ? null : `${pct}%`);

export interface MetricOfDay {
  value: number | null;
  display: string | null;
  deltaFromYesterday: number | null;
  direction: Direction | null;
  /** The change as one readable phrase ("2h 25m less than the day before"); null when there is nothing to compare. */
  changeDisplay: string | null;
}

/**
 * The day-over-day change as a phrase, so the model never has to combine a
 * signed delta with a direction word (which produced "-145 less").
 */
export function describeChange(metric: MetricKey, delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return 'the same as the day before';
  const size = Math.abs(delta);
  switch (metric) {
    case 'STEPS':
      return `${formatSteps(size)} ${delta > 0 ? 'more' : 'fewer'} steps than the day before`;
    case 'SLEEP':
      return `${formatDuration(size)} ${delta > 0 ? 'more' : 'less'} than the night before`;
    case 'RESTING_HR':
      return `${Math.round(size)} bpm ${delta > 0 ? 'higher' : 'lower'} than the day before`;
    case 'HRV':
      return `${round1(size)} ms ${delta > 0 ? 'higher' : 'lower'} than the day before`;
  }
}

export interface DailyMetricsToolResult {
  date: string;
  steps: MetricOfDay & { goal: number; percentOfGoal: number | null; percentOfGoalDisplay: string | null; goalMet: boolean | null };
  restingHeartRate: MetricOfDay;
  hrv: MetricOfDay;
  sleep: MetricOfDay & { goalMinutes: number; goalDisplay: string; percentOfGoal: number | null; percentOfGoalDisplay: string | null };
}

async function valuesOn(userId: string, date: string): Promise<Partial<Record<MetricKey, number>>> {
  const rows = await prisma.biometricRecord.findMany({
    where: { userId, recordedAt: civilDateToUtcMidnight(date) },
    select: { metricType: true, value: true },
  });
  const out: Partial<Record<MetricKey, number>> = {};
  for (const r of rows) out[r.metricType as MetricKey] = r.value;
  return out;
}

function metricOfDay(metric: MetricKey, today: number | undefined, yesterday: number | undefined): MetricOfDay {
  const t = today === undefined ? null : roundMetric(metric, today);
  const y = yesterday === undefined ? null : roundMetric(metric, yesterday);
  const { delta, direction } = compareScores(t, y);
  const rounded = delta === null ? null : roundMetric(metric, delta);
  return {
    value: t,
    display: t === null ? null : display(metric, t),
    deltaFromYesterday: rounded,
    direction,
    changeDisplay: describeChange(metric, rounded),
  };
}

/** One day's raw metrics (null when not recorded), each compared with the day before. */
export async function getDailyMetrics(userId: string, date: string): Promise<DailyMetricsToolResult> {
  const [today, yesterday, sleepGoalMinutes] = await Promise.all([
    valuesOn(userId, date),
    valuesOn(userId, shiftDate(date, -1)),
    getSleepGoalMinutes(userId),
  ]);
  const steps = metricOfDay('STEPS', today.STEPS, yesterday.STEPS);
  const sleep = metricOfDay('SLEEP', today.SLEEP, yesterday.SLEEP);
  const stepsPct = steps.value === null ? null : percentOf(steps.value, STEPS_GOAL);
  const sleepPct = sleep.value === null ? null : percentOf(sleep.value, sleepGoalMinutes);
  return {
    date,
    steps: {
      ...steps,
      goal: STEPS_GOAL,
      percentOfGoal: stepsPct,
      percentOfGoalDisplay: percentDisplay(stepsPct),
      goalMet: steps.value === null ? null : steps.value >= STEPS_GOAL,
    },
    restingHeartRate: metricOfDay('RESTING_HR', today.RESTING_HR, yesterday.RESTING_HR),
    hrv: metricOfDay('HRV', today.HRV, yesterday.HRV),
    sleep: {
      ...sleep,
      goalMinutes: sleepGoalMinutes,
      goalDisplay: formatDuration(sleepGoalMinutes),
      percentOfGoal: sleepPct,
      percentOfGoalDisplay: percentDisplay(sleepPct),
    },
  };
}

export interface HistoryPoint {
  date: string;
  /** "Sep 21": a date a person reads, and one the digit scan accepts inside a reference. */
  dateLabel: string;
  value: number;
  display: string;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateLabel(date: string): string {
  return `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

export function describeTrend(trend: MetricHistoryToolResult['trend'], pct: number | null): string | null {
  if (trend === null || pct === null) return null;
  if (trend === 'steady') return 'steady';
  return `${trend} ${Math.abs(pct)}%`;
}

export interface MetricHistoryToolResult {
  metric: MetricKey;
  days: number;
  daysWithData: number;
  points: HistoryPoint[];
  average: number | null;
  averageDisplay: string | null;
  highest: HistoryPoint | null;
  lowest: HistoryPoint | null;
  earliest: HistoryPoint | null;
  latest: HistoryPoint | null;
  /** Second-half average vs first-half average of the window; null with fewer than two readings. */
  trend: 'up' | 'down' | 'steady' | null;
  trendPercent: number | null;
  /** The trend as a phrase without a sign ("down 8%", "steady"), so the model never writes "down by -8%". */
  trendDisplay: string | null;
  /** "4 of 7": days with a reading out of the days asked about (the model adds "days"). */
  coverageDisplay: string;
  /** STEPS only: days at or above the step goal, and the same as "4 of 30". */
  daysAtGoal?: number;
  daysAtGoalDisplay?: string;
}

// Within this many percent the halves are "steady", the same band the app's own insights use.
const STEADY_PERCENT = 3;

/**
 * Compares the average of the second half of the readings with the first
 * half, so one noisy day at either end cannot flip the answer. The model gets
 * this as a field instead of eyeballing the points (the spike found models
 * claiming trends the data did not support).
 */
export function computeTrend(values: number[]): { trend: MetricHistoryToolResult['trend']; trendPercent: number | null } {
  if (values.length < 2) return { trend: null, trendPercent: null };
  const mid = Math.floor(values.length / 2);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const first = mean(values.slice(0, mid));
  const second = mean(values.slice(values.length - mid));
  if (first === 0) return { trend: null, trendPercent: null };
  const pct = Math.round(((second - first) / Math.abs(first)) * 100);
  return { trend: Math.abs(pct) < STEADY_PERCENT ? 'steady' : pct > 0 ? 'up' : 'down', trendPercent: pct };
}

/**
 * The last N days (ending today) of one metric, oldest first, with precomputed summary values.
 * A 0 sleep, HRV or resting HR reading means "not recorded" and is skipped, so it never drags the
 * usual, the trend or the week's shortest night down; a 0-step day is a real day and counts.
 */
export async function getMetricHistory(userId: string, metric: MetricKey, days: number, today: string): Promise<MetricHistoryToolResult> {
  const rows = await prisma.biometricRecord.findMany({
    where: {
      userId,
      metricType: metric,
      recordedAt: { gte: civilDateToUtcMidnight(shiftDate(today, -(days - 1))), lte: civilDateToUtcMidnight(today) },
      ...(metric === 'STEPS' ? {} : { value: { gt: 0 } }),
    },
    orderBy: { recordedAt: 'asc' },
    select: { recordedAt: true, value: true },
  });
  const points = rows.map((r) => {
    const value = roundMetric(metric, r.value);
    const date = r.recordedAt.toISOString().slice(0, 10);
    return { date, dateLabel: dateLabel(date), value, display: display(metric, value) };
  });
  const values = points.map((p) => p.value);
  const avg = values.length ? roundMetric(metric, values.reduce((a, b) => a + b, 0) / values.length) : null;
  const pick = (better: (a: number, b: number) => boolean) =>
    points.length ? points.reduce((best, p) => (better(p.value, best.value) ? p : best)) : null;
  const trend = computeTrend(values);
  const result: MetricHistoryToolResult = {
    metric,
    days,
    daysWithData: points.length,
    points,
    average: avg,
    averageDisplay: avg === null ? null : display(metric, avg),
    highest: pick((a, b) => a > b),
    lowest: pick((a, b) => a < b),
    earliest: points[0] ?? null,
    latest: points[points.length - 1] ?? null,
    ...trend,
    trendDisplay: describeTrend(trend.trend, trend.trendPercent),
    coverageDisplay: `${points.length} of ${days}`,
  };
  if (metric === 'STEPS') {
    result.daysAtGoal = values.filter((v) => v >= STEPS_GOAL).length;
    result.daysAtGoalDisplay = `${result.daysAtGoal} of ${days}`;
  }
  return result;
}
