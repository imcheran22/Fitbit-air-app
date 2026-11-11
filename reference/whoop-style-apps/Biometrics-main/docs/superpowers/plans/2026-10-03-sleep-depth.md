# Sleep Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store Google Health sleep stages and add a dedicated Sleep screen: a window chart, sleep regularity, a one-night detail screen, and a bedtime goal with a wind-down reminder scheduled on the phone.

**Architecture:**
- **Backend:** parse the stage and summary fields Google already returns, and store them on `SleepSession` plus a new `SleepStage` table. Touch only sessions that really changed, so stage-only resyncs never rescore. Use one main-session rule shared with scoring. Add three read endpoints and a goal endpoint.
- **Goal changes:** a goal change rescores today only, and every score records the goal it used.
- **Mobile:** three new screens built on pure, tested layout helpers. The reminder is an `expo-notifications` daily local notification.

**Tech Stack:** Express + Prisma/Postgres, BullMQ, Jest (backend, ESM). Expo 57 / React Native, NativeWind, `expo-notifications`, SecureStore, Jest + RNTL (mobile).

**Spec:** `docs/superpowers/specs/2026-10-03-sleep-depth-design.md`. Read it first; it is the binding authority.

## Global Constraints

- **Main session of a night:** the session with the most `minutesAsleep`; ties go to the earliest start. Sessions with a non-positive interval are skipped. One helper, `pickMainSession`, is used by scoring and every endpoint. `mainSleep` is stored but never used to choose.
- **`hasStages`:** true only when the main session has at least one `DEEP`, `LIGHT` or `REM` stage.
- **Stage types:** `AWAKE | LIGHT | DEEP | REM`. Unknown types are skipped. Numbers arrive as numeric strings; unparseable → `null`.
- **Regularity is not consistency.** Endpoint `/me/sleep/regularity?days=7|30`; minimum nights 4 for 7 days and 15 for 30 days. The card title is "Sleep regularity", never "consistency".
- **Goal change → scores:** only today (user-local civil date) is rescored; past scores are never rescored. New scores store `goalMinutes` on their `SLEEP_DEBT` and `SLEEP_DURATION` factors. "Why this score" says "vs your goal of {h}h {m}m" only when a stored goal exists.
- **Goal validation:** `sleepGoalMinutes` integer 240–720; `bedtimeGoal`/`wakeGoal` match `^([01]\d|2[0-3]):[0-5]\d$` or null; invalid → 400 `{error:'invalid_goal'}`.
- **`usualMinutesAsleep`:** average over the 30 nights before the date; null unless at least 7 have data.
- **`stagesBackfillPending`:** true only when the connection is `CONNECTED` and `sleepStagesBackfilledAt` is null.
- **Reminder:**
  - Local notification only, with `data: { kind: 'wind-down' }`.
  - Shown in the foreground for `wind-down` only; tapping it opens the `Sleep` screen.
  - Cancelled in `dropLocalSession`.
  - Never re-prompt when permission is denied.
- **Stage colour tokens:** `sleepDeep`, `sleepRem`, `sleepLight`, `sleepAwake` (`#FB923C`), with light and dark values.
- **Commits:** no `Co-Authored-By` trailers and no Claude mentions in commits or the PR (owner rule).
- **Commands:** use Node 24 (`/Users/tushar/.nvm/versions/node/v24.21.0/bin/node`; `npx` resolves Node 20). Run mobile jest as `…/node node_modules/.bin/jest`. For backend tests, pass `TEST_DATABASE_URL`, `DATABASE_URL` (same value) and `REDIS_URL=redis://localhost:6379` on the command line, reading the values from `~/dev/biometrics-run/backend/.env`. Run with `NODE_OPTIONS=--experimental-vm-modules … jest --forceExit`, and never while a live backend is running.
- **First task in each package:** the worktree has no `node_modules`. Run `npm ci` (and `npx prisma generate` in `backend/`).

## Review Focus

1. **After-midnight bedtimes** (e.g. 00:45, 02:30): the chart axis, averages and drift must treat them as late, not early. Tests in Tasks 7 and 11.
2. **A goal window or reminder that crosses midnight** (bedtime 00:15 with a 30-minute lead → 23:45 the evening before; bedtime 23:30 and wake 07:00 = 7h 30m): the duration line and trigger time must wrap correctly. Tests in Tasks 14 and 15.
3. **A PUT that changes only bedtime or wake** must not enqueue a rescore; only a `sleepGoalMinutes` change does. Test in Task 8.
4. **A night recorded at a different UTC offset** (travel): bedtime and stage times use the session's own offsets. Test in Task 6.
5. **A user with no Google connection, or a disconnected one:** `stagesBackfillPending` false, and the screens show their empty states, never a perpetual "Reading older nights…". Tests in Tasks 5 and 12.

---

## Part 1: Backend

### Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (`SleepSession` ~169–188, `User` ~56–75, `HealthConnection`)
- Create: `backend/prisma/migrations/20261003120000_sleep_stages/migration.sql`
- Test: `backend/tests/db/sleepStages.test.ts`

**Interfaces:**
- Produces:
  - Prisma enum `SleepStageType`
  - model `SleepStage { id, sessionId, type, startTime, endTime }`, cascade from `SleepSession`
  - `SleepSession` fields: `sleepType`, `mainSleep`, `minutesInSleepPeriod`, `minutesAwake`, `minutesToFallAsleep`, `minutesAfterWakeUp`, `deepMinutes`, `lightMinutes`, `remMinutes`, `awakeMinutes` (all nullable), and `stages SleepStage[]`
  - `User.bedtimeGoal String?`, `User.wakeGoal String?`
  - `HealthConnection.sleepStagesBackfilledAt DateTime?`

- [ ] **Step 1: Write the failing test** `backend/tests/db/sleepStages.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

it('stores stages under a session and deletes them with it', async () => {
  const user = await createUser();
  const session = await prisma.sleepSession.create({
    data: {
      userId: user.id, startTime: new Date('2026-09-30T23:00:00Z'), endTime: new Date('2026-10-01T07:00:00Z'), minutesAsleep: 420,
      sleepType: 'STAGES', mainSleep: true, minutesInSleepPeriod: 480, deepMinutes: 80, lightMinutes: 240, remMinutes: 100, awakeMinutes: 60,
      stages: { create: [{ type: 'LIGHT', startTime: new Date('2026-09-30T23:10:00Z'), endTime: new Date('2026-09-30T23:40:00Z') }] },
    },
  });
  expect(await prisma.sleepStage.count({ where: { sessionId: session.id } })).toBe(1);
  await prisma.sleepSession.delete({ where: { id: session.id } });
  expect(await prisma.sleepStage.count({ where: { sessionId: session.id } })).toBe(0);
});

it('adds nullable bedtime and wake goals and a stage backfill marker', async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: (await createUser()).id }, select: { bedtimeGoal: true, wakeGoal: true } });
  expect(user).toEqual({ bedtimeGoal: null, wakeGoal: null });
});
```

- [ ] **Step 2: Run and check that it fails** (`cd backend && … jest --forceExit tests/db/sleepStages.test.ts`). Expected: a type or field error.

- [ ] **Step 3: Edit the schema.** Add these to `schema.prisma`:

```prisma
enum SleepStageType {
  AWAKE
  LIGHT
  DEEP
  REM
}

/// One segment of a night's stage timeline, from Google's sleep.stages[] (spec 2026-10-03 §2).
model SleepStage {
  id        String         @id @default(uuid())
  sessionId String
  session   SleepSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type      SleepStageType
  startTime DateTime
  endTime   DateTime

  @@index([sessionId, startTime])
}
```

In `model SleepSession`, after `endUtcOffsetSeconds Int?`:

```prisma
  // Google's night summary (spec 2026-10-03 §1). Null when Google omitted or garbled a value.
  sleepType            String?
  mainSleep            Boolean?
  minutesInSleepPeriod Float?
  minutesAwake         Float?
  minutesToFallAsleep  Float?
  minutesAfterWakeUp   Float?
  deepMinutes          Float?
  lightMinutes         Float?
  remMinutes           Float?
  awakeMinutes         Float?
  stages               SleepStage[]
```

In `model User`, next to `sleepGoalMinutes`:

```prisma
  /// Target bedtime and wake time, local "HH:MM"; null = not set. Display and reminder only, never scoring.
  bedtimeGoal String?
  wakeGoal    String?
```

In `model HealthConnection`, next to `sleepHistoryBackfilledAt`:

```prisma
  sleepStagesBackfilledAt DateTime?
```

- [ ] **Step 4: Generate the migration.** Run `npx prisma migrate dev --name sleep_stages --create-only` against the test database (`DATABASE_URL=$TEST_DATABASE_URL`). Rename the folder to `20261003120000_sleep_stages`. Check the SQL contains only `CREATE TYPE "SleepStageType"`, `CREATE TABLE "SleepStage"` with its FK `ON DELETE CASCADE` and index, and `ALTER TABLE … ADD COLUMN` lines (all nullable). Then run `npx prisma generate`.

- [ ] **Step 5: Run the test.** Expected: PASS. Also run `tests/users` (the owned-models/deletion test) and expect PASS. `SleepStage` has no `userId` and cascades from its session, so the test needs no change.

- [ ] **Step 6: Commit.**

```bash
git add backend/prisma backend/tests/db/sleepStages.test.ts
git commit -m "feat(backend): sleep stage table, night summary fields and bedtime goals"
```

### Task 2: Parse stages and the night summary

**Files:**
- Modify: `backend/src/types.ts:14-20`, `backend/src/health/client.ts:234-260`
- Test: `backend/tests/health/client.test.ts`

**Interfaces:**
- Produces:

```ts
export type SleepStageType = 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM';
export interface SleepStagePoint { type: SleepStageType; startTime: Date; endTime: Date }
export interface SleepSessionPoint {
  startTime: Date; endTime: Date; minutesAsleep: number;
  startUtcOffsetSeconds?: number | null; endUtcOffsetSeconds?: number | null;
  sleepType?: string | null; mainSleep?: boolean | null;
  minutesInSleepPeriod?: number | null; minutesAwake?: number | null;
  minutesToFallAsleep?: number | null; minutesAfterWakeUp?: number | null;
  deepMinutes?: number | null; lightMinutes?: number | null; remMinutes?: number | null; awakeMinutes?: number | null;
  stages?: SleepStagePoint[];
}
```

- [ ] **Step 1: Write the failing tests** in `client.test.ts`. Add these next to the existing sleep tests and reuse their fetch-mock helper. The values are synthetic; the shape is from the live check:

```ts
const stagedPoint = {
  sleep: {
    interval: { startTime: '2026-09-30T23:00:00Z', startUtcOffset: '-14400s', endTime: '2026-10-01T07:00:00Z', endUtcOffset: '-14400s' },
    type: 'STAGES',
    stages: [
      { startTime: '2026-09-30T23:05:00Z', endTime: '2026-09-30T23:35:00Z', type: 'LIGHT' },
      { startTime: '2026-09-30T23:35:00Z', endTime: '2026-10-01T00:20:00Z', type: 'DEEP' },
      { startTime: '2026-10-01T00:20:00Z', endTime: '2026-10-01T00:25:00Z', type: 'SNORING' },
    ],
    metadata: { stagesStatus: 'SUCCEEDED', processed: true, mainSleep: true },
    summary: {
      minutesInSleepPeriod: '480', minutesAfterWakeUp: '6', minutesToFallAsleep: '5', minutesAsleep: '420', minutesAwake: '60',
      stagesSummary: [
        { type: 'DEEP', minutes: '80', count: '4' }, { type: 'LIGHT', minutes: '240', count: '20' },
        { type: 'REM', minutes: '100', count: '5' }, { type: 'AWAKE', minutes: '60', count: '25' },
      ],
    },
  },
};

it('parses stages, skips unknown stage types and reads the night summary', async () => {
  mockDataPoints([stagedPoint]);
  const [s] = await fetchSleepSessions('token', '2026-09-30', '2026-10-02');
  expect(s).toMatchObject({
    minutesAsleep: 420, sleepType: 'STAGES', mainSleep: true,
    minutesInSleepPeriod: 480, minutesAwake: 60, minutesToFallAsleep: 5, minutesAfterWakeUp: 6,
    deepMinutes: 80, lightMinutes: 240, remMinutes: 100, awakeMinutes: 60,
  });
  expect(s!.stages!.map((x) => x.type)).toEqual(['LIGHT', 'DEEP']);
  expect(s!.stages![0]!.startTime.toISOString()).toBe('2026-09-30T23:05:00.000Z');
});

it('stores null for missing or unparseable summary numbers and [] for no stages', async () => {
  mockDataPoints([{ sleep: { interval: stagedPoint.sleep.interval, summary: { minutesAsleep: '400', minutesAwake: 'n/a' } } }]);
  const [s] = await fetchSleepSessions('token', '2026-09-30', '2026-10-02');
  expect(s).toMatchObject({ minutesAsleep: 400, minutesAwake: null, deepMinutes: null, sleepType: null, mainSleep: null });
  expect(s!.stages).toEqual([]);
});
```

(Use the helper name the file already has in place of `mockDataPoints`.)

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.** In `types.ts`, replace `SleepSessionPoint` with the interface above. In `client.ts`, inside the loop after the existing guard:

```ts
const STAGE_TYPES = new Set(['AWAKE', 'LIGHT', 'DEEP', 'REM']);

// Google sends counts as numeric strings; '' and garbage become null, never 0.
function numOrNull(v: unknown): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stageMinutes(summary: any, type: string): number | null {
  const row = Array.isArray(summary?.stagesSummary) ? summary.stagesSummary.find((r: any) => r?.type === type) : undefined;
  return row ? numOrNull(row.minutes) : null;
}
```

And in the `sessions.push({...})` call add:

```ts
      sleepType: typeof r.sleep?.type === 'string' ? r.sleep.type : null,
      mainSleep: typeof r.sleep?.metadata?.mainSleep === 'boolean' ? r.sleep.metadata.mainSleep : null,
      minutesInSleepPeriod: numOrNull(r.sleep?.summary?.minutesInSleepPeriod),
      minutesAwake: numOrNull(r.sleep?.summary?.minutesAwake),
      minutesToFallAsleep: numOrNull(r.sleep?.summary?.minutesToFallAsleep),
      minutesAfterWakeUp: numOrNull(r.sleep?.summary?.minutesAfterWakeUp),
      deepMinutes: stageMinutes(r.sleep?.summary, 'DEEP'),
      lightMinutes: stageMinutes(r.sleep?.summary, 'LIGHT'),
      remMinutes: stageMinutes(r.sleep?.summary, 'REM'),
      awakeMinutes: stageMinutes(r.sleep?.summary, 'AWAKE'),
      stages: (Array.isArray(r.sleep?.stages) ? r.sleep.stages : [])
        .filter((g: any) => STAGE_TYPES.has(g?.type) && g.startTime && g.endTime)
        .map((g: any) => ({ type: g.type, startTime: new Date(g.startTime), endTime: new Date(g.endTime) }))
        .filter((g: SleepStagePoint) => !Number.isNaN(g.startTime.getTime()) && !Number.isNaN(g.endTime.getTime()) && g.endTime > g.startTime)
        .sort((a: SleepStagePoint, b: SleepStagePoint) => a.startTime.getTime() - b.startTime.getTime()),
```

Extend the function's doc comment with one line: it also reads the stage timeline and night summary (spec 2026-10-03 §1).

- [ ] **Step 4: Run** `tests/health/client.test.ts`. Expected: PASS, with the existing sleep tests still green.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/types.ts backend/src/health/client.ts backend/tests/health/client.test.ts
git commit -m "feat(backend): parse Google sleep stages and night summary"
```

### Task 3: Store stages and touch only changed sessions

**Files:**
- Modify: `backend/src/biometrics/repository.ts:43-76` (`upsertSleepSessionsTouched`)
- Test: `backend/tests/biometrics/sleepSessions.test.ts`; extend the existing repository test file if one exists (`grep -rln storeSleepSessions backend/tests`)

**Interfaces:**
- Consumes: `SleepSessionPoint` from Task 2.
- Produces: `storeSleepSessions(userId, sessions): Promise<string[]>` keeps its signature. It now returns **only** dates touched by a new session, or by one whose `endTime`, `minutesAsleep` or offsets changed (plus the previous end of a moved one). A stage-only change returns `[]` and writes no rollup.

- [ ] **Step 1: Write the failing tests:**

```ts
const night = (over: Partial<SleepSessionPoint> = {}): SleepSessionPoint => ({
  startTime: new Date('2026-09-30T23:00:00Z'), endTime: new Date('2026-10-01T07:00:00Z'), minutesAsleep: 420,
  startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0, stages: [], ...over,
});

it('stores the summary and replaces stages on resync without duplicating them', async () => {
  const { id } = await createUser();
  await storeSleepSessions(id, [night({ deepMinutes: 80, stages: [{ type: 'DEEP', startTime: new Date('2026-09-30T23:30:00Z'), endTime: new Date('2026-10-01T00:10:00Z') }] })]);
  await storeSleepSessions(id, [night({ deepMinutes: 90, stages: [
    { type: 'LIGHT', startTime: new Date('2026-09-30T23:05:00Z'), endTime: new Date('2026-09-30T23:30:00Z') },
    { type: 'DEEP', startTime: new Date('2026-09-30T23:30:00Z'), endTime: new Date('2026-10-01T00:20:00Z') },
  ] })]);
  const s = await prisma.sleepSession.findFirstOrThrow({ where: { userId: id }, include: { stages: { orderBy: { startTime: 'asc' } } } });
  expect(s.deepMinutes).toBe(90);
  expect(s.stages.map((x) => x.type)).toEqual(['LIGHT', 'DEEP']);
});

it('a stage-only resync touches no date and leaves the SLEEP rollup syncedAt alone', async () => {
  const { id } = await createUser();
  expect(await storeSleepSessions(id, [night()])).toEqual(['2026-10-01']);
  const before = await prisma.biometricRecord.findFirstOrThrow({ where: { userId: id, metricType: 'SLEEP' } });
  expect(await storeSleepSessions(id, [night({ deepMinutes: 80 })])).toEqual([]);
  const after = await prisma.biometricRecord.findFirstOrThrow({ where: { userId: id, metricType: 'SLEEP' } });
  expect(after.syncedAt.getTime()).toBe(before.syncedAt.getTime());
});

it('a real change still touches its date and rewrites the rollup', async () => {
  const { id } = await createUser();
  await storeSleepSessions(id, [night()]);
  expect(await storeSleepSessions(id, [night({ minutesAsleep: 430 })])).toEqual(['2026-10-01']);
  expect((await prisma.biometricRecord.findFirstOrThrow({ where: { userId: id, metricType: 'SLEEP' } })).value).toBe(430);
});
```

Add a sweep test. Import the sweep's stale-day finder from `src/scoring/sweep.ts`; read its exports and use the function that lists stale days, or run the sweep with a fake queue as its existing tests do. Store a night, compute that day's score (`computeDailyScore`), resync the same night with stages only, then run the sweep with a fake queue. Expect **no** job enqueued for that day.

- [ ] **Step 2: Run and check that they fail.** The second test fails because the current code returns the date and bumps `syncedAt`.

- [ ] **Step 3: Implement.** In `upsertSleepSessionsTouched`, read the full previous row and compute which sessions changed:

```ts
  const existing = await prisma.sleepSession.findMany({
    where: { userId, startTime: { in: unique.map((s) => s.startTime) } },
    select: { startTime: true, endTime: true, minutesAsleep: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true },
  });
  const prevByStart = new Map(existing.map((e) => [e.startTime.getTime(), e]));
  // Only a session that is new, or whose end, minutes or offsets moved, can change a
  // rollup or a score. Stage and summary refreshes still write the row but touch no date,
  // so a stage backfill never makes the sweep rescore (spec 2026-10-03 §2).
  const changed = unique.filter((s) => {
    const p = prevByStart.get(s.startTime.getTime());
    return !p || p.endTime.getTime() !== s.endTime.getTime() || p.minutesAsleep !== s.minutesAsleep
      || p.startUtcOffsetSeconds !== (s.startUtcOffsetSeconds ?? null) || p.endUtcOffsetSeconds !== (s.endUtcOffsetSeconds ?? null);
  });
```

In each upsert's `update` and `create`, add the summary fields, plus a stage replacement **only when `s.stages` is defined**, so older callers that never send stages keep the stored stages:

```ts
      const summary = {
        sleepType: s.sleepType ?? null, mainSleep: s.mainSleep ?? null,
        minutesInSleepPeriod: s.minutesInSleepPeriod ?? null, minutesAwake: s.minutesAwake ?? null,
        minutesToFallAsleep: s.minutesToFallAsleep ?? null, minutesAfterWakeUp: s.minutesAfterWakeUp ?? null,
        deepMinutes: s.deepMinutes ?? null, lightMinutes: s.lightMinutes ?? null, remMinutes: s.remMinutes ?? null, awakeMinutes: s.awakeMinutes ?? null,
      };
      const stageRows = (s.stages ?? []).map((g) => ({ type: g.type, startTime: g.startTime, endTime: g.endTime }));
      return prisma.sleepSession.upsert({
        where: { userId_startTime: { userId, startTime: s.startTime } },
        update: { endTime: s.endTime, minutesAsleep: s.minutesAsleep, ...offsets, ...summary, syncedAt: new Date(),
          ...(s.stages ? { stages: { deleteMany: {}, create: stageRows } } : {}) },
        create: { userId, startTime: s.startTime, endTime: s.endTime, minutesAsleep: s.minutesAsleep, ...offsets, ...summary,
          ...(s.stages ? { stages: { create: stageRows } } : {}) },
      });
```

Return the touched ends only for changed sessions:

```ts
  const changedStarts = new Set(changed.map((s) => s.startTime.getTime()));
  return [
    ...changed.map((s) => ({ endTime: s.endTime, endUtcOffsetSeconds: s.endUtcOffsetSeconds ?? null })),
    ...existing.filter((e) => changedStarts.has(e.startTime.getTime())).map((e) => ({ endTime: e.endTime, endUtcOffsetSeconds: e.endUtcOffsetSeconds })),
  ];
```

Update the function's doc comment to say it returns ends for new or changed sessions only.

- [ ] **Step 4: Run** this file plus `tests/sync`, `tests/biometrics` and `tests/scoring`. Expected: PASS. Existing tests that asserted a re-upsert of an identical session returns its date must now expect `[]`; change each such assertion and note it in the report.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/biometrics/repository.ts backend/tests
git commit -m "feat(backend): store sleep stages; touch only sessions that changed"
```

### Task 4: One main-session rule

**Files:**
- Create: `backend/src/biometrics/mainSession.ts`
- Modify: `backend/src/scoring/features.ts:166-183` (`mainSessionOnsets`), `backend/src/biometrics/activity.ts:137`
- Test: `backend/tests/biometrics/mainSession.test.ts`

**Interfaces:**
- Produces: `export function pickMainSession<T extends { startTime: Date; endTime: Date; minutesAsleep: number }>(sessions: readonly T[]): T | null`

- [ ] **Step 1: Write the failing test:**

```ts
import { pickMainSession } from '../../src/biometrics/mainSession';
const s = (start: string, end: string, minutesAsleep: number) => ({ startTime: new Date(start), endTime: new Date(end), minutesAsleep });

it('picks the most minutes asleep, earliest start on a tie, skipping empty intervals', () => {
  const nap = s('2026-10-01T13:00:00Z', '2026-10-01T15:30:00Z', 140);
  const night = s('2026-09-30T23:00:00Z', '2026-10-01T06:00:00Z', 400);
  expect(pickMainSession([nap, night])).toBe(night);
  const a = s('2026-09-30T22:00:00Z', '2026-10-01T02:00:00Z', 200);
  const b = s('2026-10-01T02:30:00Z', '2026-10-01T07:00:00Z', 200);
  expect(pickMainSession([b, a])).toBe(a);
  expect(pickMainSession([s('2026-10-01T07:00:00Z', '2026-10-01T07:00:00Z', 999), night])).toBe(night);
  expect(pickMainSession([])).toBeNull();
});
```

- [ ] **Step 2: Run and check that it fails.**

- [ ] **Step 3: Implement:**

```ts
// The one rule for a night's main session (spec 2026-10-03 §2): most minutes asleep, earliest
// start on a tie, skipping a non-positive interval. Scoring and every sleep endpoint use it,
// so a night's bedtime is the same everywhere. Google's mainSleep flag is deliberately unused.
export function pickMainSession<T extends { startTime: Date; endTime: Date; minutesAsleep: number }>(sessions: readonly T[]): T | null {
  let main: T | null = null;
  for (const s of sessions) {
    if (!(s.endTime.getTime() - s.startTime.getTime() > 0)) continue;
    if (!main || s.minutesAsleep > main.minutesAsleep || (s.minutesAsleep === main.minutesAsleep && s.startTime < main.startTime)) main = s;
  }
  return main;
}
```

In `mainSessionOnsets`, replace the inner loop with `const main = pickMainSession(night);`.

In `getSleepForUser`, add `minutesAsleep: true` to the session `select` and replace the `reduce` with `const main = pickMainSession(own);`. Delete the now-unused `minutesBetween` only if nothing else uses it.

- [ ] **Step 4: Run** `mainSession.test.ts`, `tests/scoring` and `tests/biometrics`. Expected: PASS. Scoring output is unchanged; the `/me/sleep` bedtime tests change only for multi-session dates, so update those assertions and name them in the report.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/biometrics/mainSession.ts backend/src/scoring/features.ts backend/src/biometrics/activity.ts backend/tests
git commit -m "refactor(backend): one main-session rule shared by scoring and sleep endpoints"
```

### Task 5: `/me/sleep` additions

**Files:**
- Modify: `backend/src/biometrics/activity.ts` (`SleepNightDTO` ~66–78, `SleepActivityDTO`, `getSleepForUser`)
- Test: `backend/tests/biometrics/activity.test.ts`; extend the existing `/me/sleep` tests

**Interfaces:**
- Produces: each night gains `minutesAwake: number|null`, `stageMinutes: {deep, light, rem, awake}|null` and `hasStages: boolean`. The response gains `stagesBackfillPending: boolean`.

- [ ] **Step 1: Write the failing tests.** Seed nights through `storeSleepSessions` with stages and assert the following.
  - A night with DEEP/LIGHT/REM stages → `hasStages: true` and the `stageMinutes` values.
  - A night whose only stages are AWAKE → `hasStages: false`.
  - A night with no summary → `stageMinutes: null`, `minutesAwake: null`.
  - `stagesBackfillPending`:
    - true with a CONNECTED connection and a null marker
    - false once the marker is set
    - false for a DISCONNECTED connection with a null marker
    - false with no connection (Review Focus 5)

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.** Extend the session query's select:

```ts
      select: {
        startTime: true, endTime: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true, minutesAsleep: true,
        minutesAwake: true, deepMinutes: true, lightMinutes: true, remMinutes: true, awakeMinutes: true,
        stages: { where: { type: { in: ['DEEP', 'LIGHT', 'REM'] } }, select: { id: true }, take: 1 },
      },
```

Add the connection read to the `Promise.all`:

```ts
    prisma.healthConnection.findUnique({ where: { userId }, select: { status: true, sleepStagesBackfilledAt: true } }),
```

Per night, using `main` from Task 4:

```ts
        minutesAwake: main?.minutesAwake ?? null,
        stageMinutes: main && [main.deepMinutes, main.lightMinutes, main.remMinutes, main.awakeMinutes].some((v) => v != null)
          ? { deep: main.deepMinutes ?? 0, light: main.lightMinutes ?? 0, rem: main.remMinutes ?? 0, awake: main.awakeMinutes ?? 0 }
          : null,
        hasStages: (main?.stages.length ?? 0) > 0,
```

At the top level: `stagesBackfillPending: conn?.status === 'CONNECTED' && conn.sleepStagesBackfilledAt === null`. Extend both DTO interfaces to match.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/biometrics/activity.ts backend/tests
git commit -m "feat(backend): stage minutes, hasStages and backfill status on /me/sleep"
```

### Task 6: One night endpoint

**Files:**
- Create: `backend/src/biometrics/sleepNight.ts`
- Modify: `backend/src/biometrics/routes.ts` (add `GET /me/sleep/night/:date` after `/me/sleep`)
- Test: `backend/tests/biometrics/sleepNight.test.ts`

**Interfaces:**
- Consumes: `pickMainSession` (Task 4), `sessionEndCivilDate` and `localClockTime` (existing in `biometrics/civilDate.ts`).
- Produces: `getSleepNight(userId: string, date: string): Promise<SleepNightDetailDTO | null>`. The DTO is exactly spec §2's night shape. `stageTotals` counts come from the stored stage rows per type; minutes come from the session's stage-minute fields.

- [ ] **Step 1: Write the failing tests.** Use the route (follow `/me/sleep`'s route tests for app and auth setup):
  - A full night with stages and a 25-minute nap ending the same date:
    - The main session is the night.
    - `naps` has the nap.
    - `stages` is ordered.
    - `stageTotals.deep` equals `{ minutes: deepMinutes, count: <number of DEEP rows> }`.
    - `minutesInBed` equals `minutesInSleepPeriod`.
  - **Travel (Review Focus 4):** a session with offsets of `+3600s` while `User.timezone` is `America/New_York`. Bedtime and wake time are the session's own local clock.
  - A night without stages → `hasStages: false`, `stages: []`, `stageTotals: null`.
  - `minutesInBed` falls back to the interval length when `minutesInSleepPeriod` is null.
  - `usualMinutesAsleep`:
    - null when only 6 of the 30 previous nights have SLEEP rollups
    - the average when 7 have them
  - An unknown date → 404 `{ error: 'not_found' }`; a malformed date → 400.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement** `sleepNight.ts`:
  - **Sessions:** load the sessions ending in `[date − 1 day, date + 2 days)`, with their stages ordered by `startTime`. Keep those whose `sessionEndCivilDate(s, tz) === date`. The main session is `pickMainSession(own)`; the others are `naps`.
  - **`usualMinutesAsleep`:** read the SLEEP rollups for `[date − 30, date − 1]`; if there are 7 or more, use their mean rounded to a whole minute, else null.
  - **`sleepScore`:** today's `dailyScore` of type SLEEP, rounded, else null.
  - **Validation:** validate `date` with the existing `isCivilDate` (export it from `activity.ts` if it isn't exported).
  - **Route:** `biometricsRouter.get('/me/sleep/night/:date', requireAuth, …)` → 400 for a bad date, 404 when null, else JSON.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/biometrics/sleepNight.ts backend/src/biometrics/routes.ts backend/src/biometrics/activity.ts backend/tests
git commit -m "feat(backend): one-night sleep detail endpoint with stages and naps"
```

### Task 7: Sleep regularity endpoint

**Files:**
- Modify: `backend/src/scoring/features.ts` (extract the spread maths)
- Create: `backend/src/biometrics/regularity.ts`
- Modify: `backend/src/biometrics/routes.ts`
- Test: `backend/tests/biometrics/regularity.test.ts`, `backend/tests/scoring/features.test.ts`

**Interfaces:**
- Produces:
  - In `scoring/features.ts`:
    - `export function populationStdDev(values: number[]): number`
    - `export function spreadToScore(stdMinutes: number, maxStdMinutes: number): number`, which returns `100 * Math.max(0, 1 - std / max)`
    - `circadianConsistencyOn` uses both, with unchanged output.
  - `getSleepRegularity(userId, days: 7 | 30): Promise<SleepRegularityDTO>` (spec §2 shape).

- [ ] **Step 1: Write the failing tests.**
  - **Unit:** `spreadToScore(0, 120) === 100`, `spreadToScore(60, 120) === 50`, `spreadToScore(240, 120) === 0`; `populationStdDev([10, 20, 30])` ≈ 8.165.
  - **Regularity (seed sessions):**
    - 7 nights with bedtimes 23:00, 23:10, 22:50, 23:05, 00:30, 23:00, 22:55 local and wakes around 07:00. **Review Focus 1:** 00:30 counts as later than 23:00. `averageBedtime` is around "23:13"; the drift for the 00:30 night is about +77 minutes; the score is between 0 and 100.
    - 3 nights in 7 days → `score: null`, `nights: 3`.
    - 14 nights for `days=30` → null; 15 → a number.
    - `days=10` → 400.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - **Extract the maths:** move the variance and score maths out of `circadianConsistencyOn` into the two helpers, and call them from there.
  - **Window:** in `regularity.ts`, compute today with `localCivilDateOrUtc(new Date(), user.timezone)` (as `coach/digest.ts` does). The window is the `days` civil dates ending today.
  - **Nights:** load the sessions ending in the window (±1 day margin) and group them by `sessionEndCivilDate`. Take `pickMainSession` per date.
  - **Bedtime:** `sessionStartMinutesSinceLocalNoon(main, tz)`.
  - **Wake:** `sessionStartMinutesSinceLocalNoon({ startTime: main.endTime, startUtcOffsetSeconds: main.endUtcOffsetSeconds }, tz)`.
  - **Score:** `nights < (days === 7 ? 4 : 15)` → `score` and both spreads null. Otherwise `score = round((spreadToScore(stdBed, 120) + spreadToScore(stdWake, 120)) / 2)`.
  - **Average times:** the mean of the noon-anchored minutes, converted back to "HH:MM" (`(noonMinutes + 12*60) % (24*60)`).
  - **Drift:** `bedtimeMinutes − meanBedtime`, rounded.
  - **Route:** `GET /me/sleep/regularity`. Validate `days` ∈ {7, 30}, else 400 `{ error: 'days must be 7 or 30' }`.

- [ ] **Step 4: Run** these tests plus `tests/scoring`. Expected: PASS; the existing circadian tests are unchanged.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/scoring/features.ts backend/src/biometrics/regularity.ts backend/src/biometrics/routes.ts backend/tests
git commit -m "feat(backend): sleep regularity endpoint sharing the spread maths with scoring"
```

### Task 8: Sleep goal endpoints, today's rescore, goal on factors

**Files:**
- Modify: `backend/src/users/goals.ts`, `backend/src/biometrics/routes.ts`, `backend/src/scoring/pipeline.ts` (~186–200, factor objects), `backend/src/scoring/compute.ts` (`scoreRowData`), `backend/src/scoring/dto.ts` (`StoredFactor`, `FactorDTO`, `toDailyScoreDTO`)
- Test: `backend/tests/users/sleepGoal.test.ts`, `backend/tests/scoring/goalOnFactors.test.ts`

**Interfaces:**
- Produces:
  - In `goals.ts`:
    - `getSleepGoal(userId): Promise<{ sleepGoalMinutes: number; bedtimeGoal: string|null; wakeGoal: string|null }>`
    - `updateSleepGoal(userId, patch): Promise<… | null>` (null = no user)
  - The stored factor gains an optional `goalMinutes?: number` on `SLEEP_DEBT` and `SLEEP_DURATION`.
  - `FactorDTO` gains `goalMinutes?: number`.

- [ ] **Step 1: Write the failing tests.**
  - `GET /me/sleep/goal` → `{ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null }`.
  - **Valid PUT:** `{ sleepGoalMinutes: 450 }` → 200 and saved.
  - **Rejected PUTs:** each of these → 400 `invalid_goal`:
    - `{ sleepGoalMinutes: 239 }` and `{ sleepGoalMinutes: 721 }`
    - `{ sleepGoalMinutes: 450.5 }`
    - `{ bedtimeGoal: '24:00' }` and `{ bedtimeGoal: '7:00' }`
    - `{}`
    - `{ wakeGoal: 7 }`
  - `{ bedtimeGoal: null }` clears it.
  - **Rescore only for a goal change** (spy on `enqueueScoreCompute` as the other route tests do):
    - A sleep-goal change enqueues **exactly one** job, for the user's local today.
    - **Review Focus 3:** `{ bedtimeGoal: '23:00', wakeGoal: '07:00' }` alone enqueues **none**.
    - `{ sleepGoalMinutes: <the same value> }` enqueues none.
  - `computeDailyScore` for a day with a 450 goal stores `goalMinutes: 450` on the `SLEEP_DEBT` and `SLEEP_DURATION` factors.
  - `toDailyScoreDTO` passes `goalMinutes` through, and omits it for a row whose stored factors have none.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - **`goals.ts`:**

```ts
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export type SleepGoal = { sleepGoalMinutes: number; bedtimeGoal: string | null; wakeGoal: string | null };
export type SleepGoalPatch = Partial<SleepGoal>;

/** null when the body is not a valid, non-empty patch (spec 2026-10-03 §2). */
export function parseSleepGoalPatch(body: unknown): SleepGoalPatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const out: SleepGoalPatch = {};
  if ('sleepGoalMinutes' in b) {
    const v = b.sleepGoalMinutes;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 240 || v > 720) return null;
    out.sleepGoalMinutes = v;
  }
  for (const k of ['bedtimeGoal', 'wakeGoal'] as const) {
    if (k in b) {
      const v = b[k];
      if (v !== null && (typeof v !== 'string' || !HHMM.test(v))) return null;
      out[k] = v as string | null;
    }
  }
  return Object.keys(out).length ? out : null;
}
```

  - **The route** reads the user (for timezone and current goal), runs `prisma.user.updateMany({ where: { id }, data: patch })` (count 0 → 404), then, if `patch.sleepGoalMinutes !== undefined && patch.sleepGoalMinutes !== previous`, calls `enqueueScoreCompute(userId, localCivilDateOrUtc(new Date(), user.timezone))`. Check its parameter list in `scoring/queue.ts:44` and pass the queue argument the same way the other route callers do. It returns `getSleepGoal`.
  - **`pipeline.ts`:** add `goalMinutes: input.sleepGoalMinutes` to the `SLEEP_DEBT` factor object and to the `SLEEP_DURATION` factor object.
  - **`compute.ts` `scoreRowData`:** add `...(x.goalMinutes !== undefined ? { goalMinutes: x.goalMinutes } : {})` (the same pattern as `zRaw`).
  - **`dto.ts`:** add `goalMinutes?: number` to `StoredFactor` and `FactorDTO`, and map it with `...(f.goalMinutes !== undefined ? { goalMinutes: f.goalMinutes } : {})`.

- [ ] **Step 4: Run** these tests plus `tests/scoring` and `tests/coach` (the coach reads factors). Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/users/goals.ts backend/src/biometrics/routes.ts backend/src/scoring backend/tests
git commit -m "feat(backend): sleep goal endpoints; goal changes rescore today and scores record their goal"
```

### Task 9: Stage backfill

**Files:**
- Modify: `backend/src/sync/worker.ts:320-340` (the history backfill sets both markers; add the `backfillSleepStages` handler), `backend/src/sync/queue.ts` (add `enqueueSleepStagesBackfill`), `backend/src/sync/sleepHistory.ts` (add `enqueuePendingSleepStagesBackfills`), `backend/src/server.ts` (call it at startup next to the history one)
- Test: `backend/tests/sync/sleepStagesBackfill.test.ts`

**Interfaces:**
- Produces:
  - `enqueueSleepStagesBackfill(userId: string)`
  - `enqueuePendingSleepStagesBackfills(): Promise<number>`, which selects `status: 'CONNECTED', sleepHistoryBackfilledAt: { not: null }, sleepStagesBackfilledAt: null`

- [ ] **Step 1: Write the failing tests:**
  - **Selection:** `enqueuePendingSleepStagesBackfills` enqueues only connections that are CONNECTED, with the history marker set and the stage marker null. It skips disconnected connections, connections with no history marker, and connections already done.
  - **History job:** sets `sleepStagesBackfilledAt` alongside `sleepHistoryBackfilledAt`.
  - **Stages job:**
    - With a mocked session fetch returning the already-stored nights plus stages, it stores the stages, sets its marker and enqueues **no** score jobs.
    - With one night whose `minutesAsleep` changed upstream, it enqueues rescoring for that date, the same as a normal sync.

  Mock the health client the same way the existing `backfillSleepHistory` tests do.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.** Mirror the existing `backfillSleepHistory` job exactly (same window from `sleepHistoryWindow()`, same token session, same rescore handling of the dates `storeSleepSessions` returns) under the job name `backfillSleepStages`. The history job's marker update becomes `data: { sleepHistoryBackfilledAt: now, sleepStagesBackfilledAt: now }`. Add the queue helper, mirroring `enqueueSleepHistoryBackfill`'s job id and dedupe, and add the startup call in `server.ts`.

- [ ] **Step 4: Run** this file plus `tests/sync`, then the full backend suite once (with no live backend running):

```bash
cd backend && TEST_DATABASE_URL=… DATABASE_URL=… REDIS_URL=redis://localhost:6379 NODE_OPTIONS=--experimental-vm-modules /Users/tushar/.nvm/versions/node/v24.21.0/bin/node node_modules/.bin/jest --forceExit
```

Expected: all pass. Rerun any single failure alone before treating it as real; two answerRoutes disconnect tests are known to be timing-flaky under full-suite load. Also run `npx tsc --noEmit` and expect it clean.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/sync backend/src/server.ts backend/tests
git commit -m "feat(backend): one-off sleep stage backfill for existing connections"
```

---

## Part 2: Mobile

### Task 10: API client, types and stage colour tokens

**Files:**
- Modify: `mobile/src/api/sleep.ts`, `mobile/src/api/scores.ts` (`FactorDTO.goalMinutes?`), `mobile/src/theme.ts` (light and dark `COLORS`), `mobile/global.css`, `mobile/tailwind.config.js` (follow exactly how `sleepHeat1..4` are wired)
- Test: `mobile/__tests__/api/sleep.test.ts`, `mobile/__tests__/theme/tokens.test.ts`

**Interfaces:**
- Produces:

```ts
export type StageType = 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM';
export interface SleepNight { /* existing */ minutesAwake: number | null; stageMinutes: { deep: number; light: number; rem: number; awake: number } | null; hasStages: boolean }
export interface SleepActivityDTO { nights: SleepNight[]; earliestDate: string | null; stagesBackfillPending: boolean }
export interface SleepNightDetail {
  date: string; bedtime: string | null; wakeTime: string | null; minutesAsleep: number; minutesInBed: number | null;
  minutesAwake: number | null; minutesToFallAsleep: number | null; minutesAfterWakeUp: number | null; hasStages: boolean;
  stages: { type: StageType; start: string; end: string }[];
  stageTotals: Record<'deep' | 'light' | 'rem' | 'awake', { minutes: number; count: number }> | null;
  naps: { start: string; end: string; minutesAsleep: number }[]; sleepScore: number | null; usualMinutesAsleep: number | null;
}
export interface SleepRegularity { days: 7 | 30; nights: number; score: number | null; bedtimeSpreadMinutes: number | null; wakeSpreadMinutes: number | null; averageBedtime: string | null; averageWake: string | null; drift: { date: string; bedtimeOffsetMinutes: number }[] }
export interface SleepGoal { sleepGoalMinutes: number; bedtimeGoal: string | null; wakeGoal: string | null }
export function fetchSleepNight(date: string): Promise<SleepNightDetail>;
export function fetchSleepRegularity(days: 7 | 30): Promise<SleepRegularity>;
export function fetchSleepGoal(): Promise<SleepGoal>;
export function saveSleepGoal(patch: Partial<SleepGoal>): Promise<SleepGoal>;
```

Tokens: `sleepDeep`, `sleepRem`, `sleepLight`, `sleepAwake`.

- [ ] **Step 1: Write the failing tests:**
  - **Requests:** each fetch hits the right path (`/me/sleep/night/2026-10-01`, `/me/sleep/regularity?days=7`, `/me/sleep/goal`), and `saveSleepGoal` PUTs JSON. Use `__tests__/api/sleep.test.ts`'s existing fetch mock.
  - **Older server:** `fetchSleep` against an older server with no `stagesBackfillPending`, `hasStages` or `stageMinutes` normalises to `false`, `false` and `null`.
  - **Tokens:** add the four tokens to `tokens.test.ts`'s parity checks. Assert that each stage colour reaches ≥3:1 contrast against the app background in both themes, since they are graphical marks.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.** Add the types and functions with `apiFetch`, plus normalisation in `fetchSleep` (`stagesBackfillPending: res.stagesBackfillPending === true`, and per night `hasStages: n.hasStages === true`, `stageMinutes: n.stageMinutes ?? null`, `minutesAwake: n.minutesAwake ?? null`). Add `goalMinutes?: number` to `FactorDTO`. Tokens (adjust if the contrast test fails):
  - **Light:** `sleepDeep: 'rgb(88, 28, 135)'`, `sleepRem: 'rgb(147, 51, 234)'`, `sleepLight: 'rgb(192, 132, 252)'`, `sleepAwake: 'rgb(234, 88, 12)'`
  - **Dark:** `sleepDeep: 'rgb(126, 34, 206)'`, `sleepRem: 'rgb(168, 85, 247)'`, `sleepLight: 'rgb(216, 180, 254)'`, `sleepAwake: 'rgb(251, 146, 60)'`

  Wire them in `global.css` and `tailwind.config.js` the way `sleepHeat*` are.

- [ ] **Step 4: Run** the two test files. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/api mobile/src/theme.ts mobile/global.css mobile/tailwind.config.js mobile/__tests__
git commit -m "feat(mobile): sleep detail, regularity and goal API; stage colour tokens"
```

### Task 11: Pure layout helpers

**Files:**
- Create: `mobile/src/lib/sleepWindow.ts`
- Test: `mobile/__tests__/lib/sleepWindow.test.ts`

**Interfaces:**
- Produces:

```ts
/** "HH:MM" → minutes since local noon (12:00 → 0, 23:00 → 660, 00:30 → 750, 07:00 → 1140). */
export function noonMinutes(hhmm: string): number;
export interface WindowBar { date: string; top: number; height: number } // fractions 0..1 of the axis
export interface WindowLayout {
  axisStart: number; axisEnd: number;           // noon-minutes; default 540 (21:00) .. 1260 (09:00), widened to fit, snapped to the hour
  bars: WindowBar[];                             // one per night that has bedtime AND wakeTime; missing nights omitted (gaps)
  avgBedtime: number | null; avgWake: number | null; // fraction of axis, or null with no bars
  goalBand: { top: number; height: number } | null;  // from bedtimeGoal/wakeGoal when both set
  ticks: { label: string; at: number }[];        // every 3 h, e.g. "21:00", "00:00", "03:00", "06:00", "09:00"
}
export function layoutSleepWindow(nights: { date: string; bedtime: string | null; wakeTime: string | null }[], goal: { bedtimeGoal: string | null; wakeGoal: string | null } | null): WindowLayout;
/** Minutes from bedtime to wake for a goal window, wrapping midnight: ("23:30","07:00") → 450. */
export function goalWindowMinutes(bedtime: string, wake: string): number;
```

- [ ] **Step 1: Write the failing tests:**

```ts
import { goalWindowMinutes, layoutSleepWindow, noonMinutes } from '../../src/lib/sleepWindow';

it('anchors clock times at noon so after-midnight sorts late (Review Focus 1)', () => {
  expect(noonMinutes('12:00')).toBe(0);
  expect(noonMinutes('23:00')).toBe(660);
  expect(noonMinutes('00:30')).toBe(750);
  expect(noonMinutes('07:00')).toBe(1140);
});

it('wraps goal windows across midnight (Review Focus 2)', () => {
  expect(goalWindowMinutes('23:30', '07:00')).toBe(450);
  expect(goalWindowMinutes('00:15', '08:00')).toBe(465);
  expect(goalWindowMinutes('22:00', '06:00')).toBe(480);
});

it('lays bars on the default 21:00–09:00 axis and leaves gaps for missing nights', () => {
  const l = layoutSleepWindow([
    { date: '2026-09-29', bedtime: '23:00', wakeTime: '07:00' },
    { date: '2026-09-30', bedtime: null, wakeTime: null },
    { date: '2026-10-01', bedtime: '00:30', wakeTime: '08:00' },
  ], null);
  expect([l.axisStart, l.axisEnd]).toEqual([540, 1260]);
  expect(l.bars.map((b) => b.date)).toEqual(['2026-09-29', '2026-10-01']);
  expect(l.bars[0]!.top).toBeCloseTo((660 - 540) / 720);
  expect(l.bars[0]!.height).toBeCloseTo(480 / 720);
  expect(l.bars[1]!.top).toBeGreaterThan(l.bars[0]!.top);
  expect(l.goalBand).toBeNull();
});

it('widens the axis to whole hours when a night falls outside it', () => {
  const l = layoutSleepWindow([{ date: '2026-10-01', bedtime: '20:10', wakeTime: '10:40' }], null);
  expect(l.axisStart).toBe(480); // 20:00
  expect(l.axisEnd).toBe(1380);  // 11:00
});

it('draws average lines and the goal band', () => {
  const l = layoutSleepWindow([{ date: 'a', bedtime: '23:00', wakeTime: '07:00' }, { date: 'b', bedtime: '23:30', wakeTime: '07:30' }], { bedtimeGoal: '23:00', wakeGoal: '07:00' });
  expect(l.avgBedtime).toBeCloseTo((675 - 540) / 720);
  expect(l.goalBand).toEqual({ top: (660 - 540) / 720, height: 480 / 720 });
});
```

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement:**

```ts
const DAY = 24 * 60;
export function noonMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (((h! * 60 + m!) - 12 * 60) % DAY + DAY) % DAY;
}
export function goalWindowMinutes(bedtime: string, wake: string): number {
  const d = noonMinutes(wake) - noonMinutes(bedtime);
  return d > 0 ? d : d + DAY;
}
export function layoutSleepWindow(nights: { date: string; bedtime: string | null; wakeTime: string | null }[], goal: { bedtimeGoal: string | null; wakeGoal: string | null } | null): WindowLayout {
  const spans = nights.filter((n) => n.bedtime && n.wakeTime).map((n) => {
    const start = noonMinutes(n.bedtime!);
    let end = noonMinutes(n.wakeTime!);
    if (end <= start) end += DAY;
    return { date: n.date, start, end };
  });
  const goalSpan = goal?.bedtimeGoal && goal.wakeGoal
    ? { start: noonMinutes(goal.bedtimeGoal), end: noonMinutes(goal.bedtimeGoal) + goalWindowMinutes(goal.bedtimeGoal, goal.wakeGoal) }
    : null;
  const lo = Math.min(540, ...spans.map((s) => s.start), ...(goalSpan ? [goalSpan.start] : []));
  const hi = Math.max(1260, ...spans.map((s) => s.end), ...(goalSpan ? [goalSpan.end] : []));
  const axisStart = Math.floor(lo / 60) * 60;
  const axisEnd = Math.ceil(hi / 60) * 60;
  const len = axisEnd - axisStart;
  const frac = (m: number) => (m - axisStart) / len;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgStart = mean(spans.map((s) => s.start));
  const avgEnd = mean(spans.map((s) => s.end));
  const ticks: { label: string; at: number }[] = [];
  for (let m = Math.ceil(axisStart / 180) * 180; m <= axisEnd; m += 180) {
    const clock = ((m + 12 * 60) % DAY);
    ticks.push({ label: `${String(Math.floor(clock / 60)).padStart(2, '0')}:00`, at: frac(m) });
  }
  return {
    axisStart, axisEnd,
    bars: spans.map((s) => ({ date: s.date, top: frac(s.start), height: (s.end - s.start) / len })),
    avgBedtime: avgStart === null ? null : frac(avgStart),
    avgWake: avgEnd === null ? null : frac(avgEnd),
    goalBand: goalSpan ? { top: frac(goalSpan.start), height: (goalSpan.end - goalSpan.start) / len } : null,
    ticks,
  };
}
```

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/lib/sleepWindow.ts mobile/__tests__/lib/sleepWindow.test.ts
git commit -m "feat(mobile): sleep window layout maths"
```

### Task 12: Sleep screen

**Files:**
- Create: `mobile/src/screens/SleepScreen.tsx`, `mobile/src/components/sleep/WindowChart.tsx`, `mobile/src/components/sleep/RegularityCard.tsx`, `mobile/src/components/sleep/StageStrip.tsx`, `mobile/src/lib/regularityCopy.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (routes `Sleep: undefined`, `SleepNight: { date: string }`, `BedtimeGoal: undefined`), `mobile/src/screens/DashboardScreen.tsx:269` (the Sleep tile opens `Sleep`), the Activity Sleep page header in `mobile/src/components/activity-heatmap.tsx` ("Sleep details" link)
- Test: `mobile/__tests__/screens/SleepScreen.test.tsx`, `mobile/__tests__/lib/regularityCopy.test.ts`, `mobile/__tests__/screens/DashboardScreen.test.tsx` (update)

**Interfaces:**
- Consumes: Task 10 API, Task 11 `layoutSleepWindow`, `useCharacter()` (`characterId`) and `characterInfo` (`name`, `accent`) from PR #47.
- Produces:
  - `regularityLine(score: number | null, coachName: string): string | null`. The bands are steady ≥ 75, drifting ≥ 50, else irregular. It returns null when the score is null.
  - `StageStrip({ stages, start, end, height }): JSX`, which Task 13 reuses.
  - Test IDs: `sleep-score-header`, `sleep-why-score`, `sleep-range-week`, `sleep-range-two-weeks`, `sleep-window-chart`, `sleep-window-bar-<date>`, `sleep-regularity`, `sleep-regularity-empty`, `sleep-last-night`, `sleep-goal-row`, `sleep-older-nights`.

- [ ] **Step 1: Write the failing tests:**
  - **`regularityCopy`:**
    - `regularityLine(80, 'Luna')` → "Luna: Steady nights. Keep the rhythm."
    - `regularityLine(60, 'Kit')` → "Kit: Your bedtime drifts a little. A steadier night helps."
    - `regularityLine(30, 'Mochi')` → "Mochi: Bedtimes are all over the place lately. Pick one and try it."
    - `regularityLine(null, 'Luna')` → null
    - No template contains a digit.
  - **SleepScreen:** mock the API functions.
    - It renders the chart bars for nights with times.
    - **Tapping a bar** navigates to `SleepNight { date }`.
    - **Range toggle:** "Two weeks" refetches with a 14-day range.
    - **Regularity card:** title "Sleep regularity", the caption text from the spec, and the coach line.
    - **`score: null`** shows "Not enough nights yet. {n} more to go." (n = 4 − nights for 7 days).
    - **Score header:** "Why this score" navigates to `ScoreDetail { date, type: 'SLEEP' }`.
    - **Goal row:** shows "Set a bedtime goal" when unset; tapping it navigates to `BedtimeGoal`.
    - **Backfill line:** `stagesBackfillPending: true` shows `sleep-older-nights`; false hides it.
    - **Section failures:** a failed regularity fetch shows a retry on that card only, and the chart still renders.
    - **No nights at all** (Review Focus 5): the empty chart says "No sleep synced yet." and nothing else crashes.
  - **DashboardScreen:** the Sleep tile now navigates to `Sleep`; update the existing assertion that expected `ScoreDetail`.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - **`regularityCopy.ts`:**

```ts
// Fixed lines per band (spec 2026-10-03 §3): never generated, never a number.
export function regularityLine(score: number | null, coachName: string): string | null {
  if (score === null) return null;
  if (score >= 75) return `${coachName}: Steady nights. Keep the rhythm.`;
  if (score >= 50) return `${coachName}: Your bedtime drifts a little. A steadier night helps.`;
  return `${coachName}: Bedtimes are all over the place lately. Pick one and try it.`;
}
```

  - **`SleepScreen`:** a `ScrollView` with each section in its own `Card`, following `ActivityScreen` and `ScoreDetailScreen` for header, safe area and card styles. Each section has its own load state:
    - `fetchSleep(from, to)` for the last 7 or 14 civil days (reuse the date helpers `ActivityScreen` uses).
    - `fetchSleepRegularity(7)`.
    - `fetchSleepGoal()`.
    - Today's SLEEP score from `fetchScoreDetail` (or whatever the Home tile uses).
  - **`WindowChart`:** a fixed-height (220pt) `View` with absolutely positioned bars from `layoutSleepWindow`.
    - **Bars:** each bar is a `Pressable` with `accessibilityLabel` "{weekday}: {bedtime} to {wake}", in `metricSleep`.
    - **Lines:** dashed average lines in `sleepHeat3`, and the goal band in `sleepHeat1` at 60% opacity.
    - **Labels:** tick labels on the left.
  - **`RegularityCard`:** the ring (reuse `components/ui/score-ring`), the spreads, and a 7-dot drift strip. A dot's offset is `bedtimeOffsetMinutes` scaled at ±90 minutes; dots beyond ±30 minutes use `sleepAwake`, the rest `metricSleep`. Then the caption and `regularityLine`.
  - **`StageStrip`:** a horizontal `View` of segments sized by duration, coloured by the stage tokens (DEEP `sleepDeep`, REM `sleepRem`, LIGHT `sleepLight`, AWAKE `sleepAwake`). Its `accessibilityLabel` summarises the minutes per stage.
  - **Last night:** the newest night with `hasStages` gets a mini `StageStrip` (fetch `fetchSleepNight` for that date) and "See the whole night" → `SleepNight`.
  - **Navigation:** register the three routes in `RootNavigator`. `SleepNight` and `BedtimeGoal` use placeholder screens until Tasks 13 and 14; register them now pointing at those files, and create those files in their tasks.

- [ ] **Step 4: Run** these tests plus the Dashboard and Activity tests. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src mobile/__tests__
git commit -m "feat(mobile): Sleep screen with window chart and sleep regularity"
```

### Task 13: One night in detail

**Files:**
- Create: `mobile/src/screens/SleepNightScreen.tsx`, `mobile/src/components/sleep/StageBreakdown.tsx`
- Modify: `mobile/src/components/activity-sheets.tsx` (`NightDetail`: add an "Open full night" link with `testID="night-open-full"`)
- Test: `mobile/__tests__/screens/SleepNightScreen.test.tsx`, `mobile/__tests__/components/activity-sheets.test.tsx` (update)

**Interfaces:**
- Consumes: `fetchSleepNight` (Task 10), `StageStrip` (Task 12), `characterInfo(useCharacter().characterId).name`.
- Produces: test IDs `night-stage-strip`, `night-breakdown-<deep|light|rem|awake>`, `night-numbers`, `night-naps`, `night-ask-coach`, `night-no-stages`.

- [ ] **Step 1: Write the failing tests** (API mocked):
  - **Header:** with stages, it shows the date and time asleep.
  - **Stages:** `night-stage-strip` is present. Each breakdown row shows minutes, a percentage and the count. Deep, light and REM percentages are of time asleep; awake is of time in bed.
  - **Night numbers:** time in bed, time awake, time to fall asleep, time after waking, score, and the difference from usual (as "+12m vs usual" or "−8m vs usual"). With `usualMinutesAsleep: null`, the comparison is omitted.
  - **Naps:** listed as "Nap · 25m".
  - **Ask:** `night-ask-coach` reads "Ask Luna about this night" and navigates to `Tabs { screen: 'Coach', params: { prefill: 'How was my sleep on Thursday 1 October?' } }`, unsent.
  - **No stages:** `hasStages: false` shows `night-no-stages` (the asleep/in-bed bar) and neither the strip nor the breakdown.
  - **Errors:** a 404 shows "No sleep recorded for this night."; another error shows a retry.
  - **Night sheet:** the Activity `NightDetail` has `night-open-full`, which navigates to `SleepNight { date }`.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement**, following `NightDetail`'s formatting helpers in `activity-sheets.tsx` and `lib/sleepStats.ts`; reuse them rather than duplicating. Format the date for the prefill with the same helper the night sheet uses for its title.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src mobile/__tests__
git commit -m "feat(mobile): one-night sleep detail with stages"
```

### Task 14: Bedtime goal screen, heat-map goal, "vs your goal"

**Files:**
- Create: `mobile/src/screens/BedtimeGoalScreen.tsx`
- Modify: `mobile/src/screens/ActivityScreen.tsx` and `mobile/src/components/activity-heatmap.tsx:101` (the sleep goal comes from `fetchSleepGoal`, falling back to 480), `mobile/src/screens/ScoreDetailScreen.tsx` (the factor row shows "vs your goal of {h}h {m}m" when `goalMinutes` is present)
- Test: `mobile/__tests__/screens/BedtimeGoalScreen.test.tsx`, plus updates to the ScoreDetail and Activity tests

**Interfaces:**
- Consumes: `fetchSleepGoal`/`saveSleepGoal` (Task 10), `goalWindowMinutes` (Task 11), and the Task 15 wind-down API: `enableWindDown`, `disableWindDown`, `readWindDown`, `setWindDownLead`.
- Produces: test IDs `goal-bed-minus`, `goal-bed-plus`, `goal-bed-value`, `goal-wake-minus`, `goal-wake-plus`, `goal-wake-value`, `goal-sleep-minus`, `goal-sleep-plus`, `goal-sleep-value`, `goal-window-line`, `goal-save`, `goal-error`, `winddown-switch`, `winddown-lead-<15|30|45|60>`, `winddown-preview`, `winddown-denied`.

Because Task 15 provides the wind-down functions, **implement Task 15 before this task's reminder section**. The executor may run Task 15 first. This task's tests mock `../src/lib/windDown`.

- [ ] **Step 1: Write the failing tests:**
  - **Load:** shows the saved goal; when unset, defaults are displayed but not saved (bedtime 23:00, wake 07:00).
  - **Steppers:** move times in 15-minute steps and wrap across midnight (23:45 + 15 → 00:00). The sleep goal stays within 4h–12h.
  - **Window line (Review Focus 2):**
    - bedtime 23:30, wake 07:00, goal 8h → "That's 7h 30m in bed. Your goal is 8h asleep.", shown in orange
    - bedtime 22:30 with the same wake → the default colour
  - **Save:** PUTs only the changed fields. On failure, values go back to the saved goal and `goal-error` shows "Your goal couldn't be saved. Check your connection and try again."
  - **Wind-down switch:**
    - disabled with "Set a bedtime first" when `bedtimeGoal` is null
    - on → calls `enableWindDown({ bedtimeGoal, leadMinutes, coachName })`
    - `'denied'` result → the switch goes back off and `winddown-denied` shows "Notifications are off for Biometrics. Turn them on in Settings." with a Settings link (`Linking.openSettings`)
  - **Lead:** changing it calls `setWindDownLead`.
  - **Preview:** reads "{Coach}: Wind-down time. Bed in {lead} min."
  - **Heat map:** with `fetchSleepGoal → 420`, the Activity sleep levels use 420. On failure they use 480.
  - **ScoreDetail:**
    - a `SLEEP_DURATION` factor with `goalMinutes: 450` shows "vs your goal of 7h 30m"
    - without `goalMinutes`, no goal text

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement** the screen with the existing UI primitives (Card, Button, the `SettingsRow` look for rows). Saving goes through `saveSleepGoal`. After a successful save that changed `bedtimeGoal` while the reminder is on, call `enableWindDown` again to reschedule. Format durations as `{h}h {m}m`, dropping "0m".

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src mobile/__tests__
git commit -m "feat(mobile): bedtime goal screen; goal-aware heat map and score detail"
```

### Task 15: Wind-down reminder

**Files:**
- Create: `mobile/src/lib/windDown.ts`, `mobile/src/notifications/handler.ts`, `mobile/src/navigation/navigationRef.ts`
- Modify: `mobile/App.tsx` (call `installNotificationHandler()` once at module load, next to `applyDefaultThemeSync()`), `mobile/src/navigation/RootNavigator.tsx` (pass `ref={navigationRef}` to `NavigationContainer`; on mount, `routeInitialNotification()` plus a response listener; on `AppState` → active, `rescheduleWindDown()`), `mobile/src/auth/AuthContext.tsx:58-61` (`dropLocalSession` also awaits `clearWindDown()`)
- Test: `mobile/__tests__/lib/windDown.test.ts`, `mobile/__tests__/notifications/handler.test.ts`, `mobile/__tests__/auth/AuthContext.test.tsx` (update)

**Interfaces:**
- Produces:

```ts
// lib/windDown.ts
export type WindDownSettings = { enabled: boolean; leadMinutes: 15 | 30 | 45 | 60; bedtimeGoal: string | null; coachName: string; notificationId: string | null };
export function readWindDown(): Promise<WindDownSettings>;                     // defaults: enabled false, lead 30
export function enableWindDown(o: { bedtimeGoal: string; leadMinutes: 15 | 30 | 45 | 60; coachName: string }): Promise<'scheduled' | 'denied'>;
export function disableWindDown(): Promise<void>;
export function setWindDownLead(lead: 15 | 30 | 45 | 60): Promise<void>;       // reschedules when enabled
export function rescheduleWindDown(): Promise<void>;                            // cancel + schedule from stored settings when enabled
export function clearWindDown(): Promise<void>;                                 // cancel + delete stored settings
export function reminderTime(bedtimeGoal: string, lead: number): { hour: number; minute: number }; // pure, wraps midnight
// notifications/handler.ts
export const WIND_DOWN_KIND = 'wind-down';
export function installNotificationHandler(): void;
export function routeInitialNotification(): Promise<void>;
export function listenForNotificationTaps(): () => void;
// navigation/navigationRef.ts
export const navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>;
```

- [ ] **Step 1: Write the failing tests** (mock `expo-notifications` and `expo-secure-store`):

```ts
import { reminderTime } from '../../src/lib/windDown';
it('wraps the reminder time across midnight (Review Focus 2)', () => {
  expect(reminderTime('23:00', 30)).toEqual({ hour: 22, minute: 30 });
  expect(reminderTime('00:15', 30)).toEqual({ hour: 23, minute: 45 });
  expect(reminderTime('00:00', 60)).toEqual({ hour: 23, minute: 0 });
});
```

- **Permissions:**
  - **Granted:** `getPermissionsAsync → granted`, so `enableWindDown` schedules with no `requestPermissionsAsync` call.
  - **Not asked yet:** `undetermined` → requests, then schedules when granted.
  - **Denied:** `denied` → `'denied'`, no request call, nothing scheduled.
  - **Declined now:** `undetermined` then declined → `'denied'`.
- **Scheduling:** `scheduleNotificationAsync` is called with:
  - `content.data.kind === 'wind-down'` and body "Wind-down time. Bed in 30 min.", with the coach name as the title
  - `trigger: { type: SchedulableTriggerInputTypes.DAILY, hour, minute }`
  - The returned id is stored.
- **One reminder:** enabling twice leaves one scheduled reminder (the previous id is cancelled).
- **Lead:** `setWindDownLead(45)` reschedules at bedtime − 45 minutes.
- **Off:** `disableWindDown` cancels and stores `enabled: false`.
- **Reschedule:** `rescheduleWindDown` does nothing when disabled.
- **Clear:** `clearWindDown` cancels and deletes the key. In `AuthContext.test`, both `signOut` and `clearSession` call `clearWindDown`.
- **Handler:** `installNotificationHandler` registers a handler that returns `{ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }` for `kind: 'wind-down'`, and all `false` for anything else.
- **Taps:**
  - `routeInitialNotification` navigates to `Sleep` when the last response has `kind: 'wind-down'`, and does nothing otherwise.
  - The tap listener navigates to `Sleep` for wind-down responses.

- [ ] **Step 2: Run and check that they fail.**

- [ ] **Step 3: Implement.**
  - **Storage:** SecureStore key `windDown` holds JSON. Every read and write sits in try/catch, like `characterCache.ts`.
  - **Reminder time:** `reminderTime` uses `((h*60+m - lead) % 1440 + 1440) % 1440`.
  - **Scheduling** cancels a stored id first (`cancelScheduledNotificationAsync`), then schedules:

```ts
await Notifications.scheduleNotificationAsync({
  content: { title: coachName, body: `Wind-down time. Bed in ${leadMinutes} min.`, data: { kind: WIND_DOWN_KIND } },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
});
```

  - **Navigation ref:** `navigationRef = createNavigationContainerRef<RootStackParamList>()`. Navigate only when `navigationRef.isReady()`; for a cold start, wait for ready by retrying on a 100 ms interval, capped at 5 s.

- [ ] **Step 4: Run** these tests, then the **whole mobile suite**:

```bash
cd mobile && /Users/tushar/.nvm/versions/node/v24.21.0/bin/node node_modules/.bin/jest --forceExit
/Users/tushar/.nvm/versions/node/v24.21.0/bin/node node_modules/.bin/tsc --noEmit --types jest,node
```

Expected: all suites pass. `tsc` should show only the 12 known errors, in files this branch doesn't touch (App.tsx `global.css`; client, ActivityHeatmap, FactorBar, ScoreRing, MetricDetailScreen tests); report if the set differs.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src mobile/App.tsx mobile/__tests__
git commit -m "feat(mobile): wind-down reminder as a daily local notification"
```

### Task 16: Simulator check and draft PR

**Files:** none new (screenshots go in the PR description only).

- [ ] **Step 1: Full suites.** Run backend (no live backend running) and mobile. Record the counts.
- [ ] **Step 2: Run on the simulator** (handoff §5 and memory `biometrics-ios-run-setup`):
  - Sync `mobile/` into `~/dev/biometrics-run/mobile` with the rsync from the handoff, then `npm install`.
  - No native change is expected (`expo-notifications` is already installed), so a Metro restart with `--clear` is enough. If the app reports a missing native module, run `pod install` and rebuild.
  - Run the backend from this worktree with `npx prisma migrate deploy` (back up `User.id, coachPersonaId, bedtimeGoal, wakeGoal` first) and `node --env-file=… dist/server.js`.
- [ ] **Step 3: Check on screen with the owner's account** and record PASS / FAIL / NOT CHECKED for each:
  - The Home sleep tile opens the Sleep screen, and "Why this score" opens score detail.
  - The window chart shows real nights. Tapping a bar opens that night with its stage strip and breakdown.
  - The regularity card shows the score or the not-enough-nights state.
  - Set a bedtime goal and turn on the reminder with bedtime set 2 minutes after now plus the lead. The notification appears **with the app open**, and again in the background the next time. Tapping it opens the Sleep screen.
  - Light and dark mode.
  - "Reading older nights…" disappears once the stage backfill has run.
- [ ] **Step 4: Push and open a draft PR stacked on #47:**

```bash
git push -u origin feature/sleep-depth
gh pr create --draft --base worktree-pixel-coaches --title "Sleep depth: stages, Sleep screen, regularity, bedtime goal" --body-file <body file>
```

The body summarises the spec sections, test counts, simulator results, and "Stacked on #47: rebase onto main after #47 merges." No Claude attribution.
