---
plan: 100-02
phase: 100-ble-reliability-mtu-phy-off-wrist
status: complete
requirement: BLE-02
commit: 3253a38
---

# Plan 100-02 Summary — Off-Wrist Detection (BLE-02)

## What was delivered

- `var isOnWrist: Bool?` added to `CoreBluetoothBLETransport` (nil=unknown, true=on-wrist, false=off-wrist)
- `isOnWrist: Bool?` added to `BLETransport` protocol
- `sendGetBodyLocationAndStatus()` added to `CoreBluetoothBLETransport+Commands.swift`; called from connect init sequence after `sendClientHelloIfNeeded`
- `handleBodyLocationValue(_:characteristic:)` added to `CoreBluetoothBLETransport+HistoricalHandlers.swift`; dispatched from `handlePeripheralValueUpdate`; parses payload[6] (location byte): 1→true, {2,3,4,5,7,160}→false, other→nil; guard payload.count >= 9
- `isOnWrist = nil` reset in `centralManager(_:didDisconnectPeripheral:error:)` in `CoreBluetoothBLETransport+CentralDelegate.swift`
- On-wrist chip added to `HomeDeviceStatusCard` in `HomeDashboardView.swift` — visible only when `isConnected && isOnWrist != nil`

## Files modified

- `GooseSwift/CoreBluetoothBLETransport.swift`
- `GooseSwift/BLETransport.swift`
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift`
- `GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift`
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift`
- `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift`
- `GooseSwift/HomeDashboardView.swift`

## Verification

- BUILD SUCCEEDED (iOS Simulator)
- Issue #161: CLOSED
- 9 references to `isOnWrist` across 4 files
- `handleBodyLocationValue` wired in `handlePeripheralValueUpdate`

## Deviations

None — all CONTEXT.md decisions D-01 through D-05 delivered as specified.
