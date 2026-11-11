// The habit <-> biometric correlation engine (spec section 2, steps 1-6 and the
// structured output). Pure: it takes already-loaded observed habit days and
// factor series and returns every hypothesis it tested plus the habits it
// declined to test. Persistence (steps 8-9) lives in job.ts / lifecycle.ts.

import { daysBetween, shiftDate } from '../scoring/dates';
import { CORRELATION_LAGS, FDR_Q, MIN_ABS_R, MIN_PAIRS_EACH } from './config';
import type { ObservedDay } from './observed';
import {
  benjaminiHochberg,
  correlationPValue,
  deseasonalize,
  effectiveSampleSize,
  seasonalParamsFor,
  lag1Autocorrelation,
  pearson,
} from './stats';

/**
 * The per-night z-score series the engine tests against. Deliberately NOT
 * sleepDebtRolling14d: a 14-day rolling sum smears one night's effect across
 * two weeks, so lags 1-3 cannot be told apart. The per-night sleepDurationZ is
 * the right series for lag testing.
 */
export type FactorKey = 'HRV' | 'RHR' | 'SLEEP_DURATION' | 'SLEEP_EFFICIENCY' | 'CIRCADIAN_CONSISTENCY';

export const CORRELATION_FACTORS: readonly FactorKey[] = [
  'HRV',
  'RHR',
  'SLEEP_DURATION',
  'SLEEP_EFFICIENCY',
  'CIRCADIAN_CONSISTENCY',
];

/** One civil date of one factor. */
export interface FactorDay {
  /** null while the metric is cold-starting. */
  z: number | null;
  /**
   * The value was filled in from the baseline (z ~ 0 by construction), not
   * observed. Such a day is dropped from pairing: keeping it would pull every
   * correlation toward zero.
   */
  imputed: boolean;
  /** That day's % deviation from its baseline, for effectSizePercent. null when not derivable. */
  pct: number | null;
}

export type FactorSeries = ReadonlyMap<string, FactorDay>;

export interface HabitObservations {
  habitType: string;
  observations: ObservedDay[];
}

export interface EngineInput {
  habits: HabitObservations[];
  factors: Partial<Record<FactorKey, FactorSeries>>;
}

export interface SparklineSeries {
  /** Habit days (the day the habit happened; the factor is read `lagDays` later). */
  days: string[];
  habit: number[];
  factor: (number | null)[];
}

export interface HypothesisResult {
  habitType: string;
  factor: FactorKey;
  lagDays: number;
  r: number;
  pValue: number;
  qValue: number;
  nEff: number;
  sampleSize: number;
  exposedPairs: number;
  unexposedPairs: number;
  effectSizePercent: number | null;
  comparisonPercent: number | null;
  direction: 'higher' | 'lower';
  series: SparklineSeries;
  /** Survives BH at q < FDR_Q AND |r| > MIN_ABS_R. */
  passes: boolean;
}

export interface NotEnoughData {
  habitType: string;
  exposedDays: number;
  unexposedDays: number;
  requiredEach: number;
}

export interface EngineOutput {
  /** Every hypothesis that cleared the observation gate and was tested. */
  hypotheses: HypothesisResult[];
  /** Habits with no testable (factor, lag): reported with counts, never silently dropped. */
  notEnoughData: NotEnoughData[];
}

export interface Pair {
  day: string;
  factorDay: string;
  exposed: boolean;
  z: number;
  pct: number | null;
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const meanOf = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((s, v) => s + v, 0) / xs.length);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pairs each observed habit day H with the factor on civil date H + lag,
 * keeping only pairs whose factor value is a real observation. A habit day
 * that is unobserved never reaches here (buildObservedDays excludes it), so
 * it can never be counted as a non-exposure.
 */
export function pairUp(observations: ObservedDay[], series: FactorSeries, lag: number): Pair[] {
  const pairs: Pair[] = [];
  for (const { day, exposed } of observations) {
    const factorDay = shiftDate(day, lag);
    const f = series.get(factorDay);
    if (!f || f.z === null || f.imputed) continue;
    pairs.push({ day, factorDay, exposed, z: f.z, pct: f.pct });
  }
  return pairs;
}

function sparkline(observations: ObservedDay[], series: FactorSeries, lag: number): SparklineSeries {
  const out: SparklineSeries = { days: [], habit: [], factor: [] };
  for (const { day, exposed } of observations) {
    const f = series.get(shiftDate(day, lag));
    out.days.push(day);
    out.habit.push(exposed ? 1 : 0);
    out.factor.push(f && f.z !== null && !f.imputed ? round2(f.z) : null);
  }
  return out;
}

const meanPct = (pairs: Pair[]) => meanOf(pairs.flatMap((p) => (p.pct === null ? [] : [p.pct])));

function testPairs(pairs: Pair[]): { r: number; pValue: number; nEff: number } {
  // De-seasonalize each series by its OWN weekday. The factor lags the habit by
  // a fixed number of days, so its weekday is the habit's weekday shifted, and
  // both weekly rhythms are removed before anything else is computed.
  const x = deseasonalize(
    pairs.map((p) => (p.exposed ? 1 : 0)),
    pairs.map((p) => weekdayOf(p.day)),
  );
  const y = deseasonalize(
    pairs.map((p) => p.z),
    pairs.map((p) => weekdayOf(p.factorDay)),
  );
  const first = pairs[0]!.day;
  const dayNumbers = pairs.map((p) => daysBetween(first, p.day));

  const r = pearson(x, y);
  const nEff = effectiveSampleSize(pairs.length, lag1Autocorrelation(x, dayNumbers), lag1Autocorrelation(y, dayNumbers));
  // The weekday means removed above were fitted from these same pairs, so they
  // cost degrees of freedom; charging nothing for them understates the p-value.
  const seasonalParams = seasonalParamsFor(pairs.map((p) => weekdayOf(p.day)));
  return { r, pValue: correlationPValue(r, nEff, seasonalParams), nEff };
}

interface PairCounts {
  exposed: number;
  unexposed: number;
}

/** Keeps the (factor, lag) with the largest min(exposed, unexposed), ties broken by total pairs. */
function keepBest(best: PairCounts, exposed: number, unexposed: number): void {
  const fewer = Math.min(exposed, unexposed);
  const bestFewer = Math.min(best.exposed, best.unexposed);
  if (fewer > bestFewer || (fewer === bestFewer && exposed + unexposed > best.exposed + best.unexposed)) {
    best.exposed = exposed;
    best.unexposed = unexposed;
  }
}

const passesObservationGate = (exposed: number, unexposed: number) => exposed >= MIN_PAIRS_EACH && unexposed >= MIN_PAIRS_EACH;

/**
 * The min-observation gate on its own: for each habit, the observed exposed /
 * unexposed pair counts at the best (factor, lag), and whether ANY (factor, lag)
 * clears the gate. Runs no correlation, p-value or BH step. analyzeHabits'
 * notEnoughData is exactly this, so the two can never disagree.
 */
export function computeNotEnoughData(input: EngineInput): NotEnoughData[] {
  const out: NotEnoughData[] = [];
  for (const { habitType, observations } of input.habits) {
    const best: PairCounts = { exposed: 0, unexposed: 0 };
    let testable = false;
    for (const factor of CORRELATION_FACTORS) {
      const series = input.factors[factor];
      if (!series) continue;
      for (const lag of CORRELATION_LAGS) {
        let exposed = 0;
        let unexposed = 0;
        for (const p of pairUp(observations, series, lag)) p.exposed ? exposed++ : unexposed++;
        keepBest(best, exposed, unexposed);
        if (passesObservationGate(exposed, unexposed)) testable = true;
      }
    }
    if (!testable) out.push({ habitType, exposedDays: best.exposed, unexposedDays: best.unexposed, requiredEach: MIN_PAIRS_EACH });
  }
  return out;
}

export function analyzeHabits(input: EngineInput): EngineOutput {
  interface Pending extends Omit<HypothesisResult, 'qValue' | 'passes'> {}
  const tested: Pending[] = [];
  // Best (largest min side) pair counts seen per habit, for the "3 of 8" message.
  const bestCounts = new Map<string, { exposed: number; unexposed: number }>();
  const testable = new Set<string>();

  for (const { habitType, observations } of input.habits) {
    bestCounts.set(habitType, { exposed: 0, unexposed: 0 });
    for (const factor of CORRELATION_FACTORS) {
      const series = input.factors[factor];
      if (!series) continue;
      for (const lag of CORRELATION_LAGS) {
        const pairs = pairUp(observations, series, lag);
        const exposedPairs = pairs.filter((p) => p.exposed);
        const unexposedPairs = pairs.filter((p) => !p.exposed);

        keepBest(bestCounts.get(habitType)!, exposedPairs.length, unexposedPairs.length);

        // Minimum-observation gate: the autocorrelation estimate and the t
        // approximation are both unreliable on tiny samples, and a comparison
        // with almost no unexposed days is not a comparison.
        if (!passesObservationGate(exposedPairs.length, unexposedPairs.length)) continue;

        const { r, pValue, nEff } = testPairs(pairs);
        const effect = round1(meanPct(exposedPairs));
        const comparison = round1(meanPct(unexposedPairs));
        testable.add(habitType);
        tested.push({
          habitType,
          factor,
          lagDays: lag,
          r,
          pValue,
          nEff,
          sampleSize: pairs.length,
          exposedPairs: exposedPairs.length,
          unexposedPairs: unexposedPairs.length,
          effectSizePercent: effect,
          comparisonPercent: comparison,
          direction: effect !== null && comparison !== null && effect < comparison ? 'lower' : 'higher',
          series: sparkline(observations, series, lag),
        });
      }
    }
  }

  // One BH correction across the WHOLE run: the family is every (habit, factor,
  // lag) actually tested, not each habit separately.
  const q = benjaminiHochberg(tested.map((t) => t.pValue));
  const hypotheses: HypothesisResult[] = tested.map((t, i) => ({
    ...t,
    qValue: q[i]!,
    passes: q[i]! < FDR_Q && Math.abs(t.r) > MIN_ABS_R && t.effectSizePercent !== null && t.comparisonPercent !== null,
  }));

  const notEnoughData: NotEnoughData[] = [];
  for (const { habitType } of input.habits) {
    if (testable.has(habitType)) continue;
    const c = bestCounts.get(habitType)!;
    notEnoughData.push({ habitType, exposedDays: c.exposed, unexposedDays: c.unexposed, requiredEach: MIN_PAIRS_EACH });
  }
  return { hypotheses, notEnoughData };
}
