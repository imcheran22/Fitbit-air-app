import { apiFetch } from './client';
import type { ConfidenceLevel } from './scores';

export type LeverEffect = 'CONFIRMED' | 'NONE_YET' | 'NOT_MODELLED';

export interface ForecastLeverDTO {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  threshold?: number;
  effect: LeverEffect;
}

export interface ForecastCellDTO {
  sleepHours: number;
  exposed: string[];
  score: number;
  band: [number, number];
  confidence: ConfidenceLevel;
  contributions: Array<{ key: string; points: number }>;
}

export interface ReadyForecastDTO {
  status: 'READY';
  date: string;
  algorithmVersion: string;
  defaults: { sleepHours: number; habits: Record<string, number> };
  levers: ForecastLeverDTO[];
  grid: ForecastCellDTO[];
  trackRecord: {
    withinPoints: number;
    hits: number;
    days: number;
    series: Array<{ date: string; forecast: number; actual: number }>;
  };
}

export type ForecastDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | ReadyForecastDTO;

export function fetchForecast(): Promise<ForecastDTO> {
  return apiFetch<ForecastDTO>('/me/forecast');
}
