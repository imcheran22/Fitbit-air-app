import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken, linkIn } from '../helpers/auth';
import { testServer } from '../helpers/server';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const ORIGIN = { 'expo-origin': 'biometrics://' };
const PASSWORD = 'correct horse battery';

async function signUp(app: Express, email: string, password = PASSWORD) {
  return request(await testServer(app)).post('/auth/sign-up/email').set(ORIGIN)
    .send({ email, password, name: 'Pat', callbackURL: 'biometrics://verified' });
}

async function verify(app: Express, email: ReturnType<typeof createTestApp>['email'], address: string) {
  const url = new URL(linkIn(email.lastTo(address)));
  return request(await testServer(app)).get(url.pathname + url.search);
}

describe('email and password', () => {
  it('sends a verification email and refuses sign-in until it is used', async () => {
    const { app, email } = createTestApp();
    const address = `pw-${randomUUID()}@example.com`;
    expect((await signUp(app, address)).status).toBe(200);
    expect(email.lastTo(address)?.subject).toContain('Confirm');

    const early = await request(await testServer(app)).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    expect(early.status).toBe(403);

    const verified = await verify(app, email, address);
    expect(verified.status).toBe(302);
    expect(verified.headers.location).toMatch(/^biometrics:\/\/verified/);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: address } })).emailVerified).toBe(true);

    const ok = await request(await testServer(app)).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('treats email case and surrounding space as the same account', async () => {
    const { app, email } = createTestApp();
    const address = `case-${randomUUID()}@example.com`;
    await signUp(app, `  ${address.toUpperCase()} `);
    await verify(app, email, address);
    const ok = await request(await testServer(app)).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(await prisma.user.count({ where: { email: address } })).toBe(1);
  });

  it('answers a sign-up for an existing email exactly like a new one, and tells the owner', async () => {
    const { app, email } = createTestApp();
    const address = `dupe-${randomUUID()}@example.com`;
    const first = await signUp(app, address);
    const second = await signUp(app, address, 'another password 123');
    expect(second.status).toBe(first.status);
    expect(Object.keys(second.body).sort()).toEqual(Object.keys(first.body).sort());
    expect(await prisma.user.count({ where: { email: address } })).toBe(1);
    expect(email.lastTo(address)?.subject).toContain('Someone tried');
  });

  it('does not link a Google sign-in to an unverified password account', async () => {
    const { app } = createTestApp();
    const address = `unverified-${randomUUID()}@example.com`;
    await signUp(app, address);
    const token = fakeIdToken({ iss: 'https://accounts.google.com', aud: 'test-google-client-id', sub: `g-${address}`, email: address, email_verified: true });
    const res = await request(await testServer(app)).post('/auth/sign-in/social').send({ provider: 'google', idToken: { token } });
    expect(res.status).not.toBe(200);
    const accounts = await prisma.account.findMany({ where: { user: { email: address } } });
    expect(accounts.map((a) => a.providerId)).toEqual(['credential']);
  });

  it('resets a password and signs out every existing session', async () => {
    const { app, email } = createTestApp();
    const address = `reset-${randomUUID()}@example.com`;
    await signUp(app, address);
    await verify(app, email, address);
    const signIn = await request(await testServer(app)).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    const oldCookie = signIn.headers['set-cookie']!.map((c: string) => c.split(';')[0]).join('; ');

    const asked = await request(await testServer(app)).post('/auth/request-password-reset').set(ORIGIN)
      .send({ email: address, redirectTo: 'biometrics://reset-password' });
    expect(asked.status).toBe(200);
    const link = new URL(linkIn(email.lastTo(address)));
    const redirect = await request(await testServer(app)).get(link.pathname + link.search);
    expect(redirect.headers.location).toMatch(/^biometrics:\/\/reset-password\?token=/);
    const token = new URL(redirect.headers.location.replace('biometrics://', 'http://x/')).searchParams.get('token');

    const reset = await request(await testServer(app)).post('/auth/reset-password').set(ORIGIN).send({ newPassword: 'a brand new password', token });
    expect(reset.status).toBe(200);

    const oldSession = await request(await testServer(app)).get('/auth/get-session').set('Cookie', oldCookie);
    expect(oldSession.body).toBeNull();
    const again = await request(await testServer(app)).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: 'a brand new password' });
    expect(again.status).toBe(200);
  });

  it('answers a reset request for an unknown email the same way (no enumeration)', async () => {
    const { app } = createTestApp();
    const res = await request(await testServer(app)).post('/auth/request-password-reset').set(ORIGIN)
      .send({ email: `nobody-${randomUUID()}@example.com`, redirectTo: 'biometrics://reset-password' });
    expect(res.status).toBe(200);
  });
});
