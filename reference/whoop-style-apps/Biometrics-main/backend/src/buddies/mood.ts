// What a buddy's mood is (spec 2026-10-06 buddies §5): the RECOVERY DailyScore with a score for the
// buddy's own local today, else yesterday, banded with the live score bands (the ones the scoring
// routes return). The mood line is fixed templates only, extended only by shared items.

import { sleepGoalDays } from '../achievements/families';
import { goalChangesOf } from '../achievements/goalHistory';
import { summariseRuns } from '../achievements/runs';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { RecapData } from '../recap/types';
import { getLiveConfig } from '../scoring/configs';
import type { ScoreBands } from '../scoring/configs/v1';
import { shiftDate } from '../scoring/dates';
import { resolveSleepGoalMinutes } from '../users/goals';

export type Mood = 'good' | 'ok' | 'low' | 'none';

export const MOOD_LINES: Readonly<Record<Mood, string>> = {
  good: 'Well rested',
  ok: 'Doing okay',
  low: 'Running low today',
  none: 'No data yet',
};

export const STREAK_LINE_MIN = 3;

/** excellent and good → good, fair → ok, poor → low; no score → none. */
export function moodFromScore(score: number | null | undefined, bands: ScoreBands = getLiveConfig().scoreBands): Mood {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'none';
  if (score >= bands.good) return 'good';
  if (score >= bands.fair) return 'ok';
  return 'low';
}

/** `scores`: local date → non-null RECOVERY score. Today's, else yesterday's. */
export function todayMood(scores: ReadonlyMap<string, number>, today: string, bands?: ScoreBands): Mood {
  return moodFromScore(scores.get(today) ?? scores.get(shiftDate(today, -1)), bands);
}

/**
 * The fixed line. `movedALot` must only be passed when the steps switch is on, `streakNights` only
 * when the streaks switch is on (and only on the buddy's week).
 */
export function moodLine(mood: Mood, extras: { movedALot?: boolean; streakNights?: number | null } = {}): string {
  const parts = [MOOD_LINES[mood]];
  if (extras.movedALot) parts.push('moved a lot yesterday');
  if (typeof extras.streakNights === 'number' && extras.streakNights >= STREAK_LINE_MIN) parts.push(`on a ${extras.streakNights}-night streak`);
  return parts.join(' · ');
}

/** How far back the streak is read: a longer streak reads as this many nights (the top level is 100). */
export const STREAK_LOOKBACK_DAYS = 365;

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The buddy's current Sleep goal streak, WITHOUT evaluateAchievements (which inserts awards): only
 * the SLEEP rollups of the last STREAK_LOOKBACK_DAYS (from the achievements start date, if later),
 * the sleep goal changes and the stored goal, then the pure run walk. null when the buddy has no
 * achievements start date (no streak at all, not 0).
 */
export async function currentSleepStreak(userId: string, now: Date): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, achievementsSince: true, sleepGoalMinutes: true } });
  if (!user?.achievementsSince) return null;
  const today = localCivilDateOrUtc(now, user.timezone);
  const since = dateKey(user.achievementsSince);
  const earliest = shiftDate(today, -STREAK_LOOKBACK_DAYS);
  const from = since > earliest ? since : earliest;
  const [records, changes] = await Promise.all([
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte: civilDateToUtcMidnight(from), lt: civilDateToUtcMidnight(shiftDate(today, 1)) } },
      select: { recordedAt: true, value: true },
    }),
    prisma.goalChange.findMany({ where: { userId, kind: 'SLEEP_MINUTES' } }),
  ]);
  // The same rollups the recap loader reads: a positive SLEEP value keyed by its date.
  const data: RecapData = new Map();
  for (const r of records) if (r.value > 0) data.set(dateKey(r.recordedAt), { sleepMinutes: r.value });
  const sleepChanges = goalChangesOf(
    changes.map((c) => ({ kind: c.kind, sleepMinutes: c.sleepMinutes, bedtime: c.bedtime, effectiveOn: dateKey(c.effectiveOn), resetsStreak: c.resetsStreak })),
    'SLEEP_MINUTES',
  );
  const days = sleepGoalDays({ today, since: from, data, sleepChanges, currentSleepGoal: resolveSleepGoalMinutes(user.sleepGoalMinutes) });
  return summariseRuns(days, { today, pausable: true }).current;
}
