# Phase 89 Context: BLE Actor Refactor

## Phase Goal
BLETransport protocol extracted from GooseBLEClient (renamed to CoreBluetoothBLETransport). BLESessionCoordinator thin wrapper manages session lifecycle. DeviceCatalog centralises Gen4/Gen5 branching.

## Current State

- `GooseBLEClient.swift` — 1077 lines, `final class`
- 12 extension files: BatteryCommands, CentralDelegate, Commands, DebugAndSync, Haptics, HistoricalCommands, HistoricalHandlers, HRMonitor, Parsing, PeripheralDelegate, UserActions, VitalsAndLogging
- `DeviceCapabilities` struct exists at GooseBLETypes.swift:315
- `connectedCapabilities?.historicalSync == .pageSequence` guards scattered in GooseBLEClient+HistoricalCommands.swift
- `GooseAppModel.swift`: `let ble: GooseBLEClient`

## Decisions

### D1: BLETransport scope — Rename + Protocol extraction
**Decision:** `GooseBLEClient` is renamed to `CoreBluetoothBLETransport`. A `BLETransport` protocol is extracted covering the public surface `GooseAppModel` calls. `GooseAppModel.ble` becomes `let ble: any BLETransport`. Internal implementation (all 12 extensions) is untouched — only the type name and the property type declaration change.

Why: Achieves ARCH-05 SC1 without rewriting 1077 lines + 12 extensions. Safe, reversible.

### D2: BLESessionCoordinator — Thin wrapper, session lifecycle only
**Decision:** `BLESessionCoordinator` actor wraps `CoreBluetoothBLETransport` and exposes only connect/disconnect/session-state methods. It does NOT replace GooseBLEClient internals. GooseAppModel calls BLESessionCoordinator for session control; BLETransport directly for data commands.

Why: Adds actor boundary for session lifecycle without the risk of rewriting all BLE callbacks.

### D3: DeviceCatalog — Centralise Gen4/Gen5 guards
**Decision:** A `DeviceCatalog` struct (value type) takes `DeviceCapabilities` and exposes computed properties like `var usesPageSequenceSync: Bool`. Every `connectedCapabilities?.historicalSync == .pageSequence` guard in extension files is replaced with a DeviceCatalog query. No logic changes — only centralises the branching.

## Files Changed

| File | Change |
|------|--------|
| `GooseSwift/GooseBLEClient.swift` → `GooseSwift/CoreBluetoothBLETransport.swift` | Rename class; add BLETransport conformance |
| `GooseSwift/GooseBLEClient+*.swift` → `GooseSwift/CoreBluetoothBLETransport+*.swift` | Rename extension files |
| `GooseSwift/BLETransport.swift` | New — protocol with GooseAppModel-callable surface |
| `GooseSwift/BLESessionCoordinator.swift` | New — actor wrapping CoreBluetoothBLETransport |
| `GooseSwift/DeviceCatalog.swift` | New — centralises Gen4/Gen5 branching |
| `GooseSwift/GooseBLETypes.swift` | Add DeviceCatalog; minor |
| `GooseSwift/GooseAppModel.swift` | `let ble: GooseBLEClient` → `let ble: any BLETransport` |
| `GooseSwift/GooseBLEClient+HistoricalCommands.swift` | Replace .pageSequence guards with DeviceCatalog |

## Out of Scope
- Rewriting BLE callbacks to pass through actor isolation boundary
- Replacing all 12 extension files internally
- Moving GooseAppModel to use BLESessionCoordinator exclusively (requires Phase 90)
