---
phase: 10-hr-monitor-scan-connect-ui
plan: "01"
subsystem: ui
tags: [swift, swiftui, ble, corebluetooth, observable, published, hr-monitor]

# Dependency graph
requires: []
provides:
  - "@Published var discoveredHRDevices: [GooseDiscoveredDevice] on GooseBLEClient"
  - "@Published var hrConnectionState: String on GooseBLEClient"
  - "func disconnectHRMonitor() on GooseBLEClient extension"
  - "centralManager(_:didFailToConnect:error:) delegate on GooseBLEHRMonitorManager"
  - "HRMonitorStateTests — four unit tests for state property promotion"
affects:
  - 10-hr-monitor-scan-connect-ui plan 02 (HRMonitorView observes these @Published properties)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DispatchQueue.main.async mirror from BLE callback queue to @Published owner property"
    - "didFailToConnect delegate prevents stuck 'connecting' UI state (ASVS V7)"
    - "disconnectHRMonitor() teardown pattern: stopScan + hrStopReconnect + cancelPeripheralConnection + state reset"

key-files:
  created:
    - GooseSwiftTests/HRMonitorStateTests.swift
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+HRMonitor.swift

key-decisions:
  - "Mirror discoveredHRDevices and hrConnectionState exclusively on main queue to resolve HIGH-severity BT-queue/main-thread data race from STATE.md"
  - "disconnectHRMonitor() sets pendingHRPeripheral = nil before hrStopReconnect to prevent reconnect cycle firing after intentional disconnect"
  - "didFailToConnect resets hrConnectionState to disconnected so UI is never stuck on connecting"

patterns-established:
  - "BLE @Published mirror pattern: always use DispatchQueue.main.async { [weak self] in self?.owner?.property = value } for BT-queue mutations"
  - "Connection lifecycle: disconnected -> connecting (in connect()) -> connected (in didConnect) -> disconnected (in didDisconnect/didFailToConnect)"

requirements-completed: [WEAR-04, WEAR-05]

# Metrics
duration: 2min
completed: 2026-06-04
---

# Phase 10 Plan 01: HR Monitor BLE State Promotion Summary

**@Published discoveredHRDevices and hrConnectionState promoted to GooseBLEClient with full connecting/connected/disconnected/failed lifecycle and clean disconnectHRMonitor() teardown**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-04T22:43:44Z
- **Completed:** 2026-06-04T22:45:32Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `HRMonitorStateTests.swift` with four state-property unit tests as Wave 0 scaffold
- Added `@Published var discoveredHRDevices: [GooseDiscoveredDevice] = []` and `@Published var hrConnectionState: String = "disconnected"` to `GooseBLEClient`, making BLE HR state observable by SwiftUI
- Replaced `objectWillChange.send()` in `didDiscover` with main-queue mirror to `owner?.discoveredHRDevices`, resolving the HIGH-severity BT-queue/main-thread data race from STATE.md (threat T-10-02)
- Added `"connecting"` intermediate state in `connect(_:)` with main-queue owner mirror
- Added main-queue mirrors for `"connected"` and `"disconnected"` in `didConnect` and `didDisconnectPeripheral`
- Added `centralManager(_:didFailToConnect:error:)` delegate that resets state to `"disconnected"` (addresses T-10-03, ASVS V7)
- Added `disconnectHRMonitor()` performing clean teardown: stopScan + hrStopReconnect + cancelPeripheralConnection + state reset + record event

## Task Commits

1. **Task 1: Create HRMonitorStateTests scaffold (Wave 0)** - `c983503` (test)
2. **Task 2: Promote discoveredHRDevices and hrConnectionState to @Published** - `ac698cc` (feat)
3. **Task 3: Add connecting state, state mirroring, disconnect action, and failure handler** - `81a9657` (feat)

## Files Created/Modified

- `GooseSwiftTests/HRMonitorStateTests.swift` - Four unit tests: default empty discoveredHRDevices, default disconnected hrConnectionState, settable assignment propagation, and connection state transitions
- `GooseSwift/GooseBLEClient.swift` - Added two @Published properties after hrReconnectState
- `GooseSwift/GooseBLEClient+HRMonitor.swift` - connecting state in connect(), main-queue mirrors in didConnect/didDisconnect, new didFailToConnect delegate, new disconnectHRMonitor() extension

## Decisions Made

- Mirror `discoveredHRDevices` exclusively on main queue (replaces bare `objectWillChange.send()`) to resolve the HIGH-severity data race documented in STATE.md
- Place `disconnectHRMonitor()` in the `GooseBLEClient` extension block alongside existing `startHRMonitorScan`, `stopHRMonitorScan`, `connectHRMonitor` — consistent with established extension pattern
- `pendingHRPeripheral = nil` set before `hrStopReconnect()` so a scheduled reconnect workItem guard (`pendingHRPeripheral != nil`) naturally prevents reconnect after intentional disconnect

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - no stub patterns introduced. The test file references properties that are now fully wired.

## Threat Flags

No new security surface beyond what is described in the plan's threat model. All three mitigations from the STRIDE register were implemented:
- T-10-01: `prefix(64)` sanitisation preserved unchanged
- T-10-02: `owner?.discoveredHRDevices` mutated exclusively on main queue
- T-10-03: `didFailToConnect` resets state to `"disconnected"`

## Next Phase Readiness

- `GooseBLEClient` now exposes `discoveredHRDevices` and `hrConnectionState` as `@Published` — `HRMonitorView` (Plan 02) can observe them directly via `@ObservedObject var ble: GooseBLEClient`
- `HRMonitorStateTests` scaffold compiles and will exercise the promoted API
- `disconnectHRMonitor()` is ready for Plan 02 to wire up to the disconnect button

---
*Phase: 10-hr-monitor-scan-connect-ui*
*Completed: 2026-06-04*

## Self-Check: PASSED

- [x] `GooseSwiftTests/HRMonitorStateTests.swift` exists
- [x] `GooseSwift/GooseBLEClient.swift` has 2 new @Published properties
- [x] `GooseSwift/GooseBLEClient+HRMonitor.swift` has discoveredHRDevices mirror, connecting state, didFailToConnect, disconnectHRMonitor
- [x] Commits c983503, ac698cc, 81a9657 all present in git log
