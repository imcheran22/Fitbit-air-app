---
plan: "114-02"
phase: "114"
status: complete
requirement: SLP-NEED-02
commit: 52de9e7
---

# Plan 114-02: Bridge Method + Replace Hardcoded 480.0

## What Was Done

**Bridge method (5-location pattern):**
- `bridge/mod.rs`: added `"sleep.compute_need"` to BRIDGE_METHODS (alphabetical, between add_correction_label and import_external_history)
- `bridge/sleep.rs`: added `SleepComputeNeedArgs { database_path, age_years, prior_strain }`, dispatcher arm, `sleep_compute_need_bridge()` impl calling `crate::sleep_need::compute_sleep_need_with_store`

**Hardcoded 480.0 replaced (4 sites):**
- `metric_features.rs:247` — `SleepFeatureScoreOptions` Default `sleep_need_minutes` → 450.0
- `metric_features.rs:263` — `RecoveryFeatureScoreOptions` Default `sleep_need_minutes` → 450.0
- `bridge/metrics.rs:3243` — `unwrap_or(480.0)` → dynamic compute via store
- `bridge/metrics.rs:3341` — same
- `perf_budget.rs:677` — **preserved as literal 480.0** (Claude's discretion per CONTEXT.md)

**Added `age_years: Option<u8>` field** to both `SleepFeatureScoreOptions` and `RecoveryFeatureScoreOptions` structs.

**Integration tests added to `bridge_tests.rs`:**
- `sleep_compute_need_returns_default_age_bracket` — cold start / age=None → base 450.0
- `sleep_compute_need_applies_strain_and_age` — age=22, strain=15.0 → base 480 + strain 15

## Test Results

```
bridge_methods_constant_matches_dispatcher ... ok (1/1 passed)
sleep_compute_need_returns_default_age_bracket ... ok
sleep_compute_need_applies_strain_and_age ... ok
All test suites: 0 failed
```
