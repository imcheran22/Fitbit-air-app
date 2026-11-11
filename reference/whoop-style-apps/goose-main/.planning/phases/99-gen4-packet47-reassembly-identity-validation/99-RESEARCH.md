# Phase 99 Research: Gen4 Packet47 Reassembly + Identity Validation

**Researched:** 2026-06-21
**Domain:** BLE frame reassembly (Swift/GooseAppModel) + historical sync ACK validation (Swift)
**Confidence:** HIGH — all findings from direct codebase inspection, zero assumed

---

## SYNC-09: Gen4 Frame Reassembly Root Cause

### Exact file:function where the drop happens

**File:** `GooseSwift/GooseAppModel+NotificationPipeline.swift`
**Function:** `gooseFrames(in:event:)` — lines 827–886 (nonisolated)

The `notification.frame.reassembly.dropped` log is emitted from three sites in the same
file — `handleNotificationIngestResult`, `handleNotificationIngestResultWithoutCapture`, and
`handleEmptyNotificationIngestResult` (lines 44–50, 103–109, 133–139) — but the drop count
itself is produced by `gooseFrames`.

### What condition triggers the drop

`gooseFrames` runs a streaming loop:

```
while let startIndex = bytes.firstIndex(of: 0xaa) {
    ...
    guard bytes.count >= expectedLength else {
        expectedBytes = expectedLength   // buffer and wait
        break
    }
    frames.append(...)
    bytes.removeFirst(expectedLength)
}

// After loop:
if bytes.isEmpty {
    frameReassemblyBuffers.removeValue(forKey: key)
} else if bytes.first == 0xaa {
    frameReassemblyBuffers[key] = Data(bytes)   // ← buffer for next notification
} else {
    droppedBytes += bytes.count                 // ← DROP PATH
    frameReassemblyBuffers.removeValue(forKey: key)
}
```

The drop path fires when, after consuming complete frames, the leftover bytes do **not** start
with `0xaa`. For Gen4 historical data this means:

1. A type-47 body frame is large — its `declaredLength` field (bytes[1..2] of the frame) makes
   `expectedLength = declaredLength + 4` larger than what arrived in a single 512-byte BLE
   notification.
2. The partial frame is correctly buffered (the `break` path on line 862).
3. The **next** notification arrives. Its first byte is **not** `0xaa` — it is the continuation
   of the previous frame's payload. `firstIndex(of: 0xaa)` returns a non-zero index (or nil),
   so `startIndex > 0` bytes are marked as `droppedBytes` and the buffer is wiped.

The root cause is that `gooseFrames` treats every notification independently after the first
byte scan. A Gen4 multi-notification frame whose continuation chunk has no `0xaa` header at the
front gets discarded as junk.

### Why this fires on Gen4 historical (61080005) but not on metadata

- **Metadata frames** (HistoryStart, HistoryEnd, HistoryComplete): small, fit in one BLE
  notification (≤ 20–50 bytes). No cross-notification reassembly needed.
- **Type-47 body frames** (packet type `V5PacketType.historicalData = 47`): carry actual
  biometric history — large payloads, typically 100–500+ bytes, spanning multiple 512-byte
  BLE notifications on Gen4's characteristic `61080005-8d6d-82b8-614a-1c8cb0f8dcc6`.

### Gen4 vs Gen5 frame header format

| Field | Gen4 (4-byte header) | Gen5 (8-byte header) |
|-------|---------------------|---------------------|
| byte 0 | `0xaa` frame start | `0xaa` frame start |
| byte 1 | payload length low byte (u16 LE) | flags/version byte |
| byte 2 | payload length high byte (u16 LE) | payload length low byte |
| byte 3 | CRC8 of bytes[1..2] | payload length high byte |
| bytes 4–5 | — | reserved (observed 0x00) |
| bytes 6–7 | — | CRC16-Modbus of bytes[0..5] |

Source: `Rust/core/src/protocol.rs` lines 419–450, confirmed by `DeviceType::header_len()` returning
4 for Gen4 and 8 for Gen5. `gooseFrames` correctly uses `headerLength = 4` when
`event.wireProtocol == .gen4`.

The problem is **not** the header size — it is that continuation notifications do not start
with `0xaa`, so the reassembler discards them instead of appending to the partial-frame buffer.

### The two frame-slicing paths (critical split)

There are two completely separate frame-slicing paths in the codebase. Understanding which one
is failing is essential:

**Path A — `CoreBluetoothBLETransport.frames(in:)` / `gen4Frames(in:)`**
Used by: `handleHistoricalSyncValue` in `CoreBluetoothBLETransport+HistoricalHandlers.swift`
Purpose: counts packets, builds `pendingHistoricalFrames` list for direct SQLite write
Behavior: **same single-notification limitation** — `gen4Frames` breaks when
`bytes.count < expectedLength` and returns whatever complete frames fit. It silently discards
the partial tail. However, historical body packets (type 47) that arrive via this path are
written to SQLite only when they complete; the incomplete tail is simply not written.

**Path B — `GooseAppModel.gooseFrames(in:event:)`**
Used by: the `onNotification` pipeline for parse+capture routing
Purpose: drives `notification.frame.reassembly.dropped` logs, parse pipeline, capture import
Behavior: has a buffer (`frameReassemblyBuffers`) keyed by
`deviceID|serviceUUID|characteristicUUID|wireProtocol`, but the buffer-to-continuation
matching is broken (described above).

**Issue #20 reports 3706 `notification.frame.reassembly.dropped` warnings from Path B.**
The `historicalPacketsReceivedThisSync` counter is incremented in Path A (`handleHistoricalSyncValue`).
These are independent: packets are silently swallowed in A (not reassembled = not written),
and dropped-byte warnings come from B.

During Gen4 historical sync, `handlePeripheralValueUpdate` (line 305–308) sets
`lastHandledWasHistoricalDataPacket = true` which **suppresses** `onNotification` for type-47
packets. Path B only sees type-47 notifications that arrive **outside** an active sync session,
or if the suppress logic races. However the `shouldDispatchNotificationSideEffectsToMain` guard
(lines 163–174) still calls `frames(in:value)` using Gen4 framing to decide whether to
dispatch — meaning the continuation bytes arrive at `gooseFrames` at least via the fan-out
raw-notification path (`onRawNotification`).

### Proposed fix approach for SYNC-09

The fix is in **Path A** (`CoreBluetoothBLETransport+Parsing.swift` / `CoreBluetoothBLETransport+HistoricalHandlers.swift`):

**Option 1 (preferred — matches existing buffer pattern):** Add a per-characteristic
continuation buffer to `CoreBluetoothBLETransport` for the Gen4 historical notification
characteristic. When `gen4Frames` cannot complete a frame (tail bytes remain), append them to
the buffer. Prepend the buffer to the next notification's data before calling `gen4Frames`.
This mirrors exactly what `GooseAppModel.gooseFrames` does with `frameReassemblyBuffers`.

Concretely:
- Add `var gen4HistoricalFrameBuffer: Data = Data()` to `GooseBLEHistoricalManager`
- In `handleHistoricalSyncValue`, prepend `historicalManager.gen4HistoricalFrameBuffer` to
  `value` before calling `frames(in:value)`
- After `gen4Frames`, check if the last attempted frame was incomplete: if
  `bytes.count >= 4 && bytes.count < declaredLength + 4`, store the tail in the buffer
- On sync completion (`completeHistoricalSync` / `failHistoricalSync`), clear the buffer

**Option 2 (smaller):** Replace the `break` in `gen4Frames` with a return of the unconsumed
tail, giving callers the ability to persist it. Requires a new return type from `gen4Frames`.

Option 1 is preferred: it keeps the fix local to `GooseBLEHistoricalManager` and
`handleHistoricalSyncValue`, does not change the `gen4Frames` API, and is self-cleaning on
sync start/end.

The buffer key should be per-characteristic UUID so concurrent characteristics don't collide
(matches the `frameReassemblyKey` pattern in GooseAppModel).

---

## SYNC-11: HISTORICAL_DATA_RESULT Identity Validation

### Exact Swift file:function handling the ACK

**File:** `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift`
**Function:** `handleHistoricalCommandResponse(_ payload: [UInt8])` — line 438

This function handles all historical command responses. For `historicalDataResult` (cmd 23)
the relevant case is at line 599:

```swift
case .historicalDataResult:
    historicalManager.pendingHistoryEndAckPayload = nil
    if historicalManager.historyCompleteReceived {
        completeHistoricalSync(reason: "history_complete")
    } else {
        scheduleHistoricalIdleCompletion(reason: "history_end_ack_idle")
    }
```

There is **no identity validation** here. The response payload from the strap is received,
the command is consumed, and sync either completes or waits for `HistoryComplete`. The
8-byte identity payload the strap echoes back is never read.

### Current payload handling

The full `handleHistoricalCommandResponse` guard (lines 438–443):

```swift
guard payload.count >= 5,
      let pending = historicalManager.pendingHistoricalCommand,
      payload[2] == pending.kind.commandNumber,
      payload[3] == pending.sequence else {
    return
}
```

For `historicalDataResult` specifically:
- `payload[2]` must equal `23` (cmd number)
- `payload[3]` must match the sent sequence byte
- `payload[4]` is the result code (checked at line 469: `1` = success, `2` = pending)

The strap's response to cmd 23 has this layout (Gen4 observed structure from issue #20):

```
payload[0]  = packet type (0x24 = commandResponse = 36)
payload[1]  = ??? (observed padding/version)
payload[2]  = command number = 23
payload[3]  = echoed sequence byte
payload[4]  = result code (1 = success)
payload[5..12] = 8-byte device identity (strap serial or hardware ID)
```

The 8 bytes at `payload[5..<13]` (or `payload[1..<9]` relative to the body after stripping
the 4-byte Gen4 frame header and packet-type byte) are what SYNC-11 calls the "identity
payload." These bytes uniquely identify the connected strap hardware. Mismatched identity
means the strap responding to the ACK is not the device that initiated the sync.

### Where connected device identity is available

The `CoreBluetoothBLETransport` holds these identity anchors:

| Property | Location | Value |
|----------|----------|-------|
| `activePeripheral?.identifier` | `CoreBluetoothBLETransport.swift` line 266 | `UUID` assigned by CoreBluetooth on first connection |
| `rememberedDeviceID` | `CoreBluetoothBLETransport.swift` line 286 | persisted `UUID` from UserDefaults |
| `selectedDeviceID` | `CoreBluetoothBLETransport.swift` line 32 | `UUID?` of actively selected device |
| `rememberedDeviceName` | `CoreBluetoothBLETransport.swift` line 287 | display name string |

The CoreBluetooth `peripheral.identifier` is a UUID generated by iOS — it does **not**
directly correspond to the 8 bytes in the strap's HISTORICAL_DATA_RESULT response.

The 8-byte identity in the strap response is the strap's own hardware serial / firmware
identity, not the CoreBluetooth UUID. The correct comparison is:

- During a previous authenticated session, cmd 34 (GET_DATA_RANGE) response carries the same
  identity bytes at `payload[5..<13]` (observed in issue #20 captures).
- SYNC-11 should: read `payload[5..<13]` from the cmd 23 response; compare to the identity
  bytes captured from the cmd 34 response (stored in `historicalManager` during the same sync
  session); abort if they differ.

### Proposed fix approach for SYNC-11

**What to add to `GooseBLEHistoricalManager`:**

```swift
var connectedStrapIdentity: [UInt8]? = nil   // captured from cmd 34 response
```

**In `handleHistoricalCommandResponse`, getDataRange success branch (line 525+):**

```swift
case .getDataRange:
    // Capture 8-byte strap identity from cmd 34 response for later validation
    if payload.count >= 13 {
        historicalManager.connectedStrapIdentity = Array(payload[5..<13])
    }
    // ... rest of existing logic
```

**In `handleHistoricalCommandResponse`, historicalDataResult branch (line 599):**

```swift
case .historicalDataResult:
    // Validate 8-byte identity echoed in cmd 23 response
    if payload.count >= 13,
       let expectedIdentity = historicalManager.connectedStrapIdentity {
        let respondingIdentity = Array(payload[5..<13])
        if respondingIdentity != expectedIdentity {
            let expected = Data(expectedIdentity).hexString
            let got = Data(respondingIdentity).hexString
            record(
                level: .error,
                source: "ble.sync",
                title: "historical_sync.identity_mismatch",
                body: "expected=\(expected) got=\(got)"
            )
            failHistoricalSync("HISTORICAL_DATA_RESULT identity mismatch: expected \(expected), got \(got).")
            return
        }
    }
    historicalManager.pendingHistoryEndAckPayload = nil
    if historicalManager.historyCompleteReceived {
        completeHistoricalSync(reason: "history_complete")
    } else {
        scheduleHistoricalIdleCompletion(reason: "history_end_ack_idle")
    }
```

**Clear on sync start** (`beginHistoricalSync`):

```swift
historicalManager.connectedStrapIdentity = nil
```

**Identity byte offset note:** The exact offset of the 8 identity bytes in the cmd 23/34
response payload depends on the strap firmware. Issue #20 states the payload is 8 bytes of
identity starting at byte index 1 of the ACK. In the context of `handleHistoricalCommandResponse`,
`payload` is the Gen4 frame payload (everything after the 4-byte header, including the packet
type byte at index 0). The layout is therefore:

```
payload[0] = packet type byte (36 = commandResponse)
payload[1] = sequence/flags byte  
payload[2] = command number (23)
payload[3] = echoed sequence
payload[4] = result code
payload[5..12] = 8 identity bytes
```

If hardware captures show the identity at a different offset, the planner must adjust and add
a `payload.count >= N` guard using `>=` not `>` (off-by-one pitfall: `>` silently rejects
exactly-N-byte payloads, the minimum valid case).

The identity should also be cleared from `historicalManager` in `completeHistoricalSync` and
`failHistoricalSync` for safety.

---

## Rust/Swift Boundary

### What Rust owns vs Swift for each fix

| Fix | Rust | Swift |
|-----|------|-------|
| SYNC-09 | Nothing — the frame reassembly bug is entirely in Swift. Rust `protocol.rs` `FrameAccumulator` exists but is not used in this path. Rust `parse_frame` / `import_captured_frame_batch` only see already-complete frame hex strings. | Add continuation buffer in `GooseBLEHistoricalManager`; patch `handleHistoricalSyncValue` to prepend it. |
| SYNC-11 | Nothing — cmd 23 response parsing is purely Swift. Rust bridge (`capture.import_frame_batch`) receives frame hex after sync, not during ACK validation. | Capture identity from cmd 34 response; validate in cmd 23 response handler; abort on mismatch. |

### Files to change

**SYNC-09:**
- `GooseSwift/GooseBLEHistoricalManager.swift` — add `gen4HistoricalFrameBuffer: Data`
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — patch `handleHistoricalSyncValue` and clear buffer in `completeHistoricalSync` / `failHistoricalSync`
- Optionally: `GooseSwift/CoreBluetoothBLETransport+HistoricalCommands.swift` — clear buffer in `beginHistoricalSync`

**SYNC-11:**
- `GooseSwift/GooseBLEHistoricalManager.swift` — add `connectedStrapIdentity: [UInt8]?`
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — capture in `getDataRange` success path; validate+abort in `historicalDataResult` path; clear in complete/fail/begin

### Test strategy

**SYNC-09 — unit test in `GooseSwiftTests/`:**
- Write a test that calls `gen4Frames(in:)` with a multi-notification stream split across two
  `Data` values, simulating a large type-47 frame arriving in two BLE notifications.
- Verify the continuation buffer stores the tail correctly.
- Verify the second call completes the frame and the assembled result matches the expected frame.
- Verify `historicalPacketsReceivedThisSync` increments once (not zero) after both notifications.

**SYNC-09 — integration:**
- Run a real Gen4 historical sync and verify `notification.frame.reassembly.dropped` count
  drops to zero (issue #20 baseline: 3706 drops).

**SYNC-11 — unit test in `GooseSwiftTests/`:**
- Construct a mock cmd 34 response payload with a known 8-byte identity.
- Verify `connectedStrapIdentity` is set correctly.
- Construct a cmd 23 response with matching identity → verify `completeHistoricalSync` called.
- Construct a cmd 23 response with mismatched identity → verify `failHistoricalSync` called
  with an "identity_mismatch" reason.
- Guard: use `payload.count >= 13` (not `> 13`) to avoid silent rejection of minimum-length payloads.

**SYNC-11 — simulator:**
- Not fully testable without physical Gen4 device. Unit tests are the primary gate.
- Existing `GooseSwiftTests/` covers BLE transport logic via mock peripherals.

### No Rust changes required

Neither fix touches the Rust bridge. Rust `protocol.rs::FrameAccumulator` is a parallel
implementation that is not in the hot path for Gen4 historical sync. The Rust `parse_frame`
function is only called after Swift has assembled and stored complete frame hex strings.

---

## Summary of Key Facts

| Fact | Source |
|------|--------|
| `notification.frame.reassembly.dropped` logged in `GooseAppModel+NotificationPipeline.swift` lines 44–50, 103–109, 133–139 | Direct inspection |
| Drop fires when continuation bytes don't start with `0xaa` — `droppedBytes += bytes.count` at line 875 | Direct inspection |
| Gen4 header = 4 bytes; payload length at `buffer[1..2]` u16 LE | `protocol.rs` lines 419–428, `gooseFrames` line 850 |
| `V5PacketType.historicalData = 47` (0x2F); `V5PacketType.historicalIMUDataStream = 52` | `CoreBluetoothBLETransport.swift` lines 788–790 |
| Gen4 historical characteristic: `61080005-8d6d-82b8-614a-1c8cb0f8dcc6` in `notificationCharacteristicIDs` | `CoreBluetoothBLETransport.swift` lines 413–421 |
| `handleHistoricalSyncValue` uses `CoreBluetoothBLETransport.frames(in:)` (separate from `gooseFrames`) | `HistoricalHandlers.swift` line 11 |
| `gen4Frames` `break`s when `bytes.count < expectedLength` — no partial buffer returned to caller | `Parsing.swift` lines 1031–1033 |
| `maximumBufferedFrameBytes = 64 * 1024` (65536 bytes) — not the bottleneck | `GooseAppModel.swift` line 200 |
| `handleHistoricalCommandResponse` receives cmd 23 response at line 438; no identity check present | `HistoricalHandlers.swift` lines 438–607 |
| `historicalDataResultPayload(fromHistoryEndMetadataPayload:)` uses `payload[13..<21]` for V5 ACK | `Parsing.swift` lines 983–991 |
| `connectedStrapIdentity` does not exist yet — needs to be added | Codebase inspection |
| Connected device: `activePeripheral?.identifier` (CoreBluetooth UUID, not strap hardware ID) | `CoreBluetoothBLETransport.swift` line 266 |
