---
phase: 23-strain-calories
plan: "02"
subsystem: rust-metrics
tags: [strain, banister-trimp, fit-strain-denominator, goose-strain-v1, tdd, algorithm]
dependency_graph:
  requires: [tanaka_hrmax, estimate_hrmax_from_history, resolve_effective_hrmax, StrainInput.profile_sex, StrainInput.profile_age]
  provides: [banister_trimp_zone_midpoint, fit_strain_denominator, goose_strain_v1, GOOSE_STRAIN_V1_ID, metrics.goose_strain_v1, metrics.fit_strain_denominator]
  affects: [Rust/core/src/metrics.rs, Rust/core/src/bridge.rs, Rust/core/tests/metrics_tests.rs]
tech_stack:
  added: []
  patterns: [closed-form-OLS-linear-in-m, sex-specific-b-constant, zone-midpoint-approximation, bridge-dispatch-pattern]
key_files:
  created: []
  modified:
    - Rust/core/src/metrics.rs
    - Rust/core/src/bridge.rs
    - Rust/core/tests/metrics_tests.rs
decisions:
  - "goose_strain_v1 component weights: edwards_zone_load=0.50, average_hr_reserve=0.20, banister_trimp=0.30 (balanced blend, subject to calibration in later milestone)"
  - "fit_strain_denominator uses closed-form least-squares on m=1/ln(D) rather than iterative optimization (exact, O(n), no convergence issues)"
  - "b_constant duplicated in provenance JSON without inline match in json! macro (Rust macro hygiene constraint)"
metrics:
  duration_minutes: 10
  completed: 2026-06-07
  tasks_completed: 2
  files_modified: 3
---

# Phase 23 Plan 02: Banister TRIMP + Denominator Calibration + goose_strain_v1 Summary

Banister TRIMP with sex-specific exponential constants, closed-form denominator calibration, and a new `goose_strain_v1` bridge method that combines Edwards zone-load and Banister TRIMP into a single algorithm run result.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for banister_trimp_zone_midpoint, fit_strain_denominator, goose_strain_v1 | d2b1ec7 | tests/metrics_tests.rs |
| 1+2 (GREEN) | All functions + bridge dispatch + GOOSE_STRAIN_V1_ID constants | 61790b7 | metrics.rs, bridge.rs |

## What Was Built

### banister_trimp_zone_midpoint (ALG-STR-02)

```rust
pub fn banister_trimp_zone_midpoint(
    hr_zone_minutes: &[f64],
    resting_hr_bpm: f64,
    hrmax: f64,
    sex: Option<&str>,
) -> f64
```

Zone midpoints at 55/65/75/85/95% of HRmax. HRR fraction `x = clamp((zone_mid - resting) / (hrmax - resting), 0, 1)`. Formula: `Σ minutes * x * 0.64 * exp(b * x)`. Sex constant: `"male"` → 1.92, `"female"` → 1.67, otherwise → 1.795. Threat T-23-04 mitigated: `x` clamped to `[0, 1]` bounding `exp(b*x)` to at most `e^1.92`; zone minutes validated non-negative.

### fit_strain_denominator (ALG-STR-03)

```rust
pub fn fit_strain_denominator(pairs: &[(f64, f64)]) -> Option<f64>
```

Fits `D` in `strain = 21 * ln(TRIMP+1) / ln(D)`. Since the model is linear in `m = 1/ln(D)` with regressor `C_i = 21*ln(TRIMP_i+1)`, the closed-form OLS solution is `m = Σ(C_i*s_i) / Σ(C_i²)`, then `D = exp(1/m)`. Returns `None` for: fewer than 2 pairs, non-finite inputs, degenerate `Σ(C²) = 0` (T-23-03).

### goose_strain_v1 (ALG-STR-02 + ALG-STR-03)

```rust
pub fn goose_strain_v1(input: &StrainInput) -> AlgorithmRunResult<StrainScoreOutput>
```

- Resolves effective HRmax via `resolve_effective_hrmax(input.max_hr_bpm, input.profile_age, &[])`.
- Computes Edwards zone-load score (same zone weights [1,2,3,4,5] as v0).
- Computes `banister_trimp_zone_midpoint` using `input.profile_sex.as_deref()`.
- Converts TRIMP to a 0-21 score using default denominator D=7201: `21*ln(TRIMP+1)/ln(7201)`.
- Three `ScoreComponent` entries: `edwards_zone_load` (weight 0.50), `average_hr_reserve` (weight 0.20), `banister_trimp` (weight 0.30).
- Always pushes `banister_trimp_zone_midpoint_approximation` to `quality_flags`.
- Records `hrmax_source`, `effective_hrmax`, `banister_b_constant`, `default_denominator` in provenance.

### Bridge methods

- `"metrics.goose_strain_v1"` — dispatches to `goose_strain_v1(&StrainInput)` via `request_args`.
- `"metrics.fit_strain_denominator"` — dispatches to `fit_strain_denominator(&pairs)`, returns `{"denominator": D}` or bridge error `insufficient_or_degenerate_pairs`.
- `FitStrainDenominatorArgs { pairs: Vec<(f64, f64)>, database_path: Option<String> }` — `database_path` included for API consistency with DB-backed methods; pure computation, no DB access.
- Both added to `BRIDGE_METHODS` in sorted order. `bridge_methods_constant_is_sorted_and_unique` and `bridge_methods_constant_matches_dispatcher` both pass.

## Test Coverage

11 new tests in metrics_tests.rs covering:
- Male > female TRIMP for identical zone inputs (sex constant ordering)
- Unknown/None sex uses 1.795 (between male and female)
- Zone midpoint formula verified manually for single-zone case
- `fit_strain_denominator` recovers D=7201 within ±1 from 4 synthetic pairs
- `fit_strain_denominator` recovers D=5000 within ±1 from 2 pairs
- `fit_strain_denominator` returns None for 0 and 1 pairs
- `goose_strain_v1` always emits `banister_trimp_zone_midpoint_approximation` flag
- `goose_strain_v1` output contains both `edwards_zone_load` and `banister_trimp` components
- `goose_strain_v1` records `hrmax_source = "tanaka"` when `profile_age` provided with no history

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inline match in json! macro fails Rust macro hygiene**
- **Found during:** GREEN phase compile step
- **Issue:** `json!({ "banister_b_constant": { let b: f64 = match ...; b } })` produced `error: no rules expected ;` — block expressions with `let` bindings cannot appear directly in `json!` value positions.
- **Fix:** Moved `b_constant` computation to a `let` binding before the `output` block, referenced by name in `json!`.
- **Files modified:** Rust/core/src/metrics.rs
- **Commits:** 61790b7

## Threat Mitigations Applied

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-23-03: Tampering via degenerate least-squares | Guard < 2 pairs; non-finite C or s → None; Σ(C²)=0 → None | metrics.rs:fit_strain_denominator |
| T-23-04: DoS via exp overflow | x clamped [0,1] in banister_trimp_zone_midpoint; zone minutes filtered non-negative | metrics.rs:banister_trimp_zone_midpoint |

## Known Stubs

None — all functions fully implemented and tested. The default denominator D=7201 is a deliberate placeholder (reverse-engineered from WHOOP 5.37.0); `fit_strain_denominator` exists precisely to replace it when calibration pairs are available.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes introduced.

## Self-Check: PASSED

- `Rust/core/src/metrics.rs` — FOUND: banister_trimp_zone_midpoint, fit_strain_denominator, goose_strain_v1, GOOSE_STRAIN_V1_ID, GOOSE_STRAIN_V1_VERSION
- `Rust/core/src/bridge.rs` — FOUND: metrics.goose_strain_v1, metrics.fit_strain_denominator in BRIDGE_METHODS and dispatch arms
- Commit d2b1ec7 — RED phase test commit
- Commit 61790b7 — GREEN phase implementation commit
- `cargo test` — all test results: ok, 0 failures
