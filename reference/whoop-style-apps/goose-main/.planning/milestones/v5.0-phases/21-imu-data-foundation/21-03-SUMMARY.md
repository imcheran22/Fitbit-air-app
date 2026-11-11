---
phase: 21-imu-data-foundation
plan: "03"
subsystem: bridge
tags: [rust, imu, bridge, gravity, accelerometer, lsb-to-g]

dependency_graph:
  requires:
    - "21-01: I16SeriesSummary.full_samples field"
    - "21-02: gravity table + insert_gravity_rows + gravity_rows_between"
  provides:
    - "K10 gravity extraction: accelerometer_x/y/z full_samples → LSB→g rows in upload payload"
    - "IMU_LSB_PER_G constant (3900.0) as single configurable scale factor"
    - "store.insert_gravity_rows bridge method (BRIDGE_METHODS + dispatch)"
    - "store.gravity_rows_between bridge method (BRIDGE_METHODS + dispatch)"
    - "IMU-04 doc comment: TOGGLE_IMU_MODE already shipped in Swift layer"
    - "K21 explicit deferred comment with rationale"
  affects:
    - Rust/core/src/bridge.rs
    - Rust/core/tests/bridge_tests.rs

tech-stack:
  added: []
  patterns:
    - "Axis-by-name lookup: find axis by name field (not offset) for robustness across future reordering"
    - "Graceful skip: if any accel axis or full_samples absent, no panic — frame is silently skipped"
    - "TDD RED/GREEN: failing tests committed before implementation"
    - "Bridge method alphabetical constraint: store.* sorts after storage.* (verified by bridge_methods_constant_is_sorted_and_unique unit test)"

key-files:
  created: []
  modified:
    - Rust/core/src/bridge.rs
    - Rust/core/tests/bridge_tests.rs

key-decisions:
  - "IMU_LSB_PER_G = 3900.0 defined as a module-level const in bridge.rs (not protocol.rs) since it is a bridge-layer concern for the upload pipeline"
  - "Axis lookup by name (not by index) to remain robust if parse_k10_raw_motion_summary reorders axes"
  - "Per-sample ts uses the frame's base timestamp_seconds (sub-timestamp interpolation deferred per 21-CONTEXT)"
  - "BRIDGE_METHODS entries: store.* placed after storage.* (alphabetical: 'store' > 'storage' at char 4, e > a)"
  - "K21 explicitly kept as deferred with rationale comment — no fabricated conversion"

requirements-completed: [IMU-03, IMU-04]

metrics:
  duration: "~18 minutes"
  completed: "2026-06-06"
  tasks_completed: 2
  files_modified: 2
---

# Phase 21 Plan 03: Bridge Gravity Extraction — K10 LSB-to-g Conversion

K10 accelerometer frames now populate the gravity stream in the upload payload via IMU_LSB_PER_G (3900.0 LSB/g). Two new bridge methods expose the gravity store to callers.

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-06T22:00:00Z
- **Completed:** 2026-06-06T22:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `const IMU_LSB_PER_G: f64 = 3900.0` — single configurable WHOOP accelerometer scale factor
- Replaced `let gravity: Vec<serde_json::Value> = Vec::new()` placeholder with `let mut gravity` populated from K10 accel axes
- K10 extraction: finds `accelerometer_x/y/z` axes by name, reads `full_samples`, converts `i as f64 / IMU_LSB_PER_G`, pushes one row per sample up to `min(len_x, len_y, len_z)`
- K21 arm updated with explicit deferred comment (axis-to-physical mapping unconfirmed)
- IMU-04 documentation comment added above K10 arm: TOGGLE_IMU_MODE already sent by Swift `startPhysiologyCapture` / `stopPhysiologyCapture`
- Registered `store.gravity_rows_between` and `store.insert_gravity_rows` in `BRIDGE_METHODS` (sorted correctly after `storage.*`)
- Added dispatch arms for both new methods in the `match request.method.as_str()` block
- Three new bridge tests: LSB-to-g correctness (raw 3900 → 1.0 g), row count = min of axis lengths, insert+query roundtrip
- Full test suite green (cargo test -p goose-core)

## Task Commits

Each task was committed atomically:

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Register and dispatch gravity bridge methods | 66ad920 | Rust/core/src/bridge.rs |
| 2 RED | Add failing K10 gravity tests (TDD RED) | 15f4b49 | Rust/core/tests/bridge_tests.rs |
| 2 GREEN | Implement K10 gravity extraction + IMU_LSB_PER_G | 734355a | Rust/core/src/bridge.rs |

## Files Created/Modified

- `Rust/core/src/bridge.rs` — Added `GravityRow` import, `IMU_LSB_PER_G` constant, IMU-04 doc comment, `InsertGravityRowsArgs`, `GravityRowArg`, `GravityRowsBetweenArgs` structs, `insert_gravity_rows_bridge` and `gravity_rows_between_bridge` handler fns, two BRIDGE_METHODS entries, two dispatch arms, K10 gravity extraction replacing empty placeholder, K21 deferred comment
- `Rust/core/tests/bridge_tests.rs` — Three new tests: `bridge_k10_gravity_extraction_lsb_to_g_conversion`, `bridge_k10_gravity_row_count_and_base_ts`, `bridge_gravity_insert_query_roundtrip`

## Decisions Made

- `IMU_LSB_PER_G` defined in `bridge.rs` (not `protocol.rs`) because the LSB→g conversion is a bridge-layer concern: the protocol layer stores raw i16 samples and the bridge converts them to physical units for the upload API
- Axis lookup by `name` field (`"accelerometer_x"`) rather than by index so the code remains correct if `parse_k10_raw_motion_summary` ever reorders axes
- Per-sample `ts` uses the frame's `timestamp_seconds` base value for all samples; per-sample sub-timestamp interpolation is deferred (noted in 21-CONTEXT Deferred Ideas)
- `BRIDGE_METHODS` alphabetical constraint: `"store.*"` sorts after `"storage.*"` because at character index 4, `'e' > 'a'`. The existing `bridge_methods_constant_is_sorted_and_unique` unit test catches any future ordering mistakes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BRIDGE_METHODS sort order: store.* after storage.***
- **Found during:** Task 2 full test suite run
- **Issue:** Initial placement of `store.gravity_rows_between` and `store.insert_gravity_rows` before `storage.check` violated the sorted constraint enforced by `bridge_methods_constant_is_sorted_and_unique`
- **Fix:** Moved `store.*` entries to after `storage.compact_raw_evidence` (correct alphabetical position)
- **Files modified:** `Rust/core/src/bridge.rs`
- **Commit:** 734355a (included in GREEN commit)

## Known Stubs

None — K10 gravity rows are fully wired from `full_samples` through LSB→g conversion to the upload payload JSON. The `gravity` array in the upload result is non-empty for any K10 frame with accel axes.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The two new bridge methods accept `database_path` + `device_id` args (standard pattern for local SQLite access, consistent with all other store bridge methods).

## Self-Check: PASSED

- `Rust/core/src/bridge.rs` exists and contains `IMU_LSB_PER_G`, `let mut gravity`, `TOGGLE_IMU_MODE`, `store.gravity_rows_between`, `store.insert_gravity_rows`, `insert_gravity_rows_bridge`, `gravity_rows_between_bridge`
- `Rust/core/tests/bridge_tests.rs` exists and contains `bridge_k10_gravity_extraction_lsb_to_g_conversion`, `bridge_k10_gravity_row_count_and_base_ts`, `bridge_gravity_insert_query_roundtrip`
- Commit 66ad920: feat(21-03): register and dispatch ... — FOUND
- Commit 15f4b49: test(21-03): add failing K10 gravity ... — FOUND
- Commit 734355a: feat(21-03): extract K10 gravity rows ... — FOUND
- `cargo test -p goose-core` — green, all tests pass
