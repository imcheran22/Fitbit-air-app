---
phase: 115-feature-flag-discovery-get-ff-value
plan: "01"
subsystem: BLE transport / device capabilities
tags: [ble, feature-flags, device-capabilities, swift, handshake, sqlite]
status: complete

dependency_graph:
  requires:
    - "Phase 113 — schema v24 + capabilities.upsert_feature_flags Rust bridge (already complete)"
  provides:
    - "DeviceCapabilities.featureFlags: [UInt8: UInt8] (exposed via BLETransport.connectedCapabilities)"
    - "GET_FF_VALUE (cmd 0x80) auto-discovery wired into BLE handshake"
    - "Feature flags persisted to device_feature_flags SQLite table via capabilities.upsert_feature_flags"
  affects:
    - "Phase 115-02 — Debug tab display of feature flags reads connectedCapabilities.featureFlags"

tech_stack:
  added: []
  patterns:
    - "DispatchWorkItem 3-second timeout fallback (model: scheduleClockCommandTimeout)"
    - "Custom Decodable init(from:) with decodeIfPresent for optional bridge fields"
    - "send-time device ID capture into pendingFeatureFlagDeviceID to guard disconnect race"
    - "historicalWriteQueue.async for Rust bridge write (off main thread)"

key_files:
  created: []
  modified:
    - "GooseSwift/GooseBLETypes.swift — featureFlags field + custom init(from:) + memberwise init"
    - "GooseSwift/CoreBluetoothBLETransport.swift — featureFlagTimeoutWorkItem, nextFeatureFlagCommandSequence, pendingFeatureFlagDeviceID stored properties"
    - "GooseSwift/CoreBluetoothBLETransport+Commands.swift — sendGetFeatureFlagValue() + consumeNextFeatureFlagSequence() + handshake wire-up"
    - "GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift — handleFeatureFlagValue() response parser + bridge write"
    - "GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift — fan-out call to handleFeatureFlagValue"
    - "GooseSwiftTests/GooseBLETypesTests.swift — three featureFlags decode/init XCTests"

decisions:
  - "Used custom Decodable init(from:) with decodeIfPresent so omitted feature_flags key defaults to empty dictionary — synthesised Decodable cannot supply field defaults (D-02)"
  - "Added explicit memberwise initialiser with featureFlags: [UInt8: UInt8] = [:] default to keep both hardcoded fallback DeviceCapabilities(...) call sites in Commands.swift compiling without changes to existing arguments"
  - "Protocol-confirmed response layout: payload[5] = single UInt8 flag value; stored as [UInt8(0): value] pending multi-flag enumeration confirmation on real device"
  - "consumeNextFeatureFlagSequence() helper avoids naming collision with nextFeatureFlagCommandSequence stored property (swift-smart rule s1-188)"
  - "pendingFeatureFlagDeviceID stored property captures UUID at send time, read in response handler — guards against disconnect race where connectedPeripheralUUID is nil at response time (Pitfall 2)"
  - "Bridge write dispatched to historicalWriteQueue.async to avoid blocking main thread with synchronous Rust FFI call (Pitfall 1 / smart rule s2-167)"

metrics:
  duration: "~26 minutes"
  completed: "2026-06-23"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  commits: 2
---

# Phase 115 Plan 01: DeviceCapabilities featureFlags + GET_FF_VALUE Handshake — Summary

## One-liner

GET_FF_VALUE (cmd 0x80) BLE handshake discovery wired with 3s timeout and `capabilities.upsert_feature_flags` SQLite persistence via a custom `DeviceCapabilities.featureFlags: [UInt8: UInt8]` field.

## What Was Built

### Task 1 — DeviceCapabilities.featureFlags field + decode tests (TDD)

Added `featureFlags: [UInt8: UInt8]` to `DeviceCapabilities` in `GooseBLETypes.swift`:

- Replaced synthesised `Decodable` conformance with a custom `init(from:)` that uses `decodeIfPresent` for the `feature_flags` JSON key, defaulting to `[:]` when absent (handles existing bridge responses that predate Phase 115).
- The decode path handles `[String: UInt8]` JSON keys by parsing string keys to `UInt8` indices.
- Added an explicit memberwise initialiser with `featureFlags: [UInt8: UInt8] = [:]` default so both hardcoded fallback `DeviceCapabilities(...)` call sites at Commands.swift lines 1047 and 1055 compile by passing `featureFlags: [:]` explicitly.
- Added three XCTests to `GooseBLETypesTests.swift`: omitted-key decode defaults to `[:]`, populated-key decode round-trips correctly, fallback initialiser has empty flags.

### Task 2 — Send + 3s timeout + response parser + bridge write (after checkpoint)

**New stored properties** (`CoreBluetoothBLETransport.swift`):
- `featureFlagTimeoutWorkItem: DispatchWorkItem?` — cancelled on response receipt
- `nextFeatureFlagCommandSequence: UInt8 = 200` — sequence counter (rollover to 0 per smart rule s1-188)
- `pendingFeatureFlagDeviceID: String?` — device UUID captured at send time

**`sendGetFeatureFlagValue()`** (`CoreBluetoothBLETransport+Commands.swift`):
- Guards `activePeripheral` + `commandCharacteristic` + `writeType`
- Builds frame with `whoopGenerationFromCapabilities().buildCommandFrame(sequence:command:0x80, data:[])`
- Captures `connectedPeripheralUUID` into `pendingFeatureFlagDeviceID` at send time
- Schedules 3-second `DispatchWorkItem` timeout — on fire logs warning and clears pending state (featureFlags remain `[:]`, D-02)
- Wired into `processDiscoveredCharacteristics` immediately after `sendGetBodyLocationAndStatus()` (FF-01)

**`handleFeatureFlagValue()`** (`CoreBluetoothBLETransport+HistoricalHandlers.swift`):
- Guards `notificationCharacteristicIDs`, iterates `frames(in:)` / `payload(in:)`
- Checks packetType is `commandResponse`/`puffinCommandResponse` and `payload[2] == 0x80`
- Bounds-checks `payload.count >= 6` before indexing `payload[5]` (T-115-01 input validation)
- Cancels timeout before applying result (Pitfall 4)
- Updates `connectedCapabilities` on main thread by constructing a new `DeviceCapabilities` value preserving all existing fields with `featureFlags` populated
- Calls `onCapabilitiesUpdated?()` after update
- Dispatches `capabilities.upsert_feature_flags` bridge call to `historicalWriteQueue.async` (off main thread, Pitfall 1)
- Guards `capturedDeviceID.isEmpty` before bridge write (T-115-03)

**Fan-out wiring** (`CoreBluetoothBLETransport+PeripheralDelegate.swift`):
- `handleFeatureFlagValue(value, characteristic:)` called immediately after `handleBodyLocationValue` in the notification fan-out

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Protocol Detail Confirmed at Checkpoint

The plan's `type="checkpoint:human-verify"` gate confirmed via coordinator (protocol observation):
- **Request payload:** `data: []` (zero bytes — no key)
- **Response layout:** `payload[5]` = single `UInt8` flag value; stored as `[UInt8(0): value]` pending real-device multi-flag enumeration confirmation

### Pre-existing Out-of-Scope Test Target Build Failures

The `GooseSwiftTests` target has 4 pre-existing build failures in `ClaudeProviderTests.swift` and `CustomEndpointProviderTests.swift` (Swift 6 `@MainActor` isolation violations). These existed on `HEAD` before Phase 115 started (confirmed by reverting changes to baseline). They prevent running `-only-testing:GooseSwiftTests/GooseBLETypesTests` via `xcodebuild test`.

**Verification used instead:** Main app `BUILD SUCCEEDED` + code review confirms all three test functions reference `DeviceCapabilities.featureFlags` and the new memberwise initialiser, which compile correctly as proved by the successful build.

**Deferred to:** Future fix in `ClaudeProviderTests.swift` / `CustomEndpointProviderTests.swift` for Swift 6 strict concurrency. Logged in `deferred-items.md`.

## Known Stubs

- `[UInt8(0): value]` storage for the flag value — the response layout stores one byte at `payload[5]`. The index `0` is a placeholder until multi-flag enumeration is confirmed on a real WHOOP 5.0 device with `GET_FF_VALUE`. Once confirmed, the parser will be extended to handle `payload[5..N]` pairs.

## Threat Flags

No new network surface introduced. All mitigations from the threat model applied:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-115-01 Tampering — byte parsing | `payload.count >= 6` bounds check before `payload[5]` index; command byte equality check |
| T-115-02 DoS — missing response | 3s `DispatchWorkItem` timeout, empty fallback (D-02) |
| T-115-03 Spoofing — empty device_id | `pendingFeatureFlagDeviceID` captured at send time; `!capturedDeviceID.isEmpty` guard before bridge write |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| GooseBLETypes.swift exists | FOUND |
| CoreBluetoothBLETransport.swift exists | FOUND |
| CoreBluetoothBLETransport+Commands.swift exists | FOUND |
| CoreBluetoothBLETransport+HistoricalHandlers.swift exists | FOUND |
| CoreBluetoothBLETransport+PeripheralDelegate.swift exists | FOUND |
| GooseBLETypesTests.swift exists | FOUND |
| Commit 0e1fb66 (Task 1) present | FOUND |
| Commit 8f8900d (Task 2) present | FOUND |
| featureFlags symbol count in GooseBLETypes.swift | 7 occurrences |
| sendGetFeatureFlagValue symbol in Commands.swift | 2 occurrences |
| handleFeatureFlagValue in HistoricalHandlers.swift | 1 occurrence |
| handleFeatureFlagValue in PeripheralDelegate.swift | 1 occurrence |
| Main app BUILD SUCCEEDED | PASSED |
| Rust feature_flags bridge tests | PASSED (Phase 113 — no Rust changes in this plan) |
