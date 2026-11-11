import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { STREAK_LOOKBACK_DAYS, currentSleepStreak, moodFromScore, moodLine, todayMood } from '../../src/buddies/mood';
import { getLiveConfig } from '../../src/scoring/configs';
import { seedNights } from '../recap/helpers';
import { buddyUser } from './helpers';
import { connection } from '../../src/sync/queue';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  // helpers.ts imports the notify queue, which opens the shared Redis connection.
  await connection.quit();
});

const BANDS = { excellent: 75, good: 55, fair: 40 };

it('bands excellent/good → good, fair → ok, poor → low, missing → none', () => {
  expect([80, 75, 55, 54.9, 40, 39.9, 0].map((s) => moodFromScore(s, BANDS))).toEqual(['good', 'good', 'good', 'ok', 'ok', 'low', 'low']);
  expect([null, undefined, NaN].map((s) => moodFromScore(s, BANDS))).toEqual(['none', 'none', 'none']);
  expect(moodFromScore(getLiveConfig().scoreBands.good)).toBe('good');
});

it("uses today's score, else yesterday's, else none", () => {
  expect(todayMood(new Map([['2026-10-07', 30], ['2026-10-06', 80]]), '2026-10-07', BANDS)).toBe('low');
  expect(todayMood(new Map([['2026-10-06', 80]]), '2026-10-07', BANDS)).toBe('good');
  expect(todayMood(new Map([['2026-10-05', 80]]), '2026-10-07', BANDS)).toBe('none');
});

it('builds the line from fixed templates and only the extras it is given', () => {
  expect(moodLine('good')).toBe('Well rested');
  expect(moodLine('ok')).toBe('Doing okay');
  expect(moodLine('low')).toBe('Running low today');
  expect(moodLine('none')).toBe('No data yet');
  expect(moodLine('good', { movedALot: true })).toBe('Well rested · moved a lot yesterday');
  expect(moodLine('ok', { movedALot: true, streakNights: 5 })).toBe('Doing okay · moved a lot yesterday · on a 5-night streak');
  expect(moodLine('ok', { streakNights: 2 })).toBe('Doing okay');
  expect(moodLine('ok', { streakNights: null })).toBe('Doing okay');
});

describe('currentSleepStreak (write-free)', () => {
  const NOW = new Date('2026-10-10T12:00:00Z');

  it('is the current Sleep goal run, and writes no Achievement or GoalChange row', async () => {
    const user = await buddyUser();
    await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: civilDateToUtcMidnight('2026-10-01') } });
    await seedNights(user.id, '2026-10-05', [500, 500, 500, 500, 500, 500]);
    const writes = [jest.spyOn(prisma.achievement, 'createMany'), jest.spyOn(prisma.achievement, 'create'), jest.spyOn(prisma.goalChange, 'createMany')];
    expect(await currentSleepStreak(user.id, NOW)).toBe(6);
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
    expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(0);
    writes.forEach((s) => s.mockRestore());
  });

  it('reads only SLEEP rollups (bounded to STREAK_LOOKBACK_DAYS) and sleep goal changes', async () => {
    const user = await buddyUser();
    await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: civilDateToUtcMidnight('2024-01-01') } });
    await seedNights(user.id, '2026-10-05', [500, 500, 500, 500, 500, 500]);
    const unused = [prisma.sleepSession, prisma.dailyScore, prisma.habitCheckIn, prisma.recap].map((d) => jest.spyOn(d, 'findMany'));
    const records = jest.spyOn(prisma.biometricRecord, 'findMany');
    try {
      expect(await currentSleepStreak(user.id, NOW)).toBe(6);
      for (const spy of unused) expect(spy).not.toHaveBeenCalled();
      expect(records).toHaveBeenCalledTimes(1);
      const where = (records.mock.calls[0]![0] as { where: { metricType: unknown; recordedAt: { gte: Date } } }).where;
      expect(where.metricType).toBe('SLEEP');
      expect(where.recordedAt.gte.getTime()).toBe(civilDateToUtcMidnight('2026-10-10').getTime() - STREAK_LOOKBACK_DAYS * 86_400_000);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('starts after a sleep goal change that reset the streak', async () => {
    const user = await buddyUser();
    await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: civilDateToUtcMidnight('2026-10-01') } });
    await seedNights(user.id, '2026-10-05', [500, 500, 500, 500, 500, 500]);
    await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: civilDateToUtcMidnight('2026-10-07'), resetsStreak: true } });
    // The run starts on the 8th: the 8th, 9th and 10th.
    expect(await currentSleepStreak(user.id, NOW)).toBe(3);
  });

  it('is null (no streak, not 0) without an achievements start date', async () => {
    const user = await buddyUser();
    await seedNights(user.id, '2026-10-05', [500, 500, 500]);
    expect(await currentSleepStreak(user.id, NOW)).toBeNull();
  });
});
