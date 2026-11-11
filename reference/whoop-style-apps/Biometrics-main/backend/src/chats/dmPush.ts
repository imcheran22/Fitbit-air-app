// The dm_message push (spec 2026-10-07 social §10). The job carries the message id, never its text: the text is read
// here, at send time, and only when the recipient has turned previews on. A message unsent meanwhile, or a STICKER
// message (its sticker already sends buddy_sticker), sends nothing; an ex-buddy is dropped by runBuddyNotifyJob before
// this runs. At most one push per conversation per 2 minutes: a Redis SET NX EX key claimed right before sending (after
// the setting, mute, quiet hours and devices), so a skipped push never uses the slot; if Redis fails, no push (fail
// closed). No app-icon badge count. Logs ids and event names only.

import { prisma } from '../db/client';
import type { PushSender } from '../coach/push';
import { sendBuddyNotice, type BuddyNotice, type NoticeOutcome } from '../buddies/notify';
import { withTimeout } from '../lib/withTimeout';
import { connection } from '../sync/queue';
import { previewText } from './text';
import { cardTypeOf } from './types';

export const DM_PUSH_GROUP_SECONDS = 120;
const SLOT_TIMEOUT_MS = 300;

interface SlotRedis { set(key: string, value: string, ex: 'EX', seconds: number, nx: 'NX'): Promise<unknown> }

/** True when this conversation has had no push in the last 2 minutes (and now has one). Any failure: false. */
export async function claimDmPushSlot(recipientId: string, actorId: string, redis: SlotRedis = connection as unknown as SlotRedis): Promise<boolean> {
  try {
    const result = await withTimeout(redis.set(`dmpush:${recipientId}:${actorId}`, '1', 'EX', DM_PUSH_GROUP_SECONDS, 'NX'), SLOT_TIMEOUT_MS, 'dm push slot timeout');
    return result === 'OK';
  } catch (err) {
    console.error(JSON.stringify({ event: 'chats.push_slot_unavailable', recipientId, actorId, error: err instanceof Error ? err.name : 'unknown' }));
    return false;
  }
}

/** The preview body: the text on one line (≤ 80 code points + "…"), or a fixed phrase for a card without text. */
export function pushPreviewOf(m: { text: string | null; card: unknown }): string {
  if (m.text) return previewText(m.text);
  const type = cardTypeOf(m.card);
  if (type === 'checkin') return (m.card as { about?: unknown }).about === 'sender' ? 'Shared their check-in' : 'Replied to your story';
  if (type === 'note') return 'Replied to your note';
  if (type === 'camp_note') return 'Replied to your camp note';
  if (type === 'badge' || type === 'recap' || type === 'goodnight') return 'Replied to your story';
  return 'Sent a message';
}

export async function runDmNotice(
  data: BuddyNotice,
  deps: { pushSender: PushSender; now: Date; claim?: (recipientId: string, actorId: string) => Promise<boolean> },
): Promise<NoticeOutcome | 'dropped'> {
  const message = await prisma.message.findFirst({
    where: { id: data.refId, senderId: data.actorId, deletedAt: null, conversation: { OR: [{ userAId: data.recipientId }, { userBId: data.recipientId }] } },
    select: { kind: true, text: true, card: true },
  });
  if (!message || message.kind === 'STICKER') return 'dropped';
  const recipient = await prisma.user.findUnique({ where: { id: data.recipientId }, select: { showMessagePreviews: true } });
  if (!recipient) return 'no_recipient';
  const { name } = data.slots as { name: string };
  const slots = recipient.showMessagePreviews ? { name, preview: pushPreviewOf(message) } : { name };
  const claim = deps.claim ?? claimDmPushSlot;
  // On the wire the push names the sender (refId = their id), which opens their thread; the message id stays here.
  return sendBuddyNotice(
    deps.pushSender,
    { kind: 'dm_message', recipientId: data.recipientId, actorId: data.actorId, refId: data.actorId, slots },
    deps.now,
    { claim: () => claim(data.recipientId, data.actorId) },
  );
}
