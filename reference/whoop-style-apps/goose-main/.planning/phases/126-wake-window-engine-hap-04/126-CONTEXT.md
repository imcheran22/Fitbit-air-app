# Phase 126: Wake-Window Engine (HAP-04) - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Gate:** SATISFIED — SetAlarmInfoCommandPacketRev4.md present

<domain>
## Phase Boundary

Swift phase. Implement `GooseWakeWindowManager` using the confirmed SET_ALARM_TIME (0x42) wire format. The existing call site `model.ble.setWhoopAlarm(at: alarmTime)` in `CoachRouteViews.swift:191` is already wired — just needs the implementation on `BLETransport`.

SC-2 BTSnoop confirmation (STRAP_DRIVEN_ALARM_EXECUTED) remains hardware-gated. Implementation proceeds without it; BTSnoop validation deferred to v16.0.

Requirements: HAP-04

</domain>

<decisions>
## Implementation Decisions

### Wire format
- **D-01:** Command 0x42 (SET_ALARM_TIME), 21 bytes little-endian:
  - Byte 0: 0x04 (REVISION_4)
  - Byte 1: snoozeCount = 0 (no snooze by default)
  - Bytes 2-5: epochSecs as Int32 LE (seconds since Unix epoch)
  - Bytes 6-7: milliseconds component as Int16 LE
  - Bytes 8-20: AlarmHapticsPattern = 12 zero bytes (default silent pattern)

### AlarmHapticsPattern
- **D-02:** Use 12 zero bytes for the haptics pattern. No reference implementation found; zeros = device default behavior. Hardware testing will confirm actual vibration behavior.

### setWhoopAlarm implementation location
- **D-03:** Add `func setWhoopAlarm(at target: Date)` to `CoreBluetoothBLETransport` (likely as an extension). It assembles the 21-byte payload and writes to CMD_TO_STRAP using the existing `writeCommand` pattern. Also add to `BLETransport` protocol.

### GooseWakeWindowManager
- **D-04:** Implement the actor with a single `func armAlarm(target: Date)` method that delegates to `BLETransport.setWhoopAlarm(at:)`. Replace the stub comment with functional code. Register the actor on GooseAppModel if needed.

### SC-3: HAP-03 regression
- **D-05:** Verify existing smart alarm UI (`CoachRouteViews.swift`) still compiles and the `setWhoopAlarm(at:)` call site works. No UI changes needed — only the BLE implementation.

### Hardware-gated
- **D-06:** BTSnoop validation of `STRAP_DRIVEN_ALARM_EXECUTED` event deferred. Document in VERIFICATION.md as hardware-gated item pending real device test.

</decisions>

<canonical_refs>
## Canonical References

- `GooseSwift/GooseWakeWindowManager.swift` — stub to implement
- `GooseSwift/CoreBluetoothBLETransport.swift` — add setWhoopAlarm; existing writeCommand pattern
- `GooseSwift/BLETransport.swift` — add protocol method
- `GooseSwift/CoachRouteViews.swift:191` — existing call site (no change needed)
- `.planning/research/whoop-re/SetAlarmInfoCommandPacketRev4.md` — wire format reference

</canonical_refs>
