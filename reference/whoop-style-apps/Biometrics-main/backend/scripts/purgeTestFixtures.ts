// Test-database hygiene: delete fixture users (and everything they own) whose
// email ends with a suffix, "@example.com" by default. Every DB-backed test
// creates throwaway users under that domain and none of them clean up, so
// biometrics_test accumulates them by the thousand. The same purge runs at the
// start and end of every jest run (tests/globalSetup.ts, tests/globalTeardown.ts).
//
// DRY-RUN BY DEFAULT. Nothing is deleted without --apply.
//
//   npx ts-node scripts/purgeTestFixtures.ts                       # dry run: prints counts
//   npx ts-node scripts/purgeTestFixtures.ts --apply               # execute
//   npx ts-node scripts/purgeTestFixtures.ts --suffix @fixtures.test [--apply]
//
// REFUSES to run unless the database name in DATABASE_URL ends with "_test", so
// it cannot be pointed at a development or production database by mistake.
// Users whose email does not match the suffix are never touched.
//
// Never runs on import: the CLI entry point is guarded by require.main.
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../src/db/client';
import { USER_OWNED_MODELS, delegateFor, deleteOwnedRows, type OwnedCounts } from '../src/users/deletion';

export const DEFAULT_FIXTURE_SUFFIX = '@example.com';

/** The database name of a Postgres connection URL, or null when it cannot be read. */
export function databaseNameOf(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
    return name === '' ? null : name;
  } catch {
    return null;
  }
}

export function isTestDatabaseUrl(databaseUrl: string | undefined): boolean {
  return databaseNameOf(databaseUrl)?.endsWith('_test') ?? false;
}

/** Throws unless `databaseUrl` (default: DATABASE_URL) names a database ending in "_test". */
export function assertTestDatabase(databaseUrl: string | undefined = process.env.DATABASE_URL): void {
  if (!isTestDatabaseUrl(databaseUrl)) {
    // The database name is deliberately not echoed: it is only ever wrong here.
    throw new Error('Refusing to run: DATABASE_URL must name a database whose name ends with "_test"');
  }
}

// "@" then a dotted domain: an empty or bare suffix (which would match every
// user) is rejected outright.
const SUFFIX_PATTERN = /^@[^@\s]+\.[^@\s]+$/;

export interface PurgeOptions {
  /** Count only; delete nothing. */
  dryRun?: boolean;
  /** Injected for tests. */
  client?: PrismaClient;
}

export interface PurgeSummary {
  /** True when rows were actually deleted; false on a dry run. */
  applied: boolean;
  /** Matching users (deleted, or on a dry run, that would be). */
  users: number;
  /** Per-table row counts, likewise. */
  counts: OwnedCounts;
}

export function emptyCounts(): OwnedCounts {
  const counts = { User: 0 } as OwnedCounts;
  for (const model of USER_OWNED_MODELS) counts[model] = 0;
  return counts;
}

/**
 * Deletes every user whose email ends with `suffix`, and every row they own,
 * in one transaction (per-table deleteMany filtered through the user relation,
 * in USER_OWNED_MODELS order). Refuses a database that is not a "_test" one.
 * Fast when nothing matches: one count query, no transaction.
 */
export async function purgeUsersByEmailSuffix(suffix: string, opts: PurgeOptions = {}): Promise<PurgeSummary> {
  assertTestDatabase();
  if (!SUFFIX_PATTERN.test(suffix)) {
    throw new Error('Email suffix must look like "@domain.tld"');
  }
  const client = opts.client ?? defaultPrisma;
  const userWhere = { email: { endsWith: suffix } };

  const users = await client.user.count({ where: userWhere });
  if (users === 0) return { applied: !opts.dryRun, users: 0, counts: emptyCounts() };

  if (opts.dryRun) {
    const counts = emptyCounts();
    counts.User = users;
    for (const model of USER_OWNED_MODELS) {
      counts[model] = await delegateFor(client, model).count({ where: { user: userWhere } });
    }
    return { applied: false, users, counts };
  }

  const counts = await deleteOwnedRows(client, { user: userWhere }, userWhere);
  return { applied: true, users: counts.User, counts };
}

export interface CliArgs {
  apply: boolean;
  suffix: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false, suffix: DEFAULT_FIXTURE_SUFFIX };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--suffix') {
      const value = argv[++i];
      if (!value) throw new Error('--suffix needs a value');
      args.suffix = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function formatSummary(suffix: string, summary: PurgeSummary): string {
  const verb = summary.applied ? 'Deleted' : 'Would delete';
  const lines = [`${verb} ${summary.users} user(s) with email ending "${suffix}" and their data:`];
  for (const [table, count] of Object.entries(summary.counts)) {
    if (count > 0) lines.push(`  ${table}: ${count}`);
  }
  if (!summary.applied) lines.push('Dry run: nothing was deleted. Re-run with --apply to delete.');
  return lines.join('\n');
}

/** The CLI body. Checks the database BEFORE anything is queried. */
export async function main(argv: string[]): Promise<void> {
  assertTestDatabase();
  const { apply, suffix } = parseArgs(argv);
  const summary = await purgeUsersByEmailSuffix(suffix, { dryRun: !apply });
  console.log(formatSummary(suffix, summary));
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => defaultPrisma.$disconnect());
}
