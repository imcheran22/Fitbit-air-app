import { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import type { MarkerStore } from '../../src/recap/backfill';
import { ACHIEVEMENTS_LAUNCH_MARKER, launchInstant, runAchievementsLaunchOnce, startAchievements } from '../../src/achievements/launch';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

class MemoryStore implements MarkerStore {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
}

const day = civilDateToUtcMidnight;
// Launched at 02:00 UTC on Oct 7: the calendar date is Oct 7, but the habit day is still Oct 6.
const LAUNCH = new Date('2026-10-07T02:00:00Z');
const sinceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).achievementsSince?.toISOString().slice(0, 10) ?? null;
const checkIn = (userId: string, habitDay: string, createdAt: string, onTime = false) =>
  prisma.habitCheckIn.create({ data: { userId, habitDay: day(habitDay), createdAt: new Date(createdAt), onTime } });
const onTimeOf = async (id: string) => (await prisma.habitCheckIn.findUniqueOrThrow({ where: { id } })).onTime;
// Users exist before the launch unless a test says otherwise: a fixed createdAt, so no test depends
// on the wall clock (the DB default now() would pass LAUNCH once the real date does).
const PRE_LAUNCH = new Date('2026-10-01T00:00:00Z');
const preLaunchUser = async (over: Parameters<typeof createUser>[0] = {}) => {
  const user = await createUser(over);
  return prisma.user.update({ where: { id: user.id }, data: { createdAt: PRE_LAUNCH } });
};

it('starts every user without a start date on their local launch date, with starting goals, and leaves a set one alone', async () => {
  const auckland = await preLaunchUser({ timezone: 'Pacific/Auckland' });
  const utc = await preLaunchUser({ sleepGoalMinutes: 450 });
  const started = await preLaunchUser();
  await prisma.user.update({ where: { id: started.id }, data: { achievementsSince: day('2026-09-01') } });
  const store = new MemoryStore();

  expect(await runAchievementsLaunchOnce({ store, launchAt: LAUNCH, userIds: [auckland.id, utc.id, started.id] })).toBe(2);

  expect(await sinceOf(auckland.id)).toBe('2026-10-07');
  expect(await sinceOf(utc.id)).toBe('2026-10-07');
  expect(await sinceOf(started.id)).toBe('2026-09-01');
  const rows = await prisma.goalChange.findMany({ where: { userId: utc.id }, orderBy: { kind: 'asc' } });
  expect(rows.map((r) => [r.kind, r.effectiveOn.toISOString().slice(0, 10), r.sleepMinutes, r.bedtime, r.resetsStreak])).toEqual([
    ['SLEEP_MINUTES', '2026-10-07', 450, null, false],
    ['BEDTIME', '2026-10-07', null, null, false],
  ]);
  expect(await prisma.goalChange.count({ where: { userId: started.id } })).toBe(0);
  expect(store.values.get(ACHIEVEMENTS_LAUNCH_MARKER)).toBe(LAUNCH.toISOString());
});

it('marks launch habit day check-ins saved during that habit day as on time, and nothing else', async () => {
  const evening = await preLaunchUser();
  const eveningRow = await checkIn(evening.id, '2026-10-06', '2026-10-06T21:00:00Z');
  const afterMidnight = await preLaunchUser();
  const afterMidnightRow = await checkIn(afterMidnight.id, '2026-10-06', '2026-10-07T01:30:00Z');
  const backdated = await preLaunchUser();
  const backdatedRow = await checkIn(backdated.id, '2026-10-05', '2026-10-06T21:00:00Z');
  // Saved after the launch but still in the launch habit day: on time by the same definition.
  const afterLaunch = await preLaunchUser();
  const afterLaunchRow = await checkIn(afterLaunch.id, '2026-10-06', '2026-10-07T03:00:00Z');
  // Saved for the launch habit day once the next one had begun: late, stays off.
  const late = await preLaunchUser();
  const lateRow = await checkIn(late.id, '2026-10-06', '2026-10-07T12:00:00Z');
  // Only false -> true: a flag already on is never turned off.
  const alreadyOn = await preLaunchUser();
  const alreadyOnRow = await checkIn(alreadyOn.id, '2026-10-06', '2026-10-07T12:00:00Z', true);

  const ids = [evening.id, afterMidnight.id, backdated.id, afterLaunch.id, late.id, alreadyOn.id];
  await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: ids });

  expect(await onTimeOf(eveningRow.id)).toBe(true);
  expect(await onTimeOf(afterMidnightRow.id)).toBe(true);
  expect(await onTimeOf(backdatedRow.id)).toBe(false);
  expect(await onTimeOf(afterLaunchRow.id)).toBe(true);
  expect(await onTimeOf(lateRow.id)).toBe(false);
  expect(await onTimeOf(alreadyOnRow.id)).toBe(true);
});

it('fixes launch-day check-ins for a user whose first badge load already set the start date', async () => {
  const user = await preLaunchUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day('2026-10-07') } });
  const row = await checkIn(user.id, '2026-10-06', '2026-10-06T21:00:00Z');

  expect(await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: [user.id] })).toBe(0);

  expect(await onTimeOf(row.id)).toBe(true);
  expect(await sinceOf(user.id)).toBe('2026-10-07');
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('a rerun after a lost marker moves no start date, writes no goal row and recomputes no flag', async () => {
  const before = await preLaunchUser();
  const beforeRow = await checkIn(before.id, '2026-10-06', '2026-10-06T21:00:00Z');
  const after = await preLaunchUser();
  const afterRow = await checkIn(after.id, '2026-10-06', '2026-10-07T12:00:00Z');
  const ids = [before.id, after.id];
  await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: ids });

  expect(await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: ids })).toBe(0);

  expect(await sinceOf(before.id)).toBe('2026-10-07');
  expect(await onTimeOf(beforeRow.id)).toBe(true);
  expect(await onTimeOf(afterRow.id)).toBe(false);
  expect(await prisma.goalChange.count({ where: { userId: before.id } })).toBe(2);
});

it('takes the launch instant from the achievements migration by default', async () => {
  const at = await launchInstant();
  expect(at).toBeInstanceOf(Date);
  const user = await preLaunchUser();
  const store = new MemoryStore();
  await runAchievementsLaunchOnce({ store, userIds: [user.id] });
  expect(store.values.get(ACHIEVEMENTS_LAUNCH_MARKER)).toBe(at!.toISOString());
});

it('runs only once per marker', async () => {
  const user = await preLaunchUser();
  const store = new MemoryStore();
  store.values.set(ACHIEVEMENTS_LAUNCH_MARKER, '2026-10-01T00:00:00.000Z');
  expect(await runAchievementsLaunchOnce({ store, launchAt: LAUNCH, userIds: [user.id] })).toBe(0);
  expect(await sinceOf(user.id)).toBeNull();
});

it('startAchievements logs a failure by error class, never throws, and leaves the marker unset', async () => {
  const user = await preLaunchUser();
  const store = new MemoryStore();
  const spy = jest.spyOn(prisma.user, 'findMany').mockRejectedValueOnce(new TypeError('db down'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(startAchievements({ store, launchAt: LAUNCH, userIds: [user.id] })).resolves.toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.launch_failed', error: 'TypeError' });
  } finally {
    spy.mockRestore();
    log.mockRestore();
  }
  expect(store.values.has(ACHIEVEMENTS_LAUNCH_MARKER)).toBe(false);
});

it('a rerun does not claim a user who signed up after the launch, but still runs their on-time fix', async () => {
  const user = await preLaunchUser();
  await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date('2026-10-07T03:00:00Z') } });
  // The fix is not filtered by signup time: a pre-launch launch-day row still flips.
  const row = await checkIn(user.id, '2026-10-06', '2026-10-06T21:00:00Z');

  expect(await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: [user.id] })).toBe(0);

  expect(await sinceOf(user.id)).toBeNull();
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
  expect(await onTimeOf(row.id)).toBe(true);
});

it('claims a user created exactly at the launch instant', async () => {
  const user = await preLaunchUser();
  await prisma.user.update({ where: { id: user.id }, data: { createdAt: LAUNCH } });
  expect(await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: [user.id] })).toBe(1);
  expect(await sinceOf(user.id)).toBe('2026-10-07');
});

it('launchInstant is null, not an error, when the migrations table is missing; other errors still throw', async () => {
  // The shape Postgres + Prisma give for a raw query on a missing relation.
  const missing = new Prisma.PrismaClientKnownRequestError('relation does not exist', { code: 'P2010', clientVersion: 'test', meta: { code: '42P01' } });
  const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(missing).mockRejectedValueOnce(new TypeError('db down'));
  try {
    await expect(launchInstant()).resolves.toBeNull();
    await expect(launchInstant()).rejects.toThrow(TypeError);
  } finally {
    spy.mockRestore();
  }
});
