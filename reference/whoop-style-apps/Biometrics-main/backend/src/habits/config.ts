// Fixed engine configuration. Exposure thresholds and the gates below are
// deliberately constants, not fitted to a user's data: choosing the
// best-looking threshold per user would multiply the number of hypotheses
// tested without counting them (spec section 1.4).

/** A log made before this local hour belongs to the previous habit day (1am drink = last evening's). */
export const HABIT_DAY_START_HOUR = 4;

/** Lag L pairs a habit on habit day H with the factor on civil date H + L. No lag 0: that night is already over. */
export const CORRELATION_LAGS = [1, 2, 3] as const;

/** Observed pairs required on EACH side (exposed, unexposed) before a hypothesis is tested at all. */
export const MIN_PAIRS_EACH = 8;

/** Benjamini-Hochberg FDR level, applied across every hypothesis of one run. */
export const FDR_Q = 0.1;

/** Minimum |r| a hypothesis must also clear: a tiny effect can be "significant" without being worth surfacing. */
export const MIN_ABS_R = 0.3;

/** How far back the engine looks. Long enough for ~4 months of weekly reruns to matter, short enough that stale behaviour ages out. */
export const ANALYSIS_WINDOW_DAYS = 120;

/** Retroactive check-ins: today plus this many previous habit days. */
export const CHECK_IN_BACKFILL_DAYS = 7;

export interface HabitTypeConfig {
  type: string;
  label: string;
  unit: string;
  exposureThreshold: number;
  builtIn: boolean;
  /**
   * When a custom type was created. Days before it cannot be observations of
   * it -- the user had no way to log something that did not exist yet -- so
   * they must not be seeded as "unexposed". Absent for built-ins, which have
   * always been available.
   */
  createdAt?: Date;
}

// Built-ins live in code (not seeded per user) so a threshold change ships with
// a deploy. Alcohol >= 2 drinks, caffeine >= 3 cups, a workout of >= 20 minutes.
export const BUILT_IN_HABIT_TYPES: readonly HabitTypeConfig[] = [
  { type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true },
  { type: 'CAFFEINE', label: 'Caffeine', unit: 'cups', exposureThreshold: 3, builtIn: true },
  { type: 'WORKOUT', label: 'Workout', unit: 'minutes', exposureThreshold: 20, builtIn: true },
];
