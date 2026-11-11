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

const sleepRow = (userId: string, date: string) =>
  prisma.dailyScore.findUnique({ where: { userId_date_type: { userId, date: day(date), type: 'SLEEP' } } });
const recoveryRow = (userId: string, date: string) =>
  prisma.dailyScore.findUnique({ where: { userId_date_type: { userId, date: day(date), type: 'RECOVERY' } } });

describe('computeDailyScore: Sleep Score (Slice 1.5)', () => {
  it('persists a SLEEP DailyScore with the three factors, plus the Slice 1.5 features and baselines', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 45);
    await seedSessions(user.id, START, 45);

    expect(await computeDailyScore(user.id, last)).toBe('scored');

    const score = (await sleepRow(user.id, last))!;
    expect(score.algorithmVersion).toBe(getLiveConfig().version);
    expect(score.score).not.toBeNull();
    expect(score.confidenceLevel).toBe('HIGH');
    const factors = score.factors as Array<Record<string, any>>;
    expect(factors.map((f) => f.factor).sort()).toEqual(['CIRCADIAN_CONSISTENCY', 'SLEEP_DURATION', 'SLEEP_EFFICIENCY']);
    // Duration also records the sleep goal it was scored against (spec 2026-10-03 §2).
    for (const f of factors) {
      const keys = ['contribution', 'excluded', 'factor', 'imputed', 'points', 'weight', 'z', 'zRaw'];
      expect(Object.keys(f).sort()).toEqual((f.factor === 'SLEEP_DURATION' ? [...keys, 'goalMinutes'] : keys).sort());
    }
    expect(factors.reduce((sum, f) => sum + f.weight, 0)).toBeCloseTo(1, 9);
    expect(factors.every((f) => !f.excluded && !f.imputed)).toBe(true);

    const features = (await prisma.userDailyFeatures.findUnique({ where: { userId_date: { userId: user.id, date: day(last) } } }))!;
    expect(features.sleepEfficiency).toBeGreaterThan(0.85);
    expect(features.sleepEfficiency).toBeLessThanOrEqual(1);
    expect(features.sleepEfficiencyZ).not.toBeNull();
    expect(features.sleepEfficiencyZImputed).toBe(false);
    expect(features.circadianConsistencyScore).toBeGreaterThan(0);
    expect(features.circadianConsistencyZ).not.toBeNull();
    expect(features.circadianConsistencyZImputed).toBe(false);

    const eff = await prisma.baselineSnapshot.findFirst({ where: { userId: user.id, metric: 'SLEEP_EFFICIENCY', date: day(last) } });
    expect(eff!.ewma).not.toBeNull();
    // sigma-hat = 1.4826 x MAD, as for every other metric.
    expect(eff!.spread).toBeCloseTo(1.4826 * eff!.mad!, 9);
  });

  it('is idempotent for both score types: reruns leave one row of each with identical values', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 45);
    await seedSessions(user.id, START, 45);

    await computeDailyScore(user.id, last);
    const recovery = (await recoveryRow(user.id, last))!;
    const sleep = (await sleepRow(user.id, last))!;
    await computeDailyScore(user.id, last);
    await computeDailyScore(user.id, last);

    expect(await prisma.dailyScore.count({ where: { userId: user.id, type: 'RECOVERY' } })).toBe(1);
    expect(await prisma.dailyScore.count({ where: { userId: user.id, type: 'SLEEP' } })).toBe(1);
    expect(await prisma.userDailyFeatures.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.baselineSnapshot.count({ where: { userId: user.id } })).toBe(6);
    const recoveryAgain = (await recoveryRow(user.id, last))!;
    const sleepAgain = (await sleepRow(user.id, last))!;
    expect(recoveryAgain.score).toBe(recovery.score);
    expect(recoveryAgain.factors).toEqual(recovery.factors);
    expect(sleepAgain.score).toBe(sleep.score);
    expect(sleepAgain.factors).toEqual(sleep.factors);
  });

  it('leaves the Recovery Score identical whether or not SleepSession rows exist', async () => {
    const withSessions = await createUser();
    const without = await createUser();
    const last = await seedHistory(withSessions.id, START, 45);
    await seedHistory(without.id, START, 45);
    await seedSessions(withSessions.id, START, 45);

    await computeDailyScore(withSessions.id, last);
    await computeDailyScore(without.id, last);

    const a = (await recoveryRow(withSessions.id, last))!;
    const b = (await recoveryRow(without.id, last))!;
    expect(a.score).toBe(b.score);
    expect(a.confidenceLevel).toBe(b.confidenceLevel);
    expect(a.factors).toEqual(b.factors);
  });

  it('renormalizes the v2 weights around a cold-starting circadian factor: 0.50/0.80 and 0.30/0.80, MEDIUM confidence', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 20);
    await seedSessions(user.id, START, 20);

    await computeDailyScore(user.id, last);

    const score = (await sleepRow(user.id, last))!;
    const by = Object.fromEntries((score.factors as any[]).map((f) => [f.factor, f]));
    expect(by.CIRCADIAN_CONSISTENCY.excluded).toBe(true);
    expect(by.SLEEP_DURATION.weight).toBeCloseTo(0.5 / 0.8, 9);
    expect(by.SLEEP_EFFICIENCY.weight).toBeCloseTo(0.3 / 0.8, 9);
    expect(score.confidenceLevel).toBe('MEDIUM');
    const features = (await prisma.userDailyFeatures.findFirst({ where: { userId: user.id } }))!;
    expect(features.circadianConsistencyZ).toBeNull();
  });

  it('writes a null-score SLEEP row while every baseline is cold-starting', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 10);

    await computeDailyScore(user.id, last);

    const score = (await sleepRow(user.id, last))!;
    expect(score.score).toBeNull();
    expect(score.confidenceLevel).toBe('LOW');
    expect((score.factors as any[]).every((f) => f.excluded)).toBe(true);
  });

  it('writes no SLEEP score for a day without sleep, and removes one whose sleep has since gone', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 45);
    await computeDailyScore(user.id, last);
    expect(await sleepRow(user.id, last)).not.toBeNull();

    await prisma.biometricRecord.deleteMany({ where: { userId: user.id, recordedAt: day(last), metricType: 'SLEEP' } });
    expect(await computeDailyScore(user.id, last)).toBe('scored'); // HRV / RHR are still observed

    expect(await sleepRow(user.id, last)).toBeNull();
    expect(await recoveryRow(user.id, last)).not.toBeNull();
  });

  it('removes both scores when the day has no observed input at all', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 45);
    await computeDailyScore(user.id, last);
    await prisma.biometricRecord.deleteMany({
      where: { userId: user.id, recordedAt: day(last), metricType: { in: ['HRV', 'RESTING_HR', 'SLEEP'] } },
    });

    expect(await computeDailyScore(user.id, last)).toBe('no-input');

    expect(await prisma.dailyScore.count({ where: { userId: user.id } })).toBe(0);
  });

  it('reflects late-arriving session data on recompute (a much later bedtime lowers the circadian factor)', async () => {
    const user = await createUser();
    const last = await seedHistory(user.id, START, 45);
    await seedSessions(user.id, START, 45);
    await computeDailyScore(user.id, last);
    const before = (await sleepRow(user.id, last))!;

    const [latest] = await prisma.sleepSession.findMany({ where: { userId: user.id }, orderBy: { endTime: 'desc' }, take: 1 });
    await prisma.sleepSession.update({
      where: { id: latest!.id },
      data: { startTime: new Date(latest!.startTime.getTime() + 3 * 3_600_000) },
    });
    await computeDailyScore(user.id, last);

    const after = (await sleepRow(user.id, last))!;
    const circadianZ = (row: typeof before) => (row.factors as any[]).find((f) => f.factor === 'CIRCADIAN_CONSISTENCY').z as number;
    expect(circadianZ(after)).toBeLessThan(circadianZ(before));
  });

  it("buckets a session by the user's own timezone", async () => {
    const utc = await createUser({ timezone: 'UTC' });
    const ny = await createUser({ timezone: 'America/New_York' });
    const last = await seedHistory(utc.id, START, 20);
    await seedHistory(ny.id, START, 20);
    // Ends 03:00Z on the scored day: that day in UTC, but 23:00 the evening before in New York.
    const endTime = new Date(`${last}T03:00:00Z`);
    const session = { startTime: new Date(endTime.getTime() - 420 * 60_000), endTime, minutesAsleep: 390 };
    await prisma.sleepSession.create({ data: { userId: utc.id, ...session } });
    await prisma.sleepSession.create({ data: { userId: ny.id, ...session } });

    await computeDailyScore(utc.id, last);
    await computeDailyScore(ny.id, last);

    const a = (await prisma.userDailyFeatures.findFirst({ where: { userId: utc.id } }))!;
    const b = (await prisma.userDailyFeatures.findFirst({ where: { userId: ny.id } }))!;
    expect(a.sleepEfficiency).toBeCloseTo(390 / 420, 4);
    expect(b.sleepEfficiency).toBeNull();
  });

  it("buckets a session by its own stored UTC offset, ignoring the user's timezone", async () => {
    const traveller = await createUser({ timezone: 'America/New_York' });
    const home = await createUser({ timezone: 'America/New_York' });
    const last = await seedHistory(traveller.id, START, 20);
    await seedHistory(home.id, START, 20);
    // Ends 03:00Z on the scored day. New York says the evening before, but the
    // traveller's record says +00:00 (they are in London-ish UTC time): that day.
    const endTime = new Date(`${last}T03:00:00Z`);
    const session = { startTime: new Date(endTime.getTime() - 420 * 60_000), endTime, minutesAsleep: 390 };
    await prisma.sleepSession.create({ data: { userId: traveller.id, ...session, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 } });
    await prisma.sleepSession.create({ data: { userId: home.id, ...session } });

    await computeDailyScore(traveller.id, last);
    await computeDailyScore(home.id, last);

    const a = (await prisma.userDailyFeatures.findFirst({ where: { userId: traveller.id } }))!;
    const b = (await prisma.userDailyFeatures.findFirst({ where: { userId: home.id } }))!;
    expect(a.sleepEfficiency).toBeCloseTo(390 / 420, 4);
    expect(b.sleepEfficiency).toBeNull(); // null offset -> falls back to New York, the evening before
  });
});
