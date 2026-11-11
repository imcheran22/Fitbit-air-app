// Stat Engine backtest (spec §3): replays stored BiometricRecord history through
// a candidate score-config version and diffs the result against the live one.
//
// THIS IS A REGRESSION CHECK, NOT A CORRECTNESS VALIDATION. It shows what a
// change does; there is no ground-truth "recovery" label, so it cannot show a
// version is more accurate. The output says so.
//
// Read-only: it never writes scores, snapshots or flags.
//
//   npx ts-node scripts/backtest.ts --candidate v2
//   npx ts-node scripts/backtest.ts --candidate v2 --live v1 --days 90 --user <userId> --type SLEEP
//
// Replays the Recovery Score and the Sleep Score by default (--type RECOVERY|SLEEP|ALL).
//
// Rollout is then: read the diff, flip LIVE_VERSION in src/scoring/configs/index.ts, deploy.
//
// Never runs on import: the CLI entry point is guarded by require.main.
import { prisma } from '../src/db/client';
import { civilDateToUtcMidnight } from '../src/biometrics/civilDate';
import { getScoreConfig, LIVE_VERSION } from '../src/scoring/configs';
import type { ScoreConfig } from '../src/scoring/configs';
import { shiftDate } from '../src/scoring/dates';
import { backtest, BacktestReport, BacktestScoreType, BacktestUserData, formatReport } from '../src/scoring/backtest';
import { resolveSleepGoalMinutes } from '../src/users/goals';
import type { DailyPoint } from '../src/scoring/types';

export interface BacktestOptions {
  candidate: ScoreConfig;
  live?: ScoreConfig;
  /** Days of history to replay, ending at `now`. */
  days?: number;
  now?: Date;
  /** Which score to replay; defaults to RECOVERY (use runBacktestAll for both). */
  type?: BacktestScoreType;
  /** Injected so tests (and other callers) can supply data without a DB. */
  loadUsers: (range: { from: string; to: string; lookbackFrom: string }) => Promise<BacktestUserData[]>;
}

async function loadForBacktest(opts: Omit<BacktestOptions, 'type'>) {
  const live = opts.live ?? getScoreConfig(LIVE_VERSION);
  const to = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const from = shiftDate(to, -((opts.days ?? 90) - 1));
  // Enough history behind the first replayed day for the widest config's baseline + outlier window.
  const widest = Math.max(live.historyDays + live.outlier.windowDays, opts.candidate.historyDays + opts.candidate.outlier.windowDays);
  const users = await opts.loadUsers({ from, to, lookbackFrom: shiftDate(from, -widest) });
  return { live, users, range: { from, to } };
}

export async function runBacktest(opts: BacktestOptions): Promise<BacktestReport> {
  const { live, users, range } = await loadForBacktest(opts);
  return backtest(users, live, opts.candidate, range, opts.type ?? 'RECOVERY');
}

/** Replays both score types over one load of the data. */
export async function runBacktestAll(opts: Omit<BacktestOptions, 'type'>): Promise<Record<BacktestScoreType, BacktestReport>> {
  const { live, users, range } = await loadForBacktest(opts);
  return {
    RECOVERY: backtest(users, live, opts.candidate, range, 'RECOVERY'),
    SLEEP: backtest(users, live, opts.candidate, range, 'SLEEP'),
  };
}

export function dbLoader(userId?: string): BacktestOptions['loadUsers'] {
  return async ({ to, lookbackFrom }) => {
    const users = await prisma.user.findMany({
      where: userId ? { id: userId } : {},
      select: { id: true, sleepGoalMinutes: true, timezone: true },
    });
    const out: BacktestUserData[] = [];
    for (const u of users) {
      const records = await prisma.biometricRecord.findMany({
        where: {
          userId: u.id,
          recordedAt: { gte: civilDateToUtcMidnight(lookbackFrom), lte: civilDateToUtcMidnight(to) },
        },
        select: { metricType: true, value: true, recordedAt: true },
      });
      // Session ends are padded a day either side of the civil-date window (a
      // local end date can differ from the UTC one); the pipeline buckets exactly.
      const sessions = await prisma.sleepSession.findMany({
        where: {
          userId: u.id,
          endTime: { gte: civilDateToUtcMidnight(shiftDate(lookbackFrom, -1)), lt: civilDateToUtcMidnight(shiftDate(to, 2)) },
        },
        select: { startTime: true, endTime: true, minutesAsleep: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true },
      });
      const by = (type: string): DailyPoint[] =>
        records.filter((r) => r.metricType === type).map((r) => ({ date: r.recordedAt.toISOString().slice(0, 10), value: r.value }));
      out.push({
        userId: u.id,
        hrv: by('HRV'),
        rhr: by('RESTING_HR'),
        sleep: by('SLEEP'),
        steps: by('STEPS'),
        sleepGoalMinutes: resolveSleepGoalMinutes(u.sleepGoalMinutes),
        sessions,
        timezone: u.timezone,
      });
    }
    return out;
  };
}

export function parseArgs(argv: string[]): {
  candidate: string;
  live: string | undefined;
  days: number;
  userId: string | undefined;
  type: BacktestScoreType | 'ALL';
} {
  let candidate: string | undefined;
  let live: string | undefined;
  let days = 90;
  let userId: string | undefined;
  let type: BacktestScoreType | 'ALL' = 'ALL';
  const value = (i: number, flag: string) => {
    const v = argv[i];
    if (!v || v.startsWith('--')) throw new Error(`${flag} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--candidate') candidate = value(++i, arg);
    else if (arg === '--live') live = value(++i, arg);
    else if (arg === '--user') userId = value(++i, arg);
    else if (arg === '--type') {
      const t = value(++i, arg);
      if (t !== 'RECOVERY' && t !== 'SLEEP' && t !== 'ALL') throw new Error('--type must be RECOVERY, SLEEP or ALL');
      type = t;
    }
    else if (arg === '--days') {
      days = Number(value(++i, arg));
      if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer');
    } else {
      throw new Error(`Unknown argument "${arg}". Usage: backtest --candidate <version> [--live <version>] [--days N] [--user <id>] [--type RECOVERY|SLEEP|ALL]`);
    }
  }
  if (!candidate) throw new Error('--candidate <version> is required');
  return { candidate, live, days, userId, type };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const opts = {
      candidate: getScoreConfig(args.candidate),
      live: getScoreConfig(args.live ?? LIVE_VERSION),
      days: args.days,
      loadUsers: dbLoader(args.userId),
    };
    const reports =
      args.type === 'ALL' ? Object.values(await runBacktestAll(opts)) : [await runBacktest({ ...opts, type: args.type })];
    console.log(reports.map((r) => formatReport(r)).join('\n\n'));
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
