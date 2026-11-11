---
phase: 83-protocol-architecture-refactor-gen4-gen5-capability-model
plan: 04
subsystem: protocol
tags: swift, ble, device-capabilities, wire-protocol, type-safety

requires:
  - phase: 83-03
    provides: device.capabilities bridge method in bridge.rs (DeviceCapabilities JSON per DeviceKind)

provides:
  - WireProtocol Swift enum (gen4/gen5/hrMonitor) with bridgeString helper
  - HistoricalSyncKind Swift enum (pageSequence/stream)
  - DeviceCapabilities Swift struct (Decodable, snake_case CodingKeys)
  - GooseNotificationEvent.wireProtocol computed property replacing rustDeviceType
  - GooseBLEClient.connectedCapabilities: DeviceCapabilities? replacing activeDeviceGeneration
  - processDiscoveredCharacteristics calls device.capabilities bridge and sets connectedCapabilities
  - whoopGenerationFromCapabilities() helper with nil guard + OSLog .error fallback

affects: 83-05 (updates remaining callers of wireProtocol + connectedCapabilities), 83-06 (full test gate)

tech-stack:
  added: []
  patterns:
    - "WireProtocol: String, Decodable with raw values matching Rust JSON output (gen4/gen5/hr_monitor)"
    - "DeviceCapabilities: Decodable with CodingKeys for snake_case → camelCase mapping"
    - "try? + optional chaining for bridge call: JSONSerialization.data + JSONDecoder.decode"
    - "whoopGenerationFromCapabilities(): internal helper with nil guard and OSLog .error fallback"

key-files:
  created: []
  modified:
    - GooseSwift/GooseBLETypes.swift
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+Commands.swift
    - GooseSwift/GooseBLEClient+Haptics.swift
    - GooseSwift/GooseBLEClient+UserActions.swift

key-decisions:
  - "WireProtocol conforms to String, Decodable with explicit rawValues to match Rust JSON (gen4/gen5/hr_monitor) — avoids custom init(from:)"
  - "HistoricalSyncKind uses page_sequence raw value to match Rust snake_case JSON output"
  - "whoopGenerationFromCapabilities() uses internal visibility (no private keyword) so sibling extension files (Haptics, UserActions) can call it"
  - "device.capabilities bridge call uses historicalDirectWriteBridge (already on GooseBLEClient at line 296) — no new GooseRustBridge instance"
  - "Build intentionally broken until 83-05 updates remaining callers (OvernightRawNotificationSpool, OvernightSQLiteMirrorQueue, MovementPacketSamples, GooseAppModel+Upload, GooseAppModel+NotificationPipeline)"

requirements-completed:
  - PROTO-01
  - PROTO-02

duration: 25min
completed: 2026-06-14
---

# Phase 83-04: Swift type definitions + BLE capability model

**WireProtocol/HistoricalSyncKind/DeviceCapabilities types added to GooseBLETypes.swift; GooseBLEClient uses connectedCapabilities from device.capabilities bridge call instead of activeDeviceGeneration**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-14T17:30Z
- **Completed:** 2026-06-14T17:55Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Replaced `rustDeviceType: String` computed property on `GooseNotificationEvent` with typed `wireProtocol: WireProtocol`
- Added `WireProtocol` enum (gen4/gen5/hrMonitor) with `String, Decodable` conformance and `bridgeString` computed property
- Added `HistoricalSyncKind` enum (pageSequence/stream) with `String, Decodable` conformance
- Added `DeviceCapabilities` struct (Decodable) with 6 fields and snake_case CodingKeys
- Replaced `activeDeviceGeneration: WhoopGeneration = .gen5` with `connectedCapabilities: DeviceCapabilities?` in GooseBLEClient.swift
- Added `whoopGenerationFromCapabilities()` internal helper with nil guard + OSLog .error fallback
- Updated `processDiscoveredCharacteristics` to call `device.capabilities` bridge and set `connectedCapabilities`
- Updated 3 `buildCommandFrame` calls in GooseBLEClient+Commands.swift
- Updated 1 `buildCommandFrame` call in GooseBLEClient+Haptics.swift
- Updated 1 `buildCommandFrame` + 1 `helloFrame` call in GooseBLEClient+UserActions.swift

## Task Commits

1. **Task 1: Add Swift type definitions to GooseBLETypes.swift** — `0276334` (feat)
2. **Task 2: Replace activeDeviceGeneration + add GATT discovery bridge call + update frame-building files** — `0a61c90` (feat)

## Files Created/Modified

- `GooseSwift/GooseBLETypes.swift` — wireProtocol property, WireProtocol enum, HistoricalSyncKind enum, DeviceCapabilities struct
- `GooseSwift/GooseBLEClient.swift` — connectedCapabilities: DeviceCapabilities? (replaces activeDeviceGeneration)
- `GooseSwift/GooseBLEClient+Commands.swift` — whoopGenerationFromCapabilities() helper, device.capabilities bridge call, 3 buildCommandFrame calls updated
- `GooseSwift/GooseBLEClient+Haptics.swift` — 1 buildCommandFrame call updated
- `GooseSwift/GooseBLEClient+UserActions.swift` — 1 buildCommandFrame + 1 helloFrame call updated

## Decisions Made

- WireProtocol and HistoricalSyncKind use `String, Decodable` with explicit raw values matching Rust JSON snake_case output — this is the least invasive approach given the codebase style (no custom init(from:) needed)
- `whoopGenerationFromCapabilities()` declared without `private` keyword so sibling extension files can call it (Swift private is file-scoped, not class-scoped)
- `historicalDirectWriteBridge` reused for the device.capabilities call — it was already declared on GooseBLEClient (line 296); no new GooseRustBridge instance created
- Build intentionally broken until 83-05 completes: OvernightRawNotificationSpool, OvernightSQLiteMirrorQueue, MovementPacketSamples, GooseAppModel+Upload, GooseAppModel+NotificationPipeline all reference `rustDeviceType` which was removed in Task 1

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all new types are wired to real bridge data. connectedCapabilities will be nil until GATT discovery completes, which is correct behavior (whoopGenerationFromCapabilities() handles nil safely with an OSLog .error).

## Threat Flags

No new security surface introduced beyond what was in the plan's threat model. The `try?` + optional chaining pattern for the bridge call ensures malformed DeviceCapabilities JSON leaves connectedCapabilities nil (T-83-06 mitigated as planned).

## Self-Check: PASSED

- GooseSwift/GooseBLETypes.swift — found (8 matches for wireProtocol/WireProtocol/DeviceCapabilities/HistoricalSyncKind)
- GooseSwift/GooseBLEClient.swift — found connectedCapabilities at line 277
- GooseSwift/GooseBLEClient+Commands.swift — found device.capabilities at line 1000, whoopGenerationFromCapabilities at line 525
- GooseSwift/GooseBLEClient+Haptics.swift — found whoopGenerationFromCapabilities() usage
- GooseSwift/GooseBLEClient+UserActions.swift — found whoopGenerationFromCapabilities() usages
- Commits 0276334 and 0a61c90 verified in git log
- Zero activeDeviceGeneration references in 4 modified files
