import { prisma } from '../../src/db/client';
import { lastCompletedPeriodStart } from '../../src/recap/periods';
import { connection, syncQueue } from '../../src/sync/queue';
import { SAMPLE_LEVELS, assertDevDatabase, main, parseEmail, seedAchievements } from '../../scripts/seedAchievements';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

// The seed path never touches Redis, but importing it opens the shared sync connection: stub it so the
// CLI's closers can be checked.
jest.mock('../../src/sync/queue', () => ({
  connection: { quit: jest.fn().mockResolvedValue('OK') },
  syncQueue: { close: jest.fn().mockResolvedValue(undefined) },
}));

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const LOCAL = { DATABASE_URL: 'postgresql://dev@localhost:5432/biometrics_dev' };
const NOW = new Date('2026-10-10T12:00:00Z');
const key = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);
const named = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as Error).name;
  }
  return 'no error';
};
const local = (DATABASE_URL: string) => () => assertDevDatabase({ DATABASE_URL });

it('refuses production and any database that is not local', () => {
  expect(() => assertDevDatabase({ ...LOCAL, NODE_ENV: 'production' })).toThrow('production');
  expect(named(() => assertDevDatabase({ ...LOCAL, NODE_ENV: 'production' }))).toBe('SeedProductionRefused');
  expect(() => assertDevDatabase({ DATABASE_URL: 'postgresql://dev@db.example.com:5432/biometrics' })).toThrow('not a local database');
  expect(named(() => assertDevDatabase({}))).toBe('SeedNonLocalRefused');
  expect(named(local('postgresql://dev@localhost.evil.com:5432/db'))).toBe('SeedNonLocalRefused');
  expect(() => assertDevDatabase(LOCAL)).not.toThrow();
  expect(() => assertDevDatabase({ DATABASE_URL: 'postgresql://dev@127.0.0.1:5432/db' })).not.toThrow();
});

it('refuses a host or hostaddr query parameter that points away from this machine', () => {
  expect(named(local('postgresql://u@localhost/db?host=remote-host.invalid'))).toBe('SeedNonLocalRefused');
  expect(named(local('postgresql://u@localhost/db?hostaddr=10.0.0.5'))).toBe('SeedNonLocalRefused');
  expect(named(local('postgresql://u@localhost/db?host=localhost,remote-host.invalid'))).toBe('SeedNonLocalRefused');
  expect(named(local('postgresql://u@localhost/db?host=/tmp&host=remote-host.invalid'))).toBe('SeedNonLocalRefused');
  expect(local('postgresql://u@localhost/db?host=/tmp')).not.toThrow();
  expect(local('postgresql://u@localhost/db?host=127.0.0.1&hostaddr=::1')).not.toThrow();
});

it('reads --email and names a usage error', () => {
  expect(parseEmail(['--email', 'demo@example.com'])).toBe('demo@example.com');
  expect(named(() => parseEmail([]))).toBe('SeedUsageError');
  expect(named(() => parseEmail(['--email']))).toBe('SeedUsageError');
});

it('awards the sample levels once, two still to celebrate, and claims a start date with starting goals', async () => {
  const user = await createUser({ sleepGoalMinutes: 450 });
  const first = await seedAchievements({ email: user.email, now: NOW, env: LOCAL });
  const again = await seedAchievements({ email: user.email, now: NOW, env: LOCAL });
  expect(first).toEqual({ userId: user.id, created: SAMPLE_LEVELS.length, skipped: 0 });
  expect(again.created).toBe(0);
  expect(await prisma.achievement.count({ where: { userId: user.id, celebratedAt: null } })).toBe(2);
  const row = await prisma.achievement.findUniqueOrThrow({ where: { userId_family_level: { userId: user.id, family: 'SLEEP_GOAL', level: 2 } } });
  expect([row.value, key(row.earnedOn), key(row.weekStart), key(row.monthStart)]).toEqual([7, '2026-10-02', '2026-09-28', '2026-10-01']);
  // The monthly level is earned on the last day of the newest complete month.
  const monthly = await prisma.achievement.findUniqueOrThrow({ where: { userId_family_level: { userId: user.id, family: 'EVERY_DAY_LOGGED', level: 1 } } });
  expect([monthly.value, key(monthly.earnedOn), key(monthly.monthStart)]).toEqual([1, '2026-09-30', '2026-09-01']);
  expect(key((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).achievementsSince)).toBe('2026-09-01');
  const goals = await prisma.goalChange.findMany({ where: { userId: user.id }, orderBy: { kind: 'asc' } });
  expect(goals.map((g) => [g.kind, key(g.effectiveOn), g.sleepMinutes])).toEqual([
    ['SLEEP_MINUTES', '2026-09-01', 450],
    ['BEDTIME', '2026-09-01', null],
  ]);
});

it.each(['2026-10-01T12:00:00Z', '2026-10-31T12:00:00Z', '2026-03-01T12:00:00Z', '2026-12-27T12:00:00Z'])(
  'on %s the newest complete week and month both get levels, in order and from the start date on',
  async (iso) => {
    const now = new Date(iso);
    const today = iso.slice(0, 10);
    const user = await createUser();
    const { created } = await seedAchievements({ email: user.email, now, env: LOCAL });
    expect(created).toBe(SAMPLE_LEVELS.length);
    const rows = await prisma.achievement.findMany({ where: { userId: user.id } });
    const since = key((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).achievementsSince)!;
    expect(rows.some((r) => key(r.monthStart) === lastCompletedPeriodStart('MONTH', today))).toBe(true);
    expect(rows.some((r) => key(r.weekStart) === lastCompletedPeriodStart('WEEK', today))).toBe(true);
    for (const r of rows) {
      expect(key(r.earnedOn)! >= since).toBe(true);
      expect(key(r.earnedOn)! < today).toBe(true);
    }
    const sleep = (level: number) => key(rows.find((r) => r.family === 'SLEEP_GOAL' && r.level === level)!.earnedOn)!;
    expect(sleep(1) < sleep(2)).toBe(true);
  },
);

it('skips levels that would fall before a start date already set, and leaves that start date alone', async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: new Date('2026-10-01T00:00:00Z') } });
  const result = await seedAchievements({ email: user.email, now: NOW, env: LOCAL });
  expect(result).toEqual({ userId: user.id, created: 3, skipped: 2 });
  const rows = await prisma.achievement.findMany({ where: { userId: user.id } });
  expect(rows.every((r) => key(r.earnedOn)! >= '2026-10-01')).toBe(true);
  expect(key((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).achievementsSince)).toBe('2026-10-01');
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('refuses an unknown email', async () => {
  await expect(seedAchievements({ email: 'nobody-here@example.com', now: NOW, env: LOCAL })).rejects.toThrow('No user');
  await expect(seedAchievements({ email: 'nobody-here@example.com', now: NOW, env: LOCAL })).rejects.toMatchObject({ name: 'SeedUnknownUser' });
});

describe('the CLI closes the database, the queue and the Redis connection', () => {
  const quit = connection.quit as unknown as jest.Mock;
  const close = syncQueue.close as unknown as jest.Mock;
  let info: jest.SpyInstance;
  beforeEach(() => {
    quit.mockReset().mockResolvedValue('OK');
    close.mockReset().mockResolvedValue(undefined);
    info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => info.mockRestore());

  it('after a seed that worked', async () => {
    const user = await createUser();
    await main(['--email', user.email]);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"event":"achievements.seeded"'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('after a failure, still with the failure itself', async () => {
    await expect(main([])).rejects.toMatchObject({ name: 'SeedUsageError' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('when a closer fails, without hiding the result', async () => {
    close.mockRejectedValue(new Error('queue close failed'));
    quit.mockRejectedValue(new Error('quit failed'));
    await expect(main(['--email', 'nobody-here@example.com'])).rejects.toMatchObject({ name: 'SeedUnknownUser' });
    const user = await createUser();
    await expect(main(['--email', user.email])).resolves.toBeUndefined();
    expect(quit).toHaveBeenCalledTimes(2);
  });
});
