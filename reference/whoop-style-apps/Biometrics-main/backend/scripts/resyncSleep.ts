// One-time ops script (Stat Engine Slice 0): wipe and re-sync SLEEP data.
//
// Existing SLEEP BiometricRecord rows are keyed by the OLD convention (UTC date
// of the session START, last session wins). Once the SleepSession table and the
// derived rollup exist, leaving them would put the same night under two keys
// (double-counted) and leave every baseline built on a mixed-convention
// history. So: delete them, then enqueue the existing backfill job, which
// repopulates SleepSession and the rollup under the new key (local civil date
// of the session END, in User.timezone).
//
// DRY-RUN BY DEFAULT. Nothing is deleted or enqueued without --apply.
//
//   npx ts-node scripts/resyncSleep.ts                    # dry run, all users
//   npx ts-node scripts/resyncSleep.ts --user <userId>    # dry run, one user
//   npx ts-node scripts/resyncSleep.ts --apply            # execute, all users
//   npx ts-node scripts/resyncSleep.ts --apply --user <userId>
//
// Run it AFTER the Slice 0 migration and worker are deployed (so the backfill
// job writes sessions) and after clients have had a chance to report
// User.timezone -- otherwise rollups are built under the "UTC" default and
// re-derived when the client later reports its zone (PUT /me/timezone).
//
// Only users with a CONNECTED health connection are wiped: a backfill job for a
// disconnected user does nothing, so deleting their rows would destroy history
// nothing can restore. They are reported as skipped and left untouched.
//
// Safe to re-run: the scope is every user with a connection (not "users that
// still have SLEEP rows"), so a run interrupted after a delete but before its
// enqueue is repaired by running the script again.
//
// Never runs on import: the CLI entry point is guarded by require.main.
import { prisma } from '../src/db/client';
import { BACKFILL_WINDOW_DAYS } from '../src/health/routes';
import { recomputeAllSleepRollups } from '../src/biometrics/repository';
import type { BackfillJobData } from '../src/sync/queue';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResyncOptions {
  apply: boolean;
  /** Restrict to one user; omitted means every user with a connection or SLEEP rows. */
  userId?: string | undefined;
  /** Injected so tests (and the CLI) choose how backfill jobs are queued. */
  enqueue: (data: BackfillJobData) => Promise<unknown>;
  now?: Date;
}

export interface ResyncSummary {
  applied: boolean;
  usersInScope: number;
  /** In scope but without a CONNECTED health connection: left untouched. */
  usersSkippedDisconnected: number;
  /** Rows deleted (or, on a dry run, that would be deleted). */
  sleepRecordsDeleted: number;
  backfillsEnqueued: number;
  /** User ids whose backfill could not be enqueued after their rows were deleted; re-run to repair. */
  enqueueFailures: string[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function resyncSleep(opts: ResyncOptions): Promise<ResyncSummary> {
  const now = opts.now ?? new Date();
  const endDate = isoDate(now);
  // The floor, not the whole story: the delete below is unbounded by date, so
  // the re-backfill has to reach at least as far back as the oldest row it
  // destroys (computed per user), or that history is gone for good.
  const windowStart = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - BACKFILL_WINDOW_DAYS * DAY_MS));

  const users = await prisma.user.findMany({
    where: opts.userId
      ? { id: opts.userId }
      : { OR: [{ healthConnection: { isNot: null } }, { biometricRecords: { some: { metricType: 'SLEEP' } } }] },
    select: { id: true, healthConnection: { select: { status: true } } },
  });

  const summary: ResyncSummary = {
    applied: opts.apply,
    usersInScope: users.length,
    usersSkippedDisconnected: 0,
    sleepRecordsDeleted: 0,
    backfillsEnqueued: 0,
    enqueueFailures: [],
  };

  for (const user of users) {
    if (user.healthConnection?.status !== 'CONNECTED') {
      summary.usersSkippedDisconnected += 1;
      continue;
    }

    const where = { userId: user.id, metricType: 'SLEEP' as const };
    if (!opts.apply) {
      summary.sleepRecordsDeleted += await prisma.biometricRecord.count({ where });
      continue;
    }

    // Read the oldest night BEFORE deleting it, so the backfill window can be
    // widened to cover everything this user is about to lose.
    const oldest = await prisma.biometricRecord.findFirst({
      where,
      orderBy: { recordedAt: 'asc' },
      select: { recordedAt: true },
    });
    const oldestDate = oldest ? isoDate(oldest.recordedAt) : undefined;
    const startDate = oldestDate && oldestDate < windowStart ? oldestDate : windowStart;

    // Delete strictly before enqueueing: a backfill that ran first and then got
    // wiped would leave the user with no SLEEP rollups at all.
    summary.sleepRecordsDeleted += (await prisma.biometricRecord.deleteMany({ where })).count;
    // Re-derive the rollups of nights already in SleepSession now: the backfill
    // only rewrites the rollup of a session that is new or changed, so a night
    // it re-fetches unchanged would otherwise be left with no rollup at all.
    await recomputeAllSleepRollups(user.id);
    try {
      await opts.enqueue({ userId: user.id, startDate, endDate });
      summary.backfillsEnqueued += 1;
    } catch (err) {
      console.error(`Failed to enqueue backfill for user ${user.id}; re-run the script to repair`, err);
      summary.enqueueFailures.push(user.id);
    }
  }

  return summary;
}

export function parseArgs(argv: string[]): { apply: boolean; userId: string | undefined } {
  let apply = false;
  let userId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--user') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('--user requires a user id');
      userId = value;
    } else {
      throw new Error(`Unknown argument "${arg}". Usage: resyncSleep [--apply] [--user <id>]`);
    }
  }
  return { apply, userId };
}

async function main() {
  const { apply, userId } = parseArgs(process.argv.slice(2));
  // Loaded lazily so importing this module (e.g. from tests) never opens a Redis connection.
  const queue = await import('../src/sync/queue');
  try {
    const summary = await resyncSleep({ apply, userId, enqueue: queue.enqueueBackfillJob });
    console.log(apply ? 'APPLIED' : 'DRY RUN (pass --apply to execute)');
    console.log(`  users in scope:                  ${summary.usersInScope}`);
    console.log(`  skipped (no CONNECTED health):   ${summary.usersSkippedDisconnected}`);
    console.log(`  SLEEP rows ${apply ? 'deleted' : 'to delete'}:            ${summary.sleepRecordsDeleted}`);
    console.log(`  backfill jobs enqueued:          ${summary.backfillsEnqueued}`);
    if (summary.enqueueFailures.length > 0) {
      console.error(`  ENQUEUE FAILURES (${summary.enqueueFailures.length}): ${summary.enqueueFailures.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await queue.connection.quit();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
