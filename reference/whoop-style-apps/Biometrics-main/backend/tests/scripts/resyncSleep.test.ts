import { randomUUID } from 'crypto';
import { Job } from 'bullmq';
import { resyncSleep, parseArgs } from '../../scripts/resyncSleep';
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
// Redis queue. Stubbed so sync tests never leave delayed jobs behind (the
// score trigger itself is covered in tests/scoring/).
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

async function createUser(opts: { status?: 'CONNECTED' | 'DISCONNECTED' | 'NONE'; timezone?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      email: `resync-${randomUUID()}@example.com`,
      name: 'Test User',
      timezone: opts.timezone ?? 'UTC',
    },
  });
  if (opts.status !== 'NONE') {
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `resync-${randomUUID()}`,
        encryptedAccessToken: encryptToken('access-token'),
        encryptedRefreshToken: encryptToken('refresh-token'),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        status: opts.status ?? 'CONNECTED',
      },
    });
  }
  return user;
}

// Old convention: one row per UTC date of the session START, last write wins
// (the defect the migration exists to repair).
async function seedOldConventionRows(userId: string) {
  await prisma.biometricRecord.createMany({
    data: [
      { userId, metricType: 'SLEEP', recordedAt: new Date('2026-09-01T00:00:00Z'), value: 415 },
      { userId, metricType: 'SLEEP', recordedAt: new Date('2026-09-02T00:00:00Z'), value: 50 },
    ],
  });
  await prisma.biometricRecord.create({
    data: { userId, metricType: 'STEPS', recordedAt: new Date('2026-09-01T00:00:00Z'), value: 9000 },
  });
}

// What Google returns for the backfill window: night ending Sep 2 with a nap
// the same day, plus the following night.
const SESSIONS = [
  { startTime: new Date('2026-09-01T22:00:00Z'), endTime: new Date('2026-09-02T06:00:00Z'), minutesAsleep: 420 },
  { startTime: new Date('2026-09-02T13:00:00Z'), endTime: new Date('2026-09-02T14:00:00Z'), minutesAsleep: 50 },
  { startTime: new Date('2026-09-02T22:30:00Z'), endTime: new Date('2026-09-03T06:30:00Z'), minutesAsleep: 400 },
];

// Stand-in for the queue: runs the real worker backfill handler inline.
const runInline = async (data: BackfillJobData) => {
  await processSyncJob({ name: 'backfill', data } as Job);
};

async function sleepRollups(userId: string) {
  const rows = await prisma.biometricRecord.findMany({ where: { userId, metricType: 'SLEEP' }, orderBy: { recordedAt: 'asc' } });
  return rows.map((r) => [r.recordedAt.toISOString().slice(0, 10), r.value]);
}

describe('resyncSleep', () => {
  it('dry run reports counts and changes nothing', async () => {
    const user = await createUser();
    await seedOldConventionRows(user.id);
    const enqueue = jest.fn();

    const summary = await resyncSleep({ apply: false, userId: user.id, enqueue });

    expect(summary).toMatchObject({ applied: false, usersInScope: 1, sleepRecordsDeleted: 2, backfillsEnqueued: 0, usersSkippedDisconnected: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(await sleepRollups(user.id)).toEqual([['2026-09-01', 415], ['2026-09-02', 50]]);
  });

  it('apply wipes old-convention rows and the re-sync leaves each rollup equal to the sum of its sessions, with no session under two keys', async () => {
    const user = await createUser({ timezone: 'UTC' });
    await seedOldConventionRows(user.id);
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue(SESSIONS);

    const summary = await resyncSleep({ apply: true, userId: user.id, enqueue: runInline });

    expect(summary).toMatchObject({ applied: true, usersInScope: 1, sleepRecordsDeleted: 2, backfillsEnqueued: 1 });
    // Keyed by END date: Sep 2 = main sleep + nap, Sep 3 = second night. The
    // old Sep 1 row (start-date key) is gone, not left double-counting.
    expect(await sleepRollups(user.id)).toEqual([['2026-09-02', 470], ['2026-09-03', 400]]);
    expect(await prisma.sleepSession.count({ where: { userId: user.id } })).toBe(3);
    // Total across rollups equals total across sessions: nothing counted twice.
    const rollupTotal = (await sleepRollups(user.id)).reduce((n, [, v]) => n + (v as number), 0);
    const sessionTotal = SESSIONS.reduce((n, s) => n + s.minutesAsleep, 0);
    expect(rollupTotal).toBe(sessionTotal);
  });

  it('is safe to run twice', async () => {
    const user = await createUser();
    await seedOldConventionRows(user.id);
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue(SESSIONS);

    await resyncSleep({ apply: true, userId: user.id, enqueue: runInline });
    await resyncSleep({ apply: true, userId: user.id, enqueue: runInline });

    expect(await sleepRollups(user.id)).toEqual([['2026-09-02', 470], ['2026-09-03', 400]]);
    expect(await prisma.sleepSession.count({ where: { userId: user.id } })).toBe(3);
  });

  // The backfill only rewrites the rollup of a new or changed session, so a
  // night already in SleepSession must get its rollup back from the script.
  it('rebuilds the rollups of nights already stored as sessions, even before the backfill runs', async () => {
    const user = await createUser({ timezone: 'UTC' });
    await prisma.sleepSession.createMany({ data: SESSIONS.map((s) => ({ userId: user.id, ...s })) });
    await seedOldConventionRows(user.id);

    await resyncSleep({ apply: true, userId: user.id, enqueue: jest.fn() });

    expect(await sleepRollups(user.id)).toEqual([['2026-09-02', 470], ['2026-09-03', 400]]);
  });

  it('leaves other metrics alone', async () => {
    const user = await createUser();
    await seedOldConventionRows(user.id);
    await resyncSleep({ apply: true, userId: user.id, enqueue: jest.fn() });
    const steps = await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: 'STEPS' } });
    expect(steps.map((r) => r.value)).toEqual([9000]);
  });

  it('enqueues the same lookback window the app already backfills, ending today', async () => {
    const user = await createUser();
    const enqueue = jest.fn();
    await resyncSleep({ apply: true, userId: user.id, enqueue, now: new Date('2026-09-20T15:00:00Z') });

    const expectedStart = new Date(Date.UTC(2026, 8, 20) - BACKFILL_WINDOW_DAYS * 24 * 3600_000).toISOString().slice(0, 10);
    expect(enqueue).toHaveBeenCalledWith({ userId: user.id, startDate: expectedStart, endDate: '2026-09-20' });
  });

  // Regression: the delete is unbounded by date but the backfill window was
  // not, so any night older than BACKFILL_WINDOW_DAYS was wiped and never
  // restored -- one-way data loss for a script documented as "safe to re-run".
  it('re-backfills from the oldest deleted night, not just the default window', async () => {
    const user = await createUser({ timezone: 'UTC' });
    await prisma.biometricRecord.create({
      data: { userId: user.id, metricType: 'SLEEP', recordedAt: new Date('2026-03-04T00:00:00Z'), value: 400 },
    });
    const enqueue = jest.fn();

    await resyncSleep({ apply: true, userId: user.id, enqueue, now: new Date('2026-09-20T15:00:00Z') });

    expect(enqueue).toHaveBeenCalledWith({ userId: user.id, startDate: '2026-03-04', endDate: '2026-09-20' });
  });

  it('only touches the requested user with --user', async () => {
    const target = await createUser();
    const other = await createUser();
    await seedOldConventionRows(target.id);
    await seedOldConventionRows(other.id);

    await resyncSleep({ apply: true, userId: target.id, enqueue: jest.fn() });

    expect(await sleepRollups(target.id)).toEqual([]);
    expect(await sleepRollups(other.id)).toEqual([['2026-09-01', 415], ['2026-09-02', 50]]);
  });

  it('skips users who cannot be re-synced (disconnected or never connected) rather than deleting data that cannot be restored', async () => {
    const disconnected = await createUser({ status: 'DISCONNECTED' });
    const never = await createUser({ status: 'NONE' });
    await seedOldConventionRows(disconnected.id);
    await seedOldConventionRows(never.id);
    const enqueue = jest.fn();

    for (const u of [disconnected, never]) {
      const summary = await resyncSleep({ apply: true, userId: u.id, enqueue });
      expect(summary).toMatchObject({ usersInScope: 1, usersSkippedDisconnected: 1, sleepRecordsDeleted: 0, backfillsEnqueued: 0 });
    }
    expect(enqueue).not.toHaveBeenCalled();
    expect(await sleepRollups(disconnected.id)).toHaveLength(2);
    expect(await sleepRollups(never.id)).toHaveLength(2);
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
