# Phase 100: BLE Reliability — MTU 247 + LE 2M PHY + Off-Wrist Detection - Research

**Researched:** 2026-06-21
**Domain:** CoreBluetooth MTU/PHY negotiation + WHOOP cmd 0x54 response parsing + SwiftUI status indicator
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: On-wrist indicator added to existing BLE status chip area (same zone as `connectionState == "ready"` indicator), not a new dedicated row
- D-02: Indicator only visible when `connectionState == "ready"` AND `isOnWrist != nil`; hidden when disconnected
- D-03: `isOnWrist: Bool?` — `nil` = unknown, `true` = confirmed on-wrist, `false` = confirmed off-wrist
- D-04: On disconnect (any state → not "ready"): reset `isOnWrist = nil`
- D-05: UI hides indicator entirely when `isOnWrist == nil`; no "last known state" display

### Claude's Discretion
- MTU/PHY call site: choose correct delegate timing (after `centralManager(_:didConnect:)` / after services discovered)
- Log `maximumWriteValueLength(for: .withoutResponse)` at session start
- `setPreferredPHY` call timing per CoreBluetooth delegate flow
- cmd 0x54 timing: send in same post-connect sequence as other init commands (after characteristic discovery/subscription)

### Deferred Ideas (OUT OF SCOPE)
- (none listed)
</user_constraints>

---

## Summary

Phase 100 ships two independent BLE improvements. BLE-01 adds MTU 247 + LE 2M PHY negotiation to the connect flow. BLE-02 adds cmd 0x54 (`GET_BODY_LOCATION_AND_STATUS`) on connect, parses the 4-byte response, and exposes `isOnWrist: Bool?` on `CoreBluetoothBLETransport` with a UI chip in `HomeDeviceStatusCard`.

Both improvements slot into the existing `processDiscoveredCharacteristics` call path. The connect flow is well-structured with a clear insertion point: `processDiscoveredCharacteristics` calls `sendClientHelloIfNeeded` once `commandCharacteristic` is found, then `bondingManager.transition(to: .completed(deviceID:))` fires which sets `connectionState = "ready"`. MTU logging and PHY preference go in `centralManager(_:didConnect:)` (immediately on connect, before service discovery). The 0x54 command goes in `processDiscoveredCharacteristics` after `sendClientHelloIfNeeded`.

**Primary recommendation:** Insert `setPreferredPHY` + MTU log in `centralManager(_:didConnect:)` (CentralDelegate extension). Insert `sendGetBodyLocationAndStatus()` call in `processDiscoveredCharacteristics` after line 1115 (`sendClientHelloIfNeeded`). Parse the 4-byte commandResponse frame in a new `handleGetBodyLocationResponse(_:)` method added to the HistoricalHandlers extension following the existing pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MTU negotiation request | BLE Transport (CoreBluetoothBLETransport) | — | CoreBluetooth API is on CBPeripheral; called from didConnect |
| PHY preference | BLE Transport (CoreBluetoothBLETransport) | — | CoreBluetooth API; fired in didConnect before service discovery |
| MTU logging | BLE Transport | — | `maximumWriteValueLength` is a CBPeripheral property read after connect |
| cmd 0x54 send | BLE Transport (Commands extension) | — | Same write path as all other WHOOP commands |
| cmd 0x54 response parse | BLE Transport (HistoricalHandlers extension) | — | All commandResponse frames are parsed in `handlePeripheralValueUpdate` dispatch chain |
| `isOnWrist` state | CoreBluetoothBLETransport (@Observable var) | — | Pattern matches `batteryLevelPercent`, `batteryIsCharging` etc. |
| On-wrist UI chip | HomeDeviceStatusCard (HomeDashboardView.swift) | — | Existing BLE status card; D-01 locks placement |

---

## BLE-01: CoreBluetooth MTU / PHY APIs

### MTU

`CBPeripheral.maximumWriteValueLength(for:)` is a **read-only property** — it queries the current negotiated MTU, it does not request one. iOS CoreBluetooth negotiates MTU automatically during connection; the host cannot explicitly request a specific MTU value via the public API. The correct approach is to log the effective MTU after connect and use it to size writes.

```swift
// Source: Apple CoreBluetooth docs [ASSUMED — training knowledge, confirmed by absence of requestMTU in codebase grep]
let mtu = peripheral.maximumWriteValueLength(for: .withoutResponse)
// Typical: 182 on iOS when OS negotiates, up to 244 bytes payload (247 MTU - 3 ATT header)
// Log and record for diagnostics
```

Call site: `centralManager(_:didConnect:)` in `CoreBluetoothBLETransport+CentralDelegate.swift`, immediately after the guard checks pass and before `peripheral.discoverServices(...)` (currently line ~221). [VERIFIED: codebase grep — no `maximumWriteValueLength` call currently exists anywhere in GooseSwift/]

### LE 2M PHY

`CBPeripheral.setPreferredPHY(tx:rx:)` is the correct API. [ASSUMED — Apple CoreBluetooth docs; training knowledge]

```swift
// Exact signature (iOS 11+):
peripheral.setPreferredPHY(tx: CBPeripheral.PHYType.le2M, rx: CBPeripheral.PHYType.le2M)
```

The delegate callback is:
```swift
// CBPeripheralDelegate method:
func peripheral(
  _ peripheral: CBPeripheral,
  didUpdatePreferredPHY error: Error?
)
```

`CBPeripheral.PHYType` values: [ASSUMED]
- `.le1M` — 1 Mbps (default)
- `.le2M` — 2 Mbps (preferred for higher throughput)
- `.leCoded` — long range, lower throughput

**Call timing:** Call `setPreferredPHY` in `centralManager(_:didConnect:)` immediately after the peripheral is confirmed as WHOOP (after `whoopIdentityEvidence` guard), before `peripheral.discoverServices(...)`. The PHY update is asynchronous; the `didUpdatePreferredPHY` delegate fires after the strap acknowledges. Do not block service discovery on this — fire-and-forget is correct. [ASSUMED — standard CoreBluetooth patterns]

**Important constraint:** PHY negotiation is only possible if both the iOS device hardware and the WHOOP strap support LE 2M. On unsupported hardware the delegate fires with an error — this must not crash or block the connect flow. Log the result, never guard-fail on it.

**Exact insertion point in `centralManager(_:didConnect:)`** (CentralDelegate.swift line ~220):
```swift
// After: rememberPeripheral(peripheral, fallbackName: fallbackName, evidence: evidence)
// Before: peripheral.discoverServices(serviceDiscoveryIDs)

// BLE-01: Request LE 2M PHY for improved throughput (fire-and-forget; error handled in delegate)
peripheral.setPreferredPHY(tx: .le2M, rx: .le2M)
// BLE-01: Log effective MTU for diagnostics
let mtu = peripheral.maximumWriteValueLength(for: .withoutResponse)
record(source: "ble", title: "connect.mtu", body: "mtu=\(mtu) peripheral=\(peripheral.identifier.uuidString)")
```

The `didUpdatePreferredPHY` delegate method should be added to `CoreBluetoothBLETransport+PeripheralDelegate.swift`:
```swift
func peripheral(_ peripheral: CBPeripheral, didUpdatePreferredPHY error: Error?) {
  if let error {
    record(level: .warn, source: "ble", title: "phy.update.failed", body: error.localizedDescription)
  } else {
    record(source: "ble", title: "phy.update.ok", body: "le2M preferred")
  }
}
```

---

## BLE-02: cmd 0x54 — GET_BODY_LOCATION_AND_STATUS

### Wire Format (Request)

Command number: **84** (0x54), **no payload**. [VERIFIED: re-assets/FINDINGS-commands.md line 60 — "No payload"]

Send using the same `buildCommandFrame` pattern as other commands. The command byte is 84. No revision byte needed (no payload).

```swift
// Pattern from GooseBLETypes.swift line 244 — buildCommandFrame(sequence:command:data:)
let frame = buildCommandFrame(sequence: nextSequence(), command: 84, data: [])
activePeripheral.writeValue(frame, for: commandCharacteristic, type: writeType)
```

### Response Byte Layout

Sourced from decompiled APK `bi0/e.java` (`GetBodyLocationResponsePacket`). [VERIFIED: re-assets/whoop-decompiled/sources/bi0/e.java]

The response arrives as a `commandResponse` packet (V5PacketType 0x24). The **payload** (after stripping frame header) has this layout:

| Offset | Field | Type | Method | Description |
|--------|-------|------|--------|-------------|
| 0 | `revision` | u8 | `V()` → `byteBuffer.get(0) & 0xFF` | Protocol revision (expect 0x01) |
| 1 | `location` | u8 | `U()` → `byteBuffer.get(1) & 0xFF` | GarmentDeviceLocation enum value |
| 2 | `confidence` | u8 | `S()` → `byteBuffer.get(2) & 0xFF` | Confidence score (0–100 range expected) |
| 3 | `status` | u8 | `W()` → `byteBuffer.get(3) & 0xFF` | Strap status byte |

All fields are unsigned bytes extracted via `xh0.a.a(byte b) = b & 255`. The ByteBuffer is positioned at the payload start (after packet-type, sequence, and command bytes), so these offsets are **relative to the body bytes after the 5-byte command-response header** `[packetType, flags, commandByte, sequence, resultCode]`.

**Note on payload indexing vs. frame indexing:** In the existing codebase (e.g. `handleClockCommandResponse`), `payload[2]` is the command byte, `payload[3]` is sequence, `payload[4]` is result code. The actual command body starts at `payload[5]`. So the bi0/e.java offsets 0–3 map to `payload[5]`, `payload[6]`, `payload[7]`, `payload[8]`.

### GarmentDeviceLocation Enum

Source: `hi0/c.java`. [VERIFIED: re-assets/whoop-decompiled/sources/hi0/c.java]

| Name | locationInt value | Meaning |
|------|-------------------|---------|
| UNKNOWN | 0 | Unknown/undetected |
| WRIST | 1 | On wrist — `isOnWrist = true` |
| BICEP | 2 | Bicep mount — `isOnWrist = false` |
| CALF | 3 | Calf — `isOnWrist = false` |
| SIDE_TORSO | 4 | Side torso — `isOnWrist = false` |
| GLUTE | 5 | Glute — `isOnWrist = false` |
| ANKLE | 7 | Ankle — `isOnWrist = false` |
| UNKNOWN_GARMENT | 160 | Garment mount, unknown position — `isOnWrist = false` |
| NOT_CONCLUSIVE | 128 | Sensor not conclusive — treat as `nil` |

**Mapping to `isOnWrist: Bool?`:**
- location == 1 (WRIST) → `isOnWrist = true`
- location in {2, 3, 4, 5, 7, 160} → `isOnWrist = false`
- location == 0 (UNKNOWN) → `isOnWrist = nil`
- location == 128 (NOT_CONCLUSIVE) → `isOnWrist = nil`
- Any other unrecognised value → `isOnWrist = nil` (safe default)

### cmd 0x54 Send Timing

Send **after** `sendClientHelloIfNeeded` in `processDiscoveredCharacteristics` (Commands extension, line ~1115). The hello handshake must complete first so the strap is in a known session state. Do not block on hello response — all WHOOP commands are fire-and-forget writes with async responses.

```swift
// In processDiscoveredCharacteristics, after sendClientHelloIfNeeded:
sendClientHelloIfNeeded(reason: cached ? "cached_gatt" : "gatt_discovery")
sendGetBodyLocationAndStatus()   // BLE-02: fire-and-forget after hello
```

### Response Handler Pattern

Model on `handleClockCommandResponse` / `handleBatteryValue`. The response arrives in `handlePeripheralValueUpdate` via the dispatch chain: `handleSensorStreamValue` / `handleDebugCommandValue` / `handleClockValue`. Since 0x54 is a one-shot status query (not a sensor stream command, not an alarm, not a clock), add a new handler `handleGetBodyLocationResponse(_:)` and call it from `handleSensorStreamValue`'s loop OR from a dedicated `handleBodyLocationValue(_:characteristic:)` routed in `handlePeripheralValueUpdate`.

The simplest approach consistent with the existing pattern: handle it in `handlePeripheralValueUpdate` dispatch by adding a call to `handleBodyLocationValue(_:characteristic:)`, which checks for `payload[2] == 84`.

```swift
// In handlePeripheralValueUpdate, alongside existing handlers:
handleBodyLocationValue(value, characteristic: characteristic)

// New method (Commands or HistoricalHandlers extension):
func handleBodyLocationValue(_ value: Data, characteristic: CBCharacteristic) {
  guard notificationCharacteristicIDs.contains(characteristic.uuid) else { return }
  for frame in frames(in: value) {
    guard let payload = payload(in: frame),
          payload.count >= 9,
          let packetType = payload.first,
          packetType == V5PacketType.commandResponse || packetType == V5PacketType.puffinCommandResponse,
          payload[2] == 84 else { continue }
    // payload[5] = revision, payload[6] = location, payload[7] = confidence, payload[8] = status
    let location = Int(payload[6])
    let newIsOnWrist: Bool?
    switch location {
    case 1:        newIsOnWrist = true
    case 2, 3, 4, 5, 7, 160: newIsOnWrist = false
    default:       newIsOnWrist = nil
    }
    DispatchQueue.main.async { [weak self] in
      self?.isOnWrist = newIsOnWrist
    }
    record(source: "ble", title: "body_location.response",
           body: "location=\(location) confidence=\(payload[7]) status=\(payload[8]) isOnWrist=\(String(describing: newIsOnWrist))")
  }
}
```

**Reset on disconnect:** In `centralManager(_:didDisconnectPeripheral:error:)` (CentralDelegate extension, ~line 304), alongside the existing `activePeripheral = nil` etc.:
```swift
isOnWrist = nil  // D-04: reset on any disconnect
```

---

## BLE-02: isOnWrist State on CoreBluetoothBLETransport

`isOnWrist: Bool?` is added as a direct `@Observable` var (no new struct), consistent with existing vars like `batteryIsCharging: Bool?` and `batteryLevelPercent: Int?`. [VERIFIED: CoreBluetoothBLETransport.swift lines 36–40 — pattern confirmation]

Declaration (CoreBluetoothBLETransport.swift, alongside existing var block):
```swift
var isOnWrist: Bool?
```

The `BLETransport` protocol (`BLETransport.swift`) must also be updated to expose this property so UI code accessing `model.ble.isOnWrist` compiles.

---

## UI: On-Wrist Chip in HomeDeviceStatusCard

### Location

File: `GooseSwift/HomeDashboardView.swift`
Struct: `HomeDeviceStatusCard` (line 278 — `// MARK: - HOME-01: Device Status Card`)
Exact insertion: Inside the `HStack` at line ~306 that contains the Circle status dot, device name, and connection state text. Add the on-wrist indicator as a trailing element in that same HStack (before or after `Text(ble.connectionState.localizedConnectionState)`).

Alternatively, add a second `HStack` row below the existing top row, similar to the `isHistoricalSyncing` row (lines 319–329). The D-01 constraint says "same zone" — either inline in the top HStack or as a small subrow is consistent with the intent.

[VERIFIED: HomeDashboardView.swift lines 304–317 — HStack structure confirmed]

### Pattern

```swift
// In HomeDeviceStatusCard.body, inside the top HStack (after connectionState Text):
if isConnected, let onWrist = ble.isOnWrist {
  Spacer()
  HStack(spacing: 4) {
    Image(systemName: onWrist ? "figure.arms.open" : "figure.stand")
      .font(.caption2)
    Text(onWrist ? "On wrist" : "Off wrist")
      .font(.caption.weight(.medium))
  }
  .foregroundStyle(onWrist ? Color.green : Color.orange)
}
```

SF Symbol choices:
- `"applewatch"` — wrist-specific, clear meaning
- `"figure.arms.open"` — body silhouette (not wrist-specific)
- `"waveform.path.ecg.rectangle"` — health/sensor

Recommended: `"applewatch"` for on-wrist (clear wrist reference), `"applewatch.slash"` for off-wrist (available iOS 16+). [ASSUMED — SF Symbols training knowledge; verify in SF Symbols app]

`BLETransport` protocol must expose `isOnWrist: Bool?` so `HomeDeviceStatusCard` (which holds `let ble: any BLETransport`) can access it without casting.

---

## Connect Flow — Full Sequence After This Phase

```
centralManager(_:didConnect:)
  ├── identity guard (whoopIdentityEvidence)
  ├── [BLE-01 NEW] peripheral.setPreferredPHY(tx: .le2M, rx: .le2M)
  ├── [BLE-01 NEW] record mtu = peripheral.maximumWriteValueLength(for: .withoutResponse)
  ├── bondingManager.transition(to: .subscribed)
  └── peripheral.discoverServices(serviceDiscoveryIDs)

peripheral(_:didDiscoverCharacteristicsFor:)
  └── processDiscoveredCharacteristics(_:for:peripheral:cached:)
        ├── shouldUseCommandCharacteristic → commandCharacteristic = characteristic
        ├── subscribeIfPossible (setNotifyValue true)
        ├── bondingManager.transition(to: .completed(deviceID:))  → connectionState = "ready"
        ├── sendClientHelloIfNeeded(reason:)
        ├── [BLE-02 NEW] sendGetBodyLocationAndStatus()
        ├── scheduleDebugSkinTemperatureCommandIfNeeded
        ├── scheduleAutomaticHistoricalSyncIfNeeded
        └── scheduleAutomaticPhysiologyCaptureIfNeeded

peripheral(_:didUpdatePreferredPHY:)      [BLE-01 NEW — delegate log only]

peripheral(_:didUpdateValueFor:)
  └── handlePeripheralValueUpdate
        ├── handleDebugCommandValue
        ├── handleHistoricalSyncValue
        ├── handleAlarmValue
        ├── handleSensorStreamValue
        ├── handleClockValue
        ├── handleBatteryValue
        └── [BLE-02 NEW] handleBodyLocationValue → isOnWrist = true/false/nil
```

---

## Common Pitfalls

### Pitfall 1: PHY Failure Crashes or Blocks Connect
**What goes wrong:** `setPreferredPHY` errors on hardware that does not support LE 2M (e.g. iPhone 7 / older iPads). If the error is not handled, logs are noisy or the connect flow stalls waiting for PHY confirmation.
**Why it happens:** PHY negotiation is hardware-dependent; not all iPhones support LE 2M.
**How to avoid:** The `didUpdatePreferredPHY` delegate is fire-and-forget; log warning on error, never block or fail the connection on PHY result.
**Warning signs:** Error in `didUpdatePreferredPHY` during testing on older devices.

### Pitfall 2: Reading MTU Before Connection is Fully Established
**What goes wrong:** `maximumWriteValueLength` returns a low default value (typically 20) if read before the ATT MTU exchange completes.
**Why it happens:** MTU exchange happens during GATT service discovery phase, after `didConnect`.
**How to avoid:** Log MTU in `centralManager(_:didConnect:)` for a baseline diagnostic value, but note it may be the pre-exchange value (20 bytes). For accurate post-exchange MTU, also log it in `processDiscoveredCharacteristics` after characteristics are discovered. Both data points are useful; document the difference in log entries.

### Pitfall 3: cmd 0x54 Response Silently Discarded
**What goes wrong:** The 0x54 response arrives as a `commandResponse` frame but is not routed to a handler — `handleSensorStreamValue` filters on `SensorStreamCommandKind.responseNames[payload[2]]` (line 179) and 84 is not in that dictionary.
**Why it happens:** `handleSensorStreamValue` uses a dictionary allow-list for sensor commands; 0x54 is not a sensor stream command.
**How to avoid:** Handle 0x54 in a dedicated `handleBodyLocationValue` called from `handlePeripheralValueUpdate`, not from `handleSensorStreamValue`. Check `payload[2] == 84` explicitly.
**Warning signs:** No "body_location.response" log entry after sending the command; `isOnWrist` stays nil.

### Pitfall 4: Payload Offset Off-By-One
**What goes wrong:** Parser reads `payload[5]` expecting revision but hits a different byte due to misunderstanding of the V5 commandResponse header layout.
**Why it happens:** The V5 commandResponse payload layout is `[packetType(0), flags(1), commandByte(2), sequence(3), resultCode(4), body...]`, so body starts at index 5.
**How to avoid:** Guard `payload.count >= 9` (5 header bytes + 4 body bytes from the bi0/e.java layout). Confirm using the debug command infrastructure already in the app — send 0x54 via the debug menu and inspect the raw hex response logged by `debugCommandResponses`.
**Warning signs:** `isOnWrist` always `nil`; location byte reads 0x01 on a device that should be on wrist.

### Pitfall 5: isOnWrist Not Reset on Disconnect
**What goes wrong:** UI shows stale on-wrist state from previous session after reconnect delay.
**Why it happens:** If `isOnWrist = nil` is not set in `centralManager(_:didDisconnectPeripheral:)`, the var retains its last known value across disconnects.
**How to avoid:** Add `isOnWrist = nil` alongside `activePeripheral = nil` in the disconnect handler (D-04).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command framing | Custom byte builder | `buildCommandFrame(sequence:command:data:)` (GooseBLETypes.swift:244) | Already handles Gen4/Gen5 variants, CRC, sequence tracking |
| Response frame parsing | Custom frame splitter | `frames(in:)` + `payload(in:)` (existing parse infrastructure) | Handles multi-frame BLE notifications, Gen4/Gen5 header variants |
| Command write | Direct peripheral write | `writeType(for:)` pattern used in all existing command writers | Selects .withResponse vs .withoutResponse correctly per characteristic properties |

---

## Open Questions (RESOLVED)

1. **cmd 0x54 response on Gen4 vs Gen5** — RESOLVED
   - What we know: the command exists in the enum for all generations; the APK parser `bi0/e.java` does not gate on generation
   - What's unclear: whether WHOOP 4.0 straps actually respond to 0x54 (it may be Gen5-only)
   - Recommendation: send on all generations; if no response arrives within 3–5 seconds, leave `isOnWrist = nil`. No timeout state machine needed — nil is the correct "unknown" state per D-03.

2. **`payload[3]` sequence byte matching for 0x54** — RESOLVED
   - What we know: debug commands use a sequence byte in `pendingDebugCommands` dict to match response to request
   - What's unclear: whether 0x54 should be sent via the existing debug command infrastructure (which handles timeouts and sequence matching) or as a fire-and-forget write like sensor stream commands
   - Recommendation: Fire-and-forget write (not via debug command infrastructure). The `isOnWrist` state is resilient to non-response (stays nil). Using the debug command path would require registering a pending command and handling timeout — unnecessary complexity for a simple status query.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | XCTest (GooseSwiftTests/) |
| Config file | GooseSwift.xcodeproj |
| Quick run command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16'` |
| Full suite command | Same (69 tests across 16 files) |

### Phase Requirements → Test Map
| Req | Behaviour | Test Type | Automated? |
|-----|-----------|-----------|-----------|
| BLE-01 MTU log | `maximumWriteValueLength` called in didConnect | Manual — requires device log inspection | No |
| BLE-01 PHY | `setPreferredPHY` called; no crash on error | Manual (simulator does not support PHY negotiation) | No |
| BLE-02 response parse | `isOnWrist` set correctly from location byte | Unit (mock payload) | Yes — Wave 0 gap |
| BLE-02 reset | `isOnWrist = nil` on disconnect | Unit (mock disconnect) | Yes — Wave 0 gap |
| BLE-02 UI chip | Chip visible iff `isConnected && isOnWrist != nil` | Simulator UI test | Manual |

### Wave 0 Gaps
- [ ] `GooseSwiftTests/BLEBodyLocationParseTests.swift` — unit tests for `handleBodyLocationValue` location → Bool? mapping
- [ ] `GooseSwiftTests/BLEBodyLocationParseTests.swift` — test nil reset on disconnect

---

## Security Domain

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | yes | Guard `payload.count >= 9`; reject unexpected location bytes by defaulting to `nil` |
| V2 Authentication | no | No auth change in this phase |
| V6 Cryptography | no | No crypto in this phase |

No new network calls, no new persistence, no new secrets.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `peripheral.setPreferredPHY(tx:rx:)` signature uses `CBPeripheral.PHYType.le2M` | BLE-01 PHY | Compile error; fix by checking CBBluetoothPHY enum name in Xcode |
| A2 | `didUpdatePreferredPHY` is the delegate method name | BLE-01 PHY | Delegate never fires; PHY result silently ignored (acceptable) |
| A3 | SF Symbol `"applewatch.slash"` available on iOS 16+ | UI chip | Falls back to `"applewatch"` with slash overlay; verify in SF Symbols app |
| A4 | cmd 0x54 available on WHOOP 4.0 Gen4 | BLE-02 timing | Response never arrives on Gen4; isOnWrist stays nil — acceptable |
| A5 | payload body starts at index 5 (V5 commandResponse header = 5 bytes) | BLE-02 parse | Off-by-one; location byte misread; mitigatable via debug command raw response inspection |

---

## Sources

### Primary (HIGH confidence)
- `re-assets/whoop-decompiled/sources/bi0/e.java` — GetBodyLocationResponsePacket: offsets 0=revision, 1=location, 2=confidence, 3=status [VERIFIED]
- `re-assets/whoop-decompiled/sources/hi0/c.java` — GarmentDeviceLocation enum values [VERIFIED]
- `re-assets/FINDINGS-commands.md` line 60 — cmd 0x54 "No payload" confirmed [VERIFIED]
- `GooseSwift/CoreBluetoothBLETransport+CentralDelegate.swift` — exact `centralManager(_:didConnect:)` structure, lines 168–223 [VERIFIED]
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` — `processDiscoveredCharacteristics`, `sendClientHelloIfNeeded` call at line 1115, `bondingManager.transition(to: .completed)` at line 1113 [VERIFIED]
- `GooseSwift/GooseBLETypes.swift` lines 339–358 — `GooseBLEBondingState.completed` → `connectionStateString = "ready"` [VERIFIED]
- `GooseSwift/HomeDashboardView.swift` lines 276–357 — `HomeDeviceStatusCard` structure [VERIFIED]
- `GooseSwift/CoreBluetoothBLETransport.swift` lines 36–40 — `batteryIsCharging: Bool?` pattern for `isOnWrist` [VERIFIED]

### Secondary (MEDIUM confidence)
- Apple CoreBluetooth docs (Context7 /websites/developer_apple_corebluetooth) — `setPreferredPHY`, `maximumWriteValueLength`, delegate callbacks [CITED]

### Tertiary (LOW confidence)
- Training knowledge for `CBPeripheral.PHYType` enum member names and `didUpdatePreferredPHY` delegate signature [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- cmd 0x54 response layout: HIGH — from decompiled APK `bi0/e.java`
- GarmentDeviceLocation enum: HIGH — from decompiled APK `hi0/c.java`
- Connect flow insertion points: HIGH — direct codebase read
- CoreBluetooth PHY API exact names: LOW — training knowledge (verify at compile time)
- UI insertion point: HIGH — direct codebase read

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (CoreBluetooth APIs are stable; WHOOP protocol unlikely to change)
