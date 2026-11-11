---
phase: 24-sleep-metrics-baselines
plan: 01
subsystem: algorithm
tags: [rust, sleep, hrv, metrics, swiftui, alg-slp-01]

# Dependency graph
requires:
  - phase: 23-strain-calories
    provides: metric_features.rs sleep_window_feature pattern for wiring helpers into scoring path

provides:
  - heart_rate_dip_pct, waso_from_hr, sol_from_hr, hr_disturbance_count pure helpers in metrics.rs
  - SleepScoreOutput extended with sol_minutes, waso_minutes, disturbance_count, rem_latency_minutes
  - sleep_window_feature wired to HR-threshold helpers with 50% coverage gate and quality flag fallback
  - Sleep V2 PrimarySleepDetailSheet showing "Sleep quality" stat group (HR dip, WASO, SOL, disturbances)

affects:
  - 24-sleep-metrics-baselines
  - 26-sleep-staging (rem_latency_minutes currently None, requires sleep staging to populate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - HR-threshold wake detection at resting_hr * 1.05 factor
    - Rolling 5-min minimum for HR dip nadir
    - 50% heart_rate_coverage_fraction gate for HR-threshold vs heuristic path selection
    - quality flag sleep_hr_metrics_low_coverage_fallback when below gate
    - first_hr_offset correction when window_hr_series does not start at minute 0

key-files:
  created: []
  modified:
    - Rust/core/src/metrics.rs
    - Rust/core/src/metric_features.rs
    - Rust/core/tests/metrics_tests.rs
    - Rust/core/tests/metric_features_tests.rs
    - Rust/core/tests/bridge_tests.rs
    - GooseSwift/HealthDataTypes.swift
    - GooseSwift/HealthDataStore+Sleep.swift
    - GooseSwift/SleepDetailViews.swift
    - GooseSwift/HealthKitSleepImporter.swift
    - GooseSwift/HealthKitFullImporter.swift

key-decisions:
  - "baseline_awake_hr_bpm used as resting_hr proxy in HR-threshold helpers per ALG-SLP-01 Claude's Discretion — pre-sleep awake HR is best available without dedicated resting sensor"
  - "sol_from_hr returns latency relative to first HR sample in series; add first_hr_offset in sleep_window_feature to convert to window-relative SOL"
  - "rem_latency_minutes is None in SleepScoreOutput v0 — full REM latency requires sleep staging (Phase 26 deferral)"
  - "bridge_tests updated: k10 frames include HR byte (payload[17]=72), so all motion-only tests have full HR coverage; algorithm now uses HR-threshold disturbance_count=0 instead of motion heuristic=1"
  - "score_0_to_100 in bridge test changed 80.75→81.25 due to disturbance_count=0 vs 1 under new algorithm"

patterns-established:
  - "first_hr_offset pattern: when window_hr_series timestamps are window-relative but first sample is not at minute 0, add offset to convert sol_from_hr output back to window-relative coordinates"
  - "HR-threshold gate: heart_rate_coverage_fraction >= 0.50 selects HR path; below gate adds sleep_hr_metrics_low_coverage_fallback quality flag and keeps stage-segment heuristic values"

requirements-completed: [ALG-SLP-01]

# Metrics
duration: 32min
completed: 2026-06-08
---

# Phase 24 Plan 01: Sleep Metrics Baselines Summary

**HR-threshold SOL/WASO/dip/disturbance helpers in metrics.rs (ALG-SLP-01), wired into sleep scoring when HR coverage >= 50%, surfaced in Sleep V2 detail sheet**

## Performance

- **Duration:** 32 min
- **Started:** 2026-06-08T09:30:00Z
- **Completed:** 2026-06-08T10:02:00Z
- **Tasks:** 3 (2 autonomous + 1 checkpoint:human-verify implemented)
- **Files modified:** 10

## Accomplishments

- Implemented four pure HR-threshold helpers in metrics.rs: `heart_rate_dip_pct`, `waso_from_hr`, `sol_from_hr`, `hr_disturbance_count` with 11 unit tests covering edge cases per ALG-SLP-01
- Extended `SleepScoreOutput` with `sol_minutes`, `waso_minutes`, `disturbance_count`, `rem_latency_minutes` and wired `sleep_window_feature` to use HR-threshold helpers (gate: heart_rate_coverage_fraction >= 50%); low-coverage path falls back to stage-segment heuristic with `sleep_hr_metrics_low_coverage_fallback` quality flag
- Surfaced HR sleep metrics in PrimarySleepDetailSheet with a new "Sleep quality" stat group showing HR dip %, WASO, SOL, and disturbance count using `SleepV2SleepDetailStat` rows

## Task Commits

Each task was committed atomically:

1. **Task 1: HR-threshold sleep metric helpers in metrics.rs** - `e1959bf` (feat — TDD GREEN)
2. **Task 2: Expose new output fields and wire HR helpers into scoring path** - `0483c45` (feat — TDD GREEN)
3. **Task 3: Surface HR sleep metrics in Sleep V2 dashboard** - `ab38605` (feat)

## Files Created/Modified

- `Rust/core/src/metrics.rs` - Added heart_rate_dip_pct, waso_from_hr, sol_from_hr, hr_disturbance_count; extended SleepScoreOutput with 4 new fields
- `Rust/core/src/metric_features.rs` - Wired HR-threshold helpers into sleep_window_feature with 50% coverage gate; added first_hr_offset correction for window-relative SOL
- `Rust/core/tests/metrics_tests.rs` - 11 unit tests for HR helpers + 1 SleepScoreOutput field test
- `Rust/core/tests/metric_features_tests.rs` - Updated 2 existing tests for new HR-threshold behavior; added low-coverage fallback test
- `Rust/core/tests/bridge_tests.rs` - Updated 2 bridge tests: disturbance_count 1→0, score 80.75→81.25 (correct under HR-threshold algorithm)
- `GooseSwift/HealthDataTypes.swift` - Added heartRateDipText, wasoText, solText, disturbanceText to PrimarySleepDetail
- `GooseSwift/HealthDataStore+Sleep.swift` - primarySleepDetail reads heart_rate_dip_percent/waso_minutes/sol_minutes/disturbance_count from output
- `GooseSwift/SleepDetailViews.swift` - Added "Sleep quality" stat group in PrimarySleepDetailSheet
- `GooseSwift/HealthKitSleepImporter.swift` - Added "--" placeholder fields to PrimarySleepDetail construction
- `GooseSwift/HealthKitFullImporter.swift` - Added "--" placeholder fields to PrimarySleepDetail construction

## Decisions Made

- Used `baseline_awake_hr_bpm` as the resting HR proxy in HR-threshold helpers per ALG-SLP-01 (Claude's Discretion in 24-CONTEXT): pre-sleep awake HR is the best available proxy without a dedicated resting-HR sensor during the sleep window
- `sol_from_hr` computes latency from its own first sample; added `first_hr_offset` in `sleep_window_feature` to convert to window-relative SOL (since HR series timestamps are relative to motion window start but first HR sample may not be at minute 0)
- `rem_latency_minutes` set to `None` in goose_sleep_v0 — full REM latency requires sleep staging (Phase 26 deferral per 24-CONTEXT)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated bridge_tests expectations for new HR-threshold algorithm output**
- **Found during:** Task 2 (sleep_window_feature wiring)
- **Issue:** Two bridge tests asserted on motion-heuristic disturbance_count=1 and score=80.75. The k10 motion frames include HR data (byte 17=72 bpm), giving heart_rate_coverage_fraction=1.0. The HR-threshold algorithm correctly computes disturbance_count=0 (72 bpm < 75.6 threshold) and score=81.25
- **Fix:** Updated bridge_tests.rs assertions to match correct new algorithm output; added explanatory comments per ALG-SLP-01
- **Files modified:** Rust/core/tests/bridge_tests.rs
- **Committed in:** 0483c45

**2. [Rule 1 - Bug] Updated metric_features_tests for HR-threshold SOL/WASO/disturbance behavior**
- **Found during:** Task 2 (metric_features_tests comparison)
- **Issue:** Two tests asserted stage-segment-based sleep_latency=60, waso=60, disturbance=2. With HR-threshold method and full coverage, the correct values are sol=15, waso=0, disturbance=0 (all HR below 84 bpm threshold = baseline 80 * 1.05)
- **Fix:** Updated test assertions with explanatory comments documenting the new HR-threshold expected values
- **Files modified:** Rust/core/tests/metric_features_tests.rs
- **Committed in:** 0483c45

**3. [Rule 1 - Bug] Fixed sol_from_hr window_start coordinate mismatch**
- **Found during:** Task 2 debugging (test expected SOL=15, got SOL=0)
- **Issue:** `sol_from_hr` uses `sorted[0].0` as window_start (first HR sample at minute 15). When calling from `sleep_window_feature` where series is already window-relative (starts at minute 15, not 0), the function returns 0 instead of 15
- **Fix:** Added `first_hr_offset` in `sleep_window_feature`; applied as `sol_from_hr(...).map(|s| s + first_hr_offset)` to convert from HR-series-relative to window-relative SOL
- **Files modified:** Rust/core/src/metric_features.rs
- **Committed in:** 0483c45

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs corrected)
**Impact on plan:** All fixes essential for algorithm correctness and test accuracy. No scope creep.

## Issues Encountered

- Initial Rust compile error in baselines.rs resolved on retry (file lock, not a code issue)
- `sol_from_hr` coordinate system mismatch required first_hr_offset correction in sleep_window_feature; unit tests pass because test series start at minute 0 (no offset needed)

## Known Stubs

None — all metric values are computed from real HR data when coverage >= 50%; "--" placeholders correctly display when data is absent (HealthKit imports, low-coverage sessions).

## Next Phase Readiness

- ALG-SLP-01 complete: HR-threshold helpers tested, scoring path wired, UI surfaced
- Ready for human verification of Sleep V2 detail sheet layout
- `rem_latency_minutes` awaits Phase 26 (sleep staging) — currently `None` in all output
- Phase 24-02 (EWMA baselines) is independent and already committed

## Self-Check: PASSED

All created files exist and all commits verified:
- SUMMARY.md: found
- e1959bf (Task 1): found
- 0483c45 (Task 2): found
- ab38605 (Task 3): found

---
*Phase: 24-sleep-metrics-baselines*
*Completed: 2026-06-08*
