import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as queue from '../../src/sync/queue';
import { enqueuePendingStepsHistoryBackfills, stepsHistoryWindow, STEPS_HISTORY_DAYS } from '../../src/sync/stepsHistory';

// A factory, not a bare automock: the real module opens a Redis socket at
// import time (see tests/health/routes.test.ts).
jest.mock('../../src/sync/queue', () => ({
  enqueueStepsHistoryBackfill: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('stepsHistoryWindow', () => {
  it('covers the 365 days before today, ending at (excluding) today', () => {
    expect(STEPS_HISTORY_DAYS).toBe(365);
    expect(stepsHistoryWindow(new Date('2026-09-22T15:30:00Z'))).toEqual({ startDate: '2025-09-22', endDate: '2026-09-22' });
  });

  it('crosses a leap day correctly', () => {
    expect(stepsHistoryWindow(new Date('2028-03-01T00:00:00Z'))).toEqual({ startDate: '2027-03-02', endDate: '2028-03-01' });
  });
});

describe('enqueuePendingStepsHistoryBackfills', () => {
  async function createConnection(prefix: string, data: { status?: 'CONNECTED' | 'DISCONNECTED'; stepsHistoryBackfilledAt?: Date }) {
    const user = await prisma.user.create({
      data: { email: `${prefix}-${randomUUID()}@example.com`, name: 'Test User'},
    });
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `hist-${randomUUID()}`,
        encryptedAccessToken: 'placeholder',
        encryptedRefreshToken: 'placeholder',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        ...data,
      },
    });
    return user.id;
  }

  it('enqueues connected users whose history has not been backfilled, and no one else', async () => {
    const pending = await createConnection('hist-pending', {});
    const done = await createConnection('hist-done', { stepsHistoryBackfilledAt: new Date() });
    const disconnected = await createConnection('hist-disconnected', { status: 'DISCONNECTED' });
    (queue.enqueueStepsHistoryBackfill as jest.Mock).mockClear();

    const count = await enqueuePendingStepsHistoryBackfills();

    const enqueued = (queue.enqueueStepsHistoryBackfill as jest.Mock).mock.calls.map((c) => c[0]);
    expect(enqueued).toContain(pending);
    expect(enqueued).not.toContain(done);
    expect(enqueued).not.toContain(disconnected);
    expect(count).toBe(enqueued.length);
  });
});
