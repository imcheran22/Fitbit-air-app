---
phase: 11
name: HR Monitor Independent Capture
date: 2026-06-05
status: discussed
---

# Phase 11 Context — HR Monitor Independent Capture

## Domain

Allow HR monitor BLE frames (BPM + RR intervals via standard GATT 2A37) to be captured and stored without requiring an active WHOOP session. The capture lifecycle mirrors WHOOP's auto-start pattern but is driven exclusively by `hrConnectionState`.

## Decisions

### D-01: Path separado — `startHRMonitorCapture()` sem gate WHOOP

**Locked:** Add a new `startHRMonitorCapture()` method to `GooseAppModel` (in `GooseAppModel+HealthCapture.swift`) that does NOT require `ble.connectionState == "ready"`. It only requires `ble.hrConnectionState == "connected"`.

- The existing `startHealthPacketCapture(duration:source:)` with its WHOOP gate is UNCHANGED — no regression risk.
- `startHRMonitorCapture()` starts a new `ActiveHealthPacketCapture` with mode `.hrMonitor` (see D-03).
- A matching `stopHRMonitorCapture(reason:)` method stops it.

### D-02: Auto-start ao conectar HR monitor

**Locked:** When `hrConnectionState` transitions to `"connected"`, `GooseAppModel` auto-starts `startHRMonitorCapture()`. When `hrConnectionState` transitions to `"disconnected"`, auto-stops the capture.

- Implementation: observe `ble.$hrConnectionState` in `GooseAppModel` (same pattern as existing `scheduleAutoStartHealthPacketCaptureIfNeeded()`).
- If a WHOOP capture is already active (`.walk`, `.physiology`, etc.), HR monitor capture should still start in parallel — the two captures are independent.
- Source string: `"auto.hr_monitor_connected"`.

### D-03: Novo modo `.hrMonitor`

**Locked:** Add a new case `.hrMonitor` to the `CaptureMode` enum (or equivalent type in `HealthPacketCaptureTypes.swift`).

- Mode semantics: processes only standard GATT HR frames (2A37 BPM + RR intervals). Does NOT require K2/K20/K47 WHOOP packets.
- Guards that check `activeHealthPacketCapture?.mode == .walk` or `.physiology` must NOT apply to `.hrMonitor` sessions.
- The `healthPacketCaptureTargetSummary` for `.hrMonitor` mode: `"Capturing HR monitor — <device name>"`.

### D-04: Upload payload (no change needed)

`GooseAppModel+Upload.swift` already has `device_class: "HR_MONITOR"` support (line 36). Verify at plan time that BPM/RR frames written during `.hrMonitor` capture are included in upload payload — may need to confirm the upload filter doesn't gate on WHOOP session.

## Canonical Refs

- `GooseSwift/GooseAppModel+HealthCapture.swift` — `startHealthPacketCapture()`, `stopHealthPacketCapture()`, `ActiveHealthPacketCapture`, `CaptureMode` (or its definition source)
- `GooseSwift/GooseAppModel+HealthCapture.swift` lines 87, 238 — existing WHOOP gates to leave unchanged
- `GooseSwift/GooseBLEClient+HRMonitor.swift` — `hrConnectionState` transitions (connected/disconnected hooks)
- `GooseSwift/GooseAppModel.swift` lines 519-562 — `scheduleAutoStartHealthPacketCaptureIfNeeded()` pattern to mirror
- `GooseSwift/GooseAppModel+Upload.swift` line 36 — HR_MONITOR device_class (verify frames included)
- `GooseSwift/HealthPacketCaptureTypes.swift` — `CaptureMode` enum, `ActiveHealthPacketCapture`

## Success Criteria

1. HR monitor frames are captured and stored when no WHOOP session is active
2. HR monitor capture starts automatically when `hrConnectionState == "connected"` and stops on disconnect
3. Captured HR monitor data (BPM + RR intervals) appears in upload payload regardless of WHOOP session state
4. Existing WHOOP capture behaviour is unaffected (`.walk`, `.physiology`, `.temperature` modes unchanged)
5. If both WHOOP and HR monitor are connected, both captures run independently
