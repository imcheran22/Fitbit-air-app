---
phase: 89-ble-actor-refactor
plan: "02"
subsystem: BLE
tags:
  - swift
  - actor
  - BLESessionCoordinator
  - BLETransport
  - GooseAppModel
dependency_graph:
  requires:
    - phase: 89-01
      provides: BLETransport protocol and CoreBluetoothBLETransport concrete class
  provides:
    - BLESessionCoordinator actor (session lifecycle wrapper)
    - GooseAppModel.ble typed as any BLETransport
  affects:
    - All view files that receive ble parameter
    - GooseAppModel+BandFirstSync.swift
    - GooseAppModel+Lifecycle.swift
tech_stack:
  added:
    - Swift actor (BLESessionCoordinator)
  patterns:
    - Actor isolation boundary for session lifecycle (connect/disconnect/state)
    - Existential any BLETransport for service-layer injection
    - bleCoordinator.transport for concrete-type escape hatches (writeClockCommand, SyncToastHost binding)
key_files:
  created:
    - GooseSwift/BLESessionCoordinator.swift
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+BandFirstSync.swift
    - GooseSwift/GooseAppModel+Lifecycle.swift
    - GooseSwift/BLETransport.swift
    - GooseSwift/NotificationFrameParsing.swift
    - GooseSwift/CoachTips.swift
    - GooseSwift/ConnectionView.swift
    - GooseSwift/DeviceView.swift
    - GooseSwift/FitnessLiveWorkoutViews.swift
    - GooseSwift/FitnessSummaryViews.swift
    - GooseSwift/HRMonitorView.swift
    - GooseSwift/HealthSleepOverviewViews.swift
    - GooseSwift/HealthSleepSheetsViews.swift
    - GooseSwift/HomeDashboardView.swift
    - GooseSwift/LiveActivityContentView.swift
    - GooseSwift/OnboardingStepViews.swift
    - GooseSwift/RootView.swift
    - GooseSwift/SleepBridgeViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift
    - GooseSwift.xcodeproj/project.pbxproj
key_decisions:
  - "bleCoordinator is internal (not private) so GooseAppModel extension files in separate files can access it"
  - "RootView.SyncToastHost uses bleCoordinator.transport (CoreBluetoothBLETransport) because Bindable requires @Observable class, not any BLETransport existential"
  - "GooseAppModel+Lifecycle.swift uses bleCoordinator.transport.writeClockCommand() directly since writeClockCommand is not in BLETransport protocol"
  - "15 missing protocol members added to BLETransport to allow view files to compile with any BLETransport"
requirements_completed:
  - ARCH-05
duration: "~1.5 hours"
completed: "2026-06-18"
---

# Phase 89 Plan 02: BLESessionCoordinator Actor Summary

**BLESessionCoordinator actor created; GooseAppModel.ble typed as any BLETransport with 15 additional BLETransport protocol members and 12 view files updated to compile with the abstraction boundary.**

## Performance

- **Duration:** ~1.5 hours
- **Completed:** 2026-06-18
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- `BLESessionCoordinator` Swift actor created as thin wrapper around `CoreBluetoothBLETransport` for session lifecycle (connect/disconnect/startScan/stopScan/reconnect)
- `GooseAppModel.ble` changed from `CoreBluetoothBLETransport` to `any BLETransport`; `bleCoordinator: BLESessionCoordinator` added as internal stored property
- Session lifecycle calls in `GooseAppModel+BandFirstSync.swift` updated to `Task { await bleCoordinator.* }`
- `BLESessionCoordinator.swift` registered in `project.pbxproj` (all 3 required sections)
- iOS build: BUILD SUCCEEDED

## Task Commits

1. **Task 1: Create BLESessionCoordinator actor** - `3cd5082` (feat)
2. **Task 2: Update GooseAppModel to use any BLETransport** - `9e93859` (feat)

## Files Created/Modified

- `GooseSwift/BLESessionCoordinator.swift` - New actor: init, asTransport, connect/disconnect/startScan/stopScan/reconnect, nonisolated state queries
- `GooseSwift/GooseAppModel.swift` - bleCoordinator: BLESessionCoordinator (internal), ble: any BLETransport
- `GooseSwift/BLETransport.swift` - 15 missing protocol members + 5 convenience overloads added
- `GooseSwift/GooseAppModel+BandFirstSync.swift` - session lifecycle via Task { await bleCoordinator.* }
- `GooseSwift/GooseAppModel+Lifecycle.swift` - writeClockCommand via bleCoordinator.transport
- 12 view files - CoreBluetoothBLETransport -> any BLETransport parameter types

## Decisions Made

- `bleCoordinator` is `internal` (no access modifier) not `private` — Swift's `private` restricts to the same file, so extension files in separate files (GooseAppModel+BandFirstSync.swift) cannot access a `private` property. The plan says `private` but the success criteria required extension file access.
- `RootView.SyncToastHost` keeps `CoreBluetoothBLETransport` and receives `bleCoordinator.transport` — Swift's `@Bindable`/`$` syntax for mutable bindings requires `@Observable` class types; `any BLETransport` existential does not satisfy this constraint.
- `writeClockCommand` remains accessible only via `bleCoordinator.transport.writeClockCommand()` — this method takes a nested `ClockCommandKind` type (known issue from Plan 01) that creates a circular dependency if added to the protocol.
- 15 missing protocol members added to `BLETransport` during build-fix iterations (Rule 3): `canScan`, `canConnect`, `canSendHello`, `canReconnectRemembered`, `hasRememberedDevice`, `isReconnecting`, `reconnectFailed`, `hrIsReconnecting`, `hrReconnectFailed`, `batteryChargeDisplayStatus`, `alarmWriteSupportSummary`, `runWhoopAlarmNow`, `readStrapClock`, `refreshBatteryLevel`, `refreshDeviceInformation`, `select`, `connectSelected`, `forgetRememberedDevice`, `sendClientHello`, `stopReconnect`, `retryReconnect`, `stopHRReconnect`, `retryHRReconnect`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was 157 commits behind gsd/v12.0-milestone**
- **Found during:** Task 1 (before writing any code)
- **Issue:** The worktree branch was created from an old commit before Plan 01's work existed. No BLETransport.swift, CoreBluetoothBLETransport.swift, or the 12 extension files existed in the worktree.
- **Fix:** Merged `gsd/v12.0-milestone` into the worktree branch via `git merge gsd/v12.0-milestone --no-edit`
- **Files modified:** All Plan 01 files brought in via merge

**2. [Rule 3 - Blocking] actor-isolated asTransport cannot be accessed from @MainActor init**
- **Found during:** Task 2 build verification
- **Issue:** `bleCoordinator.asTransport` was actor-isolated (default), preventing access from `@MainActor init`
- **Fix:** Marked `asTransport` as `nonisolated` — safe because `transport` is a `let` stored property
- **Files modified:** GooseSwift/BLESessionCoordinator.swift

**3. [Rule 3 - Blocking] private bleCoordinator inaccessible from extension files**
- **Found during:** Task 2 build verification
- **Issue:** `private let bleCoordinator` restricted access to the file where it was declared; `GooseAppModel+BandFirstSync.swift` (separate file) could not access it
- **Fix:** Changed to `internal` (no modifier) — matches Swift's actual scoping semantics for class extensions across files
- **Files modified:** GooseSwift/GooseAppModel.swift

**4. [Rule 2 - Missing Critical Functionality] 15+ missing protocol members caused build failures**
- **Found during:** Task 2 build verification (multiple rounds)
- **Issue:** Changing `GooseAppModel.ble` to `any BLETransport` cascaded through view files that accessed non-protocol members. Members added: canScan, canConnect, canSendHello, canReconnectRemembered, hasRememberedDevice, isReconnecting, reconnectFailed, hrIsReconnecting, hrReconnectFailed, batteryChargeDisplayStatus, alarmWriteSupportSummary, runWhoopAlarmNow, readStrapClock, refreshBatteryLevel, refreshDeviceInformation, select, connectSelected, forgetRememberedDevice, sendClientHello, stopReconnect, retryReconnect, stopHRReconnect, retryHRReconnect
- **Fix:** Added all missing members to BLETransport protocol; added convenience overloads (setWhoopAlarm, runWhoopAlarmNow, readStrapClock, record with level+no-body) to protocol extension
- **Files modified:** GooseSwift/BLETransport.swift

**5. [Rule 3 - Blocking] 12 view files received any BLETransport where CoreBluetoothBLETransport was expected**
- **Found during:** Task 2 build verification (iterative rounds)
- **Issue:** View files that stored or received `ble: CoreBluetoothBLETransport` could not accept `model.ble` which is now `any BLETransport`
- **Fix:** Updated 12 view files to use `any BLETransport`; `RootView.SyncToastHost` kept `CoreBluetoothBLETransport` to support `@Bindable` binding to `syncFailureSheet`, accessing it via `model.bleCoordinator.transport`
- **Files modified:** ConnectionView, DeviceView, FitnessSummaryViews, FitnessLiveWorkoutViews, HRMonitorView, HealthSleepOverviewViews, HealthSleepSheetsViews, HomeDashboardView, LiveActivityContentView, OnboardingStepViews, SleepBridgeViews, SleepV2ScheduleViews, NotificationFrameParsing, CoachTips

---

**Total deviations:** 5 auto-fixed (1x Rule 2, 4x Rule 3)
**Impact on plan:** All auto-fixes necessary to achieve BUILD SUCCEEDED. The protocol expansion was larger than anticipated because the plan did not enumerate all view files using non-protocol members. The core deliverable (BLESessionCoordinator actor, GooseAppModel.ble: any BLETransport) is fully implemented.

## Known Stubs

None — all wiring is real; BLESessionCoordinator delegates to the live CoreBluetoothBLETransport.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes. The actor isolation boundary is an internal structural change with no trust boundary impact.

## Self-Check: PASSED

- GooseSwift/BLESessionCoordinator.swift: EXISTS with `actor BLESessionCoordinator`
- GooseSwift/GooseAppModel.swift: `let ble: any BLETransport` = 1, `bleCoordinator: BLESessionCoordinator` = 1, `let ble: CoreBluetoothBLETransport` = 0
- Commits 3cd5082 and 9e93859: EXIST
- iOS build: BUILD SUCCEEDED (iPhone 17 Pro simulator)
