// Morning check-in (spec 2026-10-07 social §4.1): Rested / Okay / Tired, one per author per LOCAL day, editable
// until local midnight, always shared with buddies (self-reported, no number).
// Checking in also clears the author's older camp note (spec §6.3).

import type { CheckInMood } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { shiftDate } from '../scoring/dates';

export const CHECKIN_MOODS: readonly CheckInMood[] = ['RESTED', 'OKAY', 'TIRED'];

export interface CheckInDTO {
  mood: CheckInMood;
  localDate: string;
  updatedAt: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const toCheckInDTO = (row: { mood: CheckInMood; localDate: Date; updatedAt: Date }): CheckInDTO => ({
  mood: row.mood,
  localDate: isoDate(row.localDate),
  updatedAt: row.updatedAt.toISOString(),
});

/** The user's zone and civil "today". */
export async function todayFor(userId: string, now: Date): Promise<{ timezone: string; today: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return { timezone: user.timezone, today: localCivilDateOrUtc(now, user.timezone) };
}

export async function getTodayCheckIn(userId: string, now: Date): Promise<CheckInDTO | null> {
  const { today } = await todayFor(userId, now);
  const row = await prisma.checkIn.findUnique({
    where: { authorId_localDate: { authorId: userId, localDate: civilDateToUtcMidnight(today) } },
    select: { mood: true, localDate: true, updatedAt: true },
  });
  return row ? toCheckInDTO(row) : null;
}

/**
 * The run of consecutive local days with a check-in, ending today; while today has none yet, the run ending
 * yesterday still counts, so a streak only breaks once a whole day is missed.
 */
export async function checkInStreak(userId: string, now: Date): Promise<number> {
  const { today } = await todayFor(userId, now);
  const rows = await prisma.checkIn.findMany({
    where: { authorId: userId, localDate: { lte: civilDateToUtcMidnight(today) } },
    select: { localDate: true },
    orderBy: { localDate: 'desc' },
  });
  const dates = new Set(rows.map((r) => isoDate(r.localDate)));
  let cursor = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export async function saveCheckIn(userId: string, mood: unknown, now: Date): Promise<CheckInDTO> {
  if (!(CHECKIN_MOODS as readonly unknown[]).includes(mood)) throw new BuddyError('invalid_checkin');
  const { today } = await todayFor(userId, now);
  const localDate = civilDateToUtcMidnight(today);
  const row = await prisma.checkIn.upsert({
    where: { authorId_localDate: { authorId: userId, localDate } },
    create: { authorId: userId, localDate, mood: mood as CheckInMood, createdAt: now },
    update: { mood: mood as CheckInMood },
    select: { mood: true, localDate: true, createdAt: true, updatedAt: true },
  });
  // A camp note clears when its author checks in (spec §6.3): notes written at or before the day's first check-in
  // go; one written after it survives later edits of that check-in.
  await prisma.campNote.deleteMany({ where: { authorId: userId, createdAt: { lte: row.createdAt } } });
  return toCheckInDTO(row);
}
