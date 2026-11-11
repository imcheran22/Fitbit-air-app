import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as queue from '../../src/sync/queue';
import { enqueuePendingSleepHistoryBackfills, sleepHistoryWindow } from '../../src/sync/sleepHistory';
import { stepsHistoryWindow } from '../../src/sync/stepsHistory';

// A factory, not a bare automock: the real module opens a Redis socket at
// import time (see tests/health/routes.test.ts).
jest.mock('../../src/sync/queue', () => ({
  enqueueStepsHistoryBackfill: jest.fn().mockResolvedValue(undefined),
  enqueueSleepHistoryBackfill: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('sleepHistoryWindow', () => {
  it('reaches exactly as far back as the steps history, so both pages cover the same year', () => {
    const today = new Date('2026-10-01T09:00:00Z');
    expect(sleepHistoryWindow(today)).toEqual(stepsHistoryWindow(today));
    expect(sleepHistoryWindow(today)).toEqual({ startDate: '2025-10-01', endDate: '2026-10-01' });
  });
});

describe('enqueuePendingSleepHistoryBackfills', () => {
  async function createConnection(prefix: string, data: { status?: 'CONNECTED' | 'DISCONNECTED'; sleepHistoryBackfilledAt?: Date; stepsHistoryBackfilledAt?: Date }) {
    const user = await prisma.user.create({
      data: { email: `${prefix}-${randomUUID()}@example.com`, name: 'Test User' },
    });
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `sleephist-${randomUUID()}`,
        encryptedAccessToken: 'placeholder',
        encryptedRefreshToken: 'placeholder',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        ...data,
      },
    });
    return user.id;
  }

  it('enqueues connected users without sleep history, whatever their steps history, and no one else', async () => {
    const pending = await createConnection('sleephist-pending', {});
    // Steps history done but sleep not: an account that connected before the Sleep page existed.
    const stepsOnly = await createConnection('sleephist-steps-only', { stepsHistoryBackfilledAt: new Date() });
    const done = await createConnection('sleephist-done', { sleepHistoryBackfilledAt: new Date() });
    const disconnected = await createConnection('sleephist-disconnected', { status: 'DISCONNECTED' });
    (queue.enqueueSleepHistoryBackfill as jest.Mock).mockClear();

    const count = await enqueuePendingSleepHistoryBackfills();

    const enqueued = (queue.enqueueSleepHistoryBackfill as jest.Mock).mock.calls.map((c) => c[0]);
    expect(enqueued).toEqual(expect.arrayContaining([pending, stepsOnly]));
    expect(enqueued).not.toContain(done);
    expect(enqueued).not.toContain(disconnected);
    expect(count).toBe(enqueued.length);
    expect(queue.enqueueStepsHistoryBackfill).not.toHaveBeenCalled();
  });
});
