// Stickers (spec 2026-10-06 buddies §4): only between buddies, at most 5 per buddy per day counted
// in the database in the SENDER's local day (a concurrent race may let a sixth through; accepted).
// The limit is checked before the pair: it counts only the sender's own sends, so it reveals
// nothing about the other person. The pair update, the sticker insert, the STICKER Activity row and (S3) the STICKER
// message in the pair's conversation share a transaction: a sticker sent while the pair is being removed is dropped
// (not_buddies). Every sticker send — the thread, the timeline, a buddy's week, a story reply, the inbox's quick
// sticker — lands in the thread this way (spec 2026-10-07 social §8.2); its push stays buddy_sticker, never also a
// dm_message.

import type { Prisma, StickerKind } from '@prisma/client';
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { writeMessageTx } from '../chats/conversations';
import type { MessageDTO } from '../chats/types';
import { prisma } from '../db/client';
import { BuddyError } from './errors';
import { pushName } from './notify';
import { enqueueBuddyNotice } from './notifyQueue';
import { isBlockedEitherWay, orderedPair, type PairDeps } from './pairs';

export const STICKER_KINDS: readonly StickerKind[] = ['CHEER', 'HEART', 'REST_UP', 'STAR'];
export const STICKERS_PER_BUDDY_PER_DAY = 5;
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

/**
 * `opts.readMessageTx` reads the new STICKER message inside the send's transaction (chats/messages.ts): read after
 * the commit, an unpair landing in between would already have deleted it. Given it, `message` is that read.
 */
type ReadMessageTx = (tx: Prisma.TransactionClient, messageId: string) => Promise<MessageDTO>;
export function sendSticker(
  fromId: string,
  toId: string,
  kind: unknown,
  now: Date,
  deps: PairDeps,
  opts: { replyToMessageId?: string | null; readMessageTx: ReadMessageTx },
): Promise<{ id: string; messageId: string; message: MessageDTO }>;
export function sendSticker(
  fromId: string,
  toId: string,
  kind: unknown,
  now: Date,
  deps?: PairDeps,
  opts?: { replyToMessageId?: string | null },
): Promise<{ id: string; messageId: string }>;
export async function sendSticker(
  fromId: string,
  toId: string,
  kind: unknown,
  now: Date,
  deps: PairDeps = {},
  opts: { replyToMessageId?: string | null; readMessageTx?: ReadMessageTx } = {},
): Promise<{ id: string; messageId: string; message: MessageDTO | null }> {
  if (!(STICKER_KINDS as readonly unknown[]).includes(kind)) throw new BuddyError('invalid_sticker');
  const me = await prisma.user.findUnique({ where: { id: fromId }, select: { timezone: true, displayName: true, handle: true } });
  if (!me) throw new BuddyError('not_buddies');
  const today = localCivilDateOrUtc(now, me.timezone);
  const recent = await prisma.sticker.findMany({
    where: { fromUserId: fromId, toUserId: toId, sentAt: { gt: new Date(now.getTime() - TWO_DAYS_MS) } },
    select: { sentAt: true },
  });
  if (recent.filter((s) => localCivilDateOrUtc(s.sentAt, me.timezone) === today).length >= STICKERS_PER_BUDDY_PER_DAY) {
    throw new BuddyError('sticker_limit');
  }
  const sent = await prisma.$transaction(async (tx) => {
    // A block either way refuses like no pair (block removes the pair anyway; this covers a pair left
    // beside a block). Read every time, so a block costs no extra work.
    const blocked = await isBlockedEitherWay(fromId, toId, tx);
    const bumped = await tx.buddyPair.updateMany({ where: orderedPair(fromId, toId), data: { lastActivityAt: now } });
    if (bumped.count === 0 || blocked) throw new BuddyError('not_buddies');
    const sticker = await tx.sticker.create({ data: { fromUserId: fromId, toUserId: toId, kind: kind as StickerKind, sentAt: now }, select: { id: true } });
    await tx.buddyActivity.create({ data: { recipientId: toId, actorId: fromId, kind: 'STICKER', refId: sticker.id, createdAt: now } });
    const messageId = await writeMessageTx(tx, { senderId: fromId, recipientId: toId, kind: 'STICKER', sticker: kind as StickerKind, replyToMessageId: opts.replyToMessageId ?? null, now });
    const message = opts.readMessageTx ? await opts.readMessageTx(tx, messageId) : null;
    return { id: sticker.id, messageId, message };
  });
  // Enqueued whether or not the buddy muted me: the job decides (Global Constraints).
  await enqueueBuddyNotice(
    { kind: 'buddy_sticker', recipientId: toId, actorId: fromId, refId: fromId, slots: { name: pushName(me), sticker: kind as StickerKind } },
    deps.notifyQueue ? { queue: deps.notifyQueue } : {},
  );
  return sent;
}
