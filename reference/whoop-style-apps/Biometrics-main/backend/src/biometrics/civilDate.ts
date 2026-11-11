// Pure helpers for mapping instants to the local civil date in an IANA zone.
// Intl is used rather than a date library: the runtime already ships the tz
// database, and this is the only place the backend needs it.

// Explicit offsets ("+05:00") are accepted by newer Intl implementations but
// are not IANA names and do not follow DST, so a user "in +05:00" would drift
// wrong twice a year. Reject them; the client sends a real zone name.
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  if (/^[+-]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

// One formatter per zone: constructing Intl.DateTimeFormat is comparatively
// expensive and a backfill converts hundreds of instants for the same user.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // Throws RangeError for an unknown zone. Deliberately not caught: silently
    // treating a bad zone as UTC would re-introduce the very misalignment this
    // helper exists to remove.
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** YYYY-MM-DD of `instant` on the wall clock in `timeZone`. */
export function localCivilDate(instant: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) {
    throw new Error(`Could not derive civil date for ${instant.toISOString()} in ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

/**
 * localCivilDate, falling back to UTC when the stored timezone is not one
 * Intl knows (a bad value must not break the coach for that user).
 */
export function localCivilDateOrUtc(instant: Date | number, timeZone: string): string {
  const at = typeof instant === 'number' ? new Date(instant) : instant;
  try {
    return localCivilDate(at, timeZone);
  } catch {
    return localCivilDate(at, 'UTC');
  }
}

/** UTC midnight of a YYYY-MM-DD civil date: the `recordedAt` convention shared by all four metrics. */
export function civilDateToUtcMidnight(civilDate: string): Date {
  return new Date(`${civilDate}T00:00:00Z`);
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = clockFormatters.get(timeZone);
  if (!f) {
    // hourCycle h23 so midnight is 00, never the "24" some locales emit with hour12: false.
    f = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    clockFormatters.set(timeZone, f);
  }
  return f;
}

// The UTC offsets in real use span -12:00 .. +14:00. Anything beyond +-18h (the
// ISO/Java ZoneOffset limit) is not an offset, so it is treated as malformed.
const MAX_UTC_OFFSET_SECONDS = 18 * 60 * 60;

/**
 * Parses Google's `startUtcOffset` / `endUtcOffset` (a Duration string such as
 * "-14400s", "19800s", "0s") into whole seconds east of UTC. Anything else,
 * including fractional seconds, a missing "s", stray whitespace, a non-string
 * or an out-of-range value, is null: the caller then falls back to
 * User.timezone rather than propagate a NaN into a date.
 */
export function parseUtcOffsetSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^([+-]?)(\d+)s$/.exec(raw);
  if (!m) return null;
  const magnitude = Number(m[2]);
  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_UTC_OFFSET_SECONDS) return null;
  // `+ 0` turns -0 (from "-0s") into 0.
  return (m[1] === '-' ? -magnitude : magnitude) + 0;
}

/** The wall clock of `instant` at a fixed UTC offset, as a Date whose UTC fields ARE that wall clock. */
function wallClockAtOffset(instant: Date, offsetSeconds: number): Date {
  return new Date(instant.getTime() + offsetSeconds * 1000);
}

/**
 * The local civil date a sleep session's END belongs to (the SLEEP rollup key,
 * and the night an HRV / resting-HR day is attributed to). The record's own
 * `endUtcOffsetSeconds` wins when present: it is the offset Google itself used,
 * so it stays right when the user travels. Without it (a row stored before the
 * offsets were captured, or a malformed value) it falls back to User.timezone.
 */
export function sessionEndCivilDate(
  session: { endTime: Date; endUtcOffsetSeconds?: number | null },
  timeZone: string,
): string {
  const offset = session.endUtcOffsetSeconds;
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    return wallClockAtOffset(session.endTime, offset).toISOString().slice(0, 10);
  }
  return localCivilDate(session.endTime, timeZone);
}

/**
 * "HH:MM" (24-hour) of `instant` on the local wall clock: at the record's own
 * UTC offset when it has one, else in `timeZone`. Same precedence as
 * sessionEndCivilDate, so a night's bedtime and wake time follow the traveller.
 */
export function localClockTime(instant: Date, offsetSeconds: number | null | undefined, timeZone: string): string {
  if (typeof offsetSeconds === 'number' && Number.isFinite(offsetSeconds)) {
    return wallClockAtOffset(instant, offsetSeconds).toISOString().slice(11, 16);
  }
  const parts = clockFormatterFor(timeZone).formatToParts(instant);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  if (!hour || !minute) {
    throw new Error(`Could not derive local clock time for ${instant.toISOString()} in ${timeZone}`);
  }
  return `${hour}:${minute}`;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Minutes since 12:00 local of a session's START (its bedtime), using the
 * record's own `startUtcOffsetSeconds` when present and User.timezone
 * otherwise. Same noon-anchoring as minutesSinceLocalNoon.
 */
export function sessionStartMinutesSinceLocalNoon(
  session: { startTime: Date; startUtcOffsetSeconds?: number | null },
  timeZone: string,
): number {
  const offset = session.startUtcOffsetSeconds;
  if (typeof offset === 'number' && Number.isFinite(offset)) {
    const wall = wallClockAtOffset(session.startTime, offset);
    return (wall.getUTCHours() * 60 + wall.getUTCMinutes() - 12 * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }
  return minutesSinceLocalNoon(session.startTime, timeZone);
}

/**
 * Minutes elapsed since 12:00 (noon) local wall-clock time, in [0, 1440).
 * Noon-anchored so a night's bedtimes (say 22:00 .. 02:00) form one contiguous
 * run (600 .. 840) instead of wrapping around midnight, which would make
 * 23:30 and 00:30 look 23 hours apart. Anchoring at noon is safe because
 * nobody's main sleep starts near noon.
 */
export function minutesSinceLocalNoon(instant: Date, timeZone: string): number {
  const parts = clockFormatterFor(timeZone).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Could not derive local clock time for ${instant.toISOString()} in ${timeZone}`);
  }
  return (hour * 60 + minute - 12 * 60 + 24 * 60) % (24 * 60);
}
