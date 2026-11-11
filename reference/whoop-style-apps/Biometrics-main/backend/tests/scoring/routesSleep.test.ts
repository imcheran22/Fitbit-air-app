import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { computeDailyScore } from '../../src/scoring/compute';
import { localCivilDate } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { createUser, seedHistory, seedSessions, day } from './dbHelpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

const RECOVERY_FACTORS = [
  { factor: 'HRV', z: 1, weight: 0.45, contribution: 0.45, points: 6, imputed: false, excluded: false },
  { factor: 'RHR', z: -0.5, weight: 0.35, contribution: 0.175, points: 2.33, imputed: false, excluded: false },
  { factor: 'SLEEP_DEBT', z: 0.5, weight: 0.2, contribution: -0.1, points: -1.33, imputed: false, excluded: false },
];

const SLEEP_FACTORS = [
  { factor: 'SLEEP_DURATION', z: 0.5, weight: 0.45, contribution: 0.225, points: 3, imputed: false, excluded: false },
  { factor: 'SLEEP_EFFICIENCY', z: 1, weight: 0.35, contribution: 0.35, points: 4.5, imputed: false, excluded: false },
  { factor: 'CIRCADIAN_CONSISTENCY', z: -0.5, weight: 0.2, contribution: -0.1, points: -1.2, imputed: false, excluded: false },
];

async function authed(userId: string) {
  return authHeaderFor(userId);
}

async function putScore(userId: string, type: 'RECOVERY' | 'SLEEP', date: string, score: number | null, factors?: unknown) {
  return prisma.dailyScore.create({
    data: {
      userId,
      date: day(date),
      type,
      algorithmVersion: 'v1',
      score,
      confidenceLevel: score === null ? 'LOW' : 'HIGH',
      factors: (factors ?? (type === 'SLEEP' ? SLEEP_FACTORS : RECOVERY_FACTORS)) as any,
    },
  });
}

describe('Sleep Score over the API (Slice 1.5)', () => {
  it('GET /me/scores/:date?type=SLEEP returns the Sleep Score with the new factor labels, baselines and previous', async () => {
    const user = await createUser();
    await putScore(user.id, 'RECOVERY', '2026-09-03', 71); // a RECOVERY row the SLEEP query must not return
    await putScore(user.id, 'SLEEP', '2026-09-01', 64.44);
    await putScore(user.id, 'SLEEP', '2026-09-03', 80.06);
    for (const [metric, ewma, spread] of [
      ['SLEEP', 440.2, 31.5],
      ['SLEEP_EFFICIENCY', 0.913, 0.031],
      ['CIRCADIAN_CONSISTENCY', 82.4, 6.1],
      ['HRV', 42, 6], // a Recovery baseline: must not leak into the Sleep response
    ] as const) {
      await prisma.baselineSnapshot.create({
        data: { userId: user.id, metric, date: day('2026-09-03'), ewma, spread, mad: spread / 1.4826, daysOfHistory: 30, algorithmVersion: 'v1' },
      });
    }

    const res = await request(await testServer(createApp())).get('/me/scores/2026-09-03?type=SLEEP').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(res.body.score).toMatchObject({ date: '2026-09-03', type: 'SLEEP', score: 80.1, confidenceLevel: 'HIGH' });
    expect(res.body.score.factors.map((f: any) => [f.factor, f.label])).toEqual([
      ['SLEEP_DURATION', 'Sleep duration'],
      ['SLEEP_EFFICIENCY', 'Sleep efficiency'],
      ['CIRCADIAN_CONSISTENCY', 'Bedtime consistency'],
    ]);
    expect(Object.keys(res.body.score.factors[0]).sort()).toEqual(
      ['contribution', 'excluded', 'factor', 'imputed', 'label', 'points', 'weight', 'z'].sort(),
    );
    expect(res.body.previous).toEqual({ date: '2026-09-01', score: 64.4 });
    expect(res.body.baselines).toEqual([
      { metric: 'SLEEP', ewma: 440.2, spread: 31.5, daysOfHistory: 30, windowDays: 30, unit: 'min' },
      // Stored as a 0..1 fraction, shown as a percentage with a matching '%' unit.
      { metric: 'SLEEP_EFFICIENCY', ewma: 91.3, spread: 3.1, daysOfHistory: 30, windowDays: 30, unit: '%' },
      { metric: 'CIRCADIAN_CONSISTENCY', ewma: 82.4, spread: 6.1, daysOfHistory: 30, windowDays: 30, unit: 'pts' },
    ]);
  });

  it('still defaults the detail endpoint to RECOVERY: a SLEEP-only date 404s without ?type=SLEEP', async () => {
    const user = await createUser();
    await putScore(user.id, 'SLEEP', '2026-09-03', 80);
    expect((await request(await testServer(createApp())).get('/me/scores/2026-09-03').set(await authed(user.id))).status).toBe(404);
    await putScore(user.id, 'RECOVERY', '2026-09-03', 71);
    const res = await request(await testServer(createApp())).get('/me/scores/2026-09-03').set(await authed(user.id));
    expect(res.body.score.type).toBe('RECOVERY');
  });

  it('reports Sleep Score cold-start progress against the series each factor is built on', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(
      user.id,
      'SLEEP',
      today,
      null,
      SLEEP_FACTORS.map((f) => ({ ...f, z: null, weight: 0, contribution: 0, points: 0, excluded: true })),
    );
    await prisma.baselineSnapshot.create({
      data: { userId: user.id, metric: 'SLEEP', date: day(today), daysOfHistory: 9, algorithmVersion: 'v1' },
    });
    await prisma.baselineSnapshot.create({
      data: { userId: user.id, metric: 'CIRCADIAN_CONSISTENCY', date: day(today), daysOfHistory: 2, algorithmVersion: 'v1' },
    });

    const res = await request(await testServer(createApp())).get('/me/scores?type=SLEEP').set(await authed(user.id));

    expect(res.body.scores[0].score).toBeNull();
    expect(res.body.scores[0].coldStart).toEqual([
      { metric: 'SLEEP', daysCollected: 9, daysRequired: 14 },
      { metric: 'SLEEP_EFFICIENCY', daysCollected: 0, daysRequired: 14 },
      { metric: 'CIRCADIAN_CONSISTENCY', daysCollected: 2, daysRequired: 14 },
    ]);
  });

  it('GET /me/scores returns both score types by default, newest first with RECOVERY before SLEEP on the same day', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(user.id, 'SLEEP', today, 81);
    await putScore(user.id, 'RECOVERY', today, 72);
    await putScore(user.id, 'SLEEP', shiftDate(today, -1), 55);
    await putScore(user.id, 'RECOVERY', shiftDate(today, -1), 60);

    const res = await request(await testServer(createApp())).get('/me/scores').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(res.body.scores.map((s: any) => [s.date, s.type])).toEqual([
      [today, 'RECOVERY'],
      [today, 'SLEEP'],
      [shiftDate(today, -1), 'RECOVERY'],
      [shiftDate(today, -1), 'SLEEP'],
    ]);
  });

  it('GET /me/scores?type= filters to one type, and rejects an unknown one', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await putScore(user.id, 'RECOVERY', today, 72);
    await putScore(user.id, 'SLEEP', today, 81);

    const sleep = await request(await testServer(createApp())).get('/me/scores?type=SLEEP').set(await authed(user.id));
    expect(sleep.body.scores.map((s: any) => s.type)).toEqual(['SLEEP']);
    const recovery = await request(await testServer(createApp())).get('/me/scores?type=RECOVERY').set(await authed(user.id));
    expect(recovery.body.scores.map((s: any) => s.type)).toEqual(['RECOVERY']);
    expect((await request(await testServer(createApp())).get('/me/scores?type=STRAIN').set(await authed(user.id))).status).toBe(400);
  });

  it('serves a Sleep Score computed by the engine end to end, next to an unchanged Recovery Score', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, '2026-06-01', 45);
    await seedSessions(user.id, '2026-06-01', 45);
    await computeDailyScore(user.id, last);

    const res = await request(await testServer(createApp())).get(`/me/scores/${last}?type=SLEEP`).set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(typeof res.body.score.score).toBe('number');
    expect(res.body.score.factors).toHaveLength(3);
    expect(res.body.score.coldStart).toEqual([]);
    expect(res.body.baselines.map((b: any) => b.metric)).toEqual(['SLEEP', 'SLEEP_EFFICIENCY', 'CIRCADIAN_CONSISTENCY']);

    const recovery = await request(await testServer(createApp())).get(`/me/scores/${last}`).set(await authed(user.id));
    expect(recovery.body.score.type).toBe('RECOVERY');
    expect(recovery.body.score.factors.map((f: any) => f.factor).sort()).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
    expect(recovery.body.baselines.map((b: any) => b.metric)).toEqual(['HRV', 'RESTING_HR', 'SLEEP_DEBT']);
  });
});
