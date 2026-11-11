// Shapes shared by the pure scoring stages. Nothing here touches the DB: the
// stages take plain series in and return plain values out, so each one can be
// unit-tested with synthetic data and replayed by the backtest tool.

/** One value for one civil date (YYYY-MM-DD), the same day key BiometricRecord uses. */
export interface DailyPoint {
  date: string;
  value: number;
}

/** The Recovery Score's weighted factors. */
export type RecoveryFactorKey = 'HRV' | 'RHR' | 'SLEEP_DEBT';

/** The Sleep Score's weighted factors (Slice 1.5). */
export type SleepFactorKey = 'SLEEP_DURATION' | 'SLEEP_EFFICIENCY' | 'CIRCADIAN_CONSISTENCY';

/** Every factor a DailyScore's vector can hold, across both score types. */
export type FactorKey = RecoveryFactorKey | SleepFactorKey;

/**
 * A stored sleep session: the SleepSession columns the Sleep Score features read.
 * The UTC offsets (seconds east of UTC) are the record's own local-time basis; when
 * absent or null the features fall back to the user's timezone.
 */
export interface SleepSessionInput {
  startTime: Date;
  endTime: Date;
  minutesAsleep: number;
  startUtcOffsetSeconds?: number | null;
  endUtcOffsetSeconds?: number | null;
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Series names a baseline can be built for. Strings in the DB, so adding one needs no migration. */
export type BaselineMetric =
  | 'HRV'
  | 'RESTING_HR'
  | 'SLEEP'
  | 'SLEEP_DEBT'
  | 'SLEEP_EFFICIENCY'
  | 'CIRCADIAN_CONSISTENCY';

/** Stage 1: a value rejected as an outlier. The raw record is never altered; it is only skipped. */
export interface OutlierFlag {
  date: string;
  value: number;
  median: number;
  mad: number;
}

/** Stage 3 output. Cold-start means fewer than minHistoryDays observations: no stats, never a population default. */
export type Baseline =
  | { coldStart: true; daysOfHistory: number }
  | { coldStart: false; daysOfHistory: number; ewma: number; spread: number; mad: number };

/** Input to Stage 4 for one factor. `z` is the RAW z-score (not direction-corrected). */
export interface FactorInput {
  factor: FactorKey;
  z: number | null;
  /**
   * The z before ANY clamp, when the caller has already clamped `z` itself (the
   * Sleep Score's duration z is clamped to [-3, +1] upstream). Optional: when
   * absent, `z` is the raw value. Only used to record `zRaw` on the output.
   */
  zRaw?: number | null;
  /** The sleep goal the factor was scored against (SLEEP_DEBT, SLEEP_DURATION); carried through to the stored row. */
  goalMinutes?: number;
  imputed: boolean;
  excluded: boolean;
}

/** Stage 4 output per factor (before Stage 5 adds `points`). */
export interface FactorContribution {
  factor: FactorKey;
  /** The z actually used in the weighted sum (after cfg.zClamp), so contribution = weight * direction * z stays exactly true. */
  z: number | null;
  /** The unclamped z, recorded only under a config with a zClamp (v3+), for explainability. */
  zRaw?: number | null;
  /** Passed through from FactorInput, excluded or not: "vs your goal" names the goal that day's score used. */
  goalMinutes?: number;
  /** The weight actually used that day, after renormalizing around excluded factors (0 when excluded). */
  weight: number;
  /** weight * direction * z. */
  contribution: number;
  imputed: boolean;
  excluded: boolean;
}

/** Stage 5 output per factor. */
export interface ExplainedFactor extends FactorContribution {
  /** This factor's proportional share of (score - 50). Sums to score - 50. */
  points: number;
}

export interface CompositeResult {
  /** null when every factor is excluded. */
  score: number | null;
  confidenceLevel: ConfidenceLevel;
  factors: FactorContribution[];
}
