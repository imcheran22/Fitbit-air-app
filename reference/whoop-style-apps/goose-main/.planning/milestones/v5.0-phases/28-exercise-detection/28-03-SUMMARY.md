---
phase: 28-exercise-detection
plan: "03"
subsystem: bridge
tags: [bridge, exercise-detection, integration-tests, rust]
dependency_graph:
  requires: [exercise_detection_module, exercise_sessions_table_v17]
  provides: [exercise.detect_sessions bridge method, exercise.sessions_between bridge method]
  affects: [Rust/core/src/bridge.rs]
tech_stack:
  added: []
  patterns: [bridge-dispatch, request_args-and_then-pattern, tempfile-integration-tests]
key_files:
  created:
    - Rust/core/tests/exercise_detection_tests.rs
  modified:
    - Rust/core/src/bridge.rs
decisions:
  - Used GravityRow directly in DetectExerciseSessionsArgs (implements Deserialize) instead of creating a redundant GravityRowArg2 struct
  - exercise.* methods sorted alphabetically between diagnostics.* and export.* in BRIDGE_METHODS (not between export.* and health_sync.* as originally planned — "i" < "p" means exercise < export)
  - Integration tests use tempfile::tempdir() following v24_biometric_bridge_tests.rs pattern
  - Bridge functions follow existing open_bridge_store + request_args + and_then pattern
metrics:
  duration: "~25 min"
  completed: "2026-06-08T16:30:00Z"
  tasks: 2
  files: 2
---

# Phase 28 Plan 03: Bridge Dispatch for Exercise Detection Summary

**One-liner:** Two bridge dispatch arms wiring exercise detection algorithm and store persistence into the JSON-over-FFI bridge, with 4 integration tests covering the full detect→persist→query path.

## What Was Built

### bridge.rs changes

- **`ExerciseSessionRow` added to store imports** — needed to construct rows for `insert_exercise_session`
- **BRIDGE_METHODS** updated with two new entries in alphabetical position (between `diagnostics.property_suite` and `export.raw_timeframe`):
  - `"exercise.detect_sessions"`
  - `"exercise.sessions_between"`
- **Arg structs** added near the gravity rows section:
  - `HrSampleArg { ts: f64, bpm: u8 }`
  - `ExerciseProfileArg { resting_hr, max_hr, age, sex, weight_kg, height_cm, daily_hr_p10 }` (all optional)
  - `DetectExerciseSessionsArgs { database_path, device_id, hr_samples: Vec<HrSampleArg>, gravity_rows: Vec<GravityRow>, profile: ExerciseProfileArg }`
  - `ExerciseSessionsBetweenArgs { database_path, device_id, ts_start, ts_end }`
- **`exercise_detect_sessions_bridge`**: opens store, converts args to `HrSample` + `ExerciseProfile`, calls `detect_exercise_sessions`, inserts each session via `insert_exercise_session`, returns `{sessions_detected, sessions_inserted, warnings}`
- **`exercise_sessions_between_bridge`**: opens store, calls `exercise_sessions_between`, returns `{sessions: [...]}`
- **Dispatch arms** added in `handle_bridge_request_inner` after `export.validate_bundle`:
  - `"exercise.detect_sessions" => request_args::<DetectExerciseSessionsArgs>(&request).and_then(exercise_detect_sessions_bridge)...`
  - `"exercise.sessions_between" => request_args::<ExerciseSessionsBetweenArgs>(&request).and_then(exercise_sessions_between_bridge)...`

### exercise_detection_tests.rs (new file, 333 lines)

4 integration tests covering the full bridge path:

| Test | Description | Result |
|------|-------------|--------|
| test_detect_sessions_roundtrip | 15-min 1Hz synthetic session at bpm=140 → detected>=1, inserted>=1, queryable via sessions_between | ok |
| test_detect_sessions_below_duration_threshold | 8-min bout → sessions_detected==0 (rejected by MIN_EXERCISE_MIN=10) | ok |
| test_detect_sessions_gap_merge | Two 6-min windows with 41s gap → merged into 1 session, duration_s>=700 | ok |
| test_sessions_between_empty_range | Query ts_start=9000..9100 with no data → empty sessions array | ok |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BRIDGE_METHODS alphabetical position correction**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified placing `exercise.*` between `"export.validate_bundle"` and `"health_sync.activity_dry_run"`. However, alphabetical sort puts `"exercise"` (e-x-e-r-c-i-s-e) before `"export"` (e-x-p-o-r-t) because 'i' < 'p'. Placing after `export.*` would fail `bridge_methods_constant_is_sorted_and_unique`.
- **Fix:** Placed `exercise.detect_sessions` and `exercise.sessions_between` between `"diagnostics.property_suite"` and `"export.raw_timeframe"` — the correct alphabetical position.
- **Files modified:** `Rust/core/src/bridge.rs` (BRIDGE_METHODS array only)
- **Verified by:** `bridge_methods_constant_is_sorted_and_unique` test passes

**2. [Rule 2 - Simplification] Used GravityRow directly instead of GravityRowArg2**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified a `GravityRowJson` struct with device_id + ts + x + y + z. `GravityRow` in store.rs already has `#[derive(Deserialize)]` and the same fields.
- **Fix:** Used `Vec<GravityRow>` directly in `DetectExerciseSessionsArgs`, eliminating redundant conversion code.
- **Files modified:** `Rust/core/src/bridge.rs`

## Known Stubs

None. Both bridge methods are fully wired with real algorithm + store calls.

## Threat Surface Scan

No new network endpoints or auth paths. The exercise bridge methods are part of the existing JSON-over-FFI bridge (local trust boundary between Swift app and Rust core). T-28-06 (HR value spoofing) is addressed by the existing `clamp(0.0, 100.0)` in the HRR computation inside `exercise_detection.rs`. T-28-08 (large array allocation) accepted per plan.

## Self-Check

### Created files exist
- Rust/core/tests/exercise_detection_tests.rs: FOUND (333 lines)

### Modified files exist
- Rust/core/src/bridge.rs: FOUND

### Commits exist
- 24ae813: feat(28-03): bridge dispatch arms for exercise.detect_sessions + exercise.sessions_between — FOUND
- 3adb874: test(28-03): integration tests — detect→persist→query roundtrip for exercise detection — FOUND

### Test results
- bridge_methods_constant_is_sorted_and_unique: PASS
- bridge_methods_constant_matches_dispatcher: PASS
- exercise_detection_tests: 4/4 PASS
- cargo test -p goose-core overall: 92 passed; 0 failed

## Self-Check: PASSED
