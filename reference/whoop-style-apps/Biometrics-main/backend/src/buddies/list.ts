// The buddy list (spec 2026-10-06 buddies §5): 30 a page by (lastActivityAt desc, id desc); each row
// is a person, their mood and mood line (no streak here) and an unseen-sticker flag. Moods and
// yesterday's steps come from ONE batched query each per page; steps only for buddies sharing them.
// buddyRows is shared with the Home scene (scene.ts).

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { STEPS_GOAL } from '../coach/tools/metrics';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';
import { encodeCursor, keysetBefore, parseCursor } from './cursor';
import { moodLine, todayMood, type Mood } from './mood';
import { PERSON_SELECT, toPerson, type PersonDTO } from './people';
import { countRequests } from './requests';
import { SHARING_SELECT, effectiveSharing } from './sharing';

export const BUDDY_PAGE_SIZE = 30;

export interface BuddyRowDTO extends PersonDTO {
  mood: Mood;
  moodLine: string;
  unseenSticker: boolean;
}

export interface BuddyPageDTO {
  buddies: BuddyRowDTO[];
  nextCursor: string | null;
  incomingRequests: number;
  outgoingRequests: number;
}

const key = (d: Date) => d.toISOString().slice(0, 10);

export async function listBuddies(viewerId: string, cursorRaw: unknown, now: Date, pageSize = BUDDY_PAGE_SIZE): Promise<BuddyPageDTO> {
  const cursor = parseCursor(cursorRaw);
  const pairs = await prisma.buddyPair.findMany({
    where: { AND: [{ OR: [{ userAId: viewerId }, { userBId: viewerId }] }, ...(cursor ? [keysetBefore('lastActivityAt', cursor)] : [])] },
    orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
  });
  const page = pairs.slice(0, pageSize);
  const ids = page.map((p) => (p.userAId === viewerId ? p.userBId : p.userAId));
  const counts = await countRequests(viewerId, now);
  if (ids.length === 0) return { buddies: [], nextCursor: null, incomingRequests: counts.incoming, outgoingRequests: counts.outgoing };

  const buddies = await buddyRows(viewerId, ids, now);
  const last = page[page.length - 1]!;
  return {
    buddies,
    nextCursor: pairs.length > pageSize ? encodeCursor({ at: last.lastActivityAt, id: last.id }) : null,
    incomingRequests: counts.incoming,
    outgoingRequests: counts.outgoing,
  };
}

/** The rows for these buddies, in the order given. A user who no longer exists is skipped. */
export async function buddyRows(viewerId: string, ids: string[], now: Date): Promise<BuddyRowDTO[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { ...PERSON_SELECT, ...SHARING_SELECT, timezone: true } });
  const sharesSteps = new Set(users.filter((u) => effectiveSharing(u).steps).map((u) => u.id));
  // Any zone's local today is UTC today ± 1, and its yesterday is within UTC today - 2.
  const utcToday = key(now);
  const window = { gte: civilDateToUtcMidnight(shiftDate(utcToday, -2)), lte: civilDateToUtcMidnight(shiftDate(utcToday, 1)) };
  const [scores, steps, unseen] = await Promise.all([
    prisma.dailyScore.findMany({ where: { userId: { in: ids }, type: 'RECOVERY', score: { not: null }, date: window }, select: { userId: true, date: true, score: true } }),
    sharesSteps.size > 0
      ? prisma.biometricRecord.findMany({ where: { userId: { in: [...sharesSteps] }, metricType: 'STEPS', recordedAt: window }, select: { userId: true, recordedAt: true, value: true } })
      : Promise.resolve([] as Array<{ userId: string; recordedAt: Date; value: number }>),
    prisma.sticker.groupBy({ by: ['fromUserId'], where: { toUserId: viewerId, fromUserId: { in: ids }, seenAt: null } }),
  ]);
  const unseenFrom = new Set(unseen.map((u) => u.fromUserId));

  const usersById = new Map(users.map((u) => [u.id, u] as const));
  return ids.flatMap((id): BuddyRowDTO[] => {
    const user = usersById.get(id);
    if (!user) return [];
    const today = localCivilDateOrUtc(now, user.timezone);
    const byDate = new Map(scores.filter((s) => s.userId === id).map((s) => [key(s.date), s.score!] as const));
    const mood = todayMood(byDate, today);
    const yesterday = shiftDate(today, -1);
    const moved = sharesSteps.has(id) && steps.some((s) => s.userId === id && key(s.recordedAt) === yesterday && s.value >= STEPS_GOAL);
    return [{ ...toPerson(user), mood, moodLine: moodLine(mood, { movedALot: moved }), unseenSticker: unseenFrom.has(id) }];
  });
}
