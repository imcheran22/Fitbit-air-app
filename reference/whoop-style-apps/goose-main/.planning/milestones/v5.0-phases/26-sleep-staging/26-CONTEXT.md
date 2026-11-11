# Phase 26: Sleep Staging - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

## Key Finding from Ghidra Analysis

WHOOP's sleep staging algorithm is **server-side** (not in the iOS binary). The WHOOP app:
- Sends raw IMU data from the strap via BLE to the iPhone
- Uploads it to WHOOP's backend
- Receives already-staged sleep data from the API

**Consequence:** No WHOOP-specific coefficients to extract. We implement Cole-Kripke with:
- Published Cole & al. 1992 coefficients
- Mandatory `staging_method_actigraphy_uncalibrated` quality flag
- Configurable scale constant for future calibration

<domain>
## Phase Boundary

**New Rust file: `Rust/core/src/sleep_staging.rs`**
- Cole-Kripke binary wake/sleep classifier on 1-minute aggregated epochs from gravity table
- Activity count computation: sum of |magnitude_i - magnitude_{i-1}| over 1-minute windows
- Cole-Kripke scoring: `P(wake) = 1 / (1 + exp(-(a + b*count)))` where a=-0.38, b=0.0027
  (Cole 1992 logistic regression coefficients for the P (activity) version)
- Actually, Cole-Kripke uses linear combination: `D = 0.00001 * (106*E(-4) + 54*E(-3) + 58*E(-2) + 76*E(-1) + 230*E0 + 74*E1 + 67*E2)` — minute-weighted activity sum
  Where E(-4)..E(+2) are activity counts at minutes -4 to +2 relative to current epoch; wake if D > 1
- Epoch: 1 minute windows, samples from gravity table (x, y, z in g units, ~50Hz)
- Activity count per epoch: `Σ √(Δx²+Δy²+Δz²)` for consecutive sample pairs in the minute
- Scale factor: `COLE_KRIPKE_SCALE_FACTOR: f64 = 1.0` (configurable, default 1.0 — no scaling applied until empirical calibration with real WHOOP staging data)
- Mandatory output field: `staging_method: "actigraphy_uncalibrated"`
- 4-class extension: simple threshold-based REM/Deep/Light/Wake from HR + motion features

**Bridge method: `"metrics.sleep_staging"`**

**Swift: Update Sleep V2 with staging display** (if data available; placeholder "Sem dados IMU" when gravity table empty)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Activity count: inter-sample magnitude difference (`|√(x²+y²+z²)_i - √(x²+y²+z²)_{i-1}|`) — simpler than absolute magnitude, captures motion transitions
- Cole-Kripke 1992 coefficients: use the published 7-term linear combination (a=-0.38, b=0.0027 is Sadeh 1994; Cole 1992 uses the weighted sum D > 1 threshold)
- Implement both binary wake/sleep AND 4-class (wake/light/deep/REM) using cardiorespiratory features as a second pass
- `staging_method_actigraphy_uncalibrated` flag ALWAYS present — never omit
- When gravity table is empty: return None/empty staging with `staging_method: "no_imu_data"` flag
- Validate ≥ 70% epoch agreement with WHOOP stages when real data available (human gate, like ALG-HRV-04)

### Key Constants (expose as named consts, not literals)
- `COLE_KRIPKE_SCALE_FACTOR: f64 = 1.0` — tunable when real WHOOP data available
- `COLE_KRIPKE_WAKE_THRESHOLD: f64 = 1.0` — Cole 1992: D > 1.0 → wake
- `COLE_KRIPKE_EPOCH_MINUTES: f64 = 1.0` — 1-minute epochs

</decisions>

<code_context>
## Existing Code Insights

### Key Locations
- `Rust/core/src/store.rs:6237` — `gravity_rows_between(device_id, ts_start, ts_end)` returns `Vec<GravityRow>` 
- `GravityRow` struct: `device_id: String, ts: f64, x: f64, y: f64, z: f64`
- `Rust/core/src/lib.rs` — add `pub mod sleep_staging;`
- Bridge dispatch pattern: same as Phase 21/24

### Cole-Kripke 1992 coefficients (from Cole et al. "Automatic Sleep/Wake Identification from Wrist Activity"):
- D = (1/100) × (106·E(-4) + 54·E(-3) + 58·E(-2) + 76·E(-1) + 230·E0 + 74·E1 + 67·E2)
- Where E(offset) = activity count at current_minute + offset
- Wake if D ≥ 1; Sleep if D < 1
- Note: multiply activity counts by COLE_KRIPKE_SCALE_FACTOR before applying

</code_context>

<specifics>
## Specific Ideas

- `SleepStagingInput`: `{device_id, sleep_start_ts, sleep_end_ts, database_path}`
- `SleepStagingOutput`: `{epochs: Vec<SleepEpoch>, staging_method: String, wake_fraction, sleep_minutes}`
- `SleepEpoch`: `{ts, activity_count, stage: "wake"|"light"|"deep"|"rem"}`
- AASM metrics computed from epoch sequence: TST, efficiency, SOL, WASO, stage_minutes
- Quality flag `staging_method_actigraphy_uncalibrated` ALWAYS in output

</specifics>

<deferred>
## Deferred Ideas

- WHOOP-specific calibration (requires real overnight sessions with staging data) — future
- Physiological reimposition (min 5-min segments, no early REM) — implement if time permits
- Swift UI hypnogram visualization — simplest display (percentage bar by stage)

</deferred>
