---
phase: 21-imu-data-foundation
plan: "01"
subsystem: protocol
tags: [rust, imu, protocol, i16, motion, accelerometer]

requires: []
provides:
  - "I16SeriesSummary.full_samples: Option<Vec<i16>> field in protocol.rs"
  - "summarize_i16_series populates full_samples with all parsed_count values"
  - "Tests covering 100-sample K10 preservation and truncation length invariant"
affects:
  - 21-02-gravity-schema
  - 21-03-bridge-gravity-extraction

tech-stack:
  added: []
  patterns:
    - "Additive field pattern: new fields on serialised structs are Option<T> with None as default-compatible absent state"
    - "Full vs preview pattern: preview capped at 8 for UI display, full_samples uncapped for algorithmic use"

key-files:
  created: []
  modified:
    - Rust/core/src/protocol.rs
    - Rust/core/tests/protocol_tests.rs

key-decisions:
  - "full_samples is Option<Vec<i16>> (not Vec<i16>) for serde compatibility with older stored JSON that lacks the field"
  - "Both construction sites in summarize_i16_series explicitly set the field; no implicit default"
  - "Early-return path (expected_count == 0) sets full_samples: Some(Vec::new()) not None, preserving the Some invariant"

patterns-established:
  - "summarize_i16_series builds a separate full Vec alongside preview, both in a single loop pass"

requirements-completed: [IMU-01]

duration: 8min
completed: 2026-06-06
---

# Phase 21 Plan 01: IMU Data Foundation — full_samples Preservation

**Added `full_samples: Option<Vec<i16>>` to `I16SeriesSummary` so all 100 K10/K21 accelerometer samples survive the parse layer instead of being truncated at 8**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-06T21:48:12Z
- **Completed:** 2026-06-06T21:56:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `pub full_samples: Option<Vec<i16>>` field to `I16SeriesSummary` struct (additive, serde-compatible)
- Both construction sites in `summarize_i16_series` (early-return and main path) set the field
- All 100 K10 accelerometer samples per axis are now retained through the parse pipeline instead of the previous 8-sample cap
- Test suite confirms: 100 K10 samples preserved, first three values match injected sequence, preview still capped at 8, truncation length invariant (full_samples.len() == parsed_count)
- All 16 protocol tests pass; R17 full-struct assertion updated with new field

## Task Commits

Each task was committed atomically:

1. **Task 1: Add full_samples field to I16SeriesSummary and populate it** - `8ee312d` (feat)
2. **Task 2: Update existing full-struct assertion and add full_samples preservation tests** - `1773bb6` (test)

## Files Created/Modified

- `Rust/core/src/protocol.rs` — Added `pub full_samples: Option<Vec<i16>>` to `I16SeriesSummary` struct; added `let mut full = Vec::new()` in parse loop; set `full_samples: Some(full)` at both construction sites
- `Rust/core/tests/protocol_tests.rs` — Added `full_samples: Some(vec![1000, -1000, 200])` to R17 struct literal; added three new assertions in K10 test; added truncation length assertion

## Decisions Made

- `full_samples` is `Option<Vec<i16>>` rather than `Vec<i16>` to maintain serde compatibility if any persisted JSON from before this change lacks the field. Future bridge callers can unwrap safely — the implementation guarantees Some at both construction sites.
- The existing `preview` field semantics are completely unchanged (still capped at 8). Downstream code that reads only `preview` is unaffected.
- `expected_count == 0` early-return path sets `full_samples: Some(Vec::new())` (not `None`) so callers get a consistent `Some` without special-casing the empty series.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `bridge_runs_storage_check_against_app_database_path` test was already failing before this plan's changes (introduced by a prior `feat(21-02)` commit that added the gravity schema migration without updating the storage_check registry). This failure is pre-existing and out of scope for plan 21-01. All 16 protocol tests that are in scope pass cleanly.

## Known Stubs

None - `full_samples` is fully wired and populated with real data.

## Next Phase Readiness

- `full_samples` field is available for plan 21-03 (bridge gravity extraction) to read K10/K21 accelX/Y/Z axes
- The pre-existing `bridge_runs_storage_check_against_app_database_path` failure should be resolved when `storage_check.rs` is updated to include the `gravity` table (plan 21-02 scope)

---
*Phase: 21-imu-data-foundation*
*Completed: 2026-06-06*
