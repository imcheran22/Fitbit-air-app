---
phase: 92-export-auth-bug-fixes
plan: "03"
subsystem: ble-auth
tags: [bug-fix, ble, auth, swiftui, alert]
dependency_graph:
  requires: []
  provides: [authRetryCount, authExhausted, auth-recovery-alert]
  affects: [CoreBluetoothBLETransport, ConnectionView, BLETransport]
tech_stack:
  added: []
  patterns: [SwiftUI .alert with Binding(get:set:) for existential protocol types]
key_files:
  created: []
  modified:
    - GooseSwift/CoreBluetoothBLETransport.swift
    - GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift
    - GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift
    - GooseSwift/BLETransport.swift
    - GooseSwift/ConnectionView.swift
decisions:
  - "Used Binding(get:set:) for authExhausted in ConnectionView because ble: any BLETransport is a protocol existential — @Bindable does not apply to existentials"
  - "authExhausted added to BLETransport protocol with { get set } to enable mutation from view"
  - "authRetryCount reset to 0 at exhaustion point so subsequent sessions start fresh"
  - "return after authExhausted = true in asyncAfter PATH A prevents further log spam; the asyncAfter block completes without triggering additional side effects"
metrics:
  duration: "6m"
  completed: "2026-06-19T10:08:26Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
status: complete
requirements:
  - BUG-AUTH-01
---

# Phase 92 Plan 03: Fix WHOOP 5.0 Auth Stuck State Recovery Summary

**One-liner:** Auth exhaustion counter (authRetryCount) and recovery alert (authExhausted) after 12 insufficientAuthentication retry cycles with Reconnect WHOOP / Cancel actions.

## What Was Built

Added two new observable state variables to `CoreBluetoothBLETransport`:
- `authRetryCount: Int = 0` — counts how many retry cycles have exhausted
- `authExhausted: Bool = false` — triggers the SwiftUI recovery alert when true

Wired the counter at both retry-exhausted paths in `peripheral(_:didWriteValueFor:error:)`:
- **PATH A** (asyncAfter callback): increments `authRetryCount`, sets `authExhausted = true` and returns when count reaches 12
- **PATH B** (second failure block): same logic, using `self.` prefix for the asyncAfter closure

Added resets:
- On successful write (`else` branch): `authRetryCount = 0`, `authExhausted = false`
- On disconnect (`centralManager(_:didDisconnectPeripheral:error:)`): `authRetryCount = 0`, `authExhausted = false`

Added `authExhausted: Bool { get set }` to the `BLETransport` protocol so `ConnectionView` (which uses `var ble: any BLETransport`) can bind to it.

Added `.alert("Authentication Failed", ...)` to `ConnectionContentView` with:
- **Reconnect WHOOP** (destructive): calls `ble.forgetRememberedDevice()` then resets `authExhausted = false`
- **Cancel**: resets `authExhausted = false` without forgetting the device

## Verification Results

All 9 plan verification checks passed:

1. `authRetryCount` declared in `CoreBluetoothBLETransport.swift` — PASS
2. `authExhausted` declared in `CoreBluetoothBLETransport.swift` — PASS
3. `authRetryCount += 1` at 2 exhausted paths in PeripheralDelegate — PASS (lines 348, 367)
4. `authRetryCount >= 12` threshold at 2 paths in PeripheralDelegate — PASS (lines 349, 368)
5. `authExhausted = false` reset on successful write in PeripheralDelegate — PASS (line 391)
6. `authRetryCount = 0` reset on disconnect in CentralDelegate — PASS (line 279)
7. `authExhausted = false` reset on disconnect in CentralDelegate — PASS (line 280)
8. `authExhausted` appears ≥2 times in ConnectionView — PASS (lines 155, 156, 160, 163)
9. `Reconnect WHOOP` appears in ConnectionView — PASS (line 158)

## Commits

| Hash | Description |
|------|-------------|
| 502db87 | feat(92-03): add authRetryCount + authExhausted state; wire exhaustion counter |
| c7f6df0 | feat(92-03): add auth exhaustion recovery alert to ConnectionView |

## Deviations from Plan

**1. [Rule 2 - Missing Critical Functionality] Added authExhausted to BLETransport protocol**
- **Found during:** Task 2
- **Issue:** `ConnectionView` uses `var ble: any BLETransport` (protocol existential). The plan's RESEARCH.md Pitfall 1 anticipated this — authExhausted must be declared in the protocol for the binding to compile.
- **Fix:** Added `var authExhausted: Bool { get set }` to `BLETransport.swift`.
- **Files modified:** `GooseSwift/BLETransport.swift`
- **Commit:** c7f6df0

No other deviations — plan executed as specified.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-92-03-01 | authRetryCount >= 12 threshold halts loop; authExhausted = true prevents further triggers |
| T-92-03-02 | Accepted — explicit user action on destructive-role button |
| T-92-03-03 | Accepted — 12-cycle threshold makes false positives negligible |

## Self-Check: PASSED

All source files confirmed present. Both task commits (502db87, c7f6df0) confirmed in git log.
