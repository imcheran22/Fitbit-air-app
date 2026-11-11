// Slider definitions and their starting values for the forecast response. Pure.
import { shiftDate } from '../scoring/dates';
import { quantile } from './band';
import {
  DEFAULT_SLEEP_HOURS,
  DEFAULT_SLEEP_WINDOW_DAYS,
  SLEEP_MAX_HOURS,
  SLEEP_MIN_HOURS,
  SLEEP_STEP_HOURS,
  leverRange,
} from './config';
import type { ForecastLever } from './dto';
import type { ForecastData } from './types';

/**
 * SLEEP first, then every habit type in listHabitTypes order. A habit is
 * CONFIRMED when it is in the grid, NOT_MODELLED when it has an effect but was
 * cut by MAX_GRID_HABITS, and NONE_YET otherwise.
 */
export function buildLevers(
  data: ForecastData,
  modelled: ReadonlySet<string>,
  withEffect: ReadonlySet<string>,
): ForecastLever[] {
  return [
    { key: 'SLEEP', label: 'Sleep', unit: 'hours', min: SLEEP_MIN_HOURS, max: SLEEP_MAX_HOURS, step: SLEEP_STEP_HOURS, effect: 'CONFIRMED' },
    ...data.habitTypes.map(
      (t): ForecastLever => ({
        key: t.type,
        label: t.label,
        unit: t.unit,
        ...leverRange(t),
        threshold: t.exposureThreshold,
        effect: modelled.has(t.type) ? 'CONFIRMED' : withEffect.has(t.type) ? 'NOT_MODELLED' : 'NONE_YET',
      }),
    ),
  ];
}

/** 14-night median sleep rounded to the grid (7.5 h when there are no nights), plus today's habit totals. */
export function buildDefaults(data: ForecastData): { sleepHours: number; habits: Record<string, number> } {
  const from = shiftDate(data.today, -DEFAULT_SLEEP_WINDOW_DAYS);
  const nights = data.sleep
    .filter((p) => p.date > from && p.date <= data.today)
    .map((p) => p.value)
    .sort((a, b) => a - b);
  const sleepHours =
    nights.length === 0
      ? DEFAULT_SLEEP_HOURS
      : Math.min(
          SLEEP_MAX_HOURS,
          Math.max(SLEEP_MIN_HOURS, Math.round(quantile(nights, 0.5) / 60 / SLEEP_STEP_HOURS) * SLEEP_STEP_HOURS),
        );
  return {
    sleepHours,
    habits: Object.fromEntries(data.habitTypes.map((t) => [t.type, data.todayHabitTotals[t.type] ?? 0])),
  };
}
