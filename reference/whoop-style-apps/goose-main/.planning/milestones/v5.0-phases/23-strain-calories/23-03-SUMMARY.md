---
phase: 23-strain-calories
plan: "03"
subsystem: rust-metrics
tags: [energy, mifflin-st-jeor, keytel, harris-benedict, rmr, calorie, tdd, algorithm]
dependency_graph:
  requires: []
  provides: [rmr_mifflin_st_jeor, keytel_active_kcal_per_min, harris_benedict_rmr_kcal_day, EnergyDailyRollupOptions.profile_height_cm, resting_kcal_mifflin_height_absent]
  affects: [Rust/core/src/energy_rollup.rs, Rust/core/src/bridge.rs]
tech_stack:
  added: []
  patterns: [Ghidra-confirmed-f64-coefficients, Option-with-serde-default, quality-flag-on-missing-profile-field, 30pct-HRR-threshold-split]
key_files:
  created: []
  modified:
    - Rust/core/src/energy_rollup.rs
    - Rust/core/src/bridge.rs
    - Rust/core/tests/energy_rollup_tests.rs
key-decisions:
  - "Unknown/None sex uses mean intercept for Mifflin (-78), mean raw for Keytel, and mean of male+female for H-B — consistent across all three formulas"
  - "active_kcal 30% HRR Keytel path only fires when both average_hr and age are available; MET fallback preserved for all other cases"
  - "profile_height_cm added to both EnergyDailyRollupOptions (daily) and the hourly rollup active_kcal call for API consistency — plan named only the daily struct but the active_kcal signature change required updating the hourly path too"
  - "resting_kcal_mifflin_height_absent quality flag mirrors the existing profile_age_missing/profile_sex_missing flag pattern (emitted even on non-passing rollup)"
patterns-established:
  - "pub fn for algorithm functions: exact Ghidra f64 constants, no rounding, no shorthand literals"
  - "Quality flag emitted for each missing profile field that degrades algorithm precision"
  - "HR-threshold split: Keytel used above 30% HRR, MET model retained below — both paths co-exist"
requirements-completed: [ALG-CAL-01, ALG-CAL-02]
duration: 14min
completed: 2026-06-08
---

# Phase 23 Plan 03: Mifflin-St Jeor RMR + Keytel + Harris-Benedict Calorie Formulas Summary

**Ghidra-confirmed calorie formulas (Mifflin-St Jeor RMR, Keytel active EE, Harris-Benedict RMR) replace the crude weight*22.0 proxy and MET model, split on the 30% HRR threshold, with `profile_height_cm` plumbed through all bridge construction sites.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-08T08:25:24Z
- **Completed:** 2026-06-08T08:39:19Z
- **Tasks:** 2 (each with RED + GREEN TDD commits)
- **Files modified:** 3

## Accomplishments

- `rmr_mifflin_st_jeor(weight_kg, height_cm, age, sex)` with exact intercepts: male +5, female -161, unknown -78
- `keytel_active_kcal_per_min(hr, weight_kg, age, sex, hrmax)` with Ghidra-confirmed divisor 251.04; HR capped at hrmax; result clamped >= 0
- `harris_benedict_rmr_kcal_day(weight_kg, height_cm, age, sex)` with exact H-B coefficients, height converted to metres internally
- `EnergyDailyRollupOptions.profile_height_cm: Option<f64>` — additive field, Default=None, existing callers unaffected
- Mifflin RMR replaces `weight*22.0` proxy when both `profile_height_cm` and `profile_age_years` are present
- `resting_kcal_mifflin_height_absent` quality flag emitted on fallback (mirrors existing `profile_age_missing` pattern)
- Keytel active path activated above 30% HRR threshold when age is available; MET model retained otherwise
- `profile_height_cm` plumbed via `#[serde(default)]` into `EnergyDailyRollupArgs` and `EnergyCaptureValidationArgs`, and wired at all 4 `EnergyDailyRollupOptions` / `EnergyHourlyRollupOptions` construction sites

## Task Commits

TDD cycle — RED then GREEN per task:

1. **Task 1 (RED):** `0dc245c` — test(23-03): failing tests for rmr_mifflin_st_jeor, keytel_active_kcal_per_min, harris_benedict_rmr_kcal_day
2. **Task 1 (GREEN):** `a025aa4` — feat(23-03): implement all three calorie functions with exact Ghidra coefficients
3. **Task 2 (RED):** `0e1aad3` — test(23-03): failing tests for profile_height_cm field + Mifflin/Keytel rollup wiring
4. **Task 2 (GREEN):** `7d8b2fe` — feat(23-03): add profile_height_cm, wire Mifflin RMR and Keytel into rollup

## Files Created/Modified

- `Rust/core/src/energy_rollup.rs` — `rmr_mifflin_st_jeor`, `keytel_active_kcal_per_min`, `harris_benedict_rmr_kcal_day` (public functions); `EnergyDailyRollupOptions.profile_height_cm`; `resting_kcal_mifflin_height_absent` quality flag; Mifflin wiring in daily rollup; Keytel 30% HRR split in `active_kcal`; `active_kcal` signature extended with `profile_age` + `profile_sex`
- `Rust/core/src/bridge.rs` — `profile_height_cm: Option<f64>` (serde default) on `EnergyDailyRollupArgs` and `EnergyCaptureValidationArgs`; field wired at 3 `EnergyDailyRollupOptions` + 1 `EnergyHourlyRollupOptions` construction sites
- `Rust/core/tests/energy_rollup_tests.rs` — 13 new tests (Task 1: 8 unit tests for exact coefficients, clamping, cap; Task 2: 5 integration/structural tests)

## Decisions Made

- Unknown/None sex uses mean intercept (-78 for Mifflin, mean raw formula for Keytel, mean of M+F for H-B) — consistent across all three formulas
- `active_kcal` signature extended rather than creating a new wrapper — keeps the call site single and avoids duplication
- Quality flag `resting_kcal_mifflin_height_absent` emitted in both passing and non-passing rollup paths (flags are computed before `pass` check)
- `EnergyHourlyRollupOptions` updated with the new `active_kcal` signature (age/sex arguments) even though Mifflin resting logic was not added to the hourly path — the hourly rollup already has `profile_age_years` and can benefit from Keytel; a follow-up plan can add Mifflin resting to hourly if needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hourly rollup active_kcal signature mismatch**
- **Found during:** Task 2 GREEN (cargo compile)
- **Issue:** The plan added `profile_age` and `profile_sex` to `active_kcal`'s signature but only mentioned updating the daily rollup call site. The hourly rollup call at ~line 892 still passed the old 7-argument signature and would not compile.
- **Fix:** Updated the hourly rollup `active_kcal` call to pass the two new arguments (`options.profile_age_years.map(f64::from)`, `options.profile_sex`). Mifflin resting logic was intentionally NOT added to the hourly path (out of scope per plan wording).
- **Files modified:** Rust/core/src/energy_rollup.rs
- **Committed in:** 7d8b2fe (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Existing test struct literals missing new field**
- **Found during:** Task 2 GREEN (cargo compile)
- **Issue:** Two existing `EnergyDailyRollupOptions {}` struct literals in `energy_rollup_tests.rs` (lines 116 and 225) omitted the new `profile_height_cm` field, causing exhaustive-struct-literal compile errors.
- **Fix:** Added `profile_height_cm: None` to both literals. No behavior change — `None` keeps existing proxy path.
- **Files modified:** Rust/core/tests/energy_rollup_tests.rs
- **Committed in:** 7d8b2fe (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking compile errors)
**Impact on plan:** Both fixes necessary for compilation. No scope creep.

## Issues Encountered

- Plan stated "4 EnergyDailyRollupOptions constructions" but bridge.rs has 3 `EnergyDailyRollupOptions` + 1 `EnergyHourlyRollupOptions` = 4 total. All four were updated.

## Threat Mitigations Applied

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-23-05: Tampering via profile_height_cm | `#[serde(default)]` Option<f64>; rollup falls back to proxy + quality flag when absent | bridge.rs:EnergyDailyRollupArgs |
| T-23-06: Information Disclosure | Calorie outputs are derived metrics only; no PII beyond already-accepted profile values | energy_rollup.rs |

## Known Stubs

None — all three functions are fully implemented with exact Ghidra-confirmed coefficients, tested, and wired into the rollup.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes introduced.

## Self-Check: PASSED

- `Rust/core/src/energy_rollup.rs` — FOUND: rmr_mifflin_st_jeor, keytel_active_kcal_per_min, harris_benedict_rmr_kcal_day, profile_height_cm, resting_kcal_mifflin_height_absent
- `Rust/core/src/bridge.rs` — FOUND: profile_height_cm in EnergyDailyRollupArgs and EnergyCaptureValidationArgs
- Commit 0dc245c — FOUND (RED phase Task 1)
- Commit a025aa4 — FOUND (GREEN phase Task 1)
- Commit 0e1aad3 — FOUND (RED phase Task 2)
- Commit 7d8b2fe — FOUND (GREEN phase Task 2)
- `cargo test -p goose-core` — all 75 test suites: ok (0 failures)
