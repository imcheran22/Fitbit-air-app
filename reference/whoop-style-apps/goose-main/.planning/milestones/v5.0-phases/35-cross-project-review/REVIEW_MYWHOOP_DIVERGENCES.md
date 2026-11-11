# Phase 35: Algorithm Divergences — Goose Rust vs my-whoop Python

**Reviewed:** 2026-06-08
**Scope:** Algorithmic parameter comparison between Goose v5.0 Rust implementation and my-whoop Python reference.

---

## Summary

Six algorithm families compared. Three have **meaningful divergences** that affect
numeric outputs. Two are broadly aligned (within architectural tolerance). One
(EWMA baselines) has a fundamental design difference that is intentional but
undocumented.

| Algorithm | Status | Severity |
|-----------|--------|----------|
| HRV (RMSSD) | DIVERGES | HIGH |
| Recovery Score | DIVERGES | HIGH |
| Strain | WITHIN_TOLERANCE | MEDIUM |
| Calories | WITHIN_TOLERANCE | MEDIUM |
| Sleep Staging | DIVERGES | MEDIUM |
| Exercise Detection | DIVERGES | HIGH |
| EWMA Baselines | DIVERGES (by design) | MEDIUM |

---

## 1. HRV — goose_hrv_v0 vs hrv.py

### Status: DIVERGES (HIGH)

#### 1.1 Minimum-beats cold-start threshold

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Minimum valid intervals to compute | **2** | **20** (`MIN_BEATS`) |

**Root cause:** `goose_hrv_v0` emits an RMSSD result as long as `valid.len() >= 2` (line 979,
`metrics.rs`). The Python reference (`hrv.py:139`) requires `MIN_BEATS = 20` plausible intervals
before the clean pipeline proceeds; below that it returns empty arrays and RMSSD is not reported.

**Impact:** Goose can return an RMSSD from as few as 2 intervals. This is physiologically
unreliable — the Task Force standard requires ~30+ consecutive beats for a meaningful overnight
HRV estimate. The Python reference issues a low_interval_count quality flag at < 30 but also has
the hard 20-beat gate. Goose only emits `low_interval_count` flag at < 30, it does NOT gate
computation. A 2-beat RMSSD will produce wildly different numbers and could drive spurious
recovery scores.

**Correction needed:** Raise the computation gate to at least `MIN_BEATS = 20` (match Python) or
the flag threshold of 30. Currently a hard error only fires at < 2 intervals.

#### 1.2 Ectopic-beat cleaning pipeline

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Ectopic method | Lipponen-Tarvainen median-relative (custom implementation) | neurokit2 Kubios artifact correction (`nk.signal_fixpeaks(method="kubios")`) |
| Kubios fallback on error | N/A | Falls back to range-filtered RR without kubios |

**Root cause:** Goose implements a custom Lipponen-Tarvainen filter per segment. Python uses
neurokit2's Kubios implementation which is the gold standard from the 2019 paper. These will
produce **different artifact removal decisions** on the same input, causing RMSSD divergence.
The Kubios implementation corrects ectopic beats via interpolation; the Rust implementation drops
them (`invalid_rr_policy: drop_and_flag`). This is a fundamentally different correction strategy.

**Impact:** RMSSD values will diverge by > 1 ms on sessions with ectopic beats, failing the
ALG-HRV-04 cross-validation gate (which requires delta <= 1 ms).

**Correction needed:** Either (a) document this as a known permanent divergence and update the
1 ms cross-validation gate accordingly, or (b) port the Kubios interpolation strategy to Rust
(significant work).

#### 1.3 SWS tier selection — identical for Tier 1; different for Tier 2

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Tier 1 (last SWS >= threshold) | last deep segment >= 5 min | last deep episode >= 5 min (= 300 s) |
| Tier 2 (all short deep) | concatenate all deep segments, RMSSD over pooled set | recency-weighted **mean** RMSSD (each episode independently, weighted by position) |
| Tier 2 weighting | equal weighting (segments appended in order, all contribute equally to pooled RMSSD) | explicit weights 1,2,...N (later episodes get higher weight, then weighted mean of per-episode RMSSD) |

**Root cause:** The comments in `goose_hrv_v0` say "recency-weighted" but the implementation
concatenates intervals and computes a single pooled RMSSD (lines 924-946). The Python
`_compute_all_sws_recency_weighted` computes RMSSD per-episode then takes a weighted mean
(weights 1..N). These are not equivalent — pooled RMSSD is dominated by high-count episodes
regardless of position.

**Impact:** Tier 2 RMSSD values will diverge when multiple short deep segments of different
lengths exist. The comment says "recency-weighted" but it is not.

**Correction needed:** Either compute per-episode RMSSD and take the weighted mean, or remove
the "recency-weighted" claim from comments. Pooled equal-weight is a legitimate choice but
it must be accurately documented.

#### 1.4 CONFIRMED items (HRV)

- Range gate [300, 2000] ms: **CONFIRMED** (both use the same bounds).
- Gap threshold 3.0 s for segmentation: **CONFIRMED** (both use `GAP_THRESHOLD_S = 3.0`).
- RMSSD formula (sqrt of mean squared successive differences, N-1 denominator): **CONFIRMED**.
- SDNN uses sample standard deviation (ddof=1): **CONFIRMED** (both use sample SD).
- pNN50 threshold 50 ms: **CONFIRMED**.

---

## 2. Recovery Score — goose_recovery_v0 vs recovery.py

### Status: DIVERGES (HIGH)

#### 2.1 Formula structure

| Aspect | Goose Rust | my-whoop Python |
|--------|-----------|-----------------|
| Formula type | Linear weighted sum of component scores (each clamped to [0,100]) | z-score + logistic squash |
| HRV component | `70 + (hrv/baseline - 1) * 100` (ratio deviation) | z-score with spread: `(hrv - mean) / (1.253 * spread)` |
| RHR component | `70 + (rhr_baseline - rhr) * 5.0` (5 pts/bpm below baseline) | z-score inverted: `(μ_rhr - rhr) / (1.253 * spread_rhr)` |
| Output squash | linear clamp to [0,100] | logistic: `100 / (1 + exp(-1.6 * (Z - (-0.20))))` |
| Neutral point | HRV at baseline → 70 (RHR at baseline → 70) | Z=0 → 58% (matches WHOOP published average) |

**Root cause:** These are entirely different formulas. The Python version is explicitly designed
to approximate WHOOP's z-score + logistic model with a 58% neutral point. The Rust version uses
an ad-hoc linear model with a 70% neutral point. The 12-point difference in neutral calibration
means a user at their personal baseline sees 70% in Goose and 58% in my-whoop — a significant
UX divergence.

**Impact:** Recovery scores from both systems will rarely agree for the same input, even when
baseline values are identical. The absolute numbers are incompatible; the systems cannot be
compared or averaged without transformation.

**Correction needed:** Decide which model is authoritative. If Goose is to track the my-whoop
model, adopt the logistic formula. If Goose uses its own model, document it as a separate
algorithm family and do not call it "goose_recovery" without qualification.

#### 2.2 Weight structure

| Weight | Goose Rust | my-whoop Python |
|--------|-----------|-----------------|
| HRV | 0.35 | 0.60 |
| RHR | 0.20 | 0.20 |
| Respiratory | 0.10 | 0.05 |
| Temperature | 0.10 | not present (skin temp delta is separate) |
| Sleep | 0.15 | 0.15 |
| Prior strain | 0.10 | not present |

**Root cause:** Goose has 6 components (adding temperature and prior strain); Python has 4
(HRV, RHR, resp, sleep). The HRV weight difference (0.35 vs 0.60) is the most significant
divergence — the Python reference explicitly calls out HRV as the "dominant driver" at W=0.60.
Goose weights HRV at 0.35, less than the Python reference.

**Impact:** For the same inputs, HRV changes will have 1.7x less effect on Goose recovery scores
compared to my-whoop. A high-HRV night will recover less in Goose than in my-whoop.

**Correction needed:** If alignment is a goal, increase HRV weight to 0.60 or document the
intentional divergence in the algorithm definition.

---

## 3. Strain — goose_strain_v0/v1 vs strain.py

### Status: WITHIN_TOLERANCE (MEDIUM)

#### 3.1 Edwards zone cut-offs

| Aspect | Goose Rust (v0) | my-whoop Python |
|--------|-----------------|-----------------|
| Zone cut-offs | zones 1-5 by hr_zone_minutes input (pre-classified) | cut-offs at 50/60/70/80/90 %HRR |
| Zone weights | [1.0, 2.0, 3.0, 4.0, 5.0] | [1, 2, 3, 4, 5] |
| Strain map | linear: zone_load / 20.0 → clamped to 21 | logarithmic: 21 * ln(TRIMP+1) / ln(7201) |

**Root cause:** Goose v0 uses a linear map (`zone_load / 20.0`), while Python uses the logarithmic
Banister-style map (`21 * ln(TRIMP+1) / ln(D)`). Goose v1 adds the Banister path but blends it
(50% Edwards + 20% HR reserve + 30% Banister), while Python uses either Edwards or Banister
exclusively.

**Impact:** Moderate workouts (strain 8-14) will produce different numbers. At zone_load = 7200
(theoretical max), Goose v0 returns 21 but Python returns 21 via the log map at a much lower
TRIMP (the log map reaches near-21 much earlier than linear). For typical workouts, the linear
path will produce lower strain estimates than the log map.

**Assessment:** Strain v1 is closer to the Python reference via the Banister path but is still
a blend. The denominator D=7201 matches Python (`STRAIN_DENOMINATOR = 7201.0`). WITHIN_TOLERANCE
given this is explicitly a v0/v1 progression.

#### 3.2 Banister zone midpoints

| Aspect | Goose Rust v1 | my-whoop Python |
|--------|---------------|-----------------|
| Banister input | zone-midpoint approximation (55/65/75/85/95% of HRmax) | per-sample exact HRR fraction |

**Root cause:** Python computes exact `x = (HR - RHR) / HRR` per sample. Goose approximates
using zone midpoints (0.55, 0.65, 0.75, 0.85, 0.95 of HRmax). The zone-midpoint approximation
emits the `banister_trimp_zone_midpoint_approximation` quality flag, which is correct.

**Assessment:** WITHIN_TOLERANCE — zone midpoint approximation is explicitly documented and
flagged. The error is bounded by zone width.

#### 3.3 CONFIRMED items (Strain)

- Banister b constants (male: 1.92, female: 1.67): **CONFIRMED** (both use these values).
- Banister pre-exponential BANISTER_SCALE: **CONFIRMED** (both use 0.64).
- Denominator D=7201: **CONFIRMED** (both use this value).
- Tanaka formula (208 - 0.7 * age): **CONFIRMED**.

---

## 4. Calories — energy_rollup.rs vs calories.py

### Status: WITHIN_TOLERANCE (MEDIUM)

#### 4.1 Keytel formula coefficients

Both implementations use the same Keytel (2005) coefficients. CONFIRMED.

| Sex | Goose Rust | my-whoop Python |
|-----|-----------|-----------------|
| Male: HR coeff | 0.6309 | 0.6309 |
| Male: weight coeff | 0.1988 | 0.1988 |
| Male: age coeff | 0.2017 | 0.2017 |
| Male: intercept | -55.0969 | -55.0969 |
| Female: HR coeff | 0.4472 | 0.4472 |
| Female: weight coeff | -0.1263 | -0.1263 |
| Female: age coeff | 0.0740 | 0.0740 |
| Female: intercept | -20.4022 | -20.4022 |
| kJ→kcal divisor | 4.1868 (per `energy_rollup.rs:1216`) | 4.184 (Python `_WORKOUT_DIVISOR = 251.04 = 60 * 4.184`) |

**Root cause:** Goose uses `4.1868` as the kJ/kcal conversion factor; Python uses `4.184`.
The difference is 0.068%, which is negligible for calorie estimation purposes.

**Assessment:** WITHIN_TOLERANCE — the conversion factor difference is sub-0.1% and does not
affect physiological conclusions.

#### 4.2 Mifflin-St Jeor RMR

Both use the same Mifflin-St Jeor coefficients for whole-day RMR. CONFIRMED.

#### 4.3 Harris-Benedict (per-bout resting)

| Aspect | Goose Rust | my-whoop Python |
|--------|-----------|-----------------|
| Resting burn (fallback) | `weight_kg * 22.0 / 1440.0 * minutes` (simplified, no height/age) | Harris-Benedict per-bout with height/age |
| Active threshold | HR > resting + 30% HRR | HR >= resting + 30% HRR |

**Root cause:** Goose's simple `resting_kcal()` function (line 1244) uses a fixed 22 kcal/kg/day
constant without height or age. Python uses revised Harris-Benedict which incorporates height and
age. The Goose fallback is less accurate for extreme body compositions.

**Assessment:** WITHIN_TOLERANCE for the daily rollup path which has the Mifflin-St Jeor path.
The simple fallback is used when height/age are absent, which is documented.

---

## 5. Sleep Staging — sleep_staging.rs vs sleep.py

### Status: DIVERGES (MEDIUM)

#### 5.1 Epoch duration

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Epoch length | **1 minute** (`COLE_KRIPKE_EPOCH_MINUTES = 1.0`) | **30 seconds** (30 s epoch grid — `sleep.py:10`, `sleep_features`) |

**Root cause:** This is the most significant structural difference. The Goose implementation uses
1-minute epochs throughout (`COLE_KRIPKE_EPOCH_MINUTES`). The my-whoop reference uses 30-second
epochs, which is the te Lindert (2013) variant of Cole-Kripke. 30-second resolution is closer to
the clinical standard and provides finer granularity for stage transitions.

**Impact:** SOL and WASO will have 1-minute resolution in Goose vs 30-second in my-whoop.
Stage boundaries will be coarser by 2x. Short wake episodes < 1 minute will not be detected
by Goose but would be detected by my-whoop.

**Correction needed:** If parity with the Python reference is desired, change `COLE_KRIPKE_EPOCH_MINUTES`
to 0.5 and verify the coefficients. Document as an intentional tradeoff if keeping 1 minute.

#### 5.2 Sleep detection spine

| Aspect | Goose Rust | my-whoop Python |
|--------|-----------|-----------------|
| Primary spine | Cole-Kripke is the primary classifier for Goose | Rolling accelerometer-stillness (`STILL_FRACTION = 0.70`) is primary; Cole-Kripke is a cross-check |
| Activity count method | Inter-sample magnitude difference (g-units) | L2 magnitude change between consecutive samples (`hypot(dx, dy, dz)`) |
| Scale factor | 0.001 (converts to Cole 1992 activity index) | not explicitly scaled; uses GRAVITY_STILL_THRESHOLD_G = 0.01 g |

**Root cause:** Python uses gravity deltas as the primary sleep/wake spine; Cole-Kripke is a
citable cross-check. Goose uses Cole-Kripke as the primary classifier. These produce equivalent
results in practice (both use accelerometer stillness), but the confidence and secondary checks
are reversed.

**Assessment:** Functionally similar but architecturally different. The DIVERGES rating applies
primarily to the epoch duration, which is the operationally significant difference.

#### 5.3 4-class: REM qualification

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| REM condition | `resp_available` AND clock_proxy >= 0.4 AND hr > session median AND >= 15 min from onset | AASM-style staging via sleep_features classifier, respiration RRV, DoG HR-variability |

**Root cause:** Python uses a multi-signal classifier (stage 1-3 pipeline with respiration rate
variability and Walch DoG HR-variability feature). Goose uses a simpler 3-condition heuristic.
The Python pipeline is more physiologically grounded.

**Assessment:** Goose's simplified REM classifier is a known approximation. The `resp_available`
gate (suppressing REM when no respiratory data) is a good defensive choice.

#### 5.4 CONFIRMED items (Sleep Staging)

- Wake threshold D >= 1.0: **CONFIRMED** (both use this threshold).
- Cole-Kripke coefficients [106, 54, 58, 76, 230, 74, 67]: **CONFIRMED**.
- Offsets [-4, -3, -2, -1, 0, +1, +2]: **CONFIRMED**.
- No-REM-onset guard 15 min: **CONFIRMED** (`NO_REM_ONSET_MINUTES = 15.0` matches Python).
- Minimum segment merge 5 min: **CONFIRMED** (`MIN_SEGMENT_MINUTES = 5.0` matches Python `MERGE_MIN = 5` sort-of; Python uses 15 min for outer period merge but sleep_features uses 5 min for stage segments).

---

## 6. Exercise Detection — exercise_detection.rs vs exercise.py

### Status: DIVERGES (HIGH)

#### 6.1 Key constant divergences

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| `MIN_EXERCISE_MIN` | **10.0 min** | **5.0 min** |
| `HR_MARGIN_BPM` | **30.0 bpm** | **15.0 bpm** |
| `MOTION_THRESHOLD` | **0.01** | **0.20** |
| `MOTION_SMOOTH_S` | **3.0 s** | **10.0 s** |
| `MERGE_GAP_S` | **60.0 s** | **150.0 s** |

**Root cause:** All five key constants differ. These are calibration choices, but the differences
are large and systematically make Goose more **conservative** in some dimensions and more
**permissive** in others:

- `MIN_EXERCISE_MIN 10 vs 5`: Goose requires 2x longer duration. A 7-min workout is detected
  by Python but rejected by Goose.
- `HR_MARGIN_BPM 30 vs 15`: Goose requires HR to be 30 bpm above resting (vs 15 bpm). This is
  2x stricter, potentially missing warm-up phases or low-intensity cardio.
- `MOTION_THRESHOLD 0.01 vs 0.20`: Goose has a 20x lower motion threshold. Nearly any movement
  would pass the Goose gate; Python requires visible activity (0.20 g is ~"easy walking" level).
  This is a **major divergence** — Goose will trigger on nearly any motion, Python only on genuine
  physical activity.
- `MOTION_SMOOTH_S 3 vs 10`: Goose uses a 3-second rolling mean vs 10-second. Python's longer
  window better rejects brief spikes.
- `MERGE_GAP_S 60 vs 150`: Goose merges segments with up to 60 s gaps; Python uses 150 s.
  Python explicitly documents why 150 s was chosen (soccer halftime analysis). A 2-minute water
  break would NOT be bridged by Goose (>60 s gap) but would be by Python (< 150 s).

**Impact:** These constants produce qualitatively different exercise session detection:
- Goose will detect many false positives due to the 20x lower MOTION_THRESHOLD (0.01 vs 0.20).
  Nearly any movement triggers the motion gate.
- Goose will miss genuine short workouts (5-10 min) due to the 2x higher MIN_EXERCISE_MIN.
- Goose will miss moderate warm-up phases due to the 2x higher HR_MARGIN_BPM.
- Goose will incorrectly split sessions at water breaks due to the shorter MERGE_GAP_S.

**Correction needed:** The MOTION_THRESHOLD divergence (0.01 vs 0.20) is almost certainly a bug.
A value of 0.01 g is below quantization noise on typical MEMS sensors and will fire on any micro-
movement. The Python value of 0.20 g is explicitly calibrated ("steady walking registers ~0.4–0.8").
The other constants are calibration choices that should be reviewed for parity.

#### 6.2 Zone 2 definition for intensity gate

| Aspect | Goose Rust | my-whoop Python |
|--------|-----------|-----------------|
| Zone 2 lower bound | >= 50% HRR (`zone_of(pct) >= 2` where zone 2 starts at 50%) | >= 60% HRR (`z2plus_frac = sum(zone_pct.get(z, 0.0) for z in (2, 3, 4, 5))` where zone 2 starts at 60%) |

**Root cause:** Goose defines "zone 2" as starting at 50% HRR (`< 50: zone 1, 50-60: zone 2`).
Python's strain module `_EDWARDS_ZONES` defines zone 2 starting at 60% HRR (`(60.0, 2)` means
`pct >= 60 → weight 2`). The exercise.py docstring says "zone 2 or above (i.e. ≥60% HRR)".

This means Goose's `MIN_INTENSITY_Z2PLUS` gate counts samples at 50-59% HRR as "zone 2+", while
Python only counts 60%+ HRR as "zone 2+". Goose's intensity gate is therefore more lenient than
Python's at the 50-60% HRR band.

**Impact:** Sessions with predominantly 50-59% HRR activity would pass Goose's intensity gate
but fail Python's. A "zone 1" walk at 55% HRR counts as "zone 2" in Goose.

**Correction needed:** Align zone boundaries. Either use the Edwards standard (60%HRR = zone 2
lower bound) or document the intentional difference.

#### 6.3 RHR fallback

| Aspect | Goose Rust | my-whoop Python |
|--------|-----------|-----------------|
| When profile_resting_hr is None | Falls back to `daily_hr_p10` or returns empty Vec | Derives from day HR as 10th percentile (`RESTING_PERCENTILE = 10.0`) |
| No RHR available | Returns empty Vec immediately | Requires HR stream; derives p10 from all HR samples |

**Root cause:** Goose requires either `profile.resting_hr` or `profile.daily_hr_p10` to be
pre-computed and passed in. Python derives the RHR from the HR stream itself (10th percentile).
This is an architectural difference: Goose expects the caller to resolve RHR; Python resolves
it internally.

**Assessment:** WITHIN_TOLERANCE architecturally — the 10th percentile is equivalent. But Goose
returns no sessions if neither value is provided, while Python always tries to derive it.

---

## 7. EWMA Baselines — baselines.rs vs baselines.py

### Status: DIVERGES (by design, MEDIUM)

#### 7.1 Alpha / half-life

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Alpha (HRV) | **0.10** (10-night memory constant) | **0.0483** (14-night half-life: `λ = 1 - 0.5^(1/14)`) |
| Alpha (RHR) | 0.10 | 0.0483 |

**Root cause:** Goose hard-codes `ALPHA = 0.10` (10-night effective memory). Python uses
`_lambda(14)` which computes `1 - 0.5^(1/14) ≈ 0.0483` (14-night half-life). These are
different decay constants: Goose forgets 10% of history per night; Python preserves 95.17%
per night (slower decay, longer memory).

**Impact:** After 14 nights, the Python baseline has absorbed the full history with equal weight
from each night. The Goose baseline places much more weight on recent nights. Following a bad
night, Goose baselines will shift faster (more reactive) while Python baselines will be more
stable. Neither is wrong, but they produce different numeric baselines for the same input history.

**Correction needed:** Not necessarily incorrect — both are defensible choices. But the alpha
value should be documented in the algorithm definition as `alpha=0.10 (10-night decay)` not
`10-night memory constant` (which is ambiguous). The 14-night half-life from the my-whoop
research docs is the published target; the discrepancy should be acknowledged.

#### 7.2 Winsorization and outlier rejection

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Winsorization | Not implemented | WINSOR_K = 3.0 (clamp to ±3*spread before EWMA update) |
| Hard outlier rejection | Not implemented (non-finite filtered, but no magnitude gate) | HARD_OUTLIER_K = 5.0 (skip update if >5*spread away) |
| Physiological bounds gate | Not implemented | min_val/max_val per metric (HRV: 5–250 ms; RHR: 30–120 bpm) |

**Root cause:** Goose EWMA only filters non-finite values. Python implements the full doc 06
pipeline: physiological bounds → hard outlier rejection → Winsorization → EWMA update.
A single outlier night (e.g., sensor artifact producing 250 ms HRV) will permanently corrupt
the Goose baseline; Python would reject it via the hard outlier gate.

**Impact:** Goose baselines are vulnerable to sensor artifacts and outlier nights. A single
corrupted HRV reading will shift the EWMA by 10% permanently (vs being rejected by Python).

**Correction needed:** Add at minimum:
- Physiological bounds gate (reject HRV outside 5-250 ms, RHR outside 30-120 bpm).
- Hard outlier rejection gate (reject nights >5*spread from current baseline).

#### 7.3 Spread tracking

| Parameter | Goose Rust | my-whoop Python |
|-----------|-----------|-----------------|
| Spread | EWMA of `(x - old_mean)^2` (variance) | EWMA of `|x - new_mean|` (absolute deviation) |
| Z-score sigma | `sqrt(variance)` | `1.253 * spread` (converts MAD-scale to Gaussian sigma) |

**Root cause:** Goose tracks variance and computes sigma as `sqrt(variance)`. Python tracks
absolute deviation (MAD-like spread) and converts to sigma via the 1.253 factor
(`E[|X-μ|] = σ/1.253` for Gaussian). The Python approach is more robust to outliers in the
spread estimate itself. Numerically they will agree for near-Gaussian data but diverge in the
presence of skew or outliers.

**Assessment:** WITHIN_TOLERANCE for typical HRV distributions. The algorithmic choice is
documented differently; not a bug but a design difference.

---

## Summary Table

| Algorithm | Key Divergences | Correction Needed? |
|-----------|-----------------|-------------------|
| HRV RMSSD | Min-beats gate (2 vs 20); ectopic correction strategy (drop vs interpolate); Tier 2 weighting | YES — min-beats gate is a correctness issue |
| Recovery | Entirely different formula (linear vs logistic); HRV weight 0.35 vs 0.60; neutral point 70% vs 58% | YES — align formula or document as separate algorithm |
| Strain | v0 linear vs log map; v1 zone-midpoint approximation; documented | DOCUMENT |
| Calories | kJ conversion 4.1868 vs 4.184 (< 0.1%); resting fallback differs | NO |
| Sleep Staging | Epoch 1 min vs 30 s; primary classifier vs cross-check | DOCUMENT epoch duration |
| Exercise Detection | MOTION_THRESHOLD 0.01 vs 0.20 (likely bug); MIN_EXERCISE_MIN 10 vs 5; HR_MARGIN_BPM 30 vs 15; Zone 2 boundary 50% vs 60% HRR | YES — MOTION_THRESHOLD is likely a bug |
| EWMA Baselines | Alpha 0.10 vs 0.0483; no Winsorization or hard-reject gate | YES — add outlier gates |
