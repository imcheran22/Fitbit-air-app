// Chats notes (spec 2026-10-07 social §8.1): a short status over its author's avatar in the inbox, for 24 hours. One per
// author; sharing replaces it (new time, new expiry); clearing deletes it and is never limited or failed closed.
// Sanitised like a camp note (no newlines), 1-60 code points with something visible. Seen only by the author and
// their CURRENT buddies (pairs are read live: an unpair or block hides it at once); expired notes are hidden at read
// time and deleted by the social sweep. Not cleared by a check-in (that rule is the camp note's). No push.
// The text is user free text: never logged (not even its length), never sent to the coach.

import { prisma } from '../db/client';
import { BuddyError, limitOrThrow } from '../buddies/errors';
import { PERSON_SELECT, toPerson, type PersonDTO } from '../buddies/people';
import { RATE_LIMITS } from '../lib/rateLimit';
import { buddyIdsOf } from '../social/circle';
import { checkStatusNote } from './text';

export const STATUS_NOTE_TTL_MS = 24 * 60 * 60 * 1000;

export interface StatusNoteDTO { text: string; createdAt: string; expiresAt: string }
export interface BuddyNoteDTO extends StatusNoteDTO { person: PersonDTO }
export interface NotesDTO { mine: StatusNoteDTO | null; buddies: BuddyNoteDTO[] }

const toDTO = (n: { text: string; createdAt: Date; expiresAt: Date }): StatusNoteDTO => ({
  text: n.text,
  createdAt: n.createdAt.toISOString(),
  expiresAt: n.expiresAt.toISOString(),
});

/** An account deleted mid-call (no FK target, no row to update). */
function isGoneRace(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'P2003' || code === 'P2025';
}

/** My live note and my current buddies' live notes, newest first. */
export async function getNotes(viewerId: string, now: Date): Promise<NotesDTO> {
  const buddyIds = await buddyIdsOf(viewerId);
  const rows = await prisma.statusNote.findMany({
    where: { authorId: { in: [viewerId, ...buddyIds] }, expiresAt: { gt: now } },
    orderBy: [{ createdAt: 'desc' }, { authorId: 'asc' }],
    select: { authorId: true, text: true, createdAt: true, expiresAt: true, author: { select: PERSON_SELECT } },
  });
  const mine = rows.find((r) => r.authorId === viewerId);
  return {
    mine: mine ? toDTO(mine) : null,
    buddies: rows.filter((r) => r.authorId !== viewerId).map((r) => ({ person: toPerson(r.author), ...toDTO(r) })),
  };
}

/**
 * Shares (or replaces) my note. The text is checked before the limiter, so a bad note never spends the bucket. A
 * racing account deletion is a coded refusal, never a raw P2003/P2025.
 */
export async function shareStatusNote(userId: string, raw: unknown, now: Date): Promise<StatusNoteDTO> {
  const text = checkStatusNote(raw);
  if (text === null) throw new BuddyError('invalid_status_note');
  await limitOrThrow(RATE_LIMITS.statusNote, userId);
  const expiresAt = new Date(now.getTime() + STATUS_NOTE_TTL_MS);
  try {
    const row = await prisma.statusNote.upsert({
      where: { authorId: userId },
      create: { authorId: userId, text, createdAt: now, expiresAt },
      update: { text, createdAt: now, expiresAt },
      select: { text: true, createdAt: true, expiresAt: true },
    });
    return toDTO(row);
  } catch (err) {
    if (isGoneRace(err)) throw new BuddyError('not_buddies');
    throw err;
  }
}

/** Removing your own note always works: no limiter, so an outage never keeps words up. */
export async function clearStatusNote(userId: string): Promise<void> {
  await prisma.statusNote.deleteMany({ where: { authorId: userId } });
}
