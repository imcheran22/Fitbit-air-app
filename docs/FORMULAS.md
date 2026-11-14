# Formulas

Every number the app computes, with the exact formula and the constants in use. All of it lives
in `:core:analytics` and is covered by unit tests. Formula set version: **5**
(`ANALYTICS_ALGORITHM_VERSION`). Sources, populations, known errors and evidence grades for every
constant are in `docs/EVIDENCE.md`; what changed in version 2 and why is in `docs/AUDIT.md`
("Formula review"); what changed in version 3 and why is in `docs/DECISIONS.md` (D8) and in
`docs/review/METRICS_ALIGNMENT.md` / `docs/review/BEVEL_ALIGNMENT.md`; what version 4 adds is below and in
section 8; what version 5 changes (the sleep score) is below, in section 4 and in `docs/DECISIONS.md` D15.

These are this app's own calculations. They are not WHOOP, Oura, Garmin or Fitbit scores, and
they are not medical measurements or diagnoses. Constants marked *calibration* set where typical
days land on a scale; they are design choices, not physiology, and are configurable in code. A
score or signal here describes recorded data against the user's own history; wording in the app
must stay "may indicate", never "you are ill".

**Missing data stays missing.** A reading that is absent, `NaN` or infinite is treated as "no
reading": it is skipped, never replaced by zero, an average or a population norm.

## Changes in version 5

The sleep score was recalibrated (section 4, "Sleep score"; `docs/DECISIONS.md` D15). The owner saw 96 for a night
the provider scored 70 and felt tired: under version 4 an ordinary 7 h night put three of four parts (60 % of the
weight) at 100 and no part reflected the body's overnight state. Version 5:

| Item | Version 4 | Version 5 |
|---|---|---|
| Parts and weights | duration 0.40, restorative stages 0.25, efficiency 0.20, consistency 0.15 | duration 0.35, **restoration 0.25 (new)**, stage quality 0.15, efficiency 0.15, consistency 0.10 |
| Duration | `min(100, 100*asleep/need)` | 0 at target - 225 min, 100 at target; target = max(need, 420 min) |
| Restoration | - | sleeping HR z and ln RMSSD z against the personal mean/SD baselines, breathing-rate penalty |
| Stage quality | 38-50 % band worth 100, +/-5 per sigma | 80 at the personal usual, +/-10 per sigma; the band only while calibrating, capped at 80 |
| Efficiency | 0 at 65 %, 100 at 92 % | 0 at 65 %, 75 at 85 %, 100 at 95 % |
| Result | score | also `behaviouralScore`, `availableWeight`, `confidence`, `restorationZ`, `durationTargetMinutes` |
| Recovery's sleep input | full sleep score | `behaviouralScore` (no double counting of HRV, heart rate, breathing rate) |
| Pipeline | - | `SLEEPING_HEART_RATE` analysed against its own baseline (`BaselineSpecs.SLEEPING_HEART_RATE`) |

Stored sleep and recovery scores carry the old version and are replayed. Sleep need, sleep debt, the Sleep Regularity
Index and every other engine are unchanged.

## Version 7: WASO

`ANALYTICS_ALGORITHM_VERSION` 7: WASO counts AWAKE only inside staged coverage after sleep onset (unstaged gaps are unknown) and is null when stages cover < 95 % of the session.

## Version 6: research metrics persisted

No existing formula changed; `ANALYTICS_ALGORITHM_VERSION` is 6 so history replays and carries the new rows. All are
`MATHEMATICALLY_DERIVED`, descriptive, and none feeds a score. Missing inputs delete the row (never zero-filled).
`DayAnalysis.research` (`ResearchInsights`) exposes the same values plus the dual baselines, SWC status and patterns.
Stored: `RHR_ROBUST_Z`, `HRV_ROBUST_Z` (ln scale), `RESP_RATE_ROBUST_Z` (median/MAD z of the day, `DualBaselines`);
`HRV_CV7_LN`; `SLEEP_REGULARITY_INDEX` (raw SRI); `SLEEP_MIDPOINT`, `SLEEP_MIDPOINT_SD_7D` (needs 5 of the last 7 main
sleeps); `GUIDELINE_SHORTFALL_CLIPPED_7D` / `_SIGNED_7D` (last 7 main sleeps against 7 h, naps excluded, needs 5 nights);
`SLEEP_WASO` (scored AWAKE stages only, absent without stages); `AWAKENINGS_PER_HOUR` (awakenings over 3 min per hour
asleep); `SLEEP_SCORE_CONFIDENCE` (available weight 0..1); `SEDENTARY_PROLONGED_BOUTS`, `SEDENTARY_LONGEST_BOUT`,
`SEDENTARY_BREAKS_PER_HOUR`, `PEAK_CADENCE_30` from one-minute step buckets of a completed day (a minute with heart rate
but no step bucket counts as 0 steps; any bucket longer than 90 s, no step data or a day in progress makes them unavailable).
Not stored: dual baselines, SWC, weekly percent change, MV01 pattern (the "illness-like" pattern, always "may indicate",
alert gated by data confidence and journal tags).

## Changes in version 4

No existing formula changed. Version 4 persists and exposes the engines added after version 3, so
`ANALYTICS_ALGORITHM_VERSION` is 4: derived rows stored with an older version are replayed at the next start of the
real store (oldest stale day to today, forward) and then carry the new rows. Replay stays deterministic: a day depends
only on that day and earlier days, and the stress baseline reads the aggregates the replay has just stored for the
days before it.

| Output | Stored (derived daily metric) | Computed on read only |
|---|---|---|
| Daytime stress (8.1) | `STRESS_DAY_AGGREGATE_BPM`, `STRESS_SCORE` (mean level 0-3), `STRESS_LOW_MINUTES`, `STRESS_MEDIUM_MINUTES`, `STRESS_HIGH_MINUTES` | per-minute levels, highest 6-minute slot |
| Sleeping heart-rate dip (8.3) | `HR_DIP` (percent, signed) | category |
| Energy bank (8.2) | none | curve and breakdown (`DayAnalysis.energy`) |
| Post-workout heart-rate recovery (8.4) | none | per workout, on the workout detail |
| Journal effects (8.5) | none (the factors are stored: `JOURNAL_*`, 1.0 yes / 0.0 no, no row = not logged) | 90-day associations |
| VO2 max category, fitness age (8.6, 8.7) | none | on read |
| Zone minutes (8.8), weekly HRV status, Sleep Regularity Index, load confidence, `fatigue.evaluable`, personal strain base | already stored or computed in version 3 | exposed on `DayAnalysis` |

BMI is `weight / height^2` on read from the latest weight and the profile height (never stored); it is null without a
height (and without a weight). A weight without a weigh-in falls back to the profile weight, labelled user-reported.

Decisions the wiring made (each a *calibration* choice unless stated; none has published validation):

- **Stress needs motion data.** A still minute is told from a walking one only by step intervals (`metric_sample` STEPS, any
  bucket length up to 60 minutes; every minute of a bucket with steps counts as motion). A day with heart rate but no step
  interval overlapping it has stress `NO_MOTION_DATA` and no aggregate; the engine's "no steps means still" is never relied on. Workouts
  and every sleep session or nap of the day are excluded. Live Google and Health Connect syncs deliver daily step totals, so
  stress needs step intervals from the Takeout archive (15-minute buckets) or from a future minute-step stream.
- **Energy runs from wake to the end of the civil day**, to "now" for the current day, or to the start of the next main sleep, from the
  main sleep's end and the morning recovery; naps are the non-main sleeps of the day. It needs a zone model and at least 60 minutes of heart
  rate in the span. When stress is unavailable (calibrating, no motion data) the curve still runs with the basal and activity terms and
  reports how many minutes had no stress level.
- **Heart-rate dip window.** Daytime = every heart-rate minute from the previous main sleep's end (at most 24 h before the onset, else 24 h
  before) to the onset of the night, minus workouts, naps and other sleep; sleeping = the night's session. Both sides need 30 minutes.
  Using the waking time before the night keeps the day complete, so today's dip is available in the morning.
- **Heart-rate recovery** uses the minute rows from 3 minutes before to 2 minutes after the workout end, needs a zone model, and does not score a peak
  below the lower bound of zone 4 (`PEAK_BELOW_MINIMUM`; Pulse also uses zone 4).
- **Journal.** Five yes/no factors (`JournalDay.FACTORS`: alcohol, late caffeine, late meal, stressful day, travel). The factor of day d-1 is paired with
  the recovery score and the overnight RMSSD of day d; today's recovery is the value just computed, earlier days use their stored scores.
  At least 5 days per arm, otherwise the factor is listed as skipped.
- **VO2 max category and fitness age** use the VO2 max the pipeline shows (the band's value, else the ESTIMATED heart-rate-ratio value) together with
  age (profile birth year) and sex (profile). The result carries a missing reason (`SEX_UNSPECIFIED`, `NO_AGE`, `NO_VO2MAX`) instead of a value; the screen
  labels the VO2 max by its provenance, so a category from an estimate is visibly an estimate.

Persisted stress values are written for the current day as well; they are final once the day has ended and been replayed (a day's aggregate from a
partial day can differ slightly from its final value, and the next replay corrects it).

## Changes in version 3

Every row below is pinned by a hand-computed test (names in `docs/DECISIONS.md`, D8). Derived values
stored with an older version are recomputed automatically at the next start of the real store.

| Area | Version 2 | Version 3 |
|---|---|---|
| Recovery composite | breathing, skin temperature and workload ratio sat in the weighted mean with a neutral 100, so a sensor that did not sync lowered the score | only HRV, resting HR, sleep and the fatigue rating are averaged; the other three subtract `w * (100 - S)` when present (section 2) |
| Workload ratio in recovery | yesterday's stored ratio whatever its caveats | only when it carries no caveat |
| Partly worn day | stored as a real low-load day | under 600 recorded minutes: no `DAILY_TRIMP`, missing in the load series (section 5) |
| Today in the load series | its partial TRIMP entered ATL, CTL, monotony | today is a missing entry until it is over |
| Coupled ratio | from 14 calendar days even with 2 recorded days | needs 14 recorded days in the last 28 |
| Duplicate day in the load engine | last entry won | first valid entry wins, as everywhere else |
| Load confidence | none | density and recency; below 0.35 the ratios and the zone are withheld |
| TRIMP resting-HR anchor | today's reading first | the resting-HR baseline centre; one resting series per 30-day window |
| Observed HRmax | the single highest minute in 180 days | 99.5th percentile of at least 600 minutes between 100 and 240 bpm (section 3) |
| Fatigue with no baseline | level NONE, shown as "no signals" | `evaluable = false` |
| Sleep debt | 0 with no night; naps ignored | unknown below 4 recorded nights; naps count |
| Weekly HRV signal | 7-day EWMA against the 30-day range that contained the week | 7-night ln mean against the 60 nights before the week (section 6) |
| Sleep consistency | spread of bed and wake times | Sleep Regularity Index over consecutive-day minute pairs (section 4) |
| Strain target | `6 + 12R/100` | personal 14-day base scaled by recovery; none until 5 recorded days (section 3) |
| Sleep-need strain term | 3 min per strain point above 10 | 2 % of the base per SD above the athlete's own mean |

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

`Recovery = sum w_i' * S_i  -  sum w_k * (100 - S_k)`

The first sum runs over the **weighted** inputs that are present, the second over the
**penalty-only** inputs that are present.

| Input | Kind | Weight | Sub-score S (0-100) |
|---|---|---|---|
| HRV | weighted | 0.40 | `100 / (1 + e^(-1.2*Z))` |
| Resting heart rate | weighted | 0.25 | `100 / (1 + e^(1.2*Z'))`, `Z' = max(Z, -2)` |
| Sleep | weighted | 0.25 | the **behavioural** sleep score (section 4: duration, stage quality, efficiency, consistency; version 5), limited to 0-100. Not the full score: its restoration part reuses the overnight HRV, heart rate and breathing rate that recovery already weighs |
| Fatigue rating (optional) | weighted | 0.10 | `100*(10 - rating)/9`, rating limited to 1 (fresh) ... 10 (exhausted) |
| Breathing rate | penalty-only | 0.05 | `100 - 40*max(0, Z - 1)`, floored at 0 |
| Skin temperature | penalty-only | 0.05 | `100 - 40*max(0, Z - 1) - 20*max(0, -Z - 1)`, limited to 0-100 |
| Workload ratio (optional, only without caveats) | penalty-only | 0.05 | 100 up to a ratio of 1.30, falling linearly to 0 at 2.00 |

- The logistic curve gives 50 at the personal baseline, about 77 at +1 sigma and 23 at -1 sigma.
  With the Z clamp the HRV sub-score stays between 2.7 and 97.3.
- A resting heart rate lower than usual helps only down to -2 sigma.
- Breathing rate, skin temperature and the workload ratio are stability checks: they can only take
  points away, at most 5 each. A missing or normal-reading one changes nothing (version 2 put them
  into the mean with a neutral 100, so a sensor that did not sync lowered the score through the
  renormalisation).
- All weights, the steepness 1.2, the penalty slopes and the category edges are *calibration*; the
  composite has not been validated against any outcome.

**Missing inputs.** `w_i' = w_i / sum w_j` over the *weighted* inputs that are present. A missing
weighted input's weight is shared out in proportion among the rest (without sleep, HRV carries
0.40/0.65), so the score spans 0-100. A non-finite z-score, sleep score or ratio counts as missing.
Hand-checked golden vector (pinned by `RecoveryAdditiveTest`): HRV z 0.4 (sub-score 61.77), RHR z 0,
sleep 80 gives `(0.40*61.77 + 0.25*50 + 0.25*80)/0.90 = 63.57` with or without breathing and
temperature at z 0; breathing at z 2 gives 61.57.

**No guessing.** At least one of HRV or resting heart rate is required. With neither, the result
is `CALIBRATING` (baselines still forming) or `UNAVAILABLE`.

**Categories.** Rounded score 67-100 Peak (train hard) · 34-66 Moderate (maintain) · 0-33
Restorative (prioritise recovery). *Calibration.*

**Contributors.** A weighted input's effect is `w_i'*(S_i - neutral)`, with neutral = 50 for HRV,
resting heart rate and the fatigue rating and 75 for sleep; a penalty-only input's effect is
`-w_k*(100 - S_k)`. Only effects of at least 1 point are listed.

## 3. Cardiovascular strain (0-21)

Shown as **DERIVED CARDIO STRAIN (0-21 SCALE)**.

**Heart-rate reserve fraction:** `dHR = (HR - HRrest) / (HRmax - HRrest)`, limited to 0...1.
HRrest is the **resting-heart-rate baseline centre** (version 3), so every day of a replay is
measured from the same zero; today's own reading only stands in while no baseline exists. The
resting series (resting or sleeping heart rate) is chosen once per 30-day window, by which has more
readings in the 30 days before the day, never per day.

**TRIMP per minute (Banister 1991; Morton et al. 1990):** `dHR * a * e^(b*dHR)`
with a = 0.64, b = 1.92 (men); a = 0.86, b = 1.67 (women); the average of both weightings when sex
is not given (*calibration*). Minutes with dHR below 0.30 (the reserve floor, *calibration*) are
ignored so that sixteen waking hours of sitting and walking do not swamp real training. At the floor
the per-minute value jumps from 0 to 0.34 (men) or 0.43 (women): daily TRIMP never decreases with
heart rate but it is not continuous there. Banister's TRIMP was defined for exercise sessions; its
use on all-day wrist heart rate is an Apex extension.

**Daily TRIMP:** the sum of `minutes * TRIMP per minute` over every one-minute heart-rate bucket of
the day. Samples with a non-finite or non-positive duration or heart rate are skipped. A day is
only stored as a load (`DAILY_TRIMP`) when it has at least **600 recorded minutes** (version 3,
*calibration*); with fewer, the band was off or not synced and the day is missing, though its
strain is still shown as a lower bound. Today is never part of the load series.

**Scale:** `Strain = 21 * ln(1 + TRIMP/20) / ln(1 + 600/20)`, capped at 21; a non-finite TRIMP gives 0
(the pipeline never passes one). 20 and 600 are *calibration*. Hand-checked anchors (HRrest 50,
HRmax 190, sex unspecified, pinned by `StrainEngineTest`): 30 min at 60 % of reserve gives TRIMP 39.3
and strain 6.65; 60 min at 85 % gives 174.1 and 13.90; 3.5 h at 80 % gives 524.6 and 20.21.

**Heart-rate zones:** lower limits at 50/60/70/80/90 % of HRmax (zones 1-5, the default) or, as an
option, of heart-rate reserve above resting (Karvonen). The fractions are conventions, not validated
cut-offs.

**HRmax:** a value the user enters (100-240 bpm) wins, labelled user-reported. Otherwise the higher
of the age prediction `208 - 0.7*age` (Tanaka et al. 2001, labelled ESTIMATED, individual error
about 10 bpm) and a **robust observed maximum** (version 3): the 99.5th percentile of the
one-minute heart-rate averages between 100 and 240 bpm over the last 180 days, taken as the value
with `floor(n * 0.005)` minutes above it, needing at least 600 such minutes (otherwise the
prediction alone). Version 2 used the single highest minute, so one optical glitch became HRmax for
six months. The 99.5 %, 600 minutes and 100 bpm floor are *calibration*. With no age the observed
value alone is used; it is a lower bound of the true maximum, so strain from it errs high.

**Target strain (version 3):** `base = EWMA(alpha 0.25, normalised weights)` of the strain of the last
14 days with a recorded load (strain computed from the stored `DAILY_TRIMP`; missing days skipped,
not zeroed; at least 5 recorded days, otherwise no target). `center = base * (1 + 0.6*(Recovery - 50)/100)`,
window = center +/- 1, limited to 0-21 (*calibration*, guidance only): a base of 10 gives 7 at
recovery 0, 10 at 50 and 13 at 100. The fixed scale `6 + 12R/100` of version 2 is gone: it was a
population norm. Remaining capacity = TRIMP at the window's upper edge - TRIMP so far, also
converted into minutes at the midpoint of each zone; it needs a strain for the day (no heart-rate
data means nothing is "left"). The zone model and the reserve floor are those of the engine that
scored the day; zones whose midpoint earns no load are left out.

## 4. Sleep

### Sleep need

`need = base + strain surcharge + debt surcharge`, at most 10 h.

- **Base:** 7 h 45 min, or once 14 nights exist the 75th percentile (linear interpolation) of the
  last 30 nights, kept within 7-9 h (a month of short nights shows a habit, not a small need). The
  7-9 h range follows the adult recommendations of Hirshkowitz et al. 2015 and Watson et al. 2015;
  7 h 45 min, the percentile and the 14-night rule are *calibration*.
- **Strain surcharge (version 3):** `base * 0.02 * max(0, z)`, where `z = (yesterday's strain - mean) / SD`
  over the athlete's own last 30 recorded strain days before it (at least 7; sample SD, never below
  1 strain point; z capped at 3). A strain one SD above the mean adds 2 % of a 465-minute base,
  9.3 minutes. Missing strain, fewer than 7 prior days or a non-finite value adds nothing. The
  2 %, the 7 days, the SD floor and the cap are *calibration*; the personal-z form follows the Bevel
  study. Version 2 added 3 min per strain point above 10, which depended on this app's own strain scale.
- **Debt surcharge:** 50 % of the accumulated debt, at most 90 min. (The cap is a safeguard
  added to the specification: without it a week of six-hour nights would prescribe a
  fourteen-hour night.)

### Sleep debt

Sum over the 7 nights before today of `(base + strain surcharge) - (main sleep + naps of that day)`.
A long night repays at most 60 min; nights without data (or with non-finite values) are skipped,
not counted as zero sleep; one night per day; the total is never negative. With **fewer than 4
recorded nights** in the window the debt is unknown (null): it is not stored, no debt surcharge is
added, and the screen must not show 0. (Version 2 returned 0 with no night and counted only main
sleeps; the 4-night minimum is *calibration*.)

### Sleep score (0-100), formula version 5

Apex's own transparent calculation, not the Fitbit / Google Health score (proprietary, not exposed by the API) and not a
clinical measurement. Scale: 100 is an ideal night; an ordinary adequate night scores about 75-85; a short or
physiologically poor night about 55-75. Each part sits near 80 for an ordinary night.

| Part | Weight | Sub-score (0-100) | Status |
|---|---|---|---|
| Duration | 0.35 | target `T = max(need, 420)`; `100*(asleep - (T - 225))/225`, limited to 0-100 | 420 min = adult consensus minimum (Watson et al. 2015, AASM/SRS, adults 18-60; recalled, unverified). 225 min and the linear ramp: *calibration* (7 h against the default 7 h 45 min need scores 80) |
| Restoration | 0.25 | `z = mean(-z_sleepHR, z_lnRMSSD over those present) - 0.5*max(0, z_breathing - 1)`, each z and the result limited to +/-3; `80 + 20*z` for z >= 0, `80 + 30*z` for z < 0, limited to 0-100 | z from the 30-day mean/SD baselines (section 1; ln RMSSD after Plews et al. 2013, Buchheit 2014). Lower sleeping HR and higher HRV than one's own usual are the direction of better recovery in those works; the weights, 80/20/30 and the breathing threshold and slope are *calibration* |
| Stage quality | 0.15 | with a personal deep + REM baseline: `80 + 10*z`; while calibrating: 80 inside 38-50 %, `80*share/0.38` below, minus 1 per point above 50 % (at most 10) | *calibration*. Consumer-wearable stages are not polysomnography stages (de Zambotti et al. 2019; Chinoy et al. 2021: moderate agreement), so the absolute band is only a provisional stand-in and can never score above 80 |
| Efficiency | 0.15 | 0 at <= 65 %, 75 at 85 %, 100 at >= 95 %, linear between; minus 3 per awakening > 3 min beyond the first two (at most 25) | 85 % = the "good sleep quality" indicator of Ohayon et al. 2017 (Sleep Health, National Sleep Foundation expert panel; recalled, unverified). 65/95 and the wake-bout penalty: *calibration* |
| Consistency | 0.10 | Sleep Regularity Index of the last 7 windows, limited to 0-100 (below) | SRI: Phillips et al. 2017. Using `max(0, SRI)` as the sub-score is *calibration*; a typical adult SRI is around 80 (UK Biobank accelerometry, Windred et al. 2024; recalled, unverified), consistent with the "ordinary night near 80" anchor |

**Behavioural score.** The same weighted mean over duration, stage quality, efficiency and consistency only
(re-weighted to 1). It is what the recovery score receives as its sleep input (section 2), so overnight HRV, heart rate
and breathing rate are never counted twice.

**Missing parts.** A part that cannot be computed is never filled in (no z because the night had no reading or the
baseline is calibrating; no stages; a staged night with neither deep nor REM, which is a staging failure; no time in
bed; no regularity index). Its weight is shared among the rest and the result carries `availableWeight` (sum of the
nominal weights present) and `confidence`: HIGH >= 0.85, MEDIUM >= 0.60, LOW below (*calibration*). Breathing rate alone
never makes restoration available (it only subtracts, so alone it would show a constant 80: a made-up value). The
daytime resting heart rate is never substituted for a missing sleeping heart rate (a different measurement).

**Worked example (the owner's night).** 420 min asleep of 440 in bed, deep + REM 168 min (40 %), one long awakening,
need 465 min, identical bedtimes (SRI 100):

| | Duration | Restoration | Quality | Efficiency | Consistency | Score |
|---|---|---|---|---|---|---|
| Sub-scores | 100*(420 - 240)/225 = 80 | see rows | 80 (band, calibrating) or 80 (z = 0) | 95.45 % -> 100 | 100 | |
| No overnight baselines yet | 0.35*80 | - | 0.15*80 | 0.15*100 | 0.10*100 | 65/0.75 = **86.7** (MEDIUM, partial) |
| HR and HRV at baseline (z = 0) | 28 | 0.25*80 = 20 | 12 | 15 | 10 | **85.0** |
| Sleeping HR +1.5 sigma, HRV -1.5 sigma: z = -1.5, 80 - 45 = 35 | 28 | 0.25*35 = 8.75 | 12 | 15 | 10 | **73.75** |
| Version 4, same night | 0.40*90.3 | - | 0.25*100 | 0.20*100 | 0.15*100 | 96 |

Pinned by `SleepEngineTest` (hand-computed golden vectors, monotonicity of restoration, weights and missing-part
properties) and `SleepBandsTest`.

**Sleep Regularity Index (version 3):** each minute of a local noon-to-noon window is asleep or awake
(main sleeps and naps), and `SRI = -100 + 200 * P(same state at t and t + 24 h)` over the minute
pairs of consecutive windows (Phillips et al. 2017, unverified). Seven identical nights give 100;
alternating 22:00-06:00 and 02:00-10:00 nights give `200*(1 - 480/1440) - 100 = 33.3`; alternating by two hours gives
66.7 (research vector T-SL03-b). A window with no recorded main sleep is skipped together with its pairs (never counted
as awake); at least 2 usable pairs are needed, otherwise the part drops out. Clock times use the local offset recorded
with each session. The spread of bed and wake times (circular statistics, so 23:50 and 00:10 are 20 minutes apart) is
still reported for display; direct callers of the engine without an index may score it (100 up to 45 min, 0 at 150),
the pipeline does not. A night counts as sufficient for recovery when it covers at least 90 % of the need. `asleep`
must be finite; the engine refuses a night with an unknown sleep duration (pass no night).

**Not scored, by decision.** Provider-reported time to fall asleep (`SLEEP_LATENCY`) is stored and shown as reported;
`SleepNightInput` has no field for it (`SleepEngineTest`). A reported 0 is captioned "not measured" through
`SleepLatency` (for automatically detected sleep the Fitbit sleep log reports 0; recalled, unverified for the Google
Health API). The sleeping heart-rate dip (8.3) is shown separately and is not part of the score (blood-pressure concept,
not validated for wrist heart rate).

**Known limits.** No part is validated against an outcome; the score is a within-person summary. A very short night is
held down by duration (35 %) and by the band cap below, not by a hard score cap. Restoration needs 7 nights of sleeping
heart rate or HRV before it exists.

### Sleep debt and guideline shortfall: two distinct figures

- **Sleep debt** (primary, `SleepNeed.accumulatedDebtMinutes`, above): against the personal need, 7 nights, naps count,
  at most 60 min repaid per night, unknown below 4 recorded nights. Drives the debt surcharge.
- **Guideline shortfall** (secondary, `research.SleepRegularity.guidelineShortfall`): against 420 min or the user's own
  target, clipped `sum max(0, target - TST)` and signed `sum (target - TST)`, at least 5 nights, missing nights skipped
  (*calibration*; Van Dongen et al. 2003 for cumulative restriction effects, not for minute-for-minute repayment).
  Shown, if at all, as "shortfall against 7 h", never as "debt" (`docs/DECISIONS.md` D17).

### Sleep screen bands (Poor / Sufficient / Optimal), version 5 - implemented in `SleepBands`, not yet wired

The app's `SleepMapping.kt` (`statusOfPercent`) still labels five different figures with one 70/85 rule. `SleepBands`
(`:core:analytics`, `SleepBandsTest`) holds the aligned rules for the screen to adopt; every threshold is
*calibration*, not a validated cut-off.

| Row | Figure | Poor | Sufficient | Optimal | Why |
|---|---|---|---|---|---|
| Overall | score | < 70 | 70-85 | >= 85 | Matches the version-5 scale: ordinary nights land Sufficient (75-85), nights calmer than usual Optimal, strained or short nights Poor. **Capped by duration**: under 90 % of the target at most Sufficient, under 70 % Poor (the version-4 leak, a 5 h 25 min night labelled Optimal, is closed; version 5 itself already scores it 78.3, not 88) |
| Duration | asleep / target | < 90 % | 90-100 % | need met | The engine's own 90 % "sufficient for recovery" rule; 70 % of need is below the 7 h floor |
| Efficiency | raw asleep / in bed | < 75 % | 75-85 % | >= 85 % | 85 % after Ohayon et al. 2017; 75 % *calibration* |
| Stage quality | QUALITY sub-score | < 70 | 70-85 | >= 85 | The usual share (80) is Sufficient, +0.5 sigma Optimal, below -1 sigma Poor. Never the raw share: a normal 45 % share read as Poor under the old row |
| Consistency | consistency sub-score (SRI) | < 70 | 70-85 | >= 85 | Typical SRI ~80 is Sufficient |
| Restoration | combined z | <= -1 sigma (sub-score <= 50) | -1 to +0.5 sigma | >= +0.5 sigma (>= 90) | Outside the personal normal range (+/-1 sigma, section 1) on the strained side is Poor |

## 5. Training load

Built on daily TRIMP. A day with no heart-rate data, a **partly worn day (under 600 recorded minutes)**,
**today** (still accumulating) or a non-finite TRIMP is treated as unknown and leaves the averages
unchanged; a well-worn day with no load counts as zero. If a day is listed twice, the first valid
entry wins.

- **Acute load (ATL, "fatigue"):** 7-day exponentially weighted average, `d = 1 - 2/8 = 0.75`.
- **Chronic load (CTL, "fitness"):** 28-day exponentially weighted average, `d = 1 - 2/29`.
- **Normalised weights (version 2):** over the recorded days so far, newest first,
  `y = sum_i d^i * x_i / sum_i d^i`, computed recursively as `S = x + d*S_prev`, `W = 1 + d*W_prev`,
  `y = S / W`. A constant load returns that constant from the first day; after a long history `W`
  tends to `1/a` and `y` equals the usual recursive EWMA (Williams et al. 2017). Seeding the
  recursion with the first day instead (version 1) kept a 39 % weight on that day after 14 days of a
  28-day average; the choice of initialisation is *calibration* because the paper does not give one.
- **Coupled ratio:** `ATL / CTL`. Reported once 14 days of history exist, at least 14 of the last 28
  days are recorded (version 3; two recorded days 13 days apart are not a ratio), and CTL > 0.
- **Uncoupled ratio:** mean of the last 7 days / mean of the 21 days before them. Needs 28 days
  of history, at least 5 recorded days in the acute week and 14 in the chronic window. Because the
  acute week is not part of its own denominator, a spike shows at full size.
- **Load confidence (version 3):** `density = min(1, active days in the last 42 / 28)`, where an active
  day is a recorded load above 5 TRIMP; `recency = min(1, 0.25 * sum over the 16 days before today of
  (1 - 0.0625*daysAgo) for active days)`, today excluded; `confidence = min(density, recency)`. Below
  **0.35** the result is *calibrating*: both ratios and the zone are null while ATL, CTL, monotony and
  the rest are still reported. The form and the constants come from the Bevel study (not peer
  reviewed), adapted from "every day counts" to recorded days: *calibration*.
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

**Recovery uses the ratio only without caveats:** yesterday's uncoupled ratio is computed fresh from
the loads before today and passed to recovery only when no caveat applies.

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
| HRV weekly average below range | the weekly HRV status (below) is below range or markedly below (version 3) |
| Resting heart rate elevated | Z >= +1.5 |
| Resting heart rate sustained elevation | today above the normal range and 3+ days running |
| Breathing rate elevated | Z >= +2 |

**Weekly HRV status (version 3).** Week = the last 7 nights, at least 4 with a reading; baseline =
the 60 nights **before** the week, at least 21 with a reading; both on the ln RMSSD scale. `mu` and `sd`
(sample SD, never below 0.05) come from the baseline. Within range: week mean within `mu +/- 0.75 sd`;
above or below range outside it; markedly below under `mu - 1.5 sd`. The baseline ends before the week,
so a sustained fall cannot dilute its own reference (version 2's baseline contained the week and stopped
flagging a 17 % fall after about 12 days; with a 30-night baseline it still stopped after about 25 days of
the fall, with 60 nights it flags it on day 30, the pinned `G2` vector). The signal is raised for "below
range" and "markedly below"; the 0.75 / 1.5 / 4 / 21 / 60 constants are *calibration* (the form and the
60 nights follow the reference app's weekly status, itself an implementation of a vendor feature).

**Not evaluable (version 3).** When neither HRV nor resting heart rate has a z-score and no signal is
present (baselines calibrating, or no reading today), the assessment has `evaluable = false`; its level
is NONE but means "unknown", and screens must show it as not available, never as "no signals".

Level: **none** (no signal) · **watch** (any signal that is neither sustained nor backed by the
other system, including a breathing-rate signal alone) · **elevated** (HRV and resting heart rate
both flagged, or a sustained signal) · **high** (both systems flagged and at least one sustained).
All thresholds are *calibration*. The signals mean recovery may be incomplete; they describe
physiological load and do not diagnose illness or overtraining.

## 7. Fallback VO2 max estimate

Only when the wearable has not reported a VO2 max: `15.3 * HRmax / HRrest` (Uth et al. 2004),
always labelled ESTIMATED, only for HRrest 25-120 and HRmax 100-240 bpm. It was derived in trained
men, is not adjusted for sex and is suitable for following a trend, not as an absolute value.

## 8. Version 4 outputs: formulas, constants and status

Source and verification notes carried over from the review that added the engines. "Calibration choice" means a value picked for usability that has no
published validation. "UNVERIFIED" means the source was not opened in the session that wrote the engine (the session could not reach pubmed/PMC/PLOS);
the claim comes from memory or from the Pulse reference repo. Sources actually opened: the Pulse reference code in
`reference/design/pulse-main-cleaned/src/core/algorithms/stress.ts`, `scoring/stressBase.ts`, `algorithms/energyBank.ts`, `algorithms/fitnessLevel.ts` and
`reference/design/pulse-mobile-main/src/core/engine/{sleep,strain}.ts` (code and comments only; no text copied). `docs/review/BEVEL_ALIGNMENT.md` section 1.6
says neither Pulse's stress nor energy model is validated. No paper below was opened.

All outputs are display context. None is diagnostic. Fatigue-style wording: "may indicate", never "you are ill". Missing data stays missing: every
engine returns null plus a reason enum, never 0 and never a population value.

### 8.1 Daytime stress (`stress/StressEngine.kt`)

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
Bevel-style products blend HR percentile and HRV; this engine does not. The pipeline stores `dayAggregateBpm` per day (`STRESS_DAY_AGGREGATE_BPM`, also while calibrating) and feeds the previous 30 stored values back as the baseline.

### 8.2 Energy bank (`energy/EnergyEngine.kt`)

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

### 8.3 Sleeping heart-rate dip (`sleep/HeartRateDip.kt`)

dip = (daytime mean HR - sleeping mean HR) / daytime mean HR, signed. DIPPER if dip >= 0.10, BLUNTED if 0 <= dip < 0.10, REVERSED if < 0.
Daytime mean should exclude exercise. Minute-list entry point needs >= 30 valid minutes each side (calibration choice).
Source: the nocturnal dipping convention from ambulatory blood-pressure monitoring (>= 10 % night-time fall). Applying it
to heart rate is by analogy: **UNVERIFIED for HR; the 10 % threshold is a calibration choice**, not a validated HR cut-off. Pulse (`sleep.ts` `hrDip`)
uses 1 - sleeping HR / inactive-HR baseline, floored at 0, with age/sex targets of about 25-30 %; Apex follows the requested daytime-mean form and keeps the sign.
A blunted or reversed value can follow late exercise, alcohol, heat, illness or a short night: "may indicate" at most.

### 8.4 Post-workout HR recovery (`strain/HeartRateRecovery.kt`)

peak = max minute-mean HR over the last 3 workout minutes (all 3 must have HR); drop60 = peak - mean HR of the first full minute after the end;
drop120 = peak - mean HR of the second. Missing peak minute -> null; a missing recovery minute removes only that drop; optional minimum peak (e.g. zone 4) -> null below it.
A negative value (HR rose) is returned as is. Minute-means and the minute-average "at 60 s" understate the true drop (calibration choices; direction known, size not).
Concept: HR fall after peak exercise as a prognostic marker, Cole et al. 1999, N Engl J Med 341:1351-1357 (1-minute drop <= 12 bpm abnormal after
treadmill testing) -- **UNVERIFIED**. Apex does not apply that cut-off (different protocol, population and sampling); values are personal-trend context only.
Pulse (`strain.ts` `hrRecovery`) instead takes the largest drop inside any 120 s window starting at or before the active end, from raw HR and only after zone 4; not used here.

### 8.5 Journal effects (`journal/JournalEffects.kt`, `journal/WelchTTest.kt`)

For each binary factor: pair factor on day d-1 with outcome on day d (recovery points; ln RMSSD), outcome days in the last 90 days, drop unlogged factor days and
unmeasured outcomes, require >= 5 per arm (calibration choices: 90 days, 5 per arm). Welch two-sided t-test, alpha = 0.05, 95 % CI:
SE = sqrt(s1^2/n1 + s2^2/n2), t = (m1 - m2)/SE, df = Welch-Satterthwaite, CI = diff +- t(0.975, df) SE. HRV effect is reported as 100(e^d - 1) percent with the CI transformed alike.
Student t via the regularised incomplete beta function (Press et al., Numerical Recipes, continued fraction; Lanczos log-gamma) -- UNVERIFIED reference, but pinned in
tests against t-table critical values (df 1, 2, 5, 8, 10, 30, inf) and a numerically integrated p-value (t = 5, df = 8: 0.0010528; t = 2, df = 8: 0.080516).
Welch 1947, Biometrika 34:28-35 -- UNVERIFIED citation (textbook method). ln(RMSSD): Plews et al. 2013 (Int J Sports Physiol Perform), Buchheit 2014 (Front Physiol) -- UNVERIFIED.
Limits: observational and confounded; day-to-day autocorrelation breaks the independence assumption, so the interval is optimistic; no correction for the number of factors
(`testsPerformed` is returned so the UI can caveat); with 5 per arm the interval is wide. Wording: "was associated with", never "caused". An interval that excludes 0 is not a finding to act on alone.

### 8.6 VO2max category (`fitness/Vo2Category.kt`)

Percentile of the athlete's VO2max in the FRIEND treadmill table for the age decade (20-29 ... 70-79) and sex, linear between the 5/10/25/50/75/90/95 columns, clamped to 5..95
(`atTableEdge` flags a bound). Category floors at percentile 20/40/60/80: poor / fair / good / excellent / superior (calibration choice from Pulse `fitnessLevel.ts`;
FRIEND publishes percentiles, not named categories). Age outside 20..79 or sex unspecified -> null (no row to use; no pooling).
Source: Kaminsky LA, Arena R, Myers J. Mayo Clin Proc 2015;90(11):1515-1523, treadmill, 7,783 apparently healthy adults, RER >= 1.0 -- **UNVERIFIED**: numbers are a
transcription from the Pulse repo, not checked against the paper. A wearable VO2max estimate usually errs by several ml/kg/min, so a category boundary is not sharp.

### 8.7 Fitness age (`fitness/FitnessAge.kt`)

Age at which the reference population's mean VO2max equals the athlete's (linear inversion of a strictly decreasing curve; `fitnessAge - chronologicalAge`, negative = fitter).
**The HUNT regression coefficients (Loe et al. 2013, PLoS ONE 8(5):e64319; Nes et al.) could not be opened and are not in the code** (a remembered pair of coefficients
failed a sanity check against the 54.4 / 43.0 ml/kg/min means of ages 20-29 quoted in a search snippet, so it was not used). The default curve is the FRIEND 50th percentile at
decade midpoints 25..75 (UNVERIFIED transcription, a registry median of lab-tested healthy adults, higher than a general-population mean, so fitness age reads older than a HUNT-mean version would);
`Vo2AgeCurve.linear(intercept, slopePerYear, minAge, maxAge)` takes the HUNT line once verified. No extrapolation: outside 25..75 the age is clamped and flagged (`YOUNGER_THAN_RANGE` / `OLDER_THAN_RANGE`).
Null without VO2max, age (20..79) or sex. Several ml/kg/min of input error is several years of fitness age: show as "about".

### 8.8 Time in HR zones per day

Already computed: `StrainEngine.evaluate(...).minutesByZone` (all recorded minutes by `HeartRateZone`, including rest). No new engine was added; the pipeline exposes it as `DayAnalysis.zoneMinutes`.

## References

Full details, populations and errors are in `docs/EVIDENCE.md`. All were recalled, none opened in the
version 2 or version 3 reviews (unverified). The sources of section 8 are listed in 8.1-8.8.

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
- Phillips AJK et al. (2017). Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep 7:3216.
- Plews DJ et al. (2013). Training adaptation and heart rate variability in elite endurance athletes. Sports Med.
- Plews DJ et al. (2014). Monitoring training with heart-rate variability: how much compliance is needed for valid assessment? Int J Sports Physiol Perform.
- Buchheit M (2014). Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol.
- Tanaka H, Monahan KD, Seals DR (2001). Age-predicted maximal heart rate revisited. J Am Coll Cardiol.
- Uth N et al. (2004). Estimation of VO2max from the ratio between HRmax and HRrest. Eur J Appl Physiol.
- Watson NF et al. (2015). Recommended amount of sleep for a healthy adult. Sleep.
- Williams S et al. (2017). Better way to determine the acute:chronic workload ratio? Br J Sports Med.

## Pulse parity engines

Seven pure-Kotlin engines that re-implement the behaviour of the Pulse Mobile feature set (goals, weekly plan, period report, blood-pressure category,
nutrition log, breathing timer, spot HRV) from the behaviour description, not from Pulse's code. **They are display-time arithmetic over plain inputs: none
stores a derived score, so `ANALYTICS_ALGORITHM_VERSION` is not bumped.** Every constant below is an Apex product or calibration choice unless a source is
named; sources and their verification status are in `docs/EVIDENCE.md`, "Pulse parity engines". Every result carries a reason enum when a value is missing;
none returns 0 for missing, and none is diagnostic. Tests: `GoalEngineTest`, `WeeklyPlanTest`, `ReportEngineTest`, `BloodPressureTest`, `NutritionTest`,
`BreatheTest`, `SpotHrvTest` (hand-computed expectations).

### P1. Goals (`goals/GoalEngine.kt`)

Kinds: DAILY_STEPS, DAILY_SLEEP_MINUTES (daily); WEEKLY_ACTIVE_MINUTES, WEEKLY_AZM, WEEKLY_RECOVERED_DAYS (weekly). There is no default target.

| Rule | Value | Basis |
|---|---|---|
| Achieved | value >= target (exactly the target counts) | convention |
| Not recorded | a day with no value (absent, null, negative or non-finite) is "not recorded": never achieved, never 0; a recorded 0.0 is a value | missing stays missing |
| Progress fraction | value / target, not capped; `achieved` separate | convention |
| Provisional | today is provisional while the target is not met | convention |
| Current streak | consecutive achieved days ending today if today is achieved, else ending yesterday; an unfinished today does not break it; a not-recorded or short day ends the run | convention |
| Best streak | longest run of consecutive achieved days up to today | convention |
| Weekly total | sum of recorded days from the week start (configurable weekday, default Monday) to today; `totalIsLowerBound` when a day in that span is not recorded; days after today ignored | convention |
| Days left | from today to the week end inclusive (today can still add) | convention |
| Pace | `remaining / daysLeftInclToday`, `remaining = max(0, target - total)`; null when nothing is recorded | convention |
| Recovered day | recovery score >= 67 = `RecoveryEngine.Config().peakThreshold`, reused, not copied | Apex calibration choice of the recovery engine (section 2), not clinical |

### P2. Weekly plan (`plan/WeeklyPlan.kt`)

Input: personal strain base (nullable), today's recovery (nullable), load zone and a calibrating flag, sleep need, unavailable days. Output: 7 days with a band
(REST, LIGHT, MODERATE, HARD), a strain centre, a sleep target, `confidence`, and `suggestionOnly = true` (always). Not a training prescription.

| Rule | Value | Basis |
|---|---|---|
| No strain base | no plan (`STRAIN_BASE_MISSING`); no population default | missing stays missing |
| Default template | MODERATE, HARD, LIGHT, HARD, MODERATE, LIGHT, REST | calibration choice (generic hard/easy alternation; not validated) |
| First day, recovery < 34 | REST (`LOW_RECOVERY`) | 34 = lower edge of the MODERATE recovery band, calibration choice |
| First day, load zone HIGH_RISK | REST; OVERREACHING: at most LIGHT; calibrating load: zone ignored | calibration choice; the workload ratio is contested (Impellizzeri 2020) so it only shortens one day |
| Unavailable days | REST, flagged | athlete input |
| Invariants (any template) | no two HARD in a row (later one -> MODERATE); at most 3 HARD (latest ones -> MODERATE); at least 1 REST (latest least-demanding day -> REST) | calibration choice; property-tested over all 4^7 templates |
| Strain centre | `base x factor`, capped at 21; HARD 1.3, MODERATE 1.0, LIGHT 0.7, REST 0.4 | 1.3 and 0.7 mirror the +/-30 % recovery scale of the strain target (section 3); REST 0.4 is a calibration choice |
| Sleep target | the supplied sleep need, every night; null if not supplied | no validated rule for extra sleep before or after hard days |
| LOW confidence reasons | `LOAD_CALIBRATING`, `LOAD_MISSING`, `RECOVERY_MISSING`, `SLEEP_NEED_MISSING` (a set) | missing or calibrating inputs |

### P3. Period report (`report/ReportEngine.kt`)

| Rule | Value | Basis |
|---|---|---|
| Period | WEEK = 7 days from the start day; MONTH = to the day before the same date next month; previous period = the same number of days ending the day before the start | convention |
| Means | over recorded days only, for recovery, sleep score, strain, HRV, resting HR | missing stays missing |
| Change vs previous | mean minus previous mean, only when both periods have >= 4 recorded days of that metric; else null + `INSUFFICIENT_CURRENT/PREVIOUS/BOTH` | 4 is a calibration choice |
| Best / worst day | recovery and sleep; ties go to the earlier day | convention |
| Workouts | total of recorded counts (null if none recorded; 0 is a recorded 0); mean strain over days with >= 1 workout and a recorded strain | convention |
| Load status at period end | zone recorded on the last day only, never carried forward; reason `NOT_RECORDED` or `CALIBRATING` | missing stays missing |
| Goal achievements | daily goals: achieved days / days in period; weekly goals: 1 or 0 over the 7 days of a WEEK report; not summarised for a MONTH (`WEEKLY_GOAL_NOT_SUMMARISED_FOR_MONTH`) | convention |
| Coverage | days with >= 1 of recovery, sleep, strain recorded / days in the period | convention |
| SPARSE | coverage < 0.5 (exactly 0.5 is not sparse) | calibration choice |
| In-progress period | with `asOfEpochDay`, only days up to it are used and coverage is measured against those elapsed days | avoids calling an unfinished week sparse |
| Behaviour effects | carried in the supplied order, at most 3; they are associations from `JournalEffects`, not causes | no new statistics |

### P4. Blood-pressure category (`bp/BloodPressure.kt`)

Adult categories of the 2017 ACC/AHA guideline (**citation UNVERIFIED**), mmHg: NORMAL S < 120 and D < 80; ELEVATED 120 <= S < 130 and D < 80; STAGE_1 130 <= S < 140 or
80 <= D < 90; STAGE_2 S >= 140 or D >= 90; CRISIS S > 180 and/or D > 120. One reading: the higher of the systolic and diastolic categories. Average: >= 3 valid readings (calibration
choice; the guideline averages two or more readings on two or more occasions), mean rounded half-up to whole mmHg before classification (calibration choice). Implausible readings (S outside 50-300, D outside
30-200, S <= D) are rejected and counted, never clamped (calibration choice, a typing-error guard). Nothing else is interpreted: no risk, no advice, no trend. A category is a label for the entered numbers,
not a diagnosis; Apex has no blood-pressure sensor, readings are user-entered.

### P5. Nutrition (`nutrition/Nutrition.kt`)

| Rule | Value | Basis |
|---|---|---|
| Totals | per field, sum of known values (>= 0, finite); null when no entry has the field; `incomplete` when any entry lacks it (a lower bound) | missing stays missing |
| Macro energy | protein 4, carbohydrate 4, fat 9 kcal/g; each share is of the sum of the three; needs all three macros complete | Atwater general factors (UNVERIFIED); caveat: rounded averages, fibre ~2 kcal/g, alcohol and label-specific factors are not modelled, so the sum is not the logged kcal |
| Energy balance | intake minus measured total energy expenditure; only if entries exist AND kcal complete AND the day is not provisional AND a measured expenditure exists; else null + reason (`NO_ENTRIES`, `INTAKE_INCOMPLETE`, `DAY_PROVISIONAL`, `NO_MEASURED_EXPENDITURE`) | expenditure is a wearable estimate with a sizeable error; the balance is context, not a weight forecast |
| Calorie target | the user's own number; none or non-positive = `TARGET_NOT_SET`; fraction not capped; remainder may be negative; lower-bound flag when kcal is incomplete | no default target (no population norm) |

### P6. Breathing patterns (`breathe/BreathePattern.kt`)

BOX 4-4-4-4 s; FOUR_SEVEN_EIGHT 4-7-8 s; COHERENT 5.5 s in / 5.5 s out (11 s cycle, about 5.5 breaths per minute); EXTENDED_EXHALE 4 in / 6 out; PHYSIOLOGICAL_SIGH inhale 2 s,
second inhale 1 s, exhale 6 s (**the sigh's durations are a calibration choice**). `phaseAt(elapsedMillis)` returns phase, progress in [0, 1) and completed cycles (the start of a phase belongs to that phase);
negative time throws. `cyclesFor(seconds)` is whole cycles, rounded down. This is a pacing timer; no claim about stress, HRV or health effects is made.

### P7. Spot HRV (`breathe/SpotHrv.kt`)

RMSSD = sqrt(mean of squared successive differences) of RR intervals in ms. Artifact rule: drop non-finite or outside 300..2000 ms (inclusive range kept); drop a beat that differs by more than 20 % from the median of the
range-valid beats in the 5-beat window centred on it (itself included; exactly 20 % is kept; windows use the range-filtered values so one bad beat cannot cascade); differences only between adjacent beats that are both
accepted. Needs >= 30 accepted beats and >= 60 s (sum of the intervals inside 300..2000 ms), else null with `TOO_FEW_BEATS` or `TOO_SHORT_RECORDING`; `NO_ADJACENT_BEATS` if no pair survives. Mean heart rate is 60000 / mean accepted RR.
The result carries `provenanceHint = ESTIMATED`. All thresholds are calibration choices; a spot RMSSD depends on posture, breathing and time of day and must not be compared with the overnight value used by the recovery score.
Hand-checked golden vectors: alternating 800/850 ms x 80 gives RMSSD 50.0 and 72.727 bpm; the repeating 800/820/800/860 x 20 series gives sqrt(156 400 / 79).

## Experimental: health age (`healthage/HealthAge.kt`), D13

**Experimental, off by default in the app (DECISIONS D13). Estimated, not a medical measure, never diagnostic.** Display-time arithmetic over plain inputs; nothing is stored, so
`ANALYTICS_ALGORITHM_VERSION` is not bumped. Test: `HealthAgeTest` (hand-computed vectors, caps, gate, no double counting). **Every constant below is a calibration choice**: its direction and rough size
are anchored on a published population association (listed in `docs/EVIDENCE.md`, "Health age", none opened in full, all UNVERIFIED), converted to years with a Gompertz mortality-rate doubling time of about 8 years
(`years = ln(HR) / ln 2 * 8`; a 9 % higher hazard is about 1 year), then rounded and often damped by hand because the associations are observational and none was validated for estimating one person's age.
Google Research's coachable-health-age (CKM) blog publishes no formula; it is design inspiration only and nothing from it is implemented.

`estimatedAge = chronologicalAge + clamp(sum of capped factor years, -10, +10)`. Positive = older than calendar age. Result: `NoData` (age missing, or outside 18..100), `NotEnoughData`
(gate not met, with reasons and the withheld list) or `Estimate` (estimated age, delta, per-factor years with direction and cap flag, withheld factors with reasons, confidence, provenance `ESTIMATED`).

| Factor (input) | Years | Cap (years) | Min days |
|---|---|---|---|
| VO2 max (ml/kg/min), through `FitnessAge` | `0.25 * (fitnessAge - chronologicalAge)`; needs sex and age 20..79 | +/-5 | 1 (point value) |
| Resting HR baseline (bpm, 30..120) | `(bpm - 65) / 10 * 1.0` | +/-3 | 14 |
| Sleep duration (mean main-sleep minutes, 120..960) | 0 in 7..9 h; below 7 h `0.65 * (7 - h)`, cap 2; above 9 h `1.0 * (h - 9)`, cap 3 | 0..+3 | 14 |
| Sleep Regularity Index (-100..100) | `(75 - SRI) / 10 * 1.0` | +/-2.5 | 14 |
| Daily steps (mean, > 0 and <= 100,000) | below 7,000: `0.75 * (7000 - s) / 1000`; above: `-0.5 * (s - 7000) / 1000` | -1.5..+3 | 14 |
| BMI (kg/m2, 12..70) | `0.5 * (bmi - 25)` above 25, else 0 (underweight side not modelled) | 0..+4 | 1 (point value) |
| HRV (RMSSD) | **never scored**: no validated age/sex norm in the codebase; always listed as withheld `NO_VALIDATED_NORM` | - | - |

Rules. (1) VO2 max is converted with the existing `FitnessAge` and there is no separate fitness-age factor, so fitness evidence is counted once; the 0.25 weight is calibration (a FRIEND male median falls about
1.3 MET per decade, about 7.6 years per MET, whereas a recalled 13 % lower mortality per MET is about 1.6 years: ratio about 0.2). (2) A VO2 max flagged `vo2MaxDerivedFromRestingHr` (the Uth ratio fallback)
is withheld `DERIVED_FROM_RESTING_HR` so resting HR is not counted twice. (3) A factor that is missing, has too few days, is non-finite or implausible is withheld with a reason; it is never imputed, clamped
into range or replaced by a norm. (4) Gate: a usable VO2 max, OR at least 3 of the 4 day-series factors (resting HR, sleep duration, sleep regularity, steps) with >= 14 days; BMI alone does not unlock the estimate.
(5) Confidence from coverage only, of the 6 scorable factors: 5-6 HIGH, 4 MODERATE, 1-3 LOW (it describes how much data went in, not how accurate the age is). (6) Required wording: "estimated", "may indicate", "not a medical measure"; no
health claim, no diagnosis. Active minutes are not an input (steps only).
