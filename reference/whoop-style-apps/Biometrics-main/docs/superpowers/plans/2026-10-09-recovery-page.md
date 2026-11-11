# Recovery Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Recovery use of `ScoreDetailScreen` with a dedicated Recovery page. The page shows the weather
hero, a one-line summary, the last 7 days, a sleep-and-streak bento, a month calendar, tomorrow's forecast and Ask
Axo. It is fed by one new bundle endpoint plus a month endpoint.

**Architecture:** The backend gets a new module, `backend/src/recovery/`:
- pure helpers: `streak.ts`, `sleepDebt.ts`, `month.ts`, `tomorrow.ts`;
- `bundle.ts`, which runs one `Promise.all` of reads;
- `routes.ts`, which serves `GET /me/recovery/:date` and `GET /me/recovery/calendar/:month`.

`/me/scores/:date` and the bundle share a `loadScoreDetail` helper that is factored out of `scoring/routes.ts`.

The app adds:
- `api/recovery.ts`, `lib/recoveryCopy.ts` (all strings and pure helpers) and `lib/useRecoveryPage.ts`;
- pixel weather art in `lib/weatherArt.ts`, drawn by `components/recovery/WeatherIcon.tsx`;
- section components under `components/recovery/`;
- `screens/RecoveryScreen.tsx`.

The ScoreDetail Ask bar is extracted into `components/coach/AskCoachBar.tsx`. Every entry point that opened
`ScoreDetail` for RECOVERY now opens `Recovery`, and ScoreDetail for RECOVERY replaces itself with Recovery.

**Tech Stack:** The backend is Express 5, Prisma 6 (Postgres) and BullMQ/ioredis, in TypeScript, tested with Jest and
supertest. The app is Expo 57 / React Native with NativeWind and React Navigation 7, tested with Jest and React Native
Testing Library. Pixel art is drawn with `react-native-svg`.

**Spec:** `docs/superpowers/specs/2026-10-09-recovery-page-design.md` (commits 1836c7c, fdac6a3 and f2702d4,
owner-approved 2026-10-09). Read §3 for the sections, §4 for the data, §5 for navigation, §6 for states, §7 for
accessibility, §9 for tests and §11 for the owner decisions.

## Global Constraints

- **Branch:** `feature/recovery-page`, in the worktree `/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab`.
  It is based on main `736cc88`.
  - Never switch branches. Never push to main and never force-push.
  - Commits use plain `git commit -m "…"` with **no `Co-Authored-By` trailer and no mention of Claude or AI** (owner
    rule). This applies to every subagent.
- **Subagents** run on model **opus**.
- **Backend tests** run **only** through `.superpowers/sdd/2026-10-09-recovery-page/backend-jest.sh <paths>`, which
  Task 0 creates. It uses the test DB from `~/dev/biometrics-run/backend/.env` and Redis db 1.
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
  - No task may add an error.
- **Type system A4** (spec §2.1):
  - Text sizes are tokens only: `text-score` / `text-number` / `text-display` / `text-heading` / `text-headline` /
    `text-body` / `text-caption` / `text-fine`.
  - `PageTitle` is used for the title and `SectionLabel` for eyebrows.
  - No Instrument Serif, no inline `fontSize` / `fontFamily`, no arbitrary `text-[..px]`.
  - `__tests__/conventions/typography.test.ts` must stay green.
- **Buttons:**
  - Every button and link is `<Button>` from `components/ui/button` (neutral primary, `rounded-lg`, **no pills**).
  - A raw `Pressable` / `PressableScale` with `accessibilityRole="button"` or `"link"` needs an allowlist entry in
    `__tests__/conventions/buttons.test.ts`, with a count and a reason, added in the task that adds it.
  - Chips with `accessibilityRole="radio"` are not flagged by the guard.
- **Copy:** every user-visible string comes from `mobile/src/lib/recoveryCopy.ts` (or `forecastCopy.ts` for forecast
  strings). Components never inline copy.
- **Bands:** Excellent ≥ `bands.excellent` (75), Good ≥ `bands.good` (55), Fair ≥ `bands.fair` (40), Low below that.
  The client always calls `scoreBand(score, bands)`, never hard-coded numbers.
  - Band words: Excellent / Good / Fair / **Low**.
  - Verdicts: Clear skies / Mostly clear / **Cloudy** (a plain grey cloud, no rain) / Stormy.
- **Privacy:** recovery values are never logged, never cached server-side and never sent anywhere except the owner's
  client.
  - Handlers log only `JSON.stringify({ event: 'recovery_error', route, error: err.constructor.name })`.
  - Both routes set `Cache-Control: private, no-store`.
- **Campfire files are frozen:** `components/social/CampScene.tsx` and `CampBanner.tsx` are never touched.
- **Out of scope** (spec §8):
  - the battery widget;
  - the combined Sleep page and any change to the Sleep or SleepNight screens or to ScoreDetail for SLEEP;
  - scoring changes;
  - a recovery push notification.

## Plan rulings (made while writing the plan)

1. **The "What moved it" DTO goes (spec decision 6).**
   - `RecoveryFactorDetailDTO` and the bundle's `factors` field are **dropped**, along with query plan step 3 (raw
     HRV and RHR values).
   - The summary (§3.3) reads `score.factors` (`points`, `imputed`, `excluded`), which `DailyScoreDTO` already carries.
   - The info sheet's 45 / 35 / 20 comes from a new `weights` field (the row's config base weights).
   - `flooredSpread` is exported and used only for the sleep-debt usual range.
2. **The coach prefill carries no numbers.** Spec §3.9 puts the score in the question ("Why is my recovery 68
   today?"). The repo has a deliberate rule (`lib/coachPrompts.ts:1-5`, tested in
   `ScoreDetailCoachEntry.test.tsx`) that prefills carry no numbers, so the coach fetches real values and never
   trusts a stale copy. The plan keeps that rule:
   - "Why is my recovery where it is today?"
   - "Why was my recovery what it was on Fri 2 Oct?"
   - "When will my recovery score be ready?"
   - "Why don't I have a recovery score today?" / "…for Fri 2 Oct?"

   The date stays, because it names the day rather than copying a value. *Owner may overturn; only `recoveryQuestion`
   changes.*
3. **Initial chip:** the sleep goal is `sleepDebt.goalMinutes / 60`, rounded to the nearest of 6 / 7 / 8 / 9. Without
   `sleepDebt`, the chip is 8.
4. **The streak's "today has no score yet" means *no row* for today.** A BUILDING row with a null score does not
   shift the run to yesterday.
5. **Track record:** hits are counted over the last 12 series points using the **full** series' `withinPoints`, so
   "±N" agrees with the Forecast screen. With fewer than 5 points it is hidden on the client.
6. **New hero weather art** (Excellent, Fair, Low, building and no-reading) is drawn on the 28×20 grid in Task 4.
   **Gate:** the controller publishes it as a canvas strip, and the owner approves it before the Task 11 draft PR
   opens (spec §3.0, mockup-first rule). `weatherArt.ts` is data, so Tasks 6–9 build on the drafted rects, and an
   owner edit is a one-file fix commit.
7. **Known cost:** `history()` reads every RECOVERY row up to the end of D's month on each page view (best streak needs
   all of it). That is a few hundred rows per year, the same kind of cost as `buddyIdsOf`. Revisit with a stored best
   run if it shows up in latency.

## Review Focus

1. **Today before the morning sync:**
   - Expected: the page opens on `today` with no RECOVERY row yet, shows "No reading · Waiting for last night's data",
     and keeps the streak from yesterday.
   - Pinned in Task 2 (bundle NO_DATA today) and Task 1 (streak).
2. **A user in a far-from-UTC timezone near midnight:**
   - Expected: `today` resolves to their local civil date, and a request for their "tomorrow" is a 400 even when it is
     UTC's today.
   - Pinned in Task 2 by the Pacific/Kiritimati user (east) and the Etc/GMT+12 user (west).
3. **Calendar paging at the edges:**
   - Expected: Prev is disabled at `firstScoredDate`'s month and Next at the current month, January paging back
     crosses the year, and a month with no rows renders all-muted cells with no average.
   - Pinned in Tasks 1 and 8.
4. **A day the forecast engine throws on:**
   - Expected: the page still renders, and the Tomorrow card says "unavailable" rather than the whole page erroring.
   - Pinned in Task 2 (mocked throw) and Task 9.
5. **Large text and an extreme sleep debt:**
   - Expected: 0 debt shows "You're within your usual."; debt larger than 16 blocks caps the row at 16 blocks with
     no overflow; calendar cells keep `numberOfLines={1}`.
   - Pinned in Tasks 1 (block count) and 7.

---

### Task 0: Workspace (controller; no code)

- [ ] **Step 1:** Create the workspace with
  `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-09-recovery-page.md`,
  so that `.superpowers/sdd/2026-10-09-recovery-page/` exists. The first line of `progress.md` is
  `# SDD ledger — plan: docs/superpowers/plans/2026-10-09-recovery-page.md`. Copy `common-context.md`,
  `implementer-instructions.md` and `reviewer-instructions.md` from `.superpowers/sdd/2026-10-08-type-system/`, then
  edit the branch, plan and spec names.
- [ ] **Step 2:** Copy `.superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh` to
  `.superpowers/sdd/2026-10-09-recovery-page/backend-jest.sh`. Its `cd` already targets this worktree's `backend/`.
- [ ] **Step 3:** From `mobile/`, run the typecheck and save the error lines to
  `.superpowers/sdd/2026-10-09-recovery-page/tsc-baseline.txt`. Confirm the count is 12.
- [ ] **Step 4:** Write the seven plan rulings above into the ledger as `Ruling: … — why — cost` lines.
- [ ] **Step 5:** Record the execution order in the ledger:
  - subagent-driven (owner choice, 2026-10-09);
  - Task 1 (backend helpers) and Task 3 (mobile copy) may run in parallel;
  - Task 2 follows Task 1;
  - Tasks 4 and 5 follow Task 3;
  - Tasks 6 → 7 → 8 → 9 → 10 run strictly in order, because they share `RecoveryScreen.tsx` and its test file.

---

### Task 1: Backend pure helpers — streak, sleep debt, month, tomorrow slice

**Files:**
- Modify: `backend/src/scoring/baseline.ts`. Export `flooredSpread`, changing `function flooredSpread(` to
  `export function flooredSpread(`.
- Create: `backend/src/recovery/dto.ts`, `backend/src/recovery/streak.ts`, `backend/src/recovery/sleepDebt.ts`,
  `backend/src/recovery/month.ts` and `backend/src/recovery/tomorrow.ts`.
- Test: `backend/tests/recovery/helpers.test.ts`.

**Interfaces:**
- Produces, used by Tasks 2 and 3:

```ts
// backend/src/recovery/dto.ts — mirrored in mobile/src/api/recovery.ts (Task 3)
import type { BaselineDTO, DailyScoreDTO } from '../scoring/dto';
import type { ScoreBands } from '../scoring/configs/v1';

export type RecoveryState = 'READY' | 'BUILDING' | 'NO_DATA';

export interface SleepDebtDTO {
  minutes: number;                 // round(sleepDebtRolling14d)
  windowNights: number;            // cfg.sleepDebtWindowDays (14)
  goalMinutes: number;             // SLEEP_DEBT factor goalMinutes, else the user's current goal
  usualLowMinutes: number | null;
  usualHighMinutes: number | null; // SLEEP_DEBT ewma + floored spread
  nightsToClear: number | null;    // 0..14; null without a usual
}

export interface LastNightDTO {
  date: string;
  minutesAsleep: number;
  stages: { deep: number; rem: number; light: number; awake: number } | null; // null when !hasStages
}

export interface RecoveryDayDTO { date: string; score: number | null } // score 1 dp

export interface RecoveryMonthDTO {
  month: string;                   // YYYY-MM
  days: RecoveryDayDTO[];          // dates with a RECOVERY row, ascending
  average: number | null;          // mean of non-null scores, 1 dp
  counts: { excellent: number; good: number; fair: number; low: number };
}

export interface ForecastChipDTO {
  sleepHours: 6 | 7 | 8 | 9;
  score: number;
  band: [number, number];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export type RecoveryTomorrowDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | { status: 'UNAVAILABLE' }
  | { status: 'READY'; date: string; chips: ForecastChipDTO[]; trackRecord: { hits: number; days: number; withinPoints: number } };

export interface RecoveryPageDTO {
  date: string;
  isToday: boolean;
  state: RecoveryState;
  bands: ScoreBands;
  updatedAt: string | null;
  score: DailyScoreDTO | null;
  previous: { date: string; score: number } | null;
  baselines: BaselineDTO[];
  weights: { HRV: number; RHR: number; SLEEP_DEBT: number }; // the row's config base weights (live config when no row)
  outlook: RecoveryDayDTO[];       // exactly 7, D-6..D ascending
  sleepDebt: SleepDebtDTO | null;
  lastNight: LastNightDTO | null;
  streak: { current: number; best: number };
  month: RecoveryMonthDTO;
  firstScoredDate: string | null;
  tomorrow: RecoveryTomorrowDTO | null; // null unless isToday
}

export interface RecoveryCalendarDTO { month: RecoveryMonthDTO; bands: ScoreBands }
```

- Also produced:
  - `computeStreak(rows: RecoveryDayDTO[], through: string, good: number, isToday: boolean): { current: number; best: number }`
  - `nightsToClear(deficits: number[], usualHigh: number): number`
  - `usualDebtRange(snap: { ewma: number | null; spread: number | null; mad: number | null; daysOfHistory: number; algorithmVersion: string }): { low: number; high: number } | null`
  - `debtBlockCount(debt: number, usualHigh: number | null): number`. This one is in **mobile** `recoveryCopy.ts`
    (Task 3), not here; it is listed so the two tasks agree.
  - `buildMonth(rows: RecoveryDayDTO[], month: string, bands: ScoreBands): RecoveryMonthDTO`
  - `buildOutlook(rows: RecoveryDayDTO[], date: string): RecoveryDayDTO[]`
  - `tomorrowFrom(forecast: ForecastResponse): RecoveryTomorrowDTO`

- [ ] **Step 1: Write the failing tests** in `backend/tests/recovery/helpers.test.ts`.

```ts
import { computeStreak } from '../../src/recovery/streak';
import { nightsToClear, usualDebtRange } from '../../src/recovery/sleepDebt';
import { buildMonth, buildOutlook } from '../../src/recovery/month';
import { tomorrowFrom } from '../../src/recovery/tomorrow';
import { getLiveConfig } from '../../src/scoring/configs';
import type { ForecastResponse } from '../../src/forecast/dto';

const BANDS = { excellent: 75, good: 55, fair: 40 };
const d = (date: string, score: number | null) => ({ date, score });

describe('computeStreak', () => {
  it('counts consecutive Good-or-better days ending at D, the band edge included', () => {
    const rows = [d('2026-10-01', 80), d('2026-10-02', 54.9), d('2026-10-03', 55), d('2026-10-04', 70)];
    expect(computeStreak(rows, '2026-10-04', 55, false)).toEqual({ current: 2, best: 2 });
  });
  it('a missing day or a null score breaks the run', () => {
    const rows = [d('2026-10-01', 80), d('2026-10-02', 80), d('2026-10-04', 80), d('2026-10-05', null), d('2026-10-06', 80)];
    expect(computeStreak(rows, '2026-10-06', 55, false)).toEqual({ current: 1, best: 2 });
  });
  it('today with no row yet continues from yesterday', () => {
    const rows = [d('2026-10-03', 60), d('2026-10-04', 60)];
    expect(computeStreak(rows, '2026-10-05', 55, true).current).toBe(2);
  });
  it('a past day with no row is a broken run (0)', () => {
    const rows = [d('2026-10-03', 60), d('2026-10-04', 60)];
    expect(computeStreak(rows, '2026-10-05', 55, false).current).toBe(0);
  });
  it('today with a BUILDING row (null score) does not shift to yesterday', () => {
    const rows = [d('2026-10-04', 60), d('2026-10-05', null)];
    expect(computeStreak(rows, '2026-10-05', 55, true).current).toBe(0);
  });
  it('best is the longest run in all history up to D, ignoring rows after D', () => {
    const rows = [d('2026-09-01', 60), d('2026-09-02', 60), d('2026-09-03', 60), d('2026-09-04', 30), d('2026-09-05', 60), d('2026-09-06', 60), d('2026-09-07', 60), d('2026-09-08', 60)];
    expect(computeStreak(rows, '2026-09-05', 55, false)).toEqual({ current: 1, best: 3 });
  });
  it('no history is 0 / 0', () => {
    expect(computeStreak([], '2026-10-05', 55, true)).toEqual({ current: 0, best: 0 });
  });
});

describe('nightsToClear', () => {
  const fourteen = (fill: (i: number) => number) => Array.from({ length: 14 }, (_, i) => fill(i));
  it('is 0 when debt is already within the usual', () => {
    expect(nightsToClear(fourteen(() => 5), 100)).toBe(0);
  });
  it('rolls the oldest nights off first', () => {
    // 60 + 60 at the oldest end, 10 elsewhere: sums 240, 180, 120, 110, ... as nights roll off.
    const deficits = fourteen((i) => (i < 2 ? 60 : 10));
    expect(nightsToClear(deficits, 180)).toBe(1);
    expect(nightsToClear(deficits, 130)).toBe(2);
    expect(nightsToClear(deficits, 119)).toBe(3);
  });
  it('caps at 14 (every night rolled off)', () => {
    expect(nightsToClear(fourteen(() => 100), 0)).toBe(14);
  });
});

describe('usualDebtRange', () => {
  const cfg = getLiveConfig();
  it('uses the floored spread, so a tiny MAD still gives a usable band', () => {
    const r = usualDebtRange({ ewma: 200, spread: 0, mad: 0, daysOfHistory: 30, algorithmVersion: cfg.version })!;
    const floor = cfg.spreadFloorFraction * 200;
    expect(r.low).toBeCloseTo(200 - floor, 5);
    expect(r.high).toBeCloseTo(200 + floor, 5);
  });
  it('clamps low at 0 and returns null in cold start', () => {
    expect(usualDebtRange({ ewma: 10, spread: 50, mad: 34, daysOfHistory: 30, algorithmVersion: cfg.version })!.low).toBe(0);
    expect(usualDebtRange({ ewma: null, spread: null, mad: null, daysOfHistory: 3, algorithmVersion: cfg.version })).toBeNull();
  });
  it('falls back to the live config for an unknown algorithm version', () => {
    expect(usualDebtRange({ ewma: 200, spread: 40, mad: 27, daysOfHistory: 30, algorithmVersion: 'v999' })).not.toBeNull();
  });
});

describe('buildMonth / buildOutlook', () => {
  it('averages non-null scores and counts each band', () => {
    const rows = [d('2026-09-30', 99), d('2026-10-01', 80), d('2026-10-02', 60), d('2026-10-03', 45), d('2026-10-04', 20), d('2026-10-05', null)];
    expect(buildMonth(rows, '2026-10', BANDS)).toEqual({
      month: '2026-10',
      days: [d('2026-10-01', 80), d('2026-10-02', 60), d('2026-10-03', 45), d('2026-10-04', 20), d('2026-10-05', null)],
      average: 51.3,
      counts: { excellent: 1, good: 1, fair: 1, low: 1 },
    });
  });
  it('an empty month has a null average and zero counts', () => {
    expect(buildMonth([], '2026-01', BANDS)).toEqual({ month: '2026-01', days: [], average: null, counts: { excellent: 0, good: 0, fair: 0, low: 0 } });
  });
  it('outlook is exactly 7 days ending at D, nulls for missing days', () => {
    const out = buildOutlook([d('2026-10-03', 61), d('2026-10-08', 68)], '2026-10-08');
    expect(out.map((o) => o.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    expect(out.map((o) => o.score)).toEqual([null, 61, null, null, null, null, 68]);
  });
});

describe('tomorrowFrom', () => {
  const cell = (sleepHours: number, exposed: string[], score: number) => ({ sleepHours, exposed, score, band: [score - 4, score + 4] as [number, number], confidence: 'HIGH' as const, contributions: [] });
  const ready = (series: Array<{ forecast: number; actual: number }>): ForecastResponse => ({
    status: 'READY',
    date: '2026-10-09',
    algorithmVersion: 'v3',
    defaults: { sleepHours: 7.5, habits: { ALCOHOL: 0 } },
    levers: [
      { key: 'SLEEP', label: 'Sleep', unit: 'h', min: 4, max: 10, step: 0.5, effect: 'CONFIRMED' },
      { key: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', min: 0, max: 5, step: 1, threshold: 1, effect: 'CONFIRMED' },
    ],
    grid: [6, 6.5, 7, 7.5, 8, 8.5, 9].flatMap((h) => [cell(h, [], 50 + h), cell(h, ['ALCOHOL'], 40 + h)]),
    trackRecord: { withinPoints: 3, hits: 0, days: series.length, series: series.map((s, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, ...s })) },
  });

  it('takes the 6/7/8/9 h cells at the default habit exposure', () => {
    const t = tomorrowFrom(ready([]));
    expect(t).toMatchObject({ status: 'READY', date: '2026-10-09' });
    if (t.status !== 'READY') throw new Error();
    expect(t.chips.map((c) => [c.sleepHours, c.score])).toEqual([[6, 56], [7, 57], [8, 58], [9, 59]]);
  });
  it('counts hits over the last 12 points with the full series tolerance', () => {
    const series = [...Array.from({ length: 8 }, () => ({ forecast: 50, actual: 70 })), ...Array.from({ length: 12 }, (_, i) => ({ forecast: 50, actual: i < 9 ? 52 : 60 }))];
    const t = tomorrowFrom(ready(series));
    if (t.status !== 'READY') throw new Error();
    expect(t.trackRecord).toEqual({ hits: 9, days: 12, withinPoints: 3 });
  });
  it('passes NOT_ENOUGH_DATA through', () => {
    expect(tomorrowFrom({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 4 })).toEqual({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 4 });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail** with
  `bash .superpowers/sdd/2026-10-09-recovery-page/backend-jest.sh tests/recovery/helpers.test.ts`.
  Expected: FAIL, with "Cannot find module '../../src/recovery/streak'".

- [ ] **Step 3: Implement.** Write `dto.ts` exactly as in the Interfaces block above, then add the following files.

```ts
// backend/src/recovery/streak.ts
// The Clear streak (spec §3.6): consecutive days scoring Good or better. Pure.
import { shiftDate } from '../scoring/dates';
import type { RecoveryDayDTO } from './dto';

export function computeStreak(rows: RecoveryDayDTO[], through: string, good: number, isToday: boolean): { current: number; best: number } {
  const upto = rows.filter((r) => r.date <= through).sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map(upto.map((r) => [r.date, r.score]));
  const clear = (date: string) => {
    const s = byDate.get(date);
    return s !== undefined && s !== null && s >= good;
  };

  // Before the morning sync today has no row; the run is not broken yet.
  let cursor = isToday && !byDate.has(through) ? shiftDate(through, -1) : through;
  let current = 0;
  while (clear(cursor)) {
    current++;
    cursor = shiftDate(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const r of upto) {
    const ok = r.score !== null && r.score >= good;
    run = ok ? (prev !== null && shiftDate(prev, 1) === r.date && run > 0 ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = r.date;
  }
  return { current, best: Math.max(best, current) };
}
```

```ts
// backend/src/recovery/sleepDebt.ts
// Sleep-debt tile helpers (spec §3.6, decision 2). Pure.
import { flooredSpread } from '../scoring/baseline';
import { getLiveConfig, SCORE_CONFIGS } from '../scoring/configs';

/**
 * `deficits` are the 14 nights D-13..D, oldest first: max(0, goal - asleep), a missing night 0
 * (as scoring/features.ts). Future nights at goal add 0, so after k nights the window holds
 * deficits[k..]. Returns the smallest k in 0..14 whose remaining sum is <= usualHigh.
 */
export function nightsToClear(deficits: number[], usualHigh: number): number {
  for (let k = 0; k < deficits.length; k++) {
    const rest = deficits.slice(k).reduce((s, v) => s + v, 0);
    if (rest <= usualHigh) return k;
  }
  return deficits.length;
}

/** ewma ± the floored spread the score's z used; null while cold-starting. */
export function usualDebtRange(snap: {
  ewma: number | null;
  spread: number | null;
  mad: number | null;
  daysOfHistory: number;
  algorithmVersion: string;
}): { low: number; high: number } | null {
  if (snap.ewma === null || snap.spread === null) return null;
  const cfg = SCORE_CONFIGS[snap.algorithmVersion] ?? getLiveConfig();
  const s = flooredSpread(
    { coldStart: false, daysOfHistory: snap.daysOfHistory, ewma: snap.ewma, spread: snap.spread, mad: snap.mad ?? 0 },
    cfg,
    'SLEEP_DEBT',
  );
  return { low: Math.max(0, snap.ewma - s), high: snap.ewma + s };
}
```

```ts
// backend/src/recovery/month.ts
// Calendar month and the 7-day strip from one ascending history (spec §3.5, §3.7). Pure.
import type { ScoreBands } from '../scoring/configs/v1';
import { shiftDate } from '../scoring/dates';
import type { RecoveryDayDTO, RecoveryMonthDTO } from './dto';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildMonth(rows: RecoveryDayDTO[], month: string, bands: ScoreBands): RecoveryMonthDTO {
  const days = rows.filter((r) => r.date.startsWith(`${month}-`)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const scored = days.map((r) => r.score).filter((s): s is number => s !== null);
  const counts = { excellent: 0, good: 0, fair: 0, low: 0 };
  for (const s of scored) {
    if (s >= bands.excellent) counts.excellent++;
    else if (s >= bands.good) counts.good++;
    else if (s >= bands.fair) counts.fair++;
    else counts.low++;
  }
  return { month, days, average: scored.length ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : null, counts };
}

export function buildOutlook(rows: RecoveryDayDTO[], date: string): RecoveryDayDTO[] {
  const byDate = new Map(rows.map((r) => [r.date, r.score]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDate(date, i - 6);
    return { date: day, score: byDate.get(day) ?? null };
  });
}
```

```ts
// backend/src/recovery/tomorrow.ts
// Tomorrow's card from the existing forecast (spec §3.8): the 6/7/8/9 h cells at the default
// habit exposure (the same rule as mobile lib/forecastGrid.ts exposedFor) and a last-12 track record.
import type { ForecastResponse } from '../forecast/dto';
import type { ForecastChipDTO, RecoveryTomorrowDTO } from './dto';

const CHIP_HOURS = [6, 7, 8, 9] as const;
const TRACK_POINTS = 12;

export function tomorrowFrom(f: ForecastResponse): RecoveryTomorrowDTO {
  if (f.status !== 'READY') return f;
  const exposed = f.levers
    .filter((l) => l.key !== 'SLEEP' && l.effect === 'CONFIRMED' && l.threshold !== undefined && (f.defaults.habits[l.key] ?? 0) >= l.threshold)
    .map((l) => l.key)
    .sort()
    .join(',');
  const chips: ForecastChipDTO[] = CHIP_HOURS.map((h) => {
    const cell =
      f.grid.find((c) => c.sleepHours === h && [...c.exposed].sort().join(',') === exposed) ??
      f.grid.find((c) => c.sleepHours === h && c.exposed.length === 0)!;
    return { sleepHours: h, score: cell.score, band: cell.band, confidence: cell.confidence };
  });
  const last = f.trackRecord.series.slice(-TRACK_POINTS);
  const within = f.trackRecord.withinPoints;
  return {
    status: 'READY',
    date: f.date,
    chips,
    trackRecord: { hits: last.filter((p) => Math.abs(p.actual - p.forecast) <= within).length, days: last.length, withinPoints: within },
  };
}
```

  Export `SCORE_CONFIGS` from `scoring/configs/index.ts` if it is not already exported. It is: `index.ts:7`.

- [ ] **Step 4: Run the tests and confirm they pass** with
  `bash .superpowers/sdd/2026-10-09-recovery-page/backend-jest.sh tests/recovery/helpers.test.ts tests/scoring/baseline.test.ts`.
  Expected: PASS. Then run `node node_modules/.bin/tsc --noEmit` in `backend/`; it must be clean.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/scoring/baseline.ts backend/src/recovery backend/tests/recovery/helpers.test.ts
git commit -m "feat(recovery): pure helpers for streak, sleep debt, month and tomorrow chips"
```

---

### Task 2: Backend bundle and routes

**Files:**
- Create: `backend/src/scoring/detail.ts`, holding `loadScoreDetail`, which is factored out of `routes.ts`.
- Modify: `backend/src/scoring/routes.ts:62-98`, so `/me/scores/:date` uses `loadScoreDetail`.
- Create: `backend/src/recovery/bundle.ts` and `backend/src/recovery/routes.ts`.
- Modify: `backend/src/app.ts`. Import `recoveryRouter` and add `app.use(recoveryRouter);` right after
  `app.use(scoresRouter);`.
- Test: `backend/tests/recovery/routes.test.ts`. The existing `backend/tests/scoring/routes.test.ts` must stay green
  unchanged.

**Interfaces:**
- Consumes everything Task 1 produces.
- Produces:
  - `loadScoreDetail(userId: string, date: string, type: ScoreType): Promise<{ row: DailyScore | null; snapshots: BaselineSnapshot[]; previous: { date: string; score: number } | null }>`
  - `buildRecoveryPage(userId: string, dateParam: string, now?: Date): Promise<RecoveryPageDTO | { error: 'bad_date' | 'future_date' }>`
  - `buildRecoveryCalendar(userId: string, month: string, now?: Date): Promise<RecoveryCalendarDTO | { error: 'bad_month' | 'future_month' }>`
  - `recoveryRouter`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/recovery/routes.test.ts`. Follow the
  `tests/scoring/routes.test.ts` harness: `migrateTestDb`, `testServer(createApp())`, `authHeaderFor`, and
  `createUser` / `day` from `tests/scoring/dbHelpers.ts`.

```ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { createUser, day } from '../scoring/dbHelpers';
import { localCivilDate } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import * as forecastEngine from '../../src/forecast/engine';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => prisma.$disconnect());

const FACTORS = [
  { factor: 'HRV', z: 1, weight: 0.45, contribution: 0.45, points: 6, imputed: false, excluded: false },
  { factor: 'RHR', z: -0.5, weight: 0.35, contribution: 0.175, points: 2.33, imputed: false, excluded: false },
  { factor: 'SLEEP_DEBT', z: 0.5, weight: 0.2, contribution: -0.1, points: -1.33, imputed: false, excluded: false, goalMinutes: 480 },
];
const put = (userId: string, date: string, score: number | null) =>
  prisma.dailyScore.create({ data: { userId, date: day(date), type: 'RECOVERY', algorithmVersion: 'v3', score, confidenceLevel: score === null ? 'LOW' : 'HIGH', factors: FACTORS as any } });
const get = async (userId: string, path: string) => request(await testServer(createApp())).get(path).set(await authHeaderFor(userId));

describe('GET /me/recovery/:date', () => {
  it('requires auth', async () => {
    expect((await request(await testServer(createApp())).get('/me/recovery/today')).status).toBe(401);
    expect((await request(await testServer(createApp())).get('/me/recovery/calendar/2026-10')).status).toBe(401);
  });

  it('READY: resolves today in the user timezone and returns the full shape', async () => {
    const user = await createUser({ timezone: 'Pacific/Kiritimati' });
    const today = localCivilDate(new Date(), 'Pacific/Kiritimati');
    await put(user.id, shiftDate(today, -1), 62);
    await put(user.id, today, 68.04);
    const res = await get(user.id, '/me/recovery/today');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toMatchObject({ date: today, isToday: true, state: 'READY', previous: { date: shiftDate(today, -1), score: 62 } });
    expect(res.body.score.score).toBe(68);
    expect(typeof res.body.updatedAt).toBe('string');
    expect(res.body.weights).toEqual({ HRV: expect.any(Number), RHR: expect.any(Number), SLEEP_DEBT: expect.any(Number) });
    expect(res.body.outlook).toHaveLength(7);
    expect(res.body.outlook[6]).toEqual({ date: today, score: 68 });
    expect(res.body.streak).toEqual({ current: 2, best: 2 });
    expect(res.body.month.month).toBe(today.slice(0, 7));
    expect(res.body.firstScoredDate).toBe(shiftDate(today, -1));
    expect(res.body).toHaveProperty('tomorrow');
    expect(res.body).not.toHaveProperty('factors');
  });

  it('NO_DATA: today before the morning sync is a 200 with the streak kept from yesterday', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, shiftDate(today, -1), 70);
    const res = await get(user.id, `/me/recovery/${today}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'NO_DATA', score: null, updatedAt: null, streak: { current: 1, best: 1 } });
  });

  it('BUILDING: a row with a null score', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, null);
    expect((await get(user.id, '/me/recovery/today')).body.state).toBe('BUILDING');
  });

  it('past day: tomorrow is null and isToday false', async () => {
    const user = await createUser();
    const past = shiftDate(localCivilDate(new Date(), 'UTC'), -10);
    await put(user.id, past, 50);
    const res = await get(user.id, `/me/recovery/${past}`);
    expect(res.body).toMatchObject({ isToday: false, tomorrow: null, state: 'READY' });
  });

  it('tomorrow is UNAVAILABLE when the forecast throws, and the page still loads', async () => {
    const user = await createUser();
    await put(user.id, localCivilDate(new Date(), 'UTC'), 60);
    jest.spyOn(forecastEngine, 'buildForecast').mockImplementation(() => { throw new Error('boom'); });
    const res = await get(user.id, '/me/recovery/today');
    expect(res.status).toBe(200);
    expect(res.body.tomorrow).toEqual({ status: 'UNAVAILABLE' });
  });

  it('sleep debt: minutes, goal, usual and nightsToClear from features, snapshot and nights', async () => {
    const user = await createUser({ sleepGoalMinutes: 480 });
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 60);
    await prisma.userDailyFeatures.create({ data: { userId: user.id, date: day(today), algorithmVersion: 'v3', sleepDebtRolling14d: 190 } });
    await prisma.baselineSnapshot.create({ data: { userId: user.id, metric: 'SLEEP_DEBT', date: day(today), ewma: 100, spread: 25, mad: 17, daysOfHistory: 30, algorithmVersion: 'v3' } });
    // Two 90-minute-short nights at the old end of the window, the rest on goal.
    for (let i = 0; i < 14; i++) {
      await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', recordedAt: day(shiftDate(today, i - 13)), value: i < 2 ? 390 : 480 } });
    }
    const { sleepDebt } = (await get(user.id, '/me/recovery/today')).body;
    expect(sleepDebt).toMatchObject({ minutes: 190, windowNights: 14, goalMinutes: 480, usualLowMinutes: 75, usualHighMinutes: 125, nightsToClear: 1 });
  });

  it('400 on a malformed or future date', async () => {
    const user = await createUser();
    expect((await get(user.id, '/me/recovery/2026-13-01')).status).toBe(400);
    expect((await get(user.id, `/me/recovery/${shiftDate(localCivilDate(new Date(), 'UTC'), 2)}`)).status).toBe(400);
  });

  it("a user west of UTC: UTC's today is their tomorrow, so it is a 400", async () => {
    const user = await createUser({ timezone: 'Etc/GMT+12' }); // UTC-12: their today is UTC's yesterday (or same day only after 12:00 UTC)
    const theirToday = localCivilDate(new Date(), 'Etc/GMT+12');
    expect((await get(user.id, `/me/recovery/${shiftDate(theirToday, 1)}`)).status).toBe(400);
    expect((await get(user.id, `/me/recovery/${theirToday}`)).status).toBe(200);
    expect((await get(user.id, '/me/recovery/today')).body.date).toBe(theirToday);
  });

  it('never logs recovery values', async () => {
    const spy = jest.spyOn(console, 'log');
    const err = jest.spyOn(console, 'error');
    const user = await createUser();
    await put(user.id, localCivilDate(new Date(), 'UTC'), 68.04);
    await get(user.id, '/me/recovery/today');
    const logged = [...spy.mock.calls, ...err.mock.calls].flat().map(String).join(' ');
    expect(logged).not.toMatch(/68/);
    expect(logged).not.toContain(localCivilDate(new Date(), 'UTC'));
  });
});

describe('GET /me/recovery/calendar/:month', () => {
  it('returns the month and bands, agreeing with the bundle month', async () => {
    const user = await createUser();
    const today = localCivilDate(new Date(), 'UTC');
    await put(user.id, today, 80);
    const month = today.slice(0, 7);
    const cal = await get(user.id, `/me/recovery/calendar/${month}`);
    const page = await get(user.id, '/me/recovery/today');
    expect(cal.status).toBe(200);
    expect(cal.headers['cache-control']).toBe('private, no-store');
    expect(cal.body.month).toEqual(page.body.month);
    expect(cal.body.bands).toEqual(page.body.bands);
  });
  it('400 on malformed or future months', async () => {
    const user = await createUser();
    expect((await get(user.id, '/me/recovery/calendar/2026-1')).status).toBe(400);
    expect((await get(user.id, '/me/recovery/calendar/2999-01')).status).toBe(400);
  });
});
```

  The sleep-debt numbers work out as follows:
  - The floored spread is max(25, 0.02 × 100), which is 25 (v1/v3 `spreadFloorFraction` is 0.02 and SLEEP_DEBT has
    no absolute floor). That makes the usual 75–125.
  - The deficits are [90, 90, 0×12], a sum of 180. With usualHigh 125, k=1 leaves 90 ≤ 125, so the answer is 1.

- [ ] **Step 2: Run the tests and confirm they fail** with
  `bash .superpowers/sdd/2026-10-09-recovery-page/backend-jest.sh tests/recovery/routes.test.ts`. Expected: 404s, so
  FAIL.

- [ ] **Step 3: Implement `loadScoreDetail`** and switch `/me/scores/:date` to it, keeping that route's responses
  byte-for-byte the same.

```ts
// backend/src/scoring/detail.ts
import type { BaselineSnapshot, DailyScore } from '@prisma/client';
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BASELINE_METRICS, type ScoreType } from './dto';

/** One day's score row, its baseline snapshots and the last earlier day with a score. Shared by /me/scores/:date and /me/recovery. */
export async function loadScoreDetail(userId: string, date: string, type: ScoreType): Promise<{
  row: DailyScore | null;
  snapshots: BaselineSnapshot[];
  previous: { date: string; score: number } | null;
}> {
  const day = civilDateToUtcMidnight(date);
  const [row, snapshots, prev] = await Promise.all([
    prisma.dailyScore.findUnique({ where: { userId_date_type: { userId, date: day, type } } }),
    prisma.baselineSnapshot.findMany({ where: { userId, date: day, metric: { in: BASELINE_METRICS } } }),
    prisma.dailyScore.findFirst({ where: { userId, type, date: { lt: day }, score: { not: null } }, orderBy: { date: 'desc' } }),
  ]);
  return {
    row,
    snapshots,
    previous: prev && prev.score !== null ? { date: prev.date.toISOString().slice(0, 10), score: Math.round(prev.score * 10) / 10 } : null,
  };
}
```

  In `scoring/routes.ts`, the `/me/scores/:date` handler body after the date and type checks becomes:

```ts
  const { row, snapshots, previous } = await loadScoreDetail(req.userId!, date, type);
  if (!row) {
    res.status(404).json({ error: `No ${type} score for ${date}` });
    return;
  }
  res.json({ score: toDailyScoreDTO(row, snapshots), baselines: toBaselineDTOs(snapshots, type), previous, bands: getLiveConfig().scoreBands });
```

- [ ] **Step 4: Implement the bundle.**

```ts
// backend/src/recovery/bundle.ts
// GET /me/recovery/:date in one round of reads (spec §4.2, minus decision 6's factor detail).
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { getSleepNight } from '../biometrics/sleepNight';
import { prisma } from '../db/client';
import { buildForecast } from '../forecast/engine';
import { loadForecastData } from '../forecast/load';
import { getLiveConfig, SCORE_CONFIGS, type ScoreConfig } from '../scoring/configs';
import { isCivilDate, shiftDate } from '../scoring/dates';
import { loadScoreDetail } from '../scoring/detail';
import { toBaselineDTOs, toDailyScoreDTO } from '../scoring/dto';
import { getSleepGoalMinutes } from '../users/goals';
import type { RecoveryCalendarDTO, RecoveryDayDTO, RecoveryPageDTO, RecoveryTomorrowDTO, SleepDebtDTO } from './dto';
import { buildMonth, buildOutlook } from './month';
import { nightsToClear, usualDebtRange } from './sleepDebt';
import { computeStreak } from './streak';
import { tomorrowFrom } from './tomorrow';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const round1 = (n: number) => Math.round(n * 10) / 10;

function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

async function userToday(userId: string, now: Date): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  // OrUtc: a stored zone that no longer resolves falls back to UTC instead of throwing (as the social module does).
  return localCivilDateOrUtc(now, user?.timezone ?? 'UTC');
}

async function history(userId: string, through: string): Promise<RecoveryDayDTO[]> {
  const rows = await prisma.dailyScore.findMany({
    where: { userId, type: 'RECOVERY', date: { lte: civilDateToUtcMidnight(through) } },
    select: { date: true, score: true },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), score: r.score === null ? null : round1(r.score) }));
}

// `cfg` is the row's config (live when there is no row), the same one the goal and weights come from.
async function sleepDebtFor(userId: string, date: string, cfg: ScoreConfig, goalFromRow: number | undefined, snap: { ewma: number | null; spread: number | null; mad: number | null; daysOfHistory: number; algorithmVersion: string } | undefined): Promise<SleepDebtDTO | null> {
  const window = cfg.sleepDebtWindowDays;
  const [features, nights, goalNow] = await Promise.all([
    prisma.userDailyFeatures.findUnique({ where: { userId_date: { userId, date: civilDateToUtcMidnight(date) } }, select: { sleepDebtRolling14d: true } }),
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte: civilDateToUtcMidnight(shiftDate(date, -(window - 1))), lte: civilDateToUtcMidnight(date) } },
      select: { recordedAt: true, value: true },
    }),
    getSleepGoalMinutes(userId),
  ]);
  if (!features || features.sleepDebtRolling14d === null) return null;
  const goal = goalFromRow ?? goalNow;
  const usual = snap ? usualDebtRange(snap) : null;
  const asleep = new Map(nights.map((n) => [n.recordedAt.toISOString().slice(0, 10), n.value]));
  const deficits = Array.from({ length: window }, (_, i) => {
    const v = asleep.get(shiftDate(date, i - (window - 1)));
    return v === undefined ? 0 : Math.max(0, goal - v);
  });
  return {
    minutes: Math.round(features.sleepDebtRolling14d),
    windowNights: window,
    goalMinutes: goal,
    usualLowMinutes: usual ? Math.round(usual.low) : null,
    usualHighMinutes: usual ? Math.round(usual.high) : null,
    nightsToClear: usual ? nightsToClear(deficits, usual.high) : null,
  };
}

async function tomorrowFor(userId: string, now: Date): Promise<RecoveryTomorrowDTO> {
  try {
    return tomorrowFrom(buildForecast(await loadForecastData(userId, now)));
  } catch (err) {
    console.error(JSON.stringify({ event: 'recovery_error', route: 'tomorrow', error: (err as Error)?.constructor?.name ?? 'Error' }));
    return { status: 'UNAVAILABLE' };
  }
}

export async function buildRecoveryPage(userId: string, dateParam: string, now = new Date()): Promise<RecoveryPageDTO | { error: 'bad_date' | 'future_date' }> {
  const today = await userToday(userId, now);
  const date = dateParam === 'today' ? today : dateParam;
  if (!isCivilDate(date)) return { error: 'bad_date' };
  if (date > today) return { error: 'future_date' };
  const isToday = date === today;
  const month = date.slice(0, 7);

  const detail = await loadScoreDetail(userId, date, 'RECOVERY');
  const { row, snapshots, previous } = detail;
  const stored = (row?.factors ?? []) as Array<{ factor: string; goalMinutes?: number }>;
  const debtGoal = stored.find((f) => f.factor === 'SLEEP_DEBT')?.goalMinutes;
  const debtSnap = snapshots.find((s) => s.metric === 'SLEEP_DEBT');
  const cfg = (row && SCORE_CONFIGS[row.algorithmVersion]) || getLiveConfig();

  // history() reads every RECOVERY row up to the end of D's month (best streak needs all of it). A few hundred
  // rows per year; a known cost, recorded in the ledger.
  const [rows, sleepDebt, night, tomorrow] = await Promise.all([
    history(userId, endOfMonth(month)),
    sleepDebtFor(userId, date, cfg, debtGoal, debtSnap),
    getSleepNight(userId, date),
    isToday ? tomorrowFor(userId, now) : Promise.resolve(null),
  ]);

  const bands = getLiveConfig().scoreBands;
  const upto = rows.filter((r) => r.date <= date);
  return {
    date,
    isToday,
    state: !row ? 'NO_DATA' : row.score === null ? 'BUILDING' : 'READY',
    bands,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    score: row ? toDailyScoreDTO(row, snapshots) : null,
    previous,
    baselines: row ? toBaselineDTOs(snapshots, 'RECOVERY') : [],
    weights: { HRV: cfg.weights.HRV, RHR: cfg.weights.RHR, SLEEP_DEBT: cfg.weights.SLEEP_DEBT },
    outlook: buildOutlook(upto, date),
    sleepDebt,
    lastNight: night
      ? {
          date: night.date,
          minutesAsleep: night.minutesAsleep,
          stages: night.hasStages && night.stageTotals
            ? { deep: night.stageTotals.deep.minutes, rem: night.stageTotals.rem.minutes, light: night.stageTotals.light.minutes, awake: night.stageTotals.awake.minutes }
            : null,
        }
      : null,
    streak: computeStreak(upto, date, bands.good, isToday),
    month: buildMonth(rows, month, bands),
    firstScoredDate: rows.find((r) => r.score !== null)?.date ?? null,
    tomorrow,
  };
}

export async function buildRecoveryCalendar(userId: string, month: string, now = new Date()): Promise<RecoveryCalendarDTO | { error: 'bad_month' | 'future_month' }> {
  if (!MONTH.test(month)) return { error: 'bad_month' };
  const today = await userToday(userId, now);
  if (month > today.slice(0, 7)) return { error: 'future_month' };
  const bands = getLiveConfig().scoreBands;
  return { month: buildMonth(await history(userId, endOfMonth(month)), month, bands), bands };
}
```

```ts
// backend/src/recovery/routes.ts
import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { buildRecoveryCalendar, buildRecoveryPage } from './bundle';

export const recoveryRouter = Router();

const ERRORS = {
  bad_date: 'date must be a valid YYYY-MM-DD or today',
  future_date: 'date is after today',
  bad_month: 'month must be YYYY-MM',
  future_month: 'month is after this month',
} as const;

// Registered before /:date so "calendar" is never read as a date.
recoveryRouter.get('/me/recovery/calendar/:month', requireAuth, async (req: AuthedRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const out = await buildRecoveryCalendar(req.userId!, String(req.params.month));
  if ('error' in out) {
    res.status(400).json({ error: ERRORS[out.error] });
    return;
  }
  res.json(out);
});

recoveryRouter.get('/me/recovery/:date', requireAuth, async (req: AuthedRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  const out = await buildRecoveryPage(req.userId!, String(req.params.date));
  if ('error' in out) {
    res.status(400).json({ error: ERRORS[out.error] });
    return;
  }
  res.json(out);
});
```

  `isCivilDate` must reject `2026-13-01`; it does (`scoring/dates.ts:9`). Express 5 forwards a rejected async handler
  to the app's error handler, so a DB error is a 500 with no values logged. Do not add a try/catch that logs the DTO.

- [ ] **Step 5: Run the tests and confirm they pass** with
  `bash .superpowers/sdd/2026-10-09-recovery-page/backend-jest.sh tests/recovery tests/scoring/routes.test.ts`.
  Expected: PASS. Then run backend `tsc --noEmit`; it must be clean.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/scoring/detail.ts backend/src/scoring/routes.ts backend/src/recovery backend/src/app.ts backend/tests/recovery/routes.test.ts
git commit -m "feat(recovery): GET /me/recovery/:date bundle and month calendar endpoint"
```

---

### Task 3: Mobile data layer and copy

**Files:**
- Create: `mobile/src/api/recovery.ts`, `mobile/src/lib/recoveryCopy.ts` and `mobile/src/lib/useRecoveryPage.ts`.
- Modify: `mobile/src/lib/coachPrompts.ts` to add `recoveryQuestion`.
- Modify: `mobile/src/lib/forecastCopy.ts` to add the `rightOfLast`, `ifYouSleep`, `moreLevers` and `sleepTonight`
  keys.
- Test: `mobile/__tests__/lib/recoveryCopy.test.ts` and `mobile/__tests__/lib/useRecoveryPage.test.tsx`.

**Interfaces:**
- Consumes the Task 1 DTO shapes, copied verbatim into `api/recovery.ts`. Import `DailyScoreDTO`, `BaselineDTO` and
  `ScoreBandsDTO` from `./scores` instead of the backend paths.
- Produces:
  - `fetchRecoveryPage(date: string | 'today'): Promise<RecoveryPageDTO>`
  - `fetchRecoveryMonth(month: string): Promise<RecoveryCalendarDTO>`
  - `type WeatherKey = 'clear' | 'mostlyClear' | 'cloudy' | 'stormy' | 'building' | 'none'`
  - `weatherFor(score: number | null, state: RecoveryState, bands: ScoreBandsDTO): WeatherKey`
  - `BAND_WORD: Record<ScoreBand, string>` and `VERDICT: Record<WeatherKey, string>`
  - `formatDayShort(date: string): string`, giving "Thu 8 Oct"
  - `weekdayShort(date: string): string`, giving "Thu"
  - `formatMinutes(min: number): string`, giving "3h 10m", "45m" or "8h"
  - `formatGoal(min: number): string`, giving "8h" or "7h 30m"
  - `headerSubtitle(date: string, updatedAt: string | null, isToday: boolean): string`
  - `heroLine(p: { score: number; bands: ScoreBandsDTO; date: string; previous: { date: string; score: number } | null; confidence: ConfidenceLevel }): { band: string; rest: string }`
  - `buildRecoverySummary(score: DailyScoreDTO, past: boolean): string`
  - `buildingCopy(cold: ColdStartDTO): { numeral: string; line: string; summary: string }`
  - `noDataLine(isToday: boolean): string`
  - `debtBlockCount(debt: number, usualHigh: number | null): number`
  - `debtBlocks(debt: number, usualHigh: number | null): Array<'full' | 'partial' | 'empty'>`
  - `debtClearCopy(nights: number | null, goalMinutes: number): string`
  - `monthCaption(counts): string`
  - `monthTitle(month: string, today: string): string`
  - `RECOVERY_COPY` (fixed strings)
  - `initialChip(goalMinutes: number | undefined): 6 | 7 | 8 | 9`
  - `useRecoveryPage(date?: string): { state: 'loading' | 'error' | 'ready'; page: RecoveryPageDTO | null; errorKind: 'future' | 'other' | null; reload(): void; month(m: string): MonthLoad; loadMonth(m: string): void }`,
    where `MonthLoad = { status: 'loading' | 'error' | 'ready'; data?: RecoveryMonthDTO }`.
  - `recoveryQuestion(p: { state: RecoveryState; isToday: boolean; date: string }): string`

- [ ] **Step 1: Write the failing tests** in `mobile/__tests__/lib/recoveryCopy.test.ts`.

```ts
import {
  weatherFor, VERDICT, formatDayShort, weekdayShort, formatMinutes, formatGoal, headerSubtitle, heroLine, buildRecoverySummary,
  buildingCopy, noDataLine, debtBlockCount, debtBlocks, debtClearCopy, monthCaption, monthTitle, initialChip,
} from '../../src/lib/recoveryCopy';
import { recoveryQuestion } from '../../src/lib/coachPrompts';
import type { DailyScoreDTO, FactorDTO } from '../../src/api/scores';

const BANDS = { excellent: 75, good: 55, fair: 40 };
const f = (factor: FactorDTO['factor'], points: number, extra: Partial<FactorDTO> = {}): FactorDTO => ({ factor, label: factor, z: 0, weight: 0.3, contribution: 0, points, imputed: false, excluded: false, ...extra });
const score = (factors: FactorDTO[], confidenceLevel: DailyScoreDTO['confidenceLevel'] = 'HIGH'): DailyScoreDTO => ({ date: '2026-10-08', type: 'RECOVERY', score: 68, confidenceLevel, algorithmVersion: 'v3', factors, coldStart: [] });

describe('weather', () => {
  it('maps bands and states', () => {
    expect([80, 60, 45, 20].map((s) => weatherFor(s, 'READY', BANDS))).toEqual(['clear', 'mostlyClear', 'cloudy', 'stormy']);
    expect(weatherFor(null, 'BUILDING', BANDS)).toBe('building');
    expect(weatherFor(null, 'NO_DATA', BANDS)).toBe('none');
    expect(VERDICT.cloudy).toBe('Cloudy');
    expect(VERDICT.mostlyClear).toBe('Mostly clear');
  });
});

describe('formatting', () => {
  it('formats days, minutes and goals', () => {
    expect(formatDayShort('2026-10-08')).toBe('Thu 8 Oct');
    expect(formatMinutes(190)).toBe('3h 10m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(480)).toBe('8h');
    expect(formatMinutes(0)).toBe('0m');
    expect(formatGoal(480)).toBe('8h');
    expect(formatGoal(450)).toBe('7h 30m');
  });
  it('reads civil dates by components, never as UTC instants (1 Oct 2026 is a Thursday)', () => {
    // new Date('2026-10-08') is UTC midnight: west of UTC it is still the 7th (Wed). Never parse that way.
    expect(weekdayShort('2026-10-08')).toBe('Thu');
    expect(weekdayShort('2026-10-01')).toBe('Thu');
    expect(weekdayShort('2026-10-05')).toBe('Mon');
  });
  it('header subtitle: updated time today, date alone on a past day or without a row', () => {
    expect(headerSubtitle('2026-10-08', '2026-10-08T07:12:00', true)).toMatch(/^Thu 8 Oct · updated 7:12\s?AM$/);
    expect(headerSubtitle('2026-10-02', '2026-10-02T07:12:00', false)).toBe('Fri 2 Oct');
    expect(headerSubtitle('2026-10-08', null, true)).toBe('Thu 8 Oct');
  });
});

describe('heroLine', () => {
  const base = { score: 68, bands: BANDS, date: '2026-10-08', confidence: 'HIGH' as const };
  it('vs yesterday, vs a weekday within 7 days, dropped when older', () => {
    expect(heroLine({ ...base, previous: { date: '2026-10-07', score: 62 } })).toEqual({ band: 'Good', rest: ' · +6 vs yesterday · High confidence' });
    expect(heroLine({ ...base, previous: { date: '2026-10-05', score: 70 } }).rest).toBe(' · −2 vs Mon · High confidence');
    expect(heroLine({ ...base, previous: { date: '2026-09-20', score: 70 } }).rest).toBe(' · High confidence');
    expect(heroLine({ ...base, previous: null }).rest).toBe(' · High confidence');
  });
  it('zero delta reads same as yesterday; rounds before subtracting', () => {
    expect(heroLine({ ...base, score: 68.4, previous: { date: '2026-10-07', score: 67.6 } }).rest).toBe(' · same as yesterday · High confidence');
  });
  it('Low band word, never Poor', () => {
    expect(heroLine({ ...base, score: 20, previous: null }).band).toBe('Low');
  });
});

describe('buildRecoverySummary', () => {
  it('top lift and top drag, present tense', () => {
    expect(buildRecoverySummary(score([f('HRV', 8), f('RHR', 1), f('SLEEP_DEBT', -5)]), false)).toBe(
      'A warm front in your HRV is lifting you today. Sleep-debt fog lingers; an early night clears it.',
    );
  });
  it('light fog under 3 points; past tense', () => {
    expect(buildRecoverySummary(score([f('RHR', 2), f('SLEEP_DEBT', -2)]), true)).toBe(
      'A calm resting heart rate lifted you that day. Light sleep-debt fog lingered; an early night would have cleared it.',
    );
  });
  it('calm when nothing reaches half a point; low confidence appended; excluded ignored', () => {
    expect(buildRecoverySummary(score([f('HRV', 0.4), f('SLEEP_DEBT', -9, { excluded: true })], 'LOW'), false)).toBe(
      'Calm conditions: everything is close to your usual. Some readings are missing, so treat today as a rough read.',
    );
  });
});

describe('building and no data', () => {
  it('building copy', () => {
    expect(buildingCopy({ metric: 'HRV', daysCollected: 9, daysRequired: 14 })).toEqual({
      numeral: 'Day 9 of 14',
      line: 'Your forecast is charging up · 5 days to go',
      summary: 'We need 5 more days of HRV to read your weather. Keep wearing your watch to bed.',
    });
  });
  it('no data line', () => {
    expect(noDataLine(true)).toBe("Waiting for last night's data");
    expect(noDataLine(false)).toBe('No data synced for this day');
  });
});

describe('sleep debt', () => {
  it('block count is clamped to 8..16', () => {
    expect(debtBlockCount(190, 125)).toBe(8);
    expect(debtBlockCount(0, null)).toBe(8);
    expect(debtBlockCount(2000, 125)).toBe(16);
  });
  it('blocks: whole 30-min blocks, a partial for a remainder of 10+ min, then empty', () => {
    expect(debtBlocks(75, 60)).toEqual(['full', 'full', 'partial', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(debtBlocks(65, 60).slice(0, 3)).toEqual(['full', 'full', 'empty']);
  });
  it('clear copy', () => {
    expect(debtClearCopy(0, 480)).toBe("You're within your usual.");
    expect(debtClearCopy(1, 480)).toBe('One night at your 8h goal clears the fog.');
    expect(debtClearCopy(2, 450)).toBe('Two nights at your 7h 30m goal clear the fog.');
    expect(debtClearCopy(12, 480)).toBe('12 nights at your 8h goal clear the fog.');
    expect(debtClearCopy(null, 480)).toBe('');
  });
});

describe('calendar copy', () => {
  it('month caption lists only nonzero Excellent and Low', () => {
    expect(monthCaption({ excellent: 1, good: 5, fair: 2, low: 1 })).toBe('month average · 1 Excellent, 1 Low');
    expect(monthCaption({ excellent: 0, good: 5, fair: 2, low: 0 })).toBe('month average');
  });
  it('month title adds the year outside the current year', () => {
    expect(monthTitle('2026-10', '2026-10-08')).toBe('October');
    expect(monthTitle('2025-12', '2026-10-08')).toBe('December 2025');
  });
});

describe('chips and coach', () => {
  it('initial chip is the goal rounded to 6..9, default 8', () => {
    expect(initialChip(450)).toBe(8);
    expect(initialChip(390)).toBe(7);
    expect(initialChip(300)).toBe(6);
    expect(initialChip(660)).toBe(9);
    expect(initialChip(undefined)).toBe(8);
  });
  it('recovery questions carry no numbers', () => {
    expect(recoveryQuestion({ state: 'READY', isToday: true, date: '2026-10-08' })).toBe('Why is my recovery where it is today?');
    expect(recoveryQuestion({ state: 'READY', isToday: false, date: '2026-10-02' })).toBe('Why was my recovery what it was on Fri 2 Oct?');
    expect(recoveryQuestion({ state: 'BUILDING', isToday: true, date: '2026-10-08' })).toBe('When will my recovery score be ready?');
    expect(recoveryQuestion({ state: 'NO_DATA', isToday: true, date: '2026-10-08' })).toBe("Why don't I have a recovery score today?");
    expect(recoveryQuestion({ state: 'NO_DATA', isToday: false, date: '2026-10-02' })).toBe("Why don't I have a recovery score for Fri 2 Oct?");
  });
});
```

  Then write `mobile/__tests__/lib/useRecoveryPage.test.tsx`. Mock `../../src/api/recovery`. Mock
  `@react-navigation/native` with `useFocusEffect: (cb) => React.useEffect(cb, [])`. Mock `../../src/sync/SyncProvider`
  so that `useSync: () => ({ dataVersion: 0 })`. Then assert:
  1. It starts `loading`, then becomes `ready` with the page. `fetchRecoveryPage` is called with `'today'` when `date`
     is undefined, else with the date.
  2. A rejection gives `error` with `errorKind: 'other'`. A rejection with `{ status: 400 }` gives `errorKind: 'future'`.
  3. `month(page.month.month)` is `ready` straight away from the bundle, with no fetch.
  4. `loadMonth('2026-09')` calls `fetchRecoveryMonth('2026-09')` once. A second `loadMonth('2026-09')` does not refetch.
  5. `reload()` refetches.

- [ ] **Step 2: Run the tests and confirm they fail**, from `mobile/`:
  `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/lib/recoveryCopy.test.ts __tests__/lib/useRecoveryPage.test.tsx`.

- [ ] **Step 3: Implement.**

```ts
// mobile/src/api/recovery.ts
import { apiFetch } from './client';
import type { BaselineDTO, DailyScoreDTO, ScoreBandsDTO } from './scores';

// Mirrors backend/src/recovery/dto.ts. Field names are the wire contract.
export type RecoveryState = 'READY' | 'BUILDING' | 'NO_DATA';
export interface SleepDebtDTO { minutes: number; windowNights: number; goalMinutes: number; usualLowMinutes: number | null; usualHighMinutes: number | null; nightsToClear: number | null }
export interface LastNightDTO { date: string; minutesAsleep: number; stages: { deep: number; rem: number; light: number; awake: number } | null }
export interface RecoveryDayDTO { date: string; score: number | null }
export interface RecoveryMonthDTO { month: string; days: RecoveryDayDTO[]; average: number | null; counts: { excellent: number; good: number; fair: number; low: number } }
export interface ForecastChipDTO { sleepHours: 6 | 7 | 8 | 9; score: number; band: [number, number]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }
export type RecoveryTomorrowDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | { status: 'UNAVAILABLE' }
  | { status: 'READY'; date: string; chips: ForecastChipDTO[]; trackRecord: { hits: number; days: number; withinPoints: number } };
export interface RecoveryPageDTO {
  date: string; isToday: boolean; state: RecoveryState; bands: ScoreBandsDTO; updatedAt: string | null;
  score: DailyScoreDTO | null; previous: { date: string; score: number } | null; baselines: BaselineDTO[];
  weights: { HRV: number; RHR: number; SLEEP_DEBT: number };
  outlook: RecoveryDayDTO[]; sleepDebt: SleepDebtDTO | null; lastNight: LastNightDTO | null;
  streak: { current: number; best: number }; month: RecoveryMonthDTO; firstScoredDate: string | null;
  tomorrow: RecoveryTomorrowDTO | null;
}
export interface RecoveryCalendarDTO { month: RecoveryMonthDTO; bands: ScoreBandsDTO }

// Errors throw (with .status), as in api/scores.ts. There is no 404 path: a day without a row is state NO_DATA.
export function fetchRecoveryPage(date: string | 'today'): Promise<RecoveryPageDTO> {
  return apiFetch<RecoveryPageDTO>(`/me/recovery/${date}`);
}
export function fetchRecoveryMonth(month: string): Promise<RecoveryCalendarDTO> {
  return apiFetch<RecoveryCalendarDTO>(`/me/recovery/calendar/${month}`);
}
```

  Confirm that `ScoreBandsDTO` is exported from `api/scores.ts`. It is, since `scoreInsights.ts` imports it; if it is
  not, export it there.

```ts
// mobile/src/lib/recoveryCopy.ts
// Every Recovery page string and the pure helpers behind them (spec §3). Components never inline copy.
import type { ColdStartDTO, ConfidenceLevel, DailyScoreDTO, FactorDTO, ScoreBandsDTO } from '../api/scores';
import type { RecoveryState } from '../api/recovery';
import { metricName, scoreBand, type ScoreBand } from './scoreInsights';

export type WeatherKey = 'clear' | 'mostlyClear' | 'cloudy' | 'stormy' | 'building' | 'none';

const BAND_WEATHER: Record<ScoreBand, WeatherKey> = { scoreExcellent: 'clear', scoreGood: 'mostlyClear', scoreFair: 'cloudy', scorePoor: 'stormy' };
export const BAND_WORD: Record<ScoreBand, string> = { scoreExcellent: 'Excellent', scoreGood: 'Good', scoreFair: 'Fair', scorePoor: 'Low' };
export const VERDICT: Record<WeatherKey, string> = {
  clear: 'Clear skies', mostlyClear: 'Mostly clear', cloudy: 'Cloudy', stormy: 'Stormy', building: 'Learning your weather', none: 'No reading',
};

export function weatherFor(score: number | null, state: RecoveryState, bands: ScoreBandsDTO): WeatherKey {
  if (state === 'NO_DATA') return 'none';
  if (score === null) return 'building';
  return BAND_WEATHER[scoreBand(score, bands)];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

// Civil dates are read without a timezone shift.
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const local = (date: string) => { const [y, m, d] = parts(date); return new Date(y, m - 1, d); };
export const weekdayShort = (date: string) => WEEKDAYS[local(date).getDay()]!;
export const formatDayShort = (date: string) => { const dt = local(date); return `${WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`; };
/** "Thursday 2 October" for screen-reader labels. */
export const formatDayLong = (date: string) => { const dt = local(date); return `${WEEKDAYS_LONG[dt.getDay()]} ${dt.getDate()} ${MONTHS_LONG[dt.getMonth()]}`; };
const daysBetween = (a: string, b: string) => Math.round((local(b).getTime() - local(a).getTime()) / 86_400_000);

// Durations pad minutes ("2h 05m", a column of values lines up); goals don't ("7h 30m", read in a sentence).
// Intentional (spec §3.6): do not unify formatMinutes and formatGoal.
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, '0')}m`;
}
export const formatGoal = (min: number) => { const h = Math.floor(min / 60); const r = Math.round(min % 60); return r === 0 ? `${h}h` : `${h}h ${r}m`; };

export function headerSubtitle(date: string, updatedAt: string | null, isToday: boolean): string {
  const day = formatDayShort(date);
  if (!isToday || !updatedAt) return day;
  const time = new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · updated ${time}`;
}

const CONFIDENCE: Record<ConfidenceLevel, string> = { HIGH: 'High confidence', MEDIUM: 'Medium confidence', LOW: 'Low confidence' };
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

export function heroLine(p: { score: number; bands: ScoreBandsDTO; date: string; previous: { date: string; score: number } | null; confidence: ConfidenceLevel }): { band: string; rest: string } {
  const band = BAND_WORD[scoreBand(p.score, p.bands)];
  let delta = '';
  if (p.previous) {
    const gap = daysBetween(p.previous.date, p.date);
    const d = Math.round(p.score) - Math.round(p.previous.score);
    if (gap === 1) delta = d === 0 ? ' · same as yesterday' : ` · ${signed(d)} vs yesterday`;
    else if (gap > 1 && gap <= 7) delta = d === 0 ? ` · same as ${weekdayShort(p.previous.date)}` : ` · ${signed(d)} vs ${weekdayShort(p.previous.date)}`;
  }
  return { band, rest: `${delta} · ${CONFIDENCE[p.confidence]}` };
}

const NEGLIGIBLE_POINTS = 0.5;
type Tense = { present: string; past: string };
const LIFT: Partial<Record<FactorDTO['factor'], Tense>> = {
  HRV: { present: 'A warm front in your HRV is lifting you today.', past: 'A warm front in your HRV lifted you that day.' },
  RHR: { present: 'A calm resting heart rate is lifting you today.', past: 'A calm resting heart rate lifted you that day.' },
  SLEEP_DEBT: { present: 'Clear air: your sleep debt is lighter than usual.', past: 'Clear air: your sleep debt was lighter than usual.' },
};
const DRAG: Partial<Record<FactorDTO['factor'], Tense>> = {
  HRV: { present: 'A cold front in your HRV is holding you back.', past: 'A cold front in your HRV held you back.' },
  RHR: { present: 'A gusty resting heart rate is holding you back.', past: 'A gusty resting heart rate held you back.' },
};
const fog = (light: boolean, past: boolean) =>
  `${light ? 'Light s' : 'S'}leep-debt fog ${past ? 'lingered; an early night would have cleared it.' : 'lingers; an early night clears it.'}`;

export function buildRecoverySummary(score: DailyScoreDTO, past: boolean): string {
  const active = score.factors.filter((x) => !x.excluded);
  const lift = [...active].sort((a, b) => b.points - a.points)[0];
  const drag = [...active].sort((a, b) => a.points - b.points)[0];
  const out: string[] = [];
  if (lift && lift.points >= NEGLIGIBLE_POINTS && LIFT[lift.factor]) out.push(LIFT[lift.factor]![past ? 'past' : 'present']);
  if (drag && drag.points <= -NEGLIGIBLE_POINTS) {
    if (drag.factor === 'SLEEP_DEBT') out.push(fog(Math.abs(drag.points) < 3, past));
    else if (DRAG[drag.factor]) out.push(DRAG[drag.factor]![past ? 'past' : 'present']);
  }
  if (out.length === 0) out.push(past ? 'Calm conditions: everything was close to your usual.' : 'Calm conditions: everything is close to your usual.');
  if (score.confidenceLevel === 'LOW') out.push(past ? 'Some readings were missing, so treat that day as a rough read.' : 'Some readings are missing, so treat today as a rough read.');
  return out.join(' ');
}

export function buildingCopy(cold: ColdStartDTO): { numeral: string; line: string; summary: string } {
  const left = Math.max(0, cold.daysRequired - cold.daysCollected);
  return {
    numeral: `Day ${cold.daysCollected} of ${cold.daysRequired}`,
    line: `Your forecast is charging up · ${left} ${left === 1 ? 'day' : 'days'} to go`,
    summary: `We need ${left} more ${left === 1 ? 'day' : 'days'} of ${metricName(cold.metric)} to read your weather. Keep wearing your watch to bed.`,
  };
}

export const noDataLine = (isToday: boolean) => (isToday ? "Waiting for last night's data" : 'No data synced for this day');

export function debtBlockCount(debt: number, usualHigh: number | null): number {
  return Math.min(16, Math.max(8, Math.ceil(Math.max(debt, usualHigh ?? 0) / 30) + 1));
}
export function debtBlocks(debt: number, usualHigh: number | null): Array<'full' | 'partial' | 'empty'> {
  const n = debtBlockCount(debt, usualHigh);
  const full = Math.min(n, Math.floor(debt / 30));
  const partial = full < n && debt - full * 30 >= 10 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => (i < full ? 'full' : i < full + partial ? 'partial' : 'empty'));
}

export function debtClearCopy(nights: number | null, goalMinutes: number): string {
  if (nights === null) return '';
  if (nights === 0) return "You're within your usual.";
  const goal = formatGoal(goalMinutes);
  if (nights === 1) return `One night at your ${goal} goal clears the fog.`;
  return `${NUMBER_WORDS[nights] ?? nights} nights at your ${goal} goal clear the fog.`;
}

export function monthCaption(c: { excellent: number; low: number }): string {
  const bits = [c.excellent ? `${c.excellent} Excellent` : '', c.low ? `${c.low} Low` : ''].filter(Boolean);
  return bits.length ? `month average · ${bits.join(', ')}` : 'month average';
}
export function monthTitle(month: string, today: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS_LONG[m! - 1]!;
  return String(y) === today.slice(0, 4) ? name : `${name} ${y}`;
}
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y!, m! - 1 + by, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function initialChip(goalMinutes: number | undefined): 6 | 7 | 8 | 9 {
  if (goalMinutes === undefined) return 8;
  return Math.min(9, Math.max(6, Math.round(goalMinutes / 60))) as 6 | 7 | 8 | 9;
}

export const RECOVERY_COPY = {
  title: 'Recovery',
  back: 'Back',
  info: 'How the score works',
  infoTitle: 'How the score works',
  infoHow: (w: { HRV: number; RHR: number; SLEEP_DEBT: number }) =>
    `Each day starts at 50. HRV, resting heart rate and sleep debt move it up or down against your own usual, weighted ${Math.round(w.HRV * 100)} / ${Math.round(w.RHR * 100)} / ${Math.round(w.SLEEP_DEBT * 100)}.`,
  infoBands: (b: ScoreBandsDTO) => [
    `Clear skies · Excellent · ${b.excellent} and up`,
    `Mostly clear · Good · ${b.good}–${b.excellent - 1}`,
    `Cloudy · Fair · ${b.fair}–${b.good - 1}`,
    `Stormy · Low · under ${b.fair}`,
  ],
  lastSevenDays: 'Last 7 days',
  today: 'Today',
  sleepAndStreak: 'Sleep and streak',
  debtEyebrow: (n: number) => `Sleep debt · ${n} nights`,
  debtOwed: (usualHigh: number | null) => (usualHigh === null ? 'owed' : `owed · usual under ${formatMinutes(usualHigh)}`),
  debtCaption: (clear: string) => (clear ? `Each block is 30 min. ${clear}` : 'Each block is 30 min.'),
  debtNone: 'No sleep data in the last 14 nights',
  debtWord: (points: number) => (points <= -0.5 ? 'Fog' : points >= 0.5 ? 'Clear' : 'Calm'),
  lastNight: 'Last night',
  lastNightCaption: (deep: number, rem: number) => `Deep ${formatMinutes(deep)} · REM ${formatMinutes(rem)}`,
  noStages: 'No stage data',
  noSleep: 'No sleep recorded',
  streak: 'Clear streak',
  streakUnit: (n: number) => (n === 1 ? 'day' : 'days'),
  streakCaption: (best: number, hasHistory: boolean) => (hasHistory ? `Good or better · best run ${best}` : 'Good or better days in a row'),
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  calendarHint: 'Tap a day to see its conditions.',
  monthError: (name: string) => `Couldn't load ${name}.`,
  retry: 'Retry',
  weekdayHeader: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  tomorrow: "Tomorrow's forecast",
  loadError: "Couldn't load your recovery.",
  futureError: "That day hasn't happened yet.",
  tryAgain: 'Try again',
  askToday: (coach: string) => `Ask ${coach} about today`,
  askPast: (coach: string) => `Ask ${coach} about this day`,
  noReading: 'No reading',
  cellLabel: (date: string, score: number | null, band: string | null) =>
    score === null ? `${formatDayLong(date)}, No reading` : `${formatDayLong(date)}, ${Math.round(score)}, ${band}`,
  heroA11y: (score: number, band: string, verdict: string, line: string) => `Recovery ${Math.round(score)}, ${band}, ${verdict.toLowerCase()}.${line}`,
} as const;
```

  Add to `FORECAST_COPY` in `forecastCopy.ts`:

```ts
  rightOfLast: (hits: number, days: number) => `right ${hits} of last ${days}`,
  ifYouSleep: (h: number) => `if you sleep ${h}h tonight`,
  moreLevers: 'More levers',
  sleepTonight: 'Sleep tonight',
  chipLabel: (h: number, score: number) => `${h} hours, predicted ${Math.round(score)}`,
```

  Add to `coachPrompts.ts`. Keep the file's no-numbers comment, which ruling 2 relies on.

```ts
import type { RecoveryState } from '../api/recovery';
import { formatDayShort } from './recoveryCopy';

export function recoveryQuestion(p: { state: RecoveryState; isToday: boolean; date: string }): string {
  if (p.state === 'BUILDING') return 'When will my recovery score be ready?';
  if (p.state === 'NO_DATA') return p.isToday ? "Why don't I have a recovery score today?" : `Why don't I have a recovery score for ${formatDayShort(p.date)}?`;
  return p.isToday ? 'Why is my recovery where it is today?' : `Why was my recovery what it was on ${formatDayShort(p.date)}?`;
}
```

```ts
// mobile/src/lib/useRecoveryPage.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchRecoveryMonth, fetchRecoveryPage, type RecoveryMonthDTO, type RecoveryPageDTO } from '../api/recovery';
import { useSync } from '../sync/SyncProvider';

export type MonthLoad = { status: 'loading' | 'error' | 'ready'; data?: RecoveryMonthDTO };

// Loads the bundle for `date` (undefined = today). Today refetches on focus and after a sync,
// because scores land after the morning sync. Months are cached by YYYY-MM for calendar paging.
export function useRecoveryPage(date?: string) {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [page, setPage] = useState<RecoveryPageDTO | null>(null);
  const [errorKind, setErrorKind] = useState<'future' | 'other' | null>(null);
  const [months, setMonths] = useState<Record<string, MonthLoad>>({});
  const inflight = useRef(new Set<string>());
  const { dataVersion } = useSync();
  const isToday = date === undefined;

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) setState('loading');
    try {
      const p = await fetchRecoveryPage(date ?? 'today');
      setPage(p);
      setMonths((m) => ({ ...m, [p.month.month]: { status: 'ready', data: p.month } }));
      setState('ready');
      setErrorKind(null);
    } catch (e) {
      if (quiet) return;
      setErrorKind((e as { status?: number } | null)?.status === 400 ? 'future' : 'other');
      setState('error');
    }
  }, [date]);

  useEffect(() => { void load(false); }, [load, dataVersion]);
  useFocusEffect(useCallback(() => { if (isToday) void load(true); }, [isToday, load]));

  const loadMonth = useCallback((m: string) => {
    if (months[m]?.status === 'ready' || inflight.current.has(m)) return;
    inflight.current.add(m);
    setMonths((s) => ({ ...s, [m]: { status: 'loading' } }));
    fetchRecoveryMonth(m)
      .then((r) => setMonths((s) => ({ ...s, [m]: { status: 'ready', data: r.month } })))
      .catch(() => setMonths((s) => ({ ...s, [m]: { status: 'error' } })))
      .finally(() => inflight.current.delete(m));
  }, [months]);

  return {
    state, page, errorKind,
    reload: () => void load(false),
    month: (m: string): MonthLoad => months[m] ?? { status: 'loading' },
    loadMonth,
  };
}
```

  Confirm the `useSync` import path and its `dataVersion` field against `screens/SleepScreen.tsx:73` and that file's
  imports. Use the same path.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same two test files plus
  `__tests__/lib/coachPrompts*` if it exists. Run `recoveryCopy.test.ts` once more under each of
  `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`, prefixed to the jest command; it must pass under both. Then run
  the mobile typecheck; the count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/api/recovery.ts mobile/src/lib/recoveryCopy.ts mobile/src/lib/useRecoveryPage.ts mobile/src/lib/coachPrompts.ts mobile/src/lib/forecastCopy.ts mobile/__tests__/lib/recoveryCopy.test.ts mobile/__tests__/lib/useRecoveryPage.test.tsx
git commit -m "feat(mobile): recovery API client, copy helpers and page hook"
```

---

### Task 4: Pixel weather art

**Files:**
- Create: `mobile/src/lib/weatherArt.ts` and `mobile/src/components/recovery/WeatherIcon.tsx`.
- Test: `mobile/__tests__/components/WeatherIcon.test.tsx`.

**Interfaces:**
- Consumes: `WeatherKey` (Task 3).
- Produces:
  - `HERO_ART: Record<WeatherKey, PixelRect[]>` on a 28×20 grid;
  - `SMALL_ART: Record<WeatherKey, PixelRect[]>` on an 11×11 grid;
  - `type PixelRect = { x: number; y: number; w: number; h: number; fill: string }`;
  - `<WeatherIcon kind: WeatherKey; variant: 'hero' | 'small'; size?: number; dim?: boolean; testID?: string />`.
    The hero is drawn at 150×107. Small is drawn at `size` (22 for the outlook, 44 for the forecast).

- [ ] **Step 1: Write the failing test.**

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeatherIcon } from '../../src/components/recovery/WeatherIcon';
import { HERO_ART, SMALL_ART } from '../../src/lib/weatherArt';

const KINDS = ['clear', 'mostlyClear', 'cloudy', 'stormy', 'building', 'none'] as const;

describe('WeatherIcon', () => {
  it.each(KINDS)('draws one Rect per pixel run for %s (hero and small), crisp, hidden from a11y', (kind) => {
    for (const variant of ['hero', 'small'] as const) {
      const { getByTestId, UNSAFE_getAllByType } = render(<WeatherIcon kind={kind} variant={variant} testID="w" />);
      const art = variant === 'hero' ? HERO_ART[kind] : SMALL_ART[kind];
      const { Rect } = require('react-native-svg');
      expect(UNSAFE_getAllByType(Rect)).toHaveLength(art.length);
      const root = getByTestId('w');
      expect(root.props.accessible).toBe(false);
      expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });
  it('every rect fits its grid', () => {
    for (const k of KINDS) {
      for (const r of HERO_ART[k]) expect(r.x + r.w <= 28 && r.y + r.h <= 20).toBe(true);
      for (const r of SMALL_ART[k]) expect(r.x + r.w <= 11 && r.y + r.h <= 11).toBe(true);
    }
  });
  it('the cloudy art has no rain: only greys', () => {
    expect(HERO_ART.cloudy.every((r) => /^#(9CA3AF|D1D5DB|E5E7EB|F3F4F6)$/.test(r.fill))).toBe(true);
    expect(SMALL_ART.cloudy.every((r) => r.fill === '#9CA3AF')).toBe(true);
  });
});
```

  If the svg jest mock renders `Rect` under a different type, follow `__tests__/components/BadgeIcon*.test.tsx`, which
  already counts badge rects, and match its approach.

- [ ] **Step 2: Run the test and confirm it fails** (module not found).

- [ ] **Step 3: Implement.** `mostlyClear` (hero) and all four band icons in the small set are copied from the board,
  `.superpowers/recovery-canvas/project/Combined.dc.html`. The rest are new art on the same grids and palette, and go
  through the Task 4b gate.

```ts
// mobile/src/lib/weatherArt.ts
// Pixel weather (spec §3.0). Rect lists copied from the approved board (Combined.dc.html) where it
// has art; the rest drawn on the same grids and palette. Colours are fixed in both themes.
import type { WeatherKey } from './recoveryCopy';

export type PixelRect = { x: number; y: number; w: number; h: number; fill: string };
const r = (x: number, y: number, w: number, h: number, fill: string): PixelRect => ({ x, y, w, h, fill });

const SUN_HI = '#FDE68A', SUN_MID = '#FCD34D', SUN = '#FBBF24', SUN_LO = '#F59E0B';
const CLOUD = '#E5E7EB', CLOUD_HI = '#F3F4F6', CLOUD_LO = '#9CA3AF', GREY = '#D1D5DB';
const STORM = '#6B7280', STORM_LO = '#4B5563';

export const HERO_ART: Record<WeatherKey, PixelRect[]> = {
  // Board hero (Good): sun behind a cloud.
  mostlyClear: [
    r(9, 1, 6, 1, SUN_HI), r(7, 2, 10, 1, SUN_MID), r(6, 3, 12, 7, SUN), r(7, 10, 10, 1, SUN_LO), r(9, 11, 6, 1, SUN_LO),
    r(11, 0, 2, 1, SUN_HI), r(3, 6, 2, 1, SUN_HI), r(19, 5, 2, 1, SUN_HI),
    r(14, 9, 8, 1, CLOUD), r(12, 10, 13, 1, CLOUD_HI), r(11, 11, 16, 4, CLOUD), r(12, 15, 14, 1, CLOUD_LO), r(15, 10, 3, 1, '#FFFFFF'),
  ],
  // New: a centred sun with four rays.
  clear: [
    r(11, 4, 6, 1, SUN_HI), r(9, 5, 10, 1, SUN_MID), r(8, 6, 12, 7, SUN), r(9, 13, 10, 1, SUN_LO), r(11, 14, 6, 1, SUN_LO),
    r(13, 1, 2, 2, SUN_HI), r(13, 16, 2, 2, SUN_HI), r(4, 9, 2, 2, SUN_HI), r(22, 9, 2, 2, SUN_HI),
  ],
  // New: a plain grey cloud, no rain (decision 1).
  cloudy: [
    r(10, 5, 8, 1, GREY), r(8, 6, 13, 1, CLOUD), r(6, 7, 17, 1, CLOUD_HI), r(5, 8, 19, 5, GREY), r(6, 13, 17, 1, CLOUD_LO), r(11, 6, 3, 1, CLOUD_HI),
  ],
  // New: a dark cloud with lightning.
  stormy: [
    r(10, 2, 8, 1, STORM), r(8, 3, 13, 1, STORM), r(6, 4, 17, 6, STORM), r(7, 10, 15, 1, STORM_LO),
    r(14, 11, 3, 1, SUN), r(13, 12, 3, 1, SUN), r(12, 13, 5, 1, SUN), r(14, 14, 2, 1, SUN), r(13, 15, 2, 1, SUN), r(13, 16, 1, 1, SUN_LO),
  ],
  // New: a dotted grey sun outline (cold start).
  building: [
    r(12, 3, 1, 1, STORM), r(15, 3, 1, 1, STORM), r(9, 5, 1, 1, STORM), r(18, 5, 1, 1, STORM), r(8, 8, 1, 1, STORM), r(19, 8, 1, 1, STORM),
    r(8, 11, 1, 1, STORM), r(19, 11, 1, 1, STORM), r(9, 14, 1, 1, STORM), r(18, 14, 1, 1, STORM), r(12, 16, 1, 1, STORM), r(15, 16, 1, 1, STORM),
  ],
  // New: an empty sky, three grey dashes.
  none: [r(6, 9, 4, 1, STORM_LO), r(12, 9, 4, 1, STORM_LO), r(18, 9, 4, 1, STORM_LO)],
};

export const SMALL_ART: Record<WeatherKey, PixelRect[]> = {
  clear: [r(3, 3, 5, 5, SUN), r(5, 1, 1, 1, SUN_HI), r(1, 5, 1, 1, SUN_HI), r(9, 5, 1, 1, SUN_HI), r(5, 9, 1, 1, SUN_HI)],
  mostlyClear: [r(2, 2, 5, 5, SUN), r(4, 5, 6, 3, CLOUD)],
  cloudy: [r(1, 4, 9, 4, CLOUD_LO), r(3, 3, 5, 1, CLOUD_LO)],
  stormy: [r(1, 3, 9, 4, STORM), r(3, 2, 5, 1, STORM), r(5, 7, 2, 1, SUN), r(4, 8, 2, 1, SUN), r(5, 9, 1, 1, SUN)],
  building: [r(4, 2, 1, 1, STORM), r(6, 2, 1, 1, STORM), r(2, 4, 1, 1, STORM), r(8, 4, 1, 1, STORM), r(2, 6, 1, 1, STORM), r(8, 6, 1, 1, STORM), r(4, 8, 1, 1, STORM), r(6, 8, 1, 1, STORM)],
  none: [r(3, 5, 5, 1, STORM_LO)],
};
```

```tsx
// mobile/src/components/recovery/WeatherIcon.tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { HERO_ART, SMALL_ART } from '../../lib/weatherArt';
import type { WeatherKey } from '../../lib/recoveryCopy';

// Decorative: the verdict text carries the meaning (spec §3.0, §7).
export function WeatherIcon({ kind, variant, size = 22, dim = false, testID }: { kind: WeatherKey; variant: 'hero' | 'small'; size?: number; dim?: boolean; testID?: string }) {
  const hero = variant === 'hero';
  const art = hero ? HERO_ART[kind] : SMALL_ART[kind];
  const width = hero ? 150 : size;
  const height = hero ? 107 : size;
  return (
    <View testID={testID} accessible={false} importantForAccessibility="no-hide-descendants" style={{ width, height, opacity: dim ? 0.45 : 1 }}>
      <Svg width={width} height={height} viewBox={hero ? '0 0 28 20' : '0 0 11 11'} shapeRendering="crispEdges">
        {art.map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        ))}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes.** Then run the typecheck; the count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/lib/weatherArt.ts mobile/src/components/recovery/WeatherIcon.tsx mobile/__tests__/components/WeatherIcon.test.tsx
git commit -m "feat(mobile): pixel weather art and WeatherIcon"
```

### Task 4b: Owner gate on the new weather art (controller; no code)

- [ ] **Step 1:** Add a board `WeatherStrip.dc.html` to `.superpowers/recovery-canvas/project/`. It should show all six
  hero icons and all six small icons, using exactly the rect lists from `weatherArt.ts`, on the dark page background
  with each verdict word under its icon. Republish the canvas
  `https://claude.ai/artifact/9v7waTGZ6abQfJQak2injD` with the Artifact tool (`url` plus `root` set to the canvas
  folder).
- [ ] **Step 2:** Ask the owner to approve it. Edits come back as rect changes to `weatherArt.ts`, made in a fix commit
  by the Task 4 implementer. Record `Ruling: weather art approved — <date>` in the ledger. Tasks 5–10 do **not**
  wait for this gate; **the Task 11 draft PR does.**

---

### Task 5: AskCoachBar extraction and the openNight helper

**Files:**
- Create: `mobile/src/components/coach/AskCoachBar.tsx` and `mobile/src/navigation/sleepNavigation.ts`.
- Modify: `mobile/src/screens/ScoreDetailScreen.tsx:213-232`, which now renders `<AskCoachBar …>`.
- Modify: `mobile/src/components/ui/README.md:133`. The documented exception becomes "AskCoachBar
  (components/coach/AskCoachBar.tsx), used by ScoreDetail and Recovery".
- Modify: `mobile/__tests__/conventions/buttons.test.ts:97`. The exception moves to
  `{ file: 'components/coach/AskCoachBar.tsx', key: 'ask-coach-button', count: 1, reason: 'Ask {coach}, a GlassSurface CTA with the character (the one documented custom CTA)' }`.
- Test: `mobile/__tests__/components/AskCoachBar.test.tsx` and `mobile/__tests__/navigation/sleepNavigation.test.ts`.
  The existing `ScoreDetailCoachEntry.test.tsx` must stay green unchanged.

**Interfaces:**
- Produces:
  - `<AskCoachBar label: string; onPress(): void; focused: boolean />`. It is absolutely positioned at the bottom,
    reads the safe area from context, and has testIDs `ask-coach-button` and `ask-coach-character`.
  - `openNight(navigation: { navigate: (...a: any[]) => void }, date: string): void`. It currently calls
    `navigation.navigate('SleepNight', { date })`.

- [ ] **Step 1: Write the failing tests.**
  - `AskCoachBar` renders the label, calls `onPress` on a press of `ask-coach-button`, and renders the character.
    Wrap it with `withCharacter` from `jest-mocks/characterContext` as `ScoreDetailCoachEntry.test.tsx` does.
  - `openNight(nav, '2026-10-08')` calls `nav.navigate('SleepNight', { date: '2026-10-08' })`.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.** Move the JSX block from `ScoreDetailScreen.tsx` (`{coachRoute ? (<View className="absolute …">…</View>) : null}`)
  into `AskCoachBar`. It takes `label` instead of the literal "Ask Coach about this" and `onPress` instead of the inline
  handler, and it reads `insets`, `scheme` and `colors` itself.

```tsx
// mobile/src/components/coach/AskCoachBar.tsx
import React, { useContext } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme';
import { GlassSurface } from '../ui/glass-surface';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';
import { Character } from '../characters/Character';

// The one documented custom CTA (components/ui/README.md): a GlassSurface bar with the coach
// character, 8 px corners, pinned above the safe area. Used by ScoreDetail and Recovery.
export function AskCoachBar({ label, onPress, focused }: { label: string; onPress: () => void; focused: boolean }) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  // Context, not the hook: tests render screens without a provider.
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <View className="absolute bottom-0 left-0 right-0 px-5" style={{ paddingBottom: Math.max(insets?.bottom ?? 0, 16) }} pointerEvents="box-none">
      <PressableScale testID="ask-coach-button" accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <GlassSurface
          scheme={scheme === 'light' ? 'light' : 'dark'}
          fallbackColor={colors.surfaceRaised}
          borderRadius={8}
          style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.hairline }}
        >
          <Character testID="ask-coach-character" mood="idle" size={40} paused={!focused} />
          <Text className="flex-1 text-body font-semibold">{label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginRight: 8 }} />
        </GlassSurface>
      </PressableScale>
    </View>
  );
}
```

  In `ScoreDetailScreen`, write
  `{coachRoute ? <AskCoachBar label="Ask Coach about this" focused={focused} onPress={() => navigateToCoachEntry(navigation, coachRoute, scoreQuestion(score.type))} /> : null}`,
  and drop the imports that are now unused (`GlassSurface`, `PressableScale`, `Character`, `Ionicons`, and `useContext`
  / `SafeAreaInsetsContext` if they have no other use).

```ts
// mobile/src/navigation/sleepNavigation.ts
// The single named target for "open this night". The combined Sleep page work repoints only this.
export function openNight(navigation: { navigate: (...args: any[]) => void }, date: string): void {
  navigation.navigate('SleepNight', { date });
}
```

- [ ] **Step 4: Run the tests and confirm they pass:**
  `__tests__/components/AskCoachBar.test.tsx __tests__/navigation/sleepNavigation.test.ts __tests__/screens/ScoreDetail* __tests__/conventions`.
  Then run the typecheck; the count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/coach/AskCoachBar.tsx mobile/src/navigation/sleepNavigation.ts mobile/src/screens/ScoreDetailScreen.tsx mobile/src/components/ui/README.md mobile/__tests__/conventions/buttons.test.ts mobile/__tests__/components/AskCoachBar.test.tsx mobile/__tests__/navigation/sleepNavigation.test.ts
git commit -m "refactor(mobile): extract AskCoachBar; add openNight helper"
```

---

### Task 6: RecoveryScreen — route, header, info sheet, hero, summary, states

**Files:**
- Create: `mobile/src/screens/RecoveryScreen.tsx`, `mobile/src/components/recovery/RecoveryHeader.tsx`,
  `mobile/src/components/recovery/RecoveryHero.tsx` and `mobile/src/components/recovery/RecoveryInfoSheet.tsx`.
- Modify: `mobile/src/navigation/RootNavigator.tsx`. Add `Recovery: { date?: string } | undefined;` to
  `RootStackParamList` after `ScoreDetail`, and add
  `<Stack.Screen name="Recovery" component={RecoveryScreen} options={{ headerShown: false }} />` after the
  ScoreDetail screen.
- Test: `mobile/__tests__/screens/RecoveryScreen.test.tsx`. This file grows in Tasks 7–9.

**Interfaces:**
- Consumes: `useRecoveryPage` and all copy (Task 3), `WeatherIcon` (Task 4) and `AskCoachBar` (Task 5).
- Produces: the `RecoveryScreen` scroll container. It renders, in order: header, hero, summary, and then the slots
  `{sections}` that later tasks fill. The testIDs are `recovery-loading`, `recovery-error`, `recovery-hero`,
  `recovery-summary`, `recovery-back` and `recovery-info`. Tasks 7–9 add their components inside the `ScrollView`
  after `recovery-summary`, in spec order.

- [ ] **Step 1: Write the failing tests.** The harness mocks `../../src/api/recovery` and `../../src/api/coach` (as
  `ScoreDetailCoachEntry.test.tsx` does), plus `@react-navigation/native` with `useRoute`, `useNavigation` (`navigate`,
  `push`, `goBack`, `setOptions`, `replace`, `addListener: () => () => {}`) and `useFocusEffect`. It also mocks
  `../../src/sync/SyncProvider`.
  1. Build the fixture with `makePage(over: Partial<RecoveryPageDTO>)`. The default is a READY page for `2026-10-08`:
     score 68, previous 62 on 10-07, factors HRV +8 and SLEEP_DEBT −5, `isToday: true`, `updatedAt`
     `2026-10-08T07:12:00`, outlook of 7 days, streak 2/5, an October month, `firstScoredDate` `2026-08-01`,
     `sleepDebt` 190 / usual 75–125 / goal 480 / nightsToClear 2, a lastNight with stages, and a READY `tomorrow`.
     Export `makePage` from `__tests__/fixtures/recoveryPage.ts` so later tasks reuse it.
  2. Test cases:
     - loading shows `recovery-loading` with the header present;
     - error shows "Couldn't load your recovery.", and "Try again" calls `fetchRecoveryPage` again;
     - a 400 error shows "That day hasn't happened yet.";
     - READY: the hero shows "68", "Mostly clear", "Good" and " · +6 vs yesterday · High confidence", and the summary
       is "A warm front in your HRV is lifting you today. Sleep-debt fog lingers; an early night clears it.";
     - the hero accessibility label is "Recovery 68, Good, mostly clear. · +6 vs yesterday · High confidence". The
       spec's spoken form is approximate; assert whatever `RECOVERY_COPY.heroA11y` produces;
     - the header subtitle matches `/Thu 8 Oct · updated/`;
     - Back calls `goBack`;
     - the info button opens the sheet, which shows "weighted 45 / 35 / 20" and the four band lines;
     - BUILDING (state, score.score null, coldStart HRV 9/14) shows "Day 9 of 14" and "Learning your weather", with the
       building summary;
     - NO_DATA today shows "No reading" and "Waiting for last night's data", and there is no `recovery-summary`;
     - LOW confidence: the line ends "Low confidence", and the summary has the rough-read sentence;
     - past day (`isToday: false`, route param date): the header shows "Fri 2 Oct" with no "updated", and the summary
       is in the past tense;
     - the Ask bar label is "Ask Mochi about today" (or the mocked character's name) and becomes "…about this day" on
       a past day. A press navigates to `Tabs` → Coach with `prefill` "Why is my recovery where it is today?";
     - the Ask bar is hidden when the coach status is disabled.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.** The layout comes from spec §2.1 and §3.1–3.3: 16 px gutter, 14 px gap between sections,
  the board's top padding under the safe area, and `paddingBottom` 120 with the Ask bar or 32 without.

```tsx
// mobile/src/components/recovery/RecoveryHeader.tsx
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { Button } from '../ui/button';
import { PageTitle } from '../ui/page-title';
import { Text } from '../ui/text';
import { RECOVERY_COPY } from '../../lib/recoveryCopy';

export function RecoveryHeader({ subtitle, onBack, onInfo }: { subtitle: string | null; onBack: () => void; onInfo: (() => void) | null }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <View className="flex-row items-center gap-2" style={{ marginHorizontal: -4 }}>
      <Button testID="recovery-back" variant="outline" size="icon-lg" accessibilityLabel={RECOVERY_COPY.back} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color={colors.foreground} />
      </Button>
      <View className="flex-1 items-center">
        <PageTitle>{RECOVERY_COPY.title}</PageTitle>
        {subtitle ? <Text testID="recovery-subtitle" className="text-caption text-muted-foreground">{subtitle}</Text> : null}
      </View>
      {onInfo ? (
        <Button testID="recovery-info" variant="outline" size="icon-lg" accessibilityLabel={RECOVERY_COPY.info} onPress={onInfo}>
          <Ionicons name="information-circle-outline" size={18} color={colors.foreground} />
        </Button>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}
```

```tsx
// mobile/src/components/recovery/RecoveryHero.tsx
import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';
import { WeatherIcon } from './WeatherIcon';
import { pickColdStartProgress, scoreBand } from '../../lib/scoreInsights';
import { buildingCopy, heroLine, noDataLine, RECOVERY_COPY, VERDICT, weatherFor } from '../../lib/recoveryCopy';

export function RecoveryHero({ page }: { page: RecoveryPageDTO }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const s = page.score?.score ?? null;
  const kind = weatherFor(s, page.state, page.bands);
  const cold = page.score ? pickColdStartProgress(page.score.coldStart) : null;

  let numeral = '—';
  let numeralClass = 'text-score';
  let band: string | null = null;
  let bandColor = colors.muted;
  let rest = '';
  let lowConfidence = false;
  if (page.state === 'READY' && s !== null && page.score) {
    numeral = String(Math.round(s));
    const line = heroLine({ score: s, bands: page.bands, date: page.date, previous: page.previous, confidence: page.score.confidenceLevel });
    band = line.band;
    bandColor = colors[scoreBand(s, page.bands)];
    rest = line.rest;
    lowConfidence = page.score.confidenceLevel === 'LOW';
  } else if (page.state === 'BUILDING' && cold) {
    const b = buildingCopy(cold);
    numeral = b.numeral;
    numeralClass = 'text-number';
    rest = b.line;
  } else {
    rest = noDataLine(page.isToday);
  }

  const label = band && s !== null ? RECOVERY_COPY.heroA11y(s, band, VERDICT[kind], rest) : `${VERDICT[kind]}. ${rest}`;
  return (
    <View testID="recovery-hero" accessible accessibilityLabel={label} className="items-center" style={{ paddingTop: 10 }}>
      <WeatherIcon kind={kind} variant="hero" testID="recovery-hero-art" />
      <Text className={`${numeralClass} mt-1.5`}>{numeral}</Text>
      <Text className="text-display font-semibold">{VERDICT[kind]}</Text>
      <Text className="mt-1 text-caption text-muted-foreground text-center">
        {band ? <Text className="text-caption" style={{ color: bandColor }}>{band}</Text> : null}
        {lowConfidence ? rest.replace(/ · Low confidence$/, ' · ') : rest}
        {lowConfidence ? <Text className="text-caption" style={{ color: colors.scoreFair }}>Low confidence</Text> : null}
      </Text>
    </View>
  );
}
```

  The `RecoveryInfoSheet` is a `<Sheet visible onClose testID="recovery-info-sheet">` containing a `text-heading` title
  and these `text-body` paragraphs:
  1. `SCORE_FRAMING`;
  2. `RECOVERY_COPY.infoHow(page.weights)`;
  3. one `buildBaselineSentence(b)` per `page.baselines`;
  4. `RECOVERY_COPY.infoBands(page.bands)`, one line each, prefixed by a small `WeatherIcon` (size 22) for clear,
     mostlyClear, cloudy and stormy.

  `RecoveryScreen` is laid out as follows.

```tsx
// mobile/src/screens/RecoveryScreen.tsx (skeleton; Tasks 7–9 add sections where marked)
export function RecoveryScreen() {
  const navigation = useNavigation<any>();
  const date = useRoute<RouteProp<RootStackParamList, 'Recovery'>>().params?.date;
  const insets = useContext(SafeAreaInsetsContext);
  const { state, page, errorKind, reload, month, loadMonth } = useRecoveryPage(date);
  const [info, setInfo] = useState(false);
  const { status: coachStatus } = useCoachStatus(navigation);
  const coachRoute = coachEntryRoute(coachStatus);
  const focused = useScreenFocused();
  const { characterId } = useCharacter();
  const coachName = characterInfo(characterId).name;

  const header = (
    <RecoveryHeader
      subtitle={page ? headerSubtitle(page.date, page.updatedAt, page.isToday) : null}
      onBack={() => navigation.goBack()}
      onInfo={page ? () => setInfo(true) : null}
    />
  );
  const pad = { paddingTop: (insets?.top ?? 0) + 8, paddingHorizontal: 16 };

  if (state === 'loading' || (state === 'ready' && !page)) {
    return (
      <View className="flex-1 bg-background" style={pad}>
        {header}
        <View testID="recovery-loading" className="items-center gap-3.5 pt-4">
          <Skeleton className="h-[220px] w-[150px] rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </View>
      </View>
    );
  }
  if (state === 'error' || !page) {
    return (
      <View className="flex-1 bg-background" style={pad}>
        {header}
        <View testID="recovery-error" className="flex-1 items-center justify-center gap-3">
          <Text className="text-center text-body text-muted-foreground">{errorKind === 'future' ? RECOVERY_COPY.futureError : RECOVERY_COPY.loadError}</Text>
          {errorKind === 'future' ? null : <Button variant="outline" onPress={reload}>{RECOVERY_COPY.tryAgain}</Button>}
        </View>
      </View>
    );
  }

  const past = !page.isToday;
  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ ...pad, gap: 14, paddingBottom: coachRoute ? 120 : 32 }}>
        {header}
        <RecoveryHero page={page} />
        {page.state === 'READY' && page.score ? (
          <Card testID="recovery-summary"><Text className="text-body">{buildRecoverySummary(page.score, past)}</Text></Card>
        ) : page.state === 'BUILDING' && page.score && pickColdStartProgress(page.score.coldStart) ? (
          <Card testID="recovery-summary"><Text className="text-body">{buildingCopy(pickColdStartProgress(page.score.coldStart)!).summary}</Text></Card>
        ) : null}
        {/* Task 7: <LastSevenDays/> and the bento. Task 8: <RecoveryCalendar/>. Task 9: <TomorrowForecastCard/>. */}
      </ScrollView>
      {coachRoute ? (
        <AskCoachBar
          label={past ? RECOVERY_COPY.askPast(coachName) : RECOVERY_COPY.askToday(coachName)}
          focused={focused}
          onPress={() => navigateToCoachEntry(navigation, coachRoute, recoveryQuestion({ state: page.state, isToday: page.isToday, date: page.date }))}
        />
      ) : null}
      <RecoveryInfoSheet visible={info} onClose={() => setInfo(false)} page={page} />
    </View>
  );
}
```

  Import paths follow `ScoreDetailScreen.tsx` and `SleepNightScreen.tsx`: `useCharacter` from
  `../characters/CharacterContext` and `characterInfo` from `../components/characters/registry`. If `Card` adds its own
  padding, keep it; that is the board's 14 × 16. Every text size used here is an A4 token. Run the typography guard
  after writing.

- [ ] **Step 4: Run the tests and confirm they pass:**
  `__tests__/screens/RecoveryScreen.test.tsx __tests__/conventions`. Then run the typecheck; the count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/screens/RecoveryScreen.tsx mobile/src/components/recovery mobile/src/navigation/RootNavigator.tsx mobile/__tests__/screens/RecoveryScreen.test.tsx mobile/__tests__/fixtures/recoveryPage.ts
git commit -m "feat(mobile): Recovery page with header, info sheet, weather hero and summary"
```

---

### Task 7: Last 7 days and the sleep-and-streak bento

**Files:**
- Create: `mobile/src/components/recovery/LastSevenDays.tsx`, `SleepDebtTile.tsx`, `LastNightTile.tsx` and
  `StreakTile.tsx`, all in `components/recovery/`.
- Modify: `mobile/src/screens/RecoveryScreen.tsx`. Render after the summary:
  `<LastSevenDays page={page} onOpenDay={(d) => navigation.push('Recovery', { date: d })} />`, then
  `<SectionLabel>` "Sleep and streak", then a `View` holding the wide `SleepDebtTile`, and below it a `flex-row gap-[10px]`
  holding `LastNightTile` and `StreakTile`, each `flex-1`.
- Modify: `mobile/__tests__/conventions/buttons.test.ts`. Add two entries under "Cards and tiles that navigate":
  - `{ file: 'components/recovery/LastSevenDays.tsx', key: 'recovery-day-${day.date}', count: 1, reason: 'a day column in the Last 7 days strip that opens that day' }`
  - `{ file: 'components/recovery/LastNightTile.tsx', key: 'recovery-last-night', count: 1, reason: 'the Last night tile that opens the night' }`
- Test: append to `mobile/__tests__/screens/RecoveryScreen.test.tsx`.

**Interfaces:**
- Consumes: `RecoveryPageDTO` fields `outlook`, `sleepDebt`, `lastNight`, `streak` and `score.factors` (for the debt
  word and points); `debtBlocks`, `debtClearCopy`, `formatMinutes` and `RECOVERY_COPY`; `STAGE_TOKEN` from
  `components/sleep/StageStrip.tsx`; and `openNight` (Task 5).

- [ ] **Step 1: Write the failing tests** (appended):
  - **The strip:**
    - 7 columns; the last reads "Today" (or "Thu" on a past day);
    - a null day shows "—";
    - each column's accessibility label is `RECOVERY_COPY.cellLabel`;
    - a press of `recovery-day-2026-10-05` calls `push('Recovery', { date: '2026-10-05' })`.
  - **The debt tile:**
    - shows "Sleep debt · 14 nights", "Fog · −5", "3h 10m", "owed · usual under 2h 05m" and "Each block is 30 min.
      Two nights at your 8h goal clear the fog.";
    - renders `debtBlocks(190, 125)` testIDs `debt-block-0…7`, where block 6 is `partial` (190 − 180 = 10 ≥ 10) and
      block 7 is empty;
    - with `sleepDebt: null`, shows "No sleep data in the last 14 nights";
    - with `usualHighMinutes: null`, shows "owed" with no clear copy;
    - with a 2000-minute debt, renders exactly 16 blocks.
  - **The Last night tile:**
    - shows "6h 48m" and "Deep 1h 22m · REM 1h 31m";
    - a press calls `navigate('SleepNight', { date: '2026-10-08' })`, going through `openNight`;
    - with `stages: null`, shows "No stage data" and one solid bar `last-night-bar-solid`;
    - with `lastNight: null`, shows "No sleep recorded" and "—", and `recovery-last-night` is absent (the tile is not
      pressable).
  - **The streak:**
    - shows "2", "days" and "Good or better · best run 5", with four band squares `streak-square-0..3` taken from the
      last 4 outlook days;
    - `current: 1` shows "day";
    - with no history (`best: 0`, all outlook nulls), shows "Good or better days in a row".
  - **Guards:** `__tests__/conventions/buttons.test.ts` passes with the new entries.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.** This follows spec §3.5 and §3.6 exactly, with these specifics:
  - **Outlook column:**
    - `PressableScale testID={`recovery-day-${day.date}`} accessibilityRole="button" accessibilityLabel={RECOVERY_COPY.cellLabel(day.date, day.score, day.score === null ? null : BAND_WORD[scoreBand(day.score, page.bands)])}`;
    - the weekday is `text-fine` muted; the last column is `RECOVERY_COPY.today` (semibold) when `page.isToday`;
    - `WeatherIcon variant="small" size={22}` uses `kind={day.score === null ? 'none' : weatherFor(day.score, 'READY', page.bands)}`
      and `dim={day.score === null}`;
    - the score is `text-caption font-semibold`, with Low scores in `colors.scorePoor` (as on the board);
    - the last column gets `bg-muted rounded-lg` (8 px).
  - **Debt tile:**
    - the SLEEP_DEBT factor is `page.score?.factors.find(f => f.factor === 'SLEEP_DEBT')`;
    - the word and points read `${RECOVERY_COPY.debtWord(points)} · ${signed whole points}`, with the points as
      `Math.round` using a real minus, coloured `colors.scorePoor` when points ≤ −0.5, `colors.scoreGood` when ≥ 0.5,
      else muted;
    - it is hidden when the factor is missing or excluded;
    - each block is a `View` of height 16 with `borderRadius: 3` and `flex: 1`, in a `flex-row gap-1`. A full block is
      filled with the drag colour (`colors.scorePoor`) when `minutes > (usualHighMinutes ?? Infinity)`, else
      `colors.muted`. A partial block uses the same colour at `opacity: 0.45`. An empty block uses `bg-muted`. The
      testIDs are `debt-block-${i}` and `accessibilityElementsHidden`.
  - **Last night tile:**
    - the duration uses `formatMinutes(minutesAsleep)` in `text-display`;
    - the 8 px stage bar has segments in Deep, REM, Light, Awake order, each `flex: minutes`, coloured
      `colors[STAGE_TOKEN[type]]`;
    - the whole tile is `PressableScale testID="recovery-last-night" accessibilityRole="button"` with the label
      "Last night, 6h 48m. Opens the night." and `onPress={() => openNight(navigation, lastNight.date)}`;
    - with no night it is a plain `Card` with no pressable.
  - **Streak tile:** a 14 px square with radius 4, coloured `colors[scoreBand(score)]`, or `bg-muted` for null.

- [ ] **Step 4: Run the tests and confirm they pass,** including `__tests__/conventions`. Then run the typecheck; the
  count must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/recovery mobile/src/screens/RecoveryScreen.tsx mobile/__tests__/screens/RecoveryScreen.test.tsx mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): Recovery last 7 days strip and sleep-and-streak bento"
```

---

### Task 8: Month calendar with paging

**Files:**
- Create: `mobile/src/components/recovery/RecoveryCalendar.tsx` and `mobile/src/lib/calendarGrid.ts`.
- Modify: `RecoveryScreen.tsx`. Add a `const [viewMonth, setViewMonth] = useState<string | null>(null)` state that
  defaults to `page.month.month`. Render
  `<RecoveryCalendar page={page} viewMonth={viewMonth ?? page.month.month} load={month(viewMonth ?? page.month.month)} onPage={(m) => { setViewMonth(m); loadMonth(m); }} onRetry={(m) => loadMonth(m)} onOpenDay={(d) => navigation.push('Recovery', { date: d })} today={todayOf(page)} />`.
  `todayOf(page)` is `page.isToday ? page.date : the device-local civil date`. The month cache keeps any month already
  loaded.
- Modify: `buttons.test.ts`. Add
  `{ file: 'components/recovery/RecoveryCalendar.tsx', key: 'recovery-cal-${cell.date}', count: 1, reason: 'a calendar day that opens that day' }`.
- Test: `mobile/__tests__/lib/calendarGrid.test.ts` and append to `RecoveryScreen.test.tsx`.

**Interfaces:**
- Produces `monthCells(month: string): Array<{ date: string | null }>`. It is Monday-first, with leading nulls, and
  has no trailing padding.

- [ ] **Step 1: Write the failing tests.**

```ts
import { monthCells } from '../../src/lib/calendarGrid';
describe('monthCells', () => {
  it('is Monday-first with leading blanks', () => {
    const c = monthCells('2026-10'); // 1 Oct 2026 is a Thursday
    expect(c.slice(0, 4)).toEqual([{ date: null }, { date: null }, { date: null }, { date: '2026-10-01' }]);
    expect(c.filter((x) => x.date).length).toBe(31);
  });
  it('a month starting on Monday has no blanks; February in a leap year has 29 days', () => {
    expect(monthCells('2026-06')[0]).toEqual({ date: '2026-06-01' });
    expect(monthCells('2028-02').filter((x) => x.date).length).toBe(29);
  });
});
```

  Append these screen tests:
  - The title is "October", with "64.0"-style average text (`Math.round(average)` in `text-number`, so assert "64")
    and the caption "month average · 1 Excellent, 1 Low".
  - A scored cell `recovery-cal-2026-10-03` shows its score and is labelled "Saturday 3 October, 61, Good". Pressing
    it calls `push('Recovery', { date: '2026-10-03' })`.
  - A future cell (`2026-10-20` while today is `2026-10-08`) is not pressable (no testID `recovery-cal-2026-10-20`) and
    renders its date number.
  - A past day with no row is pressable (it opens the no-data state).
  - The viewed day D has `testID="recovery-cal-selected"` on its ring.
  - "Next month" is disabled at the current month. "Previous month" calls `fetchRecoveryMonth('2026-09')` and shows a
    skeleton (`recovery-cal-loading`) until it resolves, then "September".
  - Prev is disabled at `firstScoredDate`'s month: with `firstScoredDate: '2026-10-02'`, Prev is disabled.
  - Paging back from January 2026 asks for `2025-12`, and the title reads "December 2025".
  - A month fetch error shows "Couldn't load September." and a "Retry" button that refetches.
  - An empty month shows no average and all muted cells.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement** spec §3.7.

```ts
// mobile/src/lib/calendarGrid.ts
export function monthCells(month: string): Array<{ date: string | null }> {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y!, m! - 1, 1);
  const days = new Date(y!, m!, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  return [
    ...Array.from({ length: lead }, () => ({ date: null })),
    ...Array.from({ length: days }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}` })),
  ];
}
```

  The calendar is laid out as follows:
  - **Header row:**
    - `SectionLabel` holding `monthTitle(viewMonth, today)`;
    - on the right, two `Button variant="ghost" size="icon-sm"` with `accessibilityLabel` set to
      `RECOVERY_COPY.prevMonth` / `nextMonth` and `hitSlop={6}`, which brings 32 px up to 44;
    - Prev is `disabled` when `!page.firstScoredDate || viewMonth <= page.firstScoredDate.slice(0, 7)`;
    - Next is `disabled` when `viewMonth >= today.slice(0, 7)`;
    - `onPage(shiftMonth(viewMonth, ±1))`.
  - **Average row:** `text-number` `Math.round(average)` plus a `text-caption` `monthCaption(counts)`. Without an
    average, only the hint shows.
  - **Weekday header:** `RECOVERY_COPY.weekdayHeader` in `text-fine` muted.
  - **Grid:** `flex-row flex-wrap`. Each cell is `width: '14.2857%'` with a 38 px tall inner box at `rounded-lg`
    (8 px).
    - **Scored cell:** in dark mode the fill is `colors[scoreBand(score)]` and the ink is `rgb(10, 11, 14)`, taken from
      `COLORS.dark.background`. In light mode the fill is `withAlpha(colors[band], 0.22)` and the ink is
      `colors.foreground`.
    - **Text:** `text-fine font-semibold tabular-nums`, `numberOfLines={1}`.
    - **Selected day D:** a wrapper `View testID="recovery-cal-selected"` with `borderWidth: 2`,
      `borderColor: colors.foreground`, `padding: 2` and `borderRadius: 10`.
    - **Today, when D ≠ today:** the date number is bold.
    - **Day with no score, or a future day:** `bg-muted`, muted date number.
    - **Leading blanks:** an empty `View`.
    - **Pressable cells:** past or today, with a score or no row. These use
      `PressableScale testID={`recovery-cal-${cell.date}`} accessibilityRole="button"` and the label `cellLabel`. Future
      cells are plain `View`s with `accessible={false}`.
  - **Legend:** four 8 px dots plus the band words, then `RECOVERY_COPY.calendarHint` in `text-fine`.
  - **Loading:** with `load.status === 'loading'` and no data, a `View testID="recovery-cal-loading"` of 35
    `Skeleton`s.
  - **Error:** `load.status === 'error'` shows `RECOVERY_COPY.monthError(monthTitle(...))` and a
    `Button variant="ghost" size="sm"` "Retry".

- [ ] **Step 4: Run the tests and confirm they pass,** including the conventions. Then run the typecheck; the count
  must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/lib/calendarGrid.ts mobile/src/components/recovery/RecoveryCalendar.tsx mobile/src/screens/RecoveryScreen.tsx mobile/__tests__/lib/calendarGrid.test.ts mobile/__tests__/screens/RecoveryScreen.test.tsx mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): Recovery month calendar with paging"
```

---

### Task 9: Tomorrow's forecast card

**Files:**
- Create: `mobile/src/components/recovery/TomorrowForecastCard.tsx`.
- Modify: `RecoveryScreen.tsx`. After the calendar, render
  `{page.isToday && page.tomorrow ? <TomorrowForecastCard tomorrow={page.tomorrow} bands={page.bands} goalMinutes={page.sleepDebt?.goalMinutes} onMoreLevers={() => navigation.navigate('Forecast')} /> : null}`.
- Test: append to `RecoveryScreen.test.tsx`.

**Interfaces:**
- Consumes `RecoveryTomorrowDTO`, `initialChip`, `FORECAST_COPY` (with the Task 3 additions), `weatherFor` and
  `WeatherIcon`.

- [ ] **Step 1: Write the failing tests** (appended):
  - **READY with goal 480:**
    - the 8h chip is selected (`accessibilityState.checked`);
    - the range shows "70–78" (from the chip's `band`, rounded) with "if you sleep 8h tonight";
    - the track record reads "right 9 of last 12".
  - **Pressing chip 6h:** the 6h chip becomes checked, and the range and caption update with no new fetch.
  - **Chip labels:** each reads "6 hours, predicted 61".
  - **Track record hidden:** with `days: 4`, it is not shown.
  - **"More levers":** calls `navigate('Forecast')`.
  - **Other states:**
    - `NOT_ENOUGH_DATA / NO_HISTORY` with `daysOfHistory: 9` shows "Forecast unlocks after 21 days of data (9/21)", and
      there are no chips and no "More levers";
    - `LOW_CONFIDENCE_TODAY` shows `FORECAST_COPY.lowConfidence`;
    - `UNAVAILABLE` shows `FORECAST_COPY.unavailable`.
  - **Past day:** there is no card (no `recovery-tomorrow`).

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement** spec §3.8.
  - The card is `Card testID="recovery-tomorrow"`.
  - The header row is `SectionLabel` `FORECAST_COPY.title`-style text. Use `RECOVERY_COPY.tomorrow` for the eyebrow.
    The right-hand `text-fine` shows `FORECAST_COPY.rightOfLast(hits, days)` when `days >= 5`.
  - The row is a `WeatherIcon variant="small" size={44}` whose kind comes from the selected chip's score through
    `weatherFor(score, 'READY', bands)`, then `text-number` `${Math.round(lo)}–${Math.round(hi)}`, then `text-caption`
    `FORECAST_COPY.ifYouSleep(h)`.
  - The chips sit in a `View accessibilityRole="radiogroup" accessibilityLabel={FORECAST_COPY.sleepTonight}`, laid out
    `flex-row gap-2`. Each chip is
    `Pressable testID={`recovery-chip-${h}`} accessibilityRole="radio" accessibilityState={{ checked }} accessibilityLabel={FORECAST_COPY.chipLabel(h, score)}`,
    `flex-1 rounded-lg border`. A selected chip uses the default look (`bg-primary`, `text-primary-foreground`); an
    unselected chip uses the outline look (`border-border`). The hour is `text-caption` and the score is
    `text-headline`. Local state starts at `useState(initialChip(goalMinutes))`.
  - Last comes `Button variant="outline" className="w-full"` holding `FORECAST_COPY.moreLevers`.
  - The other statuses render only the eyebrow and the one message.

- [ ] **Step 4: Run the tests and confirm they pass,** including the conventions. Then run the typecheck; the count
  must still be 12.

- [ ] **Step 5: Commit.**

```bash
git add mobile/src/components/recovery/TomorrowForecastCard.tsx mobile/src/screens/RecoveryScreen.tsx mobile/__tests__/screens/RecoveryScreen.test.tsx
git commit -m "feat(mobile): Recovery tomorrow forecast card with sleep chips"
```

---

### Task 10: Entry points open Recovery; ScoreDetail RECOVERY redirects

**Files:**
- Modify: `mobile/src/screens/DashboardScreen.tsx:272`, to
  `onPress={(score) => navigation.navigate('Recovery', { date: score.date })}`.
- Modify: `mobile/src/components/home/recovery-hero.tsx`:
  - `:69` becomes `accessibilityHint="Opens your Recovery page"`;
  - `:101` becomes the text "Open Recovery" (the chevron stays). Move that string to `RECOVERY_COPY.openFromHome` =
    'Open Recovery' and import it.
- Modify: `mobile/src/components/activity/UsualTiles.tsx:28`, to
  `navigation.navigate('Recovery', tile.latestDate ? { date: tile.latestDate } : undefined)`.
- Modify: `mobile/src/lib/coachAnswers.ts:59-75`:
  - add `| { name: 'Recovery'; params: { date?: string } | undefined }` to `CardDestination`;
  - case `'recovery'` returns `{ name: 'Recovery', params: date ? { date } : undefined }`;
  - SLEEP stays as it is.
- Modify: `mobile/src/screens/ScoreDetailScreen.tsx`. At the top of the component, after reading `type`, add the
  effect below. While a redirect is pending, render `null` instead of fetching. Guard the fetch effect with
  `if (type !== 'SLEEP') return;`.

```tsx
  useEffect(() => {
    if (type !== 'SLEEP') navigation.replace('Recovery', { date });
  }, [navigation, type, date]);
```

- Tests:
  - Update `__tests__/screens/DashboardScreen.test.tsx`, `__tests__/components/UsualTiles.test.tsx` and the
    coachAnswers test (`grep -rl cardDestination mobile/__tests__`) to expect `Recovery`.
  - Migrate the RECOVERY cases in `ScoreDetailScreen.test.tsx`, `ScoreDetailRedesign.test.tsx`, `ScoreBands.test.tsx`
    and `ScoreDetailCoachEntry.test.tsx`. Each RECOVERY-parameterised test either switches its params to
    `type: 'SLEEP'` with a SLEEP fixture, where the behaviour it pins is generic (ring, bands, loading, error, empty,
    the coach entry), or is deleted where `RecoveryScreen.test.tsx` already pins the Recovery equivalent. List every
    deleted test name, with the RecoveryScreen test that replaces it, in the commit body.
  - Add tests:
    - `ScoreDetailScreen` with `{ date, type: 'RECOVERY' }` and with no type calls
      `replace('Recovery', { date })` and never calls `fetchScoreDetail`;
    - with `type: 'SLEEP'` there is no replace;
    - `cardDestination` for area `recovery` with a date and without one.
  - Add `replace: mockReplace` to these tests' `useNavigation` mocks.

- [ ] **Step 1: Write and update the failing tests** as listed.
- [ ] **Step 2: Run the tests and confirm they fail:**
  `__tests__/screens/ScoreDetail* __tests__/screens/ScoreBands.test.tsx __tests__/screens/Dashboard* __tests__/components/UsualTiles.test.tsx` and the coachAnswers test.
- [ ] **Step 3: Implement** the edits above. In `CoachScreen.tsx:317`, confirm that the destination is navigated with
  `navigation.navigate(target.name, target.params)`. The new variant needs no change there; if the code switches on
  the name, add the `Recovery` case.
- [ ] **Step 4: Run the full mobile suite** with `node node_modules/.bin/jest --forceExit`. Expected: all green except
  known flakes, each rerun alone. Then run the typecheck; the count must still be 12.
- [ ] **Step 5: Commit.**

```bash
git add -A mobile/src mobile/__tests__
git commit -m "feat(mobile): Home, Activity and coach open the Recovery page; ScoreDetail RECOVERY redirects"
```

---

### Task 11: Whole-branch verification and walkthrough (controller)

- [ ] **Step 1:** Run the full backend suite through `backend-jest.sh` (no path argument) and backend `tsc --noEmit`.
  Run the full mobile suite and the mobile typecheck; the count must be 12. Record the results in the ledger.
- [ ] **Step 2:** Run the final whole-branch review on opus with
  `review-package docs/superpowers/plans/2026-10-09-recovery-page.md 736cc88 HEAD`, then one fix wave.
- [ ] **Step 3:** Update the run folder, following handoff §1:
  1. back up the dev DB with `pg_dump -Fc` (only when `DATABASE_URL` is local);
  2. rsync the backend; no migration is needed, since there is no schema change;
  3. run `npm install`, `prisma generate` and `npm run build`, then restart :3000;
  4. sync mobile (`git archive` piped to `tar` then rsync), restart Metro with `--clear`, and relaunch the app.
- [ ] **Step 4:** Walk through on the simulator, capturing screenshots:
  - Home hero, then Recovery today;
  - the info sheet;
  - a tap on a past day in the strip, which pushes that day; back returns;
  - calendar Prev and Next;
  - Last night, which opens SleepNight;
  - "More levers", which opens Forecast;
  - Ask Axo.
  Repeat in light mode, and at the largest text size, checking the pixel title and that calendar cells do not wrap.
  Also do the PR #58 quick check (handoff §8): pixel titles at large text, the Chats notes row, Coach Today bars, and
  the Campfire unchanged.
- [ ] **Step 5:** Confirm that the ledger records the Task 4b art approval; if not, stop and ask the owner. Then open
  a draft PR from `feature/recovery-page` with no attribution footer, linking the spec and the plan. Merge only when the owner says "merge".
