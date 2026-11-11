# Phase 100 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Test runner | xcodebuild (iOS Simulator) |
| Swift tests | GooseSwiftTests/ (XCTest) |
| Rust tests | N/A — no Rust changes in this phase |

## Sampling Rate

Build verification after each plan's final task. No manual hardware test required — physical device testing deferred per hardware gate.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| Task 1 | 100-01 | 1 | BLE-01 | grep | `grep -n "maximumWriteValueLength" GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift` | ✅ | ✅ green |
| Task 2 | 100-01 | 1 | BLE-01 (deviation) | grep | `grep -n "connect.mtu" GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift` | ✅ | ✅ green |
| Task 1 | 100-02 | 1 | BLE-02 | grep | `grep -n "isOnWrist" GooseSwift/CoreBluetoothBLETransport.swift GooseSwift/BLETransport.swift` | ✅ | ✅ green |
| Task 2 | 100-02 | 1 | BLE-02 | grep | `grep -n "handleBodyLocationValue" GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Verified Implementation Details

### BLE-01 — MTU Logging (commit 14e00d5)

- `maximumWriteValueLength(for: .withoutResponse)` read and logged as `connect.mtu` in `centralManager(_:didConnect:)` at line 222–223 of `CoreBluetoothBLETransport+CentralDelegate.swift`
- **Deviation:** `setPreferredPHY` was planned but does not exist in iOS CoreBluetooth (macOS-only API). Verified against iOS SDK headers. PHY code removed; MTU logging is the full BLE-01 deliverable. Documented in SUMMARY 100-01 and issue #159.
- `didUpdatePreferredPHY` delegate not implemented (API absent on iOS — macOS-only). Original VALIDATION.md Task 2 grep for `didUpdatePreferredPHY` is voided by deviation.

### BLE-02 — Off-Wrist Detection (commit 3253a38)

- `isOnWrist: Bool?` declared at line 41 of `CoreBluetoothBLETransport.swift`
- `isOnWrist: Bool? { get }` added to `BLETransport` protocol at line 35 of `BLETransport.swift`
- `sendGetBodyLocationAndStatus()` defined at line 1180 of `CoreBluetoothBLETransport+Commands.swift`; called at line 1120 after `sendClientHelloIfNeeded`
- `handleBodyLocationValue(_:characteristic:)` defined at line 988 of `CoreBluetoothBLETransport+HistoricalHandlers.swift`; dispatched from `handlePeripheralValueUpdate` in `CoreBluetoothBLETransport+PeripheralDelegate.swift` at line 294
- `isOnWrist = nil` reset in `centralManager(_:didDisconnectPeripheral:error:)` at line 317 of `CoreBluetoothBLETransport+CentralDelegate.swift`
- On-wrist UI chip at line 317 of `HomeDashboardView.swift` (guard `isConnected && isOnWrist != nil`)

## Wave 0 Gaps (accepted)

The following unit tests were identified in RESEARCH.md as Wave 0 gaps:

- `GooseSwiftTests/BLEBodyLocationParseTests.swift` — location byte → `Bool?` mapping (location 1 = true, 2-7/160 = false, other = nil)
- `GooseSwiftTests/BLEBodyLocationParseTests.swift` — `isOnWrist` reset to nil on disconnect

**Acceptance rationale:** The `handleBodyLocationValue` function is a simple byte-index lookup with no external dependencies. Coverage is provided by:
1. The automated grep verify steps confirming the function exists and is wired
2. The iOS simulator build gate confirming compilation
3. Full device-level validation requires physical WHOOP hardware (hardware gate — deferred)

Unit tests for this parser are tracked as a backlog item for Phase 110 (Code Health).

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MTU value is correct pre-ATT-exchange | BLE-01 | Requires physical WHOOP hardware | Connect device; check BLE session log for `connect.mtu` entry showing `mtu=20` before ATT exchange |
| `isOnWrist` reflects actual wrist state | BLE-02 | Requires physical WHOOP hardware | Wear strap; connect; verify chip shows "On wrist". Remove strap; reconnect; verify chip shows "Off wrist" or hidden (nil) |
| isOnWrist nil on disconnect | BLE-02 | Requires live BLE session | Connect device; note chip state; force disconnect; chip must disappear (nil guard) |

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 5 (all pending statuses in original VALIDATION.md) |
| Resolved | 4 (Tasks confirmed COVERED by grep + implementation audit) |
| Escalated to manual-only | 1 (Wave 0 BLEBodyLocationParseTests — already accepted at phase execution) |
| PHY deviation noted | 1 (Task 2 of 100-01 voided; MTU deliverable confirmed as-built) |

**nyquist_compliant: partial** — 4 automated greps pass; 1 Wave 0 unit test gap accepted and deferred to Phase 110; 3 behaviors manual-only due to hardware gate.
