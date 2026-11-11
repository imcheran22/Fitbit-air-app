# Phase 100: BLE Reliability — MTU 247 + LE 2M PHY + Off-Wrist Detection - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Two BLE reliability improvements shipped in parallel:
1. **BLE-01** — Explicitly request MTU 247 and prefer LE 2M PHY on connect; log effective MTU at session start
2. **BLE-02** — Send cmd `0x54` (GET_BODY_LOCATION_AND_STATUS) on connect; parse response; expose `isOnWrist: Bool?` on transport; UI chip next to existing connection indicator

Closes issues #159 and #161.

</domain>

<decisions>
## Implementation Decisions

### On-wrist UI indicator placement
- **D-01:** Add on-wrist indicator to the existing BLE status chip area — same zone as the current `connectionState == "ready"` indicator, not a new dedicated row
- **D-02:** Indicator only visible when `connectionState == "ready"` AND `isOnWrist != nil`; hidden when disconnected

### isOnWrist state type and reset policy
- **D-03:** `isOnWrist: Bool?` — `nil` = unknown (pre-response or disconnected), `true` = confirmed on-wrist, `false` = confirmed off-wrist
- **D-04:** On disconnect (any state → not "ready"): reset `isOnWrist = nil`
- **D-05:** UI hides the indicator entirely when `isOnWrist == nil`; no "last known state" display

### MTU / PHY implementation
- **Claude's Discretion:** Choose the correct CoreBluetooth API call site (after `centralManager(_:didConnect:)` / after services discovered). Log `maximumWriteValueLength(for: .withoutResponse)` at session start. `setPreferredPHY` call timing per CoreBluetooth delegate flow.

### cmd 0x54 timing
- **Claude's Discretion:** Send cmd `0x54` in the same post-connect sequence as other init commands (after characteristic discovery/subscription). Researcher should confirm exact byte layout from NoopApp or RE assets.

</decisions>

<specifics>
## Specific Ideas

- `isOnWrist: Bool?` is a `@Observable` var directly on `CoreBluetoothBLETransport` (no new struct — consistent with existing `connectionState: String`, `bluetoothState: String` pattern)
- UI chip: small icon (wrist/arm SF Symbol or similar) + "On wrist" / "Off wrist" text, coloured green/amber, alongside the existing connection chip

</specifics>

<canonical_refs>
## Canonical References

- `GooseSwift/CoreBluetoothBLETransport.swift` — main transport file; connect flow, MTU/PHY call site
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — pattern for cmd parsing (reference for cmd 0x54 response handler)
- `GooseSwift/GooseBLETypes.swift` — existing BLE type definitions
- GitHub issue #159 — MTU 247 + LE 2M PHY specification
- GitHub issue #161 — cmd 0x54 off-wrist detection specification

</canonical_refs>
