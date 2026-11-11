---
phase: 17-observable-migration
plan: "02"
subsystem: HealthDataStore
tags: [observable, swift, ios, swiftui, observation]
dependency_graph:
  requires: ["17-01"]
  provides: ["HealthDataStore @Observable"]
  affects: ["GooseSwift/HealthDataStore.swift", "GooseSwift/AppShellView.swift", "GooseSwift/HealthDashboardViews.swift", "16 consumer views"]
tech_stack:
  added: ["@Observable macro (Observation framework)"]
  patterns: ["@State ownership for @Observable class", "State(initialValue:) in custom init", "@Bindable for Picker bindings", "nonisolated(unsafe) for deinit observer access"]
key_files:
  created: []
  modified:
    - GooseSwift/HealthDataStore.swift
    - GooseSwift/AppShellView.swift
    - GooseSwift/HealthDashboardViews.swift
    - GooseSwift/HealthSupplementalViews.swift
    - GooseSwift/HealthCardioViews.swift
    - GooseSwift/HealthRecoveryStressViews.swift
    - GooseSwift/HealthMetricFamilyStrainViews.swift
    - GooseSwift/HealthSleepOverviewViews.swift
    - GooseSwift/HealthView.swift
    - GooseSwift/CoachView.swift
    - GooseSwift/CoachChatScreen.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/MoreView.swift
    - GooseSwift/MoreRawExportViews.swift
    - GooseSwift/SleepBridgeViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift
decisions:
  - "@Bindable required on CalibrationHealthView.store because Picker uses $store.calibrationTargetFamily binding — plain var store does not expose Binding; @Bindable is the correct @Observable equivalent"
  - "nonisolated(unsafe) on heartRateSeriesUpdateObserver — @Observable makes deinit nonisolated; NotificationCenter.removeObserver is thread-safe so nonisolated(unsafe) is correct"
  - "lazy var databasePath converted to init-assigned var — @Observable macro does not support lazy stored properties (init accessor conflict)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-05"
  tasks_completed: 3
  files_modified: 16
---

# Phase 17 Plan 02: HealthDataStore @Observable Migration — Wave 2 Summary

**One-liner:** HealthDataStore migrated from ObservableObject+@Published to @Observable macro; all 16 consumer views rewired from @ObservedObject to plain parameters; AppShellView and HealthDashboardViews ownership moved to @State.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert HealthDataStore to @Observable and remove all @Published | 76ded34 | HealthDataStore.swift |
| 2 | Migrate ownership @StateObject → @State (incl. custom init) | 76ded34 | AppShellView.swift, HealthDashboardViews.swift |
| 3 | Remove @ObservedObject HealthDataStore wrappers in all consumer views | 76ded34 | 14 view files |

## What Was Done

### Task 1 — HealthDataStore class declaration
- Changed `@MainActor final class HealthDataStore: ObservableObject` to `@MainActor @Observable final class HealthDataStore`
- Removed all 25 `@Published` annotations from stored properties in HealthDataStore.swift
- Added `import Observation`
- Confirmed zero `@Published` in all 11 HealthDataStore+*.swift extension files (methods only — none had stored properties)

### Task 2 — Ownership migration
- AppShellView.swift: `@StateObject private var healthStore = HealthDataStore()` → `@State private var healthStore = HealthDataStore()`
- HealthDashboardViews.swift: `@StateObject private var store: HealthDataStore` → `@State private var store: HealthDataStore`
- HealthDashboardViews.swift init: `_store = StateObject(wrappedValue: store)` → `_store = State(initialValue: store)` (using `initialValue:` not `wrappedValue:`)

### Task 3 — @ObservedObject removal
Removed `@ObservedObject` from 28 sites across 14 files:
- MoreView.swift (1 site)
- MoreRawExportViews.swift (1 site — MoreAlgorithmsView.healthStore)
- CoachChatScreen.swift (1 site)
- SleepBridgeViews.swift (1 site)
- SleepV2ScheduleViews.swift (1 site — SleepV2BandSyncCard.store)
- HomeDashboardView.swift (1 site)
- HealthSupplementalViews.swift (4 sites)
- HealthCardioViews.swift (3 sites)
- CoachView.swift (1 site)
- HealthView.swift (1 site)
- HealthRecoveryStressViews.swift (2 sites)
- HealthSleepOverviewViews.swift (1 site)
- HealthMetricFamilyStrainViews.swift (3 sites)
- HealthDashboardViews.swift (5 sites — HealthRouteDestinationView, HealthRouteContentView, HealthStatusBanner, HealthMonitorView, PacketHealthView)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] lazy var databasePath incompatible with @Observable**
- **Found during:** Task 1, first build attempt
- **Issue:** `@Observable` macro generates init accessors for all stored properties; `lazy` creates a computed-like stored property that conflicts with the generated init accessor, producing "init accessor cannot refer to property '_databasePath'" error
- **Fix:** Converted `lazy var databasePath = HealthDataStore.defaultDatabasePath()` to `var databasePath: String` with explicit initialization in `init()` as `databasePath = HealthDataStore.defaultDatabasePath()`
- **Files modified:** GooseSwift/HealthDataStore.swift
- **Commit:** 76ded34

**2. [Rule 1 - Bug] heartRateSeriesUpdateObserver inaccessible from nonisolated deinit**
- **Found during:** Task 1, first build attempt
- **Issue:** `@Observable` makes `deinit` nonisolated by default; `heartRateSeriesUpdateObserver` was `@MainActor`-isolated (inherited from the class), causing "main actor-isolated property can not be referenced from a nonisolated context" error
- **Fix:** Marked property as `nonisolated(unsafe) var heartRateSeriesUpdateObserver: NSObjectProtocol?` — `NotificationCenter.removeObserver` is thread-safe so this is safe; the observer is written once in `init()` on MainActor and read once in `deinit`
- **Files modified:** GooseSwift/HealthDataStore.swift
- **Commit:** 76ded34

**3. [Rule 1 - Bug] CalibrationHealthView needed @Bindable for Picker binding**
- **Found during:** Task 3, second build attempt
- **Issue:** `CalibrationHealthView` had `Picker("Family", selection: $store.calibrationTargetFamily)` — `$store` worked with `@ObservedObject` but after removal, `$store` is undefined (no property wrapper, no `Binding` exposure)
- **Fix:** Changed `var store: HealthDataStore` to `@Bindable var store: HealthDataStore` in CalibrationHealthView — `@Bindable` is the `@Observable`-compatible way to create bindings from a reference type without a wrapper
- **Files modified:** GooseSwift/HealthSupplementalViews.swift
- **Commit:** 76ded34

## Verification Results

```
grep -c "@Published" GooseSwift/HealthDataStore.swift        → 0 ✓
grep -rc "@Published" GooseSwift/HealthDataStore+*.swift     → 0 ✓
grep -c "@Observable" GooseSwift/HealthDataStore.swift       → 1 ✓
grep -c "ObservableObject" GooseSwift/HealthDataStore.swift  → 0 ✓
grep -rn "@ObservedObject.*HealthDataStore" GooseSwift/      → 0 results ✓
xcodebuild build ... | grep "BUILD SUCCEEDED"                → BUILD SUCCEEDED ✓
```

## Known Stubs

None. All properties and data sources are wired correctly; no placeholder values introduced.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes.

## Self-Check: PASSED

- GooseSwift/HealthDataStore.swift: FOUND ✓
- Commit 76ded34: FOUND ✓
- BUILD SUCCEEDED confirmed ✓
