# Phase 23: Strain & Calories - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — exact coefficients, no grey areas)

<domain>
## Phase Boundary

Pure Rust algorithm updates in `metrics.rs` and `energy_rollup.rs`. No Swift changes. No UI changes.

**Strain (metrics.rs):**
- `StrainInput` currently has: `resting_hr_bpm`, `average_hr_bpm`, `max_hr_bpm`, `hr_zone_minutes` — NO `profile_sex`, NO `profile_age`
- `goose_strain_v0` uses Edwards zone model (weights [1,2,3,4,5]) — no TRIMP formula
- All changes additive to `StrainInput`; new bridge method `goose_strain_v1`

**Calories (energy_rollup.rs):**
- `resting_kcal` at line 1159: `weight_kg * 22.0` proxy → replace with Mifflin-St Jeor
- `active_kcal` at line 1164: MET/HR-reserve model → add Keytel as alternative path
- `EnergyDailyRollupOptions` has `profile_sex` but NOT `profile_height_cm` or `profile_age`

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion. Key constraints:

**ALG-STR-01 — profile_sex + Tanaka HRmax:**
- Add `profile_sex: Option<String>`, `profile_age: Option<f64>` to `StrainInput` with `#[serde(default)]`
- Implement `tanaka_hrmax(age: f64) -> f64 = 208.0 - 0.7 * age`
- Implement `estimate_hrmax_from_history(hr_history: &[f64]) -> Option<f64>` — p99.5 when ≥ 600 samples
- `goose_strain_v1`: when age present, use `max(session_max_hr, tanaka_hrmax(age))` as effective HRmax

**ALG-STR-02 — Banister TRIMP:**
- `banister_trimp_zone_midpoint(hr_zone_minutes, resting_hr_bpm, hrmax, sex) -> f64`
- Zone midpoints (% of max): Zone 1=55%, Zone 2=65%, Zone 3=75%, Zone 4=85%, Zone 5=95%
- HRR fraction: `x = (zone_mid_hr - resting_hr) / (hrmax - resting_hr)`
- Sex constant: `b = 1.92` (male) / `b = 1.67` (female) / `b = 1.795` (nonbinary/unknown = mean)
- Formula: `Σ zone_minutes[i] * x_i * 0.64 * exp(b * x_i)` for all 5 zones
- Quality flag `banister_trimp_zone_midpoint_approximation` always emitted (not per-session)
- New bridge method `goose_strain_v1` outputs both Edwards and Banister scores; method `"strain"` selectable

**ALG-STR-03 — fit_strain_denominator:**
- `fit_strain_denominator(pairs: &[(f64, f64)]) -> Option<f64>` — given ≥ 2 `(TRIMP, whoop_strain)` pairs
- Formula: `21 * ln(TRIMP+1) / ln(D)` → fit `D` via least squares (minimize sum of squared differences)
- Expose as bridge method `"metrics.fit_strain_denominator"`
- Input: `{pairs: [[trimp, whoop_strain], ...], database_path: "..."}` (no DB access needed, pure computation)

**ALG-CAL-01 — Mifflin-St Jeor RMR:**
- Add `profile_height_cm: Option<f64>`, `profile_age: Option<f64>` to `EnergyDailyRollupOptions` (additive)
- `rmr_mifflin_st_jeor(weight_kg, height_cm, age, sex) -> f64`:
  - Male: `10 * weight_kg + 6.25 * height_cm - 5 * age + 5`
  - Female: `10 * weight_kg + 6.25 * height_cm - 5 * age - 161`
  - Nonbinary/unknown: `10 * weight_kg + 6.25 * height_cm - 5 * age - 78` (mean intercept)
- Replace `weight_kg * 22.0` proxy in `resting_kcal` when height and age are available
- Quality flag `resting_kcal_mifflin_height_absent` when falling back to proxy

**ALG-CAL-02 — Keytel + Harris-Benedict coefficients:**
- Keytel active formula (use when `average_hr >= resting_hr + 0.30 * (hrmax - resting_hr)`):
  - Male: `-55.0969 + 0.6309 * hr + 0.1988 * weight_kg + 0.2017 * age` (kcal/min)
  - Female: `-20.4022 + 0.4472 * hr - 0.1263 * weight_kg + 0.0740 * age` (kcal/min)
  - Divisor: `251.04` to convert from VO2 to kcal/min (Keytel 2005, Ghidra-confirmed)
- Harris-Benedict RMR (use below threshold):
  - Male: `88.362 + 13.397 * weight_kg + 479.9 * height_cm / 100 - 5.677 * age` (kcal/day) — NOTE: H-B uses height in meters? Verify from Ghidra: `479.9` coefficient with SI units implies height in cm passed as meters (FINDINGS_5.md) — use 479.9 × (height_cm / 100)
  - Female: `447.593 + 9.247 * weight_kg + 309.8 * height_cm / 100 - 4.330 * age` (kcal/day)
- These replace or augment the MET-based `active_kcal` function; validate ±5% against known sessions
- Add as separate `keytel_active_kcal_per_min` function; wire into rollup when age + hr available

</decisions>

<code_context>
## Existing Code Insights

### Key Locations
- `Rust/core/src/metrics.rs:397` — `StrainInput` (add `profile_sex`, `profile_age`)
- `Rust/core/src/metrics.rs:410` — `StrainScoreOutput` 
- `Rust/core/src/metrics.rs:1777` — `goose_strain_v0` (new `goose_strain_v1` alongside)
- `Rust/core/src/energy_rollup.rs:36` — `EnergyDailyRollupOptions` (add `profile_height_cm`, `profile_age`)
- `Rust/core/src/energy_rollup.rs:1159` — `resting_kcal` proxy function to replace
- `Rust/core/src/energy_rollup.rs:1164` — `active_kcal` MET function to extend

### Patterns
- Bridge method registration: add to `BRIDGE_METHODS` sorted array + match arm dispatch
- New algorithm alongside old: `goose_strain_v1` with `GOOSE_STRAIN_V1_ID = "goose.strain.v1"`
- Quality flags as Vec<String> following existing pattern

</code_context>

<specifics>
## Specific Ideas

- All Keytel/H-B coefficients sourced from Ghidra reverse-engineering of WHOOP 5.37.0 binary (FINDINGS_5.md §GHIDRA-HB-01 + §GHIDRA-02)
- Use f64 constants with exact values, no rounding
- Banister b-constant for unknown sex: average of male and female (1.92 + 1.67) / 2 = 1.795
- `estimate_hrmax_from_history`: sort ascending, index at ceil(0.995 * len)

</specifics>

<deferred>
## Deferred Ideas

- UI exposure of Banister vs Edwards selector in Settings — v6.0
- Per-user Keytel coefficient calibration
- Full Keytel integration into the rollup (requires `profile_age` propagation through the session pipeline)

</deferred>
