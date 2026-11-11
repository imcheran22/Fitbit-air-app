import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma } from '../../src/db/client';
import { createApp } from '../../src/app';
import type { GenericPushPayload, PushSender, PushTarget } from '../../src/coach/push';
import { BUDDY_NOTIFY_JOB, runBuddyNotifyJob, type NotifyQueue } from '../../src/buddies/notifyQueue';
import type { BuddyNotice } from '../../src/buddies/notify';
import { testServer } from '../helpers/server';

/** A user ready to pair: a unique hex handle (no reserved word can appear), a display name and the mood notice seen. */
export async function buddyUser(over: {
  handle?: string | null;
  displayName?: string | null;
  name?: string;
  email?: string;
  timezone?: string;
  notice?: boolean;
} = {}) {
  return prisma.user.create({
    data: {
      email: over.email ?? `buddy-${randomUUID()}@example.com`,
      name: over.name ?? 'Test User',
      handle: over.handle === undefined ? `u${randomUUID().replace(/-/g, '').slice(0, 12)}` : over.handle,
      displayName: over.displayName === undefined ? 'Sam' : over.displayName,
      buddyMoodNoticeAt: over.notice === false ? null : new Date(),
      ...(over.timezone ? { timezone: over.timezone } : {}),
    },
  });
}

export async function pairUp(a: string, b: string, at: Date = new Date()) {
  const [userAId, userBId] = a < b ? [a, b] : [b, a];
  return prisma.buddyPair.create({ data: { userAId, userBId, createdAt: at, lastActivityAt: at } });
}

export async function addToken(userId: string) {
  await prisma.pushToken.create({ data: { userId, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' } });
}

export class RecordingSender implements PushSender {
  calls: Array<{ targets: PushTarget[]; payload: GenericPushPayload }> = [];
  async send(targets: PushTarget[], payload: GenericPushPayload) {
    this.calls.push({ targets, payload });
  }
  titles(): string[] {
    return this.calls.map((c) => c.payload.title);
  }
}

/** A supertest agent on a fresh 127.0.0.1 server (closed after the file). */
export async function api() {
  return request(await testServer(createApp()));
}

/** Records buddy jobs instead of queueing them; drain() runs them as the worker would. */
export class RecordingQueue implements NotifyQueue {
  jobs: Array<{ name: string; data: BuddyNotice; opts: unknown }> = [];
  async add(name: string, data: BuddyNotice, opts?: object) {
    this.jobs.push({ name, data, opts });
    return undefined;
  }
  async drain(sender: PushSender, now: Date = new Date('2026-10-07T12:00:00Z')): Promise<void> {
    const jobs = this.jobs.filter((j) => j.name === BUDDY_NOTIFY_JOB);
    this.jobs = [];
    for (const job of jobs) await runBuddyNotifyJob(job.data, { pushSender: sender, now });
  }
}
