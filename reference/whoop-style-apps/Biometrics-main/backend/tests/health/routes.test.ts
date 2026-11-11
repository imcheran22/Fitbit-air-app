import request from 'supertest';
import { randomUUID, createHmac } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import * as oauth from '../../src/health/oauth';
import * as subscriber from '../../src/health/subscriber';
import * as queue from '../../src/sync/queue';
import { testServer } from '../helpers/server';

jest.mock('../../src/health/oauth');
jest.mock('../../src/health/subscriber');
// A bare `jest.mock('../../src/sync/queue')` (or a factory that calls
// `jest.requireActual`) still loads the real module once to build the mock's
// shape, which runs its top-level `new IORedis(...)` as a side effect and
// leaves a real socket open that keeps Jest from exiting (same root cause
// flagged in Task 10's report and avoided in this file).
// Supplying a factory with an in-memory stand-in for `connection` avoids ever
// loading the real module.
jest.mock('../../src/sync/queue', () => {
  const store = new Map<string, string>();
  return {
    enqueueFetchJob: jest.fn(),
    enqueueBackfillJob: jest.fn(),
    enqueueStepsHistoryBackfill: jest.fn(),
    enqueueSleepHistoryBackfill: jest.fn(),
    connection: {
      set: async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      },
      get: async (key: string) => store.get(key) ?? null,
      del: async (key: string) => (store.delete(key) ? 1 : 0),
      getdel: async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      },
    },
  };
});

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = 'Bearer webhook-secret';
});

afterAll(async () => {
  await prisma.$disconnect();
});

// The oauth module is automocked, so give the URL builder a real shape. Set in
// beforeEach so a jest.clearAllMocks() in any suite cannot strand it.
beforeEach(() => {
  (oauth.buildAuthorizeUrl as jest.Mock).mockImplementation(
    (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  );
});

async function getHealthOAuthState(userId: string): Promise<string> {
  const authHeader = await authHeaderFor(userId);
  const res = await request(await testServer(createApp()))
    .get('/health/authorize')
    .set(authHeader);
  expect(res.status).toBe(200);
  const state = new URL(res.body.url).searchParams.get('state');
  expect(state).toBeTruthy();
  return state!;
}

describe('GET /health/authorize', () => {
  it('requires auth and returns the Google authorize URL as JSON', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const authHeader = await authHeaderFor(user.id);
    (oauth.buildAuthorizeUrl as jest.Mock).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=abc');

    const res = await request(await testServer(createApp())).get('/health/authorize').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=abc');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).get('/health/authorize');
    expect(res.status).toBe(401);
  });
});

describe('GET /health/callback', () => {
  it('succeeds with NO Authorization header, using the state token instead', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const authHeader = await authHeaderFor(user.id);
    (oauth.buildAuthorizeUrl as jest.Mock).mockImplementation((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);

    const authorizeRes = await request(await testServer(createApp())).get('/health/authorize').set(authHeader);
    const state = new URL(authorizeRes.body.url).searchParams.get('state')!;

    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
      accessToken: 'health-access', refreshToken: 'health-refresh', expiresIn: 3599,
    });
    const healthUserId = `health-user-1-${randomUUID()}`;
    (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
    (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-1');

    const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'auth-code', state });

    expect(res.status).toBe(302);
    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.healthUserId).toBe(healthUserId);
    expect(conn?.webhookSubscriptionId).toBe('sub-1');
  });

  it('rejects a missing or unknown state token', async () => {
    const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'auth-code', state: 'unknown-state' });
    expect(res.status).toBe(401);
  });

  it('rejects a replayed state token, because state is single-use', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const state = await getHealthOAuthState(user.id);

    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
      accessToken: 'health-access-replay', refreshToken: 'health-refresh-replay', expiresIn: 3599,
    });
    (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId: `health-user-replay-${randomUUID()}` });
    (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-replay');

    const first = await request(await testServer(createApp())).get('/health/callback').query({ code: 'c1', state });
    expect(first.status).toBe(302);

    const replay = await request(await testServer(createApp())).get('/health/callback').query({ code: 'c2', state });
    expect(replay.status).toBe(401);
  });

  it('does not leave the connection CONNECTED when subscription registration fails', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const state = await getHealthOAuthState(user.id);

    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
      accessToken: 'health-access-subfail', refreshToken: 'health-refresh-subfail', expiresIn: 3599,
    });
    (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId: `health-user-subfail-${randomUUID()}` });
    (subscriber.registerUserSubscription as jest.Mock).mockRejectedValueOnce(
      new Error('Google Health subscription registration failed'),
    );

    const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

    expect(res.status).toBe(500);
    // The row must never exist claiming to be healthy with a subscription that
    // was never actually created at Google.
    expect(await prisma.healthConnection.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it('fails clearly, without touching Google or the DB, when the code exchange returns no refresh token', async () => {
    (subscriber.registerUserSubscription as jest.Mock).mockClear();
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const state = await getHealthOAuthState(user.id);

    // No refreshToken at all on the initial exchange: the connection would be
    // unrecoverable after the first hour, so it must not be stored.
    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({ accessToken: 'health-access-norefresh', expiresIn: 3599 });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

    expect(res.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      'Google Health callback failed',
      expect.objectContaining({ message: 'Google did not return a refresh token during the initial OAuth exchange' }),
    );
    consoleError.mockRestore();
    expect(subscriber.registerUserSubscription).not.toHaveBeenCalled();
    expect(await prisma.healthConnection.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  describe('reconnecting while already connected', () => {
    async function createConnectedUser(subscriptionId: string) {
      const user = await prisma.user.create({
        data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
      });
      const healthUserId = `health-user-reconnect-${randomUUID()}`;
      await prisma.healthConnection.create({
        data: {
          userId: user.id,
          healthUserId,
          encryptedAccessToken: 'x',
          encryptedRefreshToken: 'x',
          tokenExpiresAt: new Date(Date.now() + 3600_000),
          webhookSubscriptionId: subscriptionId,
          lastSyncedAt: new Date(Date.now() - 24 * 3600_000),
        },
      });
      return { user, healthUserId };
    }

    it('deletes the previous Google subscription so it is not leaked', async () => {
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
      const { user, healthUserId } = await createConnectedUser('sub-old');
      const state = await getHealthOAuthState(user.id);

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-2', refreshToken: 'health-refresh-2', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-new');

      const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(res.status).toBe(302);
      expect(subscriber.deleteUserSubscription).toHaveBeenCalledTimes(1);
      expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-old');
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(conn?.webhookSubscriptionId).toBe('sub-new');
    });

    // Regression: reconnecting on the same UTC day as the last sync built the
    // window [today, today), which is empty. The worker sent it to Google, got a
    // 400, and the backfill job failed.
    it('does not enqueue a backfill when there is nothing before today to fetch', async () => {
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
      const { user, healthUserId } = await createConnectedUser('sub-same-day');
      await prisma.healthConnection.update({ where: { userId: user.id }, data: { lastSyncedAt: new Date() } });
      const state = await getHealthOAuthState(user.id);
      (queue.enqueueBackfillJob as jest.Mock).mockClear();

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-3', refreshToken: 'health-refresh-3', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-same-day-new');

      const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=connected');
      expect(queue.enqueueBackfillJob).not.toHaveBeenCalled();
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(conn?.webhookSubscriptionId).toBe('sub-same-day-new');
    });

    it('still enqueues a backfill from the last sync day when it was on an earlier day', async () => {
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
      const { user, healthUserId } = await createConnectedUser('sub-earlier');
      const state = await getHealthOAuthState(user.id);
      (queue.enqueueBackfillJob as jest.Mock).mockClear();

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-4', refreshToken: 'health-refresh-4', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-earlier-new');

      await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(queue.enqueueBackfillJob).toHaveBeenCalledTimes(1);
      const arg = (queue.enqueueBackfillJob as jest.Mock).mock.calls[0][0];
      expect(arg.userId).toBe(user.id);
      expect(arg.startDate < arg.endDate).toBe(true);
    });

    it('enqueues the steps and sleep history backfills for the heat map after connecting', async () => {
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
      const { user, healthUserId } = await createConnectedUser('sub-history');
      const state = await getHealthOAuthState(user.id);
      (queue.enqueueStepsHistoryBackfill as jest.Mock).mockReset().mockResolvedValue(undefined);
      (queue.enqueueSleepHistoryBackfill as jest.Mock).mockReset().mockResolvedValue(undefined);

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-5', refreshToken: 'health-refresh-5', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-history-new');

      await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(queue.enqueueStepsHistoryBackfill).toHaveBeenCalledWith(user.id);
      expect(queue.enqueueSleepHistoryBackfill).toHaveBeenCalledWith(user.id);
    });

    it('still completes the connect, and still queues the sleep history, when the steps history cannot be enqueued', async () => {
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
      const { user, healthUserId } = await createConnectedUser('sub-history-fail');
      const state = await getHealthOAuthState(user.id);
      (queue.enqueueStepsHistoryBackfill as jest.Mock).mockReset().mockRejectedValue(new Error('redis down'));
      (queue.enqueueSleepHistoryBackfill as jest.Mock).mockReset().mockResolvedValue(undefined);
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-6', refreshToken: 'health-refresh-6', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-history-fail-new');

      const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });
      consoleError.mockRestore();

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('status=connected');
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(queue.enqueueSleepHistoryBackfill).toHaveBeenCalledWith(user.id);
    });

    it('still completes the connect when deleting the previous subscription fails', async () => {
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockRejectedValue(new Error('network error'));
      const { user, healthUserId } = await createConnectedUser('sub-old-undeletable');
      const state = await getHealthOAuthState(user.id);

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-3', refreshToken: 'health-refresh-3', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-new-2');

      const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(res.status).toBe(302);
      expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-old-undeletable');
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.webhookSubscriptionId).toBe('sub-new-2');
      expect(conn?.status).toBe('CONNECTED');
    });

    it('deletes the existing subscription BEFORE attempting to register a new one', async () => {
      // Confirmed live: Google allows at most one subscription per
      // (subscriber, user) and 409s outright if a stale one still exists --
      // cleaning up only AFTER a successful registerUserSubscription call
      // never runs, because that success is exactly what the stale
      // subscription blocks. This asserts the actual call order, not just
      // that both eventually happen.
      const callOrder: string[] = [];
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockImplementation(async () => {
        callOrder.push('delete');
      });
      (subscriber.registerUserSubscription as jest.Mock).mockReset().mockImplementation(async () => {
        callOrder.push('register');
        return 'sub-new-3';
      });
      const { user, healthUserId } = await createConnectedUser('sub-old-3');
      const state = await getHealthOAuthState(user.id);

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-4', refreshToken: 'health-refresh-4', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });

      const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(res.status).toBe(302);
      expect(callOrder).toEqual(['delete', 'register']);
    });

    it('reconnecting a DISCONNECTED row with a stale subscription deletes it before registering a new one', async () => {
      // The real scenario this task's fix was built for: a row that was
      // marked DISCONNECTED (e.g. by the sweep, or a swallowed delete
      // failure) without its Google subscription ever actually being
      // removed. A plain CONNECTED-only check would miss this exact case.
      (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
      const { user, healthUserId } = await createConnectedUser('sub-stale-disconnected');
      await prisma.healthConnection.update({ where: { userId: user.id }, data: { status: 'DISCONNECTED' } });
      const state = await getHealthOAuthState(user.id);

      (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
        accessToken: 'health-access-5', refreshToken: 'health-refresh-5', expiresIn: 7200,
      });
      (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId });
      (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-new-4');

      const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

      expect(res.status).toBe(302);
      expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-stale-disconnected');
      const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
      expect(conn?.status).toBe('CONNECTED');
      expect(conn?.webhookSubscriptionId).toBe('sub-new-4');
    });
  });

  it('cleans up a different user\'s stale row for the same healthUserId before connecting', async () => {
    (subscriber.deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
    // healthUserId is @unique on HealthConnection, and Google's own subscription
    // conflict is keyed on the real Google account, not our local userId. User A's
    // row here is exactly the shape of stale/orphaned data (e.g. from a prior
    // reconnect under a different local identity) that used to 409 or P2002 user
    // B's own, legitimate connection attempt for the same real account.
    const sharedHealthUserId = `health-user-shared-${randomUUID()}`;
    const userA = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    await prisma.healthConnection.create({
      data: {
        userId: userA.id,
        healthUserId: sharedHealthUserId,
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        webhookSubscriptionId: 'sub-a',
      },
    });
    const userB = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const state = await getHealthOAuthState(userB.id);

    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
      accessToken: 'health-access-b', refreshToken: 'health-refresh-b', expiresIn: 3599,
    });
    (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId: sharedHealthUserId });
    (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-b');

    const res = await request(await testServer(createApp())).get('/health/callback').query({ code: 'code', state });

    expect(res.status).toBe(302);
    expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-a');
    // User A's stale row is gone -- it was orphaned data blocking the real account.
    expect(await prisma.healthConnection.findUnique({ where: { userId: userA.id } })).toBeNull();
    const connB = await prisma.healthConnection.findUnique({ where: { userId: userB.id } });
    expect(connB?.status).toBe('CONNECTED');
    expect(connB?.webhookSubscriptionId).toBe('sub-b');
    expect(connB?.healthUserId).toBe(sharedHealthUserId);
  });
});

describe('GET /webhooks/health', () => {
  it('returns 204 (no verification-challenge handshake needed for this provider)', async () => {
    // Google's subscriber verification is handled entirely by the automated
    // handshake during subscriber creation (see scripts/registerHealthSubscriber.ts),
    // not a per-request GET challenge like some other providers use — this route exists only
    // in case Google ever sends a GET here, and returns a harmless 204.
    const res = await request(await testServer(createApp())).get('/webhooks/health');
    expect(res.status).toBe(204);
  });
});

describe('POST /webhooks/health', () => {
  it('rejects a request with a bad or missing Authorization header', async () => {
    const res = await request(await testServer(createApp()))
      .post('/webhooks/health')
      .send([{ data: { healthUserId: 'health-user-1', dataType: 'steps', operation: 'UPSERT', intervals: [] } }]);
    expect(res.status).toBe(401);
    expect(queue.enqueueFetchJob).not.toHaveBeenCalled();
  });

  it('enqueues a fetch job for a valid UPSERT notification', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const healthUserId = `health-user-2-${randomUUID()}`;
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId,
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const body = JSON.stringify([
      {
        data: {
          healthUserId,
          dataType: 'steps',
          operation: 'UPSERT',
          intervals: [{ physicalTimeInterval: { startTime: '2026-09-16T00:00:00Z', endTime: '2026-09-16T00:05:00Z' } }],
        },
      },
    ]);

    const res = await request(await testServer(createApp()))
      .post('/webhooks/health')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer webhook-secret')
      .send(body);

    expect(res.status).toBe(201);
    expect(queue.enqueueFetchJob).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, metricType: 'STEPS', date: '2026-09-16' }),
    );
  });

  it('skips a non-UPSERT operation without enqueuing or erroring', async () => {
    (queue.enqueueFetchJob as jest.Mock).mockClear();

    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const healthUserId = `health-user-delete-${randomUUID()}`;
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId,
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const body = JSON.stringify([
      {
        data: {
          healthUserId,
          dataType: 'steps',
          operation: 'DELETE',
          intervals: [{ physicalTimeInterval: { startTime: '2026-09-16T00:00:00Z', endTime: '2026-09-16T00:05:00Z' } }],
        },
      },
    ]);

    const res = await request(await testServer(createApp()))
      .post('/webhooks/health')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer webhook-secret')
      .send(body);

    // Conservative: skip any non-UPSERT operation rather than treat it as an
    // error, per the spec's note that DELETE was never observed live.
    expect(res.status).toBe(201);
    expect(queue.enqueueFetchJob).not.toHaveBeenCalled();
  });

  async function createWebhookUser() {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, name: 'Test User'},
    });
    const healthUserId = `health-user-wh-${randomUUID()}`;
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId,
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    return { user, healthUserId };
  }

  async function postWebhook(body: unknown) {
    return request(await testServer(createApp()))
      .post('/webhooks/health')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer webhook-secret')
      .send(JSON.stringify(body));
  }

  describe('day bucketing', () => {
    // dailyRollUp buckets by the user's civil date, so the day to re-fetch must
    // come from the civil fields when present. A user west of UTC generating
    // data at 20:30 local on the 16th is already 03:30 UTC on the 17th.
    it('prefers the structured civilDateTimeInterval date over the UTC date of the physical instant', async () => {
      (queue.enqueueFetchJob as jest.Mock).mockClear();
      const { user, healthUserId } = await createWebhookUser();

      const res = await postWebhook([{
        data: {
          healthUserId,
          dataType: 'steps',
          operation: 'UPSERT',
          intervals: [{
            physicalTimeInterval: { startTime: '2026-09-17T03:30:00Z', endTime: '2026-09-17T03:35:00Z' },
            civilDateTimeInterval: {
              startTime: { date: { year: 2026, month: 9, day: 16 }, time: { hours: 20, minutes: 30 } },
              endTime: { date: { year: 2026, month: 9, day: 16 }, time: { hours: 20, minutes: 35 } },
            },
            civilIso8601TimeInterval: { startTime: '2026-09-16T20:30:00', endTime: '2026-09-16T20:35:00' },
          }],
        },
      }]);

      expect(res.status).toBe(201);
      expect(queue.enqueueFetchJob).toHaveBeenCalledTimes(1);
      expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'STEPS', date: '2026-09-16' });
    });

    it('falls back to civilIso8601TimeInterval when the structured civil field is absent', async () => {
      (queue.enqueueFetchJob as jest.Mock).mockClear();
      const { user, healthUserId } = await createWebhookUser();

      const res = await postWebhook([{
        data: {
          healthUserId,
          dataType: 'heart-rate',
          operation: 'UPSERT',
          intervals: [{
            physicalTimeInterval: { startTime: '2026-09-17T03:30:00Z', endTime: '2026-09-17T03:35:00Z' },
            civilIso8601TimeInterval: { startTime: '2026-09-16T20:30:00', endTime: '2026-09-16T20:35:00' },
          }],
        },
      }]);

      expect(res.status).toBe(201);
      expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'RESTING_HR', date: '2026-09-16' });
    });

    it('falls back to the UTC date of the physical instant when no civil field is present', async () => {
      (queue.enqueueFetchJob as jest.Mock).mockClear();
      const { user, healthUserId } = await createWebhookUser();

      const res = await postWebhook([{
        data: {
          healthUserId,
          dataType: 'sleep',
          operation: 'UPSERT',
          intervals: [{ physicalTimeInterval: { startTime: '2026-09-17T03:30:00Z', endTime: '2026-09-17T03:35:00Z' } }],
        },
      }]);

      expect(res.status).toBe(201);
      expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'SLEEP', date: '2026-09-17' });
    });

    // SLEEP and HRV are fetched via dataPoints.list, whose filter is on raw
    // UTC instants -- NOT civil dates. If the civil date were used for the
    // fetch window here, a user west of UTC would get a [civil, civil + 1)
    // window that ends before the physical instant the notification is
    // about, and the fetch would silently return nothing (regression of C3).
    describe('dataPoints.list metrics (SLEEP / HRV) ignore civil-date fields', () => {
      const westOfUtcInterval = {
        // 05:00Z on the 17th is 22:00 on the 16th for a user at UTC-7.
        physicalTimeInterval: { startTime: '2026-09-17T05:00:00Z', endTime: '2026-09-17T05:30:00Z' },
        civilDateTimeInterval: {
          startTime: { date: { year: 2026, month: 9, day: 16 }, time: { hours: 22, minutes: 0 } },
          endTime: { date: { year: 2026, month: 9, day: 16 }, time: { hours: 22, minutes: 30 } },
        },
        civilIso8601TimeInterval: { startTime: '2026-09-16T22:00:00', endTime: '2026-09-16T22:30:00' },
      };

      it('uses the UTC date of the physical instant for a sleep notification even when civil-date fields are present', async () => {
        (queue.enqueueFetchJob as jest.Mock).mockClear();
        const { user, healthUserId } = await createWebhookUser();

        const res = await postWebhook([{
          data: { healthUserId, dataType: 'sleep', operation: 'UPSERT', intervals: [westOfUtcInterval] },
        }]);

        expect(res.status).toBe(201);
        expect(queue.enqueueFetchJob).toHaveBeenCalledTimes(1);
        expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'SLEEP', date: '2026-09-17' });
      });

      it('uses the UTC date of the physical instant for a heartRateVariability notification even when civil-date fields are present', async () => {
        (queue.enqueueFetchJob as jest.Mock).mockClear();
        const { user, healthUserId } = await createWebhookUser();

        const res = await postWebhook([{
          data: { healthUserId, dataType: 'heartRateVariability', operation: 'UPSERT', intervals: [westOfUtcInterval] },
        }]);

        expect(res.status).toBe(201);
        expect(queue.enqueueFetchJob).toHaveBeenCalledTimes(1);
        expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'HRV', date: '2026-09-17' });
      });

      it('still resolves the UTC date of the physical instant for a heartRateVariability notification with no civil fields', async () => {
        (queue.enqueueFetchJob as jest.Mock).mockClear();
        const { user, healthUserId } = await createWebhookUser();

        const res = await postWebhook([{
          data: {
            healthUserId,
            dataType: 'heartRateVariability',
            operation: 'UPSERT',
            intervals: [{ physicalTimeInterval: { startTime: '2026-09-17T05:00:00Z', endTime: '2026-09-17T05:30:00Z' } }],
          },
        }]);

        expect(res.status).toBe(201);
        expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'HRV', date: '2026-09-17' });
      });

      it('skips a sleep interval whose only usable field is a civil date (no physical instant to filter on)', async () => {
        (queue.enqueueFetchJob as jest.Mock).mockClear();
        const { healthUserId } = await createWebhookUser();

        const res = await postWebhook([{
          data: {
            healthUserId,
            dataType: 'sleep',
            operation: 'UPSERT',
            intervals: [{ civilIso8601TimeInterval: { startTime: '2026-09-16T22:00:00', endTime: '2026-09-16T22:30:00' } }],
          },
        }]);

        expect(res.status).toBe(201);
        expect(queue.enqueueFetchJob).not.toHaveBeenCalled();
      });
    });
  });

  describe('malformed batches', () => {
    it('still enqueues the valid notification and returns 204 when another item in the batch is malformed', async () => {
      (queue.enqueueFetchJob as jest.Mock).mockClear();
      const { user, healthUserId } = await createWebhookUser();
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await postWebhook([
        // Malformed: no intervals at all.
        { data: { healthUserId, dataType: 'steps', operation: 'UPSERT' } },
        // Malformed: no data object.
        { data: null },
        // Malformed: intervals is not an array.
        { data: { healthUserId, dataType: 'steps', operation: 'UPSERT', intervals: 'nope' } },
        // Malformed: an interval with no usable time fields.
        { data: { healthUserId, dataType: 'steps', operation: 'UPSERT', intervals: [{}, null] } },
        // Valid, deliberately last so an earlier abort would lose it.
        {
          data: {
            healthUserId,
            dataType: 'steps',
            operation: 'UPSERT',
            intervals: [{ physicalTimeInterval: { startTime: '2026-09-16T00:00:00Z', endTime: '2026-09-16T00:05:00Z' } }],
          },
        },
      ]);
      consoleWarn.mockRestore();

      expect(res.status).toBe(201);
      expect(queue.enqueueFetchJob).toHaveBeenCalledTimes(1);
      expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'STEPS', date: '2026-09-16' });
    });

    it('does not lose already-enqueued work when a LATER item throws mid-batch', async () => {
      (queue.enqueueFetchJob as jest.Mock).mockClear();
      const { user, healthUserId } = await createWebhookUser();
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      // Make the second item's DB lookup blow up to simulate an unexpected
      // per-item failure rather than a shape problem.
      const realFindUnique = prisma.healthConnection.findUnique.bind(prisma.healthConnection);
      const spy = jest.spyOn(prisma.healthConnection, 'findUnique').mockImplementation((args: any) =>
        args?.where?.healthUserId === 'boom'
          ? (Promise.reject(new Error('simulated lookup failure')) as any)
          : realFindUnique(args),
      );

      const res = await postWebhook([
        {
          data: {
            healthUserId,
            dataType: 'sleep',
            operation: 'UPSERT',
            intervals: [{ physicalTimeInterval: { startTime: '2026-09-15T00:00:00Z', endTime: '2026-09-15T00:05:00Z' } }],
          },
        },
        { data: { healthUserId: 'boom', dataType: 'steps', operation: 'UPSERT', intervals: [] } },
        {
          data: {
            healthUserId,
            dataType: 'heartRateVariability',
            operation: 'UPSERT',
            intervals: [{ physicalTimeInterval: { startTime: '2026-09-15T00:00:00Z', endTime: '2026-09-15T00:05:00Z' } }],
          },
        },
      ]);
      spy.mockRestore();
      consoleError.mockRestore();

      expect(res.status).toBe(201);
      expect(queue.enqueueFetchJob).toHaveBeenCalledTimes(2);
      expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'SLEEP', date: '2026-09-15' });
      expect(queue.enqueueFetchJob).toHaveBeenCalledWith({ userId: user.id, metricType: 'HRV', date: '2026-09-15' });
    });

    it('treats a non-array body as an empty batch (204, nothing enqueued) instead of crashing', async () => {
      (queue.enqueueFetchJob as jest.Mock).mockClear();

      const res = await postWebhook({ data: { healthUserId: 'x', dataType: 'steps', operation: 'UPSERT', intervals: [] } });

      expect(res.status).toBe(201);
      expect(queue.enqueueFetchJob).not.toHaveBeenCalled();
    });
  });
});
