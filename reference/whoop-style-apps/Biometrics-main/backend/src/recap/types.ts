// Recap shapes (spec 2026-10-04 §1). RecapStats is stored as Recap.stats JSON and served to the app as is.

export type RecapKind = 'WEEK' | 'MONTH';
export const RECAP_KINDS: readonly RecapKind[] = ['WEEK', 'MONTH'];

export interface WeekStripEntry { date: string; minutesAsleep: number | null; onGoal: boolean | null; recovery: number | null }
export interface RecapComparison { avgSleepDelta?: number; bedtimeSpreadDelta?: number; avgRecoveryDelta?: number }
export interface RecapMilestones {
  streak?: { nights: number };
  bestRecoveryWeek?: { weekStart: string; avgRecovery: number };
  everyDayLogged?: { days: number };
  steadiestMonth?: { spreadMinutes: number };
}
export interface RecapStats {
  nightsWithData: number;
  avgSleepMinutes?: number;
  nightsOnGoal?: number;
  longestOnGoalStreak?: number;
  bestNight?: { date: string; minutesAsleep: number };
  bestRecovery?: { date: string; score: number };
  avgRecovery?: number;
  steps?: { total: number; dailyAverage: number };
  earlierBedtimes?: { nights: number; of: number };
  bedtimeSpreadMinutes?: number;
  weekStrip?: WeekStripEntry[];
  comparison?: RecapComparison;
  milestones?: RecapMilestones;
}
/** One civil date's raw inputs; a key is absent when that input is missing. bedtime = noon-anchored minutes of the main session. */
export interface DayData { sleepMinutes?: number; sleepScore?: number; recovery?: number; steps?: number; bedtime?: number }
export type RecapData = Map<string, DayData>;

export interface RecapJobData {
  userId: string;
  kind: RecapKind;
  periodStart: string;
  /** Launch backfill: build any finished period, and never push. */
  noPush?: boolean;
}
