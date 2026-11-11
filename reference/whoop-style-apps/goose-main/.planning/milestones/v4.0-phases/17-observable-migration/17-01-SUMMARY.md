---
phase: 17-observable-migration
plan: "01"
subsystem: GooseAppModel
tags: [observable, swiftui, performance, refactor]
dependency_graph:
  requires: []
  provides: [GooseAppModel @Observable, MoreDataStore Combine-free]
  affects: [all SwiftUI views that consume GooseAppModel, MoreView reactive route status]
tech_stack:
  added: [Swift Observation framework (@Observable macro)]
  patterns: ["@Environment(Type.self) property wrapper", "@State for owned Observable objects"]
key_files:
  created: []
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseSwiftApp.swift
    - GooseSwift/CoachChatScreen.swift
    - GooseSwift/CoachView.swift
    - GooseSwift/ConnectionView.swift
    - GooseSwift/DeviceView.swift
    - GooseSwift/HRMonitorView.swift
    - GooseSwift/HealthDashboardViews.swift
    - GooseSwift/HealthMetricFamilyStrainViews.swift
    - GooseSwift/HealthPreviews.swift
    - GooseSwift/HealthRecoveryStressViews.swift
    - GooseSwift/HealthView.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/LiveActivityContentView.swift
    - GooseSwift/LiveActivityView.swift
    - GooseSwift/MoreCaptureViews.swift
    - GooseSwift/MoreDataStore.swift
    - GooseSwift/MoreDebugViews.swift
    - GooseSwift/MoreInfoViews.swift
    - GooseSwift/MoreProfileViews.swift
    - GooseSwift/MoreRemoteServerViews.swift
    - GooseSwift/MoreView.swift
    - GooseSwift/OnboardingView.swift
    - GooseSwift/RootView.swift
decisions:
  - "Removed all 52 @Published annotations from GooseAppModel.swift — plain var under @Observable"
  - "Added @MainActor to deinit to preserve actor isolation (deviation: required for @Observable + @MainActor class combo)"
  - "MoreDataStore Combine pipeline (bindRouteStatus, bleStatusCancellables) removed in Wave 1 (front-loaded from Wave 3) — model.$helloSummary publisher no longer exists after @Observable migration"
  - "MoreView uses .onChange(of: model.ble.connectionState) and .onChange(of: model.ble.hrConnectionState) for reactive route status refresh"
  - "MoreRemoteServerViews previews converted from .environmentObject to .environment (found during build)"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-05T19:16:15Z"
  tasks_completed: 3
  files_modified: 24
---

# Phase 17 Plan 01: GooseAppModel @Observable Migration (Wave 1) Summary

**One-liner:** GooseAppModel migrated from ObservableObject + 52 @Published to @Observable with per-property tracking; all 27 injection/consumption sites updated; MoreDataStore Combine pipeline removed.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Convert GooseAppModel to @Observable, remove all @Published | Done | f1610f3 |
| 2 | Rewire all view consumers to @Environment / plain parameters | Done | f1610f3 |
| 3 | Resolve MoreDataStore Combine blocker (front-loaded from Wave 3) | Done | f1610f3 |

## What Was Built

### Task 1 — GooseAppModel Class Body

- Changed class declaration from `@MainActor final class GooseAppModel: ObservableObject` to `@MainActor @Observable final class GooseAppModel`
- Added `import Observation` (required for the @Observable macro)
- Removed all 52 `@Published` annotations — each `@Published var x` became `var x` with type and default value unchanged
- All 10 extension files (GooseAppModel+*.swift) confirmed zero @Published (no changes needed)

### Task 2 — View Consumer Rewiring

- 24 `@EnvironmentObject private var model: GooseAppModel` sites → `@Environment(GooseAppModel.self) private var model`
- Files updated: MoreCaptureViews, HealthDashboardViews, MoreView, LiveActivityView, LiveActivityContentView, MoreProfileViews, HRMonitorView, ConnectionView, RootView, HomeDashboardView, DeviceView (×2), MoreRemoteServerViews, HealthRecoveryStressViews (×2), OnboardingView, MoreDebugViews, HealthMetricFamilyStrainViews (×2), CoachView, MoreInfoViews, HealthView
- 3 `@ObservedObject var model: GooseAppModel` sites → plain `var model: GooseAppModel` (CoachChatScreen, DeviceAdvancedPanel, DeviceActionGrid)
- Injection sites: `@StateObject private var model = GooseAppModel()` → `@State private var model = GooseAppModel()` (GooseSwiftApp)
- Injection sites: `.environmentObject(model)` → `.environment(model)` across GooseSwiftApp, HRMonitorView, ConnectionView, DeviceView, LiveActivityView, CoachView preview, HealthPreviews (×2), MoreRemoteServerViews previews (×3)

### Task 3 — MoreDataStore Combine Removal

- Removed `import Combine` from MoreDataStore.swift
- Removed `private var bleStatusCancellables = Set<AnyCancellable>()`
- Removed `func bindRouteStatus(ble:model:)` method entirely (the Combine pipeline that subscribed to `ble.$connectionState`, `ble.$hrConnectionState`, `model.$helloSummary`)
- Updated `MoreView.onAppear`: now calls `store.refreshRouteStatus(ble:model:)` directly
- Added `.onChange(of: model.ble.connectionState)` and `.onChange(of: model.ble.hrConnectionState)` modifiers in MoreView to restore reactive route status refresh without Combine

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @MainActor required on deinit**
- **Found during:** Build verification after Task 1
- **Issue:** With `@Observable` + `@MainActor` on the class declaration, Swift requires `deinit` to be explicitly marked `@MainActor` to access main-actor-isolated properties. Previously with `ObservableObject` (no `@MainActor` on the conformance), `deinit` could freely access properties because the class itself was the isolation domain. After @Observable, the compiler enforces nonisolated deinit unless explicitly annotated.
- **Fix:** Added `@MainActor` to `deinit` in GooseAppModel.swift
- **Files modified:** `GooseSwift/GooseAppModel.swift`
- **Commit:** f1610f3

**2. [Rule 3 - Blocking] MoreRemoteServerViews previews used .environmentObject(GooseAppModel)**
- **Found during:** First build verification (Task 2 completion)
- **Issue:** Three `#Preview` macros in MoreRemoteServerViews.swift used `.environmentObject({ let m = GooseAppModel(); ... return m }())` — these failed to compile because GooseAppModel no longer conforms to ObservableObject
- **Fix:** Converted all three preview injection sites from `.environmentObject(...)` to `.environment(...)` (same closure pattern)
- **Files modified:** `GooseSwift/MoreRemoteServerViews.swift`
- **Commit:** f1610f3

**3. [Rule 1 - Bug] model.connectionState → model.ble.connectionState in MoreView**
- **Found during:** Task 3 implementation review
- **Issue:** The plan specified `.onChange(of: model.connectionState)` but GooseAppModel has no `connectionState` property — it is `model.ble.connectionState` (owned by GooseBLEClient)
- **Fix:** Used `model.ble.connectionState` in the onChange modifier
- **Files modified:** `GooseSwift/MoreView.swift`
- **Commit:** f1610f3

**4. [Front-loaded from Wave 3] MoreDataStore Combine removal done in Wave 1**
- The plan section for Task 3 explicitly documents this front-load. The Combine pipeline in MoreDataStore.bindRouteStatus subscribed to `model.$helloSummary` — a publisher that ceased to exist after GooseAppModel became @Observable. Removing it in Wave 1 was both necessary (for compilation) and sufficient (refreshRouteStatus already existed as the non-reactive path).
- Plan 17-03 (Wave 3) will find this already done and skip the MoreDataStore sub-task; it will still add the .onChange modifiers for GooseBLEClient properties (those are added in MoreView here, addressing both model and ble publishers in one pass).

## Build Verification

```
xcodebuild build -project GooseSwift.xcodeproj -scheme GooseSwift -sdk iphonesimulator -arch arm64 CODE_SIGNING_ALLOWED=NO
→ BUILD SUCCEEDED
```

No `Value of type 'GooseAppModel' has no member '$...'` errors. No `@EnvironmentObject ... GooseAppModel` runtime crash risk (injection sites correctly use .environment).

## Acceptance Criteria Check

| Criterion | Result |
|-----------|--------|
| `grep -c "@Published" GooseSwift/GooseAppModel.swift` → 0 | 0 ✓ |
| `grep -rc "@Published" GooseSwift/GooseAppModel+*.swift` sum → 0 | 0 ✓ |
| `grep -c "@Observable" GooseSwift/GooseAppModel.swift` → 1 | 1 ✓ |
| `grep -c "ObservableObject" GooseSwift/GooseAppModel.swift` → 0 | 0 ✓ |
| `grep -rn "@EnvironmentObject.*GooseAppModel" GooseSwift/` → 0 results | 0 ✓ |
| `grep -c "bleStatusCancellables|AnyCancellable|bindRouteStatus" GooseSwift/MoreDataStore.swift` → 0 | 0 ✓ |
| xcodebuild BUILD SUCCEEDED | ✓ |

## Known Stubs

None. All property values, names, and defaults are preserved exactly.

## Threat Flags

None. This plan performs no data ingestion, no authentication, no network communication, and no persistent storage changes.

## Self-Check: PASSED
