---
phase: 10-hr-monitor-scan-connect-ui
plan: "02"
subsystem: ui
tags: [swift, swiftui, ble, corebluetooth, hr-monitor, scan, connect]

# Dependency graph
requires:
  - phase: 10-hr-monitor-scan-connect-ui plan 01
    provides: "@Published discoveredHRDevices, hrConnectionState on GooseBLEClient; disconnectHRMonitor()"
provides:
  - "HRMonitorView — public SwiftUI view for HR monitor scan/connect screen"
  - "HRMonitorContentView — private inner view with @ObservedObject GooseBLEClient"
  - "HRMonitorHeader — private header struct (no LAST SYNC column)"
  - "HRMonitorScanList — private scan list with DISCOVERED section and device rows"
  - "HRMonitorDeviceRow — private row with name, RSSI, inline ProgressView when connecting"
  - "HRMonitorConnectedPanel — private panel with live BPM, reconnect state, Disconnect button"
  - "HRMonitorDeviceSheet — private sheet with device name, RSSI, Connect button"
affects:
  - 10-hr-monitor-scan-connect-ui plan 03 (navigation wiring to More tab)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Four-state machine driven by ble.bluetoothState and ble.hrConnectionState: bluetooth-off, scanning, connecting, connected"
    - "Auto-scan on onAppear guarded by hrConnectionState != connected; stop on onDisappear"
    - ".sheet(item:) with GooseDiscoveredDevice binding for tap-to-connect UX"
    - "connectedDeviceName resolved via ble.hrMonitorManager.connectedDeviceName (internal access, falls back to HR Monitor)"
    - "File-scope private let visual token constants — each file declares its own copies per project convention"

key-files:
  created:
    - GooseSwift/HRMonitorView.swift
  modified: []

key-decisions:
  - "connectedDeviceName accessed via model.ble.hrMonitorManager.connectedDeviceName (internal access within the module) rather than adding a new @Published property — zero risk, GooseBLEHRMonitorManager is internal to GooseSwift"
  - "sheet(item: $selectedDevice) used so setting selectedDevice = nil auto-dismisses the sheet before connectHRMonitor is called"
  - "onChange(of: ble.hrConnectionState) clears connectingDeviceID when state reaches connected or disconnected, preventing stale spinner"

patterns-established:
  - "Four-state SwiftUI view driven by a single String state variable with Bluetooth availability gate"
  - "Inline ProgressView on scan list row using @State connectingDeviceID UUID match"

requirements-completed: [WEAR-04, WEAR-05]

# Metrics
duration: 6min
completed: 2026-06-04
---

# Phase 10 Plan 02: HRMonitorView Summary

**HRMonitorView with four-state machine (BT-off / scanning / connecting / connected), auto-scan lifecycle, tap-to-connect sheet, inline ProgressView on connecting row, and connected panel with live BPM and Disconnect**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T22:43:44Z
- **Completed:** 2026-06-04T22:49:45Z
- **Tasks:** 1/2 (Task 1 complete; Task 2 force-approved / deferred to post-Plan-03 hardware verification)
- **Files modified:** 1

## Accomplishments

- Created `GooseSwift/HRMonitorView.swift` (322 lines) with all 7 required structs
- Implemented four-state machine: BLUETOOTH_UNAVAILABLE (BT off or unauthorized), SCANNING (disconnected + BT on), CONNECTING (hrConnectionState == "connecting"), CONNECTED (hrConnectionState == "connected")
- Auto-scan on `onAppear` guarded by `hrConnectionState != "connected"`; `stopHRMonitorScan()` on `onDisappear`
- Tap-to-connect sheet using `.sheet(item: $selectedDevice)` with `.presentationDetents([.height(220)])` and `.presentationDragIndicator(.visible)`
- Inline `ProgressView` on the connecting row using `connectingDeviceID == device.id`
- Connected panel: live BPM (`liveHeartRateBPM ?? "--"`), reconnect state text when non-idle, Disconnect button
- `connectedDeviceName` resolved via `model.ble.hrMonitorManager.connectedDeviceName` (internal module access, falls back to "HR Monitor")
- Visual tokens (deviceScreenBackground, devicePrimaryText, controlBackground, dividerColor, secondaryText, mutedText, connectedGreen, disconnectedRed, deviceLabelFont, deviceBodyFont) copied verbatim from DeviceView.swift per project convention
- Full accessibility labels on rows, ProgressView, BPM display, Disconnect button, Connect button, and BT-off copy

## Task Commits

1. **Task 1: Build HRMonitorView with all sub-views and four-state machine** - `559f2e1` (feat)
2. **Task 2: Human verify HRMonitorView on device** — DEFERRED (force-approved; hardware verification on physical BLE device deferred to after Plan 03 provides More tab navigation to HRMonitorView)

## Files Created/Modified

- `GooseSwift/HRMonitorView.swift` — HRMonitorView and 6 private sub-structs implementing WEAR-04 and WEAR-05

## Decisions Made

- `connectedDeviceName` is accessed via `model.ble.hrMonitorManager.connectedDeviceName` (internal Swift access within the GooseSwift module). This requires no new `@Published` property and is consistent with the plan's guidance to prefer existing sources. Falls back to `"HR Monitor"` when nil.
- `sheet(item: $selectedDevice)` auto-dismisses when `selectedDevice = nil` is set in the onConnect closure, before `connectHRMonitor` is called. This ensures the sheet is gone before the BLE call.
- `.onChange(of: ble.hrConnectionState)` clears `connectingDeviceID` when state leaves "connecting" (reaches "connected" or "disconnected"), preventing a stale spinner if connection fails.

## Deviations from Plan

None — plan executed exactly as written. `connectedDeviceName` was resolved to use `hrMonitorManager.connectedDeviceName` as the plan specified (internal access confirmed; no new `@Published` property added).

## Issues Encountered

None.

## Known Stubs

None — all four states are fully rendered. BPM shows `"--"` when `liveHeartRateBPM` is nil (by design; this is the expected copy per UI-SPEC, not a stub).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: T-10-04 mitigated | GooseSwift/HRMonitorView.swift | `device.name` rendered via SwiftUI `Text` (no markup interpretation); sanitised at ingestion (`prefix(64)` in Plan 01 `didDiscover`) |
| threat_flag: T-10-05 mitigated | GooseSwift/HRMonitorView.swift | `.onDisappear { ble.stopHRMonitorScan() }` stops scan when view is left |

## Verification Gate: Task 2 Status

**Gate type:** `checkpoint:human-verify` (blocking — BLE hardware required)

**Why deferred:** CoreBluetooth scanning cannot run in the iOS Simulator. Full hardware verification requires navigation to `HRMonitorView` via the More tab, which is wired in Plan 03 (`MoreRoute.hrMonitor`). Running Task 2 before Plan 03 would require a temporary workaround.

**User decision (2026-06-04):** Force-approve Task 2 checkpoint. Perform the full eight-step hardware verification after Plan 03 commits the More tab navigation.

**Verification checklist (pending — to be done post-Plan-03):**
1. Header shows "SCANNING"; DISCOVERED list populates with device name + RSSI
2. Tap row → sheet appears with uppercased name, RSSI, green Connect button
3. Tap Connect → sheet dismisses, inline spinner on row, header "CONNECTING" → "CONNECTED"
4. Connected panel shows live BPM (non-"--"), correct device name in header
5. Tap Disconnect → returns to scanning state
6. Bluetooth off → unavailable copy shown, no scan list

## Next Phase Readiness

- `HRMonitorView` is complete and all BLE wiring is in place
- Plan 03 must add `.hrMonitor` to `MoreRoute` and wire `HRMonitorView()` in `destination(for:)` in `MoreView`
- After Plan 03, Task 2 hardware verification can proceed on a physical iPhone with a BLE HR monitor (Polar H10 or similar)

---
*Phase: 10-hr-monitor-scan-connect-ui*
*Completed: 2026-06-04 (Task 2 force-approved / deferred to post-Plan-03 hardware verification)*

## Self-Check: PASSED

- [x] `GooseSwift/HRMonitorView.swift` exists (322 lines, ≥ 180)
- [x] 7 structs declared
- [x] `ble.startHRMonitorScan()`, `ble.stopHRMonitorScan()`, `ble.connectHRMonitor`, `ble.disconnectHRMonitor()`, `ble.discoveredHRDevices` all present (6 matches ≥ 5)
- [x] No `List {`
- [x] No `GooseRustBridge`
- [x] No `hrMonitorManager.discoveredHRDevices`
- [x] `hrConnectionState != "connected"` guard on onAppear
- [x] `"--"` for unavailable BPM
- [x] Commit `559f2e1` present in git log
