# Phase 61: BLE Bonding State Machine - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Replace the implicit OS BLE bonding path with a formal 5-state `GooseBLEBondingManager` mirroring WHOOP's `WHPBLEBondingManager`. The manager tracks state through NotStarted → Started → Subscribed → Completed/Cancelled, persists state to UserDefaults, detects bond loss via CoreBluetooth error codes, and drives the existing `connectionState` string via callback — no breaking change to the 33+ comparison sites. Scope excludes the full typed migration (Phase 65).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase with detailed RESEARCH.md, PATTERNS.md, and 3 pre-written plans (61-01, 61-02, 61-03).

Key constraints from research:
- `GooseBLEBondingState` enum with exactly 5 cases (notStarted, started, subscribed, completed(deviceID:), cancelled(reason:))
- `GooseBLEBondingManager` is a plain `final class` with `onBondingStateChange` callback (not `@Observable`)
- `connectionState: String` remains unchanged at the API surface; manager drives it via `updateConnectionState()`
- UserDefaults keys: `goose.swift.ble.bondingState`, `goose.swift.ble.bondingDeviceID`
- Bond loss detected via `CBError` code 14 and `CBATTError` code 15 (use named constants)
- `.cancelled` maps to `"notStarted"` in `persistenceKey` (Pitfall 5 — restart safety)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseBLEReconnect.swift` — primary analog for a focused BLE state-owning type
- `GooseBLEClient.DefaultsKey` namespace pattern for UserDefaults keys
- `LocalizedStatusStrings.swift` — extension on String with `String(localized:)` pattern
- Existing `reconnectBackoff` circuit breaker covers reconnect flood protection

### Established Patterns
- `final class` for BLE subsystem types (GooseBLEReconnect, GooseBLEClient)
- `private(set) var` for observable state with `onStateChange` callback pattern
- `DispatchQueue.main.async { [weak self] in ... }` for main-thread callbacks
- `goose.swift.*` prefix for UserDefaults keys

### Integration Points
- `GooseBLEClient+CentralDelegate.swift` — didConnect/didDisconnect/didFailToConnect
- `GooseBLEClient+Commands.swift` — `updateConnectionState("ready")` at line ~1037
- `GooseBLEClient+PeripheralDelegate.swift` — didUpdateNotificationState
- `GooseAppModel` — reads `ble.connectionState` (unchanged); add computed `bondingState` passthrough

</code_context>

<specifics>
## Specific Ideas

3 pre-written plans already exist (61-01, 61-02, 61-03). Execute as-is per wave structure.

</specifics>

<deferred>
## Deferred Ideas

- Full typed `connectionState` migration → Phase 65 (Generic BLE State Machine)
- Bond loss hardware verification → checkpoint:human-verify in Plan 61-03
- `WHPHeartRateDataSanitizer` parity → Phase 64

</deferred>
