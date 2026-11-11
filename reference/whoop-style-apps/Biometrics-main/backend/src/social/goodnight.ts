// "Say goodnight" (spec 2026-10-07 social §6.1): one Goodnight per author per evening (one said between 00:00 and
// 05:59 local belongs to the previous date), open from min(20:00, bedtime goal − 60 min) to 05:59 in the author's
// zone (owner ruling Q1; the night scene keeps 19:00), on time when it is at or before the bedtime goal + 15 min
// (23:00 with no goal), undoable for 10 minutes but never past the next 06:00 — only tonight's, never last night's
// (fix ruling, task 4). Always shared with buddies, like the check-in: self-reported, no number. No push (spec §10).

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { shiftDate } from '../scoring/dates';
import { GOODNIGHT_SELECT, type GoodnightRow } from './circle';
import { eveningDate, isGoodnightOpen, isOnTime, nextSunrise, zoneOrUtc } from './night';

export const GOODNIGHT_UNDO_MS = 10 * 60 * 1000;

export interface GoodnightDTO { localDate: string; at: string; onTime: boolean; undoUntil: string }

/** Undo ends 10 minutes after the goodnight or at the next 06:00 in the author's zone, whichever is first: at sunrise the evening moves on. */
export function goodnightUndoUntil(at: Date, timeZone: string): Date {
  return new Date(Math.min(at.getTime() + GOODNIGHT_UNDO_MS, nextSunrise(at, timeZone).getTime()));
}

export function toGoodnightDTO(row: Pick<GoodnightRow, 'localDate' | 'at' | 'onTime'>, timeZone: string): GoodnightDTO {
  return {
    localDate: row.localDate.toISOString().slice(0, 10),
    at: row.at.toISOString(),
    onTime: row.onTime,
    undoUntil: goodnightUndoUntil(row.at, timeZone).toISOString(),
  };
}

export async function sayGoodnight(userId: string, now: Date): Promise<GoodnightDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, bedtimeGoal: true } });
  if (!user) throw new BuddyError('not_buddies');
  const zone = zoneOrUtc(user.timezone);
  if (!isGoodnightOpen(now, zone, user.bedtimeGoal)) throw new BuddyError('goodnight_closed');
  const localDate = civilDateToUtcMidnight(eveningDate(now, zone));
  const onTime = isOnTime(now, zone, user.bedtimeGoal);
  // A second tap the same evening keeps the first goodnight: its time and its on-time verdict. An undo can delete
  // the row between the skipped insert and the read, so insert once more; the answer is always the row now stored.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await prisma.goodnight.createMany({ data: [{ authorId: userId, localDate, at: now, onTime }], skipDuplicates: true });
    const row = await prisma.goodnight.findUnique({ where: { authorId_localDate: { authorId: userId, localDate } }, select: GOODNIGHT_SELECT });
    if (row) return toGoodnightDTO(row, zone);
  }
  throw new Error('goodnight_not_stored');
}

/**
 * Undoes my goodnight for the current evening (localDate = eveningDate(now)) until its undoUntil; later →
 * undo_expired. Never yesterday's: after 06:00 the evening has moved on, so last night's goodnight is not undone —
 * but while it is still within its uncapped 10 minutes the answer is undo_expired, never a 204 the app would read as
 * "undone" while buddies still see it. Nothing recent → nothing to do.
 */
export async function undoGoodnight(userId: string, now: Date): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) return;
  const zone = zoneOrUtc(user.timezone);
  const evening = eveningDate(now, zone);
  const tonight = await prisma.goodnight.findUnique({
    where: { authorId_localDate: { authorId: userId, localDate: civilDateToUtcMidnight(evening) } },
    select: { id: true, at: true },
  });
  if (!tonight) {
    const lastNight = await prisma.goodnight.findUnique({
      where: { authorId_localDate: { authorId: userId, localDate: civilDateToUtcMidnight(shiftDate(evening, -1)) } },
      select: { at: true },
    });
    if (lastNight && now.getTime() - lastNight.at.getTime() <= GOODNIGHT_UNDO_MS) throw new BuddyError('undo_expired');
    return;
  }
  if (now.getTime() > goodnightUndoUntil(tonight.at, zone).getTime()) throw new BuddyError('undo_expired');
  await prisma.goodnight.deleteMany({ where: { id: tonight.id } });
}
