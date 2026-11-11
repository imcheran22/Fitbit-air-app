import type { ConfidenceLevel } from '../scoring/types';

export type LeverEffect = 'CONFIRMED' | 'NONE_YET' | 'NOT_MODELLED';

export interface ForecastLever {
  key: string; // 'SLEEP' or a habit type id
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  threshold?: number;
  effect: LeverEffect;
}

export interface ForecastCell {
  sleepHours: number;
  exposed: string[];
  score: number;
  band: [number, number];
  confidence: ConfidenceLevel;
  contributions: Array<{ key: string; points: number }>;
}

export type ForecastResponse =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | {
      status: 'READY';
      date: string;
      algorithmVersion: string;
      defaults: { sleepHours: number; habits: Record<string, number> };
      levers: ForecastLever[];
      grid: ForecastCell[];
      trackRecord: {
        withinPoints: number;
        hits: number;
        days: number;
        series: Array<{ date: string; forecast: number; actual: number }>;
      };
    };
