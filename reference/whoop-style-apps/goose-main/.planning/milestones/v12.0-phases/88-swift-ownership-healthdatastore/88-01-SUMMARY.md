---
phase: 88-swift-ownership-healthdatastore
plan: "01"
subsystem: swift-app
tags: [ownership, healthdatastore, gooseappmodel, refactor, architecture]
dependency_graph:
  requires: []
  provides: [healthdatastore-owned-by-model, environment-injection]
  affects: [GooseSwift/GooseAppModel.swift, GooseSwift/GooseAppModel+SleepSync.swift, GooseSwift/GooseAppModel+HealthCapture.swift, GooseSwift/AppShellView.swift, GooseSwift/GooseSwiftApp.swift]
tech_stack:
  added: []
  patterns: [observable-environment-injection, strong-ownership]
key_files:
  created: []
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+SleepSync.swift
    - GooseSwift/GooseAppModel+HealthCapture.swift
    - GooseSwift/AppShellView.swift
    - GooseSwift/GooseSwiftApp.swift
decisions:
  - "Used .environment(model.healthStore) not .environmentObject() because HealthDataStore is @Obseent passing to child views pending Plan 02"
  - "Added direct healthStore.runPacketInputs() call in handleHistoricalSyncProgress alongside existing callback"
metrics:
  duration_minutes: 15
  completed_date: "2026-06-18"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 88 Plan 01: HealthDataStore Ownership Transfer Summary

HealthDataStore ownership moved from AppShellView into GooseAppModel as a strong `let` constant initialised once at model init; GooseSwiftApp injects it via `.environment(model.healthStore)`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move HealthDataStore ownership into GooseAppModel | 856da1a | GooseAppModel.swift, GooseAppModel+SleepSync.swift, GooseAppModel+HealthCapture.swift |
| 2 | Clean AppShellView and inject via environment | 9defeaf | AppShellView.swift, GooseSwiftApp.swift |

## What Was Built

- `GooseAppModel.healthStore` is now `let healthStore: HealthDataStore` (non-optional, non-weak)
- `HealthDataStore()` is constructed as the first statement in `GooseAppModel.init()`
- `AppShellView` no longer creates, sets, or unsets the store; no `@State var healthStore`, no `.onAppear` lifecycle calls
- `GooseSwiftApp` injects `model.healthStore` into the SwiftUI environment via `.environment(model.healthStore)`
- `GooseAppModel+HealthCapture.swift` calls `healthStore.runPacketInputs()` directly after a historical sync completes
- All `store?.method()` optional chains in `GooseAppModel+SleepSync.swift` converted to direct `store.method()` calls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used .environment() instead of .environmentObject() for HealthDataStore**
- **Found during:** Task 2
- **Issue:** Plan specified `.environmentObject(model.healthStore)` but HealthDataStore is `@Observable` (not `ObservableObject`). Using `.environmentObject()` on an `@Observable` type causes a compile error in Swift 5.9+.
- **Fix:** Used `.environment(model.healthStore)` which is the correct API for `@Observable` types.
- **Files modified:** GooseSwift/GooseSwiftApp.swift
- **Commit:** 9defeaf

**2. [Rule 1 - Bug] Retained explicit store argument passing to child views**
- **Found during:** Task 2
- **Issue:** Plan said to remove explicit `healthStore:`/`store:` arguments from tab call sites (HomeDashboardView, HealthView, CoachView, MoreView, HealthRouteDestinationView). However, these views still have required `var store: HealthDataStore` / `var healthStore: HealthDataStore` init parameters. Removing the arguments without Plan 02 converting those views to `@Environment` would cause a compile error.
- **Fix:** Changed arguments from `healthStore` (local @State) to `model.healthStore` (model-owned). Explicit argument passing remains until Plan 02 converts views to environment injection. Build succeeds.
- **Files modified:** GooseSwift/AppShellView.swift
- **Commit:** 9defeaf

**3. [Rule 2 - Missing critical functionality] Added direct runPacketInputs() call in handleHistoricalSyncProgress**
- **Found during:** Task 1
- **Issue:** After removing the AppShellView lifecycle that set `model.onHistoricalSyncCompleted`, the historical sync completion would no longer trigger `healthStore.runPacketInputs()`. The callback would be nil and metric extraction would silently skip.
- **Fix:** Added `Task { await healthStore.runPacketInputs() }` directly in `handleHistoricalSyncProgress()` alongside the existing `onHistoricalSyncCompleted?()` call (which remains for any other callers that may set it).
- **Files modified:** GooseSwift/GooseAppModel+HealthCapture.swift
- **Commit:** 856da1a

## Known Stubs

None — no stub patterns detected in modified files.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced.

## Self-Check: PASSED

- GooseAppModel.swift: `let healthStore: HealthDataStore` present at line 52 — FOUND
- GooseAppModel.swift: `healthStore = HealthDataStore()` in init at line 256 — FOUND
- GooseAppModel+SleepSync.swift: no `store?` optional chains — CONFIRMED (grep returned empty)
- AppShellView.swift: no `@State private var healthStore` — CONFIRMED
- AppShellView.swift: no `model.healthStore =` lifecycle calls — CONFIRMED
- GooseSwiftApp.swift: `.environment(model.healthStore)` at line 39 — FOUND
- Commits 856da1a and 9defeaf exist in git log — CONFIRMED
- Build result: BUILD SUCCEEDED (iPhone 17 Pro simulator, CODE_SIGNING_ALLOWED=NO)
