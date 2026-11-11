---
phase: "31"
plan: "01"
subsystem: sleep-staging
tags: [cole-kripke, scale-factor, sleep-staging, correction]
completed: "2026-06-08"
duration_minutes: 5
tasks_completed: 1
files_changed: 1
key-decisions:
  - "Scale factor 0.001 converts raw g-unit inter-sample magnitude differences to the activity index range used by Cole 1992; value derived from published algorithm specification"
  - "Wake detection test updated to use amplitude 200 (activity_count≈200) so D≈200*0.001*665/100=1.33 > threshold 1.0"
---

# Phase 31 Plan 01: PROTO-01 Cole-Kripke Scale Factor Summary

Fixed COLE_KRIPKE_SCALE_FACTOR from 1.0 to 0.001 to match Cole 1992 activity index units.

## What Was Built

- `COLE_KRIPKE_SCALE_FACTOR` constant corrected from `1.0` to `0.001` in `sleep_staging.rs`
- Comment updated to document the g-unit → activity-index conversion purpose
- `cole_kripke_classifies_wake_and_sleep` test updated: oscillation amplitude changed from 1.0 to 200 so the D score exceeds the wake threshold at correct scale

## Key Files

- **Modified:** `Rust/core/src/sleep_staging.rs`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ccc05b1 | fix(31): PROTO-01 Cole-Kripke scale=0.001; PROTO-02 gravity2 table; PROTO-03 resp graceful degrade |

## Deviations from Plan

None — correction executed exactly as specified.

## Self-Check: PASSED

- `COLE_KRIPKE_SCALE_FACTOR = 0.001` confirmed in sleep_staging.rs
- All 128 tests pass after the change
