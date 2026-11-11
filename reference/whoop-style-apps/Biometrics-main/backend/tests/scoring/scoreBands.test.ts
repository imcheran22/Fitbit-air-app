import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { getLiveConfig, SCORE_CONFIGS } from '../../src/scoring/configs';
import { v1Config } from '../../src/scoring/configs/v1';
import { createUser, day } from './dbHelpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function authed(userId: string) {
  return authHeaderFor(userId);
}

describe('scoreBands in the scoring config', () => {
  it('v1 carries the product bands as lower bounds', () => {
    expect(v1Config.scoreBands).toEqual({ excellent: 75, good: 55, fair: 40 });
  });

  it.each(Object.entries(SCORE_CONFIGS))('%s: bounds are strictly descending and within 0-100', (_version, config) => {
    const { excellent, good, fair } = config.scoreBands;
    expect(excellent).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(fair);
    for (const bound of [excellent, good, fair]) {
      expect(bound).toBeGreaterThanOrEqual(0);
      expect(bound).toBeLessThanOrEqual(100);
    }
  });
});

describe('bands on the score endpoints', () => {
  it('GET /me/scores returns the live config bands, even with no scores', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/scores').set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(res.body.scores).toEqual([]);
    expect(res.body.bands).toEqual(getLiveConfig().scoreBands);
  });

  it.each(['RECOVERY', 'SLEEP'] as const)('GET /me/scores/:date returns bands for a %s score, existing fields unchanged', async (type) => {
    const user = await createUser();
    await prisma.dailyScore.create({
      data: {
        userId: user.id,
        date: day('2026-09-03'),
        type,
        algorithmVersion: 'v1',
        score: 71,
        confidenceLevel: 'HIGH',
        factors: [] as any,
      },
    });
    const res = await request(await testServer(createApp())).get(`/me/scores/2026-09-03?type=${type}`).set(await authed(user.id));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['bands', 'baselines', 'previous', 'score']);
    expect(res.body.bands).toEqual(getLiveConfig().scoreBands);
    expect(res.body.score).toMatchObject({ date: '2026-09-03', type, score: 71 });
    expect(res.body.previous).toBeNull();
  });
});
