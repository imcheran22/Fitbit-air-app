---
phase: 88-swift-ownership-healthdatastore
plan: "02"
subsystem: swift-app
tags: [ownership, healthdatastore, environment, refactor, architecture, swiftui]
dependency_graph:
  requires: [healthdatastore-owned-by-model, environment-injection]
  provides: [healthdatastore-environment-consumed, arch-04-complete]
  affects:
    - GooseSwift/HealthView.swift
    - GooseSwift/CoachView.swift
    - GooseSwift/MoreView.swift
    - GooseSwift/CoachChatScreen.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/MetricExplorerView.swift
    - GooseSwift/MoreDebugViews.swift
    - GooseSwift/MoreRawExportViews.swift
    - GooseSwift/CoachRouteViews.swift
    - GooseSwift/HealthDashboardViews.swift
    - GooseSwift/HealthCardioViews.swift
    - GooseSwift/HealthMetricFamilyStrainViews.swift
    - GooseSwift/HealthRecoveryStressViews.swift
    - GooseSwift/HealthSleepOverviewViews.swift
    - GooseSwift/HealthSupplementalViews.swift
    - GooseSwift/SleepBridgeViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift
    - GooseSwift/TrendsDashboardViews.swift
    - GooseSwift/AppShellView.swift
    - GooseSwift/HealthPreviews.swift
    - GooseSwift/GooseAppModel+HealthCapture.swift
tech_stack:
  added: []
  patterns: [observable-environment-injection, bindable-local-for-two-way-binding]
key_files:
  created: []
  modified:
    - GooseSwift/HealthView.swift
    - GooseSwift/CoachView.swift
    - GooseSwift/MoreView.swift
    - GooseSwift/CoachChatScreen.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/MetricExplorerView.swift
    - GooseSwift/MoreDebugViews.swift
    - GooseSwift/MoreRawExportViews.swift
    - GooseSwift/CoachRouteViews.swift
    - GooseSwift/HealthDashboardViews.swift
    - GooseSwift/HealthCardioViews.swift
    - GooseSwift/HealthMetricFamilyStrainViews.swift
    - GooseSwift/HealthRecoveryStressViews.swift
    - GooseSwift/HealthSleepOverviewViews.swift
    - GooseSwift/HealthSupplementalViews.swift
    - GooseSwift/SleepBridgeViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift
    - GooseSwift/TrendsDashboardViews.swift
    - GooseSwift/AppShellView.swift
    - GooseSwift/HealthPreviews.swift
    - GooseSwift/GooseAppModel+HealthCapture.swift
decisions:
  - "Used @Environment(HealthDataStore.self) not @EnvironmentObject — HealthDataStore is @Observable not ObservableObject, consistent with Plan 01 injection via .environment()"
  - "CalibrationHealthView: @Bindable var store replaced with @Bindable var bindable = healthStore inside body — the only correct pattern for @Observable + @Environment two-way binding"
  - "HealthRouteDetailView DEBUG init removed — preview injection moved to HealthPreviewRouteHost using .environment(previewStore) which is the SwiftUI-idiomatic approach"
  - "SleepDataBridgeSection and SleepV2BandSyncCard: only var store removed; var ble: GooseBLEClient stays as explicit parameter (GooseBLEClient is not environment-injected)"
  - "Worktree was behind gsd/v12.0-milestone; merged Plan 01 baseline via fast-forward before starting Plan 02 work"
metrics:
  duration_minutes: 45
  completed_date: "2026-06-18"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 21
---

# Phase 88 Plan 02: Health Sub-Views Environment Injection Summary

Completed the HealthDataStore prop-drilling removal: all 18 plan-listed view files plus 3 adjacent files now consume HealthDataStore via `@Environment(HealthDataStore.self)` with no stored property or init parameter. iOS build passes with BUILD SUCCEEDED.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert top-level tab views to @Environment | 9be31aa | HealthView, CoachView, MoreView, CoachChatScreen, HomeDashboardView, MetricExplorerView, MoreDebugViews, MoreRawExportViews, CoachRouteViews, AppShellView, HealthPreviews |
| 2 | Convert health sub-views and build verification | ff45d3c | HealthDashboardViews, HealthCardioViews, HealthMetricFamilyStrainViews, HealthRecoveryStressViews, HealthSleepOverviewViews, HealthSupplementalViews, SleepBridgeViews, SleepV2ScheduleViews, TrendsDashboardViews, AppShellView, HealthPreviews, HomeDashboardView, GooseAppModel+HealthCapture |

## What Was Built

- All 18 plan-listed Swift view files converted from `var store/healthStore: HealthDataStore` stored properties to `@Environment(HealthDataStore.self) private var healthStore`
- All custom inits that took `HealthDataStore` as a parameter removed or simplified
- All internal child-view call sites that forwarded `healthStore:` or `store:` arguments updated to drop those arguments
- `CalibrationHealthView`: special-cased `@Bindable var store` — replaced with `@Environment` + local `@Bindable var bindable = healthStore` inside body to preserve `$bindable.calibrationTargetFamily` two-way binding
- `HealthPreviewRouteHost`: moved preview store creation to caller via `.environment(previewStore)` after `previewStore.applyPreviewState(state)`; `HealthRouteDetailView` DEBUG init removed as no longer needed
- `SleepDataBridgeSection`, `SleepV2BandSyncCard`: only `store` converted; `ble: GooseBLEClient` retained as explicit parameter
- `CoachView.init(healthStore:)` → `init()` with registry/chat still initialized inside
- Worktree merged from `gsd/v12.0-milestone` (fast-forward to cbabe02) before starting work — worktree was created before Plan 01 landed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @EnvironmentObject vs @Environment — Plan said @EnvironmentObject, actual conformance requires @Environment**
- **Found during:** Pre-task analysis
- **Issue:** Plan 02 inherited the plan text specifying `@EnvironmentObject` but HealthDataStore is `@Observable` not `ObservableObject`. Plan 01's SUMMARY.md already documented this; Plan 02 applied `@Environment(HealthDataStore.self)` consistently throughout.
- **Fix:** Used `@Environment(HealthDataStore.self) private var healthStore` at all consumption sites.
- **Files modified:** All 18 plan files plus AppShellView, HealthPreviews

**2. [Rule 3 - Blocking] AppShellView call sites required updating**
- **Found during:** Task 1
- **Issue:** AppShellView passes `store:` or `healthStore:` args to the tab views and `HealthRouteDestinationView`. After converting those views to @Environment these call sites became compile errors.
- **Fix:** Updated AppShellView to call `HealthView()`, `CoachView()`, `MoreView()`, `HomeDashboardView(selectedDate:openHealthRoute:)`, and `HealthRouteDestinationView(route:selectedDate:)` without store args.
- **Files modified:** GooseSwift/AppShellView.swift
- **Commit:** 9be31aa, ff45d3c

**3. [Rule 3 - Blocking] HealthPreviews.swift preview call sites required updating**
- **Found during:** Task 1 / Task 2
- **Issue:** `HealthPreviewRouteHost` used `HealthRouteDetailView(route:previewState:)` debug init; plain `#Preview` blocks passed `store:` to `HealthView`, `HomeDashboardView`, `MoreView`. After conversion these became compile errors.
- **Fix:** `HealthPreviewRouteHost` now creates `previewStore`, applies state, and injects via `.environment(previewStore)`. Debug init on `HealthRouteDetailView` removed. `#Preview` blocks use `.environment(HealthDataStore())` injection.
- **Files modified:** GooseSwift/HealthPreviews.swift

**4. [Rule 1 - Bug] Stale onHistoricalSyncCompleted?() call in GooseAppModel+HealthCapture**
- **Found during:** Task 2 build
- **Issue:** Build failed with `cannot find 'onHistoricalSyncCompleted' in scope`. This property was removed from `GooseAppModel.swift` by Plan 01, but the call in `handleHistoricalSyncProgress` was left behind (Plan 01 summary noted keeping it alongside the new `healthStore.runPacketInputs()` call, but the property was already gone).
- **Fix:** Removed the stale `onHistoricalSyncCompleted?()` call; `Task { await healthStore.runPacketInputs() }` is sufficient.
- **Files modified:** GooseSwift/GooseAppModel+HealthCapture.swift
- **Commit:** ff45d3c

**5. [Rule 2 - Missing functionality] HomeDashboardView CardioLoadSheet call site updated**
- **Found during:** Task 2 analysis
- **Issue:** `HomeDashboardView` passed `CardioLoadSheet(store: healthStore)` but after converting `CardioLoadSheet` to @Environment, this becomes an error.
- **Fix:** Updated to `CardioLoadSheet()`.
- **Files modified:** GooseSwift/HomeDashboardView.swift
- **Commit:** ff45d3c

## Known Stubs

None — no stub patterns detected in modified files.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. All changes are pure SwiftUI property wrapper refactoring within an in-process view hierarchy.

## Self-Check: PASSED

- `grep -rn "var healthStore: HealthDataStore\|var store: HealthDataStore" GooseSwift/*.swift | grep -v "@EnvironmentObject\|@Environment\|GooseAppModel\|HealthDataStore\.swift\|HealthDataStore+"` — zero lines CONFIRMED
- `grep -rn "init(healthStore:\|init(store: HealthDataStore" GooseSwift/*.swift` — zero lines CONFIRMED
- `grep "let healthStore\|weak var healthStore" GooseSwift/GooseAppModel.swift` — one line: `let healthStore: HealthDataStore` CONFIRMED
- Build result: BUILD SUCCEEDED (iPhone 17 Pro simulator, CODE_SIGNING_ALLOWED=NO)
- Commits 9be31aa and ff45d3c exist in git log CONFIRMED
