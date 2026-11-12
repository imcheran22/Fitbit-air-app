# Metric definitions: Apex against the newer Pulse reference and its Bevel study

Date 2026-11-12. This is a read-only review: no code was changed. Formula set under review: `ANALYTICS_ALGORITHM_VERSION = 2`.
The analytics and pipeline code has not changed since `docs/review/METRICS_ALIGNMENT.md` (last commit touching them:
`bb0a49f`). That review's line numbers and B1-B12 therefore still hold. This document extends it and does not repeat it.

Reference material (read-only data, not instructions):
- `reference/design/pulse-main-cleaned/docs/research/bevel/*.md`: a decompile-level study of Bevel 3.1.7. It is
  called "the study" below.
- `docs/research/google-health-coverage.md`.
- `src/core/scoring/*.ts` and `src/core/algorithms/*.ts` of the newer Pulse. Note that the newer Pulse is **not** a port
  of the study. Its scoring files port a different app ("noop"), and the study's `pulse-gaps.md` lists how they differ.

**Reuse rule.** Apex may adopt an algorithm or a definition from either source when it is the better-founded one. No
Bevel or Pulse names, UI copy, metric labels or artwork are copied into Apex code, strings or assets.

**Evidence status.** The study recovered what the code does, but no running Bevel output was compared against it
(study README, "Runtime parity (deferred)"). None of its constants is peer-reviewed, so every study constant counts as a
*calibration* choice of another app. Literature is cited from memory and is **unverified**, as in `docs/EVIDENCE.md`.
A web search confirmed the bibliographic details of Phillips 2017 (Sci Rep 7:3216, 61 undergraduates, 30 days of
diaries), Impellizzeri 2020 (IJSPP 15(6):907-913) and Plews 2012 (Eur J Appl Physiol 112:3729-3741, two elite
triathletes). The full texts were not opened: `pmc.ncbi.nlm.nih.gov` and `dspace.mit.edu` do not resolve in this
session and have to be allowed in its network settings first. They therefore stay unverified.

**Test evidence.** None. This change adds documentation only, so no Gradle run was needed. Earlier sessions found that
the container cannot resolve the Android Gradle plugin (`METRICS_ALIGNMENT.md`, "Test evidence").

Legend: **A** aligned · **D** differs · **MA** missing in Apex · **MS** missing in the study. Sizes: S < half a day,
M 1-2 days, L more.

---

## 1. Tables by metric family

### 1.1 Recovery

| Item | Study (doc § ) | Pulse | Apex | Status | Better-founded for a Fitbit Air owner | Action |
|---|---|---|---|---|---|---|
| Composite | `0.4·H + 0.3·R + 0.3·S`, then breathing, SpO2 and temperature are added as **adjustments**, clamped to 1..100 (recovery-stress-energy.md §Recovery "Kernel") | Weighted z-sum through a logistic: HRV .55, RHR .2, sleep .15, breathing .05, skin temperature .05, plus two .05 extras (`scoring/recovery.ts:8-25`) | Weighted mean of sub-scores, renormalised over the inputs present (`RecoveryEngine.kt:16-28, 154-185`) | D | Study structure. Apex's renormalisation turns a missing benign sensor into a score change (B1). The study adds penalties only, which avoids that | **Align** (S): additive one-sided adjustments (Do-next 1) |
| HRV / RHR sub-scores | Linear: `(min(z,1)·0.5+0.5)·100`, 0 below z = −1; SD 0 gives 50 | Logistic of z | Logistic `100/(1+e^(∓1.2z))` on ln RMSSD, z clamped ±3 (`RecoveryEngine.kt:217-224`) | D | Apex. The study saturates at ±1 SD, and an SD of 0 is possible after one night | Keep |
| Breathing rate | Symmetric `(B−50)·0.2`, ±10 | z term | Penalty only, above +1 SD (`:227-229`) | D | Apex (one-sided). A low breathing rate is not a recovery signal | Keep the rule, make it additive |
| SpO2 | One-sided penalty when the night is below baseline mean − SD, `−min(30, 30·atan(deficit/5))` | none | Baseline only, not scored (`DailyIntelligencePipeline.kt:183`) | MA | Neither is validated. On a wrist band a nightly SpO2 drop also has altitude and sensor causes | Defer. If added, keep it one-sided and labelled *calibration* |
| Skin temperature | Raised temperature only, at most −30 (`tempAdj`) | Two-sided z | Two-sided: −40/SD raised, −20/SD lowered (`:232-236`) | D | Study. A raised temperature is the illness-relevant direction (unverified); the lowered-temperature penalty has no stated basis | Align to raised-only (S, low priority, *calibration*) |
| Gate | HRV **and** RHR, both baselines, **and** a sleep score are required. Breathing, SpO2 and temperature never gate (§"Gate and output") | 7 accepted nights | HRV **or** RHR with an established baseline (7 of 30 days) | D | Apex: stricter on baselines, and still useful without a sleep score | Keep |
| Bands | 67 / 34 | 67 / 34 | 67 / 34 (`:134-135`) | A | n/a (*calibration*) | Keep |

### 1.2 HRV and RHR handling

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Night's HRV value | Local mean of HRV **samples tagged with a sleep stage** inside the primary sleep. For Google data the value is passed through, so RMSSD and SDNN cannot be told apart (ingestion.md §"HRV methods", §G10) | Google daily value | Google daily RMSSD (`GoogleHealthMapper.kt:160-167`). Fallback: mean of **all** samples in the session window, awake time included (`DailyIntelligencePipeline.kt:349-353`, B9) | D | The vendor nightly RMSSD as the main series. The study's stage filter is the right rule for a derived value | **Align** the derived value to asleep-stage samples, stored as its own series (Do-next 7) |
| HRV scale | Raw ms | Raw ms | ln RMSSD (`Baseline.kt:55`) | D | Apex (Plews 2012/2013, unverified) | Keep |
| Night's RHR value | **Not** the vendor daily RHR. It is the mean of HR minutes tagged with a sleep stage in the primary sleep (ingestion.md §"HR and RHR streams") | Lowest gated 5-minute bin mean during sleep (`scoring/restingHr.ts`) | Vendor daily RHR, switching to SLEEPING_HEART_RATE (session window, awake time included) when RHR has fewer rows (`:176-180`, B10) | D | Either is defensible. Switching series between days is not | **Fix** B10: one series per window (Do-next 5). Make derived sleeping HR asleep-stage only (with Do-next 7) |
| Vendor non-REM HR | n/a | not stored | `nonRemHeartRateBeatsPerMinute` is parsed (`GoogleHealthDtos.kt:87`) but not stored | MA | A Fitbit-computed sleeping HR, observed rather than derived | Add as an observed series (S, Do-next 12) |
| RHR baseline spread | Pooled within-night minute SD (Chan merge), which compresses z toward 0 (shared-machinery.md §G05 step 5) | EWMA spread | SD of day means, 2 % floor | D | Apex (day-to-day variation is the signal; Buchheit 2014, unverified) | Keep |

### 1.3 Sleep: score, need, bank, consistency

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Score structure | Six power-curve components: asleep/need ^3 .35, deep/need ^2 .20, REM/need ^2 .20, HR dip ^3 .10, efficiency/0.97 ^15 .075, continuity ^10 .075. Targets depend on age and sex; a missing component is dropped and the rest renormalised (sleep.md §"Kernel") | Duration .5, efficiency .2, restorative .2, consistency .1 (`scoring/sleep.ts:67-79`) | Duration .40, restorative .25, efficiency .20, consistency .15, renormalised (`SleepScoreEngine.kt:25-30, 115-185`) | D | No version is validated; all are *calibration* | Keep |
| Efficiency | `1 − awake/total` after trimming the leading and trailing awake time | asleep / in bed | asleep / in bed, 65→92 % (`:137-141, 200-206`) | D | Apex: asleep / time in bed is the conventional polysomnography definition | Keep |
| Continuity | Every interior awake segment counts, however short (table, n ≥ 6) | n/a | Bouts of 3 minutes or more beyond two, −3 points each, at most −25 (`HealthIngestor.kt:249-256`) | D | Apex. Wrist hypnograms are full of very short awakenings; counting each one penalises noise | Keep |
| HR dip | `1 − sleepingHR / awake-inactive-HR baseline`, sleep-tagged minutes (sleep.md §"HR dip producer") | none | none | MA | Plausible marker (unverified). An Air provides both inputs | Add as a **display-only** value first (Do-next 12) |
| Sleep need | Goal (7.5 h default, onboarding by age) × (1 + 0.02·z of yesterday's strain against ≤ 30 prior days, only if above 1) + 25 % of the negative previous bank. Tonight's plan adds efficiency (≤ 1 h) and mean latency (≤ 60 min) (sleep.md §"Sleep Needed") | P75 floored at 8 h, at most 9.5 h; planner 0.05 h per strain point, 20 % of debt (`scoring/sleep.ts:84-99`, `algorithms/sleepPlanner.ts:5-15`) | 7 h 45 min, or P75 of 30 nights once 14 exist, kept to 7-9 h; +3 min per strain point above 10; +50 % of debt, at most 90 min; total ≤ 10 h (`SleepNeed.kt:53-116`) | D | Base: Apex (bounded by Hirshkowitz 2015, unverified). Strain term: the study's personal z is scale-free, while Apex's fixed "above 10" depends on its own strain calibration | Align the strain surcharge to a personal z (S, with Do-next 11). Add latency to tonight's plan (S) |
| Automatic goal | Mean asleep time on the top 15 % of recovery days among the last 90 eligible days, recomputed with sleep forced to 100; needs ≥ 15 days with recovery ≥ 67 | none | none | MS | Circular (recovery depends on sleep) and unvalidated | Do not adopt |
| Bank / debt | Signed sum over 7 days, weighted `e^(0.3(j−6))` from the oldest day, **naps included**, a missing night skipped but its slot kept (sleep.md §"Sleep Bank") | 14-night ledger with 0.55 carry | Unweighted 7 nights, need − asleep, surplus credit ≤ 60 min, never negative, main sleep only; **0 when no night exists** (`SleepNeed.kt:89-96`, B8) | D | The study on naps (total sleep in 24 h). Apex on credit limits. Recency weighting is unvalidated | **Fix** B8; include naps (Do-next 8). Weighting optional |
| Consistency | Agreement in 1,440 one-minute bins across **all pairs** of up to 7 days with a main sleep; plain agreement %, naps ignored, ≥ 2 days (sleep.md §"Sleep Consistency") | Phillips SRI: consecutive-day pairs, noon-to-noon days, coverage mask, naps count (`algorithms/sleepRegularity.ts`) | Circular SD of bed and wake times over 7 nights, ≥ 3 nights, 45/150 min (`SleepScoreEngine.kt:143-153, 208-212`) | D | Pulse's form. The SRI has published outcome associations (Phillips 2017, unverified). The study's all-pairs variant is not the published index | **Align** to the SRI with a coverage mask (M, Do-next 10) |

### 1.4 Strain

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Daily strain | `16·atan(steps/7000) + 66·atan(U/20000)`, open-ended (max ≈ 128.8). U = zone-weighted seconds: exercise minutes at any HR, awake minutes only from zone 1 up, sleep minutes excluded (strain-load.md §"Daily Strain") | Edwards or Banister TRIMP mapped to 0-100, shown on 0-21 (`scoring/strain.ts:7-45, 159-202`) | Banister TRIMP for every minute of the day, 30 % HRR floor, `21·ln(1+T/20)/ln(31)` (`StrainEngine.kt:42, 93-97`, `Trimp.kt:23-66`) | D | Apex's load unit (Banister/Morton TRIMP, unverified) is a published method. The study's zone weights and steps term are calibration, and steps double-count work already in HR | Keep. Fix B2 and B5 |
| Max HR | Settings value, default 195; onboarding `220 − age` | 99.5th percentile of ≥ 600 samples, never below Tanaka (`scoring/strain.ts:62-91`) | Tanaka, or the single highest minute in 180 days (`MaxHeartRate.kt:17-50`, B5) | D | Pulse (robust percentile plus Tanaka) | **Fix** B5 (Do-next 6) |

### 1.5 Load and target

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Daily load | Sum of **per-workout** Banister TRIMP (a = 0.64 for every sex, b 1.92/1.67/1.795); the HR rest anchor is the 60-day RHR baseline (strain-load.md §"Per-workout TRIMP", §"TRIMP baselines") | EWMA of daily Effort | All-day TRIMP; the anchor is today's RHR first (`DailyIntelligencePipeline.kt:225`, B10) | D | Anchor: the study's baseline. Coefficients: Apex's sex-specific a (Banister 1991, unverified) | **Align** the anchor (Do-next 5) |
| ATL / CTL | α 0.25 and 2/43, zero seed, **a missing day counts as 0** | Time constants 7 / 42, primed from the first 7 days, contiguous days only (`scoring/trainingLoad.ts:13-19`) | Normalised EWMA spans 7 / 28, missing days skipped (`TrainingLoadEngine.kt:84-85, 123-124`, `Ewma.kt:79-97`) | D | ATL: aligned (α = 0.25). CTL span 28 (Williams 2017) and 42 (Banister fitness constant) are both conventions. For all-day TRIMP, skipping a missing day is right: no wear is not rest | Keep; document the 28 vs 42 choice |
| Status / gate | Calibrating while `min(trainingDensity, recency) < 0.35`; ratio > 1.4 or > 1.0 together with recovery; CTL trend ±5 %; optimal band 0.8-1.3 × CTL (strain-load.md §"Rolling support arrays and status") | n/a | Coupled ratio after 14 calendar days (B4); uncoupled ratio after 28 days with 5/7 and 14/21 recorded; bands 0.8/1.3/1.5 with the Impellizzeri caveat | D | The study's density and recency gate (adapted to skipped days) | **Align** (Do-next 3) |
| Target strain | 14-day fold `B = 0.75B + 0.25v` (missing counts as 0), scaled by `1 + 0.6(R−50)/100`, bounds `[c−5−5r, c+10+20r]` (strain-load.md §"Target Strain") | 28-day mean × band multipliers, adjusted by the workload ratio (`algorithms/strainTarget.ts`) | `6 + 12R/100 ± 1` (`StrainTarget.kt:35-47`) | D | The study's personal base, skipping missing days instead of filling them with 0 | **Align** (M, Do-next 11) |
| HR recovery after exercise | Largest drop within any 120 s window whose first point is at or before the active end; only when zone 4 was reached; raw samples (strain-load.md §"Heart Rate Recovery") | Drop at +1/+2/+5 min, medians, after ≥ 120 s at ≥ 70 % HRmax (`scoring/hrRecovery.ts`) | none | MA | Pulse's fixed +60 s form is the construct studied clinically (Cole 1999, unverified). Apex stores HR as 1-minute buckets (`IntradayHeartRateEntity`), which is too coarse for HRR60 | Defer (L): needs post-workout raw samples first |

### 1.6 Stress and energy

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Stress | 6-minute slots; HR percentile on a 30-day awake HR distribution, through a lookup curve; blended 0.6/0.4 with an HRV z from a sample less than 36 minutes old (recovery-stress-energy.md §Stress) | HR-only minute z against a daytime baseline, logistic 0-3; minutes near steps excluded (`algorithms/stress.ts`, `scoring/stressBase.ts`) | none | MA | Neither is validated. The Air's HRV samples appear to be sleep-only (unverified), so daytime stress would be HR-only and confounded by movement | Do not add as a score. Revisit only with motion gating and an outside validation |
| Energy bank | Charge/drain state machine on raw stress; starts at 0, no reset at midnight | Own per-minute model starting from recovery | none | MA | Unvalidated constants | Do not adopt |

### 1.7 Baselines and windows

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Window | 60 calendar days before D (D excluded); the oldest day is its own baseline (shared-machinery.md §G05 step 4) | Winsorized EWMA, half-life 14 (centre) and 21 (spread) (`scoring/baselines.ts:5-36`) | 30 days before D (`Baseline.kt:29, 109-116`) | D | Both are conventions. 30 days adapts faster to training blocks | Keep 30; record the choice in `EVIDENCE.md` |
| Minimum | none: one prior day is a baseline; a 60-day span plus 5 days is only a badge (§G07) | 4 nights seed, 14 trust | 7 valid days; below that, CALIBRATING and no number (`Baseline.kt:31, 118-129`) | D | Apex (missing stays missing) | Keep |
| Statistics | Population SD; pooled within-day samples for "combined" metrics; no floor, no outlier rule, NaN propagates | Winsorized at 3 SD, hard reject at 5 SD | Sample SD, floors, z clamped ±3, non-finite rejected | D | Apex | Keep |

### 1.8 Biological age and other calculators

| Item | Study | Pulse | Apex | Status | Better-founded | Action |
|---|---|---|---|---|---|---|
| Biological age | 9 hazard kernels on 28-day windows, `Δ = 10·ln(HR)` years. A missing factor adds 0, which silently means "at the population reference" (biological-age-muscular.md §"Physiological factors") | Piecewise log-hazard curves, overlap shrink 0.75, ≥ 5 terms (`algorithms/healthspan.ts`) | none | MA | Neither: both rest on population norms and implicit imputation | **Do not adopt** |
| Vital status band | ±1 population SD of the **viewed trend window, the current point included** (other-calculators.md §"Vitals") | Winsorized EWMA ± 2σ (`algorithms/healthMonitor.ts`) | ±1 SD of the 30-day baseline that excludes D | D | Apex (causal, no self-comparison) | Keep |
| Trend direction | ±5 % between the last point and the point N days earlier, N = 3/7/14/30/90 | n/a | Least-squares slope over 7 days, 0.75 SD (`MetricIntelligence.kt:96-181`) | D | Apex (less sensitive to one noisy end point) | Keep |
| Journal effects | Binary factor from the day before; least-squares slope plus pooled t-test, ≥ 5 per arm, 90 days, one-sided t at the 0.85 quantile (other-calculators.md §"Journal insights") | `algorithms/journalImpact.ts` | none | MA | The idea is sound. The 0.85 quantile (two-sided α = 0.30) flags many chance effects | Add later (M) with α ≤ 0.05 and the effect shown with its interval |
| EPOC / cardio focus | Has a sign bug: EPOC grows below resting HR | n/a | none | MA | n/a | Do not adopt |
| Muscular load, nutrition, TDEE | Need per-set or food data | partial | none | MA | The Air does not produce these inputs | Out of scope |

---

## 2. Shared machinery: Apex compared exactly

| Rule | Study (shared-machinery.md / ingestion.md) | Apex | Verdict |
|---|---|---|---|
| Day of a night | `startOfDay(session.endTime)` in the device calendar at compute time; a night belongs to the day it ends (§G04 "Functional day") | `epochDay` = local date of `endEpochMillis` at the session's **own recorded end offset** (`HealthIngestor.kt:258-259`); the pipeline takes the main sleep with `epochDay == day` (`DailyIntelligencePipeline.kt:163-164`) | **Aligned**. Apex is more travel-robust for sleep. However, HR day windows use the **current** zone (`:155-157`), so after travel a day's sleep and its HR can be cut from different clocks (Takeout open point 2) |
| Main versus nap | Among the sessions ending that day, a staged session first, then the longest `end − start`; the rest are naps (ingestion.md §"Cross-source session choice") | Source flag plus a minimum duration (`SleepClassification`); the longest `minutesAsleep` keeps the main flag (`HealthIngestor.kt:261, 303-318`) | Small difference. Apex ranks by time asleep, the study by stages, then length. Both acceptable |
| Overlapping sessions | Union of sources, then per overlap cluster the first source in the priority list | `sameEvent` overlap > 50 %, `SourceReconciler` ranking; staged beats unstaged (`HealthIngestor.kt:284-306`) | Aligned in intent; Apex never double-counts |
| Baseline window | 60 days before D, D excluded; HRV / temperature / SpO2 as population SD of daily means; RHR / breathing / inactive HR as a pooled sample SD | 30 days before D, D excluded, sample SD of daily values, floors | Differs (see §1.7). Keep Apex |
| Calibration minimum | No minimum for the number. Badge until a 60-day span (recovery) or 30-day span (stress) **and** ≥ 5 data days (§G07) | 7 valid of 30 days before any baseline-dependent number exists; consistency ≥ 3 nights; personal sleep base 14 nights; uncoupled ratio 28 days with 5/7 and 14/21 recorded; coupled ratio 14 calendar days only (B4) | Apex is stricter everywhere except the coupled ratio (B4) |
| Load gate | `min(min(1, activeDays42/28), recency) ≥ 0.35`, active day = load > 5 | Caveats (`SHORT_HISTORY`, `SPARSE_DATA`) but no density/recency rule; partial days enter as real loads (B2, B3) | Adopt a gate (Do-next 3) |
| Missing day in load | Load 0 (decays) | Skipped (carried forward) | Apex is right for all-day TRIMP (no wear ≠ rest) once B2 marks partial days missing |
| Source merge | Fetch union; per-consumer arbitration (steps: one winning source; sleep: priority list; HR: drop disabled sources); Google HRV/RHR passed through | Per-metric `SourceReconciler`, derived never beats observed; Health Connect steps one app per day; **GH heart-rate sent with no `dataSourceFamily`, so phone and other-device HR mixes into the band's minutes** (`GoogleHealthApiSource.kt:272-278`; E2E broken link 6) | Apex is stricter except heart rate (Do-next 4) |
| Replay | A settings change replays the whole window; aggregate and cumulative caches are versioned | Forward replay; `algorithmVersion` on every derived row | Aligned |

---

## 3. Google Health coverage (against `google-health-coverage.md`)

Apex reads 19 types through 18 streams (`GoogleHealthApiSource.kt:104-123`). Of the 42 listed types:

**Defined in `GoogleHealthDataTypes.kt:43-70` but never fetched:**

| Type | Matters for metrics? | Air produces it (unverified) | Recommendation |
|---|---|---|---|
| `heart-rate-variability` (RMSSD samples, LF/HF) | Yes: an asleep-stage HRV value (B9) and LF/HF | Yes, sleep-time samples | **Add** a SAMPLE stream through the existing `mapper.samples` (`GoogleHealthMapper.kt:217-240`) with `google-wearables` (Do-next 7) |
| `oxygen-saturation` (samples) | Low (the daily value suffices) | Yes, at night | Skip |
| `respiratory-rate-sleep-summary` | Low | Yes | Skip |
| `vo2-max`, `run-vo2-max` | No (no GPS for run-vo2-max) | No / maybe | Skip |
| `daily-heart-rate-zones`, `time-in-heart-rate-zone` | Display parity with the Fitbit app only; Apex computes its own zones | Yes | Optional, display-only |
| `core-body-temperature`, `altitude` | No | No | Remove from the enum or leave unused |

**Fetched, but a field is lost or labelled wrongly:**
- `heart-rate`: no `dataSourceFamily=google-wearables`, so all sources are averaged into the band's minutes. This
  affects strain, TRIMP, HRmax and sleeping HR (Do-next 4).
- `daily-vo2-max`: `estimated` and `cardioFitnessLevel` are parsed (`GoogleHealthDtos.kt:184-185`) but dropped, and a
  modelled value is stored as MEASURED (`GoogleHealthMapper.kt:197-203`; E2E broken link 12). This is a provenance
  breach (Do-next 8).
- `daily-heart-rate-variability`: `nonRemHeartRateBeatsPerMinute` and `entropy` are parsed (`GoogleHealthDtos.kt:87-88`)
  but not stored. Non-REM HR is the observed sleeping-HR input that the study builds itself (Do-next 12).
- `daily-resting-heart-rate`: `calculationMethod` is ignored, although B10 needs to know when the method changes.

**Not defined in Apex and not needed for a single Air owner's metrics:** `activity-level`, `height`,
`swim-lengths-data`, `electrocardiogram` (the Air has no electrodes, unverified), `irregular-rhythm-notification`
(optional display; adds a scope), `blood-glucose`, `hydration-log`, `nutrition-log`, `food*`, and the write-only
cycle, symptom and mood types. `total-calories` is derived as active + basal.

---

## 4. Do next (ranked; merges METRICS_ALIGNMENT B1-B12)

Each item: write the failing test first. Any formula change bumps `ANALYTICS_ALGORITHM_VERSION` and updates
`FORMULAS.md` and `EVIDENCE.md`.

1. **Recovery: additive penalties (B1) and drop an unreliable workload ratio (B6). S, version 3.**
   - Change: renormalise only HRV, RHR, sleep and the fatigue rating. For each penalty-only input that is present,
     subtract `w·(100 − S)`. In the pipeline, pass the uncoupled ratio only when its caveats are empty.
   - Golden test: HRV z 0.4, RHR z 0, sleep 80 gives **63.57**, both with breathing and temperature at z 0 and with
     them absent. Breathing at z 2 gives **61.57**.
   - Property test: adding a penalty-only input at its neutral value never changes the score.
2. **Partial and provisional days stay out of load (B2, B3, B11). S, version 3.**
   - Change: a finished day with `recordedMinutes < 600` (*calibration*) adds `DailyLoad(day, null)` and stores no
     `DAILY_TRIMP`. Today adds `DailyLoad(today, null)`. Remaining capacity needs `strain != null`.
   - Test: 40 minutes of HR on a finished day gives no `DAILY_TRIMP` row and unchanged ATL. 28 steady days at 100
     plus 5 TRIMP today gives an uncoupled ratio of **1.000**.
3. **Load gating (B4, B12, the study's confidence gate). S for B4 and B12, M for the gate.**
   - Change: the coupled ratio needs ≥ 14 recorded days in the last 28. Duplicate days: the first one wins.
   - Then add `confidence = min(min(1, active42/28), recency)` over recorded days, with "calibrating" below 0.35
     (*calibration*, taken from the study).
   - Tests: `[day 0: 10, day 13: 200]` gives a null coupled ratio. `[DailyLoad(5,100), DailyLoad(5,0)]` uses 100.
4. **Heart rate from the band only. S.**
   - Change: send `dataSourceFamily = GOOGLE_WEARABLES` for the `heart-rate` stream (and the HRV-sample stream).
   - Test: the request built for HEART_RATE carries `dataSourceFamily=users/me/dataSourceFamilies/google-wearables`,
     and the request for SLEEP carries none.
5. **One RHR series per window; TRIMP anchored to the RHR baseline (B10). S, version 3.**
   - Change: `restingForLoad = rhr.baseline.center ?: rhr.current`. Choose RESTING or SLEEPING HR once for the
     whole 30-day window, not per day.
   - Test: the same HR minutes with today's RHR raised by 8 bpm give an identical TRIMP.
6. **Robust observed HRmax (B5). S.**
   - Change: 99.5th percentile of ≥ 600 minutes in 180 days, never below Tanaka; Tanaka alone below 600.
   - Test: one 212-bpm minute among 180-bpm minutes at age 40 gives HRmax **180**, and strain stays **13.74** on the
     B5 vector.
7. **Asleep-stage HRV from samples (B9 and the missing HRV-sample stream). M.**
   - Change: add the GH `heart-rate-variability` stream. Derive the night's value only from samples inside non-awake
     stage segments, store it under its own `MetricType`, and never mix it into the HRV_RMSSD baseline.
   - Test: a night whose high-RMSSD sample lies in an awake segment excludes that sample, and the HRV_RMSSD
     baseline is unchanged.
8. **Honest missing states and provenance (B7, B8, VO2 `estimated`). S.**
   - Change: return NoData from `fatigueOf` when both z-scores are null. Make sleep debt nullable below 4 recorded
     nights and include naps in the bank. Store `daily-vo2-max` rows with `estimated == true` as ESTIMATED.
   - Tests: day 3 of use gives no "none" chip; no night recorded gives debt null; an estimated VO2 row gets ESTIMATED
     provenance.
9. **Weekly HRV status against a baseline that ends before the week. S, version 3.**
   - Change: 7-night ln mean against the 30 nights before the week, ≥ 21 baseline nights, ≥ 4 week nights, low below
     −1.5σ, σ ≥ 0.05.
   - Test: a sustained 17 % fall still fires on day 30 (probe G2 currently goes silent after about 12 days).
10. **Sleep consistency becomes the SRI with a coverage mask. M, version 3.**
    - Change: consecutive-day minute pairs, missing days skipped (not counted as awake), naps count. Map −100..100
      to the sub-score as *calibration*.
    - Tests: 7 identical nights give **100**. Alternating 22:00-06:00 and 02:00-10:00 nights give
      `200·(1 − 480/1440) − 100` = **33.3**. A missing day removes its pairs.
11. **Personal strain target and a personal strain term in sleep need. M, version 3.**
    - Change: target base = 14-day EWMA (α 0.25) of recorded strain, missing days skipped, scaled by
      `1 + 0.6(R − 50)/100`. Sleep-need surcharge = `goal · max(0, 0.02·z)`, where z is yesterday's strain against
      ≤ 30 prior recorded days.
    - Tests: a steady base of 10 at R = 50 gives a centre of **10.0**; at R = 100, **13.0**. Strain at z = 1 on a
      465-min base adds **9.3 min**.
12. **Observed sleeping HR and HR dip, display only. S.**
    - Change: store `nonRemHeartRateBeatsPerMinute` as an observed sleeping-HR series. Show
      `dip = 1 − sleepingHR / awake-resting-HR baseline`, and keep it out of every score until it has been reviewed.
    - Tests: the mapper writes the non-REM HR row with GOOGLE provenance. Sleeping HR 54 against a baseline of 72
      gives a dip of **25 %**. A missing baseline gives null.
