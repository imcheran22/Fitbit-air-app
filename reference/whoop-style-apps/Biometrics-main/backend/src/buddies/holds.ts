// Handle holds (spec 2026-10-06 buddies §2): a released handle is held 30 days as a keyed hash.

import type { Prisma, PrismaClient } from '@prisma/client';
import { handleHash } from './identity';

export const HANDLE_HOLD_DAYS = 30;
const HOLD_MS = HANDLE_HOLD_DAYS * 24 * 60 * 60 * 1000;

export type HoldDb = Prisma.TransactionClient | PrismaClient;

export const holdActive = (hold: { releasedAt: Date }, now: Date): boolean => hold.releasedAt.getTime() + HOLD_MS > now.getTime();

/** Holds `handle` from `now` for its previous owner; an existing hold is restarted and re-owned. */
export async function holdHandle(db: HoldDb, handle: string, previousOwnerId: string, now: Date): Promise<void> {
  const hash = handleHash(handle);
  await db.handleHold.upsert({
    where: { handleHash: hash },
    create: { handleHash: hash, previousOwnerId, releasedAt: now },
    update: { previousOwnerId, releasedAt: now },
  });
}
