# Biometric Pipeline

This document describes how raw BLE bytes from the WHOOP device are transformed into biometric metrics (HRV, recovery, strain, sleep staging). It covers every layer from packet decode to the final scores shown in the UI.

**Reference implementation**: `server/ingest/app/analysis/` — a validated Python pipeline used as the algorithm source for the Goose Rust port. Formulas marked **UNCALIBRATED** are approximations until device-specific calibration data is collected.

---

## 1. BLE V24 Packet Decode

The WHOOP transmits historical biometric data as type-47 (`HISTORICAL_DATA`) BLE packets. The V24 variant (second byte = 24) is the primary source for all per-second biometrics.

**Layout verification**: verified against 762 real device records captured from WHOOP devices.

### Field Layout

All offsets are relative to `data = pkt[3:]` (after the 3-byte BLE header: type, packet_k, cmd).

| Field | Type | Offset | Description |
|-------|------|--------|-------------|
| `unix_ts` | u32 LE | data[4] | Device clock timestamp |
| `hr` | u8 | data[14] | Heart rate (bpm) |
| `rr_count` | u8 | data[15] | Number of valid RR intervals (0–4) |
| `rr[i]` | u16 LE | data[16+2i] | RR interval in ms (skip zeros) |
| `ppg_green` | u16 LE | data[26] | PPG green channel (AC-coupled) |
| `ppg_red_ir` | u16 LE | data[28] | PPG red/IR combined channel |
| `gravity_x` | f32 LE | data[33] | Accelerometer X (g) |
| `gravity_y` | f32 LE | data[37] | Accelerometer Y (g) |
| `gravity_z` | f32 LE | data[41] | Accelerometer Z (g) |
| `skin_contact` | u8 | data[48] | 1 = on wrist, 0 = off wrist |
| `spo2_red` | u16 LE | data[61] | SpO2 red channel ADC |
| `spo2_ir` | u16 LE | data[63] | SpO2 infrared channel ADC |
| `skin_temp_raw` | u16 LE | data[65] | Skin temperature ADC (thermistor) |
| `ambient` | u16 LE | data[67] | Ambient light ADC |
| `resp_raw` | u16 LE | data[73] | Respiratory movement ADC |
| `sig_quality` | u16 LE | data[75] | Firmware signal quality score |

### Skin Contact Gate

All biometric computations (SpO2, HRV, resp, skin temp) are gated on `skin_contact == 1`. Samples where `skin_contact == 0` are stored with a `contact=false` flag and excluded from downstream analysis.

### Goose Implementation

Phase 27 (V24 Biometric Decode) — shipped (v5.0). Rust: `protocol.rs` `DataPacketBodySummary`, `store/mod.rs` schema (`spo2_samples`, `skin_temp_samples`, `resp_samples`, `gravity2_samples`), `bridge.rs` `biometrics.insert_v24_batch` / `biometrics.v24_between`.

---

## 2. Physical Unit Conversions

Raw ADC values from the V24 packet are converted to physical units. All conversions are **UNCALIBRATED** until device-specific fitting is performed.

**Source**: `server/ingest/app/analysis/units.py`

### 2.1 SpO2 (Blood Oxygen Saturation)

Method: windowed ratio-of-ratios (Beer-Lambert law, TI SLAA655 textbook values).

```
AC_red = MAD(red_window)     # robust AC amplitude (motion-resistant)
DC_red = mean(red_window)    # DC offset

AC_ir  = MAD(ir_window)
DC_ir  = mean(ir_window)

R = (AC_red / DC_red) / (AC_ir / DC_ir)
SpO2 = clamp(a - b * R, 70, 100)    # default: a=110, b=25
```

Default coefficients (a=110, b=25) are the canonical TI textbook values — **not device-calibrated**. Fitted via `fit_spo2()` when WHOOP export data is available. Window size: ~60 s (60 samples at 1 Hz). Motion rejection: perfusion index check applied before window.

References: TI SLAA655; Mendelson & Ochs 1988 IEEE TBME; Mendelson et al. reflectance pulse oximetry.

### 2.2 Skin Temperature

Method: single-slope linear map from thermistor ADC to °C.

```
T_celsius = SKIN_TEMP_SLOPE * raw + SKIN_TEMP_OFFSET
```

Default slope/offset are un-calibrated. Reference point: raw ≈ 930 → 33 °C (resting on-wrist). Deviation-from-personal-baseline is more trustworthy than absolute temperature; the EWMA baseline (§5) provides the reference. Fitted via `fit_skin_temp()` when ground-truth data is available.

### 2.3 Respiratory Rate

Method: Welch power spectral density on the 1 Hz `resp_raw` time series.

```
freq, power = welch(resp_raw_window, fs=1.0)
band = freq[(freq >= 0.1) & (freq <= 0.5)]   # 6–30 breaths/min
resp_rate_bpm = freq_at_peak(band) * 60
```

**No calibration needed** — frequency-based, not amplitude-based. Expected RMSE ~0.65 BrPM (npj Digital Medicine 2021). Window: 60–120 s for stable estimation.

### 2.4 Quality Flags

Every converted value carries a mandatory `quality_flag` field:

| Flag | Meaning |
|------|---------|
| `uncalibrated` | Formula is approximate; device-specific coefficients not fitted |
| `no_skin_contact` | Sample rejected (skin_contact == 0) |
| `plausibility_rejected` | Value outside physiological range |
| `window_too_short` | Insufficient samples for windowed computation |

### 2.5 Plausibility Gates

Values outside physiological ranges are flagged and excluded from downstream analysis:

| Metric | Valid Range |
|--------|-------------|
| SpO2 | [70, 100] % |
| Skin temperature | [25, 40] °C |
| Respiratory rate | [6, 30] BrPM |
| HR | [30, 220] bpm |
| RR interval | [300, 2000] ms |

---

## 3. HRV (Heart Rate Variability)

**Source**: `server/ingest/app/analysis/hrv.py`

### 3.1 RR Interval Cleaning

Before computing HRV, the RR series is cleaned in order:

1. **Range filter** — reject intervals outside [300, 2000] ms
2. **Lipponen-Tarvainen ectopic filter** — local median of previous N intervals computed; any interval where `|RR_i − median| > 0.2 × median` (Malik 20% rule) is rejected as an ectopic beat
3. **BLE gap segmentation** — any timestamp gap > 3 s between consecutive RR intervals creates a segment boundary; successive differences are never computed across boundaries

The fraction of rejected beats is exposed as `ectopic_filter_removal_fraction` in `HrvOutput`.

### 3.2 RMSSD

Root Mean Square of Successive Differences (Task Force 1996 definition):

```
RMSSD = sqrt( (1 / (N-1)) * Σ (RR_{i+1} - RR_i)² )
```

Computed **within each segment only** — never crossing BLE gap boundaries. Minimum pairs per segment: 20; segments shorter than this are discarded. Returns `None` if no valid segment.

### 3.3 Frequency Domain Features

Computed from clean RR series using Welch periodogram:

| Feature | Band | Description |
|---------|------|-------------|
| `hf_power` | 0.15–0.4 Hz | High-frequency (vagal activity, breathing modulation) |
| `lf_power` | 0.04–0.15 Hz | Low-frequency (sympatho-vagal balance) |
| `lf_hf_ratio` | — | LF/HF ratio (autonomic balance proxy) |

Used as inputs to the sleep staging classifier (§6).

### 3.4 Tiered SWS Window Selection

Overnight HRV is more representative when computed during slow-wave sleep (deepest, most restorative). Three-tier selection:

1. **Last deep-sleep episode** ≥ 5 min → most physiologically meaningful
2. **Weighted mean of all deep episodes** → fallback if no single episode qualifies
3. **Full-night fallback** → used when no staging data available

`window_tier_used` ∈ `{last_sws, weighted_sws, full_night}` is always present in `HrvOutput`.

### 3.5 Goose Implementation

Phase 22 (HRV Accuracy). Rust: `metrics.rs` `rmssd_segmented()`, `lipponen_tarvainen_filter()`. HRV frequency analysis is implemented via Welch periodogram in Rust (no neurokit2 FFI; local median ± 20% Malik threshold used for ectopic filtering).

---

## 4. EWMA Personal Baselines

**Source**: `server/ingest/app/analysis/baselines.py`

All scoring is relative to a personal baseline — not a population mean. The baseline uses Exponential Weighted Moving Averages that "forget" old nights gradually, giving more weight to recent history.

### 4.1 Center Baseline (14-night half-life)

```
α_center = 1 - exp(-ln(2) / 14)  ≈ 0.0483
new_center = α_center * value + (1 - α_center) * old_center
```

**Winsor gate**: before updating, clamp the input to `[center - 3σ, center + 3σ]` to prevent a single unusual night from distorting the baseline.

**Hard-reject gate**: skip the update entirely if `|value - center| > 5σ` — the sample is likely an artefact.

### 4.2 Spread Baseline (21-night half-life)

```
α_spread = 1 - exp(-ln(2) / 21)
deviation = |value - center|
new_spread = α_spread * deviation + (1 - α_spread) * old_spread
```

The spread updates more slowly than the center, providing a stable σ. Per-metric minimum floors prevent over-sensitivity on short windows.

### 4.3 Per-Metric Configuration

| Metric key | min_val | max_val | σ-floor | center half-life | spread half-life |
|------------|---------|---------|---------|-----------------|-----------------|
| `hrv` | 5 ms | 200 ms | 5 ms | 14 nights | 21 nights |
| `resting_hr` | 30 bpm | 100 bpm | 2 bpm | 14 nights | 21 nights |
| `resp` | 6 BrPM | 30 BrPM | 0.3 BrPM | 14 nights | 21 nights |

### 4.4 Trust Levels and Cold-Start

| Nights of valid data | Status | Behaviour |
|---------------------|--------|-----------|
| < 4 | `calibrating` | Returns `None`; population fallback (58%) available but flagged |
| 4–13 | `provisional` | Baseline active; trust level shown in UI |
| ≥ 14 | `trusted` | Full confidence |
| Last update > 14 days ago | `stale` | Baseline still used but flagged |

### 4.5 Deviation Output

```
delta  = value - center
ratio  = delta / spread
z_score = delta / spread    # same as ratio; named separately for clarity
```

The Z-score is the input to the recovery composite (§5).

### 4.6 Goose Implementation

Phase 24 (Sleep Metrics + Baselines). Rust: `baselines.rs`. Write safety: `BEGIN EXCLUSIVE` transaction; idempotent guard `WHERE last_updated_date < ?`.

---

## 5. Recovery Score

**Source**: `server/ingest/app/analysis/recovery.py`

### 5.1 Composite Z-Score

Four metrics contribute to the nightly recovery score, each Z-scored against its personal baseline:

| Input | Weight | Notes |
|-------|--------|-------|
| `Z_HRV` | 0.60 | Higher RMSSD = better |
| `Z_RHR` | 0.20 | **Inverted**: lower RHR = better → `Z_RHR = (baseline_RHR - RHR_night) / σ_RHR` |
| `Z_resp` | 0.05 | Lower resp rate deviation = better |
| `Z_sleep_perf` | 0.15 | Sleep efficiency centred at 0.85, σ=0.12: `(efficiency - 0.85) / 0.12` |

Missing terms are dropped and remaining weights renormalised. For example, if resp data unavailable: HRV weight becomes `0.60/0.95 ≈ 0.632`.

```
Z_total = 0.60·Z_HRV + 0.20·Z_RHR + 0.05·Z_resp + 0.15·Z_sleep_perf
```

### 5.2 Logistic Squash

```
score = 100 / (1 + exp(-1.6 × (Z_total + 0.20)))
```

The `+0.20` offset ensures Z=0 (all metrics exactly at personal baseline) → score ≈ 58%, matching the WHOOP-published population mean.

### 5.3 Colour Bands

| Score | Colour | Meaning |
|-------|--------|---------|
| ≥ 67 | Verde | High recovery |
| 34–66 | Amarelo | Moderate recovery |
| < 34 | Vermelho | Low recovery |

### 5.4 Goose Implementation

Phase 25 (Recovery Score v1). Rust: `metrics.rs` `goose_recovery_v1()`. Bridge: `HealthDataStore+Recovery.swift`.

---

## 6. Sleep Analysis

**Source**: `server/ingest/app/analysis/sleep.py`, `sleep_features.py`

### 6.1 Sleep/Wake Detection (Cole-Kripke Actigraphy)

Epoch grid: **1 minute**.

```
activity_count = Σ |Δg|  over epoch samples   # gravity change-magnitude
activity_count = activity_count × COLE_KRIPKE_SCALE_FACTOR  # COLE_KRIPKE_SCALE_FACTOR = 0.001
```

7-epoch sliding window with asymmetric weights (te Lindert 2013). Threshold applied to classify each epoch as `sleep` or `wake`. This gives the sleep/wake spine used in all subsequent metrics.

### 6.2 Sleep Metrics Without Staging (AASM)

Computed from the sleep/wake spine alone (no stage classifier needed):

| Metric | Definition |
|--------|-----------|
| SOL | Sleep-onset latency: time from in-bed to first sustained sleep epoch |
| TST | Total Sleep Time: sum of sleep epochs × 60 s |
| WASO | Wake After Sleep Onset: sum of post-onset wake epochs × 60 s |
| Sleep efficiency | TST / TIB (time-in-bed) |
| Disturbance count | Number of distinct post-onset wake runs |
| HR dip | Minimum rolling-5-min HR during sleep vs pre-sleep RHR (%) |

### 6.3 4-Class Staging

Requires Phase 22 (HRV frequency features) as input.

**Per-epoch feature vector** (computed over 60 s window):

| Feature | Source | Stage signal |
|---------|--------|-------------|
| HR mean | V24 BPM | Deep → low HR |
| HR p25 | V24 BPM | Sleep depth indicator |
| HR p70 | V24 BPM | Wake/REM indicator |
| RMSSD | Phase 22 | Deep → high HRV |
| HF power | Phase 22 Welch | Deep → high HF |
| LF/HF ratio | Phase 22 Welch | Wake/REM indicator |
| Resp rate variability | Phase 27 resp_raw std | REM → irregular breathing |
| Clock proxy | Night fraction 0–1 | REM concentrated late |

**Rule-based classifier** (transparent seam for future ML replacement):

1. `wake` epoch → stays `wake`
2. sleep epoch with RMSSD > personal p70 AND HF > threshold AND low motion → `deep`
3. sleep epoch with irregular resp variability AND clock proxy > 0.4 → `rem`
4. remaining sleep epochs → `light`

**Physiological reimposition** (applied after per-epoch classification):

1. No REM in first 15 minutes of sleep
2. Deep sleep concentrated in first 1/3 of sleep period
3. Minimum 5-minute segments (≤ 5 epochs of same class → absorbed into neighbour)
4. Forbidden transitions suppressed (deep→REM direct → insert `light` bridge epoch)

**Known accuracy ceiling**: ~65–73% epoch agreement with PSG for EEG-free wearable methods (literature). Validation target for Phase 26: ≥ 70% on ≥ 5 real overnight sessions.

### 6.4 Goose Implementation

Phase 24 (metrics without staging); Phase 26 (4-class staging). Rust: `sleep_staging.rs`. Quality flag `staging_method_actigraphy_uncalibrated` is mandatory in all Phase 26 output.

---

## 7. Strain & Calories

**Source**: `server/ingest/app/analysis/strain.py`, `calories.py`

### 7.1 HRmax

```
tanaka_hrmax(age) = 208 - 0.7 × age    # Tanaka 2001 meta-analysis
```

If ≥ 600 trailing HR samples available: use 99.5th percentile as observed HRmax. Source tracked in `hrmax_source` ∈ `{observed, tanaka, fallback}`.

### 7.2 Karvonen %HRR

```
%HRR = (HR - RHR) / (HRmax - RHR) × 100   # clamped [0, 100]
```

Active/resting split threshold: %HRR ≥ 30 → active EE (Keytel); else resting EE (Harris-Benedict).

### 7.3 Edwards TRIMP (5-Zone)

Zone cut-offs at HRR [50, 60, 70, 80, 90]%, zone weights 1–5:

```
TRIMP_edwards = Σ (zone_weight × duration_min)
```

Zone-time percentages (`zone_time_pct`) always sum to 100.

### 7.4 Banister TRIMP (Continuous)

```
weight = k × exp(b × %HRR)   # sex-specific b
TRIMP_banister = Σ (weight × Δt_min)
```

| Sex | b exponent |
|-----|-----------|
| Male | 1.92 |
| Female | 1.67 |

Sex-specific exponents reflect documented physiological differences in lactate response. Quality flag: `banister_trimp_uncalibrated` (denominator D not fitted to user).

### 7.5 Strain Scale (0–21)

```
strain = 21 × ln(TRIMP + 1) / ln(D)
```

Default D = 7201 (theoretical maximum). Calibrate D via `fit_strain_denominator()` (`server/ingest/app/analysis/strain.py`, line 286) from ≥ 2 (TRIMP, known_strain) pairs using least-squares.

### 7.6 Calorie Computation

**Active EE (Keytel)** — for samples where %HRR ≥ 30:

| Parameter | Men | Women |
|-----------|-----|-------|
| Intercept | −55.0969 | −20.4022 |
| HR coefficient | 0.6309 | 0.4472 |
| Mass coefficient | 0.1988 | −0.1263 |
| Age coefficient | 0.2017 | 0.0740 |

```
EE_kJ_per_min = intercept + HR_coeff×HR + mass_coeff×weight_kg + age_coeff×age
EE_kcal_per_s = max(0, EE_kJ_per_min) / (60 × 4.184)
```

Coefficients are empirically validated against reference hardware measurements.

**Resting EE (Harris-Benedict revised 1984)**:

| Parameter | Men | Women |
|-----------|-----|-------|
| Intercept | 88.362 | 447.593 |
| Weight (kg) | 13.397 | 9.247 |
| Height (cm) | 479.9 | 309.8 |
| Age | −5.677 | −4.330 |

### 7.7 Goose Implementation

Phase 23 (Strain & Calories). Rust: `energy_rollup.rs`, `metrics.rs`. Phase 28 (Exercise Detection) consumes these functions for per-bout calorie accumulation.

---

## 8. Exercise Detection

**Source**: `server/ingest/app/analysis/exercise.py`

### 8.1 Detection Algorithm

Retroactive detection from decoded V24 history (no real-time classification needed).

1. **Temporal alignment** — HR samples and gravity samples are aligned with nearest-neighbour within ±5 s tolerance (gravity is the sparser signal)
2. **Activity gate** — each aligned pair marked `active` when: HR > (RHR + 30 bpm) AND rolling-mean gravity activity magnitude > 0.20 g/sample
3. **Session extraction** — contiguous runs of `active` samples form candidate sessions
4. **Merge** — adjacent sessions with gap < 60 s are merged
5. **Rejection** — sessions shorter than 10 min are dropped; sessions where Edwards zone 2–5 fraction < 50% are dropped (guard: skip if HRmax unknown)

### 8.2 Resting HR Fallback

Priority: (1) sleep session RHR, (2) 10th percentile of day's HR samples, (3) profile override.

### 8.3 Per-Session Output

```
ExerciseSession {
    start_ts, end_ts, duration_s,
    avg_hr, peak_hr, avg_hrr_pct,
    hrmax, hrmax_source,
    zone_time_pct,      // BTreeMap<u8, f64> zones 0–5, sums to 100
    strain,             // Banister logarithmic scale 0–21
    calories_kcal,      // Keytel active + H-B resting
    rhr_source,
}
```

### 8.4 Goose Implementation

Phase 28. Rust: `activity_sessions.rs` extended or new `exercise_detection.rs`. SQLite: `exercise_sessions` table.

---

## 9. Pipeline Dependency Graph

```
BLE bytes (V24 packet_k=24)
    │
    ▼
[Phase 27 — shipped] Field extraction + skin_contact gate
    │
    ├── spo2_samples ─────────────────────────────────────────────┐
    ├── skin_temp_samples ──────────────────────────────────────┐  │
    ├── resp_samples ───────────────────────┐                   │  │
    └── gravity_samples (Phase 21) ─────┐  │                   │  │
                                        │  │                   │  │
                                        ▼  ▼                   │  │
                                 [Phase 26] Sleep Staging       │  │
                                 (Cole-Kripke + 4-class)        │  │
                                        │                       │  │
                                        ▼                       │  │
    rr_intervals ──── [Phase 22] HRV ──────────────────────────►│  │
                      (RMSSD + frequency)                       │  │
                                        │                       │  │
                                        ▼                       │  │
    hr_samples ──────[Phase 23] Strain & Calories ◄─────────────┘  │
    gravity_samples ─[Phase 28] Exercise Detection                  │
                                        │                          │
                                        ▼                          │
                             [Phase 24] Baselines (EWMA) ◄─────────┘
                             Sleep metrics (WASO, SOL, dip)
                                        │
                                        ▼
                             [Phase 25] Recovery Score
                             (Z-score composite + logistic)
                                        │
                                        ▼
                              RecoveryV2OverviewPage
```

---

## 10. Calibration (Deferred — v5.1)

The following conversions are **approximate until calibration data is available**:

| Component | Calibration method | Required data |
|-----------|-------------------|---------------|
| SpO2 | `fit_spo2(pairs)` — least-squares fit of (a, b) | WHOOP app SpO2 export paired with raw ADC |
| Skin temperature | `fit_skin_temp(pairs)` — slope/offset fit | WHOOP app skin temp export paired with raw ADC |
| Strain denominator D | `fit_strain_denominator(pairs)` — least-squares | WHOOP app strain values paired with recorded sessions |

Cross-validation harness: `leave_one_night_out()` in `server/ingest/app/analysis/units.py`.

---

## 11. Known Limitations

- **Sleep staging accuracy ceiling**: ~65–73% epoch agreement with PSG for any EEG-free wearable method. Validation target (Phase 26) is ≥ 70% on ≥ 5 real sessions.
- **SpO2 and skin temp**: approximate until `fit_spo2()` / `fit_skin_temp()` run against WHOOP export data. Values marked `quality_flag: uncalibrated`.
- **No workout classification** (running/cycling/lifting): requires raw accelerometer at > 1 Hz. Out of v5.0 scope.
- **Gravity2 second triplet**: parsed and stored in `gravity2_samples` table (shipped v5.0, `store.gravity2_samples_between` bridge method). Higher-level analysis (e.g., orientation disambiguation) remains deferred to v5.1.
- **Neurokit2 dependency**: my-whoop uses this Python library for ectopic filtering and HRV frequency computation. Goose reimplements these in Rust (Malik 20% threshold; Welch periodogram) — no FFI.
