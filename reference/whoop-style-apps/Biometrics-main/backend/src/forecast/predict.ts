// Tomorrow's Recovery Score from predicted factor z-scores, scored by the
// unchanged computeComposite. Contributions are sequential score deltas in a
// fixed order (carry-over, sleep, habits), so they sum to score - 50. Pure.
import { computeComposite } from '../scoring/composite';
import { shiftDate } from '../scoring/dates';
import { NEUTRAL_SCORE } from '../scoring/explain';
import type { FactorInput, RecoveryFactorKey } from '../scoring/types';
import { fitCarryOver } from './carryOver';
import { habitEffect } from './habitEffects';
import { sleepDebtZ } from './sleepLever';
import { FORECAST_FACTORS, type Contribution, type ForecastData, type ForecastFactor, type Lever, type Model, type Prediction } from './types';

/** phi per factor and, for each listed habit, its delta for every CONFIRMED factor with computable pairs. */
export function fitModel(data: ForecastData, through: string, habits: readonly string[]): Model {
  const phi = {
    HRV: fitCarryOver(data.factors.HRV, through),
    RHR: fitCarryOver(data.factors.RHR, through),
  };
  const effects: Model['effects'] = new Map();
  for (const habit of habits) {
    const obs = data.observations.get(habit) ?? [];
    const e: Partial<Record<ForecastFactor, number>> = {};
    for (const row of data.confirmed) {
      if (row.habitType !== habit) continue;
      const delta = habitEffect(obs, data.factors[row.factor], through);
      if (delta !== null) e[row.factor] = delta;
    }
    if (Object.keys(e).length > 0) effects.set(habit, e);
  }
  return { phi, effects };
}

export function predictDay(data: ForecastData, model: Model, target: string, lever: Lever): Prediction | null {
  const origin = shiftDate(target, -1);
  const today: Record<ForecastFactor, number | null> = {
    HRV: data.factors.HRV.get(origin)?.z ?? null,
    RHR: data.factors.RHR.get(origin)?.z ?? null,
  };
  const debtZ = sleepDebtZ(data.sleep, target, lever.sleepMinutes, data.sleepGoalMinutes, data.cfg);

  // null = excluded for the whole prediction, so renormalisation is identical at every step.
  const z: Record<RecoveryFactorKey, number | null> = {
    HRV: today.HRV === null ? null : 0,
    RHR: today.RHR === null ? null : 0,
    SLEEP_DEBT: debtZ === null ? null : 0,
  };
  if (z.HRV === null && z.RHR === null && z.SLEEP_DEBT === null) return null;

  const score = () => {
    const inputs: FactorInput[] = (Object.keys(z) as RecoveryFactorKey[]).map((factor) => ({
      factor,
      z: z[factor],
      imputed: false,
      excluded: z[factor] === null,
    }));
    return computeComposite(inputs, data.cfg).score ?? NEUTRAL_SCORE;
  };

  const contributions: Contribution[] = [];
  let prev = score(); // every present factor at z = 0 -> NEUTRAL_SCORE
  const step = (key: string) => {
    const next = score();
    contributions.push({ key, points: next - prev });
    prev = next;
  };

  for (const f of FORECAST_FACTORS) if (z[f] !== null) z[f] = model.phi[f] * today[f]!;
  step('CARRY_OVER');

  if (z.SLEEP_DEBT !== null) z.SLEEP_DEBT = debtZ!;
  step('SLEEP');

  for (const t of data.habitTypes) {
    if (!lever.exposed.has(t.type)) continue;
    const e = model.effects.get(t.type);
    if (!e) continue;
    for (const f of FORECAST_FACTORS) if (z[f] !== null && e[f] !== undefined) z[f] = z[f]! + e[f]!;
    step(t.type);
  }

  return { score: prev, contributions };
}
