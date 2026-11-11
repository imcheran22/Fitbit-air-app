# Phase 115: Feature Flag Discovery (GET_FF_VALUE) - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Swift BLE phase. Delivers:
1. GET_FF_VALUE (cmd 0x80) sent after GET_HELLO handshake on every reconnect (FF-01)
2. Response parsed into `DeviceCapabilities.feature_flags: [UInt8: UInt8]`; stored to `device_feature_flags` SQLite table; exposed in Debug tab device info section (FF-02)

Requirements in scope: FF-01, FF-02
Out of scope: FF-03 already complete in Phase 113 (schema v24 + `capabilities.get_feature_flags` bridge method + BRIDGE_METHODS update)
No Rust changes required — the SQLite table and read bridge method exist; only a write bridge call or direct SQLite insert is needed from Swift.

</domain>

<decisions>
## Implementation Decisions

### Trigger Timing
- **D-01:** GET_FF_VALUE fires immediately after GET_HELLO handshake completes, on every BLE reconnect. 3-second timeout, then fallback to empty feature_flags. Flags refresh with firmware updates.

### Fallback DeviceCapabilities
- **D-02:** On 3s timeout (or no response), `feature_flags: [:]` (empty dictionary) for ALL DeviceKind. No response = no flags claimed. Device uses existing DeviceKind-derived capabilities. Conservative and avoids false positives.

### Debug Tab Display
- **D-03:** Add feature flags to the **existing device info section** in Debug tab. Format: list of `"0x%02X → 0x%02X"` hex pairs. If `feature_flags` is empty, show `"None discovered"`. Minimal UI change — no new section header.

### Claude's Discretion
- The `device_feature_flags` SQLite table already exists (schema v24, Phase 113). Writing to it from Swift: either via a new `capabilities.insert_feature_flags` bridge method (preferred — keeps Rust as single source of truth), or direct JSON to existing bridge infrastructure. Researcher should determine which approach is cleaner.
- `DeviceCapabilities` struct may or may not already have `feature_flags: [UInt8: UInt8]` — researcher to verify current struct fields in `GooseBLETypes.swift:315`.
- The `get_feature_flag_value` command definition exists in `CoreBluetoothBLETransport+Commands.swift`. Researcher to verify if the send logic is already wired or just defined.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Feature Flag Discovery (#165) — FF-01, FF-02, FF-03

### Existing Code — Files to Read
- `GooseSwift/GooseBLETypes.swift` line 315 — `DeviceCapabilities` struct (verify current fields, add `feature_flags: [UInt8: UInt8]` if missing)
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` lines 898–1060 — handshake flow, GET_HELLO response handler, existing DeviceCapabilities construction at lines 1047/1055, `get_feature_flag_value` command definition
- `GooseSwift/CoreBluetoothBLETransport+HistoricalCommands.swift` line 197 — existing `get_feature_flag_value` usage pattern
- `GooseSwift/CoreBluetoothBLETransport.swift` line 279 — `connectedCapabilities: DeviceCapabilities?`
- `GooseSwift/BLETransport.swift` line 29 — `connectedCapabilities` protocol requirement
- `GooseSwift/DeviceCatalog.swift` — `capabilities: DeviceCapabilities?` usage
- `Rust/core/src/bridge/mod.rs` — BRIDGE_METHODS (verify `capabilities.*` methods present from Phase 113)

### Bridge (Phase 113 artifacts, already complete)
- `device_feature_flags` SQLite table in schema v24 — already exists
- `capabilities.get_feature_flags` bridge method — already registered in BRIDGE_METHODS

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DeviceCapabilities` struct (GooseBLETypes.swift:315): already Decodable, used as `connectedCapabilities` in transport
- `get_feature_flag_value` command definition in Commands.swift — may already have the BLE write logic, just needs to be called at the right point in the handshake
- Existing 3-second timeout pattern from other command exchanges in the transport layer

### Established Patterns
- Handshake flow: GET_HELLO → capabilities set → proceed. GET_FF_VALUE slots in after GET_HELLO response.
- Commands.swift:1047/1055: DeviceCapabilities already constructed with fallback logic — extend to include `feature_flags: [:]` as default
- Debug tab already has device info rows — follow existing `Text("Key") + Text("Value")` row pattern

### Integration Points
- Swift writes feature flags to SQLite via bridge call after successful GET_FF_VALUE response
- `DeviceCapabilities.feature_flags` exposed via `BLETransport.connectedCapabilities` → consumed by Debug tab

</code_context>

<specifics>
## Specific Ideas

- Hex format: `String(format: "0x%02X → 0x%02X", key, value)` for each pair in Debug view
- "None discovered" shown when feature_flags is empty (covers timeout + Gen4 devices)
- FF-03 bridge method `capabilities.get_feature_flags` is for READING; need either a write bridge method `capabilities.insert_feature_flags` or use an existing insert pattern for the SQLite store

</specifics>

<deferred>
## Deferred Ideas

- Semantic naming of flag indices (e.g., "optical_enabled": true) — intentionally deferred per FF-02: "raw index→value stored without semantic name claims"
- Using feature flags to gate UI features — future phase once flags are confirmed on real device

</deferred>

---

*Phase: 115-Feature Flag Discovery (GET_FF_VALUE)*
*Context gathered: 2026-06-23*
