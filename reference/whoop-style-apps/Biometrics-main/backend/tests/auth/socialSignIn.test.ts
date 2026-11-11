import request from 'supertest';
import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken } from '../helpers/auth';
import { testServer } from '../helpers/server';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const google = (sub: string, email: string, extra: object = {}) => ({
  provider: 'google',
  idToken: { token: fakeIdToken({ iss: 'https://accounts.google.com', aud: 'test-google-client-id', sub, email, email_verified: true, ...extra }) },
});
const apple = (sub: string, email: string, user?: object) => ({
  provider: 'apple',
  idToken: {
    token: fakeIdToken({ iss: 'https://appleid.apple.com', aud: 'com.tusharcora.biometrics', sub, email, email_verified: 'true' }),
    ...(user ? { user } : {}),
  },
});

describe('native ID-token sign-in', () => {
  it('creates a user and a google account, and sets a session cookie', async () => {
    const { app } = createTestApp();
    const email = `g-${randomUUID()}@example.com`;
    const res = await request(await testServer(app)).post('/auth/sign-in/social').send(google('g-sub-1-' + email, email));
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.join(';')).toContain('session_token');
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
    expect(user.accounts.map((a) => a.providerId)).toEqual(['google']);
    expect(user.emailVerified).toBe(true);
  });

  it('reuses the same user on a repeat sign-in', async () => {
    const { app } = createTestApp();
    const email = `g-${randomUUID()}@example.com`;
    const body = google(`sub-${email}`, email);
    await request(await testServer(app)).post('/auth/sign-in/social').send(body);
    await request(await testServer(app)).post('/auth/sign-in/social').send(body);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.account.count({ where: { user: { email } } })).toBe(1);
  });

  it('names an Apple user from the first-sign-in name, and from the email when Apple hides it', async () => {
    const { app } = createTestApp();
    const named = `a-${randomUUID()}@example.com`;
    await request(await testServer(app)).post('/auth/sign-in/social').send(apple(`sub-${named}`, named, { name: { firstName: 'Ada', lastName: 'Lovelace' } }));
    expect((await prisma.user.findUniqueOrThrow({ where: { email: named } })).name).toBe('Ada Lovelace');

    const hidden = `hidden-${randomUUID()}@privaterelay.appleid.com`;
    const res = await request(await testServer(app)).post('/auth/sign-in/social').send(apple(`sub-${hidden}`, hidden));
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: hidden } })).name).toBe(hidden.split('@')[0]);
    await prisma.user.deleteMany({ where: { email: hidden } });
  });

  it('links a Google sign-in to the verified Apple user with the same email', async () => {
    const { app } = createTestApp();
    const email = `link-${randomUUID()}@example.com`;
    await request(await testServer(app)).post('/auth/sign-in/social').send(apple(`a-${email}`, email));
    const res = await request(await testServer(app)).post('/auth/sign-in/social').send(google(`g-${email}`, email));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
    expect(user.accounts.map((a) => a.providerId).sort()).toEqual(['apple', 'google']);
  });

  it('refuses a token whose signature check fails', async () => {
    const { app } = createTestApp({ verifyIdToken: async () => false });
    const email = `bad-${randomUUID()}@example.com`;
    const res = await request(await testServer(app)).post('/auth/sign-in/social').send(google(`s-${email}`, email));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});
