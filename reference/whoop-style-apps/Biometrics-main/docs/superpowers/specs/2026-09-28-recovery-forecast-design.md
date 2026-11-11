# Recovery Forecast & What-If — Design

## Context

The Stat Engine (`2026-09-20-stat-engine-design.md`) produces a daily
Recovery Score from three direction-corrected z-scores (HRV 0.45, RHR 0.35,
SLEEP_DEBT 0.20) squashed by `computeComposite`. The habit engine
(`2026-09-20-habits-correlation-design.md`) tests habit → factor hypotheses at
lags 1–3 and marks survivors `CONFIRMED`.

This spec adds a **forecast of tomorrow's Recovery Score** with interactive
**what-if levers** (planned sleep, and each habit), built only from those two
existing engines. It is the first of four planned "showcase" features, in this
order:

1. **Recovery forecast + what-if** — this document.
2. Early-warning body alerts (reuses this document's baseline/deviation work).
3. Weekly "Wrapped" story (draws story cards from 1 and 2).
4. Coach with live inline charts (calls 1 and 2 as tools).

Each gets its own spec → plan → implementation cycle.

### Goal and audience

The primary goal is a **portfolio / demo showcase**: a feature that looks
impressive in a short screen recording while being genuinely useful day to day.
The "wow" moment: drag the *drinks* slider and watch tomorrow's score count
down, the band widen, and the explanation bars reorder live.

The credibility rule that shapes every choice below: **every number on screen
is produced by the real scoring code, and the forecast shows its own track
record.** No fabricated dose-response curves, no LLM-generated numbers.

### Decisions already made

- Model: transparent additive model (approach A). Rejected: per-user ML
  regression (overfits ~90 days, no clean per-lever attribution, contradicts the
  correlation spec's no-per-user-fitting rule) and an LLM forecast (unreliable
  numbers, coach is off and gated).
- Demo data: a **seeded synthetic demo account**, run through the real
  pipelines. Real users get the identical model.

## 1. Forecast engine (`backend/src/forecast/`)

Pure functions; the only DB access is a loader in `load.ts`, mirroring how
`scoring/backtest.ts` separates its pure core from `scripts/backtest.ts`.

### 1.1 Target

Forecast date `T = today + 1` (civil date in the user's timezone, same date
rules as `scoring/dates.ts`). The forecast is "the Recovery Score that will be
computed for T", using the live `ScoreConfig` version.

### 1.2 Factor predictions

**SLEEP_DEBT — computed, not predicted.** The planned-sleep lever supplies the
night ending on T. The engine appends a synthetic sleep point of that duration
to the user's sleep series and calls the **existing** features code to get
T's rolling-14-day debt and its z-score. The sleep lever therefore moves the
score exactly as a real night of that length would.

**HRV and RHR — carry-over plus habit effects.** For factor `f`:

```
ẑ_f(T) = φ_f · z_f(today) + Σ_h  exposed_h · Δ_{h,f}
```

- `z_f(today)` is today's z from `UserDailyFeatures` (`hrvZ` / `rhrZ`). If
  today's value is imputed, the forecast is still produced but its confidence
  drops one level (same rule as `confidenceFor`).
- **φ_f (carry-over)**: OLS slope of `z_f(d+1)` on `z_f(d)` over consecutive
  non-imputed pairs within `ANALYSIS_WINDOW_DAYS` (120), shrunk toward a
  population prior `φ₀ = 0.5` with weight `n / (n + 30)` (n = pair count),
  then clamped to `[0, 0.9]`. Constants live in `forecast/config.ts`.
- **Δ_{h,f} (habit effect)**: used only when a `HabitCorrelation` row for
  `(habit h, factor f, lagDays 1)` has status `CONFIRMED`. Δ is the difference
  of mean `z_f` between exposed and unexposed habit days at lag 1, over the same
  non-imputed observations the habit engine used (recomputed from
  `UserDailyFeatures` + habit logs via the habit engine's own pairing helpers,
  so both engines agree on what an observation is).
- **Exposure is binary**, using the habit type's `exposureThreshold`
  (e.g. alcohol ≥ 2 drinks). The forecast therefore *steps* at the threshold.
  This is deliberate: the correlation engine only measures exposed vs.
  unexposed, so any smooth dose-response curve would be invented.
- Habit → SLEEP_DURATION effects are ignored: sleep is a lever the user sets
  directly, so modelling a habit's effect on it would double-count.
- Lags 2 and 3 are out of scope (tomorrow-only forecast).

### 1.3 Score

The predicted factor z-scores are passed through the **unchanged**
`computeComposite` with the live config (same zClamp, renormalisation, logistic
k). Forecast and actual are therefore on exactly the same scale.

### 1.4 Contributions (explanation)

Contributions are computed as sequential score deltas in a fixed order:

1. **Baseline**: the score with every factor at z = 0 (always 50 under the
   logistic).
2. **Carry-over**: add φ·z(today) for HRV and RHR.
3. **Sleep**: set SLEEP_DEBT from the planned-sleep lever.
4. **Each habit**, in a fixed order (built-ins, then custom types by
   creation date).

Each step's contribution = score after step − score before step, so the
contributions sum exactly to `forecast − 50`. The fixed order is documented in
the UI copy ("effects shown in order: recent trend, sleep, habits"), because
logistic interactions make attributions order-dependent.

### 1.5 Uncertainty and track record

A **rolling-origin backtest** over the last 30 days: for each day D whose actual
Recovery Score exists, forecast D using only data available up to D − 1 (φ and
Δ refit on that truncated history, the actual sleep of the night before D used
as the sleep lever, the actual habit log used for exposure). This yields paired
(forecast, actual) values.

- **Band** = forecast + [P10, P90] of the backtest errors (actual − forecast),
  clamped to [0, 100]. With fewer than 10 backtest pairs, fall back to
  ± 1.5 × the MAD-based spread of the errors, and cap confidence at MEDIUM.
- **Track record** = `{ withinPoints: X, hits: N, days: M }`, where X is the
  median absolute error rounded up to an integer and N is the count of days with
  |error| ≤ X. The UI shows "within ±X on N of the last M days". Also the
  per-day `{date, forecast, actual}` series for the chart.

The backtest uses today's CONFIRMED set; effect sizes are refitted on the truncated history.

### 1.6 Gates

`status: NOT_ENOUGH_DATA` with a `reason` instead of a number when:

- `NO_HISTORY`: fewer than 21 days with a Recovery Score, or
- `LOW_CONFIDENCE_TODAY`: today's Recovery Score is missing or LOW confidence.

### 1.7 Confidence

Starts from today's Recovery Score confidence (which already drops a level for
imputed inputs, per `confidenceFor`). It drops one further level when the
backtest has fewer than 10 pairs. It is never higher than today's confidence.
§1.2's "imputed today" rule is this same inherited drop, not an extra one.

## 2. API

### `GET /me/forecast`

A new `forecastRouter`, mounted like `scoresRouter`, protected by `requireAuth`.
Computed on demand; no new tables, no cache (the cost is one user's 120-day
window plus ~30 small replays).

**Precomputed what-if grid.** So that sliders never wait on the network, the
response contains every reachable forecast:

- Sleep: 4.0–10.0 h in 0.5 h steps (13 values).
- Habits: every on/off combination of the habits that have **at least one**
  `CONFIRMED` lag-1 effect on HRV or RHR (2^k, k usually 0–3). Habits with no
  confirmed effect do not multiply the grid.

At most ~13 × 8 = 104 cells in practice; if k > 4 the response includes only
the 4 habits with the largest |Δ| as levers and marks the rest
`effect: "NOT_MODELLED"` (keeps the payload bounded).

Response shape (`dto.ts`):

```ts
type ForecastResponse =
  | { status: 'NOT_ENOUGH_DATA'; reason: 'NO_HISTORY' | 'LOW_CONFIDENCE_TODAY'; daysOfHistory: number }
  | {
      status: 'READY';
      date: string;                       // T, YYYY-MM-DD
      algorithmVersion: string;
      defaults: { sleepHours: number; habits: Record<string, number> };
      levers: Array<{
        key: 'SLEEP' | string;            // habit type id for habits
        label: string; unit: string;
        min: number; max: number; step: number;
        threshold?: number;               // habits only
        effect: 'CONFIRMED' | 'NONE_YET' | 'NOT_MODELLED';
      }>;
      grid: Array<{
        sleepHours: number;
        exposed: string[];                // habit ids exposed in this cell
        score: number;
        band: [number, number];
        confidence: 'HIGH' | 'MEDIUM' | 'LOW';
        contributions: Array<{ key: 'CARRY_OVER' | 'SLEEP' | string; points: number }>;
      }>;
      trackRecord: {
        withinPoints: number; hits: number; days: number;
        series: Array<{ date: string; forecast: number; actual: number }>;
      };
    };
```

**Defaults**: `sleepHours` = the user's 14-day median sleep, rounded to 0.5 h
(clamped to 4–10); `habits` = today's habit log if one exists, otherwise 0 for
every habit.

The API never mutates anything. Logging a habit or a new sync changes the next
response simply because the inputs changed.

## 3. Mobile

### 3.1 Dashboard "Tomorrow" card

Under today's Recovery ring on `DashboardScreen`: a compact card with the
default forecast score, its band ("72 · likely 66–77"), a confidence badge and
"Plan tomorrow →", which navigates to `Forecast`. In the `NOT_ENOUGH_DATA` state
it shows "Forecast unlocks after 21 days of data (N/21)" using the existing
`baseline-progress-ring`. It uses the same skeleton and error patterns as the
other dashboard cards.

### 3.2 `ForecastScreen` (native stack)

Top to bottom:

1. **Hero**: the forecast score in a `score-ring`-based ring with a `count-up`
   number and a translucent arc for the band. The ring (or a `thinking-orbs` orb
   behind it) interpolates its color and energy with the score.
2. **Levers**: a `Sleep` slider (4–10 h, 0.5 h snaps), then one slider per
   habit in `levers` order.
   - Habit sliders show a tick at `threshold`, and a light haptic fires when a
     drag crosses it (the moment the forecast steps).
   - `effect: NONE_YET` sliders are rendered greyed with the caption
     "No measurable effect for you yet". They remain draggable but the forecast
     does not move, which is the honest behaviour.
   - Every slider change is a **local grid lookup** (`sleepHours`, the set of
     exposed habit ids), so there is no network traffic while dragging.
3. **Why**: signed contribution bars (based on `factor-bar`) labelled in plain
   language ("Recent trend", "Sleep 6.5 h", "3 drinks"). They animate and reorder
   by |points| with Reanimated layout transitions.
4. **Track record**: the `trend-line` with forecast dots vs. the actual line for
   the last 30 days, and the caption "Within ±X on N of the last M days".
5. Footer: "An estimate from your own history — not medical advice."

A "Reset" action returns every lever to `defaults`.

### 3.3 New pieces

- `mobile/src/api/forecast.ts`: typed fetch and response parsing, following
  `api/scores.ts`.
- `mobile/src/lib/forecastGrid.ts`: a pure lookup `(response, sleepHours,
  habitValues) → cell`.
- `mobile/src/components/ui/slider.tsx`: the component library has no slider.
  Built on Reanimated + `react-native-gesture-handler`, with snapping, a
  threshold tick and accessibility (`accessibilityRole="adjustable"`,
  increment/decrement actions).
- New dependencies: `react-native-gesture-handler` and `expo-haptics`. Both are
  native, so the iOS dev build must be rebuilt (see the run-setup notes).

## 4. Demo seed (`backend/scripts/seedDemoUser.ts`)

Creates a showcase account whose screens exercise every state of this feature.

- Usage: `npx ts-node scripts/seedDemoUser.ts --email demo@example.com`, with the
  password taken from `DEMO_USER_PASSWORD`. The user is created through Better
  Auth's server API so that it can sign in normally.
- **Idempotent**: deletes the user with that email (and all its rows) and
  recreates it. It refuses to run when `NODE_ENV=production` unless `--force`.
- No `HealthConnection` is created, so the sync worker never touches the user.
- A seeded PRNG (`--seed`, default fixed) makes the output reproducible.

**Generative model (90 days ending today — the forecast needs today's score)**:

- Latent recovery state `r(d) = 0.6·r(d−1) + ε`, plus weekday effects (shorter
  sleep and later bedtimes on Fri/Sat nights).
- HRV ≈ 55 ms · (1 + 0.12·r) + noise; RHR ≈ 58 bpm − 2.5·r + noise; sleep
  sessions around 7.2 h (σ 0.8), with start times drifting on weekends; steps
  varied by weekday.
- Habit logs: alcohol ≥ 2 drinks on ~25% of nights (clustered on weekends),
  caffeine varied freely, workouts ~4×/week.
- **Planted effects** (applied to the next day): alcohol exposure → HRV −18%
  and RHR +5 bpm; workout → HRV +4%; **caffeine → no effect**.

The script writes only raw inputs (`BiometricRecord`, `SleepSession`, habit
logs, `User.timezone`) and then runs the **real** scoring pipeline and habit
engine for the user. It never writes `DailyScore`, `UserDailyFeatures` or
`HabitCorrelation` directly. Effect sizes must be large enough that the habit
engine (BH-FDR q = 0.1, |r| ≥ 0.3, ≥ 8 pairs each side, `consecutivePasses`
confirmation) marks alcohol → HRV/RHR as `CONFIRMED`. The script runs the
weekly habit job as many times as needed to satisfy the confirmation rule,
advancing its run key the same way the real weekly schedule would.

## 5. Testing

Following the existing Jest setup in `backend/tests` and `mobile/__tests__`.

**Backend, pure engine (`tests/forecast/`)**

- φ fitting: exact OLS on a synthetic AR(1) series; shrinkage toward 0.5 with
  small n; clamping at 0 and 0.9.
- The sleep lever: the SLEEP_DEBT z the engine produces equals what the
  features code produces for a real night of that length.
- Contributions sum to `score − 50` in every grid cell.
- The habit step: the forecast changes only when a lever crosses its threshold,
  and never for a habit without a `CONFIRMED` lag-1 row.
- Gates: `NO_HISTORY` at 20 days and ready at 21; `LOW_CONFIDENCE_TODAY`.
- **Leakage**: in the rolling backtest, mutating any data dated ≥ D leaves the
  forecast for D unchanged.
- Band fallback below 10 backtest pairs; confidence capping.

**Backend, integration**

- `GET /me/forecast`: auth required; both response variants; grid size and
  cell-lookup keys, using the habits tests' DB helpers.
- The seed end to end: after `seedDemoUser`, the forecast is `READY`, alcohol
  has a `CONFIRMED` effect and caffeine is `NONE_YET`, the track record has at
  least 25 days, and the alcohol-exposed cell scores lower than the unexposed
  one.

**Mobile**

- `api/forecast` parsing of both variants.
- `forecastGrid` lookup, including snapping and threshold behaviour.
- `slider`: snapping, threshold callback, accessibility actions.
- `ForecastScreen`: renders the defaults, updates the score on a lever change
  without a fetch, greys out `NONE_YET` levers, and matches a snapshot.
- Dashboard "Tomorrow" card: the ready, not-enough-data, loading and error
  states.

## 6. Out of scope

- Forecasts beyond tomorrow; lag-2 and lag-3 habit effects.
- Dose-response modelling (it would need a new statistical design in the habit
  engine first).
- A Sleep Score forecast.
- Push notifications ("tomorrow's forecast") and a coach tool. The coach tool
  belongs to showcase feature #4.
- Persisting forecasts. The rolling backtest recomputes the track record from
  history, so nothing needs storing.
