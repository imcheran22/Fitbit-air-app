import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { setPushSender } from '../../src/coach/config';
import { processSyncJob } from '../../src/sync/worker';
import { migrateTestDb } from '../setupTestDb';
import { BUDDY_NOTIFY_JOB, NOTIFY_JOB_OPTIONS, enqueueBuddyNotice, runBuddyNotifyJob } from '../../src/buddies/notifyQueue';
import { RecordingQueue, RecordingSender, addToken, buddyUser, pairUp } from './helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterEach(() => setPushSender(null));
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOON = new Date('2026-10-07T12:00:00Z');

it('enqueues exactly one buddyNotify job carrying the notice', async () => {
  const queue = new RecordingQueue();
  const notice = { kind: 'buddy_paired' as const, recipientId: randomUUID(), actorId: randomUUID(), refId: randomUUID(), slots: { name: 'Sam' } };
  await enqueueBuddyNotice(notice, { queue });
  expect(queue.jobs).toEqual([{ name: BUDDY_NOTIFY_JOB, data: notice, opts: NOTIFY_JOB_OPTIONS }]);
  // Best-effort: one attempt, no retry/backoff.
  expect(NOTIFY_JOB_OPTIONS).toEqual({ removeOnComplete: true, removeOnFail: true });
});

it('a hanging or failing queue never holds the caller, and logs ids and the error class only', async () => {
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((l: unknown) => void lines.push(String(l)));
  const notice = { kind: 'buddy_sticker' as const, recipientId: randomUUID(), actorId: randomUUID(), refId: randomUUID(), slots: { name: 'Sam', sticker: 'STAR' as const } };
  const started = Date.now();
  await enqueueBuddyNotice(notice, { queue: { add: () => new Promise(() => {}) }, timeoutMs: 30 });
  await enqueueBuddyNotice(notice, { queue: { add: () => Promise.reject(new Error('Sam ECONNREFUSED')) } });
  spy.mockRestore();
  expect(Date.now() - started).toBeLessThan(1000);
  expect(lines.map((l) => JSON.parse(l))).toEqual([
    { event: 'buddies.notify_enqueue_failed', kind: 'buddy_sticker', recipientId: notice.recipientId, actorId: notice.actorId, error: 'TimeoutError' },
    { event: 'buddies.notify_enqueue_failed', kind: 'buddy_sticker', recipientId: notice.recipientId, actorId: notice.actorId, error: 'Error' },
  ]);
  expect(lines.join('\n')).not.toContain('Sam');
});

describe('runBuddyNotifyJob', () => {
  it('a visible request: writes the REQUEST Activity and pushes; a hidden or cancelled one: drops it, writing nothing', async () => {
    const from = await buddyUser();
    const to = await buddyUser();
    await addToken(to.id);
    const sender = new RecordingSender();
    const visible = await prisma.buddyRequest.create({ data: { fromUserId: from.id, toUserId: to.id } });
    const job = (refId: string) => ({ kind: 'buddy_request' as const, recipientId: to.id, actorId: from.id, refId, slots: {} });
    expect(await runBuddyNotifyJob(job(visible.id), { pushSender: sender, now: NOON })).toBe('sent');
    expect(await prisma.buddyActivity.count({ where: { recipientId: to.id, kind: 'REQUEST', refId: visible.id } })).toBe(1);

    const other = await buddyUser();
    const hidden = await prisma.buddyRequest.create({ data: { fromUserId: other.id, toUserId: to.id, hidden: true } });
    const cancelled = await prisma.buddyRequest.create({ data: { fromUserId: from.id, toUserId: to.id, status: 'CANCELLED' } });
    expect(await runBuddyNotifyJob({ ...job(hidden.id), actorId: other.id }, { pushSender: sender, now: NOON })).toBe('dropped');
    expect(await runBuddyNotifyJob(job(cancelled.id), { pushSender: sender, now: NOON })).toBe('dropped');
    expect(await prisma.buddyActivity.count({ where: { recipientId: to.id } })).toBe(1);
    expect(sender.calls).toHaveLength(1);
  });

  it('drops a request job, writing nothing, when the recipient has blocked the sender since it was sent', async () => {
    const from = await buddyUser();
    const to = await buddyUser();
    await addToken(to.id);
    const sender = new RecordingSender();
    const row = await prisma.buddyRequest.create({ data: { fromUserId: from.id, toUserId: to.id } });
    await prisma.buddyBlock.create({ data: { blockerId: to.id, blockedId: from.id } });
    const job = { kind: 'buddy_request' as const, recipientId: to.id, actorId: from.id, refId: row.id, slots: {} };
    expect(await runBuddyNotifyJob(job, { pushSender: sender, now: NOON })).toBe('dropped');
    expect(await prisma.buddyActivity.count({ where: { recipientId: to.id } })).toBe(0);
    expect(sender.calls).toHaveLength(0);
  });

  it('decides mute in the job: a muted sticker is not pushed', async () => {
    const sam = await buddyUser();
    const jo = await buddyUser();
    await addToken(jo.id);
    await pairUp(sam.id, jo.id);
    await prisma.buddyMute.create({ data: { muterId: jo.id, mutedId: sam.id } });
    const sender = new RecordingSender();
    const job = { kind: 'buddy_sticker' as const, recipientId: jo.id, actorId: sam.id, refId: sam.id, slots: { name: 'Sam', sticker: 'HEART' as const } };
    expect(await runBuddyNotifyJob(job, { pushSender: sender, now: NOON })).toBe('muted');
    expect(sender.calls).toHaveLength(0);
  });

  it('drops a sticker, paired or badge job unless a live pair exists and neither side has blocked the other', async () => {
    const sam = await buddyUser();
    const jo = await buddyUser();
    await addToken(jo.id);
    const sender = new RecordingSender();
    const run = (kind: 'buddy_sticker' | 'buddy_paired' | 'buddy_badge') => {
      const slots = {
        buddy_sticker: { name: 'Sam', sticker: 'STAR' as const },
        buddy_paired: { name: 'Sam' },
        buddy_badge: { name: 'Sam', family: 'SLEEP_GOAL' as const, level: 1 },
      }[kind];
      return runBuddyNotifyJob({ kind, recipientId: jo.id, actorId: sam.id, refId: randomUUID(), slots } as never, { pushSender: sender, now: NOON });
    };

    // Paired, then unpaired straight away, before the jobs run.
    const pair = await pairUp(sam.id, jo.id);
    await prisma.buddyPair.delete({ where: { id: pair.id } });
    expect(await run('buddy_paired')).toBe('dropped');
    expect(await run('buddy_sticker')).toBe('dropped');
    expect(await run('buddy_badge')).toBe('dropped');

    // Jo muted Sam, Sam sent a sticker, then Jo blocked Sam (which unpairs and deletes the mute) before the job ran.
    await pairUp(sam.id, jo.id);
    await prisma.buddyBlock.create({ data: { blockerId: jo.id, blockedId: sam.id } });
    expect(await run('buddy_sticker')).toBe('dropped');
    await prisma.buddyBlock.deleteMany({ where: { blockerId: jo.id } });
    // A block in the other direction drops it too.
    await prisma.buddyBlock.create({ data: { blockerId: sam.id, blockedId: jo.id } });
    expect(await run('buddy_badge')).toBe('dropped');
    await prisma.buddyBlock.deleteMany({ where: { blockerId: sam.id } });

    expect(await run('buddy_sticker')).toBe('sent');
    expect(sender.calls).toHaveLength(1);
    expect(await prisma.buddyActivity.count({ where: { recipientId: jo.id } })).toBe(0);
  });

  it('is dispatched by the sync worker with the configured sender', async () => {
    const sam = await buddyUser();
    const jo = await buddyUser();
    await addToken(jo.id);
    await pairUp(sam.id, jo.id);
    // Equal bedtime and wake goals: no quiet hours, so the wall clock cannot matter here.
    await prisma.user.update({ where: { id: jo.id }, data: { bedtimeGoal: '03:00', wakeGoal: '03:00' } });
    const sender = new RecordingSender();
    setPushSender(sender);
    await processSyncJob({ name: BUDDY_NOTIFY_JOB, data: { kind: 'buddy_paired', recipientId: jo.id, actorId: sam.id, refId: sam.id, slots: { name: 'Sam' } } } as unknown as Job);
    expect(sender.titles()).toEqual(['You and Sam are now buddies']);
  });
});
