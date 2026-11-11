// Pure statistics and formatting for the Sleep page of the activity heat map.
// Nights are keyed by the civil date they ended on, like the server's rollup.

import type { SleepNight } from '../api/sleep';
import { addDays } from './heatmap';

export type SleepByDate = ReadonlyMap<string, SleepNight>;

/** Minutes asleep the sleep colours and stats aim at until the saved goal is read (Activity tab and Sleep page). */
export const DEFAULT_SLEEP_GOAL_MINUTES = 480;

export interface SleepRangeStats {
  nights: number;
  // Average over nights that HAVE a record, like the steps average.
  averageMinutes: number | null;
  goalNights: number;
  // Consecutive nights at or above goal ending at the range's last night. A
  // night is over by the morning it is keyed to, so today counts once it has
  // a record; with none yet, the streak is counted up to yesterday.
  streak: number;
  // Noon-anchored average of the main sleep's start, as "HH:MM".
  averageBedtime: string | null;
  longest: { date: string; minutes: number } | null;
}

/** "23:52" -> minutes after 12:00, so 23:30 and 00:30 are an hour apart, not 23. */
function minutesSinceNoon(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return (h * 60 + m - 12 * 60 + 24 * 60) % (24 * 60);
}

function clockFromMinutesSinceNoon(minutes: number): string {
  const total = (Math.round(minutes) + 12 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function sleepRangeStats(sleep: SleepByDate, start: string, end: string, today: string, goal: number): SleepRangeStats {
  const last = end < today ? end : today;
  let nights = 0;
  let total = 0;
  let goalNights = 0;
  let longest: SleepRangeStats['longest'] = null;
  let bedtimeSum = 0;
  let bedtimes = 0;
  for (let date = start; date <= last; date = addDays(date, 1)) {
    const night = sleep.get(date);
    if (!night) continue;
    nights++;
    total += night.minutesAsleep;
    if (night.minutesAsleep >= goal) goalNights++;
    if (!longest || night.minutesAsleep > longest.minutes) longest = { date, minutes: night.minutesAsleep };
    if (night.bedtime) {
      bedtimeSum += minutesSinceNoon(night.bedtime);
      bedtimes++;
    }
  }

  let streak = 0;
  let cursor = last;
  if (cursor === today && !sleep.has(today)) cursor = addDays(cursor, -1);
  while (cursor >= start && (sleep.get(cursor)?.minutesAsleep ?? 0) >= goal) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return {
    nights,
    averageMinutes: nights > 0 ? total / nights : null,
    goalNights,
    streak,
    averageBedtime: bedtimes > 0 ? clockFromMinutesSinceNoon(bedtimeSum / bedtimes) : null,
    longest,
  };
}

/** 467 -> "7h 47m". */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/**
 * 425 -> "7h 5m", 45 -> "45m": the coach's text style (the backend's durationDisplay), so a recap
 * share image reads the same as its line.
 */
export function formatTextDuration(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h === 0 ? `${m % 60}m` : `${h}h ${m % 60}m`;
}

/** 25 -> "25m", 80 -> "1h 20m": short spans without the leading "0h". */
export function formatShortDuration(minutes: number): string {
  const m = Math.round(minutes);
  return m < 60 ? `${m}m` : formatDuration(m);
}

/** "23:52" -> "11:52 pm". */
export function formatClock(clock: string): string {
  const [h, m] = clock.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * The night's offset from UTC in minutes (-240 for New York in summer). Stage
 * segments are UTC instants, while the night's bedtime is the local "HH:MM" the
 * screen shows, so the offset is the gap between bedtime and the first stage.
 * Offsets come in quarter hours, which absorbs a first stage that starts a few
 * minutes after bedtime.
 */
export function nightUtcOffset(bedtime: string, firstStart: string): number {
  const [h, m] = bedtime.split(':').map(Number);
  const start = new Date(firstStart);
  const diff = h * 60 + m - (start.getUTCHours() * 60 + start.getUTCMinutes());
  // Into -12h..+12h: a 23:10 bedtime at 03:10Z is four hours behind, not twenty ahead.
  const wrapped = ((((diff + 720) % 1440) + 1440) % 1440) - 720;
  return Math.round(wrapped / 15) * 15 || 0;
}

/** An ISO instant's local "HH:MM" at `offset` minutes from UTC, for formatClock. */
export function clockAt(iso: string, offset: number): string {
  const local = new Date(Date.parse(iso) + offset * 60000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

export interface NightClock {
  // Minutes from UTC at bedtime (for whole-hour guides).
  offset: number;
  /** An instant's local "HH:MM" in this night, for formatClock. */
  at: (iso: string) => string;
}

/**
 * The clock a night's stage instants are told on: the main session's own UTC
 * offsets from the server. When they differ (the clocks changed in the night),
 * times from the night's midpoint on use the end offset. Only when the server
 * sends neither is the offset read off bedtime (nightUtcOffset).
 */
export function nightClock(
  night: { bedtime: string; startUtcOffsetSeconds: number | null; endUtcOffsetSeconds: number | null },
  stages: { start: string; end: string }[],
): NightClock {
  const startSec = night.startUtcOffsetSeconds ?? night.endUtcOffsetSeconds;
  const endSec = night.endUtcOffsetSeconds ?? night.startUtcOffsetSeconds;
  if (startSec === null || endSec === null) {
    const offset = stages.length > 0 ? nightUtcOffset(night.bedtime, stages[0]!.start) : 0;
    return { offset, at: (iso) => clockAt(iso, offset) };
  }
  const startOffset = startSec / 60;
  const endOffset = endSec / 60;
  // The DTO has no session instants, so the stage timeline stands in for its span.
  // The latest end, not the last segment's: an earlier one can outlast it.
  const midpoint = stages.length > 0 ? (Date.parse(stages[0]!.start) + Math.max(...stages.map((s) => Date.parse(s.end)))) / 2 : Infinity;
  return { offset: startOffset, at: (iso) => clockAt(iso, Date.parse(iso) >= midpoint ? endOffset : startOffset) };
}

/** A night's one duration (spec §4.4): the main session's minutes asleep, or the day total from an older server. */
export function mainMinutes(n: SleepNight): number {
  return n.mainMinutesAsleep ?? n.minutesAsleep;
}

/** A date whose main session is a daytime nap has no night (server rule, read from the flag). */
export function isNapOnly(n: SleepNight): boolean {
  return n.mainIsNap === true;
}

/**
 * Nights by date for the calendars and their stats: minutesAsleep is main sleep and nap-only dates are dropped, so a
 * night has one number, and one existence, across the app (plan ruling 5).
 */
export function mainSleepByDate(nights: Iterable<SleepNight>): SleepByDate {
  const out = new Map<string, SleepNight>();
  for (const n of nights) if (!isNapOnly(n)) out.set(n.date, { ...n, minutesAsleep: mainMinutes(n) });
  return out;
}
