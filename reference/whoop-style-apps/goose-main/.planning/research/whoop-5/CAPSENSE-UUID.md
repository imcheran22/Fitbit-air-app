# WHOOP 5 Cap Sense UUID — Resolved

**Date:** 2026-06-28
**Status:** RESOLVED (supersedes CAPSENSE-INVESTIGATION.md which was BLOCKED)

## UUID

| Field | Value |
|-------|-------|
| Characteristic | EVENTS_FROM_STRAP |
| UUID (WHOOP 5) | `fd4b0004-cce1-4033-93ce-002d5875f58a` |
| UUID (PUFFIN) | `61080004-8d6d-82b8-614a-1c8cb0f8dcc6` |

Cap sense is NOT a separate GATT characteristic. It arrives as a specific event type
within the existing EVENTS_FROM_STRAP characteristic. No new subscription is needed.

## Subscription

`fd4b0004` is already included in `notificationCharacteristicIDs` in
`CoreBluetoothBLETransport.swift`. The PUFFIN equivalent `61080004` is also present.
Both are covered by the `notificationCharacteristicIDs.contains(characteristic.uuid)`
guard in `handleCapSenseEventValue` — no UUID-specific branching required.

## Event Byte Layout

| Byte(s) | Field | Description |
|---------|-------|-------------|
| 0 | Packet type | `V5PacketType.event` |
| 1 | Flags/header | Reserved |
| 2–3 | Event type | UInt16 little-endian |
| 4+ | Event body | Varies by event type |

## Event Type Codes

| Code (decimal) | Code (hex) | Name | Effect |
|---------------|------------|------|--------|
| 10 | 0x000A | STRAP_DETECTED | Device is on-wrist; sets `isOnWrist = true` |
| 11 | 0x000B | STRAP_REMOVED | Device is off-wrist; sets `isOnWrist = false` |
| Other | — | (various) | Ignored by `handleCapSenseEventValue`; no `isOnWrist` update |

## Implementation Reference

Handler: `handleCapSenseEventValue` in
`GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift`

Fan-in call site: `handlePeripheralValueUpdate`, after `handleFeatureFlagValue`.

`isOnWrist` assignments are wrapped in `DispatchQueue.main.async { [weak self] in ... }`
per the codebase pattern established in `handleBodyLocationValue`
(`CoreBluetoothBLETransport+HistoricalHandlers.swift:1083`).

## Co-existence Note

cmd 0x54 (`GET_BODY_LOCATION_AND_STATUS`) also sets `isOnWrist` at reconnect via
`handleBodyLocationValue` in `CoreBluetoothBLETransport+HistoricalHandlers.swift:1056`.
Both paths are active simultaneously:

- **cmd 0x54 path:** polled at reconnect; sets `isOnWrist` from body location response
- **Cap sense path (this file):** real-time; sets `isOnWrist` from EVENTS_FROM_STRAP
  event types 10/11 as they arrive

Both paths write to the same `isOnWrist: Bool?` optional property. Last-write wins.
No conflict — the two paths are complementary (reconnect baseline + real-time updates).
