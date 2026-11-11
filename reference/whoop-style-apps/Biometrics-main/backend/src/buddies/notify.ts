// The one way a buddy push is sent (spec 2026-10-06 buddies §6): the recipient's per-kind setting
// (buddy_paired has none), a mute of the actor, the recipient's quiet hours, then every registered
// device. The text comes only from buddyPushPayload (typed slots). Never throws: a failure is
// logged with ids and the event only, and the caller's action still succeeds.
// A caller may pass a claim (dm_message's 2-minute grouping): checked last, right before sending.

import { buddyPushPayload, type BuddyPushKind, type BuddyPushSlots, type PushSender } from '../coach/push';
import { prisma } from '../db/client';
import { inQuietHours } from './quietHours';

export interface BuddyNotice<K extends BuddyPushKind = BuddyPushKind> {
  kind: K;
  recipientId: string;
  actorId: string;
  refId: string;
  slots: BuddyPushSlots[K];
}

export type NoticeOutcome = 'sent' | 'setting_off' | 'muted' | 'quiet_hours' | 'no_devices' | 'no_recipient' | 'grouped' | 'failed';

const SETTING = {
  buddy_sticker: 'notifyBuddyStickers',
  buddy_request: 'notifyBuddyRequests',
  buddy_paired: null,
  buddy_badge: 'notifyBuddyBadges',
  dm_message: 'notifyDirectMessages',
} as const satisfies Record<BuddyPushKind, string | null>;

/** The name a push may carry: the display name, else the handle (both pass isPushName). */
export function pushName(user: { displayName: string | null; handle: string | null }): string {
  return user.displayName ?? user.handle ?? '';
}

export async function sendBuddyNotice<K extends BuddyPushKind>(
  sender: PushSender,
  notice: BuddyNotice<K>,
  now: Date = new Date(),
  opts: { claim?: () => Promise<boolean> } = {},
): Promise<NoticeOutcome> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: notice.recipientId },
      select: { timezone: true, bedtimeGoal: true, wakeGoal: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true, notifyDirectMessages: true },
    });
    if (!user) return 'no_recipient';
    const setting = SETTING[notice.kind as BuddyPushKind];
    if (setting !== null && !user[setting]) return 'setting_off';
    const muted = await prisma.buddyMute.findUnique({ where: { muterId_mutedId: { muterId: notice.recipientId, mutedId: notice.actorId } } });
    if (muted) return 'muted';
    if (inQuietHours(now, user)) return 'quiet_hours';
    const payload = buddyPushPayload(notice.kind, notice.slots, notice.refId);
    const rows = await prisma.pushToken.findMany({ where: { userId: notice.recipientId }, select: { token: true, platform: true } });
    if (rows.length === 0) return 'no_devices';
    // The last gate (dm_message grouping): claimed only when a push would really go, so a skipped one never uses the slot.
    if (opts.claim && !(await opts.claim())) return 'grouped';
    await sender.send(rows.map((r) => ({ token: r.token, platform: r.platform })), payload);
    return 'sent';
  } catch (err) {
    console.error(JSON.stringify({
      event: 'buddies.push_failed',
      kind: notice.kind,
      recipientId: notice.recipientId,
      actorId: notice.actorId,
      error: err instanceof Error ? err.name : 'unknown',
    }));
    return 'failed';
  }
}
