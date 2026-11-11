// Pure lookups into the server's precomputed what-if grid: no network while dragging.
import type { ForecastCellDTO, ForecastLeverDTO, ReadyForecastDTO } from '../api/forecast';
import { FORECAST_COPY } from './forecastCopy';

export interface LeverValues {
  sleepHours: number;
  habits: Record<string, number>;
}

export function snapSleep(h: number): number {
  return Math.min(10, Math.max(4, Math.round(h * 2) / 2));
}

export function exposedFor(levers: ForecastLeverDTO[], habits: Record<string, number>): string[] {
  return levers
    .filter((l) => l.key !== 'SLEEP' && l.effect === 'CONFIRMED' && l.threshold !== undefined && (habits[l.key] ?? 0) >= l.threshold)
    .map((l) => l.key)
    .sort();
}

export function findCell(f: ReadyForecastDTO, v: LeverValues): ForecastCellDTO {
  const sleep = snapSleep(v.sleepHours);
  const key = exposedFor(f.levers, v.habits).join(',');
  return (
    f.grid.find((c) => c.sleepHours === sleep && [...c.exposed].sort().join(',') === key) ??
    f.grid.find((c) => c.sleepHours === sleep && c.exposed.length === 0) ??
    f.grid[0]!
  );
}

export function contributionLabel(key: string, f: ReadyForecastDTO, v: LeverValues): string {
  if (key === 'CARRY_OVER') return FORECAST_COPY.trendLabel;
  if (key === 'SLEEP') return FORECAST_COPY.sleepLabel(snapSleep(v.sleepHours));
  const lever = f.levers.find((l) => l.key === key);
  return lever ? FORECAST_COPY.habitLabel(v.habits[key] ?? 0, lever.unit) : key;
}
