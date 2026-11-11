// Forecast band and track-record summary from backtest errors (actual - forecast). Pure.
import { BAND_MAD_MULTIPLIER, FALLBACK_HALF_WIDTH, MAD_TO_SIGMA, MIN_BAND_PAIRS } from './config';
import type { TrackPoint } from './types';

const clamp100 = (v: number) => Math.min(100, Math.max(0, v));
const sortAsc = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function bandFor(score: number, errors: number[]): [number, number] {
  if (errors.length >= MIN_BAND_PAIRS) {
    const s = sortAsc(errors);
    return [clamp100(score + quantile(s, 0.1)), clamp100(score + quantile(s, 0.9))];
  }
  let half = FALLBACK_HALF_WIDTH;
  if (errors.length >= 3) {
    const med = quantile(sortAsc(errors), 0.5);
    const mad = quantile(sortAsc(errors.map((e) => Math.abs(e - med))), 0.5);
    half = BAND_MAD_MULTIPLIER * mad * MAD_TO_SIGMA;
  }
  return [clamp100(score - half), clamp100(score + half)];
}

export function errorSummary(points: TrackPoint[]): { withinPoints: number; hits: number; days: number } {
  if (points.length === 0) return { withinPoints: 0, hits: 0, days: 0 };
  const abs = points.map((p) => Math.abs(p.actual - p.forecast));
  const withinPoints = Math.ceil(quantile(sortAsc(abs), 0.5));
  return { withinPoints, hits: abs.filter((a) => a <= withinPoints).length, days: points.length };
}
