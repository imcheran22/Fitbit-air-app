import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { deleteUserCoachData } from '../../src/coach/retention';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const day = civilDateToUtcMidnight;
const level = (userId: string, n: number, earnedOn = '2026-10-07') => ({
  userId, family: 'SLEEP_GOAL' as const, level: n, value: [3, 7, 14, 30, 100][n - 1] ?? 3,
  earnedOn: day(earnedOn), weekStart: day('2026-10-05'), monthStart: day('2026-10-01'),
});

it('stores one achievement per (user, family, level), not yet celebrated', async () => {
  const user = await createUser();
  const row = await prisma.achievement.create({ data: level(user.id, 1) });
  expect(row.celebratedAt).toBeNull();
  await expect(prisma.achievement.create({ data: level(user.id, 1, '2026-10-08') })).rejects.toMatchObject({ code: 'P2002' });
});

it('rejects a level outside 1..5', async () => {
  const user = await createUser();
  await expect(prisma.achievement.create({ data: { ...level(user.id, 1), level: 6 } })).rejects.toThrow();
  await expect(prisma.achievement.create({ data: { ...level(user.id, 1), level: 0 } })).rejects.toThrow();
});

it('keeps one goal change per (user, kind, day)', async () => {
  const user = await createUser();
  const change = { userId: user.id, kind: 'SLEEP_MINUTES' as const, sleepMinutes: 450, effectiveOn: day('2026-10-06'), resetsStreak: true };
  await prisma.goalChange.create({ data: change });
  await prisma.goalChange.create({ data: { ...change, kind: 'BEDTIME', sleepMinutes: null, bedtime: '22:30', resetsStreak: false } });
  await expect(prisma.goalChange.create({ data: { ...change, sleepMinutes: 420 } })).rejects.toMatchObject({ code: 'P2002' });
});

it('adds a null achievementsSince to User and a false onTime to HabitCheckIn', async () => {
  const user = await createUser();
  expect(user.achievementsSince).toBeNull();
  const checkIn = await prisma.habitCheckIn.create({ data: { userId: user.id, habitDay: day('2026-10-06') } });
  expect(checkIn.onTime).toBe(false);
});

it('removes achievements and goal changes with their user', async () => {
  const user = await prisma.user.create({ data: { email: `ach-${randomUUID()}@example.com`, name: 'Test User' } });
  await prisma.achievement.create({ data: level(user.id, 1) });
  await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-06'), resetsStreak: false } });
  await prisma.user.delete({ where: { id: user.id } });
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('coach-data deletion leaves achievements, goal changes and check-in flags alone', async () => {
  const user = await createUser();
  await prisma.achievement.create({ data: level(user.id, 1) });
  await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-06'), resetsStreak: false } });
  const checkIn = await prisma.habitCheckIn.create({ data: { userId: user.id, habitDay: day('2026-10-06'), onTime: true } });
  await deleteUserCoachData(user.id);
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(1);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(1);
  expect((await prisma.habitCheckIn.findUniqueOrThrow({ where: { id: checkIn.id } })).onTime).toBe(true);
});
