# Phase 108 Research: Battery Level Gen4+Gen5

**Date:** 2026-06-21
**Requirement:** BAT-01
**Status:** RESEARCH COMPLETE

---

## Executive Summary

Much more is already wired than the context assumed. All three call sites
(event-48, cmd-26, R22) already call `applyBatteryLevel()`. The battery
`BatteryRail` UI already exists in `DeviceView`, which is already embedded
in `HomeDashboardView`. The actual remaining work is narrow:

1. `BLEState` has no `batteryPercent` field — the Home tab DeviceView reads
   `ble.batteryLevelPercent` directly from the transport object (not from
   `bleState`), which is correct. No BLEState change is needed.
2. The `DeviceView` chip on Home tab already shows battery via `BatteryRail`
   when `ble.batteryLevelPercent` is non-nil. This is wired.
3. The only remaining gap is: **does `ble.batteryLevelPercent` stay non-nil
   after the initial value is set?** The property lives on
   `CoreBluetoothBLETransport`, is reset to `nil` on disconnect (line 507),
   and is set by `applyBatteryLevel()`. Everything else is in place.

**Revised scope:** Phase 108 is primarily a **verification + test** phase.
The call sites are wired. The UI is wired. The main deliverable is confirming
(via codebase audit + build verification) that the chain works end-to-end
and writing the required tests if any are missing.

---

## What Is Already Implemented

### Call sites (all three wired in GooseAppModel+NotificationPipeline.swift)

| Source | Location | Guard | Status |
|--------|----------|-------|--------|
| Event-48 | line 666–670 | `batteryViaEvent48 == true` | WIRED |
| R22 realtime | line 663–664 | `batteryPct <= 100` | WIRED |
| Cmd-26 response | `GooseBLEClient+BatteryCommands.swift:75` | result code + payload length | WIRED |

### Rust bridge (already registered)
- `battery.parse_event48_payload` — registered in `BRIDGE_METHODS`
- `battery.parse_cmd26_response` — registered in `BRIDGE_METHODS`
- R22 battery is parsed in Swift directly (byte 1 = direct u8 0-100); no Rust bridge call needed

### Swift transport layer
- `CoreBluetoothBLETransport+Parsing.swift:21` — `var batteryLevelPercent: Int?`
- `CoreBluetoothBLETransport+Parsing.swift:26` — `applyBatteryLevel(_:capturedAt:sourceTitle:)` with most-recent-wins semantics
- `CoreBluetoothBLETransport+Parsing.swift:507` — reset to `nil` on disconnect

### UI
- `DeviceView.swift:35` — reads `bleState.connectedDeviceGeneration`
- `DeviceView.swift:48` — reads `batteryPercent: ble.batteryLevelPercent`
- `DeviceView.swift:192` — `BatteryRail(percent: batteryPercent, isCharging: isCharging)`
- `HomeDashboardView.swift:106` — `DeviceView()` is present on Home tab

### Capability flags (DeviceCapabilities)
- `GooseBLETypes.swift:319` — `batteryViaEvent48: Bool`
- `GooseBLETypes.swift:318` — `batteryViaR22: Bool`
- `GooseBLETypes.swift:321` — `r22Realtime: Bool`
- Gen4: `batteryViaEvent48: true`, `batteryViaR22: false`
- Gen5: `batteryViaEvent48: true`, `batteryViaR22: true`, `r22Realtime: true`

---

## What Still Needs Verification / May Be Missing

### 1. DeviceView generation + battery chip display logic
`DeviceView` shows `BatteryRail` when `batteryPercent != nil`. The chip at the
top of HomeDashboard passes `ble.batteryLevelPercent` directly from the
transport — this is correct. However, the "WHOOP 5.0 · 78%" pattern from D-02
is NOT currently rendered — the generation label and battery are in separate
sub-views inside DeviceView. The planner should confirm whether D-02's combined
chip label needs to be added or whether DeviceView's existing layout satisfies
BAT-01's "Battery level displayed in device status UI" success criterion.

### 2. NotificationFrameParsing — r22BatteryPct extraction
`NotificationFrameParsing.swift:87` declares `r22BatteryPct: Int?`.
`NotificationFrameParsing.swift:117` reads it from `raw["r22_battery_pct"]`.
This field must be populated by the Rust bridge call that parses the R22 frame.
Verify that `parse_r22_payload` in Rust actually emits `r22_battery_pct` in its
JSON output; if not, byte 1 must be extracted in Swift before the bridge call.

### 3. Cmd-26 auto-send on connection for Gen4
`sendCmd26BatteryRequest()` exists in `GooseBLEClient+BatteryCommands.swift`.
Confirm it is called automatically at connection time for Gen4 devices (not
only on explicit user action). This ensures battery is populated even when no
Event-48 has been received yet in the session.

### 4. Missing Rust integration tests for parse_event48_battery and parse_cmd26_battery
The BAT-01 success criteria in the v14.0 ROADMAP requires cargo test coverage.
Verify `Rust/core/tests/` has tests for `parse_event48_battery` and
`parse_cmd26_battery` (they were in Phase 84's scope). If tests are missing,
they must be added as part of Phase 108.

---

## Key File Paths for Executor

| File | Purpose |
|------|---------|
| `GooseSwift/CoreBluetoothBLETransport+Parsing.swift` | `applyBatteryLevel()`, `batteryLevelPercent`, reset |
| `GooseSwift/GooseAppModel+NotificationPipeline.swift` | All three call sites (lines 663–670) |
| `GooseSwift/GooseBLEClient+BatteryCommands.swift` | Cmd-26 send + response handler |
| `GooseSwift/NotificationFrameParsing.swift` | `r22BatteryPct`, `event48BatteryPct` extraction |
| `GooseSwift/DeviceView.swift` | Battery UI: `BatteryRail`, `batteryPercent` prop |
| `GooseSwift/HomeDashboardView.swift` | Embeds `DeviceView()` at line 106 |
| `GooseSwift/GooseBLETypes.swift` | Capability flags |
| `GooseSwift/BLEState.swift` | Does NOT have `batteryPercent` — no change needed |
| `Rust/core/src/bridge/mod.rs` | `battery.parse_event48_payload`, `battery.parse_cmd26_response` |
| `Rust/core/tests/` | Integration tests for battery parsing |

---

## Validation Architecture

### Simulator-testable
- Build succeeds with `xcodebuild build -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO`
- `DeviceView` renders `BatteryRail` when battery is non-nil (UI snapshot test if desired)

### Cargo tests
- `cargo test --locked -- battery` passes
- At least one test per parsing path (event48, cmd26)

### Real-device dependent (gated)
- Event-48 battery updates every ~8 min — cannot verify in simulator
- R22 realtime battery stream — requires physical WHOOP 5.0 connection

---

## Implementation Recommendation for Planner

**Single plan is sufficient.** The work is:

1. **Audit + verify** the existing wiring is complete (call sites, Rust output fields)
2. **Fix any gap found** during audit (likely: `r22_battery_pct` Rust output or cmd-26 auto-send)
3. **Add Rust tests** if `parse_event48_battery` / `parse_cmd26_battery` tests are missing
4. **Confirm UI** — DeviceView on HomeDashboard already shows battery; if D-02's combined
   "WHOOP 5.0 · 78%" label is required as a distinct chip, add it
5. **Build verification** — `xcodebuild` BUILD SUCCEEDED

## RESEARCH COMPLETE
