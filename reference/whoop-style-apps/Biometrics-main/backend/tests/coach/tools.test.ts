import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { getHabitCorrelations, getScoreHistory, getUserGoals } from '../../src/coach/tools';
import { compareScores, getDailyScore } from '../../src/coach/tools/dailyScore';
import { computeTrend, describeChange, getDailyMetrics, getMetricHistory } from '../../src/coach/tools/metrics';
import { createUser, daysAgo, putScore, todayUtc } from './helpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Calls the reader the fact sheet uses, defaulting the date to today as the old registry did. */
async function run(userId: string, name: string, args: unknown): Promise<any> {
  const a = (args ?? {}) as Record<string, any>;
  const today = todayUtc();
  switch (name) {
    case 'getDailyScore':
      return getDailyScore(userId, a.date ?? today);
    case 'getDailyMetrics':
      return getDailyMetrics(userId, a.date ?? today);
    case 'getScoreHistory':
      return getScoreHistory(userId, a.metric, a.days, today);
    case 'getMetricHistory':
      return getMetricHistory(userId, a.metric, a.days, today);
    case 'getHabitCorrelations':
      return getHabitCorrelations(userId);
    case 'getUserGoals':
      return getUserGoals(userId);
    default:
      throw new Error(`no reader named ${name}`);
  }
}

async function putRecord(userId: string, metricType: 'STEPS' | 'RESTING_HR' | 'HRV' | 'SLEEP', date: string, value: number) {
  await prisma.biometricRecord.create({ data: { userId, metricType, value, recordedAt: civilDateToUtcMidnight(date) } });
}

describe('getDailyMetrics', () => {
  it("returns the day's raw readings with display strings, goals and deltas PRECOMPUTED server-side", async () => {
    const user = await createUser({ sleepGoalMinutes: 480 });
    await putRecord(user.id, 'STEPS', daysAgo(1), 8000);
    await putRecord(user.id, 'STEPS', todayUtc(), 12345.6);
    await putRecord(user.id, 'RESTING_HR', daysAgo(1), 60);
    await putRecord(user.id, 'RESTING_HR', todayUtc(), 58.4);
    await putRecord(user.id, 'HRV', todayUtc(), 42.36);
    await putRecord(user.id, 'SLEEP', todayUtc(), 432);

    const r = await run(user.id, 'getDailyMetrics', {});

    expect(r.date).toBe(todayUtc());
    expect(r.steps).toEqual({
      value: 12346,
      display: '12,346 steps',
      deltaFromYesterday: 4346,
      direction: 'higher',
      changeDisplay: '4,346 more steps than the day before',
      goal: 10000,
      percentOfGoal: 123,
      percentOfGoalDisplay: '123%',
      goalMet: true,
    });
    expect(r.restingHeartRate).toEqual({
      value: 58,
      display: '58 bpm',
      deltaFromYesterday: -2,
      direction: 'lower',
      changeDisplay: '2 bpm lower than the day before',
    });
    // No HRV yesterday: nothing honest to compare against.
    expect(r.hrv).toEqual({ value: 42.4, display: '42.4 ms', deltaFromYesterday: null, direction: null, changeDisplay: null });
    expect(r.sleep).toMatchObject({ value: 432, display: '7h 12m', goalMinutes: 480, goalDisplay: '8h 0m', percentOfGoal: 90 });
  });

  it('reports an unrecorded day as nulls rather than zeros', async () => {
    const user = await createUser();
    const r = await run(user.id, 'getDailyMetrics', { date: daysAgo(3) });
    expect(r.steps).toMatchObject({ value: null, display: null, percentOfGoal: null, goalMet: null });
    expect(r.sleep).toMatchObject({ value: null, percentOfGoal: null });
  });
});

describe('getMetricHistory', () => {
  it('returns the window oldest first with average, highest, lowest and steps days-at-goal precomputed', async () => {
    const user = await createUser();
    await putRecord(user.id, 'STEPS', daysAgo(10), 99999); // outside a 7-day window
    await putRecord(user.id, 'STEPS', daysAgo(2), 6000);
    await putRecord(user.id, 'STEPS', daysAgo(1), 11000);
    await putRecord(user.id, 'STEPS', todayUtc(), 13000);

    const r = await run(user.id, 'getMetricHistory', { metric: 'STEPS', days: 7 });

    expect(r.points.map((p: { date: string }) => p.date)).toEqual([daysAgo(2), daysAgo(1), todayUtc()]);
    expect(r).toMatchObject({
      metric: 'STEPS',
      days: 7,
      daysWithData: 3,
      average: 10000,
      averageDisplay: '10,000 steps',
      highest: { date: todayUtc(), value: 13000, display: '13,000 steps' },
      lowest: { date: daysAgo(2), value: 6000 },
      earliest: { date: daysAgo(2), value: 6000 },
      latest: { date: todayUtc(), value: 13000, display: '13,000 steps' },
      trend: 'up',
      daysAtGoal: 2,
    });
  });

  // Final review I5: a 0 sleep, HRV or resting HR reading is "not recorded", so it must not drag the
  // usual, the trend or the week's shortest night down. A day with 0 steps is a real (if idle) day.
  it.each(['SLEEP', 'HRV', 'RESTING_HR'] as const)('skips 0 readings for %s', async (metric) => {
    const user = await createUser();
    await putRecord(user.id, metric, daysAgo(3), 0);
    await putRecord(user.id, metric, daysAgo(2), 60);
    await putRecord(user.id, metric, daysAgo(1), 0);
    await putRecord(user.id, metric, todayUtc(), 40);
    const r = await run(user.id, 'getMetricHistory', { metric, days: 7 });
    expect(r.points.map((p: { value: number }) => p.value)).toEqual([60, 40]);
    expect(r).toMatchObject({ daysWithData: 2, average: 50, lowest: { value: 40 }, coverageDisplay: '2 of 7' });
  });

  it('keeps 0-step days', async () => {
    const user = await createUser();
    await putRecord(user.id, 'STEPS', daysAgo(1), 0);
    await putRecord(user.id, 'STEPS', todayUtc(), 4000);
    const r = await run(user.id, 'getMetricHistory', { metric: 'STEPS', days: 7 });
    expect(r).toMatchObject({ daysWithData: 2, average: 2000, lowest: { value: 0 } });
  });

  it('omits daysAtGoal for non-step metrics', async () => {
    const user = await createUser();
    await putRecord(user.id, 'HRV', todayUtc(), 40);
    const r = await run(user.id, 'getMetricHistory', { metric: 'HRV', days: 90 });
    expect(r.days).toBe(90);
    expect(r.daysAtGoal).toBeUndefined();
    expect(r.average).toBe(40);
  });
});

describe('describeChange', () => {
  it('phrases the day-over-day change per metric so the model never pairs a sign with a direction word', () => {
    expect(describeChange('SLEEP', -145)).toBe('2h 25m less than the night before');
    expect(describeChange('SLEEP', 30)).toBe('0h 30m more than the night before');
    expect(describeChange('STEPS', -1200)).toBe('1,200 fewer steps than the day before');
    expect(describeChange('HRV', 3.14)).toBe('3.1 ms higher than the day before');
    expect(describeChange('RESTING_HR', 0)).toBe('the same as the day before');
    expect(describeChange('RESTING_HR', null)).toBeNull();
  });
});

describe('computeTrend', () => {
  it('compares second-half and first-half averages with a steady band', () => {
    // HRV 65.9, 78.1 | 69.8, 62.2: halves average 72.0 and 66.0 -> down 8%.
    expect(computeTrend([65.9, 78.1, 69.8, 62.2])).toEqual({ trend: 'down', trendPercent: -8 });
    // Halves average 100.5 and 101: +0.5%, inside the steady band.
    expect(computeTrend([100, 101, 100, 102])).toEqual({ trend: 'steady', trendPercent: 0 });
    expect(computeTrend([10, 20, 30])).toEqual({ trend: 'up', trendPercent: 200 });
    expect(computeTrend([50])).toEqual({ trend: null, trendPercent: null });
  });
});

describe('getDailyScore', () => {
  it('returns scores, factors and confidence with deltaFromYesterday and direction PRECOMPUTED server-side', async () => {
    const user = await createUser();
    await putScore(user.id, daysAgo(1), 75);
    await putScore(user.id, todayUtc(), 72.34);
    await putScore(user.id, daysAgo(1), 60, 'SLEEP');
    await putScore(user.id, todayUtc(), 66, 'SLEEP');

    const r = await run(user.id, 'getDailyScore', { date: todayUtc() });

    expect(Object.keys(r).sort()).toEqual(
      [
        'changeDisplay',
        'confidence',
        'date',
        'deltaFromYesterday',
        'direction',
        'factors',
        'factorsByKey',
        'recoveryScore',
        'sleepChangeDisplay',
        'sleepDeltaFromYesterday',
        'sleepDirection',
        'sleepScore',
      ].sort(),
    );
    expect(r).toMatchObject({
      date: todayUtc(),
      recoveryScore: 72.3,
      sleepScore: 66,
      confidence: 'HIGH',
      deltaFromYesterday: -2.7,
      direction: 'lower',
      sleepDeltaFromYesterday: 6,
      sleepDirection: 'higher',
    });
    expect(r.factors).toHaveLength(3);
    expect(r.factors[0]).toMatchObject({ type: 'RECOVERY', factor: 'HRV', label: 'HRV', excluded: false });
  });

  // factors[] is built by skipping a score row that does not exist, so its
  // indices move. A grounding reference must be able to name a factor instead.
  it('keys every factor by its stable FactorKey, so a missing RECOVERY row cannot shift SLEEP factors', async () => {
    // putScore only attaches factors to a RECOVERY row, so the SLEEP rows here
    // are written directly with their own.
    const sleepFactors = [
      { factor: 'SLEEP_DURATION', z: 0.4, weight: 0.5, contribution: 0.2, points: 5, imputed: false, excluded: false },
      { factor: 'SLEEP_EFFICIENCY', z: -0.2, weight: 0.5, contribution: -0.1, points: -2, imputed: false, excluded: false },
    ];
    const putSleep = (userId: string) =>
      prisma.dailyScore.create({
        data: {
          userId,
          date: civilDateToUtcMidnight(todayUtc()),
          type: 'SLEEP',
          algorithmVersion: 'v1',
          score: 66,
          confidenceLevel: 'HIGH',
          factors: sleepFactors as any,
        },
      });

    const both = await createUser();
    await putScore(both.id, todayUtc(), 72);
    await putSleep(both.id);
    const withRecovery = await run(both.id, 'getDailyScore', { date: todayUtc() });

    const sleepOnly = await createUser();
    await putSleep(sleepOnly.id);
    const withoutRecovery = await run(sleepOnly.id, 'getDailyScore', { date: todayUtc() });

    // The positional view genuinely moves: this is the bug the key map exists for.
    expect(withRecovery.factors[0].factor).toBe('HRV');
    expect(withoutRecovery.factors[0].factor).toBe('SLEEP_DURATION');

    // The keyed view does not.
    expect(withRecovery.factorsByKey.SLEEP_DURATION).toMatchObject({ type: 'SLEEP', factor: 'SLEEP_DURATION', points: 5 });
    expect(withoutRecovery.factorsByKey.SLEEP_DURATION).toMatchObject({ type: 'SLEEP', factor: 'SLEEP_DURATION', points: 5 });
    expect(withRecovery.factorsByKey.HRV).toMatchObject({ type: 'RECOVERY', factor: 'HRV' });
    expect(withoutRecovery.factorsByKey.HRV).toBeUndefined();
  });

  it('direction is "higher", "lower" or "unchanged" from the sign of the delta', () => {
    expect(compareScores(80, 70)).toEqual({ delta: 10, direction: 'higher' });
    expect(compareScores(70, 80)).toEqual({ delta: -10, direction: 'lower' });
    expect(compareScores(70, 70)).toEqual({ delta: 0, direction: 'unchanged' });
    expect(compareScores(70.04, 70)).toEqual({ delta: 0, direction: 'unchanged' });
    expect(compareScores(72.3, 75)).toEqual({ delta: -2.7, direction: 'lower' });
  });

  it('has a null delta and direction when there is no comparable yesterday, and nulls when there is no score', async () => {
    const user = await createUser();
    await putScore(user.id, todayUtc(), 70);
    const r = await run(user.id, 'getDailyScore', { date: todayUtc() });
    expect(r).toMatchObject({ recoveryScore: 70, deltaFromYesterday: null, direction: null });

    const empty = await createUser();
    const none = await run(empty.id, 'getDailyScore', {});
    expect(none).toMatchObject({ date: todayUtc(), recoveryScore: null, sleepScore: null, confidence: null, factors: [], direction: null });
  });

  it('defaults to today and only ever reads the caller\'s own rows', async () => {
    const a = await createUser();
    const b = await createUser();
    await putScore(a.id, todayUtc(), 88);
    expect((await run(b.id, 'getDailyScore', {})).recoveryScore).toBeNull();
    expect((await run(a.id, 'getDailyScore', undefined)).recoveryScore).toBe(88);
  });
});

describe('getScoreHistory', () => {
  it('returns oldest-first points over the window with precomputed average, highest and lowest', async () => {
    const user = await createUser();
    for (const [n, s] of [[5, 50], [3, 60], [2, 70], [1, 80], [0, 90]] as const) await putScore(user.id, daysAgo(n), s);
    await putScore(user.id, daysAgo(4), null); // cold-start row: not a data point
    await putScore(user.id, daysAgo(2), 10, 'SLEEP'); // other metric

    const r = await run(user.id, 'getScoreHistory', { metric: 'RECOVERY', days: 4 });

    expect(r.points).toEqual([
      { date: daysAgo(3), score: 60 },
      { date: daysAgo(2), score: 70 },
      { date: daysAgo(1), score: 80 },
      { date: todayUtc(), score: 90 },
    ]);
    expect(r).toMatchObject({ metric: 'RECOVERY', days: 4, average: 75, highest: 90, lowest: 60 });
  });

  it('returns nulls, not zeros, for an empty window', async () => {
    const user = await createUser();
    const r = await run(user.id, 'getScoreHistory', { metric: 'SLEEP', days: 30 });
    expect(r).toMatchObject({ points: [], average: null, highest: null, lowest: null, days: 30 });
  });
});

describe('getHabitCorrelations', () => {
  async function seedCorrelation(userId: string, habitType: string, status: 'CANDIDATE' | 'CONFIRMED' | 'RETIRED', factor = 'HRV') {
    return prisma.habitCorrelation.create({
      data: {
        userId,
        habitType,
        factor,
        lagDays: 1,
        status,
        lastEvaluatedAt: new Date(),
        lastRunKey: '2026-W38',
        r: -0.5,
        pValue: 0.01,
        qValue: 0.02,
        effectSizePercent: 12.5,
        comparisonPercent: 40,
        sampleSize: 30,
        direction: 'lower',
        series: { points: [] },
      },
    });
  }

  it('returns only CONFIRMED correlations as structured fields, never a sentence or raw logs or the series', async () => {
    const user = await createUser();
    await seedCorrelation(user.id, 'ALCOHOL', 'CONFIRMED');
    await seedCorrelation(user.id, 'CAFFEINE', 'CANDIDATE');
    await seedCorrelation(user.id, 'WORKOUT', 'RETIRED');
    await prisma.habitLog.create({
      data: { userId: user.id, habitType: 'ALCOHOL', value: 3, unit: 'drinks', loggedAt: new Date(), habitDay: new Date(`${todayUtc()}T00:00:00Z`), note: 'secret note' },
    });

    const r = await run(user.id, 'getHabitCorrelations', {});

    expect(r.correlations).toHaveLength(1);
    expect(Object.keys(r.correlations[0]).sort()).toEqual(
      [
        'comparisonPercent',
        'direction',
        'effectSizePercent',
        'exposureThreshold',
        'exposureUnit',
        'factor',
        'habitLabel',
        'habitType',
        'lagDays',
        'sampleSize',
      ].sort(),
    );
    expect(r.correlations[0]).toMatchObject({
      habitType: 'ALCOHOL',
      habitLabel: 'Alcohol',
      exposureThreshold: 2,
      exposureUnit: 'drinks',
      factor: 'HRV',
      lagDays: 1,
      effectSizePercent: 12.5,
      comparisonPercent: 40,
      sampleSize: 30,
      direction: 'lower',
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('secret note');
    expect(blob).not.toContain('series');
    for (const v of Object.values(r.correlations[0])) {
      expect(typeof v === 'string' ? v.split(' ').length : 1).toBeLessThan(3); // no composed sentence
    }
  });

  it('is empty when nothing is confirmed, and scoped to the caller', async () => {
    const a = await createUser();
    const b = await createUser();
    await seedCorrelation(a.id, 'ALCOHOL', 'CONFIRMED');
    expect((await run(b.id, 'getHabitCorrelations', {})).correlations).toEqual([]);
  });
});

describe('getUserGoals', () => {
  it('reads the sleep goal from the same source scoring uses, with hours precomputed', async () => {
    const user = await createUser({ sleepGoalMinutes: 450 });
    expect(await run(user.id, 'getUserGoals', {})).toEqual({ sleepGoalMinutes: 450, sleepGoalHours: 7.5 });
    const dflt = await createUser();
    expect(await run(dflt.id, 'getUserGoals', {})).toEqual({ sleepGoalMinutes: 480, sleepGoalHours: 8 });
  });
});
