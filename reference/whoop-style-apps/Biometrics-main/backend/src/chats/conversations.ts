// The pair's conversation (spec 2026-10-07 social §8.2): stored once with userAId < userBId (like BuddyPair), made by
// the first message. writeMessageTx is the ONLY writer of messages — chat sends and every sticker send
// (buddies/stickers.ts) — and runs inside the caller's transaction after its pair check: that check updates the pair
// row (locking it), so an unpair or block waits for the send and then deletes the conversation, new message included
// (relations.ts). Message text is user free text: nothing here logs.

import type { MessageKind, Prisma, PrismaClient, StickerKind } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { findPair, isBlockedEitherWay, orderedPair } from '../buddies/pairs';
import { PERSON_SELECT } from '../buddies/people';
import type { StoredCard } from './types';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** A chat route's view of a person: who they are, and the settings the reciprocal rules read. */
export const CHAT_PERSON_SELECT = { ...PERSON_SELECT, chatReadReceipts: true, chatActivityStatus: true, lastActiveAt: true } as const;
export type ChatPerson = Prisma.UserGetPayload<{ select: typeof CHAT_PERSON_SELECT }>;

/**
 * Both people of a chat route, or not_buddies: no pair, a block either way, or a missing account. The same three reads
 * run every time, so a block costs no extra work.
 */
export async function requireChatPeople(viewerId: string, buddyId: string): Promise<{ viewer: ChatPerson; buddy: ChatPerson }> {
  const [pair, blocked, users] = await Promise.all([
    findPair(viewerId, buddyId),
    isBlockedEitherWay(viewerId, buddyId),
    prisma.user.findMany({ where: { id: { in: [viewerId, buddyId] } }, select: CHAT_PERSON_SELECT }),
  ]);
  const viewer = users.find((u) => u.id === viewerId);
  const buddy = users.find((u) => u.id === buddyId);
  if (!pair || blocked || !viewer || !buddy) throw new BuddyError('not_buddies');
  return { viewer, buddy };
}

/** Inside a send's transaction: no pair, or a block either way, is not_buddies. Bumps (and locks) the pair row. */
export async function requireLivePairTx(tx: Tx, senderId: string, recipientId: string, now: Date): Promise<void> {
  const blocked = await isBlockedEitherWay(senderId, recipientId, tx);
  const bumped = await tx.buddyPair.updateMany({ where: orderedPair(senderId, recipientId), data: { lastActivityAt: now } });
  if (bumped.count === 0 || blocked) throw new BuddyError('not_buddies');
}

export async function findConversationId(a: string, b: string, db: Db = prisma): Promise<string | null> {
  const row = await db.conversation.findUnique({ where: { userAId_userBId: orderedPair(a, b) }, select: { id: true } });
  return row?.id ?? null;
}

/** Moves a reader's lastReadAt forward, never back; safe when two calls race. */
export async function moveRead(db: Db, conversationId: string, readerId: string, at: Date): Promise<void> {
  const created = await db.conversationRead.createMany({ data: [{ conversationId, readerId, lastReadAt: at }], skipDuplicates: true });
  if (created.count > 0) return;
  await db.conversationRead.updateMany({ where: { conversationId, readerId, lastReadAt: { lt: at } }, data: { lastReadAt: at } });
}

export interface NewMessage {
  senderId: string;
  recipientId: string;
  kind: MessageKind;
  text?: string | null;
  sticker?: StickerKind | null;
  card?: StoredCard | null;
  replyToMessageId?: string | null;
  now: Date;
}

/**
 * Inside the caller's transaction, after its pair check: the pair's conversation (made on first use; a concurrent
 * first message waits on the insert), its lastMessageAt bumped, the reply target checked (a live message of this
 * conversation, else message_gone), the message stored, and the sender's own read moved to it. Returns the id.
 * Sends commit in pair-lock order, not in `now` order, so the stamp is max(now, lastMessageAt + 1 ms): a send that
 * waited on the lock still lands after the newest message, so lastMessageAt never goes back and a message never
 * hides behind the other person's read mark (a hidden unread, a false "Seen"). The read below runs under the pair
 * lock the caller's check took, so no other send moves lastMessageAt until this transaction ends.
 */
export async function writeMessageTx(tx: Tx, m: NewMessage): Promise<string> {
  const pair = orderedPair(m.senderId, m.recipientId);
  const made = await tx.conversation.createMany({ data: [{ ...pair, createdAt: m.now, lastMessageAt: m.now, lastLiveMessageAt: m.now }], skipDuplicates: true });
  const current = await tx.conversation.findUniqueOrThrow({ where: { userAId_userBId: pair }, select: { id: true, lastMessageAt: true } });
  const at = made.count > 0 ? m.now : new Date(Math.max(m.now.getTime(), current.lastMessageAt.getTime() + 1));
  // The new message is the newest live one too (the inbox order); an unsend recomputes it (messages.ts).
  const conversation = await tx.conversation.update({ where: { id: current.id }, data: { lastMessageAt: at, lastLiveMessageAt: at }, select: { id: true } });
  if (m.replyToMessageId) {
    const target = await tx.message.findFirst({ where: { id: m.replyToMessageId, conversationId: conversation.id, deletedAt: null }, select: { id: true } });
    if (!target) throw new BuddyError('message_gone');
  }
  const message = await tx.message.create({
    data: {
      conversationId: conversation.id,
      senderId: m.senderId,
      kind: m.kind,
      text: m.text ?? null,
      sticker: m.sticker ?? null,
      ...(m.card ? { card: m.card as unknown as Prisma.InputJsonValue } : {}),
      replyToMessageId: m.replyToMessageId ?? null,
      createdAt: at,
    },
    select: { id: true },
  });
  await moveRead(tx, conversation.id, m.senderId, at);
  return message.id;
}
