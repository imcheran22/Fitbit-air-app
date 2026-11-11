import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { storeSleepSessions } from '../../src/biometrics/repository';
import { SleepSessionPoint } from '../../src/types';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(prefix: string, timezone = 'UTC') {
  return prisma.user.create({
    data: { email: `${prefix}-${randomUUID()}@example.com`, name: 'Test User', timezone },
  });
}

async function getNight(userId: string, date: string) {
  const authHeader = await authHeaderFor(userId);
  return request(await testServer(createApp())).get(`/me/sleep/night/${date}`).set(authHeader);
}

const at = (iso: string) => new Date(iso);

// Seeded out of order on purpose: the endpoint must return them by start time.
const NIGHT: SleepSessionPoint = {
  startTime: at('2026-09-19T23:00:00Z'), endTime: at('2026-09-20T07:00:00Z'), minutesAsleep: 420,
  startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0, sleepType: 'STAGES', mainSleep: true,
  minutesInSleepPeriod: 470, minutesAwake: 50, minutesToFallAsleep: 10, minutesAfterWakeUp: 5,
  deepMinutes: 80, lightMinutes: 240, remMinutes: 100, awakeMinutes: 50,
  stages: [
    { type: 'REM', startTime: at('2026-09-20T01:00:00Z'), endTime: at('2026-09-20T01:30:00Z') },
    { type: 'LIGHT', startTime: at('2026-09-19T23:10:00Z'), endTime: at('2026-09-20T00:00:00Z') },
    { type: 'DEEP', startTime: at('2026-09-20T00:00:00Z'), endTime: at('2026-09-20T00:40:00Z') },
    { type: 'AWAKE', startTime: at('2026-09-20T00:40:00Z'), endTime: at('2026-09-20T00:45:00Z') },
    { type: 'DEEP', startTime: at('2026-09-20T00:45:00Z'), endTime: at('2026-09-20T01:00:00Z') },
  ],
};

const NAP: SleepSessionPoint = {
  startTime: at('2026-09-20T14:00:00Z'), endTime: at('2026-09-20T14:30:00Z'), minutesAsleep: 25,
  startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
};

describe('GET /me/sleep/night/:date', () => {
  it('returns the main session with its ordered stages, stage totals and the nap separately', async () => {
    const user = await createUser('night-full');
    await storeSleepSessions(user.id, [NIGHT, NAP]);
    await prisma.dailyScore.create({
      data: { userId: user.id, date: at('2026-09-20'), type: 'SLEEP', algorithmVersion: 'v1', score: 71.6, confidenceLevel: 'HIGH', factors: {} },
    });

    const res = await getNight(user.id, '2026-09-20');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: '2026-09-20',
      bedtime: '23:00',
      wakeTime: '07:00',
      startUtcOffsetSeconds: 0,
      endUtcOffsetSeconds: 0,
      minutesAsleep: 420,
      minutesInBed: 470,
      minutesAwake: 50,
      minutesToFallAsleep: 10,
      minutesAfterWakeUp: 5,
      hasStages: true,
      stages: [
        { type: 'LIGHT', start: '2026-09-19T23:10:00.000Z', end: '2026-09-20T00:00:00.000Z' },
        { type: 'DEEP', start: '2026-09-20T00:00:00.000Z', end: '2026-09-20T00:40:00.000Z' },
        { type: 'AWAKE', start: '2026-09-20T00:40:00.000Z', end: '2026-09-20T00:45:00.000Z' },
        { type: 'DEEP', start: '2026-09-20T00:45:00.000Z', end: '2026-09-20T01:00:00.000Z' },
        { type: 'REM', start: '2026-09-20T01:00:00.000Z', end: '2026-09-20T01:30:00.000Z' },
      ],
      stageTotals: {
        deep: { minutes: 80, count: 2 },
        light: { minutes: 240, count: 1 },
        rem: { minutes: 100, count: 1 },
        awake: { minutes: 50, count: 1 },
      },
      naps: [{ start: '2026-09-20T14:00:00.000Z', end: '2026-09-20T14:30:00.000Z', minutesAsleep: 25 }],
      sleepScore: 72,
      usualMinutesAsleep: null,
      mainIsNap: false,
    });
  });

  it("formats bedtime and wake time on the session's own clock when the user travels", async () => {
    const user = await createUser('night-travel', 'America/New_York');
    await storeSleepSessions(user.id, [{
      startTime: at('2026-09-21T21:30:00Z'), endTime: at('2026-09-22T05:15:00Z'), minutesAsleep: 430,
      startUtcOffsetSeconds: 3600, endUtcOffsetSeconds: 3600,
    }]);

    const res = await getNight(user.id, '2026-09-22');

    expect(res.status).toBe(200);
    expect(res.body.bedtime).toBe('22:30');
    expect(res.body.wakeTime).toBe('06:15');
    // The session's own offsets, so the app tells stage times on the same clock.
    expect(res.body.startUtcOffsetSeconds).toBe(3600);
    expect(res.body.endUtcOffsetSeconds).toBe(3600);
  });

  it('reports no stages for a night without them, and falls back to the interval for time in bed', async () => {
    const user = await createUser('night-plain');
    await storeSleepSessions(user.id, [{
      startTime: at('2026-09-22T23:00:00Z'), endTime: at('2026-09-23T06:30:00Z'), minutesAsleep: 400,
      startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
    }]);

    const res = await getNight(user.id, '2026-09-23');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hasStages: false, stages: [], stageTotals: null, naps: [], minutesInBed: 450,
      minutesAwake: null, minutesToFallAsleep: null, minutesAfterWakeUp: null, sleepScore: null,
    });
  });

  it('counts AWAKE-only segments as no stages', async () => {
    const user = await createUser('night-awake-only');
    await storeSleepSessions(user.id, [{
      startTime: at('2026-09-22T23:00:00Z'), endTime: at('2026-09-23T06:30:00Z'), minutesAsleep: 400,
      startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0, awakeMinutes: 20,
      stages: [{ type: 'AWAKE', startTime: at('2026-09-23T02:00:00Z'), endTime: at('2026-09-23T02:20:00Z') }],
    }]);

    const res = await getNight(user.id, '2026-09-23');

    expect(res.body).toMatchObject({ hasStages: false, stages: [], stageTotals: null });
  });

  describe('usualMinutesAsleep', () => {
    // A main session ending 07:00 UTC on `date`, 8 hours long.
    function nightEnding(date: string, minutesAsleep: number): SleepSessionPoint {
      const end = at(`${date}T07:00:00Z`);
      return { startTime: new Date(end.getTime() - 8 * 3600_000), endTime: end, minutesAsleep, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 };
    }
    // Nights ending 2026-09-29, 09-28, ... (all inside the 30 nights before 09-30).
    const before = (i: number) => `2026-09-${String(29 - i).padStart(2, '0')}`;
    const TONIGHT = nightEnding('2026-09-30', 300);

    it('is null when only 6 of the previous 30 nights have a main session', async () => {
      const user = await createUser('night-usual-6');
      await storeSleepSessions(user.id, [...[400, 410, 420, 430, 440, 450].map((m, i) => nightEnding(before(i), m)), TONIGHT]);

      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBeNull();
    });

    it('is the rounded mean of the previous main sessions once 7 have one, excluding tonight and older nights', async () => {
      const user = await createUser('night-usual-7');
      await storeSleepSessions(user.id, [
        ...[400, 410, 420, 430, 440, 450, 401].map((m, i) => nightEnding(before(i), m)),
        // 31 nights back: outside the window.
        nightEnding('2026-08-30', 10),
        TONIGHT,
      ]);

      // (400+410+420+430+440+450+401) / 7 = 421.57
      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBe(422);
    });

    it('averages main sessions only: a nap in the window does not raise it', async () => {
      const user = await createUser('night-usual-nap');
      await storeSleepSessions(user.id, [
        ...Array.from({ length: 7 }, (_, i) => nightEnding(before(i), 400)),
        { startTime: at('2026-09-29T14:00:00Z'), endTime: at('2026-09-29T15:00:00Z'), minutesAsleep: 55, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 },
        TONIGHT,
      ]);

      // The old rule (SLEEP rollups, naps included) gave round(455 + 6 * 400) / 7 = 408.
      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBe(400);
    });

    it('skips a nap-only date: it is not a night, for the mean or the 7-night minimum', async () => {
      const user = await createUser('night-usual-nap-only');
      // A nap-only date inside the window: 13:00-14:00 UTC on 09-15, 50 min asleep.
      const napOnly: SleepSessionPoint = {
        startTime: at('2026-09-15T13:00:00Z'), endTime: at('2026-09-15T14:00:00Z'), minutesAsleep: 50,
        startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
      };
      await storeSleepSessions(user.id, [...[400, 410, 420, 430, 440, 450].map((m, i) => nightEnding(before(i), m)), napOnly, TONIGHT]);

      // 6 real nights and a nap-only date: still under the 7-night minimum.
      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBeNull();

      await storeSleepSessions(user.id, [nightEnding(before(6), 401)]);

      // (400+410+420+430+440+450+401) / 7 = 421.57; counting the nap would give (2951 + 50) / 8 = 375.
      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBe(422);
    });

    it('ignores SLEEP rollups with no sessions behind them', async () => {
      const user = await createUser('night-usual-rollups');
      await prisma.biometricRecord.createMany({
        data: Array.from({ length: 7 }, (_, i) => ({ userId: user.id, metricType: 'SLEEP' as const, value: 400, recordedAt: new Date(Date.UTC(2026, 8, 29 - i)) })),
      });
      await storeSleepSessions(user.id, [TONIGHT]);

      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBeNull();
    });
  });

  it('flags a date whose main session is a daytime nap', async () => {
    const user = await createUser('night-nap-only');
    await storeSleepSessions(user.id, [{
      startTime: at('2026-09-24T14:10:00Z'), endTime: at('2026-09-24T14:35:00Z'), minutesAsleep: 20,
      startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
    }]);

    const res = await getNight(user.id, '2026-09-24');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ minutesAsleep: 20, bedtime: '14:10', mainIsNap: true, naps: [] });
  });

  it('never logs sleep values or dates', async () => {
    const user = await createUser('night-logs');
    await storeSleepSessions(user.id, [NIGHT, NAP]);
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) => jest.spyOn(console, level));

    await getNight(user.id, '2026-09-20');

    const logged = spies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' ');
    expect(logged).not.toMatch(/\b420\b/);
    expect(logged).not.toContain('2026-09-20');
    spies.forEach((spy) => spy.mockRestore());
  });

  it('returns 404 for a date with no session', async () => {
    const user = await createUser('night-missing');
    const res = await getNight(user.id, '2026-09-24');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('returns 400 for a malformed date', async () => {
    const user = await createUser('night-bad-date');
    expect((await getNight(user.id, '2026-02-30')).status).toBe(400);
    expect((await getNight(user.id, 'yesterday')).status).toBe(400);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).get('/me/sleep/night/2026-09-20');
    expect(res.status).toBe(401);
  });

  it("does not return another user's night", async () => {
    const owner = await createUser('night-owner');
    const other = await createUser('night-other');
    await storeSleepSessions(owner.id, [NIGHT]);
    expect((await getNight(other.id, '2026-09-20')).status).toBe(404);
  });
});
