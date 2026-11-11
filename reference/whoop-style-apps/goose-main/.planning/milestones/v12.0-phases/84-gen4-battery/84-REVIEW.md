---
phase: 84-gen4-battery
reviewed: 2026-06-14T01:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - Rust/core/src/bridge.rs
  - Rust/core/src/protocol.rs
  - GooseSwift/GooseBLEClient.swift
  - GooseSwift/GooseBLEClient+BatteryCommands.swift
  - GooseSwift/GooseBLEClient+Commands.swift
  - GooseSwift/GooseBLEClient+PeripheralDelegate.swift
  - GooseSwift/NotificationFrameParsing.swift
  - GooseSwift/GooseAppModel+NotificationPipeline.swift
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 84: Code Review Report (re-review after fixes)

**Reviewed:** 2026-06-14T01:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This is a re-review of the same eight files after fixes were applied for CR-01, WR-01, and WR-02 from the initial review. All three targeted defects are correctly resolved. No new blockers or warnings were introduced by the patches. Two pre-existing INFO-level issues remain open.

**CR-01 (parse_cmd26_battery reads wrong bytes) — FIXED correctly.**
`parse_cmd26_battery` now reads `payload[5..7]` (battery raw u16 LE) guarded by `payload.len() < 7`. The byte layout documented in the function comment matches the actual Gen4 COMMAND_RESPONSE payload extracted by `gen4Payload()` in Swift. The sanity guard is `raw > 1000`, which correctly rejects any value that would produce a battery percentage above 100%. The existing unit test helper `cmd26_payload` places `raw` at `v[5]` and `v[6]`, so the tests now exercise the corrected byte positions.

**WR-02 (event48_battery_pct fires for all event IDs) — FIXED correctly.**
`compact_parsed_frame_summary` now gates the `event48_battery_pct` computation on `if *event_id == Some(3)` (BATTERY_LEVEL). All other Event-48 types return `None`. The pattern match is correct: `event_id` is `&Option<u16>`, so `*event_id == Some(3)` evaluates correctly.

**WR-01 (OvernightRawNotificationStorageClassifier hard-codes Gen5 header offset) — FIXED correctly.**
`classify()` now derives `headerLen` from `event.wireProtocol == .gen4 ? 4 : 8` before reading `packetType` and `packetK`. For `hrMonitor` (which returns `WireProtocol.gen5` from `GooseNotificationEvent.wireProtocol`) the value is 8, matching the 8-byte header family used by all non-Gen4 devices. The guard `headerBytes.count >= headerLen + 1` ensures the byte read is in-bounds before the subscript.

---

## Narrative Findings (AI reviewer)

### IN-01: `handleCmd26BatteryResponse` timestamps from bridge-call completion, not BLE notification arrival

**File:** `GooseSwift/GooseBLEClient+BatteryCommands.swift:67-76`
**Issue:** The `capturedAt: Date()` passed to `applyBatteryLevel` is evaluated inside the background-queue closure, after the synchronous Rust bridge call returns. The elapsed time between BLE notification arrival and bridge completion is typically a few milliseconds but can be higher under load, making the stored sample timestamp systematically late. The BLE notification arrival time is not captured before dispatch.
**Fix:** Capture `let arrivalTime = Date()` before the `DispatchQueue.global(qos: .utility).async` dispatch, then reference `arrivalTime` inside the closure instead of `Date()`.

---

### IN-02: `parse_event48_battery` accepts `raw == 1100` and returns 110%; Swift secondary guard required to prevent invalid battery display

**File:** `Rust/core/src/bridge.rs:406-411`
**Issue:** The Rust-layer guard is `raw > 1100`, so `raw = 1100` passes and `parse_event48_battery` returns `110`. The Swift pipeline guard at `GooseAppModel+NotificationPipeline.swift:666-668` (`batteryPct <= 100`) correctly blocks this from being applied, so no user-visible impact exists. However the Rust function's return type promises a battery percentage yet can return 110 without error, and the test `event48_boundary_accept_1100` explicitly asserts that 110 is a valid return value. A future caller without the Swift guard could display or store 110%.

The sister function `parse_cmd26_battery` uses `raw > 1000` (correct), making the two guards inconsistent: event48 allows up to 110% at the Rust level while cmd26 stops at 100%.
**Fix:** Tighten the guard to `raw > 1000` to match `parse_cmd26_battery` and eliminate the 110% escape hatch at the Rust layer. Update the `event48_boundary_accept_1100` test to assert the new boundary.

---

_Reviewed: 2026-06-14T01:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
