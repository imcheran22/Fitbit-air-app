// The Home scene's buddies (spec 2026-10-13 Home F §4): at most two, by their latest check-in, newest first
// (createdAt, so editing a check-in moves no one), then those who never checked in, in the list's order. It
// looks across every pair, not a list page. Muted buddies are left out of the rows but counted in the total.
// No check-in time or date leaves here: the order is the only signal.

import { prisma } from '../db/client';
import { buddyRows, type BuddyRowDTO } from './list';
import { countRequests } from './requests';

export const SCENE_BUDDIES = 2;

export interface BuddySceneDTO {
  buddies: BuddyRowDTO[];
  total: number;
  incomingRequests: number;
}

export async function buddyScene(viewerId: string, now: Date): Promise<BuddySceneDTO> {
  const [pairs, mutes, counts] = await Promise.all([
    prisma.buddyPair.findMany({
      where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      select: { userAId: true, userBId: true },
    }),
    prisma.buddyMute.findMany({ where: { muterId: viewerId }, select: { mutedId: true } }),
    countRequests(viewerId, now),
  ]);
  const ids = pairs.map((p) => (p.userAId === viewerId ? p.userBId : p.userAId));
  const muted = new Set(mutes.map((m) => m.mutedId));
  const shown = ids.filter((id) => !muted.has(id));
  const latest = shown.length === 0
    ? []
    : await prisma.checkIn.groupBy({ by: ['authorId'], where: { authorId: { in: shown } }, _max: { createdAt: true } });
  const checkedAt = new Map(latest.map((l) => [l.authorId, l._max.createdAt?.getTime() ?? null] as const));
  // sort is stable, so the never-checked-in keep the list's order.
  const ordered = [...shown].sort((a, b) => {
    const x = checkedAt.get(a) ?? null;
    const y = checkedAt.get(b) ?? null;
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
    return y - x;
  });
  return {
    buddies: await buddyRows(viewerId, ordered.slice(0, SCENE_BUDDIES), now),
    total: ids.length,
    incomingRequests: counts.incoming,
  };
}
