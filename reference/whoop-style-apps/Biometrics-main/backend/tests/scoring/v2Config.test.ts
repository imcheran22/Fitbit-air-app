import { getLiveConfig, getScoreConfig, LIVE_VERSION, SCORE_CONFIGS } from '../../src/scoring/configs';
import { v1Config } from '../../src/scoring/configs/v1';
import { v2Config } from '../../src/scoring/configs/v2';
import { computeDailyScore } from '../../src/scoring/compute';
import { runScoreSweep } from '../../src/scoring/sweep';
import { COMPUTE_DAILY_SCORE_JOB, ScoreQueue } from '../../src/scoring/queue';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser, seedHistory, seedSessions, day } from './dbHelpers';

describe('score config v2 (Sleep Score weights)', () => {
  it('stays registered and importable (v3 is now live, see v3Config.test.ts)', () => {
    expect(LIVE_VERSION).not.toBe('v2');
    expect(getScoreConfig('v2')).toBe(v2Config);
    expect(Object.keys(SCORE_CONFIGS).sort()).toEqual(['v1', 'v2', 'v3']);
  });

  it('uses the approved Sleep Score weights: duration 0.50, efficiency 0.30, consistency 0.20', () => {
    expect(v2Config.version).toBe('v2');
    expect(v2Config.sleepScore.weights).toEqual({ SLEEP_DURATION: 0.5, SLEEP_EFFICIENCY: 0.3, CIRCADIAN_CONSISTENCY: 0.2 });
    const total = Object.values(v2Config.sleepScore.weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('differs from v1 in ONLY the version and the Sleep Score weights', () => {
    const { version: _v1, sleepScore: s1, ...restV1 } = v1Config;
    const { version: _v2, sleepScore: s2, ...restV2 } = v2Config;
    expect(restV2).toEqual(restV1);
    const { weights: _w1, ...sleepRestV1 } = s1;
    const { weights: _w2, ...sleepRestV2 } = s2;
    expect(sleepRestV2).toEqual(sleepRestV1);
  });

  it('leaves v1 untouched (versioned configs are never mutated in place)', () => {
    expect(v1Config.version).toBe('v1');
    expect(v1Config.sleepScore.weights).toEqual({ SLEEP_DURATION: 0.45, SLEEP_EFFICIENCY: 0.35, CIRCADIAN_CONSISTENCY: 0.2 });
    expect(v1Config.weights).toEqual({ HRV: 0.45, RHR: 0.35, SLEEP_DEBT: 0.2 });
    expect(getScoreConfig('v1')).toBe(v1Config);
  });
});

describe('stale algorithm-version rescoring', () => {
  beforeAll(() => {
    migrateTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const NOW = new Date('2026-08-10T12:00:00Z');
  const LIVE = getLiveConfig().version;

  function fakeQueue(): { queue: ScoreQueue; added: { userId: string; date: string }[] } {
    const added: { userId: string; date: string }[] = [];
    const queue: ScoreQueue = {
      add: (async (name: string, data: any) => {
        expect(name).toBe(COMPUTE_DAILY_SCORE_JOB);
        added.push({ userId: data.userId, date: data.date });
      }) as ScoreQueue['add'],
    };
    return { queue, added };
  }

  const setVersion = (userId: string, date: string, algorithmVersion: string, type?: 'RECOVERY' | 'SLEEP') =>
    prisma.dailyScore.updateMany({ where: { userId, date: day(date), ...(type ? { type } : {}) }, data: { algorithmVersion } });

  it('the sweep re-enqueues a day whose stored RECOVERY score is from an older version, even though its inputs are older than the score', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 3);
    for (const d of ['2026-08-03', '2026-08-04', '2026-08-05']) await computeDailyScore(user.id, d);
    // Baseline: everything current, nothing stale.
    const clean = fakeQueue();
    await runScoreSweep({ queue: clean.queue, now: NOW });
    expect(clean.added.filter((a) => a.userId === user.id)).toEqual([]);

    await setVersion(user.id, '2026-08-04', 'v1', 'RECOVERY');
    const { queue, added } = fakeQueue();
    await runScoreSweep({ queue, now: NOW });

    expect(added.filter((a) => a.userId === user.id).map((a) => a.date)).toEqual(['2026-08-04']);
  });

  it('the sweep re-enqueues a day whose stored SLEEP score alone is from an older version', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 2);
    for (const d of ['2026-08-03', '2026-08-04']) await computeDailyScore(user.id, d);

    await setVersion(user.id, '2026-08-03', 'v1', 'SLEEP');
    const { queue, added } = fakeQueue();
    await runScoreSweep({ queue, now: NOW });

    expect(added.filter((a) => a.userId === user.id).map((a) => a.date)).toEqual(['2026-08-03']);
  });

  it('a day scored under the live version is not stale', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 2);
    for (const d of ['2026-08-03', '2026-08-04']) await computeDailyScore(user.id, d);
    const rows = await prisma.dailyScore.findMany({ where: { userId: user.id } });
    expect(rows.every((r) => r.algorithmVersion === LIVE)).toBe(true);

    const { queue, added } = fakeQueue();
    await runScoreSweep({ queue, now: NOW });
    expect(added.filter((a) => a.userId === user.id)).toEqual([]);
  });

  it('the compute job overwrites a v1-scored day with the live version (RECOVERY, SLEEP, features, baselines)', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, '2026-06-01', 45);
    await seedSessions(user.id, '2026-06-01', 45);
    await computeDailyScore(user.id, last);
    await prisma.dailyScore.updateMany({ where: { userId: user.id }, data: { algorithmVersion: 'v1' } });
    await prisma.userDailyFeatures.updateMany({ where: { userId: user.id }, data: { algorithmVersion: 'v1' } });
    await prisma.baselineSnapshot.updateMany({ where: { userId: user.id }, data: { algorithmVersion: 'v1' } });

    expect(await computeDailyScore(user.id, last)).toBe('scored');

    const scores = await prisma.dailyScore.findMany({ where: { userId: user.id, date: day(last) } });
    expect(scores.map((s) => s.type).sort()).toEqual(['RECOVERY', 'SLEEP']);
    expect(scores.every((s) => s.algorithmVersion === LIVE)).toBe(true);
    const features = await prisma.userDailyFeatures.findUnique({ where: { userId_date: { userId: user.id, date: day(last) } } });
    expect(features!.algorithmVersion).toBe(LIVE);
    const snapshots = await prisma.baselineSnapshot.findMany({ where: { userId: user.id, date: day(last) } });
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every((s) => s.algorithmVersion === LIVE)).toBe(true);
  });

  it('end to end: after the sweep has run the jobs, no day is stale and the Sleep Score reflects the v2 weights', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, '2026-06-20', 45);
    await seedSessions(user.id, '2026-06-20', 45);
    await computeDailyScore(user.id, last);
    await prisma.dailyScore.updateMany({ where: { userId: user.id }, data: { algorithmVersion: 'v1' } });

    const inline: ScoreQueue = {
      add: (async (_name: string, data: any) => {
        if (data.userId === user.id) await computeDailyScore(data.userId, data.date);
      }) as ScoreQueue['add'],
    };
    await runScoreSweep({ queue: inline, now: NOW });

    const sleep = (await prisma.dailyScore.findUnique({ where: { userId_date_type: { userId: user.id, date: day(last), type: 'SLEEP' } } }))!;
    expect(sleep.algorithmVersion).toBe(LIVE);
    const weights = Object.fromEntries((sleep.factors as any[]).map((f) => [f.factor, f.weight]));
    expect(weights.SLEEP_DURATION).toBeCloseTo(0.5, 9);
    expect(weights.SLEEP_EFFICIENCY).toBeCloseTo(0.3, 9);
    expect(weights.CIRCADIAN_CONSISTENCY).toBeCloseTo(0.2, 9);

    const again = fakeQueue();
    await runScoreSweep({ queue: again.queue, now: NOW });
    expect(again.added.filter((a) => a.userId === user.id)).toEqual([]);
  });
});
