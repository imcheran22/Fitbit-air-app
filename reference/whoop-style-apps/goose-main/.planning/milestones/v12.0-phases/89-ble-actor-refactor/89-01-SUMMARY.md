---
phase: 89-ble-actor-refactor
plan: "01"
subsystem: BLE
tags:
  - swift
  - protocol
  - refactor
  - BLETransport
  - CoreBluetoothBLETransport
dependency_graph:
  requires: []
  provides:
    - BLETransport protocol
    - CoreBluetoothBLETransport concrete class
  affects:
    - GooseAppModel
    - All view files using BLE client
tech_stack:
  added:
    - BLETransport protocol (BLETransport.swift)
  patterns:
    - Protocol + concrete implementation (BLETransport + CoreBluetoothBLETransport)
    - Protocol extension convenience overloads
key_files:
  created:
    - GooseSwift/BLETransport.swift
    - GooseSwift/CoreBluetoothBLETransport.swift
    - GooseSwift/CoreBluetoothBLETransport+BatteryCommands.swift
    - GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift
    - GooseSwift/CoreBluetoothBLETransport+Commands.swift
    - GooseSwift/CoreBluetoothBLETransport+DebugAndSync.swift
    - GooseSwift/CoreBluetoothBLETransport+Haptics.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalCommands.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift
    - GooseSwift/CoreBluetoothBLETransport+HRMonitor.swift
    - GooseSwift/CoreBluetoothBLETransport+Parsing.swift
    - GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift
    - GooseSwift/CoreBluetoothBLETransport+UserActions.swift
    - GooseSwift/CoreBluetoothBLETransport+VitalsAndLogging.swift
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseBLETypes.swift
    - GooseSwift/GooseBLEHistoricalManager.swift
    - GooseSwift/GooseAppModel+Lifecycle.swift
    - GooseSwift/GooseAppModel+NotificationPipeline.swift
    - GooseSwift/MoreDataStore.swift
    - GooseSwift/CodexCoachSupport.swift
    - GooseSwift/WhoopDataSignalPipeline.swift
    - GooseSwift/NotificationFrameParsing.swift
    - GooseSwift.xcodeproj/project.pbxproj
  deleted:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+BatteryCommands.swift
    - GooseSwift/GooseBLEClient+CentralDelegate.swift
    - GooseSwift/GooseBLEClient+Commands.swift
    - GooseSwift/GooseBLEClient+DebugAndSync.swift
    - GooseSwift/GooseBLEClient+Haptics.swift
    - GooseSwift/GooseBLEClient+HistoricalCommands.swift
    - GooseSwift/GooseBLEClient+HistoricalHandlers.swift
    - GooseSwift/GooseBLEClient+HRMonitor.swift
    - GooseSwift/GooseBLEClient+Parsing.swift
    - GooseSwift/GooseBLEClient+PeripheralDelegate.swift
    - GooseSwift/GooseBLEClient+UserActions.swift
    - GooseSwift/GooseBLEClient+VitalsAndLogging.swift
decisions:
  - BLETransport is AnyObject-constrained (not actor-isolated) to preserve existing threading model
  - Protocol extension provides convenience overloads (record, syncHistoricalPackets, enterHighFrequencyHistorySync, sendDebugResearchCommand)
  - GooseAppModel.swift uses CoreBluetoothBLETransport concrete type (Plan 02 will promote to any BLETransport with BLESessionCoordinator)
  - View files (SleepBridgeViews, DeviceView, etc.) use CoreBluetoothBLETransport because they access non-protocol members; Plan 02 will finalize the abstraction boundary
  - writeClockCommand excluded from protocol (takes nested ClockCommandKind type — circular reference if included; Plan 02 will promote to top-level type)
metrics:
  duration: "~2.5 hours"
  completed_date: "2026-06-18"
  tasks_completed: 2
  tasks_total: 2
  files_created: 14
  files_modified: 10
  files_deleted: 13
---

# Phase 89 Plan 01: BLETransport Protocol Extraction Summary

**One-liner:** BLETransport protocol extracted from GooseBLEClient public surface; GooseBLEClient renamed to CoreBluetoothBLETransport across 13 files + xcodeproj with BUILD SUCCEEDED.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create BLETransport protocol | b88dce9 | GooseSwift/BLETransport.swift (new) |
| 2 | Rename GooseBLEClient to CoreBluetoothBLETransport | a8be8db | 13 CoreBluetoothBLETransport*.swift files |
| Fix | Build fixes: protocol signatures, stale worktree files | 4f01e71 | BLETransport.swift, CoreBluetoothBLETransport*.swift, GooseAppModel.swift |

## What Was Built

### BLETransport Protocol (GooseSwift/BLETransport.swift)
- 65+ state properties (read-only)
- 12 callback closure properties (read-write)
- 4 sub-object accessors
- 28+ action method signatures
- Protocol extension with 5 convenience overloads (record, syncHistoricalPackets, enterHighFrequencyHistorySync, sendDebugResearchCommand)

### CoreBluetoothBLETransport (renamed from GooseBLEClient)
- Main class file: 1,077 lines with `BLETransport` conformance in the conformance list
- 12 extension files: all renamed from GooseBLEClient+*.swift with `extension GooseBLEClient` → `extension CoreBluetoothBLETransport`
- GooseBLEHRMonitorManager.owner type updated from GooseBLEClient to CoreBluetoothBLETransport

### Consumer Updates
- `GooseAppModel.swift`: `let ble: CoreBluetoothBLETransport` (concrete type; Plan 02 will change to `any BLETransport`)
- `MoreDataStore.swift`, `CodexCoachSupport.swift`, `WhoopDataSignalPipeline.swift`: `any BLETransport` for method parameters and stored properties
- `GooseAppModel+NotificationPipeline.swift`: `any BLETransport` for pipeline factory parameter
- `GooseBLEHistoricalManager.swift`: `CoreBluetoothBLETransport.PendingHistoricalCommand`, `.HistoricalRangePageState` nested type refs
- `GooseBLETypes.swift`: `CoreBluetoothBLETransport.buildV5CommandFrame`, `.V5PacketType`, `.crc32` static refs
- `GooseAppModel+Lifecycle.swift`: `CoreBluetoothBLETransport.DefaultsKey.deviceUUIDMap`
- 10 view files remain using `CoreBluetoothBLETransport` (they access non-protocol members; boundary finalized in Plan 02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Protocol method signatures didn't match implementation**
- **Found during:** Build verification
- **Issue:** The plan listed idealized protocol signatures (e.g., `func buzz()`, `func record(source:title:)`) but the implementation has parameterized variants with defaults (e.g., `func buzz(loops: Int)`, `func record(level:source:title:body:)`)
- **Fix:** Corrected protocol to match implementation signatures; added protocol extension with convenience overloads to satisfy call sites
- **Files modified:** GooseSwift/BLETransport.swift

**2. [Rule 3 - Blocking] Worktree was ~100 commits behind main branch**
- **Found during:** Build verification
- **Issue:** The worktree was created from an older commit. Several files were missing or stale: GooseBLEClient+BatteryCommands.swift, GooseBLETypes.swift (missing DeviceCapabilities), extension files (using old activeDeviceGeneration API), MovementPacketSamples.swift (using rustDeviceType), OvernightRawNotificationSpool.swift
- **Fix:** Regenerated all CoreBluetoothBLETransport files from updated main repo; updated stale worktree files (MovementPacketSamples, NotificationFrameParsing, OvernightRawNotificationSpool, GooseAppModel+Upload) from main repo
- **Files modified:** All 12 extension files + CoreBluetoothBLETransport.swift + GooseBLETypes.swift + 4 stale files

**3. [Rule 3 - Blocking] View files accessing non-protocol members when typed as `any BLETransport`**
- **Found during:** Build verification rounds 3-6
- **Issue:** The plan said to update view files to `any BLETransport`, but views access many members (canScan, refreshBatteryLevel, batteryChargeDisplayStatus, select, connectSelected, etc.) not in the protocol
- **Fix:** Reverted view files back to `CoreBluetoothBLETransport` concrete type. Service objects (MoreDataStore, CodexCoachSupport, WhoopDataSignalPipeline, NotificationPipeline) remain as `any BLETransport` since they only use protocol-covered methods
- **Files modified:** 10 view files

**4. [Rule 3 - Blocking] GooseAppModel.swift needed temporary update**
- **Found during:** Build verification round 2
- **Issue:** GooseAppModel.swift still used `GooseBLEClient` type which no longer exists
- **Fix:** Updated to `CoreBluetoothBLETransport` (concrete type); Plan 02 will change to `any BLETransport`
- **Files modified:** GooseSwift/GooseAppModel.swift

**5. [Rule 2 - Missing Critical Members] Protocol missing several members accessed from views**
- **Found during:** Build verification rounds 3-7
- **Issue:** alarmDisplaySummary, batterySettingsSummary, rememberedDeviceDescription, startHRMonitorScan, stopHRMonitorScan, connectHRMonitor, disconnectHRMonitor were not in the protocol
- **Fix:** Added all missing members to BLETransport protocol
- **Files modified:** GooseSwift/BLETransport.swift

### Out of Scope (Not Fixed)
- writeClockCommand not added to protocol: takes nested `ClockCommandKind` type which creates circular dependency. Plan 02 will promote this to a top-level type.
- AppShellView.swift, CoachView.swift, HealthDashboardViews.swift, and other stale files: differences are in unrelated feature areas (HealthDataStore @Environment, etc.) and did not cause build failures. Deferred to subsequent plans.

## Known Stubs
None — protocol is fully implemented and build succeeds.

## Threat Flags
None. This plan only renames types and extracts an abstraction boundary; no new network endpoints, auth paths, or trust boundary changes.

## Self-Check: PASSED

- GooseSwift/BLETransport.swift: EXISTS
- GooseSwift/CoreBluetoothBLETransport.swift: EXISTS with BLETransport conformance
- 12 extension files: ALL EXIST
- Zero GooseBLEClient*.swift files remain
- iOS build: BUILD SUCCEEDED (iPhone 17 Pro simulator)
- Commits: b88dce9, a8be8db, 4f01e71
