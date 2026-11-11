# WHOOP BLE Protocol — Implementation Reference

This document is a technical reference for the WHOOP BLE protocol as implemented in Goose. It covers both Gen4 and Gen5 straps.

## BLE connection layer

### Services

| Generation | Service UUID prefix | Command char prefix | Notification char prefix |
|------------|---------------------|---------------------|--------------------------|
| Gen5 | `fd4b0001-` | `fd4b0002-` | `fd4b0003-` / `fd4b0004-` / `fd4b0005-` / `fd4b0007-` |
| Gen4 | `61080001-` | `61080002-` | `61080003-` / `61080004-` / `61080005-` / `61080007-` |

Notification characteristics `fd4b0007-` / `61080007-` serve double-duty as debug menu characteristics.

### Write types

The command characteristic supports `.write` (with response) on most devices. `.writeWithoutResponse` is used as a fallback when `.write` is not available.

## Frame protocol

### Gen5 frame layout

```
Offset  Length  Field
0       1       Magic: 0xaa
1       2       Declared length (LE16): payload.count + 4
3       1       Padding (0x00)
4       N       Payload (padded to 4-byte boundary)
4+N     4       CRC32 of payload (LE32)
```

Total frame size: `declared_length + 8`

### Gen4 frame layout

```
Offset  Length  Field
0       1       Magic: 0xaa
1       2       Declared length (LE16): payload.count + 4
3       1       CRC-8 of bytes[1..2] (polynomial 0x07, init 0x00)
4       N       Payload (NOT padded)
4+N     4       CRC32 of payload (LE32)
```

Total frame size: `declared_length + 4`

### Payload structure (both generations)

```
Offset  Field
0       Packet type byte
1       Sequence number (UInt8, wraps at max)
2       Command/event number (UInt8)
3+      Body (type-specific)
```

### Packet type bytes

| Value | Name | Direction |
|-------|------|-----------|
| `0x23` (35) | `command` | App → Strap |
| `0x24` (36) | `commandResponse` | Strap → App |
| `0x25` (37) | `puffinCommand` | App → Strap |
| `0x26` (38) | `puffinCommandResponse` | Strap → App |
| `0x28` (40) | `realtimeData` | Strap → App |
| `0x2B` (43) | `realtimeRawData` | Strap → App |
| `0x2F` (47) | `historicalData` | Strap → App |
| `0x30` (48) | `event` | Strap → App (unsolicited) |
| `0x31` (49) | `metadata` | Strap → App |
| `0x33` (51) | `realtimeIMUDataStream` | Strap → App |
| `0x34` (52) | `historicalIMUDataStream` | Strap → App |
| `0x35` (53) | `relativePuffinEvents` | Strap → App |
| `0x36` (54) | `puffinEventsFromStrap` | Strap → App |
| `0x38` (56) | `puffinMetadata` | Strap → App |
| `0x10` (16) | `r22RealtimeData` | Strap → App (WHOOP 5.0) |

## Connection handshake

### Gen5

1. App discovers GATT characteristics.
2. App subscribes to all notification characteristics.
3. App sends a static `CLIENT_HELLO` frame on the command characteristic. The hello frame is a captured byte sequence from production traffic; it does not encode a timestamp or session ID.
4. Strap begins advertising live physiology if a physiology stream was active.

### Gen4

1. App discovers GATT characteristics.
2. App subscribes to all notification characteristics.
3. App sends `GET_HELLO` (cmd 145) in Gen4 framing with an empty body.
4. Strap replies and is ready for commands.

## Live physiology capture

### Start/stop commands

| Command | Cmd# | Direction | Notes |
|---------|------|-----------|-------|
| `START_PHYSIOLOGY_CAPTURE` | varies | App → Strap | Enables PPG, accelerometer, etc. |
| `STOP_PHYSIOLOGY_CAPTURE` | varies | App → Strap | |

### Sensor stream command numbers

Sensor stream commands use cmd numbers in the 80–120 range (approximate). The exact numbers are defined in `SensorStreamCommandKind` in the codebase.

### High-frequency history sync

- cmd 85 (0x55): Enable high-frequency sync (interval + duration args)
- cmd 86 (0x56): Disable high-frequency sync

## Historical data sync

### Gen5 sequence

```
App   ──── cmd 34 (GET_DATA_RANGE, payload=[]) ────────────────► Strap
Strap ◄─── cmd 34 response (result=1, page range metadata) ─────
App   ──── cmd 22 (SEND_HISTORICAL_DATA, payload=[]) ──────────► Strap
Strap ◄─── cmd 22 response (result=2 PENDING, or 1 OK)
           ... (result=2 responses may repeat) ...
Strap ──── historical data packets (type 0x05, 0x06) ──────────► App
Strap ──── HISTORY_START metadata (type 0x04) ──────────────────► App
Strap ──── historical data packets ─────────────────────────────► App
Strap ──── HISTORY_END metadata (type 0x04) ────────────────────► App
App   ──── cmd 23 (HISTORICAL_DATA_RESULT, ack payload) ────────► Strap
           ... (next burst, repeating HISTORY_START/END/packets) ...
Strap ──── HISTORY_COMPLETE metadata ───────────────────────────► App
```

### Gen4 sequence

```
App   ──── cmd 34 ([0x00]) ─────────────────────────────────────► Strap
Strap ◄─── cmd 34 response (result=1, bytes[10..13]=last_synced)
App   ──── cmd 22 ([0x00]) ─────────────────────────────────────► Strap
Strap ◄─── cmd 22 response (result=0x02 = Gen4 success ack)
App   ──── cmd 23 ([0x01, LE32 page_seq, 0x10,0x00,0x00,0x00]) ► Strap
Strap ──── historical data packets ─────────────────────────────► App
Strap ──── HISTORY_END metadata ────────────────────────────────► App
App   ──── cmd 23 ([0x01, LE32 next_page_seq, 0x10,...]) ───────► Strap
           ... (repeats, page_seq incrementing each burst) ...
Strap ──── HISTORY_COMPLETE metadata ───────────────────────────► App
```

### Metadata kinds

| Value | Name | Notes |
|-------|------|-------|
| 1 | `HISTORY_START` | Burst start marker |
| 2 | `HISTORY_END` | Burst end marker; carries ack payload (Gen5) |
| 3 | `HISTORY_COMPLETE` | All history transferred |

### GET_DATA_RANGE response body (Gen5)

Bytes 5+ of the result-code-1 response body contain page range fields. The Goose implementation uses `historicalDataResultPayload(fromHistoryEndMetadataPayload:)` to extract the ack bytes from HISTORY_END metadata (not from GET_DATA_RANGE directly).

### GET_DATA_RANGE response body (Gen4)

| Offset | Length | Field |
|--------|--------|-------|
| 5 | ? | Unknown fields |
| 10 | 4 | `last_synced` page sequence (LE32) |
| 14+ | ? | Unknown fields |

Only `last_synced` is used. The next page to request is `last_synced + 1`.

### HISTORICAL_DATA_RESULT payload (Gen4)

```
[0x01][LE32 page_seq][0x10][0x00][0x00][0x00]
```

- Byte 0: flags (`0x01`)
- Bytes 1–4: page sequence number (LE32)
- Bytes 5–8: page count (`0x00000010` = 16)

## Additional commands

### Clock commands

| Command | Cmd# | Notes |
|---------|------|-------|
| `GET_CLOCK` | 10 | Reads strap epoch timestamp |
| `SET_CLOCK` | 11 | Sets strap epoch timestamp |

Response body for `GET_CLOCK`: epoch seconds + subseconds in 1/32768 units.

### Alarm commands

| Command | Cmd# |
|---------|------|
| Schedule alarm | 66 |
| Cancel alarm | 67 |
| Disable all alarms | 68 |
| List alarms | 69 |

Alarm events are emitted asynchronously with event numbers 56–60.

### Battery

Battery level is read from the standard BLE Battery Service (`0x180F` / `0x2A19`). Battery Level Status (`0x2BEB`) is also read when available to detect charging state.

## Swift↔Rust pipeline

Raw BLE notification bytes flow through this pipeline:

```
CBPeripheralDelegate.didUpdateValue
  │  (coreBluetoothQueue or main, depending on characteristic)
  ▼
GooseAppModel.handleNotification  [GooseAppModel+NotificationPipeline.swift]
  │  notificationIngestQueue.async
  ▼
notificationIngestResult  [Swift-side frame reassembly — no Rust bridge call at this stage]
  │  Reassembles multi-packet frames in Swift, returns NotificationFrame[]
  │  main.async
  ▼
handleNotificationIngestResult
  ├── importCapturedFrames  → CaptureFrameWriteQueue → Rust bridge: capture.import_frame_batch
  └── parseNotificationFrames → NotificationFrameParser → Rust bridge: protocol.parse_frame_hex_batch
                                                            │
                                                            ▼
                                                        HealthDataStore
                                                        (metric queries on demand)
```

Historical sync packets follow a parallel path:

```
CBPeripheralDelegate.didUpdateValue
  │  (for historical notification characteristics)
  ▼
CoreBluetoothBLETransport.handleHistoricalSyncValue  [CoreBluetoothBLETransport+HistoricalHandlers.swift]
  │  frames(in: value)  →  gen4Frames or v5Frames based on activeDeviceGeneration
  │  payload(in: frame) →  gen4Payload or v5Payload
  ▼
handleHistoricalSyncFrame
  ├── historicalData/historicalIMUDataStream → count packets, schedule idle
  ├── metadata → handleHistoricalMetadata (HISTORY_START/END/COMPLETE)
  └── commandResponse → handleHistoricalCommandResponse
```

The Rust core receives raw frame bytes via `capture.import_frame_batch` and handles protocol decoding, metric extraction, and SQLite persistence independently of the Swift BLE layer.
