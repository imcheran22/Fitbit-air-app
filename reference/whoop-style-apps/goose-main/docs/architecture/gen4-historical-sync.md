# Gen4 Historical Sync

This document covers the wire-level differences between WHOOP Gen4 and Gen5 historical data synchronisation, the state machine used in Goose, and the implementation map for the Swift code.

## Wire-level differences

### Gen5 command sequence

1. `GET_DATA_RANGE` (cmd 34) → strap replies with page range metadata
2. `SEND_HISTORICAL_DATA` (cmd 22) → strap begins streaming historical packets
3. `HISTORICAL_DATA_RESULT` (cmd 23) → app acknowledges each burst

### Gen4 command sequence

1. cmd 34 (`getDataRange`) → strap replies with last-synced page sequence number
2. cmd 22 (`sendHistoricalData`) → strap replies with a short Gen4 success ack (`02`)
3. cmd 23 (`historicalDataResult`) with `[0x01, LE32 page_seq, LE32 page_count=16]` → strap streams the requested page burst

The Gen4 page sequence is a monotonically increasing 32-bit counter. The app reads `last_synced` from bytes 10–13 of the cmd 34 response and sets `next_seq = last_synced + 1`.

## Frame framing differences

### Gen5 frame layout

```
[0xaa][len_lo][len_hi][padding_byte][payload...][crc32 x4]
```

- Payload is padded to a 4-byte boundary.
- `len` = declared payload length (includes trailing 4-byte CRC).

### Gen4 frame layout

```
[0xaa][len_lo][len_hi][crc8(len_bytes)][payload...][crc32 x4]
```

- Payload is **not** padded — Gen4 uses raw payload lengths.
- Byte 3 is `crc8([len_lo, len_hi])` rather than a padding byte.
- `len` = `payload.count + 4` (accounts for the trailing CRC32).

The CRC-8 polynomial is `0x07`, init `0x00`, matching the Rust `protocol.rs` implementation.

## State machine

```
beginHistoricalSync
  └── Gen4 fast-path ──► writeHistoricalCommand(.getDataRange)  [cmd 34]
                              │
                              ▼
                         handleHistoricalCommandResponse  [cmd 34 reply]
                              │  parse last_synced from bytes[10..13]
                              │  set gen4HistoricalPageSeq = last_synced + 1
                              │
                              ▼
                         writeHistoricalCommand(.sendHistoricalData)  [cmd 22]
                              │
                              ▼
                         handleHistoricalCommandResponse  [cmd 22 reply]
                              │  Gen4 short-circuit: 0x02 = Gen4 success ack
                              │  set pendingHistoryEndAckPayload = gen4PageRequestPayload(seq)
                              │
                              ▼
                         writeHistoricalCommand(.historicalDataResult)  [cmd 23]
                              │  strap streams historical packets
                              │
                     handleHistoricalMetadata(.historyEnd)
                              │  gen4HistoricalPageSeq += 1
                              │  ackPayload = gen4PageRequestPayload(next_seq)
                              │
                              ▼
                         writeHistoricalCommand(.historicalDataResult)  [next cmd 23]
                              │  ... repeats until no more pages ...
                              │
                     historyComplete / idle timeout
                              │
                              ▼
                         completeHistoricalSync
```

## Implementation map

| Change | File | Detail |
|--------|------|--------|
| `WhoopGeneration` enum | `GooseBLETypes.swift` | Enum with `.gen4`/`.gen5`; `detect(from:)`, `helloFrame`, `buildCommandFrame` |
| `whoopGenerationFromCapabilities()` method | `CoreBluetoothBLETransport+Commands.swift` | Derives `.gen4`/`.gen5` from `connectedCapabilities.wireProtocol`; called at sync start |
| `gen4HistoricalPageSeq` property | `GooseBLEHistoricalManager.swift` | UInt32 page counter, reset to 0 on sync start |
| `gen4Frames(in:)` / `gen4Payload(in:)` | `CoreBluetoothBLETransport+Parsing.swift` | Static Gen4 frame parsers |
| `frames(in:)` / `payload(in:)` | `CoreBluetoothBLETransport+Parsing.swift` | Instance dispatch to gen4/gen5 based on `whoopGenerationFromCapabilities()` |
| `gen4PageRequestPayload(seq:)` | `CoreBluetoothBLETransport+HistoricalCommands.swift` | Builds cmd 23 payload `[0x01, LE32 seq, 0x10, 0x00, 0x00, 0x00]` |
| Gen4 fast-path in `beginHistoricalSync` | `CoreBluetoothBLETransport+HistoricalCommands.swift` | Returns early for Gen4, ignores `firstCommandOverride` |
| Gen4 payload override in `writeHistoricalCommand` | `CoreBluetoothBLETransport+HistoricalCommands.swift` | Sends `[0x00]` for cmd 34/22 on Gen4 |
| Gen4 frame builder in `writeHistoricalCommand` | `CoreBluetoothBLETransport+HistoricalCommands.swift` | Uses `WhoopGeneration.buildCommandFrame` |
| Gen4 cmd 22 short-circuit | `CoreBluetoothBLETransport+HistoricalHandlers.swift` | Bypasses Gen5 result-code logic; advances to cmd 23 |
| Gen4 cmd 34 parsing | `CoreBluetoothBLETransport+HistoricalHandlers.swift` | Reads `last_synced` from bytes[10..13]; sets `gen4HistoricalPageSeq` |
| Gen4 `historyEnd` handler | `CoreBluetoothBLETransport+HistoricalHandlers.swift` | Increments `gen4HistoricalPageSeq`, builds next page request |
| Gen4 retry-skip | `CoreBluetoothBLETransport+DebugAndSync.swift` | Skips transfer retry when `historyCompleteReceived` is true |
| Gen4 hello frame | `CoreBluetoothBLETransport+UserActions.swift` | Sends `GET_HELLO` (cmd 145) in Gen4 framing instead of the Gen5 client hello |
| Reset on disconnect | `CoreBluetoothBLETransport+Parsing.swift` | Generation re-derived from capabilities in `resetLiveDeviceFieldsIfNeeded(for:)` |

## Known limitations

- **Page count hardcoded to 16** (`0x10, 0x00, 0x00, 0x00`). The official app uses 16 as the burst window; adjusting this may affect strap compatibility.
- **Gen4 cmd 34 body structure is partially documented.** Only `bytes[10..13]` (last-synced page sequence) is used. Additional fields (oldest page, end page, etc.) are not parsed.
- **No Gen4 range poll.** `historicalRangePollOnly` is respected (returns after cmd 34) but the page sequence information is logged only, not exposed as range telemetry.

## Success log example

```
ble.sync  historical_sync.started           trigger=manual first=gen4_get_data_range range_only=false override_ignored=none
ble.sync  historical_sync.command.sent      GET_DATA_RANGE seq=57 ...
ble.sync  historical_sync.gen4.range        last_synced=1234 next_seq=1235
ble.sync  historical_sync.command.sent      SEND_HISTORICAL_DATA seq=58 ...
ble.sync  historical_sync.gen4.transfer_ack seq=58 payload=...
ble.sync  historical_sync.gen4.transfer_armed next_seq=1235
ble.sync  historical_sync.command.sent      HISTORICAL_DATA_RESULT seq=59 ...
ble.sync  historical_sync.metadata          HISTORY_START
ble.sync  historical_sync.packet            count=1
  ... (more packets) ...
ble.sync  historical_sync.gen4.page_end     next_seq=1236 packets=42
ble.sync  historical_sync.command.sent      HISTORICAL_DATA_RESULT seq=60 ...
ble.sync  historical_sync.metadata          HISTORY_COMPLETE
ble.sync  historical_sync.completed         reason=history_result_ack_sent_after_complete 42 historical packets captured
```

## Protocol analysis notes

The Gen4 protocol differences from Gen5 were determined through hardware testing:

1. **Frame header** — Gen4 header byte 3 is `crc8(len_bytes)`; Gen5 uses a padding byte at the same offset.
2. **Command sequence** — cmd 34 → 22 → 23 sequence confirmed via live BLE capture against a real Gen4 strap.
3. **Page sequence** — bytes 10–13 of the cmd 34 response contain the last-synced page counter; subsequent cmd 23 requests with `seq = last_synced + 1` elicit historical data.

See `docs/architecture/ble-protocol-reference.md` for the full BLE protocol reference.
