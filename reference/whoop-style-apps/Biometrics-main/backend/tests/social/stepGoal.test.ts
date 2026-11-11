import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { STEPS_GOAL } from '../../src/coach/tools/metrics';
import { recordStepGoal } from '../../src/social/stepGoal';
import { buddyUser } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z'); // 13:00 in Los Angeles, Oct 7
const point = (date: string, value: number) => ({ recordedAt: civilDateToUtcMidnight(date), value });

it("writes one event the first time today's steps reach the goal, in the user's zone", async () => {
  const u = await buddyUser({ timezone: 'America/Los_Angeles' });
  expect(await recordStepGoal(u.id, [point('2026-10-07', STEPS_GOAL - 1)], NOW)).toBe(false);
  expect(await recordStepGoal(u.id, [point('2026-10-06', STEPS_GOAL + 5000)], NOW)).toBe(false); // yesterday
  expect(await recordStepGoal(u.id, [point('2026-10-07', STEPS_GOAL)], NOW)).toBe(true);
  expect(await recordStepGoal(u.id, [point('2026-10-07', STEPS_GOAL + 2000)], NOW)).toBe(false); // already
  const rows = await prisma.stepGoalEvent.findMany({ where: { authorId: u.id } });
  expect(rows.map((r) => r.localDate.toISOString().slice(0, 10))).toEqual(['2026-10-07']);
});
