// The one-off launch job (spec 2026-10-06 §3), like the recap backfill's once-marker. The launch
// instant is when the achievements migration finished, so every run — including a rerun after a
// lost marker — uses the same launch day. For every user it:
//   - sets achievementsSince to their local date at launch and writes the starting goals, only
//     where the start date is still null and the user existed at the launch;
//   - marks the check-ins saved before the launch during the launch habit day as on time, whether
//     or not this run set their start date (a first badge load may have got there first).
// Every write is "only where null / only false -> true" on a fixed set of rows, so a rerun moves no
// start date and recomputes no flag. The marker is set last: a crash part-way reruns safely.

import { Prisma } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { habitDayForOrUtc } from '../habits/habitDay';
import type { MarkerStore } from '../recap/backfill';
import { connection } from '../sync/queue';
import { claimStartDate, type StartableUser } from './start';

export const ACHIEVEMENTS_LAUNCH_MARKER = 'achievements:launch:v1';
export const ACHIEVEMENTS_MIGRATION = '20261006120000_achievements';
const PAGE = 200;

interface LaunchDeps { store?: MarkerStore; launchAt?: Date; userIds?: string[] }

/**
 * When the achievements migration finished: the launch instant. Null if it is not recorded,
 * including when there is no _prisma_migrations table at all (a schema applied without Prisma
 * Migrate), so the job falls back to "now" instead of failing on every start.
 */
export async function launchInstant(): Promise<Date | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
      SELECT finished_at FROM _prisma_migrations
      WHERE migration_name = ${ACHIEVEMENTS_MIGRATION} AND rolled_back_at IS NULL AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1`;
    return rows[0]?.finished_at ?? null;
  } catch (err) {
    if (isUndefinedTable(err)) return null;
    throw err;
  }
}

/** Postgres 42P01 (undefined_table), as Prisma reports it for a raw query. */
function isUndefinedTable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010' && err.meta?.code === '42P01';
}

interface LaunchUser extends StartableUser { timezone: string; achievementsSince: Date | null; createdAt: Date }

async function* allUsers(userIds?: string[]): AsyncGenerator<LaunchUser> {
  let after: string | null = null;
  for (;;) {
    const page: LaunchUser[] = await prisma.user.findMany({
      where: { AND: [userIds ? { id: { in: userIds } } : {}, after ? { id: { gt: after } } : {}] },
      orderBy: { id: 'asc' },
      take: PAGE,
      select: { id: true, timezone: true, sleepGoalMinutes: true, bedtimeGoal: true, achievementsSince: true, createdAt: true },
    });
    yield* page;
    if (page.length < PAGE) return;
    after = page[page.length - 1]!.id;
  }
}

/**
 * Check-ins for the launch habit day: on time when their createdAt falls in that same habit day
 * (computed in the zone at launch), the definition the write path uses. Only false -> true, so a
 * rerun changes nothing; a backdated row's createdAt is never in its own habit day.
 *
 * It uses the user's current zone, not a stored zone at launch: the two differ only on a rerun
 * after a lost marker for a user who changed zone since the launch.
 */
export async function backfillLaunchDayOnTime(userId: string, timeZone: string, launchAt: Date): Promise<number> {
  const launchDay = habitDayForOrUtc(launchAt, timeZone);
  const rows = await prisma.habitCheckIn.findMany({
    where: { userId, habitDay: civilDateToUtcMidnight(launchDay), onTime: false },
    select: { id: true, createdAt: true },
  });
  const ids = rows.filter((r) => habitDayForOrUtc(r.createdAt, timeZone) === launchDay).map((r) => r.id);
  if (ids.length === 0) return 0;
  return (await prisma.habitCheckIn.updateMany({ where: { id: { in: ids }, onTime: false }, data: { onTime: true } })).count;
}

/** The number of users whose start date this run set (0 when the marker says it already ran). */
export async function runAchievementsLaunchOnce({ store = connection, launchAt, userIds }: LaunchDeps = {}): Promise<number> {
  if (await store.get(ACHIEVEMENTS_LAUNCH_MARKER)) return 0;
  const at = launchAt ?? (await launchInstant()) ?? new Date();
  let started = 0;
  for await (const user of allUsers(userIds)) {
    // Only users who existed at the launch get the launch date; a later signup (seen on a rerun
    // after a lost marker) gets theirs on their first badge load (spec §3), never backdated.
    const existedAtLaunch = user.createdAt.getTime() <= at.getTime();
    if (existedAtLaunch && user.achievementsSince === null && (await claimStartDate(user, localCivilDateOrUtc(at, user.timezone)))) started++;
    await backfillLaunchDayOnTime(user.id, user.timezone, at);
  }
  await store.set(ACHIEVEMENTS_LAUNCH_MARKER, at.toISOString());
  return started;
}

/** Server start: runs the launch job once; a failure is logged (error class only) and retried next start. */
export async function startAchievements(deps: LaunchDeps = {}): Promise<void> {
  try {
    const started = await runAchievementsLaunchOnce(deps);
    if (started > 0) console.info(JSON.stringify({ event: 'achievements.launch_started', users: started }));
  } catch (err) {
    console.error(JSON.stringify({ event: 'achievements.launch_failed', error: err instanceof Error ? err.name : 'unknown' }));
  }
}
