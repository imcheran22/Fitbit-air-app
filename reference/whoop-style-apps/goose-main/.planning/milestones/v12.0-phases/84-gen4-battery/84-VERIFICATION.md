---
phase: 84-gen4-battery
verified: 2026-06-14T17:30:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Connect a Gen4 WHOOP device and observe the battery percentage in the UI (DeviceView / HomeDashboardView)"
    expected: "A real battery percentage (e.g. 73%) is shown, not 0%, 100%, or 'N/A'. The value updates when a subsequent Event-48 arrives."
    why_human: "Requires physical Gen4 WHOOP hardware. Automated checks confirm the parsing and dispatch code is wired, but end-to-end correctness depends on the actual BLE payload layout matching the protocol assumptions (payload offset 17 for Event-48, payload[5..7] for Cmd 26 response)."
  - test: "After Gen4 connection, verify Cmd 26 response arrives and battery value is published"
    expected: "OSLog shows 'cmd26.battery.sent' within 0.1s of capabilities being set, followed by a battery level update. The battery UI shows the Cmd 26 value before the first Event-48 arrives."
    why_human: "Requires physical Gen4 hardware and OSLog monitoring. The auto-send timing and response routing cannot be exercised in a simulator."
---

# Phase 84: Gen4 Battery Verification Report

**Phase Goal:** The app displays the real battery percentage for Gen4 WHOOP devices from the wire protocol instead of a hardcoded or unavailable value.
**Verified:** 2026-06-14T17:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Event-48 payload (type 48) is parsed: offset 17 u16 LE / 10 with raw <= 1100 guard; result published to battery UI for Gen4 devices | VERIFIED | `parse_event48_battery` at bridge.rs:402 reads `read_u16_le(payload, 17)`, guard `raw > 1100`, returns `raw / 10`. Swift pipeline dispatches via `applyBatteryLevel` gated on `batteryViaEvent48 == true && wireProtocol == .gen4` at NotificationPipeline.swift:666-670. |
| 2 | Cmd 26 response is parsed: payload[5..7] u16 LE / 10 with count >= 7 guard; used as initial battery reading on Gen4 connection | VERIFIED | `parse_cmd26_battery` at bridge.rs:441 guards `payload.len() < 7`, reads `payload[5]\|payload[6]<<8`, sanity guard `raw > 1000`. Called via `handleCmd26BatteryResponse` in GooseBLEClient+BatteryCommands.swift on background queue. Auto-sent in `processDiscoveredCharacteristics` gated on `batteryViaCMD26 && wireProtocol == .gen4`. |
| 3 | `cargo test --locked` includes at least one test for each parsing path (valid payload, boundary guard, short payload rejection) | VERIFIED | `mod battery_parse_tests` in bridge.rs:11030 contains 7 tests: `event48_valid_85`, `event48_boundary_accept_1100`, `event48_rejects_over_1100`, `event48_rejects_too_short`, `cmd26_valid_85`, `cmd26_rejects_short`, `event48_bridge_round_trip`. All 7 pass (confirmed by running `cargo test --locked battery_parse_tests`). |
| 4 | Event-48 dispatch is gated: fires only when batteryViaEvent48 == true AND wireProtocol == .gen4 | VERIFIED | GooseAppModel+NotificationPipeline.swift:666-670: `batteryViaEvent48 == true` AND `wireProtocol == .gen4` both required. Gen5 devices share `batteryViaEvent48 == true` but fail the wireProtocol guard. |
| 5 | Cmd 26 auto-send fires only for Gen4 devices (batteryViaCMD26 && wireProtocol == .gen4), never Gen5 | VERIFIED | GooseBLEClient+Commands.swift:1015: `if caps.batteryViaCMD26, caps.wireProtocol == .gen4` gate present. Gen5 also has `batteryViaCMD26 = true` per capabilities.rs; the `.gen4` guard prevents misfiring. |
| 6 | Cmd 26 response is routed through handleBatteryValue in the peripheral delegate side-channel | VERIFIED | GooseBLEClient+PeripheralDelegate.swift:292: `handleBatteryValue(value, characteristic: characteristic)` present in the side-channel dispatch block alongside `handleClockValue`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Rust/core/src/protocol.rs` | `pub(crate) fn read_u16_le` visible to bridge.rs | VERIFIED | Line 1100: `pub(crate) fn read_u16_le` — visibility confirmed |
| `Rust/core/src/bridge.rs` | `parse_event48_battery`, `parse_cmd26_battery`, bridge methods, BRIDGE_METHODS entries, event48_battery_pct, battery_parse_tests | VERIFIED | All present: BRIDGE_METHODS at lines 200-201; dispatch arms at 2914-2919; compact summary field at 3265-3281; tests at 11030-11126 |
| `GooseSwift/NotificationFrameParsing.swift` | `event48BatteryPct: Int?` on both structs, init reads `event48_battery_pct` key | VERIFIED | Line 88: compact summary field; line 118: init read `raw["event48_battery_pct"]`; line 140: interpretation field. grep -c returns 3. |
| `GooseSwift/GooseAppModel+NotificationPipeline.swift` | Event-48 dispatch branch gated on batteryViaEvent48 + wireProtocol gen4 | VERIFIED | Lines 666-670: if block with both guards; line 570: `applyBatteryLevel(batteryPct, capturedAt: event.capturedAt, sourceTitle: "event48.battery")` |
| `GooseSwift/GooseBLEClient.swift` | `BatteryCommandKind` enum with `case getBatteryLevel`, commandNumber 26 | VERIFIED | Line 545: `enum BatteryCommandKind { case getBatteryLevel }` with commandNumber 26 |
| `GooseSwift/GooseBLEClient+BatteryCommands.swift` | sendCmd26BatteryRequest, handleBatteryValue router, handleCmd26BatteryResponse, Rust bridge call off-main, cmd26.battery sourceTitle | VERIFIED | All present: sendCmd26BatteryRequest:7, connectionState guard:8, payload.count >= 4 guard:57 (D-05 for Swift), DispatchQueue.global:67, bridge call "battery.parse_cmd26_response":71, sourceTitle "cmd26.battery":75 |
| `GooseSwift/GooseBLEClient+Commands.swift` | Auto-send trigger gated on batteryViaCMD26 && wireProtocol == .gen4 | VERIFIED | Line 1015: `if caps.batteryViaCMD26, caps.wireProtocol == .gen4 { ... sendCmd26BatteryRequest() }` |
| `GooseSwift/GooseBLEClient+PeripheralDelegate.swift` | `handleBatteryValue` in side-channel dispatch | VERIFIED | Line 292: `handleBatteryValue(value, characteristic: characteristic)` |
| `GooseSwift.xcodeproj/project.pbxproj` | BatteryCommands.swift registered in Xcode build | VERIFIED | `grep -c 'GooseBLEClient+BatteryCommands'` returns 4 (PBXBuildFile, PBXFileReference, PBXGroup, PBXSourcesBuildPhase) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `compact_parsed_frame_summary` Event branch | `parse_event48_battery_from_data` | decodes data_hex, calls helper, emits `event48_battery_pct` JSON key — gated on `event_id == Some(3)` | WIRED | bridge.rs:3265: `if *event_id == Some(3) { ... parse_event48_battery_from_data(&data) }` |
| `NotificationFrameCompactSummary.event48BatteryPct` | `NotificationFrameInterpretation.event48BatteryPct` | `event48BatteryPct: compact?.event48BatteryPct` at construction | WIRED | NotificationPipeline.swift:567 |
| `handleParsedNotificationFrame` | `ble.applyBatteryLevel` | `interpretation.event48BatteryPct` gated on `batteryViaEvent48 && wireProtocol == .gen4` | WIRED | NotificationPipeline.swift:666-670 |
| `processDiscoveredCharacteristics` | `sendCmd26BatteryRequest` | gated on `batteryViaCMD26 && wireProtocol == .gen4`, 0.1s delay | WIRED | GooseBLEClient+Commands.swift:1015-1017 |
| `handleCmd26BatteryResponse` | `historicalDirectWriteBridge.request("battery.parse_cmd26_response")` | dispatched on DispatchQueue.global(qos: .utility) | WIRED | GooseBLEClient+BatteryCommands.swift:67-73 |
| `handleCmd26BatteryResponse` → bridge result | `applyBatteryLevel` | sourceTitle "cmd26.battery" | WIRED | GooseBLEClient+BatteryCommands.swift:74-75 |
| peripheral delegate side-channel | `handleBatteryValue` | placed after `handleClockValue` in the dispatch block | WIRED | GooseBLEClient+PeripheralDelegate.swift:292 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Event-48 battery path | `event48BatteryPct` in `NotificationFrameInterpretation` | Rust `compact_parsed_frame_summary` parsing BLE notification bytes at payload offset 17 | Yes — bytes from BLE device, u16 LE read, / 10 | FLOWING |
| Cmd 26 battery path | `battery_pct` from bridge | Rust `parse_cmd26_battery` parsing COMMAND_RESPONSE payload bytes at [5..7] | Yes — bytes from BLE COMMAND_RESPONSE frame | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| battery_parse_tests module exists and all 7 tests pass | `cargo test --locked battery_parse_tests` (run from Rust/core) | 7 passed; 0 failed; 0 ignored | PASS |
| Bridge method strings registered in BRIDGE_METHODS | `grep -c 'battery.parse_event48_payload' bridge.rs` | 2 (BRIDGE_METHODS entry + dispatch arm) | PASS |
| Bridge method strings registered in BRIDGE_METHODS | `grep -c 'battery.parse_cmd26_response' bridge.rs` | 2 (BRIDGE_METHODS entry + dispatch arm) | PASS |
| event48BatteryPct fields in NotificationFrameParsing | `grep -c 'event48BatteryPct' NotificationFrameParsing.swift` | 3 (compact field, init read, interpretation field) | PASS |
| Gen4 gate present in Event-48 dispatch | `grep -c 'wireProtocol == .gen4' GooseAppModel+NotificationPipeline.swift` | present at dispatch site | PASS |
| BatteryCommands file registered in Xcode project | `grep -c 'GooseBLEClient+BatteryCommands' project.pbxproj` | 4 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BAT-01 | 84-01, 84-02 | Gen4 real battery % via Event-48 (type 48) payload — offset 17 u16 LE / 10; guard raw <= 1100; displayed in UI | SATISFIED | Rust: `parse_event48_battery` at offset 17, guard > 1100. Swift: event48BatteryPct dispatches to applyBatteryLevel gated on batteryViaEvent48 + wireProtocol gen4. |
| BAT-02 | 84-01, 84-03 | Gen4 GET_BATTERY_LEVEL (cmd 26) response parsing — payload[5..7] u16 LE / 10; guard count >= 7; initial reading on Gen4 connection | SATISFIED (with spec deviation — see note) | Rust: `parse_cmd26_battery` reads [5..7], guard >= 7 (corrected from plan's [2..4] / >= 4 by REVIEW-FIX CR-01 reflecting actual COMMAND_RESPONSE frame layout). Auto-sent on Gen4 connection gated on batteryViaCMD26 + wireProtocol gen4. |

**BAT-02 spec deviation note:** ROADMAP.md and REQUIREMENTS.md specify `payload[2..4]` and `count >= 4` for Cmd 26 parsing. The code review (REVIEW-FIX.md CR-01) identified that the actual Gen4 COMMAND_RESPONSE frame places the battery raw value at bytes [5..7] (after a 5-byte header: packetType, length, commandNumber, originSeq, resultCode), not [2..4]. The implementation was corrected to `payload[5..7]` with `count >= 7`. This is a requirements/spec inaccuracy that was caught and fixed during review. The implementation now reflects the actual wire format. REQUIREMENTS.md and ROADMAP.md still show the original (incorrect) byte offsets; they should be updated, but this does not block the phase goal which is about displaying the correct battery percentage.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `Rust/core/src/bridge.rs` | 11009 | Unused import `DeviceCapabilities` in battery_parse_tests | Info (compiler warning) | No functional impact; test-only code; pre-existing warning category |

No TODO/FIXME/TBD/XXX markers found in any modified file. No stubs or placeholder returns found in the battery code paths. The two INFO-level findings from REVIEW.md (IN-01: timestamp captured after bridge call; IN-02: Event-48 Rust guard allows 110% while cmd26 guard stops at 100%) are left open by the reviewer as non-blocking — the Swift `batteryPct <= 100` guard at NotificationPipeline.swift:667 prevents any > 100% value from reaching the UI.

### Human Verification Required

#### 1. Gen4 Battery Percentage in UI

**Test:** Connect a physical Gen4 WHOOP device (WHOOP 4.0) and navigate to the battery display in DeviceView or HomeDashboardView.
**Expected:** A real battery percentage (e.g. 73%) is displayed, not 0%, 100% hardcoded, or an unavailable/missing state. The value should update when subsequent Event-48 notifications arrive passively.
**Why human:** Requires physical Gen4 WHOOP hardware. The parsing and dispatch code is wired (verified), but the correctness of offset 17 for Event-48 battery in real device payloads cannot be exercised in a simulator.

#### 2. Cmd 26 Auto-Send and Initial Battery Reading

**Test:** After Gen4 pairing and connection, capture OSLog output and confirm Cmd 26 is sent and responded to.
**Expected:** OSLog shows `cmd26.battery.sent` within ~0.1s of connection being ready. The battery UI populates with a value before the first Event-48 notification arrives. The `cmd26.battery` sourceTitle appears in the log.
**Why human:** Requires physical hardware. The timing of `processDiscoveredCharacteristics`, the 0.1s `asyncAfter`, and the BLE response routing cannot be end-to-end tested in simulation.

---

### Gaps Summary

No blocking gaps. All automated checks pass. The Cmd 26 byte-offset deviation (REQUIREMENTS say [2..4], code uses [5..7]) reflects a corrected implementation based on the actual wire format — it is not a bug. The REQUIREMENTS.md and ROADMAP.md contain the original (incorrect) spec; they should be updated as a follow-up documentation task but do not affect phase goal achievement.

Two open INFO-level items from the code review are noted but non-blocking:
- IN-01: `capturedAt` timestamp in Cmd 26 path is evaluated post-bridge rather than at BLE notification arrival (systematic ~ms latency in timestamps).
- IN-02: Event-48 Rust guard allows raw=1100 → 110% return value (Swift dispatch blocks it with `batteryPct <= 100` guard; cmd26 guard is tighter at raw > 1000).

---

_Verified: 2026-06-14T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
