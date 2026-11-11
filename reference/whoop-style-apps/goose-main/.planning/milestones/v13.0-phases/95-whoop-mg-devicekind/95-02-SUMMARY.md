---
phase: 95-whoop-mg-devicekind
plan: "02"
subsystem: ble-transport
tags: [whoop-mg, ble, device-detection, capabilities, swift, rust-bridge]
status: complete

dependency_graph:
  requires:
    - 95-01  # WhoopMg DeviceKind in Rust capabilities.rs
  provides:
    - MG-02  # Swift BLE advertisement parsing + device label
  affects:
    - GooseSwift/GooseBLETypes.swift
    - GooseSwift/DeviceCatalog.swift
    - GooseSwift/CoreBluetoothBLETransport+Commands.swift
    - GooseSwift/CoreBluetoothBLETransport+Parsing.swift
    - GooseSwift/BLETransport.swift
    - GooseSwift/CoreBluetoothBLETransport.swift
    - GooseSwift/GooseAppModel.swift
    - Rust/core/src/bridge/debug.rs

tech_stack:
  added: []
  patterns:
    - onCapabilitiesUpdated callback pattern (mirrors onConnectionStateChange)
    - DeviceCatalog.displayGeneration for UI-facing generation label

key_files:
  created: []
  modified:
    - GooseSwift/GooseBLETypes.swift
    - GooseSwift/DeviceCatalog.swift
    - GooseSwift/CoreBluetoothBLETransport+Commands.swift
    - GooseSwift/CoreBluetoothBLETransport+Parsing.swift
    - GooseSwift/BLETransport.swift
    - GooseSwift/CoreBluetoothBLETransport.swift
    - GooseSwift/GooseAppModel.swift
    - Rust/core/src/bridge/debug.rs

decisions:
  - "Used peripheral.name?.lowerfor MG detection per D-03 (candidate_MG_advertisement_byte_unverified)"
  - "Added onCapabilitiesUpdated callback to BLETransport protocol (mirrors onConnectionStateChange pattern) to propagate connectedDeviceGeneration = 'MG' to GooseAppModel after async GATT capabilities load"
  - "deviceKind added as plain String not enum to DeviceCapabilities to tolerate unknown future variants"
  - "displayGeneration computed property added to DeviceCatalog (separate from generationLabel which is log-only)"
  - "Rust bridge injects device_kind field into device.capabilities JSON response without modifying DeviceCapabilities struct"

metrics:
  duration: "~20 min"
  completed: "2026-06-19"
  tasks_completed: 2
  files_modified: 8
---

# Phase 95 Plan 02: Swift BLE advertisement parsing + connectedCapabilities + device label Summary

WHOOP MG devices are now identified by peripheral advertised name at GATT connection time — deviceKindString "WHOOP_MG" is sent to the Rust bridge, the bridge response includes device_kind, Swift DeviceCapabilities decodes it, and connectedDeviceGeneration is set to "MG" for the device view label.

## What Was Built

### Task 1: DeviceCapabilities.deviceKind + Rust bridge injection

- **Rust/core/src/bridge/debug.rs**: `device_capabilities_bridge` now serialises `DeviceCapabilities` to a `serde_json::Value` and inserts the `"device_kind"` key from `args.device_kind` before returning. The `DeviceCapabilities` Rust struct is unchanged — injection happens only in the bridge response.

- **GooseSwift/GooseBLETypes.swift**: `DeviceCapabilities` struct gains a seventh field `let deviceKind: String` with `CodingKey "device_kind"`. Plain `String` (not an enum) to prevent decode failures on unknown future variants. Valid values: `"WHOOP4"`, `"WHOOP5"`, `"WHOOP_MG"`, `"HR_MONITOR"`.

- **GooseSwift/DeviceCatalog.swift**: New computed property `var displayGeneration: String` — returns `"4.0"` (gen4 by wireProtocol), `"MG"` (when deviceKind == "WHOOP_MG"), `"5.0"` (gen5), or `"unknown"` (nil capabilities). Distinct from `generationLabel` which is for log messages only.

- **GooseSwift/CoreBluetoothBLETransport+Commands.swift** (fallback inits): Both `DeviceCapabilities(...)` fallback initializers in the catch block updated to include `deviceKind:` (required by new struct field). The gen5 fallback passes `deviceKind: gen` so `"WHOOP_MG"` flows correctly on bridge error.

All 153 Rust unit tests pass after the bridge change.

### Task 2: 3-way MG detection + connectedDeviceGeneration label

- **GooseSwift/CoreBluetoothBLETransport+Commands.swift**: Replaced the two-branch `detectedGeneration == .gen4 ? "WHOOP4" : "WHOOP5"` assignment with a three-branch `if/else if/else`:
  - `detectedGeneration == .gen4` → `"WHOOP4"`
  - `peripheral.name?.lowercased().contains(" mg") == true` → `"WHOOP_MG"` (candidate_MG_advertisement_byte_unverified per D-03)
  - else → `"WHOOP5"` (fallback includes Goose/Puffin fd4b0001 devices without " mg" in name)
  
  Also fires `onCapabilitiesUpdated?()` on `DispatchQueue.main.async` immediately after `self.connectedCapabilities = caps`.

- **GooseSwift/BLETransport.swift**: Added `var onCapabilitiesUpdated: (() -> Void)? { get set }` to the `BLETransport` protocol (alongside `onConnectionStateChange` and other existing callbacks).

- **GooseSwift/CoreBluetoothBLETransport.swift**: Added `var onCapabilitiesUpdated: (() -> Void)?` stored property (mirrors existing `onMessage`, `onHistoricalSyncProgress`, etc.).

- **GooseSwift/GooseAppModel.swift**: Wired `ble.onCapabilitiesUpdated` in the init callback block — sets `bleState.connectedDeviceGeneration = "MG"` when `ble.connectedCapabilities?.deviceKind == "WHOOP_MG"`.

- **GooseSwift/CoreBluetoothBLETransport+Parsing.swift**: Added explanatory comment above the `fd4b0001` branch in `generation(from:)`:
  > `// fd4b0001: MAVERICK (WHOOP MG) and GOOSE share this UUID family; cannot distinguish at scan time.`
  > `// The "MG" label is applied after GATT connection in processDiscoveredCharacteristics.`
  Return value unchanged (still `"5.0"` — scan-time label is preliminary).

## Deviations from Plan

### Auto-added: onCapabilitiesUpdated callback (Rule 2 — missing critical functionality)

- **Found during:** Task 2 implementation
- **Issue:** The plan said to set `bleState.connectedDeviceGeneration = "MG"` inside `processDiscoveredCharacteristics`, but `bleState` is owned by `GooseAppModel` — the transport has no direct reference to it. The plan said to use "existing notification/callback mechanism".
- **Fix:** Added `onCapabilitiesUpdated: (() -> Void)?` callback to `BLETransport` protocol and `CoreBluetoothBLETransport`, following the exact pattern of `onConnectionStateChange`. Wired in `GooseAppModel` init to update `bleState.connectedDeviceGeneration`. This is the correct architectural approach — no alternatives would fit without accessing `bleState` across the wrong boundary.
- **Files modified:** `BLETransport.swift`, `CoreBluetoothBLETransport.swift`, `GooseAppModel.swift`
- **Commits:** `bbedb0b`

### Auto-applied: cargo fmt on debug.rs (Rule 3 — formatting)

- **Found during:** Post-commit check
- **Fix:** Ran `cargo fmt -- src/bridge/debug.rs` to keep CI clean. Committed separately as `style(95-02)`.
- **Commit:** `187f552`

## Known Stubs

None — all data flows are wired end-to-end. `connectedDeviceGeneration = "MG"` reaches `BLEState` and `DeviceView` already reads `bleState.connectedDeviceGeneration` for display. No stub values in any modified file.

## Threat Flags

No new threat surface beyond what was documented in the plan's threat model (T-95-02 peripheral name spoofing — accepted disposition).

## Self-Check

### Files exist
- `/Users/francisco/Documents/goose/GooseSwift/GooseBLETypes.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/DeviceCatalog.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/CoreBluetoothBLETransport+Commands.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/CoreBluetoothBLETransport+Parsing.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/BLETransport.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/CoreBluetoothBLETransport.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/GooseAppModel.swift` — FOUND
- `/Users/francisco/Documents/goose/Rust/core/src/bridge/debug.rs` — FOUND

### Commits exist
- `b53ac96` feat(95-02): add deviceKind field to DeviceCapabilities + bridge injection — FOUND
- `bbedb0b` feat(95-02): 3-way MG detection + onCapabilitiesUpdated callback — FOUND
- `187f552` style(95-02): cargo fmt debug.rs — FOUND

## Self-Check: PASSED
