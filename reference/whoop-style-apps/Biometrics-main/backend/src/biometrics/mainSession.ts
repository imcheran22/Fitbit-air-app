import { localClockTime } from './civilDate';

// The one rule for a night's main session (spec 2026-10-03 §2): most minutes asleep, earliest
// start on a tie, skipping a non-positive interval. Scoring and every sleep endpoint use it,
// so a night's bedtime is the same everywhere. Google's mainSleep flag is deliberately unused.
export function pickMainSession<T extends { startTime: Date; endTime: Date; minutesAsleep: number }>(sessions: readonly T[]): T | null {
  let main: T | null = null;
  for (const s of sessions) {
    if (!(s.endTime.getTime() - s.startTime.getTime() > 0)) continue;
    if (!main || s.minutesAsleep > main.minutesAsleep || (s.minutesAsleep === main.minutesAsleep && s.startTime < main.startTime)) main = s;
  }
  return main;
}

// The nap rule (spec 2026-10-09 one-sleep-page §4.3): a date whose main session starts between 10:00 and 18:00 local
// and has under 180 minutes asleep has no night, only a nap. Display only: scoring never reads it. It lives only here;
// the app reads the `mainIsNap` flag.
export const NAP_WINDOW_START_MINUTES = 10 * 60;
export const NAP_WINDOW_END_MINUTES = 18 * 60;
export const NAP_MAX_MINUTES_ASLEEP = 180;

export function isDaytimeNap(
  main: { startTime: Date; startUtcOffsetSeconds?: number | null; minutesAsleep: number },
  timeZone: string,
): boolean {
  const [h, m] = localClockTime(main.startTime, main.startUtcOffsetSeconds, timeZone).split(':').map(Number);
  const local = h! * 60 + m!;
  return local >= NAP_WINDOW_START_MINUTES && local < NAP_WINDOW_END_MINUTES && main.minutesAsleep < NAP_MAX_MINUTES_ASLEEP;
}
