import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import { ensureAchievementsStart, writeStartingGoals } from '../../src/achievements/start';
import { updateSleepGoal } from '../../src/users/goals';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const day = civilDateToUtcMidnight;
const NOW = new Date('2026-10-06T20:00:00Z');

async function goalRows(userId: string) {
  const rows = await prisma.goalChange.findMany({ where: { userId }, orderBy: [{ kind: 'asc' }, { effectiveOn: 'asc' }] });
  return rows.map((r) => [r.kind, r.effectiveOn.toISOString().slice(0, 10), r.sleepMinutes, r.bedtime, r.resetsStreak]);
}

it("sets a new user's start date to their local date on the first load, with the starting goals", async () => {
  const user = await createUser({ timezone: 'Pacific/Auckland', sleepGoalMinutes: 450 });
  expect(await ensureAchievementsStart(user.id, NOW)).toBe('2026-10-07');
  expect(await goalRows(user.id)).toEqual([
    ['SLEEP_MINUTES', '2026-10-07', 450, null, false],
    ['BEDTIME', '2026-10-07', null, null, false],
  ]);
});

it('tolerates a goal already saved that day: the saved change is kept and nothing is violated', async () => {
  const user = await createUser();
  await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
  expect(await ensureAchievementsStart(user.id, NOW)).toBe('2026-10-06');
  expect(await goalRows(user.id)).toEqual([
    ['SLEEP_MINUTES', '2026-10-05', 480, null, false],
    ['SLEEP_MINUTES', '2026-10-06', 450, null, true],
    ['BEDTIME', '2026-10-06', null, null, false],
  ]);
});

it('never moves a start date that is set, and writes nothing then', async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day('2026-09-01') } });
  expect(await ensureAchievementsStart(user.id, NOW)).toBe('2026-09-01');
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('sets one start date when two first loads race', async () => {
  const user = await createUser();
  const both = await Promise.all([ensureAchievementsStart(user.id, NOW), ensureAchievementsStart(user.id, NOW)]);
  expect(both).toEqual(['2026-10-06', '2026-10-06']);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(2);
});

it('returns null for an unknown user', async () => {
  expect(await ensureAchievementsStart('00000000-0000-4000-8000-000000000000', NOW)).toBeNull();
});

it('writeStartingGoals keeps a row already written for that day', async () => {
  const user = await createUser();
  await prisma.goalChange.create({ data: { userId: user.id, kind: 'BEDTIME', bedtime: '22:00', effectiveOn: day('2026-10-06'), resetsStreak: true } });
  await writeStartingGoals(user.id, '2026-10-06', { sleepGoalMinutes: 480, bedtimeGoal: null });
  expect(await goalRows(user.id)).toEqual([
    ['SLEEP_MINUTES', '2026-10-06', 480, null, false],
    ['BEDTIME', '2026-10-06', null, '22:00', true],
  ]);
});
