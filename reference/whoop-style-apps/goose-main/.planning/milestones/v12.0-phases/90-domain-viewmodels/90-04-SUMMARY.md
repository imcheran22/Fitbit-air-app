---
phase: 90-domain-viewmodels
plan: "04"
subsystem: SwiftUI view layer
tags: [observable, domain-objects, swiftui, architecture, view-migration]
dependency_graph:
  requires: [90-01, 90-02, 90-03]
  provides: [ARCH-06-observable-isolation]
  affects: [GooseSwiftApp, all view files that read domain properties]
tech_stack:
  added: []
  patterns:
    - "@Observable domain object injection via .environment() at scene root"
    - "Views declare @Environment(BLEState.self) / @Environment(SyncState.self) / @Environment(HealthState.self)"
    - "SwiftUI observation isolation: BLE 1 Hz updates do not invalidate sync or health views"
key_files:
  created: []
  modified:
    - GooseSwift/GooseSwiftApp.swift
    - GooseSwift/MoreRemoteServerViews.swift
    - GooseSwift/DeviceView.swift
    - GooseSwift/CoachRouteViews.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/FitnessLiveWorkoutViews.swift
    - GooseSwift/MoreDebugViews.swift
    - GooseSwift/CodexCoachSupport.swift
    - GooseSwift/LocalizedStatusStrings.swift
    - GooseSwift/RootView.swift
    - GooseSwift/CoachLocalToolContext.swift
    - GooseSwift/CoachChatModel.swift
    - GooseSwift/CoachChatScreen.swift
    - GooseSwift/HealthRecoveryStressViews.swift
    - GooseSwift/HealthMetricFamilyStrainViews.swift
decisions:
  - "Previews in MoreRemoteServerViews: inject SyncState separately from GooseAppModel so both @Environment dependencies resolve in preview context"
  - "CoachLocalToolContext.build: added healthState parameter and threaded through getActivities/captureSessions — required updating CoachChatModel.send and CoachChatScreen"
  - "DeviceAdvancedPanel and DeviceActionGrid: added @Environment(HealthState.self) even though they receive model as stored property — @Environment injection propagates through view hierarchy regardless"
  - "MoreDebugCaptureTab: added @Environment(HealthState.self) and redirected all 10+ health/activity/capture/respiratory/movement properties"
  - "HealthRecoveryStressViews and HealthMetricFamilyStrainViews: discovered additional packetImportRevision usages not in plan — fixed as Rule 1 blocking bugs"
metrics:
  duration: "~55 minutes"
  completed: "2026-06-18"
  tasks_total: 2
  tasks_completed: 2
  files_modified: 15
---

# Phase 90 Plan 04: Domain ViewModel View Migration Summary

Completed the domain ViewModel refactor by injecting BLEState, SyncState, and HealthState at the root scene and updating every view file that read migrated properties directly from GooseAppModel.

## Tasks Completed

### Task 1: GooseSwiftApp injection + MoreRemoteServerViews sync redirect (ef27cb2)

- Added `.environment(model.bleState)`, `.environment(model.syncState)`, `.environment(model.healthState)` to the WindowGroup after `.environment(model)` and before `.environment(model.healthStore)`.
- `MoreRemoteServerView` declares `@Environment(SyncState.self) private var syncState` alongside the existing model environment.
- All 9 SyncState property reads redirected from `model.xxx` to `syncState.xxx`.
- Preview bodies updated to set `m.syncState.xxx` instead of `m.xxx`.

### Task 2: All view files + build gate (03ea99d)

Required a merge from `gsd/v12.0-milestone` into the worktree to bring in BLEState.swift, SyncState.swift, HealthState.swift (created in 90-01) and GooseAppModel changes (90-02, 90-03) that removed the migrated var properties.

Files updated per plan:

- **DeviceView**: `DeviceContentView` uses `@Environment(BLEState.self)` for `connectedDeviceGeneration`. `DeviceAdvancedPanel` and `DeviceActionGrid` use `@Environment(HealthState.self)` for `respiratoryPacketWatchStatus` and `respiratoryPacketWatchActive`.
- **CoachRouteViews**: `CoachSleepRouteView` adds `@Environment(BLEState.self)`, all 6 `model.alarmIsArmed` and `model.scheduledAlarmTime` reads/writes replaced with `bleState.xxx`.
- **HomeDashboardView**: adds `@Environment(HealthState.self)`, `model.homeActivityTimelineItems` replaced with `healthState.homeActivityTimelineItems`.
- **FitnessLiveWorkoutViews**: `FitnessOverviewPage` adds `@Environment(BLEState.self)`, `model.liveWorkoutStrain` replaced with `bleState.liveWorkoutStrain`.
- **MoreDebugViews**: `MoreDebugStatusTab` adds `@Environment(BLEState.self)` for `hrSpikeCount`. `MoreDebugCaptureTab` adds `@Environment(HealthState.self)` for all health packet capture, respiratory packet watch, movement validation, and activity detection properties. `MoreDebugResearchTab` adds `@Environment(BLEState.self)` for `onboardingComplete`.
- **CodexCoachSupport**: `CodexLocalToolContext.build` signature gains `healthState: HealthState` parameter; 10 appModel.xxx reads redirected.
- **LocalizedStatusStrings**: MARK comments updated from `GooseAppModel.xxx` to `HealthState.xxx` (comment-only change, no code changes needed).
- **RootView**: adds `@Environment(BLEState.self)`, `syncModelOnboardingState()` reads/writes `bleState.onboardingComplete`.

Additional files fixed as Rule 1 blocking bugs (not in plan scope):

- **CoachLocalToolContext**: Added `healthState: HealthState` parameter and threaded through `activities`, `captureSessions`, `rawSessionData` static methods.
- **CoachChatModel**: Updated `send` and `buildSystemPrompt` to accept and pass `healthState`.
- **CoachChatScreen**: Added `@Environment(HealthState.self)` and passes it to `chat.send`.
- **HealthRecoveryStressViews**: Added `@Environment(HealthState.self)` and redirected `packetImportRevision`.
- **HealthMetricFamilyStrainViews**: Added `@Environment(HealthState.self)` and redirected `packetImportRevision`.

## Build Gate

```
xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/goose-90-build \
  CODE_SIGNING_ALLOWED=NO build
→ ** BUILD SUCCEEDED **
```

Zero error lines. Zero new warnings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CoachLocalToolContext not in plan scope**
- **Found during:** Task 2 build gate
- **Issue:** `CoachLocalToolContext.swift` referenced 13 migrated properties from `appModel` (homeActivityTimelineStatus, homeActivityTimelineItems, activityPersistenceStatus, activityDetectionStatus, movementPacketValidationStatus, packetImportStatus, healthPacketCapture*). The plan listed this file in `CodexCoachSupport.swift` scope but the actual call site was CoachLocalToolContext.
- **Fix:** Added `healthState: HealthState` parameter to `build`, `activities`, `captureSessions`, `rawSessionData` methods. Updated call sites in `CoachChatModel.send`, `CoachChatModel.buildSystemPrompt`, and `CoachChatScreen`.
- **Files modified:** `CoachLocalToolContext.swift`, `CoachChatModel.swift`, `CoachChatScreen.swift`
- **Commit:** 03ea99d

**2. [Rule 1 - Bug] packetImportRevision in health overview views**
- **Found during:** Task 2 build gate
- **Issue:** `HealthRecoveryStressViews.swift` and `HealthMetricFamilyStrainViews.swift` used `model.packetImportRevision` which was migrated to `HealthState`.
- **Fix:** Added `@Environment(HealthState.self)` to `RecoveryV2OverviewPage` and `StrainV2OverviewPage` and redirected the `.onChange(of:)` call.
- **Files modified:** `HealthRecoveryStressViews.swift`, `HealthMetricFamilyStrainViews.swift`
- **Commit:** 03ea99d

**3. [Rule 3 - Blocking] Worktree missing phase 90-01/02/03 domain files**
- **Found during:** Task 2 first build attempt
- **Issue:** The worktree was branched before phase 90-01 ran — `BLEState.swift`, `SyncState.swift`, `HealthState.swift` did not exist, and `GooseAppModel` still had the old var properties.
- **Fix:** Merged `gsd/v12.0-milestone` into the worktree branch. One conflict in GooseSwiftApp.swift resolved by combining both `.environment(model.healthStore)` (from milestone) and the 3 new domain injections.
- **Commit:** 59eac9a

## Verification

Property sweep (all clean — no bare model.xxx reads for migrated properties in view files):
```
grep -rn "model\.(serverReachable|pendingBatchCount|syncPendingRowCount|liveWorkoutStrain|alarmIsArmed|homeActivityTimelineItems|onboardingComplete|respiratoryPacketWatchActive|healthPacketCaptureStatus)" GooseSwift/ --include="*.swift" | grep -v GooseAppModel
→ (empty)
```

Environment injection count:
```
grep -c "environment(model.bleState)\|environment(model.syncState)\|environment(model.healthState)" GooseSwift/GooseSwiftApp.swift
→ 3
```

## Known Stubs

None. All domain properties are wired through to their respective domain objects.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes introduced. All changes are purely view-layer read redirections.

## Self-Check: PASSED

- GooseSwiftApp.swift: environment injections present (3)
- MoreRemoteServerViews.swift: no bare model.syncProperty reads (0)
- BUILD SUCCEEDED — zero errors confirmed
- Commits ef27cb2 and 03ea99d exist in git log
