import type { FactorSeries } from '../habits/engine';
import type { ObservedDay } from '../habits/observed';
import type { HabitTypeConfig } from '../habits/config';
import type { ScoreConfig } from '../scoring/configs';
import type { ConfidenceLevel, DailyPoint } from '../scoring/types';

export type ForecastFactor = 'HRV' | 'RHR';
export const FORECAST_FACTORS: readonly ForecastFactor[] = ['HRV', 'RHR'];

export interface ActualScore {
  score: number | null;
  confidence: ConfidenceLevel;
}

/** Everything the pure engine needs. Built by load.ts; built by fixtures in tests. */
export interface ForecastData {
  /** The user's local civil date. The forecast target is today + 1. */
  today: string;
  cfg: ScoreConfig;
  sleepGoalMinutes: number;
  /** Nightly minutes asleep keyed by the local date the night ends (as scoring reads it). */
  sleep: DailyPoint[];
  /** Per-day z-scores from UserDailyFeatures (hrvZ / rhrZ with imputed flags). */
  factors: Record<ForecastFactor, FactorSeries>;
  /** Stored Recovery DailyScores by date. */
  scores: ReadonlyMap<string, ActualScore>;
  /** Built-ins first, then custom types by createdAt (listHabitTypes order). */
  habitTypes: HabitTypeConfig[];
  /** Observed habit days by habit type, exactly as the habit engine builds them. */
  observations: ReadonlyMap<string, ObservedDay[]>;
  /** CONFIRMED lag-1 rows against HRV/RHR. */
  confirmed: ReadonlyArray<{ habitType: string; factor: ForecastFactor }>;
  /** Sum of each habit's logged value on the current habit day. */
  todayHabitTotals: Record<string, number>;
}

export interface Lever {
  sleepMinutes: number;
  exposed: ReadonlySet<string>;
}

export interface Model {
  phi: Record<ForecastFactor, number>;
  /** habitType -> factor -> delta z (exposed mean minus unexposed mean, lag 1). */
  effects: Map<string, Partial<Record<ForecastFactor, number>>>;
}

export interface Contribution {
  key: string;
  points: number;
}

export interface Prediction {
  score: number;
  contributions: Contribution[];
}

export interface TrackPoint {
  date: string;
  forecast: number;
  actual: number;
}
