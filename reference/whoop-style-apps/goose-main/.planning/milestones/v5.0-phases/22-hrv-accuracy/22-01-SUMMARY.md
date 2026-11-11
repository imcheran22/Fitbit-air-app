---
phase: 22-hrv-accuracy
plan: "01"
subsystem: rust-core-metrics
tags: [hrv, rmssd, ble-gap, segmentation, algorithm]
dependency_graph:
  requires: []
  provides: [ALG-HRV-01]
  affects: [goose_hrv_v0, HrvInput, metrics.rs]
tech_stack:
  added: []
  patterns: [free-function-segmentation, segment-aware-rmssd]
key_files:
  created: []
  modified:
    - Rust/core/src/metrics.rs
    - Rust/core/tests/metrics_tests.rs
    - Rust/core/tests/algorithm_compare_tests.rs
    - Rust/core/tests/reference_tests.rs
    - Rust/core/tests/export_tests.rs
    - Rust/core/src/perf_budget.rs
    - Rust/core/src/property_tests.rs
    - Rust/core/src/metric_features.rs
decisions:
  - "segment_rr_by_gaps and rmssd_segmented are free functions (not methods) for testability"
  - "gap threshold is a parameter in the free function but hardcoded to 3.0 s at the call site in goose_hrv_v0"
  - "rr_timestamps_s: None preserves exact bit-for-bit parity with pre-ALG-HRV-01 rmssd(&valid)"
  - "segment count recomputed for provenance only when output is Some (avoids redundant call on error path)"
metrics:
  duration_minutes: 10
  completed_date: "2026-06-06"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 8
---

# Phase 22 Plan 01: HRV Gap Segmentation Summary

**One-liner:** BLE-gap-aware RMSSD via `segment_rr_by_gaps` free function and optional `rr_timestamps_s` field on `HrvInput` — a 4 s injected gap reduces RMSSD from sqrt(206.25) to sqrt(200).

## What Was Built

Added ALG-HRV-01 (gap segmentation) to `goose_hrv_v0` in `Rust/core/src/metrics.rs`:

1. **`HrvInput.rr_timestamps_s: Option<Vec<f64>>`** — additive field with `#[serde(default)]`; backward-compatible JSON deserialization.

2. **`segment_rr_by_gaps(intervals, timestamps, gap_threshold_s) -> Vec<Vec<f64>>`** — free function placed near the `rmssd` helper. Any gap > `gap_threshold_s` seconds between consecutive timestamps starts a new segment. Defensive: mismatched lengths or empty intervals return a single segment (no panic).

3. **`rmssd_segmented(segments) -> f64`** — accumulates squared successive differences only within each segment; cross-boundary pairs are excluded. Identical math to `rmssd` for a single segment.

4. **Wired into `goose_hrv_v0`** — filter loop now keeps `valid_timestamps` in parallel with `valid` when lengths match; RMSSD computation dispatches to the segment-aware path when timestamps are present and aligned, else falls back to `rmssd(&valid)`.

5. **`rr_segment_gap_detected` quality flag** added when `segment_count > 1`.

6. **Provenance JSON** extended with `gap_segmentation_threshold_s: 3.0` and `segment_count`.

7. **All existing `HrvInput` literals** across 7 files updated with `rr_timestamps_s: None`.

8. **Two new unit tests** in `metrics_tests.rs`:
   - `goose_hrv_v0_excludes_cross_gap_differences`: intervals `[800,810,790,805,795]` with timestamps `[0.0,0.8,1.6,6.0,6.8]` (4.4 s gap) → RMSSD = sqrt(200), strictly less than the no-timestamps RMSSD sqrt(206.25); `rr_segment_gap_detected` flag present.
   - `goose_hrv_v0_timestamps_none_matches_legacy`: `rr_timestamps_s: None` yields RMSSD = sqrt(200) (hand-derived, bit-for-bit parity).

## Verification

- `cargo build -p goose-core`: green.
- `cargo test -p goose-core`: green — 0 failures across all test suites.
- Injected 4 s gap produces strictly lower RMSSD than the same intervals without timestamps.
- `rr_timestamps_s: None` reproduces legacy RMSSD exactly.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 06773b4 | feat(22-01): add rr_timestamps_s to HrvInput and gap-segmentation helpers |
| 2 | daea7a3 | feat(22-01): wire segment-aware RMSSD into goose_hrv_v0 |
| 3 | 281ef15 | feat(22-01): update HrvInput literals and add gap-segmentation tests |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `Rust/core/src/metrics.rs` modified: confirmed (3 commits touch it).
- `Rust/core/tests/metrics_tests.rs` modified: confirmed.
- Commits 06773b4, daea7a3, 281ef15 exist in git log.
- `cargo test -p goose-core` green.
