---
phase: 100-ble-reliability-mtu-phy-off-wrist
plan: 01
subsystem: ble
tags: [corebluetooth, mtu, ble, ios, swift]

requires: []
provides:
  - MTU logged as connect.mtu diagnostic event on every BLE connect
affects:
  - 100-ble-reliability-mtu-phy-off-wrist

tech-stack:
  added: []
  patterns:
    - "BLE diagnostic logging: maximumWriteValueLength(for: .withoutResponse) read at connect time and emitted as structured record event"

key-files:
  created: []
  modified:
    - GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift
    - GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift

key-decisions:
  - "setPreferredPHY is a macOS-only CoreBluetooth API — not available on iOS; PHY selection is handled automatically by iOS at the hardware level; no PHY call is possible or needed"
  - "MTU logging retained as the valid deliverable for BLE-01: maximumWriteValueLength(for: .withoutResponse) logged as connect.mtu before discoverServices"

patterns-established:
  - "BLE connect diagnostic: read maximumWriteValueLength immediately after connect.succeeded and before discoverServices; emit as record(source: ble, title: connect.mtu)"

requirements-completed:
  - BLE-01

duration: 15min
completed: 2026-06-21
status: complete
---

# Phase 100 Plan 01: BLE MTU Logging Summary

**MTU baseline logged as `connect.mtu` on every BLE connect; LE 2M PHY omitted — iOS CoreBluetooth does not expose `setPreferredPHY` (macOS-only API)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-21T13:30:00Z
- **Completed:** 2026-06-21T13:45:00Z
- **Tasks:** 2 (Tasks 1 & 2 merged into single atomic commit after PHY deviation)
- **Files modified:** 2

## Accomplishments

- `maximumWriteValueLength(for: .withoutResponse)` is read and logged as `connect.mtu` in `centralManager(_:didConnect:)` immediately after `connect.succeeded` and before `discoverServices`
- Confirmed that `setPreferredPHY` does not exist in iOS CoreBluetooth headers (macOS-only); documented in SUMMARY and issue #159
- Build verified clean on iPhone 17 Pro simulator; zero errors
- Issue #159 closed with explanation of what shipped and why PHY was omitted

## Task Commits

1. **Tasks 1+2: MTU log in didConnect; PHY omitted (API not available on iOS)** - `14e00d5` (feat)

## Files Created/Modified

- `GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift` — added MTU log (2 lines) in `centralManager(_:didConnect:)` before `discoverServices`
- `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift` — no net change (PHY delegate added then removed after SDK verification)

## Decisions Made

- **PHY API not available on iOS:** Verified against iOS SDK headers (`CBPeripheral.h`, `CBPeripheralDelegate.h`) — `setPreferredPHY` and `didUpdatePreferredPHY` are absent. iOS manages PHY automatically. The plan's RESEARCH.md marked these as ASSUMED; the assumption was incorrect. Removed all PHY code.
- **MTU logging retained as-is:** `maximumWriteValueLength(for: .withoutResponse)` is available and returns a valid MTU baseline at connect time (typically 20 bytes before ATT exchange). Logged as structured `connect.mtu` event.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed non-existent iOS API (`setPreferredPHY`)**
- **Found during:** Task 1 (PHY + MTU log in centralManager(_:didConnect:))
- **Issue:** Plan specified `peripheral.setPreferredPHY(tx: .le2M, rx: .le2M)` — this method does not exist in iOS CoreBluetooth. It is macOS-only. The RESEARCH.md had marked it as ASSUMED. Compiler error confirmed: "value of type 'CBPeripheral' has no member 'setPreferredPHY'".
- **Fix:** Removed `setPreferredPHY` call from CentralDelegate. Removed `didUpdatePreferredPHY` delegate stub from PeripheralDelegate. Retained MTU logging as the valid deliverable.
- **Files modified:** Both target files
- **Verification:** Build succeeded with zero errors (iPhone 17 Pro simulator)
- **Committed in:** `14e00d5`

---

**Total deviations:** 1 auto-fixed (Rule 1 — non-existent iOS API removed)
**Impact on plan:** PHY preference cannot be set from iOS apps — iOS CoreBluetooth does not expose this API. MTU logging is live and captures the pre-ATT-exchange baseline on every connect.

## Issues Encountered

- `setPreferredPHY` confirmed absent from iOS CoreBluetooth SDK after build error. Headers verified at `/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk/System/Library/Frameworks/CoreBluetooth.framework/Headers/`. The API exists only on macOS.

## Known Stubs

None.

## Threat Flags

None — MTU is a read-only OS property; no external input; no new network or auth surface introduced.

## Next Phase Readiness

- Phase 100 plan 01 complete; MTU diagnostic available in BLE session logs
- Remaining Phase 100 plans (off-wrist detection, MTU negotiation to 247) can proceed independently
- PHY is managed by iOS automatically — no further PHY work needed unless Apple adds an iOS API in a future SDK

---
*Phase: 100-ble-reliability-mtu-phy-off-wrist*
*Completed: 2026-06-21*
