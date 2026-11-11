import { localCivilDate, minutesSinceLocalNoon } from '../biometrics/civilDate';
import { shiftDate } from '../scoring/dates';
import { HABIT_DAY_START_HOUR } from './config';

/**
 * The habit day a log belongs to: the local civil date of `loggedAt` in
 * `timeZone`, except that anything before HABIT_DAY_START_HOUR local counts as
 * the PREVIOUS day (a 1am drink is part of the evening before).
 *
 * The wall-clock hour is read directly rather than by subtracting four hours
 * of absolute time from the instant: on a DST-change night that subtraction
 * lands an hour off the boundary.
 *
 * Callers store the result at write time. Recomputing it later from a changed
 * User.timezone would silently rewrite history.
 */
export function habitDayFor(loggedAt: Date, timeZone: string): string {
  const localMinutes = (minutesSinceLocalNoon(loggedAt, timeZone) + 12 * 60) % (24 * 60);
  const date = localCivilDate(loggedAt, timeZone);
  return localMinutes < HABIT_DAY_START_HOUR * 60 ? shiftDate(date, -1) : date;
}

/** habitDayFor, falling back to UTC for a zone Intl does not know (a bad stored value must not break a read). */
export function habitDayForOrUtc(at: Date, timeZone: string): string {
  try {
    return habitDayFor(at, timeZone);
  } catch {
    return habitDayFor(at, 'UTC');
  }
}
