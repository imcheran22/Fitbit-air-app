// Buddy pushes never run inside a request (buddies spec §6). A route enqueues ONE 'buddyNotify'
// job per would-be notification event — whatever the recipient's mute, settings or quiet hours,
// and whether or not the request is hidden or swallowed — so the route's work and response time
// never depend on them. The JOB decides: a buddy_request whose row is hidden or no longer PENDING,
// or whose recipient has blocked the sender, is dropped (only a visible request gets its REQUEST Activity row, written here); any other kind
// is dropped unless the pair is still live and neither side has blocked the other; the rest
// goes through sendBuddyNotice (setting, mute, quiet hours, devices). The enqueue is bounded by
// withTimeout: on a timeout or error it logs the event, ids and error class, and the caller carries on.

import type { BuddyPushKind, PushSender } from '../coach/push';
import { prisma } from '../db/client';
import { withTimeout } from '../lib/withTimeout';
import { syncQueue } from '../sync/queue';
import { sendBuddyNotice, type BuddyNotice, type NoticeOutcome } from './notify';
import { runDmNotice } from '../chats/dmPush';

export const BUDDY_NOTIFY_JOB = 'buddyNotify';
export const NOTIFY_ENQUEUE_TIMEOUT_MS = 300;
// Best-effort: one attempt, no retry (a stalled job re-run may rarely double-send; accepted).
export const NOTIFY_JOB_OPTIONS = { removeOnComplete: true, removeOnFail: true } as const;

export interface NotifyQueue {
  add(name: string, data: BuddyNotice, opts?: object): Promise<unknown>;
}

let overrideQueue: NotifyQueue | null = null;

/** Test seam, like setPushSender: null falls back to the shared sync queue. */
export function setBuddyNotifyQueue(queue: NotifyQueue | null): void {
  overrideQueue = queue;
}

export function getBuddyNotifyQueue(): NotifyQueue {
  return overrideQueue ?? (syncQueue as unknown as NotifyQueue);
}

export async function enqueueBuddyNotice<K extends BuddyPushKind>(
  notice: BuddyNotice<K>,
  opts: { queue?: NotifyQueue; timeoutMs?: number } = {},
): Promise<void> {
  // Rebuilt field by field: the job data is exactly the notice, nothing else.
  const data: BuddyNotice = { kind: notice.kind, recipientId: notice.recipientId, actorId: notice.actorId, refId: notice.refId, slots: notice.slots };
  try {
    await withTimeout((opts.queue ?? getBuddyNotifyQueue()).add(BUDDY_NOTIFY_JOB, data, NOTIFY_JOB_OPTIONS), opts.timeoutMs ?? NOTIFY_ENQUEUE_TIMEOUT_MS, 'buddy notify enqueue timeout');
  } catch (err) {
    console.error(JSON.stringify({
      event: 'buddies.notify_enqueue_failed',
      kind: notice.kind,
      recipientId: notice.recipientId,
      actorId: notice.actorId,
      error: err instanceof Error ? err.name : 'unknown',
    }));
  }
}

export type NotifyJobOutcome = NoticeOutcome | 'dropped';

export async function runBuddyNotifyJob(data: BuddyNotice, deps: { pushSender: PushSender; now: Date }): Promise<NotifyJobOutcome> {
  if (data.kind === 'buddy_request') {
    const row = await prisma.buddyRequest.findFirst({
      where: {
        id: data.refId,
        fromUserId: data.actorId,
        toUserId: data.recipientId,
        status: 'PENDING',
        hidden: false,
        // A block made while the send was in flight: the row may still be visible, but the blocker gets nothing.
        fromUser: { blocksReceived: { none: { blockerId: data.recipientId } } },
      },
      select: { id: true, createdAt: true },
    });
    // Swallowed, sent to someone who blocked the sender, or already answered: nothing, silently.
    if (!row) return 'dropped';
    await prisma.buddyActivity.createMany({
      data: [{ recipientId: data.recipientId, actorId: data.actorId, kind: 'REQUEST', refId: row.id, createdAt: row.createdAt }],
      skipDuplicates: true,
    });
  } else if (!(await stillBuddies(data.actorId, data.recipientId))) {
    // Unpaired or blocked (either way) since the enqueue: a block deletes mutes, so without this
    // check a sticker sent before the block would reach the person who just blocked its sender.
    return 'dropped';
  }
  // dm_message (S3): its refId is the message id; the job reads the message (and, with previews on, its text) now.
  if (data.kind === 'dm_message') return runDmNotice(data, deps);
  return sendBuddyNotice(deps.pushSender, data, deps.now);
}

async function stillBuddies(a: string, b: string): Promise<boolean> {
  const [userAId, userBId] = a < b ? [a, b] : [b, a];
  const [pair, block] = await Promise.all([
    prisma.buddyPair.findUnique({ where: { userAId_userBId: { userAId, userBId } }, select: { id: true } }),
    prisma.buddyBlock.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { blockerId: true },
    }),
  ]);
  return pair !== null && block === null;
}
