// Goal history for the sleep badge streaks (spec 2026-10-06 §3–4). Pure.
//   - A night is judged by the goal in effect for it: the latest change with effectiveOn BEFORE
//     the night's wake date. A change made on a day never re-judges the night that ended that
//     morning. Nights before every change use the earliest row (the starting goal).
//   - A family restarts the night after a change that eased its goal (resetsStreak).
// Bedtimes are minutes since local noon (the recap convention, so 23:30 and 00:30 are 60 apart)
// and are compared on the 24-hour circle.

import type { GoalChangeKind } from '@prisma/client';
import type { RecapData } from '../recap/types';
import { shiftDate } from '../scoring/dates';

export interface GoalChangeRow {
  kind: GoalChangeKind;
  sleepMinutes: number | null;
  /** "HH:MM"; null = no bedtime goal. */
  bedtime: string | null;
  /** The user's local date of the change. */
  effectiveOn: string;
  resetsStreak: boolean;
}

export const BEDTIME_WINDOW_MINUTES = 30;
export const USUAL_BEDTIME_NIGHTS = 14;
export const MIN_USUAL_BEDTIME_NIGHTS = 7;
const DAY_MINUTES = 24 * 60;

/**
 * The rows of one kind, oldest first: the only shape changeInEffect and familyStartDate accept.
 * Every caller goes through here rather than trusting the order or kind of loaded rows.
 */
export function goalChangesOf(rows: readonly GoalChangeRow[], kind: GoalChangeKind): GoalChangeRow[] {
  return rows.filter((row) => row.kind === kind).sort((a, b) => (a.effectiveOn < b.effectiveOn ? -1 : a.effectiveOn > b.effectiveOn ? 1 : 0));
}

/** `changes` ascending by effectiveOn, one kind (see goalChangesOf). */
export function changeInEffect(changes: readonly GoalChangeRow[], wakeDate: string): GoalChangeRow | null {
  let found: GoalChangeRow | null = null;
  for (const change of changes) if (change.effectiveOn < wakeDate) found = change;
  return found ?? changes[0] ?? null;
}

/** max(since, the day after the latest change that reset this family's streak). */
export function familyStartDate(since: string, changes: readonly GoalChangeRow[]): string {
  let start = since;
  for (const change of changes) {
    if (!change.resetsStreak) continue;
    const next = shiftDate(change.effectiveOn, 1);
    if (next > start) start = next;
  }
  return start;
}

export function hhmmToNoonMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return (h * 60 + m - 12 * 60 + DAY_MINUTES) % DAY_MINUTES;
}

export function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY_MINUTES;
  return Math.min(d, DAY_MINUTES - d);
}

/** [date, bedtime] for every night with a main-session bedtime, oldest first. */
export function bedtimeSeries(data: RecapData): Array<readonly [string, number]> {
  const out: Array<readonly [string, number]> = [];
  for (const [date, day] of data) if (day.bedtime !== undefined) out.push([date, day.bedtime] as const);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median bedtime of the previous 14 nights that have one (strictly before `date`); null under 7. */
export function usualBedtimeBefore(bedtimes: ReadonlyArray<readonly [string, number]>, date: string): number | null {
  const prior = bedtimes.filter(([d]) => d < date).slice(-USUAL_BEDTIME_NIGHTS).map(([, m]) => m);
  return prior.length >= MIN_USUAL_BEDTIME_NIGHTS ? median(prior) : null;
}

export function sleepGoalResets(previousMinutes: number, nextMinutes: number): boolean {
  return nextMinutes < previousMinutes;
}

/**
 * Moved by more than 30 minutes, or cleared, or set for the first time more than 30 minutes from
 * the usual bedtime (no usual bedtime known: true).
 */
export function bedtimeGoalResets(previous: string | null, next: string | null, usual: number | null): boolean {
  if (next === null) return previous !== null;
  if (previous !== null) return circularDistance(hhmmToNoonMinutes(previous), hhmmToNoonMinutes(next)) > BEDTIME_WINDOW_MINUTES;
  return usual === null || circularDistance(hhmmToNoonMinutes(next), usual) > BEDTIME_WINDOW_MINUTES;
}
