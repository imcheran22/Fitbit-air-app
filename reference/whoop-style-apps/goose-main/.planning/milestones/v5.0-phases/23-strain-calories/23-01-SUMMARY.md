---
phase: 23-strain-calories
plan: "01"
subsystem: rust-metrics
tags: [strain, hrmax, tanaka, tdd, algorithm]
dependency_graph:
  requires: []
  provides: [tanaka_hrmax, estimate_hrmax_from_history, resolve_effective_hrmax, StrainInput.profile_sex, StrainInput.profile_age]
  affects: [Rust/core/src/metrics.rs]
tech_stack:
  added: []
  patterns: [Option-with-serde-default, p99.5-percentile, source-label-enum]
key_files:
  created: []
  modified:
    - Rust/core/src/metrics.rs
    - Rust/core/tests/metrics_tests.rs
    - Rust/core/src/metric_features.rs
    - Rust/core/src/perf_budget.rs
    - Rust/core/src/property_tests.rs
    - Rust/core/tests/algorithm_compare_tests.rs
    - Rust/core/tests/reference_tests.rs
decisions:
  - "Tanaka diff test corrected to age>=47 range (plan spec error: property holds at age>=47 not age>40)"
  - "All StrainInput struct literals updated to include profile_sex/profile_age None fields"
metrics:
  duration_minutes: 25
  completed: 2026-06-07
  tasks_completed: 2
  files_modified: 7
---

# Phase 23 Plan 01: Strain Profile Inputs + HRmax Functions Summary

Profile fields and HRmax functions added to the strain pipeline: `StrainInput` extended with optional `profile_sex`/`profile_age`, `tanaka_hrmax` formula implemented, history-based percentile estimator implemented, and effective HRmax resolver with source labelling added. All consumed by 23-02 (Banister TRIMP).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for profile fields, tanaka_hrmax, estimate_hrmax_from_history | 38551fd | tests/metrics_tests.rs |
| 1+2 (GREEN) | StrainInput profile fields + all three functions + fix existing literals | 88328e4 | metrics.rs, 6 other files |

## What Was Built

### StrainInput — additive profile fields

```rust
#[serde(default)]
pub profile_sex: Option<String>,
#[serde(default)]
pub profile_age: Option<f64>,
```

Both fields use `#[serde(default)]` matching the `input_ids` pattern. Existing callers that omit these fields continue to deserialize without error (ALG-STR-01 non-breaking requirement satisfied).

### tanaka_hrmax

```rust
pub fn tanaka_hrmax(age: f64) -> f64 {
    208.0 - 0.7 * age
}
```

Exact f64 constants, no rounding. Returns 173.0 for age=50 as specified.

### estimate_hrmax_from_history

Returns the 99.5th percentile of finite HR values when >= 600 finite samples exist, else None. Index clamped with `.min(len - 1)` per threat mitigation T-23-02.

### resolve_effective_hrmax

Resolution order: (1) observed (history >= 600) → p99.5 value; (2) tanaka (age present, insufficient history) → `max(session_max_hr, tanaka_hrmax(age))`; (3) fallback (no age, no history) → session_max_hr. Returns `(f64, String)` where source ∈ {"observed", "tanaka", "fallback"}.

## Test Coverage

11 new tests in metrics_tests.rs covering:
- StrainInput serde round-trip without profile fields
- tanaka_hrmax exact value for age=50
- Tanaka vs 220-age difference property (ages 47-80)
- estimate_hrmax_from_history: 599 samples → None, 600 samples → Some
- estimate_hrmax_from_history: correct p99.5 index
- estimate_hrmax_from_history: NaN/Inf filtering
- resolve_effective_hrmax: all three branches
- hrmax_source label invariant

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] StrainInput struct literals missing new fields**
- **Found during:** Task 1 GREEN phase (cargo test compile error)
- **Issue:** 7 files constructed `StrainInput {}` literals exhaustively — Rust requires all fields or a spread. Adding two new fields caused compile errors in metric_features.rs, perf_budget.rs, property_tests.rs, algorithm_compare_tests.rs, reference_tests.rs, and two tests in metrics_tests.rs.
- **Fix:** Added `profile_sex: None, profile_age: None` to all 7 affected struct literals.
- **Files modified:** All listed under key_files.modified (except metrics.rs itself).
- **Commits:** 88328e4

**2. [Rule 1 - Spec Error] Tanaka >=2 bpm difference property**
- **Found during:** Task 1 GREEN — test failed at age=41 (difference = 0.3 bpm)
- **Issue:** Plan must_haves stated "differs from 220-age by >= 2 bpm for age > 40". Mathematically, tanaka - (220-age) = -12 + 0.3*age, which reaches 2 only at age >= 47 (not > 40).
- **Fix:** Test updated to `ages_47_to_80` with explanatory comment showing the algebra.
- **Commits:** 88328e4

## Threat Mitigations Applied

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-23-01: Tampering via JSON deserialization | `#[serde(default)]` on profile_sex and profile_age; non-finite filtering in estimate_hrmax_from_history | metrics.rs:StrainInput |
| T-23-02: DoS via percentile index overflow | `.min(len - 1)` clamp; early None return when < 600 samples | metrics.rs:estimate_hrmax_from_history |

## Known Stubs

None — all functions are fully implemented and tested.

## Self-Check: PASSED

- `Rust/core/src/metrics.rs` — FOUND: tanaka_hrmax, estimate_hrmax_from_history, resolve_effective_hrmax, StrainInput.profile_sex, StrainInput.profile_age
- Commit 38551fd — FOUND (test RED phase)
- Commit 88328e4 — FOUND (feat GREEN phase)
- `cargo test -p goose-core` — all test results: ok (no failures)
