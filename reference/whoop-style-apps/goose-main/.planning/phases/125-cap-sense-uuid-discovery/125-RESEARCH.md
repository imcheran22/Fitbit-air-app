# Phase 125: Cap Sense UUID Discovery - Research

**Researched:** 2026-06-28
**Domain:** CoreBluetooth BLE event parsing, Swift iOS
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** UUID = `fd4b0004-cce1-4033-93ce-002d5875f58a` (EVENTS_FROM_STRAP). Already subscribed. Cap sense is an event TYPE within this characteristic, not a separate UUID.
- **D-02:** Parse bytes 2-3 (int16 LE) from EVENTS_FROM_STRAP notifications: value 10 → `isOnWrist = true`, value 11 → `isOnWrist = false`, all other values → no update.
- **D-03:** Add cap sense event parsing to `CoreBluetoothBLETransport+PeripheralDelegate.swift` or `handlePeripheralValueUpdate` path. Check characteristic UUID == fd4b0004 first.
- **D-04:** cmd 0x54 path (HistoricalHandlers.swift:1084) and new cap sense path co-exist; both set `isOnWrist`; last-write wins; no conflict.
- **D-05:** Write `.planning/research/whoop-5/CAPSENSE-UUID.md` documenting UUID = fd4b0004 and event codes 10/11 with byte layout.
- **D-06:** Update Debug tab (More → Developer) to show "Cap sense: On wrist / Off wrist / Unknown" based on `isOnWrist`. Satisfies SC-3.

### Claude's Discretion
- Guard event parsing with `data.count >= 4` before reading bytes 2-3
- `isOnWrist` remains `Optional<Bool>` (nil until first event received)
- No new files needed if event parsing fits neatly in existing peripheral delegate extension

### Deferred Ideas (OUT OF SCOPE)
- None specified
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAPSENSE-01 | BLE scan with real WHOOP 5 to identify cap sense GATT UUID; subscribe to characteristic; `isOnWrist` updated from cap sense signal (distinct from cmd 0x54 optical fallback in BLE-02) | UUID confirmed: fd4b0004 (EVENTS_FROM_STRAP), event types 10/11. Already subscribed. Parsing is additive. |
</phase_requirements>

---

## Summary

Phase 125 resolves CAPSENSE-01 entirely in Swift + documentation. The GATT UUID question is closed: cap sense events arrive on `fd4b0004-cce1-4033-93ce-002d5875f58a` (EVENTS_FROM_STRAP), already in `notificationCharacteristicIDs` and subscribed since CoreBluetoothBLETransport.swift:423. No new subscription, no new characteristic UUID is required.

The implementation adds one new handler function (`handleCapSenseEventValue`) that reads bytes 2-3 of any EVENTS_FROM_STRAP notification as a little-endian UInt16. Event type 10 (STRAP_DETECTED) sets `isOnWrist = true`; event type 11 (STRAP_REMOVED) sets `isOnWrist = false`. The handler is fanned in from `handlePeripheralValueUpdate` alongside the existing set of handlers. This precisely mirrors the `handleAlarmEvent` pattern already in use for other event-type parsing.

The Debug tab update (SC-3) is a one-row addition to the "WHOOP Event Signals" section of `MoreDebugStatusTab`, reading `model.ble.isOnWrist` directly (already a `@Published`-observable property on the BLE transport).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event parsing (bytes 2-3) | BLE Transport layer | — | Runs on CoreBluetooth notification queue; `notificationCharacteristicIDs` guard already in place |
| `isOnWrist` state update | BLE Transport (main thread dispatch) | — | All existing `isOnWrist` setters use `DispatchQueue.main.async`; this must too |
| Debug display | UI layer (MoreDebugViews.swift) | — | Reads `model.ble.isOnWrist` via existing `@Published` chain |
| Cap sense documentation | `.planning/research/whoop-5/CAPSENSE-UUID.md` | — | Documents UUID + event codes for future reference |

---

## Standard Stack

No external packages. Pure Swift + CoreBluetooth. All required infrastructure already exists.

## Package Legitimacy Audit

No new packages. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
WHOOP fd4b0004 notification
        │
        ▼
didUpdateValueFor (CBPeripheralDelegate)
        │
        ├─ shouldFanOutNotificationBeforeMain? → fanOutNotification (off-main)
        │
        └─ handlePeripheralValueUpdate (on main, via DispatchQueue.main.async)
                │
                ├─ handleDebugCommandValue
                ├─ handleHistoricalSyncValue
                ├─ handleAlarmValue          ← V5PacketType.event already handled here
                ├─ handleSensorStreamValue
                ├─ handleClockValue
                ├─ handleBatteryValue
                ├─ handleBodyLocationValue   ← existing isOnWrist setter (cmd 0x54)
                ├─ handleFeatureFlagValue
                └─ handleCapSenseEventValue  ← NEW: event types 10/11 → isOnWrist
```

### Recommended Project Structure

No new files required (Claude's Discretion allows inline addition). If extension file approach is preferred:

```
GooseSwift/
├── CoreBluetoothBLETransport+PeripheralDelegate.swift  — fan-out call site
├── CoreBluetoothBLETransport+HistoricalHandlers.swift  — add handleCapSenseEventValue here
└── MoreDebugViews.swift                                — SC-3 display row
```

---

## Detailed Code Findings

### 1. CoreBluetoothBLETransport+PeripheralDelegate.swift — didUpdateValueFor and fanout path

**[VERIFIED: codebase grep]** The full `didUpdateValueFor` implementation (lines 67–135) has two paths:

**Fast path (off-main, before dispatch):** Lines 87–113
- Fires for `notify`/`indicate` characteristics that are in `notificationCharacteristicIDs`
- Calls `fanOutNotification(event)` off the main thread
- Then checks `shouldDispatchNotificationSideEffectsToMain` — if true, dispatches to main via `DispatchQueue.main.async { self?.handlePeripheralValueUpdate(..., fanOutNotifications: false) }`
- fd4b0004 IS in `notificationCharacteristicIDs` (CoreBluetoothBLETransport.swift:423) so it follows this path

**Slow path (on-main):** Lines 115–134
- Falls through to `handlePeripheralValueUpdate` directly on main if not dispatched by fast path

**`shouldDispatchNotificationSideEffectsToMain` (lines 146–180):**
- Guards on `notificationCharacteristicIDs.contains(characteristic.uuid)` — fd4b0004 passes
- Iterates frames; if any frame payload has `packetType == V5PacketType.event` → returns `true`
- This means: a EVENTS_FROM_STRAP notification carrying event type 10/11 WILL be dispatched to main, and `handlePeripheralValueUpdate` WILL be called on main

**`handlePeripheralValueUpdate` (lines 239–315):**
- Called on main thread
- Fans out to all `handleXxx` handlers (lines 291–298):
  ```swift
  handleDebugCommandValue(value, characteristic: characteristic)
  handleHistoricalSyncValue(value, characteristic: characteristic)
  handleAlarmValue(value, characteristic: characteristic)
  handleSensorStreamValue(value, characteristic: characteristic)
  handleClockValue(value, characteristic: characteristic)
  handleBatteryValue(value, characteristic: characteristic)
  handleBodyLocationValue(value, characteristic: characteristic)
  handleFeatureFlagValue(value, characteristic: characteristic)
  ```
- **Insertion point:** add `handleCapSenseEventValue(value, characteristic: characteristic)` after `handleBodyLocationValue` on its own line. No structural changes to the dispatch logic needed.

### 2. Exact UUID constants in CoreBluetoothBLETransport.swift

**[VERIFIED: codebase grep + direct read]**

```swift
// Line 421-430 — notificationCharacteristicIDs (the set checked by shouldFanOutNotificationBeforeMain and shouldDispatchNotificationSideEffectsToMain)
let notificationCharacteristicIDs = [
  CBUUID(string: "fd4b0003-cce1-4033-93ce-002d5875f58a"),
  CBUUID(string: "fd4b0004-cce1-4033-93ce-002d5875f58a"),  // ← EVENTS_FROM_STRAP; line 423
  CBUUID(string: "fd4b0005-cce1-4033-93ce-002d5875f58a"),
  CBUUID(string: "fd4b0007-cce1-4033-93ce-002d5875f58a"),
  CBUUID(string: "61080003-8d6d-82b8-614a-1c8cb0f8dcc6"),
  CBUUID(string: "61080004-8d6d-82b8-614a-1c8cb0f8dcc6"),
  CBUUID(string: "61080005-8d6d-82b8-614a-1c8cb0f8dcc6"),
  CBUUID(string: "61080007-8d6d-82b8-614a-1c8cb0f8dcc6"),
]
```

There is **no named constant** for fd4b0004 (e.g. `eventsFromStrapCharacteristicID`). The UUID appears only inline in this array. The new handler should use `CBUUID(string: "fd4b0004-cce1-4033-93ce-002d5875f58a")` inline or extract a private constant — consistent with the existing style.

`isOnWrist: Bool?` is declared at line 41 of CoreBluetoothBLETransport.swift. It is already protocol-declared in `BLETransport.swift:35`.

### 3. CoreBluetoothBLETransport+HistoricalHandlers.swift:1084 — existing isOnWrist setter

**[VERIFIED: codebase read]**

```swift
// Lines 1051-1087 — handleBodyLocationValue (cmd 0x54 path)
// BLE-02: Parse cmd 0x54 (GET_BODY_LOCATION_AND_STATUS) response and update isOnWrist.
// V5 commandResponse layout: payload[0]=packetType payload[1]=flags payload[2]=commandByte
//   payload[3]=sequence payload[4]=resultCode payload[5]=revision payload[6]=location
//   payload[7]=confidence payload[8]=status
func handleBodyLocationValue(_ value: Data, characteristic: CBCharacteristic) {
  guard notificationCharacteristicIDs.contains(characteristic.uuid) else { return }
  for frame in frames(in: value) {
    guard let payload = payload(in: frame),
          payload.count >= 9,
          let packetType = payload.first,
          packetType == V5PacketType.commandResponse || packetType == V5PacketType.puffinCommandResponse,
          payload[2] == 84 else { continue }
    // ... location → newValue mapping ...
    DispatchQueue.main.async { [weak self] in
      self?.isOnWrist = newValue    // ← line 1084
    }
  }
}
```

Key observations for new handler:
- The `DispatchQueue.main.async` wrapper is used because `handleBodyLocationValue` can be called on the notification queue in the slow path. The new cap sense handler will be called from `handlePeripheralValueUpdate` which is always on main (the fast path dispatches to main before calling it) — so `DispatchQueue.main.async` is NOT needed in the cap sense handler itself. Direct assignment `self.isOnWrist = newValue` is safe.
- The `notificationCharacteristicIDs.contains(characteristic.uuid)` guard is the standard pattern to restrict a handler to known notification characteristics.

**Existing isOnWrist reset:** `CoreBluetoothBLETransport+CentralDelegate.swift:319` sets `isOnWrist = nil` on disconnect. The new handler adds no lifecycle management.

### 4. Event packet byte layout — derived from handleAlarmEvent pattern

**[VERIFIED: codebase read]**

`handleAlarmEvent` (HistoricalHandlers.swift:359-426) shows the canonical V5PacketType.event payload layout:

```swift
func handleAlarmEvent(_ payload: [UInt8]) {
  guard payload.count >= 12 else { return }
  let eventType = UInt16(payload[2]) | UInt16(payload[3]) << 8  // ← little-endian int16
  let eventBody = Array(payload.dropFirst(12))
  switch eventType {
  case 56: handleAlarmSetEvent(eventBody)
  // ...
  }
}
```

- `payload[0]` = V5PacketType.event (already checked by the frame iterator's packetType match)
- `payload[1]` = flags/header byte
- `payload[2..3]` = event type as UInt16 little-endian
- `payload[4+]` = event body

For cap sense: `guard payload.count >= 4` is the correct minimum (need bytes 0-3). The new handler follows this exact pattern:

```swift
func handleCapSenseEventValue(_ value: Data, characteristic: CBCharacteristic) {
  guard characteristic.uuid == CBUUID(string: "fd4b0004-cce1-4033-93ce-002d5875f58a")
     || characteristic.uuid == CBUUID(string: "61080004-8d6d-82b8-614a-1c8cb0f8dcc6") else {
    return
  }
  for frame in frames(in: value) {
    guard let payload = payload(in: frame),
          payload.count >= 4,
          let packetType = payload.first,
          packetType == V5PacketType.event else {
      continue
    }
    let eventType = UInt16(payload[2]) | UInt16(payload[3]) << 8
    switch eventType {
    case 10:  // STRAP_DETECTED
      isOnWrist = true
      record(source: "ble.capsense", title: "capsense.event", body: "STRAP_DETECTED isOnWrist=true")
    case 11:  // STRAP_REMOVED
      isOnWrist = false
      record(source: "ble.capsense", title: "capsense.event", body: "STRAP_REMOVED isOnWrist=false")
    default:
      break
    }
  }
}
```

Note: the PUFFIN equivalent UUID for 61080004 should also be guarded, matching the pattern used by all other handlers that check `notificationCharacteristicIDs`. Alternatively, use `notificationCharacteristicIDs.contains(characteristic.uuid)` as the guard and filter only fd4b0004/61080004 inside the loop, or rely on the packetType == V5PacketType.event guard as implicit filtering (since only event-producing characteristics emit V5PacketType.event frames).

**Simpler approach (matches existing handler style):** guard on `notificationCharacteristicIDs.contains(characteristic.uuid)` (same as all other handlers), then filter by `packetType == V5PacketType.event` + event types 10/11.

### 5. MoreDebugViews.swift — insertion point for SC-3

**[VERIFIED: codebase read]**

The "WHOOP Event Signals" section (line 258) is in `MoreDebugCaptureTab`. It contains 10+ `MoreInfoRow` entries for event/signal monitoring. **This is the correct insertion point** for the cap sense status row.

The section currently ends at approximately line 334 with the `recentDeviceSignalPoints` ForEach. Insert the new row before or after the existing "Latest Event" row (line 259) since cap sense events are EVENTS_FROM_STRAP events.

**Pattern for the new row:**

```swift
MoreInfoRow(
  title: "Cap Sense",
  value: {
    switch model.ble.isOnWrist {
    case true:  return "On wrist (fd4b0004)"
    case false: return "Off wrist (fd4b0004)"
    case nil:   return "Unknown — no event received"
    }
  }(),
  systemImage: "sensor.tag.radiowaves.forward",
  status: model.ble.isOnWrist == nil ? .pending : .ready
)
```

The `model.ble.isOnWrist` property is already observable — `HomeDashboardView.swift:318` reads it with the same `let onWrist = ble.isOnWrist` pattern. No additional `@Published` plumbing needed.

**Note on existing isOnWrist display in HomeDashboardView:** Lines 318-326 already show "On wrist" / "Off wrist" in the connection state area of the home dashboard. The debug row is complementary, adding the characteristic UUID label to confirm the source.

### 6. Cap sense prior investigation status

**[VERIFIED: codebase read]**

A prior investigation (2026-06-11) found cap sense notification names in the iOS binary but could not definitively map them to a UUID via static analysis alone. Phase 125 resolves this: fd4b0004 (EVENTS_FROM_STRAP) confirmed via BLE protocol observation — event types 10 (STRAP_DETECTED) and 11 (STRAP_REMOVED). CAPSENSE-UUID.md documents the resolution.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event type parsing | Custom frame parser | `frames(in:)` + `payload(in:)` already in CoreBluetoothBLETransport | Frame framing/deframing already handles WHOOP V5 protocol; existing utilities are correct and tested |
| Main-thread dispatch for isOnWrist | Manual async wrapper in handler | Direct assignment (handler is called on main) | `handlePeripheralValueUpdate` is always called on main thread via the fast-path dispatch; wrapping in another `DispatchQueue.main.async` is redundant |
| isOnWrist property declaration | New property | Existing `var isOnWrist: Bool?` at CoreBluetoothBLETransport.swift:41 | Already declared; already protocol-exposed via BLETransport.swift:35 |

---

## Common Pitfalls

### Pitfall 1: Wrapping isOnWrist setter in DispatchQueue.main.async (unnecessary)
**What goes wrong:** The `handleBodyLocationValue` handler (cmd 0x54 path) uses `DispatchQueue.main.async { [weak self] in self?.isOnWrist = newValue }` because it can be called from the notification queue in the slow path. A naive copy of this pattern into `handleCapSenseEventValue` adds unnecessary overhead.
**Why it happens:** Copy-paste from the existing setter without checking thread context.
**How to avoid:** `handleCapSenseEventValue` is called from `handlePeripheralValueUpdate`, which is always on main (both paths dispatch to main before calling it). Direct assignment is safe.
**Warning signs:** Adding `[weak self]` capture when `self` is already guaranteed.

### Pitfall 2: Missing the PUFFIN equivalent UUID (61080004)
**What goes wrong:** The handler guards only on `fd4b0004` and misses `61080004-8d6d-82b8-614a-1c8cb0f8dcc6` (the WHOOP 5.x generation equivalent). Cap sense events on WHOOP 5.x hardware may arrive on 61080004.
**Why it happens:** CONTEXT.md names fd4b0004 specifically; the PUFFIN parity is implicit.
**How to avoid:** Use `notificationCharacteristicIDs.contains(characteristic.uuid)` as the UUID guard (same as all other handlers), or explicitly add both UUIDs to the guard condition.
**Warning signs:** Simulator build passes but no events received on newer hardware.

### Pitfall 3: Wrong minimum byte count guard
**What goes wrong:** Using `payload.count >= 12` (copied from `handleAlarmEvent`) instead of `payload.count >= 4`. Cap sense events (types 10/11) have no event body beyond bytes 0-3.
**Why it happens:** `handleAlarmEvent` needs 12 bytes to read the event body. Cap sense handler only needs bytes 2-3.
**How to avoid:** `guard payload.count >= 4` — minimum to safely read `payload[2]` and `payload[3]`.

### Pitfall 4: Integer width mismatch for eventType
**What goes wrong:** Reading `payload[2]` as a bare `UInt8` (value 10) instead of constructing the full UInt16 LE from bytes 2-3.
**Why it happens:** For small event type values (10, 11) the high byte is zero, so `UInt8(payload[2])` gives the correct value — but this breaks for event types ≥ 256.
**How to avoid:** Always use `UInt16(payload[2]) | UInt16(payload[3]) << 8` for consistency with the existing `handleAlarmEvent` pattern and Android source confirmation (`getShort(2)` returns a 16-bit value).

### Pitfall 5: Putting cap sense parsing on the off-main fast path
**What goes wrong:** Adding cap sense isOnWrist update to `fanOutNotification` or the off-main portion of `didUpdateValueFor` causes a main-thread violation (`@Published` mutation off main actor).
**Why it happens:** The fast path fires before the main dispatch.
**How to avoid:** Insert handler call in `handlePeripheralValueUpdate` only — this function is always on main.

---

## Code Examples

### handleCapSenseEventValue — canonical pattern

```swift
// Source: derived from handleAlarmEvent (HistoricalHandlers.swift:359) and
//         handleBodyLocationValue (HistoricalHandlers.swift:1056) patterns
func handleCapSenseEventValue(_ value: Data, characteristic: CBCharacteristic) {
  guard notificationCharacteristicIDs.contains(characteristic.uuid) else {
    return
  }
  for frame in frames(in: value) {
    guard let payload = payload(in: frame),
          payload.count >= 4,
          let packetType = payload.first,
          packetType == V5PacketType.event else {
      continue
    }
    let eventType = UInt16(payload[2]) | UInt16(payload[3]) << 8
    switch eventType {
    case 10:  // STRAP_DETECTED
      isOnWrist = true
      record(source: "ble.capsense", title: "capsense.event", body: "STRAP_DETECTED isOnWrist=true")
    case 11:  // STRAP_REMOVED
      isOnWrist = false
      record(source: "ble.capsense", title: "capsense.event", body: "STRAP_REMOVED isOnWrist=false")
    default:
      break
    }
  }
}
```

### Fan-in call site in handlePeripheralValueUpdate

```swift
// Insert after handleBodyLocationValue call (PeripheralDelegate.swift:297)
handleBodyLocationValue(value, characteristic: characteristic)
handleFeatureFlagValue(value, characteristic: characteristic)  // FF-01/FF-02
handleCapSenseEventValue(value, characteristic: characteristic)  // CAPSENSE-01
```

### MoreDebugViews.swift — SC-3 display row

```swift
// In Section("WHOOP Event Signals"), after the "Latest Event" MoreInfoRow
MoreInfoRow(
  title: "Cap Sense",
  value: {
    switch model.ble.isOnWrist {
    case .some(true):  return "On wrist (fd4b0004)"
    case .some(false): return "Off wrist (fd4b0004)"
    case nil:          return "Unknown — no event received"
    }
  }(),
  systemImage: "sensor.tag.radiowaves.forward",
  status: model.ble.isOnWrist == nil ? .pending : .ready
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UUID previously unconfirmed | fd4b0004 (EVENTS_FROM_STRAP) confirmed + event types 10/11 via BLE protocol observation | Phase 125 | No new UUID subscription needed; cap sense parsing is additive |
| `isOnWrist` set only from cmd 0x54 poll at reconnect | `isOnWrist` set from real-time EVENTS_FROM_STRAP notifications | Phase 125 | True real-time on-wrist detection; cmd 0x54 remains as reconnect-time baseline |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PUFFIN equivalent `61080004` also carries cap sense events with the same event type codes (10/11) | Pitfall 2 | Cap sense events silently dropped on WHOOP 5.x hardware if 61080004 is not guarded. Mitigation: use `notificationCharacteristicIDs.contains()` which already includes 61080004. | [ASSUMED] |
| A2 | handlePeripheralValueUpdate is always called on the main thread when reached from handleCapSenseEventValue's call site | Pitfall 1 | Race condition / main-thread violation if assumption is wrong. Verified by reading both dispatch paths in didUpdateValueFor — both dispatch to main before calling handlePeripheralValueUpdate. | [VERIFIED: codebase read] |

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — Swift-only changes to existing files; no new frameworks, tools, or CLI utilities required).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Xcode test runner (Swift) |
| Config file | GooseSwiftTests/ target in GooseSwift.xcodeproj |
| Quick run command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO 2>&1 \| grep -E 'error:|passed|failed'` |
| Full suite command | Same |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAPSENSE-01 | isOnWrist = true when eventType 10 received on fd4b0004 | unit | GooseSwiftTests cap sense unit test | ❌ Wave 0 |
| CAPSENSE-01 | isOnWrist = false when eventType 11 received | unit | Same | ❌ Wave 0 |
| CAPSENSE-01 | No isOnWrist update for other event types | unit | Same | ❌ Wave 0 |
| SC-3 | Debug tab shows "On wrist (fd4b0004)" when isOnWrist = true | manual/simulator | XcodeBuildMCP screenshot | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `GooseSwiftTests/CapSenseEventParsingTests.swift` — unit tests for handleCapSenseEventValue with synthetic Data payloads for event types 10, 11, and a non-cap-sense event type

---

## Security Domain

This phase makes no changes to authentication, session management, access control, cryptography, or network endpoints. Security section not applicable.

---

## Sources

### Primary (HIGH confidence)
- CoreBluetoothBLETransport+PeripheralDelegate.swift — direct read; full didUpdateValueFor + handlePeripheralValueUpdate implementation
- CoreBluetoothBLETransport.swift — direct read; UUID constants at lines 411-430, isOnWrist at line 41
- CoreBluetoothBLETransport+HistoricalHandlers.swift — direct read; handleBodyLocationValue (lines 1056-1087), handleAlarmEvent (lines 359-426)
- MoreDebugViews.swift — direct read; WHOOP Event Signals section (lines 258-334), Connection section (lines 36-49)
- CAPSENSE-INVESTIGATION.md — direct read; prior investigation status and findings

### Secondary (MEDIUM confidence)
- HomeDashboardView.swift:318-326 — isOnWrist display pattern (on wrist / off wrist visual convention)

---

## Metadata

**Confidence breakdown:**
- UUID identification: HIGH — confirmed from CONTEXT.md decisions (BLE protocol observation)
- Insertion point (PeripheralDelegate): HIGH — verified by reading complete file
- handleBodyLocationValue isOnWrist setter pattern: HIGH — read directly at line 1084
- Event byte layout: HIGH — verified against handleAlarmEvent canonical implementation
- MoreDebugViews insertion point: HIGH — read Section("WHOOP Event Signals") directly

**Research date:** 2026-06-28
**Valid until:** 2026-07-28 (stable codebase; no fast-moving dependencies)
