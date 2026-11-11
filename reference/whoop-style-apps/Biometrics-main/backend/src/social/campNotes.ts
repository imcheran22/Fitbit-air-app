// Camp notes (spec 2026-10-07 social §6.3): one short note per author, shown in a speech bubble over their coach on
// the Campfire page. Sanitised like a display name (NFC; controls and format characters removed, so no newlines;
// trimmed; no reserved-word check), 1–40 code points with something visible. Sharing replaces the note. It clears
// at the next 06:00 in the author's zone or at their first check-in of a day at or after it, whichever is first
// (saveCheckIn deletes it; reads hide it too); expired rows are hidden at read time and deleted by the social sweep.
// 20 shares an hour per author, failing closed; clearing your own note is never limited and never fails closed.
// URLs and @handles are allowed in S2; reporting a note arrives in S3. No push.
// The text is user free text: never logged (not even its length), never sent to the coach, and never part of
// /me/social, the timeline, story frames or highlights. Only GET /me/camp returns it (camp.ts).

import { prisma } from '../db/client';
import { BuddyError, limitOrThrow } from '../buddies/errors';
import { hasVisibleCharacter, isWellFormed, sanitiseDisplayName } from '../buddies/identity';
import { RATE_LIMITS } from '../lib/rateLimit';
import type { Circle } from './circle';
import { nextSunrise } from './night';

export const CAMP_NOTE_MAX = 40;

export interface CampNoteDTO { text: string; createdAt: string; expiresAt: string }

/** The text to store, or null when it is not a valid note. */
export function checkCampNote(raw: unknown): string | null {
  // A lone surrogate is not text: Postgres cannot store it (a 500), so refuse it before sanitising and before the limiter.
  if (typeof raw !== 'string' || !isWellFormed(raw)) return null;
  const text = sanitiseDisplayName(raw);
  const length = [...text].length;
  return length >= 1 && length <= CAMP_NOTE_MAX && hasVisibleCharacter(text) ? text : null;
}

/** Live = not expired, and not cleared by its author's check-in at or after it. */
export function noteIsLive(note: { authorId: string; createdAt: Date; expiresAt: Date }, circle: Circle, now: Date): boolean {
  if (note.expiresAt.getTime() <= now.getTime()) return false;
  const checkIn = circle.checkIns.get(note.authorId);
  return !checkIn || checkIn.createdAt.getTime() < note.createdAt.getTime();
}

export async function shareCampNote(userId: string, raw: unknown, now: Date): Promise<CampNoteDTO> {
  const text = checkCampNote(raw);
  if (text === null) throw new BuddyError('invalid_note');
  await limitOrThrow(RATE_LIMITS.campNote, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new BuddyError('not_buddies');
  const expiresAt = nextSunrise(now, user.timezone);
  const row = await prisma.campNote.upsert({
    where: { authorId: userId },
    create: { authorId: userId, text, createdAt: now, expiresAt },
    // createdAt is overwritten with `now` on purpose: a replaced note is a new note, and the clear-on-check-in rule
    // (saveCheckIn, noteIsLive) compares createdAt with the day's first check-in.
    update: { text, createdAt: now, expiresAt },
    select: { text: true, createdAt: true, expiresAt: true },
  });
  return { text: row.text, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() };
}

/** Removing your own note always works: no rate limit, so a limiter outage never keeps words up. */
export async function clearCampNote(userId: string): Promise<void> {
  await prisma.campNote.deleteMany({ where: { authorId: userId } });
}
