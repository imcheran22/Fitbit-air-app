import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_FIXTURE_SUFFIX,
  assertTestDatabase,
  databaseNameOf,
  formatSummary,
  main,
  parseArgs,
  purgeUsersByEmailSuffix,
} from '../../scripts/purgeTestFixtures';
import { purgeFixtureUsers } from '../purgeFixtureUsers';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { USER_OWNED_MODELS, deleteUserAccount } from '../../src/users/deletion';
import { countOwnedRows, createUserWithEmail, seedAllOwnedRows, totalRows } from '../users/ownedData';

const DEV_URL = 'postgresql://postgres:postgres@localhost:5434/biometrics_dev';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Every test uses its own suffix, so it can never match (or delete) anyone
// else's fixtures -- in particular not the "@example.com" ones.
const uniqueSuffix = () => `@purge-${randomUUID().slice(0, 8)}.test`;
const emailWith = (suffix: string) => `u-${randomUUID()}${suffix}`;

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Users a test deliberately keeps (they do not match its suffix) are removed here.
const survivors: string[] = [];
afterEach(async () => {
  for (const id of survivors.splice(0)) {
    await deleteUserAccount(id, { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} });
  }
  process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  if (ORIGINAL_TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_TEST_DATABASE_URL;
  jest.restoreAllMocks();
});

async function seededUser(email: string, keep = false) {
  const user = await createUserWithEmail(email);
  await seedAllOwnedRows(user.id);
  if (keep) survivors.push(user.id);
  return user;
}

describe('purgeUsersByEmailSuffix', () => {
  it('deletes matching users and all their data, returning per-table counts, and leaves a non-matching user untouched', async () => {
    const suffix = uniqueSuffix();
    const a = await seededUser(emailWith(suffix));
    const b = await seededUser(emailWith(suffix));
    const keeper = await seededUser(`keeper-${randomUUID()}@not-a-fixture.test`, true);
    const keeperBefore = await countOwnedRows(keeper.id);
    expect(Object.values(keeperBefore).every((n) => n === 1)).toBe(true);

    const summary = await purgeUsersByEmailSuffix(suffix);

    expect(summary.applied).toBe(true);
    expect(summary.users).toBe(2);
    expect(summary.counts.User).toBe(2);
    for (const model of USER_OWNED_MODELS) expect([model, summary.counts[model]]).toEqual([model, 2]);
    for (const id of [a.id, b.id]) {
      expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
      expect(totalRows(await countOwnedRows(id))).toBe(0);
    }
    expect(await prisma.user.findUnique({ where: { id: keeper.id } })).not.toBeNull();
    expect(await countOwnedRows(keeper.id)).toEqual(keeperBefore);
  });

  it('matches by suffix only: a user whose email merely contains the domain is kept', async () => {
    const suffix = uniqueSuffix();
    const inside = await seededUser(`a${suffix}.extra`, true);
    const prefix = await seededUser(`${suffix.slice(1)}-x@other.test`, true);

    const summary = await purgeUsersByEmailSuffix(suffix);

    expect(summary.users).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: inside.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: prefix.id } })).not.toBeNull();
  });

  it('a dry run counts exactly what an apply would delete, and deletes nothing', async () => {
    const suffix = uniqueSuffix();
    const user = await seededUser(emailWith(suffix));

    const dry = await purgeUsersByEmailSuffix(suffix, { dryRun: true });

    expect(dry.applied).toBe(false);
    expect(dry.users).toBe(1);
    for (const model of USER_OWNED_MODELS) expect([model, dry.counts[model]]).toEqual([model, 1]);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(Object.values(await countOwnedRows(user.id)).every((n) => n === 1)).toBe(true);

    const real = await purgeUsersByEmailSuffix(suffix);
    expect(real.counts).toEqual(dry.counts);
  });

  it('is a fast no-op when nothing matches: no transaction is opened', async () => {
    const transaction = jest.spyOn(prisma, '$transaction');

    const summary = await purgeUsersByEmailSuffix(uniqueSuffix());

    expect(summary.users).toBe(0);
    expect(Object.values(summary.counts).every((n) => n === 0)).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('is atomic: if the user delete fails, nothing is deleted', async () => {
    const suffix = uniqueSuffix();
    const user = await seededUser(emailWith(suffix), true);
    const before = await countOwnedRows(user.id);
    jest.spyOn(prisma.user, 'deleteMany').mockImplementationOnce((() => prisma.$queryRaw`SELECT 1/0`) as never);

    await expect(purgeUsersByEmailSuffix(suffix)).rejects.toThrow();

    expect(await countOwnedRows(user.id)).toEqual(before);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it.each([[''], ['@'], ['example.com'], ['.com'], ['@example'], ['@a b.com'], ['@@example.com']])(
    'rejects the dangerous or malformed suffix %j before touching the database',
    async (suffix) => {
      const client = { user: { count: jest.fn() }, $transaction: jest.fn() } as unknown as PrismaClient;

      await expect(purgeUsersByEmailSuffix(suffix, { client })).rejects.toThrow('Email suffix');

      expect(client.user.count).not.toHaveBeenCalled();
      expect(client.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses a database whose name does not end with _test, before any query', async () => {
    process.env.DATABASE_URL = DEV_URL;
    const client = { user: { count: jest.fn() }, $transaction: jest.fn() } as unknown as PrismaClient;

    await expect(purgeUsersByEmailSuffix(DEFAULT_FIXTURE_SUFFIX, { client })).rejects.toThrow('_test');
    await expect(purgeUsersByEmailSuffix(DEFAULT_FIXTURE_SUFFIX, { client, dryRun: true })).rejects.toThrow('_test');

    expect(client.user.count).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});

describe('database guard', () => {
  it.each([
    ['postgresql://u:p@localhost:5434/biometrics_test', 'biometrics_test'],
    ['postgresql://u:p@localhost:5434/biometrics_test?schema=public', 'biometrics_test'],
    ['postgresql://u:p@localhost:5434/biometrics_dev', 'biometrics_dev'],
    ['postgresql://u:p@localhost:5434', null],
    ['not a url', null],
    [undefined, null],
  ])('reads the database name from %s', (url, name) => {
    expect(databaseNameOf(url)).toBe(name);
  });

  it('accepts only names ending with _test', () => {
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5434/biometrics_test')).not.toThrow();
    for (const url of [
      DEV_URL,
      'postgresql://u:p@localhost:5434/biometrics',
      'postgresql://u:p@localhost:5434/biometrics_test_backup',
      'postgresql://u:p@localhost:5434/test_biometrics',
      'postgresql://u:p@localhost:5434/',
      '',
    ]) {
      expect(() => assertTestDatabase(url)).toThrow('_test');
    }
  });

  it('the error does not echo the connection string', () => {
    let message = '';
    try {
      assertTestDatabase('postgresql://postgres:hunter2@db.internal:5432/prod');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('_test');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('prod');
  });
});

describe('CLI', () => {
  it('parses arguments: dry run and @example.com by default', () => {
    expect(parseArgs([])).toEqual({ apply: false, suffix: '@example.com' });
    expect(parseArgs(['--apply'])).toEqual({ apply: true, suffix: '@example.com' });
    expect(parseArgs(['--suffix', '@x.test', '--apply'])).toEqual({ apply: true, suffix: '@x.test' });
    expect(() => parseArgs(['--suffix'])).toThrow('--suffix');
    expect(() => parseArgs(['--wat'])).toThrow('Unknown argument');
  });

  it('is a dry run without --apply: prints counts and deletes nothing', async () => {
    const suffix = uniqueSuffix();
    const user = await seededUser(emailWith(suffix), true);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await main(['--suffix', suffix]);

    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Would delete 1 user(s)');
    expect(printed).toContain('Dry run');
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('deletes with --apply', async () => {
    const suffix = uniqueSuffix();
    const user = await seededUser(emailWith(suffix));
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await main(['--suffix', suffix, '--apply']);

    expect(String(log.mock.calls[0]?.[0])).toContain('Deleted 1 user(s)');
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('refuses to run against a non-_test database, even with --apply', async () => {
    process.env.DATABASE_URL = DEV_URL;

    await expect(main(['--apply'])).rejects.toThrow('_test');
  });

  it('formats only non-zero tables', () => {
    const text = formatSummary('@x.test', {
      applied: true,
      users: 1,
      counts: { ...Object.fromEntries(USER_OWNED_MODELS.map((m) => [m, 0])), User: 1, DailyScore: 4 } as never,
    });
    expect(text).toContain('DailyScore: 4');
    expect(text).not.toContain('PushToken');
  });
});

describe('jest global setup/teardown purge (purgeFixtureUsers)', () => {
  it('purges @example.com fixture users on a _test database but never a differently-named user', async () => {
    const fixture = await seededUser(`fx-${randomUUID()}@example.com`);
    const real = await seededUser(`real-${randomUUID()}@gmail.test`, true);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await purgeFixtureUsers('start');

    expect(await prisma.user.findUnique({ where: { id: fixture.id } })).toBeNull();
    expect(totalRows(await countOwnedRows(fixture.id))).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
  });

  it('does nothing when DATABASE_URL is not a _test database', async () => {
    const fixture = await seededUser(`fx-${randomUUID()}@example.com`, true);
    process.env.DATABASE_URL = DEV_URL;

    await purgeFixtureUsers('start');
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;

    expect(await prisma.user.findUnique({ where: { id: fixture.id } })).not.toBeNull();
  });

  it('does nothing when TEST_DATABASE_URL (the migration target) is not a _test database', async () => {
    const fixture = await seededUser(`fx-${randomUUID()}@example.com`, true);
    process.env.TEST_DATABASE_URL = DEV_URL;

    await purgeFixtureUsers('start');

    expect(await prisma.user.findUnique({ where: { id: fixture.id } })).not.toBeNull();
  });

  it('never fails the run: a purge error is reported as a warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(prisma.user, 'count').mockRejectedValueOnce(new Error('relation "User" does not exist'));

    await expect(purgeFixtureUsers('start')).resolves.toBeUndefined();

    expect(String(warn.mock.calls[0]?.[0])).toContain('skipped');
  });
});
