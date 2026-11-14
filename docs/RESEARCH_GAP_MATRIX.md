# Research gap matrix

One row per metric ID of the Fitbit Air Deep Research report (Parts 1-3, 13 Nov 2026) and the
multivariable patterns of the merged research (section 2.5), checked against this branch (formula set 5).
Formulas and citations: `docs/RESEARCH_METRICS.md` (research package) and `docs/FORMULAS.md` (app engines).
Code: `core/analytics/src/main/kotlin/com/apex/athlete/core/analytics/` ("research/" is the research package).

## How to read it

- **Implemented** - an app engine that the pipeline already calls (stored or computed on read). The research
  duplicate, if there was one, was removed (D18) and the research golden vector now runs against the engine.
- **Built now** - a function in `research/` with golden tests, **not wired**: the pipeline does not call it, nothing
  is stored, no screen reads it. Wiring is listed at the end.
- **Partial** - part exists; what is missing is stated.
- **Excluded** - not built on purpose (research class D or a design rule).
- **Not built** - no analytics code; the reason is given.

Evidence class and priority are the research's (A strong, B established method with limited device validation,
C exploratory, D not built; P0 first release ... P3 niche).

## Cardiovascular (CV)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| CV01 | Resting HR deviation, robust z | B | Built now - `research/RobustBaseline` (median/MAD, floor 1 bpm) and `baseline/DualBaseline.restingHeartRate` (D16: robust for anomaly checks). The mean/SD z (`BaselineEngine`) is **Implemented** and feeds recovery and fatigue | P0 |
| CV02 | RHR coefficient of variation, 14 days | C | Built now - `CardioMetrics.restingHeartRateVariability`. Near-duplicate of `MetricIntelligence.coefficientOfVariation7` (7 days, implemented); kept for the research's 14-day/10-day rule | P3 |
| CV03 | HR reserve and zones | B | Implemented - `strain/HeartRateZones`, `fitness/MaxHeartRate` | P1 |
| CV04 | Heart-rate recovery HRR60/120 | B / C | **Implemented** - `strain/HeartRateRecovery` (computed on read by `WorkoutRecovery`; research T-CV04-a passes against it). Built now: `CardioMetrics.compareWithRecentSessions` (needs stored per-workout HRR) | P2 |
| CV05 | HR drift / aerobic decoupling | C | Built now - `CardioMetrics.heartRateDrift`, `aerobicDecouplingPercent` (decoupling needs phone-GPS speed) | P3 |
| CV07 | Daytime HR above resting + 20 bpm | C | Built now - `CardioMetrics.minutesAboveActiveThreshold` | P3 |
| CV08 | Irregular rhythm notifications | A (device) | Not built - pass-through only by design; data type not in the client | P3 |

## Autonomic (AR)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| AR01 | ln RMSSD 7-night mean vs 60-night baseline | B | **Implemented** - `trend/WeeklyHrvStatusAnalyzer` (`DayAnalysis.weeklyHrvStatus`; same windows and minimums, SD floor 0.05; T-AR01-a..d pass against it). Built now: `AutonomicMetrics.swcStatus`, `percentFromBaseline` derived from it | P1 |
| AR02 | HRV CV7 on the ln scale | B | Built now - `AutonomicMetrics.cv7LnPercent` | P2 |
| AR03 | Deep-sleep RMSSD, non-REM HR | C | Partial - `HRV_DEEP_SLEEP_RMSSD` exists and can be trended; non-REM HR has no `MetricType` | P3 |
| AR04 | Sleeping HR dip | C | **Implemented** - `sleep/HeartRateDip`, stored as `HR_DIP` (v4). **Divergence:** the research forbids applying the 10 % blood-pressure threshold to heart rate; `HeartRateDip` assigns DIPPER/BLUNTED/REVERSED at 10 %, labelled "UNVERIFIED, calibration" in FORMULAS 8.3. Proposal: show the signed % against the person's own history and drop or rename the categories | P3 |
| AR05 | Multi-signal composite score | D | Excluded by the research. **Owner-accepted divergence:** recovery (section 2) and the sleep score (section 4, v5 with a physiological restoration part) are weighted composites; every weight is labelled calibration, scores carry contributions and confidence, recovery takes the behavioural sleep score to avoid double counting (D15) | - |

## Sleep (SL)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| SL01 | TST mean/median/SD/CV, nights >= 420 | A / B | Built now - `SleepRegularity.durationSummary`. `SLEEP_DURATION` is stored | P0 |
| SL02 | Sleep efficiency | B | Implemented - `SLEEP_EFFICIENCY` stored; scored by the sleep score (65/85/95 anchors, v5) | P1 |
| SL03 | Sleep Regularity Index | B | **Implemented** - `sleep/SleepRegularityIndex` (v3), scores consistency; `DayAnalysis.sleepRegularity`; `SLEEP_CONSISTENCY` stores `max(0, SRI)`. Research duplicate removed (T-SL03-b passes against the engine). Convention differences kept by design: 7 windows (research 14), naps count as sleep (research: unknown), AWAKE stages not removed, at least 2 pairs (research 7 days / 5 pairs) | P1 |
| SL04 | Sleep midpoint and its SD | B | Built now - `midpointMinuteOfDay`, `clockVariability` (use it for the midpoint only, see SL10) | P1 |
| SL05 | Social jetlag | B | Built now - `socialJetlag`; needs a work-day setting | P2 |
| SL06 | Stage composition | B / C | Partial - stage minutes stored; the v5 sleep score scores deep + REM against the personal usual (quality part). No stand-alone % trend | P2 |
| SL07 | WASO, awakenings per hour | B / C | Built now - `wasoMinutes`, `awakeningsPerHour`. `SLEEP_AWAKE` and `wakeBoutsOverThreeMinutes` are stored | P2 |
| SL08 | Estimated shortfall (clipped and signed) | C | Built now - `guidelineShortfall` (renamed, D17), **secondary**. **Implemented and primary**: personal sleep debt (`SleepNeed`, `SLEEP_DEBT`). Different names on screen | P1 |
| SL09 | Sleep-onset latency | D | Owner decision (D17): kept, stored (`SLEEP_LATENCY`) and shown as provider-reported; nothing scores on it (`SleepNightInput` has no field, test). `sleep/SleepLatency` flags a reported 0 as "not measured" | - |
| SL10 | Bedtime consistency | B | Implemented - circular SD of bed and wake times in `SleepScoreResult.onsetStdDevMinutes` / `wakeStdDevMinutes` (display) | P1 |
| SL11 | Out-of-bed segments | C | Not built - field not in the data model | P3 |
| SL12 | Nightly HR / HRV / RR inside sleep | - | Implemented - sleeping HR and HRV derived from the night's samples; since v5 they feed the sleep score's restoration part as z against their own baselines | - |

## Activity (PA)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| PA01 | Steps, median, CV, trend, Paluch range | A / B | Built now - `ActivityMetrics.stepsSummary`, `stepReferenceRange`, `RobustBaseline.sameWeekdayDeviation`. `STEPS` stored | P0 |
| PA02 | Weekly MVPA vs WHO 150-300 | A / B | Built now - `weeklyMvpa`, `weeklyActiveZoneMinutes`. Activity-minute types exist; goals use AZM (`goals/GoalEngine`) | P0/P1 |
| PA03 | Sedentary time, 30-min bouts | B | Built now - `prolongedBouts`, `sedentaryDay` | P0/P1 |
| PA04 | Sedentary breaks per hour | B | Built now - `sedentaryDay.breaksPerSedentaryHour` | P1 |
| PA05 | Peak 30-min cadence | B | Built now - `peakCadence` | P2 |
| PA06 | Activity regularity | C-B | Built now - `stepsSummary.cvPercent`, `Longitudinal.workFreeSplit` | P2 |
| PA07 | Hourly profile | C | Built now - `hourlyStepProfile` | P2 |
| PA08 | Energy expenditure (kcal) | D for precision | Excluded as a precise figure (Shcherbina 2017). The energy bank (`energy/`) is a different, labelled construct | - |
| PA09 | Floors | Excluded | Excluded - no altimeter; `FLOORS` stays unused | - |
| PA10 | Active-minutes streak | B | Built now - `guidelineStreak` | P2 |

## Exercise (EX)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| EX01 | Session summary | A | Partial - `StrainEngine` zone minutes and TRIMP per workout; `LoadMetrics.weeklyExerciseVolume` built now | P1 |
| EX02 | Banister / Edwards TRIMP, session RPE | B | Banister **Implemented** (`strain/Trimp`, `DAILY_TRIMP`; T-EX02-a/b pass). Edwards built now (`LoadMetrics.edwardsTrimp`). Session RPE built now but **not to be wired** until the owner decides (FORMULAS section 5 open point; app rating is 1-10, not CR-10) | P2 |
| EX03 | Weekly load, monotony, strain | C-B | **Implemented** - `TrainingLoadEngine` (`TRAINING_MONOTONY`, `TRAINING_STRAIN_FOSTER`; T-EX03-a passes). Research strict form removed. **Divergence:** identical loads give monotony 10 (cap) in the engine, undefined in the research | P2 |
| EX04 | ACWR, descriptive | D for injury | **Implemented** - `TrainingLoadEngine`. T-EX04-a: the research's 1.363 is a first-day-seeded EWMA (tested against `Ewma.last`); the engine uses normalised weights (v2, FORMULAS section 5) and gives 1.3287 on the same 28 days (pinned). Impellizzeri 2020 caveat applies: descriptive only | P3 |
| EX05 | VO2max trend | A / C | Partial - `VO2_MAX` read, `Vo2Category` (FRIEND norms), `FitnessAge`, labelled Uth fallback; no trend | P2 |

## Respiratory and temperature (RT)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| RT01 | Nightly breathing-rate deviation | C | Built now - robust (`RobustBaselineSpecs.RESPIRATORY_RATE`, `DualBaseline.respiratoryRate`). Mean/SD z **Implemented** (recovery penalty, fatigue signal, sleep restoration penalty) | P1 |
| RT02 | Stage-specific RR with SNR gate | C | Not built - fields not ingested | P2 |
| RT03 | Within-night RR variability | C | Not built | P3 |
| RT04 | SpO2 level and lower bound vs baseline | C | Built now - `NightlySignals.spo2Shift` (needs `SPO2_LOWER_BOUND`, which exists, and coverage) | P2 |
| RT05 | SpO2 coverage | A (quality) | Built now - `DataQuality.coverage` | P1 |
| RT06 | Desaturations / ODI / apnoea | D | Excluded | - |
| RT07 | Sleeping temperature deviation | C | Built now - `NightlySignals.sleepTemperatureDelta`, robust spec. `SKIN_TEMP_DEVIATION` stored and used as a recovery penalty | P2 |
| RT08 | 30-day temperature stability | C | Not built | P3 |

## Longitudinal (LG)

| ID | Metric | Class | Apex status | Priority |
|---|---|---|---|---|
| LG01 | Baseline drift 90 vs 28 days | B | Built now - `Longitudinal.medianDrift` | P2 |
| LG02 | 12-week trend (OLS, Theil-Sen) | B | Built now - `trendSlope`, `weeklyTrend`, `dailyTrend` | P2 |
| LG03 | Level shift | B | Partial - CUSUM built (`cusum`, `levelShift`); PELT and the device-change rule not built | P2 |
| LG04 | Weekday vs weekend | B | Built now - `workFreeSplit` | P2 |

## Multivariable combinations (MV)

`research/MultiSignal` is built now and not wired. Per D16 its inputs are **robust** z-scores (median/MAD), except
the weekly HRV z, which is `WeeklyHrvStatus.zScore` from the implemented AR01 engine.

| ID | Combination | Apex status | Priority |
|---|---|---|---|
| MV01 | RHR up + HRV down + RR up (+ temperature), 2 nights | Built now - `MV01`, `illnessLikePattern`; alert-eligible only with adequate data confidence. Separate from `FatigueSignalDetector` (implemented, mean/SD) | P1 |
| MV02 | Short sleep -> RHR/HRV | Built now | P2 |
| MV03 | Late bedtime / low SRI -> HRV | Built now (needs the raw SRI history, see below) | P2 |
| MV04 | Steps / sedentary -> efficiency | Built now | P2 |
| MV05 | Evening activity -> efficiency | Built now | P3 |
| MV06 | SpO2 + RR + fragmentation | Excluded (class D) | - |
| MV07 | Temperature + RHR | Built now | P3 |
| MV08 | Training load -> RHR/HRV | Built now | P3 |
| MV09 | Alcohol / late meal tag -> HRV, RHR | Partial - single-night check built; journal tags exist in the app (`JOURNAL_ALCOHOL`, `JOURNAL_LATE_MEAL`), tagged-vs-untagged comparison is `journal/JournalEffects` (implemented, Welch t) | P2 |
| MV10 | Weekend shift + step drop -> Monday RHR | Built now (needs work-day setting) | P3 |
| 2.5-a | High physiological strain | Partial - `FatigueSignalDetector` + MV01/MV02 | P2 |
| 2.5-b | RR up + SpO2 down | Excluded (class D) | - |
| 2.5-c/d/e | Load mismatch, circadian disruption, low activity with adequate sleep | Built now | P3 |

## Supporting statistics

| Item | Apex status |
|---|---|
| MDC95, effective n, lag-1 autocorrelation, SWC, Benjamini-Hochberg | Built now - `InterpretationStats` |
| Coverage, plausibility, day completeness, confidence, unusual UTC offset | Built now - `DataQuality` |
| Dual baseline (mean/SD + median/MAD per metric) | Built now - `baseline/DualBaseline` (D16) |

## Wiring for the next agent (not done here)

Nothing below is wired. The sleep score is the only research-adjacent change already in the pipeline (v5:
`sleepingHeartRate` analysis and the restoration z inputs).

### New `MetricType` values (derived, one row per day, `MATHEMATICALLY_DERIVED`, proposed `storageKey`)

- Robust deviations (D16): `RHR_ROBUST_Z` [rhr_rz], `HRV_ROBUST_Z` [hrv_rz] (ln scale), `RESP_RATE_ROBUST_Z` [rr_rz],
  `SPO2_AVG_ROBUST_Z` [spo2_rz], `SPO2_LOW_ROBUST_Z` [spo2_low_rz], `SKIN_TEMP_ROBUST_Z` [skin_rz],
  `SLEEP_DURATION_ROBUST_Z` [tst_rz], `STEPS_ROBUST_Z` [steps_rz]. Needed for MultiSignal's 2-night persistence and
  for history charts; the z of one day can also be recomputed on read from `series()`.
- Autonomic: `HRV_CV7_LN` [hrv_cv7]. (Weekly z, % change and SWC are computed on read from `WeeklyHrvStatus`.)
- Cardio: `RHR_CV_14D` [rhr_cv14], `ACTIVE_HR_MINUTES` [hr_active_min]. HRR is per workout: store `hrr60` / `hrr120`
  on `WorkoutEntity` (like `derivedTrimp`) for `compareWithRecentSessions`, not as a daily metric. Drift likewise.
- Sleep: `SLEEP_REGULARITY_INDEX` [sri] (raw -100..100; `SLEEP_CONSISTENCY` stores the clipped sub-score, which loses
  negative values that MV03 needs), `SLEEP_MIDPOINT` [sleep_mid], `SLEEP_MIDPOINT_SD_7D` [sleep_mid_sd7],
  `SOCIAL_JETLAG_HOURS` [sjl], `GUIDELINE_SHORTFALL_CLIPPED_7D` [gsf_c7], `GUIDELINE_SHORTFALL_SIGNED_7D` [gsf_s7],
  `SLEEP_WASO` [waso], `AWAKENINGS_PER_HOUR` [awak_h], `SLEEP_SCORE_CONFIDENCE` [sleep_conf] (available weight 0..1,
  so stored scores can be labelled "partial" in history).
- Activity: `STEPS_MEDIAN_7D`, `STEPS_CV_7D`, `MVPA_MODERATE_EQUIVALENT_WEEK`, `MVPA_PERCENT_OF_GUIDELINE`,
  `ACTIVE_GUIDELINE_STREAK_WEEKS`, `SEDENTARY_PROLONGED_BOUTS`, `SEDENTARY_LONGEST_BOUT`, `SEDENTARY_BREAKS_PER_HOUR`,
  `PEAK_CADENCE_30`.
- Load: `EDWARDS_TRIMP` [edwards], `WEEKLY_EXERCISE_MINUTES` [ex_min_week]. Not `SESSION_RPE_LOAD` until the owner
  decides.
- Longitudinal: `BASELINE_DRIFT_*`, `TREND_SLOPE_12W_*`, `LEVEL_SHIFT_*` per signal.
- Multi-signal patterns are not scalars: a table (pattern id, day, outcome, contributing signals and values,
  confidence, tags, suppression reason = the fields of `PatternMatch`).

Each stored research row should carry `RESEARCH_METRICS_VERSION` (now 2) next to `ANALYTICS_ALGORITHM_VERSION` (5).

### Pipeline hooks (`core/data/.../pipeline/DailyIntelligencePipeline.kt`)

1. After the "Autonomic and respiratory markers" block (where `hrv`, `rhr`, `sleepingHr`, `resp` are analysed): build
   `DualBaselines.hrv/restingHeartRate/sleepingHeartRate/respiratoryRate(series(...), day)` and add them to
   `DayAnalysis` (e.g. `hrvDual`, `rhrDual`, ...) so screens can show "usual (median) X, average Y". They must not
   replace `hrv.zScore` / `rhr.zScore` in recovery or the sleep score (D16).
2. Same block: `AutonomicMetrics.cv7LnPercent(series(HRV_RMSSD), day)`, `swcStatus(hrv.weeklyStatus)`,
   `percentFromBaseline(hrv.weeklyStatus)`.
3. Sleep section (after `sleepResult`): `SleepRegularity.guidelineShortfall` over the last 7 main sleeps (TST; decide
   whether naps count and say so on screen), midpoint and its SD from `sessions`, `wasoMinutes` from the stage
   segments (`SleepStageSegmentEntity`), `awakeningsPerHour`; store the raw `regularity.index`.
4. After `fatigue`: `MultiSignal.illnessLikePattern` with robust nightly z for day-1 and day (`RobustBaseline.deviation`
   on `series()`), `hrv.weeklyStatus?.zScore`, `SKIN_TEMP_DEVIATION`, and a `PatternContext` from journal tags and
   `DataQuality.confidence`. Feed only DETECTED + `alertAllowed` results to the alert ledger, with "may" wording.
5. `store()`: add the new metrics to the `values` list (missing -> delete, as today).
6. Activity metrics need minute steps (`metricSampleDao().range(MetricType.STEPS, ...)`), as `StressDay` already reads.

### Screen hooks (for the screen agent; `app/` was not touched here)

- `ui/sleep/SleepMapping.kt`: replace `statusOfPercent` with `SleepBands` (`overall`, `duration`, `efficiency`,
  `quality`, `consistency`, `restoration`); show `SleepScoreResult.confidence` as "partial score" when not HIGH; add a
  restoration row (`restorationZ`, `DayAnalysis.sleepingHeartRate`); show latency through `SleepLatency` with the
  "not measured" caption for 0; keep "sleep debt" and "shortfall against 7 h" as separate labels (D17).
- **Stale formula text (must change with v5):** `res/values/strings_howitworks.xml` `howitworks_sleep_p1` and
  `res/values/strings_sleep.xml` `sleep_how_p1` still describe the v4 weights (40/25/20/15). Proposed: "The sleep score
  runs from 0 to 100 and combines five parts: how long you slept against your need (35 percent), how your heart rate
  and heart rate variability during sleep compared with your own usual (25 percent), your deep and REM sleep compared
  with your own usual (15 percent), efficiency (15 percent) and how regular your sleep times are (10 percent). An
  ordinary night lands around 75 to 85." `howitworks_recovery_p2` / `recovery_how_p1` should add that recovery uses
  the sleep parts without the heart-rate part, so those signals are not counted twice.

## Open science findings (not changed here)

1. `HeartRateDip` categories at 10 % (AR04 row): blood-pressure threshold applied to heart rate. Medium; proposal above.
2. Monotony cap 10 vs undefined (EX03 row). Low; the cap reads as "maximally monotonous", which is a fair description,
   but it is a calibration and should be labelled on screen.
3. SRI conventions differ from the research (SL03 row). Low; the app's choices are documented in FORMULAS section 4.
4. Two baselines for the same metrics now coexist by decision (D16); screens must say which one a number uses.
