---
phase: 15
plan: "01"
subsystem: health-scoring
tags: [hrv, recovery, sdnn, fix, apple-health]
dependency_graph:
  requires: []
  provides: [hkRecoveryScore-sdnn-direct]
  affects: [HealthDataStore, HealthDataStore+Snapshots, HealthDataStore+Sleep, HealthDataStore+CoachSummaries, HealthDataStore+Vitals, HealthDashboardViews, HealthKitFullImporter]
tech_stack:
  added: []
  patterns: [published-property-rename, formula-correction]
key_files:
  created: []
  modified:
    - GooseSwift/HealthDataStore.swift
    - GooseSwift/HealthKitFullImporter.swift
    - GooseSwift/HealthDataStore+Sleep.swift
    - GooseSwift/HealthDataStore+Snapshots.swift
    - GooseSwift/HealthDataStore+CoachSummaries.swift
    - GooseSwift/HealthDataStore+Vitals.swift
    - GooseSwift/HealthDashboardViews.swift
decisions:
  - "Use SDNN directly in hkRecoveryScore instead of dividing by 1.2"
  - "Population baseline updated from 40.0 ms (RMSSD equiv) to 50.0 ms (SDNN healthy adults)"
  - "Rust goose_recovery_v0 left unchanged (D-04)"
metrics:
  duration: "8 minutes"
  completed: "2026-06-05"
  tasks_completed: 1
  files_changed: 7
---

# Phase 15 Plan 01: Recovery Formula V2 — SDNN Accuracy Fix Summary

## One-liner

Removed SDNN/1.2 conversion in `hkRecoveryScore()`, renamed `hkHRVRmssdMs` → `hkHRVSDNNMs` across 7 files, and updated population HRV baseline from 40 ms to 50 ms.

## What Was Built

Fixed an inaccurate population approximation in the Apple Watch HRV recovery scoring path.
Apple Watch reports SDNN, but the code was dividing it by 1.2 to approximate RMSSD before
scoring — a fixed ratio that varies per individual. The fix uses SDNN directly with a
correct population baseline (50 ms for healthy adults vs. 40 ms for RMSSD).

The rename `hkHRVRmssdMs` → `hkHRVSDNNMs` makes the stored metric's provenance explicit
throughout the codebase (7 files, 15 lines changed).

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename + formula fix | 0cc3705 | 7 files changed |

## Commits

- `0cc3705` — fix(15): use SDNN directly in hkRecoveryScore — rename hkHRVRmssdMs, remove /1.2, baseline 50ms (OKKHALIL3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Also renamed in HealthDashboardViews.swift and HealthDataStore+Vitals.swift**
- **Found during:** Step 1 grep scan
- **Issue:** Context listed 5 files; grep revealed 2 additional files (`HealthDashboardViews.swift` and `HealthDataStore+Vitals.swift`) also referenced `hkHRVRmssdMs`
- **Fix:** Included both in the rename — no logic change, pure identifier update
- **Files modified:** `GooseSwift/HealthDashboardViews.swift`, `GooseSwift/HealthDataStore+Vitals.swift`
- **Commit:** 0cc3705 (same commit)

## Verification Results

```
grep -rn "hkHRVRmssdMs|hrvRmssdMs" GooseSwift/ → (empty — all renamed)
grep -n "/ 1\.2" GooseSwift/HealthDataStore+Snapshots.swift → (empty — removed)
grep baseline in Snapshots → 50.0 // population average SDNN for healthy adults
cargo test -p goose-core → test result: ok. 9 passed; 0 failed
```

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- Commit 0cc3705 exists: confirmed
- Modified files staged individually (no `git add .`)
- No `hkHRVRmssdMs` or `hrvRmssdMs` remain in GooseSwift/
- No `/1.2` in HealthDataStore+Snapshots.swift
- Baseline is 50.0 ms with correct comment
- All Rust tests pass (9/9)
