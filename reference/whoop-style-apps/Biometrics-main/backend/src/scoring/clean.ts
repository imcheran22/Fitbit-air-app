// Stage 1 -- Cleaning. Pure: decides what the score computation skips and how a
// gap is filled. It never alters or deletes a stored record; the caller
// persists rejections as ScoreInputFlag rows.

import { mad, median } from './baseline';
import { shiftDate } from './dates';
import type { ScoreConfig } from './configs/v1';
import type { Baseline, DailyPoint, OutlierFlag } from './types';

/**
 * Rejects a value more than cfg.outlier.madMultiplier MAD from the median of the
 * trailing window of that metric.
 *
 * "MAD" is the spec's literal RAW median absolute deviation, not the
 * sigma-scaled 1.4826 x MAD used for z-scores in Stage 3. The raw form is the
 * stricter rule (5 raw MAD is ~3.4 sigma-scaled), which is what a screen for
 * sensor artifacts wants.
 *
 * The trailing window is built from the RAW prior points, rejected ones
 * included. Building it from accepted points only would lock the filter onto a
 * user's old level after a genuine shift (every new value rejected, the median
 * never moving); the median is robust enough to shrug off a few artifacts.
 *
 * RESTING_HR is Google's dedicated daily resting heart rate, which is steadier
 * than the old daily-minimum proxy, but this is still the only guard against a
 * single artifact reading, and a milder deviation inside 5 MAD passes through:
 * a stated limitation, not a solved problem.
 */
export function rejectOutliers(
  points: DailyPoint[],
  cfg: ScoreConfig,
): { kept: DailyPoint[]; outliers: OutlierFlag[] } {
  const { madMultiplier, windowDays, minHistory } = cfg.outlier;
  const kept: DailyPoint[] = [];
  const outliers: OutlierFlag[] = [];

  for (const point of points) {
    const from = shiftDate(point.date, -windowDays);
    const prior = points.filter((p) => p.date >= from && p.date < point.date).map((p) => p.value);

    if (prior.length < minHistory) {
      kept.push(point);
      continue;
    }
    const m = median(prior);
    const spread = mad(prior);
    // A flat history has MAD 0, which would flag every different value.
    if (spread > 0 && Math.abs(point.value - m) > madMultiplier * spread) {
      outliers.push({ date: point.date, value: point.value, median: m, mad: spread });
    } else {
      kept.push(point);
    }
  }
  return { kept, outliers };
}

/**
 * A missing (or rejected) day for a metric with a real trend is filled from that
 * metric's own Stage-3 EWMA -- the same baseline used for z-scoring, not a
 * separate imputation window that would be one more parameter to keep in sync.
 * The caller downgrades confidence for it: imputation buys score continuity, not
 * information. Null while the baseline is cold-starting.
 */
export function imputeFromBaseline(baseline: Baseline): { value: number; imputed: true } | null {
  if (baseline.coldStart) return null;
  return { value: baseline.ewma, imputed: true };
}
