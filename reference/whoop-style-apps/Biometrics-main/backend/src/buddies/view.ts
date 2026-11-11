// A buddy's week (spec 2026-10-06 buddies §5), built per request from (viewer, buddy) and the buddy's
// CURRENT switches (effectiveSharing). Nothing is cached or copied. A number whose switch is off is
// never put in the DTO; the raw week is loaded but only shared fields leave this function.

import type { AchievementFamily } from '@prisma/client';
import { FAMILIES } from '../achievements/catalogue';
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { STEPS_GOAL } from '../coach/tools/metrics';
import { prisma } from '../db/client';
import { loadRecapData } from '../recap/data';
import type { DayData } from '../recap/types';
import { shiftDate } from '../scoring/dates';
import { BuddyError } from './errors';
import { currentSleepStreak, moodFromScore, moodLine, todayMood, type Mood } from './mood';
import { findPair } from './pairs';
import { PERSON_SELECT, toPerson, type PersonDTO } from './people';
import { SHARE_KEYS, SHARING_SELECT, effectiveSharing, type ShareKey } from './sharing';

export interface DayValue { date: string; value: number | null }
export type NumberKey = 'recovery' | 'sleepScore' | 'hoursSlept' | 'steps';

export interface BuddyWeekDTO {
  buddy: PersonDTO;
  mood: Mood;
  moodLine: string;
  /** Whether the VIEWER muted this buddy (never visible to the buddy). */
  muted: boolean;
  /** 7 days, oldest first, ending on the buddy's local today; each tile is that day's own score. */
  tiles: Array<{ date: string; mood: Mood }>;
  shares: ShareKey[];
  numbers: Partial<Record<NumberKey, DayValue[]>>;
  /** Highest level per family, catalogue order; only with streaks & badges shared. */
  badges?: Array<{ family: AchievementFamily; level: number }>;
}

export async function buildBuddyWeek(viewerId: string, buddyId: string, now: Date): Promise<BuddyWeekDTO> {
  if (viewerId === buddyId || !(await findPair(viewerId, buddyId))) throw new BuddyError('not_buddies');
  const buddy = await prisma.user.findUnique({ where: { id: buddyId }, select: { ...PERSON_SELECT, ...SHARING_SELECT, timezone: true } });
  if (!buddy) throw new BuddyError('not_buddies');
  const sharing = effectiveSharing(buddy);
  const today = localCivilDateOrUtc(now, buddy.timezone);
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));
  const data = await loadRecapData(buddyId, buddy.timezone, dates[0]!, today, { bedtimes: false });

  const recovery = new Map<string, number>();
  for (const [date, day] of data) if (day.recovery !== undefined) recovery.set(date, day.recovery);
  const mood = todayMood(recovery, today);
  const yesterdaySteps = data.get(shiftDate(today, -1))?.steps;
  const movedALot = sharing.steps && yesterdaySteps !== undefined && yesterdaySteps >= STEPS_GOAL;
  const streakNights = sharing.streaks ? await currentSleepStreak(buddyId, now) : null;

  const series = (pick: (d: DayData) => number | undefined, round: (n: number) => number): DayValue[] =>
    dates.map((date) => {
      const day = data.get(date);
      const raw = day ? pick(day) : undefined;
      return { date, value: raw === undefined ? null : round(raw) };
    });
  const numbers: BuddyWeekDTO['numbers'] = {};
  if (sharing.recovery) numbers.recovery = series((d) => d.recovery, Math.round);
  if (sharing.sleepScore) numbers.sleepScore = series((d) => d.sleepScore, Math.round);
  if (sharing.hoursSlept) numbers.hoursSlept = series((d) => d.sleepMinutes, (m) => Math.round(m / 6) / 10);
  if (sharing.steps) numbers.steps = series((d) => d.steps, Math.round);

  const muted = (await prisma.buddyMute.findUnique({ where: { muterId_mutedId: { muterId: viewerId, mutedId: buddyId } } })) !== null;
  const week: BuddyWeekDTO = {
    buddy: toPerson(buddy),
    mood,
    moodLine: moodLine(mood, { movedALot, streakNights }),
    muted,
    tiles: dates.map((date) => ({ date, mood: moodFromScore(recovery.get(date)) })),
    shares: SHARE_KEYS.filter((key) => sharing[key]),
    numbers,
  };
  if (sharing.streaks) {
    const top = await prisma.achievement.groupBy({ by: ['family'], where: { userId: buddyId }, _max: { level: true } });
    const levels = new Map(top.map((r) => [r.family, r._max.level ?? 0]));
    week.badges = FAMILIES.flatMap((def) => {
      const level = levels.get(def.family) ?? 0;
      return level > 0 ? [{ family: def.family, level }] : [];
    });
  }
  return week;
}
