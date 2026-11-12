# Formulas

Every number the app computes, with the exact formula and the constants in use. All of it lives
in `:core:analytics` and is covered by unit tests. Formula set version: **2**
(`ANALYTICS_ALGORITHM_VERSION`). Sources, populations, known errors and evidence grades for every
constant are in `docs/EVIDENCE.md`; what changed in version 2 and why is in `docs/AUDIT.md`
("Formula review").

These are this app's own calculations. They are not WHOOP, Oura, Garmin or Fitbit scores, and
they are not medical measurements or diagnoses. Constants marked *calibration* set where typical
days land on a scale; they are design choices, not physiology, and are configurable in code. A
score or signal here describes recorded data against the user's own history; wording in the app
must stay "may indicate", never "you are ill".

**Missing data stays missing.** A reading that is absent, `NaN` or infinite is treated as "no
reading": it is skipped, never replaced by zero, an average or a population norm.

## Changes in version 2

| Area | Version 1 | Version 2 |
|---|---|---|
| Acute and chronic load | EWMA seeded with the first recorded day | EWMA with normalised weights (section 5): no seed, so a rest day or a race at the start of the history no longer distorts the chronic load for weeks |
| 7-day HRV average | EWMA of raw milliseconds | EWMA of ln RMSSD, transformed back; comparable with the ln-scale normal range |
| Weekly-HRV fatigue signal | fired on a carried-forward old average | needs at least 3 HRV readings in the last 7 days |
| Week-over-week load change | ratio of weekly sums | ratio of mean recorded daily load; needs 5 recorded days in both weeks |
| Non-finite inputs | could reach the arithmetic (NaN scores, crashes) | counted as missing everywhere |
| Remaining-capacity minutes | always `%HRmax` zones and the default 0.30 floor | the engine's own zone method and reserve floor |
| Duplicate readings for one day | trends kept the last, baselines the first | first listed wins everywhere |

## 1. Personal baselines

For a metric X evaluated on day D:

- **Baseline window:** the 30 days before D (D-30 ... D-1). Day D itself is excluded, so today's
  reading is never compared against an average it helped to form.
- **One reading per day:** if a day has several readings the first one listed wins.
- **mu30, sigma30:** mean and sample standard deviation (n-1) of the valid readings in the window.
  A reading is valid when it is finite (and, for HRV, greater than 0).
- **Calibration:** at least 7 valid days are required. Below that the baseline is `CALIBRATING`
  and every score that depends on it stays locked rather than falling back to population norms.
- **Z-score:** `Z = (x - mu30) / sigma30`, clamped to [-3, +3]. Null while calibrating.
- **sigma floor:** sigma30 is never allowed below a small floor (table), so a run of near-identical
  readings cannot turn a trivial change into an extreme Z.
- **Personal normal range:** mu30 +/- 1 sigma30 (back-transformed for HRV).
- **7-day average (EWMA):** computed over the 30 days before D plus D itself, on the baseline's own
  scale: `EWMA_t = a * x_t + (1 - a) * EWMA_(t-1)`, `a = 2/(7+1) = 0.25`, seeded with the first
  reading, days without a reading leave the average unchanged. For HRV the readings are
  `ln(RMSSD)` and the result is transformed back with `e^y` (a weighted geometric mean), so it can be
  compared directly with the normal range. Because missing days are skipped, the average can be old:
  check the number of readings in the last 7 days (`validDaysLast7`) before treating it as current.

| Metric | Scale | sigma floor |
|---|---|---|
| HRV (RMSSD) | natural log | 0.05 (about 5 %) |
| Resting heart rate | linear | 2 % of mean |
| Breathing rate | linear | 2 % of mean |
| SpO2 | linear | 0.5 points |
| Sleep duration | linear | 5 % of mean |
| Skin temperature deviation | linear | 0.2 degC |
| Deep + REM share | linear | 0.03 |

**Why HRV uses a log scale.** RMSSD is right-skewed and changes proportionally, so the baseline
is computed on ln(RMSSD) (Plews et al. 2013). The typical value shown is the geometric mean
`e^mu`, and the normal range `e^(mu +/- sigma)` is therefore slightly wider above than below.

**Trend direction.** A least-squares line is fitted to the readings of the last 7 days (at least
4 needed, otherwise "insufficient data"). The trend is rising or falling when the line moves by more
than 0.75 sigma across the window, otherwise stable. While no baseline exists the threshold is 5 % of
the window mean (0.05 on the log scale). The 7-day coefficient of variation needs 3 readings.

**Days outside the normal range.** Counted backwards from D while each day with a reading is on the
same side of today's normal range; a day without a reading ends the streak.

## 2. Recovery score (0-100)

`Recovery = sum w_i' * S_i` over the inputs that are available.

| Input | Weight | Sub-score S_i (0-100) |
|---|---|---|
| HRV | 0.40 | `100 / (1 + e^(-1.2*Z))` |
| Resting heart rate | 0.25 | `100 / (1 + e^(1.2*Z'))`, `Z' = max(Z, -2)` |
| Sleep | 0.25 | the sleep score (section 4), limited to 0-100 |
| Breathing rate | 0.05 | `100 - 40*max(0, Z - 1)`, floored at 0 |
| Skin temperature | 0.05 | `100 - 40*max(0, Z - 1) - 20*max(0, -Z - 1)`, limited to 0-100 |
| Fatigue rating (optional) | +0.10 | `100*(10 - rating)/9`, rating limited to 1 (fresh) ... 10 (exhausted) |
| Workload ratio (optional) | +0.05 | 100 up to a ratio of 1.30, falling linearly to 0 at 2.00 |

- The logistic curve gives 50 at the personal baseline, about 77 at +1 sigma and 23 at -1 sigma.
  With the Z clamp the HRV sub-score stays between 2.7 and 97.3.
- A resting heart rate lower than usual helps only down to -2 sigma.
- Breathing rate and skin temperature are stability checks: they can only take points away.
- All weights, the steepness 1.2, the penalty slopes and the category edges are *calibration*; the
  composite has not been validated against any outcome.

**Missing inputs.** `w_i' = w_i / sum w_j` over the available inputs. A missing sensor's weight is
shared out in proportion among the rest, so the score always spans 0-100 and is never capped
(without skin temperature, HRV carries 0.40/0.95 = 0.421, and so on). The two optional inputs
join the same renormalisation only when present. A non-finite z-score, sleep score or ratio counts
as missing.

**No guessing.** At least one of HRV or resting heart rate is required. With neither, the result
is `CALIBRATING` (baselines still forming) or `UNAVAILABLE`.

**Categories.** Rounded score 67-100 Peak (train hard) · 34-66 Moderate (maintain) · 0-33
Restorative (prioritise recovery). *Calibration.*

**Contributors.** Each input's effect is reported as `w_i'*(S_i - neutral)`, with neutral = 50 for
HRV, resting heart rate and the fatigue rating, 75 for sleep, 100 for the penalty-only inputs. Only
effects of at least 1 point are listed.

## 3. Cardiovascular strain (0-21)

Shown as **DERIVED CARDIO STRAIN (0-21 SCALE)**.

**Heart-rate reserve fraction:** `dHR = (HR - HRrest) / (HRmax - HRrest)`, limited to 0...1.

**TRIMP per minute (Banister 1991; Morton et al. 1990):** `dHR * a * e^(b*dHR)`
with a = 0.64, b = 1.92 (men); a = 0.86, b = 1.67 (women); the average of both weightings when sex
is not given (*calibration*). Minutes with dHR below 0.30 (the reserve floor, *calibration*) are
ignored so that sixteen waking hours of sitting and walking do not swamp real training. At the floor
the per-minute value jumps from 0 to 0.34 (men) or 0.43 (women): daily TRIMP never decreases with
heart rate but it is not continuous there. Banister's TRIMP was defined for exercise sessions; its
use on all-day wrist heart rate is an Apex extension.

**Daily TRIMP:** the sum of `minutes * TRIMP per minute` over every one-minute heart-rate bucket of
the day. Samples with a non-finite or non-positive duration or heart rate are skipped.

**Scale:** `Strain = 21 * ln(1 + TRIMP/20) / ln(1 + 600/20)`, capped at 21; a non-finite TRIMP gives 0
(the pipeline never passes one). 20 and 600 are *calibration*. Hand-checked anchors (HRrest 50,
HRmax 190, sex unspecified, pinned by `StrainEngineTest`): 30 min at 60 % of reserve gives TRIMP 39.3
and strain 6.65; 60 min at 85 % gives 174.1 and 13.90; 3.5 h at 80 % gives 524.6 and 20.21.

**Heart-rate zones:** lower limits at 50/60/70/80/90 % of HRmax (zones 1-5, the default) or, as an
option, of heart-rate reserve above resting (Karvonen). The fractions are conventions, not validated
cut-offs.

**HRmax:** a value the user enters (100-240 bpm) wins, labelled user-reported. Otherwise the higher
of the age prediction `208 - 0.7*age` (Tanaka et al. 2001, labelled ESTIMATED, individual error
about 10 bpm) and the highest sustained recorded heart rate. With no age the recorded peak alone is
used; it is a lower bound of the true maximum, so strain from it errs high.

**Target strain from recovery:** `center = 6 + 12*(Recovery/100)`, window = center +/- 1, limited to
0-21 (*calibration*, guidance only). Remaining capacity = TRIMP at the window's upper edge - TRIMP so
far, also converted into minutes at the midpoint of each zone. The zone model and the reserve floor
are those of the engine that scored the day (version 2); zones whose midpoint earns no load are left
out.

## 4. Sleep

### Sleep need

`need = base + strain surcharge + debt surcharge`, at most 10 h.

- **Base:** 7 h 45 min, or once 14 nights exist the 75th percentile (linear interpolation) of the
  last 30 nights, kept within 7-9 h (a month of short nights shows a habit, not a small need). The
  7-9 h range follows the adult recommendations of Hirshkowitz et al. 2015 and Watson et al. 2015;
  7 h 45 min, the percentile and the 14-night rule are *calibration*.
- **Strain surcharge:** 3 min (0.05 h) per strain point above 10 on the preceding day (*calibration*).
  Missing or non-finite strain adds nothing.
- **Debt surcharge:** 50 % of the accumulated debt, at most 90 min. (The cap is a safeguard
  added to the specification: without it a week of six-hour nights would prescribe a
  fourteen-hour night.)

### Sleep debt

Sum over the 7 nights before today of `(base + strain surcharge) - time asleep`. A long night repays
at most 60 min; nights without data (or with non-finite values) are skipped, not counted as zero
sleep; one night per day; the total is never negative.

### Sleep score (0-100)

| Component | Weight | Sub-score |
|---|---|---|
| Duration | 0.40 | `min(100, 100 * asleep / need)` |
| Restorative stages | 0.25 | share of deep + REM: 100 within 38-50 %; `100*share/0.38` below; minus 1 point per percentage point above 50 % (at most 10); then +/-5 points per sigma versus the personal usual (limited to +/-2 sigma) |
| Efficiency | 0.20 | `asleep / in bed`: 0 at 65 %, 100 at 92 %, linear between; minus 3 points per awakening longer than 3 min beyond the first two (at most 25) |
| Consistency | 0.15 | mean of the 7-day standard deviations of bedtime and wake time: 100 up to 45 min, falling linearly to 0 at 150 min |

All weights and anchors are *calibration*, not validated sleep-quality cut-offs; consumer-wearable
sleep stages are not polysomnography stages.

Bedtime spread is computed on the clock face (circular statistics), so 23:50 and 00:10 are
20 minutes apart. Components that cannot be computed (no stage data, fewer than 3 valid nights of
timing, non-finite inputs) drop out and the remaining weights are scaled up, exactly as for
recovery. A night counts as sufficient for recovery when it covers at least 90 % of the need.
`asleep` must be finite; the engine refuses a night with an unknown sleep duration (pass no night).

### Sleep screen bands (Poor / Sufficient / Optimal) - assessment, not implemented

The app (`SleepMapping.kt`, `statusOfPercent`) labels a 0-100 figure Poor below 70, Sufficient from 70
and Optimal from 85, and applies it to five different quantities. These bands are presentation
choices with no source, and the review finds them defensible only for some of those uses.

| Row | Figure the bands are applied to | Assessment | Proposed (calibration, unvalidated) |
|---|---|---|---|
| Overall score | composite 0-100 | Acceptable as a display convention, but **leaky**: duration is only 40 % of the score, so with every other component perfect a night of 70 % of need (5 h 25 min) scores 88 (Optimal) and 3 h 53 min scores 80 (Sufficient). Pinned by `SleepEngineTest` | Keep 70/85, and cap the label at Sufficient when the night is below 90 % of need (`sufficientForRecovery` is false) and at Poor below 70 % |
| Duration | duration sub-score = % of need | **Not defensible**: 70 % of need is Sufficient, yet it is below the 7 h adult floor (Watson 2015) and below the engine's own 90 % "sufficient for recovery" rule | Poor below 90 %, Sufficient 90 to under 100 %, Optimal at 100 % (need met) |
| Consistency | consistency sub-score | Defensible as a presentation of the sub-score (70 is 76 min of spread, 85 is 61 min); anchors are Apex's | Keep 70/85 |
| Efficiency | **raw** asleep/in-bed % | Roughly in line with the commonly quoted 85 % efficiency mark (Ohayon et al. 2017, Sleep Health; recalled, unverified), but 70 % is lenient and the row ignores the engine's 65/92 anchors | Use the efficiency sub-score with 70/85 (about 84 % and 88 % efficiency), or raw 75/85 |
| Restorative | **raw** deep + REM share of sleep, e.g. 45 | **Wrong**: a share of 45 % earns the engine's full marks (benchmark 38-50 %) yet the bands call anything under 70 "Poor"; every normal night shows Poor | Classify the engine's restorative sub-score with 70/85, or use shares: Poor below 30 %, Sufficient 30 to under 38 %, Optimal from 38 % |

## 5. Training load

Built on daily TRIMP. A day with no heart-rate data (or a non-finite TRIMP) is treated as unknown
and leaves the averages unchanged; a recorded day with no load counts as zero.

- **Acute load (ATL, "fatigue"):** 7-day exponentially weighted average, `d = 1 - 2/8 = 0.75`.
- **Chronic load (CTL, "fitness"):** 28-day exponentially weighted average, `d = 1 - 2/29`.
- **Normalised weights (version 2):** over the recorded days so far, newest first,
  `y = sum_i d^i * x_i / sum_i d^i`, computed recursively as `S = x + d*S_prev`, `W = 1 + d*W_prev`,
  `y = S / W`. A constant load returns that constant from the first day; after a long history `W`
  tends to `1/a` and `y` equals the usual recursive EWMA (Williams et al. 2017). Seeding the
  recursion with the first day instead (version 1) kept a 39 % weight on that day after 14 days of a
  28-day average; the choice of initialisation is *calibration* because the paper does not give one.
- **Coupled ratio:** `ATL / CTL`. Reported once 14 days of history exist and CTL > 0.
- **Uncoupled ratio:** mean of the last 7 days / mean of the 21 days before them. Needs 28 days
  of history, at least 5 recorded days in the acute week and 14 in the chronic window. Because the
  acute week is not part of its own denominator, a spike shows at full size.
- **Bands** (on the uncoupled ratio, else the coupled one): below 0.80 under usual load · 0.80-1.30
  sweet spot · above 1.30 up to 1.49 overreaching caution · 1.50 and above high fatigue risk. The
  numbers come from team-sport studies using session-RPE and GPS loads (Gabbett 2016), not from
  TRIMP; applying them to TRIMP is an Apex choice.
- **Training balance:** yesterday's CTL - yesterday's ATL (positive = fresh). **Ramp:** CTL today -
  CTL a week ago.
- **Weekly load:** sum of the recorded days among the last 7 (a lower bound when days are missing).
  **Week-over-week change (version 2):** `(mean of last 7 recorded days - mean of the 7 before) /
  mean of the 7 before`; null unless both weeks have at least 5 recorded days.
- **Foster's monotony:** mean / sample standard deviation of the last 7 daily loads; needs 6 recorded
  days, null when the mean is 0, capped at 10 when the days are nearly identical (SD below mean/10).
  **Foster's strain:** weekly load x monotony. Foster defined both on session-RPE load (1998); on
  TRIMP they are descriptive only.

**Caveats shown with the ratio:** short history (under 28 days), low chronic load (under
10 TRIMP/day, where small changes swing the ratio), sparse data (under 70 % of the days of the last
28, or of the history if shorter, recorded).

The link between specific ratio bands and injury is contested in the literature
(Impellizzeri et al. 2020). The bands are load-management guidance, not injury prediction.

### Open point: manual workouts and session-RPE

A manually logged workout stores a 1-10 rating of perceived exertion (`perceivedExertion`), but load
is derived only from heart rate: a manual workout with no heart-rate data contributes nothing to
TRIMP, strain or the load ratios. Foster's session-RPE (RPE x minutes, Foster et al. 2001) is the
published way to quantify such sessions. **Decision for the owner, nothing implemented.** Points to
settle first:

1. Units differ: session-RPE is in arbitrary units, TRIMP is not. Adding them would be wrong; either
   keep a separate session-RPE series, or map RPE to a TRIMP-equivalent with a personal regression
   fitted on workouts that have both (needs enough paired sessions, otherwise leave it missing).
2. Double counting: the wearable records heart rate all day, so a manual workout often overlaps
   minutes that are already in the daily TRIMP. Only workouts whose time window has no heart-rate
   data should add load.
3. The app's rating is 1-10 while Foster's CR10 scale is 0-10 with verbal anchors; confirm the scale
   before using the published conventions.
4. Provenance must stay user-reported and the figure must be labelled as derived from a rating.

## 6. Fatigue indicators

| Signal | Rule |
|---|---|
| HRV acute drop | Z <= -1.5 |
| HRV sustained suppression | today below the normal range and 3+ days running |
| HRV weekly average below range | 7-day average (section 1) under the lower edge **and** at least 3 HRV readings in the last 7 days (version 2) |
| Resting heart rate elevated | Z >= +1.5 |
| Resting heart rate sustained elevation | today above the normal range and 3+ days running |
| Breathing rate elevated | Z >= +2 |

Level: **none** (no signal) · **watch** (any signal that is neither sustained nor backed by the
other system, including a breathing-rate signal alone) · **elevated** (HRV and resting heart rate
both flagged, or a sustained signal) · **high** (both systems flagged and at least one sustained).
All thresholds are *calibration*. The signals mean recovery may be incomplete; they describe
physiological load and do not diagnose illness or overtraining.

## 7. Fallback VO2 max estimate

Only when the wearable has not reported a VO2 max: `15.3 * HRmax / HRrest` (Uth et al. 2004),
always labelled ESTIMATED, only for HRrest 25-120 and HRmax 100-240 bpm. It was derived in trained
men, is not adjusted for sex and is suitable for following a trend, not as an absolute value.

## References

Full details, populations and errors are in `docs/EVIDENCE.md`. All were recalled, none opened in the
version 2 review (unverified).

- Banister EW (1991). Modeling elite athletic performance. In: Physiological Testing of Elite Athletes.
- Edwards S (1993). The Heart Rate Monitor Book.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc.
- Foster C et al. (2001). A new approach to monitoring exercise training. J Strength Cond Res.
- Gabbett TJ (2016). The training-injury prevention paradox. Br J Sports Med.
- Hirshkowitz M et al. (2015). National Sleep Foundation's sleep time duration recommendations. Sleep Health.
- Impellizzeri FM et al. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform.
- Karvonen MJ et al. (1957). The effects of training on heart rate. Ann Med Exp Biol Fenn.
- Morton RH, Fitz-Clarke JR, Banister EW (1990). Modeling human performance in running. J Appl Physiol.
- Ohayon M et al. (2017). National Sleep Foundation's sleep quality recommendations. Sleep Health.
- Plews DJ et al. (2013). Training adaptation and heart rate variability in elite endurance athletes. Sports Med.
- Plews DJ et al. (2014). Monitoring training with heart-rate variability: how much compliance is needed for valid assessment? Int J Sports Physiol Perform.
- Buchheit M (2014). Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol.
- Tanaka H, Monahan KD, Seals DR (2001). Age-predicted maximal heart rate revisited. J Am Coll Cardiol.
- Uth N et al. (2004). Estimation of VO2max from the ratio between HRmax and HRrest. Eur J Appl Physiol.
- Watson NF et al. (2015). Recommended amount of sleep for a healthy adult. Sleep.
- Williams S et al. (2017). Better way to determine the acute:chronic workload ratio? Br J Sports Med.
