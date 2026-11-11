---
phase: 14-pt-pt-localisation
plan: "04"
subsystem: localisation
tags: [localisation, swift, swiftui, pt-PT, ble, status-strings]
dependency_graph:
  requires: [14-01, 14-02, 14-03]
  provides: [dynamic-status-localisation, display-layer-extensions, final-build-gate]
  affects: [ConnectionView, DeviceView, HRMonitorView, MoreCaptureViews, MoreDebugViews, MoreRouteModels, SleepBridgeViews, SleepV2ScheduleViews]
tech_stack:
  added: [LocalizedStatusStrings.swift]
  patterns: [display-layer-extension, String-extension-localisation, String(localized:)]
key_files:
  created:
    - GooseSwift/LocalizedStatusStrings.swift
  modified:
    - GooseSwift/Localizable.xcstrings
    - GooseSwift/ConnectionView.swift
    - GooseSwift/DeviceView.swift
    - GooseSwift/HRMonitorView.swift
    - GooseSwift/MoreCaptureViews.swift
    - GooseSwift/MoreDebugViews.swift
    - GooseSwift/MoreRouteModels.swift
    - GooseSwift/SleepBridgeViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - "14 extension methods on String created — one per D-04 dynamic @Published property"
  - "Raw @Published values unchanged — guards/comparisons still use English constants (D-03)"
  - "String(localized:) used inside extensions so keys live in Localizable.xcstrings"
  - "MoreStatusKind.title switched from rawValue.capitalized to String(localized:) switch"
  - "default: return self on all methods — unknown states fall back to raw English value (Pitfall 2)"
  - "Reconnect state with 'reconnecting' prefix matched via hasPrefix — numeric tail preserved"
  - "batteryPowerStatus 'Unknown' and 'Charging (inferred)' localised; dynamic summary strings passed through"
  - "healthPacketCaptureStatus and overnightGuardStatus localise only stable base values; dynamic strings pass through"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-05T18:30:21Z"
  tasks_completed: 3
  files_created: 1
  files_modified: 9
---

# Phase 14 Plan 04: Dynamic Status Localisation Summary

**One-liner:** Display-layer String extensions mapping 14 raw BLE/@Published state values to pt-PT at view sites, with 54 new xcstrings entries and a clean simulator build (597 total).

## What Was Built

### Task 1: LocalizedStatusStrings.swift

Created `GooseSwift/LocalizedStatusStrings.swift` with `extension String` defining exactly 14 computed display methods:

| Method | Source property | Raw values covered |
|--------|-----------------|-------------------|
| `localizedConnectionState` | `GooseBLEClient.connectionState` | disconnected, connecting, connected, discovering, ready |
| `localizedHRConnectionState` | `GooseBLEClient.hrConnectionState` | disconnected, connecting, connected |
| `localizedBluetoothState` | `GooseBLEClient.bluetoothState` | powered on/off, unauthorized, unsupported, resetting, not requested, unknown, bluetooth unavailable |
| `localizedHRBluetoothState` | `GooseBLEClient.hrBluetoothState` | poweredOn/Off, unauthorized, unsupported, resetting, unknown |
| `localizedReconnectState` | `GooseBLEClient.reconnectState` | idle, already connected, connecting, failed after 10 attempts, blocked, + 8 more |
| `localizedHRReconnectState` | `GooseBLEClient.hrReconnectState` | idle, already connected, failed after 10 attempts, reconnecting prefix |
| `localizedHistoricalSyncStatus` | `GooseBLEClient.historicalSyncStatus` | idle, syncing, waiting, synced, failed |
| `localizedStrapClockStatus` | `GooseBLEClient.strapClockStatus` | Not read, Syncing clock, Clock in sync, Clock synced, + 2 more |
| `localizedBatteryPowerStatus` | `GooseBLEClient.batteryPowerStatus` | Unknown, Charging (inferred) |
| `localizedCaptureStatus` | `GooseAppModel.healthPacketCaptureStatus` | No health packet capture, No active health packet capture |
| `localizedCaptureTargetSummary` | `GooseAppModel.healthPacketCaptureTargetSummary` | No health packet capture |
| `localizedOvernightGuardStatus` | `GooseAppModel.overnightGuardStatus` | Not started, Recording overnight guard, + 2 more |
| `localizedActivityDetectionStatus` | `GooseAppModel.activityDetectionStatus` | Watching for movement packets |
| `localizedPacketImportStatus` | `GooseAppModel.packetImportStatus` | No packet import, Packet import failed |

All methods have `default: return self` — unknown runtime values fall back to raw English (Pitfall 2 safety).

Added 46 new pt-PT entries to `Localizable.xcstrings`.

### Task 2: Display Site Updates

Updated every view display site to use `.localizedXxx` variants:

- **ConnectionView.swift:** `bluetoothState.localizedBluetoothState`, `connectionState.localizedConnectionState`, `reconnectState.localizedReconnectState`, `hrReconnectState.localizedHRReconnectState`, `historicalSyncStatus.localizedHistoricalSyncStatus` (in `historicalSyncValue`)
- **DeviceView.swift:** `connectionState.localizedConnectionState`, `historicalSyncStatus.localizedHistoricalSyncStatus`, `batteryPowerStatus.localizedBatteryPowerStatus` (in `batterySummary`), `strapClockStatus.localizedStrapClockStatus` (in `clockSummary`)
- **HRMonitorView.swift:** `hrReconnectState.localizedHRReconnectState` (Text display, guard on "idle" unchanged)
- **MoreCaptureViews.swift:** `overnightGuardStatus.localizedOvernightGuardStatus`
- **MoreDebugViews.swift:** `healthPacketCaptureStatus.localizedCaptureStatus`, `healthPacketCaptureTargetSummary.localizedCaptureTargetSummary`, `activityDetectionStatus.localizedActivityDetectionStatus`
- **SleepBridgeViews.swift:** `historicalSyncStatus.localizedHistoricalSyncStatus`
- **SleepV2ScheduleViews.swift:** `historicalSyncStatus.localizedHistoricalSyncStatus`

**MoreStatusKind.title** in `MoreRouteModels.swift` switched from `rawValue.capitalized` to explicit `String(localized:)` switch for all 5 cases: ready→Pronto, pending→Pendente, blocked→Bloqueado, unavailable→Indisponível, stale→Desatualizado.

All control-flow comparisons (`== "ready"`, `== "idle"`, `!= "connected"`) left unchanged — raw English values preserved throughout state machine logic.

`LocalizedStatusStrings.swift` registered in `GooseSwift.xcodeproj/project.pbxproj` (PBXBuildFile `D1000000000000000000005C`, PBXFileReference `D2000000000000000000005C`, added to GooseSwift group and PBXSourcesBuildPhase).

### Task 3: Final Sweep + Build Verification

Sweep command found these UI strings not yet in xcstrings:
- `Thinking`, `Sign in to Coach`, 2 Coach sign-in descriptions, `Start`, `Recently Used`, `All Workouts`, `Workout`
- `"2"` excluded — numeric visual badge, not a UI string

8 additional entries added. Total xcstrings: **597 entries**.

`xcodebuild -scheme GooseSwift -sdk iphonesimulator build` → **BUILD SUCCEEDED** with no errors.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 873bbc6 | feat(14): add LocalizedStatusStrings.swift — pt-PT display layer for dynamic @Published state strings |
| 2 | b088cf5 | feat(14): final sweep — add 8 missed static UI strings to xcstrings and verify build |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Notes

- `packetImportStatus` display site: no direct view display found in `HomeDashboardView.swift` or `MoreDebugViews.swift` — only used in Coach context (technical JSON) and as a refresh trigger. No UI rewrite needed for this property.
- `HRMonitorView.swift`: control-flow switch/guards on `hrConnectionState`/`hrBluetoothState` left intact per plan instruction. Only the `Text(ble.hrReconnectState)` display site was rewritten.
- Dynamic composite strings in `healthPacketCaptureStatus` (e.g. "Capturing temperature from active historical sync") and `overnightGuardStatus` (e.g. "Recording overnight guard | app background") pass through unchanged — only stable base values localised.

## Known Stubs

None — all display sites wired to `.localizedXxx` accessors. Dynamic strings with numeric/device-name tails pass through as raw English (expected behaviour per D-03).

## Threat Flags

None — this plan is purely additive localisation; no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- LocalizedStatusStrings.swift: FOUND at GooseSwift/LocalizedStatusStrings.swift
- 14 localized methods: VERIFIED (grep -c 'var localized' = 14)
- Localizable.xcstrings: 597 entries, JSON valid
- Display sites updated: VERIFIED (grep -rc '\.localized[A-Z]' ConnectionView/DeviceView/MoreCaptureViews ≥ 8)
- MoreRouteModels String(localized:): VERIFIED
- Build: BUILD SUCCEEDED (xcodebuild -scheme GooseSwift -sdk iphonesimulator)
- Commits: 873bbc6, b088cf5 present in git log
