---
phase: 28-exercise-detection
plan: "01"
subsystem: rust-core
tags: [exercise-detection, algorithm, tdd, rust]
dependency_graph:
  requires: []
  provides: [exercise_detection_module]
  affects: [Rust/core/src/lib.rs]
tech_stack:
  added: []
  patterns: [tdd, rolling-mean-smoothing, nearest-neighbor-alignment, edwards-zones]
key_files:
  created:
    - Rust/core/src/exercise_detection.rs
  modified:
    - Rust/core/src/lib.rs
decisions:
  - Effective hrmax uses resolve_effective_hrmax (Tanaka formula when age provided); test helpers must account for Tanaka adjusting hrmax above profile.max_hr
  - Zone boundaries based on Karvonen %HRR (not %HRmax); zone 2 starts at 50% HRR
  - Calorie split: Keytel active EE (hrr_pct >= 30%) + weight-scaled RMR resting EE
  - zone_time_pct zone 5 = 100 - sum(zones 1-4) to absorb floating-point drift
metrics:
  duration: 25 min
  completed: "2026-06-08"
  tasks: 2
  files: 2
---

# Phase 28 Plan 01: Exercise Detection Algorithm Module Summary

**One-liner:** Retroactive exercise session detection from HR + gravity streams, with Edwards zone intensity gate and per-session strain/calorie computation via existing metrics.rs helpers.

## What Was Built

New module `Rust/core/src/exercise_detection.rs` (603 lines) implementing the full exercise detection algorithm as a pure computation module with no database access.

### Constants (matching exercise.py)
- `MIN_EXERCISE_MIN = 10.0` — minimum session duration
- `MERGE_GAP_S = 60.0` — gap threshold for merging adjacent segments
- `HR_MARGIN_BPM = 30.0` — HR must exceed RHR + 30 bpm to be active
- `MOTION_THRESHOLD = 0.01` — smoothed gravity magnitude gate
- `MOTION_SMOOTH_S = 3.0` — rolling mean window size
- `ALIGN_TOLERANCE_S = 5.0` — max HR-gravity timestamp mismatch
- `MIN_INTENSITY_Z2PLUS = 0.50` — minimum fraction of Z2+ samples per session

### Types
- `HrSample { ts: f64, bpm: u8 }` — matches existing hr_samples JSON format
- `ExerciseProfile { resting_hr, max_hr, age, sex, weight_kg, height_cm, daily_hr_p10 }` — all optional
- `ExerciseSession { device_id, start_ts, end_ts, duration_s, avg_hr, peak_hr, strain, calories_kcal, zone_time_pct: BTreeMap<u8,f64>, hrmax, hrmax_source, rhr_source, avg_hrr_pct }` — complete output

### Algorithm (9 steps)
1. Resolve RHR: profile_override → daily_p10 → empty Vec
2. Resolve HRmax: `resolve_effective_hrmax` (Tanaka formula when age provided)
3. Smooth gravity: rolling mean magnitude over 3s window, subtract 1g static
4. Align HR ↔ gravity: nearest-neighbor within ±5s
5. Dual gate: bpm > RHR + 30 AND smoothed_mag > 0.01
6. Segment: group consecutive active pairs with gap ≤ 60s
7. Merge: combine adjacent segments with gap < 60s
8. Duration filter: drop sessions < 10 min
9. Intensity gate (skip when hrmax_source="fallback" and age=None): discard if Z2+ < 50%
10. Per-session metrics: avg_hr, peak_hr, strain via `goose_strain_v1`, calories via Keytel + RMR split

### Imports
- `crate::metrics::{goose_strain_v1, resolve_effective_hrmax, StrainInput}`
- `crate::store::GravityRow`
- `crate::energy_rollup::keytel_active_kcal_per_min`

## Test Results

All 8 unit tests pass via TDD (GREEN phase):

| Test | Description | Result |
|------|-------------|--------|
| test_alignment_within_tolerance | 3s gap → matched; 6s gap → not matched | ok |
| test_merge_gap_bridging | 45s gap → 1 session; 65s gap → 2 sessions | ok |
| test_minimum_duration_filter | 8 min → rejected; 11 min → kept | ok |
| test_intensity_gate_discard | 30% Z2+ → discarded; 55% Z2+ → kept | ok |
| test_zone_time_pct_sums_to_100 | zone_time_pct values sum to 100 ± 0.01 | ok |
| test_calories_positive | 30-min, 70% HRR, 75kg male → calories > 0 | ok |
| test_rhr_fallback_daily_p10 | resting_hr=None, daily_p10=50 → rhr_source="daily_p10" | ok |
| test_no_rhr_no_sessions | both RHR sources None → empty Vec | ok |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test helper zone boundary mismatch due to Tanaka HRmax adjustment**
- **Found during:** Task 2 GREEN phase — 3 of 8 tests failed initially
- **Issue:** The `make_session` test helper computed zone 2 threshold using `profile.max_hr=185`, but `resolve_effective_hrmax` applies Tanaka formula: tanaka(30)=187 > 185, so effective hrmax=187. This shifts zone 2 boundary from 120 to 121 bpm, making the planned z2_bpm=120 land in zone 1 (HRR pct = 49.2% < 50.0%).
- **Fix:** Updated `make_session` to use `max_hr: Some(190.0)` (> tanaka(30)=187), ensuring effective hrmax=190 and using z2_bpm at 55% HRR (=129) which is unambiguously zone 2.
- **Files modified:** `Rust/core/src/exercise_detection.rs` (test helper only)
- **Commit:** 58cf955

## Known Stubs

None. The module is complete with all required functionality wired. `device_id` in `ExerciseSession` is set to `String::new()` in this plan (no DB access), which will be populated by the bridge/store layer in Plan 28-02.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. Pure computation module. T-28-01 mitigated: `hrmax <= rhr` guard at step 2 returns empty Vec before any computation.

## Self-Check

### Created files exist
- Rust/core/src/exercise_detection.rs: FOUND (603 lines)

### Commits exist
- 58cf955: feat(28-01): exercise_detection module + 8 unit tests — FOUND

## Self-Check: PASSED
