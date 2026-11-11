// The camp's clock (spec 2026-10-07 social §6). The night SCENE is 19:00–05:59 local (stars, the banner's night
// line). The "Say goodnight" BUTTON has its own window (owner ruling Q1): from min(20:00, bedtime goal − 60 min) —
// 20:00 with no goal — to 05:59 in the author's zone. A goodnight said between 00:00 and 05:59 belongs to the previous
// evening. On time = at or before the bedtime goal + 15 min, or 23:00 local with no goal; a goal before noon is after
// midnight. A camp note clears at the next 06:00 in its author's zone. The fire has five segments by the share of the
// camp in bed on time; a night is "lit" at three, and a past night is frozen: its camp is the viewer plus the buddies
// paired by that evening's 19:00 (owner ruling Q2). Pure functions, no I/O. An unknown zone reads as UTC everywhere,
// as localCivilDateOrUtc does.

import { isValidTimeZone, localCivilDateOrUtc, localClockTime } from '../biometrics/civilDate';
import { localHourOrUtc } from '../recap/periods';
import { shiftDate } from '../scoring/dates';

export const NIGHT_START_HOUR = 19;
export const SUNRISE_HOUR = 6;
/** A bedtime goal before noon is after midnight; a coach asleep last night wakes by noon. */
export const NOON_HOUR = 12;
/** "Say goodnight" opens at 20:00 at the latest… */
export const GOODNIGHT_OPEN_MINUTES = 20 * 60;
/** …or this long before an earlier bedtime goal. */
export const GOODNIGHT_LEAD_MINUTES = 60;
export const ON_TIME_GRACE_MINUTES = 15;
/** 23:00, the on-time line when no bedtime goal is set (spec §6.1). */
export const DEFAULT_ON_TIME_MINUTES = 23 * 60;
export const FIRE_SEGMENTS = 5;
/** "Nights lit this week" counts nights whose fire reached this many segments (spec §6.2). */
export const LIT_NIGHT_SEGMENTS = 3;

const MINUTES_PER_DAY = 24 * 60;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const zoneOrUtc = (timeZone: string): string => (isValidTimeZone(timeZone) ? timeZone : 'UTC');

export function isNight(at: Date, timeZone: string): boolean {
  const hour = localHourOrUtc(at, timeZone);
  return hour >= NIGHT_START_HOUR || hour < SUNRISE_HOUR;
}

/** The evening a moment belongs to: its local date, or the day before between 00:00 and 05:59. */
export function eveningDate(at: Date, timeZone: string): string {
  const date = localCivilDateOrUtc(at, timeZone);
  return localHourOrUtc(at, timeZone) < SUNRISE_HOUR ? shiftDate(date, -1) : date;
}

/** Minutes after the evening's midnight; a clock before `nextDayBefore` o'clock counts as the next day (00:30 → 24:30). */
function eveningMinutes(hour: number, minute: number, nextDayBefore: number): number {
  return hour * 60 + minute + (hour < nextDayBefore ? MINUTES_PER_DAY : 0);
}

/** The local wall clock at an instant, as [hour, minute]. */
function clockOf(at: Date, timeZone: string): [number, number] {
  return localClockTime(at, null, zoneOrUtc(timeZone)).split(':').map(Number) as [number, number];
}

/** A bedtime goal ("HH:MM") in evening minutes — a goal before noon is after midnight (00:30 → 24:30) — or null for none or a bad one. */
function goalMinutes(bedtimeGoal: string | null): number | null {
  const goal = bedtimeGoal ? HHMM_RE.exec(bedtimeGoal) : null;
  return goal ? eveningMinutes(Number(goal[1]), Number(goal[2]), NOON_HOUR) : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** When "Say goodnight" opens, "HH:MM" local: min(20:00, goal − 60 min); 20:00 with no goal. Never before 11:00 (a 12:00 goal). */
export function goodnightOpensAt(bedtimeGoal: string | null): string {
  const goal = goalMinutes(bedtimeGoal);
  const opens = goal === null ? GOODNIGHT_OPEN_MINUTES : Math.min(GOODNIGHT_OPEN_MINUTES, goal - GOODNIGHT_LEAD_MINUTES);
  return `${pad2(Math.floor(opens / 60))}:${pad2(opens % 60)}`;
}

/** Whether "Say goodnight" is open in the author's zone: from goodnightOpensAt until 05:59. */
export function isGoodnightOpen(at: Date, timeZone: string, bedtimeGoal: string | null): boolean {
  const [hour, minute] = clockOf(at, timeZone);
  if (hour < SUNRISE_HOUR) return true;
  const [openHour, openMinute] = goodnightOpensAt(bedtimeGoal).split(':').map(Number) as [number, number];
  return hour * 60 + minute >= openHour * 60 + openMinute;
}

export function isOnTime(at: Date, timeZone: string, bedtimeGoal: string | null): boolean {
  const [hour, minute] = clockOf(at, timeZone);
  const atMinutes = eveningMinutes(hour, minute, SUNRISE_HOUR);
  const goal = goalMinutes(bedtimeGoal);
  if (goal === null) return atMinutes <= DEFAULT_ON_TIME_MINUTES;
  return atMinutes <= goal + ON_TIME_GRACE_MINUTES;
}

/** The zone's offset from UTC at an instant, in ms (whole minutes). */
function offsetMs(instant: number, zone: string): number {
  const minute = new Date(Math.floor(instant / 60_000) * 60_000);
  return Date.parse(`${localCivilDateOrUtc(minute, zone)}T${localClockTime(minute, null, zone)}:00Z`) - minute.getTime();
}

/**
 * The instant of a wall-clock time on a civil date in a zone. The offset is read again at the first guess, so a DST
 * change in between is honoured. Limit: a target at or near a DST change (a skipped or repeated hour, e.g. 00:00 in
 * a zone that changes at midnight) can land an hour off. Only 06:00 and 19:00 are asked for, which no zone's change
 * reaches, so those are safe; don't use it at midnight.
 */
export function localInstant(date: string, hhmm: string, timeZone: string): Date {
  const zone = zoneOrUtc(timeZone);
  const wall = Date.parse(`${date}T${hhmm}:00Z`);
  const guess = wall - offsetMs(wall, zone);
  return new Date(wall - offsetMs(guess, zone));
}

/** The next 06:00 in the zone after `now` (today's when it is still before 06:00). */
export function nextSunrise(now: Date, timeZone: string): Date {
  const zone = zoneOrUtc(timeZone);
  const today = localCivilDateOrUtc(now, zone);
  return localInstant(localHourOrUtc(now, zone) < SUNRISE_HOUR ? today : shiftDate(today, 1), '06:00', zone);
}

/** 0 with nobody in bed on time; otherwise 0–20% → 1 … 81–100% → 5 (spec §6.2). Integer maths, so 3 of 5 is exactly 3. */
export function fireSegments(lit: number, of: number): number {
  if (lit <= 0 || of <= 0) return 0;
  return Math.min(FIRE_SEGMENTS, Math.ceil((lit * FIRE_SEGMENTS) / of));
}

/**
 * Who counts toward an evening's fire (owner ruling Q2): the viewer always, and each buddy whose pair with the viewer
 * was made at or before that evening's 19:00 in the viewer's zone. So a past night is frozen: pairing today never
 * changes Monday. `pairedAt` holds current pairs only, so an unpair or block drops the ex-buddy from past nights too
 * (ruling P5: privacy over freezing).
 */
export function campOnEvening(date: string, viewerId: string, pairedAt: ReadonlyMap<string, Date>, timeZone: string): Set<string> {
  const evening = localInstant(date, `${pad2(NIGHT_START_HOUR)}:00`, timeZone).getTime();
  const camp = new Set([viewerId]);
  for (const [id, at] of pairedAt) if (at.getTime() <= evening) camp.add(id);
  return camp;
}

/** One on-time goodnight: its author and its evening date. */
export interface OnTimeNight { authorId: string; date: string }

/**
 * The on-time goodnights, each filed under the VIEWER's evening in which it was said (`eveningDate(at, viewerZone)`),
 * not under its author's own evening date (fix ruling I-1). That is the night whose live fire showed it: an
 * Auckland buddy's goodnight said during my Los Angeles night lights my tonight, never a night of mine that has ended
 * or not begun. Late goodnights are dropped.
 */
export function onTimeNightsByViewerEvening(
  goodnights: readonly { authorId: string; at: Date; onTime: boolean }[],
  viewerZone: string,
): OnTimeNight[] {
  return goodnights.filter((g) => g.onTime).map((g) => ({ authorId: g.authorId, date: eveningDate(g.at, viewerZone) }));
}

/** Nights whose fire reached LIT_NIGHT_SEGMENTS, each judged against that night's camp (`campOn`); others' goodnights are ignored. */
export function countLitNights(onTime: readonly OnTimeNight[], campOn: (date: string) => ReadonlySet<string>): number {
  const perNight = new Map<string, Set<string>>();
  for (const g of onTime) perNight.set(g.date, (perNight.get(g.date) ?? new Set<string>()).add(g.authorId));
  let lit = 0;
  for (const [date, authors] of perNight) {
    const camp = campOn(date);
    const inBed = [...authors].filter((id) => camp.has(id)).length;
    if (fireSegments(inBed, camp.size) >= LIT_NIGHT_SEGMENTS) lit += 1;
  }
  return lit;
}
