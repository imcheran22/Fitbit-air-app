// Forecast constants (spec 2026-09-28-recovery-forecast-design.md). Fixed, not
// fitted per user, for the same reason as habits/config.ts.
import type { HabitTypeConfig } from '../habits/config';

/** Carry-over prior and shrinkage: phi = w * slope + (1 - w) * PHI_PRIOR, w = n / (n + PHI_SHRINK_N). */
export const PHI_PRIOR = 0.5;
export const PHI_SHRINK_N = 30;
export const PHI_MIN = 0;
export const PHI_MAX = 0.9;

/** Scored days required before any forecast is shown. */
export const MIN_HISTORY_DAYS = 21;

/** Rolling-origin backtest length, and the pair count below which the band falls back to MAD. */
export const TRACK_DAYS = 30;
export const MIN_BAND_PAIRS = 10;
export const BAND_MAD_MULTIPLIER = 1.5;
/** MAD to sigma, as in the scoring config. */
export const MAD_TO_SIGMA = 1.4826;
/** Half-width used when there are too few errors (< 3) to estimate any spread. */
export const FALLBACK_HALF_WIDTH = 10;

export const SLEEP_MIN_HOURS = 4;
export const SLEEP_MAX_HOURS = 10;
export const SLEEP_STEP_HOURS = 0.5;
export const DEFAULT_SLEEP_HOURS = 7.5;
export const DEFAULT_SLEEP_WINDOW_DAYS = 14;

/** Habits beyond this many (ranked by |effect|) are reported NOT_MODELLED to bound the grid. */
export const MAX_GRID_HABITS = 4;

const LEVER_RANGES: Record<string, { max: number; step: number }> = {
  ALCOHOL: { max: 6, step: 1 },
  CAFFEINE: { max: 6, step: 1 },
  WORKOUT: { max: 120, step: 10 },
};

/** Slider range for a habit lever. Custom types get 0..max(3x threshold, 5). */
export function leverRange(t: HabitTypeConfig): { min: number; max: number; step: number } {
  const known = LEVER_RANGES[t.type];
  if (known) return { min: 0, ...known };
  return { min: 0, max: Math.max(t.exposureThreshold * 3, 5), step: t.exposureThreshold >= 10 ? 5 : 1 };
}
