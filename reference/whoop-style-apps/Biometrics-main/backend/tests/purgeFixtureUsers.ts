import { DEFAULT_FIXTURE_SUFFIX, isTestDatabaseUrl, purgeUsersByEmailSuffix } from '../scripts/purgeTestFixtures';
import { prisma } from '../src/db/client';

/**
 * Shared body of jest's globalSetup / globalTeardown: removes the throwaway
 * "@example.com" users every DB-backed suite leaves behind.
 *
 * Runs ONLY when the database the tests use is a "_test" one (both the URL the
 * Prisma client reads and, when set, the URL migrateTestDb() targets), and never
 * fails the run: a purge that cannot happen (no database yet, an unmigrated
 * schema) is reported and skipped, because the suites migrate the database
 * themselves and the next run will purge instead.
 */
export async function purgeFixtureUsers(phase: 'start' | 'end'): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!isTestDatabaseUrl(process.env.DATABASE_URL) || (testUrl !== undefined && !isTestDatabaseUrl(testUrl))) {
    return;
  }
  const startedAt = Date.now();
  try {
    const summary = await purgeUsersByEmailSuffix(DEFAULT_FIXTURE_SUFFIX);
    if (summary.users > 0) {
      const rows = Object.values(summary.counts).reduce((a, b) => a + b, 0);
      console.log(
        `[jest ${phase}] purged ${summary.users} fixture users (${rows} rows) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
    }
  } catch (err) {
    console.warn(`[jest ${phase}] fixture purge skipped: ${err instanceof Error ? err.message : 'unknown error'}`);
  } finally {
    await prisma.$disconnect();
  }
}
