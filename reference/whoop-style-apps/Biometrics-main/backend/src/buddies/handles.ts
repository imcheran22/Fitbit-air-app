// Identity reads and the handle claim (spec 2026-10-06 buddies §2). A claim checks User.handle and
// HandleHold in ONE transaction; a unique-constraint race on either reads as handle_taken.

import { prisma } from '../db/client';
import { kipColourOf, type KipColourName } from '../kip/colours';
import { BuddyError, isUniqueViolation } from './errors';
import { holdActive, holdHandle } from './holds';
import { displayNamePrefill, handleHash } from './identity';

export interface BuddyIdentity {
  handle: string | null;
  displayName: string | null;
  displayNamePrefill: string;
  moodNoticeSeen: boolean;
  kipColour: KipColourName;
}

export async function getIdentity(userId: string): Promise<BuddyIdentity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true, displayName: true, name: true, email: true, buddyMoodNoticeAt: true, kipColour: true },
  });
  if (!user) return null;
  return {
    handle: user.handle,
    displayName: user.displayName,
    displayNamePrefill: displayNamePrefill(user),
    moodNoticeSeen: user.buddyMoodNoticeAt !== null,
    kipColour: kipColourOf(user.kipColour),
  };
}

/** Free, or already this user's, or held for this user (reclaim). `handle` is already normalised. */
export async function isHandleAvailable(userId: string, handle: string, now: Date): Promise<boolean> {
  const owner = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  if (owner) return owner.id === userId;
  const hold = await prisma.handleHold.findUnique({ where: { handleHash: handleHash(handle) } });
  return !hold || !holdActive(hold, now) || hold.previousOwnerId === userId;
}

/**
 * Saves a validated patch. The first setup needs both fields. A new handle: an active hold by
 * someone else → taken; a lapsed hold, or the owner's own, is deleted; the old handle is held.
 * After the update the hold is read again: a claim that waited on the owner moving away (the
 * unique index lock) now sees the hold that move committed, and is taken too. The user's row is
 * locked first (FOR NO KEY UPDATE), so two changes of one account run one after the other and the
 * second holds the handle the first one set.
 */
export async function updateIdentity(userId: string, patch: { handle?: string; displayName?: string }, now: Date): Promise<BuddyIdentity> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { handle: true } });
      if (!user) throw new BuddyError('not_found');
      if (!user.handle && (patch.handle === undefined || patch.displayName === undefined)) throw new BuddyError('setup_incomplete');
      const changing = patch.handle !== undefined && patch.handle !== user.handle;
      if (changing) {
        const hash = handleHash(patch.handle!);
        const hold = await tx.handleHold.findUnique({ where: { handleHash: hash } });
        if (hold && holdActive(hold, now) && hold.previousOwnerId !== userId) throw new BuddyError('handle_taken');
        if (hold) await tx.handleHold.deleteMany({ where: { handleHash: hash } });
        if (user.handle) await holdHandle(tx, user.handle, userId, now);
      }
      await tx.user.update({ where: { id: userId }, data: patch });
      if (changing) {
        const late = await tx.handleHold.findUnique({ where: { handleHash: handleHash(patch.handle!) } });
        if (late && holdActive(late, now) && late.previousOwnerId !== userId) throw new BuddyError('handle_taken');
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new BuddyError('handle_taken');
    throw err;
  }
  return (await getIdentity(userId))!;
}
