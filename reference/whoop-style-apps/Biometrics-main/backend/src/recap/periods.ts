// Recap periods and timing (spec 2026-10-04 §1–2). Pure civil-date maths on YYYY-MM-DD strings,
// in the user's own zone: a week is Monday–Sunday, a month a calendar month, and a night belongs
// to the date it ends on.

import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { daysBetween, shiftDate } from '../scoring/dates';
import type { RecapKind } from './types';

export const MIN_NIGHTS: Record<RecapKind, number> = { WEEK: 3, MONTH: 7 };
export const DUE_WINDOW_DAYS: Record<RecapKind, number> = { WEEK: 7, MONTH: 10 };
export const LATE_DATA_DAYS = 3;
export const DUE_HOUR = 8;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function mondayOf(date: string): string {
  return shiftDate(date, -((utc(date).getUTCDay() + 6) % 7));
}

export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function shiftMonth(monthStart: string, n: number): string {
  const d = utc(monthStart);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function periodEndOf(kind: RecapKind, start: string): string {
  return kind === 'WEEK' ? shiftDate(start, 6) : shiftDate(shiftMonth(start, 1), -1);
}

export function previousPeriodStart(kind: RecapKind, start: string): string {
  return kind === 'WEEK' ? shiftDate(start, -7) : shiftMonth(start, -1);
}

/** The most recent period that has fully ended by the local date `today`. */
export function lastCompletedPeriodStart(kind: RecapKind, today: string): string {
  return kind === 'WEEK' ? shiftDate(mondayOf(today), -7) : shiftMonth(monthStartOf(today), -1);
}

/** Whole local days from the period's last day to `today`: 1 on the day after it ended. */
export function daysSinceEnd(kind: RecapKind, start: string, today: string): number {
  return daysBetween(periodEndOf(kind, start), today);
}

const hourFormatters = new Map<string, Intl.DateTimeFormat>();

function hourIn(now: Date, timeZone: string): number {
  let f = hourFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' });
    hourFormatters.set(timeZone, f);
  }
  return Number(f.formatToParts(now).find((p) => p.type === 'hour')?.value);
}

/** The local hour 0–23, falling back to UTC for a zone Intl does not know (as localCivilDateOrUtc does). */
export function localHourOrUtc(now: Date, timeZone: string): number {
  try {
    return hourIn(now, timeZone);
  } catch {
    return hourIn(now, 'UTC');
  }
}

/**
 * Due (spec §2): in the user's zone the period has ended, it is past 08:00 on a day after it
 * ended, and it ended no more than 7 (WEEK) / 10 (MONTH) days ago. Whether a Recap row exists
 * is the caller's check.
 */
export function isDue(kind: RecapKind, start: string, now: Date, timeZone: string): boolean {
  const d = daysSinceEnd(kind, start, localCivilDateOrUtc(now, timeZone));
  if (d < 1 || d > DUE_WINDOW_DAYS[kind]) return false;
  return d > 1 || localHourOrUtc(now, timeZone) >= DUE_HOUR;
}

/** The late-data window: the 3 local days after the period ended. */
export function inLateWindow(kind: RecapKind, start: string, today: string): boolean {
  const d = daysSinceEnd(kind, start, today);
  return d >= 1 && d <= LATE_DATA_DAYS;
}

/** The launch backfill (spec §2): the last 4 completed weeks and the last 3 completed months. */
export function backfillPeriods(today: string): Array<{ kind: RecapKind; periodStart: string }> {
  const out: Array<{ kind: RecapKind; periodStart: string }> = [];
  for (const [kind, count] of [['WEEK', 4], ['MONTH', 3]] as const) {
    let start = lastCompletedPeriodStart(kind, today);
    for (let i = 0; i < count; i++) {
      out.push({ kind, periodStart: start });
      start = previousPeriodStart(kind, start);
    }
  }
  return out;
}

export function weekdayName(date: string): string {
  return WEEKDAYS[utc(date).getUTCDay()]!;
}

/** "Oct 9": the month-name date shape the validator already exempts. */
export function monthDay(date: string): string {
  return `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

export function periodLabel(kind: RecapKind, start: string): string {
  return kind === 'WEEK' ? `the week of ${monthDay(start)}` : `${MONTH_LONG[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
}
