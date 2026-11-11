// Quiet hours for buddy pushes (spec 2026-10-06 buddies §6), in the RECIPIENT's zone: from their
// bedtime goal to their wake goal when both are set, else 22:00-07:00. A window may wrap midnight;
// equal start and end means no quiet hours. A push inside the window is skipped, not delayed.

import { localClockTime } from '../biometrics/civilDate';

export interface QuietWindow { start: string; end: string }

export const DEFAULT_QUIET_WINDOW: QuietWindow = { start: '22:00', end: '07:00' };

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export function quietWindow(bedtime: string | null, wake: string | null): QuietWindow {
  return bedtime && wake ? { start: bedtime, end: wake } : DEFAULT_QUIET_WINDOW;
}

/** [start, end): start inclusive, end exclusive, wrapping midnight when start > end. */
export function isQuietAt(localHHMM: string, window: QuietWindow): boolean {
  const at = minutes(localHHMM);
  const start = minutes(window.start);
  const end = minutes(window.end);
  if (start === end) return false;
  return start < end ? at >= start && at < end : at >= start || at < end;
}

export function inQuietHours(now: Date, user: { timezone: string; bedtimeGoal: string | null; wakeGoal: string | null }): boolean {
  let clock: string;
  try {
    clock = localClockTime(now, null, user.timezone);
  } catch {
    clock = localClockTime(now, null, 'UTC');
  }
  return isQuietAt(clock, quietWindow(user.bedtimeGoal, user.wakeGoal));
}
