import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { localCivilDate, civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { habitDayFor } from '../../src/habits/habitDay';
import { shiftDate } from '../../src/scoring/dates';
import { authed, createUser } from './dbHelpers';
import { testServer } from '../helpers/server';
import { connection } from '../../src/sync/queue';
import { evaluationVersion, markEvaluated, readEvaluated } from '../../src/achievements/marker';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const app = createApp();
const todayUtc = () => habitDayFor(new Date(), 'UTC');

describe('auth', () => {
  it.each([
    ['get', '/me/habits/config'],
    ['post', '/me/habits/types'],
    ['post', '/me/habits/logs'],
    ['get', '/me/habits/logs'],
    ['delete', '/me/habits/logs/abc'],
    ['post', '/me/habits/check-ins'],
    ['get', '/me/habits/status'],
    ['get', '/me/habits/patterns'],
  ] as const)('%s %s requires a bearer token', async (method, path) => {
    expect((await request(await testServer(app))[method](path)).status).toBe(401);
  });
});

describe('GET /me/habits/config', () => {
  it('returns the three built-ins with their exposure thresholds', async () => {
    const user = await createUser();
    const res = await request(await testServer(app)).get('/me/habits/config').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['habitTypes']);
    expect(res.body.habitTypes).toEqual([
      { type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true },
      { type: 'CAFFEINE', label: 'Caffeine', unit: 'cups', exposureThreshold: 3, builtIn: true },
      { type: 'WORKOUT', label: 'Workout', unit: 'minutes', exposureThreshold: 20, builtIn: true },
    ]);
  });

  it("includes the caller's custom types after the built-ins, and no one else's", async () => {
    const a = await createUser();
    const b = await createUser();
    await request(await testServer(app)).post('/me/habits/types').set(await authed(a.id)).send({ label: 'Sauna', unit: 'sessions', exposureThreshold: 1 });

    const mine = await request(await testServer(app)).get('/me/habits/config').set(await authed(a.id));
    expect(mine.body.habitTypes).toHaveLength(4);
    expect(mine.body.habitTypes[3]).toMatchObject({ label: 'Sauna', unit: 'sessions', exposureThreshold: 1, builtIn: false });

    const theirs = await request(await testServer(app)).get('/me/habits/config').set(await authed(b.id));
    expect(theirs.body.habitTypes).toHaveLength(3);
  });
});

describe('POST /me/habits/types', () => {
  it('creates a custom type with a generated stable id and returns 201 { habitType }', async () => {
    const user = await createUser();
    const res = await request(await testServer(app))
      .post('/me/habits/types')
      .set(await authed(user.id))
      .send({ label: '  Late meal ', unit: 'meals', exposureThreshold: 1 });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['habitType']);
    expect(res.body.habitType).toMatchObject({ label: 'Late meal', unit: 'meals', exposureThreshold: 1, builtIn: false });
    expect(res.body.habitType.type).toMatch(/^CUSTOM_LATE_MEAL_[0-9A-F]{6}$/);
  });

  it('gives two users the same label distinct ids, and the id survives being logged against', async () => {
    const a = await createUser();
    const b = await createUser();
    const body = { label: 'Sauna', unit: 'sessions', exposureThreshold: 1 };
    const ra = await request(await testServer(app)).post('/me/habits/types').set(await authed(a.id)).send(body);
    const rb = await request(await testServer(app)).post('/me/habits/types').set(await authed(b.id)).send(body);
    expect(ra.body.habitType.type).not.toBe(rb.body.habitType.type);

    const log = await request(await testServer(app))
      .post('/me/habits/logs')
      .set(await authed(a.id))
      .send({ habitType: ra.body.habitType.type, value: 1 });
    expect(log.status).toBe(201);
    // ...but a type id is private to its owner.
    const stolen = await request(await testServer(app))
      .post('/me/habits/logs')
      .set(await authed(b.id))
      .send({ habitType: ra.body.habitType.type, value: 1 });
    expect(stolen.status).toBe(400);
  });

  it('rejects a duplicate label case-insensitively, including built-in labels, with 409', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    expect((await request(await testServer(app)).post('/me/habits/types').set(h).send({ label: 'Sauna', unit: 'x', exposureThreshold: 1 })).status).toBe(201);
    expect((await request(await testServer(app)).post('/me/habits/types').set(h).send({ label: 'sauna', unit: 'x', exposureThreshold: 1 })).status).toBe(409);
    expect((await request(await testServer(app)).post('/me/habits/types').set(h).send({ label: 'ALCOHOL', unit: 'x', exposureThreshold: 1 })).status).toBe(409);
  });

  it.each([
    ['a missing label', { unit: 'x', exposureThreshold: 1 }],
    ['a blank label', { label: '   ', unit: 'x', exposureThreshold: 1 }],
    ['an over-long label', { label: 'x'.repeat(41), unit: 'x', exposureThreshold: 1 }],
    ['a missing unit', { label: 'A', exposureThreshold: 1 }],
    ['a non-string unit', { label: 'A', unit: 5, exposureThreshold: 1 }],
    ['a zero threshold', { label: 'A', unit: 'x', exposureThreshold: 0 }],
    ['a negative threshold', { label: 'A', unit: 'x', exposureThreshold: -1 }],
    ['a string threshold', { label: 'A', unit: 'x', exposureThreshold: '2' }],
    ['a missing threshold', { label: 'A', unit: 'x' }],
  ])('rejects %s with 400', async (_name, body) => {
    const user = await createUser();
    const res = await request(await testServer(app)).post('/me/habits/types').set(await authed(user.id)).send(body);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });
});

describe('POST /me/habits/logs', () => {
  it('creates a log and returns 201 { log } with the HabitLogDTO shape', async () => {
    const user = await createUser();
    const res = await request(await testServer(app))
      .post('/me/habits/logs')
      .set(await authed(user.id))
      .send({ habitType: 'ALCOHOL', value: 3, note: 'wine', loggedAt: '2026-09-10T20:00:00Z' });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['log']);
    expect(Object.keys(res.body.log).sort()).toEqual(['habitDay', 'habitType', 'id', 'loggedAt', 'note', 'unit', 'value']);
    expect(res.body.log).toMatchObject({
      habitType: 'ALCOHOL',
      value: 3,
      unit: 'drinks',
      loggedAt: '2026-09-10T20:00:00.000Z',
      habitDay: '2026-09-10',
      note: 'wine',
    });
    expect(res.body.log.id).toEqual(expect.any(String));
  });

  it('defaults loggedAt to now, unit to the type unit and note to null', async () => {
    const user = await createUser();
    const res = await request(await testServer(app)).post('/me/habits/logs').set(await authed(user.id)).send({ habitType: 'WORKOUT', value: 30 });
    expect(res.status).toBe(201);
    expect(res.body.log.unit).toBe('minutes');
    expect(res.body.log.note).toBeNull();
    expect(res.body.log.habitDay).toBe(habitDayFor(new Date(res.body.log.loggedAt), 'UTC'));
  });

  it('accepts 0 as a real "none" entry', async () => {
    const user = await createUser();
    const res = await request(await testServer(app)).post('/me/habits/logs').set(await authed(user.id)).send({ habitType: 'ALCOHOL', value: 0 });
    expect(res.status).toBe(201);
    expect(res.body.log.value).toBe(0);
  });

  it.each([
    ['a missing habitType', { value: 1 }],
    ['an unknown habitType', { habitType: 'NOPE', value: 1 }],
    ['a missing value', { habitType: 'ALCOHOL' }],
    ['a negative value', { habitType: 'ALCOHOL', value: -1 }],
    ['a string value', { habitType: 'ALCOHOL', value: '2' }],
    ['a non-finite value', { habitType: 'ALCOHOL', value: 1e999 }],
    ['a bad loggedAt', { habitType: 'ALCOHOL', value: 1, loggedAt: 'yesterday-ish' }],
    ['a far-future loggedAt', { habitType: 'ALCOHOL', value: 1, loggedAt: '2099-01-01T00:00:00Z' }],
    ['a blank unit', { habitType: 'ALCOHOL', value: 1, unit: ' ' }],
    ['a non-string note', { habitType: 'ALCOHOL', value: 1, note: 5 }],
  ])('rejects %s with 400', async (_name, body) => {
    const user = await createUser();
    const res = await request(await testServer(app)).post('/me/habits/logs').set(await authed(user.id)).send(body);
    expect(res.status).toBe(400);
  });

  describe('habit day is derived at write time (04:00 local boundary)', () => {
    it('puts a 01:00 local log on the previous day and a 04:00 local log on the current day', async () => {
      const user = await createUser({ timezone: 'America/Los_Angeles' });
      const h = await authed(user.id);
      const at1am = await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'ALCOHOL', value: 2, loggedAt: '2026-09-10T08:00:00Z' });
      const at4am = await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'ALCOHOL', value: 2, loggedAt: '2026-09-10T11:00:00Z' });
      expect(at1am.body.log.habitDay).toBe('2026-09-09');
      expect(at4am.body.log.habitDay).toBe('2026-09-10');
    });

    it('does not rewrite stored habit days when the user later changes timezone', async () => {
      const user = await createUser({ timezone: 'America/Los_Angeles' });
      const h = await authed(user.id);
      await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'ALCOHOL', value: 2, loggedAt: '2026-09-10T08:00:00Z' });
      const before = await prisma.habitLog.findFirst({ where: { userId: user.id } });

      expect((await request(await testServer(app)).put('/me/timezone').set(h).send({ timezone: 'Asia/Tokyo' })).status).toBe(200);

      const after = await prisma.habitLog.findFirst({ where: { userId: user.id } });
      expect(after!.habitDay).toEqual(before!.habitDay);
      expect(after!.habitDay.toISOString().slice(0, 10)).toBe('2026-09-09');
      const listed = await request(await testServer(app)).get('/me/habits/logs?from=2026-09-01&to=2026-09-30').set(h);
      expect(listed.body.logs[0].habitDay).toBe('2026-09-09');
      // ...while a NEW log at the same instant now buckets under Tokyo (17:00 on the 10th).
      const fresh = await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'ALCOHOL', value: 2, loggedAt: '2026-09-10T08:00:00Z' });
      expect(fresh.body.log.habitDay).toBe('2026-09-10');
    });

    // The habit day and the Stat Engine's canonical day must not silently drift
    // apart: outside the 00:00-04:00 window a habit day IS the local civil date
    // the score/rollup pipeline buckets by.
    it('uses the same local civil date convention as the Stat Engine outside the boundary hours', async () => {
      const user = await createUser({ timezone: 'Pacific/Auckland' });
      const h = await authed(user.id);
      for (const loggedAt of ['2026-09-10T00:30:00Z', '2026-09-10T09:00:00Z', '2026-09-10T20:15:00Z']) {
        const res = await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'CAFFEINE', value: 1, loggedAt });
        expect(res.body.log.habitDay).toBe(localCivilDate(new Date(loggedAt), 'Pacific/Auckland'));
      }
    });
  });
});

describe('GET /me/habits/logs and DELETE /me/habits/logs/:id', () => {
  async function log(userId: string, habitType: string, value: number, loggedAt: string) {
    const res = await request(await testServer(app)).post('/me/habits/logs').set(await authed(userId)).send({ habitType, value, loggedAt });
    return res.body.log;
  }

  it('returns { logs } for the habit-day range, newest first, and only the caller\'s', async () => {
    const a = await createUser();
    const b = await createUser();
    await log(a.id, 'ALCOHOL', 1, '2026-09-01T20:00:00Z');
    await log(a.id, 'ALCOHOL', 2, '2026-09-03T20:00:00Z');
    await log(a.id, 'CAFFEINE', 1, '2026-09-03T09:00:00Z');
    await log(a.id, 'ALCOHOL', 3, '2026-09-20T20:00:00Z'); // outside the range
    await log(b.id, 'ALCOHOL', 9, '2026-09-03T20:00:00Z');

    const res = await request(await testServer(app)).get('/me/habits/logs?from=2026-09-01&to=2026-09-05').set(await authed(a.id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['logs']);
    expect(res.body.logs.map((l: any) => [l.habitDay, l.habitType, l.value])).toEqual([
      ['2026-09-03', 'ALCOHOL', 2],
      ['2026-09-03', 'CAFFEINE', 1],
      ['2026-09-01', 'ALCOHOL', 1],
    ]);
  });

  it('defaults to the last 30 habit days when no range is given', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const now = new Date().toISOString();
    await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'ALCOHOL', value: 1, loggedAt: now });
    await request(await testServer(app))
      .post('/me/habits/logs')
      .set(h)
      .send({ habitType: 'ALCOHOL', value: 1, loggedAt: new Date(Date.now() - 45 * 86_400_000).toISOString() });
    const res = await request(await testServer(app)).get('/me/habits/logs').set(h);
    expect(res.body.logs).toHaveLength(1);
  });

  it.each([
    ['a malformed from', '?from=2026-9-1&to=2026-09-05'],
    ['a malformed to', '?from=2026-09-01&to=soon'],
    ['an impossible date', '?from=2026-02-31&to=2026-03-05'],
    ['from after to', '?from=2026-09-05&to=2026-09-01'],
    ['a range over a year', '?from=2024-01-01&to=2026-01-01'],
  ])('rejects %s with 400', async (_name, qs) => {
    const user = await createUser();
    expect((await request(await testServer(app)).get(`/me/habits/logs${qs}`).set(await authed(user.id))).status).toBe(400);
  });

  it('deletes an own log with 204 and it no longer lists', async () => {
    const user = await createUser();
    const created = await log(user.id, 'ALCOHOL', 2, '2026-09-03T20:00:00Z');
    const del = await request(await testServer(app)).delete(`/me/habits/logs/${created.id}`).set(await authed(user.id));
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    const res = await request(await testServer(app)).get('/me/habits/logs?from=2026-09-01&to=2026-09-05').set(await authed(user.id));
    expect(res.body.logs).toEqual([]);
  });

  it('returns 404 for a nonexistent id, and 404 (not 403) for another user\'s log, leaving it intact', async () => {
    const owner = await createUser();
    const other = await createUser();
    const created = await log(owner.id, 'ALCOHOL', 2, '2026-09-03T20:00:00Z');

    expect((await request(await testServer(app)).delete(`/me/habits/logs/${randomUUID()}`).set(await authed(owner.id))).status).toBe(404);
    expect((await request(await testServer(app)).delete(`/me/habits/logs/${created.id}`).set(await authed(other.id))).status).toBe(404);
    expect(await prisma.habitLog.count({ where: { id: created.id } })).toBe(1);
  });
});

describe('POST /me/habits/check-ins', () => {
  it("defaults to today's habit day and returns 201 { checkIn: { habitDay } }", async () => {
    const user = await createUser();
    const res = await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ checkIn: { habitDay: todayUtc() } });
  });

  it("uses the user's timezone for 'today'", async () => {
    const user = await createUser({ timezone: 'Pacific/Kiritimati' }); // UTC+14
    const res = await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({});
    expect(res.body.checkIn.habitDay).toBe(habitDayFor(new Date(), 'Pacific/Kiritimati'));
  });

  it('is idempotent: repeating the same day keeps one row and still returns 201', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const first = await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({});
    const second = await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: todayUtc() });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await prisma.habitCheckIn.count({ where: { userId: user.id } })).toBe(1);
  });

  it('allows retroactive check-ins for each of the previous 7 habit days', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    for (let back = 1; back <= 7; back++) {
      const habitDay = shiftDate(todayUtc(), -back);
      const res = await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay });
      expect(res.status).toBe(201);
      expect(res.body.checkIn.habitDay).toBe(habitDay);
    }
  });

  it('rejects the 8th previous day, the future, and malformed days with 400', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    for (const habitDay of [shiftDate(todayUtc(), -8), shiftDate(todayUtc(), 1), '2026-13-01', 'today', 20260901, null]) {
      const res = await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay });
      expect(res.status).toBe(400);
    }
    expect(await prisma.habitCheckIn.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('GET /me/habits/status', () => {
  it('reports today and per-day check-in and per-type observed flags, newest first', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const today = todayUtc();
    await request(await testServer(app)).post('/me/habits/logs').set(h).send({ habitType: 'ALCOHOL', value: 0 }); // today, alcohol only
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: shiftDate(today, -1) }); // yesterday, everything

    const res = await request(await testServer(app)).get('/me/habits/status').set(h);
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(today);
    expect(res.body.days).toHaveLength(14);
    expect(res.body.days[0]).toEqual({
      habitDay: today,
      checkedIn: false,
      observed: { ALCOHOL: true, CAFFEINE: false, WORKOUT: false },
    });
    expect(res.body.days[1]).toEqual({
      habitDay: shiftDate(today, -1),
      checkedIn: true,
      observed: { ALCOHOL: true, CAFFEINE: true, WORKOUT: true },
    });
    expect(res.body.days[13].habitDay).toBe(shiftDate(today, -13));
    expect(res.body.days[2].observed).toEqual({ ALCOHOL: false, CAFFEINE: false, WORKOUT: false });
  });

  it('includes custom habit types and honours ?days=, capped', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const created = await request(await testServer(app)).post('/me/habits/types').set(h).send({ label: 'Sauna', unit: 's', exposureThreshold: 1 });
    const type = created.body.habitType.type;

    const res = await request(await testServer(app)).get('/me/habits/status?days=3').set(h);
    expect(res.body.days).toHaveLength(3);
    expect(Object.keys(res.body.days[0].observed)).toEqual(['ALCOHOL', 'CAFFEINE', 'WORKOUT', type]);
    expect((await request(await testServer(app)).get('/me/habits/status?days=9999').set(h)).body.days).toHaveLength(60);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects days=%s with 400', async (days) => {
    const user = await createUser();
    expect((await request(await testServer(app)).get(`/me/habits/status?days=${days}`).set(await authed(user.id))).status).toBe(400);
  });

  it("does not leak another user's logs or check-ins", async () => {
    const a = await createUser();
    const b = await createUser();
    await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(a.id)).send({});
    const res = await request(await testServer(app)).get('/me/habits/status').set(await authed(b.id));
    expect(res.body.days[0]).toMatchObject({ checkedIn: false, observed: { ALCOHOL: false } });
  });
});

describe('GET /me/habits/patterns', () => {
  const row = (userId: string, over: Record<string, unknown>) => ({
    userId,
    habitType: 'ALCOHOL',
    factor: 'HRV',
    lagDays: 1,
    status: 'CONFIRMED' as const,
    consecutivePasses: 2,
    consecutiveMisses: 0,
    lastEvaluatedAt: new Date(),
    lastRunKey: '2026-W01',
    r: -0.5,
    pValue: 0.001,
    qValue: 0.01,
    effectSizePercent: -14.2,
    comparisonPercent: 2.1,
    sampleSize: 40,
    direction: 'lower',
    series: { days: ['2026-09-01', '2026-09-02'], habit: [1, 0], factor: [-1.2, null] },
    ...over,
  });

  it('returns an empty result for a user with nothing', async () => {
    const user = await createUser();
    const res = await request(await testServer(app)).get('/me/habits/patterns').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patterns: [], notEnoughData: [] });
  });

  it('returns CONFIRMED rows only, in the PatternDTO shape, never CANDIDATE or RETIRED', async () => {
    const user = await createUser();
    await prisma.habitCorrelation.createMany({
      data: [
        row(user.id, {}),
        row(user.id, { factor: 'RHR', status: 'CANDIDATE', consecutivePasses: 1 }),
        row(user.id, { factor: 'SLEEP_DURATION', status: 'RETIRED', consecutivePasses: 0, consecutiveMisses: 2 }),
      ] as any,
    });

    const res = await request(await testServer(app)).get('/me/habits/patterns').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body.patterns).toHaveLength(1);
    expect(res.body.patterns[0]).toEqual({
      habitType: 'ALCOHOL',
      exposureThreshold: 2,
      exposureUnit: 'drinks',
      factor: 'HRV',
      factorLabel: 'HRV',
      lagDays: 1,
      effectSizePercent: -14.2,
      comparisonPercent: 2.1,
      sampleSize: 40,
      direction: 'lower',
      series: { days: ['2026-09-01', '2026-09-02'], habit: [1, 0], factor: [-1.2, null] },
    });
  });

  it('labels the RHR factor "Resting HR" and resolves custom-type thresholds', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const created = await request(await testServer(app)).post('/me/habits/types').set(h).send({ label: 'Sauna', unit: 'sessions', exposureThreshold: 1.5 });
    await prisma.habitCorrelation.createMany({
      data: [
        row(user.id, { factor: 'RHR' }),
        row(user.id, { habitType: created.body.habitType.type, factor: 'CIRCADIAN_CONSISTENCY' }),
      ] as any,
    });

    const res = await request(await testServer(app)).get('/me/habits/patterns').set(h);
    const rhr = res.body.patterns.find((p: any) => p.factor === 'RHR');
    expect(rhr.factorLabel).toBe('Resting HR');
    const sauna = res.body.patterns.find((p: any) => p.habitType === created.body.habitType.type);
    expect(sauna).toMatchObject({ exposureThreshold: 1.5, exposureUnit: 'sessions', factorLabel: 'Bedtime consistency' });
  });

  it("does not return another user's patterns", async () => {
    const a = await createUser();
    const b = await createUser();
    await prisma.habitCorrelation.create({ data: row(a.id, {}) as any });
    const res = await request(await testServer(app)).get('/me/habits/patterns').set(await authed(b.id));
    expect(res.body.patterns).toEqual([]);
  });

  it('reports a habit under notEnoughData with its exposed/unexposed pair counts and requiredEach 8', async () => {
    const user = await createUser();
    const today = todayUtc();
    // 3 exposed and 9 unexposed observed habit days, each with the following night's HRV.
    const days = Array.from({ length: 12 }, (_, i) => shiftDate(today, -14 + i));
    await prisma.habitLog.createMany({
      data: days.map((d, i) => ({
        userId: user.id,
        habitType: 'ALCOHOL',
        value: i < 3 ? 3 : 0,
        unit: 'drinks',
        loggedAt: new Date(`${d}T20:00:00Z`),
        habitDay: civilDateToUtcMidnight(d),
      })),
    });
    await prisma.userDailyFeatures.createMany({
      data: days.map((d, i) => ({
        userId: user.id,
        date: civilDateToUtcMidnight(shiftDate(d, 1)),
        algorithmVersion: 'v1',
        hrvZ: Math.sin(i),
        hrvBaselineDeviationPct: 1,
      })),
    });

    const res = await request(await testServer(app)).get('/me/habits/patterns').set(await authed(user.id));
    expect(res.body.patterns).toEqual([]);
    expect(res.body.notEnoughData).toEqual([{ habitType: 'ALCOHOL', exposedDays: 3, unexposedDays: 9, requiredEach: 8 }]);
  });
});

/** An Etc/GMT zone whose wall clock reads `hour`:xx right now (Etc/GMT-N is UTC+N). */
function zoneAtLocalHour(hour: number, now = new Date()): string {
  let offset = (hour - now.getUTCHours() + 24) % 24;
  if (offset > 14) offset -= 24;
  return offset === 0 ? 'Etc/GMT' : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

describe('POST /me/habits/check-ins: on time', () => {
  const onTimeOf = async (userId: string, habitDay: string) =>
    (await prisma.habitCheckIn.findUniqueOrThrow({ where: { userId_habitDay: { userId, habitDay: civilDateToUtcMidnight(habitDay) } } })).onTime;

  it("stores onTime for today's habit day and not for a backdated one", async () => {
    const user = await createUser();
    const h = await authed(user.id);
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({});
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: shiftDate(todayUtc(), -1) });
    expect(await onTimeOf(user.id, todayUtc())).toBe(true);
    expect(await onTimeOf(user.id, shiftDate(todayUtc(), -1))).toBe(false);
  });

  it('puts a 01:00 check-in on the previous calendar day, on time (the 4am habit day)', async () => {
    const zone = zoneAtLocalHour(1);
    const user = await createUser({ timezone: zone });
    const now = new Date();
    const res = await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({});
    const habitToday = habitDayFor(now, zone);
    expect(habitToday).toBe(shiftDate(localCivilDate(now, zone), -1));
    expect(res.body.checkIn.habitDay).toBe(habitToday);
    expect(await onTimeOf(user.id, habitToday)).toBe(true);
  });

  it('never rewrites a stored flag: a repeat tap on a backdated day leaves it false', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const yesterday = shiftDate(todayUtc(), -1);
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: yesterday });
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: yesterday });
    expect(await onTimeOf(user.id, yesterday)).toBe(false);
  });

  it('never rewrites a stored flag: a later tap on a day stored on time leaves it true', async () => {
    const user = await createUser();
    const yesterday = shiftDate(todayUtc(), -1);
    await prisma.habitCheckIn.create({ data: { userId: user.id, habitDay: civilDateToUtcMidnight(yesterday), onTime: true } });
    await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({ habitDay: yesterday });
    expect(await onTimeOf(user.id, yesterday)).toBe(true);
  });

  it('clears the achievements marker so the next badge load re-evaluates', async () => {
    const user = await createUser();
    await markEvaluated(user.id, await evaluationVersion(user.id), []);
    expect(await readEvaluated(user.id)).toEqual([]);
    await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({});
    expect(await readEvaluated(user.id)).toBeNull();
  });
});
