import { fetchSleep, fetchSleepGoal } from '../api/sleep';

// Year in pixels (spec 2026-10-04 §1, §3; recap restyle 2026-10-05): one cell per night of the
// calendar year, in date order (drawn 26 to a row), against the user's CURRENT goal, not stored on
// the server. Each night keeps its minutes and gets one of four steps: no data, short (< 75 % of the
// goal), near (75 % to under 100 %) and on goal (≥ 100 %). A night after today is "future": drawn
// empty, never a step, never counted.

export type PixelLevel = 'none' | 'short' | 'near' | 'goal' | 'future';

export interface PixelCell {
  date: string;
  /** Minutes asleep that night; null with no data (or a future night). */
  minutes: number | null;
  level: PixelLevel;
}

export interface YearPixels {
  cells: PixelCell[];
  onGoal: number;
}

export const YEAR_COLUMNS = 26;
/** Share of the goal from which a night is "near" rather than "short". */
export const NEAR_GOAL_SHARE = 0.75;

export function pixelLevel(minutes: number | null, goalMinutes: number): Exclude<PixelLevel, 'future'> {
  if (minutes === null) return 'none';
  if (minutes >= goalMinutes) return 'goal';
  return minutes >= goalMinutes * NEAR_GOAL_SHARE ? 'near' : 'short';
}

const pad = (n: number) => String(n).padStart(2, '0');

export function yearPixels(year: number, nights: Array<{ date: string; minutesAsleep: number }>, goalMinutes: number, today: string): YearPixels {
  const minutes = new Map(nights.filter((n) => n.minutesAsleep > 0).map((n) => [n.date, n.minutesAsleep]));
  let onGoal = 0;
  const cells: PixelCell[] = [];
  for (let month = 0; month < 12; month++) {
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= days; day++) {
      const date = `${year}-${pad(month + 1)}-${pad(day)}`;
      if (date > today) {
        cells.push({ date, minutes: null, level: 'future' });
        continue;
      }
      const m = minutes.get(date) ?? null;
      const level = pixelLevel(m, goalMinutes);
      if (level === 'goal') onGoal++;
      cells.push({ date, minutes: m, level });
    }
  }
  return { cells, onGoal };
}

export interface YearInPixels {
  year: number;
  pixels: YearPixels;
  goalMinutes: number;
}

/**
 * The year of `today` from GET /me/sleep (nights keyed by the local date they ended on) against
 * the CURRENT goal. `today` is the user's local civil date, so tonight is never drawn as a past night.
 * Shared by the Year in pixels screen and the recap builder.
 */
export async function loadYearInPixels(today: string): Promise<YearInPixels> {
  const year = Number(today.slice(0, 4));
  const [sleep, goal] = await Promise.all([fetchSleep(`${year}-01-01`, `${year}-12-31`), fetchSleepGoal()]);
  return { year, pixels: yearPixels(year, sleep.nights, goal.sleepGoalMinutes, today), goalMinutes: goal.sleepGoalMinutes };
}
