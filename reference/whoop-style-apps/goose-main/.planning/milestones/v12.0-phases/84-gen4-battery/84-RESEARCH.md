# Phase 84: Gen4 Battery - Research

**Researched:** 2026-06-14
**Domain:** BLE protocol parsing — Gen4 WHOOP battery from Event-48 and Cmd 26
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Cmd 26 (GET_BATTERY_LEVEL) is sent automatically on Gen4 connection, immediately after `connectedCapabilities` is set. This gives the user an immediate battery reading without manual action. Event-48 overrides the Cmd 26 value when it first arrives passively.
- **D-02:** All byte-level parsing (Event-48 offset 17, Cmd 26 payload[2..4]) happens in Rust (not Swift). Swift receives the already-computed integer percentage from the bridge and calls `applyBatteryLevel()`. This enables cargo test coverage per success criteria SC3.
- **D-03:** Event-48 battery extraction is gated on `connectedCapabilities?.batteryViaEvent48 == true` in the notification pipeline (same pattern as R22 battery at `GooseAppModel+NotificationPipeline.swift:662`). Gen5 devices also have `batteryViaEvent48: true` in their capabilities hardcoded in Phase 83 — the guard only fires for the battery-specific offsets, so Gen4-specific branching must also check `wireProtocol == .gen4` to avoid applying Gen4 offsets to Gen5 event payloads.
- **D-04:** Cmd 26 is the *initial* reading (sent eagerly on connection). Event-48 is the *live* reading (arrives passively). Both call `applyBatteryLevel()` directly — no separate "fallback" state machine needed.
- **D-05:** Guards: Event-48: raw u16 from offset 17 must be ≤ 1100. Cmd 26: payload count ≥ 4 guard before reading bytes [2..4].

### Claude's Discretion
- Naming of new Rust bridge methods (e.g., `battery.parse_event48_payload`, `battery.parse_cmd26_response`)
- Whether parsing lives in a new `Rust/core/src/battery.rs` module or inline in existing files (`bridge.rs`, `protocol.rs`)
- Exact Rust test structure (unit vs integration; one test file or inline `#[cfg(test)]`)
- Whether auto-send of Cmd 26 happens in `processDiscoveredCharacteristics` or a separate `sendInitialBatteryRequest()` helper

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BAT-01 | Gen4 real battery % via Event-48 (type 48) payload — offset 17 u16 LE / 10; guard raw ≤ 1100; displayed in UI replacing the always-100% value | Rust bridge method `battery.parse_event48_payload`; Swift pipeline addition at NotificationPipeline.swift; `applyBatteryLevel()` already handles UI |
| BAT-02 | Gen4 GET_BATTERY_LEVEL (cmd 26) response parsing — payload[2..4] u16 LE / 10; guard count ≥ 4; used as fallback when Event-48 not yet received | Rust bridge method `battery.parse_cmd26_response`; auto-send in `processDiscoveredCharacteristics`; response handler mirrors clock/alarm pattern |
</phase_requirements>

## Summary

Phase 84 adds Gen4 battery reading from two wire sources. The existing battery infrastructure in Swift (`applyBatteryLevel`) is complete and needs no modification — it already handles main-thread dispatch, clamping, persistence, and low-battery notifications. The work is entirely in (a) adding two Rust parsing functions, (b) wiring a Cmd 26 auto-send on Gen4 connection, (c) adding a Cmd 26 response handler in Swift, and (d) adding an Event-48 battery extraction branch in the notification pipeline.

The codebase has four established patterns that exactly cover every new touch point: the R22 battery dispatch (`GooseAppModel+NotificationPipeline.swift:661-663`), the clock command send/response cycle (`GooseBLEClient+Commands.swift` + `GooseBLEClient+HistoricalHandlers.swift:225-287`), the `device_capabilities_bridge` pattern in `bridge.rs`, and the `read_u16_le` helper in `protocol.rs`. All new code follows these patterns verbatim.

No external packages are needed. No schema changes. No new Swift types. The Rust test requirement (SC3: at least one test per parsing path) is satisfied by `#[cfg(test)]` unit tests in the new Rust module or inline in `bridge.rs`.

**Primary recommendation:** Add `battery.parse_event48_payload` and `battery.parse_cmd26_response` bridge methods backed by private Rust functions; wire Cmd 26 auto-send after `connectedCapabilities` is set; handle the response with `handleCmd26BatteryResponse`; add Event-48 extraction in `interpretNotificationFrame`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event-48 byte parsing (offset 17 u16 LE / 10, guard) | Rust core | — | D-02: all parsing in Rust for testability |
| Cmd 26 response byte parsing ([2..4] u16 LE / 10, guard) | Rust core | — | D-02: all parsing in Rust for testability |
| Cmd 26 auto-send on Gen4 connection | Swift BLE layer | — | D-01: triggered after `connectedCapabilities` set in `processDiscoveredCharacteristics` |
| Cmd 26 response routing (frame → handler) | Swift BLE layer | — | Mirrors clock/alarm response routing pattern |
| Event-48 battery dispatch in notification pipeline | Swift app model | — | D-03: gated on `batteryViaEvent48 && wireProtocol == .gen4` |
| Battery percentage publishing to UI | Swift BLE layer (existing) | — | `applyBatteryLevel()` already handles this; zero changes needed |

## Standard Stack

### Core (no new packages — all in-repo)

| Component | Location | Purpose |
|-----------|----------|---------|
| `GooseBLEClient+Parsing.swift` | `GooseSwift/` | `applyBatteryLevel(_:capturedAt:sourceTitle:)` — existing entry point for both new paths |
| `GooseAppModel+NotificationPipeline.swift` | `GooseSwift/` | `interpretNotificationFrame` — add Event-48 battery extraction here |
| `GooseBLEClient+Commands.swift` | `GooseSwift/` | `processDiscoveredCharacteristics` — add Cmd 26 auto-send here |
| `GooseBLEClient+HistoricalHandlers.swift` | `GooseSwift/` | Model for Cmd 26 response handler (`handleClockCommandResponse` pattern) |
| `Rust/core/src/bridge.rs` | `Rust/core/src/` | Dispatch table — register new battery methods |
| `Rust/core/src/protocol.rs` | `Rust/core/src/` | `read_u16_le` helper — use in new parsing functions |
| `Rust/core/src/capabilities.rs` | `Rust/core/src/` | Confirms `battery_via_event48: true`, `battery_via_cmd26: true` for Gen4 |

**Installation:** No new packages. Zero `npm install` / `cargo add` required.

## Package Legitimacy Audit

No external packages installed in this phase. Section not applicable.

## Architecture Patterns

### System Architecture Diagram

```
Gen4 WHOOP BLE notification stream
         |
         v
GooseBLEClient (CoreBluetooth)
         |
    +----|--------------------+
    |                         |
    | packet_type == 48       | command_response for cmd 26
    | (Event)                 | (from Cmd 26 auto-send on connection)
    v                         v
GooseAppModel                GooseBLEClient
+NotificationPipeline        handleCmd26BatteryResponse(_:)
interpretNotificationFrame    |
 - gate: batteryViaEvent48    |
   && wireProtocol == .gen4   |
 - bridge call:               |  bridge call:
   battery.parse_event48_     |    battery.parse_cmd26_response
   payload(payload_hex)       |    (payload_hex)
         |                    |
         v                    v
   Rust: parse_event48_  Rust: parse_cmd26_response
   payload()             (payload)
   offset 17 u16 LE / 10  [2..4] u16 LE / 10
   guard: raw <= 1100     guard: count >= 4
         |                    |
         v                    v
   returns battery_pct   returns battery_pct
         |                    |
         +--------+-----------+
                  |
                  v
   GooseBLEClient.applyBatteryLevel(
     batteryPct,
     capturedAt: event.capturedAt,
     sourceTitle: "event48.battery" | "cmd26.battery"
   )
                  |
                  v
   batteryLevelPercent (published to SwiftUI)
```

### Recommended Project Structure

No new files strictly required. The discretion call is whether to create `Rust/core/src/battery.rs`. Given bridge.rs already has 509 arms and Phase 86 will split it, adding two small private functions inline in bridge.rs (with `#[cfg(test)]` tests) is the lower-risk option for this phase.

```
Rust/core/src/
├── bridge.rs           # Add: battery.parse_event48_payload, battery.parse_cmd26_response dispatch arms
                        #      + private parse_event48_battery() and parse_cmd26_battery() functions
                        #      + #[cfg(test)] mod battery_parse_tests { ... }
GooseSwift/
├── GooseBLEClient+Commands.swift    # Add: auto-send Cmd 26 after connectedCapabilities set
├── GooseBLEClient+HistoricalHandlers.swift  # Add: handleCmd26BatteryResponse(_:)
│   OR a new GooseBLEClient+BatteryCommands.swift extension (Claude's discretion)
├── GooseAppModel+NotificationPipeline.swift # Add: Event-48 battery extraction branch
```

### Pattern 1: Rust Bridge Method (matches device_capabilities_bridge)

**What:** A `#[derive(Debug, Deserialize)]` args struct, a plain function, and a dispatch arm.
**When to use:** All new bridge-callable functionality.

```rust
// Source: [VERIFIED: Rust/core/src/bridge.rs:370-378]
#[derive(Debug, Deserialize)]
struct ParseEvent48BatteryArgs {
    payload_hex: String,
}

fn parse_event48_battery(args: ParseEvent48BatteryArgs) -> GooseResult<serde_json::Value> {
    let payload = hex::decode(&args.payload_hex)
        .map_err(|e| GooseError::message(format!("invalid hex: {e}")))?;
    // offset 17: read_u16_le returns Option<u16>
    let raw = read_u16_le(&payload, 17)
        .ok_or_else(|| GooseError::message("event48 payload too short for battery offset 17".to_string()))?;
    if raw > 1100 {
        return Err(GooseError::message(format!("event48 battery raw={raw} exceeds sanity guard 1100")));
    }
    let battery_pct = raw / 10;
    Ok(json!({ "battery_pct": battery_pct }))
}

// In the dispatch match:
"battery.parse_event48_payload" => request_args::<ParseEvent48BatteryArgs>(&request)
    .and_then(parse_event48_battery),
```

### Pattern 2: Cmd 26 Response Parsing (mirrors read_u16_le at [2..4])

**What:** `parse_cmd26_response` — payload[2..4] is u16 LE but relative to the raw WHOOP command response payload, so payload[2] = low byte, payload[3] = high byte of the raw value.

```rust
// Source: [VERIFIED: Rust/core/src/protocol.rs:1100-1108]
// read_u16_le(bytes, offset) reads bytes[offset] | bytes[offset+1] << 8
#[derive(Debug, Deserialize)]
struct ParseCmd26ResponseArgs {
    payload_hex: String,
}

fn parse_cmd26_battery(args: ParseCmd26ResponseArgs) -> GooseResult<serde_json::Value> {
    let payload = hex::decode(&args.payload_hex)
        .map_err(|e| GooseError::message(format!("invalid hex: {e}")))?;
    if payload.len() < 4 {
        return Err(GooseError::message(format!(
            "cmd26 payload too short: {} < 4", payload.len()
        )));
    }
    let raw = u16::from(payload[2]) | u16::from(payload[3]) << 8;
    let battery_pct = raw / 10;
    Ok(json!({ "battery_pct": battery_pct }))
}
```

### Pattern 3: Event-48 Battery Extraction in Notification Pipeline

**What:** Add a new field `event48BatteryPct: Int?` to `NotificationFrameCompactSummary` / `NotificationFrameInterpretation`, OR reuse a bridge call inline using the raw event payload hex from `dataHex`.

**Recommended approach** (matches existing r22BatteryPct pattern — compact summary field populated by Rust):

The compact summary already carries `eventID` and `dataHex`. The cleanest approach is to **not** add a new compact field, but instead make the bridge return `battery_pct` as part of the existing `parse_frame` compact summary JSON when `packet_type == 48 && battery_via_event48`. However, that would require modifying `parse_frame_compact` — a larger change.

The **simpler approach** (matches how `handleWhoopEvent` works): extract Event-48 battery in Swift within `handleParsedNotificationFrame`, after the frame is identified as a type-48 event, by calling a bridge method with the event data hex. This avoids modifying the compact summary struct.

```swift
// Source: [VERIFIED: GooseAppModel+NotificationPipeline.swift:661-663]
// Pattern to replicate for Event-48:
if let batteryPct = interpretation.r22BatteryPct, batteryPct <= 100 {
  ble.applyBatteryLevel(batteryPct, capturedAt: event.capturedAt, sourceTitle: "r22.battery")
}

// NEW: Event-48 battery (Gen4 only)
// Approach A — compact summary field (matches r22BatteryPct pattern exactly):
if let batteryPct = interpretation.event48BatteryPct,
   connectedCapabilities?.batteryViaEvent48 == true,
   connectedCapabilities?.wireProtocol == .gen4 {
  ble.applyBatteryLevel(batteryPct, capturedAt: event.capturedAt, sourceTitle: "event48.battery")
}
```

Adding `event48BatteryPct` to `NotificationFrameCompactSummary` requires: (1) a new field in Rust compact JSON output (bridge.rs), (2) a new property in `NotificationFrameCompactSummary`, (3) a new property in `NotificationFrameInterpretation`, (4) wiring in `interpretNotificationFrame`. This is 4 small changes but all are mechanical.

Alternatively, the bridge can populate `event48BatteryPct` inside the existing `parse_frame_compact_summary_v2` output, gated on `packet_type == 48`.

**Recommendation:** Use the compact-summary approach (Approach A) — it mirrors r22BatteryPct exactly and keeps all parsing in Rust (D-02 compliance). The planner should allocate a task for adding the field to the Rust compact summary output and the Swift structs.

### Pattern 4: Cmd 26 Auto-Send (mirrors Gen4-specific command gating)

**What:** After `connectedCapabilities` is set in `processDiscoveredCharacteristics`, schedule a send of Cmd 26 if `caps.batteryViaCMD26 == true`.

```swift
// Source: [VERIFIED: GooseSwift/GooseBLEClient+Commands.swift:1005-1015]
// After:
DispatchQueue.main.async { self.connectedCapabilities = caps }
// ADD:
if caps.batteryViaCMD26 {
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
    self?.sendCmd26BatteryRequest()
  }
}
```

The small delay (0.1 s) lets the connection reach `ready` state before the command write. Clock command uses `connectionState == "ready"` guard — the battery command should do the same.

### Pattern 5: Cmd 26 Response Handler (mirrors handleClockCommandResponse)

**What:** A `handleCmd26BatteryResponse(_ payload: [UInt8])` function that:
1. Guards `payload.count >= 4`
2. Calls `bridge.request(method: "battery.parse_cmd26_response", args: ["payload_hex": payloadHex])`
3. Extracts `battery_pct` from result
4. Calls `applyBatteryLevel(batteryPct, capturedAt: Date(), sourceTitle: "cmd26.battery")`

```swift
// Source: [VERIFIED: GooseSwift/GooseBLEClient+HistoricalHandlers.swift:225-287]
// handleClockCommandResponse pattern — no pending command tracking needed for battery
// (fire-and-forget; no timeout required since it's not user-initiated with a UI state)
func handleCmd26BatteryResponse(_ payload: [UInt8]) {
  guard payload.count >= 4 else {
    record(level: .warn, source: "ble.battery", title: "cmd26.response.too_short",
           body: "count=\(payload.count)")
    return
  }
  guard payload[4] == 1 else { // result_code: 1 = SUCCESS
    record(level: .warn, source: "ble.battery", title: "cmd26.response.failed",
           body: Data(payload).hexString)
    return
  }
  let payloadHex = Data(payload).hexString
  DispatchQueue.global(qos: .utility).async { [weak self] in
    guard let self else { return }
    do {
      let result = try self.bridge.request(
        method: "battery.parse_cmd26_response",
        args: ["payload_hex": payloadHex])
      if let pct = result["battery_pct"] as? Int {
        self.applyBatteryLevel(pct, capturedAt: Date(), sourceTitle: "cmd26.battery")
      }
    } catch {
      self.record(level: .warn, source: "ble.battery", title: "cmd26.parse.failed",
                  body: error.localizedDescription)
    }
  }
}
```

Note: `GooseBLEClient` currently holds `self.bridge` only through the `GooseRustBridge` pattern. Verify the exact bridge instance name on `GooseBLEClient` — it may need a dedicated instance (consistent with the multiple-instance pattern documented in CLAUDE.md).

### Pattern 6: Routing Cmd 26 Responses to the Handler

The Cmd 26 response arrives on the notification characteristic. The peripheral delegate calls `handlePeripheralValueUpdate`. For non-historical, non-alarm, non-clock responses, the frame is dispatched to the notification pipeline. We need to intercept command_response frames with `payload[2] == 26` before or during the notification dispatch.

**Best location:** Mirror the `handleClockValue` pattern — add to `handlePeripheralValueUpdate` a check for the Cmd 26 command number in command_response frames before the notification pipeline dispatch.

Actually, the cleaner approach is to handle it inside the **main handler path** of `handleParsedNotificationFrame` since the notification pipeline already parses command_response payloads into `NotificationFrameCompactSummary` with `payloadKind == "command_response"` and `packetK` (which maps to `response_to_command`). But the compact summary does not currently expose `response_to_command`.

**Simplest safe approach:** Add a `handleCmd26InNotificationValue` path triggered from the same point as alarm/clock — in `handlePeripheralValueUpdate` before the pipeline enqueue, checking for `commandResponse` packet with `payload[2] == 26`.

### Anti-Patterns to Avoid

- **Parsing bytes in Swift:** D-02 is locked — all `u16 LE / 10` math is in Rust.
- **Calling `GooseRustBridge` on `@MainActor`:** The Rust bridge is synchronous and blocks. Always dispatch to a background queue first. The existing alarm/clock handlers call the bridge on a background queue.
- **Shared bridge singleton:** `GooseBLEClient` should use its own `GooseRustBridge` instance (multiple-instance pattern per CLAUDE.md).
- **Applying Gen4 battery offsets on Gen5:** The `wireProtocol == .gen4` guard in the Event-48 path prevents this. Do not remove it.
- **No guard on raw ≤ 1100:** An unchecked value above 1100 would divide to > 110% and produce an invalid battery reading.
- **Sending Cmd 26 before connection is ready:** Use `connectionState == "ready"` guard before writing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| u16 LE byte reading | Custom byte extraction | `read_u16_le(&payload, offset)` in `protocol.rs` | Already exists, returns `Option<u16>` |
| Battery % publishing to UI | New `@Published` path | `applyBatteryLevel(_:capturedAt:sourceTitle:)` | Already handles main-thread, clamping, persistence, notifications |
| Command frame construction | Custom frame builder | `whoopGenerationFromCapabilities().buildCommandFrame(...)` | Handles CRC, padding, framing per wire protocol |
| Hex encoding payloads for Rust | Custom hex | `Data(payload).hexString` extension | Already present throughout codebase |

## Runtime State Inventory

Not applicable — this is a greenfield feature addition, not a rename/refactor phase.

## Common Pitfalls

### Pitfall 1: Event-48 Offset Confusion

**What goes wrong:** The Event payload layout has a 12-byte header before the data (see `parse_event_payload` in `protocol.rs:556-571`): bytes 0-1 are packet_type+seq, 2-3 are event_id, 4-7 are timestamp_seconds, 8-9 are timestamp_subseconds, 10-11 are padding/reserved, and bytes 12+ are the data. The BAT-01 spec says "offset 17 u16 LE" — this offset is relative to the full payload (not the data body after offset 12). Confirm the spec means the absolute payload offset, not the data-relative offset.

**Why it happens:** Protocol specs often use data-relative offsets. The bridge's `parse_event_payload` writes `data_hex = hex::encode(&payload[12..])` — so "offset 17 in data_hex" would be payload offset 29. The REQUIREMENTS.md says "offset 17 u16 LE" without specifying relative to what.

**How to avoid:** The Rust parsing function should document clearly which offset anchor it uses. Unit tests with known byte sequences (from real captures or CONTEXT.md) will catch misalignment.

**Warning signs:** Battery % reads as 0 or an implausible value (e.g. 5500%).

### Pitfall 2: Cmd 26 Response Routing Gap

**What goes wrong:** The Cmd 26 response frame arrives as a `commandResponse` packet. The existing notification pipeline dispatch (GooseAppModel+NotificationPipeline) handles command_response frames generically for R22 data — it does not route command_response frames to specific handlers by command number. The clock and alarm handlers intercept their responses in `handlePeripheralValueUpdate` before the notification pipeline. If Cmd 26 response is not similarly intercepted, the response silently passes through the pipeline with no action.

**Why it happens:** Clock/alarm responses use `handleClockValue` / `handleAlarmValue` side-channel callbacks. Battery has no such side-channel yet.

**How to avoid:** Add a `handleCmd26InNotificationValue` check in `handlePeripheralValueUpdate` (or in the `handleNotificationSideEffect` path), filtering for `V5PacketType.commandResponse` with `payload[2] == 26`.

**Warning signs:** Cmd 26 is sent (visible in OSLog as `cmd26.battery.sent`), no corresponding `cmd26.battery` entry in battery log.

### Pitfall 3: Bridge Instance on GooseBLEClient

**What goes wrong:** `GooseBLEClient` may not have its own `GooseRustBridge` instance for parsing battery payloads. The documented multiple-instance pattern means each major owner creates its own bridge, but `GooseBLEClient` currently delegates frame parsing to the notification pipeline (which runs through `GooseAppModel`'s bridge).

**Why it happens:** Adding bridge calls in `GooseBLEClient` extension handlers requires a bridge instance on `GooseBLEClient`. If one does not exist, it must be added.

**How to avoid:** Check whether `GooseBLEClient.swift` declares a `GooseRustBridge` property. If not, add one (consistent with the pattern in `GooseAppModel`, `HealthDataStore`, `OvernightSQLiteMirrorQueue`, `CaptureFrameWriteQueue`).

**Warning signs:** `bridge` is undefined in the `handleCmd26BatteryResponse` implementation.

### Pitfall 4: Cmd 26 Sent Before Device Is Ready

**What goes wrong:** `processDiscoveredCharacteristics` runs during GATT discovery, before the connection reaches `connectionState == "ready"`. Writing a command too early may be ignored by the device.

**Why it happens:** `connectedCapabilities` is set asynchronously via `historicalWriteQueue` → `DispatchQueue.main.async`. By the time the main-queue block fires and sets `connectedCapabilities`, the connection may or may not be ready.

**How to avoid:** The `sendCmd26BatteryRequest` helper must check `connectionState == "ready"` and `commandCharacteristic != nil` before writing. If not ready, the function simply returns (the user will still get battery from Event-48 passively).

### Pitfall 5: Gen5 also has batteryViaCMD26 == true

**What goes wrong:** `DeviceCapabilities.for_kind(DeviceKind::Whoop5)` sets `battery_via_cmd26: true`. If the auto-send is gated only on `batteryViaCMD26 == true`, it will fire on Gen5 as well. Gen5 already has battery via R22 — sending Cmd 26 on Gen5 may or may not work, but it is unintended for this phase.

**Why it happens:** The capability field is true for both Gen4 and Gen5 (based on the capabilities.rs source).

**How to avoid:** Gate the auto-send on `caps.batteryViaCMD26 == true && caps.wireProtocol == .gen4`.

## Code Examples

### Verified: read_u16_le in protocol.rs

```rust
// Source: [VERIFIED: Rust/core/src/protocol.rs:1100-1113]
fn read_u16_le(bytes: &[u8], offset: usize) -> Option<u16> {
    let b0 = *bytes.get(offset)?;
    let b1 = *bytes.get(offset + 1)?;
    Some(u16::from(b0) | u16::from(b1) << 8)
}
```

### Verified: R22 Battery Dispatch (exact model for Event-48)

```swift
// Source: [VERIFIED: GooseSwift/GooseAppModel+NotificationPipeline.swift:661-663]
if let batteryPct = interpretation.r22BatteryPct, batteryPct <= 100 {
  ble.applyBatteryLevel(batteryPct, capturedAt: event.capturedAt, sourceTitle: "r22.battery")
}
```

### Verified: applyBatteryLevel signature

```swift
// Source: [VERIFIED: GooseSwift/GooseBLEClient+Parsing.swift:26]
func applyBatteryLevel(_ rawLevel: Int, capturedAt: Date, sourceTitle: String)
```

### Verified: device_capabilities_bridge (args struct + function + dispatch arm pattern)

```rust
// Source: [VERIFIED: Rust/core/src/bridge.rs:370-378]
#[derive(Debug, Deserialize)]
struct DeviceCapabilitiesArgs {
    device_kind: DeviceKind,
}

fn device_capabilities_bridge(args: DeviceCapabilitiesArgs) -> GooseResult<serde_json::Value> {
    let caps = DeviceCapabilities::for_kind(args.device_kind);
    serde_json::to_value(caps).map_err(|e| GooseError::message(e.to_string()))
}
// Dispatch arm:
"device.capabilities" => request_args::<DeviceCapabilitiesArgs>(&request)
    .and_then(device_capabilities_bridge),
```

### Verified: handleClockCommandResponse pattern (model for handleCmd26BatteryResponse)

```swift
// Source: [VERIFIED: GooseSwift/GooseBLEClient+HistoricalHandlers.swift:225-287]
func handleClockCommandResponse(_ payload: [UInt8]) {
    guard payload.count >= 5 else { return }
    guard let pending = pendingClockCommand else { ... return }
    guard payload[2] == pending.kind.commandNumber, payload[3] == pending.sequence else { ... return }
    clockCommandTimeoutWorkItem?.cancel()
    pendingClockCommand = nil
    let resultCode = payload[4]
    // ... handle result
}
```

### Verified: processDiscoveredCharacteristics connectedCapabilities set site

```swift
// Source: [VERIFIED: GooseSwift/GooseBLEClient+Commands.swift:1012-1013]
let caps = try JSONDecoder().decode(DeviceCapabilities.self, from: capData)
DispatchQueue.main.async { self.connectedCapabilities = caps }
// <- NEW: schedule sendCmd26BatteryRequest() here, gated on caps.batteryViaCMD26 && caps.wireProtocol == .gen4
```

### Verified: Cargo test inline module pattern (from capabilities.rs)

```rust
// Source: [VERIFIED: Rust/core/src/capabilities.rs:53-116]
#[cfg(test)]
mod capabilities_tests {
    use super::*;

    #[test]
    fn whoop4_capabilities() { ... }
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Gen4 battery hardcoded/unavailable | Parse from Event-48 + Cmd 26 | Accurate % in UI |
| String-based device type guards (`rustDeviceType == "GEN4"`) | `connectedCapabilities.wireProtocol == .gen4` | Phase 83 complete; this phase uses the new pattern |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Offset 17 u16 LE" in BAT-01 is absolute payload offset (not relative to event data body at offset 12) | Code Examples, Pitfall 1 | Battery reads wrong value — caught by unit test with known byte sequence |
| A2 | `GooseBLEClient` does not yet have its own `GooseRustBridge` instance | Pitfall 3, Pattern 5 | Implementation needs adjustment — check `GooseBLEClient.swift` declaration |

**Risk mitigation:** A1 is resolved by writing a unit test with a known event48 byte sequence and asserting the expected battery_pct. A2 is resolved by reading GooseBLEClient.swift before implementing.

## Open Questions (RESOLVED)

1. **Does GooseBLEClient have a GooseRustBridge property?** RESOLVED
   - Resolution: `GooseBLEClient` holds `historicalDirectWriteBridge = GooseRustBridge()` (verified at `GooseBLEClient.swift:298`). Plan 84-03 reuses this instance for Cmd 26 response parsing — no new bridge property needed.

2. **Exact payload offset for Event-48 battery (absolute vs data-relative)** RESOLVED
   - Resolution: BAT-01 "offset 17" is the absolute payload offset. The planner confirmed this in Plan 84-01 which documents that `parse_event48_battery` uses absolute offset 17, and the unit tests in Wave 1 will assert with a known byte sequence to confirm. The data body (offset 12+) starts at byte 12; offset 17 is byte 5 within the data body.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (cargo) | `cargo test --locked` | [ASSUMED] available on dev machine | per CLAUDE.md constraints | — |
| iOS Simulator | Swift integration verification | [ASSUMED] available via Xcode | per CLAUDE.md iOS 26.0 | — |

No external services required. All changes are local to the repo.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` (built-in). Swift: no test target detected. |
| Config file | `Rust/core/Cargo.lock` |
| Quick run command | `cargo test --locked -p goose-core battery` (filter to battery tests) |
| Full suite command | `cargo test --locked` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAT-01 | Event-48 offset 17 u16 LE / 10, raw ≤ 1100 guard | unit (Rust) | `cargo test --locked battery_parse` | ❌ Wave 0 |
| BAT-01 | Event-48 guard rejects raw > 1100 | unit (Rust) | `cargo test --locked battery_parse` | ❌ Wave 0 |
| BAT-02 | Cmd 26 [2..4] u16 LE / 10, count ≥ 4 guard | unit (Rust) | `cargo test --locked battery_parse` | ❌ Wave 0 |
| BAT-02 | Cmd 26 guard rejects payload.len() < 4 | unit (Rust) | `cargo test --locked battery_parse` | ❌ Wave 0 |
| BAT-01+02 | Full bridge round-trip via `battery.parse_event48_payload` | unit (Rust) | `cargo test --locked` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test --locked -q 2>&1 | tail -5`
- **Per wave merge:** `cargo test --locked`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Rust `#[cfg(test)] mod battery_parse_tests` — covers BAT-01/BAT-02 (inline in bridge.rs or new battery.rs)
- [ ] Test cases: valid event48 payload, raw > 1100 rejected, valid cmd26 payload, payload.len() < 4 rejected

*(No gaps in existing Rust test infrastructure — `cargo test` is already the standard runner.)*

## Security Domain

`security_enforcement: true` in config.json. ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Raw u16 guard (≤ 1100), count ≥ 4 — implemented in Rust parsing functions |
| V6 Cryptography | no | — |

### Known Threat Patterns for BLE parsing stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed Event-48 with out-of-range battery raw | Tampering | Guard: raw ≤ 1100 in Rust (returns Err, Swift ignores) |
| Short Cmd 26 response (< 4 bytes) causing OOB read | Tampering | Guard: payload.len() ≥ 4 before reading [2..4] |
| Battery pct > 100 passed to UI | Tampering | `applyBatteryLevel` already clamps to 0-100 via `min(max(rawLevel, 0), 100)` |

No network-facing attack surface. Input is local BLE from a paired device owned by the user.

## Sources

### Primary (HIGH confidence — verified from codebase)

- `GooseSwift/GooseBLEClient+Parsing.swift` — `applyBatteryLevel` implementation, `BatteryLevelStatus`, battery infrastructure
- `GooseSwift/GooseAppModel+NotificationPipeline.swift:661-663` — R22 battery dispatch pattern (exact model for Event-48 path)
- `GooseSwift/GooseBLEClient+Commands.swift:993-1040` — `processDiscoveredCharacteristics`, `connectedCapabilities` set point
- `GooseSwift/GooseBLEClient+HistoricalHandlers.swift:225-333` — `handleClockCommandResponse` / `handleAlarmCommandResponse` patterns for Cmd 26 response handler
- `Rust/core/src/capabilities.rs` — Gen4 `battery_via_event48: true`, `battery_via_cmd26: true` confirmed
- `Rust/core/src/protocol.rs:1100-1113` — `read_u16_le` helper confirmed, `PACKET_TYPE_EVENT: u8 = 48` confirmed
- `Rust/core/src/bridge.rs:370-378` — `device_capabilities_bridge` pattern (args struct + function + dispatch arm)
- `.planning/REQUIREMENTS.md` — BAT-01 / BAT-02 exact byte specs
- `.planning/phases/84-gen4-battery/84-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)

- `GooseSwift/GooseBLETypes.swift:315-331` — `DeviceCapabilities` Swift struct with CodingKeys verified
- `GooseSwift/NotificationFrameParsing.swift:87,116,131-141` — `r22BatteryPct` field in compact summary and interpretation structs (model for event48BatteryPct)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified from source files
- Architecture: HIGH — all patterns verified from actual code
- Pitfalls: HIGH — identified from reading the actual call sites and data flow
- Protocol offsets: MEDIUM (A1 assumption) — offset 17 is in REQUIREMENTS.md but anchor (absolute vs data-relative) not confirmed without a real capture

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable codebase; no external dependencies)
