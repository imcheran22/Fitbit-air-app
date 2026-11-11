---
name: service-layer-di
description: Protocol-based service layer and mock infrastructure — enables unit testing of BLE, sync, and health pipeline components in isolation
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Introduce a `GooseAppServicing` protocol and mock implementations for the main subsystems, equivalent to WHOOP's `WHPAppServicing` + `WHPBLEManagerProtocol` + `WHPBLEManagerMock` pattern.

## Problem

`GooseAppModel` is a concrete god object with 8+ extension files. Every component that needs BLE, the Rust bridge, or health data holds a direct reference to the concrete type. There is no way to inject a test double.

Consequence: no unit tests exist for `GooseBLEClient`, `CaptureFrameWriteQueue`, `PassiveActivityDetector`, or `HealthDataStore` — they cannot be instantiated without a real CoreBluetooth stack and SQLite database.

## What to build

**Phase 1 — Protocols (no behaviour change):**
- `GooseBLEManaging` protocol extracted from `GooseBLEClient` (connection state, send command, record)
- `GooseRustBridging` protocol extracted from `GooseRustBridge` (request, requestAsync)
- `GooseAppServicing` protocol wrapping both + `HealthDataStore`

**Phase 2 — Mocks:**
- `GooseBLEClientMock: GooseBLEManaging` — in-memory, no CoreBluetooth
- `GooseRustBridgeMock: GooseRustBridging` — returns fixture JSON
- Used in Swift test targets only (#if DEBUG / test target)

**Phase 3 — Wire tests:**
- `PassiveActivityDetector` tests with mocked HR stream
- `CaptureFrameWriteQueue` tests with mocked bridge

## Research basis

WHOOP has: `WHPBLEManagerProtocol`, `WHPBLEManagerMock`, `WHPBLEBondingManagerMock`, `WHPProcessDataManagerMock`, `WHPAppService`, `WHPAppServicing`.

## When NOT to do this

Do not extract protocols as a pure refactor with no tests to back them. The protocols are only justified when test targets exist to use them. Build Phase 1 + 2 together with Phase 3, or don't start.

## Files to touch

- New: `GooseSwift/GooseBLEManaging.swift`, `GooseSwift/GooseRustBridging.swift`, `GooseSwift/GooseAppServicing.swift`
- New (test target): `GooseSwiftTests/Mocks/GooseBLEClientMock.swift`, `GooseRustBridgeMock.swift`
- Modify: `GooseSwift/GooseBLEClient.swift` (conform to protocol)
- Modify: `GooseSwift/GooseRustBridge.swift` (conform to protocol)
