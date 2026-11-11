---
phase: 11-hr-monitor-independent-capture
plan: "02"
subsystem: health-packet-capture
tags: [ble, hr-monitor, capture-lifecycle, callback, swift]

requires:
  - phase: 11-hr-monitor-independent-capture/plan-01
    provides: [startHRMonitorCapture, stopHRMonitorCapture, HealthPacketCaptureMode.hrMonitor]
provides:
  - onHRConnectionStateChange callback on GooseBLEClient (fires on connected/disconnected transitions)
  - handleHRConnectionStateChange dispatcher routing connected→start, disconnected→stop
  - Automatic HR monitor capture lifecycle wired end-to-end
affects: [phase-12, any phase using GooseBLEClient HR state, upload verification]

tech-stack:
  added: []
  patterns: [explicit-fire-callback-pattern, guarded-state-transition-fire, mainactor-task-hop]

key-files:
  created: []
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+HRMonitor.swift
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+Lifecycle.swift

key-decisions:
  - "Used explicit-fire pattern (not didSet) for onHRConnectionStateChange to match existing onConnectionStateChange pattern exactly"
  - "Guard previous != new value at each fire site prevents duplicate callback fires on repeated transitions"
  - "connecting transition does NOT fire onHRConnectionStateChange — auto-capture only cares about connected/disconnected"
  - "D-04 requires no code change: HR_MONITOR upload branch is device/time-keyed, covered by existing bridge_hr_monitor_upload_stream_contains_bpm_and_rr test"
  - "Single-slot limitation: activeHealthPacketCapture shared by WHOOP and HR monitor — if WHOOP capture is active, HR monitor auto-start is rejected by the existing guard in startHRMonitorCapture"

patterns-established:
  - "Explicit-fire callback: capture previous value, assign new value, fire callback only if different — mirrors updateConnectionState pattern in GooseBLEClient+Commands.swift"
  - "HR observer wiring: ble.onHRConnectionStateChange = { [weak self] state in Task { @MainActor in self?.handleXxx(state) } } — identical shape to onConnectionStateChange wiring"

requirements-completed: [WEAR-06]

duration: ~12 min
completed: 2026-06-05
---

# Phase 11 Plan 02: HR Monitor Connection State Callback and Auto-Capture Wiring Summary

**`onHRConnectionStateChange` callback added to GooseBLEClient and fired from connected/disconnected transition sites in GooseBLEHRMonitorManager, wiring automatic HR monitor capture start/stop via `handleHRConnectionStateChange` in GooseAppModel+Lifecycle.swift.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-05T00:00:00Z
- **Completed:** 2026-06-05T00:12:00Z
- **Tasks:** 3 (2 code, 1 verification-only)
- **Files modified:** 4

## Accomplishments

- Declared `var onHRConnectionStateChange: ((String) -> Void)?` on `GooseBLEClient` alongside `onConnectionStateChange`
- Added explicit-fire sites in `GooseBLEHRMonitorManager` (3 sites: didConnect, didDisconnectPeripheral, didFailToConnect), each guarded by `previous != new` to prevent duplicate fires
- Wired `ble.onHRConnectionStateChange` in `GooseAppModel.init` with `Task { @MainActor in }` hop, placed adjacent to the existing `onConnectionStateChange` wiring
- Added `handleHRConnectionStateChange(_:)` to `GooseAppModel+Lifecycle.swift` routing "connected" → `startHRMonitorCapture(source: "auto.hr_monitor_connected")` and "disconnected" → `stopHRMonitorCapture(reason: "hr_monitor_disconnected")`, with log entries for T-11-06 repudiation mitigation
- Confirmed D-04 (upload coverage) requires zero code change: the `upload_get_recent_decoded_streams_bridge` already has a dedicated `HR_MONITOR` branch, device/time-keyed with no session filter, covered by `bridge_hr_monitor_upload_stream_contains_bpm_and_rr` test
- `cargo test -p goose-core` passes — 9 tests, 0 failed

## Task Commits

1. **Task 1+2: Add onHRConnectionStateChange declaration, fire sites, wiring, and handleHRConnectionStateChange** - `f4cbbbb` (feat)
2. **Task 3: Rust regression gate** - verification only, no code change

**Plan metadata:** (created below)

## Files Created/Modified

- `GooseSwift/GooseBLEClient.swift` — Added `var onHRConnectionStateChange: ((String) -> Void)?` on line 83
- `GooseSwift/GooseBLEClient+HRMonitor.swift` — Added 3 explicit-fire sites in `didConnect`, `didDisconnectPeripheral`, `didFailToConnect` inside main-thread dispatches, each guarded by `previous != new`
- `GooseSwift/GooseAppModel.swift` — Added `ble.onHRConnectionStateChange` wiring in `init`, placed after `ble.onConnectionStateChange` block
- `GooseSwift/GooseAppModel+Lifecycle.swift` — Added `handleHRConnectionStateChange(_:)` method, placed before `handleBLEConnectionStateChange`

## Decisions Made

- Used explicit-fire pattern (not `didSet`) for `onHRConnectionStateChange` to match the exact pattern established by `onConnectionStateChange` in `GooseBLEClient+Commands.swift`. This avoids double-fire concerns that a `didSet` would need to guard separately.
- "connecting" transition does NOT fire the callback — auto-capture has no action for an intermediate connecting state; only terminal states (connected/disconnected) trigger capture lifecycle changes.
- `handleHRConnectionStateChange` does NOT include a WHOOP-capture guard — HR monitor capture runs in parallel with any WHOOP capture. The `activeHealthPacketCapture == nil` guard inside `startHRMonitorCapture` (from Plan 01) is the only gate. If a WHOOP capture currently occupies the slot, the HR monitor auto-start is silently rejected by that guard. This single-slot limitation means WHOOP + HR monitor captures can run in parallel only when they do not contend for the slot simultaneously (the common case when WHOOP is already disconnected or not capturing).

## D-04 Verification (No Code Change)

- `Rust/core/src/bridge.rs` line 3194: explicit `if frame.device_type == "HR_MONITOR"` branch inside `upload_get_recent_decoded_streams_bridge`, extracting `{ts, bpm, rr_intervals}` per frame. Query uses `decoded_frames_between(since, now)` — device/time-keyed, no `session_id` filter.
- `Rust/core/tests/bridge_tests.rs` line 8967: `bridge_hr_monitor_upload_stream_contains_bpm_and_rr` test imports an HR monitor frame and asserts the upload `hr` stream contains bpm + rr — proving D-04 with no new code.
- Manual upload limitation (fires only when HR monitor is currently connected) is pre-existing and out of scope per RESEARCH Q5. The auto-upload path (`triggerUpload(for:deviceEvent:)`) fires correctly per-write-batch regardless of connection state.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no hardcoded empty values or placeholder text introduced.

## Threat Flags

No new security-relevant surface beyond the threat model. T-11-06 mitigation (repudiation) satisfied: `handleHRConnectionStateChange` records `hr_monitor.auto_start` / `hr_monitor.auto_stop` log entries. T-11-04 mitigation (DoS via double-fire) satisfied: `previous != new` guard at each fire site plus `startHRMonitorCapture` rejecting when `activeHealthPacketCapture != nil`.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 11 is complete: `.hrMonitor` capture mode (Plan 01) + auto-start/stop lifecycle wiring (Plan 02) are both in place
- HR monitor BLE frames are captured automatically on connect, stored to SQLite, and uploaded via the existing device/time-keyed auto-upload path
- No blockers for subsequent phases

## Self-Check: PASSED

- `GooseSwift/GooseBLEClient.swift` — `onHRConnectionStateChange` declared ✓
- `GooseSwift/GooseBLEClient+HRMonitor.swift` — 3 fire sites present ✓
- `GooseSwift/GooseAppModel.swift` — `ble.onHRConnectionStateChange` wiring present ✓
- `GooseSwift/GooseAppModel+Lifecycle.swift` — `handleHRConnectionStateChange` present ✓
- Commit `f4cbbbb` — found in git log ✓
- `cargo test -p goose-core` — 9 passed, 0 failed ✓

---
*Phase: 11-hr-monitor-independent-capture*
*Completed: 2026-06-05*
