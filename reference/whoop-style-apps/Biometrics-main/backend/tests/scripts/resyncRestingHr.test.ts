import { randomUUID } from 'crypto';
import { Job } from 'bullmq';
import { resyncRestingHr, parseArgs } from '../../scripts/resyncRestingHr';
import { processSyncJob } from '../../src/sync/worker';
import { connection, BackfillJobData } from '../../src/sync/queue';
import { BACKFILL_WINDOW_DAYS } from '../../src/health/routes';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as healthClient from '../../src/health/client';
import { encryptToken } from '../../src/crypto/tokenCipher';

jest.mock('../../src/health/client');
jest.mock('../../src/health/oauth');
jest.mock('../../src/health/subscriber');
jest.mock('../../src/sync/tokenRefreshJob');
// The worker asks for score recomputes after storing data; those go to a real
// Redis queue. Stubbed so sync tests never leave delayed jobs behind.
jest.mock('../../src/scoring/queue', () => ({
  COMPUTE_DAILY_SCORE_JOB: 'computeDailyScore',
  SCORE_SWEEP_JOB: 'scoreSweep',
  enqueueScoreCompute: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

beforeEach(() => {
  (healthClient.fetchMetricRange as jest.Mock).mockReset().mockResolvedValue([]);
  (healthClient.fetchSleepSessions as jest.Mock).mockReset().mockResolvedValue([]);
});

afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

async function createUser(opts: { status?: 'CONNECTED' | 'DISCONNECTED' | 'NONE' } = {}) {
  const user = await prisma.user.create({
    data: { email: `resync-rhr-${randomUUID()}@example.com`, name: 'Test User'},
  });
  if (opts.status !== 'NONE') {
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `resync-rhr-${randomUUID()}`,
        encryptedAccessToken: encryptToken('access-token'),
        encryptedRefreshToken: encryptToken('refresh-token'),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        status: opts.status ?? 'CONNECTED',
      },
    });
  }
  return user;
}

// The old proxy: daily-minimum BPM, ~12 below the true resting HR.
async function seedProxyRows(userId: string) {
  await prisma.biometricRecord.createMany({
    data: [
      { userId, metricType: 'RESTING_HR', recordedAt: new Date('2026-09-01T00:00:00Z'), value: 39 },
      { userId, metricType: 'RESTING_HR', recordedAt: new Date('2026-09-02T00:00:00Z'), value: 41 },
      { userId, metricType: 'STEPS', recordedAt: new Date('2026-09-01T00:00:00Z'), value: 9000 },
      { userId, metricType: 'HRV', recordedAt: new Date('2026-09-01T00:00:00Z'), value: 55 },
    ],
  });
}

const runInline = async (data: BackfillJobData) => {
  await processSyncJob({ name: 'backfill', data } as Job);
};

async function rhr(userId: string) {
  const rows = await prisma.biometricRecord.findMany({ where: { userId, metricType: 'RESTING_HR' }, orderBy: { recordedAt: 'asc' } });
  return rows.map((r) => [r.recordedAt.toISOString().slice(0, 10), r.value]);
}

describe('resyncRestingHr', () => {
  it('dry run reports counts and changes nothing', async () => {
    const user = await createUser();
    await seedProxyRows(user.id);
    const enqueue = jest.fn();

    const summary = await resyncRestingHr({ apply: false, userId: user.id, enqueue });

    expect(summary).toMatchObject({ applied: false, usersInScope: 1, restingHrRecordsDeleted: 2, backfillsEnqueued: 0, usersSkippedDisconnected: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(await rhr(user.id)).toEqual([['2026-09-01', 39], ['2026-09-02', 41]]);
  });

  it('apply deletes the proxy rows and the backfill repopulates them from the dedicated type', async () => {
    const user = await createUser();
    await seedProxyRows(user.id);
    (healthClient.fetchMetricRange as jest.Mock).mockImplementation(async (_t: string, metric: string) =>
      metric === 'RESTING_HR'
        ? [
            { recordedAt: new Date('2026-09-01T00:00:00Z'), value: 51 },
            { recordedAt: new Date('2026-09-02T00:00:00Z'), value: 52 },
          ]
        : [],
    );

    const summary = await resyncRestingHr({ apply: true, userId: user.id, enqueue: runInline });

    expect(summary).toMatchObject({ applied: true, usersInScope: 1, restingHrRecordsDeleted: 2, backfillsEnqueued: 1 });
    expect(await rhr(user.id)).toEqual([['2026-09-01', 51], ['2026-09-02', 52]]);
  });

  it('leaves other metrics alone', async () => {
    const user = await createUser();
    await seedProxyRows(user.id);
    await resyncRestingHr({ apply: true, userId: user.id, enqueue: jest.fn() });
    const others = await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: { not: 'RESTING_HR' } } });
    expect(others.map((r) => [r.metricType, r.value]).sort()).toEqual([['HRV', 55], ['STEPS', 9000]]);
  });

  it('is safe to run twice', async () => {
    const user = await createUser();
    await seedProxyRows(user.id);
    (healthClient.fetchMetricRange as jest.Mock).mockImplementation(async (_t: string, metric: string) =>
      metric === 'RESTING_HR' ? [{ recordedAt: new Date('2026-09-01T00:00:00Z'), value: 51 }] : [],
    );

    await resyncRestingHr({ apply: true, userId: user.id, enqueue: runInline });
    await resyncRestingHr({ apply: true, userId: user.id, enqueue: runInline });

    expect(await rhr(user.id)).toEqual([['2026-09-01', 51]]);
  });

  it('enqueues the same lookback window the app already backfills, ending today', async () => {
    const user = await createUser();
    const enqueue = jest.fn();
    await resyncRestingHr({ apply: true, userId: user.id, enqueue, now: new Date('2026-09-20T15:00:00Z') });

    const expectedStart = new Date(Date.UTC(2026, 8, 20) - BACKFILL_WINDOW_DAYS * 24 * 3600_000).toISOString().slice(0, 10);
    expect(enqueue).toHaveBeenCalledWith({ userId: user.id, startDate: expectedStart, endDate: '2026-09-20' });
  });

  it('only touches the requested user with --user', async () => {
    const target = await createUser();
    const other = await createUser();
    await seedProxyRows(target.id);
    await seedProxyRows(other.id);

    await resyncRestingHr({ apply: true, userId: target.id, enqueue: jest.fn() });

    expect(await rhr(target.id)).toEqual([]);
    expect(await rhr(other.id)).toHaveLength(2);
  });

  it('skips users who cannot be re-synced (disconnected or never connected) rather than deleting data that cannot be restored', async () => {
    const disconnected = await createUser({ status: 'DISCONNECTED' });
    const never = await createUser({ status: 'NONE' });
    await seedProxyRows(disconnected.id);
    await seedProxyRows(never.id);
    const enqueue = jest.fn();

    for (const u of [disconnected, never]) {
      const summary = await resyncRestingHr({ apply: true, userId: u.id, enqueue });
      expect(summary).toMatchObject({ usersInScope: 1, usersSkippedDisconnected: 1, restingHrRecordsDeleted: 0, backfillsEnqueued: 0 });
    }
    expect(enqueue).not.toHaveBeenCalled();
    expect(await rhr(disconnected.id)).toHaveLength(2);
    expect(await rhr(never.id)).toHaveLength(2);
  });

  it('records an enqueue failure after the delete so a re-run can repair it', async () => {
    const user = await createUser();
    await seedProxyRows(user.id);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const summary = await resyncRestingHr({ apply: true, userId: user.id, enqueue: async () => { throw new Error('redis down'); } });

    errSpy.mockRestore();
    expect(summary.enqueueFailures).toEqual([user.id]);
    expect(summary.backfillsEnqueued).toBe(0);
  });
});

describe('parseArgs', () => {
  it('defaults to a dry run over all users', () => {
    expect(parseArgs([])).toEqual({ apply: false, userId: undefined });
  });

  it('parses --apply and --user <id>', () => {
    expect(parseArgs(['--apply', '--user', 'abc'])).toEqual({ apply: true, userId: 'abc' });
  });

  it('rejects --user without a value and unknown flags', () => {
    expect(() => parseArgs(['--user'])).toThrow(/--user/);
    expect(() => parseArgs(['--wat'])).toThrow(/Unknown argument/);
  });
});
