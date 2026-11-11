# Phase 105 Research: Android Historical Sync

**Phase:** 105 — Android Historical Sync
**Requirement:** AND-03
**Date:** 2026-06-21

---

## Summary

This phase ports the iOS WHOOP historical sync pipeline to Android. All core
protocol logic (command bytes, frame format, routing) is already established in
the iOS codebase and confirmed stable. Android already has `WhoopBleClient` (Phase
104) and `FrameReassembler` (Phase 104). The work is surgical: add
`startHistoricalSync()` to `WhoopBleClient`, route type-47 notification bytes
through the existing `FrameReassembler` → `GooseBridge` pipeline, and auto-trigger
on connect.

**Verdict: low complexity, high confidence.** No new Rust changes. No new
dependencies. One file receives the bulk of new code (`WhoopBleClient.kt`).

---

## 1. Command Protocol (iOS source of truth)

### Command opcodes (from `CoreBluetoothBLETransport.swift` lines 461–489)

| Kind | Command byte (decimal) | Command byte (hex) |
|------|------------------------|---------------------|
| GET_DATA_RANGE | 34 | 0x22 |
| SEND_HISTORICAL_DATA | 22 | 0x16 |
| HISTORICAL_DATA_RESULT (ack) | 23 | 0x17 |

### Command frame wire format

From `CoreBluetoothBLETransport+HistoricalCommands.swift` line 263:

```
payload = [packetType=0x01(command), sequence, commandByte, ...data]
```

The frame is wrapped in the standard WHOOP BLE frame envelope:
- Byte 0: packet type (`0x01` = command)
- Byte 1: body length low byte (little-endian)
- Byte 2: body length high byte (little-endian)
- Byte 3: sequence number
- Bytes 4+: body = `[sequence, commandByte, ...commandPayload]`

### Command payload for GET_DATA_RANGE and SEND_HISTORICAL_DATA

- **Gen5:** `kind.payload` — the enum's defined payload bytes (non-zero, standard)
- **Gen4 (usesPageSequenceSync):** `[0x00]` — single zero byte override
  (see `CoreBluetoothBLETransport+HistoricalCommands.swift` line 112)

### Sequence for Gen5 (standard path):
1. Write `GET_DATA_RANGE` (cmd 34) to command characteristic
2. Wait for `onCharacteristicWrite` callback (write confirmed)
3. Receive `commandResponse` notification with cmd 34 response → parse pagesBehind
4. If pagesBehind > 0: write `SEND_HISTORICAL_DATA` (cmd 22)
5. Receive type-47 (historicalData) packets → route to bridge
6. When done: write `HISTORICAL_DATA_RESULT` ack (cmd 23) with `historyEnd` payload

### Sequence for Gen4 (usesPageSequenceSync path):
1. Write `GET_DATA_RANGE` (cmd 34) with payload `[0x00]`
2. Wait for cmd 34 response → captures strap identity
3. Write `SEND_HISTORICAL_DATA` (cmd 22) with payload `[0x00]`
4. Receive multi-notification type-47 frames → FrameReassembler → bridge
5. Write `HISTORICAL_DATA_RESULT` ack (cmd 23)

---

## 2. Notification Routing

### Type-47 packets — the historical data type

From `CoreBluetoothBLETransport+HistoricalHandlers.swift`:

```swift
case V5PacketType.historicalData, V5PacketType.historicalIMUDataStream:
    // accumulate frame hex and flush in batches via capture.import_frame_batch
```

The packet type value for `historicalData` is the first byte of the frame body
(payload[0]). The exact raw value needs to be confirmed from `GooseBLETypes.swift`
— the iOS switch uses named constants. For Android, type-47 routing means:
**when a notification arrives during active historical sync, parse packet type
from payload[0] and route historicalData packets to the bridge.**

### Practical Android routing approach

Since WhoopBleClient already has generation-aware routing:
- **Gen4:** all historical notifications pass through `FrameReassembler.feed(value)` → get complete frames → check frame body byte 0 for historicalData type
- **Gen5:** notifications arrive as complete single frames → check byte 0 for historicalData type

The key insight from iOS: historical sync uses the **same characteristic** as real-time data. The routing distinguishes historical from live packets by checking the packet type byte. During an active historical sync session, type-47 (historicalData) bodies are the sync payload.

---

## 3. Bridge Call (capture.import_frame_batch)

### Already implemented in WhoopBleClient (Phase 104)

`WhoopBleClient.buildImportRequest()` (lines 342–368) already builds the exact
JSON for `capture.import_frame_batch`. The historical sync path uses the identical
call — frame hex bytes → same bridge method. No new bridge call needed.

```kotlin
// Already in WhoopBleClient.kt — reuse for historical frames
GooseBridge.safeHandle(buildImportRequest(dbPath, evidenceId, capturedAt, deviceModel, frameHex))
```

The frame objects include:
- `evidence_id`: random UUID
- `source`: `"historical_sync"` (vs `"android_ble"` for live)
- `captured_at`: ISO timestamp
- `device_model`: `"whoop4"` / `"whoop5"` / `"whoop_mg"`
- `frame_hex`: hex-encoded frame bytes
- `sensitivity`: `"normal"`

SYNC-08 routing fix is in Rust core (Phase 98) — type-47 bodies route correctly
to the sync handler. Android just needs to pass the bytes through.

---

## 4. State Machine for Android

### Fields to add to WhoopBleClient

```kotlin
@Volatile private var syncInProgress: Boolean = false
private var nextSyncSequence: Byte = 57  // mirrors iOS nextHistoricalCommandSequence
private val pendingSyncFrames = ArrayDeque<ByteArray>()
```

### Auto-trigger on connect (D-02)

In `handleNotification()`, after transitioning to `Connected` state:

```kotlin
if (_connectionState.value is BleConnectionState.Authenticating) {
    _connectionState.value = BleConnectionState.Connected(address, generation)
    // D-02: auto-trigger historical sync on connect
    scope.launch { startHistoricalSync() }
}
```

### Command write pattern (mirrors iOS)

Uses `onCharacteristicWrite` callback already present in `gattCallback`. The
existing `sendAuthCommand` pattern shows the exact write approach:

```kotlin
@Suppress("DEPRECATION")
commandChar.value = commandBytes
commandChar.writeType = writeType
gatt.writeCharacteristic(commandChar)
```

For historical sync, the next command is sent from `onCharacteristicWrite`
after confirming the previous write succeeded.

---

## 5. Frame Builder for Android

iOS uses `whoopGenerationFromCapabilities().buildCommandFrame(sequence, command, data)`.
Android needs an equivalent. The frame format (from iOS source) is:

```
[packetType(0x01), bodyLenLow, bodyLenHigh, outerSeq, innerSeq, commandByte, ...data]
```

Simplified for Android (the existing CLIENT_HELLO_BYTES pattern shows we can
build ByteArray directly):

```kotlin
fun buildCommandFrame(sequence: Byte, command: Byte, data: ByteArray): ByteArray {
    val body = byteArrayOf(sequence, command) + data
    val bodyLen = body.size
    return byteArrayOf(
        0x01.toByte(),                    // packet type: command
        (bodyLen and 0xFF).toByte(),      // body length low
        ((bodyLen shr 8) and 0xFF).toByte(), // body length high
        sequence,                          // outer sequence
    ) + body
}
```

---

## 6. Historical Sync in the Notification Handler

### Gen4 path (already has FrameReassembler)

`WhoopBleClient.handleNotification()` for GEN4 already does:

```kotlin
val frames = gen4Reassembler.feed(value)
for (frame in frames) {
    importFrame(frame)
}
```

During historical sync, this is sufficient — `importFrame()` handles bridge
dispatch. The only change: during sync, use `source = "historical_sync"` not
`"android_ble"`.

### Gen5 path

Single-notification frames already go to `importFrame(value)`. Same applies
during historical sync.

### Packet type filtering

For the simplified Android implementation (matching D-04), the routing is:
**all frames received during active historical sync are treated as historical
data and passed to the bridge** via `capture.import_frame_batch`. The Rust core
(with SYNC-08 fix) handles the correct internal routing.

---

## 7. Key Files and Change Surface

| File | Change |
|------|--------|
| `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` | Add `startHistoricalSync()`, `writeHistoricalCommand()`, `buildCommandFrame()`, `syncInProgress` flag, `onCharacteristicWrite` extension for sync state machine, auto-trigger on connect |

No other files need changes. `FrameReassembler.kt`, `GooseBridge.kt`, `WhoopUuids.kt`, and Rust core are all used as-is.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `onCharacteristicWrite` already used for auth | Gate on `syncInProgress` flag — auth writes complete before sync starts |
| Gen4 page sequence protocol complexity | For Phase 105, implement simplified Gen4 path: send cmd 34 with `[0x00]`, send cmd 22 with `[0x00]`, receive frames. Full page sequence tracking is iOS-specific detail not needed for basic sync. |
| Concurrent live + historical frame routing | Source field distinguishes: `"android_ble"` vs `"historical_sync"`. Rust handles routing. |
| No `HISTORICAL_DATA_RESULT` ack on Android | Implement basic ack after sync completes (historyEnd metadata received). Required for protocol correctness. |

---

## 9. Validation Architecture

### AND-03 success gate

```sql
SELECT COUNT(*) FROM decoded_frames WHERE device_id = ? -- must be > 0
```

Run after triggering a historical sync. `decoded_frames` is populated by the
Rust `capture.import_frame_batch` handler via the SYNC-08 routing fix.

### Build validation

```bash
cd android && ./gradlew assembleDebug
```

Must produce BUILD SUCCESSFUL with no new errors.

---

## RESEARCH COMPLETE

**Key findings:**
1. Command opcodes confirmed: GET_DATA_RANGE=0x22, SEND_HISTORICAL_DATA=0x16, HISTORICAL_DATA_RESULT=0x17
2. `capture.import_frame_batch` bridge call already exists in `WhoopBleClient` — reuse with `source="historical_sync"`
3. `FrameReassembler` handles Gen4 multi-notification reassembly — already in place
4. Only `WhoopBleClient.kt` needs substantive changes
5. SYNC-08 routing fix is in Rust — Android passes bytes through unchanged
6. Auto-trigger pattern: launch `startHistoricalSync()` in coroutine when transitioning to Connected state
