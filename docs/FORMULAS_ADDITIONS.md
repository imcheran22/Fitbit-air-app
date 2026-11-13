# FORMULAS additions (to be merged into FORMULAS.md)

New pure-Kotlin engines in `:core:analytics`. None is wired into the pipeline yet. Each entry lists the formula,
every constant with its status, the source and the known limits. "Calibration choice" means a value picked for
usability that has no published validation. "UNVERIFIED" means the source was not opened in the session that wrote
this file (the session could not reach pubmed/PMC/PLOS); the claim comes from memory or from the Pulse reference repo.

Sources actually opened: the Pulse reference code in `reference/design/pulse-main-cleaned/src/core/algorithms/stress.ts`,
`scoring/stressBase.ts`, `algorithms/energyBank.ts`, `algorithms/fitnessLevel.ts` and
`reference/design/pulse-mobile-main/src/core/engine/{sleep,strain}.ts` (code and comments only; no text copied).
`docs/research/bevel/recovery-stress-energy.md` does not exist in this repo; `docs/review/BEVEL_ALIGNMENT.md` section 1.6
says neither Pulse's stress nor energy model is validated. No paper below was opened.

Version note: these are new features, not changes to an existing formula. `ANALYTICS_ALGORITHM_VERSION` was not touched
(another change set owns that file); bump it when the pipeline starts persisting any of these outputs.

All outputs are display context. None is diagnostic. Fatigue-style wording: "may indicate", never "you are ill".
Missing data stays missing: every engine returns null plus a reason enum, never 0 and never a population value.

## 1. Daytime stress (`stress/StressEngine.kt`)

HR-only, per minute, against the athlete's own resting daytime level. Not a measure of psychological stress, not
validated against any stress instrument. UI wording: "heart rate was elevated while still".

1. Minute HR = mean of the readings in the minute.
2. Motion gating: a minute is dropped if any minute within +-2 has steps > 0, or it lies in a workout or sleep/nap range.
3. Day aggregate = P10 (type-7) of the mean still-minute HR of each waking hour (06:00-22:00 local) that has >= 15 still minutes.
4. Baseline = mean of the last 30 prior day aggregates (>= 7 valid, else calibrating -> null); sigma = max(sample SD, 5 bpm).
5. z = (bpm - center) / sigma; level = 3 / (1 + e^(-1.5 (z - 1.5))), range 0..3. Hand values: z=0 -> 0.286048, z=1.5 -> 1.5, z=3 -> 2.713952.
6. Day summary: mean level, minutes with level < 1 / 1..2 / >= 2, highest 6-minute slot (slots tile from local midnight; needs >= 3 scored minutes; ties go to the earliest). Needs >= 120 scored minutes, else null.

| Constant | Value | Status |
|---|---|---|
| logistic slope k, midpoint z0 | 1.5, 1.5 | Calibration choice. Structure from the Pulse reference (`stress.ts`), which labels both "tunable". No published validation |
| still window | +-2 min, steps > 0 | Calibration choice (Pulse uses +-2 min, 0 steps) |
| waking window | 06:00-22:00 | Calibration choice (Pulse `stressBase.ts`) |
| min still minutes per hour | 15 | Calibration choice (Pulse) |
| day aggregate percentile | P10 | Calibration choice (Pulse folds the P10 of hourly means) |
| min baseline days / window | 7 valid / 30 | Calibration choice, same rule as Apex's other baselines |
| sigma floor | 5 bpm | Calibration choice. Pulse divides by 1.253 x the day-to-day spread of the aggregate, which can be 1-2 bpm and would label a 3 bpm rise "medium"; the floor keeps within-hour variation of still HR from reading as stress. Not derived from data |
| min scored minutes | 120 | Calibration choice |
| band edges | 1 and 2 | Calibration choice |

Known limits: a still minute can be raised by caffeine, heat, illness, posture, digestion or a late workout; steps
are the only motion signal (cycling, driving, upper-body work are not seen); DST-change days shift the hour index by one after the change;
the Air's daytime HRV appears to be absent (unverified, BEVEL_ALIGNMENT 1.6), so there is no HRV term.
Bevel-style products blend HR percentile and HRV; this engine does not. Pipeline must store `dayAggregateBpm` per day (it is returned even while calibrating).

## 2. Energy bank (`energy/EnergyEngine.kt`)

level(0) = morning recovery score (0..100; null or outside the range -> null). Per awake minute m from wake to the end of the span:

- inside a nap: level += 0.25 and nothing else applies.
- otherwise: level -= 0.04 (basal); level -= 0.08 x zone(HR) for HR in zones 1..5 (zone model supplied by the caller; none if HR missing or below zone 1);
  level -= 0.08 if stress >= 2, level += 0.01 if stress < 1 (no stress level for that minute: nothing, counted in `unscoredStressMinutes`).
- clamp to [0, 100] each minute.

All five rates (0.04, 0.08, 0.08, 0.01, 0.25) are **calibration choices** taken from the magnitudes of the Pulse reference
(`energyBank.ts`: k0, k1, k2, k3, k4, each marked "tunable"). Scale: 0.04 x 960 min = 38 points of basal drain over 16 h. There is no
published validation of an energy/battery model of this kind; do not describe it as physiology. Pulse also blends sleep
performance into the start level (0.6 recovery + 0.4 sleep); Apex starts from recovery alone because sleep is already a recovery input.
Sleep minutes are not simulated: the curve starts at wake. Result carries a per-term breakdown (basal, activity, stress, rest charge, nap charge).

## 3. Sleeping heart-rate dip (`sleep/HeartRateDip.kt`)

dip = (daytime mean HR - sleeping mean HR) / daytime mean HR, signed. DIPPER if dip >= 0.10, BLUNTED if 0 <= dip < 0.10, REVERSED if < 0.
Daytime mean should exclude exercise. Minute-list entry point needs >= 30 valid minutes each side (calibration choice).
Source: the nocturnal dipping convention from ambulatory blood-pressure monitoring (>= 10 % night-time fall). Applying it
to heart rate is by analogy: **UNVERIFIED for HR; the 10 % threshold is a calibration choice**, not a validated HR cut-off. Pulse (`sleep.ts` `hrDip`)
uses 1 - sleeping HR / inactive-HR baseline, floored at 0, with age/sex targets of about 25-30 %; Apex follows the requested daytime-mean form and keeps the sign.
A blunted or reversed value can follow late exercise, alcohol, heat, illness or a short night: "may indicate" at most.

## 4. Post-workout HR recovery (`strain/HeartRateRecovery.kt`)

peak = max minute-mean HR over the last 3 workout minutes (all 3 must have HR); drop60 = peak - mean HR of the first full minute after the end;
drop120 = peak - mean HR of the second. Missing peak minute -> null; a missing recovery minute removes only that drop; optional minimum peak (e.g. zone 4) -> null below it.
A negative value (HR rose) is returned as is. Minute-means and the minute-average "at 60 s" understate the true drop (calibration choices; direction known, size not).
Concept: HR fall after peak exercise as a prognostic marker, Cole et al. 1999, N Engl J Med 341:1351-1357 (1-minute drop <= 12 bpm abnormal after
treadmill testing) -- **UNVERIFIED**. Apex does not apply that cut-off (different protocol, population and sampling); values are personal-trend context only.
Pulse (`strain.ts` `hrRecovery`) instead takes the largest drop inside any 120 s window starting at or before the active end, from raw HR and only after zone 4; not used here.

## 5. Journal effects (`journal/JournalEffects.kt`, `journal/WelchTTest.kt`)

For each binary factor: pair factor on day d-1 with outcome on day d (recovery points; ln RMSSD), outcome days in the last 90 days, drop unlogged factor days and
unmeasured outcomes, require >= 5 per arm (calibration choices: 90 days, 5 per arm). Welch two-sided t-test, alpha = 0.05, 95 % CI:
SE = sqrt(s1^2/n1 + s2^2/n2), t = (m1 - m2)/SE, df = Welch-Satterthwaite, CI = diff +- t(0.975, df) SE. HRV effect is reported as 100(e^d - 1) percent with the CI transformed alike.
Student t via the regularised incomplete beta function (Press et al., Numerical Recipes, continued fraction; Lanczos log-gamma) -- UNVERIFIED reference, but pinned in
tests against t-table critical values (df 1, 2, 5, 8, 10, 30, inf) and a numerically integrated p-value (t = 5, df = 8: 0.0010528; t = 2, df = 8: 0.080516).
Welch 1947, Biometrika 34:28-35 -- UNVERIFIED citation (textbook method). ln(RMSSD): Plews et al. 2013 (Int J Sports Physiol Perform), Buchheit 2014 (Front Physiol) -- UNVERIFIED.
Limits: observational and confounded; day-to-day autocorrelation breaks the independence assumption, so the interval is optimistic; no correction for the number of factors
(`testsPerformed` is returned so the UI can caveat); with 5 per arm the interval is wide. Wording: "was associated with", never "caused". An interval that excludes 0 is not a finding to act on alone.

## 6. VO2max category (`fitness/Vo2Category.kt`)

Percentile of the athlete's VO2max in the FRIEND treadmill table for the age decade (20-29 ... 70-79) and sex, linear between the 5/10/25/50/75/90/95 columns, clamped to 5..95
(`atTableEdge` flags a bound). Category floors at percentile 20/40/60/80: poor / fair / good / excellent / superior (calibration choice from Pulse `fitnessLevel.ts`;
FRIEND publishes percentiles, not named categories). Age outside 20..79 or sex unspecified -> null (no row to use; no pooling).
Source: Kaminsky LA, Arena R, Myers J. Mayo Clin Proc 2015;90(11):1515-1523, treadmill, 7,783 apparently healthy adults, RER >= 1.0 -- **UNVERIFIED**: numbers are a
transcription from the Pulse repo, not checked against the paper. A wearable VO2max estimate usually errs by several ml/kg/min, so a category boundary is not sharp.

## 7. Fitness age (`fitness/FitnessAge.kt`)

Age at which the reference population's mean VO2max equals the athlete's (linear inversion of a strictly decreasing curve; `fitnessAge - chronologicalAge`, negative = fitter).
**The HUNT regression coefficients (Loe et al. 2013, PLoS ONE 8(5):e64319; Nes et al.) could not be opened and are not in the code** (a remembered pair of coefficients
failed a sanity check against the 54.4 / 43.0 ml/kg/min means of ages 20-29 quoted in a search snippet, so it was not used). The default curve is the FRIEND 50th percentile at
decade midpoints 25..75 (UNVERIFIED transcription, a registry median of lab-tested healthy adults, higher than a general-population mean, so fitness age reads older than a HUNT-mean version would);
`Vo2AgeCurve.linear(intercept, slopePerYear, minAge, maxAge)` takes the HUNT line once verified. No extrapolation: outside 25..75 the age is clamped and flagged (`YOUNGER_THAN_RANGE` / `OLDER_THAN_RANGE`).
Null without VO2max, age (20..79) or sex. Several ml/kg/min of input error is several years of fitness age: show as "about".

## 8. Time in HR zones per day

Already computed: `StrainEngine.evaluate(...).minutesByZone` (all recorded minutes by `HeartRateZone`, including rest). No new engine was added.
