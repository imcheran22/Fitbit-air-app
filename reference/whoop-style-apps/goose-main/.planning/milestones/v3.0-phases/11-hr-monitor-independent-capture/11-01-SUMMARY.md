---
phase: 11-hr-monitor-independent-capture
plan: "01"
subsystem: health-packet-capture
tags: [ble, hr-monitor, capture-mode, swift]
dependency_graph:
  requires: []
  provides: [HealthPacketCaptureMode.hrMonitor, startHRMonitorCapture, stopHRMonitorCapture]
  affects: [GooseAppModel+HealthCapture, HealthPacketCaptureTypes]
tech_stack:
  added: []
  patterns: [enum-extension, whoop-capture-pattern-mirror]
key_files:
  created: []
  modified:
    - GooseSwift/HealthPacketCaptureTypes.swift
    - GooseSwift/GooseAppModel+HealthCapture.swift
decisions:
  - "startHRMonitorCapture gates only on ble.hrConnectionState == connected, NOT ble.connectionState == ready"
  - "stopHRMonitorCapture guards on capture.mode == .hrMonitor to prevent WHOOP teardown calls"
  - "requestStreamsForActiveCapture extended with case .hrMonitor: break to maintain exhaustive switch"
  - "No duration timeout or stream command for HR monitor capture (frames arrive passively via GATT 2A37)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-05T01:48:51Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 11 Plan 01: HR Monitor Capture Mode and Methods Summary

**One-liner:** Added `.hrMonitor = "hr_monitor"` enum case with 4 computed properties and dedicated `startHRMonitorCapture(source:)` / `stopHRMonitorCapture(reason:)` methods gating only on `ble.hrConnectionState == "connected"`, decoupling HR monitor capture from the WHOOP session gate.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add .hrMonitor to HealthPacketCaptureMode | 664cda6 | GooseSwift/HealthPacketCaptureTypes.swift |
| 2 | Add startHRMonitorCapture / stopHRMonitorCapture | 664cda6 | GooseSwift/GooseAppModel+HealthCapture.swift |

## What Was Built

### Task 1 — HealthPacketCaptureMode.hrMonitor

Added `case hrMonitor = "hr_monitor"` to the `HealthPacketCaptureMode` enum in `GooseSwift/HealthPacketCaptureTypes.swift`. Implemented the case in all four exhaustive computed-property switches:

- `purpose`: `"standard_gatt_hr_monitor_capture"`
- `targetFamilies`: `["embedded_heart_rate"]`
- `initialTargetSummary`: `"frames 0 | BPM 0 | RR 0"`
- `statusPrefix`: `"Capturing HR monitor"`

Verification: `grep -c 'case hrMonitor\|case .hrMonitor'` returns 5 (1 declaration + 4 switch arms).

### Task 2 — startHRMonitorCapture / stopHRMonitorCapture

Added two methods to the `extension GooseAppModel` in `GooseSwift/GooseAppModel+HealthCapture.swift`:

**`startHRMonitorCapture(source: String = "auto.hr_monitor_connected")`:**
- Records `hr_monitor.start.requested` log entry
- Guards on `ble.hrConnectionState == "connected"` only (D-01 — no WHOOP gate)
- Guards on `activeHealthPacketCapture == nil` (prevents duplicate starts)
- Calls `rust.request("capture.start_session", ...)` with provenance `surface: "HRMonitor"`, `capture_mode: "hr_monitor"`, no `duration_seconds`
- Sets `activeHealthPacketCapture` with `mode: .hrMonitor`
- Resets all standard UI/session `@Published` state (sessionID, startedAt, frameCount, family rows, aggregator, lastRestingHeartRateFrameWriteAt, UIUpdateWorkItem)
- Sets `healthPacketCaptureStatus = "Capturing HR monitor — <device name>"` (D-03)
- Does NOT call `requestStreamsForActiveCapture`, `scheduleHistoricalSyncForPhysiologyCaptureIfNeeded`, or `scheduleHealthPacketCaptureTimeout`

**`stopHRMonitorCapture(reason: String = "hr_monitor_disconnected")`:**
- Cancels `healthPacketCaptureTimeoutWorkItem`, calls `flushCaptureFrameEnqueueUpdates()`
- Guards on `capture.mode == .hrMonitor` (Pitfall 5 — no accidental WHOOP teardown)
- Calls `rust.request("capture.finish_session", ...)` with same shape as existing finish
- Sets `activeHealthPacketCapture = nil`, clears sessionID/startedAt, updates status
- Does NOT call `ble.stopMovementHeartRateCapture()` or `ble.stopPhysiologySignalCapture()` (no stream was started)
- Does NOT call `finishAutoDetectedActivityIfActive`

**`requestStreamsForActiveCapture` extended:** Added `case .hrMonitor: break` to keep the switch exhaustive (Pitfall 4).

## Verification Results

- `grep -c 'case hrMonitor\|case .hrMonitor' GooseSwift/HealthPacketCaptureTypes.swift` → **5** ✓
- `grep -q 'func startHRMonitorCapture'` → **found** ✓
- `grep -q 'func stopHRMonitorCapture'` → **found** ✓
- `grep -q 'ble.hrConnectionState == "connected"'` → **found** ✓
- `grep -q 'case .hrMonitor:'` → **found** ✓
- `grep -n 'connectionState == "ready"'` → only pre-existing lines (87, 238, 625, 664) — no new occurrence in HR monitor methods ✓
- Existing `startHealthPacketCapture`, `stopHealthPacketCapture` bodies unchanged ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no hardcoded empty values or placeholder text introduced.

## Threat Flags

No new security-relevant surface beyond what the threat model anticipates. `startHRMonitorCapture` correctly applies the T-11-02 mitigation (`guard activeHealthPacketCapture == nil`).

## Self-Check: PASSED

- `GooseSwift/HealthPacketCaptureTypes.swift` — modified ✓
- `GooseSwift/GooseAppModel+HealthCapture.swift` — modified ✓
- Commit `664cda6` — found in git log ✓
