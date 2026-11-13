# Formulas

Every number the app computes, with the exact formula and the constants in use. All of it lives
in `:core:analytics` and is covered by unit tests. Formula set version: **3**
(`ANALYTICS_ALGORITHM_VERSION`). Sources, populations, known errors and evidence grades for every
constant are in `docs/EVIDENCE.md`; what changed in version 2 and why is in `docs/AUDIT.md`
("Formula review"); what changed in version 3 and why is in `docs/DECISIONS.md` (D8) and in
`docs/review/METRICS_ALIGNMENT.md` / `docs/review/BEVEL_ALIGNMENT.md`.

These are this app's own calculations. They are not WHOOP, Oura, Garmin or Fitbit scores, and
they are not medical measurements or diagnoses. Constants marked *calibration* set where typical
days land on a scale; they are design choices, not physiology, and are configurable in code. A
score or signal here describes recorded data against the user's own history; wording in the app
must stay "may indicate", never "you are ill".

**Missing data stays missing.** A reading that is absent, `NaN` or infinite is treated as "no
reading": it is skipped, never replaced by zero, an average or a population norm.

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
| Sleep | weighted | 0.25 | the sleep score (section 4), limited to 0-100 |
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

### Sleep score (0-100)

| Component | Weight | Sub-score |
|---|---|---|
| Duration | 0.40 | `min(100, 100 * asleep / need)` |
| Restorative stages | 0.25 | share of deep + REM: 100 within 38-50 %; `100*share/0.38` below; minus 1 point per percentage point above 50 % (at most 10); then +/-5 points per sigma versus the personal usual (limited to +/-2 sigma) |
| Efficiency | 0.20 | `asleep / in bed`: 0 at 65 %, 100 at 92 %, linear between; minus 3 points per awakening longer than 3 min beyond the first two (at most 25) |
| Consistency | 0.15 | Sleep Regularity Index of the last 7 windows, limited to 0-100 (below) |

All weights and anchors are *calibration*, not validated sleep-quality cut-offs; consumer-wearable
sleep stages are not polysomnography stages.

**Sleep Regularity Index (version 3):** each minute of a local noon-to-noon window is asleep or awake
(main sleeps and naps), and `SRI = -100 + 200 * P(same state at t and t + 24 h)` over the minute
pairs of consecutive windows (Phillips et al. 2017, unverified). Seven identical nights give 100;
alternating 22:00-06:00 and 02:00-10:00 nights give `200*(1 - 480/1440) - 100 = 33.3`. A window with no
recorded main sleep is skipped together with its pairs (never counted as awake); at least 2 usable
pairs are needed, otherwise the component drops out. The consistency sub-score is `max(0, SRI)`,
limited to 100 (*calibration*). Clock times use the local offset recorded with each session. The
spread of bed and wake times (circular statistics, so 23:50 and 00:10 are 20 minutes apart) is still
reported for display but no longer scores consistency in the pipeline. Components that cannot be
computed (no stage data, no index, non-finite inputs) drop out and the remaining weights are scaled up, exactly as for
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

## References

Full details, populations and errors are in `docs/EVIDENCE.md`. All were recalled, none opened in the
version 2 or version 3 reviews (unverified).

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
