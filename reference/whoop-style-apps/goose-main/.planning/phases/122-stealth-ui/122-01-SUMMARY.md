---
phase: "122"
plan: "122-01"
subsystem: "stealth-ui"
status: complete
tags: [stealth, privacy, health-dashboard, settings, ui]
dependency_graph:
  requires: [Phase 119]
  provides: [STEALTH-03, STEALTH-04]
  affects: [HealthMetricSnapshot, HealthDataStore, MoreRoute, HomeDashboardView]
tech_stack:
  added: [StealthMetricsView, StealthMaskKey EnvironmentKey]
  patterns: [displayValue gate at model layer, MoreRoute enum wiring, @AppStorage toggle list]
key_files:
  created:
    - GooseSwift/StealthMetricsView.swift
  modified:
    - GooseSwift/HealthModels.swift
    - GooseSwift/HealthDataStore+Vitals.swift
    - GooseSwift/HealthDataStore+Utilities.swift
    - GooseSwift/HealthDataStore+StaticSnapshots.swift
    - GooseSwift/HealthDataStore+Snapshots.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/MoreRouteModels.swift
    - GooseSwift/MoreView.swift
    - GooseSwift/MoreDataStore.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - stealthKey propagation via memberwise init default parameter (not stored property mutation) ensures all existing call sites compile unchanged
  - displayValue gate is the unconditional first statement — before unit/percentage branching — ensuring all metric card renders go through it
  - MoreRouteStatus field added before statusKeyPath switch arm to satisfy Swift KeyPath resolution ordering
  - M-1 accepted limitation: dashboard re-renders on next HealthDataStore refresh cycle, not on UserDefaults write
metrics:
  duration_minutes: 16
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 10
  completed_date: "2026-06-28"
requirements: [STEALTH-03, STEALTH-04]
---

# Phase 122 Plan 01: Stealth UI Summary

Stealth metrics toggle UI with dashboard em-dash gate — 6 per-metric @AppStorage toggles in More > Settings > Metrics Privacy, with HealthMetricSnapshot.displayValue returning U+2014 for hidden metrics.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | HealthMetricSnapshot stealthKey + displayValue gate + propagation | 3799dfa | HealthModels, Vitals, Utilities, StaticSnapshots, Snapshots, HomeDashboardView |
| 2 | StealthMetricsView + EnvironmentKey + pbxproj registration | e81780d | StealthMetricsView.swift (new), project.pbxproj |
| 3 | MoreRoute.stealthMetrics wiring | 924ece0 | MoreRouteModels, MoreView, MoreDataStore |

## Key Changes

### HealthMetricSnapshot.stealthKey (STEALTH-04)

`HealthMetricSnapshot` gained `stealthKey: String = ""` as its last stored property, implemented via an explicit memberwise init with a default parameter. This keeps all existing call sites compile-compatible (no positional breakage).

`displayValue` was modified to return `"\u{2014}"` (em dash U+2014) as its unconditional first statement when `GooseStealthMode.isHidden(metric: stealthKey)` is true and `stealthKey` is non-empty. The guard precedes all existing unit/percentage branching.

### Propagation (8 HIGH findings from multi-AI review — all resolved)

- **H-1:** `replacingHealthMonitorSnapshot` body carries `stealthKey: snapshot.stealthKey` — all 10+ callers propagate automatically
- **H-2:** 3 branches in `ScoreDateTimeline.datedSnapshot` each carry `stealthKey: snapshot.stealthKey`
- **H-3:** `settingsRoutes` array literal explicitly contains `.stealthMetrics` (verified by grep, not inferred from build)
- **H-4:** `snapshot()` factory in HealthDataStore+Utilities accepts and forwards `stealthKey`; HomeDashboardView strain branch carries `stealthKey: snapshot.stealthKey`
- **H-5/H-6:** `MoreRouteStatus` struct field added before `\.stealthMetrics` KeyPath switch arm
- **H-7:** StealthMetricsView uses only `StealthStorage.*` constants — zero raw key strings
- **H-8:** All `HealthMetricSnapshot(...)` call sites verified — 0 constructors missing stealthKey

### Static base entries (D-04/D-05)

6 base snapshots carry correct stealthKey values:
- `"sleep"` → `"sleep_performance"`
- `"recovery"` → `"recovery_score"`
- `"strain"` → `"strain_score"`
- `"stress"` → `"stress_score"`
- `"resting-hr"` → `"resting_hr"`
- `"resting-hrv"` → `"hrv_rmssd"`

### StealthMetricsView (STEALTH-03)

New file with 6 `@AppStorage(StealthStorage.<constant>)` Toggle rows. Section footer uses em dash U+2014. Navigation title "Metrics Privacy". `StealthMaskKey` EnvironmentKey for preview-only use. Registered in pbxproj at 4 locations (A1/A2 ...0045 UUIDs).

### MoreRoute.stealthMetrics

Added to all 9 required locations: enum case, title/subtitle/systemImage/statusKeyPath switches, MoreRouteStatus struct field, both MoreDataStore initialisers, MoreView destination switch, and settingsRoutes array.

## Verification Results

| Check | Result |
|-------|--------|
| xcodebuild BUILD SUCCEEDED | PASS |
| HealthMetricSnapshot constructors missing stealthKey | 0 |
| replacingHealthMonitorSnapshot body has stealthKey | PASS |
| datedSnapshot branches with stealthKey | 3 |
| snapshot() factory has stealthKey | PASS |
| settingsRoutes contains .stealthMetrics | PASS |
| Raw goose.stealth.* strings in StealthMetricsView | 0 |
| Em dash U+2014 in displayValue | PASS (line 111) |
| stealthMetrics count in MoreRouteModels | 7 |

## Deviations from Plan

None — plan executed exactly as written. All 8 HIGH findings from multi-AI review were pre-addressed in the revised plan.

## Known Stubs

None. All 6 metric keys are wired end-to-end: base snapshot → live builder → displayValue gate → toggle UI.

## Threat Flags

No new threat surface introduced. All toggle state is `UserDefaults.standard` boolean — sandboxed to app, no network exposure. T-122-01 and T-122-02 dispositions accepted per plan threat register.

## Self-Check: PASSED

- GooseSwift/StealthMetricsView.swift: FOUND
- Commits 3799dfa, e81780d, 924ece0: FOUND
- BUILD SUCCEEDED: CONFIRMED
