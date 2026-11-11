import { apiFetch } from './client';
import type { BaselineDTO, DailyScoreDTO, ScoreBandsDTO } from './scores';

// Mirrors backend/src/recovery/dto.ts. Field names are the wire contract.
export type RecoveryState = 'READY' | 'BUILDING' | 'NO_DATA';
export interface SleepDebtDTO { minutes: number; windowNights: number; goalMinutes: number; usualLowMinutes: number | null; usualHighMinutes: number | null; nightsToClear: number | null }
export interface LastNightDTO { date: string; minutesAsleep: number; stages: { deep: number; rem: number; light: number; awake: number } | null }
export interface RecoveryDayDTO { date: string; score: number | null }
export interface RecoveryMonthDTO { month: string; days: RecoveryDayDTO[]; average: number | null; counts: { excellent: number; good: number; fair: number; low: number } }
export interface ForecastChipDTO { sleepHours: 6 | 7 | 8 | 9; score: number; band: [number, number]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }
export type RecoveryTomorrowDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | { status: 'UNAVAILABLE' }
  | { status: 'READY'; date: string; chips: ForecastChipDTO[]; trackRecord: { hits: number; days: number; withinPoints: number } };
export interface RecoveryPageDTO {
  date: string; today: string; isToday: boolean; state: RecoveryState; bands: ScoreBandsDTO; updatedAt: string | null;
  score: DailyScoreDTO | null; previous: { date: string; score: number } | null; baselines: BaselineDTO[];
  weights: { HRV: number; RHR: number; SLEEP_DEBT: number };
  outlook: RecoveryDayDTO[]; sleepDebt: SleepDebtDTO | null; lastNight: LastNightDTO | null;
  streak: { current: number; best: number }; month: RecoveryMonthDTO; firstScoredDate: string | null;
  tomorrow: RecoveryTomorrowDTO | null;
}
export interface RecoveryCalendarDTO { month: RecoveryMonthDTO; bands: ScoreBandsDTO }

// Errors throw (with .status), as in api/scores.ts. There is no 404 path: a day without a row is state NO_DATA.
export function fetchRecoveryPage(date: string | 'today'): Promise<RecoveryPageDTO> {
  return apiFetch<RecoveryPageDTO>(`/me/recovery/${date}`);
}
export function fetchRecoveryMonth(month: string): Promise<RecoveryCalendarDTO> {
  return apiFetch<RecoveryCalendarDTO>(`/me/recovery/calendar/${month}`);
}
