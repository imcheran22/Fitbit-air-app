---
phase: 108-battery-level-gen4-gen5
plan: "01"
subsystem: ble
tags: [battery, whoop, gen4, gen5, swift, rust, bridge, ui]

requires:
  - phase: 84-gen4-battery
    provides: parse_event48_battery, parse_cmd26_battery Rust bridge functions + applyBatteryLevel Swift method

provides:
  - Correct JSON key name for battery.parse_event48_payload bridge (event48_battery_pct)
  - Integration tests for event-48 and cmd-26 battery parsing (battery_parsing.rs)
  - Combined generation·battery chip in DeviceConnectionHeader (D-02)
  - Documented cmd-26 auto-send at Gen4 connection

affects: [109-whoop-mg-sync-fix, 110-code-health-unwraps]

tech-stack:
  added: []
  patterns:
    - "Bridge JSON key names must exactly match Swift reader keys — verified by integration tests"
    - "Combined status chip pattern: gen·battery% in DeviceConnectionHeader"

key-files:
  created:
    - Rust/core/tests/battery_parsing.rs
  modified:
    - Rust/core/src/bridge/mod.rs
    - GooseSwift/CoreBluetoothBLETransport+Commands.swift
    - GooseSwift/DeviceView.swift

key-decisions:
  - "Fixed bridge key mismatch: battery.parse_event48_payload now returns event48_battery_pct to match Swift reader at NotificationFrameParsing.swift:118"
  - "D-01 confirmed: applyBatteryLevel() is the single update path; all three sources route through it with most-recent-wins semantics"
  - "D-02 implemented: DeviceConnectionHeader shows combined Gen X · Y% label when both generation and battery are non-nil"

patterns-established:
  - "Bridge output key names must match Swift reader keys exactly — use integration tests to enforce"

requirements-completed: [BAT-01]

duration: 25min
completed: 2026-06-21
status: complete
---

# Phase 108 Plan 01: Battery Level Wiring + UI (BAT-01) Summary

**Fixed event48 bridge key mismatch, added 4 integration tests via JSON dispatch, and wired combined generation·battery chip in Home tab device header**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-21T18:05:00Z
- **Completed:** 2026-06-21T18:31:06Z
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments

- Audited all three battery call sites (event-48, cmd-26, R22) — all correctly route to `applyBatteryLevel()`
- Fixed Rust bridge key name mismatch: `parse_event48_battery_bridge` now returns `event48_battery_pct` (was `battery_pct`) matching what `NotificationFrameParsing.swift:118` reads
- Created `Rust/core/tests/battery_parsing.rs` with 4 integration tests via JSON bridge dispatch — all passing
- Added combined generation·battery chip label in `DeviceConnectionHeader` per D-02: `"Gen X · Y%"` when both are non-nil
- Documented cmd-26 auto-send at Gen4 connection in `CoreBluetoothBLETransport+Commands.swift`
- iOS BUILD SUCCEEDED, 4 Rust integration tests passing

## Task Commits

All tasks committed atomically:

1. **Tasks 1-4: All audit + fix + test + UI work** — `40c18e3` (feat(108-01))

## Files Created/Modified

- `Rust/core/src/bridge/mod.rs` — Fixed `event48_battery_pct` key name in `parse_event48_battery_bridge`; updated inline test assertion
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` — Added clarifying comment on cmd-26 auto-send at Gen4 connection
- `GooseSwift/DeviceView.swift` — Added `batteryPercent` parameter to `DeviceConnectionHeader`; combined `"Gen X · Y%"` chip label (D-02)
- `Rust/core/tests/battery_parsing.rs` — NEW: 4 integration tests via JSON bridge dispatch for event48 valid+guard, cmd26 valid+too-short

## Decisions Made

- Bridge output key for `battery.parse_event48_payload` renamed from `battery_pct` → `event48_battery_pct` to match Swift reader. The cmd26 path was already correct (`battery_pct`).
- R22 battery flows through `capture.rs` (not the direct bridge call) — correct key `r22_battery_pct` was already correct.
- DeviceConnectionHeader already receives `generation` from `bleState`; added `batteryPercent` from `ble.batteryLevelPercent` to produce combined chip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Rust bridge key name mismatch for event-48 battery**
- **Found during:** Task 1 (audit of Rust bridge output fields)
- **Issue:** `parse_event48_battery_bridge` returned `{"battery_pct": pct}` but `NotificationFrameParsing.swift:118` reads `raw["event48_battery_pct"]` — key mismatch would silently produce nil battery for any caller using the direct bridge method
- **Fix:** Changed Rust output to `{"event48_battery_pct": pct}`; updated inline test assertion to match
- **Files modified:** `Rust/core/src/bridge/mod.rs`
- **Verification:** `cargo test --locked --test battery_parsing` 4/4 pass; key confirmed correct
- **Committed in:** 40c18e3

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix)
**Impact on plan:** Fix necessary for correctness — silent nil battery for direct bridge callers. No scope creep.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Battery value clamped to 0-100 in `applyBatteryLevel()`. No high-severity threats.

## Self-Check: PASSED

- `Rust/core/tests/battery_parsing.rs` exists: FOUND
- `40c18e3` commit exists: FOUND
- 4 battery tests pass: CONFIRMED
- iOS BUILD SUCCEEDED: CONFIRMED

## Next Phase Readiness

- Battery % now correctly displayed in Home tab device chip when connected to Gen4/Gen5/MG
- R22 realtime path and event-48 path require physical WHOOP device for live verification (hardware-gated)
- Phase 109 (WHOOP MG Sync Fix) ready to proceed
