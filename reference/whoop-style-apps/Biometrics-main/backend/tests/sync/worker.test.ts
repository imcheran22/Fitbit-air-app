import { randomUUID } from 'crypto';
import { Job } from 'bullmq';
import { processSyncJob } from '../../src/sync/worker';
import { connection } from '../../src/sync/queue';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as healthClient from '../../src/health/client';
import * as oauth from '../../src/health/oauth';
import * as subscriber from '../../src/health/subscriber';
import { encryptToken, decryptToken } from '../../src/crypto/tokenCipher';
import * as tokenRefreshJob from '../../src/sync/tokenRefreshJob';
import { TOKEN_REFRESH_SWEEP_JOB, STEPS_HISTORY_BACKFILL_JOB, SLEEP_HISTORY_BACKFILL_JOB } from '../../src/sync/queue';
import { stepsHistoryWindow } from '../../src/sync/stepsHistory';
import { sleepHistoryWindow } from '../../src/sync/sleepHistory';
import * as scoringQueue from '../../src/scoring/queue';
import * as scoreSweep from '../../src/scoring/sweep';
import { seedHistory, day } from '../scoring/dbHelpers';
import * as catchUp from '../../src/sync/catchUp';
import { localCivilDate } from '../../src/biometrics/civilDate';
import * as daySummaryJob from '../../src/coach/daySummaryJob';

jest.mock('../../src/health/client');
jest.mock('../../src/health/oauth');
jest.mock('../../src/health/subscriber');
jest.mock('../../src/sync/tokenRefreshJob');
jest.mock('../../src/scoring/sweep');
// The worker asks for score recomputes after storing data; those go to a real
// Redis queue. Stubbed so sync tests never leave delayed jobs behind (the
// score trigger itself is covered in tests/scoring/).
jest.mock('../../src/scoring/queue', () => ({
  COMPUTE_DAILY_SCORE_JOB: 'computeDailyScore',
  SCORE_SWEEP_JOB: 'scoreSweep',
  enqueueScoreCompute: jest.fn().mockResolvedValue(undefined),
}));

// The after-score day summary itself is covered in tests/coach/daySummaryJob.test.ts; only the wiring here.
jest.mock('../../src/coach/daySummaryJob', () => ({
  refreshDaySummaryAfterScore: jest.fn().mockResolvedValue(false),
  runDaySummaryJob: jest.fn().mockResolvedValue('ai'),
}));

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

beforeEach(() => {
  // The worker attempts ONE in-line refresh on a 401 before disconnecting.
  // Default that refresh to failing so every pre-existing 401 test still
  // exercises the terminal disconnect path; the refresh-specific tests below
  // override this per test.
  (oauth.refreshHealthTokens as jest.Mock).mockReset().mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));
  (healthClient.fetchMetricRange as jest.Mock).mockReset();
  (healthClient.fetchSleepSessions as jest.Mock).mockReset().mockResolvedValue([]);
  (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
  (scoringQueue.enqueueScoreCompute as jest.Mock).mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

async function createConnectedUser() {
  const user = await prisma.user.create({ data: { email: `w-${Date.now()}@example.com`, name: 'Test User'} });
  await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: `fb-1-${randomUUID()}`,
      encryptedAccessToken: encryptToken('access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return user;
}

describe('processSyncJob', () => {
  it('writes fetched metric points for a fetch job', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([
      { recordedAt: new Date('2026-09-01'), value: 8000 },
    ]);

    await processSyncJob({
      name: 'fetch',
      data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' },
    } as Job);

    const records = await prisma.biometricRecord.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(1);
    expect(records[0].value).toBe(8000);
  });

  // fetchMetricRange's ranges are half-open (end exclusive): dataPoints.list
  // filters `>= start AND < end`, so passing the same date twice is an empty
  // range and every webhook-driven fetch would return nothing forever.
  it('requests [date, date + 1) for a single-day fetch job, not [date, date)', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([]);

    await processSyncJob({
      name: 'fetch',
      data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' },
    } as Job);

    expect(healthClient.fetchMetricRange).toHaveBeenCalledTimes(1);
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'STEPS', '2026-09-01', '2026-09-02');
  });

  // The day key for SLEEP is a local civil date while the fetch filter is on
  // UTC instants, so a single-day job can only see part of a local day's
  // sessions. It asks for [D-1, D+2); sessions are idempotent so the overlap
  // is free.
  it('requests the widened window [date - 1, date + 2) of sleep sessions for a single-day SLEEP fetch job', async () => {
    const user = await createConnectedUser();

    await processSyncJob({
      name: 'fetch',
      data: { userId: user.id, metricType: 'SLEEP', date: '2026-09-01' },
    } as Job);

    expect(healthClient.fetchSleepSessions).toHaveBeenCalledTimes(1);
    expect(healthClient.fetchSleepSessions).toHaveBeenCalledWith('access-token', '2026-08-31', '2026-09-03');
    expect(healthClient.fetchMetricRange).not.toHaveBeenCalled();
  });

  it('rolls the exclusive end date over month and year boundaries', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([]);

    await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-30' } } as Job);
    await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-12-31' } } as Job);

    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'STEPS', '2026-09-30', '2026-10-01');
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'STEPS', '2026-12-31', '2027-01-01');
  });

  it('marks the connection disconnected on a 401 from Google Health', async () => {
    const user = await createConnectedUser();
    const err = new Error('unauthorized');
    (err as any).status = 401;
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(err);

    await processSyncJob({
      name: 'fetch',
      data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' },
    } as Job);

    const connection = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(connection?.status).toBe('DISCONNECTED');
  });

  it('processes a backfill job by fetching each metric type for the date range', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([
      { recordedAt: new Date('2026-08-01'), value: 42 },
    ]);

    await processSyncJob({
      name: 'backfill',
      data: { userId: user.id, startDate: '2026-08-01', endDate: '2026-08-02' },
    } as Job);

    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'HRV',
      '2026-08-01',
      '2026-08-02',
    );
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'RESTING_HR',
      '2026-08-01',
      '2026-08-02',
    );
    // SLEEP goes through the session path with a window widened by one day
    // each side, and never through fetchMetricRange.
    expect(healthClient.fetchSleepSessions).toHaveBeenCalledWith('access-token', '2026-07-31', '2026-08-03');
    expect(healthClient.fetchMetricRange).not.toHaveBeenCalledWith('access-token', 'SLEEP', expect.anything(), expect.anything());
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'STEPS',
      '2026-08-01',
      '2026-08-02',
    );
  });

  it('marks the connection disconnected on a 401 from Google Health during backfill', async () => {
    const user = await createConnectedUser();
    const err = new Error('unauthorized');
    (err as any).status = 401;
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(err);

    await processSyncJob({
      name: 'backfill',
      data: { userId: user.id, startDate: '2026-08-01', endDate: '2026-08-02' },
    } as Job);

    const connection = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(connection?.status).toBe('DISCONNECTED');
  });

  it('deletes the Google Health subscription when a fetch job hits a 401', async () => {
    const user = await prisma.user.create({ data: { email: `w-${Date.now()}-401@example.com`, name: 'Test User'} });
    const conn = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-user-401-${randomUUID()}`,
        encryptedAccessToken: encryptToken('access-token-401'),
        encryptedRefreshToken: encryptToken('refresh-token-401'),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        webhookSubscriptionId: 'sub-to-delete',
      },
    });
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
    (subscriber.deleteUserSubscription as jest.Mock).mockResolvedValue(undefined);

    await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as any);

    expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-to-delete');
    const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
    expect(updated?.status).toBe('DISCONNECTED');
  });

  it('still marks the connection DISCONNECTED even if deleting the subscription fails', async () => {
    const user = await prisma.user.create({ data: { email: `w-${Date.now()}-402@example.com`, name: 'Test User'} });
    const conn = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-user-402-${randomUUID()}`,
        encryptedAccessToken: encryptToken('access-token-402'),
        encryptedRefreshToken: encryptToken('refresh-token-402'),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        webhookSubscriptionId: 'sub-that-fails',
      },
    });
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
    (subscriber.deleteUserSubscription as jest.Mock).mockRejectedValue(new Error('network error'));

    await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as any);

    const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
    expect(updated?.status).toBe('DISCONNECTED');
  });

  describe('in-line token refresh on 401', () => {
    const unauthorized = () => Object.assign(new Error('unauthorized'), { status: 401 });

    async function createConnectedUserWithSubscription(subscriptionId: string) {
      const user = await prisma.user.create({
        data: { email: `w-refresh-${randomUUID()}@example.com`, name: 'Test User'},
      });
      await prisma.healthConnection.create({
        data: {
          userId: user.id,
          healthUserId: `health-user-refresh-${randomUUID()}`,
          encryptedAccessToken: encryptToken('stale-access'),
          encryptedRefreshToken: encryptToken('stored-refresh'),
          // Kept well outside runTokenRefreshSweep's one-hour lookahead:
          // tokenRefreshJob.test.ts runs in a parallel Jest worker against the
          // same DB and would otherwise sweep (and, with its rejecting mock,
          // disconnect) this row mid-test. The 401 mock is what drives the
          // refresh path here, not the stored expiry.
          tokenExpiresAt: new Date(Date.now() + 3 * 3600_000),
          webhookSubscriptionId: subscriptionId,
        },
      });
      return user;
    }

    it('refreshes once, persists the new tokens, retries with the new access token, and stays CONNECTED', async () => {
      const user = await createConnectedUserWithSubscription('sub-keep');
      (healthClient.fetchMetricRange as jest.Mock)
        .mockRejectedValueOnce(unauthorized())
        .mockResolvedValueOnce([{ recordedAt: new Date('2026-09-01'), value: 6500 }]);
      (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({
        accessToken: 'refreshed-access',
        refreshToken: 'refreshed-refresh',
        expiresIn: 7200,
      });

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job);

      // Refreshed with the STORED refresh token, exactly once.
      expect(oauth.refreshHealthTokens).toHaveBeenCalledTimes(1);
      expect(oauth.refreshHealthTokens).toHaveBeenCalledWith('stored-refresh');
      // First call with the stale token 401'd; the retry used the new one.
      expect(healthClient.fetchMetricRange).toHaveBeenCalledTimes(2);
      expect(healthClient.fetchMetricRange).toHaveBeenNthCalledWith(1, 'stale-access', 'STEPS', '2026-09-01', '2026-09-02');
      expect(healthClient.fetchMetricRange).toHaveBeenNthCalledWith(2, 'refreshed-access', 'STEPS', '2026-09-01', '2026-09-02');

      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(decryptToken(conn!.encryptedAccessToken)).toBe('refreshed-access');
      expect(decryptToken(conn!.encryptedRefreshToken)).toBe('refreshed-refresh');
      expect(conn!.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(conn?.lastSyncedAt).not.toBeNull();
      expect(subscriber.deleteUserSubscription).not.toHaveBeenCalled();

      const records = await prisma.biometricRecord.findMany({ where: { userId: user.id } });
      expect(records).toHaveLength(1);
      expect(records[0].value).toBe(6500);
    });

    it('keeps the stored refresh token when the in-line refresh does not return a new one', async () => {
      const user = await createConnectedUserWithSubscription('sub-keep-2');
      (healthClient.fetchMetricRange as jest.Mock)
        .mockRejectedValueOnce(unauthorized())
        .mockResolvedValueOnce([]);
      // Google's ordinary refresh_token grant omits refresh_token.
      (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({ accessToken: 'refreshed-access-only', expiresIn: 7200 });

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'HRV', date: '2026-09-01' } } as Job);

      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(decryptToken(conn!.encryptedAccessToken)).toBe('refreshed-access-only');
      expect(decryptToken(conn!.encryptedRefreshToken)).toBe('stored-refresh');
    });

    it('still disconnects and deletes the subscription when the refresh itself fails', async () => {
      const user = await createConnectedUserWithSubscription('sub-gone');
      (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(unauthorized());
      (oauth.refreshHealthTokens as jest.Mock).mockRejectedValue(Object.assign(new Error('invalid_grant'), { status: 400, oauthError: 'invalid_grant' }));

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job);

      expect(oauth.refreshHealthTokens).toHaveBeenCalledTimes(1);
      // No retry when there is no new token to retry with.
      expect(healthClient.fetchMetricRange).toHaveBeenCalledTimes(1);
      expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-gone');
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('DISCONNECTED');
      // The stale token is left untouched: nothing newer was ever obtained.
      expect(decryptToken(conn!.encryptedAccessToken)).toBe('stale-access');
    });

    it('stays CONNECTED and fails the job for a retry when the in-line refresh cannot reach Google', async () => {
      const user = await createConnectedUserWithSubscription('sub-offline');
      (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(unauthorized());
      (oauth.refreshHealthTokens as jest.Mock).mockRejectedValue(new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com'));

      await expect(
        processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job),
      ).rejects.toThrow(/ENOTFOUND/);

      expect(subscriber.deleteUserSubscription).not.toHaveBeenCalled();
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
    });

    it('still disconnects when the refresh succeeds but the retried fetch also 401s', async () => {
      const user = await createConnectedUserWithSubscription('sub-gone-2');
      (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(unauthorized());
      (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({ accessToken: 'refreshed-but-useless', expiresIn: 7200 });

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job);

      // Exactly one refresh and exactly one retry: no refresh loop.
      expect(oauth.refreshHealthTokens).toHaveBeenCalledTimes(1);
      expect(healthClient.fetchMetricRange).toHaveBeenCalledTimes(2);
      expect(healthClient.fetchMetricRange).toHaveBeenNthCalledWith(2, 'refreshed-but-useless', 'STEPS', '2026-09-01', '2026-09-02');
      expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-gone-2');
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('DISCONNECTED');
    });

    it('refreshes at most once per backfill job and uses the new token for the remaining metrics', async () => {
      const user = await createConnectedUserWithSubscription('sub-backfill');
      (healthClient.fetchMetricRange as jest.Mock)
        .mockRejectedValueOnce(unauthorized()) // HRV with the stale token
        .mockResolvedValue([]); // HRV retry + RESTING_HR + STEPS
      (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({ accessToken: 'refreshed-access', expiresIn: 7200 });

      await processSyncJob({
        name: 'backfill',
        data: { userId: user.id, startDate: '2026-08-01', endDate: '2026-08-31' },
      } as Job);

      expect(oauth.refreshHealthTokens).toHaveBeenCalledTimes(1);
      const calls = (healthClient.fetchMetricRange as jest.Mock).mock.calls;
      expect(calls).toHaveLength(4);
      expect(calls[0]).toEqual(['stale-access', 'HRV', '2026-08-01', '2026-08-31']);
      for (const call of calls.slice(1)) {
        expect(call[0]).toBe('refreshed-access');
      }
      expect(calls.slice(1).map((c) => c[1])).toEqual(['HRV', 'RESTING_HR', 'STEPS']);
      // SLEEP runs after the refresh, so its session fetch uses the new token too.
      expect(healthClient.fetchSleepSessions).toHaveBeenCalledTimes(1);
      expect((healthClient.fetchSleepSessions as jest.Mock).mock.calls[0][0]).toBe('refreshed-access');

      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(subscriber.deleteUserSubscription).not.toHaveBeenCalled();
    });

    it('does not disconnect on a non-401 error and does not attempt a refresh', async () => {
      const user = await createConnectedUserWithSubscription('sub-429');
      (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));

      await expect(
        processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job),
      ).rejects.toThrow('rate limited');

      expect(oauth.refreshHealthTokens).not.toHaveBeenCalled();
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
    });
  });

  // The sweep runs through the queue so that only one instance performs each
  // scheduled execution, rather than every process running its own setInterval.
  it('runs the token refresh sweep for a tokenRefreshSweep job', async () => {
    (tokenRefreshJob.runTokenRefreshSweep as jest.Mock).mockResolvedValue(undefined);

    await processSyncJob({ name: TOKEN_REFRESH_SWEEP_JOB, data: {} } as Job);

    expect(tokenRefreshJob.runTokenRefreshSweep).toHaveBeenCalledTimes(1);
  });

  it('ignores an unknown job name', async () => {
    (tokenRefreshJob.runTokenRefreshSweep as jest.Mock).mockClear();

    await expect(processSyncJob({ name: 'somethingElse', data: {} } as Job)).resolves.toBeUndefined();

    expect(tokenRefreshJob.runTokenRefreshSweep).not.toHaveBeenCalled();
  });

  // Slice 0: SLEEP is stored as whole sessions with a derived daily rollup, so
  // every re-run of any job shape must leave both unchanged.
  describe('SLEEP session storage', () => {
    const mainSleep = { startTime: new Date('2026-09-01T22:00:00Z'), endTime: new Date('2026-09-02T06:00:00Z'), minutesAsleep: 420 };
    const nap = { startTime: new Date('2026-09-02T13:00:00Z'), endTime: new Date('2026-09-02T14:00:00Z'), minutesAsleep: 50 };

    async function sleepState(userId: string) {
      const sessions = await prisma.sleepSession.findMany({ where: { userId }, orderBy: { startTime: 'asc' } });
      const rollups = await prisma.biometricRecord.findMany({ where: { userId, metricType: 'SLEEP' }, orderBy: { recordedAt: 'asc' } });
      return {
        sessions: sessions.map((x) => [x.startTime.toISOString(), x.endTime.toISOString(), x.minutesAsleep]),
        rollups: rollups.map((x) => [x.recordedAt.toISOString().slice(0, 10), x.value]),
      };
    }

    const fetchJob = (userId: string) =>
      ({ name: 'fetch', data: { userId, metricType: 'SLEEP', date: '2026-09-02' } }) as Job;
    const backfillJob = (userId: string) =>
      ({ name: 'backfill', data: { userId, startDate: '2026-08-25', endDate: '2026-09-05' } }) as Job;

    it('stores sessions and a rollup equal to their sum for a nap plus a main sleep, not a per-session overwrite', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([mainSleep, nap]);

      await processSyncJob(fetchJob(user.id));

      expect(await sleepState(user.id)).toEqual({
        sessions: [
          ['2026-09-01T22:00:00.000Z', '2026-09-02T06:00:00.000Z', 420],
          ['2026-09-02T13:00:00.000Z', '2026-09-02T14:00:00.000Z', 50],
        ],
        rollups: [['2026-09-02', 470]],
      });
    });

    it('leaves sessions and totals unchanged when the single-day fetch, a range backfill and a retried job re-run over the same data', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([mainSleep, nap]);
      (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([]);

      await processSyncJob(fetchJob(user.id));
      const first = await sleepState(user.id);

      await processSyncJob(fetchJob(user.id)); // repeat webhook for the same date
      await processSyncJob(backfillJob(user.id)); // range backfill over it
      await processSyncJob(backfillJob(user.id)); // ...and again
      expect(await sleepState(user.id)).toEqual(first);
    });

    it('a retried job (fails after fetching, then succeeds) does not double-count', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchSleepSessions as jest.Mock)
        .mockResolvedValueOnce([mainSleep, nap])
        .mockResolvedValue([mainSleep, nap]);
      await processSyncJob(fetchJob(user.id));
      const first = await sleepState(user.id);

      // BullMQ retries from the top after a later step failed: same fetch again.
      (healthClient.fetchSleepSessions as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }));
      await expect(processSyncJob(fetchJob(user.id))).rejects.toThrow('rate limited');
      await processSyncJob(fetchJob(user.id));
      expect(await sleepState(user.id)).toEqual(first);
    });

    it('a partial window never lowers the stored total, and a later window that includes the missing session raises it', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValueOnce([mainSleep, nap]);
      await processSyncJob(fetchJob(user.id));

      // A window that only returns the nap.
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValueOnce([nap]);
      await processSyncJob(fetchJob(user.id));
      expect((await sleepState(user.id)).rollups).toEqual([['2026-09-02', 470]]);

      // A user whose first sync only saw the nap gets corrected by a wider one.
      const user2 = await createConnectedUser();
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValueOnce([nap]);
      await processSyncJob(fetchJob(user2.id));
      expect((await sleepState(user2.id)).rollups).toEqual([['2026-09-02', 50]]);
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValueOnce([mainSleep, nap]);
      await processSyncJob(fetchJob(user2.id));
      expect((await sleepState(user2.id)).rollups).toEqual([['2026-09-02', 470]]);
    });

    it("buckets by the user's timezone when the worker writes the rollup", async () => {
      const user = await createConnectedUser();
      await prisma.user.update({ where: { id: user.id }, data: { timezone: 'America/Los_Angeles' } });
      // Ends 05:30Z Sep 3 == 22:30 Sep 2 in Los Angeles.
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([
        { startTime: new Date('2026-09-02T20:00:00Z'), endTime: new Date('2026-09-03T05:30:00Z'), minutesAsleep: 500 },
      ]);
      await processSyncJob(fetchJob(user.id));
      expect((await sleepState(user.id)).rollups).toEqual([['2026-09-02', 500]]);
    });

    it('does not create SleepSession rows for other metrics, which keep overwrite-on-conflict', async () => {
      const user = await createConnectedUser();
      const day = new Date('2026-09-01T00:00:00Z');
      (healthClient.fetchMetricRange as jest.Mock)
        .mockResolvedValueOnce([{ recordedAt: day, value: 1000 }])
        .mockResolvedValueOnce([{ recordedAt: day, value: 2500 }]);
      const stepsJob = { name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job;

      await processSyncJob(stepsJob);
      await processSyncJob(stepsJob);

      const rows = await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: 'STEPS' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.value).toBe(2500);
      expect(await prisma.sleepSession.count({ where: { userId: user.id } })).toBe(0);
    });

    it('refreshes the token once and retries when the sleep fetch returns 401', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchSleepSessions as jest.Mock)
        .mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
        .mockResolvedValue([mainSleep]);
      (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({ accessToken: 'refreshed-access', expiresIn: 7200 });

      await processSyncJob(fetchJob(user.id));

      expect(oauth.refreshHealthTokens).toHaveBeenCalledTimes(1);
      expect((healthClient.fetchSleepSessions as jest.Mock).mock.calls[1][0]).toBe('refreshed-access');
      expect((await sleepState(user.id)).rollups).toEqual([['2026-09-02', 420]]);
    });
  });

  // Slice 1: new HRV/RHR/SLEEP data asks for a (debounced) score recompute for
  // exactly the civil days it touched.
  describe('score triggers', () => {
    const enqueue = () => scoringQueue.enqueueScoreCompute as jest.Mock;

    it('requests a recompute for the day of each stored HRV / RESTING_HR point', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([{ recordedAt: new Date('2026-09-01'), value: 44 }]);

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'HRV', date: '2026-09-01' } } as Job);
      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'RESTING_HR', date: '2026-09-01' } } as Job);

      // One call per webhook; collapsing them into one job is the queue's deterministic job id.
      expect(enqueue()).toHaveBeenCalledTimes(2);
      expect(enqueue()).toHaveBeenCalledWith(user.id, '2026-09-01');
    });

    it('does not request a recompute for STEPS, which is not a score input', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([{ recordedAt: new Date('2026-09-01'), value: 8000 }]);

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as Job);

      expect(enqueue()).not.toHaveBeenCalled();
    });

    it('requests a recompute for the local civil date each stored sleep session ends on', async () => {
      const user = await createConnectedUser();
      await prisma.user.update({ where: { id: user.id }, data: { timezone: 'America/Los_Angeles' } });
      // Ends 2026-09-02T06:00Z = 2026-09-01 23:00 in Los Angeles.
      (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([
        { startTime: new Date('2026-09-01T22:00:00Z'), endTime: new Date('2026-09-02T06:00:00Z'), minutesAsleep: 420 },
      ]);

      await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'SLEEP', date: '2026-09-02' } } as Job);

      const dates = enqueue().mock.calls.map((c: unknown[]) => c[1]);
      // The night's own local day, derived from the user's zone, comes first.
      expect(dates[0]).toBe('2026-09-01');
      expect(enqueue().mock.calls.every((c: unknown[]) => c[0] === user.id)).toBe(true);
      // ...and the days after it, whose sleep-debt window now contains this night.
      expect(dates).toContain('2026-09-02');
      expect(dates).toContain('2026-09-14');
      expect(new Set(dates).size).toBe(dates.length);
    });

    it('requests one recompute per distinct day for a backfill, not one per metric', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchMetricRange as jest.Mock).mockImplementation(async (_t: string, metric: string) =>
        metric === 'STEPS'
          ? [{ recordedAt: new Date('2026-08-03'), value: 5000 }]
          : [
              { recordedAt: new Date('2026-08-01'), value: 40 },
              { recordedAt: new Date('2026-08-02'), value: 41 },
            ],
      );

      await processSyncJob({ name: 'backfill', data: { userId: user.id, startDate: '2026-08-01', endDate: '2026-08-03' } } as Job);

      const dates = enqueue().mock.calls.map((c) => c[1]).sort();
      expect(dates).toEqual(['2026-08-01', '2026-08-02']);
    });

    it('never fails (or retries) a sync job whose data is stored just because the score enqueue failed', async () => {
      const user = await createConnectedUser();
      (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([{ recordedAt: new Date('2026-09-01'), value: 44 }]);
      enqueue().mockRejectedValue(new Error('redis down'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(
        processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'HRV', date: '2026-09-01' } } as Job),
      ).resolves.toBeUndefined();

      expect(await prisma.biometricRecord.count({ where: { userId: user.id, metricType: 'HRV' } })).toBe(1);
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.lastSyncedAt).not.toBeNull();
      errorSpy.mockRestore();
    });

    it('runs a computeDailyScore job through the worker and persists the score', async () => {
      const user = await createConnectedUser();
      const last = await seedHistory(user.id, '2026-06-01', 40);

      await processSyncJob({ name: 'computeDailyScore', data: { userId: user.id, date: last } } as Job);

      const score = await prisma.dailyScore.findUnique({
        where: { userId_date_type: { userId: user.id, date: day(last), type: 'RECOVERY' } },
      });
      expect(score?.score).not.toBeNull();
    });

    it('asks for the day summary after a scored day, and not after a day with no input', async () => {
      const refresh = daySummaryJob.refreshDaySummaryAfterScore as jest.Mock;
      refresh.mockClear();
      const user = await createConnectedUser();
      const last = await seedHistory(user.id, '2026-06-01', 40);

      await processSyncJob({ name: 'computeDailyScore', data: { userId: user.id, date: last } } as Job);
      expect(refresh).toHaveBeenCalledWith(user.id, last);

      refresh.mockClear();
      const empty = await prisma.user.create({ data: { email: `w-${randomUUID()}@example.com`, name: 'Test User' } });
      await processSyncJob({ name: 'computeDailyScore', data: { userId: empty.id, date: '2026-06-01' } } as Job);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('leaves coachDaySummary jobs to the coach-summary worker', async () => {
      const run = daySummaryJob.runDaySummaryJob as jest.Mock;
      run.mockClear();
      await processSyncJob({ name: 'coachDaySummary', data: { userId: 'u-1', date: '2026-09-30' } } as Job);
      expect(run).not.toHaveBeenCalled();
    });

    it('runs the score sweep for a scoreSweep job', async () => {
      (scoreSweep.runScoreSweep as jest.Mock).mockResolvedValue({ usersChecked: 0, jobsEnqueued: 0 });

      await processSyncJob({ name: 'scoreSweep', data: {} } as Job);

      expect(scoreSweep.runScoreSweep).toHaveBeenCalledTimes(1);
    });
  });
});

describe('backfill with an empty window', () => {
  // A reconnect on the same day as the last sync used to enqueue a window whose
  // start equals its end. Google answers an empty daily-HRV filter with a 400,
  // which failed the whole job even though there was nothing to fetch.
  beforeEach(() => {
    (healthClient.fetchMetricRange as jest.Mock).mockReset();
    (healthClient.fetchSleepSessions as jest.Mock).mockReset();
  });

  it.each([
    ['start equals end', '2026-09-21', '2026-09-21'],
    ['start is after end', '2026-09-22', '2026-09-21'],
  ])('does not call Google when %s', async (_label, startDate, endDate) => {
    const user = await createConnectedUser();

    await expect(
      processSyncJob({ name: 'backfill', data: { userId: user.id, startDate, endDate } } as Job),
    ).resolves.toBeUndefined();

    expect(healthClient.fetchMetricRange).not.toHaveBeenCalled();
    expect(healthClient.fetchSleepSessions).not.toHaveBeenCalled();
  });

  it('leaves lastSyncedAt and the connection status untouched', async () => {
    const user = await createConnectedUser();
    const before = await prisma.healthConnection.findUnique({ where: { userId: user.id } });

    await processSyncJob({
      name: 'backfill',
      data: { userId: user.id, startDate: '2026-09-21', endDate: '2026-09-21' },
    } as Job);

    const after = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(after?.lastSyncedAt).toEqual(before?.lastSyncedAt);
    expect(after?.status).toBe('CONNECTED');
  });

  it('still fetches a one-day window (start one day before end)', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([]);
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([]);

    await processSyncJob({
      name: 'backfill',
      data: { userId: user.id, startDate: '2026-09-20', endDate: '2026-09-21' },
    } as Job);

    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'HRV', '2026-09-20', '2026-09-21');
  });
});

describe('processSyncJob: steps history backfill', () => {
  const historyJob = (userId: string) => ({ name: STEPS_HISTORY_BACKFILL_JOB, data: { userId } }) as Job;

  it('fetches only STEPS over the 365 days before today and stores them', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([
      { recordedAt: new Date('2026-01-10T00:00:00Z'), value: 6400 },
      { recordedAt: new Date('2026-05-20T00:00:00Z'), value: 11200 },
    ]);

    await processSyncJob(historyJob(user.id));

    const { startDate, endDate } = stepsHistoryWindow();
    expect(healthClient.fetchMetricRange).toHaveBeenCalledTimes(1);
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'STEPS', startDate, endDate);
    expect(healthClient.fetchSleepSessions).not.toHaveBeenCalled();
    const records = await prisma.biometricRecord.findMany({ where: { userId: user.id }, orderBy: { recordedAt: 'asc' } });
    expect(records.map((r) => [r.metricType, r.value])).toEqual([['STEPS', 6400], ['STEPS', 11200]]);
  });

  it('marks the history as backfilled, leaves lastSyncedAt alone and requests no scores', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([{ recordedAt: new Date('2026-03-01T00:00:00Z'), value: 900 }]);

    await processSyncJob(historyJob(user.id));

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.stepsHistoryBackfilledAt).toBeInstanceOf(Date);
    expect(conn?.lastSyncedAt).toBeNull();
    expect(scoringQueue.enqueueScoreCompute).not.toHaveBeenCalled();
  });

  it('is idempotent: a re-run overwrites the same days instead of duplicating them', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock)
      .mockResolvedValueOnce([{ recordedAt: new Date('2026-04-02T00:00:00Z'), value: 3000 }])
      .mockResolvedValueOnce([{ recordedAt: new Date('2026-04-02T00:00:00Z'), value: 3500 }]);

    await processSyncJob(historyJob(user.id));
    await processSyncJob(historyJob(user.id));

    const records = await prisma.biometricRecord.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(1);
    expect(records[0].value).toBe(3500);
  });

  it('does nothing for a disconnected connection', async () => {
    const user = await createConnectedUser();
    await prisma.healthConnection.update({ where: { userId: user.id }, data: { status: 'DISCONNECTED' } });

    await processSyncJob(historyJob(user.id));

    expect(healthClient.fetchMetricRange).not.toHaveBeenCalled();
    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.stepsHistoryBackfilledAt).toBeNull();
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    const user = await createConnectedUser();
    const unauthorized = Object.assign(new Error('unauthorized'), { status: 401 });
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValueOnce(unauthorized).mockResolvedValueOnce([]);
    (oauth.refreshHealthTokens as jest.Mock).mockReset().mockResolvedValue({
      accessToken: 'fresh-access', refreshToken: 'fresh-refresh', expiresIn: 3600,
    });

    await processSyncJob(historyJob(user.id));

    expect(healthClient.fetchMetricRange).toHaveBeenLastCalledWith('fresh-access', 'STEPS', expect.any(String), expect.any(String));
    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.stepsHistoryBackfilledAt).toBeInstanceOf(Date);
  });

  it('disconnects on a 401 that survives the refresh, without marking the history done', async () => {
    const user = await createConnectedUser();
    const unauthorized = Object.assign(new Error('unauthorized'), { status: 401 });
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(unauthorized);

    await processSyncJob(historyJob(user.id));

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('DISCONNECTED');
    expect(conn?.stepsHistoryBackfilledAt).toBeNull();
  });

  it('rethrows other errors so BullMQ retries, without marking the history done', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));

    await expect(processSyncJob(historyJob(user.id))).rejects.toThrow('rate limited');

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.stepsHistoryBackfilledAt).toBeNull();
  });
});

describe('processSyncJob: sleep history backfill', () => {
  const historyJob = (userId: string) => ({ name: SLEEP_HISTORY_BACKFILL_JOB, data: { userId } }) as Job;
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  // A night ending at 07:00 UTC on `date` (offset 0, so it keys onto `date`).
  const night = (date: string, minutesAsleep: number) => ({
    startTime: new Date(new Date(`${date}T07:00:00Z`).getTime() - 8 * 3600_000),
    endTime: new Date(`${date}T07:00:00Z`),
    minutesAsleep,
    startUtcOffsetSeconds: 0,
    endUtcOffsetSeconds: 0,
  });

  it('fetches a year of sleep sessions only, and stores them with their rollups', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([night(daysAgo(200), 420), night(daysAgo(10), 465)]);

    await processSyncJob(historyJob(user.id));

    const { startDate, endDate } = sleepHistoryWindow();
    expect(healthClient.fetchMetricRange).not.toHaveBeenCalled();
    expect(healthClient.fetchSleepSessions).toHaveBeenCalledTimes(1);
    // Widened a day each side like every sleep fetch (see sleepWindow in the worker).
    const [, from, to] = (healthClient.fetchSleepSessions as jest.Mock).mock.calls[0];
    expect(from < startDate && to > endDate).toBe(true);
    expect(await prisma.sleepSession.count({ where: { userId: user.id } })).toBe(2);
    const rollups = await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: 'SLEEP' }, orderBy: { recordedAt: 'asc' } });
    expect(rollups.map((r) => [r.recordedAt.toISOString().slice(0, 10), r.value])).toEqual([
      [daysAgo(200), 420],
      [daysAgo(10), 465],
    ]);
  });

  it('re-scores the days a recent night feeds, but nothing older than the sweep lookback', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchSleepSessions as jest.Mock).mockResolvedValue([night(daysAgo(200), 420), night(daysAgo(10), 465)]);

    await processSyncJob(historyJob(user.id));

    const dates = (scoringQueue.enqueueScoreCompute as jest.Mock).mock.calls.map((c) => c[1] as string);
    expect(dates).toContain(daysAgo(10));
    expect(dates).not.toContain(daysAgo(200));
    expect(dates.every((d) => d >= daysAgo(90))).toBe(true);
  });

  it('marks the history as backfilled and leaves lastSyncedAt alone', async () => {
    const user = await createConnectedUser();

    await processSyncJob(historyJob(user.id));

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.sleepHistoryBackfilledAt).toBeInstanceOf(Date);
    expect(conn?.stepsHistoryBackfilledAt).toBeNull();
    expect(conn?.lastSyncedAt).toBeNull();
  });

  it('is idempotent: a re-run overwrites the same night instead of duplicating it', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchSleepSessions as jest.Mock)
      .mockResolvedValueOnce([night(daysAgo(120), 400)])
      .mockResolvedValueOnce([night(daysAgo(120), 410)]);

    await processSyncJob(historyJob(user.id));
    await processSyncJob(historyJob(user.id));

    const rollups = await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: 'SLEEP' } });
    expect(rollups).toHaveLength(1);
    expect(rollups[0].value).toBe(410);
  });

  it('does nothing for a disconnected connection', async () => {
    const user = await createConnectedUser();
    await prisma.healthConnection.update({ where: { userId: user.id }, data: { status: 'DISCONNECTED' } });

    await processSyncJob(historyJob(user.id));

    expect(healthClient.fetchSleepSessions).not.toHaveBeenCalled();
    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.sleepHistoryBackfilledAt).toBeNull();
  });

  it('disconnects on a 401 that survives the refresh, without marking the history done', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchSleepSessions as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));

    await processSyncJob(historyJob(user.id));

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('DISCONNECTED');
    expect(conn?.sleepHistoryBackfilledAt).toBeNull();
  });

  it('rethrows other errors so BullMQ retries, without marking the history done', async () => {
    const user = await createConnectedUser();
    (healthClient.fetchSleepSessions as jest.Mock).mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));

    await expect(processSyncJob(historyJob(user.id))).rejects.toThrow('rate limited');

    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.sleepHistoryBackfilledAt).toBeNull();
  });
});

async function createCatchUpUser(status: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED', lastSyncedAt: Date | null = null) {
  const user = await prisma.user.create({ data: { email: `cu-${randomUUID()}@example.com`, name: 'Test User' } });
  await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: `fb-cu-${randomUUID()}`,
      encryptedAccessToken: encryptToken('access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      status,
      lastSyncedAt,
    },
  });
  return user;
}

describe('catch-up jobs', () => {
  it('fetches every metric over the catch-up window and advances lastSyncedAt', async () => {
    const lastSyncedAt = new Date(Date.now() - 2 * 24 * 3600_000);
    const user = await createCatchUpUser('CONNECTED', lastSyncedAt);
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([{ recordedAt: new Date(), value: 4200 }]);

    await processSyncJob({ name: 'catchUp', data: { userId: user.id } } as Job);

    const today = localCivilDate(new Date(), 'UTC');
    const { startDate, endDate } = catchUp.catchUpWindow(lastSyncedAt, today, 'UTC');
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'STEPS', startDate, endDate);
    const conn = await prisma.healthConnection.findUniqueOrThrow({ where: { userId: user.id } });
    expect(conn.lastSyncedAt!.getTime()).toBeGreaterThan(lastSyncedAt.getTime());
    expect(await prisma.biometricRecord.count({ where: { userId: user.id, metricType: 'STEPS' } })).toBe(1);
  });

  it('skips a disconnected user', async () => {
    const user = await createCatchUpUser('DISCONNECTED');

    await processSyncJob({ name: 'catchUp', data: { userId: user.id } } as Job);

    expect(healthClient.fetchMetricRange).not.toHaveBeenCalled();
  });

  it('queues a catch-up for every connected user, and only those, on the sweep', async () => {
    const on = await createCatchUpUser('CONNECTED');
    const off = await createCatchUpUser('DISCONNECTED');
    const enqueue = jest.spyOn(catchUp, 'enqueueCatchUp').mockResolvedValue(undefined);

    await processSyncJob({ name: 'catchUpSweep', data: {} } as Job);

    const queued = enqueue.mock.calls.map(([id]) => id);
    expect(queued).toContain(on.id);
    expect(queued).not.toContain(off.id);
    enqueue.mockRestore();
  });
});
