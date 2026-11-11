// Goal history writer (spec 2026-10-06 §3). Called by updateSleepGoal and nowhere else, inside the
// same transaction as the goal update, so a goal is never saved without its history (or the other
// way round). One row per (user, kind, local day): a second change the same day overwrites that
// day's row. resetsStreak compares the new value with the goal in effect BEFORE that day, so
// lowering and restoring on the same day is no reset. When no row before today exists, the goal
// that was in effect (the same-day starting row, else the stored value) is written first, dated
// the day before, so a later change today still has that day-before goal to compare with (and
// changeInEffect's starting-goal fallback finds it). A row carries only its own kind's value:
// sleepMinutes for SLEEP_MINUTES, bedtime for BEDTIME.
// The usual bedtime is a read of up to 60 nights; the caller does it BEFORE the transaction.

import type { GoalChangeKind, Prisma } from '@prisma/client';
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { loadRecapData } from '../recap/data';
import { shiftDate } from '../scoring/dates';
import { bedtimeGoalResets, bedtimeSeries, goalChangesOf, sleepGoalResets, usualBedtimeBefore, type GoalChangeRow } from './goalHistory';

export const USUAL_BEDTIME_LOOKBACK_DAYS = 60;

export interface GoalsBefore { sleepGoalMinutes: number; bedtimeGoal: string | null; timezone: string }
export interface GoalPatch { sleepGoalMinutes?: number; bedtimeGoal?: string | null }
/** Read before the transaction: the user's local date now and, when needed, their usual bedtime. */
export interface GoalChangeContext { today: string; usualBedtime: number | null }

/** The one value a row of a kind carries; the other column stays null. */
type KindValue = { sleepMinutes: number | null; bedtime: null } | { sleepMinutes: null; bedtime: string | null };

function valueOf(kind: GoalChangeKind, row: Pick<GoalChangeRow, 'sleepMinutes' | 'bedtime'>): KindValue {
  return kind === 'SLEEP_MINUTES' ? { sleepMinutes: row.sleepMinutes, bedtime: null } : { sleepMinutes: null, bedtime: row.bedtime };
}

/** The median bedtime (minutes since local noon) of the 14 nights with one before `date`; null under 7. */
export async function usualBedtime(userId: string, timeZone: string, date: string): Promise<number | null> {
  const data = await loadRecapData(userId, timeZone, shiftDate(date, -USUAL_BEDTIME_LOOKBACK_DAYS), shiftDate(date, -1));
  return usualBedtimeBefore(bedtimeSeries(data), date);
}

/** A bedtime goal is being set (not cleared) to a new value: the usual bedtime may decide resetsStreak. */
export function needsUsualBedtime(before: GoalsBefore, patch: GoalPatch): boolean {
  return patch.bedtimeGoal !== undefined && patch.bedtimeGoal !== null && patch.bedtimeGoal !== before.bedtimeGoal;
}

async function writeChange(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: GoalChangeKind,
  today: string,
  stored: KindValue,
  next: KindValue,
  resets: (previous: KindValue) => boolean,
): Promise<void> {
  const loaded = await tx.goalChange.findMany({ where: { userId, kind } });
  const changes = goalChangesOf(loaded.map((r) => ({ ...r, effectiveOn: r.effectiveOn.toISOString().slice(0, 10) })), kind);
  // A row can be dated after today (an earlier save from a time zone further east); the change goes
  // on that latest day instead, so an older row never outranks this newer goal.
  const latest = changes.at(-1)?.effectiveOn;
  const date = latest !== undefined && latest > today ? latest : today;
  const earlier = changes.filter((c) => c.effectiveOn < date).at(-1);
  const day = civilDateToUtcMidnight(date);
  let previous: KindValue;
  if (earlier) {
    previous = valueOf(kind, earlier);
  } else {
    const sameDay = changes.find((c) => c.effectiveOn === date);
    previous = sameDay ? valueOf(kind, sameDay) : stored;
    await tx.goalChange.createMany({
      data: [{ userId, kind, ...previous, effectiveOn: civilDateToUtcMidnight(shiftDate(date, -1)), resetsStreak: false }],
      skipDuplicates: true,
    });
  }
  const resetsStreak = resets(previous);
  await tx.goalChange.upsert({
    where: { userId_kind_effectiveOn: { userId, kind, effectiveOn: day } },
    create: { userId, kind, ...next, effectiveOn: day, resetsStreak },
    update: { ...next, resetsStreak },
  });
}

/** Writes, with `tx`, a row for each goal in `patch` whose value differs from `before`; the wake goal is not tracked. */
export async function recordGoalChanges(
  tx: Prisma.TransactionClient,
  userId: string,
  before: GoalsBefore,
  patch: GoalPatch,
  ctx: GoalChangeContext,
): Promise<void> {
  const minutes = patch.sleepGoalMinutes;
  if (minutes !== undefined && minutes !== before.sleepGoalMinutes) {
    await writeChange(
      tx, userId, 'SLEEP_MINUTES', ctx.today,
      { sleepMinutes: before.sleepGoalMinutes, bedtime: null },
      { sleepMinutes: minutes, bedtime: null },
      (previous) => sleepGoalResets(previous.sleepMinutes ?? before.sleepGoalMinutes, minutes),
    );
  }
  const bedtime = patch.bedtimeGoal;
  if (bedtime !== undefined && bedtime !== before.bedtimeGoal) {
    await writeChange(
      tx, userId, 'BEDTIME', ctx.today,
      { sleepMinutes: null, bedtime: before.bedtimeGoal },
      { sleepMinutes: null, bedtime },
      (previous) => bedtimeGoalResets(previous.bedtime, bedtime, previous.bedtime === null ? ctx.usualBedtime : null),
    );
  }
}
