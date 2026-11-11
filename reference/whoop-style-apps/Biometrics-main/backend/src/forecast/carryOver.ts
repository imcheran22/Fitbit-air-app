// Per-user AR(1) carry-over of a factor's z-score, shrunk toward a population
// prior so a short history cannot produce an extreme phi. Pure.
import { ANALYSIS_WINDOW_DAYS } from '../habits/config';
import type { FactorSeries } from '../habits/engine';
import { shiftDate } from '../scoring/dates';
import { PHI_MAX, PHI_MIN, PHI_PRIOR, PHI_SHRINK_N } from './config';

export function shrinkAndClamp(slope: number, n: number): number {
  const w = n / (n + PHI_SHRINK_N);
  return Math.min(PHI_MAX, Math.max(PHI_MIN, w * slope + (1 - w) * PHI_PRIOR));
}

/**
 * OLS slope of z(d+1) on z(d) over consecutive non-imputed pairs whose later
 * day is within (through - ANALYSIS_WINDOW_DAYS, through].
 */
export function fitCarryOver(series: FactorSeries, through: string): number {
  const from = shiftDate(through, -ANALYSIS_WINDOW_DAYS);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, day] of series) {
    const next = shiftDate(date, 1);
    if (date < from || next > through) continue;
    const n = series.get(next);
    if (day.z === null || day.imputed || !n || n.z === null || n.imputed) continue;
    xs.push(day.z);
    ys.push(n.z);
  }
  const n = xs.length;
  if (n < 2) return PHI_PRIOR;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (sxx === 0) return PHI_PRIOR;
  return shrinkAndClamp(sxy / sxx, n);
}
