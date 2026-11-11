// The Recovery page payloads (spec §3). Mirrored in mobile/src/api/recovery.ts.
import type { BaselineDTO, DailyScoreDTO } from '../scoring/dto';
import type { ScoreBands } from '../scoring/configs/v1';

export type RecoveryState = 'READY' | 'BUILDING' | 'NO_DATA';

export interface SleepDebtDTO {
  minutes: number;                 // round(sleepDebtRolling14d)
  windowNights: number;            // cfg.sleepDebtWindowDays (14)
  goalMinutes: number;             // SLEEP_DEBT factor goalMinutes, else the user's current goal
  usualLowMinutes: number | null;
  usualHighMinutes: number | null; // SLEEP_DEBT ewma + floored spread
  nightsToClear: number | null;    // 0..14; null without a usual
}

export interface LastNightDTO {
  date: string;
  minutesAsleep: number;
  stages: { deep: number; rem: number; light: number; awake: number } | null; // null when !hasStages
}

export interface RecoveryDayDTO { date: string; score: number | null } // score 1 dp

export interface RecoveryMonthDTO {
  month: string;                   // YYYY-MM
  days: RecoveryDayDTO[];          // dates with a RECOVERY row, ascending
  average: number | null;          // mean of non-null scores, 1 dp
  counts: { excellent: number; good: number; fair: number; low: number };
}

export interface ForecastChipDTO {
  sleepHours: 6 | 7 | 8 | 9;
  score: number;
  band: [number, number];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export type RecoveryTomorrowDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | { status: 'UNAVAILABLE' }
  | { status: 'READY'; date: string; chips: ForecastChipDTO[]; trackRecord: { hits: number; days: number; withinPoints: number } };

export interface RecoveryPageDTO {
  date: string;
  today: string; // YYYY-MM-DD in the user's stored timezone; the client bounds calendar paging with it
  isToday: boolean;
  state: RecoveryState;
  bands: ScoreBands;
  updatedAt: string | null;
  score: DailyScoreDTO | null;
  previous: { date: string; score: number } | null;
  baselines: BaselineDTO[];
  weights: { HRV: number; RHR: number; SLEEP_DEBT: number }; // the row's config base weights (live config when no row)
  outlook: RecoveryDayDTO[];       // exactly 7, D-6..D ascending
  sleepDebt: SleepDebtDTO | null;
  lastNight: LastNightDTO | null;
  streak: { current: number; best: number };
  month: RecoveryMonthDTO;
  firstScoredDate: string | null;
  tomorrow: RecoveryTomorrowDTO | null; // null unless isToday
}

export interface RecoveryCalendarDTO { month: RecoveryMonthDTO; bands: ScoreBands }
