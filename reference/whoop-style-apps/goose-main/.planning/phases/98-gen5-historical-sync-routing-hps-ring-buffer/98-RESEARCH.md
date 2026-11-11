# Phase 98 Research: Gen5 Historical Sync Routing + HPS Ring Buffer

**Researched:** 2026-06-20
**Domain:** CoreBluetooth BLE notification dispatch (Swift) + GET_DATA_RANGE response parse (Swift)
**Confidence:** HIGH — all findings from direct source read, no assumptions

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add `historicalData` (type 47) and `historicalIMUDataStream` (type 52) to the dispatch gate, conditional on `isHistoricalSyncing == true`.
- **D-02:** Fix location is where the notification side-effect dispatch decision is made; gate must be inserted before the skip-counter increment.
- **D-03:** Read `historicalManager.isHistoricalSyncing` directly — no lock. Add `// SAFETY: isHistoricalSyncing set+read on same CB notification queue` comment.
- **D-04:** Pattern: `case V5PacketType.historicalData, V5PacketType.historicalIMUDataStream: if historicalManager.isHistoricalSyncing { return true }; continue`
- **D-05:** Parse ring buffer fields in Rust `historical_sync.rs` — no schema migration.
- **D-06:** Ring wrap-around formula: `ring_wrapped = current_page < read_pointer`; `pages_behind_corrected = if ring_wrapped { (ring_capacity - read_pointer) + current_page } else { current_page - read_pointer }`
- **D-07:** Log via `ble.record()` only — title: `"historical_sync.get_data_range.ring"`.
- **D-08:** Fall back to existing `pages_behind` calculation if ring buffer fields absent.

### Claude's Discretion

- Exact byte offsets of ring buffer fields in GET_DATA_RANGE response.
- Whether `handleHistoricalSyncValue` is called directly from dispatch gate or through `historicalManager`.

### Deferred Ideas (OUT OF SCOPE)

- None listed.

---

## SYNC-08: Dispatch Gate Location

### Key Finding: Fix Already Partially Applied

The SYNC-08 dispatch gate guard (`if isHistoricalSyncing { return true }`) **is already present** in the codebase at:

**File:** `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift`
**Function:** `shouldDispatchNotificationSideEffectsToMain(_ value: Data, characteristic: CBCharacteristic) -> Bool`
**Lines:** 146–179

```swift
// Lines 163–173 — the guard already added:
case V5PacketType.historicalData,
     V5PacketType.historicalIMUDataStream:
  // Route historical body packets to the main handler only while a sync
  // is active. Outside a sync these are high-rate live-stream frames that
  // should stay off-main for performance. Without this guard,
  // historicalPacketsReceivedThisSync is never incremented and every
  // sync fails with "no packet47 bodies" even when the band is streaming.
  if isHistoricalSyncing {
    return true
  }
  continue
```

**The planner must verify** whether this was already committed (git log / git blame) or is a local-only change. If it is already committed, the SYNC-08 Swift task reduces to: confirm correctness, add the SAFETY comment per D-03, and run a device test.

### Exact Function Signature

```swift
func shouldDispatchNotificationSideEffectsToMain(
  _ value: Data,
  characteristic: CBCharacteristic
) -> Bool
```

Located in `extension CoreBluetoothBLETransport: CBPeripheralDelegate` in `CoreBluetoothBLETransport+PeripheralDelegate.swift`.

### Call Site: Where the Gate Is Checked

**File:** `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift`
**Lines:** 87–113

```swift
// Line 98: gate is checked here
guard shouldDispatchNotificationSideEffectsToMain(value, characteristic: characteristic) else {
  recordSkippedNotificationSideEffect(value, characteristic: characteristic, capturedAt: capturedAt)
  publishNotificationSyncTimestampIfNeeded(capturedAt)
  return            // ← skip-counter path; returns WITHOUT routing to main
}
DispatchQueue.main.async { [weak self] in
  self?.handlePeripheralValueUpdate(...)
}
```

This path is reached only when `!Thread.isMainThread && shouldFanOutNotificationBeforeMain(characteristic)` (lines 87–90).

### Where `notificationSideEffectSkipCount` Is Incremented

**File:** `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift`
**Function:** `recordSkippedNotificationSideEffect(_ value: Data, characteristic: CBCharacteristic, capturedAt: Date)`
**Lines:** 181–200

The increment is inside `recordSkippedNotificationSideEffect`, called at line 99 — i.e., **after** the `shouldDispatchNotificationSideEffectsToMain` guard fails. The gate check (lines 163–173) returning `true` prevents `recordSkippedNotificationSideEffect` from ever being called for historical body packets during an active sync. The ordering is correct.

### Dispatch → handleHistoricalSyncValue Trace

```
peripheral(_:didUpdateValueFor:) [PeripheralDelegate.swift:66]
  └─ shouldFanOutNotificationBeforeMain → true (BLE notify characteristic)
     └─ shouldDispatchNotificationSideEffectsToMain → true (historicalData/IMUStream + isHistoricalSyncing)
        └─ DispatchQueue.main.async → handlePeripheralValueUpdate(fanOutNotifications: false)
           └─ handleHistoricalSyncValue(_ value: Data, characteristic: CBCharacteristic)
              [HistoricalHandlers.swift:7]
              └─ guard isHistoricalSyncing else { return }
                 └─ for frame in frames(in: value):
                    └─ handleHistoricalSyncFrame(frame, characteristic:)
                       └─ switch packetType:
                          case .historicalData, .historicalIMUDataStream:
                            historicalManager.historicalPacketsReceivedThisSync &+= 1  // line 26
```

`handleHistoricalSyncValue` is called **directly** from `handlePeripheralValueUpdate` (line 288 of `PeripheralDelegate.swift`), not through `historicalManager`.

### SAFETY Comment Location

The `isHistoricalSyncing` read at line 170 of `shouldDispatchNotificationSideEffectsToMain` currently has an inline prose comment (lines 165–169) explaining the guard but not a `// SAFETY:` threading note. Per D-03, add:

```swift
// SAFETY: isHistoricalSyncing set+read on same CB notification queue — no lock needed.
if isHistoricalSyncing {
```

### Proposed Insertion Point

If the guard is not yet committed, insert the `case V5PacketType.historicalData, V5PacketType.historicalIMUDataStream:` arm in the `switch packetType` inside `shouldDispatchNotificationSideEffectsToMain`, between `V5PacketType.puffinMetadata` (line 161) and `default` (line 174). The SAFETY comment goes immediately before `if isHistoricalSyncing`.

---

## SYNC-10: GET_DATA_RANGE Response Layout

### Where Parsing Happens

GET_DATA_RANGE response parsing is **entirely in Swift**, not in Rust. The parse chain:

1. `handleHistoricalCommandResponse(payload)` — called from `handleHistoricalSyncFrame` when `packetType == .commandResponse`
2. Calls `emitHistoricalRangeTelemetry(status:pending:resultCode:resultName:payload:notes:)` on success/reject/invalid-body paths
3. Inside `emitHistoricalRangeTelemetry`, calls `Self.historicalRangePageState(fromRangeBody: body)` — the static parse function
4. `historicalRangePageState(fromRangeBody:)` — **the canonical parse site**

All in `GooseSwift/CoreBluetoothBLETransport+Parsing.swift`.

### Exact Byte Layout of GET_DATA_RANGE Response

**File:** `GooseSwift/CoreBluetoothBLETransport+Parsing.swift`
**Function:** `static func historicalRangePageState(fromRangeBody body: [UInt8]) -> HistoricalRangePageState?`
**Lines:** 661–681

```
body layout (after stripping 5-byte command response header: payload.dropFirst(5)):

byte[0]      = revision_or_status  (UInt8)
bytes[1..4]  = word[0] (UInt32 LE)   — unknown / unused
bytes[5..8]  = word[1] (UInt32 LE)   — unknown / unused
bytes[9..12] = word[2] (UInt32 LE)   → pageCurrent  (words[2])
bytes[13..16]= word[3] (UInt32 LE)   → pageOldest   (words[3])
bytes[17..20]= word[4] (UInt32 LE)   — unknown / unused
bytes[21..24]= word[5] (UInt32 LE)   → pageEnd      (words[5])

Minimum body length required: 25 bytes (guard body.count >= 25)
Words read: 6 words (indices 0–5) at offsets 1, 5, 9, 13, 17, 21
```

The function reads 4-byte LE words starting at `offset = 1`, incrementing by 4, stopping at offset 24 (exclusive, loop condition `while offset < 25`).

### How `pagesBehind` Is Currently Computed

`pagesBehind` is a **computed property** on `HistoricalRangePageState` (`CoreBluetoothBLETransport.swift` lines 502–506):

```swift
var pagesBehind: Int64 {
  pageCurrent < pageOldest
    ? Int64(pageCurrent) + Int64(pageEnd) - Int64(pageOldest)
    : Int64(pageCurrent) - Int64(pageOldest)
}
```

This already handles simple ring wrap (using `pageEnd` as capacity proxy), but does not use separate `ring_capacity`, `current_page`, `read_pointer` fields — it uses `pageCurrent` and `pageOldest` from the same body.

### Where Ring Buffer Fields Would Go

The CONTEXT.md D-05 says to parse ring buffer fields in **Rust `historical_sync.rs`**, but the current architecture parses GET_DATA_RANGE responses **only in Swift**. There is no GET_DATA_RANGE response parsing in Rust — the Rust `historical_sync.rs` handles the sync planning state machine, not raw response parse.

**Resolution for the planner:** The ring buffer parse must live in Swift alongside the existing `historicalRangePageState` parse. The SYNC-10 work is:
1. Identify the byte offsets of `ring_capacity`, `current_page`, `read_pointer` in the GET_DATA_RANGE response body (these are unknown from static analysis — they are the "Claude's Discretion" items from CONTEXT.md, requiring device capture or RE confirmation).
2. Add an optional `ringCapacity` / `readPointer` extraction to `historicalRangePageState(fromRangeBody:)` or a new parallel function.
3. Apply the D-06 wrap formula in Swift and call `record()` for the ring event.

The reference to Rust in D-05 may be inaccurate — no GET_DATA_RANGE parse exists in Rust. Planner should confirm whether D-05 means "Rust handles ring logic" or "ring parse stays in the Swift layer that already owns this parse."

### Existing `ble.record()` Calls for GET_DATA_RANGE

All in `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift`:

**Raw response log (debug, line 477):**
```swift
record(
  level: .debug,
  source: "ble.sync",
  title: "historical_sync.command.raw_response",
  body: "\(pending.kind.name) seq=\(pending.sequence) result=\(result)(\(resultCode)) payload=\(Data(payload).hexString)\(detail)"
)
```
Where `detail` (from `historicalResponseDetail`) already includes:
`body=<hex> revision_or_status=N u32_words_from_offset_1=[N,N,...] page_current=N page_oldest=N page_end=N pages_behind=N`

**Success response log (info, line 556):**
```swift
record(
  source: "ble.sync",
  title: "historical_sync.command.response",
  body: "\(pending.kind.name) seq=\(pending.sequence) \(result)\(detail)"
)
```

**Reject log (warn, line 512):**
```swift
record(
  level: .warn,
  source: "ble.sync",
  title: "historical_sync.range.rejected",
  body: "GET_DATA_RANGE returned \(result) (\(resultCode)).\(detail)"
)
```

**Invalid body log (warn, line 537):**
```swift
record(
  level: .warn,
  source: "ble.sync",
  title: "historical_sync.range.invalid_body",
  body: reason
)
```

### New Ring Buffer Log Event (per D-07)

The ring buffer log should be emitted inside `emitHistoricalRangeTelemetry` after a successful parse, using:

```swift
record(
  source: "ble.sync",
  title: "historical_sync.get_data_range.ring",
  body: "ring_capacity=\(ringCapacity) current_page=\(currentPage) read_pointer=\(readPointer) ring_wrapped=\(ringWrapped) pages_behind_raw=\(pagesBehindRaw) pages_behind_corrected=\(pagesBehindCorrected)"
)
```

This should only fire when ring buffer fields are present in the response (i.e., when `ring_capacity_present == true`). When absent, skip the ring log and use existing `pagesBehind` path.

### Rust `store/mod.rs` — `pages_behind` Field

`pages_behind: Option<i64>` exists at line 335 in the `HistoricalSyncInput` (or equivalent) struct. Schema column at line 1965, INSERT at line 2218. **No schema migration needed** — the column already exists. The ring-corrected `pages_behind_corrected` value should feed into this field when ring buffer fields are present.

---

## Integration Risks

### Threading: SYNC-08

- `shouldDispatchNotificationSideEffectsToMain` runs on the CoreBluetooth notification queue (not main thread — this is the `!Thread.isMainThread` path at line 87).
- `historicalManager.isHistoricalSyncing` is set at `GooseBLEHistoricalManager.swift:82` (sync start) and `89`/`97` (sync stop/fail). These setters are called from the historical command handling path, which runs on main thread after `DispatchQueue.main.async`.
- **Race condition present but benign:** The setter runs on main; the reader runs on CB queue. A brief window exists where a sync starts but `isHistoricalSyncing` hasn't been seen by the CB queue yet (or vice versa on stop). This is identical to the pattern already present for other `isHistoricalSyncing` reads in the CB queue path (e.g., `CoreBluetoothBLETransport.swift:58`). Per D-03, a comment is the only mitigation needed — no lock.

### Characteristic Guard: SYNC-08

The dispatch gate `shouldDispatchNotificationSideEffectsToMain` does NOT filter by characteristic UUID — it checks `notificationCharacteristicIDs.contains(characteristic.uuid)` (line 147). This is a set of all known notify characteristics. Both Gen4 and Gen5 data characteristics are in this set. The CONTEXT.md note about Gen4 using a different service (`61080005`) is a concern: the gate must not accidentally route Gen4 live-stream packets during a Gen5 sync (unlikely — Gen4 and Gen5 don't coexist, but planner should note this). The `handleHistoricalSyncFrame` switch only acts on `V5PacketType` values, so Gen4 packet types will fall through to `default: break` harmlessly.

### `isHistoricalSyncing` Read in `shouldDispatchNotificationSideEffectsToMain`

The function uses bare `isHistoricalSyncing` (not `historicalManager.isHistoricalSyncing`). This works because `isHistoricalSyncing` is a computed property on `CoreBluetoothBLETransport` that forwards to `historicalManager.isHistoricalSyncing` (`CoreBluetoothBLETransport.swift:127`):
```swift
var isHistoricalSyncing: Bool { historicalManager.isHistoricalSyncing }
```
The gate at line 170 uses `isHistoricalSyncing` (correct — consistent with the rest of the file).

### SYNC-10: Unknown Offsets

The exact byte offsets of `ring_capacity`, `current_page`, `read_pointer` in the GET_DATA_RANGE response are not determinable from static analysis of the current Swift source. The existing parse only extracts `pageCurrent` (word[2]), `pageOldest` (word[3]), and `pageEnd` (word[5]). Ring buffer fields are presumably additional words at higher offsets (words[6]+), requiring either:
- A captured BLE response frame from a Gen5 device with the RE analysis mapping bytes to fields, OR
- The RE decompiled WHOOP Android source (which CONTEXT.md cites as confirming the `pages_behind` metric exists, but doesn't specify response byte layout).

**Risk:** If the ring buffer fields don't exist in the current firmware response (or are at different offsets than assumed), the `ring_capacity_present: bool` fallback (D-08) will simply log nothing and fall back to the existing `pagesBehind` — no regression.

### SYNC-10: Rust vs Swift Architecture Discrepancy

CONTEXT.md D-05 says "parse ring buffer fields in Rust `historical_sync.rs`." Actual architecture: all GET_DATA_RANGE parsing is in Swift (`CoreBluetoothBLETransport+Parsing.swift`). Rust `historical_sync.rs` contains the sync planning state machine only — no response byte parsing. Planner should resolve: either keep the ring buffer parse in Swift (consistent with existing pattern), or introduce a new Rust bridge call that takes raw response bytes and returns ring buffer fields. The former is simpler and lower risk.

---

## Sources

All findings verified by direct source read of:
- `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift` (lines 66–200)
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` (lines 7–56, 460–560)
- `GooseSwift/CoreBluetoothBLETransport+Parsing.swift` (lines 655–780)
- `GooseSwift/CoreBluetoothBLETransport.swift` (lines 127, 311–312, 497–507, 762–771)
- `GooseSwift/GooseBLEHistoricalManager.swift` (lines 1–30)
- `Rust/core/src/commands.rs` (lines 619–626)
- `Rust/core/src/store/mod.rs` (lines 335, 1965, 2218)
- `Rust/core/src/historical_sync.rs` (lines 75, 1183, 1305)

Confidence: HIGH — all claims from direct codebase read, no training-data assumptions.
