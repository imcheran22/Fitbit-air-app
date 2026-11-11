# Phase 125: Cap Sense UUID Discovery - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Swift + documentation phase. BLE protocol analysis resolved the UUID question definitively — no hardware required for SC-1.

**Key Finding from BLE protocol observation:**
Cap sense detection is NOT a separate GATT characteristic. It arrives via the existing `EVENTS_FROM_STRAP` characteristic (`fd4b0004-cce1-4033-93ce-002d5875f58a`) as event type values:
- **Event type 10 (0x000A)** = `STRAP_DETECTED` — device is on-wrist
- **Event type 11 (0x000B)** = `STRAP_REMOVED` — device is off-wrist

Event type field: bytes 2-3 of the event packet (int16 little-endian).

`fd4b0004` is already subscribed in `CoreBluetoothBLETransport.swift:423`. The cap sense parsing just needs to be added to the notification handler.

Requirements in scope: CAPSENSE-01
SC-2/SC-3 achievable without hardware (parsing existing event stream, no new subscription needed).

</domain>

<decisions>
## Implementation Decisions

### UUID resolution
- **D-01:** The "GATT characteristic UUID for the WHOOP 5 capacitive sense sensor" = `fd4b0004-cce1-4033-93ce-002d5875f58a` (EVENTS_FROM_STRAP). Already subscribed. The cap sense signal is an event TYPE within this existing characteristic — not a separate UUID. Document this in CAPSENSE-UUID.md.

### Event parsing
- **D-02:** Parse event type from EVENTS_FROM_STRAP notifications:
  - Bytes 2-3 (int16 little-endian) = event type code
  - Value 10 (0x0A) → STRAP_DETECTED → `isOnWrist = true`
  - Value 11 (0x0B) → STRAP_REMOVED → `isOnWrist = false`
  - All other event types → ignore (no isOnWrist update)

### Parsing location
- **D-03:** Add cap sense event parsing to `CoreBluetoothBLETransport+PeripheralDelegate.swift` inside the existing `handlePeripheralValueUpdate` path. Check characteristic UUID == fd4b0004 first, then parse bytes 2-3. Update `isOnWrist` directly.

### Distinct from cmd 0x54 (BLE-02)
- **D-04:** The cmd 0x54 path (`CoreBluetoothBLETransport+HistoricalHandlers.swift:1084`) sets `isOnWrist` from the body location response. The new cap sense path sets `isOnWrist` from EVENTS_FROM_STRAP event types 10/11. Both paths co-exist — cap sense is real-time, cmd 0x54 is polled at reconnect. No conflict since last-write wins on the optional var.

### CAPSENSE-UUID.md
- **D-05:** Write `.planning/research/whoop-5/CAPSENSE-UUID.md` documenting: UUID = fd4b0004, event codes 10/11, event byte layout. The prior CAPSENSE-INVESTIGATION.md noted this was BLOCKED — this phase resolves it.

### Debug tab update
- **D-06:** Update the Debug tab (More → Developer) to show "Cap sense: On wrist / Off wrist / Unknown" based on `isOnWrist` value, alongside the characteristic UUID label. This satisfies SC-3.

### Claude's Discretion
- Guard event parsing with `data.count >= 4` before reading bytes 2-3
- isOnWrist remains Optional (nil until first event received) — same as current behavior
- No new files needed if event parsing fits neatly in existing peripheral delegate extension

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary files to modify
- `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift` — add cap sense event parsing
- OR a new extension: `GooseSwift/CoreBluetoothBLETransport+CapSense.swift`
- `GooseSwift/MoreDebugViews.swift` — Debug tab cap sense display (SC-3)

### Pattern references
- `GooseSwift/CoreBluetoothBLETransport.swift:423` — fd4b0004 UUID subscription
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift:1084` — existing isOnWrist setter (cmd 0x54 path, for comparison)
- `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift:68` — `didUpdateValueFor characteristic` — insertion point for cap sense parsing

### Requirements
- `.planning/REQUIREMENTS.md` §CAPSENSE-01

</canonical_refs>

<code_context>
## Existing Code Insights

- `fd4b0004-cce1-4033-93ce-002d5875f58a` is already in `characteristicsToSubscribe` (CoreBluetoothBLETransport.swift:423)
- `isOnWrist: Bool?` declared on BLETransport protocol + set in existing cmd 0x54 handler
- No existing event type parsing for fd4b0004 notifications — clean addition
- Event packet bytes: [0-1: framing/header], [2-3: event type int16 LE], [4+: payload depending on event type]

</code_context>
