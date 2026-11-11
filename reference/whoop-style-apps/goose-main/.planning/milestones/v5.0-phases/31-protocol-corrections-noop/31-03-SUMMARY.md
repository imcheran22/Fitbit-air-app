---
phase: "31"
plan: "03"
subsystem: sleep-staging
tags: [resp, rem, graceful-degradation, sleep-staging, protocol-correction]
completed: "2026-06-08"
duration_minutes: 10
tasks_completed: 3
files_changed: 3
key-decisions:
  - "resp_available=true default for bridge backwards compatibility; bridge queries resp_samples_between to determine actual availability"
  - "REM gate in classify_sleep_epoch is AND-gated on resp_available; when false, would-be REM → light"
  - "stage_sleep_four_class signature gains resp_available bool; all callers updated"
  - "resp_samples_between standalone method placed in store.rs after gravity2 methods"
---

# Phase 31 Plan 03: PROTO-03 Graceful Resp Degradation Summary

Made the 4-class sleep classifier's REM classification gracefully degrade when resp_samples data is absent.

## What Was Built

- `classify_sleep_epoch` gains `resp_available: bool` parameter; REM branch is AND-gated on it
- `stage_sleep_four_class` gains `resp_available: bool` parameter; threads it to `classify_sleep_epoch`
- Bridge `SleepStagingBridgeArgs` gains `resp_available: bool` (default `true` via `default_resp_available()`)
- Bridge `sleep_staging_bridge` queries `resp_samples_between` to determine actual resp presence when caller leaves default; passes result to `stage_sleep_four_class`
- New test `four_class_no_resp_suppresses_rem`: same scenario as the REM-producing test but with `resp_available=false`; asserts zero REM epochs

## Key Files

- **Modified:** `Rust/core/src/sleep_staging.rs`
- **Modified:** `Rust/core/src/store.rs` (resp_samples_between method)
- **Modified:** `Rust/core/src/bridge.rs`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1-3 | ccc05b1 | fix(31): PROTO-01 Cole-Kripke scale=0.001; PROTO-02 gravity2 table; PROTO-03 resp graceful degrade |

## Deviations from Plan

None — correction executed as specified.

## Self-Check: PASSED

- `resp_available` parameter present in `stage_sleep_four_class` signature confirmed
- `four_class_no_resp_suppresses_rem` test present and passing
- All 128 tests pass
