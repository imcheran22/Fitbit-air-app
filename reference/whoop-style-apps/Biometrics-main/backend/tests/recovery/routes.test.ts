import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { createUser, day } from '../scoring/dbHelpers';
import { localCivilDate } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import * as forecastEngine from '../../src/forecast/engine';
import { getLiveConfig } from '../../src/scoring/configs';
import { nightlyDeficits } from '../../src/scoring/features';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => prisma.$disconnect());

const FACTORS = [
  { factor: 'HRV', z: 1, weight: 0.45, contribution: 0.45, points: 6, imputed: false, excluded: false },
  { factor: 'RHR', z: -0.5, weight: 0.35, contribution: 0.175, points: 2.33, imputed: false, excluded: false },
  { factor: 'SLEEP_DEBT', z: 0.5, weight: 0.2, contribution: -0.1, points: -1.33, imputed: false, excluded: false, goalMinutes: 480 },
];
const put = (userId: string, date: string, score: number | null) =>
  prisma.dailyScore.create({ data: { userId, date: day(date), type: 'RECOVERY', algorithmVersion: 'v3', score, confidenceLevel: score === null ? 'LOW' : 'HIGH', factors: FACTORS as any } });
const get = async (userId: string, path: string) => request(await testServer(createApp())).get(path).set(await authHeaderFor(userId));

describe('GET /me/recovery/:date', () => {
  it('requires auth', async () => {
    expect((await request(await testServer(createApp())).get('/me/recovery/today')).status).toBe(401);
    expect((await request(await testServer(createApp())).get('/me/recovery/calendar/2026-10')).status).toBe(401);
  });

  it('READY: resolves today in the user timezone and returns the full shape', async () => {
    const user = await createUser({ timezone: 'Pacific/Kiritimati' });
    const today = localCivilDate(new Date(), 'Pacific/Kiritimati');
    await put(user.id, shiftDate(today, -1), 62);
    await put(user.id, today, 68.04);
    const res = await get(user.id, '/me/recovery/today');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toMatchObject({ date: today, today, isToday: true, state: 'READY', previous: { date: shiftDate(today, -1), score: 62 } });
    expect(res.body.score.score).toBe(68);
    expect(typeof res.body.updatedAt).toBe('string');
    expect(res.body.weights).toEqual({ HRV: expect.any(Number), RHR: expect.any(Number), SLEEP_DEBT: expect.any(Number) });
    expect(res.body.outlook).toHaveLength(7);
    expect(res.body.outlook[6]).toEqual({ date: today, score: 68 });
    expect(res.body.streak).toEqual({ current: 2, best: 2 });
    expect(res.body.month.month).toBe(today.slice(0, 7));
    expect(res.body.firstScoredDate).toBe(shiftDate(today, -1));
    expect(res.body).toHaveProperty('tomorrow');
    expect(res.body).not.toHaveProperty('factors');
  });

  it('NO_DATA: today before the morning sync is a 200 with the streak kept from yesterday', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, shiftDate(today, -1), 70);
    const res = await get(user.id, `/me/recovery/${today}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'NO_DATA', score: null, updatedAt: null, streak: { current: 1, best: 1 } });
  });

  it('BUILDING: a row with a null score', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, null);
    expect((await get(user.id, '/me/recovery/today')).body.state).toBe('BUILDING');
  });

  it('past day: tomorrow is null and isToday false', async () => {
    const user = await createUser();
    const past = shiftDate(localCivilDate(new Date(), 'UTC'), -10);
    await put(user.id, past, 50);
    const res = await get(user.id, `/me/recovery/${past}`);
    expect(res.body).toMatchObject({ isToday: false, tomorrow: null, state: 'READY' });
    // The server's today (user timezone) rides along so the client never uses the device clock for paging.
    expect(res.body.today).toBe(localCivilDate(new Date(), 'UTC'));
  });

  it('tomorrow is UNAVAILABLE when the forecast throws, and the page still loads', async () => {
    const user = await createUser();
    await put(user.id, localCivilDate(new Date(), 'UTC'), 60);
    jest.spyOn(forecastEngine, 'buildForecast').mockImplementation(() => { throw new Error('boom'); });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await get(user.id, '/me/recovery/today');
    expect(res.status).toBe(200);
    expect(res.body.tomorrow).toEqual({ status: 'UNAVAILABLE' });
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0]).toHaveLength(1);
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toEqual({ event: 'recovery_error', route: 'tomorrow', error: 'Error' });
  });

  it('sleep debt: minutes, goal, usual and nightsToClear from features, snapshot and nights', async () => {
    const user = await createUser({ sleepGoalMinutes: 480 });
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 60);
    await prisma.userDailyFeatures.create({ data: { userId: user.id, date: day(today), algorithmVersion: 'v3', sleepDebtRolling14d: 180 } });
    await prisma.baselineSnapshot.create({ data: { userId: user.id, metric: 'SLEEP_DEBT', date: day(today), ewma: 100, spread: 25, mad: 17, daysOfHistory: 30, algorithmVersion: 'v3' } });
    // Two 90-minute-short nights at the old end of the window, the rest on goal.
    const nights = Array.from({ length: 14 }, (_, i) => ({ date: shiftDate(today, i - 13), value: i < 2 ? 390 : 480 }));
    for (const n of nights) {
      await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', recordedAt: day(n.date), value: n.value } });
    }
    const { sleepDebt } = (await get(user.id, '/me/recovery/today')).body;
    // The deficits nightsToClear walks are the ones the stored minutes sum.
    const deficits = nightlyDeficits(nights, today, 480, getLiveConfig());
    expect(deficits.reduce((s, v) => s + v, 0)).toBe(sleepDebt.minutes);
    expect(sleepDebt).toMatchObject({ minutes: 180, windowNights: 14, goalMinutes: 480, usualLowMinutes: 75, usualHighMinutes: 125, nightsToClear: 1 });
  });

  it('sleep debt is null when the window has no SLEEP records, even with a features row', async () => {
    const user = await createUser({ sleepGoalMinutes: 480 });
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 60);
    await prisma.userDailyFeatures.create({ data: { userId: user.id, date: day(today), algorithmVersion: 'v3', sleepDebtRolling14d: 0 } });
    await prisma.baselineSnapshot.create({ data: { userId: user.id, metric: 'SLEEP_DEBT', date: day(today), ewma: 100, spread: 25, mad: 17, daysOfHistory: 30, algorithmVersion: 'v3' } });
    // A night just outside the window does not count.
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', recordedAt: day(shiftDate(today, -14)), value: 300 } });
    expect((await get(user.id, '/me/recovery/today')).body.sleepDebt).toBeNull();
  });

  it('nightsToClear is 0 when the rounded stored debt is within the rounded usual high', async () => {
    const user = await createUser({ sleepGoalMinutes: 480 });
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 60);
    // Stored 125.4 rounds to the usual high (125); the nights (re-synced since) still re-derive 180.
    await prisma.userDailyFeatures.create({ data: { userId: user.id, date: day(today), algorithmVersion: 'v3', sleepDebtRolling14d: 125.4 } });
    await prisma.baselineSnapshot.create({ data: { userId: user.id, metric: 'SLEEP_DEBT', date: day(today), ewma: 100, spread: 25, mad: 17, daysOfHistory: 30, algorithmVersion: 'v3' } });
    for (let i = 0; i < 14; i++) {
      await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', recordedAt: day(shiftDate(today, i - 13)), value: i < 2 ? 390 : 480 } });
    }
    const { sleepDebt } = (await get(user.id, '/me/recovery/today')).body;
    expect(sleepDebt).toMatchObject({ minutes: 125, usualHighMinutes: 125, nightsToClear: 0 });
  });

  it('nightsToClear is at least 1 when the rounded stored debt is over the rounded usual high', async () => {
    const user = await createUser({ sleepGoalMinutes: 480 });
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 60);
    // Stored 126 is over the usual high (125); the nights (re-synced since) are all on goal.
    await prisma.userDailyFeatures.create({ data: { userId: user.id, date: day(today), algorithmVersion: 'v3', sleepDebtRolling14d: 126 } });
    await prisma.baselineSnapshot.create({ data: { userId: user.id, metric: 'SLEEP_DEBT', date: day(today), ewma: 100, spread: 25, mad: 17, daysOfHistory: 30, algorithmVersion: 'v3' } });
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', recordedAt: day(today), value: 480 } });
    expect((await get(user.id, '/me/recovery/today')).body.sleepDebt).toMatchObject({ minutes: 126, nightsToClear: 1 });
  });

  it('400 on a malformed or future date', async () => {
    const user = await createUser();
    expect((await get(user.id, '/me/recovery/2026-13-01')).status).toBe(400);
    expect((await get(user.id, `/me/recovery/${shiftDate(localCivilDate(new Date(), 'UTC'), 2)}`)).status).toBe(400);
  });

  it("a user west of UTC: UTC's today is their tomorrow, so it is a 400", async () => {
    const user = await createUser({ timezone: 'Etc/GMT+12' }); // UTC-12: their today is UTC's yesterday (or same day only after 12:00 UTC)
    const theirToday = localCivilDate(new Date(), 'Etc/GMT+12');
    expect((await get(user.id, `/me/recovery/${shiftDate(theirToday, 1)}`)).status).toBe(400);
    expect((await get(user.id, `/me/recovery/${theirToday}`)).status).toBe(200);
    expect((await get(user.id, '/me/recovery/today')).body.date).toBe(theirToday);
  });

  it('never logs recovery values', async () => {
    const spy = jest.spyOn(console, 'log');
    const err = jest.spyOn(console, 'error');
    const user = await createUser();
    await put(user.id, localCivilDate(new Date(), 'UTC'), 68.04);
    await get(user.id, '/me/recovery/today');
    const logged = [...spy.mock.calls, ...err.mock.calls].flat().map(String).join(' ');
    expect(logged).not.toMatch(/68/);
    expect(logged).not.toContain(localCivilDate(new Date(), 'UTC'));
  });
});

describe('GET /me/recovery/calendar/:month', () => {
  it('returns the month and bands, agreeing with the bundle month', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 80);
    const month = today.slice(0, 7);
    const cal = await get(user.id, `/me/recovery/calendar/${month}`);
    const page = await get(user.id, '/me/recovery/today');
    expect(cal.status).toBe(200);
    expect(cal.headers['cache-control']).toBe('private, no-store');
    expect(cal.body.month).toEqual(page.body.month);
    expect(cal.body.bands).toEqual(page.body.bands);
  });
  it('400 on malformed or future months', async () => {
    const user = await createUser();
    expect((await get(user.id, '/me/recovery/calendar/2026-1')).status).toBe(400);
    expect((await get(user.id, '/me/recovery/calendar/2999-01')).status).toBe(400);
  });
});
