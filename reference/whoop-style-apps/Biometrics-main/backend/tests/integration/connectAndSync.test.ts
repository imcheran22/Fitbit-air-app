import request from 'supertest';
import { randomUUID } from 'crypto';
import nock from 'nock';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { processSyncJob } from '../../src/sync/worker';
import * as queue from '../../src/sync/queue';
import * as serviceAccount from '../../src/health/serviceAccount';
import { testServer } from '../helpers/server';

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
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.GOOGLE_HEALTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_HEALTH_REDIRECT_URI = 'https://app.example.com/health/callback';
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = '92059865078';
});

afterEach(() => nock.cleanAll());
afterAll(async () => {
  await prisma.$disconnect();
});

describe('connect Google Health and sync end to end (mocked Google API)', () => {
  it('connects, backfills, and serves data via /me/biometrics', async () => {
    const user = await prisma.user.create({
      data: { email: `e2e-${Date.now()}@example.com`, name: 'Test User'},
    });
    const authHeader = await authHeaderFor(user.id);

    const authorizeRes = await request(await testServer(createApp())).get('/health/authorize').set(authHeader);
    const state = new URL(authorizeRes.body.url).searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'health-access', refresh_token: 'health-refresh', expires_in: 3599,
    });
    // Suffixed with a fresh UUID, like the prior version of this test's analogous
    // user id, so repeat runs against a persistent test DB don't collide on
    // HealthConnection.healthUserId's unique constraint.
    const healthUserId = `health-user-e2e-${randomUUID()}`;
    nock('https://health.googleapis.com').get('/v4/users/me/identity').reply(200, {
      name: 'users/me/identity', legacyUserId: 'DCB3ZG', healthUserId,
    });
    nock('https://health.googleapis.com')
      .post('/v4/projects/92059865078/subscribers/biometrics-subscriber/subscriptions')
      .reply(200, { name: 'projects/92059865078/subscribers/biometrics-subscriber/subscriptions/sub-e2e' });

    // registerUserSubscription authenticates to Google as a service account via
    // google-auth-library's Application Default Credentials machinery
    // (GoogleAuth -> gtoken -> gaxios), which internally performs a dynamic
    // `import('node-fetch')` to make its HTTP calls. That dynamic import throws
    // (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG) inside Jest's CommonJS VM
    // sandbox, which has no importModuleDynamically callback registered -- a
    // Jest/Node tooling limitation, not an application bug, and the same
    // boundary Task 9's own unit tests (tests/health/subscriber.test.ts) mock
    // for exactly this reason. Every HTTP call this application's own code
    // makes directly (OAuth exchange, identity, subscription creation,
    // backfill fetches) still goes through real fetch calls intercepted by
    // nock below.
    jest.spyOn(serviceAccount, 'getServiceAccountToken').mockResolvedValue('service-account-access');

    let enqueuedBackfill: any;
    jest.spyOn(queue, 'enqueueBackfillJob').mockImplementation(async (data) => {
      enqueuedBackfill = data;
      return {} as any;
    });

    const connectRes = await request(await testServer(createApp())).get('/health/callback').query({ code: 'auth-code', state });
    expect(connectRes.status).toBe(302);

    // The default 30-day backfill window is chunked into <=14-day dailyRollUp
    // calls (confirmed live: heart-rate rejects a single request spanning
    // more than 14 days), so a fresh connect's backfill makes 3 calls for the
    // dailyRollUp-backed metric (STEPS: 30 / 14 -> 3 windows), not 1.
    nock('https://health.googleapis.com')
      .post('/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp')
      .times(3)
      .reply(200, {
        rollupDataPoints: [{ civilStartTime: { date: { year: 2026, month: 9, day: 1 } }, steps: { countSum: '7000' } }],
      });
    // RESTING_HR comes from Google's dedicated daily type (one list call).
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints')
      .query(true)
      .reply(200, {
        dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 9, day: 1 }, beatsPerMinute: '55' } }],
      });
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/sleep/dataPoints')
      .query(true)
      .reply(200, {
        dataPoints: [{ sleep: { interval: { startTime: '2026-09-01T22:00:00Z', endTime: '2026-09-02T05:40:00Z' }, summary: { minutesAsleep: '400' } } }],
      });
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/daily-heart-rate-variability/dataPoints')
      .query(true)
      .reply(200, {
        dataPoints: [{ dailyHeartRateVariability: { date: { year: 2026, month: 9, day: 1 }, averageHeartRateVariabilityMilliseconds: 40 } }],
      });

    await processSyncJob({ name: 'backfill', data: enqueuedBackfill } as any);

    const res = await request(await testServer(createApp())).get('/me/biometrics').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    // SLEEP is a rollup keyed on the local civil date of the session's END
    // (user timezone defaults to UTC), not the UTC date of its start.
    const sleep = res.body.filter((r: any) => r.metricType === 'SLEEP');
    expect(sleep).toHaveLength(1);
    expect(sleep[0].value).toBe(400);
    expect(sleep[0].recordedAt).toBe('2026-09-02T00:00:00.000Z');
  });
});
