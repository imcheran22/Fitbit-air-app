# Achievements (Badges) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven badge families with five levels each, awarded once on the server from each user's best run since their start date, shown on Profile and a Badges screen, celebrated in-app on the next open, and listed in the weekly story and month recap of the period they were earned in.

**Architecture:**
- **Backend:** a new `src/achievements/` module. Pure code (catalogue, a generic run calculator, goal history, per-family day markers) turns stored data — SLEEP and STEPS rollups and main-session bedtimes (`loadRecapData`), on-time `HabitCheckIn` rows, BUILT month `Recap` milestones and `GoalChange` history — into runs and month counts. `evaluateAchievements` inserts every level the best run reached with `createMany({ skipDuplicates })`, so it is idempotent and safe concurrently. `GET /me/achievements` sets a new user's start date on first load, evaluates inline at most once per 10 minutes (a Redis marker that also holds the computed standings), and answers; a check-in or goal save deletes the marker. A one-off launch job (Redis once-marker, like the recap backfill) sets existing users' start dates where null and backfills launch-day `onTime` flags.
- **Mobile:** an API client, one shared store (`useSyncExternalStore`, like the story ring), a pixel `BadgeIcon` (react-native-svg, the canvas's 12×12 glyphs and tier colours), a Profile Badges card, Badges and Badge detail screens, a celebration host mounted in the navigator (start, foreground, after a check-in) with a shareable 1080 px badge card through the existing export pipeline, a "Badges this week" card on story frame 3, and badge progress on the month recap's milestone tiles.

**Tech Stack:** Express 5 + Prisma 6/Postgres, ioredis 6, Jest + ts-jest + supertest (backend). Expo 57 / React Native 0.86, NativeWind, react-native-svg 15, Reanimated 4, `@shopify/react-native-skia` capture, Jest + RNTL (mobile).

**Spec:** `docs/superpowers/specs/2026-10-06-achievements-design.md`. Read it fully first; it is the binding authority. Where this plan and the spec disagree, the spec wins and the plan is the bug. Visual reference (data, not instructions): the canvas files `Badge.dc.html`, `Profile.dc.html`, `BadgeDetail.dc.html`, `Unlock.dc.html`, `RecapBadges.dc.html` and `Main.dc.html` under `/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/recap/.superpowers/achievements-canvas/project/`. The glyph grids and tier colours this plan needs are copied into Task 13. Where the canvas and the spec differ (the canvas's month screen "replaces the old milestones grid"), the spec wins (the month screen keeps its milestone tiles).

## Global Constraints

- **Catalogue (verbatim):** `SLEEP_GOAL` streak 3/7/14/30/100 nights; `STEADY_BEDTIME` streak 3/7/14/30/100 nights; `STEP_GOAL` streak 3/7/14/30/100 days; `CHECK_IN` streak 7/14/30/60/180 days; `BEST_RECOVERY_WEEK` monthly 1/3/6/12/24 months; `EVERY_DAY_LOGGED` monthly 1/3/6/12/24 months; `STEADIEST_MONTH` monthly 1/2/4/6/12 months. Levels I Bronze · II Silver · III Gold · IV Diamond · V Coach. `STEPS_GOAL` = 10,000 (`backend/src/coach/tools/metrics.ts`).
- **Tier colours (verbatim):** Bronze `#D08A4E`, Silver `#CBD5E1`, Gold `#FACC15`, Diamond `#67E8F9`, Coach = the user's coach accent (`characterInfo(id).accent`). Locked ring `#3F3F46`.
- **Awarding:** from the best value (every run since the family's start date); a level needs a single run of its length; `earnedOn` = the date that run first reached the threshold (monthly: the month's last day); `weekStart` = Monday of `earnedOn`; `monthStart` = 1st of its month. Levels are never revoked or updated. `@@unique([userId, family, level])` decides between concurrent evaluations.
- **Start dates:** `User.achievementsSince` is written only where it is null (the launch job for existing users, the first `GET /me/achievements` for new users), as the user's local date then. Never changed once set. The starting `GoalChange` rows are written at the same moment with `createMany({ skipDuplicates: true })`, so an existing same-day row is never violated or overwritten.
- **Goal history:** `GoalChange` is written by `updateSleepGoal` (`backend/src/users/goals.ts`) — in ONE transaction with the goal update, the usual bedtime read before that transaction starts — and by the starting-goal writer, nowhere else. A change applies to nights whose wake date is **after** its `effectiveOn`. `resetsStreak` compares with the goal in effect **before that day**. Only the last change of a day is kept.
- **Check-ins:** `HabitCheckIn.onTime` is set once, when the row is written, to `habitDay === habitDayFor(now, user.timezone)`. Never recomputed, except the launch job's single false→true pass, for every user, over check-ins saved before the deploy whose `habitDay` is the launch habit day and whose `createdAt` falls inside that same habit day. The launch instant is the achievements migration's `finished_at`, so a rerun computes the same launch day and changes nothing.
- **Evaluation trigger:** on load only (`GET /me/achievements`), at most once per user per 10 minutes (Redis key `achievements:evaluated:<userId>`, TTL 600 s). `POST /me/habits/check-ins` and `updateSleepGoal` delete it. No queue triggers.
- **No push notifications** for badges, ever. AI text never mentions badges; the recap fact sheet stops emitting the streak-milestone note.
- **Logging:** event names with ids, family and level only — **never health values** (no minutes, steps, bedtimes, scores). Events: `console.info(JSON.stringify({ event, ... }))`. Failures: `console.error(JSON.stringify({ event, userId?, error: <Error class name> }))`. No bare `console.log` in new code.
- **Migrations are additive only:** new enums, new tables, new nullable or defaulted columns. Nothing existing is dropped, renamed or retyped.
- **Commits:** plain messages, **no `Co-Authored-By` trailer and no mention of Claude or AI** in commits or PR text.
- **Old backend:** a 404 from `GET /me/achievements` hides every badge UI; the month recap's tiles stay exactly as before (four tiles, no progress).
- **Commands.** Node 24 lives at `/Users/tushar/.nvm/versions/node/v24.21.0/bin`; below, `N24` means `/Users/tushar/.nvm/versions/node/v24.21.0/bin/node`. `npx` resolves an older Node — do not use it.
  - **Backend tests — ONLY this way:** `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh <paths>` (test database + Redis db 1; the script exists — do not create or edit it). Paths are relative to `backend/`. With no paths it runs the whole suite.
  - **Mobile tests:** from `mobile/`: `N24 node_modules/.bin/jest <paths>`.
  - **Backend typecheck:** from `backend/`: `N24 node_modules/.bin/tsc --noEmit` — must be clean.
  - **Mobile typecheck:** from `mobile/`: `N24 node_modules/.bin/tsc --noEmit --types jest,node` — exactly the 12 known baseline errors, all in files this plan does not touch; no new ones.
  - **Prisma client:** from `backend/`: `DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder N24 node_modules/.bin/prisma generate` after any schema change.
  - Never print a database URL.
- **TypeScript (backend):** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. Never assign `undefined` to an optional property; spread it in conditionally.
- **Dates:** civil dates are `YYYY-MM-DD` strings. `@db.Date` columns are written with `civilDateToUtcMidnight(date)` and read with `.toISOString().slice(0, 10)`.

## Review Focus

1. **Users far from UTC (Pacific/Auckland, +13).** "Today" is the user's local date: at 2026-10-10T12:00Z it is already Oct 11 in Auckland, so Oct 10's steps are a finished day and count, while for a UTC user Oct 10 is still today and does not. A goal saved then is dated Oct 11, and a first badge load sets the start date to Oct 11. Pinned in Task 5 (GoalChange date), Task 7 (steps), Task 8 (first-load start date).
2. **The 4 am habit day.** A check-in at 01:00 local belongs to the previous calendar date's habit day and is on time; a launch at 02:00 treats the evening before as launch day and flips only check-ins saved before the launch inside that habit day, for every user (a user whose first badge load beat the job included). Pinned in Task 6 and Task 9.
3. **A goal changed the same day.** Lowering then restoring the sleep goal on one day is no reset; a change made in the evening never re-judges the night that ended that morning; a change on the day a starting row was written still compares with the starting goal. Pinned in Task 3 (pure) and Task 5 (database).
4. **A catch-up sync delivering a finished streak.** Seven on-goal nights followed by a short night arrive in one sync: levels I and II are both stored, dated the 3rd and the 7th night, `current` is 0 and `best` 7, and a second evaluation adds nothing. Pinned in Task 4 (pure) and Task 7 (database).
5. **The new app against a backend without badges (404).** The Profile card, Badges screens and celebration stay hidden; the month recap keeps its four original tiles with no badge progress. Pinned in Task 12 (client and store), Task 14 (Profile) and Task 18 (month recap).

---

## File map

**Backend**
- Create `backend/prisma/migrations/20261006120000_achievements/migration.sql` — enums, `Achievement`, `GoalChange`, `User.achievementsSince`, `HabitCheckIn.onTime`.
- Create `backend/src/achievements/catalogue.ts` — families, kinds, thresholds, level helpers (pure).
- Create `backend/src/achievements/runs.ts` — runs, paused vs broken, best/current, earned levels (pure).
- Create `backend/src/achievements/goalHistory.ts` — goal in effect per night, family start date, bedtime circle maths, usual bedtime, `resetsStreak` rules (pure).
- Create `backend/src/achievements/families.ts` — per-family day markers, monthly hits, `familyResults` (pure).
- Create `backend/src/achievements/marker.ts` — the 10-minute Redis marker holding the standings.
- Create `backend/src/achievements/goalChanges.ts` — `recordGoalChanges` (called only by `updateSleepGoal`).
- Create `backend/src/achievements/data.ts` — `loadAchievementInputs` (database reads).
- Create `backend/src/achievements/evaluate.ts` — `evaluateAchievements`.
- Create `backend/src/achievements/start.ts` — `writeStartingGoals`, `claimStartDate`, `ensureAchievementsStart`.
- Create `backend/src/achievements/launch.ts` — `launchInstant`, `backfillLaunchDayOnTime`, `runAchievementsLaunchOnce`, `startAchievements`.
- Create `backend/src/achievements/dto.ts`, `backend/src/achievements/routes.ts` — the two endpoints.
- Create `backend/scripts/seedAchievements.ts` — dev-only sample levels.
- Modify `backend/prisma/schema.prisma`, `backend/src/users/deletion.ts`, `backend/src/users/goals.ts`, `backend/src/habits/habitDay.ts`, `backend/src/habits/routes.ts`, `backend/src/coach/answer/facts.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/tests/users/ownedData.ts`.

**Mobile**
- Create `mobile/src/api/achievements.ts`.
- Create `mobile/src/lib/badges.ts` (copy and selectors), `mobile/src/lib/badgeArt.ts` (glyphs, tiers, geometry), `mobile/src/lib/achievementsStore.ts`, `mobile/src/lib/celebrationQueue.ts`, `mobile/src/lib/useEarnedBadges.ts`.
- Create `mobile/src/components/achievements/BadgeIcon.tsx`, `BadgesCard.tsx`, `BadgeShareCard.tsx`, `CelebrationModal.tsx`, `CelebrationHost.tsx`.
- Create `mobile/src/screens/BadgesScreen.tsx`, `mobile/src/screens/BadgeDetailScreen.tsx`.
- Create `mobile/jest-mocks/achievementsFixture.ts` (test helper, kept outside `__tests__` so jest does not collect it).
- Modify `mobile/src/screens/SettingsScreen.tsx`, `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/components/habit-log-card.tsx`, `mobile/src/components/recap/WeeklyStoryView.tsx`, `mobile/src/screens/RecapStoryScreen.tsx`, `mobile/src/screens/RecapBuilderScreen.tsx`, `mobile/src/screens/RecapScreen.tsx`, `mobile/src/lib/recapCopy.ts`, `mobile/src/lib/milestones.ts`, `mobile/src/components/milestones/MilestoneTiles.tsx`.

---

### Task 1: Schema, migration and owned-model entries

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `User`, model `HabitCheckIn`, two new enums and two new models at the end)
- Create: `backend/prisma/migrations/20261006120000_achievements/migration.sql`
- Modify: `backend/src/users/deletion.ts:28-50` (`USER_OWNED_MODELS`)
- Modify: `backend/tests/users/ownedData.ts` (`seedAllOwnedRows`)
- Test: `backend/tests/db/achievements.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (Prisma client, after `prisma generate`):
  - `enum AchievementFamily { SLEEP_GOAL STEADY_BEDTIME STEP_GOAL CHECK_IN BEST_RECOVERY_WEEK EVERY_DAY_LOGGED STEADIEST_MONTH }`
  - `enum GoalChangeKind { SLEEP_MINUTES BEDTIME }`
  - `prisma.achievement` — `{ id, userId, family, level, value, earnedOn: Date, weekStart: Date, monthStart: Date, createdAt, celebratedAt: Date | null }`, compound unique `userId_family_level`.
  - `prisma.goalChange` — `{ id, userId, kind, sleepMinutes: number | null, bedtime: string | null, effectiveOn: Date, resetsStreak: boolean, createdAt }`, compound unique `userId_kind_effectiveOn`.
  - `User.achievementsSince: Date | null`; `HabitCheckIn.onTime: boolean` (default `false`).

- [ ] **Step 1: Write the failing test** `backend/tests/db/achievements.test.ts`:

```ts
import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { deleteUserCoachData } from '../../src/coach/retention';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const day = civilDateToUtcMidnight;
const level = (userId: string, n: number, earnedOn = '2026-10-07') => ({
  userId, family: 'SLEEP_GOAL' as const, level: n, value: [3, 7, 14, 30, 100][n - 1] ?? 3,
  earnedOn: day(earnedOn), weekStart: day('2026-10-05'), monthStart: day('2026-10-01'),
});

it('stores one achievement per (user, family, level), not yet celebrated', async () => {
  const user = await createUser();
  const row = await prisma.achievement.create({ data: level(user.id, 1) });
  expect(row.celebratedAt).toBeNull();
  await expect(prisma.achievement.create({ data: level(user.id, 1, '2026-10-08') })).rejects.toMatchObject({ code: 'P2002' });
});

it('rejects a level outside 1..5', async () => {
  const user = await createUser();
  await expect(prisma.achievement.create({ data: { ...level(user.id, 1), level: 6 } })).rejects.toThrow();
  await expect(prisma.achievement.create({ data: { ...level(user.id, 1), level: 0 } })).rejects.toThrow();
});

it('keeps one goal change per (user, kind, day)', async () => {
  const user = await createUser();
  const change = { userId: user.id, kind: 'SLEEP_MINUTES' as const, sleepMinutes: 450, effectiveOn: day('2026-10-06'), resetsStreak: true };
  await prisma.goalChange.create({ data: change });
  await prisma.goalChange.create({ data: { ...change, kind: 'BEDTIME', sleepMinutes: null, bedtime: '22:30', resetsStreak: false } });
  await expect(prisma.goalChange.create({ data: { ...change, sleepMinutes: 420 } })).rejects.toMatchObject({ code: 'P2002' });
});

it('adds a null achievementsSince to User and a false onTime to HabitCheckIn', async () => {
  const user = await createUser();
  expect(user.achievementsSince).toBeNull();
  const checkIn = await prisma.habitCheckIn.create({ data: { userId: user.id, habitDay: day('2026-10-06') } });
  expect(checkIn.onTime).toBe(false);
});

it('removes achievements and goal changes with their user', async () => {
  const user = await prisma.user.create({ data: { email: `ach-${randomUUID()}@example.com`, name: 'Test User' } });
  await prisma.achievement.create({ data: level(user.id, 1) });
  await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-06'), resetsStreak: false } });
  await prisma.user.delete({ where: { id: user.id } });
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('coach-data deletion leaves achievements, goal changes and check-in flags alone', async () => {
  const user = await createUser();
  await prisma.achievement.create({ data: level(user.id, 1) });
  await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-06'), resetsStreak: false } });
  const checkIn = await prisma.habitCheckIn.create({ data: { userId: user.id, habitDay: day('2026-10-06'), onTime: true } });
  await deleteUserCoachData(user.id);
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(1);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(1);
  expect((await prisma.habitCheckIn.findUniqueOrThrow({ where: { id: checkIn.id } })).onTime).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/db/achievements.test.ts`
Expected: FAIL — TypeScript errors such as "Property 'achievement' does not exist on type 'PrismaClient'".

- [ ] **Step 3: Edit the schema.** In `backend/prisma/schema.prisma`:

In `model User`, after `recaps             Recap[]` add:

```prisma
  achievements       Achievement[]
  goalChanges        GoalChange[]
```

and after the `recapPushEnabled` field add:

```prisma
  /// Achievements start date (spec 2026-10-06 §3): the user's local date on launch day (launch
  /// job) or on their first badge load. Only days/months from it count. Set once, never changed.
  achievementsSince DateTime? @db.Date
```

In `model HabitCheckIn`, after `createdAt` add:

```prisma
  /// Made during its own habit day (04:00-local boundary). Set when the row is written, never
  /// recomputed; only on-time check-ins count toward the check-in badge (spec 2026-10-06 §3).
  onTime    Boolean  @default(false)
```

At the end of the file add:

```prisma
enum AchievementFamily {
  SLEEP_GOAL
  STEADY_BEDTIME
  STEP_GOAL
  CHECK_IN
  BEST_RECOVERY_WEEK
  EVERY_DAY_LOGGED
  STEADIEST_MONTH
}

/// One badge level a user earned (spec 2026-10-06 §3). Awarded once, never revoked or updated.
model Achievement {
  id           String            @id @default(uuid())
  userId       String
  user         User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  family       AchievementFamily
  /// 1..5 (I Bronze .. V Coach); a CHECK constraint in the migration enforces the range.
  level        Int
  /// The threshold reached.
  value        Int
  /// Local date the run first reached the threshold; for a monthly family, the month's last day.
  earnedOn     DateTime          @db.Date
  weekStart    DateTime          @db.Date
  monthStart   DateTime          @db.Date
  createdAt    DateTime          @default(now())
  celebratedAt DateTime?

  @@unique([userId, family, level])
  @@index([userId, celebratedAt])
}

enum GoalChangeKind {
  SLEEP_MINUTES
  BEDTIME
}

/// Sleep/bedtime goal history for the badge streaks (spec 2026-10-06 §3). Only the last change of
/// a day is kept. A change applies to nights whose wake date is after effectiveOn.
model GoalChange {
  id           String         @id @default(uuid())
  userId       String
  user         User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind         GoalChangeKind
  sleepMinutes Int?
  /// "HH:MM"; null = no bedtime goal (cleared, or none at the start).
  bedtime      String?
  effectiveOn  DateTime       @db.Date
  resetsStreak Boolean
  createdAt    DateTime       @default(now())

  @@unique([userId, kind, effectiveOn])
}
```

- [ ] **Step 4: Write the migration by hand** as `backend/prisma/migrations/20261006120000_achievements/migration.sql` (additive only):

```sql
-- CreateEnum
CREATE TYPE "AchievementFamily" AS ENUM ('SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH');

-- CreateEnum
CREATE TYPE "GoalChangeKind" AS ENUM ('SLEEP_MINUTES', 'BEDTIME');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "achievementsSince" DATE;

-- AlterTable
ALTER TABLE "HabitCheckIn" ADD COLUMN "onTime" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "family" "AchievementFamily" NOT NULL,
    "level" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "earnedOn" DATE NOT NULL,
    "weekStart" DATE NOT NULL,
    "monthStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "celebratedAt" TIMESTAMP(3),

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Achievement_level_check" CHECK ("level" BETWEEN 1 AND 5)
);

-- CreateTable
CREATE TABLE "GoalChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GoalChangeKind" NOT NULL,
    "sleepMinutes" INTEGER,
    "bedtime" TEXT,
    "effectiveOn" DATE NOT NULL,
    "resetsStreak" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Achievement_userId_celebratedAt_idx" ON "Achievement"("userId", "celebratedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_family_level_key" ON "Achievement"("userId", "family", "level");

-- CreateIndex
CREATE UNIQUE INDEX "GoalChange_userId_kind_effectiveOn_key" ON "GoalChange"("userId", "kind", "effectiveOn");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalChange" ADD CONSTRAINT "GoalChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Then regenerate the client — from `backend/`: `DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder N24 node_modules/.bin/prisma generate`.

- [ ] **Step 5: Add both tables to the owned-model list and to the seed.** In `USER_OWNED_MODELS` (`backend/src/users/deletion.ts`), insert after `'Recap',`:

```ts
  'Achievement',
  'GoalChange',
```

In `backend/tests/users/ownedData.ts`, inside `seedAllOwnedRows`, right after the `prisma.recap.create(...)` call add:

```ts
  await prisma.achievement.create({
    data: { userId, family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: day, weekStart: new Date('2026-08-31T00:00:00.000Z'), monthStart: day },
  });
  await prisma.goalChange.create({ data: { userId, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day, resetsStreak: false } });
```

- [ ] **Step 6: Run the tests and check the migration matches the schema**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/db/achievements.test.ts tests/users/deletion.test.ts`
Expected: PASS. The coverage guard in `deletion.test.ts` passes only because both models are listed, and `deleteUserAccount` reports `Achievement: 1` and `GoalChange: 1`.

Then, from `backend/` (the jest run above already applied the migration to the test database):

```bash
URL=$(grep -E '^TEST_DATABASE_URL=' "$HOME/dev/biometrics-run/backend/.env" | head -1 | cut -d= -f2- | tr -d '"')
DATABASE_URL="$URL" N24 node_modules/.bin/prisma migrate diff --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: exit 0 ("No difference detected"). Do not echo `$URL`.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/src/users/deletion.ts backend/tests/users/ownedData.ts backend/tests/db/achievements.test.ts
git commit -m "feat(backend): achievement and goal change tables, start date and on-time check-in columns"
```

---

### Task 2: Catalogue and run calculator

**Files:**
- Create: `backend/src/achievements/catalogue.ts`
- Create: `backend/src/achievements/runs.ts`
- Test: `backend/tests/achievements/runs.test.ts`

**Interfaces:**
- Consumes: `AchievementFamily`, `GoalChangeKind` types from `@prisma/client` (Task 1); `shiftDate` from `backend/src/scoring/dates.ts`.
- Produces:

```ts
// catalogue.ts
export type FamilyKind = 'streak' | 'monthly';
export type MonthlyMilestone = 'bestRecoveryWeek' | 'everyDayLogged' | 'steadiestMonth';
export type Thresholds = readonly [number, number, number, number, number];
export interface FamilyDef { family: AchievementFamily; kind: FamilyKind; thresholds: Thresholds; milestone?: MonthlyMilestone; goalKind?: GoalChangeKind }
export const MAX_LEVEL = 5;
export const FAMILIES: readonly FamilyDef[];
export const ALL_FAMILIES: readonly AchievementFamily[];
export function familyDef(family: AchievementFamily): FamilyDef;
export function levelsReached(def: FamilyDef, best: number): number[];
export function nextThreshold(def: FamilyDef, level: number): number | null;
// runs.ts
export type DayMark = 'hit' | 'miss' | 'none' | 'skip';
export interface MarkedDay { date: string; mark: DayMark }
export interface Run { hits: string[]; broken: boolean }
export interface RunSummary { runs: Run[]; best: number; current: number }
export interface EarnedLevel { level: number; value: number; earnedOn: string }
export const PAUSE_DAYS = 2;
export function summariseRuns(days: readonly MarkedDay[], opts: { today: string; pausable: boolean }): RunSummary;
export function earnedLevels(runs: readonly Run[], thresholds: readonly number[]): EarnedLevel[];
```

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/runs.test.ts`:

```ts
import { ALL_FAMILIES, FAMILIES, familyDef, levelsReached, nextThreshold } from '../../src/achievements/catalogue';
import { earnedLevels, summariseRuns, type MarkedDay } from '../../src/achievements/runs';
import { shiftDate } from '../../src/scoring/dates';

const MARK = { h: 'hit', m: 'miss', n: 'none', s: 'skip' } as const;
/** One mark per letter from `from`: h hit, m miss, n no data, s neither counts nor breaks. */
const days = (from: string, marks: string): MarkedDay[] =>
  marks.split('').map((c, i) => ({ date: shiftDate(from, i), mark: MARK[c as keyof typeof MARK] }));
const lengths = (s: { runs: { hits: string[] }[] }) => s.runs.map((r) => r.hits.length);

describe('catalogue', () => {
  it('has the seven families, their kinds and thresholds, in catalogue order', () => {
    expect(FAMILIES.map((f) => [f.family, f.kind, [...f.thresholds]])).toEqual([
      ['SLEEP_GOAL', 'streak', [3, 7, 14, 30, 100]],
      ['STEADY_BEDTIME', 'streak', [3, 7, 14, 30, 100]],
      ['STEP_GOAL', 'streak', [3, 7, 14, 30, 100]],
      ['CHECK_IN', 'streak', [7, 14, 30, 60, 180]],
      ['BEST_RECOVERY_WEEK', 'monthly', [1, 3, 6, 12, 24]],
      ['EVERY_DAY_LOGGED', 'monthly', [1, 3, 6, 12, 24]],
      ['STEADIEST_MONTH', 'monthly', [1, 2, 4, 6, 12]],
    ]);
    expect(ALL_FAMILIES).toHaveLength(7);
    expect(familyDef('BEST_RECOVERY_WEEK').milestone).toBe('bestRecoveryWeek');
    expect(familyDef('SLEEP_GOAL').goalKind).toBe('SLEEP_MINUTES');
    expect(familyDef('STEADY_BEDTIME').goalKind).toBe('BEDTIME');
  });

  it('lists the levels a best value reached, and the next threshold', () => {
    expect(levelsReached(familyDef('CHECK_IN'), 29)).toEqual([1, 2]);
    expect(levelsReached(familyDef('CHECK_IN'), 6)).toEqual([]);
    expect(levelsReached(familyDef('STEADIEST_MONTH'), 12)).toEqual([1, 2, 3, 4, 5]);
    expect(nextThreshold(familyDef('SLEEP_GOAL'), 0)).toBe(3);
    expect(nextThreshold(familyDef('SLEEP_GOAL'), 2)).toBe(14);
    expect(nextThreshold(familyDef('SLEEP_GOAL'), 5)).toBeNull();
  });
});

describe('summariseRuns', () => {
  it('splits runs at a miss and reports the best and the unbroken latest run', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhmhhhh'), { today: '2026-10-08', pausable: true });
    expect(lengths(s)).toEqual([3, 4]);
    expect(s).toMatchObject({ best: 4, current: 4 });
  });

  it('pauses a synced run over missing recent days (late sync never costs a streak)', () => {
    // Oct 6 and 7 have no data yet; Oct 5 is exactly 2 days before today, so still paused.
    const s = summariseRuns(days('2026-10-01', 'hhhhnnn'), { today: '2026-10-07', pausable: true });
    expect(s).toMatchObject({ best: 4, current: 4 });
    expect(s.runs[0]!.broken).toBe(false);
  });

  it('breaks it once a missing day is more than 2 days before today', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhhnnnn'), { today: '2026-10-08', pausable: true });
    expect(s).toMatchObject({ best: 4, current: 0 });
  });

  it('breaks it at a missing day when a later day has data', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhnh'), { today: '2026-10-05', pausable: true });
    expect(lengths(s)).toEqual([3, 1]);
    expect(s).toMatchObject({ best: 3, current: 1 });
  });

  it('never pauses a family that is not synced: a missing day breaks at once', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhn'), { today: '2026-10-04', pausable: false });
    expect(s).toMatchObject({ best: 3, current: 0 });
  });

  it('lets a skipped day neither count nor break', () => {
    const s = summariseRuns(days('2026-10-01', 'hhshh'), { today: '2026-10-05', pausable: true });
    expect(lengths(s)).toEqual([4]);
  });

  it('is empty for no days', () => {
    expect(summariseRuns([], { today: '2026-10-05', pausable: true })).toEqual({ runs: [], best: 0, current: 0 });
  });
});

describe('earnedLevels', () => {
  const thresholds = [3, 7, 14, 30, 100];

  it('dates each level by the hit that first reached it', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhhhhhmhhh'), { today: '2026-10-11', pausable: true });
    expect(earnedLevels(s.runs, thresholds)).toEqual([
      { level: 1, value: 3, earnedOn: '2026-10-03' },
      { level: 2, value: 7, earnedOn: '2026-10-07' },
    ]);
  });

  it('uses the first run long enough, not the first run', () => {
    // A run of 2 (Oct 1-2), a miss, then a run of 8 from Oct 4.
    const s = summariseRuns(days('2026-10-01', 'hhmhhhhhhhh'), { today: '2026-10-11', pausable: true });
    expect(earnedLevels(s.runs, thresholds)).toEqual([
      { level: 1, value: 3, earnedOn: '2026-10-06' },
      { level: 2, value: 7, earnedOn: '2026-10-10' },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/runs.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/catalogue'".

- [ ] **Step 3: Write `backend/src/achievements/catalogue.ts`**

```ts
// The badge catalogue (spec 2026-10-06 §2): seven families, five levels each — I Bronze, II Silver,
// III Gold, IV Diamond, V Coach. A level needs ONE run (or month count) of its length; nothing is
// cumulative across runs.

import type { AchievementFamily, GoalChangeKind } from '@prisma/client';

export type FamilyKind = 'streak' | 'monthly';
export type MonthlyMilestone = 'bestRecoveryWeek' | 'everyDayLogged' | 'steadiestMonth';
export type Thresholds = readonly [number, number, number, number, number];

export interface FamilyDef {
  family: AchievementFamily;
  kind: FamilyKind;
  thresholds: Thresholds;
  /** Monthly families: the Recap milestone key that makes a month count. */
  milestone?: MonthlyMilestone;
  /** Sleep families: the goal whose easing restarts the streak from the next night. */
  goalKind?: GoalChangeKind;
}

export const MAX_LEVEL = 5;

export const FAMILIES: readonly FamilyDef[] = [
  { family: 'SLEEP_GOAL', kind: 'streak', thresholds: [3, 7, 14, 30, 100], goalKind: 'SLEEP_MINUTES' },
  { family: 'STEADY_BEDTIME', kind: 'streak', thresholds: [3, 7, 14, 30, 100], goalKind: 'BEDTIME' },
  { family: 'STEP_GOAL', kind: 'streak', thresholds: [3, 7, 14, 30, 100] },
  { family: 'CHECK_IN', kind: 'streak', thresholds: [7, 14, 30, 60, 180] },
  { family: 'BEST_RECOVERY_WEEK', kind: 'monthly', thresholds: [1, 3, 6, 12, 24], milestone: 'bestRecoveryWeek' },
  { family: 'EVERY_DAY_LOGGED', kind: 'monthly', thresholds: [1, 3, 6, 12, 24], milestone: 'everyDayLogged' },
  { family: 'STEADIEST_MONTH', kind: 'monthly', thresholds: [1, 2, 4, 6, 12], milestone: 'steadiestMonth' },
];

export const ALL_FAMILIES: readonly AchievementFamily[] = FAMILIES.map((f) => f.family);

export function familyDef(family: AchievementFamily): FamilyDef {
  const def = FAMILIES.find((f) => f.family === family);
  if (!def) throw new Error(`Unknown achievement family ${family}`);
  return def;
}

/** Levels 1..5 whose threshold `best` reached. */
export function levelsReached(def: FamilyDef, best: number): number[] {
  return def.thresholds.flatMap((t, i) => (best >= t ? [i + 1] : []));
}

/** The threshold of the level above `level` (0..5); null at the top. */
export function nextThreshold(def: FamilyDef, level: number): number | null {
  return level >= MAX_LEVEL ? null : def.thresholds[level]!;
}
```

- [ ] **Step 4: Write `backend/src/achievements/runs.ts`**

```ts
// Runs (spec 2026-10-06 §4): consecutive qualifying dates. One generic walk serves every streak
// family; each family only decides how a date is marked.
//   hit  — qualifies;
//   miss — has data and does not qualify: breaks the run;
//   none — no data: for a synced family (pausable) it breaks only when a later date has data or it
//          is more than PAUSE_DAYS before today, otherwise the latest run is paused; for a family
//          that is not synced (check-ins) it breaks at once;
//   skip — neither counts nor breaks (a night with no bedtime goal and too little history; today's
//          habit day before its check-in).

import { shiftDate } from '../scoring/dates';

export type DayMark = 'hit' | 'miss' | 'none' | 'skip';
export interface MarkedDay { date: string; mark: DayMark }
export interface Run { hits: string[]; broken: boolean }
export interface RunSummary { runs: Run[]; best: number; current: number }
export interface EarnedLevel { level: number; value: number; earnedOn: string }

export const PAUSE_DAYS = 2;

/** `days` ascending, from the family's start date to the last date it can judge. */
export function summariseRuns(days: readonly MarkedDay[], opts: { today: string; pausable: boolean }): RunSummary {
  let lastData = -1;
  for (let i = 0; i < days.length; i++) {
    const mark = days[i]!.mark;
    if (mark === 'hit' || mark === 'miss') lastData = i;
  }
  const cutoff = shiftDate(opts.today, -PAUSE_DAYS);
  const runs: Run[] = [];
  let open: Run | null = null;
  for (let i = 0; i < days.length; i++) {
    const { date, mark } = days[i]!;
    if (mark === 'skip') continue;
    if (mark === 'hit') {
      if (open === null) {
        open = { hits: [], broken: false };
        runs.push(open);
      }
      open.hits.push(date);
      continue;
    }
    const breaks = mark === 'miss' || !opts.pausable || i < lastData || date < cutoff;
    if (breaks && open !== null) {
      open.broken = true;
      open = null;
    }
  }
  const best = runs.reduce((m, r) => Math.max(m, r.hits.length), 0);
  const last = runs[runs.length - 1];
  return { runs, best, current: last && !last.broken ? last.hits.length : 0 };
}

/** Each threshold some run reached, dated by the earliest run to reach it (its Nth hit). */
export function earnedLevels(runs: readonly Run[], thresholds: readonly number[]): EarnedLevel[] {
  const out: EarnedLevel[] = [];
  thresholds.forEach((value, i) => {
    const run = runs.find((r) => r.hits.length >= value);
    if (run) out.push({ level: i + 1, value, earnedOn: run.hits[value - 1]! });
  });
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/runs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/achievements/catalogue.ts backend/src/achievements/runs.ts backend/tests/achievements/runs.test.ts
git commit -m "feat(backend): badge catalogue and the run calculator (paused vs broken, best and current)"
```

---

### Task 3: Goal history (pure)

**Files:**
- Create: `backend/src/achievements/goalHistory.ts`
- Test: `backend/tests/achievements/goalHistory.test.ts`

**Interfaces:**
- Consumes: `GoalChangeKind` (Task 1); `shiftDate`; the `RecapData` type from `backend/src/recap/types.ts`.
- Produces:

```ts
export interface GoalChangeRow { kind: GoalChangeKind; sleepMinutes: number | null; bedtime: string | null; effectiveOn: string; resetsStreak: boolean }
export const BEDTIME_WINDOW_MINUTES = 30;
export const USUAL_BEDTIME_NIGHTS = 14;
export const MIN_USUAL_BEDTIME_NIGHTS = 7;
export function changeInEffect(changes: readonly GoalChangeRow[], wakeDate: string): GoalChangeRow | null;
export function familyStartDate(since: string, changes: readonly GoalChangeRow[]): string;
export function hhmmToNoonMinutes(hhmm: string): number;
export function circularDistance(a: number, b: number): number;
export function bedtimeSeries(data: RecapData): Array<readonly [string, number]>;
export function usualBedtimeBefore(bedtimes: ReadonlyArray<readonly [string, number]>, date: string): number | null;
export function sleepGoalResets(previousMinutes: number, nextMinutes: number): boolean;
export function bedtimeGoalResets(previous: string | null, next: string | null, usual: number | null): boolean;
```

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/goalHistory.test.ts`:

```ts
import {
  bedtimeGoalResets, bedtimeSeries, changeInEffect, circularDistance, familyStartDate, hhmmToNoonMinutes,
  sleepGoalResets, usualBedtimeBefore, type GoalChangeRow,
} from '../../src/achievements/goalHistory';
import type { RecapData } from '../../src/recap/types';

const sleep = (effectiveOn: string, sleepMinutes: number, resetsStreak = false): GoalChangeRow =>
  ({ kind: 'SLEEP_MINUTES', sleepMinutes, bedtime: null, effectiveOn, resetsStreak });

describe('changeInEffect', () => {
  const changes = [sleep('2026-10-01', 480), sleep('2026-10-05', 510)];

  it('applies a change only to nights that end after its date', () => {
    // Raised in the evening of Oct 5: the night that ended that morning keeps 480.
    expect(changeInEffect(changes, '2026-10-05')?.sleepMinutes).toBe(480);
    expect(changeInEffect(changes, '2026-10-06')?.sleepMinutes).toBe(510);
  });

  it('uses the earliest row for nights before any change, and null with no rows', () => {
    expect(changeInEffect(changes, '2026-09-30')?.sleepMinutes).toBe(480);
    expect(changeInEffect(changes, '2026-10-01')?.sleepMinutes).toBe(480);
    expect(changeInEffect([], '2026-10-01')).toBeNull();
  });
});

describe('familyStartDate', () => {
  it('restarts a family the night after an easing change, never before the start date', () => {
    expect(familyStartDate('2026-10-01', [sleep('2026-10-05', 420, true)])).toBe('2026-10-06');
    expect(familyStartDate('2026-10-01', [sleep('2026-10-05', 510, false)])).toBe('2026-10-01');
    expect(familyStartDate('2026-10-10', [sleep('2026-10-05', 420, true)])).toBe('2026-10-10');
    expect(familyStartDate('2026-10-01', [sleep('2026-10-03', 450, true), sleep('2026-10-08', 420, true)])).toBe('2026-10-09');
  });
});

describe('bedtime maths', () => {
  it('reads "HH:MM" as minutes since local noon, like the recap bedtimes', () => {
    expect(hhmmToNoonMinutes('22:30')).toBe(630);
    expect(hhmmToNoonMinutes('00:30')).toBe(750);
    expect(hhmmToNoonMinutes('12:00')).toBe(0);
  });

  it('measures distance on the 24-hour circle', () => {
    expect(circularDistance(690, 750)).toBe(60);
    expect(circularDistance(10, 1430)).toBe(20);
    expect(circularDistance(630, 630)).toBe(0);
  });

  it('collects the nights that have a bedtime, oldest first', () => {
    const data: RecapData = new Map([
      ['2026-10-03', { sleepMinutes: 400, bedtime: 640 }],
      ['2026-10-01', { sleepMinutes: 420, bedtime: 630 }],
      ['2026-10-02', { steps: 5000 }],
    ]);
    expect(bedtimeSeries(data)).toEqual([['2026-10-01', 630], ['2026-10-03', 640]]);
  });

  it('takes the median of the previous 14 nights with a bedtime, and needs 7', () => {
    const nights = (n: number) => Array.from({ length: n }, (_, i) => [`2026-09-${String(1 + i).padStart(2, '0')}`, 600 + i * 10] as const);
    expect(usualBedtimeBefore(nights(6), '2026-09-30')).toBeNull();
    // 7 nights: 600..660 → median 630.
    expect(usualBedtimeBefore(nights(7), '2026-09-30')).toBe(630);
    // 20 nights (600..790): only the last 14 before the date (660..790) count → median 725.
    expect(usualBedtimeBefore(nights(20), '2026-09-30')).toBe(725);
    // Strictly before the date: the night itself never counts.
    expect(usualBedtimeBefore(nights(7), '2026-09-07')).toBeNull();
  });
});

describe('resetsStreak', () => {
  it('resets the sleep streak only when the goal gets lower', () => {
    expect(sleepGoalResets(480, 450)).toBe(true);
    expect(sleepGoalResets(450, 480)).toBe(false);
    expect(sleepGoalResets(480, 480)).toBe(false);
  });

  it('resets the bedtime streak on a move of more than 30 minutes, measured on the circle', () => {
    expect(bedtimeGoalResets('22:30', '23:00', null)).toBe(false);
    expect(bedtimeGoalResets('22:30', '23:01', null)).toBe(true);
    expect(bedtimeGoalResets('23:30', '00:15', null)).toBe(true);
    expect(bedtimeGoalResets('23:50', '00:10', null)).toBe(false);
  });

  it('compares a first bedtime goal with the usual bedtime, and resets with none known', () => {
    expect(bedtimeGoalResets(null, '22:30', 640)).toBe(false);
    expect(bedtimeGoalResets(null, '22:30', 690)).toBe(true);
    expect(bedtimeGoalResets(null, '22:30', null)).toBe(true);
  });

  it('resets when the goal is cleared', () => {
    expect(bedtimeGoalResets('22:30', null, 630)).toBe(true);
    expect(bedtimeGoalResets(null, null, 630)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/goalHistory.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/goalHistory'".

- [ ] **Step 3: Write `backend/src/achievements/goalHistory.ts`**

```ts
// Goal history for the sleep badge streaks (spec 2026-10-06 §3–4). Pure.
//   - A night is judged by the goal in effect for it: the latest change with effectiveOn BEFORE
//     the night's wake date. A change made on a day never re-judges the night that ended that
//     morning. Nights before every change use the earliest row (the starting goal).
//   - A family restarts the night after a change that eased its goal (resetsStreak).
// Bedtimes are minutes since local noon (the recap convention, so 23:30 and 00:30 are 60 apart)
// and are compared on the 24-hour circle.

import type { GoalChangeKind } from '@prisma/client';
import type { RecapData } from '../recap/types';
import { shiftDate } from '../scoring/dates';

export interface GoalChangeRow {
  kind: GoalChangeKind;
  sleepMinutes: number | null;
  /** "HH:MM"; null = no bedtime goal. */
  bedtime: string | null;
  /** The user's local date of the change. */
  effectiveOn: string;
  resetsStreak: boolean;
}

export const BEDTIME_WINDOW_MINUTES = 30;
export const USUAL_BEDTIME_NIGHTS = 14;
export const MIN_USUAL_BEDTIME_NIGHTS = 7;
const DAY_MINUTES = 24 * 60;

/** `changes` ascending by effectiveOn, one kind. */
export function changeInEffect(changes: readonly GoalChangeRow[], wakeDate: string): GoalChangeRow | null {
  let found: GoalChangeRow | null = null;
  for (const change of changes) if (change.effectiveOn < wakeDate) found = change;
  return found ?? changes[0] ?? null;
}

/** max(since, the day after the latest change that reset this family's streak). */
export function familyStartDate(since: string, changes: readonly GoalChangeRow[]): string {
  let start = since;
  for (const change of changes) {
    if (!change.resetsStreak) continue;
    const next = shiftDate(change.effectiveOn, 1);
    if (next > start) start = next;
  }
  return start;
}

export function hhmmToNoonMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return (h * 60 + m - 12 * 60 + DAY_MINUTES) % DAY_MINUTES;
}

export function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY_MINUTES;
  return Math.min(d, DAY_MINUTES - d);
}

/** [date, bedtime] for every night with a main-session bedtime, oldest first. */
export function bedtimeSeries(data: RecapData): Array<readonly [string, number]> {
  const out: Array<readonly [string, number]> = [];
  for (const [date, day] of data) if (day.bedtime !== undefined) out.push([date, day.bedtime] as const);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median bedtime of the previous 14 nights that have one (strictly before `date`); null under 7. */
export function usualBedtimeBefore(bedtimes: ReadonlyArray<readonly [string, number]>, date: string): number | null {
  const prior = bedtimes.filter(([d]) => d < date).slice(-USUAL_BEDTIME_NIGHTS).map(([, m]) => m);
  return prior.length >= MIN_USUAL_BEDTIME_NIGHTS ? median(prior) : null;
}

export function sleepGoalResets(previousMinutes: number, nextMinutes: number): boolean {
  return nextMinutes < previousMinutes;
}

/**
 * Moved by more than 30 minutes, or cleared, or set for the first time more than 30 minutes from
 * the usual bedtime (no usual bedtime known: true).
 */
export function bedtimeGoalResets(previous: string | null, next: string | null, usual: number | null): boolean {
  if (next === null) return previous !== null;
  if (previous !== null) return circularDistance(hhmmToNoonMinutes(previous), hhmmToNoonMinutes(next)) > BEDTIME_WINDOW_MINUTES;
  return usual === null || circularDistance(hhmmToNoonMinutes(next), usual) > BEDTIME_WINDOW_MINUTES;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/goalHistory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/achievements/goalHistory.ts backend/tests/achievements/goalHistory.test.ts
git commit -m "feat(backend): goal history for badge streaks (goal per night, resets, usual bedtime)"
```

---

### Task 4: Family calculators (pure)

**Files:**
- Create: `backend/src/achievements/families.ts`
- Test: `backend/tests/achievements/families.test.ts`

**Interfaces:**
- Consumes: Task 2 (`FAMILIES`, `ALL_FAMILIES`, `MonthlyMilestone`, `summariseRuns`, `earnedLevels`, `MarkedDay`, `EarnedLevel`); Task 3 (`GoalChangeRow`, `changeInEffect`, `familyStartDate`, `hhmmToNoonMinutes`, `circularDistance`, `bedtimeSeries`, `usualBedtimeBefore`, `BEDTIME_WINDOW_MINUTES`); `STEPS_GOAL` from `backend/src/coach/tools/metrics.ts`; `RecapData`, `RecapMilestones` from `backend/src/recap/types.ts`; `dateRange`, `shiftDate`.
- Produces:

```ts
export interface StreakInputs {
  today: string; habitToday: string; since: string; data: RecapData;
  sleepChanges: readonly GoalChangeRow[]; bedtimeChanges: readonly GoalChangeRow[];
  currentSleepGoal: number; currentBedtime: string | null; onTimeHabitDays: ReadonlySet<string>;
}
export interface MonthRecap { periodStart: string; periodEnd: string; milestones: RecapMilestones | undefined }
export interface FamilyStanding { family: AchievementFamily; current: number; best: number }
export interface FamilyResult extends FamilyStanding { reached: EarnedLevel[] }
export function sleepGoalDays(inp: StreakInputs): MarkedDay[];
export function steadyBedtimeDays(inp: StreakInputs): MarkedDay[];
export function stepGoalDays(inp: StreakInputs): MarkedDay[];
export function checkInDays(inp: StreakInputs): MarkedDay[];
export function monthlyHits(months: readonly MonthRecap[], since: string, key: MonthlyMilestone): string[];
export function familyResults(inp: StreakInputs, months: readonly MonthRecap[], families?: readonly AchievementFamily[]): FamilyResult[];
```

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/families.test.ts`:

```ts
import {
  checkInDays, familyResults, monthlyHits, sleepGoalDays, stepGoalDays, steadyBedtimeDays, type MonthRecap, type StreakInputs,
} from '../../src/achievements/families';
import type { GoalChangeRow } from '../../src/achievements/goalHistory';
import type { DayData } from '../../src/recap/types';
import { shiftDate } from '../../src/scoring/dates';

function inputs(over: Partial<StreakInputs> = {}): StreakInputs {
  return {
    today: '2026-10-10', habitToday: '2026-10-10', since: '2026-10-01', data: new Map(),
    sleepChanges: [], bedtimeChanges: [], currentSleepGoal: 480, currentBedtime: null, onTimeHabitDays: new Set(), ...over,
  };
}
const data = (entries: Array<[string, DayData]>) => new Map(entries);
const marks = (days: { date: string; mark: string }[]) => days.map((d) => `${d.date.slice(8)}:${d.mark}`);
const change = (kind: GoalChangeRow['kind'], effectiveOn: string, value: number | string | null, resetsStreak = false): GoalChangeRow => ({
  kind, effectiveOn, resetsStreak,
  sleepMinutes: kind === 'SLEEP_MINUTES' ? (value as number) : null,
  bedtime: kind === 'BEDTIME' ? (value as string | null) : null,
});

describe('sleep goal', () => {
  it('marks each night from the start date to today against the goal; nights before the start never count', () => {
    const inp = inputs({
      today: '2026-10-04',
      data: data([['2026-09-30', { sleepMinutes: 500 }], ['2026-10-01', { sleepMinutes: 480 }], ['2026-10-02', { sleepMinutes: 479 }], ['2026-10-04', { sleepMinutes: 0 }]]),
    });
    expect(marks(sleepGoalDays(inp))).toEqual(['01:hit', '02:miss', '03:none', '04:none']);
  });

  it('judges a night by the goal in effect before its wake date: raising keeps the streak', () => {
    const inp = inputs({
      today: '2026-10-06',
      sleepChanges: [change('SLEEP_MINUTES', '2026-10-01', 480), change('SLEEP_MINUTES', '2026-10-05', 510)],
      data: data([['2026-10-05', { sleepMinutes: 490 }], ['2026-10-06', { sleepMinutes: 500 }]]),
    });
    // Raised on Oct 5: the night that ended that morning keeps 480, Oct 6 is judged on 510.
    expect(marks(sleepGoalDays(inp)).slice(-2)).toEqual(['05:hit', '06:miss']);
  });

  it('restarts from the night after an easing change', () => {
    const inp = inputs({
      today: '2026-10-07',
      sleepChanges: [change('SLEEP_MINUTES', '2026-10-01', 480), change('SLEEP_MINUTES', '2026-10-05', 420, true)],
      data: data([['2026-10-05', { sleepMinutes: 450 }], ['2026-10-06', { sleepMinutes: 430 }], ['2026-10-07', { sleepMinutes: 425 }]]),
    });
    expect(marks(sleepGoalDays(inp))).toEqual(['06:hit', '07:hit']);
  });

  it('is empty when the restart is still ahead', () => {
    const inp = inputs({ today: '2026-10-05', sleepChanges: [change('SLEEP_MINUTES', '2026-10-05', 420, true)] });
    expect(sleepGoalDays(inp)).toEqual([]);
  });
});

describe('steady bedtime', () => {
  const pre = (from: string, n: number, bedtime: number): Array<[string, DayData]> =>
    Array.from({ length: n }, (_, i) => [shiftDate(from, i), { sleepMinutes: 450, bedtime }]);

  it('compares with the bedtime goal in effect, within 30 minutes either side', () => {
    const inp = inputs({
      today: '2026-10-03',
      bedtimeChanges: [change('BEDTIME', '2026-09-30', '22:30')],
      data: data([['2026-10-01', { sleepMinutes: 450, bedtime: 660 }], ['2026-10-02', { sleepMinutes: 450, bedtime: 661 }], ['2026-10-03', { sleepMinutes: 450, bedtime: 600 }]]),
    });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit', '02:miss', '03:hit']);
  });

  it('with no goal, uses the median of the previous 14 nights, including nights before the start date', () => {
    const inp = inputs({ today: '2026-10-01', data: data([...pre('2026-09-20', 11, 630), ['2026-10-01', { sleepMinutes: 450, bedtime: 650 }]]) });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit']);
  });

  it('with no goal and fewer than 7 prior nights, a night neither counts nor breaks', () => {
    const inp = inputs({ today: '2026-10-01', data: data([...pre('2026-09-28', 3, 630), ['2026-10-01', { sleepMinutes: 450, bedtime: 640 }]]) });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:skip']);
  });

  it('marks a night without a bedtime as no data, and a cleared goal falls back to the median', () => {
    const inp = inputs({
      today: '2026-10-02',
      bedtimeChanges: [change('BEDTIME', '2026-09-01', '21:00'), change('BEDTIME', '2026-09-30', null, true)],
      data: data([...pre('2026-09-15', 14, 630), ['2026-10-01', { sleepMinutes: 450, bedtime: 640 }], ['2026-10-02', { steps: 9000 }]]),
    });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit', '02:none']);
  });
});

describe('step goal', () => {
  it('counts finished local days only, at 10,000 steps or more', () => {
    const inp = inputs({
      since: '2026-10-07',
      data: data([['2026-10-07', { steps: 9999 }], ['2026-10-08', { steps: 10000 }], ['2026-10-10', { steps: 25000 }]]),
    });
    // Today (Oct 10) is never counted until it is over.
    expect(marks(stepGoalDays(inp))).toEqual(['07:miss', '08:hit', '09:none']);
  });
});

describe('daily check-in', () => {
  it('counts on-time check-ins only; a past habit day without one is no data, today waits', () => {
    const inp = inputs({ since: '2026-10-01', habitToday: '2026-10-05', onTimeHabitDays: new Set(['2026-10-01', '2026-10-02', '2026-10-04']) });
    expect(marks(checkInDays(inp))).toEqual(['01:hit', '02:hit', '03:none', '04:hit', '05:skip']);
    const done = inputs({ since: '2026-10-04', habitToday: '2026-10-05', onTimeHabitDays: new Set(['2026-10-04', '2026-10-05']) });
    expect(marks(checkInDays(done))).toEqual(['04:hit', '05:hit']);
  });
});

describe('monthly families', () => {
  const months: MonthRecap[] = [
    { periodStart: '2026-12-01', periodEnd: '2026-12-31', milestones: { everyDayLogged: { days: 31 } } },
    { periodStart: '2026-09-01', periodEnd: '2026-09-30', milestones: { everyDayLogged: { days: 30 } } },
    { periodStart: '2026-10-01', periodEnd: '2026-10-31', milestones: { everyDayLogged: { days: 31 } } },
    { periodStart: '2026-11-01', periodEnd: '2026-11-30', milestones: {} },
  ];

  it('counts months whose 1st is on or after the start date and whose recap has the milestone', () => {
    expect(monthlyHits(months, '2026-10-01', 'everyDayLogged')).toEqual(['2026-10-31', '2026-12-31']);
    expect(monthlyHits(months, '2026-10-07', 'everyDayLogged')).toEqual(['2026-12-31']);
    expect(monthlyHits(months, '2026-10-01', 'steadiestMonth')).toEqual([]);
  });
});

describe('familyResults', () => {
  it('awards a finished streak from its best run, dated when each threshold was reached', () => {
    const nights: Array<[string, DayData]> = Array.from({ length: 7 }, (_, i) => [shiftDate('2026-10-01', i), { sleepMinutes: 500 }]);
    const inp = inputs({ data: data([...nights, ['2026-10-08', { sleepMinutes: 400 }]]) });
    const [sleep] = familyResults(inp, [], ['SLEEP_GOAL']);
    expect(sleep).toEqual({
      family: 'SLEEP_GOAL', current: 0, best: 7,
      reached: [{ level: 1, value: 3, earnedOn: '2026-10-03' }, { level: 2, value: 7, earnedOn: '2026-10-07' }],
    });
  });

  it('returns every family in catalogue order by default, monthly ones from recaps', () => {
    const results = familyResults(inputs(), [{ periodStart: '2026-10-01', periodEnd: '2026-10-31', milestones: { steadiestMonth: { spreadMinutes: 12 } } }]);
    expect(results.map((r) => r.family)).toEqual(['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH']);
    expect(results[6]).toEqual({ family: 'STEADIEST_MONTH', current: 1, best: 1, reached: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] });
  });

  it('breaks the check-in streak as soon as a habit day without an on-time check-in is over', () => {
    const days = Array.from({ length: 8 }, (_, i) => shiftDate('2026-10-01', i));
    const inp = inputs({ habitToday: '2026-10-10', onTimeHabitDays: new Set(days) });
    const [checkIn] = familyResults(inp, [], ['CHECK_IN']);
    // Oct 9 had none and is over: broken, no pause.
    expect(checkIn).toMatchObject({ current: 0, best: 8, reached: [{ level: 1, value: 7, earnedOn: '2026-10-07' }] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/families.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/families'".

- [ ] **Step 3: Write `backend/src/achievements/families.ts`**

```ts
// Per-family day markers (spec 2026-10-06 §2 and §4). Pure: the inputs are already loaded.
//   Sleep goal:     each night's SLEEP rollup (wake date) vs the sleep goal in effect that night.
//   Steady bedtime: the main session's start within 30 min of the bedtime goal in effect; with no
//                   goal, of the median of the previous 14 nights with a bedtime (needs 7).
//   Step goal:      finished local days (today never counts) with steps >= STEPS_GOAL.
//   Check-in:       habit days with an on-time check-in; today counts once it exists.
//   Monthly:        BUILT month recaps from the start date whose stored milestones have the key.

import type { AchievementFamily } from '@prisma/client';
import { STEPS_GOAL } from '../coach/tools/metrics';
import type { RecapData, RecapMilestones } from '../recap/types';
import { dateRange, shiftDate } from '../scoring/dates';
import { ALL_FAMILIES, FAMILIES, type MonthlyMilestone } from './catalogue';
import {
  BEDTIME_WINDOW_MINUTES, bedtimeSeries, changeInEffect, circularDistance, familyStartDate, hhmmToNoonMinutes,
  usualBedtimeBefore, type GoalChangeRow,
} from './goalHistory';
import { earnedLevels, summariseRuns, type EarnedLevel, type MarkedDay } from './runs';

export interface StreakInputs {
  /** The user's local date now: the last night that can have ended; steps days end before it. */
  today: string;
  /** The habit day now (04:00-local boundary). */
  habitToday: string;
  /** User.achievementsSince. */
  since: string;
  /** SLEEP and STEPS rollups and main-session bedtimes, including the nights before `since`. */
  data: RecapData;
  sleepChanges: readonly GoalChangeRow[];
  bedtimeChanges: readonly GoalChangeRow[];
  /** The stored goals, used only when a user has no GoalChange row of that kind. */
  currentSleepGoal: number;
  currentBedtime: string | null;
  onTimeHabitDays: ReadonlySet<string>;
}

export interface MonthRecap { periodStart: string; periodEnd: string; milestones: RecapMilestones | undefined }
export interface FamilyStanding { family: AchievementFamily; current: number; best: number }
export interface FamilyResult extends FamilyStanding { reached: EarnedLevel[] }

const datesFrom = (from: string, to: string): string[] => (from <= to ? dateRange(from, to) : []);

export function sleepGoalDays(inp: StreakInputs): MarkedDay[] {
  return datesFrom(familyStartDate(inp.since, inp.sleepChanges), inp.today).map((date): MarkedDay => {
    const minutes = inp.data.get(date)?.sleepMinutes;
    if (minutes === undefined || minutes <= 0) return { date, mark: 'none' };
    const goal = changeInEffect(inp.sleepChanges, date)?.sleepMinutes ?? inp.currentSleepGoal;
    return { date, mark: minutes >= goal ? 'hit' : 'miss' };
  });
}

export function steadyBedtimeDays(inp: StreakInputs): MarkedDay[] {
  const series = bedtimeSeries(inp.data);
  return datesFrom(familyStartDate(inp.since, inp.bedtimeChanges), inp.today).map((date): MarkedDay => {
    const bedtime = inp.data.get(date)?.bedtime;
    if (bedtime === undefined) return { date, mark: 'none' };
    const change = changeInEffect(inp.bedtimeChanges, date);
    const goal = change ? change.bedtime : inp.currentBedtime;
    const target = goal !== null ? hhmmToNoonMinutes(goal) : usualBedtimeBefore(series, date);
    if (target === null) return { date, mark: 'skip' };
    return { date, mark: circularDistance(bedtime, target) <= BEDTIME_WINDOW_MINUTES ? 'hit' : 'miss' };
  });
}

export function stepGoalDays(inp: StreakInputs): MarkedDay[] {
  return datesFrom(inp.since, shiftDate(inp.today, -1)).map((date): MarkedDay => {
    const steps = inp.data.get(date)?.steps;
    if (steps === undefined || steps <= 0) return { date, mark: 'none' };
    return { date, mark: steps >= STEPS_GOAL ? 'hit' : 'miss' };
  });
}

export function checkInDays(inp: StreakInputs): MarkedDay[] {
  return datesFrom(inp.since, inp.habitToday).map((date): MarkedDay => {
    if (inp.onTimeHabitDays.has(date)) return { date, mark: 'hit' };
    return { date, mark: date === inp.habitToday ? 'skip' : 'none' };
  });
}

/** The last day of each qualifying month, oldest first. */
export function monthlyHits(months: readonly MonthRecap[], since: string, key: MonthlyMilestone): string[] {
  return months
    .filter((m) => m.periodStart >= since && m.milestones?.[key] !== undefined)
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1))
    .map((m) => m.periodEnd);
}

function streakDays(family: AchievementFamily, inp: StreakInputs): MarkedDay[] {
  switch (family) {
    case 'SLEEP_GOAL':
      return sleepGoalDays(inp);
    case 'STEADY_BEDTIME':
      return steadyBedtimeDays(inp);
    case 'STEP_GOAL':
      return stepGoalDays(inp);
    case 'CHECK_IN':
      return checkInDays(inp);
    default:
      throw new Error(`${family} is not a streak family`);
  }
}

/** Each family's current and best value and every level the data supports, in catalogue order. */
export function familyResults(inp: StreakInputs, months: readonly MonthRecap[], families: readonly AchievementFamily[] = ALL_FAMILIES): FamilyResult[] {
  return FAMILIES.filter((def) => families.includes(def.family)).map((def): FamilyResult => {
    if (def.kind === 'monthly') {
      const hits = monthlyHits(months, inp.since, def.milestone!);
      return { family: def.family, current: hits.length, best: hits.length, reached: earnedLevels([{ hits, broken: false }], def.thresholds) };
    }
    const checkIn = def.family === 'CHECK_IN';
    const summary = summariseRuns(streakDays(def.family, inp), { today: checkIn ? inp.habitToday : inp.today, pausable: !checkIn });
    return { family: def.family, current: summary.current, best: summary.best, reached: earnedLevels(summary.runs, def.thresholds) };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/families.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/achievements/families.ts backend/tests/achievements/families.test.ts
git commit -m "feat(backend): badge family calculators for sleep, bedtime, steps, check-ins and months"
```

---
### Task 5: The evaluation marker and the goal-history writer in `updateSleepGoal`

**Files:**
- Create: `backend/src/achievements/marker.ts`
- Create: `backend/src/achievements/goalChanges.ts`
- Modify: `backend/src/users/goals.ts` (`updateSleepGoal`, the last function in the file)
- Test: `backend/tests/achievements/goalChanges.test.ts`

**Interfaces:**
- Consumes: Task 1 (`prisma.goalChange`); Task 3 (`sleepGoalResets`, `bedtimeGoalResets`, `bedtimeSeries`, `usualBedtimeBefore`); Task 4 (`FamilyStanding` type); `connection` from `backend/src/sync/queue.ts`; `loadRecapData` from `backend/src/recap/data.ts`; `localCivilDateOrUtc`, `civilDateToUtcMidnight`; `shiftDate`.
- Produces:

```ts
// marker.ts
export const EVALUATION_TTL_SECONDS = 600;
export const markerKey: (userId: string) => string;            // `achievements:evaluated:${userId}`
export function readEvaluated(userId: string): Promise<FamilyStanding[] | null>;
export function markEvaluated(userId: string, standings: readonly FamilyStanding[]): Promise<void>;
export function clearAchievementsMarker(userId: string): Promise<void>;
// goalChanges.ts
export const USUAL_BEDTIME_LOOKBACK_DAYS = 60;
export interface GoalsBefore { sleepGoalMinutes: number; bedtimeGoal: string | null; timezone: string }
export interface GoalPatch { sleepGoalMinutes?: number; bedtimeGoal?: string | null }
export interface GoalChangeContext { today: string; usualBedtime: number | null }
export function usualBedtime(userId: string, timeZone: string, date: string): Promise<number | null>;
export function needsUsualBedtime(before: GoalsBefore, patch: GoalPatch): boolean;
export function recordGoalChanges(tx: Prisma.TransactionClient, userId: string, before: GoalsBefore, patch: GoalPatch, ctx: GoalChangeContext): Promise<void>;
// users/goals.ts (changed signature; the existing call site passes two arguments and keeps working)
export function updateSleepGoal(userId: string, patch: SleepGoalPatch, now?: Date): Promise<SleepGoal | null>;
```

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/goalChanges.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import { EVALUATION_TTL_SECONDS, clearAchievementsMarker, markEvaluated, markerKey, readEvaluated } from '../../src/achievements/marker';
import * as goalChanges from '../../src/achievements/goalChanges';
import { updateSleepGoal } from '../../src/users/goals';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';
import { seedNights } from '../recap/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const day = civilDateToUtcMidnight;
const NOW = new Date('2026-10-06T09:00:00Z');
const LATER_SAME_DAY = new Date('2026-10-06T20:00:00Z');
const NEXT_DAY = new Date('2026-10-07T09:00:00Z');

async function rows(userId: string, kind: 'SLEEP_MINUTES' | 'BEDTIME') {
  const list = await prisma.goalChange.findMany({ where: { userId, kind }, orderBy: { effectiveOn: 'asc' } });
  return list.map((r) => [r.effectiveOn.toISOString().slice(0, 10), kind === 'SLEEP_MINUTES' ? r.sleepMinutes : r.bedtime, r.resetsStreak]);
}

describe('the evaluation marker', () => {
  it('holds the standings for up to 10 minutes and is gone once cleared', async () => {
    const user = await createUser();
    expect(await readEvaluated(user.id)).toBeNull();
    await markEvaluated(user.id, [{ family: 'SLEEP_GOAL', current: 2, best: 5 }]);
    expect(await readEvaluated(user.id)).toEqual([{ family: 'SLEEP_GOAL', current: 2, best: 5 }]);
    const ttl = await connection.ttl(markerKey(user.id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(EVALUATION_TTL_SECONDS);
    await clearAchievementsMarker(user.id);
    expect(await readEvaluated(user.id)).toBeNull();
  });

  it('reads a Redis failure as "not evaluated" and logs only the event, the user id and the error class', async () => {
    const user = await createUser();
    const get = jest.spyOn(connection, 'get').mockRejectedValueOnce(new Error('down'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await readEvaluated(user.id)).toBeNull();
      expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.marker_read_failed', userId: user.id, error: 'Error' });
    } finally {
      get.mockRestore();
      log.mockRestore();
    }
  });
});

describe('updateSleepGoal writes the goal history', () => {
  it('records a lowered sleep goal as a reset, with the goal before it dated the day before', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 450, true]]);
  });

  it('keeps only the last change of a day: lowering and restoring the same day is no reset', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    await updateSleepGoal(user.id, { sleepGoalMinutes: 480 }, LATER_SAME_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 480, false]]);
  });

  it('records a raised goal without a reset, and compares a later day with the goal before that day', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 510 }, NOW);
    await updateSleepGoal(user.id, { sleepGoalMinutes: 495 }, NEXT_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 510, false], ['2026-10-07', 495, true]]);
  });

  it("compares a change made on a starting row's day with the starting goal", async () => {
    const user = await createUser();
    await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-06'), resetsStreak: false } });
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 450, true]]);
    await updateSleepGoal(user.id, { sleepGoalMinutes: 480 }, LATER_SAME_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 480, false]]);
  });

  it('writes nothing when a value does not change, or for the wake goal', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 480, wakeGoal: '07:00' }, NOW);
    expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
  });

  it("dates a change by the user's local day (Pacific/Auckland is already Oct 7)", async () => {
    const user = await createUser({ timezone: 'Pacific/Auckland' });
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, LATER_SAME_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-06', 480, false], ['2026-10-07', 450, true]]);
  });

  it('resets the bedtime streak when the goal moves more than 30 minutes or is cleared', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { bedtimeGoal: '23:00' } });
    await updateSleepGoal(user.id, { bedtimeGoal: '23:30' }, NOW);
    expect(await rows(user.id, 'BEDTIME')).toEqual([['2026-10-05', '23:00', false], ['2026-10-06', '23:30', false]]);
    await updateSleepGoal(user.id, { bedtimeGoal: '23:31' }, LATER_SAME_DAY);
    expect((await rows(user.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '23:31', true]);
    await updateSleepGoal(user.id, { bedtimeGoal: null }, NEXT_DAY);
    expect((await rows(user.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-07', null, true]);
  });

  it('compares a first bedtime goal with the usual bedtime of the previous nights', async () => {
    const near = await createUser();
    await seedNights(near.id, '2026-09-25', Array(10).fill(450), () => ({ bedtime: '23:30' }));
    await updateSleepGoal(near.id, { bedtimeGoal: '23:15' }, NOW);
    expect((await rows(near.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '23:15', false]);

    const far = await createUser();
    await seedNights(far.id, '2026-09-25', Array(10).fill(450), () => ({ bedtime: '23:30' }));
    await updateSleepGoal(far.id, { bedtimeGoal: '22:30' }, NOW);
    expect((await rows(far.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '22:30', true]);

    const unknown = await createUser();
    await updateSleepGoal(unknown.id, { bedtimeGoal: '23:00' }, NOW);
    expect((await rows(unknown.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '23:00', true]);
  });

  it('clears the evaluation marker on every save', async () => {
    const user = await createUser();
    await markEvaluated(user.id, []);
    await updateSleepGoal(user.id, { wakeGoal: '07:00' }, NOW);
    expect(await readEvaluated(user.id)).toBeNull();
  });

  it('returns null and writes nothing for an unknown user', async () => {
    expect(await updateSleepGoal('00000000-0000-4000-8000-000000000000', { sleepGoalMinutes: 450 }, NOW)).toBeNull();
  });

  it('saves the goal and its history in one transaction: a failed GoalChange write saves neither', async () => {
    const user = await createUser();
    await markEvaluated(user.id, []);
    const spy = jest.spyOn(goalChanges, 'recordGoalChanges').mockImplementationOnce(async (tx, userId) => {
      // Part of the history is written, then the write fails: everything must roll back.
      await tx.goalChange.create({ data: { userId, kind: 'SLEEP_MINUTES', sleepMinutes: 450, effectiveOn: day('2026-10-06'), resetsStreak: true } });
      throw new Error('goal change write failed');
    });
    try {
      await expect(updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW)).rejects.toThrow('goal change write failed');
    } finally {
      spy.mockRestore();
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sleepGoalMinutes).toBe(480);
    expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
    // Nothing was saved, so the evaluation marker is left as it was.
    expect(await readEvaluated(user.id)).toEqual([]);
  });

  it('reads the usual bedtime before the transaction starts', async () => {
    const user = await createUser();
    const usual = jest.spyOn(goalChanges, 'usualBedtime');
    const transaction = jest.spyOn(prisma, '$transaction');
    try {
      await updateSleepGoal(user.id, { bedtimeGoal: '23:00' }, NOW);
      expect(usual).toHaveBeenCalledTimes(1);
      expect(usual.mock.invocationCallOrder[0]!).toBeLessThan(transaction.mock.invocationCallOrder[0]!);
    } finally {
      usual.mockRestore();
      transaction.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/goalChanges.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/marker'".

- [ ] **Step 3: Write `backend/src/achievements/marker.ts`**

```ts
// The 10-minute evaluation bound (spec 2026-10-06 §5). GET /me/achievements evaluates at most once
// per user per 10 minutes; the marker holds the standings that evaluation computed, so a load
// inside the window answers from it. Saving a check-in or a goal deletes it, so the next load
// evaluates at once. Redis trouble never fails a request: a read error means "evaluate", a write
// or delete error is logged (event, user id and error class only).

import { connection } from '../sync/queue';
import type { FamilyStanding } from './families';

export const EVALUATION_TTL_SECONDS = 10 * 60;

export const markerKey = (userId: string): string => `achievements:evaluated:${userId}`;

function logFailure(event: string, userId: string, err: unknown): void {
  console.error(JSON.stringify({ event, userId, error: err instanceof Error ? err.name : 'unknown' }));
}

export async function readEvaluated(userId: string): Promise<FamilyStanding[] | null> {
  try {
    const raw = await connection.get(markerKey(userId));
    return raw === null ? null : (JSON.parse(raw) as FamilyStanding[]);
  } catch (err) {
    logFailure('achievements.marker_read_failed', userId, err);
    return null;
  }
}

export async function markEvaluated(userId: string, standings: readonly FamilyStanding[]): Promise<void> {
  try {
    await connection.set(markerKey(userId), JSON.stringify(standings), 'EX', EVALUATION_TTL_SECONDS);
  } catch (err) {
    logFailure('achievements.marker_write_failed', userId, err);
  }
}

export async function clearAchievementsMarker(userId: string): Promise<void> {
  try {
    await connection.del(markerKey(userId));
  } catch (err) {
    logFailure('achievements.marker_clear_failed', userId, err);
  }
}
```

- [ ] **Step 4: Write `backend/src/achievements/goalChanges.ts`**

```ts
// Goal history writer (spec 2026-10-06 §3). Called by updateSleepGoal and nowhere else, inside the
// same transaction as the goal update, so a goal is never saved without its history (or the other
// way round). One row per (user, kind, local day): a second change the same day overwrites that
// day's row. resetsStreak compares the new value with the goal in effect BEFORE that day, so
// lowering and restoring on the same day is no reset. When no row before today exists, the goal
// that was in effect (the same-day starting row, else the stored value) is written first, dated
// the day before, so a later change today still has that day-before goal to compare with.
// The usual bedtime is a read of up to 60 nights; the caller does it BEFORE the transaction.

import type { GoalChangeKind, Prisma } from '@prisma/client';
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { loadRecapData } from '../recap/data';
import { shiftDate } from '../scoring/dates';
import { bedtimeGoalResets, bedtimeSeries, sleepGoalResets, usualBedtimeBefore } from './goalHistory';

export const USUAL_BEDTIME_LOOKBACK_DAYS = 60;

export interface GoalsBefore { sleepGoalMinutes: number; bedtimeGoal: string | null; timezone: string }
export interface GoalPatch { sleepGoalMinutes?: number; bedtimeGoal?: string | null }
/** Read before the transaction: the user's local date now and, when needed, their usual bedtime. */
export interface GoalChangeContext { today: string; usualBedtime: number | null }

interface KindValue { sleepMinutes: number | null; bedtime: string | null }

/** The median bedtime (minutes since local noon) of the 14 nights with one before `date`; null under 7. */
export async function usualBedtime(userId: string, timeZone: string, date: string): Promise<number | null> {
  const data = await loadRecapData(userId, timeZone, shiftDate(date, -USUAL_BEDTIME_LOOKBACK_DAYS), shiftDate(date, -1));
  return usualBedtimeBefore(bedtimeSeries(data), date);
}

/** A bedtime goal is being set (not cleared) to a new value: the usual bedtime may decide resetsStreak. */
export function needsUsualBedtime(before: GoalsBefore, patch: GoalPatch): boolean {
  return patch.bedtimeGoal !== undefined && patch.bedtimeGoal !== null && patch.bedtimeGoal !== before.bedtimeGoal;
}

async function writeChange(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: GoalChangeKind,
  today: string,
  stored: KindValue,
  next: KindValue,
  resets: (previous: KindValue) => boolean,
): Promise<void> {
  const day = civilDateToUtcMidnight(today);
  const earlier = await tx.goalChange.findFirst({ where: { userId, kind, effectiveOn: { lt: day } }, orderBy: { effectiveOn: 'desc' } });
  let previous: KindValue;
  if (earlier) {
    previous = { sleepMinutes: earlier.sleepMinutes, bedtime: earlier.bedtime };
  } else {
    const sameDay = await tx.goalChange.findUnique({ where: { userId_kind_effectiveOn: { userId, kind, effectiveOn: day } } });
    previous = sameDay ? { sleepMinutes: sameDay.sleepMinutes, bedtime: sameDay.bedtime } : stored;
    await tx.goalChange.createMany({
      data: [{ userId, kind, ...previous, effectiveOn: civilDateToUtcMidnight(shiftDate(today, -1)), resetsStreak: false }],
      skipDuplicates: true,
    });
  }
  const resetsStreak = resets(previous);
  await tx.goalChange.upsert({
    where: { userId_kind_effectiveOn: { userId, kind, effectiveOn: day } },
    create: { userId, kind, ...next, effectiveOn: day, resetsStreak },
    update: { ...next, resetsStreak },
  });
}

/** Writes, with `tx`, a row for each goal in `patch` whose value differs from `before`; the wake goal is not tracked. */
export async function recordGoalChanges(
  tx: Prisma.TransactionClient,
  userId: string,
  before: GoalsBefore,
  patch: GoalPatch,
  ctx: GoalChangeContext,
): Promise<void> {
  const minutes = patch.sleepGoalMinutes;
  if (minutes !== undefined && minutes !== before.sleepGoalMinutes) {
    await writeChange(
      tx, userId, 'SLEEP_MINUTES', ctx.today,
      { sleepMinutes: before.sleepGoalMinutes, bedtime: null },
      { sleepMinutes: minutes, bedtime: null },
      (previous) => sleepGoalResets(previous.sleepMinutes ?? before.sleepGoalMinutes, minutes),
    );
  }
  const bedtime = patch.bedtimeGoal;
  if (bedtime !== undefined && bedtime !== before.bedtimeGoal) {
    await writeChange(
      tx, userId, 'BEDTIME', ctx.today,
      { sleepMinutes: null, bedtime: before.bedtimeGoal },
      { sleepMinutes: null, bedtime },
      (previous) => bedtimeGoalResets(previous.bedtime, bedtime, previous.bedtime === null ? ctx.usualBedtime : null),
    );
  }
}
```

- [ ] **Step 5: Change `updateSleepGoal`** in `backend/src/users/goals.ts`. Add at the top, after the existing `prisma` import:

```ts
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { needsUsualBedtime, recordGoalChanges, usualBedtime } from '../achievements/goalChanges';
import { clearAchievementsMarker } from '../achievements/marker';
```

Replace the whole `updateSleepGoal` function with:

```ts
/**
 * Saves a patch from parseSleepGoalPatch and returns the saved goal; null when the user does not
 * exist. Also the single writer of GoalChange (achievements spec 2026-10-06 §3): the goal update and
 * its history are written in ONE transaction, so a failure saves neither. The usual bedtime (a read
 * of up to 60 nights) is computed before the transaction starts, keeping the transaction short.
 * A saved goal clears the badge evaluation marker so the next badge load re-evaluates.
 */
export async function updateSleepGoal(userId: string, patch: SleepGoalPatch, now: Date = new Date()): Promise<SleepGoal | null> {
  const found = await prisma.user.findUnique({ where: { id: userId }, select: { sleepGoalMinutes: true, bedtimeGoal: true, timezone: true } });
  if (!found) return null;
  const before = { ...found, sleepGoalMinutes: resolveSleepGoalMinutes(found.sleepGoalMinutes) };
  const today = localCivilDateOrUtc(now, before.timezone);
  const usual = needsUsualBedtime(before, patch) ? await usualBedtime(userId, before.timezone, today) : null;
  const saved = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id: userId }, data: patch });
    if (result.count === 0) return false;
    await recordGoalChanges(tx, userId, before, patch, { today, usualBedtime: usual });
    return true;
  });
  if (!saved) return null;
  await clearAchievementsMarker(userId);
  return getSleepGoal(userId);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/goalChanges.test.ts tests/users/sleepGoal.test.ts tests/users/goals.test.ts`
Expected: PASS (the existing `PUT /me/sleep/goal` tests are unchanged and still pass).

- [ ] **Step 7: Commit**

```bash
git add backend/src/achievements/marker.ts backend/src/achievements/goalChanges.ts backend/src/users/goals.ts backend/tests/achievements/goalChanges.test.ts
git commit -m "feat(backend): goal history written on every sleep or bedtime goal save, and the badge evaluation marker"
```

---

### Task 6: On-time check-ins

**Files:**
- Modify: `backend/src/habits/habitDay.ts` (add `habitDayForOrUtc`)
- Modify: `backend/src/habits/routes.ts` (`POST /me/habits/check-ins`, the upsert near the end of the handler)
- Test: `backend/tests/habits/habitDay.test.ts`, `backend/tests/habits/routes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`HabitCheckIn.onTime`); Task 5 (`clearAchievementsMarker`, and in tests `markEvaluated`, `readEvaluated`).
- Produces: `export function habitDayForOrUtc(at: Date, timeZone: string): string` in `backend/src/habits/habitDay.ts`. Check-in rows now carry `onTime`.

- [ ] **Step 1: Write the failing tests.** In `backend/tests/habits/habitDay.test.ts`, add `habitDayForOrUtc` to the existing import from `'../../src/habits/habitDay'` and append:

```ts
describe('habitDayForOrUtc', () => {
  it('is habitDayFor, falling back to UTC for a zone Intl does not know', () => {
    expect(habitDayForOrUtc(new Date('2026-10-06T02:00:00Z'), 'Pacific/Auckland')).toBe('2026-10-06');
    expect(habitDayForOrUtc(new Date('2026-10-06T02:00:00Z'), 'Not/AZone')).toBe('2026-10-05');
  });
});
```

In `backend/tests/habits/routes.test.ts`, add these imports at the top:

```ts
import { connection } from '../../src/sync/queue';
import { markEvaluated, readEvaluated } from '../../src/achievements/marker';
```

replace the existing `afterAll` with:

```ts
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});
```

and append:

```ts
/** An Etc/GMT zone whose wall clock reads `hour`:xx right now (Etc/GMT-N is UTC+N). */
function zoneAtLocalHour(hour: number, now = new Date()): string {
  let offset = (hour - now.getUTCHours() + 24) % 24;
  if (offset > 14) offset -= 24;
  return offset === 0 ? 'Etc/GMT' : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

describe('POST /me/habits/check-ins: on time', () => {
  const onTimeOf = async (userId: string, habitDay: string) =>
    (await prisma.habitCheckIn.findUniqueOrThrow({ where: { userId_habitDay: { userId, habitDay: civilDateToUtcMidnight(habitDay) } } })).onTime;

  it("stores onTime for today's habit day and not for a backdated one", async () => {
    const user = await createUser();
    const h = await authed(user.id);
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({});
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: shiftDate(todayUtc(), -1) });
    expect(await onTimeOf(user.id, todayUtc())).toBe(true);
    expect(await onTimeOf(user.id, shiftDate(todayUtc(), -1))).toBe(false);
  });

  it('puts a 01:00 check-in on the previous calendar day, on time (the 4am habit day)', async () => {
    const zone = zoneAtLocalHour(1);
    const user = await createUser({ timezone: zone });
    const now = new Date();
    const res = await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({});
    const habitToday = habitDayFor(now, zone);
    expect(habitToday).toBe(shiftDate(localCivilDate(now, zone), -1));
    expect(res.body.checkIn.habitDay).toBe(habitToday);
    expect(await onTimeOf(user.id, habitToday)).toBe(true);
  });

  it('never rewrites a stored flag: a repeat tap on a backdated day leaves it false', async () => {
    const user = await createUser();
    const h = await authed(user.id);
    const yesterday = shiftDate(todayUtc(), -1);
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: yesterday });
    await request(await testServer(app)).post('/me/habits/check-ins').set(h).send({ habitDay: yesterday });
    expect(await onTimeOf(user.id, yesterday)).toBe(false);
  });

  it('clears the achievements marker so the next badge load re-evaluates', async () => {
    const user = await createUser();
    await markEvaluated(user.id, []);
    await request(await testServer(app)).post('/me/habits/check-ins').set(await authed(user.id)).send({});
    expect(await readEvaluated(user.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/habits/habitDay.test.ts tests/habits/routes.test.ts`
Expected: FAIL — `habitDayForOrUtc` is not exported; `onTime` is `false` for today's check-in; the marker is still there.

- [ ] **Step 3: Add `habitDayForOrUtc`** to the end of `backend/src/habits/habitDay.ts`:

```ts
/** habitDayFor, falling back to UTC for a zone Intl does not know (a bad stored value must not break a read). */
export function habitDayForOrUtc(at: Date, timeZone: string): string {
  try {
    return habitDayFor(at, timeZone);
  } catch {
    return habitDayFor(at, 'UTC');
  }
}
```

- [ ] **Step 4: Set `onTime` at write and clear the marker.** In `backend/src/habits/routes.ts` add the import:

```ts
import { clearAchievementsMarker } from '../achievements/marker';
```

and in the `POST /me/habits/check-ins` handler replace:

```ts
  const day = civilDateToUtcMidnight(habitDay);
  // Idempotent: a second tap changes nothing.
  await prisma.habitCheckIn.upsert({
    where: { userId_habitDay: { userId, habitDay: day } },
    update: {},
    create: { userId, habitDay: day },
  });
  res.status(201).json({ checkIn: { habitDay } });
```

with:

```ts
  const day = civilDateToUtcMidnight(habitDay);
  // On time = made during its own habit day (achievements spec §3). Stored when the row is written
  // and never recomputed: a second tap changes nothing, the flag included.
  const onTime = habitDay === today;
  await prisma.habitCheckIn.upsert({
    where: { userId_habitDay: { userId, habitDay: day } },
    update: {},
    create: { userId, habitDay: day, onTime },
  });
  // A check-in can extend the check-in streak: the next badge load re-evaluates at once.
  await clearAchievementsMarker(userId);
  res.status(201).json({ checkIn: { habitDay } });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/habits/habitDay.test.ts tests/habits/routes.test.ts`
Expected: PASS, including every existing check-in test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/habits/habitDay.ts backend/src/habits/routes.ts backend/tests/habits/habitDay.test.ts backend/tests/habits/routes.test.ts
git commit -m "feat(backend): mark check-ins made during their own habit day as on time"
```

---

### Task 7: Loader and evaluator

**Files:**
- Create: `backend/src/achievements/data.ts`
- Create: `backend/src/achievements/evaluate.ts`
- Test: `backend/tests/achievements/evaluate.test.ts`

**Interfaces:**
- Consumes: Task 2 (`ALL_FAMILIES`); Task 3 (`GoalChangeRow`); Task 4 (`StreakInputs`, `MonthRecap`, `FamilyResult`, `familyResults`); Task 6 (`habitDayForOrUtc`); `loadRecapData`; `mondayOf`, `monthStartOf` from `backend/src/recap/periods.ts`; `resolveSleepGoalMinutes` from `backend/src/users/goals.ts`.
- Produces:

```ts
// data.ts
export const BEDTIME_LOOKBACK_DAYS = 60;
export interface AchievementInputs { inputs: StreakInputs; months: MonthRecap[] }
export function loadAchievementInputs(userId: string, now: Date): Promise<AchievementInputs | null>;
// evaluate.ts
export function evaluateAchievements(userId: string, now: Date, families?: readonly AchievementFamily[]): Promise<FamilyResult[] | null>;
```

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/evaluate.test.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { evaluateAchievements } from '../../src/achievements/evaluate';
import { shiftDate } from '../../src/scoring/dates';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';
import { seedNights } from '../recap/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const day = civilDateToUtcMidnight;
const key = (d: Date) => d.toISOString().slice(0, 10);
const NOW = new Date('2026-10-10T12:00:00Z');
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => shiftDate(from, i));

async function startedUser(since = '2026-10-01', over: { timezone?: string } = {}) {
  const user = await createUser(over);
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day(since) } });
  return user;
}
async function stored(userId: string) {
  const rows = await prisma.achievement.findMany({ where: { userId }, orderBy: [{ family: 'asc' }, { level: 'asc' }] });
  return rows.map((r) => ({ family: r.family, level: r.level, value: r.value, earnedOn: key(r.earnedOn), weekStart: key(r.weekStart), monthStart: key(r.monthStart) }));
}
const steps = (userId: string, dates: string[], value: number) =>
  prisma.biometricRecord.createMany({ data: dates.map((d) => ({ userId, metricType: 'STEPS' as const, value, recordedAt: day(d) })) });
const checkIns = (userId: string, dates: string[], onTime = true) =>
  prisma.habitCheckIn.createMany({ data: dates.map((d) => ({ userId, habitDay: day(d), onTime })) });

it('stores every level a finished streak reached, dated when it reached each one (a catch-up sync)', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500, 500, 500, 500, 500, 400]);
  const results = await evaluateAchievements(user.id, NOW);
  expect(results?.find((r) => r.family === 'SLEEP_GOAL')).toMatchObject({ current: 0, best: 7 });
  expect(await stored(user.id)).toEqual([
    { family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03', weekStart: '2026-09-28', monthStart: '2026-10-01' },
    { family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07', weekStart: '2026-10-05', monthStart: '2026-10-01' },
  ]);
});

it('is idempotent and safe to run concurrently', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  await Promise.all([evaluateAchievements(user.id, NOW), evaluateAchievements(user.id, NOW)]);
  await evaluateAchievements(user.id, NOW);
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(1);
});

it('never revokes a level when the data behind it goes away', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  await evaluateAchievements(user.id, NOW);
  await prisma.biometricRecord.deleteMany({ where: { userId: user.id } });
  await evaluateAchievements(user.id, NOW);
  expect(await stored(user.id)).toHaveLength(1);
});

it('counts nothing before the start date', async () => {
  const user = await startedUser('2026-10-06');
  await seedNights(user.id, '2026-10-01', [500, 500, 500, 500, 500]);
  await evaluateAchievements(user.id, NOW);
  expect(await stored(user.id)).toEqual([]);
});

it('judges each night by the stored goal in effect that night', async () => {
  const user = await startedUser();
  await prisma.goalChange.createMany({
    data: [
      { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-01'), resetsStreak: false },
      { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 510, effectiveOn: day('2026-10-03'), resetsStreak: false },
    ],
  });
  // 490 a night: on goal while 480 applies (nights ending Oct 1–3), short once 510 applies (Oct 4).
  await seedNights(user.id, '2026-10-01', [490, 490, 490, 490]);
  const results = await evaluateAchievements(user.id, NOW);
  expect(results?.find((r) => r.family === 'SLEEP_GOAL')).toMatchObject({ best: 3, current: 0 });
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.earnedOn])).toEqual([['SLEEP_GOAL', 1, '2026-10-03']]);
});

it("judges steps by the user's own day: in Auckland Oct 10 is already over at 12:00Z", async () => {
  const auckland = await startedUser('2026-10-01', { timezone: 'Pacific/Auckland' });
  const utc = await startedUser();
  for (const u of [auckland, utc]) await steps(u.id, ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'], 12000);
  await evaluateAchievements(auckland.id, NOW);
  await evaluateAchievements(utc.id, NOW);
  expect(await stored(auckland.id)).toEqual([
    { family: 'STEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-10', weekStart: '2026-10-05', monthStart: '2026-10-01' },
  ]);
  expect(await stored(utc.id)).toEqual([]);
});

it('counts only on-time check-ins toward the check-in streak', async () => {
  const steady = await startedUser();
  await checkIns(steady.id, range('2026-10-01', 7));
  const late = await startedUser();
  await checkIns(late.id, range('2026-10-01', 7).filter((d) => d !== '2026-10-04'));
  await checkIns(late.id, ['2026-10-04'], false);
  await evaluateAchievements(steady.id, NOW);
  await evaluateAchievements(late.id, NOW);
  expect(await stored(steady.id)).toEqual([
    { family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07', weekStart: '2026-10-05', monthStart: '2026-10-01' },
  ]);
  expect(await stored(late.id)).toEqual([]);
});

it('counts months from BUILT recaps; a rebuild that gains a milestone awards, one that loses it revokes nothing', async () => {
  const user = await startedUser('2026-08-01');
  const month = (start: string, end: string, milestones: Prisma.InputJsonObject) =>
    prisma.recap.create({ data: { userId: user.id, kind: 'MONTH', periodStart: day(start), periodEnd: day(end), status: 'BUILT', sleepGoalMinutes: 480, stats: { nightsWithData: 30, milestones } } });
  await month('2026-07-01', '2026-07-31', { everyDayLogged: { days: 31 } });
  const aug = await month('2026-08-01', '2026-08-31', { everyDayLogged: { days: 31 } });
  const sep = await month('2026-09-01', '2026-09-30', { everyDayLogged: { days: 30 }, steadiestMonth: { spreadMinutes: 12 } });
  await evaluateAchievements(user.id, NOW);
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.earnedOn])).toEqual([
    ['EVERY_DAY_LOGGED', 1, '2026-08-31'],
    ['STEADIEST_MONTH', 1, '2026-09-30'],
  ]);
  await prisma.recap.update({ where: { id: aug.id }, data: { stats: { nightsWithData: 31, milestones: { everyDayLogged: { days: 31 }, steadiestMonth: { spreadMinutes: 15 } } } } });
  await prisma.recap.update({ where: { id: sep.id }, data: { stats: { nightsWithData: 30, milestones: { steadiestMonth: { spreadMinutes: 12 } } } } });
  await evaluateAchievements(user.id, NOW);
  expect((await stored(user.id)).map((r) => [r.family, r.level, r.earnedOn])).toEqual([
    ['EVERY_DAY_LOGGED', 1, '2026-08-31'],
    // Level I keeps its stored date; level II is the second qualifying month's end.
    ['STEADIEST_MONTH', 1, '2026-09-30'],
    ['STEADIEST_MONTH', 2, '2026-09-30'],
  ]);
});

it('evaluates only the families asked for', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  await checkIns(user.id, range('2026-10-01', 7));
  const results = await evaluateAchievements(user.id, NOW, ['CHECK_IN']);
  expect(results?.map((r) => r.family)).toEqual(['CHECK_IN']);
  expect((await stored(user.id)).map((r) => r.family)).toEqual(['CHECK_IN']);
});

it('returns null and stores nothing for a user without a start date', async () => {
  const user = await createUser();
  expect(await evaluateAchievements(user.id, NOW)).toBeNull();
  expect(await prisma.achievement.count({ where: { userId: user.id } })).toBe(0);
});

it('logs each new level once, with ids, family and level only', async () => {
  const user = await startedUser();
  await seedNights(user.id, '2026-10-01', [500, 500, 500]);
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  try {
    await evaluateAchievements(user.id, NOW);
    await evaluateAchievements(user.id, NOW);
    expect(info.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { event: 'achievements.awarded', userId: user.id, family: 'SLEEP_GOAL', level: 1 },
    ]);
  } finally {
    info.mockRestore();
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/evaluate.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/evaluate'".

- [ ] **Step 3: Write `backend/src/achievements/data.ts`**

```ts
// The evaluator's database reads (spec 2026-10-06 §3): SLEEP and STEPS rollups and main-session
// bedtimes through the recap loader (the same definitions as Recap and sleep depth), the goal
// history, on-time check-ins and BUILT month recaps. Data is read from BEDTIME_LOOKBACK_DAYS before
// the start date, because the steady-bedtime median may use nights before it.

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { habitDayForOrUtc } from '../habits/habitDay';
import { loadRecapData } from '../recap/data';
import type { RecapStats } from '../recap/types';
import { shiftDate } from '../scoring/dates';
import { resolveSleepGoalMinutes } from '../users/goals';
import type { MonthRecap, StreakInputs } from './families';
import type { GoalChangeRow } from './goalHistory';

export const BEDTIME_LOOKBACK_DAYS = 60;

export interface AchievementInputs { inputs: StreakInputs; months: MonthRecap[] }

const key = (d: Date) => d.toISOString().slice(0, 10);

/** null when the user is unknown or has no start date yet. */
export async function loadAchievementInputs(userId: string, now: Date): Promise<AchievementInputs | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, achievementsSince: true, sleepGoalMinutes: true, bedtimeGoal: true },
  });
  if (!user?.achievementsSince) return null;
  const since = key(user.achievementsSince);
  const sinceDay = civilDateToUtcMidnight(since);
  const today = localCivilDateOrUtc(now, user.timezone);
  const [data, changes, checkIns, recaps] = await Promise.all([
    loadRecapData(userId, user.timezone, shiftDate(since, -BEDTIME_LOOKBACK_DAYS), today),
    prisma.goalChange.findMany({ where: { userId }, orderBy: { effectiveOn: 'asc' } }),
    prisma.habitCheckIn.findMany({ where: { userId, onTime: true, habitDay: { gte: sinceDay } }, select: { habitDay: true } }),
    prisma.recap.findMany({
      where: { userId, kind: 'MONTH', status: 'BUILT', periodStart: { gte: sinceDay } },
      orderBy: { periodStart: 'asc' },
      select: { periodStart: true, periodEnd: true, stats: true },
    }),
  ]);
  const rows: GoalChangeRow[] = changes.map((c) => ({
    kind: c.kind, sleepMinutes: c.sleepMinutes, bedtime: c.bedtime, effectiveOn: key(c.effectiveOn), resetsStreak: c.resetsStreak,
  }));
  return {
    inputs: {
      today,
      habitToday: habitDayForOrUtc(now, user.timezone),
      since,
      data,
      sleepChanges: rows.filter((r) => r.kind === 'SLEEP_MINUTES'),
      bedtimeChanges: rows.filter((r) => r.kind === 'BEDTIME'),
      currentSleepGoal: resolveSleepGoalMinutes(user.sleepGoalMinutes),
      currentBedtime: user.bedtimeGoal,
      onTimeHabitDays: new Set(checkIns.map((c) => key(c.habitDay))),
    },
    months: recaps.map((r) => ({
      periodStart: key(r.periodStart),
      periodEnd: key(r.periodEnd),
      milestones: (r.stats as unknown as RecapStats | null)?.milestones,
    })),
  };
}
```

- [ ] **Step 4: Write `backend/src/achievements/evaluate.ts`**

```ts
// evaluateAchievements (spec 2026-10-06 §5): computes each family's runs (or month count) since its
// start date and inserts every level the best run reached that is not stored yet. Idempotent and
// safe to run twice or concurrently: the (user, family, level) unique key decides, and a stored
// level is never updated or removed.

import type { AchievementFamily } from '@prisma/client';
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { mondayOf, monthStartOf } from '../recap/periods';
import { ALL_FAMILIES } from './catalogue';
import { loadAchievementInputs } from './data';
import { familyResults, type FamilyResult } from './families';

/** Each asked family's current, best and reachable levels; null when the user has no start date. */
export async function evaluateAchievements(
  userId: string,
  now: Date,
  families: readonly AchievementFamily[] = ALL_FAMILIES,
): Promise<FamilyResult[] | null> {
  const loaded = await loadAchievementInputs(userId, now);
  if (!loaded) return null;
  const results = familyResults(loaded.inputs, loaded.months, families);

  const stored = await prisma.achievement.findMany({ where: { userId }, select: { family: true, level: true } });
  const have = new Set(stored.map((s) => `${s.family}:${s.level}`));
  const fresh = results.flatMap((r) => r.reached.filter((l) => !have.has(`${r.family}:${l.level}`)).map((l) => ({ family: r.family, ...l })));
  if (fresh.length > 0) {
    await prisma.achievement.createMany({
      data: fresh.map((l) => ({
        userId,
        family: l.family,
        level: l.level,
        value: l.value,
        earnedOn: civilDateToUtcMidnight(l.earnedOn),
        weekStart: civilDateToUtcMidnight(mondayOf(l.earnedOn)),
        monthStart: civilDateToUtcMidnight(monthStartOf(l.earnedOn)),
      })),
      skipDuplicates: true,
    });
    // Ids, family and level only: never the health values behind them.
    for (const l of fresh) console.info(JSON.stringify({ event: 'achievements.awarded', userId, family: l.family, level: l.level }));
  }
  return results;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/evaluate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/achievements/data.ts backend/src/achievements/evaluate.ts backend/tests/achievements/evaluate.test.ts
git commit -m "feat(backend): evaluate badges from the best run since the start date, idempotently"
```

---

### Task 8: Start date and starting goals on the first badge load

**Files:**
- Create: `backend/src/achievements/start.ts`
- Test: `backend/tests/achievements/start.test.ts`

**Interfaces:**
- Consumes: Task 1; Task 5 (`updateSleepGoal` in tests); `localCivilDateOrUtc`, `civilDateToUtcMidnight`; `resolveSleepGoalMinutes`.
- Produces:

```ts
export interface StartingGoals { sleepGoalMinutes: number; bedtimeGoal: string | null }
export interface StartableUser { id: string; sleepGoalMinutes: number; bedtimeGoal: string | null }
export function writeStartingGoals(userId: string, effectiveOn: string, goals: StartingGoals): Promise<void>;
export function claimStartDate(user: StartableUser, date: string): Promise<boolean>;
export function ensureAchievementsStart(userId: string, now: Date): Promise<string | null>;
```

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/start.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import { ensureAchievementsStart, writeStartingGoals } from '../../src/achievements/start';
import { updateSleepGoal } from '../../src/users/goals';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const day = civilDateToUtcMidnight;
const NOW = new Date('2026-10-06T20:00:00Z');

async function goalRows(userId: string) {
  const rows = await prisma.goalChange.findMany({ where: { userId }, orderBy: [{ kind: 'asc' }, { effectiveOn: 'asc' }] });
  return rows.map((r) => [r.kind, r.effectiveOn.toISOString().slice(0, 10), r.sleepMinutes, r.bedtime, r.resetsStreak]);
}

it("sets a new user's start date to their local date on the first load, with the starting goals", async () => {
  const user = await createUser({ timezone: 'Pacific/Auckland', sleepGoalMinutes: 450 });
  expect(await ensureAchievementsStart(user.id, NOW)).toBe('2026-10-07');
  expect(await goalRows(user.id)).toEqual([
    ['SLEEP_MINUTES', '2026-10-07', 450, null, false],
    ['BEDTIME', '2026-10-07', null, null, false],
  ]);
});

it('tolerates a goal already saved that day: the saved change is kept and nothing is violated', async () => {
  const user = await createUser();
  await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
  expect(await ensureAchievementsStart(user.id, NOW)).toBe('2026-10-06');
  expect(await goalRows(user.id)).toEqual([
    ['SLEEP_MINUTES', '2026-10-05', 480, null, false],
    ['SLEEP_MINUTES', '2026-10-06', 450, null, true],
    ['BEDTIME', '2026-10-06', null, null, false],
  ]);
});

it('never moves a start date that is set, and writes nothing then', async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day('2026-09-01') } });
  expect(await ensureAchievementsStart(user.id, NOW)).toBe('2026-09-01');
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('sets one start date when two first loads race', async () => {
  const user = await createUser();
  const both = await Promise.all([ensureAchievementsStart(user.id, NOW), ensureAchievementsStart(user.id, NOW)]);
  expect(both).toEqual(['2026-10-06', '2026-10-06']);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(2);
});

it('returns null for an unknown user', async () => {
  expect(await ensureAchievementsStart('00000000-0000-4000-8000-000000000000', NOW)).toBeNull();
});

it('writeStartingGoals keeps a row already written for that day', async () => {
  const user = await createUser();
  await prisma.goalChange.create({ data: { userId: user.id, kind: 'BEDTIME', bedtime: '22:00', effectiveOn: day('2026-10-06'), resetsStreak: true } });
  await writeStartingGoals(user.id, '2026-10-06', { sleepGoalMinutes: 480, bedtimeGoal: null });
  expect(await goalRows(user.id)).toEqual([
    ['SLEEP_MINUTES', '2026-10-06', 480, null, false],
    ['BEDTIME', '2026-10-06', null, '22:00', true],
  ]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/start.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/start'".

- [ ] **Step 3: Write `backend/src/achievements/start.ts`**

```ts
// Start dates (spec 2026-10-06 §3). achievementsSince is written only where it is null — by the
// launch job for existing users, by the first GET /me/achievements for new users — as the user's
// local date then. The starting GoalChange rows are written at the same moment. createMany with
// skipDuplicates never violates (userId, kind, effectiveOn) and never overwrites a goal the user
// already saved that day: that saved row wins.

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { resolveSleepGoalMinutes } from '../users/goals';

export interface StartingGoals { sleepGoalMinutes: number; bedtimeGoal: string | null }
export interface StartableUser { id: string; sleepGoalMinutes: number; bedtimeGoal: string | null }

const key = (d: Date) => d.toISOString().slice(0, 10);

export async function writeStartingGoals(userId: string, effectiveOn: string, goals: StartingGoals): Promise<void> {
  const day = civilDateToUtcMidnight(effectiveOn);
  await prisma.goalChange.createMany({
    data: [
      { userId, kind: 'SLEEP_MINUTES', sleepMinutes: goals.sleepGoalMinutes, bedtime: null, effectiveOn: day, resetsStreak: false },
      { userId, kind: 'BEDTIME', sleepMinutes: null, bedtime: goals.bedtimeGoal, effectiveOn: day, resetsStreak: false },
    ],
    skipDuplicates: true,
  });
}

/** Sets the start date to `date` only where it is still null; true when this call set it (and wrote the starting goals). */
export async function claimStartDate(user: StartableUser, date: string): Promise<boolean> {
  const set = await prisma.user.updateMany({
    where: { id: user.id, achievementsSince: null },
    data: { achievementsSince: civilDateToUtcMidnight(date) },
  });
  if (set.count === 0) return false;
  await writeStartingGoals(user.id, date, { sleepGoalMinutes: resolveSleepGoalMinutes(user.sleepGoalMinutes), bedtimeGoal: user.bedtimeGoal });
  return true;
}

/** The user's start date, setting it to their local date now on the first call; null for an unknown user. */
export async function ensureAchievementsStart(userId: string, now: Date): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timezone: true, achievementsSince: true, sleepGoalMinutes: true, bedtimeGoal: true },
  });
  if (!user) return null;
  if (user.achievementsSince) return key(user.achievementsSince);
  await claimStartDate(user, localCivilDateOrUtc(now, user.timezone));
  // Re-read: a concurrent first load may have set it instead of this one.
  const after = await prisma.user.findUnique({ where: { id: userId }, select: { achievementsSince: true } });
  return after?.achievementsSince ? key(after.achievementsSince) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/start.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/achievements/start.ts backend/tests/achievements/start.test.ts
git commit -m "feat(backend): set a new user's badge start date and starting goals on the first load"
```

---

### Task 9: Launch job

**Files:**
- Create: `backend/src/achievements/launch.ts`
- Modify: `backend/src/server.ts` (imports, and `startBackgroundWork` after the `startRecaps()` call)
- Test: `backend/tests/achievements/launch.test.ts`

**Interfaces:**
- Consumes: Task 6 (`habitDayForOrUtc`); Task 8 (`claimStartDate`); `MarkerStore` from `backend/src/recap/backfill.ts`; `connection`.
- Produces:

```ts
export const ACHIEVEMENTS_LAUNCH_MARKER = 'achievements:launch:v1';
export const ACHIEVEMENTS_MIGRATION = '20261006120000_achievements';
export function launchInstant(): Promise<Date | null>;      // the migration's finished_at
export function backfillLaunchDayOnTime(userId: string, timeZone: string, launchAt: Date): Promise<number>;
export function runAchievementsLaunchOnce(deps?: { store?: MarkerStore; launchAt?: Date; userIds?: string[] }): Promise<number>;
export function startAchievements(deps?: { store?: MarkerStore; launchAt?: Date; userIds?: string[] }): Promise<void>;
```

The launch instant is the moment the achievements migration finished (`_prisma_migrations.finished_at`), not the time the job happens to run: a rerun after a lost marker therefore computes the same launch habit day. The job walks **every** user. It sets `achievementsSince` and the starting goals only where the start date is still null, and it runs the launch-day `onTime` fix for every user — including one whose first badge load already set the start date before the job ran. The fix only flips false→true, only for check-ins saved before the launch instant whose `habitDay` is the launch habit day and whose `createdAt` falls inside it, so a rerun changes nothing.

- [ ] **Step 1: Write the failing test** `backend/tests/achievements/launch.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import type { MarkerStore } from '../../src/recap/backfill';
import { ACHIEVEMENTS_LAUNCH_MARKER, launchInstant, runAchievementsLaunchOnce, startAchievements } from '../../src/achievements/launch';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

class MemoryStore implements MarkerStore {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
}

const day = civilDateToUtcMidnight;
// Launched at 02:00 UTC on Oct 7: the calendar date is Oct 7, but the habit day is still Oct 6.
const LAUNCH = new Date('2026-10-07T02:00:00Z');
const sinceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).achievementsSince?.toISOString().slice(0, 10) ?? null;
const checkIn = (userId: string, habitDay: string, createdAt: string, onTime = false) =>
  prisma.habitCheckIn.create({ data: { userId, habitDay: day(habitDay), createdAt: new Date(createdAt), onTime } });
const onTimeOf = async (id: string) => (await prisma.habitCheckIn.findUniqueOrThrow({ where: { id } })).onTime;

it('starts every user without a start date on their local launch date, with starting goals, and leaves a set one alone', async () => {
  const auckland = await createUser({ timezone: 'Pacific/Auckland' });
  const utc = await createUser({ sleepGoalMinutes: 450 });
  const started = await createUser();
  await prisma.user.update({ where: { id: started.id }, data: { achievementsSince: day('2026-09-01') } });
  const store = new MemoryStore();

  expect(await runAchievementsLaunchOnce({ store, launchAt: LAUNCH, userIds: [auckland.id, utc.id, started.id] })).toBe(2);

  expect(await sinceOf(auckland.id)).toBe('2026-10-07');
  expect(await sinceOf(utc.id)).toBe('2026-10-07');
  expect(await sinceOf(started.id)).toBe('2026-09-01');
  const rows = await prisma.goalChange.findMany({ where: { userId: utc.id }, orderBy: { kind: 'asc' } });
  expect(rows.map((r) => [r.kind, r.effectiveOn.toISOString().slice(0, 10), r.sleepMinutes, r.bedtime, r.resetsStreak])).toEqual([
    ['SLEEP_MINUTES', '2026-10-07', 450, null, false],
    ['BEDTIME', '2026-10-07', null, null, false],
  ]);
  expect(await prisma.goalChange.count({ where: { userId: started.id } })).toBe(0);
  expect(store.values.get(ACHIEVEMENTS_LAUNCH_MARKER)).toBe(LAUNCH.toISOString());
});

it('marks check-ins saved before the launch, during the launch habit day, as on time, and nothing else', async () => {
  const evening = await createUser();
  const eveningRow = await checkIn(evening.id, '2026-10-06', '2026-10-06T21:00:00Z');
  const afterMidnight = await createUser();
  const afterMidnightRow = await checkIn(afterMidnight.id, '2026-10-06', '2026-10-07T01:30:00Z');
  const backdated = await createUser();
  const backdatedRow = await checkIn(backdated.id, '2026-10-05', '2026-10-06T21:00:00Z');
  const afterLaunch = await createUser();
  const afterLaunchRow = await checkIn(afterLaunch.id, '2026-10-06', '2026-10-07T03:00:00Z');

  await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: [evening.id, afterMidnight.id, backdated.id, afterLaunch.id] });

  expect(await onTimeOf(eveningRow.id)).toBe(true);
  expect(await onTimeOf(afterMidnightRow.id)).toBe(true);
  expect(await onTimeOf(backdatedRow.id)).toBe(false);
  // Saved after the launch: its flag was set at write time and is never recomputed.
  expect(await onTimeOf(afterLaunchRow.id)).toBe(false);
});

it('fixes launch-day check-ins for a user whose first badge load already set the start date', async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day('2026-10-07') } });
  const row = await checkIn(user.id, '2026-10-06', '2026-10-06T21:00:00Z');

  expect(await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: [user.id] })).toBe(0);

  expect(await onTimeOf(row.id)).toBe(true);
  expect(await sinceOf(user.id)).toBe('2026-10-07');
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
});

it('a rerun after a lost marker moves no start date, writes no goal row and recomputes no flag', async () => {
  const before = await createUser();
  const beforeRow = await checkIn(before.id, '2026-10-06', '2026-10-06T21:00:00Z');
  const after = await createUser();
  const afterRow = await checkIn(after.id, '2026-10-06', '2026-10-07T03:00:00Z');
  const ids = [before.id, after.id];
  await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: ids });

  expect(await runAchievementsLaunchOnce({ store: new MemoryStore(), launchAt: LAUNCH, userIds: ids })).toBe(0);

  expect(await sinceOf(before.id)).toBe('2026-10-07');
  expect(await onTimeOf(beforeRow.id)).toBe(true);
  expect(await onTimeOf(afterRow.id)).toBe(false);
  expect(await prisma.goalChange.count({ where: { userId: before.id } })).toBe(2);
});

it('takes the launch instant from the achievements migration by default', async () => {
  const at = await launchInstant();
  expect(at).toBeInstanceOf(Date);
  const user = await createUser();
  const store = new MemoryStore();
  await runAchievementsLaunchOnce({ store, userIds: [user.id] });
  expect(store.values.get(ACHIEVEMENTS_LAUNCH_MARKER)).toBe(at!.toISOString());
});

it('runs only once per marker', async () => {
  const user = await createUser();
  const store = new MemoryStore();
  store.values.set(ACHIEVEMENTS_LAUNCH_MARKER, '2026-10-01T00:00:00.000Z');
  expect(await runAchievementsLaunchOnce({ store, launchAt: LAUNCH, userIds: [user.id] })).toBe(0);
  expect(await sinceOf(user.id)).toBeNull();
});

it('startAchievements logs a failure by error class, never throws, and leaves the marker unset', async () => {
  const user = await createUser();
  const store = new MemoryStore();
  const spy = jest.spyOn(prisma.user, 'findMany').mockRejectedValueOnce(new TypeError('db down'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(startAchievements({ store, launchAt: LAUNCH, userIds: [user.id] })).resolves.toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.launch_failed', error: 'TypeError' });
  } finally {
    spy.mockRestore();
    log.mockRestore();
  }
  expect(store.values.has(ACHIEVEMENTS_LAUNCH_MARKER)).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/launch.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/launch'".

- [ ] **Step 3: Write `backend/src/achievements/launch.ts`**

```ts
// The one-off launch job (spec 2026-10-06 §3), like the recap backfill's once-marker. The launch
// instant is when the achievements migration finished, so every run — including a rerun after a
// lost marker — uses the same launch day. For every user it:
//   - sets achievementsSince to their local date at launch and writes the starting goals, only
//     where the start date is still null;
//   - marks the check-ins saved before the launch during the launch habit day as on time, whether
//     or not this run set their start date (a first badge load may have got there first).
// Every write is "only where null / only false -> true" on a fixed set of rows, so a rerun moves no
// start date and recomputes no flag. The marker is set last: a crash part-way reruns safely.

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { habitDayForOrUtc } from '../habits/habitDay';
import type { MarkerStore } from '../recap/backfill';
import { connection } from '../sync/queue';
import { claimStartDate } from './start';

export const ACHIEVEMENTS_LAUNCH_MARKER = 'achievements:launch:v1';
export const ACHIEVEMENTS_MIGRATION = '20261006120000_achievements';
const PAGE = 200;

interface LaunchDeps { store?: MarkerStore; launchAt?: Date; userIds?: string[] }

/** When the achievements migration finished: the launch instant. Null if it is not recorded. */
export async function launchInstant(): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ finished_at: Date | null }>>`
    SELECT finished_at FROM _prisma_migrations
    WHERE migration_name = ${ACHIEVEMENTS_MIGRATION} AND rolled_back_at IS NULL AND finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1`;
  return rows[0]?.finished_at ?? null;
}

async function* allUsers(userIds?: string[]) {
  let after: string | null = null;
  for (;;) {
    const page = await prisma.user.findMany({
      where: { AND: [userIds ? { id: { in: userIds } } : {}, after ? { id: { gt: after } } : {}] },
      orderBy: { id: 'asc' },
      take: PAGE,
      select: { id: true, timezone: true, sleepGoalMinutes: true, bedtimeGoal: true, achievementsSince: true },
    });
    yield* page;
    if (page.length < PAGE) return;
    after = page[page.length - 1]!.id;
  }
}

/**
 * Check-ins saved before the launch on the launch habit day: on time when their createdAt falls in
 * that same habit day (computed in the zone at launch). Only false -> true; rows saved after the
 * launch keep the flag set at write time.
 */
export async function backfillLaunchDayOnTime(userId: string, timeZone: string, launchAt: Date): Promise<number> {
  const launchDay = habitDayForOrUtc(launchAt, timeZone);
  const rows = await prisma.habitCheckIn.findMany({
    where: { userId, habitDay: civilDateToUtcMidnight(launchDay), onTime: false, createdAt: { lt: launchAt } },
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
    if (user.achievementsSince === null && (await claimStartDate(user, localCivilDateOrUtc(at, user.timezone)))) started++;
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
```

- [ ] **Step 4: Wire it into the server.** In `backend/src/server.ts` add the import after `import { startRecaps } from './recap/backfill';`:

```ts
import { startAchievements } from './achievements/launch';
```

and in `startBackgroundWork`, right after the `startRecaps().catch(...)` line, add:

```ts
  // Badges: the one-off launch job sets existing users' start dates (only where none is set) and
  // marks launch-day check-ins on time (spec 2026-10-06 §3). Never throws; retried next start.
  void startAchievements();
```

- [ ] **Step 5: Run the test and the backend typecheck**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/launch.test.ts`
Expected: PASS.
Run (from `backend/`): `N24 node_modules/.bin/tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add backend/src/achievements/launch.ts backend/src/server.ts backend/tests/achievements/launch.test.ts
git commit -m "feat(backend): launch job sets badge start dates where unset and marks launch-day check-ins on time"
```

---

### Task 10: `GET /me/achievements` and `POST /me/achievements/celebrated`

**Files:**
- Create: `backend/src/achievements/dto.ts`
- Create: `backend/src/achievements/routes.ts`
- Modify: `backend/src/app.ts` (import and `app.use(achievementsRouter)` after `app.use(recapRouter)`)
- Test: `backend/tests/achievements/dto.test.ts`, `backend/tests/achievements/routes.test.ts`

**Interfaces:**
- Consumes: Task 2 (`FAMILIES`, `nextThreshold`, `FamilyKind`); Task 4 (`FamilyStanding`); Task 5 (`readEvaluated`, `markEvaluated`); Task 7 (`evaluateAchievements`); Task 8 (`ensureAchievementsStart`); `requireAuth`, `AuthedRequest`; `UUID_RE` from `backend/src/coach/push.ts`.
- Produces:

```ts
// dto.ts
export interface EarnedLevelDTO { level: number; value: number; earnedOn: string }
export interface FamilyDTO { family: AchievementFamily; kind: FamilyKind; level: number; thresholds: number[]; levels: EarnedLevelDTO[]; current: number; best: number; nextThreshold: number | null }
export interface UncelebratedDTO extends EarnedLevelDTO { id: string; family: AchievementFamily }
export interface AchievementsDTO { since: string; families: FamilyDTO[]; uncelebrated: UncelebratedDTO[] }
export function toAchievementsDTO(since: string, standings: readonly FamilyStanding[], rows: readonly Achievement[]): AchievementsDTO;
// routes.ts
export const MAX_CELEBRATED_IDS = 50;
export const achievementsRouter: Router;
// GET  /me/achievements              -> 200 AchievementsDTO | 404 { error: 'not_found' }
// POST /me/achievements/celebrated   -> body { ids: string[] } -> 200 { celebrated: number } | 400 { error: 'invalid_ids' }
```

- [ ] **Step 1: Write the failing tests.** `backend/tests/achievements/dto.test.ts`:

```ts
import type { Achievement } from '@prisma/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { toAchievementsDTO } from '../../src/achievements/dto';

const day = civilDateToUtcMidnight;
const row = (over: Partial<Achievement>): Achievement => ({
  id: 'a1', userId: 'u1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: day('2026-10-03'), weekStart: day('2026-09-28'),
  monthStart: day('2026-10-01'), createdAt: new Date('2026-10-03T08:00:00Z'), celebratedAt: null, ...over,
});

it('answers every family in catalogue order with its level, ladder, progress and next threshold', () => {
  const dto = toAchievementsDTO('2026-10-01', [{ family: 'SLEEP_GOAL', current: 9, best: 11 }], [
    row({}),
    row({ id: 'a2', level: 2, value: 7, earnedOn: day('2026-10-07'), celebratedAt: new Date('2026-10-07T09:00:00Z') }),
  ]);
  expect(dto.since).toBe('2026-10-01');
  expect(dto.families.map((f) => f.family)).toEqual(['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH']);
  expect(dto.families[0]).toEqual({
    family: 'SLEEP_GOAL', kind: 'streak', level: 2, thresholds: [3, 7, 14, 30, 100],
    levels: [{ level: 1, value: 3, earnedOn: '2026-10-03' }, { level: 2, value: 7, earnedOn: '2026-10-07' }],
    current: 9, best: 11, nextThreshold: 14,
  });
  expect(dto.families[3]).toEqual({ family: 'CHECK_IN', kind: 'streak', level: 0, thresholds: [7, 14, 30, 60, 180], levels: [], current: 0, best: 0, nextThreshold: 7 });
  expect(dto.families[6]).toMatchObject({ family: 'STEADIEST_MONTH', kind: 'monthly', thresholds: [1, 2, 4, 6, 12] });
  expect(dto.uncelebrated).toEqual([{ id: 'a1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' }]);
});

it('has no next threshold at the top level, and lists uncelebrated rows in catalogue then level order', () => {
  const rows = [row({ id: 'c1', family: 'CHECK_IN', level: 1, value: 7 }), ...[5, 4, 3, 2, 1].map((l) => row({ id: `s${l}`, level: l, value: [3, 7, 14, 30, 100][l - 1]! }))];
  const dto = toAchievementsDTO('2026-10-01', [], rows);
  expect(dto.families[0]!.level).toBe(5);
  expect(dto.families[0]!.nextThreshold).toBeNull();
  expect(dto.uncelebrated.map((u) => u.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 'c1']);
});
```

`backend/tests/achievements/routes.test.ts`:

```ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { createUser, daysAgo, todayUtc } from '../coach/helpers';
import { seedNight } from '../recap/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const day = civilDateToUtcMidnight;
const server = async () => request(await testServer(createApp()));
type Body = { families: Array<{ family: string; level: number; current: number }>; uncelebrated: Array<{ id: string; family: string; level: number; value: number; earnedOn: string }> };
const family = (body: Body, f: string) => body.families.find((x) => x.family === f);

async function startedUser() {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day(daysAgo(10)) } });
  return user;
}

it('requires a session', async () => {
  expect((await (await server()).get('/me/achievements')).status).toBe(401);
  expect((await (await server()).post('/me/achievements/celebrated').send({ ids: [] })).status).toBe(401);
});

it('starts a new user today on the first load and answers every family locked', async () => {
  const user = await createUser();
  const res = await (await server()).get('/me/achievements').set(await authHeaderFor(user.id));
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(res.body.since).toBe(todayUtc());
  expect(res.body.families).toHaveLength(7);
  expect(res.body.families[0]).toEqual({ family: 'SLEEP_GOAL', kind: 'streak', level: 0, thresholds: [3, 7, 14, 30, 100], levels: [], current: 0, best: 0, nextThreshold: 3 });
  expect(res.body.uncelebrated).toEqual([]);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(2);
});

it('evaluates inline at most once per 10 minutes, and a check-in clears the bound', async () => {
  const user = await startedUser();
  await seedNight(user.id, daysAgo(3), { minutes: 500 });
  await seedNight(user.id, daysAgo(2), { minutes: 500 });
  const h = await authHeaderFor(user.id);
  const first = await (await server()).get('/me/achievements').set(h);
  expect(family(first.body, 'SLEEP_GOAL')).toMatchObject({ level: 0, current: 2 });

  await seedNight(user.id, daysAgo(1), { minutes: 500 });
  const cached = await (await server()).get('/me/achievements').set(h);
  expect(family(cached.body, 'SLEEP_GOAL')).toMatchObject({ level: 0, current: 2 });

  await (await server()).post('/me/habits/check-ins').set(h).send({});
  const fresh = await (await server()).get('/me/achievements').set(h);
  expect(family(fresh.body, 'SLEEP_GOAL')).toMatchObject({ level: 1, current: 3 });
  expect(fresh.body.uncelebrated).toEqual([expect.objectContaining({ family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: daysAgo(1) })]);
});

it('a goal save clears the bound too', async () => {
  const user = await startedUser();
  await seedNight(user.id, daysAgo(3), { minutes: 500 });
  await seedNight(user.id, daysAgo(2), { minutes: 500 });
  const h = await authHeaderFor(user.id);
  await (await server()).get('/me/achievements').set(h);
  await seedNight(user.id, daysAgo(1), { minutes: 500 });
  expect((await (await server()).put('/me/sleep/goal').set(h).send({ wakeGoal: '07:00' })).status).toBe(200);
  const fresh = await (await server()).get('/me/achievements').set(h);
  expect(family(fresh.body, 'SLEEP_GOAL')).toMatchObject({ level: 1, current: 3 });
});

it("marks only the caller's own levels celebrated, ignoring unknown ids", async () => {
  const user = await startedUser();
  for (const n of [3, 2, 1]) await seedNight(user.id, daysAgo(n), { minutes: 500 });
  const h = await authHeaderFor(user.id);
  const first = await (await server()).get('/me/achievements').set(h);
  const mine = first.body.uncelebrated[0].id as string;
  const other = await startedUser();
  const theirs = await prisma.achievement.create({
    data: { userId: other.id, family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: day(daysAgo(1)), weekStart: day(daysAgo(1)), monthStart: day(daysAgo(1)) },
  });

  const res = await (await server()).post('/me/achievements/celebrated').set(h).send({ ids: [mine, theirs.id, '00000000-0000-4000-8000-000000000000'] });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ celebrated: 1 });
  expect((await (await server()).get('/me/achievements').set(h)).body.uncelebrated).toEqual([]);
  expect((await prisma.achievement.findUniqueOrThrow({ where: { id: theirs.id } })).celebratedAt).toBeNull();
});

it('rejects a celebrated body that is not a short list of ids', async () => {
  const h = await authHeaderFor((await startedUser()).id);
  const many = Array(51).fill('00000000-0000-4000-8000-000000000000');
  for (const body of [{}, { ids: [] }, { ids: 'x' }, { ids: ['not-a-uuid'] }, { ids: many }]) {
    const res = await (await server()).post('/me/achievements/celebrated').set(h).send(body);
    expect([res.status, res.body]).toEqual([400, { error: 'invalid_ids' }]);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/dto.test.ts tests/achievements/routes.test.ts`
Expected: FAIL — "Cannot find module '../../src/achievements/dto'" and 404s from the routes.

- [ ] **Step 3: Write `backend/src/achievements/dto.ts`**

```ts
// The GET /me/achievements answer (spec 2026-10-06 §6). Levels come from the stored rows (never
// revoked); current and best from the latest evaluation.

import type { Achievement, AchievementFamily } from '@prisma/client';
import { FAMILIES, nextThreshold, type FamilyKind } from './catalogue';
import type { FamilyStanding } from './families';

export interface EarnedLevelDTO { level: number; value: number; earnedOn: string }
export interface FamilyDTO {
  family: AchievementFamily;
  kind: FamilyKind;
  /** The highest stored level, 0..5. */
  level: number;
  thresholds: number[];
  levels: EarnedLevelDTO[];
  current: number;
  best: number;
  nextThreshold: number | null;
}
export interface UncelebratedDTO extends EarnedLevelDTO { id: string; family: AchievementFamily }
export interface AchievementsDTO { since: string; families: FamilyDTO[]; uncelebrated: UncelebratedDTO[] }

const key = (d: Date) => d.toISOString().slice(0, 10);

export function toAchievementsDTO(since: string, standings: readonly FamilyStanding[], rows: readonly Achievement[]): AchievementsDTO {
  const order = new Map(FAMILIES.map((f, i) => [f.family, i] as const));
  const families = FAMILIES.map((def): FamilyDTO => {
    const own = rows.filter((r) => r.family === def.family).sort((a, b) => a.level - b.level);
    const level = own.reduce((m, r) => Math.max(m, r.level), 0);
    const standing = standings.find((s) => s.family === def.family);
    return {
      family: def.family,
      kind: def.kind,
      level,
      thresholds: [...def.thresholds],
      levels: own.map((r) => ({ level: r.level, value: r.value, earnedOn: key(r.earnedOn) })),
      current: standing?.current ?? 0,
      best: standing?.best ?? 0,
      nextThreshold: nextThreshold(def, level),
    };
  });
  const uncelebrated = rows
    .filter((r) => r.celebratedAt === null)
    .sort((a, b) => (order.get(a.family) ?? 0) - (order.get(b.family) ?? 0) || a.level - b.level)
    .map((r) => ({ id: r.id, family: r.family, level: r.level, value: r.value, earnedOn: key(r.earnedOn) }));
  return { since, families, uncelebrated };
}
```

- [ ] **Step 4: Write `backend/src/achievements/routes.ts`**

```ts
// Badge endpoints (spec 2026-10-06 §5–6). The GET sets a new user's start date on the first load,
// evaluates inline at most once per 10 minutes (the marker holds the standings in between), then
// answers from the stored levels. Nothing is pushed.

import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../auth/middleware';
import { UUID_RE } from '../coach/push';
import { prisma } from '../db/client';
import { toAchievementsDTO } from './dto';
import { evaluateAchievements } from './evaluate';
import { markEvaluated, readEvaluated } from './marker';
import { ensureAchievementsStart } from './start';

export const MAX_CELEBRATED_IDS = 50;

export const achievementsRouter = Router();

achievementsRouter.get('/me/achievements', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const now = new Date();
  const since = await ensureAchievementsStart(userId, now);
  if (!since) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  let standings = await readEvaluated(userId);
  if (!standings) {
    const results = (await evaluateAchievements(userId, now)) ?? [];
    standings = results.map(({ family, current, best }) => ({ family, current, best }));
    await markEvaluated(userId, standings);
  }
  const rows = await prisma.achievement.findMany({ where: { userId } });
  res.set('Cache-Control', 'private, no-store');
  res.json(toAchievementsDTO(since, standings, rows));
});

function parseIds(body: unknown): string[] | null {
  const ids = (body as { ids?: unknown } | null | undefined)?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CELEBRATED_IDS) return null;
  return ids.every((id) => typeof id === 'string' && UUID_RE.test(id)) ? (ids as string[]) : null;
}

achievementsRouter.post('/me/achievements/celebrated', requireAuth, async (req: AuthedRequest, res) => {
  const ids = parseIds(req.body);
  if (!ids) {
    res.status(400).json({ error: 'invalid_ids' });
    return;
  }
  // Scoped to the caller's own rows: someone else's id, or an unknown one, changes nothing.
  const result = await prisma.achievement.updateMany({
    where: { id: { in: ids }, userId: req.userId!, celebratedAt: null },
    data: { celebratedAt: new Date() },
  });
  res.json({ celebrated: result.count });
});
```

- [ ] **Step 5: Register the router.** In `backend/src/app.ts` add `import { achievementsRouter } from './achievements/routes';` after the `recapRouter` import, and `app.use(achievementsRouter);` after `app.use(recapRouter);`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/achievements/dto.test.ts tests/achievements/routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/achievements/dto.ts backend/src/achievements/routes.ts backend/src/app.ts backend/tests/achievements/dto.test.ts backend/tests/achievements/routes.test.ts
git commit -m "feat(backend): badge endpoints with a 10-minute evaluation bound and celebration marking"
```

---

### Task 11: Drop the streak-milestone note from the recap fact sheet

**Files:**
- Modify: `backend/src/coach/answer/facts.ts:443` (the `if (m?.streak) b.notes.push(...)` line in `buildRecapFactSheet`)
- Test: `backend/tests/recap/factSheet.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildRecapFactSheet` no longer emits `'Milestone: a long run of nights on goal in a row (see sleep.streak)'`. The `sleep.streak` fact and every other fact are unchanged.

- [ ] **Step 1: Write the failing test.** Append to the `describe` that holds `'notes missing data without digits, and adds the month milestones'` in `backend/tests/recap/factSheet.test.ts`:

```ts
  it('no longer notes the old streak milestone (badges replaced it), and keeps the streak number', () => {
    const month = buildRecapFactSheet('MONTH', { nightsWithData: 28, longestOnGoalStreak: 9, milestones: { streak: { nights: 9 } } }, 480);
    expect(month.notes.join('\n')).not.toMatch(/run of nights on goal/);
    expect(month.facts.find((f) => f.id === 'sleep.streak')).toMatchObject({ value: 9 });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/recap/factSheet.test.ts`
Expected: FAIL — the notes contain "Milestone: a long run of nights on goal in a row (see sleep.streak)".

- [ ] **Step 3: Delete the line** in `backend/src/coach/answer/facts.ts`:

```ts
  if (m?.streak) b.notes.push('Milestone: a long run of nights on goal in a row (see sleep.streak)');
```

and put this comment in its place:

```ts
  // No streak-milestone note (achievements spec §5): the Sleep goal streak badge replaced it, and
  // the coach's line must never mention a milestone the app doesn't show.
```

- [ ] **Step 4: Run the recap and coach answer suites**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/recap tests/coach/answerFacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/coach/answer/facts.ts backend/tests/recap/factSheet.test.ts
git commit -m "fix(backend): recap fact sheet stops noting the old streak milestone"
```

---
### Task 12: Mobile API client, shared store and badge copy

**Files:**
- Create: `mobile/src/api/achievements.ts`
- Create: `mobile/src/lib/badges.ts`
- Create: `mobile/src/lib/achievementsStore.ts`
- Create: `mobile/jest-mocks/achievementsFixture.ts` (test helper)
- Test: `mobile/__tests__/api/achievements.test.ts`, `mobile/__tests__/lib/badges.test.ts`, `mobile/__tests__/lib/achievementsStore.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `mobile/src/api/client.ts`; `MONTH_SHORT` from `mobile/src/lib/heatmap.ts`; the endpoints from Task 10.
- Produces:

```ts
// api/achievements.ts
export type AchievementFamily = 'SLEEP_GOAL' | 'STEADY_BEDTIME' | 'STEP_GOAL' | 'CHECK_IN' | 'BEST_RECOVERY_WEEK' | 'EVERY_DAY_LOGGED' | 'STEADIEST_MONTH';
export type FamilyKind = 'streak' | 'monthly';
export interface EarnedLevel { level: number; value: number; earnedOn: string }
export interface FamilyAchievements { family: AchievementFamily; kind: FamilyKind; level: number; thresholds: number[]; levels: EarnedLevel[]; current: number; best: number; nextThreshold: number | null }
export interface UncelebratedLevel extends EarnedLevel { id: string; family: AchievementFamily }
export interface Achievements { since: string; families: FamilyAchievements[]; uncelebrated: UncelebratedLevel[] }
export function fetchAchievements(): Promise<Achievements | null>;   // null on a 404
export function markCelebrated(ids: string[]): Promise<void>;
// lib/badges.ts
export const FAMILY_ORDER: readonly AchievementFamily[];
export const MAX_LEVEL = 5;
export const TOTAL_LEVELS: number;                                   // 35
export const FAMILY_NAMES: Record<AchievementFamily, string>;
export const FAMILY_SHORT: Record<AchievementFamily, string>;
export const FAMILY_RULES: Record<AchievementFamily, string>;
export const LEVEL_NUMERALS: readonly ['I', 'II', 'III', 'IV', 'V'];
export const TIER_NAMES: readonly ['Bronze', 'Silver', 'Gold', 'Diamond', 'Coach'];
export function unitWord(family: AchievementFamily, n: number): string;
export function countLabel(family: AchievementFamily, n: number): string;
export function numeral(level: number): string;
export function tierName(level: number): string;
export function levelTitle(family: AchievementFamily, level: number): string;
export function shortLevelTitle(family: AchievementFamily, level: number): string;
export function shortDay(date: string): string;
export function earnedCount(a: Achievements): number;
export interface NextUp { family: AchievementFamily; nextLevel: number; current: number; threshold: number }
export function nextUp(a: Achievements): NextUp | null;
export function valueLine(family: AchievementFamily, value: number): string;
export function coachLine(family: AchievementFamily, level: number, thresholds: readonly number[]): string;
export interface LadderRow { level: number; earned: boolean; text: string; tag: 'EARNED' | 'NEXT' | null }
export function ladderRow(f: FamilyAchievements, level: number): LadderRow;
export function familyStatus(f: FamilyAchievements): string;
export interface BadgeRef { family: AchievementFamily; level: number }
export function levelsEarnedBetween(a: Achievements | null, from: string, to: string, kind?: FamilyKind): BadgeRef[];
// lib/achievementsStore.ts
export type AchievementsState = { status: 'idle' } | { status: 'ready'; data: Achievements } | { status: 'unavailable' } | { status: 'error' };
export interface AchievementsSnapshot { state: AchievementsState; celebrated: ReadonlySet<string> }
export function getAchievementsSnapshot(): AchievementsSnapshot;
export function refreshAchievements(): Promise<void>;
export function pendingLevels(s: AchievementsSnapshot): UncelebratedLevel[];
export function celebrate(ids: readonly string[]): Promise<void>;
export function resetAchievements(): void;
export function useAchievements(): AchievementsSnapshot;
// jest-mocks/achievementsFixture.ts
export const FAMILY_THRESHOLDS: Record<AchievementFamily, number[]>;
export function familyFixture(family: AchievementFamily, over?: Partial<FamilyAchievements>): FamilyAchievements;
export function achievementsFixture(families?: Partial<Record<AchievementFamily, Partial<FamilyAchievements>>>, over?: Partial<Achievements>): Achievements;
```

- [ ] **Step 1: Write the fixture** `mobile/jest-mocks/achievementsFixture.ts` (a helper, not a suite):

```ts
// Badge test data. Kept out of __tests__ so jest does not collect it as a suite (like forecastFixture.ts).
import type { AchievementFamily, Achievements, FamilyAchievements } from '../src/api/achievements';

export const FAMILY_THRESHOLDS: Record<AchievementFamily, number[]> = {
  SLEEP_GOAL: [3, 7, 14, 30, 100],
  STEADY_BEDTIME: [3, 7, 14, 30, 100],
  STEP_GOAL: [3, 7, 14, 30, 100],
  CHECK_IN: [7, 14, 30, 60, 180],
  BEST_RECOVERY_WEEK: [1, 3, 6, 12, 24],
  EVERY_DAY_LOGGED: [1, 3, 6, 12, 24],
  STEADIEST_MONTH: [1, 2, 4, 6, 12],
};
const ORDER = Object.keys(FAMILY_THRESHOLDS) as AchievementFamily[];
const MONTHLY: ReadonlySet<AchievementFamily> = new Set(['BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH']);

/** One family as the server answers it; nextThreshold follows `over.level` unless given. */
export function familyFixture(family: AchievementFamily, over: Partial<FamilyAchievements> = {}): FamilyAchievements {
  const level = over.level ?? 0;
  const thresholds = FAMILY_THRESHOLDS[family];
  return {
    family, kind: MONTHLY.has(family) ? 'monthly' : 'streak', level, thresholds, levels: [], current: 0, best: 0,
    nextThreshold: level >= 5 ? null : thresholds[level]!, ...over,
  };
}

export function achievementsFixture(
  families: Partial<Record<AchievementFamily, Partial<FamilyAchievements>>> = {},
  over: Partial<Achievements> = {},
): Achievements {
  return { since: '2026-10-01', families: ORDER.map((f) => familyFixture(f, families[f])), uncelebrated: [], ...over };
}
```

- [ ] **Step 2: Write the failing tests.** `mobile/__tests__/api/achievements.test.ts`:

```ts
import { apiFetch } from '../../src/api/client';
import { fetchAchievements, markCelebrated } from '../../src/api/achievements';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;

beforeEach(() => api.mockReset());

it('reads the badges, tolerating a missing uncelebrated list', async () => {
  api.mockResolvedValue({ since: '2026-10-01', families: [] });
  expect(await fetchAchievements()).toEqual({ since: '2026-10-01', families: [], uncelebrated: [] });
  expect(api).toHaveBeenLastCalledWith('/me/achievements');
});

it('reads a 404 (a backend older than badges) as null, and rethrows any other failure', async () => {
  api.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchAchievements()).toBeNull();
  api.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  await expect(fetchAchievements()).rejects.toThrow('boom');
});

it('throws on a body that is not badges', async () => {
  api.mockResolvedValue({ status: 'CONNECTED' });
  await expect(fetchAchievements()).rejects.toThrow('bad_achievements');
});

it('marks levels celebrated with their ids', async () => {
  api.mockResolvedValue({ celebrated: 2 });
  await markCelebrated(['a1', 'a2']);
  expect(api).toHaveBeenLastCalledWith('/me/achievements/celebrated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['a1', 'a2'] }),
  });
});
```

`mobile/__tests__/lib/badges.test.ts`:

```ts
import { achievementsFixture, familyFixture } from '../../jest-mocks/achievementsFixture';
import type { AchievementFamily } from '../../src/api/achievements';
import {
  TOTAL_LEVELS, coachLine, countLabel, earnedCount, familyStatus, ladderRow, levelTitle, levelsEarnedBetween, nextUp,
  shortDay, shortLevelTitle, valueLine,
} from '../../src/lib/badges';

const CANVAS = achievementsFixture({
  SLEEP_GOAL: { level: 2, current: 9, best: 11 },
  STEADY_BEDTIME: { level: 3, current: 15 },
  STEP_GOAL: { level: 1, current: 5 },
  CHECK_IN: { level: 2, current: 16 },
  BEST_RECOVERY_WEEK: { level: 1, current: 1 },
});

it('names levels, counts and dates', () => {
  expect(levelTitle('SLEEP_GOAL', 3)).toBe('Sleep goal streak III');
  expect(shortLevelTitle('CHECK_IN', 2)).toBe('Check-in II');
  expect(countLabel('SLEEP_GOAL', 1)).toBe('1 night');
  expect(countLabel('STEP_GOAL', 14)).toBe('14 days');
  expect(countLabel('EVERY_DAY_LOGGED', 3)).toBe('3 months');
  expect(shortDay('2026-10-08')).toBe('Oct 8');
});

it('counts the levels earned out of 35', () => {
  expect(TOTAL_LEVELS).toBe(35);
  expect(earnedCount(CANVAS)).toBe(9);
});

it('picks the family closest to its next level, catalogue order on a tie, none when all are at the top', () => {
  // Steps 5/7 (71%) beats sleep 9/14 (64%) and check-in 16/30 (53%).
  expect(nextUp(CANVAS)).toEqual({ family: 'STEP_GOAL', nextLevel: 2, current: 5, threshold: 7 });
  expect(nextUp(achievementsFixture())).toEqual({ family: 'SLEEP_GOAL', nextLevel: 1, current: 0, threshold: 3 });
  const all: AchievementFamily[] = ['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH'];
  const top = achievementsFixture(Object.fromEntries(all.map((f) => [f, { level: 5 }])) as Partial<Record<AchievementFamily, { level: number }>>);
  expect(nextUp(top)).toBeNull();
});

it('writes the celebration lines', () => {
  expect(valueLine('SLEEP_GOAL', 14)).toBe('14 nights in a row at your sleep goal.');
  expect(valueLine('EVERY_DAY_LOGGED', 1)).toBe('1 month with every day logged.');
  expect(coachLine('SLEEP_GOAL', 3, [3, 7, 14, 30, 100])).toBe('16 more nights for Diamond');
  expect(coachLine('STEADIEST_MONTH', 1, [1, 2, 4, 6, 12])).toBe('1 more month for Silver');
  expect(coachLine('CHECK_IN', 5, [7, 14, 30, 60, 180])).toBe('Top level!');
});

it('describes each rung of the ladder: earned with its date, the next one with what is left, the rest locked', () => {
  const f = familyFixture('SLEEP_GOAL', { level: 2, current: 9, levels: [{ level: 1, value: 3, earnedOn: '2026-10-08' }, { level: 2, value: 7, earnedOn: '2026-10-12' }] });
  expect(ladderRow(f, 1)).toEqual({ level: 1, earned: true, text: 'Earned Oct 8', tag: 'EARNED' });
  expect(ladderRow(f, 3)).toEqual({ level: 3, earned: false, text: '5 more nights in a row', tag: 'NEXT' });
  expect(ladderRow(f, 4)).toEqual({ level: 4, earned: false, text: 'Locked', tag: null });
  const months = familyFixture('EVERY_DAY_LOGGED', { level: 1, current: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] });
  expect(ladderRow(months, 2)).toEqual({ level: 2, earned: false, text: '1 more month', tag: 'NEXT' });
});

it('sums up a family for the Badges list', () => {
  expect(familyStatus(familyFixture('SLEEP_GOAL', { level: 2, current: 9 }))).toBe('Level II · Silver · 9 / 14 nights');
  expect(familyStatus(familyFixture('EVERY_DAY_LOGGED'))).toBe('Not yet · 0 / 1 month');
  expect(familyStatus(familyFixture('CHECK_IN', { level: 5, current: 200 }))).toBe('Level V · Coach');
});

it('lists the levels earned in a date range, optionally one kind only', () => {
  const a = achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 1, value: 3, earnedOn: '2026-09-30' }, { level: 2, value: 7, earnedOn: '2026-10-05' }] },
    CHECK_IN: { level: 1, levels: [{ level: 1, value: 7, earnedOn: '2026-10-11' }] },
    EVERY_DAY_LOGGED: { level: 1, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] },
  });
  expect(levelsEarnedBetween(a, '2026-10-05', '2026-10-11')).toEqual([{ family: 'SLEEP_GOAL', level: 2 }, { family: 'CHECK_IN', level: 1 }]);
  expect(levelsEarnedBetween(a, '2026-10-01', '2026-10-31', 'streak')).toEqual([{ family: 'SLEEP_GOAL', level: 2 }, { family: 'CHECK_IN', level: 1 }]);
  expect(levelsEarnedBetween(a, '2026-10-01', '2026-10-31', 'monthly')).toEqual([{ family: 'EVERY_DAY_LOGGED', level: 1 }]);
  expect(levelsEarnedBetween(null, '2026-10-01', '2026-10-31')).toEqual([]);
});
```

`mobile/__tests__/lib/achievementsStore.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements, markCelebrated } from '../../src/api/achievements';
import {
  celebrate, getAchievementsSnapshot, pendingLevels, refreshAchievements, resetAchievements, useAchievements,
} from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
const load = fetchAchievements as jest.Mock;
const post = markCelebrated as jest.Mock;
const UNCELEBRATED = [{ id: 'a1', family: 'SLEEP_GOAL' as const, level: 1, value: 3, earnedOn: '2026-10-03' }];

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  post.mockResolvedValue(undefined);
});

it('loads the badges into one shared snapshot that screens subscribe to', async () => {
  load.mockResolvedValue(achievementsFixture());
  const { result } = renderHook(() => useAchievements());
  expect(result.current.state).toEqual({ status: 'idle' });
  await act(() => refreshAchievements());
  expect(result.current.state).toEqual({ status: 'ready', data: achievementsFixture() });
});

it('reads a 404 as unavailable and a first failure as an error', async () => {
  load.mockResolvedValue(null);
  await refreshAchievements();
  expect(getAchievementsSnapshot().state).toEqual({ status: 'unavailable' });
  resetAchievements();
  load.mockRejectedValue(new Error('offline'));
  await refreshAchievements();
  expect(getAchievementsSnapshot().state).toEqual({ status: 'error' });
});

it('keeps what it had when a later refresh fails', async () => {
  load.mockResolvedValue(achievementsFixture());
  await refreshAchievements();
  load.mockRejectedValue(new Error('offline'));
  await refreshAchievements();
  expect(getAchievementsSnapshot().state.status).toBe('ready');
});

it('shares one request between overlapping refreshes', async () => {
  let resolve!: (v: unknown) => void;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const a = refreshAchievements();
  const b = refreshAchievements();
  expect(load).toHaveBeenCalledTimes(1);
  resolve(achievementsFixture());
  await Promise.all([a, b]);
  expect(getAchievementsSnapshot().state.status).toBe('ready');
});

it('celebrating hides those levels at once and tells the server; a failed post still hides them this session', async () => {
  load.mockResolvedValue(achievementsFixture({}, { uncelebrated: UNCELEBRATED }));
  await refreshAchievements();
  expect(pendingLevels(getAchievementsSnapshot())).toEqual(UNCELEBRATED);
  post.mockRejectedValueOnce(new Error('offline'));
  await celebrate(['a1']);
  expect(post).toHaveBeenCalledWith(['a1']);
  expect(pendingLevels(getAchievementsSnapshot())).toEqual([]);
});

it('drops a refresh that was in flight when the store is reset (sign out)', async () => {
  let resolve!: (v: unknown) => void;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const run = refreshAchievements();
  resetAchievements();
  resolve(achievementsFixture());
  await run;
  expect(getAchievementsSnapshot().state).toEqual({ status: 'idle' });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/api/achievements.test.ts __tests__/lib/badges.test.ts __tests__/lib/achievementsStore.test.tsx`
Expected: FAIL — "Cannot find module '../../src/api/achievements'".

- [ ] **Step 4: Write `mobile/src/api/achievements.ts`**

```ts
import { apiFetch } from './client';

// Badges (spec 2026-10-06 §6): awarded on the server; the app reads them and says which new levels
// it has celebrated. A 404 (a backend older than badges) reads as null and hides every badge UI.

export type AchievementFamily =
  | 'SLEEP_GOAL' | 'STEADY_BEDTIME' | 'STEP_GOAL' | 'CHECK_IN' | 'BEST_RECOVERY_WEEK' | 'EVERY_DAY_LOGGED' | 'STEADIEST_MONTH';
export type FamilyKind = 'streak' | 'monthly';

export interface EarnedLevel {
  level: number;
  /** The threshold reached. */
  value: number;
  /** YYYY-MM-DD: the date the run first reached it (a month's last day for a monthly family). */
  earnedOn: string;
}

export interface FamilyAchievements {
  family: AchievementFamily;
  kind: FamilyKind;
  /** Highest level earned, 0..5. */
  level: number;
  thresholds: number[];
  levels: EarnedLevel[];
  /** The latest run if unbroken (a month count for a monthly family). */
  current: number;
  best: number;
  nextThreshold: number | null;
}

export interface UncelebratedLevel extends EarnedLevel {
  id: string;
  family: AchievementFamily;
}

export interface Achievements {
  /** The badge start date: only days and months from it count. */
  since: string;
  families: FamilyAchievements[];
  uncelebrated: UncelebratedLevel[];
}

export async function fetchAchievements(): Promise<Achievements | null> {
  let body: Partial<Achievements> | undefined;
  try {
    body = await apiFetch<Partial<Achievements> | undefined>('/me/achievements');
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) return null;
    throw error;
  }
  const since = body?.since;
  const families = body?.families;
  const uncelebrated = body?.uncelebrated;
  if (typeof since !== 'string' || !Array.isArray(families)) throw new Error('bad_achievements');
  return { since, families, uncelebrated: Array.isArray(uncelebrated) ? uncelebrated : [] };
}

/** Closing a celebration: these levels (the family's new ones) are never celebrated again. */
export async function markCelebrated(ids: string[]): Promise<void> {
  await apiFetch<unknown>('/me/achievements/celebrated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}
```

- [ ] **Step 5: Write `mobile/src/lib/badges.ts`**

```ts
import type { AchievementFamily, Achievements, FamilyAchievements, FamilyKind } from '../api/achievements';
import { MONTH_SHORT } from './heatmap';

// Badge names, copy and selectors (spec 2026-10-06 §2 and §6), pure so the Profile card, the Badges
// screens, the celebration and the recap cards share one source.

export const FAMILY_ORDER: readonly AchievementFamily[] = [
  'SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH',
];
export const MAX_LEVEL = 5;
export const TOTAL_LEVELS = FAMILY_ORDER.length * MAX_LEVEL;

export const FAMILY_NAMES: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'Sleep goal streak',
  STEADY_BEDTIME: 'Steady bedtime',
  STEP_GOAL: 'Step goal streak',
  CHECK_IN: 'Daily check-in',
  BEST_RECOVERY_WEEK: 'Best recovery week',
  EVERY_DAY_LOGGED: 'Every day logged',
  STEADIEST_MONTH: 'Steadiest month',
};

export const FAMILY_SHORT: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'Sleep goal',
  STEADY_BEDTIME: 'Bedtime',
  STEP_GOAL: 'Steps',
  CHECK_IN: 'Check-in',
  BEST_RECOVERY_WEEK: 'Recovery',
  EVERY_DAY_LOGGED: 'Every day',
  STEADIEST_MONTH: 'Steadiest',
};

export const FAMILY_RULES: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'Nights in a row at or over your sleep goal',
  STEADY_BEDTIME: 'Nights in a row asleep within 30 min of your bedtime goal, or of your usual bedtime',
  STEP_GOAL: 'Finished days in a row at 10,000 steps',
  CHECK_IN: 'Days in a row checked in on "Anything to log today?" the same day',
  BEST_RECOVERY_WEEK: 'Your best week of the month beats last month’s best',
  EVERY_DAY_LOGGED: 'Sleep data for every day of the month',
  STEADIEST_MONTH: 'Your lowest bedtime spread yet (3+ earlier months)',
};

export const LEVEL_NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;
export const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Coach'] as const;

const UNIT: Record<AchievementFamily, 'night' | 'day' | 'month'> = {
  SLEEP_GOAL: 'night', STEADY_BEDTIME: 'night', STEP_GOAL: 'day', CHECK_IN: 'day',
  BEST_RECOVERY_WEEK: 'month', EVERY_DAY_LOGGED: 'month', STEADIEST_MONTH: 'month',
};

export function unitWord(family: AchievementFamily, n: number): string {
  return n === 1 ? UNIT[family] : `${UNIT[family]}s`;
}

export function countLabel(family: AchievementFamily, n: number): string {
  return `${n} ${unitWord(family, n)}`;
}

export function numeral(level: number): string {
  return LEVEL_NUMERALS[level - 1] ?? '';
}

export function tierName(level: number): string {
  return TIER_NAMES[level - 1] ?? '';
}

/** "Sleep goal streak III". */
export function levelTitle(family: AchievementFamily, level: number): string {
  return `${FAMILY_NAMES[family]} ${numeral(level)}`;
}

/** "Sleep goal II": under a small badge. */
export function shortLevelTitle(family: AchievementFamily, level: number): string {
  return `${FAMILY_SHORT[family]} ${numeral(level)}`;
}

/** "Oct 8". */
export function shortDay(date: string): string {
  return `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

/** Levels earned across every family: "BADGES · n OF 35". */
export function earnedCount(a: Achievements): number {
  return a.families.reduce((n, f) => n + f.level, 0);
}

export interface NextUp { family: AchievementFamily; nextLevel: number; current: number; threshold: number }

/** The family closest to its next level (current / next threshold); catalogue order on a tie. */
export function nextUp(a: Achievements): NextUp | null {
  let best: NextUp | null = null;
  let bestRatio = -1;
  for (const family of FAMILY_ORDER) {
    const f = a.families.find((x) => x.family === family);
    if (!f || f.nextThreshold === null) continue;
    const ratio = Math.min(f.current, f.nextThreshold) / f.nextThreshold;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = { family, nextLevel: f.level + 1, current: f.current, threshold: f.nextThreshold };
    }
  }
  return best;
}

const VALUE_LINES: Record<AchievementFamily, (count: string) => string> = {
  SLEEP_GOAL: (c) => `${c} in a row at your sleep goal.`,
  STEADY_BEDTIME: (c) => `${c} in a row asleep near your bedtime.`,
  STEP_GOAL: (c) => `${c} in a row at 10,000 steps.`,
  CHECK_IN: (c) => `${c} in a row checked in on time.`,
  BEST_RECOVERY_WEEK: (c) => `${c} with a best recovery week.`,
  EVERY_DAY_LOGGED: (c) => `${c} with every day logged.`,
  STEADIEST_MONTH: (c) => `${c} of your steadiest bedtimes yet.`,
};

/** The celebration's line under the level name. */
export function valueLine(family: AchievementFamily, value: number): string {
  return VALUE_LINES[family](countLabel(family, value));
}

/** The coach's fixed line: "<n> more <unit> for <next level>", or "Top level!". */
export function coachLine(family: AchievementFamily, level: number, thresholds: readonly number[]): string {
  const reached = thresholds[level - 1];
  const next = thresholds[level];
  if (level >= MAX_LEVEL || reached === undefined || next === undefined) return 'Top level!';
  const n = next - reached;
  return `${n} more ${unitWord(family, n)} for ${tierName(level + 1)}`;
}

export interface LadderRow { level: number; earned: boolean; text: string; tag: 'EARNED' | 'NEXT' | null }

/** One rung of the detail screen's ladder. */
export function ladderRow(f: FamilyAchievements, level: number): LadderRow {
  const earned = f.levels.find((l) => l.level === level);
  if (earned) return { level, earned: true, text: `Earned ${shortDay(earned.earnedOn)}`, tag: 'EARNED' };
  if (level === f.level + 1) {
    const n = Math.max(0, (f.thresholds[level - 1] ?? 0) - f.current);
    const more = `${n} more ${unitWord(f.family, n)}`;
    return { level, earned: false, text: f.kind === 'streak' ? `${more} in a row` : more, tag: 'NEXT' };
  }
  return { level, earned: false, text: 'Locked', tag: null };
}

/** "Level II · Silver · 9 / 14 nights", "Not yet · 0 / 1 month", "Level V · Coach". */
export function familyStatus(f: FamilyAchievements): string {
  const head = f.level > 0 ? `Level ${numeral(f.level)} · ${tierName(f.level)}` : 'Not yet';
  return f.nextThreshold === null ? head : `${head} · ${Math.min(f.current, f.nextThreshold)} / ${countLabel(f.family, f.nextThreshold)}`;
}

export interface BadgeRef { family: AchievementFamily; level: number }

/** Levels with earnedOn in [from, to], in catalogue then level order; [] with no badges. */
export function levelsEarnedBetween(a: Achievements | null, from: string, to: string, kind?: FamilyKind): BadgeRef[] {
  if (!a) return [];
  const out: BadgeRef[] = [];
  for (const family of FAMILY_ORDER) {
    const f = a.families.find((x) => x.family === family);
    if (!f || (kind !== undefined && f.kind !== kind)) continue;
    for (const l of [...f.levels].sort((x, y) => x.level - y.level)) {
      if (l.earnedOn >= from && l.earnedOn <= to) out.push({ family, level: l.level });
    }
  }
  return out;
}
```

- [ ] **Step 6: Write `mobile/src/lib/achievementsStore.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { fetchAchievements, markCelebrated, type Achievements, type UncelebratedLevel } from '../api/achievements';

// One shared copy of GET /me/achievements (spec 2026-10-06 §6) for the Profile card, the Badges
// screens, the celebration and the recap cards, like the story ring's store. A 404 (a backend
// older than badges) is 'unavailable' and hides every badge UI. Levels closed in a celebration are
// remembered for the session, so a refresh before the server has them never shows them again.

export type AchievementsState =
  | { status: 'idle' }
  | { status: 'ready'; data: Achievements }
  | { status: 'unavailable' }
  | { status: 'error' };

export interface AchievementsSnapshot {
  state: AchievementsState;
  /** Level ids closed in a celebration this session. */
  celebrated: ReadonlySet<string>;
}

let snapshot: AchievementsSnapshot = { state: { status: 'idle' }, celebrated: new Set() };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
// Bumped on reset: a load that started before it never lands after it.
let epoch = 0;

function publish(next: Partial<AchievementsSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function getAchievementsSnapshot(): AchievementsSnapshot {
  return snapshot;
}

/** Re-reads the badges. Calls made while one is running share it. A failure keeps what was there. */
export function refreshAchievements(): Promise<void> {
  if (inflight) return inflight;
  const at = epoch;
  const run = (async () => {
    let next: AchievementsState;
    try {
      const data = await fetchAchievements();
      next = data ? { status: 'ready', data } : { status: 'unavailable' };
    } catch {
      next = snapshot.state.status === 'ready' ? snapshot.state : { status: 'error' };
    }
    if (at === epoch) publish({ state: next });
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** New levels still to celebrate: the server's list minus those closed this session. */
export function pendingLevels(s: AchievementsSnapshot): UncelebratedLevel[] {
  return s.state.status === 'ready' ? s.state.data.uncelebrated.filter((u) => !s.celebrated.has(u.id)) : [];
}

/** Closes a celebration: hidden at once, then marked on the server (a failure is retried on a later start). */
export async function celebrate(ids: readonly string[]): Promise<void> {
  publish({ celebrated: new Set([...snapshot.celebrated, ...ids]) });
  try {
    await markCelebrated([...ids]);
  } catch {
    // Hidden for this session; the server still has it uncelebrated, so a later start offers it again.
  }
}

/** Forgets everything (sign out; tests). */
export function resetAchievements(): void {
  epoch++;
  inflight = null;
  publish({ state: { status: 'idle' }, celebrated: new Set() });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAchievements(): AchievementsSnapshot {
  return useSyncExternalStore(subscribe, getAchievementsSnapshot, getAchievementsSnapshot);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/api/achievements.test.ts __tests__/lib/badges.test.ts __tests__/lib/achievementsStore.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/api/achievements.ts mobile/src/lib/badges.ts mobile/src/lib/achievementsStore.ts mobile/jest-mocks/achievementsFixture.ts mobile/__tests__/api/achievements.test.ts mobile/__tests__/lib/badges.test.ts mobile/__tests__/lib/achievementsStore.test.tsx
git commit -m "feat(mobile): badges client, shared store and badge copy"
```

---

### Task 13: The pixel badge (`BadgeIcon`)

**Files:**
- Create: `mobile/src/lib/badgeArt.ts`
- Create: `mobile/src/components/achievements/BadgeIcon.tsx`
- Test: `mobile/__tests__/lib/badgeArt.test.ts`, `mobile/__tests__/components/BadgeIcon.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`AchievementFamily`, `FAMILY_NAMES`, `numeral`, `tierName`); `useCharacterOptional` from `mobile/src/characters/CharacterContext.ts`; `characterInfo` from `mobile/src/components/characters/registry.ts`; `react-native-svg` (`Svg`, `Polygon`, `Rect`).
- Produces:

```ts
// lib/badgeArt.ts
export const GLYPHS: Record<AchievementFamily, readonly string[]>;
export interface TierColors { ring: string; fill: string; glyph: string }
export const TIERS: readonly TierColors[];          // levels 0 (locked) .. 4 (Diamond)
export const LOCKED_PIP = '#3F3F46';
export function mixHex(a: string, b: string, t: number): string;
export function coachTier(accent: string): TierColors;
export function tierColors(level: number, coachAccent: string): TierColors;
export function glyphCells(family: AchievementFamily): Array<[col: number, row: number]>;
export function octagonPoints(inset: number, size?: number): string;
// components/achievements/BadgeIcon.tsx
export interface BadgeIconProps { family: AchievementFamily; level: number; size: number; pips?: boolean; coachAccent?: string; testID?: string }
export function BadgeIcon(props: BadgeIconProps): JSX.Element;
// testIDs: `${testID}` (root, accessible image), `${testID}-pips`, `${testID}-pip-1..5`
```

The glyphs and tier colours below are copied exactly from the canvas `Badge.dc.html` (`G` and `T`). The canvas's sixth tier (Mochi pink) is the Coach tier for the default coach; this plan derives it from the user's coach accent instead (`coachTier`), which reproduces the canvas for Mochi within one step of rounding (`#F9A8D4` ring, `#37252F` fill, `#FCCFE7` glyph).

- [ ] **Step 1: Write the failing tests.** `mobile/__tests__/lib/badgeArt.test.ts`:

```ts
import { GLYPHS, LOCKED_PIP, TIERS, coachTier, glyphCells, mixHex, octagonPoints, tierColors } from '../../src/lib/badgeArt';
import type { AchievementFamily } from '../../src/api/achievements';

it('has the 12×12 design glyph for every family', () => {
  for (const rows of Object.values(GLYPHS)) {
    expect(rows).toHaveLength(12);
    for (const row of rows) expect(row).toMatch(/^[.#]{12}$/);
  }
  const counts = Object.fromEntries((Object.keys(GLYPHS) as AchievementFamily[]).map((f) => [f, glyphCells(f).length]));
  expect(counts).toEqual({ SLEEP_GOAL: 45, STEADY_BEDTIME: 46, STEP_GOAL: 69, CHECK_IN: 34, BEST_RECOVERY_WEEK: 82, EVERY_DAY_LOGGED: 76, STEADIEST_MONTH: 56 });
  expect(glyphCells('SLEEP_GOAL')[0]).toEqual([5, 0]);
});

it('uses the design tier colours up to Diamond and the coach accent for level V', () => {
  expect(TIERS.map((t) => t.ring)).toEqual(['#3F3F46', '#D08A4E', '#CBD5E1', '#FACC15', '#67E8F9']);
  expect(tierColors(3, '#F9A8D4')).toEqual({ ring: '#FACC15', fill: '#3B300A', glyph: '#FDE68A' });
  expect(tierColors(5, '#F9A8D4')).toEqual({ ring: '#F9A8D4', fill: '#37252F', glyph: '#FCCFE7' });
  expect(coachTier('#4ADE80').ring).toBe('#4ADE80');
  expect(tierColors(9, '#4ADE80').ring).toBe('#4ADE80');
  expect(tierColors(-1, '#4ADE80')).toEqual(TIERS[0]);
  expect(LOCKED_PIP).toBe('#3F3F46');
});

it('mixes hex colours', () => {
  expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  expect(mixHex('#F9A8D4', '#000000', 0.78)).toBe('#37252F');
});

it('draws the octagon at 30% and 70% of each side, inset for the inner face', () => {
  expect(octagonPoints(0)).toBe('30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30');
  expect(octagonPoints(6)).toBe('32.4,6 67.6,6 94,32.4 94,67.6 67.6,94 32.4,94 6,67.6 6,32.4');
});
```

`mobile/__tests__/components/BadgeIcon.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { BadgeIcon } from '../../src/components/achievements/BadgeIcon';

it('names the family, level and tier for screen readers, and fills one pip per level', () => {
  render(<BadgeIcon family="SLEEP_GOAL" level={3} size={58} testID="b" />);
  expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Sleep goal streak, level III, Gold');
  for (const i of [1, 2, 3]) expect(screen.getByTestId(`b-pip-${i}`)).toHaveStyle({ backgroundColor: '#FACC15', width: 4, height: 4 });
  for (const i of [4, 5]) expect(screen.getByTestId(`b-pip-${i}`)).toHaveStyle({ backgroundColor: '#3F3F46' });
});

it('draws a locked badge grey', () => {
  render(<BadgeIcon family="CHECK_IN" level={0} size={58} testID="b" />);
  expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Daily check-in, locked');
  for (const i of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`b-pip-${i}`)).toHaveStyle({ backgroundColor: '#3F3F46' });
});

it("draws level V in the user's coach colour", () => {
  render(withCharacter(<BadgeIcon family="STEP_GOAL" level={5} size={100} testID="b" />, { characterId: 'sprout' }));
  expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Step goal streak, level V, Coach');
  expect(screen.getByTestId('b-pip-5')).toHaveStyle({ backgroundColor: '#4ADE80', width: 7, height: 7 });
});

it('takes an explicit coach colour and can leave the pips out', () => {
  render(<BadgeIcon family="SLEEP_GOAL" level={5} size={44} pips={false} coachAccent="#E0B48A" testID="b" />);
  expect(screen.queryByTestId('b-pips')).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/badgeArt.test.ts __tests__/components/BadgeIcon.test.tsx`
Expected: FAIL — "Cannot find module '../../src/lib/badgeArt'".

- [ ] **Step 3: Write `mobile/src/lib/badgeArt.ts`**

```ts
import type { AchievementFamily } from '../api/achievements';

// The badge's pixel art (spec 2026-10-06 §6; canvas Badge.dc.html): a pixel octagon, a 12×12 glyph
// per family and the tier colours. Pure data and geometry; BadgeIcon draws it.

/** 12×12 glyphs, '#' = a filled cell: moon, clock, sneaker, check, heart, calendar, sparkle. */
export const GLYPHS: Record<AchievementFamily, readonly string[]> = {
  SLEEP_GOAL: ['.....####...', '...####.....', '..###.......', '.###......#.', '.###.....###', '###.......#.', '###.........', '.###........', '.###........', '..###.......', '...####.....', '.....####...'],
  STEADY_BEDTIME: ['...######...', '..#......#..', '.#...##...#.', '#....##....#', '#....##....#', '#....####..#', '#....####..#', '#..........#', '#..........#', '.#........#.', '..#......#..', '...######...'],
  STEP_GOAL: ['............', '............', '..###.......', '..####......', '..#####.....', '..######....', '..#######...', '.##########.', '############', '############', '.##########.', '............'],
  CHECK_IN: ['............', '..........##', '.........###', '........###.', '.......###..', '##....###...', '###..###....', '.######.....', '..####......', '...##.......', '............', '............'],
  BEST_RECOVERY_WEEK: ['............', '.###....###.', '#####..#####', '############', '############', '############', '.##########.', '..########..', '...######...', '....####....', '.....##.....', '............'],
  EVERY_DAY_LOGGED: ['..#......#..', '############', '############', '#..........#', '#.##.##.##.#', '#.##.##.##.#', '#..........#', '#.##.##.##.#', '#.##.##.##.#', '#..........#', '############', '............'],
  STEADIEST_MONTH: ['.....##.....', '.....##.....', '.....##.....', '....####....', '...######...', '############', '############', '...######...', '....####....', '.....##.....', '.....##.....', '.....##.....'],
};

export interface TierColors { ring: string; fill: string; glyph: string }

/** Level 0 (locked) to IV (Diamond), exactly as the canvas. Level V is the user's coach colour. */
export const TIERS: readonly TierColors[] = [
  { ring: '#3F3F46', fill: '#18181B', glyph: '#52525B' },
  { ring: '#D08A4E', fill: '#3A2414', glyph: '#F0B07A' },
  { ring: '#CBD5E1', fill: '#253041', glyph: '#E2E8F0' },
  { ring: '#FACC15', fill: '#3B300A', glyph: '#FDE68A' },
  { ring: '#67E8F9', fill: '#0E2A33', glyph: '#CFFAFE' },
];

/** A pip not yet earned. */
export const LOCKED_PIP = '#3F3F46';

/** a → b by t (0..1), per channel, "#RRGGBB" in and out. */
export function mixHex(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, '0'));
  return `#${out.join('')}`.toUpperCase();
}

/** Level V: the coach's accent ring, a dark fill and a pale glyph of the same hue. */
export function coachTier(accent: string): TierColors {
  return { ring: accent, fill: mixHex(accent, '#000000', 0.78), glyph: mixHex(accent, '#FFFFFF', 0.45) };
}

export function tierColors(level: number, coachAccent: string): TierColors {
  const l = Math.max(0, Math.min(5, Math.round(level)));
  return l === 5 ? coachTier(coachAccent) : TIERS[l]!;
}

/** [col, row] of every filled cell, row by row. */
export function glyphCells(family: AchievementFamily): Array<[col: number, row: number]> {
  const cells: Array<[number, number]> = [];
  GLYPHS[family].forEach((row, r) => row.split('').forEach((ch, c) => {
    if (ch === '#') cells.push([c, r]);
  }));
  return cells;
}

/** The octagon (corners cut at 30% / 70%) inside a `size` box, inset by `inset` on every side. */
export function octagonPoints(inset: number, size = 100): string {
  const w = size - 2 * inset;
  const at = (f: number) => +(inset + w * f).toFixed(2);
  const corners: Array<[number, number]> = [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]];
  return corners.map(([x, y]) => `${at(x)},${at(y)}`).join(' ');
}
```

- [ ] **Step 4: Write `mobile/src/components/achievements/BadgeIcon.tsx`**

```tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import type { AchievementFamily } from '../../api/achievements';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { LOCKED_PIP, glyphCells, octagonPoints, tierColors } from '../../lib/badgeArt';
import { FAMILY_NAMES, numeral, tierName } from '../../lib/badges';
import { characterInfo } from '../characters/registry';

export interface BadgeIconProps {
  family: AchievementFamily;
  /** 0 (locked) .. 5. */
  level: number;
  size: number;
  /** The five level pips under the badge. */
  pips?: boolean;
  /** Level V's colour; the user's current coach accent when omitted. */
  coachAccent?: string;
  testID?: string;
}

// One badge (canvas Badge.dc.html): the tier-coloured octagon ring, its dark face, the family's
// 12×12 glyph in the middle 52%, and optionally five pips. Drawn on a 100-unit viewBox.
const VIEW = 100;
const GLYPH_BOX = 52;
const CELL = GLYPH_BOX / 12;
const ORIGIN = (VIEW - GLYPH_BOX) / 2;

export function BadgeIcon({ family, level, size, pips = true, coachAccent, testID = 'badge' }: BadgeIconProps) {
  const current = useCharacterOptional();
  const accent = coachAccent ?? characterInfo(current?.characterId).accent;
  const lv = Math.max(0, Math.min(5, Math.round(level)));
  const t = tierColors(lv, accent);
  const ring = lv === 5 ? 9 : 6;
  const pip = Math.max(4, Math.round(size * 0.07));
  const label = lv > 0 ? `${FAMILY_NAMES[family]}, level ${numeral(lv)}, ${tierName(lv)}` : `${FAMILY_NAMES[family]}, locked`;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, alignItems: 'center', gap: Math.round(size * 0.08) }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        <Polygon points={octagonPoints(0, VIEW)} fill={t.ring} />
        <Polygon points={octagonPoints(ring, VIEW)} fill={t.fill} />
        {glyphCells(family).map(([c, r]) => (
          <Rect key={`${c}-${r}`} x={ORIGIN + c * CELL} y={ORIGIN + r * CELL} width={CELL + 0.05} height={CELL + 0.05} fill={t.glyph} />
        ))}
      </Svg>
      {pips ? (
        <View testID={`${testID}-pips`} style={{ flexDirection: 'row', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} testID={`${testID}-pip-${i}`} style={{ width: pip, height: pip, backgroundColor: i <= lv ? t.ring : LOCKED_PIP }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/badgeArt.test.ts __tests__/components/BadgeIcon.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/badgeArt.ts mobile/src/components/achievements/BadgeIcon.tsx mobile/__tests__/lib/badgeArt.test.ts mobile/__tests__/components/BadgeIcon.test.tsx
git commit -m "feat(mobile): pixel badge with family glyphs, tier colours and the coach tier"
```

---

### Task 14: Profile Badges card

**Files:**
- Create: `mobile/src/components/achievements/BadgesCard.tsx`
- Modify: `mobile/src/screens/SettingsScreen.tsx` (imports; insert the card between the header `View` that holds the avatar and `<SettingsGroup label="Health data">`)
- Test: `mobile/__tests__/components/BadgesCard.test.tsx`, `mobile/__tests__/screens/SettingsBadges.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`useAchievements`, `refreshAchievements`, `resetAchievements`, `FAMILY_ORDER`, `FAMILY_NAMES`, `FAMILY_SHORT`, `TOTAL_LEVELS`, `earnedCount`, `nextUp`, `levelTitle`, `countLabel`, `numeral`, fixture); Task 13 (`BadgeIcon`, `tierColors`).
- Produces: `export function BadgesCard(props: { onSeeAll: () => void; onOpen: (family: AchievementFamily) => void }): JSX.Element | null`. testIDs `badges-card`, `badges-count`, `badges-see-all`, `badges-card-<FAMILY>`, `badges-card-<FAMILY>-icon`, `badges-card-<FAMILY>-label`, `badges-next-up`, `badges-next-up-count`, `badges-next-up-bar`. Routes `Badges` and `BadgeDetail` are registered in Task 15.

- [ ] **Step 1: Write the failing tests.** `mobile/__tests__/components/BadgesCard.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements, type AchievementFamily } from '../../src/api/achievements';
import { BadgesCard } from '../../src/components/achievements/BadgesCard';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { COLORS } from '../../src/theme';

jest.mock('../../src/api/achievements');
const load = fetchAchievements as jest.Mock;
const FAMILIES: AchievementFamily[] = ['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH'];
const CANVAS = achievementsFixture({
  SLEEP_GOAL: { level: 2, current: 9, best: 11 },
  STEADY_BEDTIME: { level: 3, current: 15 },
  STEP_GOAL: { level: 1, current: 5 },
  CHECK_IN: { level: 2, current: 16 },
  BEST_RECOVERY_WEEK: { level: 1, current: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
});

it('shows the seven badges at their levels, the count out of 35 and the family closest to its next level', async () => {
  load.mockResolvedValue(CANVAS);
  const onSeeAll = jest.fn();
  const onOpen = jest.fn();
  render(withCharacter(<BadgesCard onSeeAll={onSeeAll} onOpen={onOpen} />));

  expect(await screen.findByTestId('badges-count')).toHaveTextContent('BADGES · 9 OF 35');
  for (const f of FAMILIES) expect(screen.getByTestId(`badges-card-${f}`)).toBeTruthy();
  expect(screen.getByTestId('badges-card-SLEEP_GOAL-icon').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
  expect(screen.getByTestId('badges-card-SLEEP_GOAL-label')).toHaveStyle({ color: COLORS.light.foreground });
  expect(screen.getByTestId('badges-card-EVERY_DAY_LOGGED-label')).toHaveStyle({ color: COLORS.light.muted });
  expect(screen.getByTestId('badges-next-up')).toHaveTextContent('Next up: Step goal streak II');
  expect(screen.getByTestId('badges-next-up-count')).toHaveTextContent('5 / 7 days');
  expect(screen.getByTestId('badges-next-up-bar')).toHaveStyle({ width: '71%', backgroundColor: '#CBD5E1' });

  fireEvent.press(screen.getByTestId('badges-see-all'));
  expect(onSeeAll).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId('badges-card-CHECK_IN'));
  expect(onOpen).toHaveBeenCalledWith('CHECK_IN');
});

it('has no next-up row when every family is at the top level', async () => {
  load.mockResolvedValue(achievementsFixture(Object.fromEntries(FAMILIES.map((f) => [f, { level: 5 }])) as Partial<Record<AchievementFamily, { level: number }>>));
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  expect(await screen.findByTestId('badges-count')).toHaveTextContent('BADGES · 35 OF 35');
  expect(screen.queryByTestId('badges-next-up')).toBeNull();
});

it('stays hidden against a backend without badges (404) and on an error', async () => {
  load.mockResolvedValue(null);
  const first = render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();
  first.unmount();

  resetAchievements();
  load.mockRejectedValue(new Error('offline'));
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();
});
```

`mobile/__tests__/screens/SettingsBadges.test.tsx`:

```tsx
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { getTimezoneState } from '../../src/lib/timezone';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/achievements');

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'UTC', overridden: false });
});

it('shows the Badges card on Profile alongside Health data', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 1 } }));
  render(<SettingsScreen />);
  expect(await screen.findByTestId('badges-card')).toBeTruthy();
  expect(screen.getByTestId('badges-count')).toHaveTextContent('BADGES · 1 OF 35');
  expect(screen.getByTestId('connect-health-row')).toBeTruthy();
});

it('leaves the card out against a backend without badges (404)', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  render(<SettingsScreen />);
  await waitFor(() => expect(fetchAchievements).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();
  expect(screen.getByTestId('connect-health-row')).toBeTruthy();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/components/BadgesCard.test.tsx __tests__/screens/SettingsBadges.test.tsx`
Expected: FAIL — "Cannot find module '../../src/components/achievements/BadgesCard'".

- [ ] **Step 3: Write `mobile/src/components/achievements/BadgesCard.tsx`**

```tsx
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { AchievementFamily } from '../../api/achievements';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { refreshAchievements, useAchievements } from '../../lib/achievementsStore';
import { tierColors } from '../../lib/badgeArt';
import { FAMILY_NAMES, FAMILY_ORDER, FAMILY_SHORT, TOTAL_LEVELS, countLabel, earnedCount, levelTitle, nextUp, numeral } from '../../lib/badges';
import { COLORS } from '../../theme';
import { characterInfo } from '../characters/registry';
import { Card } from '../ui/card';
import { Text } from '../ui/text';
import { BadgeIcon } from './BadgeIcon';

export interface BadgesCardProps {
  onSeeAll: () => void;
  onOpen: (family: AchievementFamily) => void;
}

// Profile's Badges card (spec 2026-10-06 §6; canvas Profile.dc.html): the seven badges at their
// highest level (locked grey at 0), "BADGES · n OF 35", the family closest to its next level with
// a progress bar in that level's colour, and "See all". Nothing until loaded; hidden on a 404
// (a backend older than badges) and on an error.
export function BadgesCard({ onSeeAll, onOpen }: BadgesCardProps) {
  const { state } = useAchievements();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const accent = characterInfo(useCharacterOptional()?.characterId).accent;

  useEffect(() => {
    void refreshAchievements();
  }, []);

  if (state.status !== 'ready') return null;
  const a = state.data;
  const next = nextUp(a);
  return (
    <Card testID="badges-card" className="gap-3.5">
      <View className="flex-row items-center justify-between">
        <Text testID="badges-count" className="text-xs font-medium text-muted-foreground" style={{ letterSpacing: 2 }}>
          {`BADGES · ${earnedCount(a)} OF ${TOTAL_LEVELS}`}
        </Text>
        <Pressable testID="badges-see-all" accessibilityRole="button" hitSlop={10} onPress={onSeeAll}>
          <Text className="text-sm font-semibold text-accent">See all</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap" style={{ rowGap: 14 }}>
        {FAMILY_ORDER.map((family) => {
          const level = a.families.find((f) => f.family === family)?.level ?? 0;
          return (
            <Pressable
              key={family}
              testID={`badges-card-${family}`}
              accessibilityRole="button"
              accessibilityLabel={level > 0 ? `${FAMILY_NAMES[family]}, level ${numeral(level)}` : `${FAMILY_NAMES[family]}, locked`}
              onPress={() => onOpen(family)}
              style={{ width: '25%', alignItems: 'center', gap: 6 }}
            >
              <BadgeIcon family={family} level={level} size={58} testID={`badges-card-${family}-icon`} />
              <Text testID={`badges-card-${family}-label`} className="text-center" style={{ fontSize: 11, color: level > 0 ? colors.foreground : colors.muted }}>
                {FAMILY_SHORT[family]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {next ? (
        <View testID="badges-next-up" className="gap-2 border-t border-border pt-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-sm" numberOfLines={1}>
              <Text className="text-sm font-semibold">Next up: </Text>
              {levelTitle(next.family, next.nextLevel)}
            </Text>
            <Text testID="badges-next-up-count" className="text-sm text-muted-foreground">
              {`${Math.min(next.current, next.threshold)} / ${countLabel(next.family, next.threshold)}`}
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: colors.border }}>
            <View
              testID="badges-next-up-bar"
              style={{ width: `${Math.round(Math.min(1, next.current / next.threshold) * 100)}%`, height: 8, backgroundColor: tierColors(next.nextLevel, accent).ring }}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 4: Put the card on Profile.** In `mobile/src/screens/SettingsScreen.tsx` add the import:

```tsx
import { BadgesCard } from '../components/achievements/BadgesCard';
```

and insert, right after the closing `</View>` of the header block (the one ending with the email `Text`) and before the `{/* Connecting is a task reachable from a tab ...` comment:

```tsx
        {/* Badges (spec 2026-10-06 §6): between the header and Health data; hidden on a 404. */}
        <BadgesCard
          onSeeAll={() => navigation?.navigate('Badges' as never)}
          onOpen={(family) => (navigation as { navigate: (name: string, params: object) => void } | undefined)?.navigate('BadgeDetail', { family })}
        />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/components/BadgesCard.test.tsx __tests__/screens/SettingsBadges.test.tsx __tests__/screens/SettingsScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/achievements/BadgesCard.tsx mobile/src/screens/SettingsScreen.tsx mobile/__tests__/components/BadgesCard.test.tsx mobile/__tests__/screens/SettingsBadges.test.tsx
git commit -m "feat(mobile): Badges card on Profile with the next level to reach"
```

---

### Task 15: Badges screen and Badge detail

**Files:**
- Create: `mobile/src/screens/BadgesScreen.tsx`
- Create: `mobile/src/screens/BadgeDetailScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (imports, `RootStackParamList`, two `Stack.Screen` entries after `YearInPixels`)
- Test: `mobile/__tests__/screens/BadgesScreen.test.tsx`, `mobile/__tests__/screens/BadgeDetailScreen.test.tsx`, `mobile/__tests__/navigation/RootNavigator.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`useAchievements`, `refreshAchievements`, `getAchievementsSnapshot`, `resetAchievements`, `FAMILY_ORDER`, `FAMILY_NAMES`, `FAMILY_RULES`, `familyStatus`, `ladderRow`, `countLabel`, `numeral`, `tierName`, fixture); Task 13 (`BadgeIcon`, `tierColors`); `pixelFont` from `mobile/src/components/coach/thinking/shared`.
- Produces: `BadgesScreen`, `BadgeDetailScreen`; routes `Badges: undefined` and `BadgeDetail: { family: AchievementFamily }` in `RootStackParamList`. testIDs `badges-row-<FAMILY>`, `badges-row-<FAMILY>-status`, `badges-loading`, `badges-unavailable`, `badges-error`, `badges-retry`, `badge-detail-icon`, `badge-detail-title`, `badge-detail-current`, `badge-detail-best`, `badge-detail-level-<n>`, `badge-detail-level-<n>-icon|-sub|-tag`, `badge-detail-loading`, `badge-detail-missing`.

- [ ] **Step 1: Write the failing tests.** `mobile/__tests__/screens/BadgesScreen.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { BadgesScreen } from '../../src/screens/BadgesScreen';

jest.mock('../../src/api/achievements');
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
const load = fetchAchievements as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
});

it('lists the seven families with their rule and status, and opens one', async () => {
  load.mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 2, current: 9 } }));
  render(withCharacter(<BadgesScreen />));
  expect(await screen.findByTestId('badges-row-SLEEP_GOAL-status')).toHaveTextContent('Level II · Silver · 9 / 14 nights');
  expect(screen.getByTestId('badges-row-EVERY_DAY_LOGGED-status')).toHaveTextContent('Not yet · 0 / 1 month');
  expect(screen.getByTestId('badges-row-STEP_GOAL')).toHaveTextContent('Finished days in a row at 10,000 steps');
  fireEvent.press(screen.getByTestId('badges-row-CHECK_IN'));
  expect(mockNavigate).toHaveBeenCalledWith('BadgeDetail', { family: 'CHECK_IN' });
});

it('says badges are not available against an old backend, and offers a retry after an error', async () => {
  load.mockResolvedValue(null);
  const first = render(withCharacter(<BadgesScreen />));
  expect(await screen.findByTestId('badges-unavailable')).toBeTruthy();
  first.unmount();

  resetAchievements();
  load.mockRejectedValueOnce(new Error('offline'));
  render(withCharacter(<BadgesScreen />));
  expect(await screen.findByTestId('badges-error')).toBeTruthy();
  load.mockResolvedValue(achievementsFixture());
  await act(async () => fireEvent.press(screen.getByTestId('badges-retry')));
  expect(await screen.findByTestId('badges-row-SLEEP_GOAL')).toBeTruthy();
});
```

`mobile/__tests__/screens/BadgeDetailScreen.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { BadgeDetailScreen } from '../../src/screens/BadgeDetailScreen';

jest.mock('../../src/api/achievements');
let mockParams: { family: string } = { family: 'SLEEP_GOAL' };
jest.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: mockParams }) }));
const load = fetchAchievements as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
});

it('shows the big badge, current and best, and the ladder of five levels', async () => {
  mockParams = { family: 'SLEEP_GOAL' };
  load.mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, current: 9, best: 11, levels: [{ level: 1, value: 3, earnedOn: '2026-10-08' }, { level: 2, value: 7, earnedOn: '2026-10-12' }] },
  }));
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-title')).toHaveTextContent('SLEEP GOAL STREAK');
  expect(screen.getByTestId('badge-detail-icon').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
  expect(screen.getByTestId('badge-detail-current')).toHaveTextContent('CURRENT STREAK9 nights');
  expect(screen.getByTestId('badge-detail-best')).toHaveTextContent('BEST STREAK11 nights');
  expect(screen.getByTestId('badge-detail-level-1')).toHaveTextContent('Level I · Bronze · 3 nights');
  expect(screen.getByTestId('badge-detail-level-1-sub')).toHaveTextContent('Earned Oct 8');
  expect(screen.getByTestId('badge-detail-level-1-tag')).toHaveTextContent('EARNED');
  expect(screen.getByTestId('badge-detail-level-3-sub')).toHaveTextContent('5 more nights in a row');
  expect(screen.getByTestId('badge-detail-level-3-tag')).toHaveTextContent('NEXT');
  expect(screen.getByTestId('badge-detail-level-3-icon').props.accessibilityLabel).toBe('Sleep goal streak, locked');
  expect(screen.getByTestId('badge-detail-level-5')).toHaveTextContent('Level V · Coach · 100 nights');
  expect(screen.getByTestId('badge-detail-level-5-sub')).toHaveTextContent('Locked');
  expect(screen.queryByTestId('badge-detail-level-5-tag')).toBeNull();
});

it('shows a monthly family as one month count', async () => {
  mockParams = { family: 'EVERY_DAY_LOGGED' };
  load.mockResolvedValue(achievementsFixture({ EVERY_DAY_LOGGED: { level: 1, current: 2, best: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] } }));
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-current')).toHaveTextContent('MONTHS SO FAR2 months');
  expect(screen.queryByTestId('badge-detail-best')).toBeNull();
  expect(screen.getByTestId('badge-detail-level-2-sub')).toHaveTextContent('1 more month');
});

it('says the badge is not available against an old backend', async () => {
  load.mockResolvedValue(null);
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-missing')).toBeTruthy();
});
```

Add to `mobile/__tests__/navigation/RootNavigator.test.tsx`, inside `describe('RootNavigator', ...)`:

```tsx
  it('registers the Badges and BadgeDetail routes', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockRegisteredScreens).toEqual(expect.arrayContaining(['Badges', 'BadgeDetail']));
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/screens/BadgesScreen.test.tsx __tests__/screens/BadgeDetailScreen.test.tsx __tests__/navigation/RootNavigator.test.tsx`
Expected: FAIL — "Cannot find module '../../src/screens/BadgesScreen'", and the routes are not registered.

- [ ] **Step 3: Write `mobile/src/screens/BadgesScreen.tsx`**

```tsx
import React, { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BadgeIcon } from '../components/achievements/BadgeIcon';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { refreshAchievements, useAchievements } from '../lib/achievementsStore';
import { FAMILY_NAMES, FAMILY_ORDER, FAMILY_RULES, familyStatus } from '../lib/badges';

// Profile → "See all" (spec 2026-10-06 §6; canvas Main.dc.html): every family at its level with
// its rule and progress; a tap opens the badge's detail.
export function BadgesScreen() {
  const navigation = useNavigation<any>();
  const { state } = useAchievements();

  useEffect(() => {
    void refreshAchievements();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 12, padding: 20 }}>
        <Text className="text-sm text-muted-foreground">Seven families, five levels each. Levels are never taken away.</Text>
        {state.status === 'idle' ? <Skeleton testID="badges-loading" className="h-64 w-full rounded-card" /> : null}
        {state.status === 'unavailable' ? (
          <Card testID="badges-unavailable">
            <Text className="text-base">Badges aren't available yet.</Text>
          </Card>
        ) : null}
        {state.status === 'error' ? (
          <Card testID="badges-error" className="gap-3">
            <Text className="text-sm text-muted-foreground">Your badges could not be loaded.</Text>
            <Button testID="badges-retry" variant="secondary" size="sm" onPress={() => void refreshAchievements()}>
              Try again
            </Button>
          </Card>
        ) : null}
        {state.status === 'ready'
          ? FAMILY_ORDER.map((family) => {
              const f = state.data.families.find((x) => x.family === family);
              if (!f) return null;
              return (
                <Pressable
                  key={family}
                  testID={`badges-row-${family}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${FAMILY_NAMES[family]}. ${familyStatus(f)}`}
                  onPress={() => navigation.navigate('BadgeDetail', { family })}
                  className="flex-row items-center gap-4 rounded-card border border-border bg-card p-4 active:opacity-70"
                >
                  <BadgeIcon family={family} level={f.level} size={68} testID={`badges-row-${family}-icon`} />
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-semibold">{FAMILY_NAMES[family]}</Text>
                    <Text className="text-sm text-muted-foreground">{FAMILY_RULES[family]}</Text>
                    <Text testID={`badges-row-${family}-status`} className="text-xs text-muted-foreground">{familyStatus(f)}</Text>
                  </View>
                </Pressable>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Write `mobile/src/screens/BadgeDetailScreen.tsx`**

```tsx
import React, { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { AchievementFamily } from '../api/achievements';
import { useCharacterOptional } from '../characters/CharacterContext';
import { BadgeIcon } from '../components/achievements/BadgeIcon';
import { characterInfo } from '../components/characters/registry';
import { pixelFont } from '../components/coach/thinking/shared';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { getAchievementsSnapshot, refreshAchievements, useAchievements } from '../lib/achievementsStore';
import { tierColors } from '../lib/badgeArt';
import { FAMILY_NAMES, FAMILY_RULES, countLabel, ladderRow, numeral, tierName } from '../lib/badges';

// Badge detail (spec 2026-10-06 §6; canvas BadgeDetail.dc.html): the big badge, current and best
// (one month count for a monthly family), and the ladder of five levels — earned with its date,
// the next one with what is left, the rest locked.
export function BadgeDetailScreen() {
  const { params } = useRoute<any>() as { params: { family: AchievementFamily } };
  const { state } = useAchievements();
  const accent = characterInfo(useCharacterOptional()?.characterId).accent;

  useEffect(() => {
    if (getAchievementsSnapshot().state.status === 'idle') void refreshAchievements();
  }, []);

  const f = state.status === 'ready' ? state.data.families.find((x) => x.family === params.family) : undefined;
  if (!f) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View style={{ padding: 20 }}>
          {state.status === 'idle' ? (
            <Skeleton testID="badge-detail-loading" className="h-64 w-full rounded-card" />
          ) : (
            <Text testID="badge-detail-missing" className="text-base">This badge isn't available.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const cards = f.kind === 'streak'
    ? [
        { key: 'current', label: 'CURRENT STREAK', value: countLabel(f.family, f.current) },
        { key: 'best', label: 'BEST STREAK', value: countLabel(f.family, f.best) },
      ]
    : [{ key: 'current', label: 'MONTHS SO FAR', value: countLabel(f.family, f.current) }];
  const keep = f.kind === 'streak' ? 'Levels stay yours even if a streak breaks.' : 'Levels are never taken away.';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 18, padding: 20 }}>
        <View className="items-center gap-3">
          <BadgeIcon family={f.family} level={f.level} size={140} pips={false} testID="badge-detail-icon" />
          <Text testID="badge-detail-title" className="text-center" style={{ fontFamily: pixelFont(), fontSize: 22 }}>
            {FAMILY_NAMES[f.family].toUpperCase()}
          </Text>
          <Text className="text-center text-sm text-muted-foreground" style={{ maxWidth: 290, lineHeight: 20 }}>
            {`${FAMILY_RULES[f.family]}. ${keep}`}
          </Text>
        </View>
        <View className="flex-row gap-2.5">
          {cards.map((c) => (
            <Card key={c.key} testID={`badge-detail-${c.key}`} className="flex-1 gap-1">
              <Text className="text-muted-foreground" style={{ fontSize: 11, letterSpacing: 1.5 }}>{c.label}</Text>
              <Text className="font-bold" style={{ fontSize: 28 }}>{c.value}</Text>
            </Card>
          ))}
        </View>
        <View>
          {[1, 2, 3, 4, 5].map((level) => {
            const row = ladderRow(f, level);
            const threshold = f.thresholds[level - 1] ?? 0;
            return (
              <View key={level} testID={`badge-detail-level-${level}`} className="flex-row items-center gap-3.5 border-b border-border py-2">
                <BadgeIcon family={f.family} level={row.earned ? level : 0} size={44} pips={false} testID={`badge-detail-level-${level}-icon`} />
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold">{`Level ${numeral(level)} · ${tierName(level)} · ${countLabel(f.family, threshold)}`}</Text>
                  <Text testID={`badge-detail-level-${level}-sub`} className="text-sm text-muted-foreground">{row.text}</Text>
                </View>
                {row.tag ? (
                  <Text testID={`badge-detail-level-${level}-tag`} style={{ fontSize: 11, letterSpacing: 1, color: tierColors(level, accent).ring }}>
                    {row.tag}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Register the routes** in `mobile/src/navigation/RootNavigator.tsx`. Add imports:

```tsx
import type { AchievementFamily } from '../api/achievements';
import { BadgesScreen } from '../screens/BadgesScreen';
import { BadgeDetailScreen } from '../screens/BadgeDetailScreen';
```

add to `RootStackParamList` after `YearInPixels: undefined;`:

```tsx
  // Profile → Badges card "See all": every family at its level.
  Badges: undefined;
  // One badge: the big badge, current and best, the ladder of five levels.
  BadgeDetail: { family: AchievementFamily };
```

and after the `YearInPixels` `Stack.Screen`:

```tsx
              <Stack.Screen name="Badges" component={BadgesScreen} options={{ title: 'Badges' }} />
              <Stack.Screen name="BadgeDetail" component={BadgeDetailScreen} options={{ title: '' }} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/screens/BadgesScreen.test.tsx __tests__/screens/BadgeDetailScreen.test.tsx __tests__/navigation`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/BadgesScreen.tsx mobile/src/screens/BadgeDetailScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/screens/BadgesScreen.test.tsx mobile/__tests__/screens/BadgeDetailScreen.test.tsx mobile/__tests__/navigation/RootNavigator.test.tsx
git commit -m "feat(mobile): Badges screen and badge detail with the level ladder"
```

---

### Task 16: Unlock celebration, its queue and sharing

**Files:**
- Create: `mobile/src/lib/celebrationQueue.ts`
- Create: `mobile/src/components/achievements/BadgeShareCard.tsx`
- Create: `mobile/src/components/achievements/CelebrationModal.tsx`
- Create: `mobile/src/components/achievements/CelebrationHost.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (import; render `<CelebrationHost />` right after `</Stack.Navigator>`, inside `SyncProvider`)
- Modify: `mobile/src/components/habit-log-card.tsx` (`checkIn`: refresh badges after a saved check-in)
- Test: `mobile/__tests__/lib/celebrationQueue.test.ts`, `mobile/__tests__/components/CelebrationModal.test.tsx`, `mobile/__tests__/components/CelebrationHost.test.tsx`, `mobile/__tests__/components/HabitLogCard.test.tsx`, `mobile/__tests__/navigation/RootNavigator.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`UncelebratedLevel`, `useAchievements`, `refreshAchievements`, `resetAchievements`, `pendingLevels`, `celebrate`, `FAMILY_ORDER`, `levelTitle`, `valueLine`, `coachLine`, fixture); Task 13 (`BadgeIcon`, `tierColors`, `mixHex`, `LOCKED_PIP`); `useRecapExport` (`mobile/src/lib/useRecapExport.ts`), `EXPORT_PIXELS`, `APP_NAME` (`mobile/src/lib/recapShare.ts`); `Character`; `hexAlpha`; `pixelFont`.
- Produces:

```ts
// lib/celebrationQueue.ts
export interface Celebration { family: AchievementFamily; level: number; value: number; earnedOn: string; ids: string[] }
export function celebrationQueue(pending: readonly UncelebratedLevel[]): Celebration[];
// components/achievements/BadgeShareCard.tsx
export const BADGE_SHARE_SIZE = 360;
export function badgeShareLayout(pixelRatio: number): { width: number; height: number; scale: number };
export function BadgeShareCard(props: { family: AchievementFamily; level: number; value: number; coachAccent: string; scale: number }): JSX.Element;
// components/achievements/CelebrationModal.tsx
export function CelebrationModal(props: { celebration: Celebration; thresholds: readonly number[]; onDone: () => void }): JSX.Element;
// components/achievements/CelebrationHost.tsx
export function CelebrationHost(): JSX.Element | null;
```

testIDs: `celebration-screen`, `celebration-confetti`, `celebration-badge`, `celebration-coach`, `celebration-pips`, `celebration-title`, `celebration-value`, `celebration-coach-line`, `celebration-share`, `celebration-done`, `celebration-export`, `badge-share-card`, `badge-share-app`.

- [ ] **Step 1: Write the failing tests.** `mobile/__tests__/lib/celebrationQueue.test.ts`:

```ts
import { celebrationQueue } from '../../src/lib/celebrationQueue';

it('celebrates each family once, at its highest new level, highest levels first', () => {
  expect(celebrationQueue([
    { id: 'c1', family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07' },
    { id: 's1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' },
    { id: 's2', family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07' },
    { id: 'm1', family: 'EVERY_DAY_LOGGED', level: 1, value: 1, earnedOn: '2026-09-30' },
  ])).toEqual([
    { family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07', ids: ['s1', 's2'] },
    { family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07', ids: ['c1'] },
    { family: 'EVERY_DAY_LOGGED', level: 1, value: 1, earnedOn: '2026-09-30', ids: ['m1'] },
  ]);
  expect(celebrationQueue([])).toEqual([]);
});
```

`mobile/__tests__/components/CelebrationModal.test.tsx`:

```tsx
import React from 'react';
import { PixelRatio } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { HIDDEN_OK, withCharacter } from '../../jest-mocks/characterContext';
import { CelebrationModal } from '../../src/components/achievements/CelebrationModal';
import { captureToPng, shareImage } from '../../src/lib/recapCapture';

jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReduceMotion };
});

const GOLD = { family: 'SLEEP_GOAL' as const, level: 3, value: 14, earnedOn: '2026-10-14', ids: ['s3'] };
const THRESHOLDS = [3, 7, 14, 30, 100];

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
});
afterEach(() => jest.restoreAllMocks());

it('shows the new level with the coach, its value, the coach line and confetti', () => {
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.getByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK III');
  expect(screen.getByTestId('celebration-value')).toHaveTextContent('14 nights in a row at your sleep goal.');
  expect(screen.getByTestId('celebration-coach-line')).toHaveTextContent('16 more nights for Diamond');
  expect(screen.getByTestId('celebration-badge').props.accessibilityLabel).toBe('Sleep goal streak, level III, Gold');
  expect(screen.getByTestId('celebration-coach', HIDDEN_OK)).toBeTruthy();
  expect(screen.getByTestId('celebration-confetti', HIDDEN_OK)).toBeTruthy();
});

it('says "Top level!" at level V', () => {
  render(withCharacter(<CelebrationModal celebration={{ ...GOLD, level: 5, value: 100 }} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.getByTestId('celebration-coach-line')).toHaveTextContent('Top level!');
});

it('draws no confetti under Reduce Motion', () => {
  mockReduceMotion = true;
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.queryByTestId('celebration-confetti', HIDDEN_OK)).toBeNull();
});

it('closes with "Nice!"', () => {
  const onDone = jest.fn();
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={onDone} />));
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('shares a 1080 px badge card through the recap export pipeline', async () => {
  jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
  (captureToPng as jest.Mock).mockResolvedValue('file:///cache/recap-1.png');
  (shareImage as jest.Mock).mockResolvedValue(undefined);
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.getByTestId('celebration-export', HIDDEN_OK)).toHaveStyle({ width: 360, height: 360 });
  expect(screen.getByTestId('badge-share-card', HIDDEN_OK)).toHaveTextContent(/SLEEP GOAL STREAK III/);
  expect(screen.getByTestId('badge-share-app', HIDDEN_OK)).toHaveTextContent('Biometrics');
  fireEvent.press(screen.getByTestId('celebration-share'));
  await waitFor(() => expect(shareImage).toHaveBeenCalledWith('file:///cache/recap-1.png'));
});
```

`mobile/__tests__/components/CelebrationHost.test.tsx`:

```tsx
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements, markCelebrated } from '../../src/api/achievements';
import { CelebrationHost } from '../../src/components/achievements/CelebrationHost';
import { resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
const load = fetchAchievements as jest.Mock;
const post = markCelebrated as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  post.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

it('celebrates one family at a time, highest level first, and marks each family celebrated on close', async () => {
  load.mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 2 }, CHECK_IN: { level: 1 } }, {
    uncelebrated: [
      { id: 's1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' },
      { id: 's2', family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07' },
      { id: 'c1', family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07' },
    ],
  }));
  render(withCharacter(<CelebrationHost />));

  expect(await screen.findByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK II');
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(post).toHaveBeenCalledWith(['s1', 's2']);
  await waitFor(() => expect(screen.getByTestId('celebration-title')).toHaveTextContent('DAILY CHECK-IN I'));
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(post).toHaveBeenLastCalledWith(['c1']);
  await waitFor(() => expect(screen.queryByTestId('celebration-title')).toBeNull());
});

it('checks again when the app comes back to the foreground', async () => {
  const listeners: Array<(state: string) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: jest.fn() };
  }) as never);
  load.mockResolvedValue(achievementsFixture());
  render(withCharacter(<CelebrationHost />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('celebration-title')).toBeNull();

  load.mockResolvedValue(achievementsFixture({ STEP_GOAL: { level: 1 } }, { uncelebrated: [{ id: 'p1', family: 'STEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-09' }] }));
  await act(async () => listeners.forEach((l) => l('active')));
  expect(await screen.findByTestId('celebration-title')).toHaveTextContent('STEP GOAL STREAK I');
});

it('shows nothing against a backend without badges (404)', async () => {
  load.mockResolvedValue(null);
  render(withCharacter(<CelebrationHost />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByTestId('celebration-screen')).toBeNull();
});
```

In `mobile/__tests__/components/HabitLogCard.test.tsx` add the imports and mock:

```tsx
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
```

and append:

```tsx
it('re-checks badges right after a check-in is saved, so a celebration can follow', async () => {
  resetAchievements();
  loadWith();
  (createCheckIn as jest.Mock).mockResolvedValue({ habitDay: '2026-09-20' });
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  const { getByTestId, findByTestId } = render(<HabitLogCard />);
  await findByTestId('nothing-today-button');
  expect(fetchAchievements).not.toHaveBeenCalled();
  fireEvent.press(getByTestId('nothing-today-button'));
  await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(1));
});
```

In `mobile/__tests__/navigation/RootNavigator.test.tsx`, add inside `describe('RootNavigator', ...)`:

```tsx
  it('checks for new badges to celebrate once signed in', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/achievements'));
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/celebrationQueue.test.ts __tests__/components/CelebrationModal.test.tsx __tests__/components/CelebrationHost.test.tsx __tests__/components/HabitLogCard.test.tsx __tests__/navigation/RootNavigator.test.tsx`
Expected: FAIL — "Cannot find module '../../src/lib/celebrationQueue'"; the check-in does not fetch badges; the navigator never asks for them.

- [ ] **Step 3: Write `mobile/src/lib/celebrationQueue.ts`**

```ts
import type { AchievementFamily, UncelebratedLevel } from '../api/achievements';
import { FAMILY_ORDER } from './badges';

// The unlock celebrations (spec 2026-10-06 §6): one per family, at its highest new level, highest
// levels first (catalogue order on a tie). Closing one marks all of that family's new levels
// celebrated, lower ones included.

export interface Celebration {
  family: AchievementFamily;
  level: number;
  value: number;
  earnedOn: string;
  /** Every new level of the family: all are marked celebrated together. */
  ids: string[];
}

export function celebrationQueue(pending: readonly UncelebratedLevel[]): Celebration[] {
  const byFamily = new Map<AchievementFamily, UncelebratedLevel[]>();
  for (const level of pending) byFamily.set(level.family, [...(byFamily.get(level.family) ?? []), level]);
  return [...byFamily.entries()]
    .map(([family, rows]): Celebration => {
      const top = rows.reduce((a, b) => (b.level > a.level ? b : a));
      return { family, level: top.level, value: top.value, earnedOn: top.earnedOn, ids: rows.map((r) => r.id) };
    })
    .sort((a, b) => b.level - a.level || FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));
}
```

- [ ] **Step 4: Write `mobile/src/components/achievements/BadgeShareCard.tsx`**

```tsx
import React from 'react';
import { View } from 'react-native';
import type { AchievementFamily } from '../../api/achievements';
import { mixHex, tierColors } from '../../lib/badgeArt';
import { levelTitle, valueLine } from '../../lib/badges';
import { APP_NAME, EXPORT_PIXELS } from '../../lib/recapShare';
import { FONTS } from '../../theme';
import { pixelFont } from '../coach/thinking/shared';
import { Text } from '../ui/text';
import { BadgeIcon } from './BadgeIcon';

// The celebration's share image (spec 2026-10-06 §6): a square 360-unit design × scale, captured
// at 1080 px through the recap export pipeline. The app name only, never a name or email.
export const BADGE_SHARE_SIZE = 360;

/** Laid out 1080 / pixelRatio points wide, so the capture is 1080×1080 px on any device. */
export function badgeShareLayout(pixelRatio: number): { width: number; height: number; scale: number } {
  const width = EXPORT_PIXELS / pixelRatio;
  return { width, height: width, scale: width / BADGE_SHARE_SIZE };
}

export interface BadgeShareCardProps { family: AchievementFamily; level: number; value: number; coachAccent: string; scale: number }

export function BadgeShareCard({ family, level, value, coachAccent, scale }: BadgeShareCardProps) {
  const u = (n: number) => n * scale;
  const t = tierColors(level, coachAccent);
  const pixel = pixelFont();
  return (
    <View
      testID="badge-share-card"
      style={{ width: u(BADGE_SHARE_SIZE), height: u(BADGE_SHARE_SIZE), backgroundColor: mixHex(t.ring, '#0B0B0F', 0.9), alignItems: 'center', justifyContent: 'center', gap: u(14), padding: u(24) }}
    >
      <BadgeIcon family={family} level={level} size={u(150)} coachAccent={coachAccent} testID="badge-share-icon" />
      <Text style={{ fontFamily: pixel, fontSize: u(20), lineHeight: u(24), color: '#FAFAF9', textAlign: 'center' }}>{levelTitle(family, level).toUpperCase()}</Text>
      <Text style={{ fontFamily: FONTS.sans, fontSize: u(14), lineHeight: u(20), color: t.glyph, textAlign: 'center' }}>{valueLine(family, value)}</Text>
      <Text testID="badge-share-app" style={{ fontFamily: pixel, fontSize: u(12), lineHeight: u(16), color: t.ring }}>{APP_NAME}</Text>
    </View>
  );
}
```

- [ ] **Step 5: Write `mobile/src/components/achievements/CelebrationModal.tsx`**

```tsx
import React from 'react';
import { Modal, PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { LOCKED_PIP, mixHex, tierColors } from '../../lib/badgeArt';
import { coachLine, levelTitle, valueLine } from '../../lib/badges';
import type { Celebration } from '../../lib/celebrationQueue';
import { useRecapExport } from '../../lib/useRecapExport';
import { FONTS } from '../../theme';
import { Character } from '../characters/Character';
import { hexAlpha } from '../characters/palette';
import { characterInfo } from '../characters/registry';
import { DEFAULT_CHARACTER_ID } from '../characters/types';
import { pixelFont } from '../coach/thinking/shared';
import { Text } from '../ui/text';
import { BadgeIcon } from './BadgeIcon';
import { BadgeShareCard, badgeShareLayout } from './BadgeShareCard';

export interface CelebrationModalProps {
  celebration: Celebration;
  thresholds: readonly number[];
  onDone: () => void;
}

// Pixel confetti from the canvas (Unlock.dc.html): fixed spots and colours. None under Reduce Motion.
const CONFETTI: ReadonlyArray<readonly [number, number]> = [[40, 120], [320, 96], [70, 300], [330, 260], [24, 210], [350, 180], [110, 70], [270, 60], [56, 420], [338, 400], [190, 40], [300, 340]];
const CONFETTI_COLORS = ['#FACC15', '#F9A8D4', '#5EEAD4', '#FDE68A', '#FDBA74'];
const INK = '#FAFAF9';

// The unlock celebration (spec 2026-10-06 §6; canvas Unlock.dc.html): full screen, on a ground
// tinted by the new tier — the badge with the coach beside it, the level pips, the level name and
// value, the coach's fixed line, Share (a 1080 px badge card) and "Nice!", which closes it.
export function CelebrationModal({ celebration, thresholds, onDone }: CelebrationModalProps) {
  const reduceMotion = useReducedMotion();
  const characterId = useCharacterOptional()?.characterId ?? DEFAULT_CHARACTER_ID;
  const accent = characterInfo(characterId).accent;
  const { family, level, value } = celebration;
  const t = tierColors(level, accent);
  const ground = mixHex(t.ring, '#0B0B0F', 0.9);
  const pixel = pixelFont();
  const { exportRef, busy, share } = useRecapExport();
  const layout = badgeShareLayout(PixelRatio.get());

  return (
    <Modal visible transparent={false} animationType={reduceMotion ? 'none' : 'fade'} presentationStyle="fullScreen" onRequestClose={onDone}>
      <View testID="celebration-screen" style={{ flex: 1, backgroundColor: ground }}>
        {reduceMotion ? null : (
          <View testID="celebration-confetti" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            {CONFETTI.map(([x, y], i) => (
              <View key={i} style={{ position: 'absolute', left: x, top: y, width: i % 3 ? 6 : 9, height: i % 3 ? 6 : 9, backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length], opacity: 0.85 }} />
            ))}
          </View>
        )}
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, alignItems: 'center', gap: 18, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 }}>
            <Text style={{ fontFamily: pixel, fontSize: 14, letterSpacing: 2, color: t.ring }}>NEW BADGE LEVEL</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }}>
              <BadgeIcon testID="celebration-badge" family={family} level={level} size={190} pips={false} coachAccent={accent} />
              <View testID="celebration-coach" style={{ marginLeft: -40, marginBottom: -10 }}>
                <Character characterId={characterId} mood="idle" size={86} />
              </View>
            </View>
            <View testID="celebration-pips" style={{ flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={{ width: 12, height: 12, backgroundColor: i <= level ? t.ring : LOCKED_PIP }} />
              ))}
            </View>
            <Text testID="celebration-title" style={{ fontFamily: pixel, fontSize: 26, lineHeight: 30, textAlign: 'center', color: INK }}>
              {levelTitle(family, level).toUpperCase()}
            </Text>
            <Text testID="celebration-value" style={{ fontFamily: FONTS.sans, fontSize: 17, lineHeight: 24, textAlign: 'center', color: t.glyph }}>
              {valueLine(family, value)}
            </Text>
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: hexAlpha(t.ring, 0.3), backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 }}>
              <Character characterId={characterId} mood="idle" size={36} />
              <Text testID="celebration-coach-line" style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 15, lineHeight: 21, color: INK }}>
                {coachLine(family, level, thresholds)}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
              <Pressable
                testID="celebration-share"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void share()}
                style={{ flex: 1, height: 52, borderRadius: 26, borderWidth: 1, borderColor: hexAlpha(t.ring, 0.5), alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: FONTS.sansSemibold, fontSize: 16, color: INK }}>Share</Text>
              </Pressable>
              <Pressable
                testID="celebration-done"
                accessibilityRole="button"
                onPress={onDone}
                style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: t.ring, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONTS.sansBold, fontSize: 16, color: ground }}>Nice!</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
        {/* The export view: off screen at a fixed size, the only thing captured. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
          <View ref={exportRef} collapsable={false} testID="celebration-export" style={{ width: layout.width, height: layout.height }}>
            <BadgeShareCard family={family} level={level} value={value} coachAccent={accent} scale={layout.scale} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 6: Write `mobile/src/components/achievements/CelebrationHost.tsx`**

```tsx
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { celebrate, pendingLevels, refreshAchievements, resetAchievements, useAchievements } from '../../lib/achievementsStore';
import { celebrationQueue } from '../../lib/celebrationQueue';
import { CelebrationModal } from './CelebrationModal';

// Shows new badge levels once (spec 2026-10-06 §6): checks on app start (mount), on every return to
// the foreground, and whenever a screen refreshes the store (a saved check-in does). One modal per
// family, highest level first; closing it marks that family's new levels celebrated. Mounted once
// inside the signed-in navigator, so signing out unmounts it and forgets everything.
export function CelebrationHost() {
  const snapshot = useAchievements();

  useEffect(() => {
    void refreshAchievements();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAchievements();
    });
    return () => {
      sub.remove();
      resetAchievements();
    };
  }, []);

  if (snapshot.state.status !== 'ready') return null;
  const next = celebrationQueue(pendingLevels(snapshot))[0];
  if (!next) return null;
  const thresholds = snapshot.state.data.families.find((f) => f.family === next.family)?.thresholds ?? [];
  return <CelebrationModal key={`${next.family}-${next.level}`} celebration={next} thresholds={thresholds} onDone={() => void celebrate(next.ids)} />;
}
```

- [ ] **Step 7: Mount the host and refresh after a check-in.** In `mobile/src/navigation/RootNavigator.tsx` add `import { CelebrationHost } from '../components/achievements/CelebrationHost';` and, right after `</Stack.Navigator>` (still inside `<SyncProvider>`), add:

```tsx
            {/* New badge levels, celebrated once (start, foreground, after a check-in). */}
            <CelebrationHost />
```

In `mobile/src/components/habit-log-card.tsx` add `import { refreshAchievements } from '../lib/achievementsStore';` and, in `checkIn`, right after the `setStatus(withCheckIn(...))` line inside `try`, add:

```tsx
      // A check-in can complete a badge level: the host celebrates it straight away.
      void refreshAchievements();
```

- [ ] **Step 8: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/celebrationQueue.test.ts __tests__/components/CelebrationModal.test.tsx __tests__/components/CelebrationHost.test.tsx __tests__/components/HabitLogCard.test.tsx __tests__/navigation __tests__/screens/DashboardScreen.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add mobile/src/lib/celebrationQueue.ts mobile/src/components/achievements/BadgeShareCard.tsx mobile/src/components/achievements/CelebrationModal.tsx mobile/src/components/achievements/CelebrationHost.tsx mobile/src/navigation/RootNavigator.tsx mobile/src/components/habit-log-card.tsx mobile/__tests__/lib/celebrationQueue.test.ts mobile/__tests__/components/CelebrationModal.test.tsx mobile/__tests__/components/CelebrationHost.test.tsx mobile/__tests__/components/HabitLogCard.test.tsx mobile/__tests__/navigation/RootNavigator.test.tsx
git commit -m "feat(mobile): celebrate new badge levels once, with a shareable badge card"
```

---
### Task 17: "Badges this week" on story frame 3

**Files:**
- Create: `mobile/src/lib/useEarnedBadges.ts`
- Modify: `mobile/src/lib/recapShare.ts` (`IncludeKey`, `FORMAT_INCLUDES.story`, `INCLUDE_LABELS`, `ALL_KEYS`)
- Modify: `mobile/src/lib/recapPrefs.ts` (`KEYS`)
- Modify: `mobile/src/components/recap/WeeklyStoryView.tsx` (imports, constants, `WeeklyStoryFrameProps`, `WeeklyStoryFrame`, `coachStoryFit`, `CoachStoryBody`)
- Modify: `mobile/src/screens/RecapStoryScreen.tsx` (`StoryViewer`: both `WeeklyStoryFrame` usages)
- Modify: `mobile/src/screens/RecapBuilderScreen.tsx` (`renderView`'s `WeeklyStoryFrame`)
- Test: `mobile/__tests__/lib/recapShare.test.ts`, `mobile/__tests__/components/RecapShareViews.test.tsx`, `mobile/__tests__/screens/RecapStoryScreen.test.tsx`, `mobile/__tests__/screens/RecapBuilderBadges.test.tsx`, `mobile/__tests__/screens/RecapBuilderScreen.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`useAchievements`, `getAchievementsSnapshot`, `refreshAchievements`, `resetAchievements`, `levelsEarnedBetween`, `BadgeRef`, `shortLevelTitle`, fixture); Task 13 (`BadgeIcon`).
- Produces:

```ts
// lib/useEarnedBadges.ts
export function useEarnedBadges(from: string, to: string, kind?: FamilyKind): BadgeRef[];
// lib/recapShare.ts (extended)
export type IncludeKey = 'avgSleep' | 'streak' | 'bestRecovery' | 'steps' | 'bestNight' | 'quote' | 'coach' | 'count' | 'badges';
// FORMAT_INCLUDES.story = ['bestNight', 'quote', 'coach', 'badges']; INCLUDE_LABELS.badges = 'Badges this week'; on by default
// components/recap/WeeklyStoryView.tsx
export const BADGE_CARD_HEIGHT: number;                       // design units
export interface WeeklyStoryFrameProps { /* existing props */ badges?: readonly BadgeRef[] }
export function coachStoryFit(recap: Pick<Recap, 'story' | 'line' | 'stats'>, includes: Includes, badgeCount?: number): { fontSize: number; lines: number; box: number };
// testIDs on frame 3: `${testID}-badges`, `${testID}-badge-<FAMILY>-<level>`, `${testID}-badge-<FAMILY>-<level>-icon`
```

The card is controlled by a new **"Badges this week"** switch in Build your recap's Include list for the story format: on by default, stored with the other story choices (`recapInclude.story` in SecureStore), and respected by the in-app frame, the story viewer and the shared image alike (they all read the same `includes`).

- [ ] **Step 1: Write the failing tests.** In `mobile/__tests__/lib/recapShare.test.ts`, change the story expectation in `'hides the switches of missing stats and a zero streak'` to:

```ts
  expect(availableIncludes('story', { nightsWithData: 4 })).toEqual(['quote', 'coach', 'badges']);
```

and append:

```ts
it('offers a "Badges this week" switch on the story, on by default', () => {
  expect(INCLUDE_LABELS.badges).toBe('Badges this week');
  expect(resolveIncludes('story', {}, { nightsWithData: 4 }).badges).toBe(true);
  expect(resolveIncludes('story', { badges: false }, { nightsWithData: 4 }).badges).toBe(false);
  expect(resolveIncludes('card', {}, FULL).badges).toBe(false);
});
```

In `mobile/__tests__/components/RecapShareViews.test.tsx`, inside `describe('WeeklyStoryFrame', ...)`, add:

```tsx
  it('frame 3 lists the badge levels earned that week in a card, and leaves room for it', () => {
    const badges = [{ family: 'SLEEP_GOAL' as const, level: 2 }, { family: 'STEADY_BEDTIME' as const, level: 1 }];
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={badges} />);
    expect(screen.getByTestId('recap-story-badges')).toHaveTextContent(/BADGES THIS WEEK/);
    expect(screen.getByTestId('recap-story-badge-SLEEP_GOAL-2')).toHaveTextContent('Sleep goal II');
    expect(screen.getByTestId('recap-story-badge-STEADY_BEDTIME-1')).toHaveTextContent('Bedtime I');
    expect(screen.getByTestId('recap-story-badge-SLEEP_GOAL-2-icon').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
    expect(coachStoryFit(WEEK, storyIncludes, 2).box).toBeLessThan(coachStoryFit(WEEK, storyIncludes).box);
  });

  it('shows no badge card without badges that week, and never on frames 1 and 2', () => {
    const first = render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={[]} />);
    expect(screen.queryByTestId('recap-story-badges')).toBeNull();
    first.unmount();
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={1} badges={[{ family: 'SLEEP_GOAL', level: 1 }]} />);
    expect(screen.queryByTestId('recap-story-badges')).toBeNull();
  });

  it('leaves the card out when "Badges this week" is switched off, and gives the story its room back', () => {
    const badges = [{ family: 'SLEEP_GOAL' as const, level: 2 }];
    const off = { ...storyIncludes, badges: false };
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={off} scale={1} index={2} badges={badges} />);
    expect(screen.queryByTestId('recap-story-badges')).toBeNull();
    expect(coachStoryFit(WEEK, off, 0).box).toBe(coachStoryFit(WEEK, storyIncludes).box);
  });

  it('shows at most four badges', () => {
    const badges = (['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'EVERY_DAY_LOGGED'] as const).map((family) => ({ family, level: 1 }));
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={badges} />);
    expect(screen.getByTestId('recap-story-badge-CHECK_IN-1')).toBeTruthy();
    expect(screen.queryByTestId('recap-story-badge-EVERY_DAY_LOGGED-1')).toBeNull();
  });
```

In `mobile/__tests__/screens/RecapStoryScreen.test.tsx` add the imports and mock:

```tsx
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
```

add to the existing `beforeEach`:

```tsx
  resetAchievements();
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
```

and append:

```tsx
it('frame 3 shows the badge levels earned that week, on screen and in the shared image', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-10-01' }] },
    STEP_GOAL: { level: 1, levels: [{ level: 1, value: 3, earnedOn: '2026-10-06' }] },
  }));
  mockReduceMotion = true;
  await open();
  await act(async () => {});
  tap(10000);
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(screen.getByTestId('story-badges')).toHaveTextContent(/Sleep goal II/);
  expect(screen.queryByTestId('story-badge-STEP_GOAL-1')).toBeNull();
  expect(screen.getByTestId('story-export-badges')).toBeTruthy();
});
```

Add `jest.mock('../../src/api/achievements');` (next to the other `jest.mock` lines) to `mobile/__tests__/screens/RecapBuilderScreen.test.tsx`, so it stays hermetic (the automock answers `undefined`, read as "no badges").

Create `mobile/__tests__/screens/RecapBuilderBadges.test.tsx`:

```tsx
import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { fetchRecap, type Recap } from '../../src/api/recaps';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { RecapBuilderScreen } from '../../src/screens/RecapBuilderScreen';

jest.mock('../../src/api/recaps');
jest.mock('../../src/api/sleep');
jest.mock('../../src/api/achievements');
jest.mock('expo-secure-store');
jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }), useRoute: () => ({ params: { id: 'r-week', format: 'story' } }) }));

const WEEK: Recap = {
  id: 'r-week', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A calm week.', personaId: 'mochi',
  builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, sleepGoalMinutes: 480, lineSource: 'ai', story: 'A calm week.', rebuiltAt: null,
  stats: { nightsWithData: 6, avgSleepMinutes: 455, nightsOnGoal: 5, weekStrip: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (fetchRecap as jest.Mock).mockResolvedValue(WEEK);
});

it("puts the week's badge levels on story frame 3, in the preview and in the shared image", async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 1, value: 3, earnedOn: '2026-09-20' }, { level: 2, value: 7, earnedOn: '2026-10-01' }] },
    STEP_GOAL: { level: 1, levels: [{ level: 1, value: 3, earnedOn: '2026-10-06' }] },
  }));
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-frame')).toBeTruthy();
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  const exported = within(screen.getByTestId('builder-export'));
  expect(await exported.findByTestId('export-badges')).toHaveTextContent(/Sleep goal II/);
  expect(exported.queryByTestId('export-badge-SLEEP_GOAL-1')).toBeNull();
  expect(exported.queryByTestId('export-badge-STEP_GOAL-1')).toBeNull();
  expect(within(screen.getByTestId('builder-preview')).getByTestId('preview-badges')).toBeTruthy();
});

it('has a "Badges this week" switch, on by default and remembered, that takes the card off the preview and the image', async () => {
  const store: Record<string, string> = {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  (SecureStore.setItemAsync as jest.Mock).mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-10-01' }] },
  }));
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-include-badges')).toBeTruthy();
  expect(screen.getByTestId('builder-include-badges').props.accessibilityLabel).toBe('Badges this week');
  await waitFor(() => expect(screen.getByTestId('builder-include-badges').props.value).toBe(true));
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  expect(await within(screen.getByTestId('builder-export')).findByTestId('export-badges')).toBeTruthy();
  fireEvent(screen.getByTestId('builder-include-badges'), 'valueChange', false);
  expect(within(screen.getByTestId('builder-export')).queryByTestId('export-badges')).toBeNull();
  expect(within(screen.getByTestId('builder-preview')).queryByTestId('preview-badges')).toBeNull();
  await waitFor(() => expect(JSON.parse(store['recapInclude.story']!)).toEqual({ badges: false }));
});

it('leaves the card out when no level was earned that week', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture());
  render(withCharacter(<RecapBuilderScreen />));
  await screen.findByTestId('builder-frame');
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  await act(async () => {});
  expect(screen.queryByTestId('export-badges')).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/components/RecapShareViews.test.tsx __tests__/screens/RecapStoryScreen.test.tsx __tests__/screens/RecapBuilderBadges.test.tsx`
Expected: FAIL — no `recap-story-badges` / `story-badges` / `export-badges`; `coachStoryFit` ignores a third argument.

Also run `N24 node_modules/.bin/jest __tests__/lib/recapShare.test.ts` — FAIL: no `badges` include.

- [ ] **Step 3: Write `mobile/src/lib/useEarnedBadges.ts`**

```ts
import { useEffect } from 'react';
import type { FamilyKind } from '../api/achievements';
import { getAchievementsSnapshot, refreshAchievements, useAchievements } from './achievementsStore';
import { levelsEarnedBetween, type BadgeRef } from './badges';

/**
 * Badge levels earned between two dates (inclusive), read at view time (spec 2026-10-06 §6: a level
 * dated into a period after its recap was opened shows the next time it is viewed). [] until
 * loaded, on a 404 and on an error.
 */
export function useEarnedBadges(from: string, to: string, kind?: FamilyKind): BadgeRef[] {
  const { state } = useAchievements();
  useEffect(() => {
    if (getAchievementsSnapshot().state.status === 'idle') void refreshAchievements();
  }, []);
  return state.status === 'ready' ? levelsEarnedBetween(state.data, from, to, kind) : [];
}
```

- [ ] **Step 4a: Add the include switch.** In `mobile/src/lib/recapShare.ts`:

```ts
export type IncludeKey = 'avgSleep' | 'streak' | 'bestRecovery' | 'steps' | 'bestNight' | 'quote' | 'coach' | 'count' | 'badges';
```

change the story entry of `FORMAT_INCLUDES` to:

```ts
  story: ['bestNight', 'quote', 'coach', 'badges'],
```

add to `INCLUDE_LABELS` after `count: 'Nights on goal',`:

```ts
  badges: 'Badges this week',
```

and change `ALL_KEYS` to:

```ts
const ALL_KEYS: IncludeKey[] = ['avgSleep', 'streak', 'bestRecovery', 'steps', 'bestNight', 'quote', 'coach', 'count', 'badges'];
```

(`availableIncludes` needs no change: its `default` branch makes `badges` available for the story; `resolveIncludes` makes it on by default.) In `mobile/src/lib/recapPrefs.ts` change `KEYS` to:

```ts
const KEYS: IncludeKey[] = ['avgSleep', 'streak', 'bestRecovery', 'steps', 'bestNight', 'quote', 'coach', 'count', 'badges'];
```

- [ ] **Step 4b: Add the card to frame 3** in `mobile/src/components/recap/WeeklyStoryView.tsx`.

Add imports:

```tsx
import { shortLevelTitle, type BadgeRef } from '../../lib/badges';
import { BadgeIcon } from '../achievements/BadgeIcon';
```

After `const STORY_BASE = 18;` add:

```tsx
/** "Badges this week" on frame 3 (achievements spec §6): up to four badges, each with its short title. */
const STORY_BADGE_ICON = 44;
const STORY_BADGE_MAX = 4;
const NO_BADGES: readonly BadgeRef[] = [];
/** The card's height in design units: chrome and label, the icon, a gap and the title line. */
export const BADGE_CARD_HEIGHT = CARD_CHROME + STORY_BADGE_ICON + 4 + 14;
```

In `WeeklyStoryFrameProps`, after `showProgress?: boolean;` add:

```tsx
  /** Badge levels earned in this recap's week, shown on frame 3 (and in its shared image) when any. */
  badges?: readonly BadgeRef[];
```

Change the `WeeklyStoryFrame` signature to destructure `badges = NO_BADGES`:

```tsx
export function WeeklyStoryFrame({ recap, coachId, includes, scale, index, showProgress = true, badges = NO_BADGES, testID = 'recap-story' }: WeeklyStoryFrameProps) {
```

and replace the frame-3 body line with:

```tsx
      {index === 2 ? <CoachStoryBody recap={recap} coachId={coachId} includes={includes} u={u} t={t} pixel={pixel} testID={testID} badges={badges} /> : null}
```

Replace the whole `coachStoryFit` function with:

```tsx
export function coachStoryFit(recap: Pick<Recap, 'story' | 'line' | 'stats'>, includes: Includes, badgeCount = 0): { fontSize: number; lines: number; box: number } {
  const header = includes.coach ? 72 : 30;
  const footer = 1 + 16 + FOOTER_LINE;
  const blocks = [
    STORY_PROGRESS_HEIGHT,
    EYEBROW_LINE,
    header,
    coachFrameStats(recap.stats).length > 0 ? CARD_CHROME + CARD_VALUE_LINE : 0,
    badgeCount > 0 ? BADGE_CARD_HEIGHT : 0,
    footer,
  ].filter((h) => h > 0);
  // The text is one more block, so one more gap.
  const box = CONTENT_H - blocks.reduce((x, y) => x + y, 0) - blocks.length * GAP - 8;
  return { ...fitQuote(coachFrameText(recap), CONTENT_W, box, STORY_BASE, STORY_MIN), box };
}
```

Replace the whole `CoachStoryBody` function with:

```tsx
/** Frame 3: the coach's weekly story (the line when there is none), the streak and the spread, and the week's badges. */
function CoachStoryBody({ recap, coachId, includes, u, t, pixel, testID, badges }: BodyProps & { badges: readonly BadgeRef[] }) {
  const name = characterInfo(coachId).name;
  const text = coachFrameText(recap);
  const stats = coachFrameStats(recap.stats);
  // Switched off in Build your recap ("Badges this week"): no card here, in the viewer or the image.
  const shown = includes.badges ? badges.slice(0, STORY_BADGE_MAX) : NO_BADGES;
  const fit = coachStoryFit(recap, includes, shown.length);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(16) }}>
        {includes.coach ? (
          <View testID={`${testID}-coach`}>
            <Character characterId={coachId} mood="idle" size={Math.round(u(72))} paused />
          </View>
        ) : null}
        <Text testID={`${testID}-title`} numberOfLines={2} adjustsFontSizeToFit style={{ flex: 1, fontFamily: pixel, fontSize: u(26), lineHeight: u(30), color: t.text }}>
          {`Notes from ${name}`}
        </Text>
      </View>
      <Text
        testID={`${testID}-story`}
        numberOfLines={fit.lines + 1}
        adjustsFontSizeToFit
        minimumFontScale={QUOTE_MIN_FONT_SCALE}
        style={{ flexShrink: 1, fontFamily: FONTS.sans, fontSize: u(fit.fontSize), lineHeight: u(fit.fontSize * QUOTE_LINE_HEIGHT), color: t.text }}
      >
        {text}
      </Text>
      {stats.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: u(12) }}>
          {stats.map((s) => (
            <View key={s.key} testID={`${testID}-stat-${s.key}`} style={[cardStyle(u, t), { flex: 1 }]}>
              <Label u={u} t={t}>{s.label}</Label>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONTS.sansBold, fontSize: u(24), lineHeight: u(CARD_VALUE_LINE), color: t.text }}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {shown.length > 0 ? (
        <View testID={`${testID}-badges`} style={cardStyle(u, t)}>
          <Label u={u} t={t}>Badges this week</Label>
          <View style={{ flexDirection: 'row', gap: u(10) }}>
            {shown.map((b) => (
              <View key={`${b.family}-${b.level}`} testID={`${testID}-badge-${b.family}-${b.level}`} style={{ flex: 1, alignItems: 'center', gap: u(4) }}>
                <BadgeIcon family={b.family} level={b.level} size={u(STORY_BADGE_ICON)} pips={false} testID={`${testID}-badge-${b.family}-${b.level}-icon`} />
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONTS.sans, fontSize: u(10), lineHeight: u(14), color: t.soft }}>
                  {shortLevelTitle(b.family, b.level)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Pass the week's badges from the viewer and the builder.** In `mobile/src/screens/RecapStoryScreen.tsx` add `import { useEarnedBadges } from '../lib/useEarnedBadges';`, in `StoryViewer` after `const layout = exportLayout('story', PixelRatio.get());` add:

```tsx
  // Levels earned in this week, read now: a level dated into the week after the recap was built still shows.
  const badges = useEarnedBadges(recap.periodStart, recap.periodEnd);
```

and add `badges={badges}` to both `<WeeklyStoryFrame testID="story" ... />` and `<WeeklyStoryFrame testID="story-export" ... />`.

In `mobile/src/screens/RecapBuilderScreen.tsx` add `import { useEarnedBadges } from '../lib/useEarnedBadges';`, after `const { exportRef, busy, notice, save, share } = useRecapExport();` add:

```tsx
  // The week's badge levels for story frame 3 (an empty range until the recap loads).
  const weekBadges = useEarnedBadges(recap?.periodStart ?? '', recap?.periodEnd ?? '');
```

and in `renderView` change the story branch to:

```tsx
      <WeeklyStoryFrame testID={testID} recap={recap} coachId={coachId} includes={includes} scale={scale} index={frame} badges={weekBadges} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/recapShare.test.ts __tests__/components/RecapShareViews.test.tsx __tests__/screens/RecapStoryScreen.test.tsx __tests__/screens/RecapBuilderBadges.test.tsx __tests__/screens/RecapBuilderScreen.test.tsx __tests__/screens/RecapScreen.test.tsx`
Expected: PASS (the existing frame-3 fit test still passes: with no badges `coachStoryFit` is unchanged).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/useEarnedBadges.ts mobile/src/lib/recapShare.ts mobile/src/lib/recapPrefs.ts mobile/__tests__/lib/recapShare.test.ts mobile/src/components/recap/WeeklyStoryView.tsx mobile/src/screens/RecapStoryScreen.tsx mobile/src/screens/RecapBuilderScreen.tsx mobile/__tests__/components/RecapShareViews.test.tsx mobile/__tests__/screens/RecapStoryScreen.test.tsx mobile/__tests__/screens/RecapBuilderBadges.test.tsx mobile/__tests__/screens/RecapBuilderScreen.test.tsx
git commit -m "feat(mobile): badges earned this week on the weekly story's third frame and its image, with an include switch"
```

---

### Task 18: Month recap — badge progress on the milestone tiles and "Badges earned in <Month>"

**Files:**
- Modify: `mobile/src/lib/milestones.ts` (`MilestoneTile`)
- Modify: `mobile/src/lib/recapCopy.ts` (`milestoneTiles`)
- Modify: `mobile/src/components/milestones/MilestoneTiles.tsx` (tile body and accessibility label)
- Modify: `mobile/src/screens/RecapScreen.tsx` (`MonthBody`)
- Test: `mobile/__tests__/lib/recapCopy.test.ts`, `mobile/__tests__/components/MilestoneTiles.test.tsx`, `mobile/__tests__/screens/RecapScreen.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`Achievements`, `AchievementFamily`, `countLabel`, `tierName`, `shortLevelTitle`, `levelsEarnedBetween`, `useAchievements`, `getAchievementsSnapshot`, `refreshAchievements`, `resetAchievements`, fixture); Task 13 (`BadgeIcon`); `fetchRecaps` from `mobile/src/api/recaps.ts` (newest MONTH recap).
- Produces:

```ts
// lib/milestones.ts
export interface MilestoneTile { key: string; label: string; glyph: MilestoneGlyph; earned: boolean; progress?: string; levelUp?: boolean }
// lib/recapCopy.ts
export interface MonthBadges { achievements: Achievements; periodStart: string; periodEnd: string; latest: boolean }
export function milestoneTiles(m: RecapMilestones | undefined, badges?: MonthBadges): MilestoneTileContent[];
// testIDs: `${testID}-${key}-progress`, `${testID}-${key}-levelup`, `recap-month-badges`, `recap-month-badge-<FAMILY>-<level>`
```

`milestoneTiles(m)` without `badges` returns exactly the four tiles it does today (the old-backend path). With `badges` it returns the three monthly families. For a month on or after `achievements.since`, each tile carries `levelUp` (a level of that family earned in this month); only the **latest** month recap (`latest: true`, the newest MONTH recap) also carries `progress` ("n of N months for <level>"). Older months show only whether the milestone was hit and the level-up mark.

- [ ] **Step 1: Write the failing tests.** In `mobile/__tests__/lib/recapCopy.test.ts` add `import { achievementsFixture } from '../../jest-mocks/achievementsFixture';` and append:

```ts
it('with badges, shows the three monthly families with progress toward the next level and a level-up mark', () => {
  const achievements = achievementsFixture({
    EVERY_DAY_LOGGED: { level: 1, current: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] },
    BEST_RECOVERY_WEEK: { level: 5, current: 24 },
  });
  const tiles = milestoneTiles({ everyDayLogged: { days: 31 }, streak: { nights: 9 } }, { achievements, periodStart: '2026-10-01', periodEnd: '2026-10-31', latest: true });
  expect(tiles.map((t) => [t.key, t.earned, t.progress, t.levelUp])).toEqual([
    ['bestRecoveryWeek', false, 'Top level', false],
    ['everyDayLogged', true, '2 of 3 months for Silver', true],
    ['steadiestMonth', false, '0 of 1 month for Bronze', false],
  ]);
});

it('shows an older month without progress: only whether it hit the milestone and the level-up mark', () => {
  const achievements = achievementsFixture({ EVERY_DAY_LOGGED: { level: 2, current: 3, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }, { level: 2, value: 3, earnedOn: '2026-12-31' }] } });
  const tiles = milestoneTiles({ everyDayLogged: { days: 31 } }, { achievements, periodStart: '2026-10-01', periodEnd: '2026-10-31', latest: false });
  expect(tiles.map((t) => [t.key, t.earned, t.progress, t.levelUp])).toEqual([
    ['bestRecoveryWeek', false, undefined, false],
    ['everyDayLogged', true, undefined, true],
    ['steadiestMonth', false, undefined, false],
  ]);
});

it('shows a month before the badge start date as three tiles without progress', () => {
  const tiles = milestoneTiles({ everyDayLogged: { days: 30 } }, { achievements: achievementsFixture({}, { since: '2026-10-07' }), periodStart: '2026-10-01', periodEnd: '2026-10-31', latest: true });
  expect(tiles.map((t) => [t.key, t.earned, t.progress, t.levelUp])).toEqual([
    ['bestRecoveryWeek', false, undefined, undefined],
    ['everyDayLogged', true, undefined, undefined],
    ['steadiestMonth', false, undefined, undefined],
  ]);
});
```

In `mobile/__tests__/components/MilestoneTiles.test.tsx` append:

```tsx
it('shows badge progress and a level-up mark when a tile has them, and reads them out', () => {
  render(
    <MilestoneTiles
      testID="tiles"
      tiles={[
        { key: 'everyDayLogged', label: 'Every night logged', glyph: 'calendar', earned: true, progress: '2 of 3 months for Silver', levelUp: true },
        { key: 'steadiestMonth', label: 'Steadiest bedtimes yet', glyph: 'moon', earned: false, progress: '0 of 1 month for Bronze' },
      ]}
    />,
  );
  expect(screen.getByTestId('tiles-everyDayLogged-progress')).toHaveTextContent('2 of 3 months for Silver');
  expect(screen.getByTestId('tiles-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  expect(screen.getByTestId('tiles-everyDayLogged').props.accessibilityLabel).toBe('Every night logged, earned, level up, 2 of 3 months for Silver');
  expect(screen.queryByTestId('tiles-steadiestMonth-levelup')).toBeNull();
  expect(screen.getByTestId('tiles-steadiestMonth').props.accessibilityLabel).toBe('Steadiest bedtimes yet, locked, 0 of 1 month for Bronze');
});
```

In `mobile/__tests__/screens/RecapScreen.test.tsx` add the imports and mock:

```tsx
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
```

add `fetchRecaps` to the existing import from `'../../src/api/recaps'` (the file already automocks that module), and add to the existing `beforeEach` (so every existing month test runs against "no badges" and keeps its four tiles):

```tsx
  resetAchievements();
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  // The newest month recap is this one unless a test says otherwise.
  (fetchRecaps as jest.Mock).mockResolvedValue([{ id: 'r-month', kind: 'MONTH' }]);
```

and append:

```tsx
it("shows badge progress on the month's tiles, a level-up mark, and the streak badges earned that month", async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 1, value: 3, earnedOn: '2026-08-30' }, { level: 2, value: 7, earnedOn: '2026-09-12' }] },
    EVERY_DAY_LOGGED: { level: 1, current: 1, levels: [{ level: 1, value: 1, earnedOn: '2026-09-30' }] },
  }, { since: '2026-08-15' }));
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, milestones: { everyDayLogged: { days: 30 } } } });
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-milestones-everyDayLogged-progress')).toHaveTextContent('1 of 3 months for Silver');
  expect(screen.getByTestId('recap-milestones-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  expect(screen.queryByTestId('recap-milestones-streak')).toBeNull();
  expect(screen.getByText('Badges earned in September')).toBeTruthy();
  expect(screen.getByTestId('recap-month-badge-SLEEP_GOAL-2')).toHaveTextContent('Sleep goal II');
  expect(screen.queryByTestId('recap-month-badge-SLEEP_GOAL-1')).toBeNull();
  expect(screen.queryByTestId('recap-month-badge-EVERY_DAY_LOGGED-1')).toBeNull();
  expect(fetchRecaps).toHaveBeenCalledWith({ kind: 'MONTH', limit: 1 });
});

it('shows an older month recap without progress, keeping its level-up mark and "Badges earned"', async () => {
  (fetchRecaps as jest.Mock).mockResolvedValue([{ id: 'r-newer-month', kind: 'MONTH' }]);
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-09-12' }] },
    EVERY_DAY_LOGGED: { level: 1, current: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-09-30' }] },
  }, { since: '2026-08-15' }));
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, milestones: { everyDayLogged: { days: 30 } } } });
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-milestones-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  expect(screen.getByTestId('recap-milestones-everyDayLogged').props.accessibilityLabel).toBe('Every night logged, earned, level up');
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-milestones-steadiestMonth-progress')).toBeNull();
  expect(screen.getByTestId('recap-month-badge-SLEEP_GOAL-2')).toBeTruthy();
});

it('shows a month before the badge start date without progress, and no "Badges earned" section', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({}, { since: '2026-10-07' }));
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  await waitFor(() => expect(screen.queryByTestId('recap-milestones-streak')).toBeNull());
  expect(screen.getByTestId('recap-milestones-everyDayLogged')).toBeTruthy();
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-month-badges')).toBeNull();
});

it('keeps the four original tiles against a backend without badges (404)', async () => {
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  await act(async () => {});
  expect(screen.getByTestId('recap-milestones-streak').props.accessibilityLabel).toBe('6 nights on goal in a row, earned');
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-month-badges')).toBeNull();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/recapCopy.test.ts __tests__/components/MilestoneTiles.test.tsx __tests__/screens/RecapScreen.test.tsx`
Expected: FAIL — `milestoneTiles` ignores its second argument; no progress, level-up or "Badges earned" elements.

- [ ] **Step 3: Extend the tile type** in `mobile/src/lib/milestones.ts`:

```ts
export interface MilestoneTile {
  key: string;
  label: string;
  glyph: MilestoneGlyph;
  earned: boolean;
  /** Badge progress for a month on or after the badge start date: "2 of 3 months for Silver". */
  progress?: string;
  /** A level of this family was earned in this month. */
  levelUp?: boolean;
}
```

- [ ] **Step 4: Give `milestoneTiles` the badge view.** In `mobile/src/lib/recapCopy.ts` add imports:

```ts
import type { AchievementFamily, Achievements } from '../api/achievements';
import { countLabel, tierName } from './badges';
```

and replace the whole `milestoneTiles` function (keep `MilestoneKey` and `MilestoneTileContent` as they are) with:

```ts
export interface MonthBadges {
  achievements: Achievements;
  periodStart: string;
  periodEnd: string;
  /** This is the newest month recap: only it shows progress toward the next level. */
  latest: boolean;
}

const MONTHLY_FAMILY: Partial<Record<MilestoneKey, AchievementFamily>> = {
  bestRecoveryWeek: 'BEST_RECOVERY_WEEK',
  everyDayLogged: 'EVERY_DAY_LOGGED',
  steadiestMonth: 'STEADIEST_MONTH',
};

/**
 * The month's milestones as tiles. Without badges (a backend older than them, or not loaded yet):
 * all four kinds, as before. With badges (achievements spec §6): the three monthly families only —
 * the Sleep goal streak badge replaced the streak tile. For a month on or after the badge start
 * date, each tile says whether a level of its family was earned in this month; only the newest
 * month recap also shows progress toward the next level (an older month's progress would be
 * today's, not that month's). A locked tile says what the milestone is, never how close the month came.
 */
export function milestoneTiles(m: RecapMilestones | undefined, badges?: MonthBadges): MilestoneTileContent[] {
  const tiles: MilestoneTileContent[] = [
    { key: 'streak', label: m?.streak ? `${plural(m.streak.nights, 'night')} on goal in a row` : 'Nights on goal in a row', glyph: 'star', earned: !!m?.streak },
    { key: 'bestRecoveryWeek', label: 'Best recovery week', glyph: 'heart', earned: !!m?.bestRecoveryWeek },
    { key: 'everyDayLogged', label: 'Every night logged', glyph: 'calendar', earned: !!m?.everyDayLogged },
    { key: 'steadiestMonth', label: 'Steadiest bedtimes yet', glyph: 'moon', earned: !!m?.steadiestMonth },
  ];
  if (!badges) return tiles;
  const { achievements, periodStart, periodEnd, latest } = badges;
  return tiles
    .filter((tile) => tile.key !== 'streak')
    .map((tile) => {
      const f = achievements.families.find((x) => x.family === MONTHLY_FAMILY[tile.key]);
      if (!f || periodStart < achievements.since) return tile;
      const levelUp = f.levels.some((l) => l.earnedOn >= periodStart && l.earnedOn <= periodEnd);
      if (!latest) return { ...tile, levelUp };
      const progress = f.nextThreshold === null
        ? 'Top level'
        : `${Math.min(f.current, f.nextThreshold)} of ${countLabel(f.family, f.nextThreshold)} for ${tierName(f.level + 1)}`;
      return { ...tile, progress, levelUp };
    });
}
```

- [ ] **Step 5: Draw progress and the level-up mark** in `mobile/src/components/milestones/MilestoneTiles.tsx`. Change the theme import to `import { COLORS, FONTS } from '../../theme';`, change the tile's `accessibilityLabel` to:

```tsx
              accessibilityLabel={`${tile.label}, ${tile.earned ? 'earned' : 'locked'}${tile.levelUp ? ', level up' : ''}${tile.progress ? `, ${tile.progress}` : ''}`}
```

and right after the label `<Text testID={`${testID}-${tile.key}-label`} ...>...</Text>` add:

```tsx
              {tile.progress ? (
                <Text testID={`${testID}-${tile.key}-progress`} className="text-center" style={{ fontSize: 11, color: COLORS[scheme].muted }}>
                  {tile.progress}
                </Text>
              ) : null}
              {tile.levelUp ? (
                <Text testID={`${testID}-${tile.key}-levelup`} style={{ fontSize: 10, letterSpacing: 0.6, fontFamily: FONTS.sansSemibold, color: COLORS[scheme].accent }}>
                  LEVEL UP
                </Text>
              ) : null}
```

- [ ] **Step 6: Use it on the month screen.** In `mobile/src/screens/RecapScreen.tsx` add imports:

```tsx
import { BadgeIcon } from '../components/achievements/BadgeIcon';
import { getAchievementsSnapshot, refreshAchievements, useAchievements } from '../lib/achievementsStore';
import { levelsEarnedBetween, shortLevelTitle } from '../lib/badges';
```

and add `fetchRecaps` to the existing import from `'../api/recaps'` (`useEffect` and `useState` are already imported from React). In `MonthBody`, after `const rows = compareChanges(recap.stats.comparison);` add:

```tsx
  // Badges (achievements spec §6), read at view time. Until they load, and against a backend
  // without them (404), the tiles stay exactly as before.
  const { state: badgeState } = useAchievements();
  useEffect(() => {
    if (getAchievementsSnapshot().state.status === 'idle') void refreshAchievements();
  }, []);
  // Only the newest month recap shows progress toward the next level; a failed lookup shows none.
  const [latest, setLatest] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [newest] = await fetchRecaps({ kind: 'MONTH', limit: 1 });
        if (live) setLatest(newest?.id === recap.id);
      } catch {
        if (live) setLatest(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [recap.id]);
  const achievements = badgeState.status === 'ready' ? badgeState.data : null;
  const tiles = milestoneTiles(recap.stats.milestones, achievements ? { achievements, periodStart: recap.periodStart, periodEnd: recap.periodEnd, latest } : undefined);
  const earnedThisMonth = levelsEarnedBetween(achievements, recap.periodStart, recap.periodEnd, 'streak');
```

replace `<MilestoneTiles testID="recap-milestones" tiles={milestoneTiles(recap.stats.milestones)} />` with `<MilestoneTiles testID="recap-milestones" tiles={tiles} />`, and directly after the `View` that holds the Milestones `SectionLabel` and tiles add:

```tsx
      {earnedThisMonth.length > 0 ? (
        <View testID="recap-month-badges" className="gap-2">
          <SectionLabel>{`Badges earned in ${monthName(recap.periodStart)}`}</SectionLabel>
          <Card className="flex-row flex-wrap" style={{ rowGap: 10 }}>
            {earnedThisMonth.map((b) => (
              <View key={`${b.family}-${b.level}`} testID={`recap-month-badge-${b.family}-${b.level}`} style={{ width: '25%', alignItems: 'center', gap: 6 }}>
                <BadgeIcon family={b.family} level={b.level} size={54} testID={`recap-month-badge-${b.family}-${b.level}-icon`} />
                <Text className="text-center text-xs">{shortLevelTitle(b.family, b.level)}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `mobile/`): `N24 node_modules/.bin/jest __tests__/lib/recapCopy.test.ts __tests__/components/MilestoneTiles.test.tsx __tests__/screens/RecapScreen.test.tsx`
Expected: PASS, including every existing month test (four tiles while badges are unavailable).

- [ ] **Step 8: Commit**

```bash
git add mobile/src/lib/milestones.ts mobile/src/lib/recapCopy.ts mobile/src/components/milestones/MilestoneTiles.tsx mobile/src/screens/RecapScreen.tsx mobile/__tests__/lib/recapCopy.test.ts mobile/__tests__/components/MilestoneTiles.test.tsx mobile/__tests__/screens/RecapScreen.test.tsx
git commit -m "feat(mobile): badge progress on the month recap's milestones and the streak badges earned that month"
```

---

### Task 19: Dev-only seed script

**Files:**
- Create: `backend/scripts/seedAchievements.ts`
- Test: `backend/tests/scripts/seedAchievements.test.ts`

**Interfaces:**
- Consumes: Task 1; Task 2 (`familyDef`); `localCivilDateOrUtc`, `civilDateToUtcMidnight`, `mondayOf`, `monthStartOf`, `shiftDate`.
- Produces:

```ts
export function assertDevDatabase(env: { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined }): void;
export const SAMPLE_LEVELS: ReadonlyArray<readonly [AchievementFamily, number, number, boolean]>; // [family, level, days before today, celebrated]
export function seedAchievements(opts: { email: string; now?: Date; env?: { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined } }): Promise<{ userId: string; created: number }>;
```

- [ ] **Step 1: Write the failing test** `backend/tests/scripts/seedAchievements.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { SAMPLE_LEVELS, assertDevDatabase, seedAchievements } from '../../scripts/seedAchievements';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const LOCAL = { DATABASE_URL: 'postgresql://dev@localhost:5432/biometrics_dev' };
const NOW = new Date('2026-10-10T12:00:00Z');
const key = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);

it('refuses production and any database that is not local', () => {
  expect(() => assertDevDatabase({ ...LOCAL, NODE_ENV: 'production' })).toThrow('production');
  expect(() => assertDevDatabase({ DATABASE_URL: 'postgresql://dev@db.example.com:5432/biometrics' })).toThrow('not a local database');
  expect(() => assertDevDatabase({})).toThrow('not a local database');
  expect(() => assertDevDatabase(LOCAL)).not.toThrow();
});

it('awards the sample levels once, two still to celebrate, and sets a start date when none is set', async () => {
  const user = await createUser();
  const first = await seedAchievements({ email: user.email, now: NOW, env: LOCAL });
  const again = await seedAchievements({ email: user.email, now: NOW, env: LOCAL });
  expect(first).toEqual({ userId: user.id, created: SAMPLE_LEVELS.length });
  expect(again.created).toBe(0);
  expect(await prisma.achievement.count({ where: { userId: user.id, celebratedAt: null } })).toBe(2);
  const row = await prisma.achievement.findUniqueOrThrow({ where: { userId_family_level: { userId: user.id, family: 'SLEEP_GOAL', level: 2 } } });
  expect([row.value, key(row.earnedOn), key(row.weekStart), key(row.monthStart)]).toEqual([7, '2026-10-02', '2026-09-28', '2026-10-01']);
  expect(key((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).achievementsSince)).toBe('2026-09-10');
});

it('refuses an unknown email', async () => {
  await expect(seedAchievements({ email: 'nobody-here@example.com', now: NOW, env: LOCAL })).rejects.toThrow('No user');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/scripts/seedAchievements.test.ts`
Expected: FAIL — "Cannot find module '../../scripts/seedAchievements'".

- [ ] **Step 3: Write `backend/scripts/seedAchievements.ts`**

```ts
// Dev only: gives an existing account (the demo account) sample badge levels, so the simulator pass
// can see the Profile card, the Badges screens, a celebration (two levels are left uncelebrated)
// and the recap cards (levels dated in the last two weeks).
//
//   DATABASE_URL=<local dev database> N24 node_modules/.bin/ts-node scripts/seedAchievements.ts --email demo@example.com
//
// Refuses NODE_ENV=production and any DATABASE_URL whose host is not localhost. Idempotent: levels
// already there are skipped. Never runs on import: the CLI entry point is guarded by require.main.
import type { AchievementFamily } from '@prisma/client';
import { familyDef } from '../src/achievements/catalogue';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../src/biometrics/civilDate';
import { prisma } from '../src/db/client';
import { mondayOf, monthStartOf } from '../src/recap/periods';
import { shiftDate } from '../src/scoring/dates';

type SeedEnv = { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const START_DAYS_BACK = 30;

export function assertDevDatabase(env: SeedEnv): void {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed achievements in production');
  let host = '';
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    host = '';
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('Refusing to seed achievements: DATABASE_URL is not a local database');
}

/** [family, level, days before today, already celebrated]. */
export const SAMPLE_LEVELS: ReadonlyArray<readonly [AchievementFamily, number, number, boolean]> = [
  ['SLEEP_GOAL', 1, 12, true],
  ['SLEEP_GOAL', 2, 8, true],
  ['EVERY_DAY_LOGGED', 1, 6, true],
  ['STEADY_BEDTIME', 1, 3, false],
  ['CHECK_IN', 1, 2, false],
];

export async function seedAchievements({ email, now = new Date(), env = process.env }: { email: string; now?: Date; env?: SeedEnv }): Promise<{ userId: string; created: number }> {
  assertDevDatabase(env);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, timezone: true, achievementsSince: true } });
  if (!user) throw new Error(`No user with email ${email}`);
  const today = localCivilDateOrUtc(now, user.timezone);
  if (!user.achievementsSince) {
    await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: civilDateToUtcMidnight(shiftDate(today, -START_DAYS_BACK)) } });
  }
  const result = await prisma.achievement.createMany({
    data: SAMPLE_LEVELS.map(([family, level, daysBack, celebrated]) => {
      const earnedOn = shiftDate(today, -daysBack);
      return {
        userId: user.id,
        family,
        level,
        value: familyDef(family).thresholds[level - 1]!,
        earnedOn: civilDateToUtcMidnight(earnedOn),
        weekStart: civilDateToUtcMidnight(mondayOf(earnedOn)),
        monthStart: civilDateToUtcMidnight(monthStartOf(earnedOn)),
        celebratedAt: celebrated ? now : null,
      };
    }),
    skipDuplicates: true,
  });
  return { userId: user.id, created: result.count };
}

async function main() {
  const i = process.argv.indexOf('--email');
  const email = i >= 0 ? process.argv[i + 1] : undefined;
  if (!email) throw new Error('Usage: seedAchievements --email <email>');
  try {
    const { userId, created } = await seedAchievements({ email });
    console.info(JSON.stringify({ event: 'achievements.seeded', userId, created }));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : 'seed failed');
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh tests/scripts/seedAchievements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seedAchievements.ts backend/tests/scripts/seedAchievements.test.ts
git commit -m "chore(backend): dev-only script that seeds sample badge levels"
```

---

### Task 20: Verification

**Files:**
- No new files. Fix anything the checks below turn up in the task that owns it, with its own test, before finishing.

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch.

- [ ] **Step 1: Full backend suite**

Run: `bash /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/achievements/.superpowers/sdd/2026-10-06-achievements/backend-jest.sh`
Expected: every suite PASS.

- [ ] **Step 2: Backend typecheck**

Run (from `backend/`): `N24 node_modules/.bin/tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Full mobile suite**

Run (from `mobile/`): `N24 node_modules/.bin/jest`
Expected: every suite PASS.

- [ ] **Step 4: Mobile typecheck against the baseline**

Run (from `mobile/`): `N24 node_modules/.bin/tsc --noEmit --types jest,node | grep -c 'error TS'`
Expected: `12`.
Run: `N24 node_modules/.bin/tsc --noEmit --types jest,node | grep -E "achievements|[Bb]adge|Celebration|celebration|RecapScreen|RecapStoryScreen|RecapBuilder|WeeklyStoryView|MilestoneTiles|recapCopy|milestones\.ts|habit-log-card|SettingsScreen|RootNavigator|useEarnedBadges"`
Expected: no output (none of the 12 is in a file this plan touched).

- [ ] **Step 5: The migration is additive**

Run (from the worktree root): `grep -inE "DROP|RENAME|ALTER COLUMN|SET DATA TYPE|DELETE|TRUNCATE" backend/prisma/migrations/20261006120000_achievements/migration.sql`
Expected: no output.

- [ ] **Step 6: No stray logs, no placeholders, no push, no health values in logs**

Run:

```bash
grep -rn "console.log" backend/src/achievements backend/scripts/seedAchievements.ts mobile/src/api/achievements.ts mobile/src/lib/badges.ts mobile/src/lib/badgeArt.ts mobile/src/lib/achievementsStore.ts mobile/src/lib/celebrationQueue.ts mobile/src/lib/useEarnedBadges.ts mobile/src/components/achievements mobile/src/screens/BadgesScreen.tsx mobile/src/screens/BadgeDetailScreen.tsx
grep -rnE "TODO|FIXME|TBD|XXX" backend/src/achievements backend/scripts/seedAchievements.ts mobile/src/components/achievements mobile/src/lib/badges.ts mobile/src/lib/badgeArt.ts mobile/src/lib/achievementsStore.ts mobile/src/lib/celebrationQueue.ts mobile/src/lib/useEarnedBadges.ts mobile/src/screens/BadgesScreen.tsx mobile/src/screens/BadgeDetailScreen.tsx
grep -rniE "push|notification" backend/src/achievements mobile/src/components/achievements mobile/src/lib/achievementsStore.ts
grep -rn "console\." backend/src/achievements
```

Expected: the first three print nothing. The last prints only the `achievements.awarded` event (userId, family, level), the `achievements.launch_started` count, and the `*_failed` events (event, userId, error class) — no minutes, steps, bedtimes or scores.

- [ ] **Step 7: Commit messages are plain**

Run (from the worktree root): `git log --format=%B main..HEAD | grep -inE "co-authored|claude|anthropic|generated with"`
Expected: no output.

**Not part of this task:** the simulator pass — running `backend/scripts/seedAchievements.ts` against the dev database and walking through the badge art, the celebration and the share image on the simulator — is done by the controller after the final review, not by the Task 20 implementer.

- [ ] **Step 8: Commit any fixes** (only if Steps 1–7 needed changes; each fix goes with its test):

```bash
git add backend mobile
git commit -m "fix: verification follow-ups for badges"
```

---

## Appendix: decisions where the spec is silent

These are binding for this plan; each is pinned by a test in the task named.

1. **Goal "before that day" with no history (Task 5).** When a goal changes and no `GoalChange` row of that kind is dated before today, the goal that was in effect (the same-day starting row if one exists, else the stored value) is first written dated the day before, so a second change the same day still compares with it.
2. **Nights before the first change (Task 3).** They use the earliest row (the starting goal); a user with no rows at all uses the stored goal.
3. **Starting rows are dated the start date (Task 8).** A goal saved earlier that same day keeps its row (`skipDuplicates`).
4. **Steady-bedtime look-back (Task 7).** The median may use nights before the start date, read from up to 60 days before it (`BEDTIME_LOOKBACK_DAYS`); the usual bedtime for a first bedtime goal also looks back 60 days.
5. **What counts as a night (Task 4).** A positive SLEEP rollup (0 is no night, as Recap's `sleepOf`). A night with a rollup but no main-session bedtime is "no data" for Steady bedtime.
6. **Monthly `current` (Task 4).** `current = best =` the qualifying month count.
7. **The 10-minute marker holds the standings (Task 5, Task 10).** A load inside the window answers `current`/`best` from it without recomputing; a Redis read error evaluates instead of failing.
8. **A repeat tap never updates `onTime` (Task 6).** Including a pre-deploy launch-day row: only the launch job flips those.
9. **Month tile progress shows only on the latest month recap (Task 18)** — the newest MONTH recap (`fetchRecaps({ kind: 'MONTH', limit: 1 })`) — as the family's progress now ("n of N months for <level>"). Older months show only whether the milestone was hit and the "Level up" mark for levels earned in that month. Tiles stay the original four until badges load and against a 404; months before the start date show three tiles with neither.
10. **"Badges this week" (Task 17)** lists every family's levels dated in the week (up to four). It has its own switch in Build your recap's Include list (story format, on by default, stored in `recapInclude.story` with the other choices); the frame, the story viewer and the shared image all respect it.
11. **Level V colours (Task 13)** come from the coach accent: fill = accent mixed 78% toward black, glyph = 45% toward white.
12. **`POST /me/achievements/celebrated` (Task 10)** takes 1–50 UUIDs and answers `{ celebrated: n }`; anything else is 400 `invalid_ids`.
13. **The coach line's "n more" (Task 12)** is the next threshold minus the threshold just reached (canvas: "16 more nights for Diamond").
14. **The celebration's share image (Task 16)** is a 1080×1080 card through the recap export pipeline.
15. **One transaction for a goal save (Task 5).** The goal update and its `GoalChange` rows are written in one Prisma transaction; the usual bedtime is read before it starts. A failed history write saves neither, and the evaluation marker is left alone.
16. **The launch instant is the achievements migration's `finished_at` (Task 9).** The launch job walks every user: start dates and starting goals only where null, and the launch-day `onTime` fix (rows saved before the launch, false→true) for everyone, so a user whose first badge load beat the job still gets it, and a rerun changes nothing.
