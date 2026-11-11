// Lag-1 habit effect in z units, over the same pairs the habit engine tests
// (pairUp drops imputed and missing factor days). Pure.
import { ANALYSIS_WINDOW_DAYS } from '../habits/config';
import { pairUp, type FactorSeries } from '../habits/engine';
import type { ObservedDay } from '../habits/observed';
import { shiftDate } from '../scoring/dates';

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function habitEffect(observations: ObservedDay[], series: FactorSeries, through: string): number | null {
  const from = shiftDate(through, -ANALYSIS_WINDOW_DAYS);
  const visible = observations.filter((o) => o.day >= from && shiftDate(o.day, 1) <= through);
  const pairs = pairUp(visible, series, 1);
  const exposed = pairs.filter((p) => p.exposed).map((p) => p.z);
  const unexposed = pairs.filter((p) => !p.exposed).map((p) => p.z);
  if (exposed.length === 0 || unexposed.length === 0) return null;
  return mean(exposed) - mean(unexposed);
}
