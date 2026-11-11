import { getLiveConfig, getScoreConfig, LIVE_VERSION, SCORE_CONFIGS } from '../../src/scoring/configs';
import { v1Config } from '../../src/scoring/configs/v1';
import { v2Config } from '../../src/scoring/configs/v2';
import { v3Config } from '../../src/scoring/configs/v3';
import { sleepDurationZRawVsGoal, sleepDurationZVsGoal, zScore } from '../../src/scoring/baseline';
import { computeComposite, logistic } from '../../src/scoring/composite';
import { scoreDay, PipelineInput } from '../../src/scoring/pipeline';
import { computeDailyScore } from '../../src/scoring/compute';
import { toDailyScoreDTO } from '../../src/scoring/dto';
import { runScoreSweep } from '../../src/scoring/sweep';
import { COMPUTE_DAILY_SCORE_JOB, ScoreQueue } from '../../src/scoring/queue';
import { shiftDate } from '../../src/scoring/dates';
import type { Baseline, DailyPoint, FactorInput, SleepSessionInput } from '../../src/scoring/types';
import { rescoreUser, parseArgs } from '../../scripts/rescoreUser';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser, seedHistory, seedSessions, day } from './dbHelpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const ready = (ewma: number, spread: number): Baseline => ({ coldStart: false, daysOfHistory: 30, ewma, spread, mad: spread / 1.4826 });

describe('score config v3 (z clamp + per-metric spread floors)', () => {
  it('is the live version, registered next to v1 and v2', () => {
    expect(LIVE_VERSION).toBe('v3');
    expect(getLiveConfig()).toBe(v3Config);
    expect(getScoreConfig('v3')).toBe(v3Config);
    expect(getScoreConfig('v2')).toBe(v2Config);
    expect(getScoreConfig('v1')).toBe(v1Config);
    expect(Object.keys(SCORE_CONFIGS).sort()).toEqual(['v1', 'v2', 'v3']);
  });

  it('declares zClamp [-3, +3] and the efficiency (0.05) and consistency (10 pts) floors, and no others', () => {
    expect(v3Config.version).toBe('v3');
    expect(v3Config.zClamp).toEqual({ min: -3, max: 3 });
    expect(v3Config.spreadFloors).toEqual({ SLEEP_EFFICIENCY: 0.05, CIRCADIAN_CONSISTENCY: 10 });
  });

  it('differs from v2 in ONLY the version, zClamp and spreadFloors (weights, k, thresholds, bands identical)', () => {
    const { version: _a, zClamp: _b, spreadFloors: _c, ...restV3 } = v3Config;
    const { version: _d, ...restV2 } = v2Config;
    expect(restV3).toEqual(restV2);
    expect(v3Config.sleepScore.weights).toEqual({ SLEEP_DURATION: 0.5, SLEEP_EFFICIENCY: 0.3, CIRCADIAN_CONSISTENCY: 0.2 });
    expect(v3Config.sleepScore.durationZClamp).toEqual({ min: -3, max: 1 });
    expect(v3Config.scoreBands).toEqual(v2Config.scoreBands);
    expect(v3Config.spreadFloorFraction).toBe(0.02);
  });

  it('leaves v1 and v2 untouched: neither has a clamp or floors', () => {
    for (const cfg of [v1Config, v2Config]) {
      expect(cfg.zClamp).toBeUndefined();
      expect(cfg.spreadFloors).toBeUndefined();
    }
    expect(v2Config.version).toBe('v2');
  });
});

describe('per-metric spread floors', () => {
  it('efficiency: baseline 0.98, one 0.90 night gives z ~ -1.6 under v3 (floor 0.05), not the unbounded v2 value', () => {
    const b = ready(0.98, 0.005);
    expect(zScore(0.9, b, v3Config, 'SLEEP_EFFICIENCY')).toBeCloseTo(-1.6, 9);
    // v2: only the 2%-of-mean floor (0.0196) applies.
    expect(zScore(0.9, b, v2Config, 'SLEEP_EFFICIENCY')!).toBeLessThan(-3.5);
  });

  it('bedtime consistency: baseline 45.6 vs 27 gives z ~ -1.9 under v3 (floor 10), before the clamp is even needed', () => {
    const b = ready(45.6, 3);
    const z = zScore(27, b, v3Config, 'CIRCADIAN_CONSISTENCY')!;
    expect(z).toBeCloseTo(-1.86, 2);
    expect(Math.abs(z)).toBeLessThan(3);
    expect(zScore(27, b, v2Config, 'CIRCADIAN_CONSISTENCY')!).toBeLessThan(-6);
  });

  it('keeps the relative floor: a spread above every floor is used as is, and the relative floor still binds when it is the largest', () => {
    expect(zScore(0.8, ready(0.9, 0.2), v3Config, 'SLEEP_EFFICIENCY')).toBeCloseTo(-0.5, 9); // sigma-hat 0.2 > 0.05
    expect(zScore(150, ready(500, 1), v3Config, 'CIRCADIAN_CONSISTENCY')).toBeCloseTo(-35, 9); // 2% of 500 = 10 == floor: (150-500)/10
    expect(zScore(200, ready(1000, 1), v3Config, 'CIRCADIAN_CONSISTENCY')).toBeCloseTo(-40, 9); // 2% of 1000 = 20 > floor 10
  });

  it('leaves metrics without a floor unchanged, with or without the metric argument', () => {
    const b = ready(50, 0.2);
    for (const metric of ['HRV', 'RESTING_HR', 'SLEEP', 'SLEEP_DEBT'] as const) {
      expect(zScore(45, b, v3Config, metric)).toBe(zScore(45, b, v2Config, metric));
      expect(zScore(45, b, v3Config, metric)).toBe(zScore(45, b, v3Config));
    }
    expect(zScore(45, b, v3Config, 'HRV')).toBeCloseTo(-5, 9); // 2% of 50 = 1.0
  });

  it('never applies a floor for the duration factor, whose sigma-hat comes from the SLEEP baseline', () => {
    const b = ready(450, 30);
    expect(sleepDurationZVsGoal(420, 480, b, v3Config)).toBe(sleepDurationZVsGoal(420, 480, b, v2Config));
    expect(sleepDurationZRawVsGoal(420, 480, { coldStart: true, daysOfHistory: 3 }, v3Config)).toBeNull();
  });
});

describe('z clamp in the composite', () => {
  const recovery = (z: { HRV: number; RHR: number; SLEEP_DEBT: number }): FactorInput[] =>
    (['HRV', 'RHR', 'SLEEP_DEBT'] as const).map((factor) => ({ factor, z: z[factor], imputed: false, excluded: false }));
  const sleep = (z: { SLEEP_DURATION: number; SLEEP_EFFICIENCY: number; CIRCADIAN_CONSISTENCY: number }, over: Partial<Record<keyof typeof z, Partial<FactorInput>>> = {}): FactorInput[] =>
    (['SLEEP_DURATION', 'SLEEP_EFFICIENCY', 'CIRCADIAN_CONSISTENCY'] as const).map((factor) => ({
      factor,
      z: z[factor],
      imputed: false,
      excluded: false,
      ...over[factor],
    }));

  it('clamps every Recovery factor beyond +/-3 and records the raw z', () => {
    const r = computeComposite(recovery({ HRV: -7, RHR: 8.5, SLEEP_DEBT: 3.5 }), v3Config);
    const by = Object.fromEntries(r.factors.map((f) => [f.factor, f]));
    expect(by.HRV).toMatchObject({ z: -3, zRaw: -7 });
    expect(by.RHR).toMatchObject({ z: 3, zRaw: 8.5 });
    expect(by.SLEEP_DEBT).toMatchObject({ z: 3, zRaw: 3.5 });
    // contribution = weight * direction * (clamped z), exactly.
    for (const f of r.factors) expect(f.contribution).toBe(f.weight * v3Config.direction[f.factor as 'HRV']! * f.z!);
    expect(r.score).toBeCloseTo(logistic(0.45 * -3 + 0.35 * -3 + 0.2 * -3, v3Config.k), 9);
  });

  it('clamps every Sleep factor beyond +/-3 (below and above) and records the raw z', () => {
    const low = computeComposite(sleep({ SLEEP_DURATION: -3, SLEEP_EFFICIENCY: -9, CIRCADIAN_CONSISTENCY: -6.1 }, { SLEEP_DURATION: { zRaw: -8 } }), v3Config, v3Config.sleepScore);
    const lowBy = Object.fromEntries(low.factors.map((f) => [f.factor, f]));
    expect(lowBy.SLEEP_DURATION).toMatchObject({ z: -3, zRaw: -8 });
    expect(lowBy.SLEEP_EFFICIENCY).toMatchObject({ z: -3, zRaw: -9 });
    expect(lowBy.CIRCADIAN_CONSISTENCY).toMatchObject({ z: -3, zRaw: -6.1 });

    const high = computeComposite(sleep({ SLEEP_DURATION: 1, SLEEP_EFFICIENCY: 4.2, CIRCADIAN_CONSISTENCY: 12 }), v3Config, v3Config.sleepScore);
    const highBy = Object.fromEntries(high.factors.map((f) => [f.factor, f]));
    expect(highBy.SLEEP_EFFICIENCY).toMatchObject({ z: 3, zRaw: 4.2 });
    expect(highBy.CIRCADIAN_CONSISTENCY).toMatchObject({ z: 3, zRaw: 12 });

    for (const f of [...low.factors, ...high.factors]) {
      expect(f.contribution).toBe(f.weight * v3Config.sleepScore.direction[f.factor as 'SLEEP_DURATION']! * f.z!);
    }
    expect(low.score).toBeCloseTo(logistic(-3, v3Config.k), 9); // every factor at -3, weights sum to 1
  });

  it('leaves values inside the clamp untouched, recording zRaw equal to z', () => {
    const r = computeComposite(recovery({ HRV: 2.9, RHR: -3, SLEEP_DEBT: 0.4 }), v3Config);
    for (const f of r.factors) expect(f.zRaw).toBe(f.z);
    expect(r.factors.map((f) => f.z)).toEqual([2.9, -3, 0.4]);
  });

  it("preserves duration's tighter [-3, +1] clamp: a global +/-3 clamp never widens it", () => {
    const r = computeComposite(
      sleep({ SLEEP_DURATION: 1, SLEEP_EFFICIENCY: 0, CIRCADIAN_CONSISTENCY: 0 }, { SLEEP_DURATION: { zRaw: 4 } }),
      v3Config,
      v3Config.sleepScore,
    );
    expect(r.factors[0]).toMatchObject({ factor: 'SLEEP_DURATION', z: 1, zRaw: 4 });
    // ...and through the real duration function: a night far past goal is +1, a very short one -3.
    const b = ready(450, 30);
    expect(sleepDurationZVsGoal(900, 480, b, v3Config)).toBe(1);
    expect(sleepDurationZRawVsGoal(900, 480, b, v3Config)!).toBeGreaterThan(10);
    expect(sleepDurationZVsGoal(0, 480, b, v3Config)).toBe(-3);
    expect(v3Config.sleepScore.durationZClamp).toEqual({ min: -3, max: 1 });
  });

  it('a config without a zClamp (v2) neither clamps nor records zRaw', () => {
    const r = computeComposite(recovery({ HRV: -7, RHR: 8.5, SLEEP_DEBT: 3.5 }), v2Config);
    expect(r.factors.map((f) => f.z)).toEqual([-7, 8.5, 3.5]);
    for (const f of r.factors) expect('zRaw' in f).toBe(false);
  });

  it('renormalises around an excluded factor AFTER clamping: weights still sum to 1 and use the clamped z', () => {
    const r = computeComposite(
      sleep({ SLEEP_DURATION: -1, SLEEP_EFFICIENCY: -9, CIRCADIAN_CONSISTENCY: 0 }, { CIRCADIAN_CONSISTENCY: { z: null, excluded: true } }),
      v3Config,
      v3Config.sleepScore,
    );
    const by = Object.fromEntries(r.factors.map((f) => [f.factor, f]));
    expect(by.CIRCADIAN_CONSISTENCY).toMatchObject({ excluded: true, z: null, weight: 0, contribution: 0 });
    expect(by.CIRCADIAN_CONSISTENCY!.zRaw).toBeUndefined();
    expect(by.SLEEP_DURATION!.weight).toBeCloseTo(0.5 / 0.8, 12);
    expect(by.SLEEP_EFFICIENCY!.weight).toBeCloseTo(0.3 / 0.8, 12);
    expect(r.factors.reduce((sum, f) => sum + f.weight, 0)).toBeCloseTo(1, 12);
    expect(by.SLEEP_EFFICIENCY).toMatchObject({ z: -3, zRaw: -9 });
    expect(by.SLEEP_EFFICIENCY!.contribution).toBeCloseTo((0.3 / 0.8) * -3, 12);
    expect(r.score).toBeCloseTo(logistic((0.5 / 0.8) * -1 + (0.3 / 0.8) * -3, v3Config.k), 9);
    expect(r.confidenceLevel).toBe('MEDIUM');
  });

  it('bounds the measured failure: a single -9 sigma efficiency night can no longer sink the Sleep Score', () => {
    const inputs = sleep({ SLEEP_DURATION: 0, SLEEP_EFFICIENCY: -9, CIRCADIAN_CONSISTENCY: 0 });
    const clamped = computeComposite(inputs, v3Config, v3Config.sleepScore).score!;
    const unclamped = computeComposite(inputs, v2Config, v2Config.sleepScore).score!;
    expect(clamped).toBeCloseTo(logistic(0.3 * -3, v3Config.k), 9);
    expect(clamped).toBeGreaterThan(25);
    expect(unclamped).toBeLessThan(15);
  });
});

// ---------------------------------------------------------------------------
// scoreDay-level behaviour: clamp end to end, and parity with v2.
// ---------------------------------------------------------------------------

const START = '2026-04-01';
const DAYS = 90;
const LAST = shiftDate(START, DAYS - 1);

function wave(base: number, amp: number, phase = 0, days = DAYS): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => ({ date: shiftDate(START, i), value: base + amp * Math.sin((i + phase) * 1.7) }));
}

/**
 * Night i ends on START + i (UTC). Efficiency swings widely (0.73-0.97) and the
 * bedtime alternates between regular and erratic 15-night blocks, so neither
 * baseline is tight enough for a v3 floor to bind. `lastNight` overrides the
 * final night's minutes asleep out of 420 in bed.
 */
function wideSessions(lastNightAsleep?: number): SleepSessionInput[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const regular = Math.floor(i / 15) % 2 === 0;
    const onset = regular ? 630 + 4 * Math.sin(i * 1.3) : 630 + 200 * Math.sin(i * 2.9);
    const noon = new Date(`${shiftDate(START, i - 1)}T12:00:00Z`).getTime();
    const startTime = new Date(noon + onset * 60_000);
    const asleep = i === DAYS - 1 && lastNightAsleep !== undefined ? lastNightAsleep : 420 * (0.85 + 0.12 * Math.sin(i * 1.9));
    return { startTime, endTime: new Date(startTime.getTime() + 420 * 60_000), minutesAsleep: asleep };
  });
}

function baseInput(over: Partial<PipelineInput> = {}): PipelineInput {
  return {
    date: LAST,
    hrv: wave(50, 4),
    rhr: wave(55, 2, 1),
    sleep: wave(450, 30, 2),
    steps: wave(8000, 1500, 3),
    sleepGoalMinutes: 480,
    sessions: wideSessions(),
    timezone: 'UTC',
    ...over,
  };
}

const spreadOf = (r: ReturnType<typeof scoreDay>, metric: string) => {
  const b = r.baselines.find((x) => x.metric === metric)!.baseline;
  return b.coldStart ? null : b.spread;
};

describe('scoreDay under v3', () => {
  it('clamps an extreme efficiency night end to end, storing the clamped z and the raw one', () => {
    const input = baseInput({ sessions: wideSessions(60) }); // 60 of 420 min asleep: ~0.14 efficiency
    const v3 = scoreDay(input, v3Config);
    const v2 = scoreDay(input, v2Config);

    const eff3 = v3.sleepScore!.factors.find((f) => f.factor === 'SLEEP_EFFICIENCY')!;
    const eff2 = v2.sleepScore!.factors.find((f) => f.factor === 'SLEEP_EFFICIENCY')!;
    expect(eff2.z!).toBeLessThan(-3);
    expect(eff3.z).toBe(-3);
    expect(eff3.zRaw!).toBeLessThan(-3);
    expect(eff3.contribution).toBeCloseTo(eff3.weight * -3, 12);
    expect(v3.sleepScore!.score!).toBeGreaterThan(v2.sleepScore!.score!);
    expect(v3.algorithmVersion).toBe('v3');
    // The stored feature z is the unclamped, floored one (the clamp acts on the factor vector).
    expect(v3.features.sleepEfficiencyZ).toBe(eff3.zRaw);
  });

  it("records duration's raw z beyond its [-3, +1] clamp as zRaw, with z staying inside it", () => {
    const long = scoreDay(baseInput({ sleep: [...wave(450, 30, 2).filter((p) => p.date !== LAST), { date: LAST, value: 900 }] }), v3Config);
    const dur = long.sleepScore!.factors.find((f) => f.factor === 'SLEEP_DURATION')!;
    expect(dur.z).toBe(1);
    expect(dur.zRaw!).toBeGreaterThan(3);
  });

  describe('parity with v2 when nothing is clamped and no floor binds', () => {
    const fixtures: [string, PipelineInput][] = [
      ['a normal day', baseInput()],
      ['a mildly poor night', baseInput({ sleep: [...wave(450, 30, 2).filter((p) => p.date !== LAST), { date: LAST, value: 400 }], sessions: wideSessions(330) })],
      ['a day whose HRV and RHR are missing (imputed)', baseInput({ hrv: wave(50, 4).filter((p) => p.date !== LAST), rhr: wave(55, 2, 1).filter((p) => p.date !== LAST) })],
      ['no sessions at all (efficiency and consistency excluded, weights renormalised)', baseInput({ sessions: [] })],
      ['a shifted goal', baseInput({ sleepGoalMinutes: 420 })],
    ];

    it.each(fixtures)('%s: Recovery and Sleep scores and factor vectors equal v2 exactly', (_name, input) => {
      const v2 = scoreDay(input, v2Config);
      const v3 = scoreDay(input, v3Config);

      // Preconditions: this fixture exercises neither new mechanism.
      for (const f of [...v3.factors, ...v3.sleepScore!.factors]) {
        if (f.excluded) continue;
        expect(Math.abs(f.zRaw!)).toBeLessThanOrEqual(3);
      }
      const effSpread = spreadOf(v3, 'SLEEP_EFFICIENCY');
      const circSpread = spreadOf(v3, 'CIRCADIAN_CONSISTENCY');
      if (effSpread !== null) {
        expect(effSpread).toBeGreaterThanOrEqual(0.05);
        expect(0.02 * Math.abs((v3.baselines.find((b) => b.metric === 'SLEEP_EFFICIENCY')!.baseline as { ewma: number }).ewma)).toBeLessThan(effSpread);
      }
      if (circSpread !== null) expect(circSpread).toBeGreaterThanOrEqual(10);
      if (input.sessions?.length === 0) {
        expect(v3.sleepScore!.factors.filter((f) => f.excluded).map((f) => f.factor).sort()).toEqual(['CIRCADIAN_CONSISTENCY', 'SLEEP_EFFICIENCY']);
      } else {
        expect(effSpread).not.toBeNull();
        expect(circSpread).not.toBeNull();
      }

      expect(v3.score).toBe(v2.score);
      expect(v3.confidenceLevel).toBe(v2.confidenceLevel);
      expect(v3.sleepScore!.score).toBe(v2.sleepScore!.score);
      expect(v3.sleepScore!.confidenceLevel).toBe(v2.sleepScore!.confidenceLevel);
      const strip = (fs: { zRaw?: number | null }[]) => fs.map(({ zRaw: _z, ...rest }) => rest);
      expect(strip(v3.factors)).toEqual(strip(v2.factors));
      expect(strip(v3.sleepScore!.factors)).toEqual(strip(v2.sleepScore!.factors));
      expect(v3.features).toEqual(v2.features);
    });
  });
});

// ---------------------------------------------------------------------------
// DB-backed: stale rescoring, DTO, rescoreUser.
// ---------------------------------------------------------------------------

describe('v3 rollout against the database', () => {
  beforeAll(() => {
    migrateTestDb();
  });

  const NOW = new Date('2026-08-10T12:00:00Z');

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

  it('the sweep treats v2 rows within its lookback as stale and enqueues them; v3 rows are not stale', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 3);
    for (const d of ['2026-08-03', '2026-08-04', '2026-08-05']) await computeDailyScore(user.id, d, { config: v2Config });
    expect((await prisma.dailyScore.findMany({ where: { userId: user.id } })).every((r) => r.algorithmVersion === 'v2')).toBe(true);

    const stale = fakeQueue();
    await runScoreSweep({ queue: stale.queue, now: NOW });
    expect(stale.added.filter((a) => a.userId === user.id).map((a) => a.date).sort()).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);

    const inline: ScoreQueue = {
      add: (async (_n: string, data: any) => {
        if (data.userId === user.id) await computeDailyScore(data.userId, data.date);
      }) as ScoreQueue['add'],
    };
    await runScoreSweep({ queue: inline, now: NOW });
    expect((await prisma.dailyScore.findMany({ where: { userId: user.id } })).every((r) => r.algorithmVersion === 'v3')).toBe(true);
    const fresh = fakeQueue();
    await runScoreSweep({ queue: fresh.queue, now: NOW });
    expect(fresh.added.filter((a) => a.userId === user.id)).toEqual([]);
  });

  it('does not enqueue a v2 row older than the sweep lookback', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-04-01', 2);
    for (const d of ['2026-04-01', '2026-04-02']) await computeDailyScore(user.id, d, { config: v2Config });
    const { queue, added } = fakeQueue();
    await runScoreSweep({ queue, now: NOW }); // 2026-08-10 minus 90 days is 2026-05-12
    expect(added.filter((a) => a.userId === user.id)).toEqual([]);
  });

  it('persists zRaw in the stored factor vector, and the DTO keeps its exact wire shape and shows the stored version', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, '2026-06-01', 45);
    await seedSessions(user.id, '2026-06-01', 45);
    await computeDailyScore(user.id, last);

    const sleepRow = (await prisma.dailyScore.findUnique({ where: { userId_date_type: { userId: user.id, date: day(last), type: 'SLEEP' } } }))!;
    const stored = sleepRow.factors as Array<Record<string, any>>;
    for (const f of stored) {
      expect(typeof f.zRaw).toBe('number');
      // Rounded contribution is not stored: it is exactly weight * direction(+1) * the clamped z.
      expect(f.contribution).toBeCloseTo(f.weight * f.z, 12);
      expect(Math.abs(f.z)).toBeLessThanOrEqual(3);
    }

    const dto = toDailyScoreDTO(sleepRow, []);
    expect(dto.algorithmVersion).toBe('v3');
    expect(Object.keys(dto).sort()).toEqual(['algorithmVersion', 'coldStart', 'confidenceLevel', 'date', 'factors', 'score', 'type']);
    for (const f of dto.factors) {
      const keys = ['contribution', 'excluded', 'factor', 'imputed', 'label', 'points', 'weight', 'z'];
      // SLEEP_DURATION also carries the sleep goal it was scored against (spec 2026-10-03 §2).
      expect(Object.keys(f).sort()).toEqual((f.factor === 'SLEEP_DURATION' ? [...keys, 'goalMinutes'] : keys).sort());
    }

    // A row written by v2 reports v2 (the DTO shows the stored row's version, not the live one).
    await prisma.dailyScore.update({ where: { id: sleepRow.id }, data: { algorithmVersion: 'v2' } });
    const v2Row = (await prisma.dailyScore.findUnique({ where: { id: sleepRow.id } }))!;
    expect(toDailyScoreDTO(v2Row, []).algorithmVersion).toBe('v2');
  });

  it('keeps the score bands identical to v2 on the live config', () => {
    expect(getLiveConfig().scoreBands).toEqual(v2Config.scoreBands);
    expect(getLiveConfig().scoreBands).toEqual({ excellent: 75, good: 55, fair: 40 });
  });

  describe('rescoreUser', () => {
    const NOW_R = new Date('2026-07-15T12:00:00Z'); // seedHistory(…'2026-06-01', 45) ends 2026-07-15

    it('recomputes the window under the live version, leaves older rows and the raw data alone, and is idempotent', async () => {
      const user = await createUser();
      const last = await seedHistory(user.id, '2026-06-01', 45);
      await seedSessions(user.id, '2026-06-01', 45);
      expect(last).toBe('2026-07-15');
      for (let i = 0; i < 45; i++) await computeDailyScore(user.id, shiftDate('2026-06-01', i), { config: v2Config });
      const recordsBefore = await prisma.biometricRecord.count({ where: { userId: user.id } });
      const sessionsBefore = await prisma.sleepSession.count({ where: { userId: user.id } });

      const summary = await rescoreUser(user.id, { days: 30, now: NOW_R });
      expect(summary).toEqual({ userId: user.id, daysProcessed: 30, rescored: 30, noInput: 0, versions: ['v3'] });

      const rows = await prisma.dailyScore.findMany({ where: { userId: user.id } });
      const inWindow = rows.filter((r) => r.date >= day('2026-06-16'));
      const before = rows.filter((r) => r.date < day('2026-06-16'));
      expect(inWindow.length).toBe(60); // RECOVERY + SLEEP for 30 days
      expect(inWindow.every((r) => r.algorithmVersion === 'v3')).toBe(true);
      expect(before.length).toBe(30);
      expect(before.every((r) => r.algorithmVersion === 'v2')).toBe(true);
      expect(await prisma.biometricRecord.count({ where: { userId: user.id } })).toBe(recordsBefore);
      expect(await prisma.sleepSession.count({ where: { userId: user.id } })).toBe(sessionsBefore);

      const snapshot = async () =>
        (await prisma.dailyScore.findMany({ where: { userId: user.id }, orderBy: [{ date: 'asc' }, { type: 'asc' }] })).map(
          ({ date, type, score, algorithmVersion, factors }) => ({ date, type, score, algorithmVersion, factors }),
        );
      const first = await snapshot();
      await rescoreUser(user.id, { days: 30, now: NOW_R });
      expect(await snapshot()).toEqual(first);
      expect(await prisma.dailyScore.count({ where: { userId: user.id } })).toBe(90);
    });

    it('counts days without any input as noInput, not rescored', async () => {
      const user = await createUser();
      await seedHistory(user.id, '2026-07-11', 5); // 07-11..07-15
      const summary = await rescoreUser(user.id, { days: 10, now: NOW_R });
      expect(summary).toMatchObject({ daysProcessed: 10, rescored: 5, noInput: 5, versions: ['v3'] });
    });

    it('rejects an unknown user and a bad window', async () => {
      await expect(rescoreUser('00000000-0000-0000-0000-000000000000', { now: NOW_R })).rejects.toThrow('not found');
      const user = await createUser();
      await expect(rescoreUser(user.id, { days: 0 })).rejects.toThrow('positive integer');
    });

    it('parses --user (required) and --days (default 90)', () => {
      expect(parseArgs(['--user', 'u1'])).toEqual({ userId: 'u1', days: 90 });
      expect(parseArgs(['--user', 'u1', '--days', '30'])).toEqual({ userId: 'u1', days: 30 });
      expect(() => parseArgs([])).toThrow('--user');
      expect(() => parseArgs(['--user'])).toThrow('requires a value');
      expect(() => parseArgs(['--user', 'u1', '--days', '0'])).toThrow('--days');
      expect(() => parseArgs(['--user', 'u1', '--bogus'])).toThrow('Unknown argument');
    });
  });
});
