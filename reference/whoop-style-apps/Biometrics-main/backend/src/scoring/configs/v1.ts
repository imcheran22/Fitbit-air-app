import type { BaselineMetric, RecoveryFactorKey, SleepFactorKey } from '../types';

/**
 * Scoring algorithm v1. Versioned configs are NEVER mutated in place: a change
 * of weights, k or thresholds is a new file (v2.ts) registered in ./index.ts,
 * so any stored DailyScore can be reproduced from its algorithmVersion and the
 * backtest tool can diff two versions.
 *
 * The weights are an illustrative starting point, not derived from outcome
 * data (there is no ground-truth "recovery" label to fit them to). The
 * backtest shows what a change DOES, not whether it is CORRECT.
 */
export interface ScoreBands {
  excellent: number;
  good: number;
  fair: number;
}

export interface ScoreConfig {
  version: string;
  /**
   * Lower bounds of the display bands shared by the Recovery and Sleep scores:
   * score >= excellent is "Excellent", >= good "Good", >= fair "Fair", else
   * "Poor". Strictly descending, within 0-100. A product starting point, not
   * derived from outcome data. The backend is the single source of truth (the
   * clients read these from the score endpoints), versioned with the algorithm
   * so a re-weighting and its band cut-offs ship together.
   */
  scoreBands: ScoreBands;
  /** Base weights; they sum to 1 and are renormalized per day around excluded factors. */
  weights: Record<RecoveryFactorKey, number>;
  /** +1: higher z helps recovery (HRV). -1: higher z hurts it (RHR, sleep debt). */
  direction: Record<RecoveryFactorKey, 1 | -1>;
  /**
   * Logistic steepness in score = 100 / (1 + e^(-k * sum(w*z))). ln(9)/2 puts
   * all-z-zero at 50 and a favorable +2 sigma at exactly 90, since
   * 1 / (1 + e^(-ln 9)) = 0.9.
   */
  k: number;
  /** EWMA span N: alpha = 2 / (N + 1). */
  ewmaN: number;
  /** Fewer clean observations than this and a metric is excluded (cold-start). */
  minHistoryDays: number;
  /** Days of prior history the baseline sees. */
  historyDays: number;
  /** Observations the rolling MAD (spread) is computed over. */
  spreadWindow: number;
  /** MAD -> sigma consistency constant for normally distributed data. */
  madToSigma: number;
  /**
   * Spread never goes below this fraction of |ewma| when z-scoring. A perfectly
   * flat series has MAD 0, which would make any deviation an infinite z and
   * pin the score to 0 or 100.
   */
  spreadFloorFraction: number;
  /**
   * Optional (v3+). Absolute per-metric spread floors, in the metric's OWN units
   * (a fraction for SLEEP_EFFICIENCY, points for CIRCADIAN_CONSISTENCY), for
   * near-constant metrics where a fraction of the mean is still far too small a
   * scale. The effective spread is the max of sigma-hat, spreadFloorFraction *
   * |ewma|, this floor (0 when the metric has none) and Number.EPSILON.
   */
  spreadFloors?: Partial<Record<BaselineMetric, number>>;
  /**
   * Optional (v3+). Every factor's z, Recovery and Sleep alike, is clamped to
   * [min, max] before weighting, so no single factor can dominate a score.
   * Duration's own (tighter) durationZClamp still applies first and is never
   * widened by this. Absent means no clamp (v1, v2).
   */
  zClamp?: { min: number; max: number };
  outlier: {
    /** Reject a value more than this many raw MADs from the trailing median. */
    madMultiplier: number;
    windowDays: number;
    /** Below this many prior points there is no meaningful median/MAD, so nothing is rejected. */
    minHistory: number;
  };
  sleepDebtWindowDays: number;
  /**
   * Sleep Score model (Slice 1.5). Same k, squashing, renormalization and
   * confidence rules as Recovery; only the factors differ.
   */
  sleepScore: {
    /**
     * ILLUSTRATIVE weights, not derived from outcome data: the spec fixes none
     * for the Sleep Score and there is no ground-truth "sleep quality" label to
     * fit them to. Like the Recovery weights, the backtest can show what
     * changing them does, not whether they are right.
     */
    weights: Record<SleepFactorKey, number>;
    /** Every Sleep Score factor is "higher is better". */
    direction: Record<SleepFactorKey, 1 | -1>;
    /**
     * Duration is scored against the user's sleep GOAL, not just their own
     * baseline: z = clamp((minutesAsleep - goal) / sigma-hat, min, max), with
     * sigma-hat from the SLEEP metric's Stage-3 baseline. The upper clamp is
     * +1 on purpose: sleeping past goal earns little extra credit (the z
     * saturates once you are one sigma over), while a short night is
     * penalized down to -3 sigma.
     */
    durationZClamp: { min: number; max: number };
  };
  /** Bedtime-consistency feature (Stage 2): stddev of the main session's noon-anchored onset. */
  circadian: {
    /** Trailing window (days, inclusive of the scored day) the stddev is taken over. */
    windowDays: number;
    /** The window needs at least this many nights or the stddev is not meaningful. */
    minWindowNights: number;
    /** No value until this many nights of history exist (the spec's 14-night cold start). */
    minHistoryNights: number;
    /** Onset stddev, in minutes, at which the 0-100 consistency score bottoms out at 0. */
    maxStdMinutes: number;
  };
  /** Steps-derived ACWR windows. Computed and stored, never part of the composite. */
  acwr: { acuteDays: number; chronicDays: number; minChronicObservations: number };
}

export const v1Config: ScoreConfig = {
  version: 'v1',
  // A product starting point, not derived from data (see ScoreConfig.scoreBands).
  scoreBands: { excellent: 75, good: 55, fair: 40 },
  weights: { HRV: 0.45, RHR: 0.35, SLEEP_DEBT: 0.2 },
  direction: { HRV: 1, RHR: -1, SLEEP_DEBT: -1 },
  k: Math.log(9) / 2,
  ewmaN: 30,
  minHistoryDays: 14,
  historyDays: 90,
  spreadWindow: 30,
  madToSigma: 1.4826,
  spreadFloorFraction: 0.02,
  outlier: { madMultiplier: 5, windowDays: 90, minHistory: 14 },
  sleepDebtWindowDays: 14,
  sleepScore: {
    // Illustrative, not derived (see ScoreConfig.sleepScore.weights).
    weights: { SLEEP_DURATION: 0.45, SLEEP_EFFICIENCY: 0.35, CIRCADIAN_CONSISTENCY: 0.2 },
    direction: { SLEEP_DURATION: 1, SLEEP_EFFICIENCY: 1, CIRCADIAN_CONSISTENCY: 1 },
    durationZClamp: { min: -3, max: 1 },
  },
  circadian: { windowDays: 14, minWindowNights: 7, minHistoryNights: 14, maxStdMinutes: 120 },
  acwr: { acuteDays: 7, chronicDays: 28, minChronicObservations: 14 },
};
