import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import * as analysis from '../../src/habits/analysis';
import * as engine from '../../src/habits/engine';
import * as stats from '../../src/habits/stats';
import { habitDayFor } from '../../src/habits/habitDay';
import { shiftDate } from '../../src/scoring/dates';
import { authed, createUser, seedScenario } from './dbHelpers';
import { dateAt } from './helpers';
import { testServer } from '../helpers/server';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

const app = createApp();

// Same fixed window as job.test.ts: 90 observed habit days from START, and a "now" just after.
const START = '2026-04-01';
const NOW = new Date('2026-06-30T12:00:00Z');

async function parity(userId: string) {
  const light = await analysis.computeNotEnoughData(userId, NOW);
  const full = (await analysis.analyzeUser(userId, NOW)).notEnoughData;
  expect(light).toEqual(full);
  return light;
}

async function seedHabit(userId: string, habitType: string, days: string[], exposedIdx: Set<number>, withFactor = true) {
  await prisma.habitLog.createMany({
    data: days.map((d, i) => ({
      userId,
      habitType,
      value: exposedIdx.has(i) ? 5 : 0,
      unit: 'x',
      loggedAt: new Date(`${d}T20:00:00Z`),
      habitDay: civilDateToUtcMidnight(d),
    })),
  });
  if (!withFactor) return;
  await prisma.userDailyFeatures.createMany({
    data: days.map((d, i) => ({
      userId,
      date: civilDateToUtcMidnight(shiftDate(d, 1)),
      algorithmVersion: 'v1',
      hrvZ: Math.sin(i * 1.7),
      hrvBaselineDeviationPct: 1,
    })),
    skipDuplicates: true,
  });
}

describe('computeNotEnoughData: parity with analyzeUser', () => {
  it('is empty for a user with nothing', async () => {
    const user = await createUser();
    expect(await parity(user.id)).toEqual([]);
  });

  it('is empty for a habit that clears the gate (testable), exactly as analyzeUser reports', async () => {
    const user = await createUser();
    await seedScenario(user.id, { start: START, days: 90, seed: 7, effect: -1.6 });
    expect(await parity(user.id)).toEqual([]);
  });

  it('matches on a habit short of the gate, and reports the best-lag counts', async () => {
    const user = await createUser();
    const days = Array.from({ length: 12 }, (_, i) => dateAt('2026-06-01', i));
    await seedHabit(user.id, 'ALCOHOL', days, new Set([0, 1, 2]));
    const out = await parity(user.id);
    expect(out).toEqual([{ habitType: 'ALCOHOL', exposedDays: 3, unexposedDays: 9, requiredEach: 8 }]);
  });

  it('matches when only some habits are short of the gate (mixed types, custom type included)', async () => {
    const user = await createUser();
    await seedScenario(user.id, { start: START, days: 90, seed: 11, effect: -1.2, habitType: 'ALCOHOL' });
    const days = Array.from({ length: 20 }, (_, i) => dateAt('2026-06-01', i));
    await seedHabit(user.id, 'CAFFEINE', days, new Set([2, 9]));
    await prisma.habitType.create({ data: { userId: user.id, type: 'CUSTOM_SAUNA', label: 'Sauna', unit: 'x', exposureThreshold: 1 } });
    await seedHabit(user.id, 'CUSTOM_SAUNA', days.slice(0, 10), new Set([0, 1, 2, 3]), false);
    const out = await parity(user.id);
    expect(out.map((o) => o.habitType).sort()).toEqual(['CAFFEINE', 'CUSTOM_SAUNA']);
  });

  it('matches when there are no unexposed observed days (missing days are not "none")', async () => {
    const user = await createUser();
    await seedScenario(user.id, { start: START, days: 90, seed: 7, effect: -1.6 });
    await prisma.habitLog.deleteMany({ where: { userId: user.id, value: 0 } });
    const out = await parity(user.id);
    expect(out[0]).toMatchObject({ habitType: 'ALCOHOL', unexposedDays: 0, requiredEach: 8 });
  });

  it('matches when factor days are imputed or null (they are dropped from pairing)', async () => {
    const user = await createUser();
    await seedScenario(user.id, { start: START, days: 40, seed: 3, effect: 0 });
    await prisma.userDailyFeatures.updateMany({
      where: { userId: user.id, date: { gte: civilDateToUtcMidnight(dateAt(START, 5)), lte: civilDateToUtcMidnight(dateAt(START, 30)) } },
      data: { hrvZImputed: true },
    });
    await prisma.userDailyFeatures.updateMany({
      where: { userId: user.id, date: { gt: civilDateToUtcMidnight(dateAt(START, 30)) } },
      data: { hrvZ: null },
    });
    const out = await parity(user.id);
    expect(out).toHaveLength(1);
  });

  it('matches when the habit is observed but no factor series exists at all', async () => {
    const user = await createUser();
    const days = Array.from({ length: 10 }, (_, i) => dateAt('2026-06-01', i));
    await seedHabit(user.id, 'ALCOHOL', days, new Set([0, 1]), false);
    expect(await parity(user.id)).toEqual([{ habitType: 'ALCOHOL', exposedDays: 0, unexposedDays: 0, requiredEach: 8 }]);
  });
});

describe('GET /me/habits/patterns no longer runs the statistics', () => {
  const todayUtc = () => habitDayFor(new Date(), 'UTC');

  afterEach(() => jest.restoreAllMocks());

  const spies = () => ({
    analyzeUser: jest.spyOn(analysis, 'analyzeUser'),
    analyzeHabits: jest.spyOn(engine, 'analyzeHabits'),
    pearson: jest.spyOn(stats, 'pearson'),
    correlationPValue: jest.spyOn(stats, 'correlationPValue'),
    benjaminiHochberg: jest.spyOn(stats, 'benjaminiHochberg'),
  });

  it('never calls analyzeUser, the engine or any statistical function, on data that WOULD be testable', async () => {
    const user = await createUser();
    await seedScenario(user.id, { start: shiftDate(todayUtc(), -60), days: 50, seed: 7, effect: -1.6 });
    const s = spies();

    const res = await request(await testServer(app)).get('/me/habits/patterns').set(await authed(user.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ patterns: [], notEnoughData: [] });
    for (const [name, spy] of Object.entries(s)) expect([name, spy.mock.calls.length]).toEqual([name, 0]);

    // Control: the same spies DO fire on the stats path, so the zero above is meaningful.
    await analysis.analyzeUser(user.id, new Date());
    expect(s.analyzeHabits.mock.calls.length).toBeGreaterThan(0);
    expect(s.pearson.mock.calls.length).toBeGreaterThan(0);
  });

  it('never surfaces CANDIDATE (or RETIRED) rows, only reads CONFIRMED ones, and returns the live counts', async () => {
    const user = await createUser();
    const today = todayUtc();
    const days = Array.from({ length: 12 }, (_, i) => shiftDate(today, -14 + i));
    await seedHabit(user.id, 'ALCOHOL', days, new Set([0, 1, 2]));
    const base = {
      userId: user.id,
      habitType: 'ALCOHOL',
      lagDays: 1,
      consecutivePasses: 1,
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
      series: { days: [], habit: [], factor: [] },
    };
    await prisma.habitCorrelation.createMany({
      data: [
        { ...base, factor: 'HRV', status: 'CANDIDATE' },
        { ...base, factor: 'RHR', status: 'RETIRED' },
      ] as any,
    });
    const findMany = jest.spyOn(prisma.habitCorrelation, 'findMany');

    const res = await request(await testServer(app)).get('/me/habits/patterns').set(await authed(user.id));

    expect(res.body.patterns).toEqual([]);
    expect(res.body.notEnoughData).toEqual([{ habitType: 'ALCOHOL', exposedDays: 3, unexposedDays: 9, requiredEach: 8 }]);
    expect(findMany.mock.calls.length).toBeGreaterThan(0);
    for (const [args] of findMany.mock.calls) expect((args as any).where.status).toBe('CONFIRMED');
  });

  it('keeps the counts live: logging "nothing today" moves the unexposed count immediately, without a weekly run', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const today = todayUtc();
    const days = Array.from({ length: 12 }, (_, i) => shiftDate(today, -15 + i));
    await seedHabit(user.id, 'ALCOHOL', days, new Set([0, 1, 2]));
    // A factor value for the night after a not-yet-logged day (-3 -> factor on -2 is present via seedHabit shift; use -3).
    const extra = shiftDate(today, -3);
    await prisma.userDailyFeatures.create({
      data: { userId: user.id, date: civilDateToUtcMidnight(shiftDate(extra, 1)), algorithmVersion: 'v1', hrvZ: 0.4, hrvBaselineDeviationPct: 1 },
    });

    const before = await request(await testServer(app)).get('/me/habits/patterns').set(h);
    expect(before.body.notEnoughData).toEqual([{ habitType: 'ALCOHOL', exposedDays: 3, unexposedDays: 9, requiredEach: 8 }]);

    const check = await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: extra });
    expect(check.status).toBe(201);

    const after = await request(await testServer(app)).get('/me/habits/patterns').set(h);
    // (A check-in makes every habit type observed for that day, so the built-ins appear too.)
    expect(after.body.notEnoughData.find((n: any) => n.habitType === 'ALCOHOL')).toEqual({
      habitType: 'ALCOHOL',
      exposedDays: 3,
      unexposedDays: 10,
      requiredEach: 8,
    });
  });
});
