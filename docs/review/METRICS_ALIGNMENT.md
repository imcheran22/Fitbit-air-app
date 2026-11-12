# Metrics alignment review: Apex engines against the Pulse reference engine

Date 2026-11-12. Read-only review: no production code was changed. Formula set under review:
`ANALYTICS_ALGORITHM_VERSION = 2`.

Scope: `core/analytics/src/main/kotlin/**`, `core/data/.../pipeline/DailyIntelligencePipeline.kt`,
`core/domain/**` (`MetricType`, `SourceReconciler`), `docs/FORMULAS.md`, `docs/EVIDENCE.md`, `docs/OPEN_POINTS.md`,
against `reference/design/pulse-mobile-main/src/core/engine/*.ts`, `src/core/scoring/`, `src/core/algorithms/` and
`docs/engine-plan.md`. Pulse is reference data: its names, artwork and copy were not used.

**Evidence status.** No literature source could be opened from this session (`pubmed.ncbi.nlm.nih.gov` does not
resolve here; that host has to be allowed in the session's network settings first). Every citation below is from
memory and is **unverified**, the same as in `docs/EVIDENCE.md`. Constants with no source are called *calibration*. The
Pulse constants come from a reverse-engineered study of another app (`docs/engine-plan.md:12-17, 210-214`). They are
not peer-reviewed, so "align to Pulse" is only recommended where the Pulse rule is also the better-founded one.

**Test evidence.**
- `./gradlew :core:analytics:test :core:domain:test --offline` fails: `Plugin [id: 'com.android.application',
  version: '8.13.0'] was not found`. There is no Android SDK and no Google Maven in this container, so
  `:core:data:testDebugUnitTest` cannot run here either. CI has to judge those.
- JVM harness (private copy at `/tmp/claude-0/-home-user-Fitbit-air-app/05a5022a-a04f-5710-bab3-0ab9e8ae8d58/scratchpad/metrics-review`,
  `gradle test --offline -Ptest=core/domain/src/test/kotlin,core/analytics/src/test/kotlin,<probe dir>`): exit 0,
  **89 tests, 0 failures, 0 errors, 0 skipped**. That is the 82 existing domain and analytics tests plus 7 throwaway
  probes. The probes are in
  `/tmp/claude-0/-home-user-Fitbit-air-app/05a5022a-a04f-5710-bab3-0ab9e8ae8d58/scratchpad/metrics-review/probe/com/apex/probe/MetricsAlignmentProbeTest.kt`.
  Each probe passes because the defect is present: it pins today's wrong output with a hand-computed value.

---

## 1. Metric-by-metric table

Legend for the status column: **A** aligned · **D** differs · **MA** missing in Apex · **MP** missing in Pulse.

| # | Metric | Apex formula (file:line) | Pulse formula (file:line) | Status | Apex correct? | Action |
|---|---|---|---|---|---|---|
| 1 | Nightly HRV value | Observed daily RMSSD. If none, the pipeline writes a derived row: the mean of **all** RMSSD samples between session start and end, awake segments included, with n ≥ 6 (`DailyIntelligencePipeline.kt:349-353`). The derived row loses to any observed one (`SourceReconciler.kt:59-67`) | Mean of the samples labelled sleep inside the primary sleep (`engine/days.ts:49,53`) | D | Math is fine, but one baseline mixes two definitions (vendor daily RMSSD and the mean of 5-minute samples with wake included). See Bug B9 | **Fix bug / align**: derive only from asleep-stage samples and keep a single definition per baseline |
| 2 | HRV baseline | 30 days before D, at least 7 valid days, ln(RMSSD), sample SD, floor of 0.05 ln units, z clamped to ±3 (`Baseline.kt:27-51, 55, 109-166`) | 60 days before D, raw ms, population SD, **no minimum** (one prior day gives SD 0), shown "provisional" until 5 data days over a 60-day span (`engine/baselines.ts:10, 76-96`, `engine/math.ts:22-28`) | D | Yes. Causal, log scale (Plews 2013, unverified), SD floor, calibrating state. Edge cases are handled: non-positive or NaN values are rejected, one reading per day, SD 0 is floored | **Keep** (better founded than Pulse) |
| 3 | HRV sub-score | `100/(1+e^(-1.2 z))` (`RecoveryEngine.kt:217, 249`) | `(min(z,1)·0.5+0.5)·100`, 0 below z −1, 50 when SD is 0 (`engine/recovery.ts:9-12`) | D | Yes. Smooth and bounded at 2.7 to 97.3 (*calibration*). Pulse saturates at ±1 SD | **Keep** |
| 4 | Resting HR value | `RESTING_HEART_RATE`, or the `SLEEPING_HEART_RATE` series whenever RHR has no reading today and fewer rows (`DailyIntelligencePipeline.kt:176-180`) | Mean of sleep-labelled minute HR in the primary sleep (`engine/days.ts:50,55`) | D | The series can switch from one day to the next, so z-scores, streaks and the TRIMP anchor change definition (B10) | **Fix**: pick one series per window (S) |
| 5 | RHR baseline and sub-score | 30 days, relative SD floor 2 %, `100/(1+e^(1.2·max(z,−2)))` (`Baseline.kt:56`, `RecoveryEngine.kt:223-224`) | Chan merge of **minute-level** sleep HR (`engine/baselines.ts:50-65`, `days.ts:66`). The SD includes within-night variation, so z is compressed toward 0. `compDown` (`engine/recovery.ts:15-19`) | D | Yes. Day-mean against a personal baseline (Buchheit 2014, unverified) | **Keep** |
| 6 | Recovery composite | `Σ w'·S` renormalised over the inputs present: HRV .40, RHR .25, sleep .25, resp .05, temp .05, plus optional fatigue .10 and load .05 (`RecoveryEngine.kt:16-28, 154-185`). At least one of HRV or RHR is required | `0.4·HRV + 0.3·RHR + 0.3·Sleep + rrAdjust + tempAdjust`, clamped to 1..100. HRV, RHR, their baselines **and** the sleep score are all required; the adjustments are additive and never gate (`engine/recovery.ts:49-66`) | D | **No.** Resp, temp and load have neutral 100 inside a weighted mean, so a missing benign sensor lowers the score and a present one raises it (B1, probe) | **Fix bug / align** to additive adjustments (S) |
| 7 | Recovery bands | 67 / 34 on the rounded score (`RecoveryEngine.kt:134-135, 186-191`) | 67 / 34 (`engine/recovery.ts:69`) | A | Yes (*calibration*) | Keep |
| 8 | Breathing rate in recovery | Penalty only, `100 − 40·max(0, z−1)` (`RecoveryEngine.kt:227-229`) | Symmetric `(compDown−50)·0.2`, ±10; a low rate earns points (`engine/recovery.ts:22`) | D | Yes. A one-sided penalty is the more defensible choice | **Keep** the rule, make it additive (as in row 6) |
| 9 | Skin temperature in recovery | Two-sided: `−40/SD` raised, `−20/SD` lowered, beyond ±1 SD (`RecoveryEngine.kt:232-236`) | Raised only, `max(−30, 30·atan(min(z,0)/10))` (`engine/recovery.ts:25-28`) | D | Yes (*calibration*) | Keep, additive |
| 10 | Subjective fatigue | Optional input, `100·(10−r)/9` (`RecoveryEngine.kt:239-240`) | none in the engine | MP | Yes | Keep |
| 11 | Workload ratio in recovery | Optional, 100 up to 1.30, falls to 0 at 2.00 (`RecoveryEngine.kt:243-247`). The pipeline passes yesterday's `ACWR_UNCOUPLED` whatever its caveats (`DailyIntelligencePipeline.kt:275`) | not in recovery. The load ratio gates the load status together with recovery (`engine/strain.ts:401-410`) | MP | Breaks its own contract: "pass null when it is flagged unreliable" (`RecoveryEngine.kt:37`). See B6 | **Fix bug** (S) |
| 12 | TRIMP | Banister per minute, `ΔHR·a·e^(bΔHR)`, a/b 0.64/1.92 (men) and 0.86/1.67 (women), the mean of the two when sex is unset, ΔHR clamped to 0..1, 30 % HRR floor, every minute of the day (`Trimp.kt:23-66`, `StrainEngine.kt:65-91`). HRrest is **today's** RHR first (`DailyIntelligencePipeline.kt:225`) | Workouts only, `0.64·e^(b·x)·x` with **a = 0.64 for both sexes**, HRrest is the 60-day RHR baseline (`engine/strain.ts:306-318`) | D | Coefficients match Morton 1990 (unverified); Pulse's 0.64 for women deviates from them. Units: TRIMP·min. Anchors are pinned by tests | **Keep** the coefficients. **Align** the HRrest anchor to the baseline (S, B10) |
| 13 | Daily strain | `21·ln(1+T/20)/ln(31)`, capped at 21 (`StrainEngine.kt:93-97`) | Percent: `16·atan(steps/7000) + 66·atan(U/20000)` with zone-weight units (`engine/strain.ts:237-253, 291`) | D | Math correct; scale is *calibration*. Two hours of walking at 35 % HRR already give **8.4** (probe `G`), above the 6 ± 1 target for 0 % recovery | **Keep** the scale. Recalibrate the floor or target (see gap 1) |
| 14 | Strain target | `6 + 12·R/100`, ± 1 (`StrainTarget.kt:41-49`) | Personal: base is a 14-day strain EWMA, scaled ±30 % by recovery, asymmetric low/high bounds (`engine/strain.ts:415-428`). Pulse fills a missing day with 0 | D | Math correct, but not personalised: the same window for a sedentary user and a high-volume athlete | **Align** (M); skip missing days rather than zero them |
| 15 | Remaining capacity | TRIMP at the window top minus TRIMP so far, also as minutes at each zone midpoint (`StrainTarget.kt:51-68`) | none | MP | Yes. But the pipeline feeds it 0 TRIMP when today has no HR data (B11) | Keep; fix B11 |
| 16 | HR zones | 50/60/70/80/90 % of HRmax, or of HRR (Karvonen) (`HeartRateZones.kt:53-62`) | 50 to 90 % of HRmax, rounded up (`engine/strain.ts:224-234`) | A | Yes (conventions) | Keep |
| 17 | Max HR | User value, else max(Tanaka `208−0.7·age`, observed peak); without age, the observed peak alone (`MaxHeartRate.kt:17-50`). The observed peak is **one** max minute over 180 days (`IntradayHeartRateDao.kt:90-92`, `DailyIntelligencePipeline.kt:227-228`) | Engine: profile value or `220 − age` (`pipeline/index.ts:32`). Older scoring code: the 99.5th percentile of artefact-filtered exercise HR, never below Tanaka, needing 600 samples (`scoring/strain.ts:25-26, 152-185`) | D | Tanaka is better than 220 − age. The peak is not robust: one artefact minute becomes HRmax for 180 days (B5, probe) | **Fix bug** (S), using Pulse's percentile idea |
| 18 | VO2 max | Device value up to 30 days old, else Uth `15.3·HRmax/HRrest`, labelled ESTIMATED (`CardioFitness.kt:26-34`, `DailyIntelligencePipeline.kt:296-302`) | Device value plus a FRIEND-percentile category; the same Uth factor 15.3 (`algorithms/fitnessLevel.ts:24-81, 112, 126`) | A (estimate) / MA (category) | Yes, within its stated limits. A nightly wearable RHR is lower than the seated rest in Uth's protocol, so the estimate likely errs high (unverified) | Keep. **Add** the category (S) |
| 19 | Sleep score | Duration .40, restorative .25, efficiency .20, consistency .15, renormalised (`SleepScoreEngine.kt:25-30, 115-185`) | Six power-curve components: asleep, deep, REM, HR dip, efficiency, continuity, with weights .35/.2/.2/.1/.075/.075 and age/sex deep targets (`engine/sleep.ts:42-107`) | D | Math correct and NaN-safe. The bands are leaky (already in `FORMULAS.md` §4) | Keep. Consider adding HR dip (gap 7) |
| 20 | Sleep need | Base 7 h 45 min, or P75 of 30 nights once 14 exist, kept within 7 to 9 h; plus 3 min per strain point above 10; plus 50 % of debt up to 90 min; total at most 10 h (`SleepNeed.kt:53-116`) | Goal (7.5 h or an age default) × (1 + 2 % per SD of strain above the mean) + 25 % of the negative bank (`engine/sleep.ts:135-146, 184-190`, `days.ts:11`) | D | Correct; nearly all of it is *calibration*. The 7 to 9 h range follows Hirshkowitz 2015 (unverified) | Keep |
| 21 | Sleep debt / bank | Unweighted sum over the 7 prior nights of need minus asleep; surplus credit at most 60 min; never negative; missing nights skipped (`SleepNeed.kt:89-96`) | Bank weighted `e^(0.3(j−6))`, last night weighs 1, naps included, can be positive (`engine/sleep.ts:118-126`) | D | Returns **0** when no night was recorded (B8). Stored `SLEEP_DEBT` excludes last night (`DailyIntelligencePipeline.kt:385`) | **Fix bug** (S). Recency weighting optional (gap 9) |
| 22 | Efficiency | asleep / in bed, 0 at 65 %, 100 at 92 %, −3 points per wake bout over 3 min beyond two, at most −25 (`SleepScoreEngine.kt:137-141, 200-206`) | `1 − awake/total` after trimming the awake edges, target 0.97 with exponent 15, plus a continuity factor (`engine/sleep.ts:13-46, 87`) | D | Correct. Null `wakeBouts` gives no penalty (no imputation) | Keep |
| 23 | Stages / restorative | (deep+REM)/asleep against 38 to 50 %, ±5 points per SD of personal z (`SleepScoreEngine.kt:131-135, 187-198`). The pipeline uses `?: 0` for a missing stage (`DailyIntelligencePipeline.kt:203, 206`, already in AUDIT) | Deep against an age/sex target, REM against 0.2, both as ratios of need (`engine/sleep.ts:49-55, 84-85`) | D | Correct (*calibration*). The known `?: 0` imputation remains | Keep; close the AUDIT item |
| 24 | Consistency | Circular SD of bed and wake times over 7 nights, at least 3 nights; 100 up to 45 min, 0 at 150 min (`SleepScoreEngine.kt:143-153, 208-212`, `CircularTime.kt:42-51`) | 1440-bin sleep/wake agreement over up to 7 days (`engine/sleep.ts:164-178`); separate SRI (`algorithms/sleepRegularity.ts:85, 171-178`) | D | Circular math correct; DST is handled through the per-session offsets (`DailyIntelligencePipeline.kt:419-428`). SRI (Phillips 2017, unverified) has outcome validation, SD-of-times less | **Align** to SRI (M) |
| 25 | Tonight's time in bed | need / mean efficiency clamped to 0.70..0.95 (`AthleteRepository.kt:191-196`) | need + efficiency loss (at most 1 h) + mean latency (at most 1 h) (`engine/sleep.ts:152-157`) | D | Correct; leaves out latency | Add latency (S) |
| 26 | ATL / CTL | Normalised EWMA, spans 7 / 28, missing days skipped (no decay over gaps) (`Ewma.kt:79-97`, `TrainingLoadEngine.kt:123-129`) | α 0.25 and 2/43, **zero seed**, workout TRIMP only (`engine/strain.ts:375-379`) | D | Yes (Williams 2017, unverified). Pulse's zero seed biases early values low | Keep |
| 27 | ACWR and zones | Coupled ATL/CTL once 14 calendar days exist; uncoupled 7 vs 21 days, needs 28 days, 5/7 and 14/21 recorded; bands 0.8/1.3/1.5 (`TrainingLoadEngine.kt:140-156, 215-220`) | `ratio > 1.4` overtraining, `> 1` productive or fatigued (by recovery), else by the CTL trend; status "calibrating" below a density/recency confidence of 0.35 (`engine/strain.ts:386-410`) | D | Uncoupled ratio correct. Coupled ratio is reported from **two** recorded days (B4, probe). Bands are contested (Impellizzeri 2020, unverified) and are labelled as such | **Fix bug** (S); add load confidence (gap 4) |
| 28 | Monotony / Foster strain | mean/SD of the last 7 days, needs 6 recorded days, capped at 10; strain = weekly × monotony (`TrainingLoadEngine.kt:158-172`) | none in the engine | MP | Correct (Foster 1998, unverified), but distorted by partial days (B2, B3) | Keep |
| 29 | Training balance / ramp | CTL−ATL of yesterday; CTL change over 7 days (`TrainingLoadEngine.kt:183-191`) | CTL over 5 days against the 5 before, ±5 % (`engine/strain.ts:407-408`) | D | Correct | Keep |
| 30 | Fatigue signals | HRV z ≤ −1.5; RHR z ≥ 1.5; 3-day streaks; weekly HRV under the lower edge with ≥ 3 readings; breathing z ≥ 2; levels from agreement between signals (`FatigueSignals.kt:38-98`) | Illness heads-up: per-signal z ≥ 2 including **skin temperature**, ≥ 2 corroborating signals, 14-night minimum, confounder damping, "not a diagnosis" (`scoring/illness.ts:190-303, 340-381`) | D | Logic correct; non-diagnostic wording held. No skin-temperature signal. Returns `NONE` while calibrating, which the UI shows as optimal (B7) | **Fix** B7; **add** skin temperature and corroboration (gap 6) |
| 31 | Weekly HRV status | `ewma7` on the ln scale against the 30-day range that **includes the same week** (`MetricIntelligence.kt:89-94`, `FatigueSignals.kt:65-69`) | 7-night ln mean against the 60 nights **before** that week, ≥ 21 baseline and ≥ 4 week nights, balanced ±0.75σ, low < −1.5σ, σ ≥ 0.05 (`algorithms/hrvStatus.ts:6-18, 49-68`) | D | Coupled baseline absorbs a sustained drop: a steady 17 % fall stops firing after about 12 days (probe `G2`) | **Align** (S) |
| 32 | Trend, CV, streaks | OLS slope over 7 days, ≥ 4 points, 0.75σ threshold; CV needs 3 points; streak ends at a missing day (`MetricIntelligence.kt:96-181`) | Health Monitor ±1 SD over 30 nights; journal OLS/t-test (`engine/journal.ts:25-47`) | D | Correct | Keep |
| 33 | Day boundaries | Local civil day in the **current** zone for all history (`DailyIntelligencePipeline.kt:155-157`); a night belongs to its wake day | Local midnight; a night belongs to the day it ends (`engine/days.ts:1-5`) | A | Correct with DST; after travel a replay re-buckets older days (Low, `OPEN_POINTS.md` Takeout 2) | Keep; open point |
| 34 | Calibration rules | Baselines 7 of 30 days; personal sleep base 14 nights; coupled ratio 14 days; uncoupled 28 days; "calibrating" states, never a number | Shown from day 1 as "provisional" until 5 data days over 60 days (`engine/baselines.ts:87-96`, plan fix 17) | D | Stricter and more honest | Keep |
| 35 | Stress (0 to 100) | none | 6-minute slots, HR percentile on the 30-day awake CDF through a curve, 40 % HRV term at night (`engine/stress.ts:89-135`) | MA | n/a | Defer (L): unvalidated reverse-engineered curve |
| 36 | Energy bank | none | Charge/drain state machine on stress slots (`engine/energyBank.ts:166-191`) | MA | n/a | Defer (L): no validation |
| 37 | Pulse Age | none | 9 hazard factors from population tables; missing factors filled by scaling up the ones present (`engine/pulseAge.ts:249-347`, esp. `342-343`) | MA | n/a | **Do not adopt**: imputation and population norms break Apex invariants |
| 38 | Post-workout HR recovery | none | Largest drop within 120 s after the active end, only if zone 4 was reached (`engine/strain.ts:342-369`) | MA | n/a | Add (M) |
| 39 | EPOC / cardio focus | none | `engine/strain.ts:322-340` | MA | n/a | Defer |
| 40 | Behaviour impact (journal) | none | Pooled t-test, at least 5 per arm, 90 days (`engine/journal.ts:8-64`) | MA | n/a | Add later (M) |
| 41 | SpO2 | Baseline computed, not scored (`DailyIntelligencePipeline.kt:183`) | absent (`docs/engine-plan.md:46`) | A | Correct | Keep |

---

## 2. Bugs (ranked by severity)

Each was read twice in the source. "Probe" means a passing test in the scratch file above pins the wrong output.

**B1 · High · Recovery: a missing benign sensor changes the score and can flip the category.**
`RecoveryEngine.kt:21-27` (neutral 100 for `RESPIRATORY_RATE`, `SKIN_TEMPERATURE`, `TRAINING_LOAD`) together with the
renormalisation at `:170-185`. Renormalising implicitly fills a missing component with the weighted mean of the others
(about 55), not with its usual 100. Input: HRV z 0.4, RHR z 0, sleep 80, breathing and temperature z 0 gives **67.21,
PEAK, TRAIN_HARD**. The same day with breathing and temperature not synced gives **63.57, MODERATE**. A benign ratio of
1.0 lifts the first case to 68.77 (probe `B1`). Smallest fix: renormalise only HRV, RHR, sleep and the optional
fatigue rating, then **subtract** `w_k·(100 − S_k)` for each penalty-only input that is present. This is the Pulse form
(`engine/recovery.ts:64`). Formula change: bump to version 3, update `FORMULAS.md` §2, and add a property test
"adding a penalty-only input at its neutral value never changes the score".

**B2 · High (load metrics) · Partly worn days are stored as real low-load days.**
`DailyIntelligencePipeline.kt:233-237, 259-260, 390`: strain and `DAILY_TRIMP` are computed whenever
`hrRows.isNotEmpty()`. `StrainResult.recordedMinutes` is read nowhere in `core/data` or `app`. Input: a finished day
with 40 minutes of heart rate synced gives TRIMP of about 0, stored as a rest day, which then feeds ATL, CTL,
monotony, ACWR and week-over-week change. That breaks "missing stays missing". Smallest fix: for a finished day, put
`DailyLoad(day, null)` into the history and skip storing `DAILY_TRIMP` when `recordedMinutes <
MIN_WEAR_MINUTES` (for example 600). That threshold is a *calibration* choice and has to be documented as one. Keep
showing the strain as a lower bound.

**B3 · Medium · Today's partial TRIMP enters today's load figures.**
`DailyIntelligencePipeline.kt:259-261` adds `DailyLoad(day, strain?.trimp)` even when `isProvisional`. Input: 28
steady days at 100, and at 07:00 today 5 TRIMP. Uncoupled ACWR reads 0.864 instead of 1.000, ATL falls by more than
20 %, and monotony drops from 10 to under 3 (probe `B3`). Smallest fix: when `day >= today()`, pass
`DailyLoad(day, null)`. The averages then carry forward until the day closes.

**B4 · Medium · Coupled ACWR and a workload zone come from two recorded days.**
`TrainingLoadEngine.kt:144-145` gates only on calendar span (`daysOfHistory >= 14`, counted from the first day with
data), and `StateMappers.kt:68-71` shows any non-null ratio as a value. Input: `[day 0: 10, day 13: 200]` gives a
coupled ratio of 1.094, zone SWEET_SPOT, `validDaysLast28 = 2` (probe `B4`). Smallest fix: also require
`last28.size >= config.minValidChronicDays` (14) for the coupled ratio. Test: two recorded days give a null ratio.

**B5 · Medium · One artefact minute sets HRmax for 180 days.**
`IntradayHeartRateDao.kt:90-92` takes `MAX(avgBpm)` (its KDoc calls this "robust"). `MaxHeartRate.kt:44-47` lets any
observed value above the Tanaka prediction win, and the pipeline looks back 180 days (`:227-228`). Input: age 40
(predicted 180), one optical spike minute at 212, RHR 55, a 60-minute run at 160 bpm. Strain is **10.91** (TRIMP 99.1)
against **13.74** (TRIMP 169.0) with the prediction (probe `B5`), and every later day is understated the same way.
Smallest fix: use the 5th-highest minute (`ORDER BY avgBpm DESC LIMIT 1 OFFSET 4`), or Pulse's 99.5th percentile of
artefact-filtered exercise HR (`scoring/strain.ts:152-185`). Test: one 212-bpm minute among 180-bpm minutes leaves
HRmax at 180.

**B6 · Low to Medium · An unreliable workload ratio still feeds recovery.**
`DailyIntelligencePipeline.kt:275` passes the stored `ACWR_UNCOUPLED` with no caveat check, although
`RecoveryEngine.kt:37` says "pass null when it is flagged unreliable". Input: a chronic mean of 6 TRIMP/day and an
acute mean of 12 (caveat LOW_CHRONIC_LOAD) give a ratio of 2.0 and a load sub-score of 0. Recovery is **58.33**
against **63.10** at a ratio of 1.0 (probe `B6`). Smallest fix: run `loadEngine.analyze(history before day, day − 1)`
in the pipeline and pass `acwrUncoupled.takeIf { caveats.isEmpty() }`. This also removes the dependence on whether
yesterday's stored row was written while it was still provisional.

**B7 · Low to Medium · "No fatigue signals" is shown while baselines are calibrating.**
`FatigueSignals.kt:90-91` returns `NONE` when every z-score is null. `RecoveryMapping.kt:86-87` only checks that
readings exist, and `RecoveryScreen.kt:260` paints `NONE` as `ChipTone.OPTIMAL`. Input: day 3 of use, an HRV reading
today, baselines on 2 of 7 days gives a green "none" chip. Smallest fix: in `fatigueOf`, return `NoData` (or
calibrating) when `a.hrv.zScore == null && a.restingHeartRate.zScore == null`.

**B8 · Low to Medium · Sleep debt reads 0 when no night was recorded.**
`SleepNeed.kt:89-96` returns `0.0` for an empty window, and the pipeline stores `SLEEP_DEBT` and `SLEEP_NEED` for every
replayed day (`DailyIntelligencePipeline.kt:384-385`). Input: no main sleep in the 7 prior nights gives
`accumulatedDebtMinutes = 0`, shown as no debt. With 1 of 7 nights recorded, the debt is a single night's balance with
no coverage flag. Smallest fix: make debt nullable, null below 4 recorded nights in the window (*calibration*), and do
not store it when null. The stored `SLEEP_DEBT` is the debt *before* last night; label or store it consistently.

**B9 · Medium (data consistency) · The HRV baseline mixes two definitions.**
`DailyIntelligencePipeline.kt:349-353` derives the night's HRV as the mean of **every** RMSSD sample from session start
to end (awake segments included). On days without that row, the vendor's daily RMSSD is used. Swapping definitions
inside a 30-day window inflates σ30 and biases z. The size of the gap was not measured (needs real data). Smallest fix:
take only samples inside asleep stage segments (Pulse `engine/days.ts:49`), and store the derived value under its own
`MetricType` (or never mix it with observed values inside one window).

**B10 · Low · The TRIMP anchor and the RHR series change from day to day.**
`DailyIntelligencePipeline.kt:225` uses today's RHR before the baseline, and `:177-179` can switch the series to
sleeping HR. Input: a morning RHR 8 bpm above usual changes that day's ΔHR for every minute, so loads are not
comparable across days. Smallest fix: `rhr.baseline.center ?: rhr.current ?: latest` (Pulse uses the 60-day baseline,
`engine/strain.ts:304-306`), and choose the series once per window.

**B11 · Low · Remaining capacity is computed with no heart-rate data.**
`DailyIntelligencePipeline.kt:284` uses `strain?.trimp ?: 0.0`. A past day with no HR shows the whole window as
"left". Smallest fix: require `strain != null`.

**B12 · Low · Duplicate days: last one wins in the load engine, first one everywhere else.**
`TrainingLoadEngine.kt:103-104` uses `associateBy`, which keeps the last value; `FORMULAS.md` v2 says the first wins
everywhere. Input: `[DailyLoad(5,100), DailyLoad(5,0)]` uses 0. The pipeline never sends duplicates. Fix: keep the
first per day.

Already recorded in AUDIT, still open: restorative `?: 0` (`DailyIntelligencePipeline.kt:203, 206`). Travel
re-bucketing of past days in the current zone (`:155-157`) is a time-zone open point.

---

## 3. Alignment gaps worth closing (ranked by value to an athlete)

1. **Personalised strain target (M).** Replace `6 + 12·R` with a base taken from the athlete's own recent strain (an
   EWMA over 14 days, **skipping** missing days instead of Pulse's zero-fill), scaled by recovery
   (`engine/strain.ts:415-428`). Today a normal walking day (8.4) already exceeds the 0 %-recovery target, and a
   high-volume athlete is capped at 19. *Calibration*; label it as guidance.
2. **Recovery adjustments as additive penalties (S).** Pulse form (`engine/recovery.ts:21-28, 64`). Fixes B1. Keep
   Apex's one-sided breathing-rate rule, its log-HRV z and its logistic curve.
3. **Decoupled weekly HRV status (S).** 7-night ln mean against a baseline that ends **before** the week, with ≥ 21
   baseline nights, ≥ 4 week nights, ±0.75σ / −1.5σ and σ ≥ 0.05 (`algorithms/hrvStatus.ts:6-18, 49-68`). This matches
   rolling-average practice (Plews 2013, unverified) and stops a sustained fall being absorbed (probe `G2`: silent
   after about 12 of 30 suppressed days).
4. **Load confidence and wear coverage (M).** A density and recency confidence (`engine/strain.ts:386-395`) plus a
   per-day wear-time rule (B2). Below the threshold show "calibrating" rather than a ratio or zone. Closes B2 to B4
   with one rule.
5. **Multi-signal fatigue with skin temperature (S).** Add a skin-temperature z signal and require ≥ 2 corroborating
   signals for the top levels, with a 14-night minimum (`scoring/illness.ts:190-197, 238-303, 340-347`). Keep Apex's
   "may indicate" wording; skip Pulse's confounder copy unless the journal records those tags.
6. Sleep Regularity Index for consistency (M): `algorithms/sleepRegularity.ts:85, 171-178` (Phillips 2017, unverified).
7. HR-dip component in the sleep score (M): `engine/sleep.ts:109-111`.
8. Post-workout heart-rate recovery (M): `engine/strain.ts:342-369`.
9. Small items (S each): VO2 max category against FRIEND norms (`algorithms/fitnessLevel.ts:65-81`; display context
   only, never an input); latency in tonight's time in bed (`engine/sleep.ts:152-157`); a recency-weighted sleep bank
   (`engine/sleep.ts:118-126`).

Do not adopt: Stress, Energy Bank, EPOC (unvalidated constants), and Pulse Age (population hazards and imputation of
missing factors, `engine/pulseAge.ts:342-343`). Do not copy Pulse's female TRIMP `a = 0.64`, its zero-seeded ATL/CTL,
its no-minimum baselines, or its `220 − age` default.

---

## 4. Missing-data honesty check

| Engine | Missing input gives | Verdict |
|---|---|---|
| `BaselineEngine` | `CALIBRATING`, every field null below 7 valid days; NaN and ≤ 0 (log) rejected | Honest |
| `MetricTrendAnalyzer` | `NO_READING` / `CALIBRATING`; trend `INSUFFICIENT_DATA` below 4 points; streak 0 | Honest |
| `RecoveryEngine` | `UNAVAILABLE` / `CALIBRATING` with a null score when HRV and RHR are both missing | Honest in state, **biased in value** when a penalty-only input is missing (B1) |
| `SleepScoreEngine` | Needs a night (the pipeline passes none, so the result is null); stage, consistency and efficiency drop out; null wake bouts give no penalty | Honest. Pipeline `?: 0` on one missing stage (AUDIT) |
| `SleepNeedCalculator` | Base falls back to the 7 h 45 min DEFAULT, labelled `BaseNeedSource.DEFAULT`; missing strain adds 0 | Need is acceptable as a labelled recommendation. **Debt returns 0 with no nights** (B8) |
| `StrainEngine` / pipeline strain | null with `NO_HEART_RATE_DATA`, `NEEDS_RESTING_HEART_RATE` or `NEEDS_MAX_HEART_RATE` | Honest for "none". **Not honest for "partial"** (B2) |
| `StrainTargetCalculator` | null target without a recovery score | Honest. Remaining capacity uses 0 TRIMP when strain is missing (B11) |
| `TrainingLoadEngine` | null TRIMP is skipped (no decay); `UNAVAILABLE` when empty; uncoupled ratio gated on recorded days | Mostly honest. Coupled ratio from 2 days (B4); provisional and partial days enter as values (B2, B3) |
| `FatigueSignalDetector` | No state for "unknown": `NONE` | **Not honest** in the UI while calibrating (B7) |
| `MaxHeartRate` / `CardioFitness` | null without a usable age, peak or user value; no population default (unlike Pulse's 220 − age) | Honest. Robustness is B5 |
| `SourceReconciler` | Derived values never override observed ones | Honest. Definition mixing is B9 |

Every engine returns null or a calibrating state rather than 0 for a fully missing input, except sleep debt (B8) and
the fatigue level (B7). Partial-coverage days (B2, B3) and the recovery renormalisation (B1) are the remaining ways
missing data turns into a number.
