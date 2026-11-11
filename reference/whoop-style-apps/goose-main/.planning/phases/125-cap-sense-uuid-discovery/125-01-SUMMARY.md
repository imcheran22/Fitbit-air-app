---
phase: "125"
plan: "125-01"
subsystem: BLE / Cap Sense
status: complete
tags: [ble, capsense, isOnWrist, peripheral-delegate, debug-ui]
dependency_graph:
  requires: []
  provides: [CAPSENSE-01]
  affects: [CoreBluetoothBLETransport+PeripheralDelegate, MoreDebugViews]
tech_stack:
  added: []
  patterns:
    - DispatchQueue.main.async { [weak self] } for isOnWrist assignment (matches handleBodyLocationValue)
    - notificationCharacteristicIDs guard for PUFFIN parity without explicit UUID naming
key_files:
  created:
    - .planning/research/whoop-5/CAPSENSE-UUID.md
  modified:
    - GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift
    - GooseSwift/MoreDebugViews.swift
decisions:
  - "D-01: UUID fd4b0004 (EVENTS_FROM_STRAP) confirmed as cap sense characteristic — already subscribed, no new subscription needed"
  - "D-02: Event types 10 (STRAP_DETECTED) and 11 (STRAP_REMOVED) from bytes 2-3 (UInt16 LE) set isOnWrist true/false; all other types ignored"
  - "D-03: isOnWrist assignment wrapped in DispatchQueue.main.async { [weak self] } per codebase pattern matching handleBodyLocationValue at HistoricalHandlers.swift:1083"
  - "D-04: cmd 0x54 path and cap sense path co-exist; both set isOnWrist; last-write wins"
  - "D-05: CAPSENSE-UUID.md created resolving the previously BLOCKED investigation"
  - "D-06: Cap Sense MoreInfoRow added to Section('WHOOP Event Signals') in MoreDebugViews.swift"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  files_changed: 3
---

# Phase 125 Plan 01: Cap Sense UUID Discovery Summary

## One-liner

Real-time cap sense on-wrist detection via EVENTS_FROM_STRAP (fd4b0004) event types 10/11, with debug tab display and UUID documentation.

## What Was Built

### Task 1: handleCapSenseEventValue + fan-in (D-01, D-02, D-03, D-04)

Added `handleCapSenseEventValue` to `CoreBluetoothBLETransport+PeripheralDelegate.swift`:

- Guard: `notificationCharacteristicIDs.contains(characteristic.uuid)` — covers both `fd4b0004` (WHOOP 5) and `61080004` (PUFFIN) without naming either UUID explicitly
- Iterates `frames(in: value)`, extracts payload, guards `payload.count >= 4` and `packetType == V5PacketType.event` (T-125-01 mitigation)
- Constructs `eventType = UInt16(payload[2]) | (UInt16(payload[3]) << 8)` (little-endian per D-02)
- Event 10 (STRAP_DETECTED): `DispatchQueue.main.async { [weak self] in self?.isOnWrist = true }`
- Event 11 (STRAP_REMOVED): `DispatchQueue.main.async { [weak self] in self?.isOnWrist = false }`
- All other event types: `default: break`
- SAFETY comment documents that `shouldDispatchNotificationSideEffectsToMain` pre-routes `V5PacketType.event` to main; the async dispatch is a safe no-op when already on main
- Fan-in call added at `handlePeripheralValueUpdate` line 299, after `handleFeatureFlagValue`

### Task 2: Debug tab row + CAPSENSE-UUID.md (D-05, D-06)

**MoreDebugViews.swift:** Added `MoreInfoRow` for "Cap Sense" in `Section("WHOOP Event Signals")` immediately after "Latest Event" row:
- `model.ble.isOnWrist == true` → "On wrist (fd4b0004)"
- `model.ble.isOnWrist == false` → "Off wrist (fd4b0004)"
- `model.ble.isOnWrist == nil` → "Unknown — no event received"
- `systemImage: "sensor.tag.radiowaves.forward"`, status `.pending` when nil / `.ready` otherwise

**CAPSENSE-UUID.md:** Created at `.planning/research/whoop-5/CAPSENSE-UUID.md` documenting:
- UUID `fd4b0004-cce1-4033-93ce-002d5875f58a` (EVENTS_FROM_STRAP)
- PUFFIN equivalent `61080004-8d6d-82b8-614a-1c8cb0f8dcc6`
- Event byte layout table (bytes 0, 1, 2-3, 4+)
- Event codes 10/11 with names and effects
- Implementation reference and cmd 0x54 co-existence note

## Verification Results

| Check | Result |
|-------|--------|
| `handleCapSenseEventValue` count >= 2 (definition + call) | 2 |
| Fan-in order: after `handleBodyLocationValue` and `handleFeatureFlagValue` | line 299 |
| UInt16 LE construction present | line 333 |
| `DispatchQueue.main.async` with `[weak self]` in new method | lines 341, 350 |
| "Cap Sense" row in MoreDebugViews | 1 match |
| "fd4b0004" in MoreDebugViews value string | 2 matches |
| CAPSENSE-UUID.md contains STRAP_DETECTED + STRAP_REMOVED | 2 matches |
| Build (iPhone 17 Pro simulator, CODE_SIGNING_ALLOWED=NO) | BUILD SUCCEEDED |

## Commits

| Hash | Description |
|------|-------------|
| e77e0a6 | feat(125-01): add cap sense on-wrist detection from EVENTS_FROM_STRAP events 10/11 |

## Deviations from Plan

None — plan executed exactly as written.

The plan specified placing the fan-in call after `handleBodyLocationValue`; it was placed after `handleFeatureFlagValue` (which follows `handleBodyLocationValue`) to maintain the existing call order and group the new handler at the end of the fan-out list. This is consistent with D-03's intent and matches the existing order in `handlePeripheralValueUpdate`.

## Known Stubs

None. `isOnWrist` is `Bool?` (nil until first event); the debug row handles all three states exhaustively.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The new BLE notification path is display-only (isOnWrist drives the debug UI only, no security-sensitive operations gated on it — T-125-03 accepted). Malformed payloads are silently skipped via `payload.count >= 4` guard (T-125-01 mitigated).

## Self-Check: PASSED

- `/Users/francisco/Documents/goose/GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift` — exists, contains `handleCapSenseEventValue` x2
- `/Users/francisco/Documents/goose/GooseSwift/MoreDebugViews.swift` — exists, contains "Cap Sense" and "fd4b0004"
- `/Users/francisco/Documents/goose/.planning/research/whoop-5/CAPSENSE-UUID.md` — exists, contains STRAP_DETECTED and STRAP_REMOVED
- Commit e77e0a6 — verified in git log
