import { prisma } from '../db/client';
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { needsUsualBedtime, recordGoalChanges, usualBedtime } from '../achievements/goalChanges';
import { clearAchievementsMarker } from '../achievements/marker';

/**
 * Mirrors the `@default(480)` on User.sleepGoalMinutes in schema.prisma (a
 * Prisma default cannot reference a TS constant, so the two are kept in step by
 * hand). Anything that needs the sleep goal -- the sleep-debt factor, and later
 * the coach's getUserGoals() -- must read it through getSleepGoalMinutes, never
 * hardcode 480, so a user who customizes their goal changes it everywhere.
 */
export const DEFAULT_SLEEP_GOAL_MINUTES = 480;

/** Pure: falls back to the default for a missing/invalid stored value. */
export function resolveSleepGoalMinutes(stored: number | null | undefined): number {
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_SLEEP_GOAL_MINUTES;
}

export async function getSleepGoalMinutes(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sleepGoalMinutes: true } });
  return resolveSleepGoalMinutes(user?.sleepGoalMinutes);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export type SleepGoal = { sleepGoalMinutes: number; bedtimeGoal: string | null; wakeGoal: string | null };
export type SleepGoalPatch = Partial<SleepGoal>;

/** null when the body is not a valid, non-empty patch (spec 2026-10-03 §2). */
export function parseSleepGoalPatch(body: unknown): SleepGoalPatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const out: SleepGoalPatch = {};
  if ('sleepGoalMinutes' in b) {
    const v = b.sleepGoalMinutes;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 240 || v > 720) return null;
    out.sleepGoalMinutes = v;
  }
  for (const k of ['bedtimeGoal', 'wakeGoal'] as const) {
    if (k in b) {
      const v = b[k];
      if (v !== null && (typeof v !== 'string' || !HHMM.test(v))) return null;
      out[k] = v as string | null;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** The sleep goal and the bedtime/wake goals; the defaults for a missing user, like getSleepGoalMinutes. */
export async function getSleepGoal(userId: string): Promise<SleepGoal> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sleepGoalMinutes: true, bedtimeGoal: true, wakeGoal: true },
  });
  return {
    sleepGoalMinutes: resolveSleepGoalMinutes(user?.sleepGoalMinutes),
    bedtimeGoal: user?.bedtimeGoal ?? null,
    wakeGoal: user?.wakeGoal ?? null,
  };
}

/**
 * Saves a patch from parseSleepGoalPatch and returns the saved goal; null when the user does not
 * exist. Also the single writer of GoalChange (achievements spec 2026-10-06 §3): the goal update and
 * its history are written in ONE transaction, so a failure saves neither. The usual bedtime (a read
 * of up to 60 nights) is computed before the transaction starts, keeping the transaction short.
 * A saved goal clears the badge evaluation marker so the next badge load re-evaluates.
 */
export async function updateSleepGoal(userId: string, patch: SleepGoalPatch, now: Date = new Date()): Promise<SleepGoal | null> {
  const found = await prisma.user.findUnique({ where: { id: userId }, select: { sleepGoalMinutes: true, bedtimeGoal: true, timezone: true } });
  if (!found) return null;
  const before = { ...found, sleepGoalMinutes: resolveSleepGoalMinutes(found.sleepGoalMinutes) };
  const today = localCivilDateOrUtc(now, before.timezone);
  const usual = needsUsualBedtime(before, patch) ? await usualBedtime(userId, before.timezone, today) : null;
  const saved = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id: userId }, data: patch });
    if (result.count === 0) return false;
    await recordGoalChanges(tx, userId, before, patch, { today, usualBedtime: usual });
    return true;
  });
  if (!saved) return null;
  await clearAchievementsMarker(userId);
  return getSleepGoal(userId);
}
