// Messages (spec 2026-10-07 social §8.2): TEXT, STICKER (through the Buddies sticker, so its 5-a-day limit, unseen
// flag and buddy_sticker push stay in one place) and CARD. Only buddies; every refusal for a non-buddy is not_buddies.
// The order is: the body's shape (invalid_* before the limiter, so a malformed body spends nothing), the limiter
// (before the pair, like stickers: it counts only the sender's own sends and reveals nothing), then one transaction
// that checks the pair, writes and reads back the message it returns (after the commit a racing unpair could already
// have deleted it). Text is user free text: never logged, never sent to the coach.

import { Prisma, type MessageKind, type PrismaClient, type StickerKind } from '@prisma/client';
import { prisma } from '../db/client';
import { encodeCursor, keysetBefore, parseCursor } from '../buddies/cursor';
import { BuddyError, UUID_RE, limitOrThrow } from '../buddies/errors';
import { pushName } from '../buddies/notify';
import { enqueueBuddyNotice } from '../buddies/notifyQueue';
import type { PairDeps } from '../buddies/pairs';
import { toPerson } from '../buddies/people';
import { STICKER_KINDS, sendSticker } from '../buddies/stickers';
import { RATE_LIMITS } from '../lib/rateLimit';
import { buildCard, gateCard, loadCardGate, parseCardRequest, type CardGate, type CardRequest } from './cards';
import { findConversationId, moveRead, requireChatPeople, requireLivePairTx, writeMessageTx } from './conversations';
import { activeAtFor, touchPresence } from './presence';
import { checkMessageText, previewText } from './text';
import { cardTypeOf, type MessageDTO, type ReactionDTO, type StoredCard, type ThreadDTO } from './types';

export const MESSAGE_SELECT = {
  id: true,
  senderId: true,
  kind: true,
  text: true,
  sticker: true,
  card: true,
  createdAt: true,
  replyTo: { select: { id: true, senderId: true, kind: true, text: true, sticker: true, card: true, deletedAt: true } },
  // reactorId breaks a same-millisecond tie, so badges keep their order between polls.
  reactions: { select: { reactorId: true, kind: true }, orderBy: [{ createdAt: 'asc' }, { reactorId: 'asc' }] },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

/** `gate`: from loadCardGate over the rows' cards (one per page), so a card serves only what is still shared now. */
export function toMessageDTO(row: MessageRow, viewerId: string, gate: CardGate): MessageDTO {
  const r = row.replyTo;
  return {
    id: row.id,
    mine: row.senderId === viewerId,
    kind: row.kind,
    text: row.text,
    sticker: row.sticker,
    card: gateCard(row.card, gate),
    replyTo: r === null
      ? null
      : r.deletedAt !== null
        ? { id: r.id, gone: true }
        : { id: r.id, gone: false, mine: r.senderId === viewerId, kind: r.kind, text: r.text === null ? null : previewText(r.text), sticker: r.sticker, cardType: cardTypeOf(r.card) },
    reactions: row.reactions.map((x) => ({ kind: x.kind, mine: x.reactorId === viewerId })),
    createdAt: row.createdAt.toISOString(),
  };
}

/** A send passes its transaction: read after the commit, a racing unpair could already have deleted the message. */
export async function loadMessageDTO(id: string, viewerId: string, db: Prisma.TransactionClient | PrismaClient = prisma): Promise<MessageDTO> {
  const row = await db.message.findUniqueOrThrow({ where: { id }, select: MESSAGE_SELECT });
  return toMessageDTO(row, viewerId, await loadCardGate([row.card], db));
}

/** Absent → null; anything but a uuid → message_gone (it can't name a message). */
function parseReplyTo(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) throw new BuddyError('message_gone');
  return raw;
}

/**
 * After the commit the message exists, so the send answers it whatever happens next: a failure here (a pool timeout,
 * a failover) is logged by class and ids only, never as a 500 the app would retry into a duplicate message.
 */
async function afterSend(messageId: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(JSON.stringify({ event: 'chats.after_send_failed', messageId, error: err instanceof Error ? err.name : 'unknown' }));
  }
}

/** After commit, one dm_message job per TEXT or CARD message, whatever the recipient's settings (the job decides). It carries the message id and the sender's name (read before the write), never the text. */
async function enqueueDmNotice(senderId: string, senderName: string, recipientId: string, messageId: string, deps: PairDeps): Promise<void> {
  await enqueueBuddyNotice(
    { kind: 'dm_message', recipientId, actorId: senderId, refId: messageId, slots: { name: senderName } },
    deps.notifyQueue ? { queue: deps.notifyQueue } : {},
  );
}

/**
 * Body: { kind: 'TEXT', text } | { kind: 'STICKER', sticker } | { kind: 'CARD', card, text? }, each with an optional
 * replyToMessageId. Returns the stored message as the sender sees it.
 */
export async function sendMessage(senderId: string, buddyId: string, body: unknown, now: Date, deps: PairDeps = {}): Promise<MessageDTO> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const replyToMessageId = parseReplyTo(b.replyToMessageId);
  if (b.kind === 'STICKER') {
    const { message } = await sendSticker(senderId, buddyId, b.sticker, now, deps, {
      replyToMessageId,
      readMessageTx: (tx, messageId) => loadMessageDTO(messageId, senderId, tx),
    });
    await afterSend(message.id, () => touchPresence(senderId, now));
    return message;
  }
  let kind: MessageKind;
  let text: string | null;
  let cardRequest: CardRequest | null = null;
  if (b.kind === 'TEXT') {
    kind = 'TEXT';
    text = checkMessageText(b.text);
    if (text === null) throw new BuddyError('invalid_message');
  } else if (b.kind === 'CARD') {
    kind = 'CARD';
    cardRequest = parseCardRequest(b.card);
    // A card's reply text is optional; when sent it must be valid (whitespace only is refused: the app sends none).
    const hasText = b.text !== undefined && b.text !== null;
    text = hasText ? checkMessageText(b.text) : null;
    if (cardRequest === null || (hasText && text === null)) throw new BuddyError('invalid_message');
  } else {
    throw new BuddyError('invalid_message');
  }
  await limitOrThrow(RATE_LIMITS.message, senderId);
  await limitOrThrow(RATE_LIMITS.messageDay, senderId);
  // After the limiter (probing spends a token) and before the transaction (it only reads; the tx re-checks the pair).
  const card: StoredCard | null = cardRequest ? await buildCard(senderId, buddyId, cardRequest, now) : null;
  // The push names the sender: read before the write, so nothing that can fail runs between the commit and the answer.
  const me = await prisma.user.findUnique({ where: { id: senderId }, select: { displayName: true, handle: true } });
  if (!me) throw new BuddyError('not_buddies');
  // The returned message is read inside the transaction (an unpair waits on the pair lock, then deletes it).
  const message = await prisma.$transaction(async (tx) => {
    await requireLivePairTx(tx, senderId, buddyId, now);
    const messageId = await writeMessageTx(tx, { senderId, recipientId: buddyId, kind, text, card, replyToMessageId, now });
    return loadMessageDTO(messageId, senderId, tx);
  });
  await afterSend(message.id, async () => {
    await enqueueDmNotice(senderId, pushName(me), buddyId, message.id, deps);
    await touchPresence(senderId, now);
  });
  return message;
}

export const THREAD_PAGE_SIZE = 50;

/**
 * One page of the thread, oldest first: the newest page without `before` (what the app polls every 5 s), else the page
 * before that cursor. Unsent messages are never returned. A pair with no conversation yet is an empty thread. "Seen"
 * and activity status follow the reciprocal settings. Every card on the page goes through one card gate, so it serves
 * only what is still shared now. Reading touches the reader's presence.
 */
export async function listThread(viewerId: string, buddyId: string, beforeRaw: unknown, now: Date, pageSize = THREAD_PAGE_SIZE): Promise<ThreadDTO> {
  const before = parseCursor(beforeRaw);
  const { viewer, buddy } = await requireChatPeople(viewerId, buddyId);
  await touchPresence(viewerId, now);
  const activeAt = activeAtFor(viewer, buddy, now);
  const conversationId = await findConversationId(viewerId, buddyId);
  if (!conversationId) return { buddy: toPerson(buddy), messages: [], nextBefore: null, seenAt: null, activeAt };
  const receipts = viewer.chatReadReceipts && buddy.chatReadReceipts;
  const [rows, newestElsewhere, read] = await Promise.all([
    prisma.message.findMany({
      where: { AND: [{ conversationId, deletedAt: null }, ...(before ? [keysetBefore('createdAt', before)] : [])] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: MESSAGE_SELECT,
    }),
    // An older page does not hold the thread's newest message; the newest page does (its first row).
    receipts && before ? newestLiveMessage(conversationId) : Promise.resolve(null),
    receipts
      ? prisma.conversationRead.findUnique({ where: { conversationId_readerId: { conversationId, readerId: buddyId } }, select: { lastReadAt: true } })
      : Promise.resolve(null),
  ]);
  const newest = before ? newestElsewhere : (rows[0] ?? null);
  const page = rows.slice(0, pageSize);
  const oldest = page[page.length - 1];
  const gate = await loadCardGate(page.map((row) => row.card));
  return {
    buddy: toPerson(buddy),
    messages: page.reverse().map((row) => toMessageDTO(row, viewerId, gate)),
    nextBefore: rows.length > pageSize && oldest ? encodeCursor({ at: oldest.createdAt, id: oldest.id }) : null,
    seenAt: seenAtFor(viewerId, newest, read),
    activeAt,
  };
}

function newestLiveMessage(conversationId: string): Promise<{ senderId: string; createdAt: Date } | null> {
  return prisma.message.findFirst({
    where: { conversationId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { senderId: true, createdAt: true },
  });
}

/**
 * "Seen" is the time of the thread's newest live message, only when it is mine and the buddy's read has reached it
 * (`read` is null unless both have read receipts on). The buddy's lastReadAt itself is never sent: it moves on every
 * open and poll, so it would show when they are in the thread even with activity status off.
 */
function seenAtFor(viewerId: string, newest: { senderId: string; createdAt: Date } | null, read: { lastReadAt: Date } | null): string | null {
  if (!newest || !read || newest.senderId !== viewerId || read.lastReadAt < newest.createdAt) return null;
  return newest.createdAt.toISOString();
}

/** A conversation an unpair or block deleted mid-call (no FK target, no row): there is nothing left to mark. */
function isGoneRace(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'P2003' || code === 'P2025';
}

/**
 * The thread is open: my read moves to now (never back), and that buddy's unseen stickers to me are seen. A message
 * can be stamped just after now (a send waiting on the pair lock lands at lastMessageAt + 1 ms; another instance's
 * clock may run ahead), so the read moves to the newest live message when that is later. A racing unpair or block
 * that deletes the conversation leaves nothing to mark, so that ends quietly rather than as a 500.
 */
export async function markRead(viewerId: string, buddyId: string, now: Date): Promise<void> {
  await requireChatPeople(viewerId, buddyId);
  const conversationId = await findConversationId(viewerId, buddyId);
  if (conversationId) {
    try {
      const newest = await newestLiveMessage(conversationId);
      await moveRead(prisma, conversationId, viewerId, newest && newest.createdAt > now ? newest.createdAt : now);
    } catch (err) {
      if (!isGoneRace(err)) throw err;
      return;
    }
  }
  await prisma.sticker.updateMany({ where: { fromUserId: buddyId, toUserId: viewerId, seenAt: null }, data: { seenAt: now } });
}

/**
 * One reaction per person per message (spec §8.2), one of the four sticker kinds: setting another replaces mine.
 * Either person may react to any live message of the pair's conversation. The order: the kind (before the limiter, so
 * a malformed body spends nothing), the limiter (fails closed), the pair (a non-buddy is not_buddies whatever the
 * message id), then the message. The write holds the message row FOR SHARE: an unsend (which updates the row) either
 * waits and then deletes this reaction with the rest, or goes first and this finds the message gone; an unpair's
 * conversation delete waits the same way. A reactor account deleted mid-write (FK) is not_buddies, never a 500.
 */
export async function setReaction(viewerId: string, buddyId: string, messageId: string, kind: unknown, now: Date): Promise<{ reactions: ReactionDTO[] }> {
  if (!(STICKER_KINDS as readonly unknown[]).includes(kind)) throw new BuddyError('invalid_reaction');
  await limitOrThrow(RATE_LIMITS.reaction, viewerId);
  await requireChatPeople(viewerId, buddyId);
  const conversationId = UUID_RE.test(messageId) ? await findConversationId(viewerId, buddyId) : null;
  if (!conversationId) throw new BuddyError('message_gone');
  try {
    return await prisma.$transaction(async (tx) => {
      const live = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Message"
        WHERE "id" = ${messageId} AND "conversationId" = ${conversationId} AND "deletedAt" IS NULL
        FOR SHARE`;
      if (live.length === 0) throw new BuddyError('message_gone');
      const reaction = { kind: kind as StickerKind, createdAt: now };
      const created = await tx.messageReaction.createMany({ data: [{ messageId, reactorId: viewerId, ...reaction }], skipDuplicates: true });
      if (created.count === 0) await tx.messageReaction.updateMany({ where: { messageId, reactorId: viewerId }, data: reaction });
      const rows = await tx.messageReaction.findMany({ where: { messageId }, orderBy: [{ createdAt: 'asc' }, { reactorId: 'asc' }], select: { reactorId: true, kind: true } });
      return { reactions: rows.map((r) => ({ kind: r.kind, mine: r.reactorId === viewerId })) };
    });
  } catch (err) {
    if (isGoneRace(err)) throw new BuddyError('not_buddies');
    throw err;
  }
}

/** Removing my reaction is never limited and never fails for a buddy: nothing to remove is fine. */
export async function clearReaction(viewerId: string, buddyId: string, messageId: string): Promise<void> {
  await requireChatPeople(viewerId, buddyId);
  const conversationId = UUID_RE.test(messageId) ? await findConversationId(viewerId, buddyId) : null;
  if (!conversationId) return;
  // Scoped to this pair's conversation: another buddy's thread is never touched through this one.
  await prisma.messageReaction.deleteMany({ where: { messageId, reactorId: viewerId, message: { conversationId } } });
}

/**
 * The sender takes a message back (spec §8.2, "shown as nothing"): one transaction sets deletedAt, clears its text,
 * sticker and card, deletes its reactions and recomputes the conversation's lastLiveMessageAt; reads skip it from then on and a reply to it reads as gone. A sticker's
 * Buddies row stays (plan ruling: it still counts toward the day's 5). Never limited; a repeat is fine. Someone else's
 * message, or none, is message_gone. Racing an unpair, the update finds nothing to change: never a 500.
 */
export async function unsendMessage(viewerId: string, buddyId: string, messageId: string, now: Date): Promise<void> {
  await requireChatPeople(viewerId, buddyId);
  const conversationId = UUID_RE.test(messageId) ? await findConversationId(viewerId, buddyId) : null;
  const row = conversationId
    ? await prisma.message.findFirst({ where: { id: messageId, conversationId, senderId: viewerId }, select: { deletedAt: true } })
    : null;
  if (!row) throw new BuddyError('message_gone');
  if (row.deletedAt) return;
  await prisma.$transaction(async (tx) => {
    // The conversation row first: the same order as a send (pair, conversation, message) and an unpair's cascade
    // (pair, conversation, messages), so neither can deadlock with this; a send waits, and the recompute below (a new
    // statement, so a fresh snapshot) sees every committed message. Gone under an unpair: nothing below changes a row.
    await tx.$queryRaw`SELECT 1 FROM "Conversation" WHERE "id" = ${conversationId} FOR NO KEY UPDATE`;
    await tx.message.updateMany({ where: { id: messageId, deletedAt: null }, data: { deletedAt: now, text: null, sticker: null, card: Prisma.DbNull } });
    await tx.messageReaction.deleteMany({ where: { messageId } });
    // The inbox orders by the newest LIVE message: an unsent one must neither hold a row up nor reach a cursor.
    await tx.$executeRaw`
      UPDATE "Conversation" SET "lastLiveMessageAt" =
        (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."conversationId" = ${conversationId} AND m."deletedAt" IS NULL)
      WHERE "id" = ${conversationId}`;
  });
}
