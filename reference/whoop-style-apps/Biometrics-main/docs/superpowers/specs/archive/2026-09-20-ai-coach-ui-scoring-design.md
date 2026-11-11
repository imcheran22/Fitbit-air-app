> **SUPERSEDED — do not edit, do not build from this document.**
> This combined spec (v1–v4) was split into three maintained documents,
> which contain every fix from its review rounds and later ones:
>
> - `../2026-09-20-stat-engine-design.md` (Slices 0, 1, 1.5)
> - `../2026-09-20-habits-correlation-design.md` (Slice 2)
> - `../2026-09-20-ai-coach-design.md` (Slice 3)
>
> Kept only as history. Its content diverges from the current specs
> (for example, its sleep-sum upsert fix, lag-0 correlation and digit-scan
> exemptions are all known to be wrong).

# Phases 2–4: Recovery Engine, AI Coach & Design System — Design

## Context

Phase 1 (Foundation, shipped) and the Google Health migration (shipped)
built the pipe: OAuth connect → encrypted token storage → webhook-driven
sync worker → `BiometricRecord` rows → a minimal dashboard with four
metric rings and one deterministic, non-AI headline sentence
(`mobile/src/lib/metricInsights.ts` — explicitly "no external model call,
no fabricated score").

This spec covers what the original Phase 1 doc scoped out as Phases 2–4:
recovery/readiness scoring, habit tracking, correlation & insights — plus
two things not in the original phase plan at all: an actual LLM-backed AI
coach, and a proper design system (the current UI is seven components and
a theme file). The user asked for this to be **as over-engineered as
possible**, taken seriously rather than literally: every heavier option
kept below is kept because it buys down a specific, named risk (score
correctness, statistical validity of a claimed pattern, user privacy on
health data) — not because heaviness is the goal for its own sake. Where a
heavier option was drafted and turned out to add ceremony without
addressing a real risk, it was cut back across revisions (see Revision
History); what survived is deliberately heavy but every heavy piece has a
stated reason.

## Revision History

- **v1**: initial draft — three subsystems, no sequencing, several
  unflagged gaps (data model, permutation-test rigor, guardrail design).
- **v2**: added Build Order/MVP slicing; fixed the missing sleep-structure
  schema dependency; added Benjamini–Hochberg correction to the
  correlation engine (unfixed then: still assumed independent shuffling —
  see v3); replaced the regex number-scan guardrail with server-side
  `{{field}}` resolution (unfixed then: didn't reject free-text numbers —
  see v3); cut the BullMQ `FlowProducer`, the per-user canary rollout, and
  the tiered-token codegen build step as complexity that didn't pay for
  itself; gated `ScoreRing`'s segmented arc behind a design spike.
- **v3**: the `{{field}}` guardrail became reject-and-regenerate, not
  just resolve-and-trust — a spelled-out number or an unresolvable field
  path now fails closed (unfixed then: the streaming design it shipped
  with couldn't actually support "discarded and regenerated" once
  sentences had already streamed — see v4). The correlation engine's
  permutation test moved to block/circular-shift shuffling to address
  autocorrelation (unfixed then: this doesn't fix the real problem — see
  v4) and started correlating against per-factor z-scores instead of the
  composite. Added the data-handling/consent section — health data
  reaching an LLM provider had been entirely unaddressed (unfixed then:
  covered only the LLM vendor's terms, not Google's or this app's own
  retention — see v4). Fixed cross-reference errors, the Sleep Score
  build-order contradiction, the hardcoded 480-minute sleep goal, and the
  leftover "guardrail_strip" language. Observability scoped to Slice 3.
- **v4** (this version): the correlation engine's block-permutation
  design is **replaced outright**, not patched — verified mathematically
  inert at realistic data volumes (a circular shift's p-value floor of
  ~1/90 at 3 months of data can never clear the Benjamini–Hochberg
  threshold, so it would surface nothing until well past a year of data
  regardless of whether a real pattern exists). Now an autocorrelation-
  corrected parametric test (Pyper–Peterman effective-sample-size
  adjustment), which has no such floor. **Verified the date-alignment
  claims against the actual `client.ts` implementation** rather than
  assumption, and found a real, previously-unflagged issue: STEPS/
  RESTING_HR/HRV are keyed by Google's own civil date, SLEEP by this
  app's own UTC-truncated instant — a genuine day-boundary mismatch
  affecting Stage 4's inputs directly, not just correlation, now a
  blocking prerequisite in §1.2. **Corrected a fabricated claim**: the
  migration spec never confirmed `Sleep.summary.timeInBed` or
  `minutesAwake` live — only `minutesAsleep` — so `SleepSession` now
  derives time-in-bed from the sleep interval's own confirmed start/end
  instants instead of depending on an unverified field. Fixed the
  guardrail's internal contradiction (it claimed "discarded and
  regenerated" while also streaming sentence-by-sentence, which are
  incompatible — coach replies are now buffered whole before sending).
  Replaced the number-word block list (which false-triggered on ordinary
  words like "one" and "half") with a digit-only scan, trading some
  recall for not breaking on normal prose. `getHabitCorrelations()` now
  returns structured numeric fields rather than expecting the coach to
  paraphrase a correlation into prose the guardrail could reject. Added
  Google Health API's own downstream-sharing terms and this app's own
  chat/`CoachMemory` retention-on-account-deletion as required
  preconditions in §2.5, alongside the LLM vendor terms v3 already
  covered. Removed a leftover edit-history parenthetical that survived
  v3's otherwise-completed cleanup pass.

## Build Order

The three subsystems are separable and should ship in this order — each
slice is independently useful, and each is a dependency for the next:

1. **Slice 1 — Recovery Score only.** Part 1 (Stat Engine), Recovery Score
   only, no Sleep Score, no habit correlation, no coach. This needs only
   the four metrics already synced. Ships value alone: the segmented
   `ScoreRing` + factor breakdown (§3.3, §3.5) is a real upgrade over
   today's single headline sentence with nothing else built yet.
2. **Slice 1.5 — Sleep Score.** Depends only on Slice 1's baseline-model
   infrastructure plus one schema addition (`SleepSession`, see the data
   model gap below) — not on habits or the coach. Ships as the next thing
   built after Slice 1, before habits/coach, since it reuses Slice 1's
   pipeline directly and needs neither of the later slices.
3. **Slice 2 — Habits + correlation.** Depends on Slice 1 (and, for the
   sleep-debt-vs-sleep-goal correlation case, benefits from but doesn't
   strictly require Slice 1.5) for the score to correlate against.
   `HabitLog` + §1.3's correlation engine, surfaced in its own "Patterns"
   tab.
4. **Slice 3 — AI Coach.** Depends on Slices 1, 1.5 and 2 — its tool
   registry (§2.2) is literally `getDailyScore`/`getHabitCorrelations`
   from the prior slices. Building the coach before there's a score or a
   correlation to ground it in would leave it nothing grounded to say.
   Also depends on the data-handling/consent work in §2.5 being resolved
   before it ships to anyone, not as a Slice-3-internal task but as a
   precondition of it.

**Three subsystems, one spec:**
1. **Stat Engine** — turns `BiometricRecord` rows into a Recovery Score,
   a Sleep Score, a Strain/Load Score, and a correlation graph between
   logged habits and biometric trends.
2. **AI Coach** — an LLM-backed conversational layer that sits *on top of*
   the Stat Engine, never *instead of* it (the coach explains and
   contextualizes numbers the Stat Engine already computed; it does not
   compute or invent numbers itself).
3. **Design System** — the visual/interaction language the first two
   subsystems are rendered through.

## Goals

- A daily **Recovery Score** (0–100) and **Sleep Score** (0–100), each
  with a full factor breakdown, personalized per-user baselines, and a
  documented, versioned, backtestable scoring algorithm.
- User-logged **habits** (caffeine, alcohol, workouts, sleep timing, plus
  an extensible schema for custom habits) correlated against biometric
  trends with actual statistical rigor (lagged cross-correlation, not
  "these two lines both went down once").
- An **AI coach** the user can converse with, which is grounded entirely
  in Stat-Engine output and the user's own logged data — never in the
  model's own arithmetic — with a configurable persona, tool-calling
  architecture, memory, safety rails, and an eval harness.
- A **design system**: tokens, a component library with documented
  variants, a motion/choreography spec, and a scoring-visualization
  language (rings, gauges, factor bars) used consistently across all
  three subsystems.

## Non-Goals

- Replacing the existing sync pipeline — Phases 1/2(migration) stand as
  built. This spec is additive, downstream of `BiometricRecord`.
- Diagnosing or treating anything. Every score and every coach response
  carries the existing "comparison against your own recent readings, not
  a medical assessment" framing from Phase 1, non-negotiably.
- Real-time (sub-minute) scoring. Recovery/Sleep scores are computed once
  per day per user, on new-data arrival — this is a batch/event pipeline,
  not a streaming one (see §1.2 — a same-day recompute triggered by a
  debounced webhook is as real-time as this needs to get).

---

## Part 1 — The Stat Engine

### 1.1 Why this is the hard part

A single `trendPercent` field (today's Phase 1 approach) is honest and
cheap but can't produce a meaningful composite score, because the four
metrics don't move on the same scale, aren't equally informative, and a
naive rolling average is fooled by missing data, outliers (a wrong Fitbit
reading), and the fact that "high HRV is good" but "high resting HR is
bad" — direction of goodness isn't uniform. The over-engineered answer to
"how do I compare things that live on different scales" is: don't compare
raw values, compare **z-scores against a personalized rolling baseline**,
then combine z-scores with **domain-motivated weights**, and treat the
whole pipeline as a versioned, backtestable model rather than a formula
buried in a component.

### 1.2 Architecture: five pure stages, persisted — not a five-job flow

**Blocking prerequisite, verified against the live implementation, not
assumed: the four metrics do not currently share one definition of
"day," and this has to be resolved before any composite score is built
on top of them, not treated as a detail to sort out later.**

`backend/src/health/client.ts` keys each metric's `recordedAt` by a
different convention:

- **STEPS and RESTING_HR** (`fetchMetricRange`, lines 151–162): keyed by
  `civilStartTime`, a civil-date object **Google's own `dailyRollUp`
  response provides** — its timezone basis (account locale? device
  locale? UTC?) isn't stated anywhere in this codebase or the migration
  spec, and hasn't been checked.
- **HRV** (lines 183–194): keyed by `dailyHeartRateVariability`'s own
  `.date` field — also a Google-provided civil date, from a *separate*
  collection (`daily-heart-rate-variability`) than what the migration
  spec originally described for this metric (that spec describes a raw,
  sample-based `dataPoints.list` fetch on `heartRateVariability`; the
  shipped code instead calls a pre-aggregated daily collection the spec
  never mentions — the implementation moved past the design doc here,
  and the design doc was never updated to match, which is its own small
  process gap worth closing separately from this one).
- **SLEEP** (lines 163–182): keyed by `utcMidnightOf(new
  Date(r.sleep.interval.startTime))` — **this app's own code**
  truncating the sleep session's raw start instant to **UTC** midnight,
  a completely different, code-defined convention from the other three
  metrics' Google-provided civil dates.

Concretely: for a user in any timezone west of UTC (the common case for
Fitbit/Google Health users in the Americas), a sleep session starting
around 10–11pm local time is already past UTC midnight — SLEEP's
`recordedAt` lands on what Google's civil-date convention would likely
call the *next* day, for STEPS/RESTING_HR/HRV recorded against the
*previous* day. This isn't a rare edge case at a specific latitude; it's
the ordinary case for a normal bedtime in most US timezones. **A
Recovery Score computed for "day D" may currently combine an HRV value,
an RHR value, and a sleep-debt value that don't actually refer to the
same night**, because they were never verified to share a day boundary
in the first place — this is a scoring-correctness issue, not merely a
habit-correlation nuance, since it directly affects Stage 4's inputs.

**Resolution, required before Slice 1 ships, not designed here**:
(a) confirm live, against a real account, what timezone basis Google's
civil-date rollups actually use; (b) pick one canonical day definition
for `UserDailyFeatures`/`DailyScore` — the natural candidate is SLEEP's
own date (recovery scoring is inherently "about a night"), with
STEPS/RESTING_HR/HRV re-bucketed to match it rather than trusted as-is;
(c) apply the same explicit timezone rule to `HabitLog` day-bucketing
(§1.3) so a habit logged near midnight buckets consistently with
whichever metric convention wins. This is Slice-1-blocking — the kind of
live-API verification this codebase's own house style already does for
every other API-shape claim (see the migration spec's "Confirmed API
Facts" section) — not something this design spec can resolve from a
desk read of one file.

Rejected: computing the score inline in the `GET /me/biometrics` handler
(no intermediate values persisted, nothing inspectable later).

**Also rejected**: a BullMQ `FlowProducer` with five independently-
retryable child jobs. That's over-engineering that costs correctness-
adjacent complexity for nothing — this is one user's daily arithmetic,
running in low
milliseconds, with no stage that can partially fail independently of the
others (there's no network call, no external API, nothing Stage 3 can do
that fails while Stage 2 succeeds). A five-job flow adds retry policies,
job-state tracking, and a BullMQ dashboard's worth of observability
surface for a pipeline that either runs to completion or doesn't, and
either way needs the exact same one retry: recompute the day.

**Adopted instead**: five stages as five pure, independently unit-tested
TypeScript functions, called in sequence from one job
(`computeDailyScore(userId, date)`, a single BullMQ job — queued, not
flowed), with the two intermediate artifacts that actually matter
persisted as real rows: `BaselineSnapshot` (Stage 3's output) and
`DailyScore` (Stage 4/5's output). That persistence is what makes "why
did my score drop 12 points today, and is that reproducible six months
from now" answerable — the replayability that matters comes from
persisting the right intermediate state, not from the job orchestration
shape. The diagram below still describes the five
conceptual stages; it now describes function calls, not queue jobs.

```
BiometricRecord (raw)
   │
   ▼
┌─────────────────┐   ┌──────────────────┐   ┌───────────────────┐
│ 1. Cleaning      │──▶│ 2. Feature Store  │──▶│ 3. Baseline Model │
│ outlier reject,  │   │ per-user, per-day │   │ rolling robust    │
│ gap imputation   │   │ derived features  │   │ mean/MAD, EWMA    │
└─────────────────┘   └──────────────────┘   └─────────┬─────────┘
                                                          ▼
┌─────────────────┐   ┌──────────────────┐   ┌───────────────────┐
│ 5. Explainability│◀──│ 4. Composite      │◀──│  z-scores per     │
│ per-factor       │   │ Score(s)          │   │  metric per day   │
│ contribution     │   │ weighted, versioned│  │                   │
└─────────────────┘   └──────────────────┘   └───────────────────┘
```

Triggered by: (a) the sync worker's existing webhook-driven write path,
debounced 5 minutes per user so a burst of overnight sleep+HRV+RHR
webhooks triggers one recompute, not three; and (b) a nightly BullMQ
repeatable job sweeping any user with new data since their last computed
score, as a correctness backstop for missed debounce windows. Both enqueue
the same single `computeDailyScore` job — the debounce/sweep logic is
where the real complexity of "when do we recompute" belongs, not in the
computation's internal job structure.

#### Stage 1 — Cleaning

- **Outlier rejection**: reject a `BiometricRecord` value more than 5
  MAD (median absolute deviation — robust to the outliers themselves,
  unlike a stddev-based rule) from that user's trailing 90-day median for
  that metric. Rejected points are flagged (`ScoreInputFlag.OUTLIER`),
  never silently dropped from the table — the raw record stays, only the
  score computation skips it.
- **Gap imputation**: a missing day for a metric with a real trend (HRV,
  RHR) is imputed via that metric's existing Stage-3 EWMA baseline (the
  same 30-day baseline used for z-scoring — not a separate imputation-
  specific window, which would be one more parameter to keep in sync)
  rather than skipped outright, *but* `DailyScore.confidenceLevel`
  (Stage 4) is downgraded one level for any day with an imputed input —
  imputation buys score continuity, not free information.

#### Stage 2 — Feature Store

A `UserDailyFeatures` table, one row per user per day, computed once and
reused by every downstream stage (and, later, by the AI coach's
tool-calling layer, so the coach and the score always cite the same
numbers — this is the grounding mechanism referenced in Part 2). Columns
beyond the raw daily metric values:

- `sleepEfficiency` (`minutesAsleep / timeInBedMinutes`, where
  `timeInBedMinutes = (interval.endTime − interval.startTime)`, **derived
  from the sleep session's start/end instants, not from
  `Sleep.summary.timeInBed`** — that field is not actually confirmed to
  exist; see the correction below. Schema addition needed — Slice 1.5,
  see below. Not needed for Slice 1's Recovery Score),
- `sleepDebtRolling14d` (sum of `(sleepGoalMinutes − minutesAsleep)` over
  the trailing 14 days, floored at 0 per day — a rolling deficit, not a
  single-night number. **`sleepGoalMinutes` is the user's configured
  sleep goal, defaulting to 480** — this must be the same value
  `getUserGoals()` (§2.2) returns and the same one the mobile dashboard's
  `METRIC_CONFIG.SLEEP.goal` shows, sourced from one place, not
  hardcoded independently in the scoring code and the coach's tool layer
  as two numbers that could drift apart if a user ever customizes their
  goal),
- `hrvBaselineDeviationPct`,
- `rhrBaselineDeviationPct`,
- `acuteChronicLoadRatio` (7-day rolling step-derived load ÷ 28-day
  rolling step-derived load — borrowed from sports-science ACWR).
  **Not shipped in Slice 1**: ACWR is normally
  built from actual training load (session duration × intensity), and a
  steps-derived proxy is exactly the kind of unvalidated input a
  0.15-weighted term in a score people act on shouldn't be. This field
  ships computed-and-stored-but-excluded from the Recovery Score
  composite until either (a) workout-session data is added (a real scope
  addition to the Google Health OAuth grant, out of scope for this spec)
  or (b) it's validated against self-reported perceived exertion for a
  meaningful number of users. The DAG computes it now so the historical
  series exists to validate later — it just isn't in `k`'s weighted sum
  yet.
- `circadianConsistencyScore` (stddev of sleep *onset* time over trailing
  14 days, inverted/normalized — consistent bedtime is itself
  recovery-relevant, independent of duration). **Data-model gap**: sleep
  onset time isn't derivable from `Sleep.summary.minutesAsleep` (the only
  sleep field currently persisted) — it needs the sleep session's
  `startTime`, same schema gap as `timeInBed` below, not a separate one.
  Bundled into the one schema addition, not two.

**Data model gap, stated plainly:** `BiometricRecord` is `(userId,
metricType, value: Float, recordedAt)` — one number per metric per
timestamp. `sleepEfficiency` and `circadianConsistencyScore` both need
sleep *structure* (onset time, time-in-bed), which needs a real schema
addition, not a bigger `value`. Concretely: a `SleepSession` table
(`userId`, `startTime`, `endTime`, `minutesAsleep`) fed from the same
payload `backend/src/health/client.ts` already fetches for the `SLEEP`
metric — confirmed live and already reading `sleep.interval.startTime`
from it at line 179, and `sleep.interval.end_time` is confirmed as a
valid field there too (it's the literal filter field the query uses at
line 171). **`Sleep.summary.timeInBed` and `minutesAwake` are correction
targets, not confirmed facts** — the earlier version of this spec claimed
`timeInBed` was confirmed present per the Google Health migration spec;
it isn't. That spec's own "Confirmed API Facts" section verifies exactly
one sleep field live: `Sleep.summary.minutesAsleep`. **Fixed here**:
`SleepSession` stores only fields already confirmed to exist
(`startTime`, `endTime`, `minutesAsleep`), and `timeInBedMinutes` —
needed for `sleepEfficiency` — is *derived* as `endTime − startTime`
rather than pulled from an unverified `summary.timeInBed` field.
`minutesAwake` is dropped from the schema entirely; nothing in this spec
needs it once time-in-bed is derived this way. If a future need for it
comes up, it gets the same live-API confirmation step Phase 1 and the
migration spec both used for every other field claim in this codebase —
not assumed from a field name that sounds plausible.

**This is a Slice 1.5 dependency, not a Slice 1 one** — Slice 1's
Recovery Score only needs `sleepDebtRolling14d`, which is derived from
`minutesAsleep` alone, already stored. Getting this labeled correctly
matters because it changes what's actually blocking Slice 1 (nothing) vs.
Slice 1.5 (this table).

**Backfill note**: `SleepSession.startTime` only exists from the day this
table starts being written — there's no retroactive way to derive a past
night's start time from the `minutesAsleep`-only records already in the
database. `circadianConsistencyScore`'s 14-day cold-start window
therefore starts counting from Slice 1.5's ship date, not from however
much sleep history already exists — the first two weeks after Slice 1.5
ships show `BaselineProgressRing`'s cold-start state (§3.3) for this one
factor even for a user with months of existing `minutesAsleep` data. This
is a real, if minor, product cost worth naming rather than assuming away.

Workout/training-load data is a larger gap: it doesn't exist in this
app's OAuth scope at all today, so `acuteChronicLoadRatio` stays
excluded from the composite (above) until that's a deliberate, separate
scope-expansion decision — not something this spec should quietly assume
into a shipped score.

#### Stage 3 — Baseline Model

Rejected: a flat 30-day average (Phase 1's `computeStats` — fine for a
single dashboard sentence, not for a score someone tracks daily).
Adopted: **per-metric, per-user Exponentially Weighted Moving
Average + robust spread**, with a longer memory than a simple average so
the baseline doesn't chase the last data point:

- `EWMA_t = α·value_t + (1-α)·EWMA_{t-1}`, `α = 2/(N+1)` with `N = 30`
  (≈30-day effective window, weighted toward recent days).
- Spread via **rolling MAD** (robust to the outliers Stage 1 didn't
  catch), not stddev.
- **Cold-start handling**: fewer than 14 days of history for a metric →
  the metric is excluded from the composite score entirely for that user
  (not defaulted to a population average — a population baseline would
  be a fabricated per-user number, which the existing codebase's own
  house style explicitly avoids). The score UI shows "Building your
  baseline (9/14 days)" during this window via `BaselineProgressRing`
  — see §3.3.
- Baseline recomputation is itself versioned (`BaselineSnapshot` table,
  one row per user per metric per day) so a score computed today can be
  reproduced exactly later even as the rolling window moves — required
  for backtesting (§1.4) and for explainability (§1.2 Stage 5) to ever be
  auditable.

#### Stage 4 — Composite Score(s)

Two scores, each a weighted sum of per-metric z-scores against that
metric's Stage-3 baseline, **direction-corrected** (HRV/sleep-efficiency
z-scores count positively, RHR/sleep-debt z-scores count negatively),
then mapped through a logistic squashing function to land in [0, 100]
rather than an unbounded z-space:

```
score = 100 / (1 + e^(-k · Σ(w_i · z_i)))
```

`k` tuned so a "textbook normal day" (all z ≈ 0) lands at 50, and two
standard deviations of favorable deviation lands near 90 — chosen and
documented in the model config, not hardcoded magic numbers in the
formula.

**Recovery Score** weights (Slice 1 — `acuteChronicLoadRatio` excluded
per the flag in Stage 2 above, so weights are renormalized across three
factors, not four):

| Factor | Weight | Direction |
|---|---|---|
| HRV baseline deviation | 0.45 | + |
| RHR baseline deviation | 0.35 | − |
| Sleep debt (14d rolling) | 0.20 | − |

**These weights are stated honestly as illustrative, not derived** — and
that has a real consequence, not glossed over: there is no ground-truth
label for "recovery" to fit these against (no injury/illness outcome
data, no validated survey), so this spec cannot claim the weights are
*correct*, only a documented starting point. The backtest tool (§1.4)
can show the *effect* of changing them across historical data, not their
*correctness* — that distinction matters and is called out again there.

**Sleep Score** is a separate composite (duration vs. goal, efficiency,
circadian consistency, weighted independently) rather than folded into
Recovery — because a user asking "why was my recovery low" and a user
asking "why did I sleep badly" are different questions, and conflating
them into one number would make both answers worse. It's **Slice 1.5**
per the Build Order — it depends on the `SleepSession` schema addition
above, so it ships right after Slice 1's Recovery Score is live, not
bundled with it, and its own cold-start window is real (see the backfill
note above).

`DailyScore` (Recovery Score in Slice 1; Sleep Score added in Slice 1.5)
is stored with `algorithmVersion`,
`confidenceLevel` (`HIGH`/`MEDIUM`/`LOW`, derived from how many inputs
were imputed/cold-started that day), and the full per-factor z-score
vector as JSON — the raw material for Stage 5.

#### Stage 5 — Explainability

Every `DailyScore` renders with a **factor contribution breakdown**: for
each weighted term, `contribution_i = w_i · z_i` (direction-corrected),
sorted by magnitude, rendered as horizontal bars ("HRV: +8.2 pts · RHR:
−3.1 pts · Sleep debt: −1.4 pts"). This is not a black box — it is
literally the addends of Stage 4's sum, so "explainability" here costs
nothing extra to *compute* (it's already inside the formula) but a
meaningful amount to *design well* (§3.5) and to keep in sync as the
weight table evolves across algorithm versions.

### 1.3 Habit correlation engine

Habits (caffeine, alcohol, workout, custom) are logged by the user via a
new `HabitLog` model (`userId`, `habitType`, `value` (nullable —
alcohol/caffeine take a quantity, workout takes a duration+intensity
enum, sleep-timing habits take a time), `loggedAt`, `note`).

Rejected: a same-day Pearson correlation between habit-present-days and
score ("days you drank vs. days you didn't"). Too weak — a habit's effect
is rarely same-day (alcohol tonight shows up in tomorrow's HRV) and a
naive same-day correlation invites false negatives.

**Date alignment.** This is a direct consequence of §1.2's blocking
prerequisite, not a separate concern — earlier drafts of this section
described `SLEEP`/`HRV` as sharing one "sleep session start time"
convention, which the actual code doesn't support (§1.2 verified HRV
uses Google's civil date, not a sleep-session-relative one, and only
SLEEP uses this app's own UTC-truncated start instant). Once §1.2's
resolution picks one canonical day definition for `DailyScore`, `HabitLog`
day-bucketing uses that same definition, with the same timezone rule —
this section doesn't get to define its own separate "day" independent of
what the score itself settled on. What's fixed here, independent of which
convention §1.2 ultimately picks: whichever day a habit is logged
against, `lag 0` means "the score for the day-bucket the habit's
timestamp falls into under that shared convention," not an assumption
about mornings or evenings — the exact mapping is only pinned down once
§1.2's prerequisite is resolved, and this section inherits it rather than
re-deciding it.

**Correlated against per-factor z-scores, not the composite score** —
`hrvBaselineDeviationPct`'s z-score, `rhrBaselineDeviationPct`'s
z-score, `sleepDebtRolling14d`'s z-score, each tested against each habit
independently, not the single blended Recovery Score number. This matters
for two reasons: it's what the worked example in step 7 below actually
claims ("your HRV averaged 14% below baseline" is a per-factor claim, not
a composite-score claim), and a habit that moves one factor strongly but
gets diluted into a three-factor weighted sum would be invisible to a
composite-level test even when it's a real, specific, useful pattern to
surface.

**Rejected: circular-shift permutation testing** — the previous version
of this spec, on the reasoning that habits and the z-score series are
both autocorrelated and shouldn't be independently reshuffled. That
reasoning was right, but the fix was wrong in a way that breaks the
feature outright: a circular shift of an *n*-day series has at most
*n*−1 distinct rotations, so at 3 months of data (~90 days) the smallest
achievable empirical p-value is ~1/90 ≈ 0.011 — no matter how strong the
real correlation is. Benjamini–Hochberg at `q < 0.10` across 30–60 tests
needs the smallest p-value to clear roughly `q/m ≈ 0.002–0.003` to reject
anything. **0.011 can never clear 0.002** — this design is mathematically
inert, not just underpowered: it would surface nothing until well past a
year of accumulated data, real pattern or not, and that's a hard floor of
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
2. For lag `L` in `{0, 1, 2, 3}` days, compute Pearson `r` between the
   de-seasonalized habit-day indicator (or magnitude) and the
   de-seasonalized factor z-score on `day + L`.
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
5. **Minimum-observation gate.** Require at least 8 habit-logged days at
   a given lag before testing it at all — both the autocorrelation
   estimate in step 3 and the t-distribution approximation in step 4 are
   asymptotic and unreliable on very small samples, so a habit logged
   twice doesn't get a p-value that looks as confident as one logged
   forty times.
6. **Multiple-comparisons correction**, unchanged in method from the
   prior version, now meaningful because step 4 no longer floors:
   4 lags × N habit types × 3 factors is 30–60 simultaneous tests per
   user per week — apply **Benjamini–Hochberg FDR correction** across the
   full set of `(habit, lag, factor)` p-values computed together in one
   run. Only hypotheses surviving BH-correction at `q < 0.10` **and**
   `|r| > 0.3` surface as a confirmed insight.
7. Worded as correlation, never causation, and naming the specific
   factor tested rather than the composite score: *"On the two days
   after you log 2+ drinks, your HRV has averaged 14% below baseline
   (across 11 observations) — this is a pattern in your own data, not a
   general medical claim."* Sample size is always shown, because a
   pattern from 3 nights and a pattern from 40 nights are not the same
   confidence, and hiding that would be dishonest. **The lag, threshold,
   and sample size in a sentence like this are always numbers
   `getHabitCorrelations()` (§2.2) returns as structured fields** — this
   sentence is generated the same deterministic way `metricInsights.ts`
   already builds sentences (never by the coach model composing free
   prose around a correlation), so there's no guardrail concern here; if
   the coach discusses a correlation in chat, it does so via `{{field}}`
   references into this same structured data (§2.4), not by re-deriving
   or paraphrasing the numbers itself.
8. Stored in a `HabitCorrelation` table, recomputed weekly (these need
   enough new data between runs to be worth recomputing; nightly would
   just be noise chasing noise), surfaced in a dedicated "Patterns" tab,
   never silently injected into the daily score.

### 1.4 Backtesting & versioning

`ScoreAlgorithmVersion` is a config object (weights, `k`, thresholds),
checked into the repo as versioned JSON/TS (`scoreConfigs/v1.ts`,
`v2.ts`, ...), never mutated in place. A `scripts/backtest.ts` tool
replays historical `BiometricRecord` + `BaselineSnapshot` data through a
candidate new version and diffs the resulting `DailyScore` history
against the currently-live version. **Said precisely, because §1.2's
weight table already flagged this**: this diff shows *what changed*
between two versions for real historical data — it is a regression/
sanity check ("did this reweighting flip more users' scores by more
than 10 points than expected"), not a validation that either version is
*correct*, since there's no ground-truth label to validate against. It
catches "this change did something bigger than I expected," which is a
real and useful thing to catch — it just isn't the same claim as "this
change made the score more accurate," and the tool's own output/docs
should say so rather than imply otherwise.

**Rollout.** Rejected: a per-user `algorithmVersion` flag with cohort
canaries and aggregate distribution-shift comparison — real
infrastructure for an experiment program, on an app with one user (the
person this app is being built for) and no near-term plan for a cohort of
users to canary across. That's over-engineering that doesn't pay for
itself even by this spec's own generous standard. **Adopted instead**:
`algorithmVersion` stays a
per-user column (harmless, and it's what makes a `DailyScore` row
self-describing/reproducible), but "rollout" is just: run the backtest
diff, read it, flip the default in config, deploy. If this app ever
does have many independent users, the per-user column is already there
to build a real canary on top of later — but that's a future spec's
problem to design when it's a real need, not this one's to prebuild.

---

## Part 2 — The AI Coach

### 2.1 What the coach is and isn't

The coach is a **grounded explainer and Q&A layer**, not a second scoring
system. It never computes a number — it calls tools that read `DailyScore`
and `UserDailyFeatures` (the same tables Part 1 built) and talks about
what's already there. This is the single load-bearing design decision in
this section, and it's a direct extension of the existing codebase's own
stated principle in `metricInsights.ts` ("no external model call, no
fabricated score") — the coach doesn't relax that principle, it adds a
conversational surface *on top of* numbers that principle still governs.

### 2.2 Architecture

```
Mobile chat UI
   │  (single request/response — no incremental
   │   streaming; §2.4 buffers the full reply
   │   server-side before anything is sent back)
   ▼
POST /coach/message  ──▶  Orchestrator
                              │
                    ┌─────────┼─────────────────┐
                    ▼         ▼                  ▼
              System Prompt  Tool Registry   Memory Store
              (persona cfg)  (read-only)     (short+long term)
                    │         │                  │
                    └─────────┴──────────────────┘
                              ▼
                         Model Router
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Fast/cheap model    Larger model
              (single-turn Q&A)   (weekly synthesis,
                                   long-context recall)
                    │                   │
                    └─────────┬─────────┘
                              ▼
                     Safety/Guardrail Layer
                    (pre + post response)
                              ▼
                Sent to client, whole, once validated
```

#### Tool registry (the grounding mechanism)

The model is given exactly these tools, each a thin read-only wrapper
over Part 1's tables — no tool can write, and no tool exposes raw SQL:

- `getDailyScore(date)` → `{recoveryScore, sleepScore, factors[],
  confidence, deltaFromYesterday}` — **`deltaFromYesterday` is
  precomputed server-side, not left for the model to subtract**: the
  model has no arithmetic of its own that this spec trusts, so "why is my
  score lower today" needs the delta handed to it as a field, not derived
  by the model doing `today - yesterday` in its head and hoping it's
  right.
- `getScoreHistory(metric, days)` → array, for "how has my recovery
  trended this month"
- `getHabitCorrelations()` → the significant, pre-vetted correlations
  from §1.3 only, each returned as **structured fields** —
  `{habitType, factor, lagDays, effectSizePercent, sampleSize,
  direction}` — not a pre-composed sentence, so the coach references
  them via `{{field}}` templates the same as any score value (§2.4)
  rather than paraphrasing numbers into free prose. The model is never
  handed raw habit logs to eyeball-correlate itself, because that would
  bypass the significance gate entirely and reintroduce exactly the
  false-pattern risk §1.3 was built to prevent.
- `getUserGoals()` → user-set goals (steps target, sleep target, if
  customized from METRIC_CONFIG defaults) — the same values
  `sleepDebtRolling14d` (§1.2 Stage 2) is computed against, sourced from
  one place.

System prompt instructs (and the guardrail layer, §2.4, enforces
independently of instruction-following) that **any specific quantity in a
response must be a value returned by a tool call in that turn** — the
model doesn't recite a number from its own context/memory of an earlier
tool call without re-fetching, since a score computed yesterday may not
be today's, and it doesn't compute a derived quantity (a delta, a
percentage) itself — if a derived quantity is needed, the tool returns it
precomputed (see `deltaFromYesterday` above).

#### Model routing

Two tiers, chosen per request by the orchestrator, not by the user:

- **Fast tier**: single-turn factual Q&A ("what was my HRV yesterday",
  "why is my score lower today") — low latency, tool-call-heavy, short
  responses.
- **Synthesis tier**: weekly/monthly recap generation, multi-turn
  conversations referencing several weeks of history, anything invoking
  `getHabitCorrelations` across a long window — larger context budget,
  higher latency tolerated, run as a background job (§2.6) rather than
  inline chat for the weekly recap case specifically.

Provider-agnostic router interface (`CoachModelProvider`) with a primary
provider and a configured fallback — not because multi-provider is
strictly needed at this scale, but because a coach that goes fully silent
on a single provider's outage is a worse failure mode here than in a
typical app (a user checking in on a bad recovery day deserves the app to
degrade gracefully, not 500).

### 2.3 Persona configuration

A `CoachPersona` config (versioned, same pattern as `ScoreAlgorithmVersion`)
rather than a single hardcoded system prompt, because "how blunt should
the coach be about a bad recovery score" is a real product decision
worth being able to tune and A/B without a redeploy:

```ts
interface CoachPersona {
  id: string;
  name: string;              // "Direct", "Encouraging", "Clinical"
  tone: string;               // free-text style guidance, injected into system prompt
  verbosity: 'terse' | 'normal' | 'detailed';
  proactivity: 'reactive-only' | 'daily-checkin' | 'threshold-triggered';
  disallowedTopics: string[]; // always includes medical-diagnosis, medication dosing
}
```

Users pick a persona in Settings (default: "Encouraging, normal,
threshold-triggered"); the system prompt is templated (never
string-concatenated raw user config into the prompt — persona fields are
interpolated into a fixed template with their own escaping, to keep this
a config surface, not a prompt-injection surface for the user's own
account, minor as that particular risk is here).

### 2.4 Guardrails (independent of prompt instructions)

Prompt instructions are advisory; the guardrail layer is enforced in
code, on both directions:

- **Pre-request**: a lightweight regex/keyword classifier flags messages
  mentioning self-harm, medication dosing, or acute medical symptoms, and
  routes those to a fixed, non-LLM-generated safety response with crisis
  resources, bypassing the model entirely for that turn. **Tuned
  deliberately toward false positives, not precision** — a classifier that over-triggers costs an occasional
  unnecessary "here are some resources" on an innocuous message; one that
  under-triggers costs missing an actual crisis message. Given that
  asymmetry, this is the one place in the whole spec where "keep it
  simple and slightly over-sensitive" beats "keep it clever," and the
  crisis response itself is designed to be easy to route past (a visible
  "that's not why I'm asking" option that returns control to normal chat)
  so over-triggering doesn't trap a user in an unwanted safety flow.
- **Post-response.** A plain regex number scan against raw model output
  (`\d+%`/`\d+\s*(bpm|ms|hours?)` string-matched against tool results)
  was tried and rejected — it breaks on rounding/reformatting (452
  minutes rendered as "7h 32m" fails to match, a wrong number in the same
  shape as a real one slips through undetected). **Adopted instead**: the
  model states quantities only via `{{field}}` references (writes
  `"Your HRV is {{hrv.value}} ms"`, server resolves `{{...}}` against
  that turn's actual tool results before anything reaches the client).
  Substitution alone only guarantees that *values placed in templates*
  are grounded — it says nothing about a number the model writes as
  ordinary prose instead ("about 8 hours," "2 points lower"), so it's
  paired with a validation pass, not treated as sufficient on its own:
  after resolving every `{{field}}` reference against that turn's tool
  results, scan the *resolved* text for any **digit character** falling
  **outside** a resolved-template span. **Digit characters only — no
  spelled-out-number word list.** A word list ("one" through "twelve,"
  "dozen," "half," "couple") was tried and rejected: those words are
  common in ordinary, non-quantity prose ("one thing to try," "a couple
  of ideas"), and would false-positive-trigger a regenerate loop on
  completely unproblematic sentences — a worse failure mode than letting
  a spelled-out number through occasionally. The system prompt still
  instructs the model to always express quantities as digits or
  `{{field}}` references, never spelled out — this is enforced by the
  digit scan for the common case (a health-coach reply overwhelmingly
  renders a real quantity as a digit: "7.5 hours," "42ms," "68"), and the
  residual risk of a spelled-out number slipping past both the
  instruction and the scan is real and stated openly, not solved
  perfectly (see Open Questions). Any digit outside a template span means
  the response is discarded and regenerated once with an explicit
  corrective system message; a second failure falls back to a fixed,
  server-composed sentence built directly from the raw tool results (no
  model involved at all for that turn), logged as a guardrail event. This
  is strictly a **reject-and-regenerate** design, not a strip-and-patch
  one — no partial, edited model output is ever shown.

  **Two mechanical points:**
  - *Streaming, corrected to actually match reject-and-regenerate.*
    Sentence-level buffering was considered and dropped — if individual
    sentences stream to the client as they each pass validation, then by
    the time a later sentence in the same reply fails, earlier sentences
    are already visible and can't be un-shown, which directly
    contradicts "discarded and regenerated" above. **Adopted instead**:
    the orchestrator buffers the model's *entire* response server-side,
    resolves and validates it as one unit, and only then sends it to the
    client — no token-by-token or sentence-by-sentence SSE from model to
    client at all for coach replies. This is acceptable specifically
    because coach replies are short (a few sentences, per the persona's
    `verbosity` setting) — the perceived-latency cost of full buffering
    is small, and it's the only design where "discarded and regenerated"
    is actually true rather than aspirational.
  - *Bad field path.* A `{{field}}` reference to a path that isn't in
    that turn's actual tool results (the model asking for
    `{{hrv.deltaFromLastWeek}}` when no such field exists) is treated
    identically to an unwrapped number — it's not a "close enough,"
    render-something-anyway case. The response is discarded and
    regenerated the same way, logged as a guardrail event distinct from
    the free-number case (`invalid_field_path` vs. `unwrapped_number` —
    a spike in the former specifically flags the model losing track of
    what's actually in the tool registry, a different failure mode worth
    telling apart from it just writing prose numbers).
- Every coach response ends with the same disclaimer framing carried
  from Phase 1's `metricInsights.ts` sentences — not a medical assessment
  — templated in, not left to the model to remember to add.

### 2.5 Data handling, consent & retention

Slices 1, 1.5 and 2 keep all health data inside this app's own database.
**Slice 3 changes that materially**: score values, per-factor z-scores,
habit-correlation sentences, and user-goal data all get sent to a
third-party LLM provider as tool results on every coach turn, and the
model-routing fallback (§2.2) means a second provider may see the same
data on a primary-provider outage. A provider-agnostic router and a
fallback are an engineering pattern, not a privacy answer on their own —
the actual consequence of routing real health data through either
provider needs a stated answer, as a precondition of Slice 3 shipping to
anyone, not an implementation detail inside it:

- **Provider selection is gated on contract terms, not just capability.**
  Before Slice 3 ships to anyone, the chosen primary provider must offer
  a data-processing agreement covering (a) no training on submitted data,
  (b) a bounded retention window for abuse-monitoring purposes, after
  which data is deleted, and (c) confirmation that tool-result content
  (health scores, not just chat text) falls under the same terms as
  prompt/completion content. This is a real vendor-selection gate, not a
  formality — a provider that can't confirm these in writing is
  disqualified for this feature regardless of its technical fit.
- **The fallback provider must clear the identical bar**, not a lower
  one. A fallback that's only there for technical resilience but has
  weaker data terms would mean an outage silently downgrades the user's
  privacy along with the app's availability — that's not an acceptable
  trade, so the fallback is disabled (coach shows a plain "temporarily
  unavailable" message) rather than failing over to a provider that
  doesn't meet the same bar.
- **Explicit opt-in gates the coach feature itself**, separate from and
  in addition to whatever general terms-of-service exists. A dedicated
  consent screen, shown before the coach's first use, states plainly what
  data leaves the device on a coach turn (the specific field types above
  — never raw Google Health tokens, never the user's full biometric
  history, only the specific tool-result fields that turn's response
  actually needed) and requires an affirmative action, not a bundled
  checkbox inside a larger flow. A user who declines still gets Slices
  1/1.5/2 in full — the coach is additive, never a gate on the rest of
  the app.
- **`CoachMemory` (§2.6) is restricted from storing health/medical facts
  specifically**, even though a user might casually mention one in
  conversation ("I'm on medication X," "dealing with a knee injury"). A
  pre-persistence filter — the same lightweight classifier pattern as
  the crisis classifier in §2.4, reused rather than reinvented — blocks
  any proposed `CoachMemory` entry matching a medical/health-fact pattern
  from being written at all, regardless of the auto-confirm behavior
  §2.6 otherwise describes; the coach can still discuss what the user
  said *in that conversation* (it's already in the chat transcript,
  which follows the retention terms above), it just never becomes a
  persisted, resurfaced-in-future-prompts fact the way a training
  schedule or a logging preference would.
- **Google's own data-use terms need their own check, separate from the
  LLM vendor's.** Everything above covers what the LLM provider may do
  with data sent to it — it says nothing about whether Google Health
  API's own terms permit this app to *derive* data from a user's Google
  Health grant and pass that derived data to a third-party LLM in the
  first place. The migration spec's own Restricted-Scope Verification
  risk section already establishes that this app's Google Health scopes
  are under CASA review scrutiny — sending derived health data
  (score values, factor breakdowns) onward to another third party is
  exactly the kind of data flow a security/terms review would ask about,
  and this spec doesn't get to assume the answer is yes. **Required
  before Slice 3, alongside the LLM vendor check above**: read Google
  Health API's terms of service and data-use policy specifically for
  downstream-sharing restrictions on derived data, not just the
  restricted-scope access question the migration spec already covered.
- **This app's own retention isn't specified either.** Chat transcripts
  and `CoachMemory` entries live in this app's own database once
  written, and nothing in this spec says how long they're kept or what
  happens to them when a user deletes their account. **Adopted**: coach
  chat transcripts and `CoachMemory` are deleted as part of the same
  account-deletion flow that already needs to exist for `User`,
  `HealthConnection`, and `BiometricRecord` (account deletion isn't
  designed anywhere in this spec or the phases before it — this is a
  real, currently-unaddressed gap in the whole app, not specific to the
  coach, but the coach is the first place this spec touches data whose
  absence-on-deletion actually matters for a privacy claim made to the
  user). Short of full deletion, chat transcripts are retained for a
  bounded window (proposed: 90 days, matching a reasonable abuse-
  monitoring need) and then hard-deleted on a scheduled job, not kept
  indefinitely by default.

### 2.6 Memory

- **Short-term**: the current conversation's turns, windowed.
- **Long-term**: a `CoachMemory` table — not a vector store scraping raw
  chat transcripts, but structured facts the model is explicitly told to
  propose ("user mentioned they're training for a half-marathon in
  March"), written to the table as `status: PENDING` and surfaced inline
  in the same reply ("I'll remember that — let me know if that's not
  right"), **subject to the health-fact exclusion in §2.5 above — that
  filter runs before anything below applies**. The entry flips to
  `status: CONFIRMED` automatically if the user's next message doesn't
  correct or dismiss it — no separate confirm button required — but it's
  fully visible and editable at any time in Settings → Coach Memory,
  where a `PENDING` entry is marked as such and any entry can be edited
  or deleted outright. This is deliberately closer to "assume yes unless
  corrected, but always show your work" than to a friction-heavy
  explicit-consent flow for *this* category of fact, because the
  §2.5 filter already handles the category where the stakes are actually
  high. Surfaced back into future system prompts as a bulleted "what I
  know about you" block (confirmed entries only), capped at N
  most-recent to bound prompt size.
- **Weekly synthesis**: this is the Synthesis tier's one scheduled use
  (§2.2 names the tier; this is that job's spec, not a separate
  mechanism) — run as a scheduled background job, not live chat: once a
  week, generate a recap referencing `getScoreHistory` +
  `getHabitCorrelations` over the trailing 7 days, written to a
  `CoachDigest` row, pushed as a notification — the coach initiating
  contact, gated entirely by the persona's `proactivity` setting.

### 2.7 Eval harness

Because "does the coach ever hallucinate a number" is exactly the kind of
regression that's invisible until a user catches it: a fixture set of
(user data snapshot, question) pairs with expected tool-call sequences
and expected-value-presence checks, run against every persona/prompt
change before it ships — not a full RL pipeline, but a real
CI-gated eval suite, versioned alongside `ScoreAlgorithmVersion` and
`CoachPersona` configs so a prompt change and its eval results are one
reviewable unit.

---

## Part 3 — Design System

### 3.1 Current state, honestly

`mobile/src/theme.ts` + `components/ui/*` is a real, small, already
well-considered system (semantic color tokens synced to `global.css` by
hand, a metric-config-driven card renderer, a genuinely nice `Ring`
component). It is not "under-engineered" for what Phase 1 needed. It is,
however, nowhere near enough surface area for three new subsystems that
each need their own visual language. This section extends it rather than
replacing it.

### 3.2 Token layer

Rejected: a three-tier primitive/semantic/component token system plus a
codegen build step (`scripts/generate-theme.ts`) generating both the
Tailwind config and the native-header `COLORS` object from one source.
**That's disproportionate for an 8-component library**: the hand-synced
drift risk between
`theme.ts` and `global.css` is real but small (it's two files, changed
rarely, and a mismatch is visually obvious immediately in either theme)
— a whole build-step/codegen pipeline is solving a problem whose actual
cost is "occasionally double-check two files when editing a color,"
which doesn't justify a generator, a build step, and a new type-checked
source-of-truth format to maintain.

**Adopted instead, proportionate to what this spec actually needs**:
extend the existing flat `COLORS.light/dark` objects with exactly the
new semantic keys this spec's scores require — `scoreExcellent`,
`scoreGood`, `scoreFair`, `scorePoor` (a 4-band scale distinct from the
per-metric color set, since "is this number good" needs its own color
language independent of "which metric is this") — added by hand, same
place, same pattern as every existing token. If the token surface grows
enough later that hand-sync drift becomes a *recurring* real bug (not a
hypothetical one), a codegen step is the right fix *then*, with an actual
track record of the problem it's solving — not pre-built now against a
problem that hasn't happened yet.

Alongside those color keys, a single flat `MOTION` object (also in
`theme.ts`, same file, same weight as `COLORS` — not a separate tiered
system) holds the handful of duration/easing constants §3.4's
choreography spec needs (`MOTION.duration.fast/normal/slow`,
`MOTION.easing.standard/decelerate`). This is the entire "motion token"
layer this spec needs — a few named constants in an existing file, not
new infrastructure.

### 3.3 Component library additions

Beyond the existing seven components, this spec's three subsystems need:

- **`ScoreRing`** — proposed as a `Ring` variant with a **segmented arc**
  (one arc segment per Slice-1 weighted factor — three, per the weight
  table in §1.2 — proportional to `|contribution_i|`, colored by whether
  that factor helped or hurt), not just a single-color fill.
  **Gated behind a design spike before full build**: three thin arc
  segments (or four, if a factor is later
  reinstated) on an 84px ring is a real legibility risk that deserves a
  quick static-mockup check across light/dark and a couple of
  factor-weight distributions (one factor dominant vs. three roughly
  even) *before* committing to building the animated, tokenized,
  motion-choreographed version in §3.4 — if the segments read as noise
  rather than signal at that size, the fallback is a single-color fill
  ring (today's `Ring`, unchanged) paired with the `FactorBar` list doing
  the explanatory work instead, which is a perfectly good outcome, not a
  failure.
- **`FactorBar`** — horizontal bar for the Stage-5 breakdown, signed
  (extends left for negative contributions, right for positive), with a
  shared 0-centered scale across all factors so magnitudes are visually
  comparable.
- **`ConfidenceBadge`** — small `Badge` variant surfacing
  `DailyScore.confidenceLevel` (§1.2 Stage 4) — a score computed from
  partially imputed data says so, visually, every time it's shown, not
  just in a tooltip someone has to find.
- **`ChatBubble` + `StreamingText`** — coach message rendering. Per §2.4,
  the client never receives a coach reply incrementally — the whole,
  already-validated response arrives in one payload, not over SSE.
  **`StreamingText` is therefore a purely client-side reveal
  animation**, not a network-driven one: it takes the complete text
  already in hand and reveals it as a capped-duration word-by-word (not
  per-character) animation, reusing the existing `CountUp` component's
  animation-frame pattern extended from animating a number to animating
  revealed text. This exists to preserve the *feel* of the coach
  "typing" a considered reply, purely as a presentation choice — it
  implies nothing about when the text actually arrived, which is exactly
  the "still thinking" / "raced ahead of what's arrived" trap §3.4's
  motion spec explicitly avoids.
- **`CorrelationCard`** — renders one `HabitCorrelation` row: the
  natural-language sentence (§1.3 step 7) plus a small sparkline of the
  two series aligned at the tested lag, plus the sample-size caveat
  rendered as a persistent visible line, not a footnote.
- **`BaselineProgressRing`** — the cold-start state (§1.2 Stage 3) — a
  ring counting up "9/14 days" distinct from a `ScoreRing`, so
  "building your baseline" is never visually confusable with a real low
  score.

### 3.4 Motion/choreography spec

Current motion is `Animated.View` with `FadeInDown`, staggered by index —
good, minimal. Extended into a documented choreography spec because this
system now needs to animate a *composite* value changing (a score moving
from 72 to 68 between app opens) not just entrance:

- **Score transitions** animate the `ScoreRing`'s segments independently,
  staggered by `|Δcontribution_i|` descending — the factor that moved the
  most animates first, so the eye is drawn to *why* the score changed,
  not just *that* it changed.
- **Coach message arrival**: since §2.4 delivers the whole validated
  reply in one payload (no incremental SSE), there's no "real arrival
  timing" to tie an animation to. `StreamingText` (§3.3) plays a single
  fixed-duration word-reveal animation on receipt instead — a
  presentation effect, explicitly not styled to imply live token-by-token
  generation, since that would misrepresent how the response actually
  arrived.
- All durations/easings pulled from the `MOTION` object (§3.2) — a flat
  set of named constants, not a tiered token system — never inlined
  per-component, so a future motion-language change is a constant edit,
  not a grep-and-replace across component files.

### 3.5 Explainability rendering (tying Parts 1–3 together)

The single UI artifact that most directly embodies "over-engineered but
for a real reason": the score detail screen renders, top to bottom —
`ScoreRing` (segmented, glanceable) → `ConfidenceBadge` → a
plain-language headline (Stage 5's largest-magnitude factor, sentence-
generated the same deterministic way `metricInsights.ts` already does it
— the coach is available *from* this screen via a "Ask about this" button,
but the screen itself never requires an LLM call to be useful) →
`FactorBar` list (every weighted factor, signed, sorted) → the
`BaselineSnapshot` this score was computed against, inspectable
("your HRV baseline: 42ms ± 6ms, based on your last 30 days"). Nothing
on this screen is a black box; the entire Stage-1-through-5 pipeline in
Part 1 is designed so this screen can be built by rendering its
intermediate outputs directly, in order.

---

## Cross-cutting: observability

**Scoped to Slice 3 only.** Rejected: OpenTelemetry spans across all of
Stat Engine, correlation and coach from day one. Neither `package.json`
currently has an OpenTelemetry dependency, and for Slices 1/1.5/2, it
isn't needed: the
Stat Engine's correctness signals — `DailyScore.confidenceLevel`, the
per-day imputation count, `ScoreInputFlag.OUTLIER` records — are already
persisted, queryable rows, not events that need a tracing pipeline to see.
Introducing OTel for those slices would be new infrastructure solving a
problem the existing schema already solves by just being a database.

**Where it earns its place is Slice 3**, and specifically because a
tool-calling LLM orchestrator with a reject-and-regenerate guardrail
(§2.4) *can* silently produce a wrong answer without throwing an error in
a way the earlier slices structurally can't (there's no LLM in the loop
before Slice 3). From Slice 3 on: each coach turn emits a span
(`coach.tool_call`, `coach.guardrail_reject`) tagged with `userId`,
`personaId`, and, on a guardrail event, which failure it was
(`unwrapped_number` vs. `invalid_field_path`, per §2.4) and whether the
regenerate-once retry succeeded or fell back to the canned response. Not
for performance monitoring primarily — for **correctness monitoring**: a
spike in `coach.guardrail_reject` events, split by reason, is the signal
that a prompt or persona change started producing unwrapped numbers or
bad field references again, well before a user complaint would surface
it.

## Testing

- **Stat Engine**: unit tests per stage (cleaning's outlier rejection,
  baseline EWMA math, composite score's logistic squashing, the
  effective-sample-size correlation test's p-value computation against
  synthetic data with a known true correlation *and* against synthetic
  autocorrelated data with no true correlation, to confirm the
  Pyper–Peterman correction actually controls the false-positive rate,
  *and* a specific regression test asserting the test can reject a strong
  synthetic correlation at realistic data volumes — 90 days — since the
  rejected permutation-based design's exact failure was passing every
  unit test while being unable to reject anything at that volume in
  practice) — plus the backtest tool itself (§1.4) run against golden
  historical fixtures as a regression check on every algorithm version
  bump.
- **Date alignment (§1.2)**: an integration test against real historical
  data from a connected account verifying which calendar day each
  metric's `recordedAt` actually lands on relative to the others, run
  once as part of resolving §1.2's blocking prerequisite and kept as a
  regression test afterward so a future change to `client.ts`'s date
  handling can't silently reintroduce the misalignment.
- **AI Coach**: the eval harness (§2.7) as the primary correctness gate;
  additionally, integration tests mocking the model provider entirely to
  verify the guardrail layer's reject-and-regenerate path fires on a
  deliberately fabricated test response containing (a) a number outside
  a `{{field}}` reference and (b) a `{{field}}` reference to a
  nonexistent path — both cases from §2.4 covered separately, since
  they're logged as distinct guardrail events.
- **Design System**: component snapshot tests (existing pattern,
  extended to new components) plus a visual-regression pass on
  `ScoreRing`'s segmented-arc rendering across factor-count edge cases
  (0 factors during cold-start, all-negative factors, single dominant
  factor).

## Open Questions / Risks

- Two composite scores (Recovery, Sleep) rather than one is a genuine
  product bet, not just an engineering choice — worth validating with
  real users before a third (Strain) score is added, since score-count
  proliferation has real cognitive-load cost the factor-breakdown UI
  only partially offsets.
- The AI coach's model-routing/fallback (§2.2) adds a second LLM provider
  dependency the rest of this codebase doesn't otherwise have — worth
  confirming actual need (vs. a single provider with a clear outage
  message) once real usage/cost data exists, same spirit as Phase 1's
  own "revisit if it proves too lossy in practice" pattern for
  provisional decisions. **This is now also gated on §2.5**: a fallback
  provider only ships if it clears the same data-retention bar as the
  primary, which may mean no acceptable fallback exists at all — a real
  possible outcome, not just an implementation detail to sort out later.
- **No LLM provider has actually been confirmed against §2.5's retention/
  no-training/tool-result-coverage requirements yet** — this spec
  describes the gate, not a cleared vendor. Slice 3 cannot ship until
  this is resolved concretely (a named provider, a signed/confirmed data
  processing agreement), not just designed around abstractly.
- The `{{field}}` guardrail (§2.4) requires structured/tool-based output
  from the model provider to resolve template references — worth
  confirming this capability against whichever provider clears §2.5's
  bar before that provider choice is finalized, since the two
  requirements (data terms, structured-output support) narrow the
  provider field independently and the intersection may be small.
- Circadian consistency's real cold-start window (backfill note, §1.2
  Stage 2) means a user with months of sleep history still sees 14 days
  of `BaselineProgressRing` for that one factor after Slice 1.5 ships —
  worth deciding whether that's acceptable as-is or whether it's worth a
  one-time historical backfill pass against Google Health's API for
  users who connected before Slice 1.5 (fetching past `Sleep` sessions'
  `startTime`, not currently pulled) — a real scoping decision for
  Slice 1.5's own implementation task, not resolved here.
- The digit-only guardrail scan (§2.4) trades recall for precision on
  purpose (a spelled-out number can still slip through; a common English
  word triggering a false regenerate loop was judged worse) — worth
  measuring in practice, once Slice 3 has real usage, how often the
  model actually spells out a number instead of using a digit or a
  `{{field}}` reference, since that determines whether this tradeoff was
  the right one or whether the eval harness (§2.7) needs a dedicated
  fixture category for it.
- Google Health API's own terms on downstream-sharing derived data with
  a third-party LLM (§2.5) haven't been read yet as part of this spec —
  this is a required precondition for Slice 3, not a nice-to-have, and
  sits alongside the migration spec's existing CASA/Restricted-Scope
  review as a second, separate compliance question this app now has to
  answer.
- Account deletion isn't designed anywhere in this codebase yet, for any
  phase — this spec's §2.5 retention answer for coach data (deleted with
  the account) assumes an account-deletion flow that doesn't currently
  exist. Worth scoping as its own small spec once Slice 3 approaches,
  rather than letting the coach be the feature that quietly requires it
  first.
