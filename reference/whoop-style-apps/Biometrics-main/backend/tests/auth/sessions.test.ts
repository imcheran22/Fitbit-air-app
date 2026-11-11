import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken } from '../helpers/auth';
import { testServer } from '../helpers/server';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const ORIGIN = { 'expo-origin': 'biometrics://' };

function cookieFrom(res: request.Response): string {
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}

async function googleSignIn(app: Express, email: string, userAgent: string) {
  const token = fakeIdToken({ iss: 'https://accounts.google.com', aud: 'test-google-client-id', sub: `g-${email}`, email, email_verified: true });
  const res = await request(await testServer(app)).post('/auth/sign-in/social').set('User-Agent', userAgent).send({ provider: 'google', idToken: { token } });
  return cookieFrom(res);
}

describe('session management', () => {
  it('lists every signed-in device and revokes the others', async () => {
    const { app } = createTestApp();
    const email = `devices-${randomUUID()}@example.com`;
    const phone = await googleSignIn(app, email, 'Biometrics/1 iPhone');
    const tablet = await googleSignIn(app, email, 'Biometrics/1 iPad');

    const list = await request(await testServer(app)).get('/auth/list-sessions').set('Cookie', phone);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const revoke = await request(await testServer(app)).post('/auth/revoke-other-sessions').set(ORIGIN).set('Cookie', phone).send({});
    expect(revoke.status).toBe(200);
    expect((await request(await testServer(app)).get('/auth/get-session').set('Cookie', tablet)).body).toBeNull();
    expect((await request(await testServer(app)).get('/auth/get-session').set('Cookie', phone)).body?.user?.email).toBe(email);
  });

  it('revokes one session by token', async () => {
    const { app } = createTestApp();
    const email = `one-${randomUUID()}@example.com`;
    const a = await googleSignIn(app, email, 'A');
    const b = await googleSignIn(app, email, 'B');
    const sessions = (await request(await testServer(app)).get('/auth/list-sessions').set('Cookie', a)).body as Array<{ token: string; userAgent: string }>;
    const bToken = sessions.find((s) => s.userAgent === 'B')!.token;
    await request(await testServer(app)).post('/auth/revoke-session').set(ORIGIN).set('Cookie', a).send({ token: bToken });
    expect((await request(await testServer(app)).get('/auth/get-session').set('Cookie', b)).body).toBeNull();
  });

  it('refuses to unlink the last sign-in method', async () => {
    const { app } = createTestApp();
    const email = `last-${randomUUID()}@example.com`;
    const cookie = await googleSignIn(app, email, 'A');
    const account = await prisma.account.findFirstOrThrow({ where: { user: { email } } });
    // /unlink-account takes the Account row's own id as `accountId`.
    const res = await request(await testServer(app)).post('/auth/unlink-account').set(ORIGIN).set('Cookie', cookie)
      .send({ accountId: account.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FAILED_TO_UNLINK_LAST_ACCOUNT');
    expect(await prisma.account.count({ where: { user: { email } } })).toBe(1);
  });

  it('unlinks one sign-in method when another remains', async () => {
    const { app } = createTestApp();
    const email = `two-${randomUUID()}@example.com`;
    const cookie = await googleSignIn(app, email, 'A');
    const google = await prisma.account.findFirstOrThrow({ where: { user: { email } } });
    await prisma.account.create({ data: { userId: google.userId, providerId: 'apple', accountId: `apple-${randomUUID()}` } });

    const res = await request(await testServer(app)).post('/auth/unlink-account').set(ORIGIN).set('Cookie', cookie)
      .send({ accountId: google.id });
    expect(res.status).toBe(200);
    const left = await prisma.account.findMany({ where: { user: { email } } });
    expect(left.map((a) => a.providerId)).toEqual(['apple']);
  });

  it('manages sessions and methods without re-sign-in on a session older than a day', async () => {
    const { app } = createTestApp();
    const email = `old-${randomUUID()}@example.com`;
    const cookie = await googleSignIn(app, email, 'A');
    const google = await prisma.account.findFirstOrThrow({ where: { user: { email } } });
    await prisma.account.create({ data: { userId: google.userId, providerId: 'apple', accountId: `apple-${randomUUID()}` } });
    await prisma.session.updateMany({
      where: { userId: google.userId },
      data: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });

    expect((await request(await testServer(app)).get('/auth/list-sessions').set('Cookie', cookie)).status).toBe(200);
    const unlink = await request(await testServer(app)).post('/auth/unlink-account').set(ORIGIN).set('Cookie', cookie)
      .send({ accountId: google.id });
    expect(unlink.status).toBe(200);
  });
});
