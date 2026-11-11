---
phase: 23-strain-calories
verified: 2026-06-08T10:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 23: Strain & Calories Verification Report

**Phase Goal:** Strain uses Tanaka HRmax and Banister TRIMP with sex-specific constants; a personal denominator calibration helper is available; calorie computation uses Mifflin-St Jeor RMR and Ghidra-confirmed Keytel/Harris-Benedict coefficients.
**Verified:** 2026-06-08T10:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StrainInput accepts optional profile_sex and profile_age without breaking existing callers | VERIFIED | `metrics.rs:410-412` — both fields have `#[serde(default)]`; serde round-trip test passes |
| 2 | tanaka_hrmax(age) returns 208 - 0.7*age | VERIFIED | `metrics.rs:1878-1880` — exact constants; test `tanaka_hrmax_returns_exact_value_for_age_50` passes |
| 3 | estimate_hrmax_from_history returns p99.5 when >= 600 samples exist, else None | VERIFIED | `metrics.rs:1889-1898` — nearest-rank index with `.saturating_sub(1).min(len-1)`; 4 tests pass |
| 4 | resolve_effective_hrmax yields hrmax_source in {observed, tanaka, fallback} | VERIFIED | `metrics.rs:1910-1923` — three-branch resolver; source label invariant test passes |
| 5 | Banister TRIMP uses sex-specific b constants (1.92 male / 1.67 female / 1.795 unknown) so male and female TRIMP differ for an identical HR trace | VERIFIED | `metrics.rs:1944-1948` — exact constants; test `banister_trimp_male_greater_than_female_for_identical_zones` passes |
| 6 | banister_trimp_zone_midpoint_approximation quality flag is always emitted | VERIFIED | `metrics.rs:2037` — unconditional push before output branching; test `goose_strain_v1_contains_banister_approximation_quality_flag` passes |
| 7 | goose_strain_v1 bridge method returns both Edwards and Banister scores | VERIFIED | `metrics.rs:2107-2131` — three ScoreComponents: `edwards_zone_load`, `average_hr_reserve`, `banister_trimp`; bridge dispatch at `bridge.rs:2172`; test `goose_strain_v1_output_contains_both_edwards_and_banister_scores` passes |
| 8 | fit_strain_denominator fits D from >= 2 pairs via least squares and is callable as metrics.fit_strain_denominator | VERIFIED | `metrics.rs:1972+` — closed-form OLS on m=1/ln(D); bridge dispatch at `bridge.rs:2176`; `BRIDGE_METHODS[240]`; recovery-of-D tests pass |
| 9 | rmr_mifflin_st_jeor replaces weight_kg*22.0 proxy when height and age are available; quality flag emitted when absent; Keytel/H-B coefficients match Ghidra-confirmed values | VERIFIED | `energy_rollup.rs:1181-1241` — exact coefficients; rollup wiring at lines 424-434; quality flag at lines 378-380; 13 energy_rollup tests pass |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Rust/core/src/metrics.rs` | profile_sex/profile_age on StrainInput; tanaka_hrmax; estimate_hrmax_from_history; resolve_effective_hrmax; banister_trimp_zone_midpoint; fit_strain_denominator; goose_strain_v1; GOOSE_STRAIN_V1_ID | VERIFIED | All functions present and substantive; no stubs |
| `Rust/core/src/energy_rollup.rs` | rmr_mifflin_st_jeor; keytel_active_kcal_per_min; harris_benedict_rmr_kcal_day; profile_height_cm on EnergyDailyRollupOptions; rollup wiring + resting_kcal_mifflin_height_absent flag | VERIFIED | All functions present with exact Ghidra coefficients; rollup wiring confirmed |
| `Rust/core/src/bridge.rs` | metrics.goose_strain_v1 and metrics.fit_strain_denominator dispatch; profile_height_cm in EnergyDailyRollupArgs plumbed to all daily construction sites | VERIFIED | Both bridge methods in BRIDGE_METHODS (lines 240, 246) and dispatch arms (lines 2172, 2176); profile_height_cm wired at lines 4461, 4494, 4558 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bridge.rs` | `goose_strain_v1` | match arm on `metrics.goose_strain_v1` | WIRED | `bridge.rs:2172` dispatches via `request_args::<StrainInput>` |
| `goose_strain_v1` | `resolve_effective_hrmax` | effective HRmax feeds Banister HRR fractions | WIRED | `metrics.rs:2063-2064` calls `resolve_effective_hrmax`; `effective_hrmax` used in `banister_trimp_zone_midpoint` at line 2093 |
| `bridge.rs` | `EnergyDailyRollupOptions` | `profile_height_cm` arg to options at all 3 daily sites | WIRED | Lines 4461, 4494, 4558 — all three `EnergyDailyRollupOptions` constructions include `profile_height_cm: args.profile_height_cm` |
| `resting_kcal / active_kcal` | `rmr_mifflin_st_jeor / keytel_active_kcal_per_min` | 30% HRR threshold split | WIRED | `energy_rollup.rs:424-435` for resting path; `active_kcal:1261-1272` for Keytel above 30% HRR threshold |
| `estimate_hrmax_from_history` | `StrainInput` | effective HRmax resolution selecting observed/tanaka/fallback | WIRED | `resolve_effective_hrmax` consumes both; called from `goose_strain_v1` at line 2064 |

### Note on EnergyHourlyRollupOptions

The plan spec referenced "4 EnergyDailyRollupOptions constructions" but the bridge contains 3 `EnergyDailyRollupOptions` + 1 `EnergyHourlyRollupOptions`. `EnergyHourlyRollupOptions` does not have a `profile_height_cm` field (the field was intentionally scoped to the daily struct). All three `EnergyDailyRollupOptions` construction sites have `profile_height_cm` wired. The `EnergyHourlyRollupArgs` struct also does not carry `profile_height_cm`. This is an intentional scope decision documented in the SUMMARY and does not violate the goal: Mifflin RMR is a daily resting metric; hourly rollup wires Keytel active EE separately via `profile_age_years` and `profile_sex` which were already present.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `goose_strain_v1` | `trimp` (Banister score) | `banister_trimp_zone_midpoint` | Yes — computed from `input.hr_zone_minutes` + `effective_hrmax` | FLOWING |
| `EnergyDailyRollup` | `resting_kcal` | `rmr_mifflin_st_jeor` when `profile_height_cm` + `profile_age_years` present | Yes — formula produces non-trivial f64; quality flag path on fallback | FLOWING |
| `EnergyDailyRollup` | `active_kcal` | `keytel_active_kcal_per_min` above 30% HRR threshold | Yes — computed from `avg_hr`, `weight_kg`, `age`, `hrmax` inputs | FLOWING |

### Behavioral Spot-Checks

Verified via cargo test (all assertions pass on current binary):

| Behavior | Test | Result |
|----------|------|--------|
| tanaka_hrmax(50) == 173.0 | `tanaka_hrmax_returns_exact_value_for_age_50` | PASS |
| tanaka >= +2 bpm over 220-age at ages 47-80 | `tanaka_hrmax_differs_from_220_minus_age_by_at_least_2_for_ages_47_to_80` | PASS |
| estimate_hrmax_from_history 599 samples → None | `estimate_hrmax_from_history_returns_none_with_599_samples` | PASS |
| estimate_hrmax_from_history 600 samples → Some (p99.5) | `estimate_hrmax_from_history_returns_p99_5_percentile` | PASS |
| resolve_effective_hrmax all three branches | 3 branch tests | PASS |
| Male Banister TRIMP > Female for identical zone input | `banister_trimp_male_greater_than_female_for_identical_zones` | PASS |
| fit_strain_denominator recovers D=7201 from synthetic pairs | `fit_strain_denominator_recovers_known_d` | PASS |
| fit_strain_denominator returns None for < 2 pairs | `fit_strain_denominator_returns_none_for_fewer_than_two_pairs` | PASS |
| goose_strain_v1 emits banister_trimp_zone_midpoint_approximation flag | `goose_strain_v1_contains_banister_approximation_quality_flag` | PASS |
| goose_strain_v1 output contains both edwards and banister scores | `goose_strain_v1_output_contains_both_edwards_and_banister_scores` | PASS |
| rmr_mifflin_st_jeor male/female/unknown exact coefficients | 3 coefficient tests | PASS |
| keytel_active_kcal_per_min male/female exact coefficients; clamped >= 0 | 4 Keytel tests | PASS |
| harris_benedict_rmr male/female exact coefficients | 2 H-B tests | PASS |
| rollup with height absent emits resting_kcal_mifflin_height_absent | `rollup_with_height_absent_emits_mifflin_height_absent_flag` | PASS |
| rollup with height present does not emit flag; uses Mifflin | `mifflin_resting_differs_from_proxy_for_same_inputs` + `rollup_with_height_present_does_not_emit_mifflin_height_absent_flag` | PASS |

**Full cargo test suite: 0 failures.**

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ALG-STR-01 | 23-01-PLAN.md | profile_sex/age on StrainInput; Tanaka HRmax; estimate_hrmax_from_history (p99.5 >= 600 samples) | SATISFIED | `metrics.rs:408-412, 1878-1923`; 11 unit tests pass |
| ALG-STR-02 | 23-02-PLAN.md | banister_trimp_zone_midpoint with sex-specific b constants; quality flag in output | SATISFIED | `metrics.rs:1937-1968, 2037`; sex-ordering test passes |
| ALG-STR-03 | 23-02-PLAN.md | fit_strain_denominator >= 2 pairs least-squares; callable via bridge | SATISFIED | `metrics.rs:1972+`; `bridge.rs:2176, BRIDGE_METHODS[240]` |
| ALG-CAL-01 | 23-03-PLAN.md | rmr_mifflin_st_jeor in energy_rollup.rs; profile_height_cm on options; quality flag when absent; replaces proxy | SATISFIED | `energy_rollup.rs:1181-1188, 46, 378-380, 424-434` |
| ALG-CAL-02 | 23-03-PLAN.md | Keytel and H-B coefficients Ghidra-confirmed; active/resting EE split on 30% HRR threshold | SATISFIED | `energy_rollup.rs:1194-1241, 1261-1272`; exact f64 literal constants verified |

### Anti-Patterns Found

None. No TBD, FIXME, XXX, TODO, HACK, or PLACEHOLDER markers found in any modified file. No stub returns, empty handlers, or hardcoded empty arrays in algorithm paths.

### Human Verification Required

None. All must-haves are verifiable programmatically via code inspection and cargo test.

---

## Gaps Summary

No gaps. All 9 must-have truths verified, all 5 requirements satisfied, all key links wired, full cargo test suite green (0 failures), no anti-patterns.

---

_Verified: 2026-06-08T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
