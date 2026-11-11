// Loads one user's habit logs, check-ins and factor series from the database
// and hands them to the pure engine. Kept apart from engine.ts so the engine
// stays free of I/O and the statistics are testable without a database.

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';
import { ANALYSIS_WINDOW_DAYS, HabitTypeConfig } from './config';
import {
  analyzeHabits,
  computeNotEnoughData as computeEngineNotEnoughData,
  EngineInput,
  EngineOutput,
  FactorDay,
  FactorKey,
  NotEnoughData,
} from './engine';
import { habitDayFor } from './habitDay';
import { listHabitTypes } from './habitTypes';
import { buildObservedDays } from './observed';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** % deviation of `raw` from its baseline centre; null when either is missing or the baseline is ~0. */
function pctFromBaseline(raw: number | null | undefined, ewma: number | null | undefined): number | null {
  if (raw === null || raw === undefined || ewma === null || ewma === undefined || Math.abs(ewma) < 1e-9) return null;
  return ((raw - ewma) / Math.abs(ewma)) * 100;
}

/**
 * The correlation series for [from, through], per factor, keyed by civil date.
 * Sources are UserDailyFeatures' per-night z columns and their imputed flags.
 * (sleepDebtRolling14d is never read here: see FactorKey in engine.ts.)
 */
export async function loadFactorSeries(
  userId: string,
  from: string,
  through: string,
  /** Only z and imputed are needed (pair counting): skips the queries that exist solely to derive `pct`. */
  opts: { countsOnly?: boolean } = {},
): Promise<Partial<Record<FactorKey, Map<string, FactorDay>>>> {
  const range = { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(through) };
  const withPct = !opts.countsOnly;
  const [features, snapshots, sleep] = await Promise.all([
    prisma.userDailyFeatures.findMany({
      where: { userId, date: range },
      select: {
        date: true,
        hrvZ: true,
        hrvZImputed: true,
        rhrZ: true,
        rhrZImputed: true,
        sleepDurationZ: true,
        sleepDurationZImputed: true,
        sleepEfficiencyZ: true,
        sleepEfficiencyZImputed: true,
        circadianConsistencyZ: true,
        circadianConsistencyZImputed: true,
        hrvBaselineDeviationPct: true,
        rhrBaselineDeviationPct: true,
        sleepEfficiency: true,
        circadianConsistencyScore: true,
      },
    }),
    withPct
      ? prisma.baselineSnapshot.findMany({
          where: { userId, date: range, metric: { in: ['SLEEP', 'SLEEP_EFFICIENCY', 'CIRCADIAN_CONSISTENCY'] } },
          select: { date: true, metric: true, ewma: true },
        })
      : Promise.resolve([]),
    withPct
      ? prisma.biometricRecord.findMany({
          where: { userId, metricType: 'SLEEP', recordedAt: range },
          select: { recordedAt: true, value: true },
        })
      : Promise.resolve([]),
  ]);

  const ewma = new Map(snapshots.map((s) => [`${s.metric}|${isoDay(s.date)}`, s.ewma]));
  const sleepMinutes = new Map(sleep.map((s) => [isoDay(s.recordedAt), s.value]));

  const series: Record<FactorKey, Map<string, FactorDay>> = {
    HRV: new Map(),
    RHR: new Map(),
    SLEEP_DURATION: new Map(),
    SLEEP_EFFICIENCY: new Map(),
    CIRCADIAN_CONSISTENCY: new Map(),
  };
  for (const f of features) {
    const d = isoDay(f.date);
    series.HRV.set(d, { z: f.hrvZ, imputed: f.hrvZImputed, pct: f.hrvBaselineDeviationPct });
    series.RHR.set(d, { z: f.rhrZ, imputed: f.rhrZImputed, pct: f.rhrBaselineDeviationPct });
    // The sleep factors have no stored deviation column: derive it from that
    // day's raw value against that day's baseline EWMA.
    series.SLEEP_DURATION.set(d, {
      z: f.sleepDurationZ,
      imputed: f.sleepDurationZImputed,
      pct: pctFromBaseline(sleepMinutes.get(d), ewma.get(`SLEEP|${d}`)),
    });
    series.SLEEP_EFFICIENCY.set(d, {
      z: f.sleepEfficiencyZ,
      imputed: f.sleepEfficiencyZImputed,
      pct: pctFromBaseline(f.sleepEfficiency, ewma.get(`SLEEP_EFFICIENCY|${d}`)),
    });
    series.CIRCADIAN_CONSISTENCY.set(d, {
      z: f.circadianConsistencyZ,
      imputed: f.circadianConsistencyZImputed,
      pct: pctFromBaseline(f.circadianConsistencyScore, ewma.get(`CIRCADIAN_CONSISTENCY|${d}`)),
    });
  }
  return series;
}

export interface UserAnalysisInput {
  input: EngineInput;
  types: HabitTypeConfig[];
  today: string;
}

/** Everything the engine needs for one user, over the trailing ANALYSIS_WINDOW_DAYS habit days. */
export async function loadAnalysisInput(
  userId: string,
  now: Date,
  opts: { countsOnly?: boolean } = {},
): Promise<UserAnalysisInput> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const today = habitDayFor(now, user?.timezone ?? 'UTC');
  const from = shiftDate(today, -ANALYSIS_WINDOW_DAYS);
  const fromDate = civilDateToUtcMidnight(from);

  const [types, logs, checkIns] = await Promise.all([
    listHabitTypes(userId),
    prisma.habitLog.findMany({
      where: { userId, habitDay: { gte: fromDate } },
      select: { habitType: true, value: true, habitDay: true },
    }),
    prisma.habitCheckIn.findMany({ where: { userId, habitDay: { gte: fromDate } }, select: { habitDay: true } }),
  ]);

  const observed = buildObservedDays(
    logs.map((l) => ({ habitType: l.habitType, value: l.value, habitDay: isoDay(l.habitDay) })),
    checkIns.map((c) => isoDay(c.habitDay)),
    // A custom type is only observable from the day it was created, in the
    // user's own zone; before that its "unexposed" days are invented.
    types.map((t) => ({
      type: t.type,
      exposureThreshold: t.exposureThreshold,
      ...(t.createdAt ? { observedFrom: habitDayFor(t.createdAt, user?.timezone ?? 'UTC') } : {}),
    })),
  );
  const habits = types
    .map((t) => ({ habitType: t.type, observations: observed.get(t.type) ?? [] }))
    .filter((h) => h.observations.length > 0);

  // A habit on day H reaches at most H + 3, so the series must extend that far past today.
  const factors = await loadFactorSeries(userId, shiftDate(from, 1), shiftDate(today, 3), opts);
  return { input: { habits, factors }, types, today };
}

/**
 * The live "N of 8 needed" counts, WITHOUT running the statistics: no
 * correlation, p-value or BH step, and none of the queries that only feed effect
 * sizes. Identical to analyzeUser(...).notEnoughData by construction (both go
 * through the engine's pair-counting gate). Deliberately live, not read from a
 * stored weekly run, so the count moves as soon as the user logs "nothing today".
 */
export async function computeNotEnoughData(userId: string, now: Date): Promise<NotEnoughData[]> {
  const { input } = await loadAnalysisInput(userId, now, { countsOnly: true });
  return computeEngineNotEnoughData(input);
}

export async function analyzeUser(userId: string, now: Date): Promise<EngineOutput & { types: HabitTypeConfig[] }> {
  const { input, types } = await loadAnalysisInput(userId, now);
  return { ...analyzeHabits(input), types };
}
