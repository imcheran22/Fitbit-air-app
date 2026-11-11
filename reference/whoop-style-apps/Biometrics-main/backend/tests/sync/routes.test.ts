import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor, createTestUser } from '../helpers/auth';
import * as catchUp from '../../src/sync/catchUp';
import { encryptToken } from '../../src/crypto/tokenCipher';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

async function connectedUser(lastSyncedAt: Date | null, status: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED') {
  const user = await createTestUser();
  await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: `fb-${randomUUID()}`,
      encryptedAccessToken: encryptToken('a'),
      encryptedRefreshToken: encryptToken('r'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      lastSyncedAt,
      status,
    },
  });
  return user;
}

describe('POST /me/sync', () => {
  it('queues a catch-up and answers 202 syncing', async () => {
    const last = new Date(Date.now() - 3600_000);
    const user = await connectedUser(last);
    const enqueue = jest.spyOn(catchUp, 'enqueueCatchUp').mockResolvedValue(undefined);
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');

    const res = await request(await testServer(createApp())).post('/me/sync').set(await authHeaderFor(user.id));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ state: 'syncing', lastSyncedAt: last.toISOString() });
    expect(enqueue).toHaveBeenCalledWith(user.id);
  });

  it('does not queue when the last sync finished under 30 seconds ago', async () => {
    const last = new Date(Date.now() - 5_000);
    const user = await connectedUser(last);
    const enqueue = jest.spyOn(catchUp, 'enqueueCatchUp').mockResolvedValue(undefined);
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');

    const res = await request(await testServer(createApp())).post('/me/sync').set(await authHeaderFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'idle', lastSyncedAt: last.toISOString() });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('answers 409 when Google Health is not connected', async () => {
    const user = await createTestUser();
    const res = await request(await testServer(createApp())).post('/me/sync').set(await authHeaderFor(user.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_connected' });
  });

  it('needs a session', async () => {
    const res = await request(await testServer(createApp())).post('/me/sync');
    expect(res.status).toBe(401);
  });
});

describe('GET /me/sync', () => {
  it.each(['idle', 'syncing', 'failed'] as const)('reports the %s state with the last sync time and connection', async (state) => {
    const last = new Date(Date.now() - 600_000);
    const user = await connectedUser(last);
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue(state);

    const res = await request(await testServer(createApp())).get('/me/sync').set(await authHeaderFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state, lastSyncedAt: last.toISOString(), connection: 'CONNECTED' });
  });

  it('judges the catch-up state against the last successful sync', async () => {
    const last = new Date(Date.now() - 600_000);
    const user = await connectedUser(last);
    const state = jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');

    await request(await testServer(createApp())).get('/me/sync').set(await authHeaderFor(user.id));

    expect(state).toHaveBeenCalledWith(user.id, last);
  });

  it('reports a disconnected connection', async () => {
    const user = await connectedUser(null, 'DISCONNECTED');
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');
    const res = await request(await testServer(createApp())).get('/me/sync').set(await authHeaderFor(user.id));
    expect(res.body).toEqual({ state: 'idle', lastSyncedAt: null, connection: 'DISCONNECTED' });
  });

  it('reports NOT_CONNECTED with no connection', async () => {
    const user = await createTestUser();
    const res = await request(await testServer(createApp())).get('/me/sync').set(await authHeaderFor(user.id));
    expect(res.body).toEqual({ state: 'idle', lastSyncedAt: null, connection: 'NOT_CONNECTED' });
  });
});
