import { DEFAULT_SLEEP_GOAL_MINUTES, resolveSleepGoalMinutes, getSleepGoalMinutes } from '../../src/users/goals';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('sleep goal (single source)', () => {
  it('defaults to 480 minutes', () => {
    expect(DEFAULT_SLEEP_GOAL_MINUTES).toBe(480);
  });

  // The schema default cannot reference the TS constant, so this is what keeps
  // the two from drifting apart.
  it('matches the User.sleepGoalMinutes column default', async () => {
    const user = await createUser();
    expect(user.sleepGoalMinutes).toBe(DEFAULT_SLEEP_GOAL_MINUTES);
    expect(await getSleepGoalMinutes(user.id)).toBe(DEFAULT_SLEEP_GOAL_MINUTES);
  });

  it("returns a user's customized goal", async () => {
    const user = await createUser({ sleepGoalMinutes: 420 });
    expect(await getSleepGoalMinutes(user.id)).toBe(420);
  });

  it('falls back to the default for a missing user or an invalid stored value', async () => {
    expect(await getSleepGoalMinutes('00000000-0000-0000-0000-000000000000')).toBe(480);
    expect(resolveSleepGoalMinutes(0)).toBe(480);
    expect(resolveSleepGoalMinutes(-5)).toBe(480);
    expect(resolveSleepGoalMinutes(null)).toBe(480);
    expect(resolveSleepGoalMinutes(undefined)).toBe(480);
  });
});
