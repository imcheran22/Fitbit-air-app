# Recovery Forecast & What-If Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forecast tomorrow's Recovery Score with a confidence band, a
self-backtested track record, and instant what-if sliders (sleep and habits),
plus a seeded demo account that shows it off.

**Architecture:** A pure backend engine (`backend/src/forecast/`) predicts
tomorrow's HRV/RHR z-scores (per-user carry-over plus CONFIRMED lag-1 habit
effects), recomputes SLEEP_DEBT exactly from a planned night, and scores the
result through the unchanged `computeComposite`. `GET /me/forecast` returns a
precomputed grid of every slider combination, so the mobile `ForecastScreen`
does local lookups while dragging. A seed script writes only raw synthetic
inputs and runs the real scoring and habit pipelines.

**Tech Stack:** Express 5 + TypeScript + Prisma/Postgres + Jest/ts-jest +
supertest (backend); Expo 57 / React Native 0.86 + Reanimated 4 +
react-native-gesture-handler + expo-haptics + react-native-svg + NativeWind +
jest-expo (mobile).

**Spec:** `docs/superpowers/specs/2026-09-28-recovery-forecast-design.md`

## Global Constraints

- Every number on screen is produced by the real scoring code: the forecast score must come from `computeComposite(inputs, getLiveConfig())`, never a re-implemented formula.
- Habit effects are used only for `HabitCorrelation` rows with `status = 'CONFIRMED'`, `lagDays = 1`, `factor ∈ {HRV, RHR}`.
- Exposure is binary at the habit type's `exposureThreshold`. No dose-response.
- Carry-over: `φ₀ = 0.5`, shrink weight `n / (n + 30)`, clamp `[0, 0.9]`, window `ANALYSIS_WINDOW_DAYS` (120).
- Gates: `NO_HISTORY` below 21 scored days; `LOW_CONFIDENCE_TODAY` when today's Recovery Score is missing, null or LOW.
- Track record: the last 30 days; band = P10/P90 of errors with ≥ 10 pairs, otherwise ± 1.5 × MAD-σ.
- Sleep grid: 4.0–10.0 h in 0.5 h steps; at most 4 habits in the grid.
- Copy (verbatim): "No measurable effect for you yet", "An estimate from your own history — not medical advice.", "Within ±X on N of the last M days", "Forecast unlocks after 21 days of data".
- Scripts run with `npx ts-node scripts/<name>.ts` and guard `main()` with `require.main === module`.
- Both apps use npm. Backend tests: `cd backend && npm test -- <path>`. Mobile tests: `cd mobile && npx jest <path>`.
- Commit messages carry no Claude/AI attribution trailers. PR titles, bodies and comments never mention Claude or Claude Code and carry no generated-by footer or watermark.
- Backend layering: `routes.ts` is a thin controller; `load.ts` is the only forecast module that touches Prisma; everything else in `forecast/` is pure and synchronous. `forecast/` may import from `scoring/` and `habits/`, never the reverse. Demo seeding follows the same split: pure `generate.ts`, I/O in `account.ts`/`persist.ts`, orchestration in the script.
- Mobile layering: `api/` does I/O only; `lib/` holds pure logic, hooks and copy; `components/` render from props and never fetch; `screens/` compose hooks and components. User-facing forecast strings live only in `lib/forecastCopy.ts`.
- One responsibility per file; around 150 lines of implementation is the signal to split along a responsibility line.

## Review Focus

1. **User whose timezone is ahead of UTC** (e.g. `Pacific/Kiritimati`, UTC+14): "today" and the forecast date must be the user's local date, not the UTC date. Pinned in Task 6.
2. **Today's HRV missing** (factor excluded): a forecast is still produced from the remaining factors, contributions still sum to `score − 50`, and there is no NaN. Pinned in Task 3.
3. **A CONFIRMED correlation with no computable pairs in the window** (Δ is null): the lever is `NONE_YET`, and the grid has no NaN and no extra dimension. Pinned in Task 5.
4. **No sleep recorded in the last 14 nights**: the default sleep is 7.5 h, never NaN. Pinned in Task 5.
5. **A lever value between grid steps or outside the range** (e.g. sleep 11 h, 3.7 h): the client lookup still finds the nearest valid cell and never renders blank. Pinned in Task 9.

---

## File Structure

**Backend — create**
- `backend/src/forecast/config.ts`: constants and `leverRange`.
- `backend/src/forecast/types.ts`: `ForecastData`, `Lever`, `Model`, `Prediction`, `TrackPoint`.
- `backend/src/forecast/carryOver.ts`: `fitCarryOver`, `shrinkAndClamp`.
- `backend/src/forecast/habitEffects.ts`: `habitEffect`.
- `backend/src/forecast/sleepLever.ts`: `sleepDebtZ`.
- `backend/src/forecast/predict.ts`: `fitModel`, `predictDay`.
- `backend/src/forecast/backtest.ts`: `rollingBacktest`.
- `backend/src/forecast/band.ts`: `quantile`, `bandFor`, `errorSummary`.
- `backend/src/forecast/dto.ts`: `ForecastResponse` and the related types.
- `backend/src/forecast/levers.ts`: `buildLevers`, `buildDefaults` (slider definitions and starting values).
- `backend/src/forecast/engine.ts`: `buildForecast` (gates and the what-if grid; orchestrates the rest).
- `backend/src/forecast/load.ts`: `loadForecastData` (the only DB access).
- `backend/src/forecast/routes.ts`: `forecastRouter`.
- `backend/src/demo/generate.ts`: the pure synthetic-history generator.
- `backend/src/demo/account.ts`: `createDemoAccount` (replaces any existing account with that email; Better Auth user plus credential).
- `backend/src/demo/persist.ts`: `writeDemoHistory` (raw input rows only).
- `backend/scripts/seedDemoUser.ts`: the CLI plus `seedDemoUser()`, which orchestrates account → history → real pipelines.
- Tests: `backend/tests/forecast/{fixtures,carryOver,habitEffects,sleepLever,predict,backtest,engine,routes}.test.ts`, `backend/tests/demo/{generate,seedDemoUser}.test.ts`.

**Backend — modify**
- `backend/src/habits/engine.ts`: export `Pair` and `pairUp`. No behaviour change.
- `backend/src/app.ts`: mount `forecastRouter`.

**Mobile — create**
- `mobile/src/api/forecast.ts`: DTO types and `fetchForecast`.
- `mobile/src/lib/forecastGrid.ts`: `snapSleep`, `exposedFor`, `findCell`, `contributionLabel`.
- `mobile/src/lib/useForecast.ts`: the single hook that loads the forecast (used by the Dashboard and ForecastScreen).
- `mobile/src/lib/forecastCopy.ts`: every user-facing forecast string.
- `mobile/jest-mocks/forecastFixture.ts`: the shared `READY` test fixture.
- `mobile/src/components/ui/slider.tsx`: `Slider`, `snapValue`, `crossedThreshold`.
- `mobile/src/components/forecast/contribution-bars.tsx`: `ContributionBars`.
- `mobile/src/components/forecast/track-record-chart.tsx`: `TrackRecordChart`.
- `mobile/src/components/tomorrow-card.tsx`: `TomorrowCard`.
- `mobile/src/screens/ForecastScreen.tsx`.
- Tests: `mobile/__tests__/{api/forecast,lib/forecastGrid,lib/useForecast,components/Slider,components/TomorrowCard,screens/ForecastScreen}.test.ts(x)`.

**Mobile — modify**
- `mobile/package.json`: add `react-native-gesture-handler` and `expo-haptics`.
- `mobile/jest-setup.js`: add the gesture-handler jest setup and a haptics mock.
- `mobile/src/navigation/RootNavigator.tsx`: `GestureHandlerRootView` wrapper and the `Forecast` route.
- `mobile/src/screens/DashboardScreen.tsx`: load the forecast and render `TomorrowCard`.
- `mobile/__tests__/screens/DashboardScreen.test.tsx`: route `/me/forecast` in `mockApi`.

---

### Task 1: Forecast types, config and carry-over fit

**Files:**
- Modify: `backend/src/habits/engine.ts:101` (`interface Pair`) and `:120` (`function pairUp`)
- Create: `backend/src/forecast/config.ts`, `backend/src/forecast/types.ts`, `backend/src/forecast/carryOver.ts`
- Create test support: `backend/tests/forecast/fixtures.ts`
- Test: `backend/tests/forecast/carryOver.test.ts`

**Interfaces:**
- Consumes: `FactorSeries`, `FactorDay` (`habits/engine.ts`); `ObservedDay` (`habits/observed.ts`); `HabitTypeConfig`, `ANALYSIS_WINDOW_DAYS` (`habits/config.ts`); `shiftDate`, `dateRange` (`scoring/dates.ts`); `ScoreConfig`, `getLiveConfig` (`scoring/configs`); `DailyPoint`, `ConfidenceLevel` (`scoring/types.ts`); `seededRandom`, `gaussian` (`tests/habits/helpers.ts`).
- Produces:
  - `export type ForecastFactor = 'HRV' | 'RHR'`
  - `export interface ForecastData` (below)
  - `fitCarryOver(series: FactorSeries, through: string): number`
  - `shrinkAndClamp(slope: number, n: number): number`
  - `export function pairUp(...)` and `export interface Pair` from the habit engine
  - the test fixtures `TODAY`, `series()`, `makeData()`, `plant()`

- [ ] **Step 1: Export the habit engine's pairing helper**

In `backend/src/habits/engine.ts`, change `interface Pair {` to `export interface Pair {` and `function pairUp(` to `export function pairUp(`. Nothing else changes.

Run: `cd backend && npm test -- tests/habits/engine.test.ts`
Expected: PASS (no behaviour change).

- [ ] **Step 2: Create `backend/src/forecast/config.ts`**

```ts
// Forecast constants (spec 2026-09-28-recovery-forecast-design.md). Fixed, not
// fitted per user, for the same reason as habits/config.ts.
import type { HabitTypeConfig } from '../habits/config';

/** Carry-over prior and shrinkage: phi = w * slope + (1 - w) * PHI_PRIOR, w = n / (n + PHI_SHRINK_N). */
export const PHI_PRIOR = 0.5;
export const PHI_SHRINK_N = 30;
export const PHI_MIN = 0;
export const PHI_MAX = 0.9;

/** Scored days required before any forecast is shown. */
export const MIN_HISTORY_DAYS = 21;

/** Rolling-origin backtest length, and the pair count below which the band falls back to MAD. */
export const TRACK_DAYS = 30;
export const MIN_BAND_PAIRS = 10;
export const BAND_MAD_MULTIPLIER = 1.5;
/** MAD to sigma, as in the scoring config. */
export const MAD_TO_SIGMA = 1.4826;
/** Half-width used when there are too few errors (< 3) to estimate any spread. */
export const FALLBACK_HALF_WIDTH = 10;

export const SLEEP_MIN_HOURS = 4;
export const SLEEP_MAX_HOURS = 10;
export const SLEEP_STEP_HOURS = 0.5;
export const DEFAULT_SLEEP_HOURS = 7.5;
export const DEFAULT_SLEEP_WINDOW_DAYS = 14;

/** Habits beyond this many (ranked by |effect|) are reported NOT_MODELLED to bound the grid. */
export const MAX_GRID_HABITS = 4;

const LEVER_RANGES: Record<string, { max: number; step: number }> = {
  ALCOHOL: { max: 6, step: 1 },
  CAFFEINE: { max: 6, step: 1 },
  WORKOUT: { max: 120, step: 10 },
};

/** Slider range for a habit lever. Custom types get 0..max(3x threshold, 5). */
export function leverRange(t: HabitTypeConfig): { min: number; max: number; step: number } {
  const known = LEVER_RANGES[t.type];
  if (known) return { min: 0, ...known };
  return { min: 0, max: Math.max(t.exposureThreshold * 3, 5), step: t.exposureThreshold >= 10 ? 5 : 1 };
}
```

- [ ] **Step 3: Create `backend/src/forecast/types.ts`**

```ts
import type { FactorSeries } from '../habits/engine';
import type { ObservedDay } from '../habits/observed';
import type { HabitTypeConfig } from '../habits/config';
import type { ScoreConfig } from '../scoring/configs';
import type { ConfidenceLevel, DailyPoint } from '../scoring/types';

export type ForecastFactor = 'HRV' | 'RHR';
export const FORECAST_FACTORS: readonly ForecastFactor[] = ['HRV', 'RHR'];

export interface ActualScore {
  score: number | null;
  confidence: ConfidenceLevel;
}

/** Everything the pure engine needs. Built by load.ts; built by fixtures in tests. */
export interface ForecastData {
  /** The user's local civil date. The forecast target is today + 1. */
  today: string;
  cfg: ScoreConfig;
  sleepGoalMinutes: number;
  /** Nightly minutes asleep keyed by the local date the night ends (as scoring reads it). */
  sleep: DailyPoint[];
  /** Per-day z-scores from UserDailyFeatures (hrvZ / rhrZ with imputed flags). */
  factors: Record<ForecastFactor, FactorSeries>;
  /** Stored Recovery DailyScores by date. */
  scores: ReadonlyMap<string, ActualScore>;
  /** Built-ins first, then custom types by createdAt (listHabitTypes order). */
  habitTypes: HabitTypeConfig[];
  /** Observed habit days by habit type, exactly as the habit engine builds them. */
  observations: ReadonlyMap<string, ObservedDay[]>;
  /** CONFIRMED lag-1 rows against HRV/RHR. */
  confirmed: ReadonlyArray<{ habitType: string; factor: ForecastFactor }>;
  /** Sum of each habit's logged value on the current habit day. */
  todayHabitTotals: Record<string, number>;
}

export interface Lever {
  sleepMinutes: number;
  exposed: ReadonlySet<string>;
}

export interface Model {
  phi: Record<ForecastFactor, number>;
  /** habitType -> factor -> delta z (exposed mean minus unexposed mean, lag 1). */
  effects: Map<string, Partial<Record<ForecastFactor, number>>>;
}

export interface Contribution {
  key: string;
  points: number;
}

export interface Prediction {
  score: number;
  contributions: Contribution[];
}

export interface TrackPoint {
  date: string;
  forecast: number;
  actual: number;
}
```

- [ ] **Step 4: Create the test fixtures `backend/tests/forecast/fixtures.ts`**

```ts
import type { FactorSeries } from '../../src/habits/engine';
import type { ObservedDay } from '../../src/habits/observed';
import { BUILT_IN_HABIT_TYPES } from '../../src/habits/config';
import { getLiveConfig } from '../../src/scoring/configs';
import { dateRange, shiftDate } from '../../src/scoring/dates';
import type { ForecastData, ForecastFactor } from '../../src/forecast/types';
import { gaussian, seededRandom } from '../habits/helpers';

export const TODAY = '2026-06-30';

/** A factor series ending on `end`; `imputed` holds indexes into `values`. */
export function series(
  values: Array<number | null>,
  end = TODAY,
  imputed: ReadonlySet<number> = new Set(),
): Map<string, { z: number | null; imputed: boolean; pct: number | null }> {
  const start = shiftDate(end, -(values.length - 1));
  return new Map(values.map((z, i) => [shiftDate(start, i), { z, imputed: imputed.has(i), pct: null }]));
}

/** 60 days of AR(1) z-scores, ~7 h nights and HIGH-confidence scores ending on TODAY. */
export function makeData(over: Partial<ForecastData> = {}, days = 60, seed = 1): ForecastData {
  const rand = seededRandom(seed);
  const dates = dateRange(shiftDate(TODAY, -(days - 1)), TODAY);
  const hrv: number[] = [];
  const rhr: number[] = [];
  let h = 0;
  let r = 0;
  for (let i = 0; i < dates.length; i++) {
    h = 0.6 * h + 0.8 * gaussian(rand);
    r = 0.6 * r + 0.8 * gaussian(rand);
    hrv.push(h);
    rhr.push(r);
  }
  const sleep = dates.map((date) => ({ date, value: 420 + 40 * gaussian(rand) }));
  const scores = new Map(
    dates.map((date, i) => [date, { score: 50 + 8 * hrv[i]! - 6 * rhr[i]!, confidence: 'HIGH' as const }]),
  );
  return {
    today: TODAY,
    cfg: getLiveConfig(),
    sleepGoalMinutes: 480,
    sleep,
    factors: { HRV: series(hrv), RHR: series(rhr) },
    scores,
    habitTypes: [...BUILT_IN_HABIT_TYPES],
    observations: new Map(),
    confirmed: [],
    todayHabitTotals: {},
    ...over,
  };
}

/**
 * Plants a lag-1 effect: `habit` is exposed every `every`-th day (observed
 * every day), and the next day's `factor` z is shifted by `delta`. Adds the
 * CONFIRMED row.
 */
export function plant(data: ForecastData, habit: string, factor: ForecastFactor, delta: number, every = 4): ForecastData {
  const dates = [...data.factors[factor].keys()].sort();
  const shifted = new Map(data.factors[factor]) as Map<string, { z: number | null; imputed: boolean; pct: number | null }>;
  const obs: ObservedDay[] = [];
  dates.forEach((day, i) => {
    const exposed = i % every === 0;
    obs.push({ day, exposed });
    const next = shiftDate(day, 1);
    const f = shifted.get(next);
    if (exposed && f && f.z !== null) shifted.set(next, { ...f, z: f.z + delta });
  });
  const observations = new Map(data.observations);
  observations.set(habit, obs);
  return {
    ...data,
    factors: { ...data.factors, [factor]: shifted as FactorSeries },
    observations,
    confirmed: [...data.confirmed, { habitType: habit, factor }],
  };
}
```

- [ ] **Step 5: Write the failing carry-over tests `backend/tests/forecast/carryOver.test.ts`**

```ts
import { fitCarryOver, shrinkAndClamp } from '../../src/forecast/carryOver';
import { TODAY, series } from './fixtures';

/** z(d+1) = 0.8 z(d), starting from 1: an exact OLS slope of 0.8. */
const decay = (n: number) => Array.from({ length: n }, (_, i) => 0.8 ** i);

describe('fitCarryOver', () => {
  it('shrinks an exact slope toward the 0.5 prior by n / (n + 30)', () => {
    // 11 points -> 10 pairs -> w = 10 / 40 = 0.25 -> 0.25 * 0.8 + 0.75 * 0.5 = 0.575
    expect(fitCarryOver(series(decay(11)), TODAY)).toBeCloseTo(0.575, 6);
  });

  it('returns the prior with fewer than two pairs', () => {
    expect(fitCarryOver(series([1]), TODAY)).toBe(0.5);
    expect(fitCarryOver(new Map(), TODAY)).toBe(0.5);
  });

  it('ignores pairs that touch an imputed or null day', () => {
    const clean = decay(11);
    const noisy = [...clean, 50]; // day 11 is a wild value, but imputed
    const withImputed = series(noisy, TODAY, new Set([11]));
    const withoutIt = series(clean, '2026-06-29');
    expect(fitCarryOver(withImputed, TODAY)).toBeCloseTo(fitCarryOver(withoutIt, TODAY), 10);
    const withNull = series([...clean, null]);
    expect(fitCarryOver(withNull, TODAY)).toBeCloseTo(fitCarryOver(withoutIt, TODAY), 10);
  });

  it('never looks past `through`', () => {
    const s = series([...decay(11), 40, -40]);
    expect(fitCarryOver(s, '2026-06-28')).toBeCloseTo(0.575, 6);
  });
});

describe('shrinkAndClamp', () => {
  it('clamps to [0, 0.9]', () => {
    expect(shrinkAndClamp(-2, 1000)).toBe(0);
    expect(shrinkAndClamp(3, 1000)).toBe(0.9);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/forecast/carryOver.test.ts`
Expected: FAIL with "Cannot find module '../../src/forecast/carryOver'".

- [ ] **Step 7: Implement `backend/src/forecast/carryOver.ts`**

```ts
// Per-user AR(1) carry-over of a factor's z-score, shrunk toward a population
// prior so a short history cannot produce an extreme phi. Pure.
import { ANALYSIS_WINDOW_DAYS } from '../habits/config';
import type { FactorSeries } from '../habits/engine';
import { shiftDate } from '../scoring/dates';
import { PHI_MAX, PHI_MIN, PHI_PRIOR, PHI_SHRINK_N } from './config';

export function shrinkAndClamp(slope: number, n: number): number {
  const w = n / (n + PHI_SHRINK_N);
  return Math.min(PHI_MAX, Math.max(PHI_MIN, w * slope + (1 - w) * PHI_PRIOR));
}

/**
 * OLS slope of z(d+1) on z(d) over consecutive non-imputed pairs whose later
 * day is within (through - ANALYSIS_WINDOW_DAYS, through].
 */
export function fitCarryOver(series: FactorSeries, through: string): number {
  const from = shiftDate(through, -ANALYSIS_WINDOW_DAYS);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, day] of series) {
    const next = shiftDate(date, 1);
    if (date < from || next > through) continue;
    const n = series.get(next);
    if (day.z === null || day.imputed || !n || n.z === null || n.imputed) continue;
    xs.push(day.z);
    ys.push(n.z);
  }
  const n = xs.length;
  if (n < 2) return PHI_PRIOR;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (sxx === 0) return PHI_PRIOR;
  return shrinkAndClamp(sxy / sxx, n);
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/forecast/carryOver.test.ts tests/habits/engine.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/habits/engine.ts backend/src/forecast backend/tests/forecast
git commit -m "feat(forecast): types, config and carry-over fit"
```

---

### Task 2: Habit effects and the exact sleep lever

**Files:**
- Create: `backend/src/forecast/habitEffects.ts`, `backend/src/forecast/sleepLever.ts`
- Test: `backend/tests/forecast/habitEffects.test.ts`, `backend/tests/forecast/sleepLever.test.ts`

**Interfaces:**
- Consumes: `pairUp` (Task 1); `sleepDebtRolling`, `buildSleepDebtSeries` (`scoring/features.ts`); `computeBaseline`, `zScore` (`scoring/baseline.ts`); `scoreDay` (`scoring/pipeline.ts`, used only in the test as the oracle).
- Produces:
  - `habitEffect(observations: ObservedDay[], series: FactorSeries, through: string): number | null`
  - `sleepDebtZ(sleep: DailyPoint[], target: string, plannedMinutes: number, goalMinutes: number, cfg: ScoreConfig): number | null` (the unclamped z)

- [ ] **Step 1: Write the failing habit-effect tests `backend/tests/forecast/habitEffects.test.ts`**

```ts
import { habitEffect } from '../../src/forecast/habitEffects';
import { TODAY, series } from './fixtures';

// Days 0..9. Exposed on even days; the factor on the NEXT day is -1 after exposure, +1 otherwise.
const z = [0, -1, 1, -1, 1, -1, 1, -1, 1, -1];
const days = [...series(z).keys()];
const obs = days.map((day, i) => ({ day, exposed: i % 2 === 0 }));

describe('habitEffect', () => {
  it('is mean(z | exposed yesterday) - mean(z | unexposed yesterday) at lag 1', () => {
    expect(habitEffect(obs, series(z), TODAY)).toBeCloseTo(-2, 10);
  });

  it('returns null when either side has no pairs', () => {
    const allExposed = obs.map((o) => ({ ...o, exposed: true }));
    expect(habitEffect(allExposed, series(z), TODAY)).toBeNull();
    expect(habitEffect([], series(z), TODAY)).toBeNull();
  });

  it('skips imputed factor days and never reads past `through`', () => {
    const imputedAll = series(z, TODAY, new Set(z.map((_, i) => i)));
    expect(habitEffect(obs, imputedAll, TODAY)).toBeNull();
    // Only the first pair (exposed day 0 -> day 1) is visible when through = day 1.
    expect(habitEffect(obs, series(z), days[1]!)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing sleep-lever tests `backend/tests/forecast/sleepLever.test.ts`**

```ts
import { sleepDebtZ } from '../../src/forecast/sleepLever';
import { scoreDay } from '../../src/scoring/pipeline';
import { makeData, TODAY } from './fixtures';

describe('sleepDebtZ', () => {
  const data = makeData();
  const hrv = [...data.factors.HRV.keys()].map((date) => ({ date, value: 55 }));
  const rhr = hrv.map((p) => ({ ...p, value: 58 }));

  it('matches the scoring pipeline for a real night of the same length', () => {
    const night = data.sleep.find((p) => p.date === TODAY)!;
    const oracle = scoreDay(
      { date: TODAY, hrv, rhr, sleep: data.sleep, steps: [], sleepGoalMinutes: 480 },
      data.cfg,
    ).factors.find((f) => f.factor === 'SLEEP_DEBT')!;
    const history = data.sleep.filter((p) => p.date !== TODAY);
    const z = sleepDebtZ(history, TODAY, night.value, 480, data.cfg);
    expect(z).toBeCloseTo((oracle.zRaw ?? oracle.z)!, 10);
  });

  it('ignores any sleep recorded on or after the target', () => {
    const polluted = [...data.sleep.filter((p) => p.date !== TODAY), { date: TODAY, value: 60 }, { date: '2026-07-01', value: 60 }];
    const clean = data.sleep.filter((p) => p.date < TODAY);
    expect(sleepDebtZ(polluted, TODAY, 480, 480, data.cfg)).toBe(sleepDebtZ(clean, TODAY, 480, 480, data.cfg));
  });

  it('more planned sleep never increases debt z', () => {
    const history = data.sleep.filter((p) => p.date < TODAY);
    expect(sleepDebtZ(history, TODAY, 600, 480, data.cfg)!).toBeLessThanOrEqual(sleepDebtZ(history, TODAY, 300, 480, data.cfg)!);
  });

  it('returns null on a cold-start history', () => {
    expect(sleepDebtZ([], TODAY, 480, 480, data.cfg)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/forecast/habitEffects.test.ts tests/forecast/sleepLever.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Implement `backend/src/forecast/habitEffects.ts`**

```ts
// Lag-1 habit effect in z units, over the same pairs the habit engine tests
// (pairUp drops imputed and missing factor days). Pure.
import { ANALYSIS_WINDOW_DAYS } from '../habits/config';
import { pairUp, type FactorSeries } from '../habits/engine';
import type { ObservedDay } from '../habits/observed';
import { shiftDate } from '../scoring/dates';

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function habitEffect(observations: ObservedDay[], series: FactorSeries, through: string): number | null {
  const from = shiftDate(through, -ANALYSIS_WINDOW_DAYS);
  const visible = observations.filter((o) => o.day >= from && shiftDate(o.day, 1) <= through);
  const pairs = pairUp(visible, series, 1);
  const exposed = pairs.filter((p) => p.exposed).map((p) => p.z);
  const unexposed = pairs.filter((p) => !p.exposed).map((p) => p.z);
  if (exposed.length === 0 || unexposed.length === 0) return null;
  return mean(exposed) - mean(unexposed);
}
```

- [ ] **Step 5: Implement `backend/src/forecast/sleepLever.ts`**

```ts
// SLEEP_DEBT z for `target` if the night ending on `target` lasts
// `plannedMinutes`: the same four steps scoring/pipeline.ts runs, so the sleep
// lever is exact rather than predicted. Pure.
import { computeBaseline, zScore } from '../scoring/baseline';
import type { ScoreConfig } from '../scoring/configs';
import { shiftDate } from '../scoring/dates';
import { buildSleepDebtSeries, sleepDebtRolling } from '../scoring/features';
import type { DailyPoint } from '../scoring/types';

export function sleepDebtZ(
  sleep: DailyPoint[],
  target: string,
  plannedMinutes: number,
  goalMinutes: number,
  cfg: ScoreConfig,
): number | null {
  const nights = [...sleep.filter((p) => p.date < target), { date: target, value: plannedMinutes }].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const debt = sleepDebtRolling(nights, target, goalMinutes, cfg);
  const debtSeries = buildSleepDebtSeries(nights, target, goalMinutes, cfg);
  const from = shiftDate(target, -cfg.historyDays);
  const baseline = computeBaseline(
    debtSeries.filter((p) => p.date >= from && p.date < target),
    cfg,
  );
  return zScore(debt, baseline, cfg, 'SLEEP_DEBT');
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/forecast/habitEffects.test.ts tests/forecast/sleepLever.test.ts`
Expected: PASS. If the pipeline-equality test fails, compare against `scoring/pipeline.ts:175-195` line by line: the only allowed difference is that `sleepDebtZ` supplies the target night itself.

- [ ] **Step 7: Commit**

```bash
git add backend/src/forecast backend/tests/forecast
git commit -m "feat(forecast): lag-1 habit effects and exact sleep-debt lever"
```

---

### Task 3: Model fit and single-day prediction with contributions

**Files:**
- Create: `backend/src/forecast/predict.ts`
- Test: `backend/tests/forecast/predict.test.ts`

**Interfaces:**
- Consumes: `fitCarryOver` (Task 1); `habitEffect`, `sleepDebtZ` (Task 2); `computeComposite` (`scoring/composite.ts`); `NEUTRAL_SCORE` (`scoring/explain.ts`); `ForecastData`, `Lever`, `Model`, `Prediction` (Task 1).
- Produces:
  - `fitModel(data: ForecastData, through: string, habits: readonly string[]): Model`
  - `predictDay(data: ForecastData, model: Model, target: string, lever: Lever): Prediction | null`. It returns null only when every factor is excluded.
  - Contribution keys: `'CARRY_OVER'`, `'SLEEP'`, then the habit type id.

- [ ] **Step 1: Write the failing tests `backend/tests/forecast/predict.test.ts`**

```ts
import { fitModel, predictDay } from '../../src/forecast/predict';
import { shiftDate } from '../../src/scoring/dates';
import { makeData, plant, TODAY } from './fixtures';

const TARGET = shiftDate(TODAY, 1);
const sum = (xs: { points: number }[]) => xs.reduce((s, c) => s + c.points, 0);

describe('predictDay', () => {
  const data = plant(makeData(), 'ALCOHOL', 'HRV', -1.5);
  const model = fitModel(data, TODAY, ['ALCOHOL']);

  it('contributions sum exactly to score - 50', () => {
    for (const exposed of [new Set<string>(), new Set(['ALCOHOL'])]) {
      for (const sleepMinutes of [240, 480, 600]) {
        const p = predictDay(data, model, TARGET, { sleepMinutes, exposed })!;
        expect(sum(p.contributions)).toBeCloseTo(p.score - 50, 8);
      }
    }
  });

  it('a CONFIRMED negative HRV effect lowers the score when exposed', () => {
    const off = predictDay(data, model, TARGET, { sleepMinutes: 480, exposed: new Set() })!;
    const on = predictDay(data, model, TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL']) })!;
    expect(model.effects.get('ALCOHOL')!.HRV!).toBeLessThan(-1);
    expect(on.score).toBeLessThan(off.score);
    expect(on.contributions.map((c) => c.key)).toEqual(['CARRY_OVER', 'SLEEP', 'ALCOHOL']);
    expect(off.contributions.map((c) => c.key)).toEqual(['CARRY_OVER', 'SLEEP']);
  });

  it('a habit with no CONFIRMED row has no effect even if exposed', () => {
    const m = fitModel(data, TODAY, ['ALCOHOL', 'CAFFEINE']);
    const a = predictDay(data, m, TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL']) })!;
    const b = predictDay(data, m, TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL', 'CAFFEINE']) })!;
    expect(b.score).toBe(a.score);
  });

  it('more sleep never lowers the forecast', () => {
    const short = predictDay(data, model, TARGET, { sleepMinutes: 300, exposed: new Set() })!;
    const long = predictDay(data, model, TARGET, { sleepMinutes: 570, exposed: new Set() })!;
    expect(long.score).toBeGreaterThanOrEqual(short.score);
  });

  // Review Focus 2
  it("still forecasts when today's HRV is missing, with no NaN", () => {
    const hrv = new Map(data.factors.HRV);
    hrv.set(TODAY, { z: null, imputed: false, pct: null });
    const d = { ...data, factors: { ...data.factors, HRV: hrv } };
    const p = predictDay(d, fitModel(d, TODAY, ['ALCOHOL']), TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL']) })!;
    expect(Number.isFinite(p.score)).toBe(true);
    expect(sum(p.contributions)).toBeCloseTo(p.score - 50, 8);
  });

  it('returns null when every factor is excluded', () => {
    const empty = new Map();
    const d = { ...data, sleep: [], factors: { HRV: empty, RHR: empty } };
    expect(predictDay(d, fitModel(d, TODAY, []), TARGET, { sleepMinutes: 480, exposed: new Set() })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/forecast/predict.test.ts`
Expected: FAIL with "Cannot find module '../../src/forecast/predict'".

- [ ] **Step 3: Implement `backend/src/forecast/predict.ts`**

```ts
// Tomorrow's Recovery Score from predicted factor z-scores, scored by the
// unchanged computeComposite. Contributions are sequential score deltas in a
// fixed order (carry-over, sleep, habits), so they sum to score - 50. Pure.
import { computeComposite } from '../scoring/composite';
import { shiftDate } from '../scoring/dates';
import { NEUTRAL_SCORE } from '../scoring/explain';
import type { FactorInput, RecoveryFactorKey } from '../scoring/types';
import { fitCarryOver } from './carryOver';
import { habitEffect } from './habitEffects';
import { sleepDebtZ } from './sleepLever';
import { FORECAST_FACTORS, type Contribution, type ForecastData, type ForecastFactor, type Lever, type Model, type Prediction } from './types';

/** phi per factor and, for each listed habit, its delta for every CONFIRMED factor with computable pairs. */
export function fitModel(data: ForecastData, through: string, habits: readonly string[]): Model {
  const phi = {
    HRV: fitCarryOver(data.factors.HRV, through),
    RHR: fitCarryOver(data.factors.RHR, through),
  };
  const effects: Model['effects'] = new Map();
  for (const habit of habits) {
    const obs = data.observations.get(habit) ?? [];
    const e: Partial<Record<ForecastFactor, number>> = {};
    for (const row of data.confirmed) {
      if (row.habitType !== habit) continue;
      const delta = habitEffect(obs, data.factors[row.factor], through);
      if (delta !== null) e[row.factor] = delta;
    }
    if (Object.keys(e).length > 0) effects.set(habit, e);
  }
  return { phi, effects };
}

export function predictDay(data: ForecastData, model: Model, target: string, lever: Lever): Prediction | null {
  const origin = shiftDate(target, -1);
  const today: Record<ForecastFactor, number | null> = {
    HRV: data.factors.HRV.get(origin)?.z ?? null,
    RHR: data.factors.RHR.get(origin)?.z ?? null,
  };
  const debtZ = sleepDebtZ(data.sleep, target, lever.sleepMinutes, data.sleepGoalMinutes, data.cfg);

  // null = excluded for the whole prediction, so renormalisation is identical at every step.
  const z: Record<RecoveryFactorKey, number | null> = {
    HRV: today.HRV === null ? null : 0,
    RHR: today.RHR === null ? null : 0,
    SLEEP_DEBT: debtZ === null ? null : 0,
  };
  if (z.HRV === null && z.RHR === null && z.SLEEP_DEBT === null) return null;

  const score = () => {
    const inputs: FactorInput[] = (Object.keys(z) as RecoveryFactorKey[]).map((factor) => ({
      factor,
      z: z[factor],
      imputed: false,
      excluded: z[factor] === null,
    }));
    return computeComposite(inputs, data.cfg).score ?? NEUTRAL_SCORE;
  };

  const contributions: Contribution[] = [];
  let prev = score(); // every present factor at z = 0 -> NEUTRAL_SCORE
  const step = (key: string) => {
    const next = score();
    contributions.push({ key, points: next - prev });
    prev = next;
  };

  for (const f of FORECAST_FACTORS) if (z[f] !== null) z[f] = model.phi[f] * today[f]!;
  step('CARRY_OVER');

  if (z.SLEEP_DEBT !== null) z.SLEEP_DEBT = debtZ!;
  step('SLEEP');

  for (const t of data.habitTypes) {
    if (!lever.exposed.has(t.type)) continue;
    const e = model.effects.get(t.type);
    if (!e) continue;
    for (const f of FORECAST_FACTORS) if (z[f] !== null && e[f] !== undefined) z[f] = z[f]! + e[f]!;
    step(t.type);
  }

  return { score: prev, contributions };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/forecast/predict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/forecast/predict.ts backend/tests/forecast/predict.test.ts
git commit -m "feat(forecast): model fit and additive day prediction"
```

---

### Task 4: Rolling-origin backtest, band and track-record summary

**Files:**
- Create: `backend/src/forecast/backtest.ts`, `backend/src/forecast/band.ts`
- Test: `backend/tests/forecast/backtest.test.ts`

**Interfaces:**
- Consumes: `fitModel`, `predictDay` (Task 3); `dateRange`, `shiftDate`.
- Produces:
  - `rollingBacktest(data: ForecastData, habits: readonly string[], days?: number): TrackPoint[]`
  - `quantile(sorted: number[], q: number): number`
  - `bandFor(score: number, errors: number[]): [number, number]`
  - `errorSummary(points: TrackPoint[]): { withinPoints: number; hits: number; days: number }`

- [ ] **Step 1: Write the failing tests `backend/tests/forecast/backtest.test.ts`**

```ts
import { rollingBacktest } from '../../src/forecast/backtest';
import { bandFor, errorSummary, quantile } from '../../src/forecast/band';
import { shiftDate } from '../../src/scoring/dates';
import { makeData, plant, TODAY } from './fixtures';

describe('rollingBacktest', () => {
  const data = plant(makeData(), 'ALCOHOL', 'HRV', -1.5);

  it('produces one point per scored day in the last 30 days', () => {
    const pts = rollingBacktest(data, ['ALCOHOL']);
    expect(pts).toHaveLength(30);
    expect(pts[0]!.date).toBe(shiftDate(TODAY, -29));
    expect(pts.at(-1)!.date).toBe(TODAY);
  });

  it('skips days without an actual score', () => {
    const scores = new Map(data.scores);
    scores.set(TODAY, { score: null, confidence: 'LOW' });
    expect(rollingBacktest({ ...data, scores }, ['ALCOHOL'])).toHaveLength(29);
  });

  it('never uses data dated on or after the forecast day (leakage)', () => {
    const D = shiftDate(TODAY, -10);
    const poison = (m: Map<string, { z: number | null; imputed: boolean; pct: number | null }>) =>
      new Map([...m].map(([d, v]) => [d, d >= D ? { ...v, z: 9 } : v]));
    const leaked = {
      ...data,
      factors: { HRV: poison(data.factors.HRV as never), RHR: poison(data.factors.RHR as never) },
      sleep: data.sleep.map((p) => (p.date > D ? { ...p, value: 30 } : p)),
      observations: new Map(
        [...data.observations].map(([h, obs]) => [h, obs.map((o) => (o.day >= D ? { ...o, exposed: !o.exposed } : o))]),
      ),
    };
    const at = (pts: { date: string; forecast: number }[]) => pts.find((p) => p.date === D)!.forecast;
    expect(at(rollingBacktest(leaked, ['ALCOHOL']))).toBe(at(rollingBacktest(data, ['ALCOHOL'])));
  });
});

describe('band', () => {
  it('quantile interpolates linearly', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 10);
  });

  it('uses P10/P90 of errors with >= 10 pairs, clamped to [0, 100]', () => {
    const errors = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
    const [lo, hi] = bandFor(60, errors);
    expect(lo).toBeCloseTo(60 + quantile([...errors].sort((a, b) => a - b), 0.1), 10);
    expect(hi).toBeCloseTo(60 + quantile([...errors].sort((a, b) => a - b), 0.9), 10);
    expect(bandFor(99, errors)[1]).toBe(100);
  });

  it('falls back to +/- 1.5 MAD-sigma below 10 pairs and +/- 10 below 3', () => {
    const [lo, hi] = bandFor(50, [-2, 0, 2, 4]);
    // median 1; |e - 1| = 3,1,1,3 -> MAD 2 -> sigma 2.9652 -> half-width 4.4478
    expect(hi - 50).toBeCloseTo(1.5 * 2 * 1.4826, 6);
    expect(50 - lo).toBeCloseTo(1.5 * 2 * 1.4826, 6);
    expect(bandFor(50, [1])).toEqual([40, 60]);
  });

  it('summarises the track record with the rounded-up median |error|', () => {
    const pts = [1, -2, 3, -4, 10].map((e, i) => ({ date: `d${i}`, forecast: 50, actual: 50 + e }));
    expect(errorSummary(pts)).toEqual({ withinPoints: 3, hits: 3, days: 5 });
    expect(errorSummary([])).toEqual({ withinPoints: 0, hits: 0, days: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/forecast/backtest.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `backend/src/forecast/band.ts`**

```ts
// Forecast band and track-record summary from backtest errors (actual - forecast). Pure.
import { BAND_MAD_MULTIPLIER, FALLBACK_HALF_WIDTH, MAD_TO_SIGMA, MIN_BAND_PAIRS } from './config';
import type { TrackPoint } from './types';

const clamp100 = (v: number) => Math.min(100, Math.max(0, v));
const sortAsc = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function bandFor(score: number, errors: number[]): [number, number] {
  if (errors.length >= MIN_BAND_PAIRS) {
    const s = sortAsc(errors);
    return [clamp100(score + quantile(s, 0.1)), clamp100(score + quantile(s, 0.9))];
  }
  let half = FALLBACK_HALF_WIDTH;
  if (errors.length >= 3) {
    const med = quantile(sortAsc(errors), 0.5);
    const mad = quantile(sortAsc(errors.map((e) => Math.abs(e - med))), 0.5);
    half = BAND_MAD_MULTIPLIER * mad * MAD_TO_SIGMA;
  }
  return [clamp100(score - half), clamp100(score + half)];
}

export function errorSummary(points: TrackPoint[]): { withinPoints: number; hits: number; days: number } {
  if (points.length === 0) return { withinPoints: 0, hits: 0, days: 0 };
  const abs = points.map((p) => Math.abs(p.actual - p.forecast));
  const withinPoints = Math.ceil(quantile(sortAsc(abs), 0.5));
  return { withinPoints, hits: abs.filter((a) => a <= withinPoints).length, days: points.length };
}
```

- [ ] **Step 4: Implement `backend/src/forecast/backtest.ts`**

```ts
// Rolling-origin backtest: each day D is forecast from a model fitted on data
// up to D - 1, using the night that actually ended on D as the sleep lever and
// the habits actually logged on habit day D - 1. Pure.
//
// Known simplification (spec 1.5): the set of CONFIRMED habits is today's; the
// effect sizes themselves are refitted on the truncated history.
import { dateRange, shiftDate } from '../scoring/dates';
import { TRACK_DAYS } from './config';
import { fitModel, predictDay } from './predict';
import type { ForecastData, TrackPoint } from './types';

export function rollingBacktest(data: ForecastData, habits: readonly string[], days = TRACK_DAYS): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const date of dateRange(shiftDate(data.today, -(days - 1)), data.today)) {
    const actual = data.scores.get(date)?.score;
    if (actual === null || actual === undefined) continue;
    const night = data.sleep.find((p) => p.date === date);
    if (!night) continue;
    const through = shiftDate(date, -1);
    const exposed = new Set(
      habits.filter((h) => data.observations.get(h)?.find((o) => o.day === through)?.exposed ?? false),
    );
    const p = predictDay(data, fitModel(data, through, habits), date, { sleepMinutes: night.value, exposed });
    if (p) points.push({ date, forecast: p.score, actual });
  }
  return points;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/forecast/backtest.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/forecast backend/tests/forecast/backtest.test.ts
git commit -m "feat(forecast): rolling-origin backtest, band and track record"
```

---

### Task 5: `buildForecast` — gates, defaults, levers and the what-if grid

**Files:**
- Create: `backend/src/forecast/dto.ts`, `backend/src/forecast/levers.ts`, `backend/src/forecast/engine.ts`
- Test: `backend/tests/forecast/engine.test.ts` (it covers `levers.ts` through `buildForecast`)

**Interfaces:**
- Consumes: Tasks 1–4; `leverRange` and the constants in `forecast/config.ts`.
- Produces:
  - `buildForecast(data: ForecastData): ForecastResponse`
  - `buildLevers(data: ForecastData, modelled: ReadonlySet<string>, withEffect: ReadonlySet<string>): ForecastLever[]`
  - `buildDefaults(data: ForecastData): { sleepHours: number; habits: Record<string, number> }`
  - `ForecastResponse`, `ForecastCell`, `ForecastLever` (in `dto.ts`)

- [ ] **Step 1: Create `backend/src/forecast/dto.ts`**

```ts
import type { ConfidenceLevel } from '../scoring/types';

export type LeverEffect = 'CONFIRMED' | 'NONE_YET' | 'NOT_MODELLED';

export interface ForecastLever {
  key: string; // 'SLEEP' or a habit type id
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  threshold?: number;
  effect: LeverEffect;
}

export interface ForecastCell {
  sleepHours: number;
  exposed: string[];
  score: number;
  band: [number, number];
  confidence: ConfidenceLevel;
  contributions: Array<{ key: string; points: number }>;
}

export type ForecastResponse =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | {
      status: 'READY';
      date: string;
      algorithmVersion: string;
      defaults: { sleepHours: number; habits: Record<string, number> };
      levers: ForecastLever[];
      grid: ForecastCell[];
      trackRecord: {
        withinPoints: number;
        hits: number;
        days: number;
        series: Array<{ date: string; forecast: number; actual: number }>;
      };
    };
```

- [ ] **Step 2: Write the failing tests `backend/tests/forecast/engine.test.ts`**

```ts
import { buildForecast } from '../../src/forecast/engine';
import { dateRange, shiftDate } from '../../src/scoring/dates';
import { makeData, plant, TODAY } from './fixtures';

const ready = (r: ReturnType<typeof buildForecast>) => {
  if (r.status !== 'READY') throw new Error(`expected READY, got ${r.status}`);
  return r;
};

describe('buildForecast gates', () => {
  it('NO_HISTORY at 20 scored days, READY at 21', () => {
    expect(buildForecast(makeData({}, 20))).toEqual({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 20 });
    expect(buildForecast(makeData({}, 21)).status).toBe('READY');
  });

  it("LOW_CONFIDENCE_TODAY when today's score is LOW or missing", () => {
    const d = makeData();
    const low = new Map(d.scores);
    low.set(TODAY, { score: 40, confidence: 'LOW' });
    expect(buildForecast({ ...d, scores: low })).toMatchObject({ reason: 'LOW_CONFIDENCE_TODAY' });
    const missing = new Map(d.scores);
    missing.delete(TODAY);
    expect(buildForecast({ ...d, scores: missing })).toMatchObject({ reason: 'LOW_CONFIDENCE_TODAY' });
  });
});

describe('buildForecast READY', () => {
  const data = plant(makeData(), 'ALCOHOL', 'HRV', -1.5);
  const r = ready(buildForecast(data));

  it('targets tomorrow with the live algorithm version', () => {
    expect(r.date).toBe(shiftDate(TODAY, 1));
    expect(r.algorithmVersion).toBe(data.cfg.version);
  });

  it('has 13 sleep steps x 2^k habit subsets', () => {
    expect(r.grid).toHaveLength(13 * 2);
    expect(new Set(r.grid.map((c) => c.sleepHours))).toEqual(new Set([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]));
  });

  it('labels levers CONFIRMED / NONE_YET and puts SLEEP first', () => {
    expect(r.levers.map((l) => [l.key, l.effect])).toEqual([
      ['SLEEP', 'CONFIRMED'],
      ['ALCOHOL', 'CONFIRMED'],
      ['CAFFEINE', 'NONE_YET'],
      ['WORKOUT', 'NONE_YET'],
    ]);
    expect(r.levers[1]).toMatchObject({ threshold: 2, min: 0, max: 6, step: 1, unit: 'drinks' });
  });

  it('exposed cells score lower, and every cell is finite with its band around the score', () => {
    const at = (exposed: string[]) => r.grid.find((c) => c.sleepHours === 7.5 && c.exposed.join() === exposed.join())!;
    expect(at(['ALCOHOL']).score).toBeLessThan(at([]).score);
    for (const c of r.grid) {
      expect(Number.isFinite(c.score)).toBe(true);
      expect(c.band[0]).toBeLessThanOrEqual(c.score);
      expect(c.band[1]).toBeGreaterThanOrEqual(c.score);
    }
  });

  it('reports a 30-day track record', () => {
    expect(r.trackRecord.days).toBe(30);
    expect(r.trackRecord.series).toHaveLength(30);
    expect(r.trackRecord.hits).toBeGreaterThanOrEqual(15);
  });

  it("defaults to the 14-night median sleep (rounded to 0.5 h) and today's habit totals", () => {
    const d = { ...data, todayHabitTotals: { ALCOHOL: 3 } };
    const nights = d.sleep.filter((p) => p.date > shiftDate(TODAY, -14)).map((p) => p.value).sort((a, b) => a - b);
    const med = (nights[6]! + nights[7]!) / 2 / 60;
    const res = ready(buildForecast(d));
    expect(res.defaults.sleepHours).toBe(Math.round(med * 2) / 2);
    expect(res.defaults.habits).toEqual({ ALCOHOL: 3, CAFFEINE: 0, WORKOUT: 0 });
  });

  // Review Focus 4
  it('defaults to 7.5 h when no night was recorded in the last 14 days', () => {
    const d = { ...data, sleep: data.sleep.filter((p) => p.date <= shiftDate(TODAY, -14)) };
    const res = buildForecast(d);
    if (res.status === 'READY') expect(res.defaults.sleepHours).toBe(7.5);
  });

  // Review Focus 3
  it('a CONFIRMED habit with no computable pairs is NONE_YET and adds no grid dimension', () => {
    const d = { ...data, confirmed: [...data.confirmed, { habitType: 'CAFFEINE', factor: 'RHR' as const }] };
    const res = ready(buildForecast(d));
    expect(res.levers.find((l) => l.key === 'CAFFEINE')!.effect).toBe('NONE_YET');
    expect(res.grid).toHaveLength(26);
  });

  it('caps the grid at 4 habits and marks the rest NOT_MODELLED', () => {
    let d = makeData({
      habitTypes: ['A', 'B', 'C', 'D', 'E'].map((t) => ({ type: t, label: t, unit: 'x', exposureThreshold: 1, builtIn: false })),
    });
    const deltas = { A: -0.2, B: -0.4, C: -0.6, D: -0.8, E: -1.0 };
    for (const [h, delta] of Object.entries(deltas)) d = plant(d, h, 'HRV', delta, 3);
    const res = ready(buildForecast(d));
    expect(res.grid).toHaveLength(13 * 16);
    expect(res.levers.filter((l) => l.effect === 'NOT_MODELLED').map((l) => l.key)).toHaveLength(1);
  });

  it('only scored days count toward history', () => {
    const d = makeData({}, 30);
    const scores = new Map(d.scores);
    for (const date of dateRange(shiftDate(TODAY, -29), shiftDate(TODAY, -20))) scores.set(date, { score: null, confidence: 'LOW' });
    expect(buildForecast({ ...d, scores })).toMatchObject({ reason: 'NO_HISTORY', daysOfHistory: 20 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/forecast/engine.test.ts`
Expected: FAIL with "Cannot find module '../../src/forecast/engine'".

- [ ] **Step 4: Implement `backend/src/forecast/levers.ts`**

```ts
// Slider definitions and their starting values for the forecast response. Pure.
import { shiftDate } from '../scoring/dates';
import { quantile } from './band';
import {
  DEFAULT_SLEEP_HOURS,
  DEFAULT_SLEEP_WINDOW_DAYS,
  SLEEP_MAX_HOURS,
  SLEEP_MIN_HOURS,
  SLEEP_STEP_HOURS,
  leverRange,
} from './config';
import type { ForecastLever } from './dto';
import type { ForecastData } from './types';

/**
 * SLEEP first, then every habit type in listHabitTypes order. A habit is
 * CONFIRMED when it is in the grid, NOT_MODELLED when it has an effect but was
 * cut by MAX_GRID_HABITS, and NONE_YET otherwise.
 */
export function buildLevers(
  data: ForecastData,
  modelled: ReadonlySet<string>,
  withEffect: ReadonlySet<string>,
): ForecastLever[] {
  return [
    { key: 'SLEEP', label: 'Sleep', unit: 'hours', min: SLEEP_MIN_HOURS, max: SLEEP_MAX_HOURS, step: SLEEP_STEP_HOURS, effect: 'CONFIRMED' },
    ...data.habitTypes.map(
      (t): ForecastLever => ({
        key: t.type,
        label: t.label,
        unit: t.unit,
        ...leverRange(t),
        threshold: t.exposureThreshold,
        effect: modelled.has(t.type) ? 'CONFIRMED' : withEffect.has(t.type) ? 'NOT_MODELLED' : 'NONE_YET',
      }),
    ),
  ];
}

/** 14-night median sleep rounded to the grid (7.5 h when there are no nights), plus today's habit totals. */
export function buildDefaults(data: ForecastData): { sleepHours: number; habits: Record<string, number> } {
  const from = shiftDate(data.today, -DEFAULT_SLEEP_WINDOW_DAYS);
  const nights = data.sleep
    .filter((p) => p.date > from && p.date <= data.today)
    .map((p) => p.value)
    .sort((a, b) => a - b);
  const sleepHours =
    nights.length === 0
      ? DEFAULT_SLEEP_HOURS
      : Math.min(
          SLEEP_MAX_HOURS,
          Math.max(SLEEP_MIN_HOURS, Math.round(quantile(nights, 0.5) / 60 / SLEEP_STEP_HOURS) * SLEEP_STEP_HOURS),
        );
  return {
    sleepHours,
    habits: Object.fromEntries(data.habitTypes.map((t) => [t.type, data.todayHabitTotals[t.type] ?? 0])),
  };
}
```

- [ ] **Step 5: Implement `backend/src/forecast/engine.ts`**

```ts
// Orchestrates the forecast response: gates, model fit, backtest and the
// precomputed what-if grid. Lever and default details live in levers.ts. Pure.
import { shiftDate } from '../scoring/dates';
import type { ConfidenceLevel } from '../scoring/types';
import { rollingBacktest } from './backtest';
import { bandFor, errorSummary } from './band';
import { MAX_GRID_HABITS, MIN_BAND_PAIRS, MIN_HISTORY_DAYS, SLEEP_MAX_HOURS, SLEEP_MIN_HOURS, SLEEP_STEP_HOURS } from './config';
import type { ForecastCell, ForecastResponse } from './dto';
import { buildDefaults, buildLevers } from './levers';
import { fitModel, predictDay } from './predict';
import type { ForecastData, Model } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;
const LEVELS: ConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW'];
const downgrade = (level: ConfidenceLevel, drops: number) =>
  LEVELS[Math.min(LEVELS.indexOf(level) + drops, LEVELS.length - 1)]!;

function sleepSteps(): number[] {
  const steps: number[] = [];
  for (let h = SLEEP_MIN_HOURS; h <= SLEEP_MAX_HOURS + 1e-9; h += SLEEP_STEP_HOURS) steps.push(round1(h));
  return steps;
}

/** Every subset of `items`, each keeping `items` order; the empty set first. */
function subsets<T>(items: readonly T[]): T[][] {
  return Array.from({ length: 2 ** items.length }, (_, mask) => items.filter((_, i) => mask & (1 << i)));
}

const maxAbsEffect = (model: Model, habit: string) =>
  Math.max(...Object.values(model.effects.get(habit) ?? {}).map((v) => Math.abs(v!)));

export function buildForecast(data: ForecastData): ForecastResponse {
  const daysOfHistory = [...data.scores.values()].filter((s) => s.score !== null).length;
  if (daysOfHistory < MIN_HISTORY_DAYS) return { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory };
  const today = data.scores.get(data.today);
  if (!today || today.score === null || today.confidence === 'LOW') {
    return { status: 'NOT_ENOUGH_DATA', reason: 'LOW_CONFIDENCE_TODAY', daysOfHistory };
  }

  const target = shiftDate(data.today, 1);
  const confirmedTypes = data.habitTypes.map((t) => t.type).filter((t) => data.confirmed.some((c) => c.habitType === t));
  const fullModel = fitModel(data, data.today, confirmedTypes);
  const withEffect = confirmedTypes.filter((t) => fullModel.effects.has(t));
  const kept = new Set(
    [...withEffect].sort((a, b) => maxAbsEffect(fullModel, b) - maxAbsEffect(fullModel, a)).slice(0, MAX_GRID_HABITS),
  );
  const modelled = withEffect.filter((t) => kept.has(t));

  const track = rollingBacktest(data, modelled);
  const errors = track.map((p) => p.actual - p.forecast);
  const confidence = downgrade(today.confidence, track.length < MIN_BAND_PAIRS ? 1 : 0);

  const grid: ForecastCell[] = [];
  for (const sleepHours of sleepSteps()) {
    for (const exposed of subsets(modelled)) {
      const p = predictDay(data, fullModel, target, { sleepMinutes: sleepHours * 60, exposed: new Set(exposed) });
      if (!p) return { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory };
      const [lo, hi] = bandFor(p.score, errors);
      grid.push({
        sleepHours,
        exposed,
        score: round1(p.score),
        band: [round1(lo), round1(hi)],
        confidence,
        contributions: p.contributions.map((c) => ({ key: c.key, points: round1(c.points) })),
      });
    }
  }

  return {
    status: 'READY',
    date: target,
    algorithmVersion: data.cfg.version,
    defaults: buildDefaults(data),
    levers: buildLevers(data, kept, new Set(withEffect)),
    grid,
    trackRecord: {
      ...errorSummary(track),
      series: track.map((p) => ({ date: p.date, forecast: round1(p.forecast), actual: round1(p.actual) })),
    },
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/forecast`
Expected: PASS for every forecast test. If the "hits ≥ 15" assertion fails on the fixture, check the backtest first: with ceil(median |e|) as the tolerance, at least half the days hit by construction.

- [ ] **Step 7: Commit**

```bash
git add backend/src/forecast backend/tests/forecast/engine.test.ts
git commit -m "feat(forecast): buildForecast with gates, levers and what-if grid"
```

---

### Task 6: Loader, `GET /me/forecast` and mounting

**Files:**
- Create: `backend/src/forecast/load.ts`, `backend/src/forecast/routes.ts`
- Modify: `backend/src/app.ts` (add an import next to `scoresRouter` at `:7`; add `app.use(forecastRouter);` after `app.use(scoresRouter);` at `:29`)
- Test: `backend/tests/forecast/routes.test.ts`

**Interfaces:**
- Consumes: `buildForecast` (Task 5); `prisma` (`db/client`); `localCivilDate`, `civilDateToUtcMidnight` (`biometrics/civilDate.ts`); `loadFactorSeries`, `loadAnalysisInput` (`habits/analysis.ts`); `listHabitTypes` (`habits/habitTypes.ts`); `habitDayFor` (`habits/habitDay.ts`); `resolveSleepGoalMinutes` (`users/goals.ts`); `getLiveConfig`; `requireAuth`, `AuthedRequest`. Test helpers: `createUser`, `seedHistory` (`tests/scoring/dbHelpers.ts`), `authHeaderFor` (`tests/helpers/auth.ts`), `migrateTestDb` (`tests/setupTestDb.ts`), `rescoreUser` (`scripts/rescoreUser.ts`).
- Produces:
  - `loadForecastData(userId: string, now: Date): Promise<ForecastData>`
  - `forecastRouter` with `GET /me/forecast`

- [ ] **Step 1: Write the failing tests `backend/tests/forecast/routes.test.ts`**

```ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { loadForecastData } from '../../src/forecast/load';
import { shiftDate } from '../../src/scoring/dates';
import { rescoreUser } from '../../scripts/rescoreUser';
import { authHeaderFor } from '../helpers/auth';
import { createUser, seedHistory } from '../scoring/dbHelpers';
import { migrateTestDb } from '../setupTestDb';

const NOW = new Date('2026-06-30T12:00:00Z');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY ??= 'a'.repeat(64);
});

describe('GET /me/forecast', () => {
  it('requires auth', async () => {
    await request(createApp()).get('/me/forecast').expect(401);
  });

  it('returns NOT_ENOUGH_DATA for a new user', async () => {
    const user = await createUser();
    const res = await request(createApp()).get('/me/forecast').set(await authHeaderFor(user.id)).expect(200);
    expect(res.body).toEqual({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 0 });
  });

  it('returns READY with a 13-cell grid once 40 days are scored', async () => {
    const user = await createUser();
    const today = new Date().toISOString().slice(0, 10);
    await seedHistory(user.id, shiftDate(today, -39), 40);
    await rescoreUser(user.id, { days: 40 });
    const res = await request(createApp()).get('/me/forecast').set(await authHeaderFor(user.id)).expect(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.date).toBe(shiftDate(today, 1));
    expect(res.body.grid).toHaveLength(13);
    expect(res.body.levers.map((l: { key: string }) => l.key)).toEqual(['SLEEP', 'ALCOHOL', 'CAFFEINE', 'WORKOUT']);
  });
});

describe('loadForecastData', () => {
  // Review Focus 1
  it("uses the user's local date, not the UTC date", async () => {
    const user = await createUser({ timezone: 'Pacific/Kiritimati' }); // UTC+14
    const data = await loadForecastData(user.id, NOW);
    expect(data.today).toBe('2026-07-01');
  });

  it('reads sleep keyed by the local night-end date and the stored Recovery scores', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-06-01', 30);
    await rescoreUser(user.id, { days: 30, now: NOW });
    const data = await loadForecastData(user.id, NOW);
    expect(data.sleep.length).toBeGreaterThanOrEqual(28);
    expect(data.sleep.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))).toBe(true);
    expect(data.scores.size).toBeGreaterThan(0);
    expect(data.habitTypes.map((t) => t.type)).toEqual(['ALCOHOL', 'CAFFEINE', 'WORKOUT']);
  });
});
```

If `seedHistory`'s `start` parameter takes a `Date` rather than a civil-date string, pass `new Date(\`${date}T00:00:00Z\`)` instead. Check its signature in `tests/scoring/dbHelpers.ts` before running the tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/forecast/routes.test.ts`
Expected: FAIL with "Cannot find module '../../src/forecast/load'".

- [ ] **Step 3: Implement `backend/src/forecast/load.ts`**

```ts
// The forecast's only DB access: gathers one user's inputs into ForecastData.
import { civilDateToUtcMidnight, localCivilDate } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { loadAnalysisInput, loadFactorSeries } from '../habits/analysis';
import { ANALYSIS_WINDOW_DAYS } from '../habits/config';
import { habitDayFor } from '../habits/habitDay';
import { listHabitTypes } from '../habits/habitTypes';
import { getLiveConfig } from '../scoring/configs';
import { shiftDate } from '../scoring/dates';
import { resolveSleepGoalMinutes } from '../users/goals';
import type { ForecastData, ForecastFactor } from './types';

const civil = (d: Date) => d.toISOString().slice(0, 10);

export async function loadForecastData(userId: string, now: Date): Promise<ForecastData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, sleepGoalMinutes: true },
  });
  const tz = user.timezone ?? 'UTC';
  const today = localCivilDate(now, tz);
  const cfg = getLiveConfig();
  // Enough history for the 14-night debt window plus its baseline, over the whole analysis window.
  const from = shiftDate(today, -(ANALYSIS_WINDOW_DAYS + cfg.historyDays + cfg.sleepDebtWindowDays));

  const [sleepRows, factorSeries, scoreRows, habitTypes, analysis, confirmedRows] = await Promise.all([
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(today) } },
      orderBy: { recordedAt: 'asc' },
    }),
    loadFactorSeries(userId, shiftDate(today, -ANALYSIS_WINDOW_DAYS), today),
    prisma.dailyScore.findMany({
      where: { userId, type: 'RECOVERY', algorithmVersion: cfg.version, date: { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(today) } },
    }),
    listHabitTypes(userId),
    loadAnalysisInput(userId, now),
    prisma.habitCorrelation.findMany({
      where: { userId, status: 'CONFIRMED', lagDays: 1, factor: { in: ['HRV', 'RHR'] } },
      select: { habitType: true, factor: true },
    }),
  ]);

  const habitDay = habitDayFor(now, tz);
  const todayLogs = await prisma.habitLog.findMany({
    where: { userId, habitDay: civilDateToUtcMidnight(habitDay) },
    select: { habitType: true, value: true },
  });
  const todayHabitTotals: Record<string, number> = {};
  for (const log of todayLogs) todayHabitTotals[log.habitType] = (todayHabitTotals[log.habitType] ?? 0) + log.value;

  const empty = new Map();
  return {
    today,
    cfg,
    sleepGoalMinutes: resolveSleepGoalMinutes(user.sleepGoalMinutes),
    sleep: sleepRows.map((r) => ({ date: civil(r.recordedAt), value: r.value })),
    factors: { HRV: factorSeries.HRV ?? empty, RHR: factorSeries.RHR ?? empty },
    scores: new Map(scoreRows.map((s) => [civil(s.date), { score: s.score, confidence: s.confidenceLevel }])),
    habitTypes,
    observations: new Map(analysis.input.habits.map((h) => [h.habitType, h.observations])),
    confirmed: confirmedRows.map((r) => ({ habitType: r.habitType, factor: r.factor as ForecastFactor })),
    todayHabitTotals,
  };
}
```

- [ ] **Step 4: Implement `backend/src/forecast/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { buildForecast } from './engine';
import { loadForecastData } from './load';

export const forecastRouter = Router();

// Tomorrow's Recovery forecast with the full what-if grid (spec section 2). Read-only.
forecastRouter.get('/me/forecast', requireAuth, async (req: AuthedRequest, res) => {
  const data = await loadForecastData(req.userId!, new Date());
  res.json(buildForecast(data));
});
```

- [ ] **Step 5: Mount the router in `backend/src/app.ts`**

Add `import { forecastRouter } from './forecast/routes';` after the `scoresRouter` import, and `app.use(forecastRouter);` directly after `app.use(scoresRouter);`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/forecast`
Expected: PASS. If `tsc` complains that `loadFactorSeries` takes `Date`s rather than strings, match its signature in `habits/analysis.ts:35`: pass the same kind of values `loadAnalysisInput` passes it.

- [ ] **Step 7: Run the full backend suite and typecheck**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: PASS with no type errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/forecast backend/src/app.ts backend/tests/forecast/routes.test.ts
git commit -m "feat(forecast): GET /me/forecast"
```

---

### Task 7: Demo data generator and seed script

**Files:**
- Create: `backend/src/demo/generate.ts` (pure), `backend/src/demo/account.ts` (auth I/O), `backend/src/demo/persist.ts` (row I/O), `backend/scripts/seedDemoUser.ts` (orchestration + CLI)
- Test: `backend/tests/demo/generate.test.ts`, `backend/tests/demo/seedDemoUser.test.ts` (it exercises `account.ts` and `persist.ts` end to end)
- Modify: `docs/superpowers/specs/2026-09-28-recovery-forecast-design.md` §4 (the run command becomes `ts-node`; the history ends **today**, because the forecast needs today's score)

**Interfaces:**
- Consumes: `prisma`; `auth` (`auth/auth.ts`, Better Auth: `auth.$context` → `internalAdapter`, `password.hash`); `deleteUserAccount` (`users/deletion.ts`); `rescoreUser` (`scripts/rescoreUser.ts`); `runHabitCorrelations` (`habits/job.ts`); `civilDateToUtcMidnight`; `seededRandom`, `gaussian` (reimplemented in `src/demo`, because `src` must not import from `tests`); `loadForecastData`, `buildForecast` (test only).
- Produces:
  - `generateDemoHistory(opts: { seed: number; endDate: string; days: number }): DemoHistory`
  - `createDemoAccount(email: string, password: string): Promise<{ userId: string }>`
  - `writeDemoHistory(userId: string, history: DemoHistory): Promise<void>`
  - `seedDemoUser(opts: { email: string; password: string; seed?: number; now?: Date; force?: boolean }): Promise<{ userId: string }>`
  - `parseArgs(argv: string[]): { email: string; seed: number; force: boolean }`

- [ ] **Step 1: Write the failing generator tests `backend/tests/demo/generate.test.ts`**

```ts
import { generateDemoHistory } from '../../src/demo/generate';

const h = generateDemoHistory({ seed: 42, endDate: '2026-06-30', days: 90 });

describe('generateDemoHistory', () => {
  it('is deterministic for a seed', () => {
    expect(generateDemoHistory({ seed: 42, endDate: '2026-06-30', days: 90 })).toEqual(h);
  });

  it('has one value per day for every metric, ending on endDate', () => {
    for (const s of [h.hrv, h.rhr, h.steps, h.sleep]) {
      expect(s).toHaveLength(90);
      expect(s.at(-1)!.date).toBe('2026-06-30');
    }
    expect(h.sessions).toHaveLength(90);
    expect(h.checkInDays).toHaveLength(90);
  });

  it('plants the alcohol effect on next-day HRV and RHR', () => {
    const drinkDays = new Set(h.habitLogs.filter((l) => l.habitType === 'ALCOHOL' && l.value >= 2).map((l) => l.habitDay));
    const after = (s: { date: string; value: number }[], exposed: boolean) => {
      const vals = s.slice(1).filter((p, i) => drinkDays.has(s[i]!.date) === exposed).map((p) => p.value);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    expect(drinkDays.size).toBeGreaterThanOrEqual(15);
    expect(after(h.hrv, true)).toBeLessThan(after(h.hrv, false) - 3);
    expect(after(h.rhr, true)).toBeGreaterThan(after(h.rhr, false) + 1.5);
  });

  it('keeps values physiologically plausible', () => {
    expect(h.hrv.every((p) => p.value > 20 && p.value < 120)).toBe(true);
    expect(h.rhr.every((p) => p.value > 40 && p.value < 80)).toBe(true);
    expect(h.sleep.every((p) => p.value > 180 && p.value < 660)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test -- tests/demo/generate.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `backend/src/demo/generate.ts`**

```ts
// Synthetic showcase history (spec section 4). Pure and deterministic per seed.
// Planted effects on the NEXT day: alcohol >= 2 drinks -> HRV -10%, RHR +3 bpm;
// workout -> HRV +4%; caffeine -> nothing. Timezone is UTC.
import { dateRange, shiftDate } from '../scoring/dates';
import type { DailyPoint } from '../scoring/types';

export interface DemoHistory {
  hrv: DailyPoint[];
  rhr: DailyPoint[];
  steps: DailyPoint[];
  /** Minutes asleep keyed by the date the night ends. */
  sleep: DailyPoint[];
  sessions: Array<{ startTime: Date; endTime: Date; minutesAsleep: number }>;
  habitLogs: Array<{ habitType: 'ALCOHOL' | 'CAFFEINE' | 'WORKOUT'; value: number; unit: string; habitDay: string }>;
  checkInDays: string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday

export function generateDemoHistory({ seed, endDate, days }: { seed: number; endDate: string; days: number }): DemoHistory {
  const rand = mulberry32(seed);
  const dates = dateRange(shiftDate(endDate, -(days - 1)), endDate);
  const out: DemoHistory = { hrv: [], rhr: [], steps: [], sleep: [], sessions: [], habitLogs: [], checkInDays: [] };

  // Habits first, so day d can read habit day d - 1.
  const drank = new Map<string, boolean>();
  const trained = new Map<string, boolean>();
  for (const day of [shiftDate(dates[0]!, -1), ...dates]) {
    const weekendEvening = dow(day) === 5 || dow(day) === 6;
    const drinks = rand() < (weekendEvening ? 0.55 : 0.12) ? 2 + Math.floor(rand() * 3) : rand() < 0.3 ? 1 : 0;
    const workout = rand() < 0.57 ? 30 + Math.floor(rand() * 31) : 0;
    const cups = 1 + Math.floor(rand() * 4);
    drank.set(day, drinks >= 2);
    trained.set(day, workout >= 20);
    if (day < dates[0]!) continue;
    out.checkInDays.push(day);
    if (drinks > 0) out.habitLogs.push({ habitType: 'ALCOHOL', value: drinks, unit: 'drinks', habitDay: day });
    if (workout > 0) out.habitLogs.push({ habitType: 'WORKOUT', value: workout, unit: 'minutes', habitDay: day });
    out.habitLogs.push({ habitType: 'CAFFEINE', value: cups, unit: 'cups', habitDay: day });
  }

  let r = 0;
  for (const date of dates) {
    const prev = shiftDate(date, -1);
    r = 0.6 * r + 0.6 * gauss(rand);
    const alcohol = drank.get(prev)!;
    const workout = trained.get(prev)!;
    const weekendNight = dow(date) === 6 || dow(date) === 0; // nights ending Sat/Sun
    const sleepMin = Math.min(620, Math.max(200, 60 * (7.2 - (weekendNight ? 0.6 : 0) - (alcohol ? 0.3 : 0) + 0.6 * gauss(rand))));
    const hrv = 55 * (1 + 0.12 * r) * (alcohol ? 0.9 : 1) * (workout ? 1.04 : 1) + 1.5 * gauss(rand);
    const rhr = 58 - 2.5 * r + (alcohol ? 3 : 0) + 0.8 * gauss(rand);
    const steps = Math.max(500, Math.round(8000 - (dow(date) === 0 || dow(date) === 6 ? 1500 : 0) + 1500 * gauss(rand)));

    const end = new Date(`${date}T06:45:00Z`);
    end.setUTCMinutes(end.getUTCMinutes() + Math.round(20 * gauss(rand)));
    const start = new Date(end.getTime() - (sleepMin + 25) * 60_000);

    out.hrv.push({ date, value: round1(hrv) });
    out.rhr.push({ date, value: round1(rhr) });
    out.steps.push({ date, value: steps });
    out.sleep.push({ date, value: Math.round(sleepMin) });
    out.sessions.push({ startTime: start, endTime: end, minutesAsleep: Math.round(sleepMin) });
  }
  return out;
}
```

- [ ] **Step 4: Run the generator tests to verify they pass**

Run: `cd backend && npm test -- tests/demo/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing seed integration test `backend/tests/demo/seedDemoUser.test.ts`**

```ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { buildForecast } from '../../src/forecast/engine';
import { loadForecastData } from '../../src/forecast/load';
import { parseArgs, seedDemoUser } from '../../scripts/seedDemoUser';
import { migrateTestDb } from '../setupTestDb';

const EMAIL = 'demo-seed@example.com';
const PASSWORD = 'demo-password-123';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY ??= 'a'.repeat(64);
});

describe('seedDemoUser', () => {
  jest.setTimeout(120_000);

  it('refuses to run in production without --force', async () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await expect(seedDemoUser({ email: EMAIL, password: PASSWORD })).rejects.toThrow(/production/);
    process.env.NODE_ENV = env;
  });

  it('builds a showcase account the real pipelines turn into a READY forecast', async () => {
    const { userId } = await seedDemoUser({ email: EMAIL, password: PASSWORD, seed: 7 });
    const f = buildForecast(await loadForecastData(userId, new Date()));
    if (f.status !== 'READY') throw new Error(`forecast not ready: ${JSON.stringify(f)}`);

    expect(f.levers.find((l) => l.key === 'ALCOHOL')!.effect).toBe('CONFIRMED');
    expect(f.levers.find((l) => l.key === 'CAFFEINE')!.effect).toBe('NONE_YET');
    expect(f.trackRecord.days).toBeGreaterThanOrEqual(25);
    const at = (exposed: boolean) =>
      f.grid.find((c) => c.sleepHours === 7.5 && c.exposed.includes('ALCOHOL') === exposed && c.exposed.length === (exposed ? 1 : 0))!;
    expect(at(true).score).toBeLessThan(at(false).score);

    // No sync connection, so the worker never touches it.
    expect(await prisma.healthConnection.count({ where: { userId } })).toBe(0);
  });

  it('is idempotent and the account can sign in with email and password', async () => {
    const first = await seedDemoUser({ email: EMAIL, password: PASSWORD, seed: 7 });
    const second = await seedDemoUser({ email: EMAIL, password: PASSWORD, seed: 7 });
    expect(second.userId).not.toBe(first.userId);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
    await request(createApp())
      .post('/auth/sign-in/email')
      .set({ 'expo-origin': 'biometrics://' })
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
  });

  it('parses CLI args', () => {
    expect(parseArgs(['--email', 'a@b.c'])).toEqual({ email: 'a@b.c', seed: 1, force: false });
    expect(parseArgs(['--email', 'a@b.c', '--seed', '9', '--force'])).toEqual({ email: 'a@b.c', seed: 9, force: true });
    expect(() => parseArgs([])).toThrow(/--email/);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/demo/seedDemoUser.test.ts`
Expected: FAIL with "Cannot find module '../../scripts/seedDemoUser'".

- [ ] **Step 7: Implement `backend/src/demo/account.ts`**

```ts
// The demo account: replaces any existing user with this email, then creates a
// verified Better Auth user with an email/password credential. Auth I/O only.
import { auth } from '../auth/auth';
import { prisma } from '../db/client';
import { deleteUserAccount } from '../users/deletion';

export async function createDemoAccount(email: string, password: string): Promise<{ userId: string }> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) await deleteUserAccount(existing.id);

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: 'Demo User', emailVerified: true });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  await prisma.user.update({ where: { id: user.id }, data: { timezone: 'UTC' } });
  return { userId: user.id };
}
```

- [ ] **Step 8: Implement `backend/src/demo/persist.ts`**

```ts
// Writes a generated DemoHistory as raw input rows, exactly the shapes the sync
// worker would have written. Never writes derived tables (scores, features,
// correlations): those come from running the real pipelines afterwards.
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { DemoHistory } from './generate';

export async function writeDemoHistory(userId: string, h: DemoHistory): Promise<void> {
  const records = [
    ...h.hrv.map((p) => ({ metricType: 'HRV' as const, ...p })),
    ...h.rhr.map((p) => ({ metricType: 'RESTING_HR' as const, ...p })),
    ...h.steps.map((p) => ({ metricType: 'STEPS' as const, ...p })),
    ...h.sleep.map((p) => ({ metricType: 'SLEEP' as const, ...p })),
  ];
  await prisma.$transaction([
    prisma.biometricRecord.createMany({
      data: records.map((r) => ({ userId, metricType: r.metricType, value: r.value, recordedAt: civilDateToUtcMidnight(r.date) })),
    }),
    prisma.sleepSession.createMany({
      data: h.sessions.map((s) => ({ userId, ...s, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 })),
    }),
    prisma.habitLog.createMany({
      data: h.habitLogs.map((l) => ({
        userId,
        habitType: l.habitType,
        value: l.value,
        unit: l.unit,
        habitDay: civilDateToUtcMidnight(l.habitDay),
        loggedAt: new Date(`${l.habitDay}T20:00:00Z`),
      })),
    }),
    prisma.habitCheckIn.createMany({
      data: h.checkInDays.map((d) => ({ userId, habitDay: civilDateToUtcMidnight(d) })),
    }),
  ]);
}
```

- [ ] **Step 9: Implement `backend/scripts/seedDemoUser.ts`** (orchestration only)

```ts
// Creates (or recreates) a showcase account with 90 days of synthetic history,
// then runs the REAL scoring and habit pipelines over it (spec section 4).
//
//   DEMO_USER_PASSWORD=... npx ts-node scripts/seedDemoUser.ts --email demo@example.com [--seed 1] [--force]
//
// Writes only raw inputs; never DailyScore, UserDailyFeatures or HabitCorrelation.
// Refuses to run with NODE_ENV=production unless --force.
// Never runs on import: the CLI entry point is guarded by require.main.
import { prisma } from '../src/db/client';
import { createDemoAccount } from '../src/demo/account';
import { generateDemoHistory } from '../src/demo/generate';
import { writeDemoHistory } from '../src/demo/persist';
import { runHabitCorrelations } from '../src/habits/job';
import { rescoreUser } from './rescoreUser';

const DAYS = 90;
const WEEK_MS = 7 * 86_400_000;

export async function seedDemoUser({
  email,
  password,
  seed = 1,
  now = new Date(),
  force = false,
}: { email: string; password: string; seed?: number; now?: Date; force?: boolean }): Promise<{ userId: string }> {
  if (process.env.NODE_ENV === 'production' && !force) {
    throw new Error('Refusing to seed a demo user in production without --force');
  }

  const { userId } = await createDemoAccount(email, password);
  const today = now.toISOString().slice(0, 10);
  await writeDemoHistory(userId, generateDemoHistory({ seed, endDate: today, days: DAYS }));

  await rescoreUser(userId, { days: DAYS, now });
  // CONFIRMED needs two consecutive weekly passes; replay three weeks, as the weekly job would have.
  for (const weeksAgo of [2, 1, 0]) {
    await runHabitCorrelations(userId, { now: new Date(now.getTime() - weeksAgo * WEEK_MS) });
  }
  return { userId };
}

export function parseArgs(argv: string[]): { email: string; seed: number; force: boolean } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const email = get('--email');
  if (!email) throw new Error('Usage: seedDemoUser --email <email> [--seed N] [--force]');
  return { email, seed: Number(get('--seed') ?? 1), force: argv.includes('--force') };
}

async function main() {
  const { email, seed, force } = parseArgs(process.argv.slice(2));
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) throw new Error('Set DEMO_USER_PASSWORD');
  try {
    const { userId } = await seedDemoUser({ email, password, seed, force });
    console.log(`Seeded demo user ${email} (${userId})`);
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
```

- [ ] **Step 10: Run the seed test**

Run: `cd backend && npm test -- tests/demo`
Expected: PASS.

If ALCOHOL is not `CONFIRMED`, inspect `prisma.habitCorrelation.findMany({ where: { userId } })` for its `r`, `qValue` and `consecutivePasses`:
- If `consecutivePasses` is 1, the weekly replay is not advancing `runKey`. Check that `isoWeekKey` differs for the three `now` values.
- If `|r|` is below 0.3, raise the planted HRV effect from 0.9 to 0.85 in `generate.ts` and update the generator test's threshold to match.

The next two fixes both belong in `account.ts`:
- If sign-in fails with 403, the Better Auth `emailVerified` flag was not set. Add `await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })`.
- If `internalAdapter.linkAccount` is not a function in Better Auth 1.7.5, use `ctx.internalAdapter.createAccount({ userId, providerId: 'credential', accountId: userId, password })`.

- [ ] **Step 11: Update spec §4 to match**

In `docs/superpowers/specs/2026-09-28-recovery-forecast-design.md` §4:
- Replace `npx tsx scripts/seedDemoUser.ts` with `npx ts-node scripts/seedDemoUser.ts`.
- Replace "Generative model (90 days ending yesterday)" with "Generative model (90 days ending today — the forecast needs today's score)".
- Add to §1.5: "The backtest uses today's CONFIRMED set; effect sizes are refitted on the truncated history."

- [ ] **Step 12: Typecheck and commit**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

```bash
git add backend/src/demo backend/scripts/seedDemoUser.ts backend/tests/demo docs/superpowers/specs/2026-09-28-recovery-forecast-design.md
git commit -m "feat(demo): synthetic showcase account seeded through the real pipelines"
```

---

### Task 8: Mobile slider with threshold haptics

**Files:**
- Modify: `mobile/package.json` (via `expo install`), `mobile/jest-setup.js`, `mobile/src/navigation/RootNavigator.tsx:101` (wrap the returned `NavigationContainer`)
- Create: `mobile/src/components/ui/slider.tsx`
- Test: `mobile/__tests__/components/Slider.test.tsx`

**Interfaces:**
- Consumes: `Gesture`, `GestureDetector`, `GestureHandlerRootView` (react-native-gesture-handler); `Haptics.selectionAsync` (expo-haptics).
- Produces:
  - `Slider(props: SliderProps)`
  - `snapValue(raw: number, min: number, max: number, step: number): number`
  - `crossedThreshold(prev: number, next: number, threshold?: number): boolean`

- [ ] **Step 1: Install the native dependencies**

Run: `cd mobile && npx expo install react-native-gesture-handler expo-haptics`
Expected: both appear in `mobile/package.json` dependencies at SDK-57-compatible versions.

- [ ] **Step 2: Add the jest setup lines to `mobile/jest-setup.js`**

Append:

```js
require('react-native-gesture-handler/jestSetup');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
```

- [ ] **Step 3: Wrap the app in `GestureHandlerRootView`**

In `mobile/src/navigation/RootNavigator.tsx`, add `import { GestureHandlerRootView } from 'react-native-gesture-handler';`. Then wrap the signed-in return at `:100-126`:

```tsx
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        {/* ...unchanged children... */}
      </NavigationContainer>
    </GestureHandlerRootView>
  );
```

- [ ] **Step 4: Write the failing tests `mobile/__tests__/components/Slider.test.tsx`**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Slider, crossedThreshold, snapValue } from '../../src/components/ui/slider';

describe('snapValue', () => {
  it('snaps to the step and clamps to the range', () => {
    expect(snapValue(7.3, 4, 10, 0.5)).toBe(7.5);
    expect(snapValue(7.2, 4, 10, 0.5)).toBe(7);
    expect(snapValue(12, 4, 10, 0.5)).toBe(10);
    expect(snapValue(-3, 0, 6, 1)).toBe(0);
  });
});

describe('crossedThreshold', () => {
  it('is true only when the value moves across the threshold', () => {
    expect(crossedThreshold(1, 2, 2)).toBe(true);
    expect(crossedThreshold(2, 1, 2)).toBe(true);
    expect(crossedThreshold(2, 3, 2)).toBe(false);
    expect(crossedThreshold(0, 1, undefined)).toBe(false);
  });
});

describe('Slider', () => {
  const props = {
    value: 1,
    min: 0,
    max: 6,
    step: 1,
    threshold: 2,
    accessibilityLabel: 'Alcohol',
    formatValue: (v: number) => `${v} drinks`,
    testID: 'slider',
  };

  it('is adjustable and announces its value', () => {
    render(<Slider {...props} onChange={jest.fn()} />);
    const s = screen.getByTestId('slider');
    expect(s.props.accessibilityRole).toBe('adjustable');
    expect(s.props.accessibilityValue).toMatchObject({ min: 0, max: 6, now: 1, text: '1 drinks' });
  });

  it('increments and decrements through accessibility actions, with a haptic at the threshold', () => {
    const onChange = jest.fn();
    render(<Slider {...props} onChange={onChange} />);
    fireEvent(screen.getByTestId('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByTestId('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('does not go past its bounds', () => {
    const onChange = jest.fn();
    render(<Slider {...props} value={6} onChange={onChange} />);
    fireEvent(screen.getByTestId('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd mobile && npx jest __tests__/components/Slider.test.tsx`
Expected: FAIL with "Cannot find module '../../src/components/ui/slider'".

- [ ] **Step 6: Implement `mobile/src/components/ui/slider.tsx`**

```tsx
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Draws a tick and fires a haptic when a change crosses it. */
  threshold?: number;
  /** Greyed look; still interactive. */
  muted?: boolean;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  formatValue: (value: number) => string;
  testID?: string;
}

export function snapValue(raw: number, min: number, max: number, step: number): number {
  const snapped = Math.round((raw - min) / step) * step + min;
  return Math.round(Math.min(max, Math.max(min, snapped)) * 1e6) / 1e6;
}

export function crossedThreshold(prev: number, next: number, threshold?: number): boolean {
  return threshold !== undefined && prev < threshold !== next < threshold;
}

const THUMB = 24;

export function Slider({ value, min, max, step, threshold, muted, onChange, accessibilityLabel, formatValue, testID }: SliderProps) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  last.current = value;

  const commit = (next: number) => {
    if (next === last.current) return;
    if (crossedThreshold(last.current, next, threshold)) void Haptics.selectionAsync();
    last.current = next;
    onChange(next);
  };

  const fromX = (x: number) => (width === 0 ? value : snapValue(min + (x / width) * (max - min), min, max, step));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => commit(fromX(e.x)))
    .onUpdate((e) => commit(fromX(e.x)));

  const fraction = (value - min) / (max - min);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(fraction * width - THUMB / 2, { duration: 90 }) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: withTiming(fraction * width, { duration: 90 }) }));

  return (
    <GestureDetector gesture={pan}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
          commit(snapValue(value + dir * step, min, max, step));
        }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        className="h-10 justify-center"
      >
        <View className={`h-1.5 rounded-full ${muted ? 'bg-muted/40' : 'bg-muted'}`} />
        <Animated.View style={fillStyle} className={`absolute h-1.5 rounded-full ${muted ? 'bg-muted-foreground/40' : 'bg-primary'}`} />
        {threshold !== undefined && width > 0 ? (
          <View
            testID={testID ? `${testID}-threshold` : undefined}
            style={{ left: ((threshold - min) / (max - min)) * width - 1 }}
            className="absolute h-4 w-0.5 rounded bg-foreground/50"
          />
        ) : null}
        <Animated.View
          style={[thumbStyle, { width: THUMB, height: THUMB }]}
          className={`absolute rounded-full border-2 ${muted ? 'border-muted-foreground/40 bg-card' : 'border-primary bg-card'}`}
        />
      </View>
    </GestureDetector>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd mobile && npx jest __tests__/components/Slider.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the whole mobile suite** (the root wrapper and jest setup touch everything)

Run: `cd mobile && npx jest`
Expected: PASS. If a `RootNavigator` test fails on `GestureHandlerRootView`, the jest setup line from Step 2 is missing or placed before the worklets mock. Move it to the end of `jest-setup.js`.

- [ ] **Step 9: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/jest-setup.js mobile/src/navigation/RootNavigator.tsx mobile/src/components/ui/slider.tsx mobile/__tests__/components/Slider.test.tsx
git commit -m "feat(mobile): accessible snapping slider with threshold haptics"
```

---

### Task 9: Mobile forecast API, grid lookup, data hook and copy

**Files:**
- Create: `mobile/src/api/forecast.ts`, `mobile/src/lib/forecastGrid.ts`, `mobile/src/lib/forecastCopy.ts`, `mobile/src/lib/useForecast.ts`
- Test: `mobile/__tests__/api/forecast.test.ts`, `mobile/__tests__/lib/forecastGrid.test.ts`, `mobile/__tests__/lib/useForecast.test.tsx`, fixture `mobile/jest-mocks/forecastFixture.ts`

**Interfaces:**
- Consumes: `apiFetch` (`src/api/client`); `ConfidenceLevel` (`src/api/scores`).
- Produces:
  - `ForecastDTO`, `ReadyForecastDTO`, `ForecastCellDTO`, `ForecastLeverDTO`
  - `fetchForecast(): Promise<ForecastDTO>`
  - `LeverValues = { sleepHours: number; habits: Record<string, number> }`
  - `snapSleep(h: number): number`
  - `exposedFor(levers: ForecastLeverDTO[], habits: Record<string, number>): string[]`
  - `findCell(f: ReadyForecastDTO, v: LeverValues): ForecastCellDTO`
  - `contributionLabel(key: string, f: ReadyForecastDTO, v: LeverValues): string`
  - `FORECAST_COPY` (every user-facing forecast string) and `FORECAST_MIN_DAYS = 21`
  - `ForecastState = { status: 'loading' } | { status: 'error' } | { status: 'loaded'; forecast: ForecastDTO }`
  - `useForecast(refreshKey?: unknown): ForecastState`: the only place a component loads the forecast. It refetches when `refreshKey` changes and keeps showing the previous result while the refetch is in flight.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/api/forecast.test.ts`:

```ts
import { apiFetch } from '../../src/api/client';
import { fetchForecast } from '../../src/api/forecast';

jest.mock('../../src/api/client', () => ({ ...jest.requireActual('../../src/api/client'), apiFetch: jest.fn() }));

describe('fetchForecast', () => {
  it('GETs /me/forecast and returns both variants unchanged', async () => {
    const notEnough = { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 4 };
    (apiFetch as jest.Mock).mockResolvedValueOnce(notEnough);
    await expect(fetchForecast()).resolves.toEqual(notEnough);
    expect(apiFetch).toHaveBeenCalledWith('/me/forecast');
  });
});
```

`mobile/jest-mocks/forecastFixture.ts` (shared fixture; outside `__tests__` so jest does not run it as a suite):

```ts
import type { ReadyForecastDTO } from '../src/api/forecast';

const sleeps = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const READY: ReadyForecastDTO = {
  status: 'READY',
  date: '2026-07-01',
  algorithmVersion: 'v3',
  defaults: { sleepHours: 7.5, habits: { ALCOHOL: 0, CAFFEINE: 1, WORKOUT: 0 } },
  levers: [
    { key: 'SLEEP', label: 'Sleep', unit: 'hours', min: 4, max: 10, step: 0.5, effect: 'CONFIRMED' },
    { key: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', min: 0, max: 6, step: 1, threshold: 2, effect: 'CONFIRMED' },
    { key: 'CAFFEINE', label: 'Caffeine', unit: 'cups', min: 0, max: 6, step: 1, threshold: 3, effect: 'NONE_YET' },
    { key: 'WORKOUT', label: 'Workout', unit: 'minutes', min: 0, max: 120, step: 10, threshold: 20, effect: 'NONE_YET' },
  ],
  grid: sleeps.flatMap((sleepHours) =>
    [[], ['ALCOHOL']].map((exposed) => ({
      sleepHours,
      exposed,
      score: 50 + sleepHours * 3 - (exposed.length ? 9 : 0),
      band: [40, 80] as [number, number],
      confidence: 'HIGH' as const,
      contributions: [
        { key: 'CARRY_OVER', points: 2 },
        { key: 'SLEEP', points: sleepHours * 3 - 2 },
        ...(exposed.length ? [{ key: 'ALCOHOL', points: -9 }] : []),
      ],
    })),
  ),
  trackRecord: { withinPoints: 6, hits: 24, days: 30, series: [] },
};
```

`mobile/__tests__/lib/forecastGrid.test.ts`:

```ts
import { READY } from '../../jest-mocks/forecastFixture';
import { contributionLabel, exposedFor, findCell, snapSleep } from '../../src/lib/forecastGrid';

describe('forecastGrid', () => {
  it('snapSleep rounds to 0.5 h inside 4-10 (Review Focus 5)', () => {
    expect(snapSleep(7.3)).toBe(7.5);
    expect(snapSleep(3.7)).toBe(4);
    expect(snapSleep(11)).toBe(10);
  });

  it('exposes only CONFIRMED habits at or above threshold', () => {
    expect(exposedFor(READY.levers, { ALCOHOL: 2, CAFFEINE: 6, WORKOUT: 60 })).toEqual(['ALCOHOL']);
    expect(exposedFor(READY.levers, { ALCOHOL: 1 })).toEqual([]);
  });

  it('finds the matching cell regardless of habit order or off-grid sleep', () => {
    expect(findCell(READY, { sleepHours: 7.5, habits: { ALCOHOL: 3 } }).score).toBe(50 + 22.5 - 9);
    expect(findCell(READY, { sleepHours: 11, habits: {} }).sleepHours).toBe(10);
    expect(findCell(READY, { sleepHours: 3.7, habits: { CAFFEINE: 5 } }).exposed).toEqual([]);
  });

  it('labels contributions in plain language', () => {
    const v = { sleepHours: 6.5, habits: { ALCOHOL: 3 } };
    expect(contributionLabel('CARRY_OVER', READY, v)).toBe('Recent trend');
    expect(contributionLabel('SLEEP', READY, v)).toBe('Sleep 6.5 h');
    expect(contributionLabel('ALCOHOL', READY, v)).toBe('3 drinks');
    expect(contributionLabel('MYSTERY', READY, v)).toBe('MYSTERY');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npx jest __tests__/api/forecast.test.ts __tests__/lib/forecastGrid.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `mobile/src/api/forecast.ts`**

```ts
import { apiFetch } from './client';
import type { ConfidenceLevel } from './scores';

export type LeverEffect = 'CONFIRMED' | 'NONE_YET' | 'NOT_MODELLED';

export interface ForecastLeverDTO {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  threshold?: number;
  effect: LeverEffect;
}

export interface ForecastCellDTO {
  sleepHours: number;
  exposed: string[];
  score: number;
  band: [number, number];
  confidence: ConfidenceLevel;
  contributions: Array<{ key: string; points: number }>;
}

export interface ReadyForecastDTO {
  status: 'READY';
  date: string;
  algorithmVersion: string;
  defaults: { sleepHours: number; habits: Record<string, number> };
  levers: ForecastLeverDTO[];
  grid: ForecastCellDTO[];
  trackRecord: {
    withinPoints: number;
    hits: number;
    days: number;
    series: Array<{ date: string; forecast: number; actual: number }>;
  };
}

export type ForecastDTO =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | ReadyForecastDTO;

export function fetchForecast(): Promise<ForecastDTO> {
  return apiFetch<ForecastDTO>('/me/forecast');
}
```

- [ ] **Step 4: Implement `mobile/src/lib/forecastGrid.ts`**

```ts
// Pure lookups into the server's precomputed what-if grid: no network while dragging.
import type { ForecastCellDTO, ForecastLeverDTO, ReadyForecastDTO } from '../api/forecast';

export interface LeverValues {
  sleepHours: number;
  habits: Record<string, number>;
}

export function snapSleep(h: number): number {
  return Math.min(10, Math.max(4, Math.round(h * 2) / 2));
}

export function exposedFor(levers: ForecastLeverDTO[], habits: Record<string, number>): string[] {
  return levers
    .filter((l) => l.key !== 'SLEEP' && l.effect === 'CONFIRMED' && l.threshold !== undefined && (habits[l.key] ?? 0) >= l.threshold)
    .map((l) => l.key)
    .sort();
}

export function findCell(f: ReadyForecastDTO, v: LeverValues): ForecastCellDTO {
  const sleep = snapSleep(v.sleepHours);
  const key = exposedFor(f.levers, v.habits).join(',');
  return (
    f.grid.find((c) => c.sleepHours === sleep && [...c.exposed].sort().join(',') === key) ??
    f.grid.find((c) => c.sleepHours === sleep && c.exposed.length === 0) ??
    f.grid[0]!
  );
}

export function contributionLabel(key: string, f: ReadyForecastDTO, v: LeverValues): string {
  if (key === 'CARRY_OVER') return 'Recent trend';
  if (key === 'SLEEP') return `Sleep ${snapSleep(v.sleepHours)} h`;
  const lever = f.levers.find((l) => l.key === key);
  return lever ? `${v.habits[key] ?? 0} ${lever.unit}` : key;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd mobile && npx jest __tests__/api/forecast.test.ts __tests__/lib/forecastGrid.test.ts`
Expected: PASS.

- [ ] **Step 6: Create `mobile/src/lib/forecastCopy.ts`**

```ts
// Every user-facing forecast string, so the Dashboard card and the Forecast
// screen can never drift apart. Components import from here; they never inline copy.
export const FORECAST_MIN_DAYS = 21;

export const FORECAST_COPY = {
  noneYet: 'No measurable effect for you yet',
  disclaimer: 'An estimate from your own history — not medical advice.',
  effectOrder: 'Effects shown in order: recent trend, sleep, habits.',
  unlocksAfter: (days: number) => `Forecast unlocks after ${FORECAST_MIN_DAYS} days of data (${days}/${FORECAST_MIN_DAYS})`,
  lowConfidence: 'Today’s score isn’t confident enough to forecast from yet. Check back after tonight’s sync.',
  band: (lo: number, hi: number) => `Likely ${Math.round(lo)}–${Math.round(hi)}`,
  trackRecord: (within: number, hits: number, days: number) => `Within ±${within} on ${hits} of the last ${days} days`,
  loadError: 'Couldn’t load tomorrow’s forecast. Try again in a moment.',
  unavailable: 'Tomorrow’s forecast is unavailable right now.',
  planCta: 'Plan tomorrow →',
  title: 'Tomorrow',
} as const;
```

- [ ] **Step 7: Write the failing hook test `mobile/__tests__/lib/useForecast.test.tsx`**

```tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { apiFetch } from '../../src/api/client';
import { useForecast } from '../../src/lib/useForecast';
import { READY } from '../../jest-mocks/forecastFixture';

jest.mock('../../src/api/client', () => ({ ...jest.requireActual('../../src/api/client'), apiFetch: jest.fn() }));

describe('useForecast', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  it('goes loading -> loaded', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    const { result } = renderHook(() => useForecast());
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'loaded', forecast: READY }));
  });

  it('reports errors', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useForecast());
    await waitFor(() => expect(result.current).toEqual({ status: 'error' }));
  });

  it('refetches when refreshKey changes and keeps the last result meanwhile', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    const { result, rerender } = renderHook(({ k }) => useForecast(k), { initialProps: { k: 0 } });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    (apiFetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    rerender({ k: 1 });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loaded');
  });
});
```

Run: `cd mobile && npx jest __tests__/lib/useForecast.test.tsx`
Expected: FAIL with "Cannot find module '../../src/lib/useForecast'".

- [ ] **Step 8: Implement `mobile/src/lib/useForecast.ts`**

```ts
import { useEffect, useState } from 'react';
import { fetchForecast, type ForecastDTO } from '../api/forecast';

export type ForecastState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; forecast: ForecastDTO };

/**
 * The single way screens load the forecast. Pass the sync `dataVersion` (or any
 * key) to refetch after new data arrives; the previous result stays on screen
 * while the refetch is in flight, so cards never flash back to a skeleton.
 */
export function useForecast(refreshKey: unknown = 0): ForecastState {
  const [state, setState] = useState<ForecastState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetchForecast()
      .then((forecast) => {
        if (!cancelled) setState({ status: 'loaded', forecast });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => (prev.status === 'loaded' ? prev : { status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return state;
}
```

Run: `cd mobile && npx jest __tests__/lib`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add mobile/src/api/forecast.ts mobile/src/lib/forecastGrid.ts mobile/src/lib/forecastCopy.ts mobile/src/lib/useForecast.ts mobile/jest-mocks/forecastFixture.ts mobile/__tests__/api/forecast.test.ts mobile/__tests__/lib/forecastGrid.test.ts mobile/__tests__/lib/useForecast.test.tsx
git commit -m "feat(mobile): forecast API client, grid lookup, data hook and copy"
```

---

### Task 10: `ForecastScreen`

**Files:**
- Create: `mobile/src/components/forecast/contribution-bars.tsx`, `mobile/src/components/forecast/track-record-chart.tsx`, `mobile/src/components/forecast/forecast-hero.tsx`, `mobile/src/components/forecast/lever-panel.tsx`, `mobile/src/screens/ForecastScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (add `Forecast: undefined` to `RootStackParamList` at `:35`, and a `<Stack.Screen name="Forecast" component={ForecastScreen} options={{ title: 'Tomorrow' }} />` next to `ScoreDetail` at `:117`)
- Test: `mobile/__tests__/screens/ForecastScreen.test.tsx`

**Interfaces:**
- Consumes: `useForecast`, `FORECAST_COPY`, `findCell`, `contributionLabel`, `LeverValues`, `ReadyForecastDTO`, `ForecastCellDTO`, `ForecastLeverDTO` (Task 9); `Slider` (Task 8); `ScoreRing`, `ConfidenceBadge`, `Card`, `Text`, `Skeleton` (existing UI).
- Produces: `ForecastScreen` (named export; composition only), and these presentational components, which take props and never fetch: `ForecastHero({ cell })`, `LeverPanel({ levers, values, onChange, onReset })`, `ContributionBars({ items })`, `TrackRecordChart({ series, actualColor, forecastColor, height? })`.

- [ ] **Step 1: Write the failing tests `mobile/__tests__/screens/ForecastScreen.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { apiFetch } from '../../src/api/client';
import { ForecastScreen } from '../../src/screens/ForecastScreen';
import { READY } from '../../jest-mocks/forecastFixture';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const increment = (testID: string) =>
  fireEvent(screen.getByTestId(testID), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

describe('ForecastScreen', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  it('renders the default forecast, band and track record', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => expect(screen.getByTestId('forecast-band')).toHaveTextContent('Likely 40–80'));
    expect(screen.getByText('Within ±6 on 24 of the last 30 days')).toBeTruthy();
    expect(screen.getByText('An estimate from your own history — not medical advice.')).toBeTruthy();
  });

  it('updates the forecast locally when a lever crosses the threshold (no refetch)', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-ALCOHOL'));
    const before = screen.getByTestId('forecast-score-value').props.accessibilityLabel;
    increment('lever-ALCOHOL'); // 0 -> 1: below threshold, no change
    expect(screen.getByTestId('forecast-score-value').props.accessibilityLabel).toBe(before);
    increment('lever-ALCOHOL'); // 1 -> 2: crosses
    expect(screen.getByTestId('forecast-score-value').props.accessibilityLabel).not.toBe(before);
    expect(screen.getAllByText('2 drinks').length).toBeGreaterThan(0);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('greys out levers without a measured effect', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-CAFFEINE'));
    expect(screen.getAllByText('No measurable effect for you yet')).toHaveLength(2);
  });

  it('resets every lever to the defaults', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(READY);
    render(<ForecastScreen />);
    await waitFor(() => screen.getByTestId('lever-ALCOHOL'));
    const before = screen.getByTestId('forecast-score-value').props.accessibilityLabel;
    increment('lever-ALCOHOL');
    increment('lever-ALCOHOL');
    fireEvent.press(screen.getByText('Reset'));
    expect(screen.getByTestId('forecast-score-value').props.accessibilityLabel).toBe(before);
  });

  it('shows the not-enough-data state', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 9 });
    render(<ForecastScreen />);
    await waitFor(() => expect(screen.getByText('Forecast unlocks after 21 days of data (9/21)')).toBeTruthy());
  });

  it('shows an error state when the request fails', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('boom'));
    render(<ForecastScreen />);
    await waitFor(() => expect(screen.getByTestId('forecast-error')).toBeTruthy());
  });
});
```

The `READY` fixture comes from `mobile/jest-mocks/forecastFixture.ts` (Task 9).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npx jest __tests__/screens/ForecastScreen.test.tsx`
Expected: FAIL with "Cannot find module '../../src/screens/ForecastScreen'".

- [ ] **Step 3: Implement `mobile/src/components/forecast/contribution-bars.tsx`**

```tsx
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Text } from '../ui/text';

export interface ContributionBarItem {
  key: string;
  label: string;
  points: number;
}

/** Signed horizontal bars, largest |points| first; reorders with a layout transition. */
export function ContributionBars({ items }: { items: ContributionBarItem[] }) {
  const sorted = [...items].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const scale = Math.max(1, ...sorted.map((i) => Math.abs(i.points)));
  return (
    <View className="gap-2">
      {sorted.map((item) => {
        const pct = (Math.abs(item.points) / scale) * 50;
        const positive = item.points >= 0;
        return (
          <Animated.View key={item.key} layout={LinearTransition.duration(220)} testID={`contribution-${item.key}`} className="gap-1">
            <View className="flex-row justify-between">
              <Text className="text-sm text-foreground">{item.label}</Text>
              <Text className={`text-sm ${positive ? 'text-emerald-500' : 'text-rose-500'}`}>
                {positive ? '+' : '−'}
                {Math.abs(item.points).toFixed(1)}
              </Text>
            </View>
            <View className="h-2 flex-row rounded-full bg-muted">
              <View style={{ width: '50%' }} className="flex-row justify-end">
                {!positive ? <View style={{ width: `${pct * 2}%` }} className="h-2 rounded-l-full bg-rose-500" /> : null}
              </View>
              <View style={{ width: '50%' }}>
                {positive ? <View style={{ width: `${pct * 2}%` }} className="h-2 rounded-r-full bg-emerald-500" /> : null}
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Implement `mobile/src/components/forecast/track-record-chart.tsx`**

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

export interface TrackRecordChartProps {
  series: Array<{ date: string; forecast: number; actual: number }>;
  height?: number;
  actualColor: string;
  forecastColor: string;
}

/** Actual scores as a line, past forecasts as dots, on a shared 0-100 axis. */
export function TrackRecordChart({ series, height = 96, actualColor, forecastColor }: TrackRecordChartProps) {
  const [width, setWidth] = useState(0);
  const x = (i: number) => (series.length <= 1 ? width / 2 : (i / (series.length - 1)) * (width - 8) + 4);
  const y = (v: number) => height - 4 - (v / 100) * (height - 8);
  return (
    <View testID="track-record-chart" style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && series.length > 0 ? (
        <Svg width={width} height={height}>
          <Polyline
            points={series.map((p, i) => `${x(i)},${y(p.actual)}`).join(' ')}
            fill="none"
            stroke={actualColor}
            strokeWidth={2}
          />
          {series.map((p, i) => (
            <Circle key={p.date} cx={x(i)} cy={y(p.forecast)} r={3} fill={forecastColor} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Implement `mobile/src/components/forecast/forecast-hero.tsx`**

```tsx
import { View } from 'react-native';
import type { ForecastCellDTO } from '../../api/forecast';
import { FORECAST_COPY } from '../../lib/forecastCopy';
import { Card } from '../ui/card';
import { ConfidenceBadge } from '../ui/confidence-badge';
import { ScoreRing } from '../ui/score-ring';
import { Text } from '../ui/text';

/** The forecast score ring, its band and confidence for one grid cell. */
export function ForecastHero({ cell }: { cell: ForecastCellDTO }) {
  return (
    <Card className="items-center gap-2 py-6">
      <View testID="forecast-score-value" accessibilityLabel={`Forecast ${Math.round(cell.score)}`}>
        <ScoreRing score={cell.score} size={148} strokeWidth={12} />
      </View>
      <Text testID="forecast-band" className="text-muted-foreground">
        {FORECAST_COPY.band(cell.band[0], cell.band[1])}
      </Text>
      <ConfidenceBadge level={cell.confidence} />
    </Card>
  );
}
```

- [ ] **Step 6: Implement `mobile/src/components/forecast/lever-panel.tsx`**

```tsx
import { Pressable, View } from 'react-native';
import type { ForecastLeverDTO } from '../../api/forecast';
import { FORECAST_COPY } from '../../lib/forecastCopy';
import type { LeverValues } from '../../lib/forecastGrid';
import { Card } from '../ui/card';
import { Slider } from '../ui/slider';
import { Text } from '../ui/text';

export interface LeverPanelProps {
  levers: ForecastLeverDTO[];
  values: LeverValues;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
}

/** One slider per lever; levers without a CONFIRMED effect are muted and captioned. Controlled. */
export function LeverPanel({ levers, values, onChange, onReset }: LeverPanelProps) {
  return (
    <Card className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold">Plan tomorrow</Text>
        <Pressable onPress={onReset} accessibilityRole="button">
          <Text className="text-primary">Reset</Text>
        </Pressable>
      </View>
      {levers.map((lever) => {
        const value = lever.key === 'SLEEP' ? values.sleepHours : (values.habits[lever.key] ?? 0);
        const muted = lever.effect !== 'CONFIRMED';
        const tone = muted ? 'text-muted-foreground' : 'text-foreground';
        return (
          <View key={lever.key} className="gap-1">
            <View className="flex-row justify-between">
              <Text className={tone}>{lever.label}</Text>
              <Text className={tone}>{`${value} ${lever.unit}`}</Text>
            </View>
            <Slider
              testID={`lever-${lever.key}`}
              value={value}
              min={lever.min}
              max={lever.max}
              step={lever.step}
              threshold={lever.threshold}
              muted={muted}
              onChange={(v) => onChange(lever.key, v)}
              accessibilityLabel={lever.label}
              formatValue={(v) => `${v} ${lever.unit}`}
            />
            {lever.effect === 'NONE_YET' ? <Text className="text-xs text-muted-foreground">{FORECAST_COPY.noneYet}</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}
```

- [ ] **Step 7: Implement `mobile/src/screens/ForecastScreen.tsx`** (composition only: no fetching, no inline copy)

```tsx
import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import type { ReadyForecastDTO } from '../api/forecast';
import { ContributionBars } from '../components/forecast/contribution-bars';
import { ForecastHero } from '../components/forecast/forecast-hero';
import { LeverPanel } from '../components/forecast/lever-panel';
import { TrackRecordChart } from '../components/forecast/track-record-chart';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { FORECAST_COPY } from '../lib/forecastCopy';
import { contributionLabel, findCell, type LeverValues } from '../lib/forecastGrid';
import { useForecast } from '../lib/useForecast';

export function ForecastScreen() {
  const state = useForecast();

  if (state.status === 'error') {
    return (
      <Card testID="forecast-error" className="m-4">
        <Text>{FORECAST_COPY.loadError}</Text>
      </Card>
    );
  }
  if (state.status === 'loading') return <Skeleton testID="forecast-loading" className="m-4 h-64" />;
  const { forecast } = state;
  if (forecast.status === 'NOT_ENOUGH_DATA') {
    return (
      <Card className="m-4">
        <Text>
          {forecast.reason === 'NO_HISTORY' ? FORECAST_COPY.unlocksAfter(forecast.daysOfHistory) : FORECAST_COPY.lowConfidence}
        </Text>
      </Card>
    );
  }
  return <ReadyForecast forecast={forecast} />;
}

function ReadyForecast({ forecast }: { forecast: ReadyForecastDTO }) {
  const [values, setValues] = useState<LeverValues>(forecast.defaults);
  const cell = useMemo(() => findCell(forecast, values), [forecast, values]);
  const { withinPoints, hits, days, series } = forecast.trackRecord;

  const setLever = (key: string, v: number) =>
    setValues((prev) => (key === 'SLEEP' ? { ...prev, sleepHours: v } : { ...prev, habits: { ...prev.habits, [key]: v } }));

  return (
    <ScrollView contentContainerClassName="gap-4 p-4">
      <ForecastHero cell={cell} />
      <LeverPanel levers={forecast.levers} values={values} onChange={setLever} onReset={() => setValues(forecast.defaults)} />

      <Card className="gap-3">
        <Text className="text-base font-semibold">Why</Text>
        <Text className="text-xs text-muted-foreground">{FORECAST_COPY.effectOrder}</Text>
        <ContributionBars
          items={cell.contributions.map((c) => ({ key: c.key, points: c.points, label: contributionLabel(c.key, forecast, values) }))}
        />
      </Card>

      <Card className="gap-2">
        <Text className="text-base font-semibold">Track record</Text>
        <TrackRecordChart series={series} actualColor="#94a3b8" forecastColor="#6366f1" />
        <Text className="text-sm text-muted-foreground">{FORECAST_COPY.trackRecord(withinPoints, hits, days)}</Text>
      </Card>

      <Text className="text-center text-xs text-muted-foreground">{FORECAST_COPY.disclaimer}</Text>
    </ScrollView>
  );
}
```

- [ ] **Step 8: Register the route**

In `mobile/src/navigation/RootNavigator.tsx`:
- Add `Forecast: undefined;` to `RootStackParamList`.
- Add `import { ForecastScreen } from '../screens/ForecastScreen';`.
- Add `<Stack.Screen name="Forecast" component={ForecastScreen} options={{ title: 'Tomorrow' }} />` directly after the `ScoreDetail` screen.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd mobile && npx jest __tests__/screens/ForecastScreen.test.tsx __tests__/lib/forecastGrid.test.ts`
Expected: PASS. If `ScoreRing`'s internal `CountUp` makes the rendered number unstable in tests, the assertions already go through the `forecast-score-value` accessibility label, which is set synchronously.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/screens/ForecastScreen.tsx mobile/src/components/forecast mobile/src/navigation/RootNavigator.tsx mobile/__tests__
git commit -m "feat(mobile): Forecast screen with live what-if levers and track record"
```

---

### Task 11: Dashboard "Tomorrow" card

**Files:**
- Create: `mobile/src/components/tomorrow-card.tsx`
- Modify: `mobile/src/screens/DashboardScreen.tsx` (call `useForecast(dataVersion)`; render `TomorrowCard` between the RECOVERY and SLEEP `ScoreCard`s at `:298-314`)
- Modify: `mobile/__tests__/screens/DashboardScreen.test.tsx` (`mockApi` at `:20`)
- Test: `mobile/__tests__/components/TomorrowCard.test.tsx`

**Interfaces:**
- Consumes: `useForecast`, `ForecastState`, `FORECAST_COPY`, `FORECAST_MIN_DAYS`, `findCell` (Task 9); `ScoreRing`, `BaselineProgressRing`, `ConfidenceBadge`, `Card`, `Skeleton`, `Text`.
- Produces: `TomorrowCard({ state: ForecastState; onPress: () => void })`. It is presentational and never fetches.

- [ ] **Step 1: Write the failing tests `mobile/__tests__/components/TomorrowCard.test.tsx`**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TomorrowCard } from '../../src/components/tomorrow-card';
import { READY } from '../../jest-mocks/forecastFixture';

describe('TomorrowCard', () => {
  it('shows the default forecast with its band and opens the planner', () => {
    const onPress = jest.fn();
    render(<TomorrowCard state={{ status: 'loaded', forecast: READY }} onPress={onPress} />);
    expect(screen.getByTestId('tomorrow-card')).toBeTruthy();
    expect(screen.getByText('Likely 40–80')).toBeTruthy();
    fireEvent.press(screen.getByText('Plan tomorrow →'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows progress toward 21 days when there is not enough history', () => {
    render(
      <TomorrowCard
        state={{ status: 'loaded', forecast: { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 12 } }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Forecast unlocks after 21 days of data (12/21)')).toBeTruthy();
  });

  it('shows loading and error states', () => {
    const { rerender } = render(<TomorrowCard state={{ status: 'loading' }} onPress={jest.fn()} />);
    expect(screen.getByTestId('tomorrow-loading')).toBeTruthy();
    rerender(<TomorrowCard state={{ status: 'error' }} onPress={jest.fn()} />);
    expect(screen.getByTestId('tomorrow-unavailable')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npx jest __tests__/components/TomorrowCard.test.tsx`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `mobile/src/components/tomorrow-card.tsx`**

```tsx
import { Pressable, View } from 'react-native';
import { FORECAST_COPY, FORECAST_MIN_DAYS } from '../lib/forecastCopy';
import { findCell } from '../lib/forecastGrid';
import type { ForecastState } from '../lib/useForecast';
import { BaselineProgressRing } from './ui/baseline-progress-ring';
import { Card } from './ui/card';
import { ConfidenceBadge } from './ui/confidence-badge';
import { ScoreRing } from './ui/score-ring';
import { Skeleton } from './ui/skeleton';
import { Text } from './ui/text';

/** Dashboard summary of tomorrow's default forecast. Presentational: the screen owns loading. */
export function TomorrowCard({ state, onPress }: { state: ForecastState; onPress: () => void }) {
  if (state.status === 'error') {
    return (
      <Card testID="tomorrow-unavailable">
        <Text className="text-muted-foreground">{FORECAST_COPY.unavailable}</Text>
      </Card>
    );
  }
  if (state.status === 'loading') return <Skeleton testID="tomorrow-loading" className="h-28 w-full" />;
  const { forecast } = state;
  if (forecast.status === 'NOT_ENOUGH_DATA') {
    return (
      <Card testID="tomorrow-locked" className="flex-row items-center gap-4">
        <BaselineProgressRing daysCollected={Math.min(forecast.daysOfHistory, FORECAST_MIN_DAYS)} daysRequired={FORECAST_MIN_DAYS} />
        <Text className="flex-1 text-muted-foreground">
          {forecast.reason === 'NO_HISTORY' ? FORECAST_COPY.unlocksAfter(forecast.daysOfHistory) : FORECAST_COPY.lowConfidence}
        </Text>
      </Card>
    );
  }
  const cell = findCell(forecast, forecast.defaults);
  return (
    <Pressable testID="tomorrow-card" onPress={onPress} accessibilityRole="button">
      <Card className="flex-row items-center gap-4">
        <ScoreRing score={cell.score} />
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold">{FORECAST_COPY.title}</Text>
          <Text className="text-muted-foreground">{FORECAST_COPY.band(cell.band[0], cell.band[1])}</Text>
          <ConfidenceBadge level={cell.confidence} />
          <Text className="text-primary">{FORECAST_COPY.planCta}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
```

- [ ] **Step 4: Wire it into `DashboardScreen.tsx`**

Add these imports:

```tsx
import { TomorrowCard } from '../components/tomorrow-card';
import { useForecast } from '../lib/useForecast';
```

Next to the existing score state (after `dataVersion` is read from `useSync()`), add:

```tsx
  const forecastState = useForecast(dataVersion);
```

Between `<ScoreCard type="RECOVERY" ... />` and `<ScoreCard type="SLEEP" ... />`, add:

```tsx
          <TomorrowCard state={forecastState} onPress={() => navigation.navigate('Forecast')} />
```

- [ ] **Step 5: Route `/me/forecast` in the Dashboard test mock**

In `mobile/__tests__/screens/DashboardScreen.test.tsx`, add an option `forecast?: unknown` to `mockApi`. Then, as the first branch inside the `mockImplementation`, add:

```ts
    if (path === '/me/forecast') {
      return Promise.resolve(options.forecast ?? { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 0 });
    }
```

Also add this test in the same file:

```tsx
  it('shows the Tomorrow card and opens the Forecast screen', async () => {
    mockApi({ forecast: READY });
    render(<DashboardScreen />);
    fireEvent.press(await screen.findByTestId('tomorrow-card'));
    expect(mockNavigate).toHaveBeenCalledWith('Forecast');
  });
```

This test needs `import { READY } from '../../jest-mocks/forecastFixture';`. If the file names its navigation mock differently from `mockNavigate`, use that name. Apply the same `/me/forecast` branch to any other Dashboard test file whose `apiFetch` mock falls through to a default (`DashboardCoachEntry.test.tsx`, `DashboardDigest.test.tsx`).

- [ ] **Step 6: Run the mobile suite and typecheck**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS with no type errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/tomorrow-card.tsx mobile/src/screens/DashboardScreen.tsx mobile/__tests__
git commit -m "feat(mobile): Tomorrow forecast card on the dashboard"
```

---

### Task 12: End-to-end check on the simulator

**Files:** none (verification only).

- [ ] **Step 1: Seed the demo account against the local dev database**

Run: `cd backend && DEMO_USER_PASSWORD=<choose one> npx ts-node scripts/seedDemoUser.ts --email demo@example.com`
Expected: `Seeded demo user demo@example.com (<id>)`.

- [ ] **Step 2: Rebuild the iOS dev build** (new native modules: gesture handler and haptics)

Follow the project's run-setup notes: build outside iCloud Documents (`~/dev/biometrics-run`) with an ad-hoc `xcodebuild`, then run it on the simulator.

- [ ] **Step 3: Manual script**

Sign in as the demo user and check each of these:
- The Dashboard shows the Tomorrow card with a score and a "Likely a–b" band.
- Tapping it opens the Forecast screen.
- Dragging Alcohol from 1 to 2 steps the score down, reorders the bars so Alcohol leads, and gives a haptic on the device.
- Caffeine is greyed out and shows "No measurable effect for you yet".
- Sleep from 6 to 9 h raises the score.
- "Reset" restores the defaults.
- The track record shows about 30 dots and the "Within ±X…" line.

- [ ] **Step 4: Commit any fixes found, then open the PR**

```bash
git push
gh pr create --draft --title "Recovery forecast & what-if" --body "Implements docs/superpowers/specs/2026-09-28-recovery-forecast-design.md per docs/superpowers/plans/2026-09-28-recovery-forecast.md."
```
