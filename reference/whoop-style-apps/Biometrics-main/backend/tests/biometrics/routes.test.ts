import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { storeSleepSessions } from '../../src/biometrics/repository';
import { getLiveConfig } from '../../src/scoring/configs';
import { localCivilDate } from '../../src/biometrics/civilDate';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

async function createUser(prefix: string) {
  return prisma.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@example.com`,
      name: 'Test User',
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /me/biometrics', () => {
  it('returns the current user\'s biometric records', async () => {
    const user = await prisma.user.create({ data: { email: `b-${Date.now()}@example.com`, name: 'Test User'} });
    await prisma.biometricRecord.create({
      data: { userId: user.id, metricType: 'STEPS', value: 9000, recordedAt: new Date('2026-09-01') },
    });
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp())).get('/me/biometrics').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].value).toBe(9000);
  });

  it('returns only the fields the dashboard consumes', async () => {
    const user = await createUser('fields');
    await prisma.biometricRecord.create({
      data: { userId: user.id, metricType: 'HRV', value: 42, recordedAt: new Date('2026-09-03') },
    });
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .get('/me/biometrics')
      .set(authHeader);

    expect(res.status).toBe(200);
    // Internal columns must not leak to the client.
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'metricType', 'recordedAt', 'value']);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).get('/me/biometrics');
    expect(res.status).toBe(401);
  });

  it('does not return another user\'s biometric records', async () => {
    const userA = await prisma.user.create({ data: { email: `a-${Date.now()}@example.com`, name: 'Test User'} });
    const userB = await prisma.user.create({ data: { email: `c-${Date.now()}@example.com`, name: 'Test User'} });
    await prisma.biometricRecord.create({
      data: { userId: userA.id, metricType: 'STEPS', value: 1234, recordedAt: new Date('2026-09-02') },
    });
    await prisma.biometricRecord.create({
      data: { userId: userB.id, metricType: 'STEPS', value: 5678, recordedAt: new Date('2026-09-02') },
    });
    const authHeader = await authHeaderFor(userA.id);

    const res = await request(await testServer(createApp())).get('/me/biometrics').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].value).toBe(1234);
  });
});

describe('GET /me/activity', () => {
  async function seedSteps(userId: string, entries: [string, number][]) {
    for (const [date, value] of entries) {
      await prisma.biometricRecord.create({
        data: { userId, metricType: 'STEPS', value, recordedAt: new Date(`${date}T00:00:00Z`) },
      });
    }
  }

  async function getActivity(userId: string, query: Record<string, string>) {
    const authHeader = await authHeaderFor(userId);
    return request(await testServer(createApp())).get('/me/activity').query(query).set(authHeader);
  }

  it('returns daily steps within the inclusive range, oldest first, keyed by civil date', async () => {
    const user = await createUser('act-range');
    await seedSteps(user.id, [
      ['2026-08-31', 100],
      ['2026-09-02', 12000],
      ['2026-09-01', 0],
      ['2026-09-03', 5000],
      ['2026-09-04', 999],
    ]);

    const res = await getActivity(user.id, { from: '2026-09-01', to: '2026-09-03' });

    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([
      { date: '2026-09-01', steps: 0 },
      { date: '2026-09-02', steps: 12000 },
      { date: '2026-09-03', steps: 5000 },
    ]);
  });

  it('reports the oldest STEPS record as earliestDate, even outside the range', async () => {
    const user = await createUser('act-earliest');
    await seedSteps(user.id, [['2026-01-15', 3000], ['2026-09-02', 8000]]);
    // Other metrics do not count as steps history.
    await prisma.biometricRecord.create({
      data: { userId: user.id, metricType: 'HRV', value: 40, recordedAt: new Date('2025-12-01T00:00:00Z') },
    });

    const res = await getActivity(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body.earliestDate).toBe('2026-01-15');
    expect(res.body.days).toEqual([{ date: '2026-09-02', steps: 8000 }]);
  });

  it('returns no days and a null earliestDate when there is no steps history', async () => {
    const user = await createUser('act-empty');

    const res = await getActivity(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ days: [], earliestDate: null });
  });

  it('accepts a single-day range and a 400-day range', async () => {
    const user = await createUser('act-bounds');
    await seedSteps(user.id, [['2026-09-01', 42]]);

    const single = await getActivity(user.id, { from: '2026-09-01', to: '2026-09-01' });
    // 2025-08-28 .. 2026-10-01 inclusive is exactly 400 days.
    const widest = await getActivity(user.id, { from: '2025-08-28', to: '2026-10-01' });

    expect(single.status).toBe(200);
    expect(single.body.days).toEqual([{ date: '2026-09-01', steps: 42 }]);
    expect(widest.status).toBe(200);
  });

  it.each([
    ['missing dates', {}],
    ['a missing to', { from: '2026-09-01' }],
    ['a malformed date', { from: '2026-9-1', to: '2026-09-30' }],
    ['an impossible date', { from: '2026-02-30', to: '2026-03-10' }],
    ['from after to', { from: '2026-09-10', to: '2026-09-01' }],
    ['a range over 400 days', { from: '2025-08-27', to: '2026-10-01' }],
  ])('rejects %s with a 400', async (_label, query) => {
    const user = await createUser('act-invalid');

    const res = await getActivity(user.id, query as Record<string, string>);

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).get('/me/activity').query({ from: '2026-09-01', to: '2026-09-02' });
    expect(res.status).toBe(401);
  });

  it("does not return another user's steps", async () => {
    const me = await createUser('act-me');
    const other = await createUser('act-other');
    await seedSteps(other.id, [['2026-09-01', 7777]]);

    const res = await getActivity(me.id, { from: '2026-09-01', to: '2026-09-01' });

    expect(res.body).toEqual({ days: [], earliestDate: null });
  });
});

describe('GET /me/sleep', () => {
  // Through the real storage path, so the rollups are derived exactly as a sync derives them.
  async function seedNight(userId: string, start: string, end: string, minutesAsleep: number, offsetSeconds: number | null = 0) {
    await storeSleepSessions(userId, [
      { startTime: new Date(start), endTime: new Date(end), minutesAsleep, startUtcOffsetSeconds: offsetSeconds, endUtcOffsetSeconds: offsetSeconds },
    ]);
  }

  // A night stored without a summary or stages, as every pre-stages night is.
  const NO_DEPTH = { minutesAwake: null, stageMinutes: null, hasStages: false };
  // The main session's minutes asleep, on a night (not a daytime nap).
  const MAIN = (minutes: number) => ({ mainMinutesAsleep: minutes, mainIsNap: false });

  async function connect(userId: string, status: 'CONNECTED' | 'DISCONNECTED', sleepStagesBackfilledAt: Date | null) {
    await prisma.healthConnection.create({
      data: {
        userId,
        healthUserId: `sleep-conn-${randomUUID()}`,
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        status,
        sleepStagesBackfilledAt,
      },
    });
  }

  async function getSleep(userId: string, query: Record<string, string>) {
    const authHeader = await authHeaderFor(userId);
    return request(await testServer(createApp())).get('/me/sleep').query(query).set(authHeader);
  }

  it('returns each night on the date it ended, with local bedtime, wake time, time in bed and minutes asleep', async () => {
    const user = await createUser('sleep-night');
    // 23:52 -> 07:58 at UTC-4: ends on Sep 24 local.
    await seedNight(user.id, '2026-09-24T03:52:00Z', '2026-09-24T11:58:00Z', 467, -14400);

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.status).toBe(200);
    expect(res.body.nights).toEqual([
      { date: '2026-09-24', minutesAsleep: 467, minutesInBed: 486, bedtime: '23:52', wakeTime: '07:58', sleepScore: null, ...NO_DEPTH, ...MAIN(467) },
    ]);
    expect(res.body.earliestDate).toBe('2026-09-24');
  });

  it("falls back to the user's timezone for a session stored without offsets", async () => {
    const user = await createUser('sleep-tz');
    await prisma.user.update({ where: { id: user.id }, data: { timezone: 'America/Los_Angeles' } });
    // 22:30 -> 06:15 Pacific (UTC-7 in September).
    await seedNight(user.id, '2026-09-10T05:30:00Z', '2026-09-10T13:15:00Z', 430, null);

    const res = await getSleep(user.id, { from: '2026-09-10', to: '2026-09-10' });

    expect(res.body.nights).toEqual([
      { date: '2026-09-10', minutesAsleep: 430, minutesInBed: 465, bedtime: '22:30', wakeTime: '06:15', sleepScore: null, ...NO_DEPTH, ...MAIN(430) },
    ]);
  });

  it('sums a nap into the minutes but takes the bedtime and wake time from the main sleep', async () => {
    const user = await createUser('sleep-nap');
    await seedNight(user.id, '2026-09-11T23:30:00Z', '2026-09-12T07:00:00Z', 420);
    await seedNight(user.id, '2026-09-12T14:00:00Z', '2026-09-12T14:40:00Z', 35);

    const res = await getSleep(user.id, { from: '2026-09-12', to: '2026-09-12' });

    expect(res.body.nights).toEqual([
      { date: '2026-09-12', minutesAsleep: 455, minutesInBed: 490, bedtime: '23:30', wakeTime: '07:00', sleepScore: null, ...NO_DEPTH, ...MAIN(420) },
    ]);
  });

  it('takes the main sleep by minutes asleep, not by time in bed, as scoring does', async () => {
    const user = await createUser('sleep-main-rule');
    // A restless 5h in bed with 200 min asleep, then 3.5h in bed with 205 min asleep.
    await seedNight(user.id, '2026-09-12T22:00:00Z', '2026-09-13T03:00:00Z', 200);
    await seedNight(user.id, '2026-09-13T03:30:00Z', '2026-09-13T07:00:00Z', 205);

    const res = await getSleep(user.id, { from: '2026-09-13', to: '2026-09-13' });

    expect(res.body.nights).toEqual([
      { date: '2026-09-13', minutesAsleep: 405, minutesInBed: 510, bedtime: '03:30', wakeTime: '07:00', sleepScore: null, ...NO_DEPTH, ...MAIN(205) },
    ]);
  });

  it("includes that day's Sleep Score, rounded", async () => {
    const user = await createUser('sleep-score');
    await seedNight(user.id, '2026-09-14T23:00:00Z', '2026-09-15T07:00:00Z', 450);
    await prisma.dailyScore.create({
      data: { userId: user.id, date: new Date('2026-09-15'), type: 'SLEEP', algorithmVersion: 'test', score: 71.6, confidenceLevel: 'HIGH', factors: [] },
    });
    // A Recovery Score on the same day is not the Sleep Score.
    await prisma.dailyScore.create({
      data: { userId: user.id, date: new Date('2026-09-15'), type: 'RECOVERY', algorithmVersion: 'test', score: 40, confidenceLevel: 'HIGH', factors: [] },
    });

    const res = await getSleep(user.id, { from: '2026-09-15', to: '2026-09-15' });

    expect(res.body.nights[0].sleepScore).toBe(72);
  });

  it('keeps nights outside the range out, but reports the oldest night as earliestDate', async () => {
    const user = await createUser('sleep-range');
    await seedNight(user.id, '2026-03-01T23:00:00Z', '2026-03-02T07:00:00Z', 400);
    await seedNight(user.id, '2026-08-31T23:00:00Z', '2026-09-01T07:00:00Z', 410);
    await seedNight(user.id, '2026-09-30T23:00:00Z', '2026-10-01T07:00:00Z', 420);

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body.nights.map((n: { date: string }) => n.date)).toEqual(['2026-09-01']);
    expect(res.body.earliestDate).toBe('2026-03-02');
  });

  it('returns no nights and a null earliestDate when there is no sleep history', async () => {
    const user = await createUser('sleep-empty');

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nights: [], earliestDate: null, stagesBackfillPending: false });
  });

  it('reports the main session\'s stage minutes, minutes awake and that it has stages', async () => {
    const user = await createUser('sleep-stages');
    await storeSleepSessions(user.id, [
      {
        startTime: new Date('2026-09-16T23:00:00Z'), endTime: new Date('2026-09-17T07:00:00Z'), minutesAsleep: 420,
        startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0, sleepType: 'STAGES',
        minutesAwake: 60, deepMinutes: 80, lightMinutes: 240, remMinutes: 100, awakeMinutes: 60,
        stages: [
          { type: 'LIGHT', startTime: new Date('2026-09-16T23:00:00Z'), endTime: new Date('2026-09-17T01:00:00Z') },
          { type: 'DEEP', startTime: new Date('2026-09-17T01:00:00Z'), endTime: new Date('2026-09-17T02:20:00Z') },
          { type: 'AWAKE', startTime: new Date('2026-09-17T02:20:00Z'), endTime: new Date('2026-09-17T03:20:00Z') },
          { type: 'REM', startTime: new Date('2026-09-17T03:20:00Z'), endTime: new Date('2026-09-17T05:00:00Z') },
        ],
      },
    ]);

    const res = await getSleep(user.id, { from: '2026-09-17', to: '2026-09-17' });

    expect(res.body.nights).toEqual([
      {
        date: '2026-09-17', minutesAsleep: 420, minutesInBed: 480, bedtime: '23:00', wakeTime: '07:00', sleepScore: null,
        minutesAwake: 60, stageMinutes: { deep: 80, light: 240, rem: 100, awake: 60 }, hasStages: true, ...MAIN(420),
      },
    ]);
  });

  it('does not count a night whose only stages are AWAKE as having stages', async () => {
    const user = await createUser('sleep-awake-only');
    await storeSleepSessions(user.id, [
      {
        startTime: new Date('2026-09-17T23:00:00Z'), endTime: new Date('2026-09-18T07:00:00Z'), minutesAsleep: 400,
        startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0, minutesAwake: 80, awakeMinutes: 80,
        stages: [{ type: 'AWAKE', startTime: new Date('2026-09-18T02:00:00Z'), endTime: new Date('2026-09-18T03:20:00Z') }],
      },
    ]);

    const res = await getSleep(user.id, { from: '2026-09-18', to: '2026-09-18' });

    expect(res.body.nights[0].hasStages).toBe(false);
    // A partial summary still reports, with the missing stages as zero.
    expect(res.body.nights[0].stageMinutes).toEqual({ deep: 0, light: 0, rem: 0, awake: 80 });
    expect(res.body.nights[0].minutesAwake).toBe(80);
  });

  it('takes the depth fields from the main session, not a nap', async () => {
    const user = await createUser('sleep-depth-main');
    await storeSleepSessions(user.id, [
      {
        startTime: new Date('2026-09-18T23:00:00Z'), endTime: new Date('2026-09-19T07:00:00Z'), minutesAsleep: 420,
        startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
      },
      {
        startTime: new Date('2026-09-19T14:00:00Z'), endTime: new Date('2026-09-19T14:40:00Z'), minutesAsleep: 35,
        startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0, minutesAwake: 5, deepMinutes: 0, lightMinutes: 35, remMinutes: 0, awakeMinutes: 5,
        stages: [{ type: 'LIGHT', startTime: new Date('2026-09-19T14:00:00Z'), endTime: new Date('2026-09-19T14:35:00Z') }],
      },
    ]);

    const res = await getSleep(user.id, { from: '2026-09-19', to: '2026-09-19' });

    expect(res.body.nights[0]).toMatchObject(NO_DEPTH);
  });

  it('reports a stage backfill as pending while a connected account has not been backfilled', async () => {
    const user = await createUser('sleep-backfill-pending');
    await connect(user.id, 'CONNECTED', null);

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body.stagesBackfillPending).toBe(true);
  });

  it('reports no pending stage backfill once the marker is set', async () => {
    const user = await createUser('sleep-backfill-done');
    await connect(user.id, 'CONNECTED', new Date('2026-10-02T00:00:00Z'));

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body.stagesBackfillPending).toBe(false);
  });

  it('reports no pending stage backfill for a disconnected account', async () => {
    const user = await createUser('sleep-backfill-disconnected');
    await connect(user.id, 'DISCONNECTED', null);

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body.stagesBackfillPending).toBe(false);
  });

  it('reports no pending stage backfill without a connection', async () => {
    const user = await createUser('sleep-backfill-none');

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body.stagesBackfillPending).toBe(false);
  });

  it('validates the range like /me/activity', async () => {
    const user = await createUser('sleep-invalid');

    const res = await getSleep(user.id, { from: '2025-08-27', to: '2026-10-01' });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).get('/me/sleep').query({ from: '2026-09-01', to: '2026-09-02' });
    expect(res.status).toBe(401);
  });

  it("does not return another user's sleep", async () => {
    const me = await createUser('sleep-me');
    const other = await createUser('sleep-other');
    await seedNight(other.id, '2026-09-01T23:00:00Z', '2026-09-02T07:00:00Z', 480);

    const res = await getSleep(me.id, { from: '2026-09-01', to: '2026-09-30' });

    expect(res.body).toMatchObject({ nights: [], earliestDate: null, stagesBackfillPending: false });
  });
  it('adds the main session minutes beside the day total, and whether the main session is a daytime nap', async () => {
    const user = await createUser('sleep-main-minutes');
    await seedNight(user.id, '2026-09-11T23:30:00Z', '2026-09-12T07:00:00Z', 420);
    await seedNight(user.id, '2026-09-12T14:00:00Z', '2026-09-12T14:40:00Z', 35);
    // Only a nap on the 13th: 13:00-13:50 UTC, 45 min asleep.
    await seedNight(user.id, '2026-09-13T13:00:00Z', '2026-09-13T13:50:00Z', 45);

    const res = await getSleep(user.id, { from: '2026-09-12', to: '2026-09-13' });

    expect(res.body.nights.map((n: { date: string; minutesAsleep: number; mainMinutesAsleep: number | null; mainIsNap: boolean }) =>
      [n.date, n.minutesAsleep, n.mainMinutesAsleep, n.mainIsNap])).toEqual([
      ['2026-09-12', 455, 420, false],
      ['2026-09-13', 45, 45, true],
    ]);
  });

  it('has a null main session for a SLEEP rollup with no sessions behind it', async () => {
    const user = await createUser('sleep-rollup-only');
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 400, recordedAt: new Date('2026-09-14') } });

    const res = await getSleep(user.id, { from: '2026-09-14', to: '2026-09-14' });

    expect(res.body.nights[0]).toMatchObject({ minutesAsleep: 400, mainMinutesAsleep: null, mainIsNap: false });
  });

  it("sends the live score bands and the user's own today", async () => {
    const user = await createUser('sleep-bands-today');
    await prisma.user.update({ where: { id: user.id }, data: { timezone: 'Pacific/Kiritimati' } });

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-02' });

    expect(res.body.bands).toEqual(getLiveConfig().scoreBands);
    // UTC+14: often a day ahead of UTC.
    expect(res.body.today).toBe(localCivilDate(new Date(), 'Pacific/Kiritimati'));
  });

  it('never logs sleep values or dates', async () => {
    const user = await createUser('sleep-logs');
    await seedNight(user.id, '2026-09-16T23:00:00Z', '2026-09-17T07:00:00Z', 437);
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) => jest.spyOn(console, level));

    await getSleep(user.id, { from: '2026-09-17', to: '2026-09-17' });

    const logged = spies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' ');
    expect(logged).not.toMatch(/437/);
    expect(logged).not.toContain('2026-09-17');
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe('GET /me/connection', () => {
  it('reports NOT_CONNECTED when the user has never connected a health account', async () => {
    const user = await createUser('nc');
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .get('/me/connection')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'NOT_CONNECTED', lastSyncedAt: null });
  });

  it('reports CONNECTED with the last sync time', async () => {
    const user = await createUser('conn');
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-conn-${randomUUID()}`,
        encryptedAccessToken: 'placeholder',
        encryptedRefreshToken: 'placeholder',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        status: 'CONNECTED',
        lastSyncedAt: new Date('2026-09-10T08:30:00.000Z'),
      },
    });
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .get('/me/connection')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'CONNECTED',
      lastSyncedAt: '2026-09-10T08:30:00.000Z',
    });
  });

  it('reports DISCONNECTED so the client can prompt a reconnect', async () => {
    const user = await createUser('disc');
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: `health-disc-${randomUUID()}`,
        encryptedAccessToken: 'placeholder',
        encryptedRefreshToken: 'placeholder',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        status: 'DISCONNECTED',
      },
    });
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .get('/me/connection')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DISCONNECTED');
    expect(res.body.lastSyncedAt).toBeNull();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).get('/me/connection');
    expect(res.status).toBe(401);
  });

  it("does not leak another user's connection", async () => {
    const userA = await createUser('leakA');
    const userB = await createUser('leakB');
    await prisma.healthConnection.create({
      data: {
        userId: userB.id,
        healthUserId: `health-leak-${randomUUID()}`,
        encryptedAccessToken: 'placeholder',
        encryptedRefreshToken: 'placeholder',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        status: 'CONNECTED',
      },
    });
    const authHeader = await authHeaderFor(userA.id);

    const res = await request(await testServer(createApp()))
      .get('/me/connection')
      .set(authHeader);

    expect(res.body.status).toBe('NOT_CONNECTED');
  });
});
