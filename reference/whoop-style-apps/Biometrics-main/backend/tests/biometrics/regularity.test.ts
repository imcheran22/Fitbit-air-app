import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { storeSleepSessions } from '../../src/biometrics/repository';
import { localCivilDateOrUtc } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
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

async function getRegularity(userId: string, days: string | number) {
  const authHeader = await authHeaderFor(userId);
  return request(await testServer(createApp())).get(`/me/sleep/regularity?days=${days}`).set(authHeader);
}

const MINUTE_MS = 60_000;

/**
 * A night ENDING on `wakeDate` (UTC clock, offsets 0): bed at "HH:MM" (an
 * evening bedtime falls on the previous date, an after-midnight one on
 * wakeDate) and wake at "HH:MM" on wakeDate.
 */
function night(wakeDate: string, bed: string, wake = '07:00'): SleepSessionPoint {
  const bedDate = bed >= '12:00' ? shiftDate(wakeDate, -1) : wakeDate;
  const startTime = new Date(`${bedDate}T${bed}:00Z`);
  const endTime = new Date(`${wakeDate}T${wake}:00Z`);
  return {
    startTime, endTime,
    minutesAsleep: Math.round((endTime.getTime() - startTime.getTime()) / MINUTE_MS) - 20,
    startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
  };
}

const today = () => localCivilDateOrUtc(new Date(), 'UTC');

/** `n` steady 23:00 -> 07:00 nights ending on the n dates up to and including today. */
function steadyNights(n: number): SleepSessionPoint[] {
  const t = today();
  return Array.from({ length: n }, (_, i) => night(shiftDate(t, -i), '23:00'));
}

describe('GET /me/sleep/regularity', () => {
  it('scores bedtime and wake spread over 7 nights; an after-midnight bedtime counts as later (Review Focus 1)', async () => {
    const user = await createUser('reg-seven');
    const t = today();
    const beds = ['23:00', '23:10', '22:50', '23:05', '00:30', '23:00', '22:55'];
    const wakes = ['07:00', '07:05', '06:55', '07:00', '07:10', '06:50', '07:00'];
    const dates = beds.map((_, i) => shiftDate(t, i - 6));
    await storeSleepSessions(user.id, beds.map((b, i) => night(dates[i]!, b, wakes[i])));

    const res = await getRegularity(user.id, 7);

    expect(res.status).toBe(200);
    // Noon-anchored bedtimes 660,670,650,665,750,660,655: mean 672.86 -> "23:13".
    // Wrapped at midnight, 00:30 would be 30 and drag the mean to ~"20:xx".
    expect(res.body).toEqual({
      days: 7,
      nights: 7,
      // (100 * (1 - 32.06/120) + 100 * (1 - 5.98/120)) / 2 = 84.15
      score: 84,
      bedtimeSpreadMinutes: 32,
      wakeSpreadMinutes: 6,
      averageBedtime: '23:13',
      averageWake: '07:00',
      drift: [
        { date: dates[0], bedtimeOffsetMinutes: -13 },
        { date: dates[1], bedtimeOffsetMinutes: -3 },
        { date: dates[2], bedtimeOffsetMinutes: -23 },
        { date: dates[3], bedtimeOffsetMinutes: -8 },
        { date: dates[4], bedtimeOffsetMinutes: 77 }, // the 00:30 night: later, not 23 h earlier
        { date: dates[5], bedtimeOffsetMinutes: -13 },
        { date: dates[6], bedtimeOffsetMinutes: -18 },
      ],
    });
  });

  it('keeps a wake after noon contiguous with its bedtime: a 12:30 lie-in is a late wake, not a 00:30 one', async () => {
    const user = await createUser('reg-lie-in');
    const t = today();
    const wakes = ['07:00', '07:00', '07:00', '12:30', '07:00', '07:00', '07:00'];
    await storeSleepSessions(user.id, wakes.map((w, i) => night(shiftDate(t, i - 6), '23:00', w)));

    const res = await getRegularity(user.id, 7);

    // Wakes 1140 x6 and 1470 (not 30): mean 1187.1 -> "07:47", population std 115.5.
    // Wrapped, the lie-in would be 30: std ~388 (wake sub-score 0) and averageWake "04:21".
    expect(res.body).toMatchObject({
      nights: 7,
      bedtimeSpreadMinutes: 0,
      wakeSpreadMinutes: 115,
      averageBedtime: '23:00',
      averageWake: '07:47',
      score: 52, // (100 + 100 * (1 - 115.47/120)) / 2 = 51.9
    });
  });

  it('shows an average wake past noon on the clock: a mean above 1440 wraps for display', async () => {
    const user = await createUser('reg-late-wakes');
    const t = today();
    await storeSleepSessions(user.id, Array.from({ length: 4 }, (_, i) => night(shiftDate(t, -i), '23:00', '12:30')));

    const res = await getRegularity(user.id, 7);

    expect(res.body).toMatchObject({ nights: 4, averageWake: '12:30', wakeSpreadMinutes: 0, score: 100 });
  });

  it('is null-scored with fewer than 4 nights in a 7-day window, but still reports averages and drift', async () => {
    const user = await createUser('reg-three');
    await storeSleepSessions(user.id, steadyNights(3));

    const res = await getRegularity(user.id, 7);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      days: 7, nights: 3, score: null, bedtimeSpreadMinutes: null, wakeSpreadMinutes: null,
      averageBedtime: '23:00', averageWake: '07:00',
    });
    expect(res.body.drift).toHaveLength(3);
  });

  it('scores 4 nights in a 7-day window', async () => {
    const user = await createUser('reg-four');
    await storeSleepSessions(user.id, steadyNights(4));

    const res = await getRegularity(user.id, 7);

    expect(res.body).toMatchObject({ nights: 4, score: 100, bedtimeSpreadMinutes: 0, wakeSpreadMinutes: 0 });
  });

  it('needs 15 nights in a 30-day window', async () => {
    const fourteen = await createUser('reg-fourteen');
    await storeSleepSessions(fourteen.id, steadyNights(14));
    const fifteen = await createUser('reg-fifteen');
    await storeSleepSessions(fifteen.id, steadyNights(15));

    const a = await getRegularity(fourteen.id, 30);
    const b = await getRegularity(fifteen.id, 30);

    expect(a.body).toMatchObject({ days: 30, nights: 14, score: null, bedtimeSpreadMinutes: null });
    expect(b.body).toMatchObject({ days: 30, nights: 15, score: 100, bedtimeSpreadMinutes: 0 });
  });

  it('counts only nights ending in the window, today included, one main session per night', async () => {
    const user = await createUser('reg-window');
    const t = today();
    await storeSleepSessions(user.id, [
      ...steadyNights(2),
      night(shiftDate(t, -7), '23:00'), // the day before a 7-day window
      // A real same-day nap (13:00 -> 13:30 today): not a second night, and not the main session.
      {
        startTime: new Date(`${t}T13:00:00Z`), endTime: new Date(`${t}T13:30:00Z`), minutesAsleep: 25,
        startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
      },
    ]);

    const res = await getRegularity(user.id, 7);

    expect(res.body.nights).toBe(2);
    expect(res.body.averageBedtime).toBe('23:00');
    expect(res.body.drift).toEqual([
      { date: shiftDate(t, -1), bedtimeOffsetMinutes: 0 },
      { date: t, bedtimeOffsetMinutes: 0 },
    ]);
  });

  it('returns null averages and an empty drift with no nights', async () => {
    const user = await createUser('reg-empty');

    const res = await getRegularity(user.id, 30);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      days: 30, nights: 0, score: null, bedtimeSpreadMinutes: null, wakeSpreadMinutes: null,
      averageBedtime: null, averageWake: null, drift: [],
    });
  });

  it.each(['10', '', 'abc', '7.0'])('rejects days=%p with 400', async (days) => {
    const user = await createUser('reg-bad');
    const res = await getRegularity(user.id, days);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'days must be 7 or 30' });
  });

  it('requires auth', async () => {
    const res = await request(await testServer(createApp())).get('/me/sleep/regularity?days=7');
    expect(res.status).toBe(401);
  });
});
