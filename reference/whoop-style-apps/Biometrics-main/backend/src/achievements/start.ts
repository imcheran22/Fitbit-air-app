// Start dates (spec 2026-10-06 §3). achievementsSince is written only where it is null — by the
// launch job for existing users, by the first GET /me/achievements for new users — as the user's
// local date then. The starting GoalChange rows are written at the same moment, in the same
// transaction as the claim, so a start date never exists without them. createMany with
// skipDuplicates never violates (userId, kind, effectiveOn) and never overwrites a goal the user
// already saved that day: that saved row wins.

import type { Prisma } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { resolveSleepGoalMinutes } from '../users/goals';

export interface StartingGoals { sleepGoalMinutes: number; bedtimeGoal: string | null }
export interface StartableUser { id: string; sleepGoalMinutes: number; bedtimeGoal: string | null }

const key = (d: Date) => d.toISOString().slice(0, 10);

/** One row per kind dated `effectiveOn`, each carrying only its own kind's value; a row already there is kept. */
export async function writeStartingGoals(
  userId: string,
  effectiveOn: string,
  goals: StartingGoals,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const day = civilDateToUtcMidnight(effectiveOn);
  await db.goalChange.createMany({
    data: [
      { userId, kind: 'SLEEP_MINUTES', sleepMinutes: goals.sleepGoalMinutes, bedtime: null, effectiveOn: day, resetsStreak: false },
      { userId, kind: 'BEDTIME', sleepMinutes: null, bedtime: goals.bedtimeGoal, effectiveOn: day, resetsStreak: false },
    ],
    skipDuplicates: true,
  });
}

/** Sets the start date to `date` only where it is still null; true when this call set it (and wrote the starting goals). */
export async function claimStartDate(user: StartableUser, date: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const set = await tx.user.updateMany({
      where: { id: user.id, achievementsSince: null },
      data: { achievementsSince: civilDateToUtcMidnight(date) },
    });
    if (set.count === 0) return false;
    const goals = { sleepGoalMinutes: resolveSleepGoalMinutes(user.sleepGoalMinutes), bedtimeGoal: user.bedtimeGoal };
    await writeStartingGoals(user.id, date, goals, tx);
    return true;
  });
}

/** The user's start date, setting it to their local date now on the first call; null for an unknown user. */
export async function ensureAchievementsStart(userId: string, now: Date): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timezone: true, achievementsSince: true, sleepGoalMinutes: true, bedtimeGoal: true },
  });
  if (!user) return null;
  if (user.achievementsSince) return key(user.achievementsSince);
  await claimStartDate(user, localCivilDateOrUtc(now, user.timezone));
  // Re-read: a concurrent first load may have set it instead of this one.
  const after = await prisma.user.findUnique({ where: { id: userId }, select: { achievementsSince: true } });
  return after?.achievementsSince ? key(after.achievementsSince) : null;
}
