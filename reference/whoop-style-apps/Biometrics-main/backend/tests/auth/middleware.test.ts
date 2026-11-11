import express from 'express';
import request from 'supertest';
import { requireAuth, type AuthedRequest } from '../../src/auth/middleware';
import { auth } from '../../src/auth/auth';
import { prisma } from '../../src/db/client';
import { deleteUserAccount } from '../../src/users/deletion';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor, createTestUser } from '../helpers/auth';
import { testServer } from '../helpers/server';

function whoamiApp() {
  const app = express();
  app.get('/whoami', requireAuth, (req: AuthedRequest, res) => res.json({ userId: req.userId }));
  return app;
}

beforeAll(() => migrateTestDb());
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

describe('requireAuth', () => {
  it('passes a valid session through with req.userId set', async () => {
    const user = await createTestUser();
    const res = await request(await testServer(whoamiApp())).get('/whoami').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: user.id });
  });

  it('401s with "Missing session" when no credentials are sent', async () => {
    const res = await request(await testServer(whoamiApp())).get('/whoami');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing session' });
  });

  it('401s on a forged cookie', async () => {
    const res = await request(await testServer(whoamiApp())).get('/whoami').set('Cookie', 'better-auth.session_token=forged.sig');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('401s once the session has expired', async () => {
    const user = await createTestUser();
    const header = await authHeaderFor(user.id);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(await testServer(whoamiApp())).get('/whoami').set(header);
    expect(res.status).toBe(401);
  });

  it('401s after the account is deleted', async () => {
    const user = await createTestUser();
    const header = await authHeaderFor(user.id);
    await deleteUserAccount(user.id);
    const res = await request(await testServer(whoamiApp())).get('/whoami').set(header);
    expect(res.status).toBe(401);
  });

  it('500s, not 401s, when the database is down', async () => {
    jest.spyOn(auth.api, 'getSession').mockResolvedValue(null);
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));
    const res = await request(await testServer(whoamiApp())).get('/whoami').set('Cookie', 'better-auth.session_token=x.y');
    expect(res.status).toBe(500);
  });

  it('500s when getSession itself throws', async () => {
    jest.spyOn(auth.api, 'getSession').mockRejectedValue(new Error('connection refused'));
    const res = await request(await testServer(whoamiApp())).get('/whoami').set('Cookie', 'better-auth.session_token=x.y');
    expect(res.status).toBe(500);
  });
});
