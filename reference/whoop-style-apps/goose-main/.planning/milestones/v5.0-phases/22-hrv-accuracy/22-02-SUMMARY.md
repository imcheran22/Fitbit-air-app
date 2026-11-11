---
phase: 22-hrv-accuracy
plan: "02"
subsystem: rust-core-metrics
tags: [hrv, ectopic-filter, lipponen-tarvainen, rmssd, algorithm]
dependency_graph:
  requires: [ALG-HRV-01]
  provides: [ALG-HRV-02]
  affects: [goose_hrv_v0, HrvOutput, metrics.rs]
tech_stack:
  added: []
  patterns: [free-function-ectopic-filter, rolling-median-rejection, per-segment-application]
key_files:
  created: []
  modified:
    - Rust/core/src/metrics.rs
    - Rust/core/tests/metrics_tests.rs
    - Rust/core/tests/export_tests.rs
decisions:
  - "lipponen_tarvainen_filter is a free function (not a method) placed near rmssd_segmented for testability"
  - "apply_ectopic_filter helper accounts removal counts across all segments and returns (filtered_segments, total_before, total_after)"
  - "rolling median uses a centred window of up to 5 beats clamped to segment boundaries — standard approach for small edge windows"
  - "rmssd() free function kept with #[allow(dead_code)] since all paths now use rmssd_segmented"
  - "export_tests.rs metric_value_rows updated 7->8 (ectopic_filter_removal_fraction is a numeric HrvOutput field, auto-persisted)"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-06"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 22 Plan 02: Lipponen-Tarvainen Ectopic Beat Filter Summary

**One-liner:** Lipponen-Tarvainen-style ectopic beat filter (rolling 5-beat centred median, 0.20 relative threshold) applied per gap-segment before RMSSD; removal fraction exposed on `HrvOutput.ectopic_filter_removal_fraction` (ALG-HRV-02).

## What Was Built

Extended `goose_hrv_v0` in `Rust/core/src/metrics.rs` with ALG-HRV-02 (ectopic beat filter):

1. **`HrvOutput.ectopic_filter_removal_fraction: f64`** — additive field appended after `pnn50_fraction`. Value is `0.0` when no ectopic beats are removed; otherwise `removed_count / total_entering_filter`. Serialised/persisted as a metric value row — export tests updated from 7 to 8 metric value rows.

2. **`fn lipponen_tarvainen_filter(segment: &[f64]) -> Vec<f64>`** — free function near `rmssd_segmented`. For each interval `i`, builds a centred window of up to 5 beats (clamped to segment bounds), sorts to find the median, and rejects interval `i` when `|segment[i] - median| > 0.20 * median`. Constants `ECTOPIC_WINDOW = 5` and `ECTOPIC_THRESHOLD = 0.20` are named at module scope.

3. **`fn apply_ectopic_filter(segments: &[Vec<f64>]) -> (Vec<Vec<f64>>, usize, usize)`** — accounting helper; returns `(filtered_segments, total_before, total_after)`. Caller computes removal fraction.

4. **Wired into `goose_hrv_v0`** — application order is now:
   1. 300–2000 ms range gate
   2. Gap segmentation (ALG-HRV-01)
   3. Ectopic filter per segment (ALG-HRV-02)
   4. `rmssd_segmented` on cleaned segments

5. **`ectopic_beats_removed` quality flag** — pushed to `quality_flags` when `removed > 0`.

6. **Two new unit tests** in `metrics_tests.rs`:
   - `goose_hrv_v0_removes_ectopic_beat_and_reports_fraction`: input `[800,810,790,1500,805,795,800,810]` ms, `rr_timestamps_s: None` — asserts `ectopic_filter_removal_fraction > 0.0`, RMSSD `< 100.0` ms, and `ectopic_beats_removed` flag present.
   - `goose_hrv_v0_clean_input_has_zero_removal_fraction`: clean `[800,810,790,800]` ms input — asserts `ectopic_filter_removal_fraction == 0.0` and RMSSD equals hand-derived `sqrt(200)`.

## Verification

- `cargo build -p goose-core`: green, no warnings (dead_code suppressed with `#[allow(dead_code)]` on `rmssd`).
- `cargo test -p goose-core`: green — 0 failures across all test suites.
- Ectopic spike (1500 ms among 800 ms beats) is removed; RMSSD is low.
- Clean inputs: removal fraction = 0.0, RMSSD unchanged from hand-derived value.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | 96169ee | test(22-02): add failing tests for ectopic filter and HrvOutput.ectopic_filter_removal_fraction |
| 2 (GREEN) | 85a6ad5 | feat(22-02): implement lipponen_tarvainen_filter and apply ectopic filter per segment |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated export_tests.rs metric_value_rows counts (7 → 8)**
- **Found during:** Task 2 (full cargo test run)
- **Issue:** Three export tests asserted `metric_value_rows == 7`; adding `ectopic_filter_removal_fraction` to `HrvOutput` adds a new persisted metric value row per HRV run, making the correct count 8.
- **Fix:** Updated all six assertion sites across three tests in `export_tests.rs`.
- **Files modified:** `Rust/core/tests/export_tests.rs`
- **Commit:** 85a6ad5

**2. [Rule 1 - Bug] Updated metrics_tests.rs metric_values.len() (7 → 8)**
- **Found during:** Task 2
- **Issue:** `hrv_definition_and_run_persist_to_sqlite` expected 7 metric values per HRV run.
- **Fix:** Updated assertion to 8.
- **Files modified:** `Rust/core/tests/metrics_tests.rs`
- **Commit:** 96169ee (staged together with new tests)

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- `Rust/core/src/metrics.rs` modified: confirmed (`grep -n "ectopic_filter_removal_fraction: f64"` → line 46; `grep -n "fn lipponen_tarvainen_filter"` → 1 match).
- `Rust/core/tests/metrics_tests.rs` modified: confirmed (2 new tests present).
- `Rust/core/tests/export_tests.rs` modified: confirmed (6 assertions updated).
- Commits 96169ee and 85a6ad5 exist in git log.
- `cargo test -p goose-core`: green, 0 failures.
