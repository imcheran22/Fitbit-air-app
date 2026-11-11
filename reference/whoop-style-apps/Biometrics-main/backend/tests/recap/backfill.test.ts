import { prisma } from '../../src/db/client';
import { connection, syncQueue } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { COACH_WEEKLY_DIGEST_JOB } from '../../src/coach/queue';
import { MarkerStore, RECAP_BACKFILL_MARKER, startRecaps } from '../../src/recap/backfill';
import { RECAP_SWEEP_CRON, RECAP_SWEEP_JOB } from '../../src/recap/queue';
import { createUser } from '../coach/helpers';
import { seedNight } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await syncQueue.close();
  await connection.quit();
  await prisma.$disconnect();
});

class MemoryStore implements MarkerStore {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
}
function fakeQueue() {
  const calls: unknown[][] = [];
  const queue = {
    add: async (...a: unknown[]) => void calls.push(['add', ...a]),
    upsertJobScheduler: async (...a: unknown[]) => void calls.push(['upsert', ...a]),
    removeJobScheduler: async (...a: unknown[]) => void calls.push(['remove', ...a]),
  };
  return { calls, queue: queue as never };
}
const NOW = new Date('2026-10-05T09:00:00Z');

it('retires the digest scheduler, enqueues the backfill, then registers the hourly sweep, in that order', async () => {
  const user = await createUser();
  await seedNight(user.id, '2026-09-30', { minutes: 450 });
  const empty = await createUser();
  const store = new MemoryStore();
  const { calls, queue } = fakeQueue();
  await startRecaps({ queue, store, now: NOW, userIds: [user.id, empty.id] });

  expect(calls[0]).toEqual(['remove', COACH_WEEKLY_DIGEST_JOB]);
  const adds = calls.filter((c) => c[0] === 'add');
  expect(adds).toHaveLength(7); // 4 weeks + 3 months; none for the user with no sleep
  expect(adds[0]).toEqual(['add', 'recapBuild', { userId: user.id, kind: 'WEEK', periodStart: '2026-09-28', noPush: true }, expect.objectContaining({ jobId: `recap-${user.id}-WEEK-2026-09-28` })]);
  expect(calls[calls.length - 1]).toEqual(['upsert', RECAP_SWEEP_JOB, { pattern: RECAP_SWEEP_CRON }, { name: RECAP_SWEEP_JOB }]);
  expect(store.values.get(RECAP_BACKFILL_MARKER)).toBe(NOW.toISOString());
});

it('runs the backfill only once', async () => {
  const user = await createUser();
  await seedNight(user.id, '2026-09-30', { minutes: 450 });
  const store = new MemoryStore();
  await startRecaps({ queue: fakeQueue().queue, store, now: NOW, userIds: [user.id] });
  const second = fakeQueue();
  await startRecaps({ queue: second.queue, store, now: NOW, userIds: [user.id] });
  expect(second.calls.filter((c) => c[0] === 'add')).toHaveLength(0);
  expect(second.calls.some((c) => c[0] === 'upsert')).toBe(true);
});

it('still registers the hourly sweep when the backfill throws, and leaves the marker unset so the next start retries', async () => {
  const user = await createUser();
  await seedNight(user.id, '2026-09-30', { minutes: 450 });
  const store = new MemoryStore();
  const { calls, queue } = fakeQueue();
  (queue as { add: unknown }).add = async () => {
    throw new Error('queue down');
  };
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await startRecaps({ queue, store, now: NOW, userIds: [user.id] });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  } finally {
    errorSpy.mockRestore();
  }
  expect(calls[calls.length - 1]).toEqual(['upsert', RECAP_SWEEP_JOB, { pattern: RECAP_SWEEP_CRON }, { name: RECAP_SWEEP_JOB }]);
  expect(store.values.has(RECAP_BACKFILL_MARKER)).toBe(false);
});

it('still registers the hourly sweep when listing users with sleep data throws', async () => {
  const store = new MemoryStore();
  const { calls, queue } = fakeQueue();
  const findMany = jest.spyOn(prisma.user, 'findMany').mockRejectedValue(new Error('db down'));
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await startRecaps({ queue, store, now: NOW });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  } finally {
    errorSpy.mockRestore();
    findMany.mockRestore();
  }
  expect(calls.filter((c) => c[0] === 'add')).toHaveLength(0);
  expect(calls[calls.length - 1]).toEqual(['upsert', RECAP_SWEEP_JOB, { pattern: RECAP_SWEEP_CRON }, { name: RECAP_SWEEP_JOB }]);
  expect(store.values.has(RECAP_BACKFILL_MARKER)).toBe(false);
});
