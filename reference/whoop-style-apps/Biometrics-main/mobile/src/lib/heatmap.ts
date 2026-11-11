// Pure layout and statistics for the activity heat map (spec section 4). Dates
// are civil YYYY-MM-DD strings throughout, with arithmetic done in UTC so a
// daylight-saving change can never skip or repeat a day.

export type HeatmapView = 'month' | 'year' | 'ytd';

// null: no record for that day (drawn as an empty cell, distinct from a
// recorded 0). 0..4: goal-relative intensity.
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatCell {
  date: string;
  col: number;
  row: number;
  // The day's value in the metric's own unit: steps, or minutes asleep.
  value: number | null;
  level: HeatLevel | null;
}

export interface HeatGrid {
  cells: HeatCell[];
  cols: number;
  rows: number;
}

export interface MonthLabel {
  col: number;
  label: string;
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

/** 0 = Sunday. */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

/** The device's own calendar date: steps are civil-date keyed, so "today" is the wall-clock day. */
export function todayCivil(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** First day of the month `delta` months from the one containing `date`. */
export function shiftMonth(date: string, delta: number): string {
  const d = toUtc(monthStart(date));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return fromUtc(d);
}

export function monthTitle(date: string): string {
  return `${MONTH_LONG[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/**
 * Fixed goal-relative levels, never per-view quantiles, so a day looks the
 * same in every view: 0 = no steps, 1 = under 25% of goal, 2 = 25-50%,
 * 3 = 50-100%, 4 = at or above goal.
 */
export function heatLevel(steps: number | null | undefined, goal: number): HeatLevel | null {
  if (steps === null || steps === undefined) return null;
  if (steps <= 0) return 0;
  const ratio = steps / goal;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 1) return 3;
  return 4;
}

/**
 * Sleep's levels against the sleep goal. Steps' quarters would put nearly
 * every real night (6-8h of an 8h goal) in one band, so sleep is split where
 * nights actually differ: 1 = under 75% of goal (6h of 8h), 2 = 75-87.5%,
 * 3 = 87.5-100%, 4 = at or above goal. 0 is a night recorded as no sleep.
 */
export function sleepHeatLevel(minutes: number | null | undefined, goal: number): HeatLevel | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes <= 0) return 0;
  const ratio = minutes / goal;
  if (ratio < 0.75) return 1;
  if (ratio < 0.875) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export type LevelOf = (value: number | null | undefined, goal: number) => HeatLevel | null;

export type StepsByDate = ReadonlyMap<string, number>;
/** A metric's daily values by civil date: steps, or minutes asleep. */
export type ValuesByDate = ReadonlyMap<string, number>;

function cell(date: string, col: number, row: number, values: ValuesByDate, goal: number, levelOf: LevelOf): HeatCell {
  const value = values.get(date);
  return { date, col, row, value: value ?? null, level: levelOf(value, goal) };
}

/**
 * A calendar month as a 7-column grid (Sunday first), one row per week.
 * Leading and trailing blanks are positions with no cell; days after `today`
 * are left out too (they have not happened).
 */
export function monthGrid(anyDateInMonth: string, today: string, values: ValuesByDate, goal: number, levelOf: LevelOf = heatLevel): HeatGrid {
  const first = monthStart(anyDateInMonth);
  const lead = dayOfWeek(first);
  const next = shiftMonth(first, 1);
  const length = daysBetween(first, next);
  const cells: HeatCell[] = [];
  for (let i = 0; i < length; i++) {
    const date = addDays(first, i);
    if (date > today) break;
    const slot = lead + i;
    cells.push(cell(date, slot % 7, Math.floor(slot / 7), values, goal, levelOf));
  }
  return { cells, cols: 7, rows: Math.ceil((lead + length) / 7) };
}

/**
 * GitHub-style layout for [start, end]: one column per week (Sunday first),
 * seven rows. The first column starts on the Sunday on or before `start`;
 * days outside the range are positions with no cell.
 */
export function weekColumnsGrid(start: string, end: string, values: ValuesByDate, goal: number, levelOf: LevelOf = heatLevel): HeatGrid {
  const origin = addDays(start, -dayOfWeek(start));
  const cells: HeatCell[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const offset = daysBetween(origin, date);
    cells.push(cell(date, Math.floor(offset / 7), offset % 7, values, goal, levelOf));
  }
  const cols = cells.length > 0 ? cells[cells.length - 1].col + 1 : 0;
  return { cells, cols, rows: 7 };
}

/**
 * One label per month, on the column holding that month's first day in the
 * range (the range's own first column for a partial leading month). A label
 * closer than `minGap` columns to the previous one is dropped, so a sliver of
 * a month at the left edge does not collide with the next month's label.
 */
export function monthLabels(grid: HeatGrid, minGap = 3): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let lastMonth = '';
  for (const c of grid.cells) {
    const month = c.date.slice(0, 7);
    if (month === lastMonth) continue;
    lastMonth = month;
    const prev = labels[labels.length - 1];
    if (prev && c.col - prev.col < minGap) {
      // Keep the later, complete month rather than the leading sliver.
      if (prev.col === 0 && labels.length === 1) labels.pop();
      else continue;
    }
    labels.push({ col: c.col, label: MONTH_SHORT[Number(month.slice(5, 7)) - 1] });
  }
  return labels;
}

/** Inclusive [start, end] of each view. Month is the month containing `monthCursor`. */
export function viewRange(view: HeatmapView, today: string, monthCursor: string): { start: string; end: string } {
  if (view === 'ytd') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (view === 'year') return { start: yearStart(today), end: today };
  const start = monthStart(monthCursor);
  const last = addDays(shiftMonth(start, 1), -1);
  return { start, end: last < today ? last : today };
}

/** The trailing 12 months ending today: the day after this date last year. */
export function yearStart(today: string): string {
  const d = toUtc(today);
  // Date.UTC normalises Feb 29 of a non-leap year to Mar 1, which is right.
  return fromUtc(new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate() + 1)));
}

/**
 * The single range fetched up front, covering every view and every month the
 * month view can page back to (the first of the month a year ago). Always
 * within the server's 400-day cap.
 */
export function fetchRange(today: string): { from: string; to: string } {
  return { from: monthStart(yearStart(today)), to: today };
}

export interface RangeStats {
  total: number;
  // Average over days that HAVE a record: a day not synced yet is unknown,
  // not zero, so it must not drag the average down.
  average: number | null;
  daysWithData: number;
  activeDays: number;
  goalDays: number;
  // Consecutive days at or above goal ending at the range's last day. Today
  // is still in progress, so when the range ends today and today has not
  // reached the goal (yet), the streak is counted up to yesterday instead.
  streak: number;
  best: { date: string; steps: number } | null;
}

export function rangeStats(steps: StepsByDate, start: string, end: string, today: string, goal: number): RangeStats {
  const last = end < today ? end : today;
  let total = 0;
  let daysWithData = 0;
  let activeDays = 0;
  let goalDays = 0;
  let best: RangeStats['best'] = null;
  for (let date = start; date <= last; date = addDays(date, 1)) {
    const value = steps.get(date);
    if (value === undefined) continue;
    daysWithData++;
    total += value;
    if (value > 0) activeDays++;
    if (value >= goal) goalDays++;
    if (!best || value > best.steps) best = { date, steps: value };
  }

  let streak = 0;
  let cursor = last;
  if (cursor === today && (steps.get(today) ?? 0) < goal) cursor = addDays(cursor, -1);
  while (cursor >= start && (steps.get(cursor) ?? 0) >= goal) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return { total, average: daysWithData > 0 ? total / daysWithData : null, daysWithData, activeDays, goalDays, streak, best };
}

/** One line comparing a day to the visible range's average; null when there is nothing to compare. */
export function compareToAverage(steps: number, average: number | null): string | null {
  if (average === null || average <= 0) return null;
  const pct = Math.round(((steps - average) / average) * 100);
  if (Math.abs(pct) < 3) return 'In line with your average for this range.';
  return `${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} your average for this range.`;
}

/**
 * Honest note about missing history, keyed on the metric's oldest record:
 * null when the range is fully covered by synced history.
 */
export function historyNote(earliestDate: string | null, rangeStart: string, today: string, metric: 'step' | 'sleep' = 'step'): string | null {
  if (earliestDate === null) return `Your ${metric} history is still syncing.`;
  if (earliestDate <= rangeStart) return null;
  const days = daysBetween(earliestDate, today) + 1;
  return `Only ${days} day${days === 1 ? '' : 's'} of history so far. Earlier days fill in as it syncs.`;
}

/** Long, human date: "Tue, Sep 22, 2026". */
export function formatDayTitle(date: string): string {
  const d = toUtc(date);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${weekday}, ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Thursday 1 October": how a This week row reads out its day. */
export function formatLongDay(date: string): string {
  const d = toUtc(date);
  return `${WEEKDAY_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]}`;
}

/** "Sep 22" for stat captions. */
export function formatShortDate(date: string): string {
  const d = toUtc(date);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Cell geometry, following the reference heatmap's bin maths: each cell owns a
// square bin; a circle's radius is half the bin minus the gap, a rect is the
// bin minus the gap.
export interface GridGeometry {
  bin: number;
  gap: number;
  width: number;
  height: number;
}

export function gridGeometry(grid: HeatGrid, availableWidth: number, opts: { minBin: number; maxBin: number; gap: number }): GridGeometry {
  const fit = grid.cols > 0 ? availableWidth / grid.cols : opts.maxBin;
  const bin = Math.max(opts.minBin, Math.min(opts.maxBin, fit));
  return { bin, gap: opts.gap, width: bin * grid.cols, height: bin * grid.rows };
}

/** The cell under a point in grid coordinates, if any. */
export function cellAt(grid: HeatGrid, bin: number, x: number, y: number): HeatCell | null {
  if (bin <= 0 || x < 0 || y < 0) return null;
  const col = Math.floor(x / bin);
  const row = Math.floor(y / bin);
  return grid.cells.find((c) => c.col === col && c.row === row) ?? null;
}
