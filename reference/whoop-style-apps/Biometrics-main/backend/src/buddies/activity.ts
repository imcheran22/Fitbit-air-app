// The in-app Activity list (spec 2026-10-06 buddies §3, §6). Rows hold ids only; names, the sticker
// kind and the badge level are read now. BUDDY_BADGE rows show only while the earner currently
// shares streaks & badges (current consent). REQUEST rows are history: they stay after the request
// is answered and carry only the request id, never its status, so a declined, cancelled or blocked
// request reads exactly like any other. Kept 90 days, swept on read; 30 a page.

import type { AchievementFamily, Prisma, StickerKind } from '@prisma/client';
import { prisma } from '../db/client';
import { encodeCursor, keysetBefore, parseCursor } from './cursor';
import { PERSON_SELECT, toPerson, type PersonDTO } from './people';
import { backfillRequestActivity } from './requests';
import { SHARES_STREAKS_WHERE } from './sharing';

export const ACTIVITY_PAGE_SIZE = 30;
export const ACTIVITY_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivityKindDTO = 'sticker' | 'request' | 'paired' | 'badge';

export interface ActivityItemDTO {
  id: string;
  kind: ActivityKindDTO;
  createdAt: string;
  seen: boolean;
  actor: PersonDTO;
  sticker?: StickerKind;
  badge?: { family: AchievementFamily; level: number };
  requestId?: string;
}

export interface ActivityPageDTO { items: ActivityItemDTO[]; nextCursor: string | null; unseen: number }

/** Never from someone the recipient blocked (a backfill can race the block); badges only while shared. */
const visible = (recipientId: string): Prisma.BuddyActivityWhereInput => ({
  recipientId,
  actor: { blocksReceived: { none: { blockerId: recipientId } } },
  OR: [{ kind: { not: 'BUDDY_BADGE' } }, { kind: 'BUDDY_BADGE', actor: SHARES_STREAKS_WHERE }],
});

/** Unseen rows that would render: a sticker or badge row counts only while its sticker or badge exists. */
async function countUnseen(userId: string): Promise<number> {
  const rows = await prisma.buddyActivity.findMany({ where: { ...visible(userId), seenAt: null }, select: { kind: true, refId: true } });
  const refsOf = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.refId);
  const [stickers, badges] = await Promise.all([
    prisma.sticker.count({ where: { id: { in: refsOf('STICKER') } } }),
    prisma.achievement.count({ where: { id: { in: refsOf('BUDDY_BADGE') } } }),
  ]);
  return rows.filter((r) => r.kind !== 'STICKER' && r.kind !== 'BUDDY_BADGE').length + stickers + badges;
}

export async function listActivity(userId: string, cursorRaw: unknown, now: Date, pageSize = ACTIVITY_PAGE_SIZE): Promise<ActivityPageDTO> {
  const cursor = parseCursor(cursorRaw);
  // A lost buddy_request enqueue never loses the item: every visible incoming request gets its row.
  await backfillRequestActivity(userId, now);
  await prisma.buddyActivity.deleteMany({ where: { recipientId: userId, createdAt: { lt: new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * DAY_MS) } } });
  const rows = await prisma.buddyActivity.findMany({
    where: { AND: [visible(userId), ...(cursor ? [keysetBefore('createdAt', cursor)] : [])] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
    include: { actor: { select: PERSON_SELECT } },
  });
  const page = rows.slice(0, pageSize);
  const refs = (kind: string) => page.filter((r) => r.kind === kind).map((r) => r.refId);
  const [stickers, badges, unseen] = await Promise.all([
    prisma.sticker.findMany({ where: { id: { in: refs('STICKER') } }, select: { id: true, kind: true } }),
    prisma.achievement.findMany({ where: { id: { in: refs('BUDDY_BADGE') } }, select: { id: true, family: true, level: true } }),
    countUnseen(userId),
  ]);
  const items = page.flatMap((row): ActivityItemDTO[] => {
    const base = { id: row.id, createdAt: row.createdAt.toISOString(), seen: row.seenAt !== null, actor: toPerson(row.actor) };
    switch (row.kind) {
      case 'STICKER': {
        const sticker = stickers.find((s) => s.id === row.refId);
        return sticker ? [{ ...base, kind: 'sticker', sticker: sticker.kind }] : [];
      }
      case 'BUDDY_BADGE': {
        const badge = badges.find((b) => b.id === row.refId);
        return badge ? [{ ...base, kind: 'badge', badge: { family: badge.family, level: badge.level } }] : [];
      }
      case 'REQUEST':
        return [{ ...base, kind: 'request', requestId: row.refId }];
      case 'PAIRED':
        return [{ ...base, kind: 'paired' }];
      default:
        return [];
    }
  });
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > pageSize && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null, unseen };
}

export async function markActivitySeen(userId: string, now: Date): Promise<number> {
  const result = await prisma.buddyActivity.updateMany({ where: { recipientId: userId, seenAt: null }, data: { seenAt: now } });
  return result.count;
}
