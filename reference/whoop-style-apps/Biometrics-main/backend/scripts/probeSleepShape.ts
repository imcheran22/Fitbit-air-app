// Read-only live-check probe for Stat Engine Slice 0. NOT run in CI and not
// imported by application code: it needs a real connected Google Health
// account, so an operator runs it by hand and records what it prints in
// docs/superpowers/notes/slice0-live-checks.md.
//
//   npx ts-node scripts/probeSleepShape.ts <userId> [--days 30]
//
// It answers the three live checks in the spec:
//   1. What timezone basis do Google's civil dates use (STEPS / RESTING_HR /
//      HRV) relative to the sleep sessions' end instants?
//   2. Is endTime - startTime meaningful as time-in-bed (vs minutesAsleep)?
//   3. How is a night with more than one Sleep object (nap, split session)
//      represented -- how many sessions per local day, and how are they laid out?
//
// Read-only means: no DB writes and no Google state changes. It reads the
// user's stored access token as-is and does NOT refresh it (a refresh would
// write the DB). If Google answers 401 the token is stale: open the app or let
// the token-refresh sweep run, then re-run.
import { prisma } from '../src/db/client';
import { decryptToken } from '../src/crypto/tokenCipher';
import { fetchMetricRange, fetchSleepSessions } from '../src/health/client';
import { localCivilDate, sessionEndCivilDate } from '../src/biometrics/civilDate';
import type { HealthMetricPoint, SleepSessionPoint } from '../src/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  return isoDate(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS));
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function parseArgs(argv: string[]): { userId: string; days: number } {
  const userId = argv[0];
  if (!userId || userId.startsWith('--')) throw new Error('Usage: probeSleepShape <userId> [--days N]');
  let days = 30;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--days') {
      days = Number(argv[++i]);
      if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer');
    } else {
      throw new Error(`Unknown argument "${argv[i]}"`);
    }
  }
  return { userId, days };
}

function printSessions(sessions: SleepSessionPoint[], timeZone: string): void {
  console.log('\n== 1. Sessions (sorted by end) ==');
  console.log('start (UTC)            end (UTC)              asleep  inBed  asleep/inBed  endLocal    endUTC      endByOffset flags');
  for (const s of sessions) {
    const inBed = minutesBetween(s.startTime, s.endTime);
    const ratio = inBed > 0 ? (s.minutesAsleep / inBed).toFixed(2) : 'n/a';
    const flags: string[] = [];
    if (s.minutesAsleep > inBed) flags.push('ASLEEP>INBED (interval is NOT time-in-bed)');
    if (inBed < 90) flags.push('short (nap?)');
    console.log(
      [
        s.startTime.toISOString().slice(0, 19) + 'Z',
        s.endTime.toISOString().slice(0, 19) + 'Z',
        String(s.minutesAsleep).padStart(6),
        String(inBed).padStart(6),
        String(ratio).padStart(12),
        localCivilDate(s.endTime, timeZone),
        isoDate(s.endTime),
        sessionEndCivilDate(s, timeZone).padEnd(11),
        flags.join('; '),
      ].join('  '),
    );
  }
}

function printPerDay(sessions: SleepSessionPoint[], timeZone: string): Map<string, SleepSessionPoint[]> {
  const byDay = new Map<string, SleepSessionPoint[]>();
  for (const s of sessions) {
    const day = localCivilDate(s.endTime, timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  console.log(`\n== 2. Sessions per local day (end date in ${timeZone}) ==`);
  const histogram = new Map<number, number>();
  for (const [day, list] of [...byDay].sort()) {
    histogram.set(list.length, (histogram.get(list.length) ?? 0) + 1);
    const total = list.reduce((n, s) => n + s.minutesAsleep, 0);
    const detail = list.map((s) => `${s.minutesAsleep}m@${s.startTime.toISOString().slice(11, 16)}Z`).join(' + ');
    console.log(`${day}  n=${list.length}  total=${total}m  ${list.length > 1 ? detail : ''}`);
  }
  console.log('days by session count:', [...histogram].sort().map(([n, d]) => `${n} session(s): ${d} day(s)`).join(', '));
  console.log('Multi-session days show how naps / split sleep are represented: same night as separate objects, or a nap far from the main sleep?');
  return byDay;
}

function printCivilDateBasis(
  byDay: Map<string, SleepSessionPoint[]>,
  sessions: SleepSessionPoint[],
  timeZone: string,
  hrv: HealthMetricPoint[],
  rhr: HealthMetricPoint[],
  steps: HealthMetricPoint[],
): void {
  console.log('\n== 3. Civil-date basis hints ==');
  console.log('Google civil dates (recordedAt at UTC midnight) vs when sessions actually ended.');
  const hrvDates = new Set(hrv.map((p) => isoDate(p.recordedAt)));
  const rhrDates = new Set(rhr.map((p) => isoDate(p.recordedAt)));
  const stepsDates = new Set(steps.map((p) => isoDate(p.recordedAt)));
  console.log(`HRV days: ${hrvDates.size}, RESTING_HR days: ${rhrDates.size}, STEPS days: ${stepsDates.size}`);

  // For each HRV date H (a "night" metric attributed to a wake-up day), which
  // definition of "the day the night ended" lines up with a stored session?
  const endLocal = new Set(sessions.map((s) => localCivilDate(s.endTime, timeZone)));
  const endUtc = new Set(sessions.map((s) => isoDate(s.endTime)));
  const startLocal = new Set(sessions.map((s) => localCivilDate(s.startTime, timeZone)));
  const startUtc = new Set(sessions.map((s) => isoDate(s.startTime)));
  const score = (candidate: Set<string>) => [...hrvDates].filter((d) => candidate.has(d)).length;
  console.log('HRV dates that coincide with a session date under each candidate basis (higher = better fit):');
  console.log(`  end date, user tz (${timeZone}): ${score(endLocal)}/${hrvDates.size}   <- the Slice 0 key`);
  console.log(`  end date, UTC:                  ${score(endUtc)}/${hrvDates.size}`);
  console.log(`  start date, user tz:            ${score(startLocal)}/${hrvDates.size}   (should be worse: night starts the evening before)`);
  console.log(`  start date, UTC (OLD key):      ${score(startUtc)}/${hrvDates.size}`);

  console.log('\nPer local day: does each Google civil-date metric exist on the sleep END date?');
  console.log('day         sessions  HRV  RHR  STEPS   (also present on day-1?)');
  for (const [day] of [...byDay].sort()) {
    const prev = shift(day, -1);
    const has = (set: Set<string>) => (set.has(day) ? 'Y' : '-');
    const hasPrev = (set: Set<string>) => (set.has(prev) ? 'Y' : '-');
    console.log(
      `${day}  ${String(byDay.get(day)?.length ?? 0).padStart(8)}  ${has(hrvDates).padStart(3)}  ${has(rhrDates).padStart(3)}  ${has(stepsDates).padStart(5)}   prev: HRV ${hasPrev(hrvDates)} RHR ${hasPrev(rhrDates)} STEPS ${hasPrev(stepsDates)}`,
    );
  }
  console.log(
    'Reading it: if user-tz end date fits best AND the HRV/RHR dates sit on the wake-up day, Google civil dates follow the ' +
      "user's local calendar. If UTC end date fits best, they are UTC-based and User.timezone must not be used to key SLEEP.",
  );
}

async function main() {
  const { userId, days } = parseArgs(process.argv.slice(2));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, healthConnection: { select: { status: true, encryptedAccessToken: true } } },
  });
  if (!user) throw new Error(`No user ${userId}`);
  if (!user.healthConnection) throw new Error(`User ${userId} has no health connection`);
  if (user.healthConnection.status !== 'CONNECTED') {
    console.warn(`Warning: connection status is ${user.healthConnection.status}; the stored token may be revoked.`);
  }
  const accessToken = decryptToken(user.healthConnection.encryptedAccessToken);

  const end = isoDate(new Date(Date.now() + DAY_MS)); // exclusive: includes today
  const start = shift(end, -days);
  console.log(`user ${userId}  stored timezone: ${user.timezone}  window: [${start}, ${end})`);
  if (user.timezone === 'UTC') {
    console.log('NOTE: timezone is the "UTC" default. Have the client report its real zone (PUT /me/timezone) first, or the local-date columns below equal the UTC ones.');
  }

  // Same one-day widening the worker applies, so what is printed is what would be stored.
  const sessions = (await fetchSleepSessions(accessToken, shift(start, -1), shift(end, 1))).sort(
    (a, b) => a.endTime.getTime() - b.endTime.getTime(),
  );
  console.log(`fetched ${sessions.length} sleep session(s)`);
  printSessions(sessions, user.timezone);
  const byDay = printPerDay(sessions, user.timezone);

  const [hrv, rhr, steps] = await Promise.all([
    fetchMetricRange(accessToken, 'HRV', start, end),
    fetchMetricRange(accessToken, 'RESTING_HR', start, end),
    fetchMetricRange(accessToken, 'STEPS', start, end),
  ]);
  printCivilDateBasis(byDay, sessions, user.timezone, hrv, rhr, steps);
}

if (require.main === module) {
  main()
    .catch((err) => {
      if ((err as { status?: number })?.status === 401) {
        console.error('Google returned 401: the stored access token is stale. Let the token refresh sweep run (or open the app) and retry.');
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
