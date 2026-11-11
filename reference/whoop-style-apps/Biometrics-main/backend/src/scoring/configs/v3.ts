import type { ScoreConfig } from './v1';
import { v2Config } from './v2';

/**
 * Scoring algorithm v3: v2 (same weights, k, thresholds, bands, windows: it is
 * spread from v2, so they cannot drift apart) plus two guards against unbounded
 * z-scores from near-constant metrics. v1 and v2 are untouched and stay
 * importable for the backtest and its tests.
 *
 * The problem, measured on a real account: bedtime consistency (baseline ewma
 * ~45.6, spread ~3) produced z = -6.1, i.e. -25.9 points on a 0.20 weight, and
 * sleep efficiency (values 0.90-0.99, spread floored at 2% of the mean = 0.02)
 * produced z = -3.6 from a single normal 0.90 night, which alone dragged that
 * night's Sleep Score to 17. While consistency is cold-start-excluded the
 * efficiency weight is renormalised up (0.30 -> 0.375), which amplifies it
 * further. Nothing bounded a single factor.
 *
 * The two guards:
 *  1. zClamp [-3, +3] on EVERY factor's z (Recovery and Sleep) before weighting,
 *     so no one factor can move a score by more than 3 sigma's worth. The
 *     Sleep duration factor keeps its own tighter [-3, +1] clamp, never widened.
 *  2. Per-metric spread floors in the metric's own units for the two
 *     near-constant Sleep Score inputs: 0.05 (5 percentage points) for sleep
 *     efficiency and 10 points for bedtime consistency. The existing relative
 *     floor (2% of |ewma|) stays; the effective spread is the max of all floors.
 *
 * Both values are a PRODUCT DECISION, not derived from outcome data (there is
 * no ground-truth "sleep quality" or "recovery" label to fit them to): +/-3 is
 * the conventional "this is an outlier" bound, and the floors are the smallest
 * day-to-day differences in each metric we are willing to call a real change.
 */
export const v3Config: ScoreConfig = {
  ...v2Config,
  version: 'v3',
  zClamp: { min: -3, max: 3 },
  spreadFloors: { SLEEP_EFFICIENCY: 0.05, CIRCADIAN_CONSISTENCY: 10 },
};
