import type { ScoreConfig } from './v1';
import { v1Config } from './v1';

/**
 * Scoring algorithm v2: v1 with ONLY the Sleep Score weights changed. Recovery
 * weights, k, thresholds, windows and bands are exactly v1's (spread from it, so
 * they cannot drift apart). v1 itself is untouched and stays importable for the
 * backtest and its tests.
 *
 * The new weights (duration 0.50 / efficiency 0.30 / consistency 0.20) are a
 * PRODUCT DECISION, not derived from outcome data (there is no ground-truth
 * "sleep quality" label to fit them to):
 *  - duration is the dominant factor;
 *  - efficiency is down-weighted because its observed range is narrow
 *    (asleep / in-bed ran ~0.90 to 0.99 on the live account), so its z-scores
 *    swing on small differences;
 *  - consistency is the smallest weight because it is the noisiest input.
 */
export const v2Config: ScoreConfig = {
  ...v1Config,
  version: 'v2',
  sleepScore: {
    ...v1Config.sleepScore,
    weights: { SLEEP_DURATION: 0.5, SLEEP_EFFICIENCY: 0.3, CIRCADIAN_CONSISTENCY: 0.2 },
  },
};
