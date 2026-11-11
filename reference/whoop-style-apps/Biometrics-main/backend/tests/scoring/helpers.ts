import { DailyPoint } from '../../src/scoring/types';
import { shiftDate } from '../../src/scoring/dates';

/** Consecutive daily points starting at `start`. */
export function series(start: string, values: number[]): DailyPoint[] {
  return values.map((value, i) => ({ date: shiftDate(start, i), value }));
}

/** `n` values alternating between `a` and `b` (median (a+b)/2, raw MAD |b-a|/2). */
export function alternating(n: number, a: number, b: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? a : b));
}

/** A sleep session that starts at `startIso` and lasts `inBedMinutes`, with `minutesAsleep` of it asleep. */
export function sleepSession(startIso: string, inBedMinutes: number, minutesAsleep: number) {
  const startTime = new Date(startIso);
  return { startTime, endTime: new Date(startTime.getTime() + inBedMinutes * 60_000), minutesAsleep };
}

/**
 * One UTC-zone night per day from `startDate`: night i starts `onsets[i % n]`
 * minutes after 12:00 on that date (so 690 is 23:30 and 750 is 00:30 the next
 * calendar day) and lasts 7 hours. Every night therefore ends on its own
 * distinct local date, the next day.
 */
export function noonAnchoredNights(startDate: string, count: number, onsets: number[], asleepMinutes = 400) {
  return Array.from({ length: count }, (_, i) => {
    const noon = new Date(`${shiftDate(startDate, i)}T12:00:00Z`).getTime();
    return sleepSession(new Date(noon + onsets[i % onsets.length]! * 60_000).toISOString(), 420, asleepMinutes);
  });
}
