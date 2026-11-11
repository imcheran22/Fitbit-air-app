// One-time ops script: replace stored RESTING_HR data with Google's dedicated
// daily resting heart rate.
//
// Existing RESTING_HR BiometricRecord rows hold the OLD proxy (the daily-minimum
// BPM of the `heart-rate` rollup, about 12 bpm below true resting HR and prone to
// single-reading artifacts). Mixing them with the new dedicated values would put
// a level shift in every baseline. So: delete them, then enqueue the existing
// backfill job, which repopulates RESTING_HR from the `daily-resting-heart-rate`
// type. Scores built on the old values are re-scored by the stale-version rule
// (nightly sweep) or by the score recomputes the backfill itself triggers.
//
// DRY-RUN BY DEFAULT. Nothing is deleted or enqueued without --apply.
//
//   npx ts-node scripts/resyncRestingHr.ts                    # dry run, all users
//   npx ts-node scripts/resyncRestingHr.ts --user <userId>    # dry run, one user
//   npx ts-node scripts/resyncRestingHr.ts --apply            # execute, all users
//   npx ts-node scripts/resyncRestingHr.ts --apply --user <userId>
//
// Run it AFTER the RESTING_HR fetch change is deployed (otherwise the backfill
// would rewrite the proxy values).
//
// Only users with a CONNECTED health connection are wiped: a backfill job for a
// disconnected user does nothing, so deleting their rows would destroy history
// nothing can restore. They are reported as skipped and left untouched.
//
// Safe to re-run: the scope is every user with a connection (not "users that
// still have RESTING_HR rows"), so a run interrupted after a delete but before
// its enqueue is repaired by running the script again.
//
// Never runs on import: the CLI entry point is guarded by require.main.
import { prisma } from '../src/db/client';
import { BACKFILL_WINDOW_DAYS } from '../src/health/routes';
import type { BackfillJobData } from '../src/sync/queue';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResyncOptions {
  apply: boolean;
  /** Restrict to one user; omitted means every user with a connection or RESTING_HR rows. */
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
  restingHrRecordsDeleted: number;
  backfillsEnqueued: number;
  /** User ids whose backfill could not be enqueued after their rows were deleted; re-run to repair. */
  enqueueFailures: string[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function resyncRestingHr(opts: ResyncOptions): Promise<ResyncSummary> {
  const now = opts.now ?? new Date();
  const endDate = isoDate(now);
  const startDate = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - BACKFILL_WINDOW_DAYS * DAY_MS));

  const users = await prisma.user.findMany({
    where: opts.userId
      ? { id: opts.userId }
      : { OR: [{ healthConnection: { isNot: null } }, { biometricRecords: { some: { metricType: 'RESTING_HR' } } }] },
    select: { id: true, healthConnection: { select: { status: true } } },
  });

  const summary: ResyncSummary = {
    applied: opts.apply,
    usersInScope: users.length,
    usersSkippedDisconnected: 0,
    restingHrRecordsDeleted: 0,
    backfillsEnqueued: 0,
    enqueueFailures: [],
  };

  for (const user of users) {
    if (user.healthConnection?.status !== 'CONNECTED') {
      summary.usersSkippedDisconnected += 1;
      continue;
    }

    const where = { userId: user.id, metricType: 'RESTING_HR' as const };
    if (!opts.apply) {
      summary.restingHrRecordsDeleted += await prisma.biometricRecord.count({ where });
      continue;
    }

    // Delete strictly before enqueueing: a backfill that ran first and then got
    // wiped would leave the user with no RESTING_HR rows at all.
    summary.restingHrRecordsDeleted += (await prisma.biometricRecord.deleteMany({ where })).count;
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
      throw new Error(`Unknown argument "${arg}". Usage: resyncRestingHr [--apply] [--user <id>]`);
    }
  }
  return { apply, userId };
}

async function main() {
  const { apply, userId } = parseArgs(process.argv.slice(2));
  // Loaded lazily so importing this module (e.g. from tests) never opens a Redis connection.
  const queue = await import('../src/sync/queue');
  try {
    const summary = await resyncRestingHr({ apply, userId, enqueue: queue.enqueueBackfillJob });
    console.log(apply ? 'APPLIED' : 'DRY RUN (pass --apply to execute)');
    console.log(`  users in scope:                  ${summary.usersInScope}`);
    console.log(`  skipped (no CONNECTED health):   ${summary.usersSkippedDisconnected}`);
    console.log(`  RESTING_HR rows ${apply ? 'deleted' : 'to delete'}:       ${summary.restingHrRecordsDeleted}`);
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
