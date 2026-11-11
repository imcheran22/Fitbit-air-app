// Activity's pure helpers (spec 2026-10-13 §1): This week's rows, the Recovery tab's levels and month stats,
// "2026 so far", and the header's pixel sky strip.

import type { ScoreBandsDTO } from '../api/scores';
import { addDays, dayOfWeek, rangeStats, type HeatLevel, type LevelOf, type ValuesByDate } from './heatmap';
import { weatherFor, type WeatherKey } from './recoveryCopy';
import { scoreBand, type ScoreBand } from './scoreInsights';
import type { PixelRect } from './weatherArt';

/** The bars' full lengths: 9 hours asleep, 15,000 steps. */
export const SLEEP_BAR_FULL_MINUTES = 540;
export const STEPS_BAR_FULL = 15000;
/** A recovery under this is drawn in the low colour. */
export const LOW_RECOVERY = 40;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface WeekRow {
  date: string;
  weekday: string;
  day: number;
  isToday: boolean;
  recovery: number | null;
  weather: WeatherKey | null;
  low: boolean;
  sleepMinutes: number | null;
  steps: number | null;
  /** 0..1 of the bar. */
  sleepFill: number;
  stepsFill: number;
}

const fill = (value: number | null, full: number) => (value === null ? 0 : Math.max(0, Math.min(1, value / full)));

/** Today and the six days before it, newest first. */
export function weekRows(
  today: string,
  steps: ValuesByDate,
  sleep: ValuesByDate | null,
  recovery: ValuesByDate | null,
  bands: ScoreBandsDTO,
): WeekRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, -i);
    const score = recovery?.get(date) ?? null;
    const minutes = sleep?.get(date) ?? null;
    const count = steps.get(date) ?? null;
    return {
      date,
      weekday: WEEKDAYS[dayOfWeek(date)]!,
      day: Number(date.slice(8, 10)),
      isToday: i === 0,
      recovery: score,
      weather: score === null ? null : weatherFor(score, 'READY', bands),
      low: score !== null && score < LOW_RECOVERY,
      sleepMinutes: minutes,
      steps: count,
      sleepFill: fill(minutes, SLEEP_BAR_FULL_MINUTES),
      stepsFill: fill(count, STEPS_BAR_FULL),
    };
  });
}

/** The header line's numbers: steps on record over the week, and nights with sleep. */
export function weekSummary(rows: WeekRow[]): { steps: number; nights: number } {
  return {
    steps: rows.reduce((sum, r) => sum + (r.steps ?? 0), 0),
    nights: rows.filter((r) => (r.sleepMinutes ?? 0) > 0).length,
  };
}

const BAND_LEVEL: Record<ScoreBand, HeatLevel> = { scorePoor: 1, scoreFair: 2, scoreGood: 3, scoreExcellent: 4 };

/** The Recovery tab's cell levels: one per band, low to excellent. */
export function recoveryLevel(bands: ScoreBandsDTO): LevelOf {
  return (value) => (value === null || value === undefined ? null : BAND_LEVEL[scoreBand(value, bands)]);
}

export interface RecoveryStats {
  average: number | null;
  best: { date: string; score: number } | null;
  scored: number;
  /** Days in the top band (clear skies) and the bottom band (stormy). */
  clear: number;
  stormy: number;
}

export function recoveryStats(values: ValuesByDate, start: string, end: string, today: string, bands: ScoreBandsDTO): RecoveryStats {
  const last = end < today ? end : today;
  let total = 0;
  let scored = 0;
  let clear = 0;
  let stormy = 0;
  let best: RecoveryStats['best'] = null;
  for (let date = start; date <= last; date = addDays(date, 1)) {
    const score = values.get(date);
    if (score === undefined) continue;
    scored++;
    total += score;
    const band = scoreBand(score, bands);
    if (band === 'scoreExcellent') clear++;
    if (band === 'scorePoor') stormy++;
    if (!best || score > best.score) best = { date, score };
  }
  return { average: scored > 0 ? total / scored : null, best, scored, clear, stormy };
}

export interface YearSoFar {
  total: number;
  average: number | null;
  goalDays: number;
}

/** 1 January through today: steps, or minutes asleep against the sleep goal. */
export function yearSoFar(values: ValuesByDate, today: string, goal: number): YearSoFar {
  const stats = rangeStats(values, `${today.slice(0, 4)}-01-01`, today, today, goal);
  return { total: stats.total, average: stats.average, goalDays: stats.goalDays };
}

const SKY = ['#2A5694', '#3264A3', '#3D72B0', '#4E83BD'];
export const SKY_STRIP_HEIGHT = 42;

/** The header's pixel sky (A-2): four dithered bands, a sun with a cloud, and grass, `width` cells wide. */
export function skyStrip(width: number): PixelRect[] {
  const r: PixelRect[] = [];
  const add = (x: number, y: number, w: number, h: number, fillColour: string) => r.push({ x, y, w, h, fill: fillColour });
  SKY.forEach((colour, i) => {
    add(0, i * 8, width, 8, colour);
    if (i > 0) for (let x = i % 2; x < width; x += 2) add(x, i * 8, 1, 1, SKY[i - 1]!);
  });
  const sun = width - 20;
  add(sun + 1, 5, 6, 1, '#FDE68A');
  add(sun, 6, 8, 6, '#FBBF24');
  add(sun + 1, 12, 6, 1, '#F59E0B');
  add(sun + 3, 10, 10, 3, '#E5E7EB');
  add(sun + 4, 9, 6, 1, '#F3F4F6');
  add(0, 32, width, 1, '#5CA857');
  add(0, 33, width, 2, '#4B9248');
  add(0, 35, width, 7, '#3D7C3C');
  for (let x = 6; x + 2 < width; x += 15) {
    add(x, 31, 1, 1, '#5CA857');
    add(x + 2, 31, 1, 1, '#5CA857');
  }
  return r.filter((p) => p.x >= 0 && p.x + p.w <= width);
}
