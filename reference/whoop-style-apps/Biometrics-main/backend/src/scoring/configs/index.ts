import type { ScoreConfig } from './v1';
import { v1Config } from './v1';
import { v2Config } from './v2';
import { v3Config } from './v3';

/** Every shipped version, by id. Add a new file and register it here; never edit an old one. */
export const SCORE_CONFIGS: Record<string, ScoreConfig> = {
  [v1Config.version]: v1Config,
  [v2Config.version]: v2Config,
  [v3Config.version]: v3Config,
};

/**
 * The version new scores are computed with. Rollout is: run the backtest, read the diff, flip this, deploy.
 * A stored DailyScore from any other version is stale: the nightly sweep and the compute job recompute it.
 */
export const LIVE_VERSION = 'v3';

export function getScoreConfig(version: string): ScoreConfig {
  const config = SCORE_CONFIGS[version];
  if (!config) {
    throw new Error(`Unknown score algorithm version "${version}". Known: ${Object.keys(SCORE_CONFIGS).join(', ')}`);
  }
  return config;
}

export function getLiveConfig(): ScoreConfig {
  return getScoreConfig(LIVE_VERSION);
}

export type { ScoreConfig };
