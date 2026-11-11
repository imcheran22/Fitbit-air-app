---
phase: 84-gen4-battery
plan: "03"
subsystem: ble-client
tags: [battery, gen4, cmd26, ble, swift]
dependency_graph:
  requires: [84-01, 84-02]
  provides: [sendCmd26BatteryRequest, handleBatteryValue, handleCmd26BatteryResponse, BatteryCommandKind]
  affects:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+BatteryCommands.swift
    - GooseSwift/GooseBLEClient+Commands.swift
    - GooseSwift/GooseBLEClient+PeripheralDelegate.swift
    - GooseSwift.xcodeproj/project.pbxproj
tech_stack:
  added: []
  patterns: [command-kind-enum, side-channel-router, fire-and-forget-command, bridge-off-main-thread]
key_files:
  created:
    - GooseSwift/GooseBLEClient+BatteryCommands.swift
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+Commands.swift
    - GooseSwift/GooseBLEClient+PeripheralDelegate.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - "BatteryCommandKind enum added near ClockCommandKind in GooseBLEClient.swift, commandNumber=26, empty payload (no-data GET pattern)"
  - "nextCmd26BatteryCommandSequence: UInt8 = 48 added as a dedicated sequence counter to avoid colliding with other command namespaces"
  - "historicalDirectWriteBridge reused (not a new GooseRustBridge instance) per RESEARCH A2/Pitfall 3"
  - "Auto-send gated on batteryViaCMD26 && wireProtocol == .gen4 — Gen5 also has batteryViaCMD26=true (RESEARCH Pitfall 5)"
  - "project.pbxproj updated with PBXBuildFile + PBXFileReference + PBXGroup + PBXSourcesBuildPhase entries for new extension file"
metrics:
  duration_minutes: 35
  completed_date: "2026-06-14"
  tasks_completed: 2
  files_modified: 5
---

# Phase 84 Plan 03: Gen4 Battery Cmd 26 Auto-Send Summary

Eager Gen4 battery initial read via Cmd 26 (GET_BATTERY_LEVEL): auto-sent on connection, response parsed via Rust bridge off-main, published through applyBatteryLevel with sourceTitle "cmd26.battery".

## What Was Built

### Task 1: BatteryCommandKind enum + GooseBLEClient+BatteryCommands extension

**GooseBLEClient.swift**
- `enum BatteryCommandKind` with `case getBatteryLevel`; `commandNumber: UInt8 = 26`; `name: String = "GET_BATTERY_LEVEL"`; `payload: [UInt8] = []` (empty data body, consistent with clock GET pattern)
- `var nextCmd26BatteryCommandSequence: UInt8 = 48` sequence counter (dedicated namespace, no collision risk)

**GooseBLEClient+BatteryCommands.swift (new file)**
- `sendCmd26BatteryRequest()` — guards connectionState == "ready", valid peripheral and commandCharacteristic, writable writeType; builds frame via whoopGenerationFromCapabilities().buildCommandFrame; logs cmd26.battery.sent
- `nextCmd26BatterySequence()` — returns and increments nextCmd26BatteryCommandSequence (wraps at 48)
- `handleBatteryValue(_ value: Data, characteristic: CBCharacteristic)` — side-channel router; guards notificationCharacteristicIDs; iterates frames; requires count >= 5, commandResponse or puffinCommandResponse packet type, payload[2] == 26 (T-84-06)
- `handleCmd26BatteryResponse(_ payload: [UInt8])` — guards count >= 4 (T-84-07, D-05); guards result code payload[4] == 1; dispatches to DispatchQueue.global(qos: .utility) to call historicalDirectWriteBridge.request("battery.parse_cmd26_response") with [weak self]; publishes via applyBatteryLevel(pct, capturedAt: Date(), sourceTitle: "cmd26.battery")

### Task 2: Auto-send trigger + peripheral delegate routing

**GooseBLEClient+Commands.swift**
- In `processDiscoveredCharacteristics`, after `connectedCapabilities = caps`, added Gen4 auto-send gate: `if caps.batteryViaCMD26, caps.wireProtocol == .gen4 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.sendCmd26BatteryRequest() } }` (T-84-08: Gen5 also has batteryViaCMD26=true, wireProtocol == .gen4 is mandatory guard)

**GooseBLEClient+PeripheralDelegate.swift**
- Added `handleBatteryValue(value, characteristic: characteristic)` in the side-channel dispatch block immediately after `handleClockValue`, mirroring the established alarm/clock/sensor routing pattern

**GooseSwift.xcodeproj/project.pbxproj**
- Added PBXBuildFile entry D100000000000000000000062 for GooseBLEClient+BatteryCommands.swift in Sources
- Added PBXFileReference entry D200000000000000000000062
- Added to PBXGroup alongside GooseBLEClient+Haptics.swift
- Added to PBXSourcesBuildPhase build file list

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| `grep -c 'case getBatteryLevel' GooseBLEClient.swift` returns 1 | 1 |
| `grep -c 'battery.parse_cmd26_response' GooseBLEClient+BatteryCommands.swift` returns 1 | 1 |
| `grep -c 'sourceTitle: "cmd26.battery"' GooseBLEClient+BatteryCommands.swift` returns 1 | 1 |
| `grep -c 'connectionState == "ready"' GooseBLEClient+BatteryCommands.swift` returns >= 1 | 1 |
| `grep -c 'payload.count >= 4' GooseBLEClient+BatteryCommands.swift` returns >= 1 | 1 |
| `grep -c 'DispatchQueue.global' GooseBLEClient+BatteryCommands.swift` returns >= 1 | 1 |
| `grep -c 'sendCmd26BatteryRequest' GooseBLEClient+Commands.swift` returns 1 | 1 |
| `grep -c 'batteryViaCMD26' GooseBLEClient+Commands.swift` increased vs baseline | 3 (was 2) |
| `grep -c 'wireProtocol == .gen4' GooseBLEClient+Commands.swift` returns >= 1 | 2 |
| `grep -c 'handleBatteryValue(value, characteristic: characteristic)' GooseBLEClient+PeripheralDelegate.swift` returns 1 | 1 |
| iOS build compiles with no new errors | BUILD SUCCEEDED |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GooseBLEClient+BatteryCommands.swift missing from Xcode project**
- **Found during:** Task 2 build verification
- **Issue:** Creating a new .swift file does not automatically add it to GooseSwift.xcodeproj; `handleBatteryValue` was unreachable (compiler error: cannot find 'handleBatteryValue' in scope)
- **Fix:** Added PBXBuildFile, PBXFileReference, PBXGroup entry, and PBXSourcesBuildPhase entry to project.pbxproj using the established D1/D2 ID naming pattern (D100000000000000000000062 / D200000000000000000000062)
- **Files modified:** GooseSwift.xcodeproj/project.pbxproj
- **Commit:** 19d7be9

## Known Stubs

None. All battery paths are wired end-to-end: sendCmd26BatteryRequest → BLE write → handleBatteryValue → handleCmd26BatteryResponse → Rust bridge → applyBatteryLevel.

## Threat Surface Scan

No new network endpoints or schema changes. The two threat boundaries in the threat model are both mitigated:
- T-84-06: payload.count >= 5 guard in handleBatteryValue before reading payload[2]
- T-84-07: payload.count >= 4 guard in handleCmd26BatteryResponse (D-05)
- T-84-08: wireProtocol == .gen4 gate prevents Gen5 from auto-sending Cmd 26
- T-84-09: bridge.request dispatched on DispatchQueue.global(qos: .utility)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | aef67ed | feat(84-03): add BatteryCommandKind enum and GooseBLEClient+BatteryCommands extension |
| Task 2 | 19d7be9 | feat(84-03): wire Cmd 26 auto-send on Gen4 and route responses in peripheral delegate |

## Self-Check: PASSED
