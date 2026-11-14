# Research metrics

Formulas, constants and evidence for the `com.apex.athlete.core.analytics.research` package
(`core/analytics/src/main/kotlin/com/apex/athlete/core/analytics/research/`). The source of the
metric catalogue is the Fitbit Air Deep Research report (Parts 1-3, 13 Nov 2026: card IDs CV, AR,
SL, PA, EX, RT, LG, BV, MV) and the merged research (section 2.5). Which of these are wired into
the pipeline is in `docs/RESEARCH_GAP_MATRIX.md`. Core scores and their formulas are in
`docs/FORMULAS.md`; nothing here changes them.

## Versioning and rules

- `RESEARCH_METRICS_VERSION = 1` (`InterpretationStats.kt`). The package is additive: it changes no
  existing score, so `ANALYTICS_ALGORITHM_VERSION` (2) is untouched. Bump
  `RESEARCH_METRICS_VERSION` on any change of a formula or default constant below, and update this
  file and a golden-vector test in `core/analytics/src/test/.../research/`.
- Version 1 includes three floating-point fixes found while writing the tests (identical decimal
  readings left a rounding residue that became a huge ratio): lag-1 autocorrelation, Foster
  monotony and the HRV z-score now treat a spread of that size as zero. Details at the end.
- Missing data stays missing. Every function returns `null` (or an `INSUFFICIENT_DATA` outcome)
  when its minimum count is not met. Nothing is imputed, filled with a population norm or read
  as zero.
- Evidence classes follow the research (P2-8): **A** strong, **B** established method with limited
  device/individual validation, **C** exploratory, **D** not built. "Calibration choice" means a
  number the research names as tunable or leaves open; it is not clinically validated.
- No metric here is a diagnosis, a score or a composite.

Golden vectors for every function are in the matching `*Test.kt`; the research's own test IDs
(T-CV01-a ... T-ST-f) are named in the test titles.

## Statistics (`InterpretationStats.kt`)

| Function | Formula | Constants | Evidence and source |
|---|---|---|---|
| `describe` | mean, median, sample SD (n-1), `CV = 100 SD / mean` | CV only for mean > 0 | Standard descriptive statistics. CV on a positive scale only (research 2.6). |
| `medianAbsoluteDeviation` | `median(|x - median(x)|)`, unscaled | | Rousseeuw & Croux 1993 (J Am Stat Assoc); Leys et al. 2013 (J Exp Soc Psychol). |
| `lag1Autocorrelation` | `sum (x_i - m)(x_{i+1} - m) / sum (x_i - m)^2` | constant series (spread under 1e-12 relative) gives null | Standard; research T-ST-d: 0.669 on the example series. |
| `effectiveSampleSize` | `n (1 - rho) / (1 + rho)`, rho clipped at 0 so it never exceeds n | needs -1 < rho < 1 | AR(1) effective sample size; research 6.3: n 28, rho 0.4 gives 12.0. Class B. |
| `minimalDetectableChange95` | `1.96 sqrt(2) SD_within` | 1.96 | Weir 2005 (J Strength Cond Res). `SD_within` is the within-person SD (the standard error of measurement). |
| `smallestWorthwhileChange` | `0.5 SD` | multiplier 0.5: convention, calibration choice | Hopkins 2000 (Sports Med); Buchheit 2014 (Front Physiol). |
| `benjaminiHochberg` | step-up: largest rank k with `p_(k) <= q k / m`; keep ranks 1..k | q = 0.10 default (calibration choice) | Benjamini & Hochberg 1995 (J R Stat Soc B). T-ST-e/f: indices [0,1,2,3,7] at q 0.10 and [0,1,2,7] at q 0.05. |

## Robust baseline (`RobustBaseline.kt`)

`delta = x - median(baseline)`, `z = delta / max(1.4826 MAD(baseline), floor)`.

- Baseline: the 28 calendar days before the evaluated day (the day itself is never in its own
  baseline), at least 14 valid readings. Gaps are dropped, never filled. Days tagged illness or
  travel can be excluded.
- 1.4826 scales MAD to an SD under normality (Rousseeuw & Croux 1993).
- Windows, minimum days and floors are all "tunable app defaults - not clinical" (research P2-5):
  calibration choices.
- Evidence class B-C: the statistic is standard (Leys 2013); its use for individual monitoring on
  a wrist device is not validated. The result is "different from your usual", never a diagnosis.
  It is not a probability.

| Spec (`RobustBaselineSpecs`) | Floor | Used for |
|---|---|---|
| `RESTING_HEART_RATE` | 1.0 bpm | CV01 |
| `RESPIRATORY_RATE` | 0.3 breaths/min | RT01 |
| `SPO2` | 0.5 percentage points | RT04 |
| `SLEEP_TEMPERATURE_DELTA` | 0.1 C | RT07 (applied to the provider's nightly minus baseline delta) |
| `SLEEP_DURATION` | 15 min | SL01 |
| `STEPS` | 500 steps | PA01 |

Other functions: `sameWeekdayDeviation` (baseline = the same weekday of the previous 8 weeks,
at least 4 of them; research method 10 "weekday-adjusted baseline", needs about 8 weeks;
the 4-week minimum is a calibration choice) and `consecutiveDaysBeyond` (persistence: days in a
row at or beyond a z threshold, each day against its own trailing baseline; a missing day or
immature baseline ends the count; the research's "z at or above 2 for at least 2 consecutive days").
Golden vectors T-CV01-a..f and T-RT01-a/b.

## Heart rate (`CardioMetrics.kt`)

Heart-rate readings outside 25-250 bpm are dropped and counted (research T-DH-5): calibration
choice, a plausibility range and not a physiological limit.

| ID | Function | Formula | Constants | Evidence and source |
|---|---|---|---|---|
| CV02 | `restingHeartRateVariability` | `CV = 100 SD / mean` of daily resting HR over 14 days | window 14 (research); minimum 10 valid days (calibration choice) | Class C. No study supports a CV threshold for a consumer device (research evidence gap). Descriptive only. |
| CV04 | `heartRateRecovery` | `HRR60 = HR(end) - HR(end + 60 s)`, `HRR120` likewise | each HR = mean of plausible readings within +-5 s (calibration choice, damps optical noise) | Cole et al. 1999, N Engl J Med (2,428 adults referred for exercise testing, treadmill protocol with a defined cool-down). Its cut-off (12 bpm or less at 1 min) belongs to that protocol and is not applied. Class B protocol-controlled, C for free-living wrist data. T-CV04-a: 24 and 40. |
| CV04 | `compareWithRecentSessions` | `HRR - median(previous HRR)` | last 5 comparable sessions, minimum 3 (calibration choice) | Research CV04 card. "Comparable" is the caller's job. |
| CV05 | `heartRateDriftPercent` / `heartRateDrift` | `100 (HR2 - HR1) / HR1`, halves split at the middle of the time span | minimum 20 min and 10 readings per half (calibration choices) | Class C: training practice, no validated threshold; heat, hydration, terrain, caffeine confound. 138 to 146 is +5.8 %. |
| CV05 | `aerobicDecouplingPercent` | `100 (EF1 - EF2) / EF1`, `EF = speed / HR` | | Class C, same confounders; needs phone-GPS speed. |
| CV07 | `minutesAboveActiveThreshold` | minutes with HR above resting HR + 20 bpm | offset 20 bpm: calibration choice, no clinical meaning | Class C. Optical HR cannot tell movement from posture, heat or stress. Null without a resting HR or readings, so 0 means "measured and never above". |
| AR04 | `sleepingDipPercent` / `sleepingDip` | `100 (HR_wake - HR_sleep) / HR_wake`, duration-weighted means | at least 6 h awake and 3 h asleep coverage (calibration choice) | Class C. "Dipping" is an ambulatory blood-pressure concept, not validated for wrist HR; no BP cut-off (such as 10 %) is applied. |

## Autonomic (`AutonomicMetrics.kt`) - AR01, AR02

```
L7   = mean(ln RMSSD) over the last 7 nights, at least 4 valid
mu60, sigma60 = mean and sample SD of ln RMSSD over the 60 nights before those 7, at least 21 valid
z    = (L7 - mu60) / sigma60            pct = 100 (e^(L7 - mu60) - 1)
CV7  = 100 SD(ln RMSSD, 7 nights) / mean(ln RMSSD, 7 nights)
SWC  = 0.5 sigma60                      status = below / within / above mu60 +- SWC
```

- Evidence class B. Plews et al. 2012 (Eur J Appl Physiol), 2013 (Sports Med), 2014 (Int J Sports
  Physiol Perform); Buchheit 2014 (Front Physiol). Validated in trained endurance athletes with
  chest-strap or ECG recordings on waking. Fitbit's sleep-time RMSSD uses an undocumented algorithm
  and no Fitbit-specific HRV validation exists. Device dependence of wearable HRV: Dial 2025 (not
  Fitbit).
- The weekly mean is used because a single night is too noisy (Plews 2012). CV on the ln scale is the
  Plews convention (research AR01 formula).
- Windows 7 and 60, minimums 4 and 21, SWC multiplier 0.5: conventions, calibration choices.
- RMSSD readings outside 1-200 ms are dropped.
- `z` is null when `sigma60` is zero. T-AR01-a..d: z -3.629, -17.2 %, CV7 1.42 on the hypothetical
  baseline (ln-mean 3.9013, SD 0.05206).
- A low value may reflect poor sleep, alcohol, a late meal, illness, travel or cycle phase; on its own it is
  neither a recovery verdict nor a diagnosis.

## Sleep (`SleepRegularity.kt`) - SL01, SL03, SL04, SL05, SL07, SL08, SL10

| ID | Function | Formula | Constants | Evidence and source |
|---|---|---|---|---|
| SL03 | `sleepRegularityIndex` | `SRI = -100 + 200 / (M (N-1)) sum_days sum_epochs delta(s[i][j], s[i+1][j])` over epoch pairs 24 h apart where both states are known | 1-minute epochs; at least 7 days and 5 day-pairs (calibration choice); 14-day window; noon-to-noon blocks; epoch asleep when at least half of it is asleep; manually edited and different-UTC-offset nights left out | Class B. Phillips et al. 2017 (Sci Rep; derived from diaries of 61 undergraduates); Windred et al. 2024 (Sleep; about 61,000 UK Biobank adults, one week of accelerometry, association with mortality). No individual cut-off; compare with the person's own history. Wrist devices miss quiet wakefulness, which inflates the index. Missing nights and naps are unknown, not awake. T-SL03-a/b: 100 and 66.67. |
| SL04 / SL10 | `midpointMinuteOfDay`, `onsetMinuteOfDay`, `wakeMinuteOfDay`, `clockVariability` | midpoint = start + (end - start) / 2; mean and sample SD of a clock time laid out around its circular mean (correct across midnight) | at least 5 nights (calibration choice; pass 10 for a 14-night window); research asks for 7 and 14 nights | Class B. Roenneberg et al. 2012 (Curr Biol); Phillips et al. 2017. T-SL04-a: mean 205.7, SD 34.7 min. |
| SL05 | `socialJetlag` | `(mean midpoint on free days - mean midpoint on work days) / 60` hours | at least 3 work and 2 free nights (calibration choice); `isWeekendWakeDay` is only the Monday-to-Friday fallback | Class B. Roenneberg et al. 2012: associated with BMI in a population survey; no individual cut-off. Not the chronotype-corrected MSFsc; must not be shown as a chronotype. T-SL05-a: 1.43 h. |
| SL01 | `durationSummary` | mean, median, SD, CV of total sleep time; nights at or above 420 min | guideline 420 min (7 h); at least 5 of 7 nights (calibration choice); a night of 0 min is not a night | Class A for the guideline (Watson et al. 2015, AASM/SRS consensus; Hirshkowitz et al. 2015, NSF), B for the device (de Zambotti et al. 2018; Chinoy et al. 2021: wrist trackers agree only moderately with polysomnography and count quiet wakefulness as sleep). T-SL01-a. |
| SL08 | `shortfall` | `clipped = sum max(0, target - TST)`, `signed = sum (target - TST)` | default target 420 min or the user's own; at least 5 nights (calibration choice) | Class C. Chronic restriction accumulates deficits (Van Dongen et al. 2003, Sleep; 48 healthy adults, 14 nights) but repayment is not established as linear. Worded "estimated shortfall against your target", never "debt owed". Missing nights add nothing, so a window with gaps understates; `meanClippedPerNight` is comparable across windows. T-SL08-a/b. |
| SL07 | `wasoMinutes` | minutes scored AWAKE inside the sleep period (union of stretches) | null without stage data | Class B-C: WASO from wrist devices is less accurate than total sleep time. |
| SL07 | `awakeningsPerHour` | `awakenings / (minutes asleep / 60)` | | Class B-C. The device's own segment count, not a clinical fragmentation index; trend only. T-SL07-a: 9 over 6.87 h gives 1.31. |

## Activity (`ActivityMetrics.kt`) - PA01-PA07, PA10, BV02

| ID | Function | Formula | Constants | Evidence and source |
|---|---|---|---|---|
| PA01 / PA06 | `stepsSummary` | median, mean, SD, CV of daily steps over 7 days | at least 5 valid days (calibration choice); pass the last complete day | Class A for the association with mortality (Paluch et al. 2022, Lancet Public Health: 15 cohorts, 47,471 adults), B for the device (Feehan et al. 2018). CV as "regularity" is class C. T-PA01-a. |
| PA01 | `stepReferenceRange` | 6,000-8,000 for age 60 and over, 8,000-10,000 below 60 | | Paluch et al. 2022: where the pooled curve levels off. A population pattern, not a personal target. |
| PA01 | `stepsPerWakingHour` | `steps / (waking minutes / 60)` | | Class C descriptor. |
| PA02 | `weeklyMvpa` | `moderate-equivalent = moderate + 2 vigorous`, against 150 (and 300) per week | at least 5 valid days; 5 or 6 days flagged as a lower bound | Class A for the guideline (WHO 2020, Bull et al.; Piercy et al. 2018), B for the device's intensity classification. |
| PA02 | `weeklyActiveZoneMinutes` | AZM already counts cardio and peak minutes twice | same | T-PA02-a: 128 of 150 is 85.3 %. Progress towards a goal, not a clinical measure. Active minutes and AZM are different quantities and stay labelled. |
| PA10 | `guidelineStreak` | consecutive weeks at or above 150 | a week with gaps and a total below 150 is unknown, not a miss | Class B (guideline-based), descriptive. |
| PA03 | `prolongedBouts` | bouts of at least 30 min: count, longest, minutes | 30 min: calibration choice, not a medical limit (research: 30 vs 60 is tunable) | Class B. Ekelund et al. 2016 (Lancet); Diaz et al. 2017 (Ann Intern Med); Patterson et al. 2018. No number of sedentary hours is called safe. The wrist detects inactivity, not sitting. T-PA03-a: 4 bouts, longest 120, total 300. |
| PA03(b), PA04 | `sedentaryDay` | bout = run of sedentary minutes (under 20 steps/min, awake, with data); break = a minute of at least 20 steps that ends a bout; `breaks / (sedentary minutes / 60)` | 20 steps/min and 30 min: calibration choices; at least 600 observed waking minutes | Class B. Healy et al. 2008 (Diabetes Care; 168 adults, accelerometer): breaks in sedentary time with better metabolic markers. A minute with no data neither extends a bout nor counts as movement. |
| PA05 | `peakCadence` | mean of the top 30 (or 60) one-minute step counts of the day | at least 600 observed minutes (calibration choice) | Class B for the measure (Paluch et al. 2022); C for any claim that pace matters on top of volume. No threshold. |
| PA07 | `hourlyStepProfile` | `H = -sum p_h ln p_h / ln n` over the n observed hours | | Class C, descriptive. |
| BV02 | `targetAdherence` | share of valid days meeting a user-set target; current run | the target is the user's, never a silent 10,000 | Class C-B. |

## Load (`LoadMetrics.kt`) - EX02, EX03, EX01

| ID | Function | Formula | Evidence and source |
|---|---|---|---|
| EX02 | `edwardsTrimp` | `sum minutes in zone k times k`, zones at 50-60-70-80-90 % of maximum HR | Class B. Edwards 1993, The Heart Rate Monitor Book (coaching book; its peer-reviewed standing is as the HR criterion for session RPE: Foster et al. 2001, J Strength Cond Res). Integer weights are part of the method. Different scale from Banister TRIMP (`strain/Trimp.kt`); never mix in one series. T-EX02-c: 95. |
| EX02 | `sessionRpeLoad` | `RPE (CR-10) x minutes` | Foster et al. 2001. The API carries no RPE; only exists when the user rates a session. |
| EX03 | `fosterWeek` | `monotony = mean(daily load) / SD(daily load)`, `strain = weekly load x monotony` over 7 complete days | Class C-B. Foster 1998, Med Sci Sports Exerc 30:1164 (25 athletes; illness related to load, monotony and strain). "Monotony above 2" is a heuristic from that work, not validated for individuals; no threshold applied. All seven days must be known (a rest day is 0, a day without data is null and voids the week). Monotony is null when all days are equal. T-EX03-a: 1.1446 and 1831.3. |
| EX01 | `weeklyExerciseVolume` | sum of active minutes, sessions and distinct exercise days in 7 days | Class A descriptive. A zero week is a true zero only if the week has synced; the caller must know. |

Banister TRIMP (T-EX02-a/b: 63.0 and 72.1) and the descriptive EWMA ACWR (T-EX04-a: 1.363) live in
`strain/Trimp.kt` and `load/TrainingLoadEngine.kt`; `ResearchGoldenVectorsTest` checks both
against the research vectors. ACWR is descriptive only (Impellizzeri et al. 2020, Int J Sports
Physiol Perform).

## Respiratory and temperature (`NightlySignals.kt`) - RT04, RT07

All class C: wearable breathing rate, SpO2 and skin temperature changed around illness in cohort
studies (Natarajan et al. 2020; Smarr et al. 2020, a ring device) but no study validates the
Fitbit values or an individual threshold. Pulse oximetry overestimates saturation in people with
darker skin (Sjoding et al. 2020), so an absolute SpO2 value never drives a decision.

| ID | Function | Rule | Constants |
|---|---|---|---|
| RT07 | `sleepTemperatureDelta` | `nightly - baseline`, as the provider defines its two fields (34.12 - 33.95 = +0.17 C) | plausible 20-45 C. Wrist skin temperature in sleep: not core temperature, not for fever detection. |
| RT04 | `spo2Shift` | robust z (floor 0.5 percentage points) of the nightly average and of the lower bound; reportable only when both moved the same way by at least the z threshold and coverage was adequate | z 2 and coverage 50 %: calibration choices (the research gives the rule without numbers). Differences in percentage points. |

Not built by design: desaturation counts, an oxygen desaturation index, time below a saturation
level, any sleep-apnoea or fever statement (RT06, MV06: class D).

## Data quality (`DataQuality.kt`) - RT05 and the missingness rules

Part 3 section 6.2 and the missingness section of the research. All numeric thresholds are calibration
choices: the research names the checks and leaves the numbers to tuning.

- `coverage(valid, expected)`: valid / expected, null when nothing was expected (RT05; class A as a
  quality metric, no health claim).
- `filterPlausible`: ranges HR 25-250 bpm, RMSSD 1-200 ms, SpO2 0-100 %; rejected values are counted,
  never repaired.
- `dayCompleteness`: MISSING (no data), PARTIAL (under 600 worn minutes), COMPLETE.
- `confidence`: categorical, deliberately not a percentage. LOW (no reading, sync older than 24 h
  or unknown, baseline under 14 days, coverage under 50 %, implausible values): no alert. MODERATE
  (baseline 14-20 days, coverage 50-80 %, or a tagged confounder). HIGH otherwise.
- `daysWithUnusualOffset`: nights whose UTC offset differs from the most common offset of the last 7
  nights are flagged and left out of SL03-SL05. A tie flags nothing. After a daylight-saving change the
  first nights are flagged too; a caller that knows the time zone should clear them.

## Longitudinal (`Longitudinal.kt`) - LG01-LG04, BV01

| ID | Function | Formula | Constants | Evidence and source |
|---|---|---|---|---|
| LG01 | `medianDrift` | median of the last 28 days minus median of the last 90, both ending the day before | minimum 14 and 56 valid days (calibration choices) | Class B, descriptive. |
| LG02 | `trendSlope`, `weeklyTrend`, `dailyTrend` | OLS slope and Theil-Sen slope (median of pairwise slopes) with the Sen 95 % interval, `C = 1.96 sqrt(n(n-1)(2n+5)/18)`, ranks (N-C)/2 and (N+C)/2 + 1 rounded outwards; weekly medians of 12 weeks | at least 8 weekly blocks of at least 5 valid days | Class B. Plews et al. 2013; Hopkins & Marshall 2009; Theil 1950; Sen 1968 (the research documents Theil-Sen as an implementation choice). The interval assumes independent points; daily series are autocorrelated, so on daily data it is too narrow. T-LG02-a: -0.343 per week (-1.37 per 4 weeks). |
| LG03 | `cusum` | `S+ = max(0, S+ + z - k)`, `S- = max(0, S- - z - k)`, alarm above h | k 0.5, h 4: control-chart conventions, calibration choices (they set the false-alarm rate) | Class B method (Page 1954, Biometrika), C for any interpretation. T-LG03-a/b. |
| LG03 | `levelShift` | the first 28 days of 60 set the target (median) and sigma (1.4826 MAD, floored); the rest run through CUSUM | at least 14 reference, 7 monitored and 28 valid days (calibration choices) | A detected shift says the level moved and stayed moved, not why; the user is asked for context. Purpose: tell "I changed" from "the data source changed". PELT (Killick et al. 2012) is not implemented. |
| LG04 / BV01 | `workFreeSplit` | mean and SD on work days and free days, and the gap | at least 8 work and 4 free days in 28 (calibration choice) | Class B description (Roenneberg et al. 2012 for sleep timing). Not for clock times; use `socialJetlag`. |

## Multi-signal patterns (`MultiSignal.kt`) - MV01-MV10, merged research 2.5

Rule-based consistency checks, not scores: each pattern lists criteria, each satisfied by one of
a few signal rules (a z-score reaching a threshold in a direction, or "about usual" for
|z| under 1). The result names every contributing signal with its value.

- Outcome `DETECTED` when at least `minConcurrent` criteria are met; `NOT_DETECTED` when even if every
  unknown criterion were met the minimum would not be reached; otherwise `INSUFFICIENT_DATA`.
  A missing reading is neither a deviation nor normal.
- MV01 (INS-REC-03, evidence class C: Natarajan 2020, Mishra 2020, Alavi 2022, purpose-built research
  algorithms, not this rule): at least 2 of 3 of RHR z of at least 2, HRV 7-night z of at most -1.5
  (or z of at most -2 on each of the last two nights), breathing-rate z of at least 2, within the same
  2-night window. These thresholds are the research's. Sleep temperature delta of at least +0.3 C is listed when
  present but does not count (the research lists it as a fourth signal; "tunable"). The research's
  "same 2-night window" is read as the threshold holding on each of the two nights
  (`MultiSignal.persistentZ`), a calibration choice. Suppressed when an illness tag is active; lower
  prominence after an alcohol tag; alert only with confidence not LOW. Cooldown (3 days) and the
  "not in the first 14 days" rule (immature baselines give LOW confidence) belong to the insight scheduler.
- The other patterns (MV02, MV03, MV04, MV05, MV07, MV08, MV09, MV10, circadian disruption, low activity
  with adequate sleep) are exploratory and display-only: the research states no minimum signal count,
  so every listed criterion must be met (conservative calibration choice) and the z threshold is 1.5
  (`FatigueSignalDetector.ACUTE_Z`, a calibration choice). One day matching a pattern is an
  observation, not a finding; effects across many days need an interval and
  Benjamini-Hochberg correction (research 6.5), which `InterpretationStats.benjaminiHochberg` provides.
  The N-of-1 tag-response analysis itself (BV03, effect with CI and FDR) is not built.
- Wording: every interpretation says "may", every message ends "This is not a diagnosis.", and no text
  names a disease or says the person is ill (tested). Only MV01 can raise an alert.
- Not built: MV06 and the merged "respiratory change" (breathing rate up with SpO2 down): class D, a
  desaturation or sleep-apnoea screen on filtered, sparse wrist SpO2 (Sjoding 2020 bias).
- Not duplicated: `recovery/FatigueSignals.kt` (`FatigueSignalDetector`) already turns HRV, resting HR
  and breathing rate into fatigue levels on the mean/SD baselines of `baseline/Baseline.kt`
  (docs/FORMULAS.md section 6); it covers the merged "possible high physiological strain" for HRV and
  RHR. MV01 here is the research's separate robust-z rule; the two are not combined.

## Floating-point fixes in version 1

Found by golden tests with decimal constants that are not exact in binary:

| Function | Problem | Fix |
|---|---|---|
| `InterpretationStats.lag1Autocorrelation` | a constant series of 0.1s gave 0.917 (rounding residue divided by itself) | null when the squared deviation sum is below the rounding noise of the mean |
| `LoadMetrics.fosterWeek` | seven identical loads of 33.3 gave monotony 4.3e15 | monotony null when SD is under 1e-9 of the mean |
| `AutonomicMetrics.hrvTrend` | a flat baseline gave z of -7e13 | z null when sigma60 is under 1e-9 on the ln scale |

These are tolerances for floating-point round-off, not physiological thresholds.
