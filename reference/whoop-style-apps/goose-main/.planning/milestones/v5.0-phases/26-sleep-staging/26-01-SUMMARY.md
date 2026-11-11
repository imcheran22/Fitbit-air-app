---
phase: 26-sleep-staging
plan: 01
subsystem: algorithm
tags: [rust, actigraphy, sleep-staging, cole-kripke, gravity, imu, bridge]

# Dependency graph
requires:
  - phase: 24-sleep-metrics-baselines
    provides: gravity_rows_between and GravityRow store abstraction
provides:
  - Cole-Kripke binary wake/sleep actigraphy classifier in sleep_staging.rs
  - metrics.sleep_staging bridge method callable from Swift
  - SleepStagingInput / SleepStagingOutput / SleepEpoch types
  - Named constants: COLE_KRIPKE_SCALE_FACTOR, COLE_KRIPKE_WAKE_THRESHOLD, COLE_KRIPKE_EPOCH_MINUTES
  - staging_method strings: actigraphy_uncalibrated / no_imu_data
affects: [26-sleep-staging, sleep-ui, hypnogram]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure algorithm function (stage_sleep) receives pre-fetched rows, no DB access — same pattern as metrics functions
    - Bridge wrapper opens store, maps GravityRow to tuples, delegates to pure function — mirrors goose_recovery_v1_bridge
    - Named constants for all magic numbers — COLE_KRIPKE_SCALE_FACTOR/WAKE_THRESHOLD/EPOCH_MINUTES

key-files:
  created:
    - Rust/core/src/sleep_staging.rs
  modified:
    - Rust/core/src/lib.rs
    - Rust/core/src/bridge.rs

key-decisions:
  - "Activity count uses inter-sample magnitude difference (|mag_i - mag_{i-1}|), not absolute magnitude sum — captures motion transitions, simpler than Euclidean delta per-axis"
  - "COLE_KRIPKE_SCALE_FACTOR=1.0 exposed as a named constant (not inlined) so future calibration with real WHOOP overnight sessions only requires changing one value"
  - "stage_sleep() is pure (no DB access) — gravity rows are fetched in the bridge wrapper and passed as tuples; makes unit testing trivial without a temp DB"
  - "Binary wake/sleep spine only in Plan 26-01; 4-class extension (light/deep/REM) deferred to Plan 26-02 per plan scope"

patterns-established:
  - "Algorithm-purity pattern: pure Rust fn receives pre-fetched data slices, no DB I/O inside the algorithm; bridge wrapper handles store access"
  - "BRIDGE_METHODS list + match arm + arg struct + bridge fn — same structure as every other bridge method; alphabetical insertion"

requirements-completed: [ALG-SLP-03]

# Metrics
duration: 16min
completed: 2026-06-08
---

# Phase 26 Plan 01: Sleep Staging — Actigraphy Spine Summary

**Cole-Kripke 1992 binary wake/sleep classifier over 1-minute gravity-table epochs, exposed via metrics.sleep_staging bridge method with mandatory actigraphy_uncalibrated quality flag**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-08T11:45:33Z
- **Completed:** 2026-06-08T12:01:17Z
- **Tasks:** 2
- **Files modified:** 3 (sleep_staging.rs created, lib.rs + bridge.rs modified)

## Accomplishments
- Created `Rust/core/src/sleep_staging.rs`: pure Cole-Kripke actigraphy classifier, 1-minute epoch bucketing, inter-sample magnitude-difference activity counts, 7-term weighted D score, binary wake/sleep classification
- Registered `pub mod sleep_staging;` in lib.rs (alphabetical, before sleep_validation)
- Added `metrics.sleep_staging` bridge method: SleepStagingBridgeArgs, sleep_staging_bridge wrapper, dispatch arm, BRIDGE_METHODS entry
- 7 tests green: 6 unit tests in sleep_staging.rs + 1 bridge round-trip test in bridge.rs

## Task Commits

1. **Task 1: sleep_staging.rs — types, activity counts, Cole-Kripke binary classifier** - `ec64cb4` (feat)
2. **Task 2: Register module + metrics.sleep_staging bridge method** - `b2dfde3` (feat)

## Files Created/Modified
- `Rust/core/src/sleep_staging.rs` — Cole-Kripke classifier, SleepStagingInput/Output/SleepEpoch, named constants, 6 unit tests
- `Rust/core/src/lib.rs` — `pub mod sleep_staging;` added
- `Rust/core/src/bridge.rs` — SleepStagingBridgeArgs, sleep_staging_bridge(), dispatch arm, BRIDGE_METHODS entry, bridge test

## Decisions Made
- Activity count: inter-sample magnitude difference (`|√(x²+y²+z²)_i - √(x²+y²+z²)_{i-1}|`) — simpler than absolute per-axis Euclidean delta, captures motion transitions; first sample in epoch contributes 0
- Pure function pattern: `stage_sleep(&input, &[(ts,x,y,z)])` receives pre-fetched tuples so it is fully testable without a DB — follows the same pattern as other metric functions in this codebase
- COLE_KRIPKE_SCALE_FACTOR exposed as a named `pub const` at value 1.0 — no calibration applied until real WHOOP overnight staging data is available; call sites never inline the value
- Binary spine only (wake/sleep) — 4-class extension deferred to Plan 26-02 per plan scope

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 26-01 deliverables are complete and tested; Plan 26-02 can extend `SleepEpoch.stage` and `stage_sleep` in place (same file, same types)
- `SleepStagingOutput` has `staging_method`, `epochs`, `wake_fraction`, `sleep_minutes` — Plan 26-02 can add `aasm` summary field without breaking Swift callers
- Swift caller can now invoke `metrics.sleep_staging` and display staging_method=no_imu_data as a placeholder until Plan 26-02 adds the 4-class hypnogram

---
*Phase: 26-sleep-staging*
*Completed: 2026-06-08*
