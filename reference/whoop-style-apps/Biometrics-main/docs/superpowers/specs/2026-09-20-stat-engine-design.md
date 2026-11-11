# Stat Engine — Recovery Score & Sleep Score — Design

## Context

Phase 1 (Foundation, shipped) and the Google Health migration (shipped)
built the pipe: OAuth connect → encrypted token storage → webhook-driven
sync worker → `BiometricRecord` rows → a minimal dashboard with four
metric rings and one deterministic, non-AI headline sentence
(`mobile/src/lib/metricInsights.ts` — explicitly "no external model call,
no fabricated score").

This spec covers the **Stat Engine**: the pipeline that turns
`BiometricRecord` rows into a **Recovery Score** and a **Sleep Score**,
each with a full factor breakdown, personalized per-user baselines, and a
documented, versioned, backtestable scoring algorithm. It corresponds to
**Slice 0** (input correctness — the sync-layer fixes the scores need
before they can be trusted), **Slice 1** (Recovery Score) and
**Slice 1.5** (Sleep Score) of the overall build order.

This is one of three sibling specs, split out of a single combined
document that had grown too large to review or build against as one
unit:

- **This document** — the Stat Engine (Slices 0, 1 and 1.5).
- `2026-09-20-habits-correlation-design.md` — habit logging and the
  habit/biometric correlation engine (Slice 2). Depends on this
  document's `DailyScore` and per-factor z-scores as the series it
  correlates against.
- `2026-09-20-ai-coach-design.md` — the LLM-backed coach (Slice 3).
  Depends on both this document and the correlation doc — its entire
  tool registry is read-only wrappers over `getDailyScore` (this doc)
  and `getHabitCorrelations` (the correlation doc).

Each doc is independently buildable once its own dependencies (stated
above) are in place. Cross-references to the other two docs are by
filename and section number, not by a shared numbering scheme — each
doc's own sections are numbered from 1.

The user asked for this system to be **as over-engineered as possible**,
taken seriously rather than literally: a heavier option is kept only
because it buys down a specific, named risk (score correctness,
statistical validity, user privacy) — not because heaviness is the goal
for its own sake. Where a heavier option was drafted and turned out to
add ceremony without addressing a real risk, it was cut back (see
Revision History); what survives is deliberately heavy but every heavy
piece has a stated reason.

## Revision History

- **v1** (this document): split out of the original combined
  "Phases 2–4" spec (v1–v4 of that document; see that document's own
  history for the evolution this section inherits) into a standalone,
  independently-buildable Stat Engine spec, and fixed every outstanding
  Stat Engine issue from that document's fourth review round in the
  process, rather than carrying them forward as open items:
  - The day-alignment fix in §2 is **reworked**: the previous design
    proposed re-bucketing STEPS/RESTING_HR/HRV to match SLEEP's date,
    which is infeasible — those three arrive from Google as
    pre-aggregated per-civil-day values with no raw samples to
    re-bucket. The fix now goes the other way: SLEEP's own keying in
    `client.ts` changes to align with the other three, which requires a
    new `User.timezone` field (schema.prisma currently stores none —
    confirmed by direct read).
  - A previously-unflagged **sleep-debt upsert bug** is now documented
    as a Slice-1-blocking issue: `upsertBiometricRecords`
    (`backend/src/biometrics/repository.ts`, confirmed by direct read)
    upserts on `(userId, metricType, recordedAt)` and unconditionally
    overwrites `value`, so a nap or split sleep session landing on the
    same day as the main sleep session silently overwrites it.
  - **RESTING_HR** is now explicitly documented as a daily-minimum-BPM
    proxy (`heartRate.beatsPerMinuteMin`, confirmed at `client.ts:160`),
    not a true resting-heart-rate measurement, with its single-reading
    risk and how Stage 1's outlier filter does and doesn't mitigate it.
  - Stage 3's baseline spread is now explicitly scaled by the
    ×1.4826 MAD-to-σ consistency constant, and Stage 4's weight-
    renormalization behavior on cold-start exclusion is now stated
    directly instead of left implicit in a table footnote.
  - The `end − start = time in bed` claim is downgraded from "confirmed"
    to "assumed, pending a live check" — only the filter field name
    (`sleep.interval.end_time`) is confirmed against the live API, not
    that subtracting the two instants yields a meaningful
    time-in-bed value for every session shape (e.g. multi-session
    nights).
  - All content specific to habit correlation (formerly §1.3) and to the
    AI coach (formerly Part 2) moved to their own sibling documents, and
    all AI-coach-specific and correlation-specific design-system pieces
    (formerly Part 3) moved with them. What remains here is exactly what
    Slice 1 and Slice 1.5 need to ship.
- **v2**: reworked the sleep-storage design after review found that v1's
  proposed fix for the same-day-overwrite bug was itself broken:
  - v1 proposed making `upsertBiometricRecords` **sum** `minutesAsleep`
    on a same-day match. That is not idempotent — the sync worker
    (`backend/src/sync/worker.ts`) re-fetches the same session through
    webhook single-day jobs, range backfills, BullMQ retries and repeat
    webhooks, so every re-sync would inflate the day's total. It also
    breaks when a fetch window cuts a local day in two (the fetch filter
    is on UTC instants; the day key is now a local civil date).
    Replaced with per-session storage: a `SleepSession` table unique on
    `(userId, startTime)`, with `BiometricRecord` SLEEP demoted to a
    derived daily rollup recomputed from the full set of stored sessions.
  - `SleepSession` moved **from Slice 1.5 into the new Slice 0**, since
    the idempotent fix cannot exist without it. Slice 1.5 keeps only the
    Sleep Score features built on top of it.
  - The SLEEP re-key needs a **one-time wipe and re-sync** of existing
    SLEEP rows; v1 said the re-key applied "going forward", which would
    have left history on the old UTC-start-date key and double-counted
    sessions present under both keys.
  - `User.timezone` is captured from the mobile client, not from the
    OAuth flow — nothing in the repo confirms the OAuth grant exposes a
    timezone.
  - Introduced **Slice 0** as an explicit deliverable with exit
    criteria, so the sync-repair work is not hidden inside "Slice 1".
  - The circadian-consistency cold-start problem from v1's backfill note
    largely disappears: the Slice 0 re-sync captures `startTime` for
    historical sessions, so the 14-day window need not restart.
- **v3**: closed the remaining review items.
  - Added per-day **correlation series** columns (`hrvZ`, `rhrZ`,
    `sleepDurationZ`) with `imputed` flags to `UserDailyFeatures`, and an
    `imputed` flag on every entry of `DailyScore`'s factor vector, so the
    habit engine can exclude imputed days and can test lags against a
    per-night sleep series instead of the smoothed rolling debt.
  - Renumbered the sections 1–6 so numbering starts at 1 as the Context
    states (they were 1.1–1.3 then 3.2, 3.3, 3.5); cross-references in all
    three documents were updated.
  - Removed edit-history narration from the document body; it lives in
    this section only.
  - The combined predecessor spec is archived at
    `archive/2026-09-20-ai-coach-ui-scoring-design.md` with a SUPERSEDED
    banner and is not maintained.
- **v4**: applied the results of the first live run against a real account and
  three product decisions that followed.
  - RESTING_HR now comes from Google's dedicated `daily-resting-heart-rate`
    type instead of the daily-minimum BPM of a heart-rate rollup.
  - The Sleep Score weights are decided (config v2: duration 0.50, efficiency
    0.30, consistency 0.20) and v2 is the live version.
  - A sleep night's local date now comes from the record's own UTC offset, with
    `User.timezone` only as a fallback.
  - List endpoints are paginated; the client now follows `nextPageToken`.
  - The three Slice 0 live checks are recorded in
    `docs/superpowers/notes/slice0-live-checks.md`.
- **v5**: config v3 (live) after the Sleep Score proved too volatile on real
  data.
  - Every factor's z-score is clamped to ±3 before weighting.
  - Baseline spread has per-metric floors in the metric's own units
    (efficiency 0.05, bedtime consistency 10 points) on top of the existing
    fractional floor.
  - The measurements behind this are in Implementation Status.

## Goals

- A daily **Recovery Score** (0–100) and **Sleep Score** (0–100), each
  with a full factor breakdown, personalized per-user baselines, and a
  documented, versioned, backtestable scoring algorithm.
- A design-system vocabulary (rings, gauges, factor bars) for rendering
  those scores, consistent with what the other two subsystems will reuse.

## Non-Goals

- Habit logging or correlation — see `2026-09-20-habits-correlation-design.md`.
- Anything conversational or LLM-backed — see `2026-09-20-ai-coach-design.md`.
- Replacing the existing sync pipeline — Phase 1 and the Google Health
  migration stand as built. This spec is additive, downstream of
  `BiometricRecord`.
- Diagnosing or treating anything. Every score carries the existing
  "comparison against your own recent readings, not a medical
  assessment" framing from Phase 1, non-negotiably.
- Real-time (sub-minute) scoring. Recovery/Sleep scores are computed once
  per day per user, on new-data arrival — this is a batch/event pipeline,
  not a streaming one (a same-day recompute triggered by a debounced
  webhook is as real-time as this needs to get).

## Build Order

0. **Slice 0 — Input correctness.** No scoring code. Repairs the sync
   layer so the four metrics can legitimately be combined (§2):
   - add `User.timezone` (client-supplied) and a Settings override;
   - run the three live-API checks (civil-date timezone basis, sleep
     interval semantics, how multi-session nights are represented);
   - add the `SleepSession` table with idempotent per-session upserts,
     and make `BiometricRecord` SLEEP a derived daily rollup;
   - re-key SLEEP to the local civil date of the session's **end**;
   - wipe and re-sync existing SLEEP data under the new key;
   - check whether Google exposes a dedicated resting-heart-rate data
     type (it does: `daily-resting-heart-rate`, which is now the input).

   **Exit criteria**, all verified against a real connected account and
   kept as regression tests: (a) for any civil day D, HRV, RHR and the
   SLEEP rollup demonstrably refer to the same night; (b) re-running any
   fetch job, in any window shape, leaves every stored total unchanged;
   (c) a nap plus a main sleep on one day produce one correct daily
   total.
1. **Slice 1 — Recovery Score only.** No Sleep Score, no habit
   correlation, no coach. Depends on Slice 0. Ships value alone: the
   segmented `ScoreRing` + factor breakdown (§5, §6) is a real
   upgrade over today's single headline sentence with nothing else built
   yet.
2. **Slice 1.5 — Sleep Score.** Depends on Slice 0 (which already
   provides `SleepSession`) and Slice 1's baseline-model infrastructure.
   Adds `sleepEfficiency` and `circadianConsistencyScore` and the Sleep
   Score composite. Ships as the next thing built after Slice 1, before
   habits/coach, since it reuses Slice 1's pipeline directly.

---

## 1. Why this is the hard part

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

## 2. Architecture: five pure stages, persisted — not a five-job flow

### Blocking prerequisite: metrics don't share one definition of "day"

Verified against the live implementation, not assumed — this has to be
resolved before any composite score is built on top of it, not treated as
a detail to sort out later.

`backend/src/health/client.ts` keys each metric's `recordedAt` by a
different convention (confirmed by direct read):

- **STEPS and RESTING_HR** (`fetchMetricRange`, lines 151–162): keyed by
  `civilStartTime`, a civil-date object **Google's own `dailyRollUp`
  response provides** — its timezone basis (account locale? device
  locale? UTC?) isn't stated anywhere in this codebase or the migration
  spec, and hasn't been checked live.
- **HRV** (lines 183–194): keyed by `dailyHeartRateVariability`'s own
  `.date` field — also a Google-provided civil date, from a *separate*
  collection (`daily-heart-rate-variability`; the migration spec
  describes a raw, sample-based fetch instead, and the shipped code has
  moved past it). Both STEPS/RESTING_HR and
  HRV arrive from Google **already aggregated to one value per civil
  day** — there are no raw per-sample timestamps in this app's
  possession to re-derive a different day boundary from.
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
same night**, because they were never verified to share a day boundary in
the first place — this is a scoring-correctness issue, not merely a
habit-correlation nuance, since it directly affects Stage 4's inputs.

**Resolution, required in Slice 0 before any scoring code.** The fix
has to move SLEEP's keying to match the other three, not the other way
around — STEPS/RESTING_HR/HRV are pre-aggregated daily rollups with no
raw samples underneath them in this app's data, so there is nothing to
re-bucket on their side. Concretely:

1. **Add `User.timezone` to the schema** (a new field holding an IANA
   zone name; `schema.prisma` currently has no timezone field on `User`
   at all, confirmed by direct read). **Source: the mobile client**,
   which sends `Intl.DateTimeFormat().resolvedOptions().timeZone` at
   Google Health connect time and again on app launch when it changes,
   with a Settings-screen override. The OAuth grant is not relied on for
   this: nothing in this repo shows it exposing a device/account
   timezone (the only sleep-related scope requested is
   `googlehealth.sleep.readonly`). A timezone change triggers a
   recompute of the SLEEP daily rollups (step 3 below), which are derived
   and therefore cheap to rebuild.
2. **Confirm live, against a real account**, what timezone basis
   Google's civil-date rollups actually use, so `User.timezone` is being
   compared against the right reference rather than an assumed one.
3. **Re-key SLEEP** to the **civil date of the sleep session's end
   instant, in the session's own local time** — not its start instant, and
   not UTC. Every Google sleep record carries `startUtcOffset` and
   `endUtcOffset`; the local end date is `endTime + endUtcOffset` (stored
   as `SleepSession.endUtcOffsetSeconds`), and the user's `User.timezone`
   is only the fallback for a row without an offset. The record's own
   offset matches Google's civil dates exactly and stays correct when the
   user travels: one real account has nights recorded at UTC−6 and UTC−4
   inside the same 30-day window. The night that produced this morning's
   HRV and RHR reading is the
   night that ended this morning, so keying off the end instant
   (converted to local time) is what makes SLEEP line up with what
   STEPS/RESTING_HR/HRV already report for that civil day. Under the
   design below, this key is used for the derived daily rollup, not for
   the stored sessions themselves (which are keyed by `startTime`).
   **Existing SLEEP rows must be wiped and re-synced**, not left in
   place: they are keyed by the old UTC-start-date convention, so leaving
   them would put the same session under two different keys once the
   rollup exists (double-counted) and would leave every baseline built
   on a mixed-convention history. Slice 0 therefore includes a one-time
   migration: delete existing `BiometricRecord` rows of type SLEEP, then
   enqueue the existing backfill job (`handleBackfillJob`) to repopulate
   `SleepSession` and the rollup, over the same lookback window the app
   already backfills. No `BaselineSnapshot`/`DailyScore` rows exist yet
   at that point, so nothing downstream is contaminated.
4. **Apply the same explicit timezone rule to `HabitLog` day-bucketing**
   (see the correlation doc) so a habit logged near midnight buckets
   consistently with whichever metric convention this resolves to.

This is Slice 0 work and blocks Slice 1 — the kind of live-API verification this
codebase's own house style already does for every other API-shape claim
(see the migration spec's "Confirmed API Facts" section) — not something
this design spec can resolve from a desk read of one file.

### Sleep storage: idempotent per-session rows, derived daily rollup (Slice 0)

The original defect, confirmed by direct read of
`backend/src/biometrics/repository.ts`:

```ts
export async function upsertBiometricRecords(
  userId: string,
  metricType: BiometricMetricType,
  points: HealthMetricPoint[],
): Promise<void> {
  for (const point of points) {
    await prisma.biometricRecord.upsert({
      where: { userId_metricType_recordedAt: { userId, metricType, recordedAt: point.recordedAt } },
      update: { value: point.value, syncedAt: new Date() },
      create: { userId, metricType, recordedAt: point.recordedAt, value: point.value },
    });
  }
}
```

This upserts on `(userId, metricType, recordedAt)` and **unconditionally
overwrites `value`**. Because SLEEP is keyed by calendar day, a second
sleep session on the same day — a nap, or a session split by the device
around a brief waking — replaces whichever session's row already exists.
The stored `minutesAsleep` is then whichever session synced last, not the
day's total. That feeds `sleepDebtRolling14d`, a 0.20-weighted factor in
the Recovery Score, so it can silently misstate a real recovery number on
any day with more than one session.

**Rejected fix: sum on a same-day match.** It is not idempotent. Confirmed
by direct read of `backend/src/sync/worker.ts`, the same session is
fetched and upserted repeatedly: `handleFetchJob` runs a single-day fetch
per webhook (`[date, date+1)`), `handleBackfillJob` re-fetches whole
ranges for every metric, BullMQ retries a failed job from the top, and
repeat webhooks for one date are normal. Under "existing + new", each of
those would add the session again and inflate the day's total. It also
fails on window shape: the fetch filter is on UTC instants while the day
key is a local civil date, so a single-day job can see only part of a
local day's sessions, and a batch-level sum would overwrite the total
with a partial one.

**Adopted: store sessions, derive the day.**

1. **`SleepSession` table** — `id`, `userId`, `startTime`, `endTime`,
   `minutesAsleep`, `syncedAt`; `@@unique([userId, startTime])`;
   `@@index([userId, endTime])`. Only fields already confirmed against
   the live API (see the data-model note in Stage 2). Upsert is
   **overwrite on match**: re-fetching the same session yields the same
   values, so every re-sync, retry and overlapping window is a no-op,
   and if Google later revises a session the row converges to the
   latest values.
2. **The daily total is derived, never accumulated.**
   `dailyMinutesAsleep(user, D)` = `SUM(minutesAsleep)` over stored
   sessions whose local end date is `D`: the end instant shifted by the
   record's own `endUtcOffsetSeconds`, or converted with `User.timezone`
   when the row has no offset. The `BiometricRecord` SLEEP row for `D` — which the
   dashboard and the Stat Engine already read — becomes a **materialized
   rollup**: after upserting a batch of sessions, recompute and overwrite
   the rollup for every civil date the batch touched. Overwriting with a
   value computed from the full stored set is idempotent, unlike
   incrementing. The other three metrics keep today's overwrite
   semantics unchanged; they are genuine one-value-per-day rollups from
   Google.
3. **Wider SLEEP fetch window.** Because the day key is local and the
   fetch filter is UTC, a SLEEP fetch for civil day `D` requests
   `[D−1, D+2)`. Sessions are idempotent, so the overlap costs nothing.
   A window that still misses a session cannot corrupt a total: the
   session is simply absent until a later fetch includes it, at which
   point the affected rollups are recomputed and converge.
4. **Naps count.** A nap plus a main sleep is a meaningful daily total;
   a device's split-session artifact of one continuous sleep is a
   smaller error to tolerate than silently dropping a nap.
5. **Live check required** (Slice 0, see Open Questions): how a night
   with more than one `Sleep` object is actually represented in the raw
   response. The schema above stores one row per API object either way,
   so the design holds; what the check settles is whether
   `endTime − startTime` is meaningful as time-in-bed (Stage 2).

This is a Slice 0 task, not deferred: the bug affects Slice 1's own
Recovery Score input, and the fix is the reason `SleepSession` exists
before Slice 1.5.

Rejected: computing the score inline in the `GET /me/biometrics` handler
(no intermediate values persisted, nothing inspectable later).

**Also rejected**: a BullMQ `FlowProducer` with five independently-
retryable child jobs. That's over-engineering that costs correctness-
adjacent complexity for nothing — this is one user's daily arithmetic,
running in low milliseconds, with no stage that can partially fail
independently of the others (there's no network call, no external API,
nothing Stage 3 can do that fails while Stage 2 succeeds). A five-job
flow adds retry policies, job-state tracking, and a BullMQ dashboard's
worth of observability surface for a pipeline that either runs to
completion or doesn't, and either way needs the exact same one retry:
recompute the day.

**Adopted instead**: five stages as five pure, independently unit-tested
TypeScript functions, called in sequence from one job
(`computeDailyScore(userId, date)`, a single BullMQ job — queued, not
flowed), with the two intermediate artifacts that actually matter
persisted as real rows: `BaselineSnapshot` (Stage 3's output) and
`DailyScore` (Stage 4/5's output). That persistence is what makes "why
did my score drop 12 points today, and is that reproducible six months
from now" answerable — the replayability that matters comes from
persisting the right intermediate state, not from the job orchestration
shape. The diagram below describes the five conceptual stages as
function calls, not queue jobs.

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
  score computation skips it. **For RESTING_HR** this is a backstop only: Google's dedicated resting value
  is already a smoothed daily figure (see Stage 4).
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
tool-calling layer — see `2026-09-20-ai-coach-design.md` — so the coach
and the score always cite the same numbers). Columns beyond the raw
daily metric values:

- `sleepEfficiency` (`minutesAsleep / timeInBedMinutes`, where
  `timeInBedMinutes = (interval.endTime − interval.startTime)`, derived
  from a `SleepSession`'s start/end instants, not from
  `Sleep.summary.timeInBed` — see the note on this derivation below. Reads from
  the `SleepSession` table that Slice 0 provides. Computed and used from
  Slice 1.5; not needed for Slice 1's Recovery Score),
- `sleepDebtRolling14d` (sum of `(sleepGoalMinutes − minutesAsleep)` over
  the trailing 14 days, floored at 0 per day — a rolling deficit, not a
  single-night number. **`sleepGoalMinutes` is the user's configured
  sleep goal, defaulting to 480** — this must be the same value the
  coach's `getUserGoals()` tool returns and the same one the mobile
  dashboard's `METRIC_CONFIG.SLEEP.goal` shows, sourced from one place,
  not hardcoded independently in the scoring code and the coach's tool
  layer as two numbers that could drift apart if a user ever customizes
  their goal),
- `hrvBaselineDeviationPct`,
- `rhrBaselineDeviationPct`,
- `acuteChronicLoadRatio` (7-day rolling step-derived load ÷ 28-day
  rolling step-derived load — borrowed from sports-science ACWR). **Not
  shipped in Slice 1**: ACWR is normally built from actual training load
  (session duration × intensity), and a steps-derived proxy is exactly
  the kind of unvalidated input this composite score shouldn't carry a
  weighted term for. This field ships computed-and-stored-but-excluded
  from the Recovery Score composite until either (a) workout-session
  data is added (a real scope addition to the Google Health OAuth grant,
  out of scope for this spec) or (b) it's validated against
  self-reported perceived exertion for a meaningful number of users. The
  DAG computes it now so the historical series exists to validate later
  — it just isn't in the composite's weighted sum yet.
- `circadianConsistencyScore` (stddev of sleep *onset* time over trailing
  14 days, inverted/normalized — consistent bedtime is itself
  recovery-relevant, independent of duration). Sleep onset time is not
  derivable from `Sleep.summary.minutesAsleep`; it comes from a
  `SleepSession`'s `startTime`, the same table as `sleepEfficiency`
  above. Computed and used from Slice 1.5.
- **Correlation series columns** — `hrvZ`, `rhrZ` and `sleepDurationZ`
  (the day's `dailyMinutesAsleep` z-scored against the SLEEP metric's
  Stage-3 baseline). Each carries an `imputed` flag, true when that day's
  underlying value was imputed in Stage 1 rather than observed, and is
  null while the metric is cold-starting. These are the series the habit
  correlation engine tests against (`2026-09-20-habits-correlation-design.md`
  §2). `sleepDurationZ` exists alongside `sleepDebtRolling14d` on
  purpose: the rolling 14-day sum is smoothed by construction, so it
  cannot resolve which of lags 1–3 a habit acts at; a per-night value is
  the right series for lag testing, while the rolling debt remains the
  right factor for the *score*. Once Slice 1.5 ships,
  `sleepEfficiencyZ` and `circadianConsistencyZ` join with the same
  flags.

**Data model gap:** `BiometricRecord` is `(userId,
metricType, value: Float, recordedAt)` — one number per metric per
timestamp. `sleepEfficiency` and `circadianConsistencyScore` both need
sleep *structure* (onset time, time-in-bed), which needs a real schema
addition, not a bigger `value`. Concretely: the `SleepSession` table
specified under "Sleep storage" in §2 above (Slice 0; `userId`,
`startTime`, `endTime`, `minutesAsleep`) fed from the same
payload `backend/src/health/client.ts` already fetches for the `SLEEP`
metric — confirmed live and already reading `sleep.interval.startTime`
from it at line 179, and `sleep.interval.end_time` is confirmed as a
valid field there too (it's the literal filter field the query uses at
line 171). **`Sleep.summary.timeInBed` and `minutesAwake` are correction
targets, not confirmed facts**: the Google Health migration spec's own
"Confirmed API Facts" section verifies exactly one sleep field live —
`Sleep.summary.minutesAsleep`. `SleepSession` therefore stores only
fields already confirmed to exist (`startTime`, `endTime`,
`minutesAsleep`), and `timeInBedMinutes` — needed for `sleepEfficiency`
— is *derived* as `endTime − startTime` rather than pulled from an
unverified `summary.timeInBed` field. `minutesAwake` is dropped from the
schema entirely; nothing in this spec needs it once time-in-bed is
derived this way.

**On that derivation — an assumption, not a confirmed fact.** Only
`sleep.interval.end_time` being a valid, filterable field name is
confirmed against the live API (it's the literal filter this app's own
query already uses). That `endTime − startTime` for a given session
actually equals a meaningful "time in bed" — as opposed to, say, one
short awakening within a longer bed period, or a single API-reported
session that itself spans a segment shorter than the full night — is an
*assumption*, not a confirmed fact, and is a required live check in
Slice 0 (see Open Questions): fetch a real account's sleep history and
inspect (a) whether `interval.startTime`/`endTime` plausibly bound a
full sleep period rather than one segment of it, and (b) how a night
with more than one `Sleep` object (a nap, a device-reported split
session) is actually represented in the raw API response, since that
determines how sessions map to nights when the daily rollup is verified
against real data. The `SleepSession` schema itself does not depend on
the answer: it stores one row per API object either way.

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
  catch), not stddev — **scaled by the consistency constant `1.4826`**
  (`σ̂ = 1.4826 × MAD`) so the resulting spread estimate is on the same
  scale as a standard deviation would be for normally-distributed data.
  The constant matters because `k`'s calibration in Stage 4 is
  expressed in standard deviations: a raw MAD under-reports spread
  relative to σ by roughly this factor for normal-ish data, so `k` is
  calibrated against the scaled `σ̂`, never raw MAD.
- **Spread floors.** The effective spread is `max(σ̂, spreadFloorFraction ×
  |EWMA|, spreadFloors[metric])`. The fractional floor (2% of the mean) is
  applied to every metric. The per-metric floor (config v3) is in the
  metric's own units and exists for near-constant metrics whose natural
  day-to-day spread is far smaller than a difference that matters: sleep
  efficiency (0.05) and bedtime consistency (10 points). Without it, a
  normal night at 0.90 efficiency against a 0.98 baseline scores as −3.6σ.
- **Cold-start handling**: fewer than 14 days of history for a metric →
  the metric is excluded from the composite score entirely for that user
  (not defaulted to a population average — a population baseline would
  be a fabricated per-user number, which the existing codebase's own
  house style explicitly avoids). The score UI shows "Building your
  baseline (9/14 days)" during this window via `BaselineProgressRing`
  — see §5.
- Baseline recomputation is itself versioned (`BaselineSnapshot` table,
  one row per user per metric per day) so a score computed today can be
  reproduced exactly later even as the rolling window moves — required
  for backtesting (§3) and for explainability (Stage 5 below) to ever
  be auditable.

#### Stage 4 — Composite Score(s)

Two scores, each a weighted sum of per-metric z-scores against that
metric's Stage-3 baseline (using the σ̂-scaled spread above), **direction-
corrected** (HRV/sleep-efficiency z-scores count positively, RHR/sleep-
debt z-scores count negatively), then mapped through a logistic
squashing function to land in [0, 100] rather than an unbounded z-space:

```
score = 100 / (1 + e^(-k · Σ(w_i · z_i)))
```

`k` tuned so a "textbook normal day" (all z ≈ 0) lands at 50, and two
standard deviations (per the σ̂-scaled spread above) of favorable
deviation lands near 90 — chosen and documented in the model config, not
hardcoded magic numbers in the formula.

**Bounded influence (config v3):** each factor's z is clamped to ±3 before
weighting, so no single factor can dominate the sum. The stored factor vector's
`z` is the value actually used (so `contribution = w · z` stays exact) and
`zRaw` keeps the unclamped value for explainability; the API never exposes
`zRaw`. Duration keeps its own tighter `[−3, +1]` clamp. Cold-start
renormalization happens after the clamp.

**Recovery Score** weights (Slice 1 — `acuteChronicLoadRatio` excluded
per the flag in Stage 2 above, so weights are renormalized across three
factors, not four):

| Factor | Weight | Direction |
|---|---|---|
| HRV baseline deviation | 0.45 | + |
| RHR baseline deviation | 0.35 | − |
| Sleep debt (14d rolling) | 0.20 | − |

**Weight renormalization on cold-start exclusion, stated explicitly**:
when a factor is excluded for a given user-day because that metric is
still cold-starting (Stage 3), the remaining factors' weights
renormalize proportionally so they sum to 1 for that day — e.g. if HRV
is cold-starting, RHR and sleep debt are weighted `0.35/0.55 ≈ 0.636` and
`0.20/0.55 ≈ 0.364` for that day rather than the score being computed
against a sub-1 weighted sum (which would understate the composite
relative to a normal day for reasons having nothing to do with actual
recovery). This is the same renormalization already applied to exclude
ACWR entirely from the table above, generalized to apply per-day, per-
user, for any factor currently cold-starting — not a special case unique
to ACWR's permanent exclusion.

**RESTING_HR is Google's dedicated resting heart rate.** It comes from the
`daily-resting-heart-rate` data type (`dailyRestingHeartRate.beatsPerMinute`,
one value per civil day, with a `calculationMethod` of `WITH_SLEEP` or
`ONLY_WITH_AWAKE_DATA`), fetched through the same paginated list endpoint as
daily HRV. It replaces the daily-minimum BPM of a heart-rate rollup, which on
the account it was measured on ran a median 12 bpm below true resting heart
rate and showed single-reading artifacts (a 39–41 bpm minimum against a
steady 51). The dedicated value is smoother day to day (spread 2.8 against 4.0
bpm on that account), so its baseline spread is smaller and z-scores react
more strongly to a real change; the implementation floors the spread so a run
of identical values cannot collapse it to zero. Days computed
`ONLY_WITH_AWAKE_DATA` (no sleep data that day) are stored and scored like any
other; they are less reliable and are not separately flagged.

**These weights are stated honestly as illustrative, not derived** — and
that has a real consequence, not glossed over: there is no ground-truth
label for "recovery" to fit these against (no injury/illness outcome
data, no validated survey), so this spec cannot claim the weights are
*correct*, only a documented starting point. The backtest tool (§3)
can show the *effect* of changing them across historical data, not their
*correctness* — that distinction matters and is called out again there.

**Sleep Score** is a separate composite (duration vs. goal, efficiency,
circadian consistency, weighted independently) rather than folded into
Recovery — because a user asking "why was my recovery low" and a user
asking "why did I sleep badly" are different questions, and conflating
them into one number would make both answers worse. It's **Slice 1.5**
— it builds on the `SleepSession` table Slice 0 provides, and ships
right after Slice 1's Recovery Score is live, not bundled with it (see
the backfill note below for its cold-start behavior). Its own
weight-renormalization rule follows the same pattern stated above for
Recovery.

**Sleep Score weights (config v2): duration 0.50, efficiency 0.30,
circadian consistency 0.20.** A product decision, not derived from outcome data
(there is no ground-truth sleep-quality label). Duration is dominant;
efficiency is down-weighted because its observed range is narrow (about 0.90 to
0.99 on the account measured), so small differences turn into large z-scores;
consistency is smallest as the noisiest. Because consistency is excluded for
about 27 nights, early Sleep Scores renormalize to 62.5% duration and 37.5%
efficiency whatever the table says. v1 (0.45 / 0.35 / 0.20, which had been
copied from the Recovery magnitudes) stays available for backtests. A weight
change is a config version bump: a stored score whose `algorithmVersion` differs
from the live version is treated as stale and rescored by the sweep within its
90-day lookback.

`DailyScore` (Recovery Score in Slice 1; Sleep Score added in Slice 1.5)
is stored with `algorithmVersion`, `confidenceLevel` (`HIGH`/`MEDIUM`/
`LOW`, derived from how many inputs were imputed/cold-started/
renormalized-around that day), and the full per-factor vector as JSON — one entry per factor:
`{factor, z, weight, contribution, imputed, excluded}` — the raw
material for Stage 5. `imputed` marks a factor whose input was imputed
that day; `excluded` marks one dropped for cold-start.

**Backfill note**: `SleepSession.startTime` is captured for every
session the Slice 0 wipe-and-re-sync retrieves, so
`circadianConsistencyScore` does not restart from zero at Slice 1.5's
ship date: its 14-day window is computable immediately for any user
whose backfill covered at least 14 nights. `BaselineProgressRing`'s
cold-start state (§5) therefore appears for this factor only for users
with fewer than 14 nights of retrievable history. How far back the
existing backfill job actually reaches is the practical limit, and is
confirmed as part of Slice 0 (see Open Questions).

#### Stage 5 — Explainability

Every `DailyScore` renders with a **factor contribution breakdown**: for
each weighted term, `contribution_i = w_i · z_i` (direction-corrected,
using that day's renormalized weights), sorted by magnitude, rendered as
horizontal bars ("HRV: +8.2 pts · RHR: −3.1 pts · Sleep debt: −1.4 pts").
This is not a black box — it is literally the addends of Stage 4's sum,
so "explainability" here costs nothing extra to *compute* (it's already
inside the formula) but a meaningful amount to *design well* (§6) and
to keep in sync as the weight table evolves across algorithm versions.

## 3. Backtesting & versioning

`ScoreAlgorithmVersion` is a config object (weights, `k`, thresholds),
checked into the repo as versioned JSON/TS (`scoreConfigs/v1.ts`,
`v2.ts`, ...), never mutated in place. A `scripts/backtest.ts` tool
replays historical `BiometricRecord` + `BaselineSnapshot` data through a
candidate new version and diffs the resulting `DailyScore` history
against the currently-live version. **Said precisely**: this diff shows
*what changed* between two versions for real historical data — it is a
regression/sanity check ("did this reweighting flip more users' scores
by more than 10 points than expected"), not a validation that either
version is *correct*, since there's no ground-truth label to validate
against. It catches "this change did something bigger than I expected,"
which is a real and useful thing to catch — it just isn't the same claim
as "this change made the score more accurate," and the tool's own
output/docs should say so rather than imply otherwise.

**Rollout.** Rejected: a per-user `algorithmVersion` flag with cohort
canaries and aggregate distribution-shift comparison — real
infrastructure for an experiment program, on an app with one user (the
person this app is being built for) and no near-term plan for a cohort of
users to canary across. That's over-engineering that doesn't pay for
itself even by this spec's own generous standard. **Adopted instead**:
`algorithmVersion` stays a per-user column (harmless, and it's what
makes a `DailyScore` row self-describing/reproducible), but "rollout" is
just: run the backtest diff, read it, flip the default in config,
deploy. If this app ever does have many independent users, the per-user
column is already there to build a real canary on top of later — but
that's a future spec's problem to design when it's a real need, not this
one's to prebuild.

---

## 4. Token layer (Stat Engine's share of it)

Rejected: a three-tier primitive/semantic/component token system plus a
codegen build step (`scripts/generate-theme.ts`) generating both the
Tailwind config and the native-header `COLORS` object from one source.
That's disproportionate for a small component library: the hand-synced
drift risk between `theme.ts` and `global.css` is real but small (it's
two files, changed rarely, and a mismatch is visually obvious immediately
in either theme) — a whole build-step/codegen pipeline is solving a
problem whose actual cost is "occasionally double-check two files when
editing a color," which doesn't justify a generator, a build step, and a
new type-checked source-of-truth format to maintain.

**Adopted instead**: extend the existing flat `COLORS.light/dark`
objects with exactly the new semantic keys scores require —
`scoreExcellent`, `scoreGood`, `scoreFair`, `scorePoor` (a 4-band scale
distinct from the per-metric color set, since "is this number good"
needs its own color language independent of "which metric is this") —
added by hand, same place, same pattern as every existing token.

Alongside those color keys, a single flat `MOTION` object (also in
`theme.ts`, same file, same weight as `COLORS` — not a separate tiered
system) holds the duration/easing constants score-transition animations
need (`MOTION.duration.fast/normal/slow`, `MOTION.easing.standard/
decelerate`). The AI Coach doc reuses this same object for its own
message-arrival animation rather than defining a second one.

## 5. Component library additions (score rendering)

- **`ScoreRing`** — proposed as a `Ring` variant with a **segmented arc**
  (one arc segment per Slice-1 weighted factor — three, per the weight
  table in §2 — proportional to `|contribution_i|`, colored by whether
  that factor helped or hurt), not just a single-color fill.
  **Gated behind a design spike before full build**: three thin arc
  segments (or four, if a factor is later reinstated) on an 84px ring is
  a real legibility risk that deserves a quick static-mockup check
  across light/dark and a couple of factor-weight distributions (one
  factor dominant vs. three roughly even) *before* committing to
  building the animated, tokenized, motion-choreographed version — if
  the segments read as noise rather than signal at that size, the
  fallback is a single-color fill ring (today's `Ring`, unchanged)
  paired with the `FactorBar` list doing the explanatory work instead,
  which is a perfectly good outcome, not a failure.
- **`FactorBar`** — horizontal bar for the Stage-5 breakdown, signed
  (extends left for negative contributions, right for positive), with a
  shared 0-centered scale across all factors so magnitudes are visually
  comparable. The label for each factor comes from the server (for RESTING_HR,
  "Resting HR").
- **`ConfidenceBadge`** — small `Badge` variant surfacing
  `DailyScore.confidenceLevel` (§2 Stage 4) — a score computed from
  partially imputed or renormalized-around data says so, visually, every
  time it's shown, not just in a tooltip someone has to find.
- **`BaselineProgressRing`** — the cold-start state (§2 Stage 3) — a
  ring counting up "9/14 days" distinct from a `ScoreRing`, so "building
  your baseline" is never visually confusable with a real low score.

Motion for score transitions: **score transitions** animate the
`ScoreRing`'s segments independently, staggered by `|Δcontribution_i|`
descending — the factor that moved the most animates first, so the eye
is drawn to *why* the score changed, not just *that* it changed. All
durations/easings pulled from the `MOTION` object (§4) — never inlined
per-component.

## 6. Explainability rendering (tying the pipeline together)

The single UI artifact that most directly embodies "over-engineered but
for a real reason": the score detail screen renders, top to bottom —
`ScoreRing` (segmented, glanceable) → `ConfidenceBadge` → a
plain-language headline (Stage 5's largest-magnitude factor, sentence-
generated the same deterministic way `metricInsights.ts` already does it
— the coach is available *from* this screen via an "Ask about this"
button per `2026-09-20-ai-coach-design.md`, but the screen itself never
requires an LLM call to be useful) → `FactorBar` list (every weighted
factor, signed, sorted) → the `BaselineSnapshot` this score was computed
against, inspectable ("your HRV baseline: 42ms ± 6ms, based on your last
30 days"). Nothing on this screen is a black box; the entire
Stage-1-through-5 pipeline in §2 is designed so this screen can be
built by rendering its intermediate outputs directly, in order.

## Testing

- Unit tests per stage: cleaning's outlier rejection, baseline EWMA math
  (including the σ̂ = 1.4826 × MAD scaling), composite score's logistic
  squashing and per-day weight renormalization on cold-start exclusion —
  plus the backtest tool itself run against golden historical fixtures
  as a regression check on every algorithm version bump.
- **Date alignment**: an integration test against real historical data
  from a connected account verifying which civil day each metric lands
  on relative to the others, once `User.timezone`, the `SleepSession`
  rollup and the SLEEP re-key ship — Slice 0 exit criterion (a). Kept as
  a regression test afterward so a future change to `client.ts`'s date
  handling can't silently reintroduce the misalignment.
- **Sleep storage idempotency** (Slice 0 exit criteria (b) and (c)):
  - upserting the same session twice, and re-running a single-day fetch,
    a range backfill and a retried job over it, leaves the stored
    session and the derived daily total unchanged;
  - a nap plus a main sleep on one local day yield one rollup equal to
    the sum, and re-syncing either leaves it unchanged;
  - a fetch window that returns only some of a local day's sessions
    never lowers a total below what the stored sessions support, and a
    later window that includes the missing session raises it to the
    correct value;
  - a session whose end instant is before local midnight but after UTC
    midnight (and the reverse) lands on the correct civil date for users
    both west and east of UTC;
  - changing `User.timezone` recomputes the rollups;
  - the other three metrics keep their existing overwrite-on-conflict
    behavior unchanged.
- **Wipe and re-sync migration**: after running it against a fixture
  account seeded with old-convention SLEEP rows, no session is present
  under two keys and the rollup for every day equals the sum of that
  day's sessions.
- **RESTING_HR label**: a test asserting the `FactorBar` label reads
  "Resting HR" and that "daily minimum" never appears in rendered RHR text.
- **Design System**: component snapshot tests (existing pattern,
  extended to new components) plus a visual-regression pass on
  `ScoreRing`'s segmented-arc rendering across factor-count edge cases
  (0 factors during cold-start, all-negative factors, single dominant
  factor, a renormalized-weight day where one factor is cold-start
  excluded).

## Open Questions / Risks

- **Multi-session nights are still unobserved.** The one real account
  measured has one main sleep per day (every record `metadata.mainSleep:
  true`), so nap and split-night handling is untested against real data. The
  design (store every session, sum by local end date) holds either way, and
  `mainSleep` is the likely marker for a nap.
- Two composite scores (Recovery, Sleep) rather than one is a genuine
  product bet, not just an engineering choice — worth validating with
  real users before a third (Strain) score is added, since score-count
  proliferation has real cognitive-load cost the factor-breakdown UI
  only partially offsets.
- **How far back the existing backfill reaches** bounds both the
  re-sync that repairs SLEEP history and the circadian-consistency
  cold-start window. It should be confirmed in Slice 0. If it covers
  fewer than 14 nights for a given user, that user sees the cold-start
  state for the circadian factor until enough new nights accumulate.

## Implementation Status

Slices 0, 1 and 1.5 are implemented (backend and mobile). The decisions
below were made during implementation where this spec was silent or where
it turned out to be wrong; where they contradict the text above, **this
section wins**.

**Live checks, run 2026-09-21 against one real account** (full results in
`docs/superpowers/notes/slice0-live-checks.md`):
- Google's civil dates follow the record's own local UTC offset, so keying
  SLEEP by the local end date agrees with the other three metrics. This
  account's sleep never straddles a UTC/local date boundary, so the
  sleep-based probe alone could not separate the two bases; steps samples
  did. Every record also carries `startUtcOffset`/`endUtcOffset`, and the
  night's day is now keyed from them (see §2), with `User.timezone` as the
  fallback. The same account has nights at both UTC−6 and UTC−4 in one
  window, which a single profile timezone would have mis-dated.
- `endTime − startTime` **is** time in bed: it equals
  `summary.minutesInSleepPeriod` on every session, and
  `summary.minutesAwake` exists. `sleepEfficiency` is sound.
- Multi-session nights were **not observed** (one main sleep per day, all
  `metadata.mainSleep: true`), so nap and split-night handling is still
  untested against real data.
- **Pagination bug found and fixed:** list endpoints are paginated and the
  client used to read only the first page, dropping 13 of 25 nights.
- **A dedicated `daily-resting-heart-rate` type exists** and is now the
  RESTING_HR input (median +12 bpm above the daily-minimum value it replaced,
  steadier day to day). Existing RESTING_HR rows hold the old values, so
  `backend/scripts/resyncRestingHr.ts` (dry-run by default) wipes and
  re-syncs them, and the version bump below causes the affected days to be
  rescored.
- The Sleep Score weights are decided (config v2, see Stage 4). Days older
  than the sweep's 90-day lookback keep their older scores.
- **Config v3 is the live algorithm version.** On one real account the
  Sleep Score swung between about 12 and 70 from small changes: bedtime
  consistency (a rolling 14-day statistic with a day-to-day spread near 3)
  produced z = −6.1, worth −25.9 points on a 0.20 weight, and a single normal
  0.90-efficiency night produced z = −3.6 against a spread that was already at
  its 2% floor; while consistency was still cold-starting, efficiency's
  renormalized weight rose from 0.30 to 0.375. v3 adds the ±3 clamp and the
  per-metric floors (Stage 3 and Stage 4). Replaying that account's history
  through v2 and v3 (`scripts/backtest.ts`): Recovery moved by a mean of 0.02
  points (max 0.38), i.e. effectively unchanged; the Sleep Score's extreme lows
  softened (12.5 to 29.8, 17.0 to 33.6) and a genuinely short night stayed low
  (15.0 to 16.1). This is a regression check, not a validation of accuracy.
  `scripts/rescoreUser.ts` rescores one user's window inline (no queue).

Slice 0
- `PUT /me/timezone` recomputes rollups on every call, not only on a
  change, so a retry after a half-finished request cannot leave rollups
  keyed under the old zone. It rejects offset strings such as `+05:00`.
- `scripts/resyncSleep.ts` is dry-run by default and only wipes users with
  a CONNECTED health connection; deleting rows for disconnected users would
  lose history a backfill cannot restore.
- List endpoints are paginated: `listAllPages` follows `nextPageToken`
  (capped at 50 pages) for sleep, daily HRV and daily resting HR.
  `dailyRollUp` responses were not observed to paginate.

Slice 1
- The stage functions are pure; `pipeline.ts` composes them and is shared
  by the job and the backtest. The single `computeDailyScore` job runs on
  the existing `health-sync` queue with job id `score-<user>-<date>` and a
  5-minute delay; the nightly sweep runs at 03:30 server time.
- Outlier rejection uses the spec's literal raw MAD (stricter than
  1.4826×MAD) and applies to HRV and RHR only, not SLEEP: a short night is
  the signal sleep debt exists to capture.
- **The sleep-debt factor is excluded for about 27 nights, not 14 days.**
  Its z-score is taken against its own 30-day series of debt values built
  only from full 14-night windows; without that the baseline is biased low
  and later days look high. Missing nights count 0 toward the debt sum and
  mark the factor imputed. During those first weeks the Recovery Score is
  computed from HRV and RHR alone with renormalized weights.
- A day with no observed HRV, RHR or SLEEP input gets no score row (any
  leftover row is deleted).
- **Score bands** (lower bounds 75 / 55 / 40 for Excellent / Good / Fair,
  else Poor) are a product starting point, not derived from data. They live
  in the scoring config (`scoreBands` in `configs/v1.ts`, versioned with the
  algorithm) and are returned as `bands` on both score endpoints; the mobile
  app reads them from the response and only falls back to built-in defaults
  for an older server or a malformed value. Changing a band is a config
  change, not a mobile release.
- The segmented `ScoreRing` is built and tested but `segmented` defaults to
  `false`; it needs the visual design spike (§5) on a device before the
  default is flipped.

Slice 1.5
- Weights are 0.50 / 0.30 / 0.20 (duration / efficiency / consistency) in
  config v2, a product decision; see Stage 4.
- Duration is scored against the user's sleep goal:
  `z = clamp((minutesAsleep − goal) / σ̂, −3, +1)`, so sleeping past goal
  earns no extra credit. Efficiency is stored as a 0–1 fraction capped at 1.
- The main session for onset is the longest by `minutesAsleep` (a field
  confirmed live), not by interval; onset time is measured in the session's
  own local time using `startUtcOffset` when present. Consistency = `100·max(0, 1 −
  stddev/120 min)` over noon-anchored onsets; it needs at least 14 nights of
  history and at least 7 nights in the trailing 14-day window, then 14 more
  such days for its baseline — so it is excluded for about 27 nights, like
  sleep debt.
- No Sleep Score is produced for a day without recorded sleep (a stale row
  is deleted) rather than a score made of imputed values.
