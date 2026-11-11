// The evaluator's database reads (spec 2026-10-06 §3): SLEEP and STEPS rollups and main-session
// bedtimes through the recap loader (the same definitions as Recap and sleep depth), the goal
// history, on-time check-ins and BUILT month recaps. Data is read from BEDTIME_LOOKBACK_DAYS before
// the start date, because the steady-bedtime median may use nights before it.

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { habitDayForOrUtc } from '../habits/habitDay';
import { loadRecapData } from '../recap/data';
import type { RecapStats } from '../recap/types';
import { shiftDate } from '../scoring/dates';
import { resolveSleepGoalMinutes } from '../users/goals';
import type { MonthRecap, StreakInputs } from './families';
import { goalChangesOf, type GoalChangeRow } from './goalHistory';

export const BEDTIME_LOOKBACK_DAYS = 60;

export interface AchievementInputs { inputs: StreakInputs; months: MonthRecap[] }

const key = (d: Date) => d.toISOString().slice(0, 10);

/** null when the user is unknown or has no start date yet. */
export async function loadAchievementInputs(userId: string, now: Date): Promise<AchievementInputs | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, achievementsSince: true, sleepGoalMinutes: true, bedtimeGoal: true },
  });
  if (!user?.achievementsSince) return null;
  const since = key(user.achievementsSince);
  const sinceDay = civilDateToUtcMidnight(since);
  const today = localCivilDateOrUtc(now, user.timezone);
  const [data, changes, checkIns, recaps] = await Promise.all([
    loadRecapData(userId, user.timezone, shiftDate(since, -BEDTIME_LOOKBACK_DAYS), today),
    prisma.goalChange.findMany({ where: { userId } }),
    prisma.habitCheckIn.findMany({ where: { userId, onTime: true, habitDay: { gte: sinceDay } }, select: { habitDay: true } }),
    prisma.recap.findMany({
      where: { userId, kind: 'MONTH', status: 'BUILT', periodStart: { gte: sinceDay } },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true, periodEnd: true, stats: true },
    }),
  ]);
  const rows: GoalChangeRow[] = changes.map((c) => ({
    kind: c.kind, sleepMinutes: c.sleepMinutes, bedtime: c.bedtime, effectiveOn: key(c.effectiveOn), resetsStreak: c.resetsStreak,
  }));
  return {
    inputs: {
      today,
      habitToday: habitDayForOrUtc(now, user.timezone),
      since,
      data,
      sleepChanges: goalChangesOf(rows, 'SLEEP_MINUTES'),
      bedtimeChanges: goalChangesOf(rows, 'BEDTIME'),
      currentSleepGoal: resolveSleepGoalMinutes(user.sleepGoalMinutes),
      currentBedtime: user.bedtimeGoal,
      onTimeHabitDays: new Set(checkIns.map((c) => key(c.habitDay))),
    },
    months: recaps.map((r) => ({
      periodStart: key(r.periodStart),
      periodEnd: key(r.periodEnd),
      milestones: (r.stats as unknown as RecapStats | null)?.milestones,
    })),
  };
}
