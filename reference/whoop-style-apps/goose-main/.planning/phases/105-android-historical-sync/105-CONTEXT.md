# Phase 105: Android Historical Sync - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Port iOS historical sync to Android: send `GET_DATA_RANGE` + `SEND_HISTORICAL_DATA` BLE commands, receive type-47 packet bodies, reassemble Gen4 multi-notification frames, store in SQLite via GooseBridge. SYNC-08 routing is already fixed in Rust — Android just needs correct command dispatch and notification routing.

**In scope:** Historical sync commands (GET_DATA_RANGE, SEND_HISTORICAL_DATA), type-47 packet routing, Gen4+Gen5 sync, auto-trigger on BLE connect, SQLite storage via bridge.
**Out of scope:** Server upload (Phase 106), CI APK (Phase 107), metrics computation.

</domain>

<decisions>
## Implementation Decisions

### Device generation coverage
- **D-01:** Implement **Gen4 + Gen5** historical sync — full parity with iOS. Both generations handled in Phase 105.

### Sync trigger
- **D-02:** **Auto-trigger on BLE connect** — same as iOS. When `WhoopBleClient` reaches `connected` state, automatically start historical sync. No manual button required.

### Command protocol
- **D-03:** Commands follow the same byte-level protocol as iOS. Read `GooseSwift/GooseBLEHistoricalManager.swift` for exact command bytes for GET_DATA_RANGE and SEND_HISTORICAL_DATA. Write to the WHOOP command characteristic.
- **D-04:** Type-47 packet body bytes are passed to `GooseBridge.handle("capture.import_frames", ...)` after Gen4 frame reassembly (FrameReassembler from Phase 104) or Gen5 passthrough.

### SYNC-08 routing
- **D-05:** SYNC-08 routing fix (Phase 98) is in the Rust core — no Android-specific routing code needed. The Rust bridge correctly routes type-47 packets to the sync handler. Android just needs to pass the bytes.

### Claude's Discretion
- Command write timing: wait for `onCharacteristicWrite` callback before sending next command (same as iOS)
- Historical sync state: add `syncInProgress: Boolean` to WhoopBleClient to prevent concurrent syncs
- DB path: reuse `context.filesDir.absolutePath + "/goose.sqlite"` from Phase 104

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iOS historical sync (parity target)
- `GooseSwift/GooseBLEHistoricalManager.swift` — GET_DATA_RANGE + SEND_HISTORICAL_DATA command bytes, sync state machine
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — type-47 notification handling, Gen4/Gen5 routing

### Phase 104 output (WhoopBleClient)
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` — GATT client; add sync commands here
- `android/app/src/main/kotlin/com/goose/app/ble/FrameReassembler.kt` — Gen4 frame reassembly (already implemented)

### Rust bridge
- `GooseSwift/GooseRustBridge.swift` — JSON-RPC request format; Android must use same format
- `Rust/core/src/bridge/capture.rs` — `capture.import_frames` method args schema

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FrameReassembler.kt` (Phase 104) — Gen4 multi-notification reassembly ready
- `WhoopBleClient.kt` (Phase 104) — GATT client with characteristic write capability
- `GooseBridge.kt` — `handle(request)` already wired

### Established Patterns
- Command write: `gatt.writeCharacteristic(cmdChar, bytes, WRITE_TYPE_DEFAULT)` + wait for `onCharacteristicWrite`
- Sync result: type-47 bytes → FrameReassembler (Gen4) or direct → bridge call `capture.import_frames`

### Integration Points
- `WhoopBleClient` `connected` state → trigger `startHistoricalSync()`
- Historical sync method in `WhoopBleClient`: writes commands to WHOOP cmd characteristic, receives type-47 notifications, stores rows

</code_context>

<specifics>
## Specific Ideas

- `startHistoricalSync()` should be a suspend fun or called from the BLE CoroutineScope
- Gen5 sync: GET_DATA_RANGE sends time range; type-47 responses route directly to bridge
- Gen4 sync: same commands but type-47 bodies need FrameReassembler before bridge call
- Success gate: `SELECT COUNT(*) FROM decoded_frames WHERE device_id = ?` > 0 after sync

</specifics>

<deferred>
## Deferred Ideas

- Server upload of sync results — Phase 106
- Sync progress UI (progress bar, byte count) — Phase 106 or later
- Gen4 RR interval extraction during sync — already in Rust core, no Android change needed

</deferred>

---

*Phase: 105-android-historical-sync*
*Context gathered: 2026-06-21*
