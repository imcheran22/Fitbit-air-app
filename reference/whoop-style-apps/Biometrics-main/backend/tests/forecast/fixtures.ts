import type { FactorSeries } from '../../src/habits/engine';
import type { ObservedDay } from '../../src/habits/observed';
import { BUILT_IN_HABIT_TYPES } from '../../src/habits/config';
import { getLiveConfig } from '../../src/scoring/configs';
import { dateRange, shiftDate } from '../../src/scoring/dates';
import type { ForecastData, ForecastFactor } from '../../src/forecast/types';
import { gaussian, seededRandom } from '../habits/helpers';

export const TODAY = '2026-06-30';

/** A factor series ending on `end`; `imputed` holds indexes into `values`. */
export function series(
  values: Array<number | null>,
  end = TODAY,
  imputed: ReadonlySet<number> = new Set(),
): Map<string, { z: number | null; imputed: boolean; pct: number | null }> {
  const start = shiftDate(end, -(values.length - 1));
  return new Map(values.map((z, i) => [shiftDate(start, i), { z, imputed: imputed.has(i), pct: null }]));
}

/** 60 days of AR(1) z-scores, ~7 h nights and HIGH-confidence scores ending on TODAY. */
export function makeData(over: Partial<ForecastData> = {}, days = 60, seed = 1): ForecastData {
  const rand = seededRandom(seed);
  const dates = dateRange(shiftDate(TODAY, -(days - 1)), TODAY);
  const hrv: number[] = [];
  const rhr: number[] = [];
  let h = 0;
  let r = 0;
  for (let i = 0; i < dates.length; i++) {
    h = 0.6 * h + 0.8 * gaussian(rand);
    r = 0.6 * r + 0.8 * gaussian(rand);
    hrv.push(h);
    rhr.push(r);
  }
  const sleep = dates.map((date) => ({ date, value: 420 + 40 * gaussian(rand) }));
  const scores = new Map(
    dates.map((date, i) => [date, { score: 50 + 8 * hrv[i]! - 6 * rhr[i]!, confidence: 'HIGH' as const }]),
  );
  return {
    today: TODAY,
    cfg: getLiveConfig(),
    sleepGoalMinutes: 480,
    sleep,
    factors: { HRV: series(hrv), RHR: series(rhr) },
    scores,
    habitTypes: [...BUILT_IN_HABIT_TYPES],
    observations: new Map(),
    confirmed: [],
    todayHabitTotals: {},
    ...over,
  };
}

/**
 * Plants a lag-1 effect: `habit` is exposed every `every`-th day (observed
 * every day), and the next day's `factor` z is shifted by `delta`. Adds the
 * CONFIRMED row.
 */
export function plant(data: ForecastData, habit: string, factor: ForecastFactor, delta: number, every = 4): ForecastData {
  const dates = [...data.factors[factor].keys()].sort();
  const shifted = new Map(data.factors[factor]) as Map<string, { z: number | null; imputed: boolean; pct: number | null }>;
  const obs: ObservedDay[] = [];
  dates.forEach((day, i) => {
    const exposed = i % every === 0;
    obs.push({ day, exposed });
    const next = shiftDate(day, 1);
    const f = shifted.get(next);
    if (exposed && f && f.z !== null) shifted.set(next, { ...f, z: f.z + delta });
  });
  const observations = new Map(data.observations);
  observations.set(habit, obs);
  return {
    ...data,
    factors: { ...data.factors, [factor]: shifted as FactorSeries },
    observations,
    confirmed: [...data.confirmed, { habitType: habit, factor }],
  };
}
