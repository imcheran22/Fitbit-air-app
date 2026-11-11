import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { buildForecast } from '../../src/forecast/engine';
import { loadForecastData } from '../../src/forecast/load';
import { parseArgs, seedDemoUser } from '../../scripts/seedDemoUser';
import { migrateTestDb } from '../setupTestDb';
import { testServer } from '../helpers/server';

const EMAIL = 'demo-seed@example.com';
const PASSWORD = 'demo-password-123';
// Pinned: the synthetic history has weekday effects, so outcomes must not depend on the calendar.
const NOW = new Date('2026-06-30T12:00:00Z');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY ??= 'a'.repeat(64);
});

describe('seedDemoUser', () => {
  jest.setTimeout(120_000);

  it('refuses to run in production without --force', async () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await expect(seedDemoUser({ email: EMAIL, password: PASSWORD, now: NOW })).rejects.toThrow(/production/);
    process.env.NODE_ENV = env;
  });

  it('builds a showcase account the real pipelines turn into a READY forecast', async () => {
    const { userId } = await seedDemoUser({ email: EMAIL, password: PASSWORD, seed: 7, now: NOW });
    const f = buildForecast(await loadForecastData(userId, NOW));
    if (f.status !== 'READY') throw new Error(`forecast not ready: ${JSON.stringify(f)}`);

    expect(f.levers.find((l) => l.key === 'ALCOHOL')!.effect).toBe('CONFIRMED');
    expect(f.levers.find((l) => l.key === 'CAFFEINE')!.effect).toBe('NONE_YET');
    expect(f.trackRecord.days).toBeGreaterThanOrEqual(25);
    const at = (exposed: boolean) =>
      f.grid.find((c) => c.sleepHours === 7.5 && c.exposed.includes('ALCOHOL') === exposed && c.exposed.length === (exposed ? 1 : 0))!;
    expect(at(true).score).toBeLessThan(at(false).score);

    // No sync connection, so the worker never touches it.
    expect(await prisma.healthConnection.count({ where: { userId } })).toBe(0);
  });

  it('is idempotent and the account can sign in with email and password', async () => {
    const first = await seedDemoUser({ email: EMAIL, password: PASSWORD, seed: 7, now: NOW });
    const second = await seedDemoUser({ email: EMAIL, password: PASSWORD, seed: 7, now: NOW });
    expect(second.userId).not.toBe(first.userId);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
    await request(await testServer(createApp()))
      .post('/auth/sign-in/email')
      .set({ 'expo-origin': 'biometrics://' })
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
  });

  it('refuses to replace an account with a health connection unless forced', async () => {
    const email = `real-user-${randomUUID()}@example.com`;
    const real = await prisma.user.create({ data: { email, name: 'Real User' } });
    await prisma.healthConnection.create({
      data: {
        userId: real.id,
        healthUserId: `health-${real.id}`,
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(NOW.getTime() + 3600_000),
      },
    });

    await expect(seedDemoUser({ email, password: PASSWORD, now: NOW })).rejects.toThrow(/health connection/);
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await prisma.healthConnection.count({ where: { userId: real.id } })).toBe(1);

    // Forced: the (undecryptable test) token cannot be revoked; deletion logs that and carries on.
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { userId } = await seedDemoUser({ email, password: PASSWORD, now: NOW, force: true });
    log.mockRestore();
    expect(userId).not.toBe(real.id);
    expect(await prisma.user.findUnique({ where: { id: real.id } })).toBeNull();
  });

  it('parses CLI args', () => {
    expect(parseArgs(['--email', 'a@b.c'])).toEqual({ email: 'a@b.c', seed: 1, force: false });
    expect(parseArgs(['--email', 'a@b.c', '--seed', '9', '--force'])).toEqual({ email: 'a@b.c', seed: 9, force: true });
    expect(() => parseArgs([])).toThrow(/--email/);
    expect(() => parseArgs(['--email', 'a@b.c', '--seed', 'abc'])).toThrow(/--seed must be an integer/);
    expect(() => parseArgs(['--email', 'a@b.c', '--seed', '1.5'])).toThrow(/--seed must be an integer/);
  });
});
