# Metric detail pages

Every metric that looks tappable opens its own metric screen. Parent score screens are destinations only for that score. Preserve the selected day and range. Back pops to the screen the metric was opened from (`useAppBack`, docs/pwa.md), so a metric opened from Strain returns to Strain. Unsupported metrics remain plain text until their routes and data contracts exist.

## Implemented now

| Metric | Destination | Entry points |
|---|---|---|
| Recovery | `/recovery` | Home score and Trends |
| Sleep Performance | `/sleep` | Home dashboard, Recovery contributor and Trends |
| Strain | `/strain` | Home score and Trends |
| Pulse Age | `/health/healthspan` | Health |
| Fitness / VO2 max estimate | `/health/fitness` | Health |
| Stress | `/health/stress` | Home and Health |
| HRV, resting heart rate, respiratory rate, SpO2, skin temperature deviation | `/metric/hrv`, `/metric/rhr`, `/metric/resp`, `/metric/spo2`, `/metric/skin` | Home dashboard, Trends, Health Monitor tiles; Recovery contributors where applicable; Sleep respiratory rate |
| Steps, total calories | `/metric/steps`, `/metric/calories` | Dashboard and applicable activity/strain rows |
| Weight, body fat | `/metric/weight`, `/metric/body_fat` | Dashboard, Trends and Health Monitor measurements |
| Distance, floors, elevation gain, active minutes, light activity minutes, Active Zone Minutes, active calories, sedentary minutes, average heart rate, swim strokes | Existing corresponding `/metric/<key>` | Dashboard, Trends and applicable rows |
| Water, calories eaten, protein, carbs, fat, glucose, core temperature | Existing corresponding `/metric/<key>` | Dashboard, Trends and applicable measurements |
| An individual workout | `/activity/<id>` | Activity cards |

The generic route uses `DETAIL_KEYS` and the query configuration, not arbitrary URL keys. Five vital routes are included in this change. Their baseline, history, outlier list, missing states and user filters need to stay covered by query tests. Health Monitor tile taps now open these routes instead of a short vital sheet. Its range chips remain visible on the originating cards.

The public `/metrics/` pages explain methods. They are not authenticated detail screens. Keep these concepts separate when adding links.

## Remaining inventory

These are current UI submetrics or visible measurements without a dedicated complete detail screen. Proposed keys below are not live URLs. Confirm names against the route registry during implementation.

| Group | Metric | Current UI | Planned content and source |
|---|---|---|---|
| Sleep | Sleep duration, hours vs. needed | Sleep bars and summary | Main sleep minutes, personal need, naps separately, duration and fulfillment history; distinguish minutes from the fulfillment percentage |
| Sleep | Sleep consistency | Sleep summary and bedtime/wake chart | Existing SRI, calculation window and calibration; bedtime/wake variance and local-clock history |
| Sleep | Efficiency | Sleep summary and trend | Asleep divided by in-bed minutes, exact recorded denominator, prior-night history |
| Sleep | Restorative sleep | Sleep summary and stacked trend | Deep plus REM duration and share of sleep, with stage availability |
| Sleep | Deep, REM, light, awake | Sleep stage display | Actual stage segments and nightly minutes; stage share and timeline, no inferred stages when unstaged |
| Sleep | Time in bed, wake events | Sleep details | Main-session start/end, duration and recorded awakening count; preserve session metadata |
| Sleep | Sleep debt | Sleep details and trend | Existing debt model and history, explain accumulation and repayment; no independent recalculation |
| Sleep | Sleep need and bedtime plan | Hours/need card and tonight planner | Existing baseline/strain/debt/nap parts, planned wake/bedtime and calibration; existing `/sleep#planner` remains a section link until dedicated route exists |
| Strain | Workout duration | Strain chart | Sum recorded workout time with documented overlap treatment; workout list and daily history |
| Strain | Strength activity time | Strain summary | Recorded strength workout duration and sessions; distinguish from cardiovascular strain |
| Strain | Zones 1-3, zones 4-5 and each zone | Strain summary and zone rows | Existing sampled HR zone minutes and coverage, zone boundaries and weekly distribution |
| Strain | Strain Target | Strain summary | Existing recovery/load-derived low/high range, limits and history; range requires a range-specific hero |
| Strain | Resting calories | Total-calorie stack | Total minus active only when both exist and the difference is valid; explicitly label this derived value |
| Strain | Peak heart rate, workout average HR, heart-rate recovery, pace | Workout detail statistics | Context-specific workout data and sample coverage; never replace workout averages with daily averages |
| Energy | Energy Bank | Home energy card and timeline | Dedicated day balance, current/as-of value, drains/recharges, naps and coverage; reuse current model outputs |
| Recovery | Tomorrow's forecast | Recovery card | Existing estimate and historical forecasts where persisted; no reconstruction using tomorrow's actual result |
| Health | Pulse Age contributor submetrics | Contributor rows/sheets | Hours of sleep, SRI, zone minutes, strength duration, daily steps, VO2 max, resting HR and lean body mass; route supported measurements to their own screens and retain model-explanation sheets for coefficients, age effects and targets. Lean mass requires weight and body fat on an explicitly valid reading window |
| Health | Fitness trends / training load / training balance | Health and fitness charts | Existing score history, valid exercise windows and model limits; separate aggregate score from individual workout detail |
| Journal | Behaviour impact | Insights and report rows | Existing per-behaviour analysis, sample count and uncertainty; not a daily physiological metric |

Already supported totals such as active calories and total calories should use their existing routes. Do not create duplicate calorie pages just because several cards show the same metric.

## Delivery phases

1. Complete route audit. Inventory every `KeyStat`, tile, contributor, dial and chart-card destination. Record its value key, scope (day/night/workout/range), unit, display format, source and current destination. Add a shared supported-destination registry so every surface maps the same identity to the same route. Keep this pure registry outside server queries; restrict keys in the route handler. Add a route-contract check that every rendered metric destination is supported.
2. Ship Sleep detail family. Implement duration/fulfillment, consistency, efficiency, restorative sleep, time in bed, wake events and debt from existing scored snapshots. Add stage routes only after defining unstaged-night behavior and segment completeness. Reuse one `MetricDetail` component with sleep-specific sections. Wire cards and rows after query tests pass.
3. Ship Strain detail family. Implement workout duration, strength duration and zone time with explicit scope and coverage. Add the Strain Target range layout. Reuse `/metric/calories` and `/metric/active_calories`; add resting-calorie detail only with a tested valid subtraction contract. Workout-specific HR, pace and recovery open workout-aware routes or an owned section within the selected activity, never an unrelated day's aggregate.
4. Ship Energy Bank and remaining score details. Extract the existing Home energy sections into shared components for a dedicated screen. Add training load/balance and forecast details using stored causal outputs. Pulse Age contributor routes should open actual underlying measurements; model contributions continue to explain the score without pretending to be measured vitals.
5. Finish cross-surface audit. Wire Dashboard, Health, Recovery, Sleep, Strain, Trends, Reports and coach-generated metric links through the same supported registry. Recapture landing screenshots, update feature copy where behavior changed, and verify mobile/desktop. Update this inventory as routes become available.

## Query and component contracts

- Keep data access in `src/server/queries/`; pages fetch and compose. Shared frontend sections belong in `src/components/metrics/` or `src/components/charts/`, with `DetailShell`, `SectionShell`, `MetricState`, `KeyStatRow`, `ContributorRow`, `TrendChart` and existing primitives. Avoid copying page markup into multiple routes.
- Extend the current `MetricDetailVM` with explicit identity, measurement scope, unit, format, source, selected-day value, history and typed metric-specific sections. Put range targets and percentages in typed contracts rather than treating them as plain scalar totals.
- Values remain `{ value, reason, provisional }`, with tags and calibration metadata as applicable. Handle loading, available, provisional, missing and reason states. Missing remains null; an explicitly measured zero remains zero. History gaps remain gaps. Never synthesize sensor data or substitute a parent score for an unavailable submetric.
- Days and sessions use the user's profile time zone. Main sleep, naps, workout overlaps, midnight crossings and daylight-saving transitions need explicit rules. Keep existing scoring definitions and units: internal effort 0-100, displayed strain 0-21, sleep performance input 0-1.
- Histories and baselines for a selected day use that day and earlier observations only. Comparison baselines exclude the selected measurement where appropriate. Do not let future records change a historical detail screen. Forecast details must not read the actual future result.
- Every query and write filters `ctx.userId`. Actions authenticate themselves; routes use the current authenticated query context. Every new per-user persisted table includes `user_id`.
- Preserve `d` in links and valid `r` where it applies. Back follows the app's main-screen return contract rather than raw browser history. A card's info button opens its description independently of the card's metric destination.

## Acceptance and verification

- Query tests on the temp database cover golden values, missing/partial/provisional states, actual zero, insufficient history, invalid derived parts, unit formatting and selected-day boundaries.
- Property tests establish causality: append future nights/workouts and compare prior-day view models. Isolation tests seed distinguishable accounts and assert each new screen sees only its account's values and history.
- Component tests exercise keyboard/touch destinations, nested info controls and state rendering. Route-contract tests reject unsupported keys and prove all linked metric keys resolve.
- Browser journeys: open HRV from Dashboard, Recovery and Health Monitor; open respiratory rate from Sleep; preserve historical day; return to the originating main screen; repeat with missing data. Cover every newly implemented family, without asserting fabricated numbers.
- Run typecheck, lint, unit/query tests and the UI e2e suite. Check phone and laptop layouts and refresh the landing captures for changed screens. Physically verify mobile keyboard behavior separately from desktop viewport emulation.

No future-phase links are introduced until their destinations exist.
