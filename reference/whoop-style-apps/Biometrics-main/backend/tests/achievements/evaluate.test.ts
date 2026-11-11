import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { evaluateAchievements } from '../../src/achievements/evaluate';
import { shiftDate } from '../../src/scoring/dates';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';
import { connection } from '../../src/sync/queue';
import { seedNights } from '../recap/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  // evaluate.ts imports the badge announcer, which opens the shared Redis connection.
  await connection.quit();
});
// Every award logs achievements.awarded; keep the run quiet (the log test checks it with its own spy).
let quietInfo: jest.SpyInstance;
beforeEach(() => {
  quietInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => quietInfo.mockRestore());

const day = civilDateToUtcMidnight;
const key = (d: Date) => d.toISOString().slice(0, 10);
const NOW = new Date('2026-10-10T12:00:00Z');
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => shiftDate(from, i));

async function startedUser(since = '2026-10-01', over: { timezone?: string } = {}) {
  const user = await createUser(over);
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day(since) } });
  return user;
}
async function stored(userId: string) {
  const rows = await prisma.achievement.findMany({ where: { userId }, orderBy: [{ family: 'asc' }, { level: 'asc' }] });
  return rows.map((r) => ({ family: r.family, level: r.level, value: r.value, earnedOn: key(r.earnedOn), weekStart: key(r.weekStart), monthStart: key(r.monthStart) }));
}
const steps = (userId: string, dates: string[], value: number) =>
  prisma.biometricRecord.createMany({ data: dates.map((d) => ({ userId, metricType: 'STEPS' as const, value, recordedAt: day(d) })) });
const checkIns = (userId: string, dates: string[], onTime = true) =>
  prisma.habitCheckIn.createMany({ data: dates.map((d) => ({ userId, habitDay: day(d), onTime })) });

it('stores every level a finished streak reached, dated when it reached each one (a catch-up sync)', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500, 500, 500, 500, 500, 400]);
  const results = await evaluateAchievements(user.id, NOW);
  expect(results?.find((r) => r.family === 'SLEEP_GOAL')).toMatchObject({ current: 0, best: 7 });
  expect(await stored(user.id)).toEqual([
    { family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03', weekStart: '2026-09-28', monthStart: '2026-10-01' },
    { family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07', weekStart: '2026-10-05', monthStart: '2026-10-01' },
  ]);
});

it('is idempotent and safe to run concurrently', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  await Promise.all([evaluateAchievements(user.id, NOW), evaluateAchievements(user.id, NOW)]);
  await evaluateAchievements(user.id, NOW);
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(1);
});

it('never revokes a level when the data behind it goes away', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  await evaluateAchievements(user.id, NOW);
  await prisma.biometricRecord.deleteMany({ where: { userId: user.id } });
  await evaluateAchievements(user.id, NOW);
  expect(await stored(user.id)).toHaveLength(1);
});

it('counts nothing before the start date', async () => {
  const user = await startedUser('2026-10-06');
  await seedNights(user.id, '2026-10-01', [500, 500, 500, 500, 500]);
  await evaluateAchievements(user.id, NOW);
  expect(await stored(user.id)).toEqual([]);
});

it('judges each night by the stored goal in effect that night', async () => {
  const user = await startedUser();
  await prisma.goalChange.createMany({
    data: [
      { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-01'), resetsStreak: false },
      { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 510, effectiveOn: day('2026-10-03'), resetsStreak: false },
    ],
  });
  // 490 a night: on goal while 480 applies (nights ending Oct 1–3), short once 510 applies (Oct 4).
  await seedNights(user.id, '2026-10-01', [490, 490, 490, 490]);
  const results = await evaluateAchievements(user.id, NOW);
  expect(results?.find((r) => r.family === 'SLEEP_GOAL')).toMatchObject({ best: 3, current: 0 });
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.earnedOn])).toEqual([['SLEEP_GOAL', 1, '2026-10-03']]);
});

it("judges steps by the user's own day: in Auckland Oct 10 is already over at 12:00Z", async () => {
  const auckland = await startedUser('2026-10-01', { timezone: 'Pacific/Auckland' });
  const utc = await startedUser();
  for (const u of [auckland, utc]) await steps(u.id, ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'], 12000);
  await evaluateAchievements(auckland.id, NOW);
  await evaluateAchievements(utc.id, NOW);
  expect(await stored(auckland.id)).toEqual([
    { family: 'STEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-10', weekStart: '2026-10-05', monthStart: '2026-10-01' },
  ]);
  expect(await stored(utc.id)).toEqual([]);
});

it('counts only on-time check-ins toward the check-in streak', async () => {
  const steady = await startedUser();
  await checkIns(steady.id, range('2026-10-01', 7));
  const late = await startedUser();
  await checkIns(late.id, range('2026-10-01', 7).filter((d) => d !== '2026-10-04'));
  await checkIns(late.id, ['2026-10-04'], false);
  await evaluateAchievements(steady.id, NOW);
  await evaluateAchievements(late.id, NOW);
  expect(await stored(steady.id)).toEqual([
    { family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07', weekStart: '2026-10-05', monthStart: '2026-10-01' },
  ]);
  expect(await stored(late.id)).toEqual([]);
});

it('counts months from BUILT recaps; a rebuild that gains a milestone awards, one that loses it revokes nothing', async () => {
  const user = await startedUser('2026-08-01');
  const month = (start: string, end: string, milestones: Prisma.InputJsonObject) =>
    prisma.recap.create({ data: { userId: user.id, kind: 'MONTH', periodStart: day(start), periodEnd: day(end), status: 'BUILT', sleepGoalMinutes: 480, stats: { nightsWithData: 30, milestones } } });
  await month('2026-07-01', '2026-07-31', { everyDayLogged: { days: 31 } });
  const aug = await month('2026-08-01', '2026-08-31', { everyDayLogged: { days: 31 } });
  const sep = await month('2026-09-01', '2026-09-30', { everyDayLogged: { days: 30 }, steadiestMonth: { spreadMinutes: 12 } });
  await evaluateAchievements(user.id, NOW);
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.earnedOn])).toEqual([
    ['EVERY_DAY_LOGGED', 1, '2026-08-31'],
    ['STEADIEST_MONTH', 1, '2026-09-30'],
  ]);
  await prisma.recap.update({ where: { id: aug.id }, data: { stats: { nightsWithData: 31, milestones: { everyDayLogged: { days: 31 }, steadiestMonth: { spreadMinutes: 15 } } } } });
  await prisma.recap.update({ where: { id: sep.id }, data: { stats: { nightsWithData: 30, milestones: { steadiestMonth: { spreadMinutes: 12 } } } } });
  await evaluateAchievements(user.id, NOW);
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.earnedOn])).toEqual([
    ['EVERY_DAY_LOGGED', 1, '2026-08-31'],
    // Level I keeps its stored date; level II is the second qualifying month's end.
    ['STEADIEST_MONTH', 1, '2026-09-30'],
    ['STEADIEST_MONTH', 2, '2026-09-30'],
  ]);
});

it('judges steady bedtimes against the usual bedtime, using main sessions from the 60 days before the start date', async () => {
  // No bedtime goal: each night is judged against the median of the 14 main-session bedtimes before
  // it, once there are 7. Eight nights before the start date make the first nights after it count.
  const user = await startedUser();
  await seedNights(user.id, '2026-09-10', [500, 500, 500, 500, 500, 500, 500, 500], () => ({ bedtime: '22:30' }));
  await seedNights(user.id, '2026-10-01', [500, 500, 500], (i) => ({ bedtime: ['22:40', '22:15', '22:30'][i] }));
  // Without the nights before it, the same three nights have no usual bedtime yet and count for nothing.
  const fresh = await startedUser();
  await seedNights(fresh.id, '2026-10-01', [500, 500, 500], (i) => ({ bedtime: ['22:40', '22:15', '22:30'][i] }));

  const results = await evaluateAchievements(user.id, NOW, ['STEADY_BEDTIME']);
  await evaluateAchievements(fresh.id, NOW, ['STEADY_BEDTIME']);

  expect(results?.find((r) => r.family === 'STEADY_BEDTIME')).toMatchObject({ best: 3 });
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.value, r.earnedOn])).toEqual([['STEADY_BEDTIME', 1, 3, '2026-10-03']]);
  expect(await stored(fresh.id)).toEqual([]);
});

it('evaluates only the families asked for', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  await checkIns(user.id, range('2026-10-01', 7));
  const results = await evaluateAchievements(user.id, NOW, ['CHECK_IN']);
  expect(results?.map((r) => r.family)).toEqual(['CHECK_IN']);
  expect((await stored(user.id)).map((r) => r.family)).toEqual(['CHECK_IN']);
});

it('returns null and stores nothing for a user without a start date', async () => {
  const user = await createUser();
  expect(await evaluateAchievements(user.id, NOW)).toBeNull();
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(0);
});

it('logs each new level once, with ids, family and level only', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  try {
    await evaluateAchievements(user.id, NOW);
    await evaluateAchievements(user.id, NOW);
    expect(info.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { event: 'achievements.awarded', userId: user.id, family: 'SLEEP_GOAL', level: 1 },
    ]);
  } finally {
    info.mockRestore();
  }
});
