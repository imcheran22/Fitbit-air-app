// Ops script: recompute one user's stored scores under the LIVE algorithm
// version, inline, without waiting for the nightly sweep.
//
//   npx ts-node scripts/rescoreUser.ts --user <userId> [--days 90]
//
// For each civil date in the window (today back --days days, inclusive) it
// calls computeDailyScore, the same single job the queue runs, so the result is
// exactly what the sweep would eventually produce. It only ever overwrites
// DERIVED rows (DailyScore, UserDailyFeatures, BaselineSnapshot, outlier
// flags); BiometricRecord and SleepSession are read, never written. Idempotent:
// every write is an upsert keyed on (user, date[, metric|type]), so running it
// twice leaves the same rows.
//
// Never runs on import: the CLI entry point is guarded by require.main.
import { prisma } from '../src/db/client';
import { getLiveConfig } from '../src/scoring/configs';
import { computeDailyScore } from '../src/scoring/compute';
import { civilDateToUtcMidnight } from '../src/biometrics/civilDate';
import { shiftDate } from '../src/scoring/dates';

export const DEFAULT_RESCORE_DAYS = 90;

export interface RescoreSummary {
  userId: string;
  /** Civil dates visited: the whole window. */
  daysProcessed: number;
  /** Days that had an observed input and so carry a score. */
  rescored: number;
  /** Days in the window with no observed input (nothing to score; any leftover derived rows are removed). */
  noInput: number;
  /** The version(s) the user's DailyScore rows in the window now carry (just the live one after a run; empty if the window holds no scores). */
  versions: string[];
}

export async function rescoreUser(
  userId: string,
  { days = DEFAULT_RESCORE_DAYS, now = new Date() }: { days?: number; now?: Date } = {},
): Promise<RescoreSummary> {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new Error(`User "${userId}" not found`);

  const today = now.toISOString().slice(0, 10);
  const from = shiftDate(today, -(days - 1));
  let rescored = 0;
  let noInput = 0;
  // Oldest first, like the live job would have run them.
  for (let i = 0; i < days; i++) {
    const outcome = await computeDailyScore(userId, shiftDate(from, i));
    if (outcome === 'scored') rescored++;
    else if (outcome === 'no-input') noInput++;
    else throw new Error(`User "${userId}" was deleted while rescoring`);
  }

  const rows = await prisma.dailyScore.findMany({
    where: { userId, date: { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(today) } },
    select: { algorithmVersion: true },
    distinct: ['algorithmVersion'],
  });
  const versions = rows.map((r) => r.algorithmVersion).sort();
  return { userId, daysProcessed: days, rescored, noInput, versions };
}

export function parseArgs(argv: string[]): { userId: string; days: number } {
  let userId: string | undefined;
  let days = DEFAULT_RESCORE_DAYS;
  const value = (i: number, flag: string) => {
    const v = argv[i];
    if (!v || v.startsWith('--')) throw new Error(`${flag} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user') userId = value(++i, arg);
    else if (arg === '--days') {
      days = Number(value(++i, arg));
      if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer');
    } else {
      throw new Error(`Unknown argument "${arg}". Usage: rescoreUser --user <userId> [--days N]`);
    }
  }
  if (!userId) throw new Error('--user <userId> is required');
  return { userId, days };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const summary = await rescoreUser(args.userId, { days: args.days });
    console.log(
      `Rescored ${summary.rescored} of ${summary.daysProcessed} days for user ${summary.userId} ` +
        `(${summary.noInput} had no input). Scores now carry version: ${summary.versions.join(', ') || 'none'} ` +
        `(live is ${getLiveConfig().version}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
