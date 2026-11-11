# Phase 108: Battery Level Gen4+Gen5 - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire existing battery parsing infrastructure to produce a visible battery percentage on the Home tab device chip. The Rust bridge methods, Swift `applyBatteryLevel()`, and `lastBatteryLevelSample` already exist — the missing pieces are the call sites and UI wiring.

**In scope:** Call `applyBatteryLevel()` from event-48 notification handler, cmd-26 response handler, R22 realtime stream (Gen5); wire `batteryLevelPercent` → `BLEState.batteryPercent`; device chip UI on Home tab.
**Out of scope:** Battery storage in SQLite, server upload of battery data, Android battery.

</domain>

<decisions>
## Implementation Decisions

### Source priority
- **D-01:** **Most recent wins** — `applyBatteryLevel()` already implements this: it checks `lastBatteryLevelSample.capturedAt` and only updates if the new sample is more recent. No additional logic needed.

### UI location
- **D-02:** **Device status chip on Home tab** — alongside `connectedDeviceGeneration` label. Use `BLEState.batteryPercent` (add if not present) or `bleState.batteryLevelPercent` from transport. Pattern: "WHOOP 5.0 · 78%"

### Claude's Discretion
- Whether `batteryLevelPercent` in `CoreBluetoothBLETransport` is already published to `BLEState` — verify before adding wiring
- `applyBatteryLevel()` already normalizes and applies "most recent wins" — do not duplicate logic
- Event-48 call site: in `GooseBLEClient` notification handler where event type 48 is decoded

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing battery infrastructure
- `GooseSwift/CoreBluetoothBLETransport+Parsing.swift` — `applyBatteryLevel(rawLevel:capturedAt:sourceTitle:)`, `lastBatteryLevelSample`, `batteryLevelPercent`
- `GooseSwift/CoreBluetoothBLETransport.swift` — `batteryLevelCharacteristic` (2A19), `batteryLevelStatusCharacteristic` (2BED), `getBatteryLevel` command
- `Rust/core/src/bridge/mod.rs` — `battery.parse_event48_payload`, `battery.parse_cmd26_response`, `parse_event48_battery()`, `parse_cmd26_battery()`

### BLE notification/command handling
- `GooseSwift/GooseBLEClient.swift` — notification dispatch; find where event type 48 arrives
- `GooseSwift/GooseBLETypes.swift` — `batteryViaEvent48: Bool` on capabilities struct

### UI
- Home tab view files — find `connectedDeviceGeneration` display site; add battery % next to it

</canonical_refs>

<code_context>
## Existing Code Insights

### Already done
- `applyBatteryLevel()` with most-recent-wins semantics
- Rust bridge: `parse_event48_battery()`, `parse_cmd26_battery()`, both registered in BRIDGE_METHODS
- `lastBatteryLevelSample: (percent: Int, capturedAt: Date)?`
- Standard BLE battery service characteristics (2A19, 2BED) already subscribed

### Missing call sites (likely)
- Event-48 notification → call bridge `battery.parse_event48_payload` → call `applyBatteryLevel()`
- Cmd-26 response → call bridge `battery.parse_cmd26_response` → call `applyBatteryLevel()`
- R22 realtime (byte 1 = battery_pct direct) → call `applyBatteryLevel()`
- `batteryLevelPercent` → `BLEState.batteryPercent` publish chain

</code_context>

<specifics>
## Specific Ideas

- R22 battery: byte 1 is direct battery_pct (0-100), no scaling. Read from `GooseSwift/CoreBluetoothBLETransport.swift` R22 handling
- Device chip pattern: `"\(generation) · \(battery)%"` in Home tab generation label

</specifics>

<deferred>
## Deferred Ideas

- Battery history graphing — out of scope
- SQLite battery level persistence — out of scope
- Android battery level — separate phase

</deferred>

---

*Phase: 108-battery-level-gen4-gen5*
*Context gathered: 2026-06-21*
