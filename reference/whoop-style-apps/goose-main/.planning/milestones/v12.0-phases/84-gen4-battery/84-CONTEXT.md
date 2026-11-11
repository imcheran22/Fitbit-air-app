# Phase 84: Gen4 Battery - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Parse the Gen4 WHOOP battery level from two wire-protocol sources — Event-48 (type 48)
notifications and Cmd 26 responses — and publish the correct percentage to the existing
`batteryLevelPercent` property in `GooseBLEClient`. Replaces the always-missing (or
stale) battery value shown for Gen4 devices today.

Out of scope: Gen5 battery changes, UI redesign, charging state inference changes, server upload of battery data.

</domain>

<decisions>
## Implementation Decisions

### Cmd 26 Auto-Trigger
- **D-01:** Cmd 26 (GET_BATTERY_LEVEL) is sent **automatically on Gen4 connection**, immediately after `connectedCapabilities` is set. This gives the user an immediate battery reading without manual action. Event-48 overrides the Cmd 26 value when it first arrives passively.

### Parsing Location
- **D-02:** All byte-level parsing (Event-48 offset 17, Cmd 26 payload[2..4]) happens in **Rust** (not Swift). Swift receives the already-computed integer percentage from the bridge and calls `applyBatteryLevel()`. This enables cargo test coverage per success criteria SC3.

### Event-48 Dispatch Point
- **D-03:** Event-48 battery extraction is gated on `connectedCapabilities?.batteryViaEvent48 == true` in the notification pipeline (same pattern as R22 battery at `GooseAppModel+NotificationPipeline.swift:662`). Gen5 devices also have `batteryViaEvent48: true` in their capabilities hardcoded in Phase 83 — the guard only fires for the battery-specific offsets, so Gen4-specific branching must also check `wireProtocol == .gen4` to avoid applying Gen4 offsets to Gen5 event payloads.

### Cmd 26 Fallback Semantics
- **D-04:** Cmd 26 is the *initial* reading (sent eagerly on connection). Event-48 is the *live* reading (arrives passively). Both call `applyBatteryLevel()` directly — no separate "fallback" state machine needed. The natural update ordering (Cmd 26 fires first, Event-48 overrides later) handles the fallback automatically.

### Guards
- **D-05:** Event-48: raw u16 from offset 17 must be ≤ 1100 (sanity guard — battery_pct_raw = raw / 10 ≤ 110%). Cmd 26: payload count ≥ 4 guard before reading bytes [2..4].

### Claude's Discretion
- Naming of new Rust bridge methods (e.g., `battery.parse_event48_payload`, `battery.parse_cmd26_response`)
- Whether parsing lives in a new `Rust/core/src/battery.rs` module or inline in existing files (`bridge.rs`, `protocol.rs`)
- Exact Rust test structure (unit vs integration; one test file or inline `#[cfg(test)]`)
- Whether auto-send of Cmd 26 happens in `processDiscoveredCharacteristics` or a separate `sendInitialBatteryRequest()` helper

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol Offsets (authoritative)
- `.planning/REQUIREMENTS.md` — BAT-01 (Event-48 offset 17 u16 LE / 10, raw ≤ 1100) and BAT-02 (Cmd 26 payload[2..4] u16 LE / 10, count ≥ 4)
- `.planning/ROADMAP.md` Phase 84 section — success criteria with exact byte specs and test requirement

### Existing Battery Infrastructure
- `GooseSwift/GooseBLEClient+Parsing.swift` — `applyBatteryLevel(_:capturedAt:sourceTitle:)`, `BatteryLevelStatus`, existing parsing patterns
- `GooseSwift/GooseBLEClient.swift` — `batteryLevelPercent: Int?` published property
- `GooseSwift/GooseBLETypes.swift` — `DeviceCapabilities` struct, `batteryViaEvent48`, `batteryViaCMD26` fields

### Gen4 Capabilities & Connection
- `GooseSwift/GooseBLEClient+Commands.swift` — `processDiscoveredCharacteristics` (where `connectedCapabilities` is set — auto-send Cmd 26 here after capabilities are confirmed)
- `Rust/core/src/capabilities.rs` — Gen4 capabilities definition confirming `battery_via_event48: true`, `battery_via_cmd26: true`

### Existing Battery Dispatch Pattern (Gen5/R22)
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` line 662 — R22 battery dispatch pattern to replicate for Gen4 Event-48

### Protocol Constants
- `Rust/core/src/protocol.rs` — `PACKET_TYPE_EVENT: u8 = 48`
- `Rust/core/src/bridge.rs` lines 3113–3136 — R22 battery parsing (r22_battery_pct) — nearest analogue for Gen4 Event-48 parsing

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `applyBatteryLevel(_ rawLevel: Int, capturedAt: Date, sourceTitle: String)` in `GooseBLEClient+Parsing.swift` — already handles main-thread dispatch, 0–100 clamping, persistence, low-battery notification, charging inference. Call this directly from both Event-48 and Cmd 26 paths.
- `PACKET_TYPE_EVENT: u8 = 48` in `protocol.rs` — use this constant, not the raw value `48`.
- `connectedCapabilities?.wireProtocol == .gen4` — guard pattern already used throughout the codebase for Gen4-specific logic.

### Established Patterns
- Bridge method dispatch: `bridge.rs` match-arm pattern with JSON args/result. New battery methods follow the same pattern as existing `r22_battery_pct` extraction.
- Notification pipeline battery dispatch: `GooseAppModel+NotificationPipeline.swift:662` — `ble.applyBatteryLevel(batteryPct, capturedAt: event.capturedAt, sourceTitle: "r22.battery")` is the exact pattern. Add an equivalent for Event-48.
- Gen4-specific command auto-send: Check `connectedCapabilities?.batteryViaCMD26 == true` before sending Cmd 26, matching the pattern of other capability-gated commands.

### Integration Points
- `processDiscoveredCharacteristics` in `GooseBLEClient+Commands.swift` — after the `DispatchQueue.main.async { self.connectedCapabilities = caps }` call, schedule the auto-send of Cmd 26 if `caps.batteryViaCMD26 == true`.
- `GooseAppModel+NotificationPipeline.swift` — add Event-48 battery extraction adjacent to the existing R22 battery extraction (line 662 area), gated on `connectedCapabilities?.batteryViaEvent48 == true && wireProtocol == .gen4`.
- Rust bridge: add two new methods (`battery.parse_event48_payload` and `battery.parse_cmd26_response`) that accept raw bytes and return the computed percentage as an integer, or an error if guards fail.

</code_context>

<specifics>
## Specific Ideas

- Source title for `applyBatteryLevel` calls: `"event48.battery"` and `"cmd26.battery"` respectively (follows existing naming convention of `"r22.battery"`, `"battery.read"`, `"battery.status.level"`).
- The `sourceTitle` string appears in OSLog events — keeping it short and descriptive aids debugging with real hardware.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 84-Gen4 Battery*
*Context gathered: 2026-06-14*
