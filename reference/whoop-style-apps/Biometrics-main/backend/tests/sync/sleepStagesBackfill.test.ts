import { randomUUID } from 'crypto';
import { Job } from 'bullmq';
import { processSyncJob } from '../../src/sync/worker';
import * as queue from '../../src/sync/queue';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as healthClient from '../../src/health/client';
import * as oauth from '../../src/health/oauth';
import * as subscriber from '../../src/health/subscriber';
import { encryptToken } from '../../src/crypto/tokenCipher';
import { enqueuePendingSleepStagesBackfills, sleepHistoryWindow } from '../../src/sync/sleepHistory';
import * as scoringQueue from '../../src/scoring/queue';
import { SleepSessionPoint } from '../../src/types';

jest.mock('../../src/health/client');
jest.mock('../../src/health/oauth');
jest.mock('../../src/health/subscriber');
jest.mock('../../src/sync/tokenRefreshJob');
jest.mock('../../src/scoring/sweep');
// The real queue module stays (the worker needs its connection and job names);
// only the enqueue helpers the startup sweep calls are stubbed, so no test job
// lands in Redis.
jest.mock('../../src/sync/queue', () => ({
  ...jest.requireActual('../../src/sync/queue'),
  enqueueSleepHistoryBackfill: jest.fn().mockResolvedValue(undefined),
  enqueueSleepStagesBackfill: jest.fn().mockResolvedValue(undefined),
}));
// Stubbed as in tests/sync/worker.test.ts: score recomputes go to a real queue otherwise.
jest.mock('../../src/scoring/queue', () => ({
  COMPUTE_DAILY_SCORE_JOB: 'computeDailyScore',
  SCORE_SWEEP_JOB: 'scoreSweep',
  enqueueScoreCompute: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/coach/daySummaryJob', () => ({
  refreshDaySummaryAfterScore: jest.fn().mockResolvedValue(false),
  runDaySummaryJob: jest.fn().mockResolvedValue('ai'),
}));

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

beforeEach(() => {
  (oauth.refreshHealthTokens as jest.Mock).mockReset().mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));
  (healthClient.fetchMetricRange as jest.Mock).mockReset();
  (healthClient.fetchSleepSessions as jest.Mock).mockReset().mockResolvedValue([]);
  (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
  (scoringQueue.enqueueScoreCompute as jest.Mock).mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  await prisma.$disconnect();
  await queue.connection.quit();
});

type Markers = { status?: 'CONNECTED' | 'DISCONNECTED'; sleepHistoryBackfilledAt?: Date; sleepStagesBackfilledAt?: Date };

// Real (decryptable) tokens: the stage job fetches through the worker's token session.
async function createConnection(prefix: string, data: Markers = {}) {
  const user = await prisma.user.create({
    data: { email: `${prefix}-${randomUUID()}@example.com`, name: 'Test User' },
  });
  await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: `stages-${randomUUID()}`,
      encryptedAccessToken: encryptToken('access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      ...data,
    },
  });
  return user.id;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// A night ending at 07:00 UTC on `date` (offset 0, so it keys onto `date`).
const night = (date: string, minutesAsleep: number): SleepSessionPoint => {
  const endTime = new Date(`${date}T07:00:00Z`);
  return {
    startTime: new Date(endTime.getTime() - 8 * 3600_000),
    endTime,
    minutesAsleep,
    startUtcOffsetSeconds: 0,
    endUtcOffsetSeconds: 0,
  };
};

// The same night as Google now returns it: with its stage timeline and summary.
const withStages = (n: SleepSessionPoint): SleepSessionPoint => {
  const at = (h: number) => new Date(n.startTime.getTime() + h * 3600_000);
  return {
    ...n,
    deepMinutes: 90,
    lightMinutes: 240,
    remMinutes: 120,
    awakeMinutes: 30,
    stages: [
      { type: 'LIGHT', startTime: at(0), endTime: at(2) },
      { type: 'DEEP', startTime: at(2), endTime: at(4) },
      { type: 'REM', startTime: at(4), endTime: at(8) },
    ],
  };
};

const stagesJob = (userId: string) => ({ name: 'backfillSleepStages', data: { userId } }) as Job;
const historyJob = (userId: string) => ({ name: queue.SLEEP_HISTORY_BACKFILL_JOB, data: { userId } }) as Job;

describe('enqueuePendingSleepStagesBackfills', () => {
  it('enqueues connected users whose history is in but whose stages are not, and no one else', async () => {
    const pending = await createConnection('stages-pending', { sleepHistoryBackfilledAt: new Date() });
    const disconnected = await createConnection('stages-disconnected', { status: 'DISCONNECTED', sleepHistoryBackfilledAt: new Date() });
    // No history yet: the history job will pull stages itself.
    const noHistory = await createConnection('stages-no-history');
    const done = await createConnection('stages-done', { sleepHistoryBackfilledAt: new Date(), sleepStagesBackfilledAt: new Date() });
    (queue.enqueueSleepStagesBackfill as jest.Mock).mockClear();

    const count = await enqueuePendingSleepStagesBackfills();

    const enqueued = (queue.enqueueSleepStagesBackfill as jest.Mock).mock.calls.map((c) => c[0]);
    expect(enqueued).toContain(pending);
    expect(enqueued).not.toContain(disconnected);
    expect(enqueued).not.toContain(noHistory);
    expect(enqueued).not.toContain(done);
    expect(count).toBe(enqueued.length);
    expect(queue.enqueueSleepHistoryBackfill).not.toHaveBeenCalled();
  });
});

describe('processSyncJob: sleep history backfill markers', () => {
  it('sets the stage marker alongside the history marker, since a fresh history pull carries stages', async () => {
    const userId = await createConnection('stages-history-job');

    await processSyncJob(historyJob(userId));

    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    expect(conn?.sleepHistoryBackfilledAt).toBeInstanceOf(Date);
    expect(conn?.sleepStagesBackfilledAt).toBeInstanceOf(Date);
    expect(conn?.sleepStagesBackfilledAt?.getTime()).toBe(conn?.sleepHistoryBackfilledAt?.getTime());
  });
});

describe('processSyncJob: sleep stages backfill', () => {
  // A connection whose year of history was stored before stages existed.
  async function seedStagelessHistory(nights: SleepSessionPoint[]) {
    const userId = await createConnection('stages-job', { sleepHistoryBackfilledAt: new Date() });
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValueOnce(nights);
    await processSyncJob(historyJob(userId));
    // Re-open the stage job's gate, as on a connection that predates this feature.
    await prisma.healthConnection.update({ where: { userId }, data: { sleepStagesBackfilledAt: null } });
    (healthClient.fetchSleepSessions as jest.Mock).mockReset();
    (scoringQueue.enqueueScoreCompute as jest.Mock).mockClear();
    return userId;
  }

  it('stores the stages of already-stored nights, sets its marker and asks for no scores', async () => {
    const nights = [night(daysAgo(200), 420), night(daysAgo(10), 465)];
    const userId = await seedStagelessHistory(nights);
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue(nights.map(withStages));

    await processSyncJob(stagesJob(userId));

    // The same widened year window as the history job.
    const { startDate, endDate } = sleepHistoryWindow();
    expect(healthClient.fetchSleepSessions).toHaveBeenCalledTimes(1);
    const [, from, to] = (healthClient.fetchSleepSessions as jest.Mock).mock.calls[0];
    expect(from < startDate && to > endDate).toBe(true);
    const sessions = await prisma.sleepSession.findMany({ where: { userId }, include: { stages: true } });
    expect(sessions).toHaveLength(2);
    for (const s of sessions) {
      expect(s.stages).toHaveLength(3);
      expect(s.deepMinutes).toBe(90);
    }
    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    expect(conn?.sleepStagesBackfilledAt).toBeInstanceOf(Date);
    expect(conn?.lastSyncedAt).toBeNull();
    expect(scoringQueue.enqueueScoreCompute).not.toHaveBeenCalled();
  });

  it('re-scores a night whose minutesAsleep changed upstream, like a normal sync', async () => {
    const userId = await seedStagelessHistory([night(daysAgo(200), 420), night(daysAgo(10), 465)]);
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([
      withStages(night(daysAgo(200), 420)),
      withStages(night(daysAgo(10), 480)),
    ]);

    await processSyncJob(stagesJob(userId));

    const dates = (scoringQueue.enqueueScoreCompute as jest.Mock).mock.calls.map((c) => c[1] as string);
    expect(dates).toContain(daysAgo(10));
    expect(dates).not.toContain(daysAgo(200));
    const rollup = await prisma.biometricRecord.findFirst({
      where: { userId, metricType: 'SLEEP', recordedAt: new Date(`${daysAgo(10)}T00:00:00Z`) },
    });
    expect(rollup?.value).toBe(480);
  });

  it('does nothing for a disconnected connection', async () => {
    const userId = await createConnection('stages-disconnected-job', { status: 'DISCONNECTED', sleepHistoryBackfilledAt: new Date() });

    await processSyncJob(stagesJob(userId));

    expect(healthClient.fetchSleepSessions).not.toHaveBeenCalled();
    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    expect(conn?.sleepStagesBackfilledAt).toBeNull();
  });

  it('does nothing when the stages are already in, e.g. a reconnect history backfill finished first', async () => {
    const done = new Date('2026-09-01T00:00:00Z');
    const userId = await createConnection('stages-already-done', { sleepHistoryBackfilledAt: done, sleepStagesBackfilledAt: done });

    await processSyncJob(stagesJob(userId));

    expect(healthClient.fetchSleepSessions).not.toHaveBeenCalled();
    expect(scoringQueue.enqueueScoreCompute).not.toHaveBeenCalled();
    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    expect(conn?.sleepStagesBackfilledAt?.getTime()).toBe(done.getTime());
  });

  it('disconnects on a 401 that survives the refresh, without setting its marker', async () => {
    const userId = await createConnection('stages-401', { sleepHistoryBackfilledAt: new Date() });
    (healthClient.fetchSleepSessions as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));

    await processSyncJob(stagesJob(userId));

    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    expect(conn?.status).toBe('DISCONNECTED');
    expect(conn?.sleepStagesBackfilledAt).toBeNull();
  });

  it('rethrows other errors so BullMQ retries, without setting its marker', async () => {
    const userId = await createConnection('stages-429', { sleepHistoryBackfilledAt: new Date() });
    (healthClient.fetchSleepSessions as jest.Mock).mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));

    await expect(processSyncJob(stagesJob(userId))).rejects.toThrow('rate limited');

    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.sleepStagesBackfilledAt).toBeNull();
  });
});
