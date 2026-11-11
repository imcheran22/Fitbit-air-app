import { computeDailyScore } from '../../src/scoring/compute';
import { getLiveConfig } from '../../src/scoring/configs';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser, seedHistory, seedSessions, day } from './dbHelpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const START = '2026-06-01';

describe('computeDailyScore', () => {
  it('persists the baselines, features and a RECOVERY score for the day', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);

    expect(await computeDailyScore(user.id, last)).toBe('scored');

    const score = await prisma.dailyScore.findUnique({
      where: { userId_date_type: { userId: user.id, date: day(last), type: 'RECOVERY' } },
    });
    expect(score).not.toBeNull();
    expect(score!.algorithmVersion).toBe(getLiveConfig().version);
    expect(score!.score).not.toBeNull();
    expect(score!.confidenceLevel).toBe('HIGH');

    const factors = score!.factors as Array<Record<string, unknown>>;
    expect(factors.map((f) => f.factor).sort()).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
    expect(Object.keys(factors[0]!).sort()).toEqual(
      ['contribution', 'excluded', 'factor', 'imputed', 'points', 'weight', 'z', 'zRaw'].sort(),
    );

    const snapshots = await prisma.baselineSnapshot.findMany({ where: { userId: user.id, date: day(last) } });
    expect(snapshots.map((s) => s.metric).sort()).toEqual([
      'CIRCADIAN_CONSISTENCY',
      'HRV',
      'RESTING_HR',
      'SLEEP',
      'SLEEP_DEBT',
      'SLEEP_EFFICIENCY',
    ]);
    const hrv = snapshots.find((s) => s.metric === 'HRV')!;
    // sigma-hat = 1.4826 x MAD is what is stored as the spread.
    expect(hrv.spread).toBeCloseTo(1.4826 * hrv.mad!, 9);

    const features = await prisma.userDailyFeatures.findUnique({
      where: { userId_date: { userId: user.id, date: day(last) } },
    });
    expect(features!.sleepDebtRolling14d).not.toBeNull();
    expect(features!.hrvZ).not.toBeNull();
    expect(features!.hrvZImputed).toBe(false);
    expect(features!.sleepDurationZ).not.toBeNull();
  });

  // Recompute is safe to repeat: BullMQ retries, a debounced webhook and the
  // nightly sweep can all land on the same day.
  it('is idempotent: recomputing leaves one row of each kind with identical values', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);

    await computeDailyScore(user.id, last);
    const first = await prisma.dailyScore.findFirst({ where: { userId: user.id, type: 'RECOVERY' } });
    await computeDailyScore(user.id, last);
    await computeDailyScore(user.id, last);

    // One RECOVERY and one SLEEP row (the night is recorded), never duplicated by a rerun.
    expect(await prisma.dailyScore.count({ where: { userId: user.id } })).toBe(2);
    expect(await prisma.userDailyFeatures.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.baselineSnapshot.count({ where: { userId: user.id } })).toBe(6);
    const again = await prisma.dailyScore.findFirst({ where: { userId: user.id, type: first!.type } });
    expect(again!.score).toBe(first!.score);
    expect(again!.factors).toEqual(first!.factors);
  });

  it('reflects late-arriving data on recompute', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);
    await computeDailyScore(user.id, last);
    const before = (await prisma.dailyScore.findFirst({ where: { userId: user.id, type: 'RECOVERY' } }))!.score!;

    await prisma.biometricRecord.update({
      where: { userId_metricType_recordedAt: { userId: user.id, metricType: 'HRV', recordedAt: day(last) } },
      data: { value: 38 }, // a real dip (~ -3 sigma), inside the 5 MAD outlier fence
    });
    await computeDailyScore(user.id, last);

    const after = (await prisma.dailyScore.findFirst({ where: { userId: user.id, type: 'RECOVERY' } }))!.score!;
    expect(after).toBeLessThan(before);
  });

  it('writes a null-score row with per-metric progress while every metric is cold-starting', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 10);

    expect(await computeDailyScore(user.id, last)).toBe('scored');

    const score = await prisma.dailyScore.findFirst({ where: { userId: user.id, type: 'RECOVERY' } });
    expect(score!.score).toBeNull();
    expect(score!.confidenceLevel).toBe('LOW');
    const hrv = await prisma.baselineSnapshot.findFirst({ where: { userId: user.id, metric: 'HRV' } });
    expect(hrv).toMatchObject({ ewma: null, spread: null, mad: null, daysOfHistory: 9 });
  });

  it('flags an outlier reading without altering or deleting the raw BiometricRecord', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);
    await prisma.biometricRecord.update({
      where: { userId_metricType_recordedAt: { userId: user.id, metricType: 'HRV', recordedAt: day(last) } },
      data: { value: 400 },
    });

    await computeDailyScore(user.id, last);

    const flags = await prisma.scoreInputFlag.findMany({ where: { userId: user.id } });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ metric: 'HRV', flag: 'OUTLIER', value: 400 });

    const raw = await prisma.biometricRecord.findUnique({
      where: { userId_metricType_recordedAt: { userId: user.id, metricType: 'HRV', recordedAt: day(last) } },
    });
    expect(raw!.value).toBe(400);

    // The score treats the day as a gap: imputed, lower confidence.
    const score = await prisma.dailyScore.findFirst({ where: { userId: user.id, type: 'RECOVERY' } });
    expect(score!.confidenceLevel).toBe('MEDIUM');
    expect((score!.factors as any[]).find((f) => f.factor === 'HRV').imputed).toBe(true);
  });

  it('drops a stale outlier flag once the value is no longer an outlier', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);
    const where = { userId_metricType_recordedAt: { userId: user.id, metricType: 'HRV' as const, recordedAt: day(last) } };
    await prisma.biometricRecord.update({ where, data: { value: 400 } });
    await computeDailyScore(user.id, last);
    expect(await prisma.scoreInputFlag.count({ where: { userId: user.id } })).toBe(1);

    await prisma.biometricRecord.update({ where, data: { value: 50 } });
    await computeDailyScore(user.id, last);

    expect(await prisma.scoreInputFlag.count({ where: { userId: user.id } })).toBe(0);
  });

  it('stores acuteChronicLoadRatio in the features', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);
    await computeDailyScore(user.id, last);
    const features = await prisma.userDailyFeatures.findFirst({ where: { userId: user.id } });
    expect(features!.acuteChronicLoadRatio).not.toBeNull();
  });

  it("uses the user's own sleep goal (User.sleepGoalMinutes), not a hardcoded 480", async () => {
    const short = await createUser({ sleepGoalMinutes: 300 });
    const long = await createUser({ sleepGoalMinutes: 600 });
    const last = await seedHistory(short.id, START, 40);
    await seedHistory(long.id, START, 40);

    await computeDailyScore(short.id, last);
    await computeDailyScore(long.id, last);

    const a = await prisma.userDailyFeatures.findFirst({ where: { userId: short.id } });
    const b = await prisma.userDailyFeatures.findFirst({ where: { userId: long.id } });
    expect(a!.sleepDebtRolling14d!).toBeLessThan(b!.sleepDebtRolling14d!);
  });

  it('writes no score for a day with no observed input, and removes one that outlived its data', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 40);
    await computeDailyScore(user.id, last);
    await prisma.biometricRecord.deleteMany({
      where: { userId: user.id, recordedAt: day(last), metricType: { in: ['HRV', 'RESTING_HR', 'SLEEP'] } },
    });

    expect(await computeDailyScore(user.id, last)).toBe('no-input');
    expect(await prisma.dailyScore.count({ where: { userId: user.id } })).toBe(0);

    expect(await computeDailyScore(user.id, '2026-12-31')).toBe('no-input');
  });

  it('does nothing for an unknown user and rejects a malformed date', async () => {
    expect(await computeDailyScore('00000000-0000-0000-0000-000000000000', '2026-07-01')).toBe('no-user');
    await expect(computeDailyScore('x', '2026-7-1')).rejects.toThrow('Invalid score date');
  });
});
