---
slug: gen4-clock-ff-notify-missing
status: resolved
trigger: WHOOP 4.0 GET_CLOCK e GET_FF_VALUE timeouts — 61080002 nunca recebe setNotifyValue(true)
created: 2026-06-28
updated: 2026-06-28
---

## Symptoms

- **Expected:** GET_CLOCK resolves strap clock; GET_FF_VALUE returns feature flags; sleep/recovery metrics populate
- **Actual:** GET_CLOCK times out (sequence 99); cmd128 GET_FF_VALUE times out (3s); all command-response round-trips on 61080002 fail
- **Errors:** `GET_CLOCK timed out waiting for command response sequence 99`, `cmd128.timeout no GET_FF_VALUE response within 3s`
- **Timeline:** Always on WHOOP 4.0, firmware 50.38.1.0
- **Reproduction:** Connect any WHOOP 4.0; check Strap clock in Advanced menu → "GET_CLOCK timed out"

## Root Cause (CONFIRMED)

On WHOOP Gen4, `61080002` is a **bidirectional** command+response characteristic:
- App WRITES commands to it ✓
- WHOOP sends responses back as BLE NOTIFY on `61080002`

But `61080002` is in `commandCharacteristicIDs` only — NOT in `notificationCharacteristicIDs`.
`subscribeIfPossible` calls `notificationCandidate()` which requires UUID in `notificationCharacteristicIDs`.
Result: `setNotifyValue(true)` never called for `61080002`.
CoreBluetooth never delivers `didUpdateValue` for command responses.
All command-response round-trips (GET_CLOCK, GET_FF_VALUE, etc.) timeout.

Live HR unaffected — uses `61080003` which IS subscribed.

## Fix

In `processDiscoveredCharacteristics` (Commands.swift ~line 1000), after detecting Gen4 command characteristic:
1. Call `peripheral.setNotifyValue(true, for: characteristic)` for `61080002`
2. Add `61080002` to `notificationCharacteristicIDs` dynamically OR add a separate routing path in `handlePeripheralValueUpdate` so responses on `61080002` reach `handleClockCommandResponse` and FF handlers

Files: `CoreBluetoothBLETransport+Commands.swift`, `CoreBluetoothBLETransport+PeripheralDelegate.swift` (if routing changes needed)

## Current Focus

- hypothesis: setNotifyValue(true) never called for 61080002 on Gen4 → command responses never delivered by CoreBluetooth
- test: Confirmed via code analysis — notificationCandidate() returns false for 61080002
- expecting: Fix = subscribe 61080002 after Gen4 detection + ensure responses route through handlePeripheralValueUpdate
- next_action: Apply fix in processDiscoveredCharacteristics and verify build

## Evidence

- timestamp: 2026-06-28
  checked: commandCharacteristicIDs (Transport.swift:416-420), notificationCharacteristicIDs (Transport.swift:421-427), subscribeIfPossible (Commands.swift:946-974), notificationCandidate (Commands.swift:899-904), processDiscoveredCharacteristics (Commands.swift:993-1087)
  found: 61080002 in commandCharacteristicIDs only. notificationCandidate() returns false. setNotifyValue never called. handleClockValue guarded by notificationCharacteristicIDs.contains — also fails for 61080002.
  implication: Root cause fully confirmed. No notification subscription → no didUpdateValue → all command responses timeout.

## Eliminated

- hypothesis: Clock response filtering bug (payload[2] == 10 || 11) — GET_CLOCK commandNumber IS 11
  evidence: Filter is correct. GET_CLOCK=11, SET_CLOCK=10 match filter. Issue is upstream: response never delivered by CoreBluetooth.
  timestamp: 2026-06-28

## Resolution

root_cause: On WHOOP 4.0 the command characteristic 61080002 is bidirectional (commands written to it, command responses notified back on it) but was absent from notificationCharacteristicIDs, so setNotifyValue(true) was never called and every command-response handler's notificationCharacteristicIDs.contains guard rejected its frames — making all GET_CLOCK/GET_FF_VALUE round-trips time out.
fix: Added 61080002 to notificationCharacteristicIDs (iOS CoreBluetoothBLETransport.swift) plus an explicit subscribeIfPossible call at Gen4 command-characteristic detection, and mirrored the change on Android by adding 61080002 to GEN4_NOTIFY_CHARS (WhoopUuids.kt) with updated WhoopUuidsTest assertions; iOS build and Android unit tests pass.
files_changed: GooseSwift/CoreBluetoothBLETransport.swift, GooseSwift/CoreBluetoothBLETransport+Commands.swift, android/app/src/main/kotlin/com/goose/app/ble/WhoopUuids.kt, android/app/src/test/kotlin/com/goose/app/ble/WhoopUuidsTest.kt
