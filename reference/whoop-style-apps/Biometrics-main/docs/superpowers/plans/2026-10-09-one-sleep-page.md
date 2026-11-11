# One Sleep Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge every sleep surface (the Sleep screen, `SleepNight`, ScoreDetail for SLEEP, the Activity night sheet and
MetricDetail for SLEEP) into one page, `Sleep { date? }`. It shows the selected night in full under a 7-night picker,
then the trends (bedtime to wake, regularity, the month), the bedtime goal and Ask Axo. The Recaps shelf moves to Home.

**Architecture:** The backend makes two additive changes and adds no bundle endpoint (spec §4.2):
- `GET /me/sleep` gains `mainMinutesAsleep`, `mainIsNap`, `bands` and `today` per night or response;
- `GET /me/sleep/night/:date` computes `usualMinutesAsleep` from main sessions and gains `mainIsNap`;
- both use one new rule, `isDaytimeNap`, in `biometrics/mainSession.ts`.

The app adds:
- `lib/sleepCopy.ts` (every string and pure helper) and `lib/useSleepPage.ts` (page-scoped sections through
  `useSection`, a night-scoped cache with a stale guard, a month cache);
- pixel moon art in `lib/moonArt.ts`, drawn by `components/sleep/MoonArt.tsx`;
- section components under `components/sleep/`;
- a rewritten `screens/SleepScreen.tsx`.

`navigation/sleepNavigation.ts` gains `openSleep` and repoints `openNight` to `Sleep { date }`, so the Recovery page's
Last night tile lands on this page. ScoreDetail becomes a redirect shim. MetricDetail for SLEEP redirects. The Activity
night sheet and `SleepNightScreen` are deleted. `RecapShelf` moves to Home.

**Tech Stack:** The backend is Express 5, Prisma 6 (Postgres) and BullMQ/ioredis, in TypeScript, tested with Jest and
supertest. The app is Expo 57 / React Native with NativeWind and React Navigation 7, tested with Jest and React Native
Testing Library. Pixel art is drawn with `react-native-svg`.

**Spec:** `docs/superpowers/specs/2026-10-09-one-sleep-page-design.md` (mockup draft 2 approved, owner decisions 1–8 of
2026-10-09). Read §3 for the sections, §4 for the data, §5 for navigation, §6 for states, §7 for accessibility, §8 for
components, §10 for tests, §12 for the owner decisions and §13 for the PR note.

## Global Constraints

- **Branch:** `feature/sleep-page`, in the worktree `/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab`.
  It is based on main `a4db948`, which includes the merged Recovery page (PR #59).
  - Never switch branches. Never push to main and never force-push.
  - Commits use plain `git commit -m "…"` with **no `Co-Authored-By` trailer and no mention of Claude or AI** (owner
    rule). This applies to every subagent. The PR body carries no attribution footer either.
- **Subagents** run on model **opus**.
- **Backend tests** run **only** through `.superpowers/sdd/2026-10-09-one-sleep-page/backend-jest.sh <paths>`, which
  Task 0 copies. It uses the test DB from `~/dev/biometrics-run/backend/.env` and Redis db 1.
  - Never run two invocations at once.
  - Never point tests at the dev `biometrics` DB.
  - A suite that fails or SIGSEGVs under full-suite load is rerun alone before it is treated as real.
- **Mobile tests** run from `mobile/`:
  `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit <paths>`.
- **Typecheck baselines:**
  - Backend `node node_modules/.bin/tsc --noEmit` is clean.
  - Mobile `node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` is **12**:
    `__tests__/api/client.test.tsx` (2), `ActivityHeatmap.test.tsx` (2), `FactorBar.test.tsx` (1), `ScoreRing.test.tsx`
    (1), `MetricDetailScreen.test.tsx` (5) and `App.tsx` (1).
  - No task may add an error. Deleting a file that holds baseline errors may lower the count, never raise it; record
    the new count in the ledger when it drops.
- **Type system A4** (spec §2.1):
  - Text sizes are tokens only: `text-score` / `text-number` / `text-display` / `text-heading` / `text-headline` /
    `text-body` / `text-caption` / `text-fine`.
  - `PageTitle` is used for the title ("SLEEP" drawn, "Sleep" spoken) and `SectionLabel` for eyebrows. Numbers are
    Geist tabular (`tabular-nums`).
  - No Instrument Serif, no inline `fontSize` / `fontFamily`, no arbitrary `text-[..px]`.
  - `__tests__/conventions/typography.test.ts` must stay green.
- **Buttons:**
  - Every button and link is `<Button>` from `components/ui/button` (shadcn Base port, neutral primary, `rounded-lg`,
    **no pills**).
  - A raw `Pressable` / `PressableScale` with `accessibilityRole="button"` or `"link"` needs an allowlist entry in
    `__tests__/conventions/buttons.test.ts`, with a count and a reason, added **in the task that adds it** (and an entry
    whose site disappears is removed in the task that removes it: a stale entry fails the guard).
  - Raw pressables with `accessibilityRole="tab"` or `"radio"` are not flagged by the guard.
- **Copy:** every new user-visible string comes from `mobile/src/lib/sleepCopy.ts` (dates and band words may come from
  `recoveryCopy.ts`, which `sleepCopy.ts` imports). Components never inline copy. A component that is only moved
  (`InBedShare`) keeps its existing strings.
- **Spoken labels** (accessibility labels) never contain "·" (U+00B7) or "−" (U+2212); tests assert it.
- **Hidden decoration:** future or non-navigable cells and pixel art carry `accessibilityElementsHidden` and
  `importantForAccessibility="no-hide-descendants"`.
- **Civil dates** (`YYYY-MM-DD`) are never parsed with `new Date('YYYY-MM-DD')` (that is UTC midnight, the previous day
  west of UTC). Use the component readers in `recoveryCopy.ts` / `lib/heatmap.ts`. 1 Oct 2026 is a **Thursday**, so
  8 Oct 2026 is a Thursday (the spec's "Wed 8 Oct" example is the board's illustration, not a real weekday). Copy tests
  also run under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`.
- **Bands:** the client always calls `scoreBand(score, bands)` with the live `bands`; never hard-coded numbers. Band
  words: Excellent / Good / Fair / **Low**. Verdicts: Restful / Solid / Restless / Rough night, with "Short night" as a
  quantity-only override at ≥ 60 min under the goal (decision 6).
- **Shared test fixtures** live in `mobile/jest-mocks/*Fixture.ts`, never under `__tests__` (jest runs those as empty
  suites).
- **No rule is duplicated** between backend and mobile without a test pinning it. The nap rule and the "usual" live
  only on the backend; the client reads `mainIsNap` and `usualMinutesAsleep`.
- **Privacy:** sleep values, dates and note text are never logged; handlers log nothing new. Coach prefills go in the
  input box and are never sent; they carry no numbers (`lib/coachPrompts.ts:5-8`). Buddy data never reaches the coach.
- **Campfire files are frozen:** `components/social/CampScene.tsx` and `CampBanner.tsx` are never touched.
- **Out of scope** (spec §9): scoring changes, a per-factor "why" card, the Recovery link line, regularity for an
  arbitrary anchor, deleting the `ScoreDetail` route and its now-unused components, the Activity steps calendar and the
  Activity Sleep calendar layout, the Home / Trends SLEEP tile series, Apple Health, new notifications, any change to
  the wind-down reminder or `BedtimeGoalScreen`.

## Plan rulings (made while writing the plan)

1. **Owner decisions 5–8 are binding** (spec §12):
   - 5: the Recaps shelf goes on Home after `HabitLogCard`, directly above `CoachDigestCard`, for every user. **Mockup
     first:** Task 4b publishes a one-board mockup of Home with the shelf (and the dimmed-moon states, the other
     off-board UI of spec §11). Like the Recovery plan's 4b, the gate blocks the **final draft PR (Task 12)**, not
     intermediate tasks.
   - 6: verdicts by `scoreBand`; "Short night" overrides on any band when main sleep is ≥ 60 min under the goal.
   - 7: an info sheet mirroring Recovery's.
   - 8: the Activity night sheet is deleted; a sleep cell opens `Sleep { date }`; "Steps that day" moves onto the
     page's "The night" card.
2. **Lessons from the Recovery build, baked in up front** (each was a review finding there):
   - The page hook refreshes quietly: a loading state only before the first data, a failed refresh keeps what is on
     screen, a `requestId` guard drops stale answers, the first focus (the mount) fetches nothing extra, and a refocus
     refreshes when the shown week contains today, even when today came as an explicit `date` param.
   - Tapping the already-selected night (picker cell, chart bar, month cell) is a no-op: no `setParams`, no scroll.
   - "Today" comes from the server: `GET /me/sleep` gains `today` (ruling 3). The device clock is only the first guess.
   - Spoken labels avoid "·" and "−"; future and non-navigable cells are hidden from screen readers.
   - Shared fixtures go in `mobile/jest-mocks/sleepPageFixture.ts`.
   - Weekday fixtures are real dates; copy tests run under two far-apart TZs.
3. **`GET /me/sleep` also returns `today`** (the user's local civil date, `localCivilDateOrUtc(now, user.timezone)`).
   The spec's "today" lessons need a server source, and this endpoint is the page's first read. It is additive.
4. **The new client fields are optional in the TS types** (`mainMinutesAsleep?`, `mainIsNap?`, `bands?`, `today?`).
   `fetchSleep` / `fetchSleepNight` always fill them (older-server defaults), but optional types keep the dozens of
   existing `SleepNight` test fixtures compiling (tsc baseline 12). Every reader goes through `mainMinutes(n)` and
   `isNapOnly(n)` in `lib/sleepStats.ts`.
5. **A nap-only date is not a night** anywhere on the page: the picker shows "—", the chart, month grid and month stats
   skip it, and the default night skips it. The Activity Sleep calendar reads the same `mainSleepByDate` helper, so a
   night has one number (and one existence) across the app.
6. **The page-scoped nights fetch is keyed by the anchor only:** `[min(A − 13, monthStart(A)), min(today, monthEnd(A))]`.
   A picker or chart tap inside the week never refetches it. When D's month differs from A's month (D in the last
   days of the previous month), that month loads through the month cache. This replaces the spec's
   `monthStart(D)` / `monthEnd(D)` form, which would refetch on such taps.
7. **D without a param re-resolves after each nights load:** a sync that lands last night moves the page onto it. With
   a param, D never moves.
8. **Hero delta:** "vs yesterday" only when D is today and the previous score is D − 1 (spec §3.2). A past night whose
   previous score is the day before reads that weekday ("vs Sun").
9. **Info-sheet weights** are the night's factor weights from the score DTO (renormalised around excluded factors);
   excluded factors are omitted; with no score row there is no weights line.
10. **Night load errors share one retry card** (`sleep-night-retry`) in place of the hero, the summary and the night
    cards. The picker and the page-scoped cards still render.
11. **The month grid uses `lib/calendarGrid.ts` `monthCells`** (Monday-first, future days present), not
    `heatmap.monthGrid` (Sunday-first, future days dropped), because the spec wants Monday-first with muted future
    cells. Heat levels still come from `sleepHeatLevel`.
12. **Picker cells are `accessibilityRole="tab"`**, which the buttons guard does not flag, so they get **no** allowlist
    entry (spec §10 lists one; it would match zero sites and fail as stale). Month cells are buttons and are allowlisted.
13. **The moon is drawn at 5 pt per cell (125 × 100)**, not the board's 120 × 96 (4.8 pt). `react-native-svg` has no
    `shapeRendering` (see `WeatherIcon.tsx:10-11`), so only whole-point cells stay crisp.
14. **Selected chart bar:** full `metricSleep` with a 2 px foreground ring and 2 px gap; the other bars `metricSleep` at
    45%. The goal window is a 10% `metricSleep` band with dashed top and bottom edges.
15. **`SegmentedControl` is reused unchanged** (spec §8). It has no `accessibilityLabel` prop, so the §3.9 "Range" label
    is dropped; the control is a `tablist` whose two tabs read "Week" and "2 weeks".
16. **The Activity tab accepts `{ date?: string }`** and opens that day's steps sheet once, then clears the param. So the
    "Steps that day" link always shows (spec §3.8's "hidden when Activity cannot open a date" never applies).
17. **ScoreDetail becomes a pure redirect shim** for both types (SLEEP → `Sleep { date }`, otherwise → `Recovery`). Its
    body and imports go; `FactorBar`, `factorBarScale`, `BaselineProgressRing` and `buildBaselineSentence` stay for the
    later clean-up (spec §8). `scoreQuestion` is deleted (its only importer was ScoreDetail).
18. **Coach prefills carry no numbers:** `sleepQuestion` names the night by `formatLongDay` only.
19. **The PR body calls out the "usual" fix** (spec §13) as an intentional correction, with one sentence on who sees it
    move (anyone who naps).

## Review Focus

1. **A sync lands last night while the page is open (opened from Activity "Sleep details", no param):**
   - Expected: before the sync D is the newest night (yesterday) and the picker says "Last night isn't in yet.";
     after the sync the page moves onto last night with no full-page spinner.
   - Pinned in Task 3 (D re-resolves on a window refresh) and Task 5 (still-syncing caption).
2. **The device clock and the user's timezone disagree near midnight (a traveller):**
   - Expected: the picker's "Last" cell, the hero's "vs yesterday" and the future clamp all follow the server's `today`.
   - Pinned in Task 1 (`today` for a Pacific/Kiritimati user) and Task 3 (server today replaces the device guess and
     the window refetches).
3. **A nap-only date, and a night with naps:**
   - Expected: the nap-only date reads "No sleep recorded · Only a nap was recorded" with "Only a nap: 20m at 2:10 pm",
     shows "—" in the picker and a gap in the month, and is never the default night; a night with naps shows main sleep
     with "main sleep · 7h 32m with a nap" and lists the nap in "The night".
   - Pinned in Tasks 1, 2, 3, 5, 6 and 9.
4. **An old night opened from the month or the Activity calendar (D < today − 6):**
   - Expected: the picker and chart anchor on D's own week, back leaves the page in one step, Ask says "this night",
     Prev month is disabled at `earliestDate`'s month and Next at the current month.
   - Pinned in Task 3 (anchor and range) and Tasks 5 and 9.
5. **Large text and a short but solid night:**
   - Expected: a 66 (Good) night 70 min under goal reads "Short night" with the band word still "Good"; picker and month
     cells keep `numberOfLines={1}`.
   - Pinned in Task 2 (verdict) and Tasks 5 and 9.

---

### Task 0: Workspace (controller; no code)

- [ ] **Step 1:** Create the workspace with
  `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-09-one-sleep-page.md`,
  so that `.superpowers/sdd/2026-10-09-one-sleep-page/` exists. The first line of `progress.md` is
  `# SDD ledger — plan: docs/superpowers/plans/2026-10-09-one-sleep-page.md`. Copy `common-context.md`,
  `implementer-instructions.md` and `reviewer-instructions.md` from `.superpowers/sdd/2026-10-08-type-system/`, then
  edit the branch (`feature/sleep-page`), plan and spec names.
- [ ] **Step 2:** Copy `.superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh` to
  `.superpowers/sdd/2026-10-09-one-sleep-page/backend-jest.sh`. Its `cd` already targets this worktree's `backend/`.
- [ ] **Step 3:** From `mobile/`, run the typecheck and save the error lines to
  `.superpowers/sdd/2026-10-09-one-sleep-page/tsc-baseline.txt`. Confirm the count is 12. Run backend `tsc --noEmit`
  and confirm it is clean.
- [ ] **Step 4:** Write the nineteen plan rulings above into the ledger as `Ruling: … — why — cost` lines.
- [ ] **Step 5:** Record the execution order in the ledger:
  - subagent-driven (owner choice);
  - Task 1 (backend), Task 2 (mobile data and copy) and Task 4 (moon art) may run in parallel;
  - Task 3 follows Task 2; Task 4b (owner gate) may run any time after Task 4;
  - Tasks 5 → 6 → 7 → 8 → 9 → 10 → 11 run strictly in order, because they share `SleepScreen.tsx`, its test file and
    the buttons guard;
  - Task 12 runs last and waits for the 4b approval.

---

### Task 1: Backend — the nap rule, main-sleep fields on `/me/sleep`, a main-sleep "usual"

**Files:**
- Modify: `backend/src/biometrics/mainSession.ts` (add `isDaytimeNap` after `pickMainSession`).
- Modify: `backend/src/biometrics/activity.ts:67-174` (`SleepNightDTO`, `SleepActivityDTO`, `getSleepForUser`).
- Modify: `backend/src/biometrics/sleepNight.ts:14-114` (`SleepNightDetailDTO`, `getSleepNight`, new
  `usualMainMinutes`).
- Test: `backend/tests/biometrics/mainSession.test.ts`, `backend/tests/biometrics/routes.test.ts` (the
  `GET /me/sleep` describe, `:185-425`) and `backend/tests/biometrics/sleepNight.test.ts`.

**Interfaces:**
- Produces, used by Task 2's client types:
  - `isDaytimeNap(main: { startTime: Date; startUtcOffsetSeconds?: number | null; minutesAsleep: number }, timeZone: string): boolean`
  - `usualMainMinutes(sessions: Array<{ startTime: Date; endTime: Date; endUtcOffsetSeconds: number | null; minutesAsleep: number }>, date: string, timeZone: string): number | null`
  - `SleepNightDTO` gains `mainMinutesAsleep: number | null` and `mainIsNap: boolean`.
  - `SleepActivityDTO` gains `bands: ScoreBands` and `today: string`.
  - `SleepNightDetailDTO` gains `mainIsNap: boolean`; `usualMinutesAsleep` now means the mean **main-session** minutes.
  - `getSleepForUser(userId, range, now = new Date())`.

- [ ] **Step 1: Write the failing tests.**

  Append to `backend/tests/biometrics/mainSession.test.ts` (change its import to
  `import { isDaytimeNap, pickMainSession } from '../../src/biometrics/mainSession';`):

```ts
describe('isDaytimeNap', () => {
  const nap = (startIso: string, minutesAsleep: number, startUtcOffsetSeconds: number | null = 0) =>
    ({ startTime: new Date(startIso), startUtcOffsetSeconds, minutesAsleep });

  it('is a nap from 10:00 up to, not including, 18:00 local', () => {
    expect(isDaytimeNap(nap('2026-10-01T09:59:00Z', 60), 'UTC')).toBe(false);
    expect(isDaytimeNap(nap('2026-10-01T10:00:00Z', 60), 'UTC')).toBe(true);
    expect(isDaytimeNap(nap('2026-10-01T17:59:00Z', 60), 'UTC')).toBe(true);
    expect(isDaytimeNap(nap('2026-10-01T18:00:00Z', 60), 'UTC')).toBe(false);
  });

  it('is a nap only under 180 minutes asleep', () => {
    expect(isDaytimeNap(nap('2026-10-01T13:00:00Z', 179), 'UTC')).toBe(true);
    expect(isDaytimeNap(nap('2026-10-01T13:00:00Z', 180), 'UTC')).toBe(false);
  });

  it("reads the start on the session's own offset first", () => {
    // 07:30Z at +05:30 is 13:00 local.
    expect(isDaytimeNap(nap('2026-10-01T07:30:00Z', 40, 19800), 'UTC')).toBe(true);
  });

  it('falls back to the timezone, across a DST change', () => {
    // New York leaves DST on Sun 1 Nov 2026: 14:30Z is 10:30 EDT on Sat 31 Oct, 09:30 EST on Sun 1 Nov.
    expect(isDaytimeNap(nap('2026-10-31T14:30:00Z', 40, null), 'America/New_York')).toBe(true);
    expect(isDaytimeNap(nap('2026-11-01T14:30:00Z', 40, null), 'America/New_York')).toBe(false);
  });
});
```

  In `backend/tests/biometrics/routes.test.ts`, add the imports
  `import { getLiveConfig } from '../../src/scoring/configs';` and
  `import { localCivilDate } from '../../src/biometrics/civilDate';`. Update every existing `toEqual` on
  `res.body.nights` in the `GET /me/sleep` describe to carry the two new fields, using a helper next to `NO_DEPTH`:
  `const MAIN = (minutes: number) => ({ mainMinutesAsleep: minutes, mainIsNap: false });`. The expected values are:
  - 'returns each night on the date it ended…' → `...MAIN(467)`;
  - "falls back to the user's timezone…" → `...MAIN(430)`;
  - 'sums a nap into the minutes…' → `...MAIN(420)` (`minutesAsleep` stays 455: the day total keeps its meaning);
  - 'takes the main sleep by minutes asleep…' → `...MAIN(205)`;
  - any other `toEqual` over a whole night in that describe (`grep -n "toEqual(\[" tests/biometrics/routes.test.ts`):
    add the main session's minutes and `mainIsNap: false`.

  Then append to the same describe:

```ts
  it('adds the main session minutes beside the day total, and whether the main session is a daytime nap', async () => {
    const user = await createUser('sleep-main-minutes');
    await seedNight(user.id, '2026-09-11T23:30:00Z', '2026-09-12T07:00:00Z', 420);
    await seedNight(user.id, '2026-09-12T14:00:00Z', '2026-09-12T14:40:00Z', 35);
    // Only a nap on the 13th: 13:00-13:50 UTC, 45 min asleep.
    await seedNight(user.id, '2026-09-13T13:00:00Z', '2026-09-13T13:50:00Z', 45);

    const res = await getSleep(user.id, { from: '2026-09-12', to: '2026-09-13' });

    expect(res.body.nights.map((n: { date: string; minutesAsleep: number; mainMinutesAsleep: number | null; mainIsNap: boolean }) =>
      [n.date, n.minutesAsleep, n.mainMinutesAsleep, n.mainIsNap])).toEqual([
      ['2026-09-12', 455, 420, false],
      ['2026-09-13', 45, 45, true],
    ]);
  });

  it('has a null main session for a SLEEP rollup with no sessions behind it', async () => {
    const user = await createUser('sleep-rollup-only');
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 400, recordedAt: new Date('2026-09-14') } });

    const res = await getSleep(user.id, { from: '2026-09-14', to: '2026-09-14' });

    expect(res.body.nights[0]).toMatchObject({ minutesAsleep: 400, mainMinutesAsleep: null, mainIsNap: false });
  });

  it("sends the live score bands and the user's own today", async () => {
    const user = await createUser('sleep-bands-today');
    await prisma.user.update({ where: { id: user.id }, data: { timezone: 'Pacific/Kiritimati' } });

    const res = await getSleep(user.id, { from: '2026-09-01', to: '2026-09-02' });

    expect(res.body.bands).toEqual(getLiveConfig().scoreBands);
    // UTC+14: often a day ahead of UTC.
    expect(res.body.today).toBe(localCivilDate(new Date(), 'Pacific/Kiritimati'));
  });

  it('never logs sleep values or dates', async () => {
    const user = await createUser('sleep-logs');
    await seedNight(user.id, '2026-09-16T23:00:00Z', '2026-09-17T07:00:00Z', 437);
    const log = jest.spyOn(console, 'log');
    const err = jest.spyOn(console, 'error');

    await getSleep(user.id, { from: '2026-09-17', to: '2026-09-17' });

    const logged = [...log.mock.calls, ...err.mock.calls].flat().map(String).join(' ');
    expect(logged).not.toMatch(/437/);
    expect(logged).not.toContain('2026-09-17');
    log.mockRestore();
    err.mockRestore();
  });
```

  In `backend/tests/biometrics/sleepNight.test.ts`:
  - add `mainIsNap: false,` to the first test's full `toEqual` (after `usualMinutesAsleep: null`);
  - **replace** the whole `describe('usualMinutesAsleep', …)` block (`:141-181`) with the block below (the old one seeded
    SLEEP rollups only, which the new rule ignores);
  - append the nap-only and log tests.

```ts
  describe('usualMinutesAsleep', () => {
    // A main session ending 07:00 UTC on `date`, 8 hours long.
    function nightEnding(date: string, minutesAsleep: number): SleepSessionPoint {
      const end = at(`${date}T07:00:00Z`);
      return { startTime: new Date(end.getTime() - 8 * 3600_000), endTime: end, minutesAsleep, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 };
    }
    // Nights ending 2026-09-29, 09-28, ... (all inside the 30 nights before 09-30).
    const before = (i: number) => `2026-09-${String(29 - i).padStart(2, '0')}`;
    const TONIGHT = nightEnding('2026-09-30', 300);

    it('is null when only 6 of the previous 30 nights have a main session', async () => {
      const user = await createUser('night-usual-6');
      await storeSleepSessions(user.id, [...[400, 410, 420, 430, 440, 450].map((m, i) => nightEnding(before(i), m)), TONIGHT]);

      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBeNull();
    });

    it('is the rounded mean of the previous main sessions once 7 have one, excluding tonight and older nights', async () => {
      const user = await createUser('night-usual-7');
      await storeSleepSessions(user.id, [
        ...[400, 410, 420, 430, 440, 450, 401].map((m, i) => nightEnding(before(i), m)),
        // 31 nights back: outside the window.
        nightEnding('2026-08-30', 10),
        TONIGHT,
      ]);

      // (400+410+420+430+440+450+401) / 7 = 421.57
      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBe(422);
    });

    it('averages main sessions only: a nap in the window does not raise it', async () => {
      const user = await createUser('night-usual-nap');
      await storeSleepSessions(user.id, [
        ...Array.from({ length: 7 }, (_, i) => nightEnding(before(i), 400)),
        { startTime: at('2026-09-29T14:00:00Z'), endTime: at('2026-09-29T15:00:00Z'), minutesAsleep: 55, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 },
        TONIGHT,
      ]);

      // The old rule (SLEEP rollups, naps included) gave round(455 + 6 * 400) / 7 = 408.
      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBe(400);
    });

    it('ignores SLEEP rollups with no sessions behind them', async () => {
      const user = await createUser('night-usual-rollups');
      await prisma.biometricRecord.createMany({
        data: Array.from({ length: 7 }, (_, i) => ({ userId: user.id, metricType: 'SLEEP' as const, value: 400, recordedAt: new Date(Date.UTC(2026, 8, 29 - i)) })),
      });
      await storeSleepSessions(user.id, [TONIGHT]);

      expect((await getNight(user.id, '2026-09-30')).body.usualMinutesAsleep).toBeNull();
    });
  });

  it('flags a date whose main session is a daytime nap', async () => {
    const user = await createUser('night-nap-only');
    await storeSleepSessions(user.id, [{
      startTime: at('2026-09-24T14:10:00Z'), endTime: at('2026-09-24T14:35:00Z'), minutesAsleep: 20,
      startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0,
    }]);

    const res = await getNight(user.id, '2026-09-24');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ minutesAsleep: 20, bedtime: '14:10', mainIsNap: true, naps: [] });
  });

  it('never logs sleep values or dates', async () => {
    const user = await createUser('night-logs');
    await storeSleepSessions(user.id, [NIGHT, NAP]);
    const log = jest.spyOn(console, 'log');
    const err = jest.spyOn(console, 'error');

    await getNight(user.id, '2026-09-20');

    const logged = [...log.mock.calls, ...err.mock.calls].flat().map(String).join(' ');
    expect(logged).not.toMatch(/\b420\b/);
    expect(logged).not.toContain('2026-09-20');
    log.mockRestore();
    err.mockRestore();
  });
```

- [ ] **Step 2: Run the tests and confirm they fail** with
  `bash .superpowers/sdd/2026-10-09-one-sleep-page/backend-jest.sh tests/biometrics/mainSession.test.ts tests/biometrics/routes.test.ts tests/biometrics/sleepNight.test.ts`.
  Expected: FAIL — `isDaytimeNap` is not exported, and the new fields are missing.

- [ ] **Step 3: Implement.**

```ts
// backend/src/biometrics/mainSession.ts — append below pickMainSession
import { localClockTime } from './civilDate';

// The nap rule (spec 2026-10-09 one-sleep-page §4.3): a date whose main session starts between 10:00 and 18:00 local
// and has under 180 minutes asleep has no night, only a nap. Display only: scoring never reads it. It lives only here;
// the app reads the `mainIsNap` flag.
export const NAP_WINDOW_START_MINUTES = 10 * 60;
export const NAP_WINDOW_END_MINUTES = 18 * 60;
export const NAP_MAX_MINUTES_ASLEEP = 180;

export function isDaytimeNap(
  main: { startTime: Date; startUtcOffsetSeconds?: number | null; minutesAsleep: number },
  timeZone: string,
): boolean {
  const [h, m] = localClockTime(main.startTime, main.startUtcOffsetSeconds, timeZone).split(':').map(Number);
  const local = h! * 60 + m!;
  return local >= NAP_WINDOW_START_MINUTES && local < NAP_WINDOW_END_MINUTES && main.minutesAsleep < NAP_MAX_MINUTES_ASLEEP;
}
```

  Put the `import` at the top of the file. `civilDate.ts` does not import `mainSession.ts`, so there is no cycle.

  In `activity.ts`:

```ts
// imports (add)
import { getLiveConfig } from '../scoring/configs';
import type { ScoreBands } from '../scoring/configs/v1';
import { civilDateToUtcMidnight, localCivilDateOrUtc, localClockTime, sessionEndCivilDate } from './civilDate';
import { isDaytimeNap, pickMainSession } from './mainSession';

// SleepNightDTO (add after hasStages)
  /** The main session's minutes asleep (the page's one night duration); null with a rollup but no sessions. */
  mainMinutesAsleep: number | null;
  /** The main session is a daytime nap (isDaytimeNap): the date has no night. */
  mainIsNap: boolean;

// SleepActivityDTO (add after stagesBackfillPending)
  // The live score bands, so the client colours sleepScore the way the score routes do.
  bands: ScoreBands;
  // The user's local civil date, so the client's "today" follows the server, not the device clock.
  today: string;
```

  Change the signature to
  `export async function getSleepForUser(userId: string, range: ActivityRange, now: Date = new Date()): Promise<SleepActivityDTO>`.
  Inside the `records.map` return object, after `hasStages`, add:

```ts
        mainMinutesAsleep: main ? main.minutesAsleep : null,
        mainIsNap: main ? isDaytimeNap(main, timeZone) : false,
```

  and after `stagesBackfillPending` in the returned object:

```ts
    bands: getLiveConfig().scoreBands,
    today: localCivilDateOrUtc(now, timeZone),
```

  The `sessions` select already includes `startUtcOffsetSeconds` and `minutesAsleep`, which `isDaytimeNap` reads.
  Update the file comment of `getSleepForUser` ("the Sleep page of the activity heat map and its night sheet") to "the
  Sleep page, the Activity Sleep calendar and Home".

  In `sleepNight.ts`:

```ts
// imports (replace the mainSession import, add shiftDate)
import { shiftDate } from '../scoring/dates';
import { isDaytimeNap, pickMainSession } from './mainSession';

type HistorySession = { startTime: Date; endTime: Date; endUtcOffsetSeconds: number | null; minutesAsleep: number };

/**
 * Mean main-session minutes asleep over the 30 nights before `date`, by the same main-session rule as everything else;
 * null unless 7 or more of them have a main session (spec §4.3). Naps never count, so a nap day cannot raise it.
 */
export function usualMainMinutes(sessions: HistorySession[], date: string, timeZone: string): number | null {
  const first = shiftDate(date, -USUAL_WINDOW_NIGHTS);
  const byDate = new Map<string, HistorySession[]>();
  for (const s of sessions) {
    const d = sessionEndCivilDate(s, timeZone);
    if (d < first || d >= date) continue;
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  const mains = [...byDate.values()].map((own) => pickMainSession(own)).filter((m): m is HistorySession => m !== null);
  if (mains.length < USUAL_MIN_NIGHTS) return null;
  return Math.round(mains.reduce((sum, m) => sum + m.minutesAsleep, 0) / mains.length);
}
```

  In `getSleepNight`, replace the fourth `Promise.all` entry (the `biometricRecord.findMany` named `previous`) with:

```ts
    // Sessions ending in the 30 nights before D. A local date spans at most [D - 14h, D + 1d + 12h) in UTC, so a day
    // of margin each side holds them all; usualMainMinutes keeps only the right civil dates.
    prisma.sleepSession.findMany({
      where: { userId, endTime: { gte: new Date(day.getTime() - (USUAL_WINDOW_NIGHTS + 1) * DAY_MS), lt: new Date(day.getTime() + DAY_MS) } },
      select: { startTime: true, endTime: true, endUtcOffsetSeconds: true, minutesAsleep: true },
    }),
```

  rename the destructured `previous` to `history`, and in the returned object replace the `usualMinutesAsleep`
  expression with `usualMinutesAsleep: usualMainMinutes(history, date, timeZone),` and add
  `mainIsNap: isDaytimeNap(main, timeZone),`. Add `mainIsNap: boolean;` to `SleepNightDetailDTO` (documented "The main
  session is a daytime nap: the date has no night") and change the `usualMinutesAsleep` doc comment to "Mean
  main-session minutes asleep over the 30 nights before this date; null unless 7 or more have one." Update the route
  comment at `routes.ts:46-50` the same way ("the usual main-session minutes asleep").

- [ ] **Step 4: Run the tests and confirm they pass,** with the same three paths, then
  `tests/biometrics tests/scoring` (the existing scoring, regularity and goal suites must stay green). Run backend
  `node node_modules/.bin/tsc --noEmit`; it must be clean.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/biometrics/mainSession.ts backend/src/biometrics/activity.ts backend/src/biometrics/sleepNight.ts backend/src/biometrics/routes.ts backend/tests/biometrics/mainSession.test.ts backend/tests/biometrics/routes.test.ts backend/tests/biometrics/sleepNight.test.ts
git commit -m "feat(backend): main-sleep minutes, nap flag, bands and today on /me/sleep; main-session usual on the night"
```

---

### Task 2: Mobile data layer and copy

**Files:**
- Modify: `mobile/src/api/sleep.ts` (types and the two normalising fetches).
- Modify: `mobile/src/lib/sleepStats.ts` (add `mainMinutes`, `isNapOnly`, `mainSleepByDate`).
- Create: `mobile/src/lib/sleepCopy.ts`.
- Modify: `mobile/src/lib/coachPrompts.ts` (add `sleepQuestion`).
- Create: `mobile/jest-mocks/sleepPageFixture.ts` (used by Tasks 3 and 5–11).
- Test: `mobile/__tests__/api/sleep.test.ts`, `mobile/__tests__/lib/sleepStats.test.ts`,
  `mobile/__tests__/lib/sleepCopy.test.ts` (new).

**Interfaces:**
- Consumes Task 1's wire fields.
- Produces:
  - `SleepNight` gains `mainMinutesAsleep?: number | null; mainIsNap?: boolean`; `SleepActivityDTO` gains
    `bands?: ScoreBandsDTO; today?: string | null`; `SleepNightDetail` gains `mainIsNap?: boolean`.
  - `mainMinutes(n: SleepNight): number`, `isNapOnly(n: SleepNight): boolean`,
    `mainSleepByDate(nights: Iterable<SleepNight>): SleepByDate`.
  - From `sleepCopy.ts`: `SHORT_NIGHT_MINUTES`, `sleepVerdict`, `sleepHeroLine`, `heroA11y`, `buildingHero`,
    `noScoreHero`, `noNightHero`, `nightEyebrow`, `durationCaption`, `usualPart`, `goalPart`, `summaryLine`,
    `summaryA11y`, `formatHm`, `regularityWord`, `spreadLine`, `regularityA11y`, `goalRowLine`, `goalRowA11y`,
    `askLabel`, `pickerWeekday`, `pickerCellLabel`, `monthCellLabel`, `infoWeights`, `infoBands`, `SLEEP_COPY` (exact
    signatures in Step 3).
  - `sleepQuestion(date: string, isLastNight: boolean, hasNight: boolean): string`.
  - Fixture exports: `TODAY`, `BANDS`, `GOAL`, `REMINDER`, `REGULARITY`, `makeNight`, `makeWindow`, `makeDetail`,
    `makeScore`.

- [ ] **Step 1: Write the failing tests.**

  In `mobile/__tests__/api/sleep.test.ts`, add `import { DEFAULT_SCORE_BANDS } from '../../src/lib/scoreInsights';`.
  Update both existing `fetchSleep` `toEqual`s: each night gains `mainMinutesAsleep: 420, mainIsNap: false`, and the
  result gains `bands: DEFAULT_SCORE_BANDS, today: null`. Update the existing `fetchSleepNight` `toEqual`(s) with
  `mainIsNap: false`. Then add:

```ts
describe('fetchSleep: one-page fields', () => {
  it('passes the server fields through', async () => {
    const bands = { excellent: 80, good: 60, fair: 45 };
    (apiFetch as jest.Mock).mockResolvedValue({
      nights: [{ ...night, mainMinutesAsleep: 400, mainIsNap: true }], earliestDate: null, stagesBackfillPending: false, bands, today: '2026-10-08',
    });
    const res = await fetchSleep('2026-10-01', '2026-10-08');
    expect(res.nights[0]).toMatchObject({ minutesAsleep: 420, mainMinutesAsleep: 400, mainIsNap: true });
    expect(res.bands).toEqual(bands);
    expect(res.today).toBe('2026-10-08');
  });

  it('falls back to the day total when the server has no main session for the date', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ nights: [{ ...night, mainMinutesAsleep: null, mainIsNap: false }], earliestDate: null });
    expect((await fetchSleep('2026-10-01', '2026-10-01')).nights[0]!.mainMinutesAsleep).toBe(420);
  });
});

describe('fetchSleepNight: nap flag', () => {
  it('defaults mainIsNap to false for an older server and passes true through', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ date: '2026-10-01', naps: [] }).mockResolvedValueOnce({ date: '2026-10-01', naps: [], mainIsNap: true });
    expect((await fetchSleepNight('2026-10-01')).mainIsNap).toBe(false);
    expect((await fetchSleepNight('2026-10-01')).mainIsNap).toBe(true);
  });
});
```

  Append to `mobile/__tests__/lib/sleepStats.test.ts` (add `isNapOnly, mainMinutes, mainSleepByDate` to its import from
  `../../src/lib/sleepStats` and `import { makeNight } from '../../jest-mocks/sleepPageFixture';`):

```ts
describe('main sleep', () => {
  it('reads the main session, falling back to the day total for an older server', () => {
    expect(mainMinutes(makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: 418 }))).toBe(418);
    expect(mainMinutes(makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: undefined }))).toBe(438);
    expect(isNapOnly(makeNight('2026-10-07', { mainIsNap: true }))).toBe(true);
    expect(isNapOnly(makeNight('2026-10-07', { mainIsNap: undefined }))).toBe(false);
  });

  it('keys nights by date with main-sleep minutes and drops nap-only dates', () => {
    const byDate = mainSleepByDate([
      makeNight('2026-10-06', { minutesAsleep: 455, mainMinutesAsleep: 420 }),
      makeNight('2026-10-07', { minutesAsleep: 45, mainMinutesAsleep: 45, mainIsNap: true }),
    ]);
    expect([...byDate.keys()]).toEqual(['2026-10-06']);
    expect(byDate.get('2026-10-06')!.minutesAsleep).toBe(420);
  });
});
```

  Create `mobile/__tests__/lib/sleepCopy.test.ts`:

```ts
import {
  askLabel, buildingHero, durationCaption, formatHm, goalPart, goalRowA11y, goalRowLine, heroA11y, infoBands, infoWeights,
  monthCellLabel, nightEyebrow, noNightHero, noScoreHero, pickerCellLabel, pickerWeekday, regularityA11y, regularityWord,
  SLEEP_COPY, sleepHeroLine, sleepVerdict, spreadLine, summaryA11y, summaryLine, usualPart,
} from '../../src/lib/sleepCopy';
import { sleepQuestion } from '../../src/lib/coachPrompts';
import type { FactorDTO } from '../../src/api/scores';
import type { WindDownSettings } from '../../src/lib/windDown';
import { BANDS, GOAL, REMINDER, TODAY } from '../../jest-mocks/sleepPageFixture';

const SPOKEN_FORBIDDEN = /[·−]/;

describe('verdict (decision 6)', () => {
  const v = (score: number, mainMinutes: number | null = 450, goalMinutes: number | null = 480) => sleepVerdict({ score, bands: BANDS, mainMinutes, goalMinutes });
  it('names each live band', () => {
    expect([80, 60, 45, 20].map((s) => v(s))).toEqual(['Restful night', 'Solid night', 'Restless night', 'Rough night']);
    expect(v(74.9)).toBe('Solid night');
    expect(v(75)).toBe('Restful night');
  });
  it('Short night overrides any band at 60 min or more under the goal, by quantity only', () => {
    expect(v(80, 420)).toBe('Short night');
    expect(v(80, 421)).toBe('Restful night');
    expect(v(66, 410)).toBe('Short night');
    expect(v(20, 300)).toBe('Short night');
  });
  it('without a night or a goal there is no override', () => {
    expect(v(80, null)).toBe('Restful night');
    expect(v(80, 300, null)).toBe('Restful night');
  });
});

describe('hero line', () => {
  const base = { score: 78, bands: BANDS, date: TODAY, today: TODAY, confidence: 'HIGH' as const };
  it('vs yesterday only when D is today', () => {
    const l = sleepHeroLine({ ...base, previous: { date: '2026-10-07', score: 72 } });
    expect(l.text).toBe('Excellent · +6 vs yesterday · High confidence');
    expect(l.band).toBe('Excellent');
    expect(l.spoken).toBe('Up 6 from yesterday. High confidence.');
  });
  it('a past night reads the weekday, with a real minus sign', () => {
    // Mon 5 Oct 2026 (1 Oct is a Thursday).
    const l = sleepHeroLine({ ...base, score: 64, date: '2026-10-06', previous: { date: '2026-10-05', score: 70 } });
    expect(l.text).toBe('Good · −6 vs Mon · High confidence');
    expect(l.spoken).toBe('Down 6 from Monday. High confidence.');
  });
  it('within 7 days names the weekday; older or missing drops the delta', () => {
    expect(sleepHeroLine({ ...base, previous: { date: '2026-10-03', score: 70 } }).text).toBe('Excellent · +8 vs Sat · High confidence');
    expect(sleepHeroLine({ ...base, previous: { date: '2026-09-20', score: 70 } }).text).toBe('Excellent · High confidence');
    expect(sleepHeroLine({ ...base, previous: null }).text).toBe('Excellent · High confidence');
  });
  it('rounds before subtracting; zero reads same as', () => {
    const l = sleepHeroLine({ ...base, score: 72.4, confidence: 'MEDIUM', previous: { date: '2026-10-07', score: 71.6 } });
    expect(l.text).toBe('Good · same as yesterday · Medium confidence');
    expect(l.spoken).toBe('Same as yesterday. Medium confidence.');
  });
  it('the Low band word, never Poor', () => {
    expect(sleepHeroLine({ ...base, score: 20, previous: null }).band).toBe('Low');
  });
  it('the spoken hero is one sentence without · or −', () => {
    const label = heroA11y(78, 'Excellent', 'Restful night', 'Up 6 from yesterday. High confidence.');
    expect(label).toBe('Sleep score 78, Excellent, restful night. Up 6 from yesterday. High confidence.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
    expect(sleepHeroLine({ ...base, score: 64, date: '2026-10-06', previous: { date: '2026-10-05', score: 70 } }).spoken).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('hero states', () => {
  it('building counts nights', () => {
    expect(buildingHero({ metric: 'SLEEP_EFFICIENCY', daysCollected: 9, daysRequired: 14 })).toEqual({ numeral: 'Night 9 of 14', verdict: 'Learning your sleep', line: '5 nights to go' });
    expect(buildingHero({ metric: 'SLEEP_EFFICIENCY', daysCollected: 13, daysRequired: 14 }).line).toBe('1 night to go');
    expect(buildingHero(null)).toEqual({ numeral: '—', verdict: 'Learning your sleep', line: null });
  });
  it('no score yet: on its way for today and yesterday, else none', () => {
    expect(noScoreHero(TODAY, TODAY)).toEqual({ verdict: 'Score on its way', line: 'It appears a few minutes after your watch syncs' });
    expect(noScoreHero('2026-10-07', TODAY).verdict).toBe('Score on its way');
    expect(noScoreHero('2026-10-05', TODAY)).toEqual({ verdict: 'No score for this night', line: null });
  });
  it('no night: waiting today, nothing synced before, only a nap', () => {
    expect(noNightHero({ isToday: true, napOnly: false })).toEqual({ verdict: 'No sleep recorded', line: "Waiting for last night's data" });
    expect(noNightHero({ isToday: false, napOnly: false }).line).toBe('Nothing synced for this night');
    expect(noNightHero({ isToday: true, napOnly: true }).line).toBe('Only a nap was recorded');
  });
});

describe('night summary', () => {
  it('eyebrow: last night today, the short date otherwise (real weekdays)', () => {
    expect(nightEyebrow(TODAY, TODAY)).toBe('Last night · Thu 8 Oct');
    expect(nightEyebrow('2026-10-05', TODAY)).toBe('Mon 5 Oct');
  });
  it('duration caption with 0, 1 and several naps (zero-length naps dropped)', () => {
    expect(durationCaption(432, [])).toBe('asleep');
    expect(durationCaption(432, [20])).toBe('main sleep · 7h 32m with a nap');
    expect(durationCaption(432, [20, 15, 0])).toBe('main sleep · 7h 47m with naps');
  });
  it('usual part', () => {
    expect(usualPart(432, 420)).toBe('+12m vs your usual');
    expect(usualPart(412, 420)).toBe('−8m vs your usual');
    expect(usualPart(420.4, 420)).toBe('same as your usual');
    expect(usualPart(510, 420)).toBe('+1h 30m vs your usual');
    expect(usualPart(432, null)).toBeNull();
  });
  it('goal part, with the 5-minute edge', () => {
    expect(goalPart(432, 480)).toBe('48m short of your 8h goal');
    expect(goalPart(502, 480)).toBe('22m over your 8h goal');
    expect(goalPart(476, 480)).toBe('right on your 8h goal');
    expect(goalPart(475, 480)).toBe('5m short of your 8h goal');
    expect(goalPart(400, 450)).toBe('50m short of your 7h 30m goal');
  });
  it('summary line drops what is missing', () => {
    const p = { bedtime: '23:08', wakeTime: '06:40', mainMinutes: 432 };
    expect(summaryLine({ ...p, usual: 420, goal: 480 })).toBe('11:08 pm → 6:40 am · +12m vs your usual · 48m short of your 8h goal');
    expect(summaryLine({ ...p, usual: null, goal: 480 })).toBe('11:08 pm → 6:40 am · 48m short of your 8h goal');
    expect(summaryLine({ ...p, usual: null, goal: null })).toBe('11:08 pm → 6:40 am');
  });
  it('spoken summary (spec §7)', () => {
    const label = summaryA11y({ date: TODAY, mainMinutes: 432, bedtime: '23:08', wakeTime: '06:40', usual: 420, goal: 480 });
    expect(label).toBe('Night ending Thursday 8 October. 7 hours 12 minutes asleep. 11:08 pm to 6:40 am. 12 minutes more than usual. 48 minutes short of your 8 hour goal.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
    expect(summaryA11y({ date: TODAY, mainMinutes: 478, bedtime: '23:08', wakeTime: '06:40', usual: 478, goal: 480 })).toContain('Same as usual. Right on your 8 hour goal.');
  });
});

describe('numbers and words', () => {
  it('formatHm', () => {
    expect(formatHm(432)).toBe('7:12');
    expect(formatHm(302)).toBe('5:02');
    expect(formatHm(0)).toBe('0:00');
    expect(formatHm(59.6)).toBe('1:00');
  });
  it('regularity words at 50 and 75, spreads and the spoken card', () => {
    expect([75, 74, 50, 49].map(regularityWord)).toEqual(['Very regular', 'Fairly regular', 'Fairly regular', 'Irregular']);
    expect(spreadLine(24.4, 18)).toBe('Bedtime ±24m · Wake ±18m');
    expect(spreadLine(24, null)).toBe('Bedtime ±24m');
    expect(spreadLine(null, null)).toBeNull();
    const label = regularityA11y(74, 'Fairly regular', 24, 18);
    expect(label).toBe('Regularity 74, fairly regular. Bedtime varies by 24 minutes. Wake time varies by 18 minutes.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('goal row', () => {
  const off: WindDownSettings = { ...REMINDER, enabled: false };
  it('bed, wake, goal and the reminder', () => {
    expect(goalRowLine(GOAL, REMINDER)).toBe('Bed 10:45 pm · Wake 6:45 am · 8h · Reminder 30 min before');
    expect(goalRowLine(GOAL, off)).toBe('Bed 10:45 pm · Wake 6:45 am · 8h · Reminder off');
    expect(goalRowLine(GOAL, null)).toBe('Bed 10:45 pm · Wake 6:45 am · 8h');
  });
  it('the reminder needs a bedtime; unset reads the prompt', () => {
    expect(goalRowLine({ ...GOAL, bedtimeGoal: null }, REMINDER)).toBe('Wake 6:45 am · 8h');
    expect(goalRowLine({ sleepGoalMinutes: 450, bedtimeGoal: null, wakeGoal: null }, REMINDER)).toBe('Set a bedtime goal · 7h 30m');
  });
  it('spoken row', () => {
    const label = goalRowA11y(goalRowLine(GOAL, REMINDER));
    expect(label).toBe('Bedtime goal. Bed 10:45 pm, Wake 6:45 am, 8 hours, Reminder 30 min before.');
    expect(label).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('picker and month labels', () => {
  it('weekday, Last for today', () => {
    expect(pickerWeekday(TODAY, TODAY)).toBe('Last');
    expect(pickerWeekday('2026-10-02', TODAY)).toBe('Fri');
  });
  it('spoken cells (spec §7)', () => {
    expect(pickerCellLabel({ date: TODAY, today: TODAY, minutes: 432, band: 'Excellent' })).toBe('Thursday, last night, 7 hours 12 minutes, Excellent');
    expect(pickerCellLabel({ date: '2026-10-05', today: TODAY, minutes: null, band: null })).toBe('Monday, no sleep recorded');
    expect(pickerCellLabel({ date: '2026-10-04', today: TODAY, minutes: 514, band: null })).toBe('Sunday, 8 hours 34 minutes');
    expect(monthCellLabel('2026-10-02', 401)).toBe('Friday 2 October, 6 hours 41 minutes');
    expect(monthCellLabel('2026-10-06', null)).toBe('Tuesday 6 October, no sleep recorded');
    for (const l of [pickerCellLabel({ date: TODAY, today: TODAY, minutes: 432, band: 'Low' }), monthCellLabel('2026-10-02', 401)]) expect(l).not.toMatch(SPOKEN_FORBIDDEN);
  });
});

describe('info sheet', () => {
  const f = (factor: FactorDTO['factor'], label: string, weight: number, excluded = false): FactorDTO => ({ factor, label, z: 0, weight, contribution: 0, points: 0, imputed: false, excluded });
  it('the weights this night used, excluded factors omitted', () => {
    expect(infoWeights([f('SLEEP_DURATION', 'Sleep duration', 0.5), f('SLEEP_EFFICIENCY', 'Sleep efficiency', 0.3), f('CIRCADIAN_CONSISTENCY', 'Bedtime consistency', 0.2)]))
      .toBe('This night weighted sleep duration 50, sleep efficiency 30, bedtime consistency 20.');
    expect(infoWeights([f('SLEEP_DURATION', 'Sleep duration', 0.625), f('SLEEP_EFFICIENCY', 'Sleep efficiency', 0.375), f('CIRCADIAN_CONSISTENCY', 'Bedtime consistency', 0, true)]))
      .toBe('This night weighted sleep duration 63, sleep efficiency 38.');
    expect(infoWeights([])).toBeNull();
  });
  it('band ranges with their verdicts, and the Short night rule', () => {
    expect(infoBands(BANDS)).toEqual([
      'Restful night · Excellent · 75 and up',
      'Solid night · Good · 55–74',
      'Restless night · Fair · 40–54',
      'Rough night · Low · under 40',
      'Short night · 1h or more under your goal, on any band',
    ]);
    expect(infoBands(undefined)[0]).toBe('Restful night · Excellent · 75 and up');
  });
});

describe('ask and fixed strings', () => {
  it('ask labels', () => {
    expect(askLabel('Axo', true)).toBe('Ask Axo about last night');
    expect(askLabel('Axo', false)).toBe('Ask Axo about this night');
  });
  it('sleep questions name the night and carry no numbers from the page', () => {
    expect(sleepQuestion(TODAY, true, true)).toBe('How was my sleep last night?');
    expect(sleepQuestion('2026-10-05', false, true)).toBe('How was my sleep on Monday 5 October?');
    expect(sleepQuestion(TODAY, true, false)).toBe("Why don't I have sleep data for last night?");
    expect(sleepQuestion('2026-10-05', false, false)).toBe("Why don't I have sleep data for Monday 5 October?");
  });
  it('rows and captions', () => {
    expect(SLEEP_COPY.napRow(20, '14:10')).toBe('20m at 2:10 pm');
    expect(SLEEP_COPY.onlyNap(20, '14:10')).toBe('Only a nap: 20m at 2:10 pm');
    expect(SLEEP_COPY.nightsAtGoal(2, 8)).toBe('2 of 8');
    expect(SLEEP_COPY.stillSyncing(false)).toBe("Last night isn't in yet.");
    expect(SLEEP_COPY.stillSyncing(true)).toBe("Last night isn't in yet. Syncing…");
    expect(SLEEP_COPY.notEnoughNights(3)).toBe('Not enough nights yet. 3 more to go.');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail,** from `mobile/`:
  `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api/sleep.test.ts __tests__/lib/sleepStats.test.ts __tests__/lib/sleepCopy.test.ts`.
  Expected: FAIL — `Cannot find module '../../src/lib/sleepCopy'` and the fixture is missing.

- [ ] **Step 3: Implement.**

  `api/sleep.ts` — add `import type { ScoreBandsDTO } from './scores';` and
  `import { DEFAULT_SCORE_BANDS } from '../lib/scoreInsights';` (`scoreInsights.ts` imports only types from `api/`, so
  there is no cycle). Add to `SleepNight`:

```ts
  // The main session's minutes asleep: the page's one night duration (minutesAsleep stays the day total, naps
  // included, which scoring reads). fetchSleep always fills it; optional so older fixtures still type-check.
  mainMinutesAsleep?: number | null;
  // The main session is a daytime nap (server rule): the date has no night.
  mainIsNap?: boolean;
```

  to `SleepActivityDTO`:

```ts
  // The live score bands for colouring sleepScore; fetchSleep defaults an older server's to DEFAULT_SCORE_BANDS.
  bands?: ScoreBandsDTO;
  // The user's local today from the server; null from an older server (the device clock is used then).
  today?: string | null;
```

  and to `SleepNightDetail`: `mainIsNap?: boolean;` (same comment as on `SleepNight`). Change the
  `usualMinutesAsleep` comment to "Mean main-session minutes asleep over the 30 nights before; null unless 7 or more
  have one." Then:

```ts
export async function fetchSleep(from: string, to: string): Promise<SleepActivityDTO> {
  const res = await apiFetch<SleepActivityDTO>(`/me/sleep?from=${from}&to=${to}`);
  return {
    ...res,
    nights: res.nights.map((n) => ({
      ...n,
      minutesAwake: n.minutesAwake ?? null,
      stageMinutes: n.stageMinutes ?? null,
      hasStages: n.hasStages === true,
      // No main session (or an older server): the day total is the only figure there is.
      mainMinutesAsleep: n.mainMinutesAsleep ?? n.minutesAsleep,
      mainIsNap: n.mainIsNap === true,
    })),
    stagesBackfillPending: res.stagesBackfillPending === true,
    bands: res.bands ?? DEFAULT_SCORE_BANDS,
    today: res.today ?? null,
  };
}

export async function fetchSleepNight(date: string): Promise<SleepNightDetail> {
  const res = await apiFetch<SleepNightDetail>(`/me/sleep/night/${encodeURIComponent(date)}`);
  return {
    ...res,
    startUtcOffsetSeconds: res.startUtcOffsetSeconds ?? null,
    endUtcOffsetSeconds: res.endUtcOffsetSeconds ?? null,
    mainIsNap: res.mainIsNap === true,
  };
}
```

  `lib/sleepStats.ts` — append (keep `compareSleepToAverage` for now; Task 7 deletes it):

```ts
/** A night's one duration (spec §4.4): the main session's minutes asleep, or the day total from an older server. */
export function mainMinutes(n: SleepNight): number {
  return n.mainMinutesAsleep ?? n.minutesAsleep;
}

/** A date whose main session is a daytime nap has no night (server rule, read from the flag). */
export function isNapOnly(n: SleepNight): boolean {
  return n.mainIsNap === true;
}

/**
 * Nights by date for the calendars and their stats: minutesAsleep is main sleep and nap-only dates are dropped, so a
 * night has one number, and one existence, across the app (plan ruling 5).
 */
export function mainSleepByDate(nights: Iterable<SleepNight>): SleepByDate {
  const out = new Map<string, SleepNight>();
  for (const n of nights) if (!isNapOnly(n)) out.set(n.date, { ...n, minutesAsleep: mainMinutes(n) });
  return out;
}
```

  `lib/sleepCopy.ts`:

```ts
// Every Sleep page string and the pure helpers behind them (spec 2026-10-09 one-sleep-page §3, §7). Components never
// inline copy. Civil dates are read by their components, never as UTC instants.
import type { ColdStartDTO, ConfidenceLevel, FactorDTO, ScoreBandsDTO } from '../api/scores';
import type { SleepGoal } from '../api/sleep';
import { addDays } from './heatmap';
import { BAND_WORD, formatDayLong, formatDayShort, formatGoal, weekdayShort } from './recoveryCopy';
import { DEFAULT_SCORE_BANDS, scoreBand, type ScoreBand } from './scoreInsights';
import { formatClock, formatDuration, formatShortDuration, formatTextDuration } from './sleepStats';
import { spokenUnits } from './spokenUnits';
import type { WindDownSettings } from './windDown';

export const SHORT_NIGHT_MINUTES = 60;

const BAND_VERDICT: Record<ScoreBand, string> = {
  scoreExcellent: 'Restful night', scoreGood: 'Solid night', scoreFair: 'Restless night', scorePoor: 'Rough night',
};
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const local = (date: string) => { const [y, m, d] = parts(date); return new Date(y, m - 1, d); };
const weekdayLong = (date: string) => WEEKDAYS_LONG[local(date).getDay()]!;
const daysBetween = (a: string, b: string) => Math.round((local(b).getTime() - local(a).getTime()) / 86_400_000);
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const CONFIDENCE: Record<ConfidenceLevel, string> = { HIGH: 'High confidence', MEDIUM: 'Medium confidence', LOW: 'Low confidence' };

/** "7 hours 12 minutes" for screen readers. */
const spoken = (minutes: number) => spokenUnits(formatTextDuration(minutes));
/** "8 hour" / "7 hour 30 minute", the goal used as an adjective. */
const spokenGoal = (minutes: number) => spokenUnits(formatGoal(minutes)).replace(/(\d+) hours/, '$1 hour').replace(/(\d+) minutes/, '$1 minute');

/** Decision 6: the band's verdict, unless main sleep is 60+ minutes under the goal (quantity only, any band). */
export function sleepVerdict(p: { score: number; bands?: ScoreBandsDTO | null; mainMinutes: number | null; goalMinutes: number | null }): string {
  if (p.mainMinutes !== null && p.goalMinutes !== null && p.goalMinutes - p.mainMinutes >= SHORT_NIGHT_MINUTES) return 'Short night';
  return BAND_VERDICT[scoreBand(p.score, p.bands)];
}

/**
 * The hero line `band + lead + confidence` (spec §3.2), returned in parts so the hero can colour the band and a Low
 * confidence without inlining copy. "vs yesterday" only when D is today (plan ruling 8).
 */
export function sleepHeroLine(p: {
  score: number; bands?: ScoreBandsDTO | null; date: string; today: string;
  previous: { date: string; score: number } | null; confidence: ConfidenceLevel;
}): { band: string; lead: string; confidence: string; text: string; spoken: string } {
  const band = BAND_WORD[scoreBand(p.score, p.bands)];
  let delta = '';
  let spokenDelta = '';
  if (p.previous) {
    const gap = daysBetween(p.previous.date, p.date);
    if (gap >= 1 && gap <= 7) {
      const d = Math.round(p.score) - Math.round(p.previous.score);
      const yesterday = gap === 1 && p.date === p.today;
      const shown = yesterday ? 'yesterday' : weekdayShort(p.previous.date);
      const said = yesterday ? 'yesterday' : weekdayLong(p.previous.date);
      delta = d === 0 ? ` · same as ${shown}` : ` · ${signed(d)} vs ${shown}`;
      spokenDelta = d === 0 ? `Same as ${said}. ` : `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} from ${said}. `;
    }
  }
  const confidence = CONFIDENCE[p.confidence];
  const lead = `${delta} · `;
  return { band, lead, confidence, text: `${band}${lead}${confidence}`, spoken: `${spokenDelta}${confidence}.` };
}

export const heroA11y = (score: number, band: string, verdict: string, spokenLine: string) =>
  `Sleep score ${Math.round(score)}, ${band}, ${verdict.toLowerCase()}. ${spokenLine}`;

export function buildingHero(cold: ColdStartDTO | null): { numeral: string; verdict: string; line: string | null } {
  if (!cold) return { numeral: '—', verdict: 'Learning your sleep', line: null };
  const left = Math.max(0, cold.daysRequired - cold.daysCollected);
  return { numeral: `Night ${cold.daysCollected} of ${cold.daysRequired}`, verdict: 'Learning your sleep', line: `${left} ${left === 1 ? 'night' : 'nights'} to go` };
}

/** A night with no score row: on its way for today and yesterday (the score lands after the sync). */
export function noScoreHero(date: string, today: string): { verdict: string; line: string | null } {
  return date === today || date === addDays(today, -1)
    ? { verdict: 'Score on its way', line: 'It appears a few minutes after your watch syncs' }
    : { verdict: 'No score for this night', line: null };
}

export function noNightHero(p: { isToday: boolean; napOnly: boolean }): { verdict: string; line: string } {
  const line = p.napOnly ? 'Only a nap was recorded' : p.isToday ? "Waiting for last night's data" : 'Nothing synced for this night';
  return { verdict: 'No sleep recorded', line };
}

export const nightEyebrow = (date: string, today: string) => (date === today ? `Last night · ${formatDayShort(date)}` : formatDayShort(date));

/** "asleep", or the with-naps total beside main sleep (spec §3.4). */
export function durationCaption(mainMinutesAsleep: number, napMinutes: number[]): string {
  const naps = napMinutes.filter((m) => m > 0);
  if (naps.length === 0) return 'asleep';
  const total = mainMinutesAsleep + naps.reduce((sum, m) => sum + m, 0);
  return `main sleep · ${formatDuration(total)} with ${naps.length === 1 ? 'a nap' : 'naps'}`;
}

export function usualPart(mainMinutesAsleep: number, usual: number | null): string | null {
  if (usual === null) return null;
  const diff = Math.round(mainMinutesAsleep - usual);
  if (diff === 0) return 'same as your usual';
  return `${diff > 0 ? '+' : '−'}${formatShortDuration(Math.abs(diff))} vs your usual`;
}

export function goalPart(mainMinutesAsleep: number, goal: number): string {
  const diff = Math.round(mainMinutesAsleep - goal);
  const g = formatGoal(goal);
  if (Math.abs(diff) < 5) return `right on your ${g} goal`;
  return diff < 0 ? `${formatShortDuration(-diff)} short of your ${g} goal` : `${formatShortDuration(diff)} over your ${g} goal`;
}

export function summaryLine(p: { bedtime: string; wakeTime: string; mainMinutes: number; usual: number | null; goal: number | null }): string {
  return [
    `${formatClock(p.bedtime)} → ${formatClock(p.wakeTime)}`,
    usualPart(p.mainMinutes, p.usual),
    p.goal === null ? null : goalPart(p.mainMinutes, p.goal),
  ].filter(Boolean).join(' · ');
}

export function summaryA11y(p: { date: string; mainMinutes: number; bedtime: string; wakeTime: string; usual: number | null; goal: number | null }): string {
  const bits = [`Night ending ${formatDayLong(p.date)}.`, `${spoken(p.mainMinutes)} asleep.`, `${formatClock(p.bedtime)} to ${formatClock(p.wakeTime)}.`];
  if (p.usual !== null) {
    const d = Math.round(p.mainMinutes - p.usual);
    bits.push(d === 0 ? 'Same as usual.' : `${spoken(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than usual.`);
  }
  if (p.goal !== null) {
    const d = Math.round(p.mainMinutes - p.goal);
    bits.push(Math.abs(d) < 5 ? `Right on your ${spokenGoal(p.goal)} goal.` : `${spoken(Math.abs(d))} ${d < 0 ? 'short of' : 'over'} your ${spokenGoal(p.goal)} goal.`);
  }
  return bits.join(' ');
}

/** 432 -> "7:12": picker and month cells. */
export function formatHm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// The same thresholds the old regularityLine used (spec §3.10). "Regularity", never "consistency".
export const regularityWord = (score: number) => (score >= 75 ? 'Very regular' : score >= 50 ? 'Fairly regular' : 'Irregular');

export function spreadLine(bedtime: number | null, wake: number | null): string | null {
  const bits = [bedtime === null ? null : `Bedtime ±${Math.round(bedtime)}m`, wake === null ? null : `Wake ±${Math.round(wake)}m`].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

export function regularityA11y(score: number, word: string, bedtime: number | null, wake: number | null): string {
  let out = `Regularity ${Math.round(score)}, ${word.toLowerCase()}.`;
  if (bedtime !== null) out += ` Bedtime varies by ${spoken(Math.round(bedtime))}.`;
  if (wake !== null) out += ` Wake time varies by ${spoken(Math.round(wake))}.`;
  return out;
}

/** The board's goal row (spec §3.12). The reminder needs a bedtime, so it is only mentioned once one is set. */
export function goalRowLine(goal: SleepGoal, reminder: WindDownSettings | null): string {
  const g = formatGoal(goal.sleepGoalMinutes);
  if (!goal.bedtimeGoal && !goal.wakeGoal) return `Set a bedtime goal · ${g}`;
  const bits = [goal.bedtimeGoal ? `Bed ${formatClock(goal.bedtimeGoal)}` : null, goal.wakeGoal ? `Wake ${formatClock(goal.wakeGoal)}` : null, g];
  if (goal.bedtimeGoal && reminder) bits.push(reminder.enabled ? `Reminder ${reminder.leadMinutes} min before` : 'Reminder off');
  return bits.filter(Boolean).join(' · ');
}

export const goalRowA11y = (line: string) => `Bedtime goal. ${spokenUnits(line.split(' · ').join(', '))}.`;

export const askLabel = (coach: string, isLastNight: boolean) => (isLastNight ? `Ask ${coach} about last night` : `Ask ${coach} about this night`);

export const pickerWeekday = (date: string, today: string) => (date === today ? 'Last' : weekdayShort(date));

export function pickerCellLabel(p: { date: string; today: string; minutes: number | null; band: string | null }): string {
  const bits = [weekdayLong(p.date)];
  if (p.date === p.today) bits.push('last night');
  if (p.minutes === null) bits.push('no sleep recorded');
  else {
    bits.push(spoken(p.minutes));
    if (p.band) bits.push(p.band);
  }
  return bits.join(', ');
}

export const monthCellLabel = (date: string, minutes: number | null) =>
  `${formatDayLong(date)}, ${minutes === null ? 'no sleep recorded' : spoken(minutes)}`;

/** The weights this night's score used (plan ruling 9); excluded factors are left out. */
export function infoWeights(factors: FactorDTO[]): string | null {
  const used = factors.filter((f) => !f.excluded && f.weight > 0);
  if (used.length === 0) return null;
  return `This night weighted ${used.map((f) => `${f.label.toLowerCase()} ${Math.round(f.weight * 100)}`).join(', ')}.`;
}

export function infoBands(bands: ScoreBandsDTO | undefined): string[] {
  const b = bands ?? DEFAULT_SCORE_BANDS;
  return [
    `Restful night · Excellent · ${b.excellent} and up`,
    `Solid night · Good · ${b.good}–${b.excellent - 1}`,
    `Restless night · Fair · ${b.fair}–${b.good - 1}`,
    `Rough night · Low · under ${b.fair}`,
    'Short night · 1h or more under your goal, on any band',
  ];
}

export const SLEEP_COPY = {
  title: 'Sleep',
  back: 'Back',
  info: 'How the score works',
  infoTitle: 'How the score works',
  infoHow: 'Each night is scored on how long you slept against your goal, and on sleep efficiency and bedtime consistency against your own usual.',
  bedtimeGoal: 'Bedtime goal',
  stillSyncing: (syncing: boolean) => (syncing ? "Last night isn't in yet. Syncing…" : "Last night isn't in yet."),
  backfill: 'Reading older nights…',
  windowError: 'Your nights could not be loaded.',
  nightError: 'This night could not be loaded.',
  goalError: 'Your bedtime goal could not be loaded.',
  regularityError: 'Sleep regularity could not be loaded.',
  tryAgain: 'Try again',
  noSleepForNight: 'No sleep recorded for this night.',
  onlyNap: (minutes: number, at: string) => `Only a nap: ${formatShortDuration(minutes)} at ${formatClock(at)}`,
  stagesLabel: 'Sleep stages',
  theNight: 'The night',
  timeInBed: 'Time in bed',
  timeAwake: 'Time awake',
  timeToFallAsleep: 'Time to fall asleep',
  afterWaking: 'After waking',
  naps: 'Naps',
  napsNone: 'None',
  napRow: (minutes: number, at: string) => `${formatShortDuration(minutes)} at ${formatClock(at)}`,
  stepsThatDay: 'Steps that day',
  bedtimeToWake: 'Bedtime to wake',
  rangeWeek: 'Week',
  rangeTwoWeeks: '2 weeks',
  selectedSuffix: ', selected',
  regularityLabel: 'Regularity · 7 nights',
  notEnoughNights: (n: number) => `Not enough nights yet. ${n} more to go.`,
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  monthError: (name: string) => `Couldn't load ${name}.`,
  retry: 'Retry',
  weekdayHeader: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  statAverage: 'Average asleep',
  statAtGoal: 'Nights at goal',
  statBedtime: 'Average bedtime',
  statLongest: 'Longest night',
  nightsAtGoal: (atGoal: number, nights: number) => `${atGoal} of ${nights}`,
  noValue: '—',
} as const;
```

  Add to `lib/coachPrompts.ts` (keep the file's no-numbers comment, which ruling 18 relies on):

```ts
import { formatLongDay } from './heatmap';

/** Ask about the selected night (spec §3.13). The night is named by its date only, never by a value on the page. */
export function sleepQuestion(date: string, isLastNight: boolean, hasNight: boolean): string {
  const which = isLastNight ? 'last night' : formatLongDay(date);
  if (!hasNight) return `Why don't I have sleep data for ${which}?`;
  return isLastNight ? 'How was my sleep last night?' : `How was my sleep on ${which}?`;
}
```

  Create `mobile/jest-mocks/sleepPageFixture.ts`:

```ts
import type { DailyScoreDTO, ScoreDetailDTO } from '../src/api/scores';
import type { SleepActivityDTO, SleepGoal, SleepNight, SleepNightDetail, SleepRegularity } from '../src/api/sleep';
import type { WindDownSettings } from '../src/lib/windDown';
import { MOCKUP_SEGMENTS } from './sleepNightFixture';

// Synthetic values only. "Today" is Thu 8 Oct 2026 (1 Oct 2026 is a Thursday), so the default week is
// Fri 2 Oct .. Thu 8 Oct. Tue 6 Oct has no night; Wed 7 Oct has a nap besides its night.
export const TODAY = '2026-10-08';
export const BANDS = { excellent: 75, good: 55, fair: 40 };
export const GOAL: SleepGoal = { sleepGoalMinutes: 480, bedtimeGoal: '22:45', wakeGoal: '06:45' };
export const REMINDER: WindDownSettings = { enabled: true, leadMinutes: 30, bedtimeGoal: '22:45', coachName: 'Mochi', notificationId: null };
export const REGULARITY: SleepRegularity = {
  days: 7, nights: 6, score: 74, bedtimeSpreadMinutes: 24, wakeSpreadMinutes: 18, averageBedtime: '23:12', averageWake: '06:44', drift: [],
};

export function makeNight(date: string, over: Partial<SleepNight> = {}): SleepNight {
  return {
    date, minutesAsleep: 432, mainMinutesAsleep: 432, mainIsNap: false, minutesInBed: 452, bedtime: '23:08', wakeTime: '06:40',
    sleepScore: 78, minutesAwake: 14, stageMinutes: null, hasStages: true, ...over,
  };
}

export function makeWindow(over: Partial<SleepActivityDTO> = {}): SleepActivityDTO {
  return {
    nights: [
      makeNight('2026-10-02', { minutesAsleep: 401, mainMinutesAsleep: 401, sleepScore: 52 }),
      makeNight('2026-10-03', { minutesAsleep: 440, mainMinutesAsleep: 440, sleepScore: 66 }),
      makeNight('2026-10-04', { minutesAsleep: 514, mainMinutesAsleep: 514, sleepScore: 81, bedtime: '22:40', wakeTime: '07:20' }),
      makeNight('2026-10-05', { minutesAsleep: 302, mainMinutesAsleep: 302, sleepScore: 35, bedtime: '00:50', wakeTime: '06:10' }),
      makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: 418, sleepScore: 70 }),
      makeNight(TODAY),
    ],
    earliestDate: '2026-08-01',
    stagesBackfillPending: false,
    bands: BANDS,
    today: TODAY,
    ...over,
  };
}

export function makeDetail(date: string = TODAY, over: Partial<SleepNightDetail> = {}): SleepNightDetail {
  return {
    date, bedtime: '23:10', wakeTime: '06:52', startUtcOffsetSeconds: -14400, endUtcOffsetSeconds: -14400,
    minutesAsleep: 432, minutesInBed: 452, minutesAwake: 14, minutesToFallAsleep: 12, minutesAfterWakeUp: 6,
    hasStages: true, stages: MOCKUP_SEGMENTS,
    stageTotals: { deep: { minutes: 90, count: 3 }, light: { minutes: 219, count: 9 }, rem: { minutes: 123, count: 5 }, awake: { minutes: 18, count: 3 } },
    naps: [], sleepScore: 78, usualMinutesAsleep: 420, mainIsNap: false, ...over,
  };
}

export function makeScore(
  date: string = TODAY,
  over: Partial<DailyScoreDTO> = {},
  previous: ScoreDetailDTO['previous'] = { date: '2026-10-07', score: 72 },
): ScoreDetailDTO {
  return {
    score: {
      date, type: 'SLEEP', score: 78, confidenceLevel: 'HIGH', algorithmVersion: 'v3',
      factors: [
        { factor: 'SLEEP_DURATION', label: 'Sleep duration', z: -0.4, goalMinutes: 480, weight: 0.5, contribution: -0.2, points: -3, imputed: false, excluded: false },
        { factor: 'SLEEP_EFFICIENCY', label: 'Sleep efficiency', z: 0.8, weight: 0.3, contribution: 0.24, points: 4, imputed: false, excluded: false },
        { factor: 'CIRCADIAN_CONSISTENCY', label: 'Bedtime consistency', z: 0.5, weight: 0.2, contribution: 0.1, points: 2, imputed: false, excluded: false },
      ],
      coldStart: [],
      ...over,
    },
    baselines: [
      { metric: 'SLEEP', ewma: 425, spread: 30, daysOfHistory: 60, windowDays: 28, unit: 'min' },
      { metric: 'SLEEP_EFFICIENCY', ewma: 92, spread: 2, daysOfHistory: 60, windowDays: 28, unit: '%' },
    ],
    previous,
    bands: BANDS,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same three files, then `sleepCopy.test.ts` once more
  under each of `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles` (prefixed to the jest command); it must pass under
  both. Run `__tests__/lib/coachPrompts* __tests__/lib/recoveryCopy.test.ts` if present. Then the mobile typecheck: the
  count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/api/sleep.ts mobile/src/lib/sleepStats.ts mobile/src/lib/sleepCopy.ts mobile/src/lib/coachPrompts.ts mobile/jest-mocks/sleepPageFixture.ts mobile/__tests__/api/sleep.test.ts mobile/__tests__/lib/sleepStats.test.ts mobile/__tests__/lib/sleepCopy.test.ts
git commit -m "feat(mobile): sleep page data fields, main-sleep helpers, copy module and sleep question"
```

---

### Task 3: The page hook — `useSleepPage`

**Files:**
- Create: `mobile/src/lib/useSleepPage.ts`.
- Test: `mobile/__tests__/lib/useSleepPage.test.tsx`.

**Interfaces:**
- Consumes: `fetchSleep`, `fetchSleepNight`, `fetchSleepRegularity`, `fetchSleepGoal` (Task 2 shapes),
  `fetchScoreDetail`, `useSection` / `Section` (`components/sleep/Section.tsx:13`), `readWindDown`, `isNapOnly`.
- Produces:
  - `REGULARITY_DAYS = 7`
  - `resolveNight(param: string | undefined, today: string, nights: readonly SleepNight[] | null): string | null`
  - `anchorFor(date: string, today: string): string`
  - `windowRange(anchor: string, today: string): { from: string; to: string }`
  - `monthSpan(month: string, today: string): { from: string; to: string }` (month is `YYYY-MM`)
  - `type NightBundle = { score: ScoreDetailDTO | null; night: SleepNightDetail | null }`
  - `type NightLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: NightBundle }`
  - `type MonthLoad = { status: 'loading' | 'error' | 'ready'; nights?: SleepNight[] }`
  - `useSleepPage(param?: string): SleepPage`, where

```ts
export interface SleepPage {
  today: string;                          // the server's today once known, else the device's
  date: string | null;                    // D; null only while the nights load with no date param
  anchor: string;                         // A: today when D >= today - 6, else D
  window: Section<SleepActivityDTO>;      // the page-scoped nights for windowRange(A, today)
  reloadWindow: () => void;
  regularity: Section<SleepRegularity>;
  reloadRegularity: () => void;
  goal: Section<SleepGoal>;
  reloadGoal: () => void;
  reminder: WindDownSettings | null;
  night: NightLoad;                       // night-scoped: the score and the night for D
  reloadNight: () => void;
  bands: ScoreBandsDTO | undefined;       // the score's bands, else the nights response's
  month: (month: string) => MonthLoad;    // served from the window when it covers the month
  loadMonth: (month: string) => void;     // idempotent; no-op when covered, ready or in flight
  retryMonth: (month: string) => void;
}
```

- [ ] **Step 1: Write the failing tests** in `mobile/__tests__/lib/useSleepPage.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fetchScoreDetail } from '../../src/api/scores';
import { fetchSleep, fetchSleepGoal, fetchSleepNight, fetchSleepRegularity } from '../../src/api/sleep';
import { readWindDown } from '../../src/lib/windDown';
import { anchorFor, monthSpan, resolveNight, useSleepPage, windowRange } from '../../src/lib/useSleepPage';
import { GOAL, REGULARITY, REMINDER, TODAY, makeDetail, makeNight, makeScore, makeWindow } from '../../jest-mocks/sleepPageFixture';

jest.mock('../../src/api/sleep', () => ({ fetchSleep: jest.fn(), fetchSleepNight: jest.fn(), fetchSleepRegularity: jest.fn(), fetchSleepGoal: jest.fn() }));
jest.mock('../../src/api/scores', () => ({ fetchScoreDetail: jest.fn() }));
jest.mock('../../src/lib/windDown', () => ({ readWindDown: jest.fn() }));
// The device clock says Thu 8 Oct 2026.
jest.mock('../../src/lib/heatmap', () => ({ ...jest.requireActual('../../src/lib/heatmap'), todayCivil: () => '2026-10-08' }));
let mockDataVersion = 0;
jest.mock('../../src/sync/SyncProvider', () => ({ useSync: () => ({ dataVersion: mockDataVersion, state: 'idle' }) }));
// Runs the focus callback once on mount (a screen that mounts focused) and keeps it for a refocus.
let mockFocusCallback: (() => void) | null = null;
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => { mockFocusCallback = cb; R.useEffect(cb, []); } };
});

const sleepFetch = fetchSleep as jest.Mock;
const nightFetch = fetchSleepNight as jest.Mock;
const scoreFetch = fetchScoreDetail as jest.Mock;
const regularityFetch = fetchSleepRegularity as jest.Mock;
const goalFetch = fetchSleepGoal as jest.Mock;
const reminderRead = readWindDown as jest.Mock;
const flush = () => act(async () => {});
const refocus = () => act(() => { mockFocusCallback?.(); });
const notFound = () => Object.assign(new Error('not found'), { status: 404 });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDataVersion = 0;
  mockFocusCallback = null;
  sleepFetch.mockResolvedValue(makeWindow());
  nightFetch.mockImplementation((d: string) => Promise.resolve(makeDetail(d)));
  scoreFetch.mockImplementation((d: string) => Promise.resolve(makeScore(d)));
  regularityFetch.mockResolvedValue(REGULARITY);
  goalFetch.mockResolvedValue(GOAL);
  reminderRead.mockResolvedValue(REMINDER);
});

describe('pure rules (spec §3.0)', () => {
  it('D is the param clamped to today, else the newest night in the last 7, else today', () => {
    expect(resolveNight('2026-10-05', TODAY, null)).toBe('2026-10-05');
    expect(resolveNight('2026-10-20', TODAY, null)).toBe(TODAY);
    expect(resolveNight(undefined, TODAY, makeWindow().nights)).toBe(TODAY);
    expect(resolveNight(undefined, TODAY, makeWindow().nights.filter((n) => n.date !== TODAY))).toBe('2026-10-07');
    expect(resolveNight(undefined, TODAY, [makeNight('2026-09-20')])).toBe(TODAY);
    expect(resolveNight(undefined, TODAY, null)).toBeNull();
  });
  it('a nap-only date is never the default night', () => {
    expect(resolveNight(undefined, TODAY, [makeNight('2026-10-07'), makeNight(TODAY, { mainIsNap: true })])).toBe('2026-10-07');
  });
  it('anchors on today for the last 7 nights, else on the night itself', () => {
    expect(anchorFor('2026-10-02', TODAY)).toBe(TODAY);
    expect(anchorFor('2026-10-01', TODAY)).toBe('2026-10-01');
  });
  it('the window covers two weeks back and the whole anchor month, never past today', () => {
    expect(windowRange(TODAY, TODAY)).toEqual({ from: '2026-09-25', to: TODAY });
    expect(windowRange('2026-10-28', '2026-10-28')).toEqual({ from: '2026-10-01', to: '2026-10-28' });
    expect(windowRange('2026-09-10', TODAY)).toEqual({ from: '2026-08-28', to: '2026-09-30' });
    expect(monthSpan('2026-10', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(monthSpan('2026-02', TODAY)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('useSleepPage', () => {
  it('loads the page-scoped sections once and the night for the param, with no double fetch on the mount focus', async () => {
    const { result } = renderHook(() => useSleepPage('2026-10-05'));
    expect(result.current.date).toBe('2026-10-05');
    expect(result.current.anchor).toBe(TODAY);
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(sleepFetch).toHaveBeenCalledTimes(1);
    expect(sleepFetch).toHaveBeenCalledWith('2026-09-25', TODAY);
    expect(scoreFetch).toHaveBeenCalledWith('2026-10-05', 'SLEEP');
    expect(nightFetch).toHaveBeenCalledWith('2026-10-05');
    expect(regularityFetch).toHaveBeenCalledWith(7);
    expect(goalFetch).toHaveBeenCalledTimes(1);
    expect(reminderRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.reminder).toEqual(REMINDER));
  });

  it('with no param, D waits for the nights and is then the newest night', async () => {
    sleepFetch.mockResolvedValue(makeWindow({ nights: makeWindow().nights.filter((n) => n.date !== TODAY) }));
    const { result } = renderHook(() => useSleepPage());
    expect(result.current.date).toBeNull();
    expect(nightFetch).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.date).toBe('2026-10-07'));
    await waitFor(() => expect(nightFetch).toHaveBeenCalledWith('2026-10-07'));
  });

  it('with no param and a failed nights load, D falls back to today', async () => {
    sleepFetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(result.current.date).toBe(TODAY));
  });

  it('clamps a future param to today', async () => {
    const { result } = renderHook(() => useSleepPage('2026-11-01'));
    expect(result.current.date).toBe(TODAY);
    await flush();
  });

  it('anchors an old night on itself and fetches its own weeks', async () => {
    const { result } = renderHook(() => useSleepPage('2026-09-10'));
    expect(result.current.anchor).toBe('2026-09-10');
    await flush();
    expect(sleepFetch).toHaveBeenCalledWith('2026-08-28', '2026-09-30');
  });

  it('reads a 404 night as no night while the score may still be there', async () => {
    nightFetch.mockRejectedValue(notFound());
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    const night = result.current.night;
    if (night.status !== 'ready') throw new Error('not ready');
    expect(night.data.night).toBeNull();
    expect(night.data.score?.score.score).toBe(78);
  });

  it('a score 404 is no score (fetchScoreDetail already returns null)', async () => {
    scoreFetch.mockResolvedValue(null);
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(result.current.night.status === 'ready' && result.current.night.data.score).toBeNull();
  });

  it('switching nights fetches the new one; a revisited night comes from the cache', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: TODAY } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(nightFetch).toHaveBeenCalledWith('2026-10-05'));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    rerender({ d: TODAY });
    expect(result.current.night.status).toBe('ready');
    expect(nightFetch).toHaveBeenCalledTimes(2);
    // The page-scoped window is not refetched by a tap inside the week.
    expect(sleepFetch).toHaveBeenCalledTimes(1);
  });

  it('only the latest night request lands', async () => {
    const slow = deferred<ReturnType<typeof makeDetail>>();
    nightFetch.mockImplementationOnce(() => slow.promise);
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: '2026-10-04' } });
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    await act(async () => { slow.resolve(makeDetail('2026-10-04')); });
    const night = result.current.night;
    expect(night.status === 'ready' && night.data.night?.date).toBe('2026-10-05');
  });

  it('a failed night shows the error, and reloadNight fetches again', async () => {
    scoreFetch.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('error'));
    act(() => result.current.reloadNight());
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(scoreFetch).toHaveBeenCalledTimes(2);
  });

  it('a sync refreshes quietly: the shown night stays ready while it refetches, and the cache is cleared', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: '2026-10-05' } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    rerender({ d: TODAY });
    await waitFor(() => expect(nightFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    const pending = deferred<ReturnType<typeof makeDetail>>();
    nightFetch.mockImplementationOnce(() => pending.promise);
    mockDataVersion = 1;
    rerender({ d: TODAY });
    expect(result.current.night.status).toBe('ready');
    expect(result.current.window.phase).toBe('ready');
    await act(async () => { pending.resolve(makeDetail(TODAY)); });
    expect(nightFetch).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(sleepFetch).toHaveBeenCalledTimes(2));
    // The cache was cleared: going back to the 5th fetches it again.
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(nightFetch).toHaveBeenCalledTimes(4));
  });

  it('a failed quiet refresh keeps the night on screen', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: TODAY } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    scoreFetch.mockRejectedValueOnce(new Error('offline'));
    mockDataVersion = 1;
    rerender({ d: TODAY });
    await flush();
    expect(result.current.night.status).toBe('ready');
  });

  it("a refocus on today's week refreshes everything quietly", async () => {
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    refocus();
    expect(result.current.night.status).toBe('ready');
    await flush();
    expect(sleepFetch).toHaveBeenCalledTimes(2);
    expect(regularityFetch).toHaveBeenCalledTimes(2);
    expect(goalFetch).toHaveBeenCalledTimes(2);
    expect(reminderRead).toHaveBeenCalledTimes(2);
    expect(nightFetch).toHaveBeenCalledTimes(2);
    expect(result.current.window.phase).toBe('ready');
  });

  it('a refocus on an old night only re-reads the goal and the reminder', async () => {
    const { result } = renderHook(() => useSleepPage('2026-09-10'));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    refocus();
    await flush();
    expect(goalFetch).toHaveBeenCalledTimes(2);
    expect(reminderRead).toHaveBeenCalledTimes(2);
    expect(sleepFetch).toHaveBeenCalledTimes(1);
    expect(nightFetch).toHaveBeenCalledTimes(1);
  });

  it("takes today from the server once it answers, and refetches the window for the server's week", async () => {
    sleepFetch.mockResolvedValue(makeWindow({ today: '2026-10-09' }));
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(result.current.today).toBe('2026-10-09'));
    await waitFor(() => expect(sleepFetch).toHaveBeenLastCalledWith('2026-09-26', '2026-10-09'));
    expect(result.current.anchor).toBe('2026-10-09');
  });

  it("a sync that lands last night moves a page opened without a param onto it", async () => {
    sleepFetch.mockResolvedValue(makeWindow({ nights: makeWindow().nights.filter((n) => n.date !== TODAY) }));
    const { result, rerender } = renderHook((_: { v: number }) => useSleepPage(), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.date).toBe('2026-10-07'));
    sleepFetch.mockResolvedValue(makeWindow());
    mockDataVersion = 1;
    rerender({ v: 1 });
    await waitFor(() => expect(result.current.date).toBe(TODAY));
  });

  it('serves the anchor month from the window and fetches other months once', async () => {
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    const oct = result.current.month('2026-10');
    expect(oct.status).toBe('ready');
    expect(oct.nights?.map((n) => n.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', TODAY]);
    act(() => result.current.loadMonth('2026-10'));
    expect(sleepFetch).toHaveBeenCalledTimes(1);

    sleepFetch.mockResolvedValueOnce(makeWindow({ nights: [makeNight('2026-09-12')] }));
    act(() => result.current.loadMonth('2026-09'));
    act(() => result.current.loadMonth('2026-09'));
    expect(sleepFetch).toHaveBeenCalledTimes(2);
    expect(sleepFetch).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
    await waitFor(() => expect(result.current.month('2026-09').status).toBe('ready'));
    expect(result.current.month('2026-09').nights?.map((n) => n.date)).toEqual(['2026-09-12']);

    sleepFetch.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.loadMonth('2026-08'));
    await waitFor(() => expect(result.current.month('2026-08').status).toBe('error'));
    act(() => result.current.retryMonth('2026-08'));
    await waitFor(() => expect(result.current.month('2026-08').status).toBe('ready'));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails:** `__tests__/lib/useSleepPage.test.tsx`. Expected: FAIL with
  "Cannot find module '../../src/lib/useSleepPage'".

- [ ] **Step 3: Implement.**

```ts
// mobile/src/lib/useSleepPage.ts
// The Sleep page's state (spec 2026-10-09 one-sleep-page §3.0, §4.5). Page-scoped sections load once per anchor
// through useSection; the night (score + night) is keyed by D, cached for the page's life and cleared by a sync. As on
// the Recovery page: loading only before the first data, a failed refresh keeps what is shown, only the latest night
// request lands, the mount focus fetches nothing extra, and a refocus refreshes while the week contains today.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchScoreDetail, type ScoreBandsDTO, type ScoreDetailDTO } from '../api/scores';
import {
  fetchSleep, fetchSleepGoal, fetchSleepNight, fetchSleepRegularity,
  type SleepActivityDTO, type SleepGoal, type SleepNight, type SleepNightDetail, type SleepRegularity,
} from '../api/sleep';
import { useSection, type Section } from '../components/sleep/Section';
import { useSync } from '../sync/SyncProvider';
import { addDays, monthStart, shiftMonth, todayCivil } from './heatmap';
import { isNapOnly } from './sleepStats';
import { readWindDown, type WindDownSettings } from './windDown';

export const REGULARITY_DAYS = 7;

export type NightBundle = { score: ScoreDetailDTO | null; night: SleepNightDetail | null };
export type NightLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: NightBundle };
export type MonthLoad = { status: 'loading' | 'error' | 'ready'; nights?: SleepNight[] };

export interface SleepPage {
  today: string;
  date: string | null;
  anchor: string;
  window: Section<SleepActivityDTO>;
  reloadWindow: () => void;
  regularity: Section<SleepRegularity>;
  reloadRegularity: () => void;
  goal: Section<SleepGoal>;
  reloadGoal: () => void;
  reminder: WindDownSettings | null;
  night: NightLoad;
  reloadNight: () => void;
  bands: ScoreBandsDTO | undefined;
  month: (month: string) => MonthLoad;
  loadMonth: (month: string) => void;
  retryMonth: (month: string) => void;
}

const monthEnd = (date: string) => addDays(shiftMonth(date, 1), -1);
const minDate = (a: string, b: string) => (a < b ? a : b);

export function resolveNight(param: string | undefined, today: string, nights: readonly SleepNight[] | null): string | null {
  if (param !== undefined) return param > today ? today : param;
  if (nights === null) return null;
  const from = addDays(today, -6);
  const recent = nights.filter((n) => n.date >= from && n.date <= today && !isNapOnly(n)).map((n) => n.date).sort();
  return recent[recent.length - 1] ?? today;
}

export function anchorFor(date: string, today: string): string {
  return date >= addDays(today, -6) ? today : date;
}

/** Plan ruling 6: keyed by the anchor only, so a tap inside the week never refetches it. */
export function windowRange(anchor: string, today: string): { from: string; to: string } {
  return { from: minDate(addDays(anchor, -13), monthStart(anchor)), to: minDate(today, monthEnd(anchor)) };
}

export function monthSpan(month: string, today: string): { from: string; to: string } {
  const first = `${month}-01`;
  return { from: first, to: minDate(today, monthEnd(first)) };
}

const covers = (outer: { from: string; to: string }, inner: { from: string; to: string }) => inner.from >= outer.from && inner.to <= outer.to;

function notFoundIsNull(e: unknown): null {
  if ((e as { status?: number } | null)?.status === 404) return null;
  throw e;
}

export function useSleepPage(param?: string): SleepPage {
  const { dataVersion } = useSync();
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? todayCivil();
  const anchor = anchorFor(param === undefined ? today : resolveNight(param, today, null)!, today);
  const range = windowRange(anchor, today);

  const [win, reloadWindow] = useSection<SleepActivityDTO>(`${range.from}..${range.to}`, () => fetchSleep(range.from, range.to), [dataVersion]);
  const [regularity, reloadRegularity] = useSection<SleepRegularity>('regularity', () => fetchSleepRegularity(REGULARITY_DAYS), [dataVersion]);
  const [goal, reloadGoal] = useSection<SleepGoal>('goal', () => fetchSleepGoal(), [dataVersion]);
  // The wind-down reminder lives on the device; read alongside the goal.
  const [reminder, setReminder] = useState<WindDownSettings | null>(null);
  const loadReminder = useCallback(() => {
    readWindDown().then(setReminder, () => undefined);
  }, []);
  useEffect(loadReminder, [loadReminder]);

  // The server's today (the user's own timezone) replaces the device guess once known.
  const reportedToday = win.phase === 'ready' ? win.data.today ?? null : null;
  useEffect(() => {
    if (reportedToday && reportedToday !== serverToday) setServerToday(reportedToday);
  }, [reportedToday, serverToday]);

  const date =
    param !== undefined ? resolveNight(param, today, null)
    : win.phase === 'ready' ? resolveNight(undefined, today, win.data.nights)
    : win.phase === 'error' ? today
    : null;

  // Night-scoped: score + night for D, cached by date; only the latest request lands.
  const cache = useRef(new Map<string, NightBundle>());
  const [shown, setShown] = useState<{ date: string; load: NightLoad } | null>(null);
  const nightRequest = useRef(0);
  const fetchNight = useCallback((d: string, force: boolean) => {
    const id = ++nightRequest.current;
    const cached = cache.current.get(d);
    if (cached) {
      setShown({ date: d, load: { status: 'ready', data: cached } });
      if (!force) return;
    } else {
      setShown({ date: d, load: { status: 'loading' } });
    }
    Promise.all([fetchScoreDetail(d, 'SLEEP'), fetchSleepNight(d).catch(notFoundIsNull)]).then(
      ([score, night]) => {
        if (id !== nightRequest.current) return;
        const data = { score, night };
        cache.current.set(d, data);
        setShown({ date: d, load: { status: 'ready', data } });
      },
      () => {
        // A failed refresh keeps the night already on screen.
        if (id !== nightRequest.current || cache.current.has(d)) return;
        setShown({ date: d, load: { status: 'error' } });
      },
    );
  }, []);
  useEffect(() => {
    if (date === null) return;
    fetchNight(date, false);
    return () => { nightRequest.current++; };
  }, [date, fetchNight]);

  // Months the window does not cover, cached by YYYY-MM for paging.
  const [months, setMonths] = useState<Record<string, MonthLoad>>({});
  const monthsRef = useRef(months);
  const inflight = useRef(new Set<string>());
  const putMonth = useCallback((m: string, v: MonthLoad) => {
    setMonths((s) => {
      const next = { ...s, [m]: v };
      monthsRef.current = next;
      return next;
    });
  }, []);

  // A sync clears both caches and refreshes the shown night quietly (the sections refresh through their deps).
  const seenVersion = useRef(dataVersion);
  useEffect(() => {
    if (seenVersion.current === dataVersion) return;
    seenVersion.current = dataVersion;
    const keep = date === null ? undefined : cache.current.get(date);
    cache.current.clear();
    monthsRef.current = {};
    setMonths({});
    if (date !== null) {
      if (keep) cache.current.set(date, keep);
      fetchNight(date, true);
    }
  }, [dataVersion, date, fetchNight]);

  // Stable focus handler: everything it needs is read from this ref.
  const latest = useRef({ date, anchor, today, range, reloadWindow, reloadRegularity, reloadGoal, loadReminder, fetchNight });
  latest.current = { date, anchor, today, range, reloadWindow, reloadRegularity, reloadGoal, loadReminder, fetchNight };
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    // The mount already loads everything: the first focus is the mount itself.
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    const l = latest.current;
    // Back from BedtimeGoal (or anywhere): the goal and the reminder may have changed.
    l.reloadGoal();
    l.loadReminder();
    // The week contains today (even via an explicit date param): last night may have landed while away.
    if (l.anchor === l.today) {
      l.reloadWindow();
      l.reloadRegularity();
      if (l.date !== null) l.fetchNight(l.date, true);
    }
  }, []));

  const loadMonth = useCallback((m: string) => {
    const { today: t, range: r } = latest.current;
    const span = monthSpan(m, t);
    if (covers(r, span) || monthsRef.current[m]?.status === 'ready' || inflight.current.has(m)) return;
    inflight.current.add(m);
    putMonth(m, { status: 'loading' });
    fetchSleep(span.from, span.to)
      .then((res) => putMonth(m, { status: 'ready', nights: res.nights }))
      .catch(() => putMonth(m, { status: 'error' }))
      .finally(() => inflight.current.delete(m));
  }, [putMonth]);

  const month = (m: string): MonthLoad => {
    const span = monthSpan(m, today);
    if (covers(range, span)) {
      if (win.phase === 'ready') return { status: 'ready', nights: win.data.nights.filter((n) => n.date >= span.from && n.date <= span.to) };
      return { status: win.phase === 'error' ? 'error' : 'loading' };
    }
    return months[m] ?? { status: 'loading' };
  };

  const night: NightLoad = date !== null && shown?.date === date ? shown.load : { status: 'loading' };
  const bands = (night.status === 'ready' ? night.data.score?.bands : undefined) ?? (win.phase === 'ready' ? win.data.bands : undefined);

  return {
    today, date, anchor,
    window: win, reloadWindow,
    regularity, reloadRegularity,
    goal, reloadGoal,
    reminder,
    night,
    reloadNight: () => { if (date !== null) fetchNight(date, true); },
    bands,
    month, loadMonth,
    retryMonth: (m: string) => (covers(range, monthSpan(m, today)) ? reloadWindow() : loadMonth(m)),
  };
}
```

  Notes for the implementer:
  - `useSection` (`components/sleep/Section.tsx:13-40`) already gives quiet refreshes for an unchanged key and a
    loading state for a new key; do not re-implement it.
  - In real React Navigation, `useFocusEffect` re-runs whenever its callback identity changes. The callback above has
    `[]` deps and reads a ref, so it never re-runs on a re-render.
  - Confirm the `useSync` import path against `screens/SleepScreen.tsx:35`.

- [ ] **Step 4: Run the test and confirm it passes.** Then run the typecheck; the count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/lib/useSleepPage.ts mobile/__tests__/lib/useSleepPage.test.tsx
git commit -m "feat(mobile): useSleepPage hook with quiet refresh, night cache and month cache"
```

---

### Task 4: Pixel moon art

**Files:**
- Create: `mobile/src/lib/moonArt.ts` and `mobile/src/components/sleep/MoonArt.tsx`.
- Test: `mobile/__tests__/components/MoonArt.test.tsx`.

**Interfaces:**
- Produces: `MOON_GRID = { w: 25, h: 20 }`, `MOON_ART: PixelRect[]` (the `PixelRect` type from `lib/weatherArt.ts`),
  `MOON_CELL = 5`, and `<MoonArt dim?: boolean testID?: string />` (125 × 100; `dim` is opacity 0.4; hidden from
  screen readers).

- [ ] **Step 1: Write the failing test.**

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import { MoonArt } from '../../src/components/sleep/MoonArt';
import { MOON_ART, MOON_GRID } from '../../src/lib/moonArt';

describe('MoonArt', () => {
  it("draws the board's 15 rects at 5 pt per cell, hidden from screen readers", () => {
    const { getByTestId, UNSAFE_getAllByType, UNSAFE_getByType } = render(<MoonArt testID="moon" />);
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(15);
    expect(UNSAFE_getByType(Svg).props).toMatchObject({ width: 125, height: 100, viewBox: '0 0 25 20' });
    const root = getByTestId('moon', { includeHiddenElements: true });
    expect(root.props.accessible).toBe(false);
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.style).toMatchObject({ opacity: 1 });
  });
  it('dims to 40% for the building and no-night states', () => {
    const { getByTestId } = render(<MoonArt testID="moon" dim />);
    expect(getByTestId('moon', { includeHiddenElements: true }).props.style).toMatchObject({ opacity: 0.4 });
  });
  it('every rect fits the grid and uses a fixed colour (same in both themes)', () => {
    for (const r of MOON_ART) {
      expect(r.x + r.w <= MOON_GRID.w && r.y + r.h <= MOON_GRID.h).toBe(true);
      expect(r.fill).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.**

- [ ] **Step 3: Implement.** The rects are copied from the approved board
  (`.superpowers/sleep-canvas/project/Main.dc.html:37-41`).

```ts
// mobile/src/lib/moonArt.ts
// The hero's pixel moon (spec §2.1), copied from the approved board (Main.dc.html). Colours are fixed in both themes.
import type { PixelRect } from './weatherArt';

const r = (x: number, y: number, w: number, h: number, fill: string): PixelRect => ({ x, y, w, h, fill });

export const MOON_GRID = { w: 25, h: 20 } as const;

export const MOON_ART: PixelRect[] = [
  // Stars.
  r(2, 3, 1, 1, '#E0E7FF'), r(21, 2, 1, 1, '#E0E7FF'), r(19, 14, 1, 1, '#C7D2FE'), r(4, 15, 1, 1, '#C7D2FE'), r(22, 9, 1, 1, '#E0E7FF'),
  // The crescent, light at the top to deep violet at the bottom.
  r(10, 2, 5, 1, '#C4B5FD'), r(8, 3, 5, 1, '#C4B5FD'), r(7, 4, 4, 2, '#A78BFA'), r(6, 6, 4, 6, '#A78BFA'),
  r(7, 12, 4, 2, '#8B5CF6'), r(8, 14, 5, 1, '#8B5CF6'), r(10, 15, 6, 1, '#7C3AED'), r(15, 14, 3, 1, '#7C3AED'),
  // The sparkle.
  r(16, 5, 1, 3, '#FDE68A'), r(15, 6, 3, 1, '#FDE68A'),
];
```

```tsx
// mobile/src/components/sleep/MoonArt.tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { MOON_ART, MOON_GRID } from '../../lib/moonArt';

// react-native-svg has no shapeRendering (see WeatherIcon), so cells land on whole points to stay crisp: 5 pt per cell
// (25x20 -> 125x100) rather than the board's 4.8 (plan ruling 13).
export const MOON_CELL = 5;

// Decorative: the verdict text carries the meaning (spec §3.2, §7).
export function MoonArt({ dim = false, testID }: { dim?: boolean; testID?: string }) {
  const width = MOON_GRID.w * MOON_CELL;
  const height = MOON_GRID.h * MOON_CELL;
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, opacity: dim ? 0.4 : 1 }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${MOON_GRID.w} ${MOON_GRID.h}`}>
        {MOON_ART.map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        ))}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes,** plus `__tests__/conventions`. Then the typecheck: still 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/lib/moonArt.ts mobile/src/components/sleep/MoonArt.tsx mobile/__tests__/components/MoonArt.test.tsx
git commit -m "feat(mobile): pixel moon art for the Sleep hero"
```

### Task 4b: Owner gate on Home with the Recaps shelf, and the dimmed moon (controller; no code)

- [ ] **Step 1:** Add one board, `HomeShelf.dc.html`, to `.superpowers/sleep-canvas/project/`, at 390 px wide on the
  dark page background (A4 type, the same card and button styles as `Main.dc.html`). It shows Home top to bottom as
  built today (`DashboardScreen.tsx:251-318`): date and greeting, Recovery hero, Sleep tile beside the Coach tile,
  Tomorrow card, Buddies row, Habit log, **then the Recaps shelf** ("Recaps · See all" and a row of 64 px story
  circles), then the coach digest card, then "Your metrics". Beside it, a strip of the hero moon from `moonArt.ts`
  at full opacity and at 40% (the building and no-night states), each with its verdict under it ("Restful night",
  "Learning your sleep", "No sleep recorded"). Republish the canvas `https://claude.ai/artifact/XZsyFUXr7QTZK7h8SR37Tq`
  with the Artifact tool (`url` plus `root` set to the canvas folder).
- [ ] **Step 2:** Ask the owner to approve the shelf position (decision 5) and the dimmed moon (spec §11, mockup first).
  A position change comes back as a one-line move in Task 10's `DashboardScreen` edit; a moon change as a rect or
  opacity edit to `moonArt.ts` / `MoonArt.tsx` in a fix commit. Record
  `Ruling: Home shelf and dimmed moon approved — <date>` in the ledger. Tasks 5–11 do **not** wait for this gate;
  **the Task 12 draft PR does.**

---

### Task 5: The Sleep page core — route, header, info sheet, hero, picker, summary, goal row, Ask bar

**Files:**
- Create: `mobile/src/components/sleep/SleepHeader.tsx`, `SleepInfoSheet.tsx`, `SleepHero.tsx`, `NightPicker.tsx`,
  `NightSummary.tsx` and `BedtimeGoalRow.tsx`, all under `components/sleep/`.
- Rewrite: `mobile/src/screens/SleepScreen.tsx` (the whole file; `goalLine` and the `RecapShelf` import go).
- Modify: `mobile/src/navigation/sleepNavigation.ts` (add `openSleep`, repoint `openNight`).
- Modify: `mobile/src/navigation/RootNavigator.tsx`:
  - `:104-105` becomes `// The one Sleep page (spec 2026-10-09); date is the night-end civil date, else the default night.`
    and `Sleep: { date?: string } | undefined;`;
  - `:111` and `:117` (the "Sleep → Your recaps" and "the Sleep shelf" comments) say "Home" instead of "Sleep";
  - the Sleep screen (`:254`) becomes `<Stack.Screen name="Sleep" component={SleepScreen} options={{ headerShown: false }} />`.
- Modify: `mobile/__tests__/conventions/buttons.test.ts:54`: the `sleep-goal-row` entry's file becomes
  `components/sleep/BedtimeGoalRow.tsx` (same key, count 1, reason "the bedtime goal row on the Sleep page (a card
  that navigates)").
- Test: rewrite `mobile/__tests__/screens/SleepScreen.test.tsx` (every old case goes with the old screen; this file grows
  in Tasks 6, 8 and 9), update `mobile/__tests__/navigation/sleepNavigation.test.ts`, and update
  `mobile/__tests__/screens/RecoveryScreen.test.tsx:425` to expect `navigate('Sleep', { date: '2026-10-08' })`.

**Interfaces:**
- Consumes: `useSleepPage` (Task 3), `sleepCopy` (Task 2), `MoonArt` (Task 4), `AskCoachBar`
  (`components/coach/AskCoachBar.tsx`), `SectionError` (`components/sleep/Section.tsx:42`).
- Produces:
  - `openSleep(navigation: { navigate: (...args: any[]) => void }, date?: string): void` and `openNight(navigation, date: string): void`;
  - the `SleepScreen` scroll container rendering, in order: header, hero (or `sleep-night-retry`), picker, summary,
    `{night cards: Task 6}`, `{Bedtime to wake + Regularity: Task 8}`, `{month: Task 9}`, goal row; the Ask bar pinned;
    the info sheet;
  - the screen's `select(d)` (no-op on D) and `scrollTop()` used by Tasks 8 and 9;
  - testIDs: `sleep-loading`, `sleep-back`, `sleep-info`, `sleep-goal-button`, `sleep-info-sheet`, `sleep-hero`,
    `sleep-hero-moon`, `sleep-hero-loading`, `sleep-night-retry`, `sleep-picker-loading`, `sleep-window-retry`,
    `sleep-night-${date}`, `sleep-night-dash-${date}`, `sleep-still-syncing`, `sleep-older-nights`, `sleep-summary`,
    `sleep-summary-loading`, `sleep-goal-row`, `sleep-goal-line`, `sleep-goal-retry`.

- [ ] **Step 1: Write the failing tests.** Replace `mobile/__tests__/screens/SleepScreen.test.tsx` with:

```tsx
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { GOAL, REGULARITY, REMINDER, TODAY, makeDetail, makeNight, makeScore, makeWindow } from '../../jest-mocks/sleepPageFixture';
import { SleepScreen } from '../../src/screens/SleepScreen';
import { fetchSleep, fetchSleepGoal, fetchSleepNight, fetchSleepRegularity } from '../../src/api/sleep';
import { fetchScoreDetail } from '../../src/api/scores';
import { readWindDown } from '../../src/lib/windDown';
import { SLEEP_SCORE_FRAMING } from '../../src/lib/scoreInsights';
import { COLORS } from '../../src/theme';
import type { CoachStatusDTO } from '../../src/api/coach';

jest.mock('../../src/api/sleep');
jest.mock('../../src/api/scores');
jest.mock('../../src/api/coach');
jest.mock('../../src/lib/windDown');
jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(() => Promise.resolve([])), markRecapOpened: jest.fn() }));
jest.mock('../../src/lib/heatmap', () => ({ ...jest.requireActual('../../src/lib/heatmap'), todayCivil: () => '2026-10-08' }));
let mockSyncState = 'idle';
jest.mock('../../src/sync/SyncProvider', () => ({ useSync: () => ({ dataVersion: 0, state: mockSyncState }) }));

const mockNavigation = {
  navigate: jest.fn(), push: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), setParams: jest.fn(), replace: jest.fn(),
  addListener: () => () => {},
};
let mockParams: { date?: string } | undefined;
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => mockNavigation,
  useFocusEffect: () => {},
}));

const STATUS: CoachStatusDTO = {
  enabled: true, consented: true, consent: { version: 'v1', summary: 's', dataItems: ['x'] }, personaId: 'mochi', personaChosen: true, personas: [],
};
const sleepFetch = fetchSleep as jest.Mock;
const nightFetch = fetchSleepNight as jest.Mock;
const scoreFetch = fetchScoreDetail as jest.Mock;
const SPOKEN_FORBIDDEN = /[·−]/;
const notFound = () => Object.assign(new Error('not found'), { status: 404 });

function renderScreen(status: CoachStatusDTO | null = STATUS) {
  return render(withCharacter(<SleepScreen />, { characterId: 'mochi', status }));
}
const hero = () => screen.findByTestId('sleep-hero');

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockSyncState = 'idle';
  sleepFetch.mockResolvedValue(makeWindow());
  nightFetch.mockImplementation((d: string) => Promise.resolve(makeDetail(d)));
  scoreFetch.mockImplementation((d: string) => Promise.resolve(makeScore(d)));
  (fetchSleepRegularity as jest.Mock).mockResolvedValue(REGULARITY);
  (fetchSleepGoal as jest.Mock).mockResolvedValue(GOAL);
  (readWindDown as jest.Mock).mockResolvedValue(REMINDER);
});
afterEach(async () => { await act(async () => {}); });

describe('SleepScreen: header and states', () => {
  it('shows the header and the loading skeleton before the nights land', () => {
    sleepFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId('sleep-loading')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Sleep' })).toBeTruthy();
    expect(screen.getByTestId('sleep-back')).toBeTruthy();
  });

  it('back, bedtime goal and info buttons', async () => {
    renderScreen();
    await hero();
    fireEvent.press(screen.getByTestId('sleep-back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('sleep-goal-button'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BedtimeGoal');
    expect(screen.getByTestId('sleep-goal-button').props.accessibilityLabel).toBe('Bedtime goal');
  });

  it('the info sheet: framing, the weights this night used, baselines without SLEEP, the bands', async () => {
    renderScreen();
    await hero();
    fireEvent.press(screen.getByTestId('sleep-info'));
    const sheet = await screen.findByTestId('sleep-info-sheet');
    expect(within(sheet).getByText(SLEEP_SCORE_FRAMING)).toBeTruthy();
    expect(within(sheet).getByText('This night weighted sleep duration 50, sleep efficiency 30, bedtime consistency 20.')).toBeTruthy();
    // The weights line plus the SLEEP_EFFICIENCY baseline sentence; the SLEEP baseline is filtered out.
    expect(within(sheet).getAllByText(/efficiency/i).length).toBe(2);
    expect(within(sheet).getByText('Rough night · Low · under 40')).toBeTruthy();
    expect(within(sheet).getByText('Short night · 1h or more under your goal, on any band')).toBeTruthy();
  });

  it('does not carry the Recaps shelf (it moved to Home)', async () => {
    renderScreen();
    await hero();
    expect(screen.queryByTestId('recap-shelf')).toBeNull();
  });
});

describe('SleepScreen: hero', () => {
  it('opens on the newest night: score, verdict, line, one spoken element', async () => {
    renderScreen();
    const h = await hero();
    expect(within(h).getByText('78')).toBeTruthy();
    expect(within(h).getByText('Restful night')).toBeTruthy();
    expect(h.props.accessibilityLabel).toBe('Sleep score 78, Excellent, restful night. Up 6 from yesterday. High confidence.');
    expect(h.props.accessibilityLabel).not.toMatch(SPOKEN_FORBIDDEN);
    expect(scoreFetch).toHaveBeenCalledWith(TODAY, 'SLEEP');
  });

  it('a past night: Short night overrides the band, the band word stays, the delta names the weekday', async () => {
    mockParams = { date: '2026-10-05' };
    nightFetch.mockResolvedValue(makeDetail('2026-10-05', { minutesAsleep: 302 }));
    scoreFetch.mockResolvedValue(makeScore('2026-10-05', { score: 35 }, { date: '2026-10-04', score: 81 }));
    renderScreen();
    const h = await hero();
    await waitFor(() => expect(within(h).getByText('Short night')).toBeTruthy());
    expect(h.props.accessibilityLabel).toBe('Sleep score 35, Low, short night. Down 46 from Sunday. High confidence.');
  });

  it('Short night on a Good score keeps the band word Good', async () => {
    mockParams = { date: TODAY };
    nightFetch.mockResolvedValue(makeDetail(TODAY, { minutesAsleep: 410 }));
    scoreFetch.mockResolvedValue(makeScore(TODAY, { score: 66 }));
    renderScreen();
    const h = await hero();
    await waitFor(() => expect(within(h).getByText('Short night')).toBeTruthy());
    expect(within(h).getByText('Good')).toBeTruthy();
  });

  it('building: nights counted, the moon dimmed', async () => {
    scoreFetch.mockResolvedValue(makeScore(TODAY, { score: null, coldStart: [{ metric: 'SLEEP_EFFICIENCY', daysCollected: 9, daysRequired: 14 }] }));
    renderScreen();
    const h = await hero();
    await waitFor(() => expect(within(h).getByText('Night 9 of 14')).toBeTruthy());
    expect(within(h).getByText('Learning your sleep')).toBeTruthy();
    expect(within(h).getByText('5 nights to go')).toBeTruthy();
    expect(screen.getByTestId('sleep-hero-moon', { includeHiddenElements: true }).props.style).toMatchObject({ opacity: 0.4 });
  });

  it('a night with no score yet: on its way for last night, none for an older night', async () => {
    scoreFetch.mockResolvedValue(null);
    renderScreen();
    expect(within(await hero()).getByText('Score on its way')).toBeTruthy();
    expect(screen.getByText('It appears a few minutes after your watch syncs')).toBeTruthy();
  });

  it('no night today: waiting, the summary says so, the ask is about missing data', async () => {
    mockParams = { date: TODAY };
    sleepFetch.mockResolvedValue(makeWindow({ nights: makeWindow().nights.filter((n) => n.date !== TODAY) }));
    scoreFetch.mockResolvedValue(null);
    nightFetch.mockRejectedValue(notFound());
    renderScreen();
    const h = await hero();
    await waitFor(() => expect(within(h).getByText('No sleep recorded')).toBeTruthy());
    expect(within(h).getByText("Waiting for last night's data")).toBeTruthy();
    expect(screen.getByText('No sleep recorded for this night.')).toBeTruthy();
    expect(await screen.findByText("Last night isn't in yet.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('ask-coach-button'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach', params: { prefill: "Why don't I have sleep data for last night?" } }, { pop: true });
  });

  it('nap-only: no night in the hero, the nap in the summary', async () => {
    mockParams = { date: '2026-10-07' };
    nightFetch.mockResolvedValue(makeDetail('2026-10-07', { mainIsNap: true, minutesAsleep: 20, bedtime: '14:10', wakeTime: '14:35', hasStages: false, stages: [] }));
    renderScreen();
    const h = await hero();
    await waitFor(() => expect(within(h).getByText('Only a nap was recorded')).toBeTruthy());
    expect(screen.getByText('Only a nap: 20m at 2:10 pm')).toBeTruthy();
  });

  it('low confidence ends the line in the Fair colour', async () => {
    scoreFetch.mockResolvedValue(makeScore(TODAY, { confidenceLevel: 'LOW' }));
    renderScreen();
    // Tests render in the light scheme (as RecoveryScreen.test.tsx:162 does).
    expect(await screen.findByText('Low confidence')).toHaveStyle({ color: COLORS.light.scoreFair });
  });

  it('a night error is one retry card in place of the hero, the summary and the night cards', async () => {
    scoreFetch.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderScreen();
    expect(await screen.findByText('This night could not be loaded.')).toBeTruthy();
    expect(screen.queryByTestId('sleep-hero')).toBeNull();
    expect(screen.queryByTestId('sleep-summary')).toBeNull();
    fireEvent.press(screen.getByTestId('sleep-night-retry'));
    expect(await hero()).toBeTruthy();
  });
});

describe('SleepScreen: picker', () => {
  it('seven nights oldest first, Last for today, h:mm, dashes and spoken tabs', async () => {
    renderScreen();
    await hero();
    const dates = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', TODAY];
    for (const d of dates) expect(screen.getByTestId(`sleep-night-${d}`)).toBeTruthy();
    const last = screen.getByTestId(`sleep-night-${TODAY}`);
    expect(within(last).getByText('Last')).toBeTruthy();
    expect(within(last).getByText('7:12')).toBeTruthy();
    expect(last.props.accessibilityRole).toBe('tab');
    expect(last.props.accessibilityState).toMatchObject({ selected: true });
    expect(last.props.accessibilityLabel).toBe('Thursday, last night, 7 hours 12 minutes, Excellent');
    const tue = screen.getByTestId('sleep-night-2026-10-06');
    expect(within(tue).getByText('—')).toBeTruthy();
    expect(tue.props.accessibilityLabel).toBe('Tuesday, no sleep recorded');
    // Wed 7 Oct shows main sleep (418), not the day total with its nap (438).
    expect(within(screen.getByTestId('sleep-night-2026-10-07')).getByText('6:58')).toBeTruthy();
    for (const d of dates) expect(screen.getByTestId(`sleep-night-${d}`).props.accessibilityLabel).not.toMatch(SPOKEN_FORBIDDEN);
  });

  it('a tap selects that night through the route; the selected night is a no-op', async () => {
    renderScreen();
    await hero();
    fireEvent.press(screen.getByTestId('sleep-night-2026-10-05'));
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ date: '2026-10-05' });
    mockNavigation.setParams.mockClear();
    fireEvent.press(screen.getByTestId(`sleep-night-${TODAY}`));
    expect(mockNavigation.setParams).not.toHaveBeenCalled();
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });

  it('an empty past night is still tappable', async () => {
    renderScreen();
    await hero();
    fireEvent.press(screen.getByTestId('sleep-night-2026-10-06'));
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ date: '2026-10-06' });
  });

  it('syncing and backfill captions', async () => {
    mockSyncState = 'syncing';
    sleepFetch.mockResolvedValue(makeWindow({ nights: makeWindow().nights.filter((n) => n.date !== TODAY), stagesBackfillPending: true }));
    renderScreen();
    expect(await screen.findByText("Last night isn't in yet. Syncing…")).toBeTruthy();
    expect(screen.getByText('Reading older nights…')).toBeTruthy();
  });

  it('a nights error has its own retry while the hero still renders', async () => {
    mockParams = { date: TODAY };
    sleepFetch.mockRejectedValueOnce(new Error('offline'));
    renderScreen();
    expect(await screen.findByText('Your nights could not be loaded.')).toBeTruthy();
    expect(await hero()).toBeTruthy();
    fireEvent.press(screen.getByTestId('sleep-window-retry'));
    await waitFor(() => expect(sleepFetch).toHaveBeenCalledTimes(2));
  });
});

describe('SleepScreen: summary', () => {
  it('eyebrow, main sleep, caption and line, read as one element', async () => {
    renderScreen();
    // The goal part needs the goal section, which may land after the night.
    await screen.findByText('11:10 pm → 6:52 am · +12m vs your usual · 48m short of your 8h goal');
    const s = screen.getByTestId('sleep-summary');
    expect(within(s).getByText('Last night · Thu 8 Oct')).toBeTruthy();
    expect(within(s).getByText('7h 12m')).toBeTruthy();
    expect(within(s).getByText('asleep')).toBeTruthy();
    expect(within(s).getByText('11:10 pm → 6:52 am · +12m vs your usual · 48m short of your 8h goal')).toBeTruthy();
    expect(s.props.accessibilityLabel).toBe('Night ending Thursday 8 October. 7 hours 12 minutes asleep. 11:10 pm to 6:52 am. 12 minutes more than usual. 48 minutes short of your 8 hour goal.');
  });

  it('naps beside the night', async () => {
    nightFetch.mockResolvedValue(makeDetail(TODAY, { naps: [{ start: '2026-10-08T18:10:00.000Z', end: '2026-10-08T18:35:00.000Z', minutesAsleep: 20 }] }));
    renderScreen();
    expect(await screen.findByText('main sleep · 7h 32m with a nap')).toBeTruthy();
  });

  it('swaps to the newly selected night when the route param changes', async () => {
    const { rerender } = renderScreen();
    await screen.findByText('Last night · Thu 8 Oct');
    mockParams = { date: '2026-10-05' };
    rerender(withCharacter(<SleepScreen />, { characterId: 'mochi', status: STATUS }));
    expect(await screen.findByText('Mon 5 Oct')).toBeTruthy();
    expect(nightFetch).toHaveBeenCalledWith('2026-10-05');
  });
});

describe('SleepScreen: goal row and Ask bar', () => {
  it('the goal row reads the board line and opens BedtimeGoal', async () => {
    renderScreen();
    expect(await screen.findByText('Bed 10:45 pm · Wake 6:45 am · 8h · Reminder 30 min before')).toBeTruthy();
    const row = screen.getByTestId('sleep-goal-row');
    expect(row.props.accessibilityLabel).toBe('Bedtime goal. Bed 10:45 pm, Wake 6:45 am, 8 hours, Reminder 30 min before.');
    fireEvent.press(row);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BedtimeGoal');
  });

  it('a goal error has its own retry', async () => {
    (fetchSleepGoal as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    renderScreen();
    fireEvent.press(await screen.findByTestId('sleep-goal-retry'));
    expect(await screen.findByTestId('sleep-goal-row')).toBeTruthy();
  });

  it('asks about last night, and about this night on a past one', async () => {
    renderScreen();
    const bar = await screen.findByTestId('ask-coach-button');
    expect(bar.props.accessibilityLabel).toBe('Ask Mochi about last night');
    fireEvent.press(bar);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach', params: { prefill: 'How was my sleep last night?' } }, { pop: true });
  });

  it('a past night asks about this night', async () => {
    mockParams = { date: '2026-10-05' };
    renderScreen();
    const bar = await screen.findByTestId('ask-coach-button');
    expect(bar.props.accessibilityLabel).toBe('Ask Mochi about this night');
    fireEvent.press(bar);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach', params: { prefill: 'How was my sleep on Monday 5 October?' } }, { pop: true });
  });

  it('the Ask bar is hidden when the coach is off; the info sheet still works', async () => {
    renderScreen({ ...STATUS, enabled: false });
    await hero();
    expect(screen.queryByTestId('ask-coach-button')).toBeNull();
    fireEvent.press(screen.getByTestId('sleep-info'));
    expect(await screen.findByTestId('sleep-info-sheet')).toBeTruthy();
  });
});
```

  The "Mochi" name follows `RecoveryScreen.test.tsx:233`; use whatever `characterInfo('mochi').name` is.

  Replace `mobile/__tests__/navigation/sleepNavigation.test.ts` with:

```ts
import { openNight, openSleep } from '../../src/navigation/sleepNavigation';

describe('sleepNavigation', () => {
  it('openSleep opens the Sleep page on a night, or on its default night', () => {
    const nav = { navigate: jest.fn() };
    openSleep(nav, '2026-10-08');
    openSleep(nav);
    expect(nav.navigate).toHaveBeenNthCalledWith(1, 'Sleep', { date: '2026-10-08' });
    expect(nav.navigate).toHaveBeenNthCalledWith(2, 'Sleep', undefined);
  });
  it('openNight is the Sleep page on that night (the Recovery Last night tile)', () => {
    const nav = { navigate: jest.fn() };
    openNight(nav, '2026-10-08');
    expect(nav.navigate).toHaveBeenCalledWith('Sleep', { date: '2026-10-08' });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail:**
  `__tests__/screens/SleepScreen.test.tsx __tests__/navigation/sleepNavigation.test.ts __tests__/screens/RecoveryScreen.test.tsx`.

- [ ] **Step 3: Implement.** Layout per spec §2.1: 16 px gutter, 14 px gap, safe-area top + 8, `paddingBottom` 120 with
  the Ask bar or 32 without.

```ts
// mobile/src/navigation/sleepNavigation.ts
// The only named targets for the Sleep page (spec §5): no other caller names the route, except the notification
// handler (navigationRef) and the page's own setParams. A plain navigate updates an open Sleep page's params.
type Nav = { navigate: (...args: any[]) => void };

export function openSleep(navigation: Nav, date?: string): void {
  navigation.navigate('Sleep', date ? { date } : undefined);
}

/** "Open this night" (the Recovery Last night tile, the Activity calendar). */
export function openNight(navigation: Nav, date: string): void {
  openSleep(navigation, date);
}
```

```tsx
// mobile/src/components/sleep/SleepHeader.tsx
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { Button } from '../ui/button';
import { PageTitle } from '../ui/page-title';

// Back, the page title, info and the bedtime goal (spec §3.1). The stack header is hidden for this route.
export function SleepHeader({ onBack, onInfo, onGoal }: { onBack: () => void; onInfo: () => void; onGoal: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <View className="flex-row items-center gap-2" style={{ marginHorizontal: -4 }}>
      <Button testID="sleep-back" variant="outline" size="icon-lg" accessibilityLabel={SLEEP_COPY.back} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color={colors.foreground} />
      </Button>
      {/* Balances the two buttons on the right so the title sits in the middle. */}
      <View style={{ width: 40 }} />
      <View className="flex-1 items-center">
        <PageTitle>{SLEEP_COPY.title}</PageTitle>
      </View>
      <Button testID="sleep-info" variant="outline" size="icon-lg" accessibilityLabel={SLEEP_COPY.info} onPress={onInfo}>
        <Ionicons name="information-circle-outline" size={18} color={colors.foreground} />
      </Button>
      <Button testID="sleep-goal-button" variant="outline" size="icon-lg" accessibilityLabel={SLEEP_COPY.bedtimeGoal} onPress={onGoal}>
        <Ionicons name="alarm-outline" size={18} color={colors.foreground} />
      </Button>
    </View>
  );
}
```

```tsx
// mobile/src/components/sleep/SleepInfoSheet.tsx
import React from 'react';
import { View } from 'react-native';
import type { ScoreBandsDTO, ScoreDetailDTO } from '../../api/scores';
import { buildBaselineSentence, SLEEP_SCORE_FRAMING } from '../../lib/scoreInsights';
import { infoBands, infoWeights, SLEEP_COPY } from '../../lib/sleepCopy';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

// "How the score works" (spec §3.1, decision 7), mirroring Recovery's. Works with the coach off and without a score.
export function SleepInfoSheet({ visible, onClose, detail, bands }: { visible: boolean; onClose: () => void; detail: ScoreDetailDTO | null; bands: ScoreBandsDTO | undefined }) {
  const weights = detail ? infoWeights(detail.score.factors) : null;
  // The duration factor is scored against the goal, so a SLEEP baseline is never listed as used (ScoreDetail's rule).
  const baselines = (detail?.baselines ?? []).filter((b) => b.metric !== 'SLEEP');
  return (
    <Sheet visible={visible} onClose={onClose} testID="sleep-info-sheet">
      <View className="gap-3 pb-2">
        <Text className="text-heading">{SLEEP_COPY.infoTitle}</Text>
        <Text className="text-body">{SLEEP_SCORE_FRAMING}</Text>
        <Text className="text-body">{SLEEP_COPY.infoHow}</Text>
        {weights ? <Text testID="sleep-info-weights" className="text-body">{weights}</Text> : null}
        {baselines.map((b) => (
          <Text key={b.metric} className="text-body">{buildBaselineSentence(b)}</Text>
        ))}
        <View className="gap-1.5">
          {infoBands(detail?.bands ?? bands).map((line) => (
            <Text key={line} className="text-body">{line}</Text>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
```

```tsx
// mobile/src/components/sleep/SleepHero.tsx
import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { ScoreBandsDTO } from '../../api/scores';
import { COLORS } from '../../theme';
import { pickColdStartProgress, scoreBand } from '../../lib/scoreInsights';
import { buildingHero, heroA11y, noNightHero, noScoreHero, sleepHeroLine, sleepVerdict } from '../../lib/sleepCopy';
import type { NightLoad } from '../../lib/useSleepPage';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { MoonArt } from './MoonArt';

// Moon, numeral, verdict and the hero line (spec §3.2); a screen reader reads it as one element.
export function SleepHero({ date, today, load, goalMinutes, bands }: {
  date: string; today: string; load: NightLoad; goalMinutes: number | null; bands: ScoreBandsDTO | undefined;
}) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  if (load.status !== 'ready') {
    return (
      <View testID="sleep-hero-loading" className="items-center pt-1.5">
        <Skeleton className="h-[200px] w-[125px] rounded-card" />
      </View>
    );
  }
  const { score: detail, night } = load.data;
  const napOnly = night?.mainIsNap === true;
  const s = detail?.score.score ?? null;
  const liveBands = detail?.bands ?? bands;

  let numeral = '—';
  let numeralClass = 'text-score';
  let verdict: string;
  let line: React.ReactNode = null;
  let label: string;
  let dim = false;
  if (napOnly || (!detail && !night)) {
    const h = noNightHero({ isToday: date === today, napOnly });
    verdict = h.verdict;
    line = h.line;
    label = `${h.verdict}. ${h.line}`;
    dim = true;
  } else if (detail && s !== null) {
    numeral = String(Math.round(s));
    verdict = sleepVerdict({ score: s, bands: liveBands, mainMinutes: night?.minutesAsleep ?? null, goalMinutes });
    const hl = sleepHeroLine({ score: s, bands: liveBands, date, today, previous: detail.previous, confidence: detail.score.confidenceLevel });
    const low = detail.score.confidenceLevel === 'LOW';
    line = (
      <>
        <Text className="text-caption" style={{ color: colors[scoreBand(s, liveBands)] }}>{hl.band}</Text>
        {hl.lead}
        <Text className="text-caption text-muted-foreground" style={low ? { color: colors.scoreFair } : undefined}>{hl.confidence}</Text>
      </>
    );
    label = heroA11y(s, hl.band, verdict, hl.spoken);
  } else if (detail) {
    const b = buildingHero(pickColdStartProgress(detail.score.coldStart));
    numeral = b.numeral;
    numeralClass = 'text-number';
    verdict = b.verdict;
    line = b.line;
    label = b.line ? `${b.verdict}. ${b.line}` : b.verdict;
    dim = true;
  } else {
    const h = noScoreHero(date, today);
    verdict = h.verdict;
    line = h.line;
    label = h.line ? `${h.verdict}. ${h.line}` : h.verdict;
  }

  return (
    <View testID="sleep-hero" accessible accessibilityLabel={label} className="items-center" style={{ paddingTop: 6 }}>
      <MoonArt dim={dim} testID="sleep-hero-moon" />
      <Text className={`${numeralClass} mt-2 tabular-nums`}>{numeral}</Text>
      <Text className="mt-1 text-heading">{verdict}</Text>
      {line ? <Text className="mt-1 text-center text-caption text-muted-foreground">{line}</Text> : null}
    </View>
  );
}
```

```tsx
// mobile/src/components/sleep/NightPicker.tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { SleepActivityDTO } from '../../api/sleep';
import { COLORS } from '../../theme';
import { addDays } from '../../lib/heatmap';
import { BAND_WORD } from '../../lib/recoveryCopy';
import { scoreBand } from '../../lib/scoreInsights';
import { formatHm, pickerCellLabel, pickerWeekday, SLEEP_COPY } from '../../lib/sleepCopy';
import { isNapOnly, mainMinutes } from '../../lib/sleepStats';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { SectionError, type Section } from './Section';

// Seven nights A-6..A, oldest left (spec §3.3). Tabs, so the buttons guard does not flag them (plan ruling 12).
// The selected night uses the default look, the others the outline look; rounded-lg, never pills.
export function NightPicker({ anchor, today, date, window, syncing, onSelect, onRetry }: {
  anchor: string; today: string; date: string; window: Section<SleepActivityDTO>; syncing: boolean;
  onSelect: (date: string) => void; onRetry: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  if (window.phase === 'loading') return <Skeleton testID="sleep-picker-loading" className="h-[60px] w-full rounded-lg" />;
  if (window.phase === 'error') return <SectionError testID="sleep-window-retry" message={SLEEP_COPY.windowError} onRetry={onRetry} />;

  const byDate = new Map(window.data.nights.map((n) => [n.date, n]));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(anchor, i - 6));
  const todayMissing = anchor === today && !byDate.has(today);
  return (
    <View className="gap-2">
      <View accessibilityRole="tablist" className="flex-row gap-[5px]">
        {dates.map((d) => {
          const n = byDate.get(d);
          const minutes = n && !isNapOnly(n) ? mainMinutes(n) : null;
          const band = n && minutes !== null && n.sleepScore !== null ? scoreBand(n.sleepScore, window.data.bands) : null;
          const selected = d === date;
          return (
            <Pressable
              key={d}
              testID={`sleep-night-${d}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={pickerCellLabel({ date: d, today, minutes, band: band ? BAND_WORD[band] : null })}
              onPress={() => onSelect(d)}
              className={`h-[60px] flex-1 items-center justify-center gap-0.5 rounded-lg border active:opacity-70 ${selected ? 'border-primary bg-primary' : 'border-border'}`}
            >
              <Text className={`text-fine ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
                {pickerWeekday(d, today)}
              </Text>
              <Text className={`text-caption tabular-nums ${selected ? 'font-bold text-primary-foreground' : ''}`} numberOfLines={1}>
                {minutes === null ? SLEEP_COPY.noValue : formatHm(minutes)}
              </Text>
              <View testID={`sleep-night-dash-${d}`} style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: band ? colors[band] : colors.hairline }} />
            </Pressable>
          );
        })}
      </View>
      {todayMissing ? <Text testID="sleep-still-syncing" className="text-caption text-muted-foreground">{SLEEP_COPY.stillSyncing(syncing)}</Text> : null}
      {window.data.stagesBackfillPending ? <Text testID="sleep-older-nights" className="text-caption text-muted-foreground">{SLEEP_COPY.backfill}</Text> : null}
    </View>
  );
}
```

```tsx
// mobile/src/components/sleep/NightSummary.tsx
import React from 'react';
import { View } from 'react-native';
import type { SleepNightDetail } from '../../api/sleep';
import { durationCaption, nightEyebrow, SLEEP_COPY, summaryA11y, summaryLine } from '../../lib/sleepCopy';
import { formatDuration } from '../../lib/sleepStats';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// The night's date, main sleep and its comparisons (spec §3.4); one element for a screen reader.
export function NightSummary({ date, today, night, goalMinutes }: { date: string; today: string; night: SleepNightDetail | null; goalMinutes: number | null }) {
  const eyebrow = <SectionLabel>{nightEyebrow(date, today)}</SectionLabel>;
  if (!night) {
    return (
      <View testID="sleep-summary" className="gap-1 px-1 pt-1">
        {eyebrow}
        <Text className="text-body text-muted-foreground">{SLEEP_COPY.noSleepForNight}</Text>
      </View>
    );
  }
  if (night.mainIsNap) {
    return (
      <View testID="sleep-summary" className="gap-1 px-1 pt-1">
        {eyebrow}
        <Text className="text-body text-muted-foreground">{SLEEP_COPY.onlyNap(night.minutesAsleep, night.bedtime)}</Text>
      </View>
    );
  }
  const p = { bedtime: night.bedtime, wakeTime: night.wakeTime, mainMinutes: night.minutesAsleep, usual: night.usualMinutesAsleep, goal: goalMinutes };
  return (
    <View testID="sleep-summary" accessible accessibilityLabel={summaryA11y({ date, ...p })} className="gap-1 px-1 pt-1">
      {eyebrow}
      <View className="flex-row items-baseline gap-2.5">
        <Text className="text-number tabular-nums">{formatDuration(night.minutesAsleep)}</Text>
        <Text className="text-caption text-muted-foreground">{durationCaption(night.minutesAsleep, night.naps.map((n) => n.minutesAsleep))}</Text>
      </View>
      <Text className="text-caption text-muted-foreground tabular-nums">{summaryLine(p)}</Text>
    </View>
  );
}
```

  Note `formatDuration(432)` is "7h 12m" (and pads "7h 05m"), the board's form.

```tsx
// mobile/src/components/sleep/BedtimeGoalRow.tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { SleepGoal } from '../../api/sleep';
import { COLORS } from '../../theme';
import { goalRowA11y, goalRowLine, SLEEP_COPY } from '../../lib/sleepCopy';
import { withAlpha } from '../../lib/utils';
import type { WindDownSettings } from '../../lib/windDown';
import { Card } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { SectionError, type Section } from './Section';

// The board's card link to BedtimeGoal (spec §3.12). Allowlisted in the buttons guard as `sleep-goal-row`.
export function BedtimeGoalRow({ goal, reminder, onPress, onRetry }: { goal: Section<SleepGoal>; reminder: WindDownSettings | null; onPress: () => void; onRetry: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  if (goal.phase === 'error') return <SectionError testID="sleep-goal-retry" message={SLEEP_COPY.goalError} onRetry={onRetry} />;
  const line = goal.phase === 'ready' ? goalRowLine(goal.data, reminder) : null;
  return (
    <Pressable
      testID="sleep-goal-row"
      accessibilityRole="button"
      accessibilityLabel={line ? goalRowA11y(line) : SLEEP_COPY.bedtimeGoal}
      onPress={onPress}
      className="active:opacity-70"
    >
      <Card className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-[10px]" style={{ backgroundColor: withAlpha(colors.metricSleep, 0.16) }}>
          <Ionicons name="moon-outline" size={18} color={colors.metricSleep} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-body font-semibold">{SLEEP_COPY.bedtimeGoal}</Text>
          {line ? (
            <Text testID="sleep-goal-line" className="text-caption text-muted-foreground tabular-nums">{line}</Text>
          ) : (
            <Skeleton className="h-4 w-40 rounded-full" />
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Card>
    </Pressable>
  );
}
```

```tsx
// mobile/src/screens/SleepScreen.tsx (whole file; Tasks 6, 8 and 9 add sections where marked)
import React, { useContext, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCharacter } from '../characters/CharacterContext';
import { useScreenFocused } from '../characters/useScreenFocused';
import { characterInfo } from '../components/characters/registry';
import { AskCoachBar } from '../components/coach/AskCoachBar';
import { BedtimeGoalRow } from '../components/sleep/BedtimeGoalRow';
import { NightPicker } from '../components/sleep/NightPicker';
import { NightSummary } from '../components/sleep/NightSummary';
import { SectionError } from '../components/sleep/Section';
import { SleepHeader } from '../components/sleep/SleepHeader';
import { SleepHero } from '../components/sleep/SleepHero';
import { SleepInfoSheet } from '../components/sleep/SleepInfoSheet';
import { Skeleton } from '../components/ui/skeleton';
import { sleepQuestion } from '../lib/coachPrompts';
import { askLabel, SLEEP_COPY } from '../lib/sleepCopy';
import { coachEntryRoute, useCoachStatus } from '../lib/useCoachStatus';
import { useSleepPage } from '../lib/useSleepPage';
import { navigateToCoachEntry } from '../navigation/coachNavigation';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSync } from '../sync/SyncProvider';

// The one Sleep page (spec 2026-10-09 §3): one night in full under a 7-night picker, then the trends, the goal and
// Ask. The route param is the single source of truth for the night, so back leaves the page in one step.
export function SleepScreen() {
  const navigation = useNavigation<any>();
  const param = useRoute<RouteProp<RootStackParamList, 'Sleep'>>().params?.date;
  // Context, not the hook: tests render screens without a provider.
  const insets = useContext(SafeAreaInsetsContext);
  const page = useSleepPage(param);
  const { state: syncState } = useSync();
  const scroll = useRef<ScrollView>(null);
  const [info, setInfo] = useState(false);
  const { status: coachStatus } = useCoachStatus(navigation);
  const coachRoute = coachEntryRoute(coachStatus);
  const focused = useScreenFocused();
  const { characterId } = useCharacter();
  const coachName = characterInfo(characterId).name;

  // Tapping the night already shown does nothing (no params churn, no scroll).
  const select = (d: string) => {
    if (d !== page.date) navigation.setParams({ date: d });
  };
  const scrollTop = () => scroll.current?.scrollTo?.({ y: 0, animated: true });
  const pad = { paddingTop: (insets?.top ?? 0) + 8, paddingHorizontal: 16 };
  const header = <SleepHeader onBack={() => navigation.goBack()} onInfo={() => setInfo(true)} onGoal={() => navigation.navigate('BedtimeGoal')} />;
  const bundle = page.night.status === 'ready' ? page.night.data : null;
  const sheet = <SleepInfoSheet visible={info} onClose={() => setInfo(false)} detail={bundle?.score ?? null} bands={page.bands} />;

  if (page.date === null) {
    return (
      <View className="flex-1 bg-background" style={pad}>
        {header}
        <View testID="sleep-loading" className="items-center gap-3.5 pt-4">
          <Skeleton className="h-[200px] w-[125px] rounded-card" />
          <Skeleton className="h-[60px] w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
        </View>
        {sheet}
      </View>
    );
  }

  const date = page.date;
  const isLastNight = date === page.today;
  const hasNight = bundle ? bundle.night !== null && !bundle.night.mainIsNap : true;
  const goalMinutes = page.goal.phase === 'ready' ? page.goal.data.sleepGoalMinutes : null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView ref={scroll} contentContainerStyle={{ ...pad, gap: 14, paddingBottom: coachRoute ? 120 : 32 }}>
        {header}
        {page.night.status === 'error' ? (
          <SectionError testID="sleep-night-retry" message={SLEEP_COPY.nightError} onRetry={page.reloadNight} />
        ) : (
          <SleepHero date={date} today={page.today} load={page.night} goalMinutes={goalMinutes} bands={page.bands} />
        )}
        <NightPicker
          anchor={page.anchor}
          today={page.today}
          date={date}
          window={page.window}
          syncing={syncState === 'syncing'}
          onSelect={select}
          onRetry={page.reloadWindow}
        />
        {bundle ? (
          <NightSummary date={date} today={page.today} night={bundle.night} goalMinutes={goalMinutes} />
        ) : page.night.status === 'loading' ? (
          <Skeleton testID="sleep-summary-loading" className="h-20 w-full rounded-card" />
        ) : null}
        {/* Task 6: <NightCards/>. Task 8: <BedtimeToWakeCard/>, <RegularityCard/>. Task 9: <SleepMonthCard/>. */}
        <BedtimeGoalRow goal={page.goal} reminder={page.reminder} onPress={() => navigation.navigate('BedtimeGoal')} onRetry={page.reloadGoal} />
      </ScrollView>
      {coachRoute ? (
        <AskCoachBar
          label={askLabel(coachName, isLastNight)}
          focused={focused}
          onPress={() => navigateToCoachEntry(navigation, coachRoute, sleepQuestion(date, isLastNight, hasNight))}
        />
      ) : null}
      {sheet}
    </View>
  );
}
```

  `scrollTop` is unused until Task 9; if the lint config flags it, add it in Task 9 instead. Import paths follow
  `RecoveryScreen.tsx:1-29`. Run the typography guard after writing.

- [ ] **Step 4: Run the tests and confirm they pass:**
  `__tests__/screens/SleepScreen.test.tsx __tests__/navigation/sleepNavigation.test.ts __tests__/screens/RecoveryScreen.test.tsx __tests__/conventions __tests__/navigation/RootNavigator*`.
  Then the typecheck: still 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/sleep mobile/src/screens/SleepScreen.tsx mobile/src/navigation/sleepNavigation.ts mobile/src/navigation/RootNavigator.tsx mobile/__tests__/screens/SleepScreen.test.tsx mobile/__tests__/navigation/sleepNavigation.test.ts mobile/__tests__/screens/RecoveryScreen.test.tsx mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): one Sleep page with header, info sheet, moon hero, night picker, summary, goal row and Ask"
```

---

### Task 6: The night in full — stages, cycles, moments, "The night" and "Steps that day"

**Files:**
- Create: `mobile/src/components/sleep/InBedShare.tsx` (moved verbatim from `components/activity-sheets.tsx:99-114`),
  `mobile/src/components/sleep/NightNumbersCard.tsx` and `mobile/src/components/sleep/NightCards.tsx`.
- Modify: `mobile/src/components/activity-sheets.tsx` (delete `InBedShare`; `NightDetail` imports it from
  `./sleep/InBedShare` until Task 7 deletes `NightDetail`).
- Modify: `mobile/src/screens/SleepNightScreen.tsx:8` (import `InBedShare` from `../components/sleep/InBedShare`; the
  screen itself goes in Task 7).
- Modify: `mobile/src/screens/SleepScreen.tsx` (render `NightCards` after the summary).
- Test: append to `mobile/__tests__/screens/SleepScreen.test.tsx`; create `mobile/__tests__/components/InBedShare.test.tsx`.

**Interfaces:**
- Consumes: `NightBundle` (Task 3), `SLEEP_COPY`, `StageLanes`, `SleepCyclesCard`, `MomentsCard` (unchanged),
  `nightClock` (`lib/sleepStats.ts:136`).
- Produces: `InBedShare` at `components/sleep/InBedShare.tsx` (same props: `{ minutesAsleep; minutesInBed; testID }`),
  `<NightCards night onStepsThatDay />`, `<NightNumbersCard night clock onStepsThatDay />`; testIDs
  `sleep-stages-card`, `sleep-in-bed-share`, `sleep-night-numbers`, `sleep-naps-row`, `sleep-steps-that-day`. The
  "Steps that day" press calls `navigation.navigate('Tabs', { screen: 'Activity', params: { date } })`, which Task 7
  makes Activity honour.

- [ ] **Step 1: Write the failing tests.** `InBedShare.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { InBedShare } from '../../src/components/sleep/InBedShare';

it('shows the in-bed time and the share of it asleep', () => {
  render(<InBedShare minutesAsleep={430} minutesInBed={452} testID="share" />);
  expect(screen.getByTestId('share')).toHaveTextContent('7h 32m in bed · 95% of it asleep');
});
```

  Append to `SleepScreen.test.tsx` (these carry over the useful `SleepNightScreen.test.tsx` cases, which Task 7
  deletes):

```tsx
describe('SleepScreen: the night in full', () => {
  it('stage lanes, cycles and moments for a night with stages', async () => {
    renderScreen();
    const stages = await screen.findByTestId('sleep-stages-card');
    expect(within(stages).getByText('Sleep stages')).toBeTruthy();
    expect(within(stages).getByTestId('stage-lanes')).toBeTruthy();
    expect(screen.getByTestId('cycles-card')).toBeTruthy();
    expect(screen.getByTestId('moments-card')).toBeTruthy();
  });

  it('without stages: bedtime, wake and the in-bed share instead; no cycles or moments', async () => {
    nightFetch.mockResolvedValue(makeDetail(TODAY, { hasStages: false, stages: [], stageTotals: null, minutesAsleep: 430, minutesInBed: 452 }));
    renderScreen();
    expect(await screen.findByTestId('sleep-in-bed-share')).toHaveTextContent('7h 32m in bed · 95% of it asleep');
    expect(within(screen.getByTestId('sleep-stages-card')).getByText('11:10 pm')).toBeTruthy();
    expect(screen.queryByTestId('cycles-card')).toBeNull();
    expect(screen.queryByTestId('moments-card')).toBeNull();
    expect(screen.getByTestId('sleep-night-numbers')).toBeTruthy();
  });

  it('no in-bed bar without stages when time in bed is zero', async () => {
    nightFetch.mockResolvedValue(makeDetail(TODAY, { hasStages: false, stages: [], stageTotals: null, minutesInBed: 0 }));
    renderScreen();
    await screen.findByTestId('sleep-night-numbers');
    expect(screen.queryByTestId('sleep-stages-card')).toBeNull();
  });

  it('The night: the rows in order, hairlines between, no Sleep score row', async () => {
    renderScreen();
    const card = await screen.findByTestId('sleep-night-numbers');
    for (const [label, value] of [['Time in bed', '7h 32m'], ['Time awake', '14m'], ['Time to fall asleep', '12m'], ['After waking', '6m']]) {
      expect(within(card).getByText(label!)).toBeTruthy();
      expect(within(card).getByText(value!)).toBeTruthy();
    }
    expect(within(card).getByText('None')).toBeTruthy();
    expect(within(card).queryByText('Sleep score')).toBeNull();
  });

  it('hides a null row', async () => {
    nightFetch.mockResolvedValue(makeDetail(TODAY, { minutesAwake: null, minutesAfterWakeUp: null }));
    renderScreen();
    const card = await screen.findByTestId('sleep-night-numbers');
    expect(within(card).queryByText('Time awake')).toBeNull();
    expect(within(card).queryByText('After waking')).toBeNull();
  });

  it('naps on the night clock, newest last, zero-length dropped', async () => {
    // The fixture night is New York in summer (UTC-4): 18:10Z is 2:10 pm, 21:00Z is 5:00 pm.
    nightFetch.mockResolvedValue(makeDetail(TODAY, { naps: [
      { start: '2026-10-08T21:00:00.000Z', end: '2026-10-08T21:15:00.000Z', minutesAsleep: 15 },
      { start: '2026-10-08T18:10:00.000Z', end: '2026-10-08T18:35:00.000Z', minutesAsleep: 20 },
      { start: '2026-10-08T19:00:00.000Z', end: '2026-10-08T19:00:00.000Z', minutesAsleep: 0 },
    ] }));
    renderScreen();
    const naps = await screen.findByTestId('sleep-naps-row');
    const lines = within(naps).getAllByText(/ at /).map((t) => t.props.children);
    expect(lines).toEqual(['20m at 2:10 pm', '15m at 5:00 pm']);
  });

  it('nap-only: no stage cards; The night shows the nap row only', async () => {
    mockParams = { date: '2026-10-07' };
    nightFetch.mockResolvedValue(makeDetail('2026-10-07', { mainIsNap: true, minutesAsleep: 20, bedtime: '14:10', wakeTime: '14:35', hasStages: false, stages: [], stageTotals: null, minutesInBed: 25 }));
    renderScreen();
    const card = await screen.findByTestId('sleep-night-numbers');
    expect(screen.queryByTestId('sleep-stages-card')).toBeNull();
    expect(within(card).queryByText('Time in bed')).toBeNull();
    expect(within(card).getByText('20m at 2:10 pm')).toBeTruthy();
  });

  it('no night: no night cards at all', async () => {
    mockParams = { date: '2026-10-06' };
    nightFetch.mockRejectedValue(notFound());
    scoreFetch.mockResolvedValue(null);
    renderScreen();
    await screen.findByText('No sleep recorded for this night.');
    expect(screen.queryByTestId('sleep-night-numbers')).toBeNull();
  });

  it('Steps that day opens the Activity tab on that date (decision 8)', async () => {
    mockParams = { date: '2026-10-05' };
    renderScreen();
    const link = await screen.findByTestId('sleep-steps-that-day');
    expect(link).toHaveTextContent('Steps that day');
    fireEvent.press(link);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Activity', params: { date: '2026-10-05' } });
  });

  it('sits between the summary and the goal row', async () => {
    const { toJSON } = renderScreen();
    await screen.findByTestId('sleep-night-numbers');
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('sleep-summary')).toBeLessThan(tree.indexOf('sleep-stages-card'));
    expect(tree.indexOf('sleep-night-numbers')).toBeLessThan(tree.indexOf('sleep-goal-row'));
  });
});
```

  Check the nap clock expectation against the fixture: `makeDetail` sets `startUtcOffsetSeconds` /
  `endUtcOffsetSeconds` to −14400 and `MOCKUP_SEGMENTS` spans 03:10Z–10:52Z, so `nightClock(...).at('…18:10Z')` reads
  on the end offset: 14:10 → "2:10 pm".

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.** Move `InBedShare` with its imports (`useColorScheme`, `COLORS`, `formatDuration`, `Text`,
  `View`) into `components/sleep/InBedShare.tsx`, unchanged, then fix the two importers.

```tsx
// mobile/src/components/sleep/NightNumbersCard.tsx
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { SleepNightDetail } from '../../api/sleep';
import { COLORS } from '../../theme';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { formatShortDuration, type NightClock } from '../../lib/sleepStats';
import { Button, buttonIconSize } from '../ui/button';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// "The night" (spec §3.8): label left, value right, hairlines between; naps on the night's clock, newest last; then
// "Steps that day", the link the removed Activity night sheet offered (decision 8).
export function NightNumbersCard({ night, clock, onStepsThatDay }: { night: SleepNightDetail; clock: NightClock; onStepsThatDay: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const napOnly = night.mainIsNap === true;
  const rows: Array<[string, string]> = [];
  if (!napOnly) {
    rows.push([SLEEP_COPY.timeInBed, formatShortDuration(night.minutesInBed)]);
    if (night.minutesAwake !== null) rows.push([SLEEP_COPY.timeAwake, formatShortDuration(night.minutesAwake)]);
    if (night.minutesToFallAsleep !== null) rows.push([SLEEP_COPY.timeToFallAsleep, formatShortDuration(night.minutesToFallAsleep)]);
    if (night.minutesAfterWakeUp !== null) rows.push([SLEEP_COPY.afterWaking, formatShortDuration(night.minutesAfterWakeUp)]);
  }
  // A nap-only date's main session is the nap itself. The backend can emit a zero-length nap: dropped.
  const naps = [
    ...(napOnly ? [{ minutes: night.minutesAsleep, at: night.bedtime }] : []),
    ...night.naps
      .filter((n) => n.minutesAsleep > 0)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((n) => ({ minutes: n.minutesAsleep, at: clock.at(n.start) })),
  ];
  return (
    <Card testID="sleep-night-numbers" className="gap-2">
      <SectionLabel>{SLEEP_COPY.theNight}</SectionLabel>
      <View>
        {rows.map(([label, value], i) => (
          <View key={label} className={`flex-row items-baseline justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
            <Text className="text-body">{label}</Text>
            <Text className="text-body text-muted-foreground tabular-nums">{value}</Text>
          </View>
        ))}
        <View testID="sleep-naps-row" className={`flex-row justify-between gap-3 py-2.5 ${rows.length > 0 ? 'border-t border-border' : ''}`}>
          <Text className="text-body">{SLEEP_COPY.naps}</Text>
          <View className="items-end">
            {naps.length === 0 ? (
              <Text className="text-body text-muted-foreground">{SLEEP_COPY.napsNone}</Text>
            ) : (
              naps.map((n, i) => (
                <Text key={i} className="text-body text-muted-foreground tabular-nums">{SLEEP_COPY.napRow(n.minutes, n.at)}</Text>
              ))
            )}
          </View>
        </View>
      </View>
      <Button
        testID="sleep-steps-that-day"
        variant="link"
        size="sm"
        className="self-start"
        iconEnd={<Ionicons name="chevron-forward" size={buttonIconSize('sm')} color={colors.foreground} />}
        onPress={onStepsThatDay}
      >
        {SLEEP_COPY.stepsThatDay}
      </Button>
    </Card>
  );
}
```

```tsx
// mobile/src/components/sleep/NightCards.tsx
import React from 'react';
import { View } from 'react-native';
import type { SleepNightDetail } from '../../api/sleep';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { formatClock, nightClock } from '../../lib/sleepStats';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { InBedShare } from './InBedShare';
import { MomentsCard } from './MomentsCard';
import { NightNumbersCard } from './NightNumbersCard';
import { SleepCyclesCard } from './SleepCyclesCard';
import { StageLanes } from './StageLanes';

// The selected night inline (decision 1, spec §3.5-3.8). Stage instants are UTC; everything is told on the night's own
// clock. A nap-only date has no stage cards.
export function NightCards({ night, onStepsThatDay }: { night: SleepNightDetail; onStepsThatDay: () => void }) {
  const napOnly = night.mainIsNap === true;
  const stages = !napOnly && night.hasStages && night.stages.length > 0 ? night.stages : null;
  const clock = nightClock(night, stages ?? []);
  return (
    <>
      {stages ? (
        <>
          <Card testID="sleep-stages-card" className="gap-2.5">
            <SectionLabel>{SLEEP_COPY.stagesLabel}</SectionLabel>
            <StageLanes stages={stages} clock={clock} />
          </Card>
          <SleepCyclesCard stages={stages} clock={clock} />
          <MomentsCard stages={stages} clock={clock} minutesToFallAsleep={night.minutesToFallAsleep} minutesAsleep={night.minutesAsleep} />
        </>
      ) : !napOnly && night.minutesInBed > 0 ? (
        <Card testID="sleep-stages-card" className="gap-2">
          <SectionLabel>{SLEEP_COPY.stagesLabel}</SectionLabel>
          <View className="flex-row justify-between">
            <Text className="text-body font-semibold tabular-nums">{formatClock(night.bedtime)}</Text>
            <Text className="text-body font-semibold tabular-nums">{formatClock(night.wakeTime)}</Text>
          </View>
          <InBedShare minutesAsleep={night.minutesAsleep} minutesInBed={night.minutesInBed} testID="sleep-in-bed-share" />
        </Card>
      ) : null}
      <NightNumbersCard night={night} clock={clock} onStepsThatDay={onStepsThatDay} />
    </>
  );
}
```

  In `SleepScreen.tsx`, replace the Task 6 slot comment with:

```tsx
        {bundle?.night ? (
          <NightCards night={bundle.night} onStepsThatDay={() => navigation.navigate('Tabs', { screen: 'Activity', params: { date } })} />
        ) : null}
```

  and add `import { NightCards } from '../components/sleep/NightCards';`.

- [ ] **Step 4: Run the tests and confirm they pass,** with
  `__tests__/screens/SleepScreen.test.tsx __tests__/components/InBedShare.test.tsx __tests__/components/activity-sheets.test.tsx __tests__/screens/SleepNightScreen.test.tsx __tests__/conventions`.
  Then the typecheck: still 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/sleep mobile/src/components/activity-sheets.tsx mobile/src/screens/SleepNightScreen.tsx mobile/src/screens/SleepScreen.tsx mobile/__tests__/screens/SleepScreen.test.tsx mobile/__tests__/components/InBedShare.test.tsx
git commit -m "feat(mobile): the selected night inline on the Sleep page, with The night card and Steps that day"
```

---

### Task 7: Activity opens the page; the night sheet and `SleepNight` go

**Files:**
- Modify: `mobile/src/components/activity-heatmap.tsx`:
  - `:33` imports only `DayDetail` from `./activity-sheets`; `:32` adds `mainSleepByDate` (and drops nothing else);
  - `ActivityHeatmapProps` (`:387-400`): `onOpenNight` now documents "A sleep cell, and the steps sheet's sleep link:
    the Sleep page on that night"; add `openDate?: string | null` ("A date to open on the steps page, once") and
    `onOpenedDate?: () => void`;
  - `selection` (`:411`) becomes `useState<string | null>(null)` (the steps sheet's date only);
  - `sleepValues` / `sleepStats` (`:420-428`) read `const mainNights = useMemo(() => (nights ? mainSleepByDate(nights.values()) : null), [nights]);`
    instead of `nights`, so the calendar shows main sleep and skips nap-only dates (plan ruling 5);
  - the sleep card's `onSelect` (`:530`) becomes `(date) => openNight(date)`; the steps card's stays a selection;
  - delete `crossTo` (`:457-461`); `openNight` (`:463-467`) stays (it closes the sheet before the push);
  - the `Sheet` (`:649-668`) renders only `DayDetail`, with `sleepLink={nights ? { night: nights.get(selection) ?? null, onPress: () => openNight(selection) } : undefined}`;
  - add the open-date effect below.
- Modify: `mobile/src/components/activity-sheets.tsx`: delete `NightDetailProps` and `NightDetail` (`:116-215`) and the
  now-unused imports (`Ring`, `Button`, `buttonIconSize`, `compareSleepToAverage`, `formatClock` if unused). In
  `DayDetail`'s `LinkTile` value use `sleepLink.night && !isNapOnly(sleepLink.night) ? formatDuration(mainMinutes(sleepLink.night)) : 'No data'`.
- Modify: `mobile/src/lib/sleepStats.ts`: delete `compareSleepToAverage` (`:154-160`, no importer left).
- Modify: `mobile/src/navigation/TabsNavigator.tsx:15`: `Activity: { date?: string } | undefined;` with the comment
  "`date` opens that day's steps sheet once (the Sleep page's Steps that day)".
- Modify: `mobile/src/screens/ActivityScreen.tsx`: read the param, pass `openDate` / `onOpenedDate`, and route the
  sleep links through `sleepNavigation` (code below).
- Delete: `mobile/src/screens/SleepNightScreen.tsx`, and in `RootNavigator.tsx` the `SleepNight` param (`:106-107`),
  its `Stack.Screen` (`:255`) and its import. Nothing reaches the route any more: Activity (here), the old Sleep
  screen (Task 5) and `openNight` (Task 5) were its only callers, and the signed-in navigator has no deep linking
  (spec §5.1 #17).
- Tests:
  - `mobile/__tests__/components/ActivityHeatmap.test.tsx`: delete 'opens the night sheet with time asleep…',
    'says so when a tapped night has no record…', 'opens the full night from the night sheet' and 'jumps between the
    two sheets for the same day…' (`:243-313`); add the cases in Step 1.
  - `mobile/__tests__/components/activity-sheets.test.tsx`: delete the `describe('NightDetail', …)` block; keep the
    `DayDetail` cases; add the main-sleep link case in Step 1.
  - `mobile/__tests__/screens/ActivityScreen.test.tsx`: add `useRoute: () => ({ params: mockRouteParams })` to the
    `@react-navigation/native` mock and `setParams: jest.fn()` to `mockNavigation`; `:76` expects
    `navigate('Sleep', undefined)`; `:86` expects `navigate('Sleep', { date: '2026-10-01' })` (rename the test to
    "opens a night on the Sleep page"); add the open-date case.
  - `mobile/__tests__/lib/sleepStats.test.ts`: delete the `compareSleepToAverage` cases.
  - Delete `mobile/__tests__/screens/SleepNightScreen.test.tsx` (its useful cases moved in Task 6). Update
    `mobile/__tests__/navigation/RootNavigator.test.tsx` if it names `SleepNight`
    (`grep -rn SleepNight mobile/__tests__ mobile/src` must print nothing at the end of this task).

**Interfaces:**
- Consumes: `openSleep` / `openNight` (Task 5), `mainSleepByDate` / `mainMinutes` / `isNapOnly` (Task 2), the
  `Tabs → Activity { date }` call Task 6 makes.
- Produces: `TabParamList['Activity'] = { date?: string } | undefined`; Activity opens that date's steps sheet once
  and clears the param.

- [ ] **Step 1: Write the failing tests.** In `ActivityHeatmap.test.tsx` (reuse its `renderHeatmap`, `sleepOf`,
  `nightOf`, `SEP_22` and `TODAY` helpers):

```tsx
    it('a sleep cell opens that night on the Sleep page, with no sheet', () => {
      const onOpenNight = jest.fn();
      const utils = render(
        <ActivityHeatmap steps={new Map()} earliestDate="2025-01-01" today={TODAY} sleep={sleepOf([nightOf('2026-09-22', 467)])} onOpenNight={onOpenNight} />,
      );
      fireEvent(utils.getByTestId('sleep-heatmap-canvas'), 'layout', { nativeEvent: { layout: { width: 350, height: 300 } } });
      fireEvent.press(utils.getByTestId('sleep-heatmap-grid'), { nativeEvent: SEP_22 });
      expect(onOpenNight).toHaveBeenCalledWith('2026-09-22');
      expect(utils.queryByTestId('night-detail')).toBeNull();
      expect(utils.queryByTestId('day-detail')).toBeNull();
    });

    it("the steps sheet's sleep link closes the sheet, then opens the night", () => {
      const onOpenNight = jest.fn();
      const utils = render(
        <ActivityHeatmap steps={new Map([['2026-09-22', 12000]])} earliestDate="2025-01-01" today={TODAY} sleep={sleepOf([nightOf('2026-09-22', 467)])} onOpenNight={onOpenNight} />,
      );
      fireEvent(utils.getByTestId('heatmap-canvas'), 'layout', { nativeEvent: { layout: { width: 350, height: 300 } } });
      fireEvent.press(utils.getByTestId('heatmap-grid'), { nativeEvent: SEP_22 });
      expect(utils.getByTestId('day-detail-sleep-link')).toHaveTextContent(/7h 47m/);
      fireEvent.press(utils.getByTestId('day-detail-sleep-link'));
      expect(utils.queryByTestId('day-detail')).toBeNull();
      expect(onOpenNight).toHaveBeenCalledWith('2026-09-22');
    });

    it('the sleep calendar counts main sleep and skips nap-only dates', () => {
      const { getByTestId } = renderHeatmap([], '2025-01-01', sleepOf([
        nightOf('2026-09-21', 500, { mainMinutesAsleep: 467 }),
        nightOf('2026-09-22', 45, { mainMinutesAsleep: 45, mainIsNap: true }),
      ]));
      expect(getByTestId('sleep-stat-average')).toHaveTextContent('7h 47m');
      expect(getByTestId('sleep-stat-longest')).toHaveTextContent('7h 47m · Sep 21');
    });

    it('a date handed in opens its steps sheet once, on its month', () => {
      const onOpenedDate = jest.fn();
      const utils = render(
        <ActivityHeatmap steps={new Map([['2026-08-14', 9000]])} earliestDate="2025-01-01" today={TODAY} sleep={sleepOf([])} openDate="2026-08-14" onOpenedDate={onOpenedDate} />,
      );
      expect(utils.getByTestId('day-detail-steps')).toHaveTextContent('9,000 steps');
      expect(utils.getByTestId('activity-title')).toHaveTextContent('STEPS');
      expect(onOpenedDate).toHaveBeenCalledTimes(1);
    });
```

  If the file's `canvas`/`grid` testIDs or layout step differ from the ones above, copy the exact pattern the deleted
  'opens the full night…' test used (`:277-296`). In `activity-sheets.test.tsx` add:

```tsx
  it('the sleep link shows main sleep, and No data for a nap-only date', () => {
    const { getByTestId, rerender } = render(
      <DayDetail date="2026-10-07" steps={9000} goal={10000} average={null} sleepLink={{ night: makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: 418 }), onPress: jest.fn() }} />,
    );
    expect(getByTestId('day-detail-sleep-link')).toHaveTextContent(/6h 58m/);
    rerender(<DayDetail date="2026-10-07" steps={9000} goal={10000} average={null} sleepLink={{ night: makeNight('2026-10-07', { mainIsNap: true }), onPress: jest.fn() }} />);
    expect(getByTestId('day-detail-sleep-link')).toHaveTextContent(/No data/);
  });
```

  (import `makeNight` from `../../jest-mocks/sleepPageFixture`). In `ActivityScreen.test.tsx` add:

```tsx
  it('a date param opens that day on the steps page, then clears the param', async () => {
    mockRouteParams = { date: '2026-10-01' };
    (fetchActivity as jest.Mock).mockResolvedValue({ days: [{ date: '2026-10-01', steps: 7000 }], earliestDate: '2025-01-01' });
    const { findByTestId } = render(<ActivityScreen />);
    expect(await findByTestId('day-detail-steps')).toHaveTextContent('7,000 steps');
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ date: undefined });
  });
```

  (declare `let mockRouteParams: { date?: string } | undefined;` and reset it to `undefined` in `beforeEach`).

- [ ] **Step 2: Run the tests and confirm they fail:**
  `__tests__/components/ActivityHeatmap.test.tsx __tests__/components/activity-sheets.test.tsx __tests__/screens/ActivityScreen.test.tsx __tests__/lib/sleepStats.test.ts`.

- [ ] **Step 3: Implement** the edits listed under Files. The open-date effect in `ActivityHeatmap`:

```tsx
  // A date handed in from outside (the Sleep page's "Steps that day") opens that day's steps sheet once.
  useEffect(() => {
    if (!openDate) return;
    setView('month');
    setMonthCursor(monthStart(openDate));
    setPage('steps');
    pagerRef.current?.scrollTo?.({ x: 0, animated: false });
    setSelection(openDate);
    onOpenedDate?.();
    // Only when a new date arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDate]);
```

  In `ActivityScreen.tsx`:

```tsx
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { TabParamList } from '../navigation/TabsNavigator';
import { openNight, openSleep } from '../navigation/sleepNavigation';
// …
  const openDate = useRoute<RouteProp<TabParamList, 'Activity'>>().params?.date ?? null;
// …
          <ActivityHeatmap
            // (existing props unchanged)
            openDate={openDate}
            onOpenedDate={() => navigation.setParams({ date: undefined })}
            onOpenSleepDetails={() => openSleep(navigation)}
            onOpenNight={(date) => openNight(navigation, date)}
          />
```

  If importing `TabParamList` from `TabsNavigator.tsx` creates an import cycle (TabsNavigator imports
  ActivityScreen), use `import type` (type-only imports are erased, so there is no runtime cycle).

- [ ] **Step 4: Run the tests and confirm they pass,** plus `__tests__/navigation __tests__/conventions` and
  `grep -rn "SleepNight\b\|NightDetail\b\|compareSleepToAverage" mobile/src mobile/__tests__` (no output, except
  `SleepNightDetail` the type in `api/sleep.ts` and its users). Then the typecheck: still 12 (or lower; record it).

- [ ] **Step 5: Commit.**

```bash
git add -A mobile/src/components/activity-heatmap.tsx mobile/src/components/activity-sheets.tsx mobile/src/lib/sleepStats.ts mobile/src/navigation/TabsNavigator.tsx mobile/src/navigation/RootNavigator.tsx mobile/src/screens/ActivityScreen.tsx mobile/src/screens/SleepNightScreen.tsx mobile/__tests__
git commit -m "feat(mobile): Activity sleep cells open the Sleep page; remove the night sheet and SleepNight; Activity opens a date"
```

---

### Task 8: Bedtime to wake and Regularity

**Files:**
- Modify: `mobile/src/components/sleep/WindowChart.tsx` (whole component; code below).
- Create: `mobile/src/components/sleep/BedtimeToWakeCard.tsx`.
- Rewrite: `mobile/src/components/sleep/RegularityCard.tsx` (board layout; `coachName` prop removed).
- Modify: `mobile/src/lib/regularityCopy.ts` (delete `regularityLine`; `nightsToGo` stays).
- Modify: `mobile/src/screens/SleepScreen.tsx` (render both cards after the night cards; a `range` state).
- Modify: `mobile/__tests__/conventions/buttons.test.ts:75`: the `sleep-window-bar-${bar.date}` reason becomes "a chart
  bar that selects its night".
- Test: append to `SleepScreen.test.tsx`; update `mobile/__tests__/lib/regularityCopy.test.ts` (delete the
  `regularityLine` cases); `mobile/__tests__/lib/sleepWindow.test.ts` must stay green unchanged.

**Interfaces:**
- Consumes: `page.window`, `page.anchor`, `page.date`, `page.goal`, `page.regularity` (Task 3), the screen's `select`
  (Task 5), `isNapOnly` (Task 2).
- Produces: `WindowChart` props `{ dates; nights; goal; selectedDate: string | null; onPressNight: (date) => void }`
  (`onPressNight` now selects); testIDs `sleep-window-card`, `sleep-window-selected`, `sleep-window-goal-top`,
  `sleep-window-goal-bottom`, `sleep-window-initial-${date}`, `sleep-regularity-word`, `sleep-regularity-spreads`.
  `type SleepRange = 'week' | 'two-weeks'`.

- [ ] **Step 1: Write the failing tests** (appended to `SleepScreen.test.tsx`):
  - **Chart, default page:** `sleep-window-card` shows "Bedtime to wake" and the range control (`sleep-range`) with
    "Week" and "2 weeks". Bars exist for 10-02, 03, 04, 05, 07 and 08 (no bar for 10-06, which has no night). The bar
    for D (`sleep-window-bar-2026-10-08`) contains `sleep-window-selected` and its label is
    "Thursday: 11:08 pm to 6:40 am, selected"; the bar for 10-05 is labelled "Monday: 12:50 am to 6:10 am". No
    `sleep-window-avg-bedtime` / `sleep-window-avg-wake`. The goal band and its two dashed edges render
    (`sleep-window-goal-band`, `-goal-top`, `-goal-bottom`). The initial for D (`sleep-window-initial-2026-10-08`,
    found with `includeHiddenElements: true`) has `toHaveStyle({ color: COLORS.light.foreground })`; the initial for
    10-07 does not.
  - **Bar tap:** pressing `sleep-window-bar-2026-10-04` calls `setParams({ date: '2026-10-04' })`; pressing D's bar
    calls nothing.
  - **2 weeks:** `fireEvent.press(screen.getByText('2 weeks'))` shows 14 initials (`sleep-window-initial-2026-09-25` …
    `-2026-10-08`) and no refetch (`fetchSleep` called once).
  - **Nap-only night:** with `makeWindow()` plus `makeNight('2026-10-06', { mainIsNap: true, bedtime: '14:10', wakeTime: '14:35' })`,
    there is no `sleep-window-bar-2026-10-06`.
  - **Empty:** with `makeWindow({ nights: [] })`, the chart says "No sleep synced yet."
  - **Old night:** with `mockParams = { date: '2026-09-10' }` and `fetchSleep` returning nights in early September,
    the picker cells are 09-04 … 09-10 and the bar for 09-10 is selected.
  - **Regularity:** `sleep-regularity` shows "Regularity · 7 nights", "Fairly regular" and
    "Bedtime ±24m · Wake ±18m"; its label is `regularityA11y(74, 'Fairly regular', 24, 18)`; there is no
    `sleep-drift-strip` and no `sleep-regularity-coach`.
  - **Regularity, few nights:** with `{ ...REGULARITY, nights: 2, score: null, bedtimeSpreadMinutes: null, wakeSpreadMinutes: null }`,
    it shows "Not enough nights yet. 2 more to go."
  - **Regularity error:** a rejected `fetchSleepRegularity` shows "Sleep regularity could not be loaded." and
    `sleep-regularity-retry` refetches.
  - **Order:** `sleep-night-numbers` < `sleep-window-card` < `sleep-regularity` < `sleep-goal-row` in the tree JSON.

  In `regularityCopy.test.ts`, delete the `regularityLine` describe and keep the `nightsToGo` cases.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.**

```tsx
// mobile/src/components/sleep/WindowChart.tsx
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { SleepGoal, SleepNight } from '../../api/sleep';
import { dayOfWeek } from '../../lib/heatmap';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { layoutSleepWindow } from '../../lib/sleepWindow';
import { formatClock } from '../../lib/sleepStats';
import { withAlpha } from '../../lib/utils';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

const CHART_HEIGHT = 220;
const TICK_COLUMN = 44;
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// One bar per night from bedtime (top) to wake (bottom), a column per date in `dates` (ascending), so a night with
// no data is a gap. The goal window is a faint band with dashed edges (the board); the selected night is ringed and
// the others sit at 45% (spec §3.9, plan ruling 14). A bar press selects its night.
export function WindowChart({ dates, nights, goal, selectedDate, onPressNight }: {
  dates: string[]; nights: SleepNight[]; goal: SleepGoal | null; selectedDate: string | null; onPressNight: (date: string) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const byDate = useMemo(() => new Map(nights.map((n) => [n.date, n])), [nights]);
  const layout = useMemo(() => layoutSleepWindow([...nights].sort((a, b) => a.date.localeCompare(b.date)), goal), [nights, goal]);

  if (layout.bars.length === 0) {
    return (
      <View testID="sleep-window-chart" className="items-center justify-center" style={{ height: CHART_HEIGHT }}>
        <Text testID="sleep-window-empty" className="text-center text-caption text-muted-foreground">
          {nights.length === 0 ? 'No sleep synced yet.' : 'No bedtimes recorded in this range.'}
        </Text>
      </View>
    );
  }

  const columns = Math.max(1, dates.length);
  const y = (frac: number) => frac * CHART_HEIGHT;
  const edge = withAlpha(palette.metricSleep, 0.6);

  return (
    <View testID="sleep-window-chart" className="gap-1.5">
      <View className="flex-row" style={{ height: CHART_HEIGHT }}>
        <View style={{ width: TICK_COLUMN }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {layout.ticks.map((t) => (
            <Text key={t.label} className="text-fine text-muted-foreground tabular-nums" style={{ position: 'absolute', left: 0, top: Math.min(CHART_HEIGHT - 14, Math.max(0, y(t.at) - 7)) }}>
              {t.label}
            </Text>
          ))}
        </View>
        <View className="flex-1">
          {layout.ticks.map((t) => (
            <View key={t.label} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: y(t.at), height: 1, backgroundColor: palette.hairline }} />
          ))}
          {layout.goalBand ? (
            <>
              <View
                testID="sleep-window-goal-band"
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, top: y(layout.goalBand.top), height: y(layout.goalBand.height), backgroundColor: withAlpha(palette.metricSleep, 0.1) }}
              />
              <Svg pointerEvents="none" width="100%" height={CHART_HEIGHT} style={{ position: 'absolute' }}>
                {[layout.goalBand.top, layout.goalBand.top + layout.goalBand.height].map((at, i) => (
                  <Line key={i} testID={i === 0 ? 'sleep-window-goal-top' : 'sleep-window-goal-bottom'} x1="0" x2="100%" y1={y(at)} y2={y(at)} stroke={edge} strokeWidth={1} strokeDasharray="4 4" />
                ))}
              </Svg>
            </>
          ) : null}
          {layout.bars.map((bar) => {
            const column = dates.indexOf(bar.date);
            const night = byDate.get(bar.date);
            if (column < 0 || !night?.bedtime || !night.wakeTime) return null;
            const selected = bar.date === selectedDate;
            return (
              <Pressable
                key={bar.date}
                testID={`sleep-window-bar-${bar.date}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${WEEKDAY_LONG[dayOfWeek(bar.date)]}: ${formatClock(night.bedtime)} to ${formatClock(night.wakeTime)}${selected ? SLEEP_COPY.selectedSuffix : ''}`}
                onPress={() => onPressNight(bar.date)}
                style={{ position: 'absolute', left: `${(column / columns) * 100}%`, width: `${100 / columns}%`, top: y(bar.top), height: Math.max(4, y(bar.height)), alignItems: 'center' }}
              >
                <View
                  testID={selected ? 'sleep-window-selected' : undefined}
                  style={{ flex: 1, width: '56%', maxWidth: 22, borderRadius: 8, padding: selected ? 2 : 0, borderWidth: selected ? 2 : 0, borderColor: palette.foreground }}
                >
                  <View style={{ flex: 1, borderRadius: 6, backgroundColor: palette.metricSleep, opacity: selected ? 1 : 0.45 }} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View className="flex-row" style={{ paddingLeft: TICK_COLUMN }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {dates.map((d) => (
          <Text
            key={d}
            testID={`sleep-window-initial-${d}`}
            className={`flex-1 text-center text-fine ${d === selectedDate ? 'font-semibold' : 'text-muted-foreground'}`}
            // An explicit colour, so the selected initial is testable (className is not resolved in jest).
            style={d === selectedDate ? { color: palette.foreground } : undefined}
          >
            {WEEKDAY_INITIAL[dayOfWeek(d)]}
          </Text>
        ))}
      </View>
    </View>
  );
}
```

  The chart's existing strings ("No sleep synced yet.", the bar label form) stay where they are (moved-code rule);
  only the new ", selected" comes from `SLEEP_COPY`. `layoutSleepWindow` still returns `avgBedtime` / `avgWake`; they
  are simply not drawn.

```tsx
// mobile/src/components/sleep/BedtimeToWakeCard.tsx
import React from 'react';
import { View } from 'react-native';
import type { SleepGoal, SleepNight } from '../../api/sleep';
import { addDays } from '../../lib/heatmap';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { isNapOnly } from '../../lib/sleepStats';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { SegmentedControl } from '../ui/segmented-control';
import { WindowChart } from './WindowChart';

export type SleepRange = 'week' | 'two-weeks';

// Bedtime to wake over A-6..A or A-13..A (spec §3.9). Nap-only dates are not nights (plan ruling 5).
export function BedtimeToWakeCard({ anchor, date, nights, goal, range, onRange, onSelect }: {
  anchor: string; date: string; nights: SleepNight[]; goal: SleepGoal | null; range: SleepRange;
  onRange: (r: SleepRange) => void; onSelect: (date: string) => void;
}) {
  const days = range === 'week' ? 7 : 14;
  const dates = Array.from({ length: days }, (_, i) => addDays(anchor, i - (days - 1)));
  return (
    <Card testID="sleep-window-card" className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <SectionLabel>{SLEEP_COPY.bedtimeToWake}</SectionLabel>
        <View style={{ width: 168 }}>
          <SegmentedControl
            testID="sleep-range"
            options={[{ value: 'week', label: SLEEP_COPY.rangeWeek }, { value: 'two-weeks', label: SLEEP_COPY.rangeTwoWeeks }]}
            value={range}
            onChange={onRange}
          />
        </View>
      </View>
      <WindowChart dates={dates} nights={nights.filter((n) => !isNapOnly(n))} goal={goal} selectedDate={date} onPressNight={onSelect} />
    </Card>
  );
}
```

```tsx
// mobile/src/components/sleep/RegularityCard.tsx
import React from 'react';
import { View } from 'react-native';
import type { SleepRegularity } from '../../api/sleep';
import { nightsToGo } from '../../lib/regularityCopy';
import { regularityA11y, regularityWord, SLEEP_COPY, spreadLine } from '../../lib/sleepCopy';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ScoreRing } from '../ui/score-ring';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

export type RegularityState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; data: SleepRegularity };

// The compact board card (spec §3.10). Always "Regularity", never "consistency": the Sleep score's Bedtime
// consistency factor is a different measure. Always the last 7 nights from today, whatever night is selected.
export function RegularityCard({ state, onRetry }: { state: RegularityState; onRetry: () => void }) {
  if (state.phase === 'loading') return <Skeleton testID="sleep-regularity-loading" className="h-24 w-full rounded-card" />;
  if (state.phase === 'error') {
    return (
      <Card testID="sleep-regularity-error" className="items-center gap-3 py-6">
        <Text className="text-center text-caption text-muted-foreground">{SLEEP_COPY.regularityError}</Text>
        <Button testID="sleep-regularity-retry" variant="secondary" size="sm" onPress={onRetry}>{SLEEP_COPY.tryAgain}</Button>
      </Card>
    );
  }
  const { data } = state;
  if (data.score === null) {
    return (
      <Card testID="sleep-regularity" className="gap-2">
        <SectionLabel>{SLEEP_COPY.regularityLabel}</SectionLabel>
        <Text testID="sleep-regularity-empty" className="text-body">{SLEEP_COPY.notEnoughNights(nightsToGo(data.days, data.nights))}</Text>
      </Card>
    );
  }
  const word = regularityWord(data.score);
  const spreads = spreadLine(data.bedtimeSpreadMinutes, data.wakeSpreadMinutes);
  return (
    <Card
      testID="sleep-regularity"
      accessible
      accessibilityLabel={regularityA11y(data.score, word, data.bedtimeSpreadMinutes, data.wakeSpreadMinutes)}
      className="flex-row items-center gap-4"
    >
      <ScoreRing score={data.score} size={64} strokeWidth={7} numeralClassName="text-headline" />
      <View className="flex-1 gap-1">
        <SectionLabel>{SLEEP_COPY.regularityLabel}</SectionLabel>
        <Text testID="sleep-regularity-word" className="text-body font-semibold">{word}</Text>
        {spreads ? <Text testID="sleep-regularity-spreads" className="text-caption text-muted-foreground tabular-nums">{spreads}</Text> : null}
      </View>
    </Card>
  );
}
```

  In `SleepScreen.tsx`: add `const [range, setRange] = useState<SleepRange>('week');` next to the other hooks, **above**
  the `if (page.date === null)` early return (hooks are never conditional), import `BedtimeToWakeCard` / `SleepRange`
  and `RegularityCard`, and, in place of the Task 8 slot:

```tsx
        {page.window.phase === 'ready' ? (
          <BedtimeToWakeCard
            anchor={page.anchor}
            date={date}
            nights={page.window.data.nights}
            goal={page.goal.phase === 'ready' ? page.goal.data : null}
            range={range}
            onRange={setRange}
            onSelect={select}
          />
        ) : null}
        <RegularityCard state={page.regularity} onRetry={page.reloadRegularity} />
```

  (the picker already shows the window's loading skeleton and its error retry).

- [ ] **Step 4: Run the tests and confirm they pass,** with `__tests__/screens/SleepScreen.test.tsx
  __tests__/lib/regularityCopy.test.ts __tests__/lib/sleepWindow.test.ts __tests__/conventions`. `grep -rn regularityLine mobile`
  prints nothing. Then the typecheck: still 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/sleep mobile/src/lib/regularityCopy.ts mobile/src/screens/SleepScreen.tsx mobile/__tests__/screens/SleepScreen.test.tsx mobile/__tests__/lib/regularityCopy.test.ts mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): Sleep page bedtime-to-wake chart selects nights; compact regularity card"
```

---

### Task 9: The month heatmap and stats

**Files:**
- Create: `mobile/src/components/sleep/SleepMonthCard.tsx`.
- Modify: `mobile/src/screens/SleepScreen.tsx` (view-month state, the load effect, the card after Regularity).
- Modify: `mobile/__tests__/conventions/buttons.test.ts`: under "Cards and tiles that navigate" add
  `{ file: 'components/sleep/SleepMonthCard.tsx', key: 'sleep-month-day-${d}', count: 1, reason: 'a past day in the Sleep month that selects that night' }`.
- Test: append to `SleepScreen.test.tsx`.

**Interfaces:**
- Consumes: `page.month`, `page.loadMonth`, `page.retryMonth`, `page.window.data.earliestDate` (Task 3), `monthCells`
  (`lib/calendarGrid.ts:3`), `mainSleepByDate` (Task 2), `sleepRangeStats` (`lib/sleepStats.ts:34`),
  `sleepHeatLevel` (`lib/heatmap.ts:105`), `monthTitle` / `shiftMonth` (`lib/recoveryCopy.ts:152-161`, `YYYY-MM`
  forms), the screen's `select` and `scrollTop` (Task 5).
- Produces: testIDs `sleep-month`, `sleep-month-title`, `sleep-month-day-${date}`, `sleep-month-future-${date}`,
  `sleep-month-selected`, `sleep-month-loading`, `sleep-stat-average`, `sleep-stat-at-goal`, `sleep-stat-bedtime`,
  `sleep-stat-longest`.

- [ ] **Step 1: Write the failing tests** (appended):
  - **October, default page:** `sleep-month-title` reads "October"; a header row M T W T F S S; leading blanks for
    Mon 28 Sep – Wed 30 Sep (1 Oct 2026 is a Thursday), so the first cell is `sleep-month-day-2026-10-01`.
  - **Cells:** `sleep-month-day-2026-10-02` shows "6:41" and is labelled "Friday 2 October, 6 hours 41 minutes";
    `sleep-month-day-2026-10-06` shows "6" and is labelled "Tuesday 6 October, no sleep recorded";
    `sleep-month-day-2026-10-07` shows "6:58" (main sleep, not 7:18).
  - **Selected:** `sleep-month-selected` wraps `sleep-month-day-2026-10-08`.
  - **Future:** `sleep-month-future-2026-10-20` exists only with `{ includeHiddenElements: true }`, has
    `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`, and there is no
    `sleep-month-day-2026-10-20`.
  - **Stats (main sleep, nap-only skipped):** Average asleep is `formatDuration((401+440+514+302+418+432)/6)` =
    `formatDuration(417.83)` = "6h 58m" (main sleep: the day-total 438 for 10-07 would give "7h 01m"); Nights at goal
    "1 of 6" (only 514 ≥ 480); Average bedtime is `formatClock` of `sleepRangeStats(...).averageBedtime` for the six
    fixture bedtimes (assert against that function's own output, not a hand-computed clock); Longest night "8h 34m".
    With `makeWindow()` plus a nap-only 10-06 (`makeNight('2026-10-06', { mainIsNap: true, minutesAsleep: 45, mainMinutesAsleep: 45 })`),
    the stats are unchanged and the 10-06 cell still shows "6".
  - **Tap:** pressing `sleep-month-day-2026-10-03` calls `setParams({ date: '2026-10-03' })`; pressing D's cell calls
    nothing. (The scroll to the top is checked in the Task 12 walkthrough.)
  - **Paging:** "Next month" (by its accessibility label) is disabled on the current month. "Previous month" calls
    `fetchSleep('2026-09-01', '2026-09-30')` and shows `sleep-month-loading` until it resolves, then "September".
    Prev is disabled at `earliestDate`'s month: with `makeWindow({ earliestDate: '2026-10-02' })`, Prev is disabled.
    Paging back from January asks for December of the previous year and titles it "December 2025": seed
    `mockParams = { date: '2026-01-05' }` and `makeWindow({ earliestDate: '2025-01-01', nights: [] })` (the device
    today stays 2026-10-08, so the old night anchors on January and the window is `2025-12-23..2026-01-31`).
  - **Cold start** (spec §6): `makeWindow({ nights: [], earliestDate: null })`, score `null`, night 404: the hero says
    "No sleep recorded", the picker has 7 "—" cells, the chart says "No sleep synced yet.", the month shows only muted
    cells with "—" stats and Prev disabled, and the goal row and Ask bar ("Why don't I have sleep data for last
    night?") still render.
  - **Month error:** a rejected September fetch shows "Couldn't load September." and "Retry", which refetches.
  - **A picker tap resets the view month:** after paging to September, `rerender` with `mockParams = { date: '2026-10-05' }`
    shows "October" again.
  - **Large text:** every cell `Text` has `numberOfLines={1}`.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.**

```tsx
// mobile/src/components/sleep/SleepMonthCard.tsx
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { monthCells } from '../../lib/calendarGrid';
import { addDays, shiftMonth as shiftMonthStart, sleepHeatLevel } from '../../lib/heatmap';
import { monthTitle, shiftMonth } from '../../lib/recoveryCopy';
import { formatHm, monthCellLabel, SLEEP_COPY } from '../../lib/sleepCopy';
import { formatClock, formatDuration, mainSleepByDate, sleepRangeStats } from '../../lib/sleepStats';
import type { MonthLoad } from '../../lib/useSleepPage';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

const COLUMN = { width: '14.2857%', padding: 3 } as const;
const BOX = 36;

type Props = {
  viewMonth: string; today: string; date: string; load: MonthLoad; goalMinutes: number; earliestDate: string | null;
  onPage: (month: string) => void; onRetry: (month: string) => void; onSelect: (date: string) => void;
};

// The month heatmap and its stats (spec §3.11): Monday first (plan ruling 11), main sleep on the sleepHeat ramp, D
// ringed, future days muted and hidden from screen readers. Paging stops at earliestDate's month and this month.
export function SleepMonthCard({ viewMonth, today, date, load, goalMinutes, earliestDate, onPage, onRetry, onSelect }: Props) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const heat = [null, colors.sleepHeat1, colors.sleepHeat2, colors.sleepHeat3, colors.sleepHeat4] as const;
  const title = monthTitle(viewMonth, today);
  const first = `${viewMonth}-01`;
  const last = addDays(shiftMonthStart(first, 1), -1);
  const byDate = mainSleepByDate(load.nights ?? []);
  const stats = load.status === 'ready' ? sleepRangeStats(byDate, first, last, today, goalMinutes) : null;
  const prevDisabled = !earliestDate || viewMonth <= earliestDate.slice(0, 7);
  const nextDisabled = viewMonth >= today.slice(0, 7);

  const dayCell = (d: string) => {
    const minutes = byDate.get(d)?.minutesAsleep ?? null;
    const level = sleepHeatLevel(minutes, goalMinutes);
    const fill = level ? heat[level] : null;
    const future = d > today;
    const selected = d === date;
    const box = (
      <View className={`items-center justify-center rounded-lg ${fill ? '' : 'bg-muted'}`} style={{ height: selected ? BOX - 8 : BOX, backgroundColor: fill ?? undefined }}>
        <Text className={`text-fine font-semibold tabular-nums ${fill ? '' : 'text-muted-foreground'}`} numberOfLines={1}>
          {fill && minutes !== null ? formatHm(minutes) : String(Number(d.slice(8)))}
        </Text>
      </View>
    );
    const body = future ? (
      <View testID={`sleep-month-future-${d}`} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{box}</View>
    ) : (
      <PressableScale testID={`sleep-month-day-${d}`} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={monthCellLabel(d, minutes)} onPress={() => onSelect(d)}>
        {box}
      </PressableScale>
    );
    return selected ? (
      <View testID="sleep-month-selected" style={{ borderWidth: 2, borderColor: colors.foreground, padding: 2, borderRadius: 10 }}>{body}</View>
    ) : body;
  };

  const stat = (testID: string, value: string, label: string) => (
    <View key={testID} testID={testID} className="w-1/2 gap-0.5 pb-2">
      <Text className="text-headline tabular-nums" numberOfLines={1}>{value}</Text>
      <Text className="text-caption text-muted-foreground">{label}</Text>
    </View>
  );

  return (
    <Card testID="sleep-month" className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <SectionLabel testID="sleep-month-title">{title}</SectionLabel>
        <View className="flex-row gap-1.5">
          <Button variant="outline" size="icon-sm" accessibilityLabel={SLEEP_COPY.prevMonth} hitSlop={6} disabled={prevDisabled} onPress={() => onPage(shiftMonth(viewMonth, -1))}>
            <Ionicons name="chevron-back" size={14} color={colors.foreground} />
          </Button>
          <Button variant="outline" size="icon-sm" accessibilityLabel={SLEEP_COPY.nextMonth} hitSlop={6} disabled={nextDisabled} onPress={() => onPage(shiftMonth(viewMonth, 1))}>
            <Ionicons name="chevron-forward" size={14} color={colors.foreground} />
          </Button>
        </View>
      </View>
      <View className="flex-row" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLEEP_COPY.weekdayHeader.map((w, i) => (
          <View key={i} style={COLUMN} className="items-center"><Text className="text-fine text-muted-foreground">{w}</Text></View>
        ))}
      </View>
      {load.status === 'error' ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-caption text-muted-foreground">{SLEEP_COPY.monthError(title)}</Text>
          <Button variant="ghost" size="sm" onPress={() => onRetry(viewMonth)}>{SLEEP_COPY.retry}</Button>
        </View>
      ) : load.status === 'loading' ? (
        <View testID="sleep-month-loading" className="flex-row flex-wrap">
          {Array.from({ length: 35 }, (_, i) => (
            <View key={i} style={COLUMN}><Skeleton className="h-9 rounded-lg" /></View>
          ))}
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap">
            {monthCells(viewMonth).map((cell, i) => (
              <View key={cell.date ?? `blank-${i}`} style={COLUMN}>{cell.date ? dayCell(cell.date) : null}</View>
            ))}
          </View>
          <View className="mt-1 flex-row flex-wrap">
            {stat('sleep-stat-average', stats?.averageMinutes == null ? SLEEP_COPY.noValue : formatDuration(stats.averageMinutes), SLEEP_COPY.statAverage)}
            {stat('sleep-stat-at-goal', stats ? SLEEP_COPY.nightsAtGoal(stats.goalNights, stats.nights) : SLEEP_COPY.noValue, SLEEP_COPY.statAtGoal)}
            {stat('sleep-stat-bedtime', stats?.averageBedtime ? formatClock(stats.averageBedtime) : SLEEP_COPY.noValue, SLEEP_COPY.statBedtime)}
            {stat('sleep-stat-longest', stats?.longest ? formatDuration(stats.longest.minutes) : SLEEP_COPY.noValue, SLEEP_COPY.statLongest)}
          </View>
        </>
      )}
    </Card>
  );
}
```

  `SectionLabel` passes `testID` through (`TextProps`). In `SleepScreen.tsx`:

```tsx
  // The month card opens on D's month; a newly selected night brings it back there.
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  useEffect(() => { setViewMonth(null); }, [page.date]);
  const shownMonth = viewMonth ?? (page.date ?? page.today).slice(0, 7);
  const { loadMonth } = page;
  useEffect(() => { loadMonth(shownMonth); }, [shownMonth, page.anchor, loadMonth]);
```

  Put these hooks **above** the `if (page.date === null)` early return (hooks must not be conditional). In place of the
  Task 9 slot:

```tsx
        <SleepMonthCard
          viewMonth={shownMonth}
          today={page.today}
          date={date}
          load={page.month(shownMonth)}
          goalMinutes={goalMinutes ?? 480}
          earliestDate={page.window.phase === 'ready' ? page.window.data.earliestDate : null}
          onPage={setViewMonth}
          onRetry={page.retryMonth}
          onSelect={(d) => { if (d !== date) { select(d); scrollTop(); } }}
        />
```

  The `480` fallback is the same default the Activity tab uses (`ActivityScreen.tsx:30`) while the goal loads; name it
  `DEFAULT_SLEEP_GOAL_MINUTES` at the top of `SleepScreen.tsx`.

- [ ] **Step 4: Run the tests and confirm they pass,** including `__tests__/conventions __tests__/lib/calendarGrid.test.ts`.
  Then the typecheck: still 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/sleep/SleepMonthCard.tsx mobile/src/screens/SleepScreen.tsx mobile/__tests__/screens/SleepScreen.test.tsx mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): Sleep page month heatmap with main-sleep stats and paging"
```

---

### Task 10: Home — the Recaps shelf and the Sleep entries

**Files:**
- Modify: `mobile/src/screens/DashboardScreen.tsx`:
  - import `RecapShelf` from `../components/recap/RecapShelf` and `openSleep` from `../navigation/sleepNavigation`;
  - `openDetail` (`:139-141`): SLEEP opens the page, other metrics are unchanged:

```tsx
  function openDetail(type: MetricType) {
    // Sleep has its own page; the tile's series is the day total that page shows as "with naps".
    if (type === 'SLEEP') openSleep(navigation);
    else navigation.navigate('MetricDetail', { metricType: type, records: seriesByMetric[type] });
  }
```

  - `SleepTile` (`:276-282`): drop the "its score header links on to the score detail" comment and use
    `onPress={(score) => openSleep(navigation, score?.date)}` (the page opens on the tile's night, so tile and hero
    show the same night);
  - after `<HabitLogCard />` (`:292`), before the digest comment, add
    `{/* Recaps (decision 5): with the weekly digest below, for every user, coach on or off. */}` and
    `<RecapShelf navigation={navigation} />`.
- Modify: `mobile/src/components/recap/RecapShelf.tsx:27`: "The story shelf at the top of Sleep" becomes "The story
  shelf on Home, above the coach digest". Check `__tests__/conventions/typography.test.ts:56,122` for the word
  "Sleep" in its reason text; update it if present (the file path and count do not change).
- Tests:
  - `mobile/__tests__/screens/DashboardScreen.test.tsx`, `DashboardCoachEntry.test.tsx` and `DashboardDigest.test.tsx`:
    add `jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(() => Promise.resolve([])), markRecapOpened: jest.fn() }));`
    if the file does not already mock it (as `SleepScreen.test.tsx` did), so the shelf's fetch is inert.
  - In `DashboardScreen.test.tsx` replace 'opens the Sleep screen when pressed' (`:514-523`) and add the cases below.
  - `mobile/__tests__/components/RecapShelf.test.tsx` must stay green unchanged.

**Interfaces:**
- Consumes: `openSleep` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests** in `DashboardScreen.test.tsx` (reuse its `mockApi`, `steps`, `recovery` and
  `sleep` fixtures):

```tsx
    it('opens the Sleep page on the tile night, so tile and hero agree', async () => {
      mockApi({ records: steps, scores: [recovery, sleep] });
      const { getByTestId } = render(<DashboardScreen />);
      await waitFor(() => expect(getByTestId('sleep-score-card')).toBeTruthy());
      fireEvent.press(getByTestId('sleep-score-card'));
      expect(mockNavigate).toHaveBeenCalledWith('Sleep', { date: sleep.date });
      expect(mockNavigate).not.toHaveBeenCalledWith('ScoreDetail', expect.anything());
    });

    it('opens the Sleep page on its default night when there is no Sleep score', async () => {
      mockApi({ records: steps, scores: [recovery] });
      const { getByTestId } = render(<DashboardScreen />);
      await waitFor(() => expect(getByTestId('sleep-score-empty')).toBeTruthy());
      fireEvent.press(getByTestId('sleep-score-empty'));
      expect(mockNavigate).toHaveBeenCalledWith('Sleep', undefined);
    });
```

  and in the metric-tile area of the same file:

```tsx
  it('the SLEEP metric tile opens the Sleep page; other tiles still open their detail', async () => {
    mockApi({ records: [...steps, ...sleepRecords], scores: [] });
    const { findByTestId, getByTestId } = render(<DashboardScreen />);
    fireEvent.press(await findByTestId('metric-card-SLEEP'));
    expect(mockNavigate).toHaveBeenCalledWith('Sleep', undefined);
    expect(mockNavigate).not.toHaveBeenCalledWith('MetricDetail', expect.objectContaining({ metricType: 'SLEEP' }));
    fireEvent.press(getByTestId('metric-card-STEPS'));
    expect(mockNavigate).toHaveBeenCalledWith('MetricDetail', expect.objectContaining({ metricType: 'STEPS' }));
  });

  it('shows the Recaps shelf after the habit log and above the coach digest, for everyone', async () => {
    mockApi({ records: steps, scores: [recovery, sleep] });
    const { findByTestId, toJSON } = render(<DashboardScreen />);
    await findByTestId('recap-shelf');
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('habit-log')).toBeLessThan(tree.indexOf('recap-shelf'));
    const digest = tree.indexOf('coach-digest');
    if (digest >= 0) expect(tree.indexOf('recap-shelf')).toBeLessThan(digest);
  });
```

  `sleepRecords` is a short SLEEP series in the file's `MetricRecord` shape (add it beside `steps` if the file has
  none). The `habit-log` / `coach-digest` prefixes match `HabitLogCard`'s and `CoachDigestCard`'s testIDs
  (`habit-log-loading` / `-unavailable` / its ready card; `coach-digest-loading` / `-error` / `-card`). In
  `DashboardDigest.test.tsx` add one case that renders Home with the coach on and asserts `recap-shelf` precedes
  `coach-digest-card`, and one with the coach off asserting `recap-shelf` still renders.

- [ ] **Step 2: Run the tests and confirm they fail:** `__tests__/screens/Dashboard*`.

- [ ] **Step 3: Implement** the edits under Files. If the owner moved the shelf in Task 4b, follow the ruling in the
  ledger instead (it is the same one-line move).

- [ ] **Step 4: Run the tests and confirm they pass,** with `__tests__/screens/Dashboard* __tests__/components/RecapShelf.test.tsx __tests__/conventions`.
  Then the typecheck: still 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/screens/DashboardScreen.tsx mobile/src/components/recap/RecapShelf.tsx mobile/__tests__/screens mobile/__tests__/conventions/typography.test.ts
git commit -m "feat(mobile): Recaps shelf on Home; Home sleep tile and SLEEP tile open the Sleep page"
```

---

### Task 11: The other entry points; ScoreDetail and MetricDetail redirect

**Files:**
- Modify: `mobile/src/screens/MetricsScreen.tsx:83-85` (Trends):

```tsx
  function openDetail(type: MetricType, series: MetricRecord[]) {
    if (type === 'SLEEP') openSleep(navigation);
    else navigation.navigate('MetricDetail', { metricType: type, records: series, range });
  }
```

- Modify: `mobile/src/components/activity/UsualTiles.tsx:25-32`: after the RECOVERY branch add
  `if (tile.type === 'SLEEP') { openSleep(navigation, tile.latestDate ?? undefined); return; }`.
- Modify: `mobile/src/lib/coachAnswers.ts:59-83`:
  - `CardDestination` drops the `ScoreDetail` member and gains `| { name: 'Sleep'; params: { date: string } | undefined }`;
  - case `'sleep'` returns `{ name: 'Sleep', params: date ? { date } : undefined }` (never Trends);
  - update the comment block above `cardDestination` ("A sleep card opens the Sleep page on that day, else its
    default night").
  - Confirm `CoachScreen.tsx:317` navigates with `navigation.navigate(target.name, target.params)`; if it switches on
    names, add the `Sleep` case.
- Rewrite: `mobile/src/screens/ScoreDetailScreen.tsx` as the redirect shim (plan ruling 17):

```tsx
import { useEffect } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/RootNavigator';

// A redirect shim (spec §5.1 #15, §5.3): SLEEP has the Sleep page, RECOVERY the Recovery page. Removing the route and
// its now-unused components is a later clean-up (spec §9).
export function ScoreDetailScreen() {
  const navigation = useNavigation<any>();
  const { date, type = 'RECOVERY' } = useRoute<RouteProp<RootStackParamList, 'ScoreDetail'>>().params;
  useEffect(() => {
    navigation.replace(type === 'SLEEP' ? 'Sleep' : 'Recovery', { date });
  }, [navigation, type, date]);
  return null;
}
```

  `formatScoreDate` goes with the body (its only other user is `ScoreDetailRedesign.test.tsx`, deleted below).
- Modify: `mobile/src/screens/MetricDetailScreen.tsx`: after the last hook (the `useLayoutEffect` at `:52-54`) add

```tsx
  // Sleep has its own page (spec §5.1 #16); HRV, resting HR and steps keep this screen.
  useEffect(() => {
    if (metricType === 'SLEEP') navigation.replace('Sleep');
  }, [navigation, metricType]);
  if (metricType === 'SLEEP') return null;
```

  (add `useEffect` to the React import). Every hook stays above the early return.
- Modify: `mobile/src/lib/coachPrompts.ts`: delete `scoreQuestion` and its `ScoreType` import (no importer left).
- Tests:
  - `mobile/__tests__/screens/MetricsScreen.test.tsx`: the SLEEP trend card (`trend-card-SLEEP`) opens
    `navigate('Sleep', undefined)`; another type still opens `MetricDetail`.
  - `mobile/__tests__/components/UsualTiles.test.tsx`: the SLEEP tile opens `navigate('Sleep', { date: <latestDate> })`,
    and `navigate('Sleep', undefined)` without a reading.
  - `mobile/__tests__/lib/coachAnswers.test.ts:55-61`: the sleep expectations become
    `{ name: 'Sleep', params: { date: '2026-09-30' } }`; add `cardDestination(card('sleep.total'), '')` →
    `{ name: 'Sleep', params: undefined }`. Update `CoachScreen.test.tsx` and `useCoachStatus.test.tsx` wherever they
    assert a `ScoreDetail` SLEEP destination (`grep -n ScoreDetail` in each).
  - `mobile/__tests__/screens/ScoreDetailScreen.test.tsx`: keep (or write) only the redirect cases:
    `{ date, type: 'SLEEP' }` calls `replace('Sleep', { date })`; `{ date, type: 'RECOVERY' }` and no type call
    `replace('Recovery', { date })`; it renders nothing and never calls `fetchScoreDetail`.
  - Delete `ScoreDetailRedesign.test.tsx`, `ScoreBands.test.tsx` and `ScoreDetailCoachEntry.test.tsx` (after Recovery's
    Task 10 they held only SLEEP rendering cases). Before deleting, move any case that tests a **lib** function
    (`scoreBand`, `buildBaselineSentence`, `buildScoreVerdict`, …) into `__tests__/lib/scoreInsights.test.ts`. List every
    deleted test name in the commit body with the Sleep page test that now pins the behaviour (bands → `sleepCopy` /
    hero tests; the coach entry → `SleepScreen` Ask tests; the baselines → the info-sheet test).
  - `mobile/__tests__/screens/MetricDetailScreen.test.tsx`: add `replace` to its navigation mock; SLEEP calls
    `replace('Sleep')` and renders nothing; HRV still renders. This file holds 5 baseline tsc errors; do not add any.
  - `mobile/__tests__/notifications/handler.test.ts`: unchanged, must stay green (the wind-down tap still opens
    `Sleep` with `{ pop: true }`, spec §5.1 #13).

**Interfaces:**
- Consumes: `openSleep` (Task 5).
- Produces: `CardDestination` with the `Sleep` member; the ScoreDetail and MetricDetail redirects.

- [ ] **Step 1: Write and update the failing tests** as listed.
- [ ] **Step 2: Run them and confirm they fail:**
  `__tests__/screens/MetricsScreen.test.tsx __tests__/components/UsualTiles.test.tsx __tests__/lib/coachAnswers.test.ts __tests__/screens/ScoreDetailScreen.test.tsx __tests__/screens/MetricDetailScreen.test.tsx __tests__/screens/CoachScreen.test.tsx`.
- [ ] **Step 3: Implement** the edits above. Then confirm the call-site table (spec §5.1) is fully covered:
  `grep -rn "'Sleep'" mobile/src` lists only `sleepNavigation.ts`, `notifications/handler.ts`, `RootNavigator.tsx`,
  `ScoreDetailScreen.tsx`, `MetricDetailScreen.tsx` and `coachAnswers.ts`; `grep -rn "'ScoreDetail'" mobile/src` lists
  only `RootNavigator.tsx` (the route stays registered as a shim).
- [ ] **Step 4: Run the full mobile suite** with `node node_modules/.bin/jest --forceExit`. Expected: all green except
  known flakes, each rerun alone. Then the typecheck: 12 or lower (record the new count in the ledger if lower).
- [ ] **Step 5: Commit.**

```bash
git add -A mobile/src mobile/__tests__
git commit -m "feat(mobile): Trends, usual tiles and coach cards open the Sleep page; ScoreDetail and MetricDetail redirect"
```

---

### Task 12: Whole-branch verification, walkthrough and draft PR (controller)

- [ ] **Step 1:** Run the full backend suite through `backend-jest.sh` (no path argument) and backend
  `tsc --noEmit`. Run the full mobile suite and the mobile typecheck (12 or the recorded lower count). Run the two
  convention guards on their own. Record the results in the ledger.
- [ ] **Step 2:** Run the final whole-branch review on opus with
  `review-package docs/superpowers/plans/2026-10-09-one-sleep-page.md a4db948 HEAD`, then one fix wave. The reviewer
  checks the spec §5.1 call-site table row by row, the §6 state table and the §7 labels.
- [ ] **Step 3:** Update the run folder, following handoff §1:
  1. back up the dev DB with `pg_dump -Fc` (only when `DATABASE_URL` is local);
  2. rsync the backend; no migration is needed, since there is no schema change;
  3. run `npm install`, `prisma generate` and `npm run build`, then restart :3000;
  4. sync mobile (`git archive` piped to `tar` then rsync), restart Metro with `--clear`, and relaunch the app.
- [ ] **Step 4:** Walk through on the simulator, capturing screenshots:
  - Home: the Recaps shelf between the Habit log and the digest; the Sleep tile opens the page on the tile's night;
  - the page top to bottom: hero, picker, summary, stages, cycles, moments, The night, Bedtime to wake, Regularity,
    month, goal row, Ask Axo;
  - a picker tap, a chart bar tap and a month cell tap (the page scrolls to the top); back leaves in one step;
  - the info sheet; the header bedtime-goal button and the goal row, then back (the row re-reads);
  - "Steps that day" opens Activity on that day's steps sheet;
  - Activity › a sleep cell opens the page; "Sleep details" opens it; the steps sheet's "Sleep the night before";
  - Recovery › Last night opens this page on D;
  - Trends › Sleep and Activity › usual tiles › Sleep open the page;
  - a coach answer card about sleep opens the page;
  - a nap-only date and an old night (month Prev, then a September day).
  Repeat in light mode, and at the largest text size (pixel title, picker and month cells on one line). Also do the
  PR #58 quick check (handoff §8): pixel titles at large text, the Chats notes row, Coach Today bars, and the Campfire
  unchanged.
- [ ] **Step 5:** Confirm that the ledger records the Task 4b approval; if not, stop and ask the owner. Then open a
  draft PR from `feature/sleep-page` with **no attribution footer**, linking the spec and the plan. The body must
  include, under its own heading, the spec §13 note: "**The usual-minutes fix changes a visible number.**
  `/me/sleep/night/:date` `usualMinutesAsleep` now averages main-session minutes over the 30 nights before the night,
  instead of day totals with naps included. The "vs your usual" line will shift for anyone who naps. This is an
  intentional correction, not a regression." Merge only when the owner says "merge".
