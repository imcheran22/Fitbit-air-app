/// <reference types="node" />
// Dev only: gives an existing account (the demo account) sample badge levels, so the simulator pass
// can see the Profile card, the Badges screens, a celebration (two levels are left uncelebrated)
// and the recap cards (levels dated in the newest complete week and month, whatever day it runs).
//
//   DATABASE_URL=<local dev database> node node_modules/.bin/ts-node --project tsconfig.evals.json scripts/seedAchievements.ts --email demo@example.com
//
// Refuses NODE_ENV=production and any DATABASE_URL that points off this machine (its host, and any
// host / hostaddr query parameter, must be localhost or a unix socket path). Sets the start date the
// way the app does (claimStartDate: start date and starting goals together, only where unset), and
// never dates a level before the start date. Idempotent: levels already there are skipped. Never
// runs on import: the CLI entry point is guarded by require.main. On failure it logs only the
// error's name. It closes Prisma, the sync queue and its Redis connection before exiting.
import type { AchievementFamily } from '@prisma/client';
import { familyDef } from '../src/achievements/catalogue';
import { claimStartDate } from '../src/achievements/start';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../src/biometrics/civilDate';
import { prisma } from '../src/db/client';
import { lastCompletedPeriodStart, mondayOf, monthStartOf, periodEndOf } from '../src/recap/periods';
import { shiftDate } from '../src/scoring/dates';
import { connection, syncQueue } from '../src/sync/queue';

type SeedEnv = { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function seedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

/** A host the connection may use: this machine, or a unix socket directory. */
const isLocalHost = (host: string) => LOCAL_HOSTS.has(host) || host.startsWith('/');

export function assertDevDatabase(env: SeedEnv): void {
  if (env.NODE_ENV === 'production') throw seedError('SeedProductionRefused', 'Refusing to seed achievements in production');
  const nonLocal = seedError('SeedNonLocalRefused', 'Refusing to seed achievements: DATABASE_URL is not a local database');
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw nonLocal;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) throw nonLocal;
  // libpq-style host / hostaddr parameters override the URL's host, so each one must be local too.
  const params = [...url.searchParams.getAll('host'), ...url.searchParams.getAll('hostaddr')];
  if (!params.flatMap((p) => p.split(',')).every((h) => isLocalHost(h.trim()))) throw nonLocal;
}

export function parseEmail(argv: string[]): string {
  const i = argv.indexOf('--email');
  const email = i >= 0 ? argv[i + 1] : undefined;
  if (!email) throw seedError('SeedUsageError', 'Usage: seedAchievements --email <email>');
  return email;
}

/**
 * [family, level, anchor, days after the anchor, already celebrated]. MONTH_END is the last day of
 * the newest complete month, WEEK_START the Monday of the newest complete week, so the month and
 * week recaps always get a level. A monthly family's level sits on its month's last day.
 */
export const SAMPLE_LEVELS: ReadonlyArray<readonly [AchievementFamily, number, 'MONTH_END' | 'WEEK_START', number, boolean]> = [
  ['SLEEP_GOAL', 1, 'MONTH_END', -20, true],
  ['EVERY_DAY_LOGGED', 1, 'MONTH_END', 0, true],
  ['SLEEP_GOAL', 2, 'WEEK_START', 4, true],
  ['STEADY_BEDTIME', 1, 'WEEK_START', 5, false],
  ['CHECK_IN', 1, 'WEEK_START', 6, false],
];

export async function seedAchievements({ email, now = new Date(), env = process.env }: { email: string; now?: Date; env?: SeedEnv }): Promise<{ userId: string; created: number; skipped: number }> {
  assertDevDatabase(env);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, timezone: true, achievementsSince: true, sleepGoalMinutes: true, bedtimeGoal: true },
  });
  if (!user) throw seedError('SeedUnknownUser', 'No user with that email');
  const today = localCivilDateOrUtc(now, user.timezone);
  const monthStart = lastCompletedPeriodStart('MONTH', today);
  const anchors = { MONTH_END: periodEndOf('MONTH', monthStart), WEEK_START: lastCompletedPeriodStart('WEEK', today) };
  // No start date yet: start at the newest complete month, before every sample level.
  if (!user.achievementsSince) await claimStartDate(user, monthStart);
  const since = (user.achievementsSince ?? civilDateToUtcMidnight(monthStart)).toISOString().slice(0, 10);

  const levels = SAMPLE_LEVELS.map(([family, level, anchor, offset, celebrated]) => ({
    family,
    level,
    earnedOn: shiftDate(anchors[anchor], offset),
    celebrated,
  }));
  const kept = levels.filter((l) => l.earnedOn >= since);
  const result = await prisma.achievement.createMany({
    data: kept.map(({ family, level, earnedOn, celebrated }) => ({
      userId: user.id,
      family,
      level,
      value: familyDef(family).thresholds[level - 1]!,
      earnedOn: civilDateToUtcMidnight(earnedOn),
      weekStart: civilDateToUtcMidnight(mondayOf(earnedOn)),
      monthStart: civilDateToUtcMidnight(monthStartOf(earnedOn)),
      celebratedAt: celebrated ? now : null,
    })),
    skipDuplicates: true,
  });
  return { userId: user.id, created: result.count, skipped: levels.length - kept.length };
}

/** Runs a close step, swallowing its failure so it can never mask the seed's own result. */
async function closeQuietly(close: () => Promise<unknown>): Promise<void> {
  try {
    await close();
  } catch {
    // Nothing to do: the process is exiting anyway.
  }
}

/**
 * The CLI body. The import chain (claimStartDate -> goals -> marker) opens the shared Redis
 * connection and BullMQ queue, so they are closed here too, or the process would never exit.
 */
export async function main(argv: string[]): Promise<void> {
  try {
    const { userId, created, skipped } = await seedAchievements({ email: parseEmail(argv) });
    console.info(JSON.stringify({ event: 'achievements.seeded', userId, created, skippedBeforeStart: skipped }));
  } finally {
    await closeQuietly(() => prisma.$disconnect());
    await closeQuietly(() => syncQueue.close());
    await closeQuietly(() => connection.quit());
  }
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    // Only the error's name: messages can carry the email or connection details.
    console.error(JSON.stringify({ event: 'achievements.seed_failed', error: err instanceof Error ? err.name : 'Error' }));
    process.exit(1);
  });
}
