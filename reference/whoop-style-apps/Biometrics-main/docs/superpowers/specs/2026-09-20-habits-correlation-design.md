# Habit Tracking & Correlation Engine — Design

## Context

This spec covers **habit logging and the habit/biometric correlation
engine** — Slice 2 of the overall build order. It is one of three sibling
specs, split out of a single combined document that had grown too large
to review or build against as one unit:

- `2026-09-20-stat-engine-design.md` — the Recovery/Sleep Score pipeline
  (Slices 1 and 1.5). **This document depends on it directly**: the
  correlation engine below tests against `UserDailyFeatures`' per-factor
  z-scores and inherits its resolution of the "what day did this metric
  happen on" question — this document does not re-decide that.
- **This document** — habit logging and correlation (Slice 2).
- `2026-09-20-ai-coach-design.md` — the LLM-backed coach (Slice 3).
  Consumes this document's `getHabitCorrelations()` output as one of its
  two grounding data sources.

Cross-references to the other two docs are by filename and section
number.

## Revision History

- **v1** (this document): split out of the original combined "Phases
  2–4" spec's §1.3 (habit correlation engine) and its correlation-
  specific piece of Part 3 (`CorrelationCard`), which by that document's
  fourth review round already reflected a hardened correlation design
  (autocorrelation-corrected parametric test, replacing an earlier
  circular-shift permutation design verified mathematically inert at
  realistic data volumes). This split fixes the one outstanding issue
  flagged against this section specifically: the Build Order's
  dependency note on Slice 1.5 referenced a "sleep-debt-vs-sleep-goal
  correlation case" that no longer has any meaning now that this engine
  correlates against Stat Engine per-factor z-scores rather than a
  composite score — that clause is removed, and the dependency is stated
  as what it actually is (Slice 1's per-factor z-scores only; Slice 1.5
  adds one more factor to correlate against, nothing more).
- **v2**: reworked lag semantics and habit logging after review found
  two problems that made the engine's output uninterpretable:
  - **Lags are now defined relative to the first night after the habit.**
    Under the Stat Engine's end-date day convention (a `DailyScore` for
    civil date D describes the night that ended on D's morning), a habit
    on habit day H can only affect D = H+1 or later. v1's "lag 0" paired
    a habit with a night that had already ended, so it could only detect
    the reverse relationship (a bad night leading to more coffee that
    day) and would have reported it as a habit effect. Lag 0 is removed;
    tested lags are {1, 2, 3}.
  - **A habit-day boundary at 04:00 local** (configurable) so a late-night
    log belongs to the evening it was part of. `habitDay` is stored at
    write time, so a later timezone change does not rewrite history.
  - **Explicit "none today" logging.** v1 had no way to tell "didn't do
    it" from "didn't log it", so unlogged days would have silently become
    the control group. Added `HabitCheckIn`, the observed-day rule, and
    the consequence that a habit with too few observed unexposed days is
    simply not tested.
  - **Exposure thresholds are fixed in config**, not searched from the
    data. v1's worked example ("2+ drinks") implied a threshold that
    nothing in the test produced; `effectSizePercent` is now defined too.
  - The test count drops from 4 lags to 3, so the multiple-comparison
    burden is lighter.
- **v3**: closed the remaining review items.
  - **Imputed days are excluded** from the correlation series. An
    imputed value equals the baseline by construction (z ≈ 0), so
    including it pulls every correlation toward zero.
  - The sleep series is now the per-night `sleepDurationZ`, not the
    14-day rolling sleep debt, whose smoothing makes lags 1–3
    indistinguishable.
  - Added a **persistence rule** (CANDIDATE → CONFIRMED after two
    consecutive weekly passes, RETIRED after two consecutive misses) so
    patterns do not flicker in and out between weekly runs.
  - Removed edit-history narration from the body; cross-references to the
    Stat Engine and Coach documents follow their renumbering.

## Goals

- User-logged **habits** (caffeine, alcohol, workouts, sleep timing, plus
  an extensible schema for custom habits) correlated against biometric
  trends with actual statistical rigor (lagged cross-correlation, not
  "these two lines both went down once").

## Non-Goals

- Computing the scores being correlated against — see
  `2026-09-20-stat-engine-design.md`.
- Anything conversational — see `2026-09-20-ai-coach-design.md`. This
  engine produces structured data; how a coach talks about it is that
  document's concern.
- Causal claims of any kind. Every surfaced pattern is worded as
  correlation in the user's own data, never as a medical or causal
  claim.

## Build Order Dependency

**Slice 2 depends on Slice 0 and Slice 1** (`2026-09-20-stat-engine-design.md`):
Slice 0 for `User.timezone` and the canonical day convention this
document inherits, Slice 1 for the per-factor z-score series this engine
correlates against — nothing else. Slice 1.5 (Sleep Score) is not a prerequisite: once it ships, its
own factors simply become additional series available to correlate
against, the same way any other Slice-1 factor is, with no separate
integration work. This document does not depend on the AI Coach
(`2026-09-20-ai-coach-design.md`) at all — `HabitLog` and
`HabitCorrelation` are built and surfaced in their own "Patterns" tab
with no coach involvement, and the coach later consumes this document's
output as a read-only tool result.

---

## 1. Habit logging

### 1.1 Data model

- **`HabitLog`** — `id`, `userId`, `habitType`, `value` (nullable number;
  alcohol/caffeine take a quantity, workout takes a duration plus an
  intensity enum, custom habits take a non-negative number or a yes/no),
  `unit`, `loggedAt` (instant), `habitDay` (date, derived at write time —
  see 1.2), `note`. **A `value` of 0 is a real, meaningful entry meaning
  "none"**, not a missing value.
- **`HabitCheckIn`** — `userId`, `habitDay`, `createdAt`;
  `@@unique([userId, habitDay])`. It means "everything for this day is
  logged, including nothing."

### 1.2 Habit day, and how it maps to score days

`habitDay` is the local civil date of `loggedAt` in the user's timezone
**after subtracting a fixed offset**: a log made before 04:00 local
belongs to the previous habit day, so a 1am drink is grouped with the
evening it was part of. The offset is a config constant
(`HABIT_DAY_START_HOUR = 4`). `habitDay` is **stored at write time**
using the timezone then in effect, so a later change to `User.timezone`
never rewrites history.

Score days are the Stat Engine's canonical day
(`2026-09-20-stat-engine-design.md` §2, this document does not
re-decide it): a `DailyScore` for civil date D describes the night that
**ended on D's morning**. So the first score a habit on habit day H can
possibly influence is civil date H+1 — the night that follows it.
**Lag L** is defined as: pair the habit on habit day H with the factor
z-score on civil date H + L, with L ≥ 1. "Lag 1" therefore reads as "the
morning after."

### 1.3 Observed days ("none today")

The engine must distinguish "didn't do it" from "didn't log it". Rule: a
habit day is **observed** for habit type T if either (a) at least one
`HabitLog` of type T exists for it (a value of 0 counts), or (b) a
`HabitCheckIn` exists for it. A habit day that is not observed is
**missing** for T and is excluded from pairing — it is never treated as
non-exposure.

UX requirement (specified here, built in Slice 2): a daily in-app card,
"Anything to log today?", with a one-tap **"Nothing today"** that creates
the check-in, and retroactive check-ins for the previous 7 days. The
cost is stated plainly: a user who logs only on the days they drink
produces no usable unexposed days, and the engine will not test that
habit. The Patterns tab says so ("Log 'nothing today' on days you don't
drink so patterns can be found — 3 of 8 needed") instead of guessing.

### 1.4 Exposure definition

Each habit type has an `exposureThreshold` in config — for example
alcohol ≥ 2 drinks, caffeine ≥ a configured amount, workout any logged
session, custom habits any non-zero value. A habit day is **exposed** if
its total for that type meets the threshold and **unexposed** if it is
observed and does not. Thresholds are **fixed in config, not searched
from the data**: choosing the best-looking threshold per user would
multiply the number of hypotheses tested without counting them. The
correlation test below uses this binary exposure indicator, and the
threshold is what the "2+" in a surfaced sentence refers to.

## 2. Correlation engine

Rejected: testing **lag 0**. Under the end-date day convention (§1.2),
the score for civil date D covers a night that had already ended by D's
morning, so a habit on habit day D can only influence D+1 onward. A
"lag 0" test would pair a habit with a night that is over before the
habit happens; the only relationship it can detect is the reverse one (a
bad night leading to more coffee that day), and a surfaced pattern would
read as a habit effect when it is not. Tested lags start at 1.

**Correlated against per-factor z-score series, not the composite
score.** The series are the `hrvZ`, `rhrZ` and `sleepDurationZ` columns
of `UserDailyFeatures` (`2026-09-20-stat-engine-design.md` §2 Stage 2)
and, once Slice 1.5 ships, its sleep-efficiency and circadian-consistency
series — each tested against each habit independently.
**`sleepDebtRolling14d` is deliberately not one of them**: it is a
14-day rolling sum, smoothed by construction, so a single night's habit
effect is spread across two weeks of values and no lag from 1 to 3 can be
distinguished from another. The per-night `sleepDurationZ` is the right
series for lag testing; the rolling debt remains the right factor for the
score. Per-factor series also match what the worked example in step 7
claims ("your HRV averaged 14% below baseline" is a per-factor claim, not
a composite-score claim), and a habit that moves one factor strongly but
is diluted into a multi-factor weighted sum would be invisible to a
composite-level test even when it is a real, specific, useful pattern.

**Rejected alternative: circular-shift permutation testing.** Habits
and the z-score series are both autocorrelated, so independent
reshuffling of habit labels is invalid, and rotating the habit series by
a random offset is the natural fix. It breaks the feature outright,
though: a circular shift of an *n*-day series has at most *n*−1 distinct
rotations, so at 3 months of data (~90 days) the smallest achievable
empirical p-value is ~1/90 ≈ 0.011 — no matter how strong the real
correlation is. Benjamini–Hochberg at `q < 0.10` across 25–45 tests
needs the smallest p-value to clear roughly `q/m ≈ 0.002–0.004` to reject
anything. **0.011 can never clear 0.004** — the method is mathematically
inert, not just underpowered: it would surface nothing until well past a
year of accumulated data, real pattern or not, and that is a hard floor of
the permutation method itself, not a tuning parameter to adjust.

**Adopted instead: an autocorrelation-corrected parametric test
(effective-sample-size adjustment, Pyper–Peterman-style)**, which has no
resolution floor because its p-value comes from a continuous
t-distribution, not from counting discrete permutations — computed per
`(habit type, factor)` pair, per user, weekly:

1. **De-seasonalize first.** Both the habit series and the factor
   z-score series likely share weekly periodicity (weekend drinking,
   weekend sleep debt) — left uncorrected, that shared structure would
   read as correlation whether or not a real relationship exists.
   Subtract each series' own weekday-specific mean (computed over the
   observed window) from every observation before anything else below.
2. For lag `L` in `{1, 2, 3}` (§1.2), pair each observed habit day H's
   exposure indicator with the de-seasonalized factor z-score on civil
   date H + L, keeping only pairs where the habit day is observed (§1.3)
   and the factor value is a real observation: days the Stat Engine
   flags `imputed` are treated as missing, since an imputed value equals
   the baseline by construction (z ≈ 0) and would pull every correlation
   toward zero. Compute Pearson `r` over those pairs.
   `n` in the steps below is the number of paired observations.
3. **Effective sample size.** Estimate each de-seasonalized series' own
   lag-1 autocorrelation (`ρ_habit`, `ρ_factor`) via the standard sample
   estimator, then compute `n_eff = n × (1 − ρ_habit·ρ_factor) / (1 +
   ρ_habit·ρ_factor)` (Pyper & Peterman 1998), floored at a minimum of 3
   to avoid a degenerate or negative value when both series are strongly
   positively autocorrelated (plausible here — a 30-day EWMA baseline is
   heavily autocorrelated by construction).
4. **Test statistic and p-value.** `t = r × sqrt((n_eff − 2) / (1 − r²))`
   against a t-distribution with `(n_eff − 2)` degrees of freedom — a
   continuous p-value, with no floor tied to how many days of data exist.
5. **Minimum-observation gate.** Require at least **8 exposed and at
   least 8 unexposed** observed pairs at a given lag before testing it at
   all — both the autocorrelation estimate in step 3 and the
   t-distribution approximation in step 4 are asymptotic and unreliable
   on very small samples, and a comparison with almost no unexposed days
   is not a comparison. A habit that fails the gate is reported in the
   Patterns tab as "not enough data yet" with the counts, not silently
   dropped.
6. **Multiple-comparisons correction**, meaningful because step 4 has no
   floor: 3 lags × N habit types × 3+ factors is roughly 25–45
   simultaneous tests per user per week for the expected 3–5 habits —
   apply **Benjamini–Hochberg FDR correction** across the full set of
   `(habit, lag, factor)` p-values computed together in one run. Only
   hypotheses surviving BH-correction at `q < 0.10` **and** `|r| > 0.3`
   surface as a confirmed insight.
7. Worded as correlation, never causation, and naming the specific
   factor tested rather than a composite score. Lag 1 reads "the
   morning after", lag L>1 reads "L days after": *"The morning after
   you log 2+ drinks, your HRV has averaged 14% below baseline (across
   11 observations) — this is a pattern in your own data, not a general
   medical claim."* Sample size is always shown, because a pattern from
   3 nights and a pattern from 40 nights are not the same confidence, and
   hiding that would be dishonest. **The lag, the exposure threshold and
   unit, the effect size and the sample size in a sentence like this are
   always values `getHabitCorrelations()` returns as structured fields**
   — this sentence is generated the same deterministic way
   `metricInsights.ts` already builds sentences (never by an LLM composing
   free prose around a correlation), so there's no guardrail concern in
   this document; if the coach discusses a correlation in chat, it does
   so via the structured fields below (see `2026-09-20-ai-coach-design.md`
   §4), not by re-deriving or paraphrasing the numbers itself.
8. **Persistence rule (no flickering).** One weekly run passing is a
   candidate, not a finding. Each `(userId, habitType, factor, lagDays)`
   row in `HabitCorrelation` carries `status` ∈ {`CANDIDATE`,
   `CONFIRMED`, `RETIRED`}, `consecutivePasses`, `consecutiveMisses`,
   `lastEvaluatedAt`, and the latest `r`, `pValue`, `qValue`,
   `effectSizePercent`, `comparisonPercent`, `sampleSize`. A hypothesis
   that survives step 6 for the first time is `CANDIDATE`; it becomes
   `CONFIRMED` after **two consecutive** weekly runs pass; a `CONFIRMED`
   row becomes `RETIRED` (hidden) only after **two consecutive** misses,
   so one weak week does not erase a pattern; a `RETIRED` row that passes
   twice in a row again is re-confirmed. Only `CONFIRMED` rows appear in
   the Patterns tab or are returned by `getHabitCorrelations()`;
   `CANDIDATE` rows are never shown, because surfacing possible patterns
   invites exactly the false-pattern risk this engine exists to
   prevent. The cost is deliberate: a real pattern takes at least two
   weekly runs to appear.
9. Recomputed weekly (these need enough new data between runs to be
   worth recomputing; nightly would just be noise chasing noise),
   surfaced in a dedicated "Patterns" tab, never silently injected into
   the daily score.

**Structured output for `getHabitCorrelations()`**: each surfaced row
returns `{habitType, exposureThreshold, exposureUnit, factor, lagDays,
effectSizePercent, comparisonPercent, sampleSize, direction}` — not a
pre-composed sentence. `effectSizePercent` is the mean of that factor's
percentage deviation from baseline on **exposed** paired days (the "14%
below baseline" in the worked example); `comparisonPercent` is the same
mean over **unexposed** paired days, so the surfaced number can always be
read against its control. `direction` is `'higher' | 'lower'` for
`effectSizePercent` relative to `comparisonPercent`. This is what makes
step 7's worked example renderable at all (the lag, threshold and sample
size in that sentence are values, not free text an LLM would have to
reconstruct) and what lets `2026-09-20-ai-coach-design.md`'s guardrail
treat these values the same way it treats any Stat Engine value —
grounded fields referenced via template, never numbers an LLM composes
from memory of the pattern.

## 3. Component: `CorrelationCard`

Renders one `HabitCorrelation` row: the natural-language sentence (step 7
above) plus a small sparkline of the two series aligned at the tested
lag, plus the sample-size caveat rendered as a persistent visible line,
not a footnote. Uses the same `COLORS`/`MOTION` tokens
`2026-09-20-stat-engine-design.md` §4 defines — no separate token set
for this component.

## Testing

- Unit tests for the effective-sample-size correlation test's p-value
  computation against synthetic data with a known true correlation *and*
  against synthetic autocorrelated data with no true correlation, to
  confirm the Pyper–Peterman correction actually controls the
  false-positive rate, *and* a specific regression test asserting the
  test can reject a strong synthetic correlation at realistic data
  volumes — 90 days — since the rejected permutation-based design's exact
  failure was passing every unit test while being unable to reject
  anything at that volume in practice.
- **Lag alignment**: a synthetic account whose true effect is placed on
  the night after a habit is detected at lag 1 and not at lags 2–3; a
  synthetic series where the *biometric* precedes the habit (reverse
  relationship) produces no significant result at any tested lag, which
  is the case a lag-0 test would have wrongly surfaced.
- **Habit-day boundary**: a log at 01:00 local belongs to the previous
  habit day, a log at 04:00 to the current one; changing `User.timezone`
  afterward does not change any stored `habitDay`.
- **Observed-day rule**: an unlogged, un-checked-in day is excluded from
  pairing (not counted as unexposed); a logged value of 0 and a
  check-in each count as observed and unexposed; a habit with fewer than
  8 exposed or 8 unexposed observed pairs is reported as "not enough
  data yet" and never tested.
- An integration test confirming `HabitLog` day-bucketing uses the same
  canonical day/timezone convention `2026-09-20-stat-engine-design.md`
  §2 resolves, so this document can't silently drift from that
  resolution as either document changes independently.
- **Imputed-day exclusion**: a pair whose factor value is flagged
  `imputed` is dropped; a synthetic series with a true effect plus
  injected imputed (z = 0) days recovers the effect, and does not when
  the flag is ignored.
- **Series choice**: the sleep series tested is `sleepDurationZ`;
  `sleepDebtRolling14d` is never used as a correlation series.
- **Persistence lifecycle**: one passing run yields `CANDIDATE` (not
  returned by `getHabitCorrelations()`); a second consecutive pass yields
  `CONFIRMED`; one miss on a `CONFIRMED` row leaves it `CONFIRMED`; a
  second consecutive miss makes it `RETIRED`; two consecutive passes
  re-confirm a `RETIRED` row.
- Component snapshot tests for `CorrelationCard`.

## Open Questions / Risks

- **Logging burden.** The observed-day rule (§1.3) only pays off if the
  user actually taps "Nothing today". If check-in compliance is low, most
  habits will sit at "not enough data yet" indefinitely. Worth measuring
  compliance in real use before adding any reminder mechanics, and worth
  deciding whether a low-friction default (for example auto-prompting
  once in the evening) is acceptable.
- This engine's correctness is directly downstream of
  `2026-09-20-stat-engine-design.md`'s day-alignment resolution — if that
  resolution changes (e.g. the timezone basis check surfaces a different
  answer than assumed), this document's date-alignment section needs a
  matching pass, not just the Stat Engine doc's own tests.
- The digit-only guardrail question (numbers appearing in a coach
  reply about a correlation) is intentionally **not** this document's
  concern — `getHabitCorrelations()`'s structured-field output already
  avoids letting an LLM paraphrase these numbers into free prose. See
  `2026-09-20-ai-coach-design.md` §4 for that guardrail's own open
  questions.

## Implementation Status

Slice 2 is implemented (backend and mobile). Decisions made during
implementation, which win over the text above where they differ:

- Built-in habit types (Alcohol ≥2 drinks, Caffeine ≥3 cups, Workout ≥20
  minutes) live in code (`habits/config.ts`); `HabitType` rows are custom
  types only. Custom type ids look like `CUSTOM_<SLUG>_<hex>`; duplicate
  labels (case-insensitive, including built-in labels) return 409.
- `HabitCorrelation.lastRunKey` stamps the ISO week a row was last evaluated
  in, so a repeat run in the same week (including a BullMQ retry) is skipped;
  a run's writes are one transaction.
- `n_eff` is floored at 3 and also capped at `n`, so a negative
  autocorrelation product never inflates it. The lag-1 autocorrelation only
  pairs calendar-adjacent days, so gaps from unobserved days do not count as
  consecutive. Weekday means for de-seasonalizing are taken over the paired
  set. The analysis looks back 120 days.
- `notEnoughData` counts come from the best `(factor, lag)` combination for
  that habit.
- The weekly sweep runs Mondays 05:00 and fans out one deduplicated job per
  user, including users who have stopped logging, so their patterns age
  toward RETIRED.
- `series` in a pattern is already aligned at the tested lag: `days[i]` is
  the habit day and `factor[i]` is the reading on that day plus the lag. The
  mobile client must not shift it again (an earlier mobile version did; that
  was a bug).
- Validation beyond this spec: `loggedAt` more than 24 hours in the future is
  rejected; a log for another user's type id returns 400; deleting another
  user's log returns 404.

**The patterns endpoint reads stored results.** `GET /me/habits/patterns`
returns the stored `CONFIRMED` rows (the weekly lifecycle is what the user
sees) and never runs the statistical analysis or touches unconfirmed
candidates. Only the `notEnoughData` progress counts ("3 of 8 needed") are
computed on request, by a lightweight `computeNotEnoughData` that shares the
engine's pair-counting and gate helpers (so the counts cannot drift from
what `analyzeHabits` reports) but runs no correlation, p-value or
Benjamini–Hochberg step. They are live on purpose: the number must move as
soon as the user logs "nothing today", not a week later.
