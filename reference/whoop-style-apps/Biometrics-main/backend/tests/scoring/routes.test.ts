import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { computeDailyScore } from '../../src/scoring/compute';
import { localCivilDate } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { getLiveConfig } from '../../src/scoring/configs';
import { createUser, seedHistory, day } from './dbHelpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

const FACTORS = [
  { factor: 'HRV', z: 1, weight: 0.45, contribution: 0.45, points: 6, imputed: false, excluded: false },
  { factor: 'RHR', z: -0.5, weight: 0.35, contribution: 0.175, points: 2.33, imputed: false, excluded: false },
  { factor: 'SLEEP_DEBT', z: 0.5, weight: 0.2, contribution: -0.1, points: -1.33, imputed: false, excluded: false },
];

async function authed(userId: string) {
  return authHeaderFor(userId);
}

async function putScore(userId: string, date: string, score: number | null, factors: unknown = FACTORS) {
  return prisma.dailyScore.create({
    data: {
      userId,
      date: day(date),
      type: 'RECOVERY',
      algorithmVersion: 'v1',
      score,
      confidenceLevel: score === null ? 'LOW' : 'HIGH',
      factors: factors as any,
    },
  });
}

describe('auth', () => {
  it('rejects unauthenticated requests on both routes', async () => {
    expect((await request(await testServer(createApp())).get('/me/scores')).status).toBe(401);
    expect((await request(await testServer(createApp())).get('/me/scores/2026-09-01')).status).toBe(401);
  });
});

describe('GET /me/scores', () => {
  it('returns { scores } newest first with the DailyScoreDTO shape', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(user.id, shiftDate(today, -2), 60);
    await putScore(user.id, today, 72.34);
    await putScore(user.id, shiftDate(today, -1), 55);

    const res = await request(await testServer(createApp())).get('/me/scores').set(await authed(user.id));

    expect(res.status).toBe(200);
    // Edited: `bands` (from the live scoring config) is now a top-level field.
    expect(Object.keys(res.body)).toEqual(['scores', 'bands']);
    expect(res.body.bands).toEqual(getLiveConfig().scoreBands);
    expect(res.body.bands).toEqual({ excellent: 75, good: 55, fair: 40 });
    expect(res.body.scores.map((s: any) => s.date)).toEqual([today, shiftDate(today, -1), shiftDate(today, -2)]);

    const first = res.body.scores[0];
    expect(Object.keys(first).sort()).toEqual(
      ['algorithmVersion', 'coldStart', 'confidenceLevel', 'date', 'factors', 'score', 'type'].sort(),
    );
    expect(first).toMatchObject({ type: 'RECOVERY', score: 72.3, confidenceLevel: 'HIGH', algorithmVersion: 'v1', coldStart: [] });
    expect(Object.keys(first.factors[0]).sort()).toEqual(
      ['contribution', 'excluded', 'factor', 'imputed', 'label', 'points', 'weight', 'z'].sort(),
    );
  });

  it('labels the RHR factor "Resting HR" (the dedicated daily resting HR type, no longer the daily-minimum proxy)', async () => {
    const user = await createUser();
    await putScore(user.id, localCivilDate(new Date(), 'UTC'), 60);
    const res = await request(await testServer(createApp())).get('/me/scores').set(await authed(user.id));
    const labels = Object.fromEntries(res.body.scores[0].factors.map((f: any) => [f.factor, f.label]));
    expect(labels).toEqual({ HRV: 'HRV', RHR: 'Resting HR', SLEEP_DEBT: 'Sleep debt' });
  });

  it('defaults to the last 30 days and honors ?days=N', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(user.id, today, 60);
    await putScore(user.id, shiftDate(today, -2), 60);
    await putScore(user.id, shiftDate(today, -29), 60);
    await putScore(user.id, shiftDate(today, -30), 60);

    const dflt = await request(await testServer(createApp())).get('/me/scores').set(await authed(user.id));
    expect(dflt.body.scores).toHaveLength(3);

    const three = await request(await testServer(createApp())).get('/me/scores?days=3').set(await authed(user.id));
    expect(three.body.scores.map((s: any) => s.date)).toEqual([today, shiftDate(today, -2)]);
  });

  it('caps days at 400', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(user.id, shiftDate(today, -399), 60);
    await putScore(user.id, shiftDate(today, -400), 60);

    const res = await request(await testServer(createApp())).get('/me/scores?days=9999').set(await authed(user.id));

    expect(res.body.scores.map((s: any) => s.date)).toEqual([shiftDate(today, -399)]);
  });

  it('rejects a non-numeric or non-positive days', async () => {
    const user = await createUser();
    expect((await request(await testServer(createApp())).get('/me/scores?days=abc').set(await authed(user.id))).status).toBe(400);
    expect((await request(await testServer(createApp())).get('/me/scores?days=0').set(await authed(user.id))).status).toBe(400);
  });

  it("does not return another user's scores", async () => {
    const mine = await createUser();
    const other = await createUser();
    await putScore(other.id, localCivilDate(new Date(), 'UTC'), 80);

    const res = await request(await testServer(createApp())).get('/me/scores').set(await authed(mine.id));

    expect(res.body.scores).toEqual([]);
  });

  it('reports cold-start progress for excluded factors, and a null score when every factor is excluded', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(
      user.id,
      today,
      null,
      FACTORS.map((f) => ({ ...f, z: null, weight: 0, contribution: 0, points: 0, excluded: true })),
    );
    await prisma.baselineSnapshot.create({
      data: { userId: user.id, metric: 'HRV', date: day(today), daysOfHistory: 9, algorithmVersion: 'v1' },
    });

    const res = await request(await testServer(createApp())).get('/me/scores').set(await authed(user.id));

    const score = res.body.scores[0];
    expect(score.score).toBeNull();
    expect(score.coldStart).toEqual([
      { metric: 'HRV', daysCollected: 9, daysRequired: 14 },
      { metric: 'RESTING_HR', daysCollected: 0, daysRequired: 14 },
      { metric: 'SLEEP_DEBT', daysCollected: 0, daysRequired: 14 },
    ]);
  });
});

describe('GET /me/scores/:date', () => {
  it('returns the score, the baselines it was computed against and the previous scored day', async () => {
    const user = await createUser();
    await putScore(user.id, '2026-09-01', 58.26);
    await putScore(user.id, '2026-09-02', null, FACTORS.map((f) => ({ ...f, z: null, excluded: true })));
    await putScore(user.id, '2026-09-03', 71.04);
    for (const [metric, ewma, spread] of [
      ['HRV', 42.123, 6.05],
      ['RESTING_HR', 55.5, 2.2],
      ['SLEEP_DEBT', 120, 45],
    ] as const) {
      await prisma.baselineSnapshot.create({
        data: { userId: user.id, metric, date: day('2026-09-03'), ewma, spread, mad: spread / 1.4826, daysOfHistory: 30, algorithmVersion: 'v1' },
      });
    }

    const res = await request(await testServer(createApp())).get('/me/scores/2026-09-03').set(await authed(user.id));

    expect(res.status).toBe(200);
    // Edited: `bands` (from the live scoring config) is now a top-level field.
    expect(Object.keys(res.body).sort()).toEqual(['bands', 'baselines', 'previous', 'score']);
    expect(res.body.bands).toEqual(getLiveConfig().scoreBands);
    expect(res.body.bands).toEqual({ excellent: 75, good: 55, fair: 40 });
    expect(res.body.score).toMatchObject({ date: '2026-09-03', type: 'RECOVERY', score: 71 });
    // Skips the cold-start day (no score) to the last day that has one.
    expect(res.body.previous).toEqual({ date: '2026-09-01', score: 58.3 });
    expect(res.body.baselines).toEqual([
      { metric: 'HRV', ewma: 42.12, spread: 6.05, daysOfHistory: 30, windowDays: 30, unit: 'ms' },
      { metric: 'RESTING_HR', ewma: 55.5, spread: 2.2, daysOfHistory: 30, windowDays: 30, unit: 'bpm' },
      { metric: 'SLEEP_DEBT', ewma: 120, spread: 45, daysOfHistory: 30, windowDays: 30, unit: 'min' },
    ]);
  });

  it('returns previous: null when there is no earlier scored day, and omits cold-start baselines', async () => {
    const user = await createUser();
    await putScore(user.id, '2026-09-03', 71);
    await prisma.baselineSnapshot.create({
      data: { userId: user.id, metric: 'HRV', date: day('2026-09-03'), daysOfHistory: 9, algorithmVersion: 'v1' },
    });

    const res = await request(await testServer(createApp())).get('/me/scores/2026-09-03').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(res.body.previous).toBeNull();
    expect(res.body.baselines).toEqual([]);
  });

  it('404s when there is no score for the date, or only for the other type', async () => {
    const user = await createUser();
    await putScore(user.id, '2026-09-03', 71);

    expect((await request(await testServer(createApp())).get('/me/scores/2026-09-04').set(await authed(user.id))).status).toBe(404);
    expect((await request(await testServer(createApp())).get('/me/scores/2026-09-03?type=SLEEP').set(await authed(user.id))).status).toBe(404);
  });

  it("404s for another user's score", async () => {
    const mine = await createUser();
    const other = await createUser();
    await putScore(other.id, '2026-09-03', 71);

    expect((await request(await testServer(createApp())).get('/me/scores/2026-09-03').set(await authed(mine.id))).status).toBe(404);
  });

  it('400s on a malformed date or unknown type', async () => {
    const user = await createUser();
    expect((await request(await testServer(createApp())).get('/me/scores/2026-9-3').set(await authed(user.id))).status).toBe(400);
    expect((await request(await testServer(createApp())).get('/me/scores/2026-02-31').set(await authed(user.id))).status).toBe(400);
    expect((await request(await testServer(createApp())).get('/me/scores/2026-09-03?type=STRAIN').set(await authed(user.id))).status).toBe(400);
  });

  it('serves a score computed by the engine end to end', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, '2026-06-01', 40);
    await computeDailyScore(user.id, last);

    const res = await request(await testServer(createApp())).get(`/me/scores/${last}`).set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(typeof res.body.score.score).toBe('number');
    expect(res.body.score.factors).toHaveLength(3);
    expect(res.body.score.coldStart).toEqual([]);
    expect(res.body.baselines.map((b: any) => b.metric)).toEqual(['HRV', 'RESTING_HR', 'SLEEP_DEBT']);
  });
});
