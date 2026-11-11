// The Chats inbox (spec 2026-10-07 social §8.1): one row per conversation with a current buddy and a live message,
// newest first, 30 a page by (lastLiveMessageAt desc, id desc). Everything follows the newest LIVE message, never
// lastMessageAt (which an unsend leaves where it was): an unsent message is "shown as nothing", so it neither lifts a
// row, nor shows in the line, nor reaches a cursor. A row: the buddy, the newest live message (its "You:" side; a text
// is one line of at most 80 code points — it is the viewer's own conversation; a card is named by its type only, never
// its contents, and the app words stickers and cards), how many of their live messages I haven't read, and their
// activity status (reciprocal). Unread never depends on read receipts. The teal story ring is
// read by the app from the Social home it already has, so the inbox does no story work. `requests` counts incoming
// buddy requests for "Requests (N)". unreadChatsCount feeds /me/social unread.chats: conversations with at least one
// unread message from a CURRENT buddy. Message text is user free text: nothing here logs.

import { Prisma, type MessageKind, type StickerKind } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { encodeCursor, parseCursor } from '../buddies/cursor';
import { toPerson, type PersonDTO } from '../buddies/people';
import { countRequests } from '../buddies/requests';
import { CHAT_PERSON_SELECT } from './conversations';
import { activeAtFor, touchPresence } from './presence';
import { previewText } from './text';
import { cardTypeOf, type CardType } from './types';

export const CHATS_PAGE_SIZE = 30;

export interface LastMessageDTO { mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null; at: string }
export interface ChatRowDTO { buddy: PersonDTO; lastMessage: LastMessageDTO; unread: number; activeAt: string | null }
export interface ChatsPageDTO { chats: ChatRowDTO[]; nextCursor: string | null; requests: number }

interface ConversationRow { id: string; userAId: string; userBId: string; lastLiveMessageAt: Date }
interface LatestRow { conversationId: string; senderId: string; kind: MessageKind; text: string | null; sticker: StickerKind | null; card: unknown; createdAt: Date }

/**
 * One page of the viewer's conversations by (lastLiveMessageAt desc, id desc), on its indexes: the pair must still exist
 * (an unpair or block deletes the conversation in the same transaction, so this is a guard, as in unreadChatsCount),
 * and a conversation whose messages are all unsent (lastLiveMessageAt null) is not listed.
 */
function pageOfConversations(viewerId: string, cursor: { at: Date; id: string } | null, take: number): Promise<ConversationRow[]> {
  // The cursor's time is passed as UTC text, so the session time zone never shifts it against timestamp(3) columns.
  const after = cursor
    ? Prisma.sql`AND (c."lastLiveMessageAt", c."id") < (${cursor.at.toISOString()}::timestamptz AT TIME ZONE 'UTC', ${cursor.id})`
    : Prisma.empty;
  return prisma.$queryRaw<ConversationRow[]>`
    SELECT c."id", c."userAId", c."userBId", c."lastLiveMessageAt"
    FROM "Conversation" c
    WHERE (c."userAId" = ${viewerId} OR c."userBId" = ${viewerId})
      AND c."lastLiveMessageAt" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "BuddyPair" p WHERE p."userAId" = c."userAId" AND p."userBId" = c."userBId")
      ${after}
    ORDER BY c."lastLiveMessageAt" DESC, c."id" DESC
    LIMIT ${take}`;
}

/** Each conversation's newest live message: one query for the page, one (conversationId, createdAt, id) index walk each. */
async function latestMessages(ids: string[]): Promise<Map<string, LatestRow>> {
  const rows = await prisma.$queryRaw<LatestRow[]>`
    SELECT l.*
    FROM "Conversation" c
    CROSS JOIN LATERAL (
      SELECT m."conversationId", m."senderId", m."kind", m."text", m."sticker", m."card", m."createdAt"
      FROM "Message" m
      WHERE m."conversationId" = c."id" AND m."deletedAt" IS NULL
      ORDER BY m."createdAt" DESC, m."id" DESC
      LIMIT 1
    ) l
    WHERE c."id" IN (${Prisma.join(ids)})`;
  return new Map(rows.map((r) => [r.conversationId, r]));
}

/** Their live messages after my last read, per conversation: one query for the page. */
async function unreadByConversation(ids: string[], viewerId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ conversationId: string; unread: number }>>`
    SELECT m."conversationId", COUNT(*)::int AS "unread"
    FROM "Message" m
    LEFT JOIN "ConversationRead" r ON r."conversationId" = m."conversationId" AND r."readerId" = ${viewerId}
    WHERE m."conversationId" IN (${Prisma.join(ids)}) AND m."senderId" <> ${viewerId} AND m."deletedAt" IS NULL
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY m."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

export async function listChats(viewerId: string, cursorRaw: unknown, now: Date, pageSize = CHATS_PAGE_SIZE): Promise<ChatsPageDTO> {
  const cursor = parseCursor(cursorRaw);
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { chatActivityStatus: true } });
  if (!viewer) throw new BuddyError('not_buddies');
  await touchPresence(viewerId, now);
  const [conversations, requests] = await Promise.all([
    pageOfConversations(viewerId, cursor, pageSize + 1),
    countRequests(viewerId, now),
  ]);
  const page = conversations.slice(0, pageSize);
  if (page.length === 0) return { chats: [], nextCursor: null, requests: requests.incoming };
  const ids = page.map((c) => c.id);
  const otherOf = (c: { userAId: string; userBId: string }) => (c.userAId === viewerId ? c.userBId : c.userAId);
  const [latest, unread, people] = await Promise.all([
    latestMessages(ids),
    unreadByConversation(ids, viewerId),
    prisma.user.findMany({ where: { id: { in: page.map(otherOf) } }, select: CHAT_PERSON_SELECT }),
  ]);
  const personOf = new Map(people.map((p) => [p.id, p]));
  const chats = page.flatMap((c): ChatRowDTO[] => {
    const other = personOf.get(otherOf(c));
    // A last message unsent between the page read and this one: the row has nothing to show.
    const last = latest.get(c.id);
    if (!other || !last) return [];
    return [{
      buddy: toPerson(other),
      lastMessage: {
        mine: last.senderId === viewerId,
        kind: last.kind,
        text: last.text === null ? null : previewText(last.text),
        sticker: last.sticker,
        cardType: cardTypeOf(last.card),
        at: last.createdAt.toISOString(),
      },
      unread: unread.get(c.id) ?? 0,
      activeAt: activeAtFor(viewer, other, now),
    }];
  });
  const lastRow = page[page.length - 1]!;
  return {
    chats,
    nextCursor: conversations.length > pageSize ? encodeCursor({ at: lastRow.lastLiveMessageAt, id: lastRow.id }) : null,
    requests: requests.incoming,
  };
}

/**
 * Conversations with at least one unread live message from a current buddy (the pair row must still exist). One query.
 * Consistent with the inbox: such a conversation has a live message, so it is a listed row with unread > 0.
 */
export async function unreadChatsCount(viewerId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT m."conversationId")::int AS "count"
    FROM "Message" m
    JOIN "Conversation" c ON c."id" = m."conversationId"
    JOIN "BuddyPair" p ON p."userAId" = c."userAId" AND p."userBId" = c."userBId"
    LEFT JOIN "ConversationRead" r ON r."conversationId" = m."conversationId" AND r."readerId" = ${viewerId}
    WHERE (c."userAId" = ${viewerId} OR c."userBId" = ${viewerId})
      AND m."senderId" <> ${viewerId} AND m."deletedAt" IS NULL
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")`;
  return rows[0]?.count ?? 0;
}
