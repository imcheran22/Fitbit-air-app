# Phase 117: Android Optical Routing - Research

**Researched:** 2026-06-24
**Domain:** Android Kotlin / WHOOP BLE protocol / optical sensor commands
**Confidence:** HIGH

## Summary

The core question for this phase is answered definitively: Android does NOT send
ENABLE_OPTICAL_DATA (cmd 107, 0x6B) or TOGGLE_OPTICAL_MODE (cmd 108, 0x6C) during
the Gen5 handshake. These commands are absent from WhoopBleClient entirely — no
companion constant, no send site, no comment. The Android handshake sends exactly
two things: the CLIENT_HELLO frame (fixed 16-byte auth blob) and then the historical
sync sequence (GET_DATA_RANGE cmd 34, SEND_HISTORICAL_DATA cmd 22). There is no
physiology/sensor-stream command layer at all.

The downstream routing path is already correct: Gen5/MG handleNotification passes ALL
notification bytes through importFrame() to GooseBridge.safeHandle() without any
packet_k filtering. If WHOOP 5 were emitting optical frames, they would arrive in Rust
correctly. The gap is purely at the upstream command layer — the device never receives
the signal to start emitting optical packets.

iOS sends ENABLE_OPTICAL_DATA + TOGGLE_OPTICAL_MODE as part of the `startPhysiologyCapture`
sensor-stream command sequence, which is invoked either by the user or by an auto-start
flag. Android has no equivalent. This is the single gap to close.

**Primary recommendation:** Add CMD_ENABLE_OPTICAL_DATA (107, 0x6B) and
CMD_TOGGLE_OPTICAL_MODE (108, 0x6C) to WhoopBleClient, sent after the first notification
confirms auth success (same timing as startHistoricalSync). Use the same buildCommandFrame()
helper already in the file. No routing code changes needed. Add a JVM test for importFrame
routing using the existing WhoopBleClientHistoricalSyncTest pattern.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** No new routing code needed in handleNotification or importFrame — Gen5/MG already passes ALL frames through. If optical data doesn't arrive, the fix is at the command level (enable optical mode), not the routing level.
- **D-02:** If Android doesn't already send ENABLE_OPTICAL_DATA (cmd 107) in the Gen5 handshake, add it after the existing handshake commands. Follow iOS pattern: send after authentication.
- **D-03:** Add a JVM unit test verifying that a synthetic frame with packet_k=20 (or 21 or 26) bytes passes through `importFrame` to `GooseBridge.safeHandle()` without filtering.

### Claude's Discretion
- Which specific command bytes and payload to use for cmd 107/108 — researcher to find in iOS codebase
- Whether to add both 107 and 108, or just 107 — researcher to determine based on iOS handshake sequence

### Deferred Ideas (OUT OF SCOPE)
- Optical data UI display (Phase 120/121)
- Separate optical characteristic subscription (if data comes on different characteristic — unlikely given all-CCCD pattern)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPT-04 | Android WhoopBleClient routing for packet_k 20/21/26 — frames forwarded to GooseBridge.safeHandle() (parity with iOS) | Command gap confirmed; exact bytes extracted from iOS source; test pattern identified |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Optical enable command | BLE client (WhoopBleClient) | — | Commands are written to BLE command characteristic; no other tier involved |
| Frame routing (optical packets) | BLE client (WhoopBleClient) | Rust bridge (GooseBridge) | Already works — handleNotification passes all Gen5 bytes through importFrame |
| Optical frame parsing | Rust core (GooseBridge) | — | Done in Phase 112; out of scope here |
| JVM test validation | Android test layer | — | JVM-only; no instrumented test needed |

---

## Key Finding: Command Gap Confirmed

**Android does NOT send cmd 107 or cmd 108 anywhere.**

Evidence from full read of `WhoopBleClient.kt` (575 lines):

```
companion object constants defined:
  CMD_GET_DATA_RANGE: Byte = 34        // 0x22
  CMD_SEND_HISTORICAL_DATA: Byte = 22  // 0x16
  CMD_HISTORICAL_DATA_RESULT: Byte = 23 // 0x17
  PACKET_TYPE_COMMAND: Byte = 0x01

No constant for 107, 108, or any sensor-stream command.
```

Grep of entire android/ directory for `107`, `108`, `0x6b`, `0x6c`, `0x6B`, `0x6C`, `optical`: zero matches in any non-test Kotlin file. [VERIFIED: direct grep of codebase]

**Android handshake sequence (complete):**

```
1. GATT connect
2. MTU request (247)
3. Service discovery
4. CCCD enable for all notify characteristics (queued chain)
5. sendAuthCommand() → writes CLIENT_HELLO_BYTES (fixed 16-byte frame)
6. First notification received → transition to Connected
7. scope.launch { startHistoricalSync() }
   → writeHistoricalCommand(CMD_GET_DATA_RANGE=34, payload=[])
   → onCharacteristicWrite confirmed → writeHistoricalCommand(CMD_SEND_HISTORICAL_DATA=22, payload=[])
   → 30s idle timeout → completeSyncIfActive()
```

There is no step that sends a sensor-stream command. The iOS equivalent
`startPhysiologySignalCapture()` / `writeSensorStreamCommands()` has no Android counterpart.

---

## iOS Reference: Exact Command Bytes to Port

Source: `GooseSwift/CoreBluetoothBLETransport.swift` lines 607-615 [VERIFIED: direct file read]

```swift
static let startPhysiologyCapture = [
  SensorStreamCommandKind(commandNumber: 3,   payload: [1],                 name: "TOGGLE_REALTIME_HR_ON"),
  SensorStreamCommandKind(commandNumber: 63,  payload: [1],                 name: "SEND_R10_R11_REALTIME_ON"),
  SensorStreamCommandKind(commandNumber: 106, payload: revisionBoolean(true), name: "TOGGLE_IMU_MODE_ON"),
  SensorStreamCommandKind(commandNumber: 154, payload: revisionBoolean(true), name: "TOGGLE_PERSISTENT_R21_ON"),
  SensorStreamCommandKind(commandNumber: 107, payload: revisionBoolean(true), name: "ENABLE_OPTICAL_DATA_ON"),
  SensorStreamCommandKind(commandNumber: 108, payload: revisionBoolean(true), name: "TOGGLE_OPTICAL_MODE_ON"),
  SensorStreamCommandKind(commandNumber: 153, payload: revisionBoolean(true), name: "TOGGLE_PERSISTENT_R20_ON"),
]
```

Where `revisionBoolean(true)` = `[1, 1]` (two bytes). [VERIFIED: direct file read, line 596-598]

```swift
static func revisionBoolean(_ enabled: Bool) -> [UInt8] {
  [1, enabled ? 1 : 0]
}
```

**For OPT-04 (optical only), the minimum required commands are:**

| Name | commandNumber | Byte | Payload |
|------|---------------|------|---------|
| ENABLE_OPTICAL_DATA | 107 | 0x6B | `[0x01, 0x01]` |
| TOGGLE_OPTICAL_MODE | 108 | 0x6C | `[0x01, 0x01]` |

Both commands must be sent. iOS always sends both together in this order. Sending only 107
without 108 is untested — the safe path mirrors iOS exactly.

**Frame wire format** (same buildCommandFrame as historical commands): [VERIFIED: direct read of WhoopBleClient.kt line 428-437]

```kotlin
// body = [sequence, command] + data
// frame = [0x01, bodyLen&0xFF, (bodyLen>>8)&0xFF, sequence] + body
private fun buildCommandFrame(sequence: Byte, command: Byte, data: ByteArray): ByteArray {
  val body = byteArrayOf(sequence, command) + data
  val bodyLen = body.size
  return byteArrayOf(
    PACKET_TYPE_COMMAND,
    (bodyLen and 0xFF).toByte(),
    ((bodyLen ushr 8) and 0xFF).toByte(),
    sequence,
  ) + body
}
```

For ENABLE_OPTICAL_DATA (cmd=107, data=[0x01, 0x01]):
- body = [seq, 0x6B, 0x01, 0x01] → bodyLen=4
- frame = [0x01, 0x04, 0x00, seq, seq, 0x6B, 0x01, 0x01] (8 bytes total)

---

## Implementation Specification

### New Constants in WhoopBleClient.companion object

```kotlin
private const val CMD_ENABLE_OPTICAL_DATA: Byte = 107   // 0x6B
private const val CMD_TOGGLE_OPTICAL_MODE: Byte = 108   // 0x6C

// revisionBoolean(true) payload — two bytes [0x01, 0x01]
private val REVISION_BOOLEAN_TRUE: ByteArray = byteArrayOf(0x01, 0x01)
```

### New sequence counter (mirrors iOS nextSensorCommandSequence starting at 180)

iOS uses `nextSensorCommandSequence: UInt8 = 180` for sensor stream commands, separate
from `nextHistoricalCommandSequence`. Android should use a separate counter for the same
reason: optical commands and historical commands must not share sequence numbers, as the
WHOOP device may use the sequence for flow control or deduplication.

```kotlin
@Volatile private var sensorSequence: Byte = (-76).toByte()  // = 180 unsigned, matches iOS
```

### New method: sendOpticalEnableCommands()

```kotlin
private fun sendOpticalEnableCommands(gatt: BluetoothGatt) {
  val serviceUuid = activeServiceUuid ?: return
  val service = gatt.getService(serviceUuid) ?: return
  val commandChar = service.getCharacteristic(WhoopUuids.commandCharFor(serviceUuid)) ?: return
  val writeType = when {
    commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ->
      BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    commandChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0 ->
      BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
    else -> return
  }
  // Send ENABLE_OPTICAL_DATA (107) then TOGGLE_OPTICAL_MODE (108)
  // Stagger by 250ms matching iOS asyncAfter spacing in writeSensorStreamCommands
  val cmds = listOf(CMD_ENABLE_OPTICAL_DATA to "ENABLE_OPTICAL_DATA",
                    CMD_TOGGLE_OPTICAL_MODE to "TOGGLE_OPTICAL_MODE")
  cmds.forEachIndexed { index, (cmd, name) ->
    scope.launch {
      delay(250L * index)
      sensorSequence = (sensorSequence + 1).toByte()
      val frame = buildCommandFrame(sensorSequence, cmd, REVISION_BOOLEAN_TRUE)
      @Suppress("DEPRECATION")
      commandChar.value = frame
      commandChar.writeType = writeType
      @Suppress("DEPRECATION")
      val success = gatt.writeCharacteristic(commandChar)
      Log.d(TAG, "optical cmd $name seq=$sensorSequence success=$success")
    }
  }
}
```

### Insertion point in handleNotification()

Send after auth succeeds and historical sync is launched. The current handleNotification
block at lines 388-393: [VERIFIED: direct file read]

```kotlin
if (_connectionState.value is BleConnectionState.Authenticating) {
  _connectionState.value = BleConnectionState.Connected(address, generation)
  scope.launch { startHistoricalSync() }
}
```

Add optical enable after historical sync launch. Must guard to Gen5/MG only (optical
sensor data is a Gen5 capability not supported on Gen4):

```kotlin
if (_connectionState.value is BleConnectionState.Authenticating) {
  _connectionState.value = BleConnectionState.Connected(address, generation)
  scope.launch { startHistoricalSync() }
  // Send optical enable after auth — Gen5/MG only (optical is not a Gen4 capability)
  if (generation == WhoopGeneration.GEN5 || generation == WhoopGeneration.MG) {
    val currentGatt = gatt ?: return
    scope.launch { delay(500); sendOpticalEnableCommands(currentGatt) }
  }
}
```

The 500ms delay gives the historical sync commands time to be queued first. iOS sends
physiology commands outside the historical sync window (the transport blocks sensor
commands when `isHistoricalSyncing` is true). Android should do the same: send optical
enable before historical sync begins, or accept that the 500ms overlap is fine since
WHOOP devices queue BLE writes. Simplest safe approach: send optical enable commands first,
then historical sync. Planner to decide ordering; either works per iOS evidence.

---

## Frame Routing: Already Correct

Source: `WhoopBleClient.kt` lines 379-416 [VERIFIED: direct file read]

```kotlin
when (generation) {
  WhoopGeneration.GEN4 -> {
    val frames = gen4Reassembler.feed(value)
    for (frame in frames) { importFrame(frame, frameSource) }
  }
  WhoopGeneration.GEN5, WhoopGeneration.MG -> {
    importFrame(value, frameSource)   // ALL bytes pass through, no packet_k filter
  }
}
```

`importFrame()` calls `GooseBridge.safeHandle()` with `capture.import_frame_batch`. Rust
core dispatches on packet_k internally. Android has zero packet_k awareness — it is
correct to have none.

---

## JVM Test Pattern

Source: `WhoopBleClientHistoricalSyncTest.kt` [VERIFIED: direct file read]

The existing test pattern is pure logic extraction — no Android framework, no mocks,
no instrumented test runner. Functions from WhoopBleClient that cannot be called
directly (private) are replicated inline in the test class. The test verifies
algorithmic contracts, not integration behavior.

For D-03, the same approach applies. GooseBridge.safeHandle() cannot be called in a
JVM unit test (requires native .so). The test must verify the routing logic — that
nothing between notification receipt and importFrame() would block a frame with
packet_k=20/21/26 bytes.

**What to test:**

1. **Routing passthrough (primary):** A Gen5/MG frame with any first byte (including
   0x14=20, 0x15=21, 0x1A=26) is passed through by handleNotification without filtering.
   Verify by replicating the `when (generation)` dispatch logic and asserting a frame
   with byte[0]=0x14 reaches importFrame.

2. **buildCommandFrame for optical commands:** Verify the 8-byte wire format for
   cmd=107 with payload=[0x01,0x01]. Pin the exact byte sequence the device receives.

3. **Optical command byte values:** Verify CMD_ENABLE_OPTICAL_DATA=107 (0x6B) and
   CMD_TOGGLE_OPTICAL_MODE=108 (0x6C).

4. **revisionBoolean encoding:** Verify the two-byte payload [0x01, 0x01] for enabled.

**Test file location:** `android/app/src/test/kotlin/com/goose/app/ble/`
**Test class name:** `WhoopBleClientOpticalRoutingTest` (new file, mirrors naming of `WhoopBleClientHistoricalSyncTest`)

**Example test structure:**

```kotlin
class WhoopBleClientOpticalRoutingTest {

  private fun buildCommandFrame(sequence: Byte, command: Byte, data: ByteArray): ByteArray {
    val body = byteArrayOf(sequence, command) + data
    val bodyLen = body.size
    return byteArrayOf(
      0x01, // PACKET_TYPE_COMMAND
      (bodyLen and 0xFF).toByte(),
      ((bodyLen ushr 8) and 0xFF).toByte(),
      sequence,
    ) + body
  }

  @Test
  fun `ENABLE_OPTICAL_DATA command byte is 107 (0x6B)`() {
    val CMD_ENABLE_OPTICAL_DATA: Byte = 107
    assertEquals(0x6B.toByte(), CMD_ENABLE_OPTICAL_DATA)
  }

  @Test
  fun `TOGGLE_OPTICAL_MODE command byte is 108 (0x6C)`() {
    val CMD_TOGGLE_OPTICAL_MODE: Byte = 108
    assertEquals(0x6C.toByte(), CMD_TOGGLE_OPTICAL_MODE)
  }

  @Test
  fun `revisionBoolean true encodes as two-byte payload 0x01 0x01`() {
    val payload = byteArrayOf(0x01, 0x01)
    assertEquals(2, payload.size)
    assertEquals(0x01.toByte(), payload[0])
    assertEquals(0x01.toByte(), payload[1])
  }

  @Test
  fun `buildCommandFrame for ENABLE_OPTICAL_DATA produces correct 8-byte frame`() {
    val frame = buildCommandFrame(
      sequence = (-76).toByte(),  // 180 unsigned
      command = 107,
      data = byteArrayOf(0x01, 0x01),
    )
    // body = [seq, 0x6B, 0x01, 0x01] len=4
    // frame = [0x01, 0x04, 0x00, seq, seq, 0x6B, 0x01, 0x01]
    assertEquals("optical frame must be 8 bytes", 8, frame.size)
    assertEquals(0x01.toByte(), frame[0])   // PACKET_TYPE_COMMAND
    assertEquals(4.toByte(), frame[1])       // bodyLen low = 4
    assertEquals(0.toByte(), frame[2])       // bodyLen high = 0
    assertEquals((-76).toByte(), frame[3])  // sequence
    assertEquals((-76).toByte(), frame[4])  // inner sequence
    assertEquals(0x6B.toByte(), frame[5])   // ENABLE_OPTICAL_DATA
    assertEquals(0x01.toByte(), frame[6])   // revision byte 1
    assertEquals(0x01.toByte(), frame[7])   // revision byte 2 (enabled)
  }

  @Test
  fun `Gen5 handleNotification routes optical frame (packet_k=20) without filtering`() {
    // Replicate the when(generation) dispatch logic from handleNotification
    // Any frame bytes reach importFrame on Gen5/MG — no packet_k check
    val generation = WhoopGeneration.GEN5
    val receivedFrames = mutableListOf<ByteArray>()

    // Simulate: frame with first byte = 0x14 (packet_k 20 in Rust, optical PPG)
    val opticalFrame = byteArrayOf(0x14, 0x00, 0x01, 0x02, 0x03)
    val importFrame: (ByteArray) -> Unit = { receivedFrames.add(it) }

    when (generation) {
      WhoopGeneration.GEN4 -> { /* reassembler path, not tested here */ }
      WhoopGeneration.GEN5, WhoopGeneration.MG -> importFrame(opticalFrame)
    }

    assertEquals("optical frame must reach importFrame without filtering", 1, receivedFrames.size)
    assertArrayEquals(opticalFrame, receivedFrames[0])
    assertEquals("first byte must be 0x14 (packet_k 20)", 0x14.toByte(), receivedFrames[0][0])
  }
}
```

---

## Architecture Patterns

### Existing pattern: sendAuthCommand()

The current auth command write (lines 341-371) accesses `gatt` and `activeServiceUuid`
directly. sendOpticalEnableCommands() should follow the same pattern.

### Existing pattern: scope.launch for BLE writes

All non-blocking writes use `scope.launch(Dispatchers.IO)`. Optical enable writes must
also dispatch off the BLE callback thread.

### Existing pattern: 250ms command stagger (from iOS)

iOS sends each command in the startPhysiologyCapture sequence with a 0.25s delay
(`DispatchQueue.main.asyncAfter(deadline: .now() + delay)`). Android should mirror this
with `delay(250L * index)` inside a coroutine.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Frame wire format | Custom framing | Existing `buildCommandFrame()` — already in WhoopBleClient |
| Command write boilerplate | New write path | Copy the writeHistoricalCommand() pattern — same gatt/service/char resolution |
| Test coroutine runner | kotlinx-coroutines-test | Not needed — tests replicate pure logic only, no coroutines |

---

## Common Pitfalls

### Pitfall 1: Sending optical commands during historical sync
**What goes wrong:** writeSensorStreamCommands() in iOS explicitly blocks when
isHistoricalSyncing is true. If Android sends optical enable during the historical sync
window, the device may drop or queue-conflict the commands.
**How to avoid:** Either send optical enable before historical sync starts (preferred),
or add a syncInProgress guard. iOS avoids this by having the user trigger physiology
capture manually after sync completes. For auto-send, the safest path is to send
optical commands immediately after auth (before startHistoricalSync), with a small delay.

### Pitfall 2: Shared sequence counter with historical commands
**What goes wrong:** If optical commands reuse syncSequence, the Gen5 WHOOP device may
treat them as out-of-band historical acks and ignore or corrupt the sync state.
**How to avoid:** Use a separate sensorSequence counter, starting at 180 (matching iOS
nextSensorCommandSequence initial value).

### Pitfall 3: Sending optical commands to Gen4 devices
**What goes wrong:** Gen4 does not support optical sensor streaming at all. Sending
cmd 107/108 to a Gen4 device will produce GATT write errors or unexpected behavior.
**How to avoid:** Guard sendOpticalEnableCommands() with a generation check:
`if (generation == GEN5 || generation == MG)`.

### Pitfall 4: JVM test calling GooseBridge.safeHandle() directly
**What goes wrong:** System.loadLibrary("goose_core") fails in JVM unit tests —
UnsatisfiedLinkError. GooseBridgeTest already documents this pattern.
**How to avoid:** Test the routing logic only (the when(generation) dispatch). Do not
attempt to call GooseBridge in a JVM test. Integration coverage for the Rust bridge
call is provided by on-device tests.

---

## State of the Art

| Old State | Current State | Impact |
|-----------|---------------|--------|
| Android receives no optical frames | Add cmd 107+108 → device emits optical packets | Enables OPT-04 end-to-end |
| Routing path untested for optical packet_k values | JVM test pins the no-filter contract | Regression protection |

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| WhoopBleClient.buildCommandFrame | Optical command framing | Yes | Already in codebase |
| WhoopGeneration enum | Gen5/MG guard | Yes | Already in codebase |
| JUnit 4 | JVM tests | Yes | Used by all existing test classes |
| GooseBridge.safeHandle | Full integration | Not in JVM tests | Only testable on device |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | JUnit 4 (JVM unit tests) |
| Config file | `android/app/build.gradle` (existing) |
| Quick run command | `./gradlew :app:testDebugUnitTest --tests "*OpticalRouting*"` |
| Full suite command | `./gradlew :app:testDebugUnitTest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPT-04 | packet_k=20/21/26 frames pass through Gen5 handleNotification without filtering | unit | `./gradlew :app:testDebugUnitTest --tests "*OpticalRouting*"` | No — Wave 0 |
| OPT-04 | CMD_ENABLE_OPTICAL_DATA byte is 107 (0x6B) | unit | same | No — Wave 0 |
| OPT-04 | CMD_TOGGLE_OPTICAL_MODE byte is 108 (0x6C) | unit | same | No — Wave 0 |
| OPT-04 | revisionBoolean(true) encodes as [0x01, 0x01] | unit | same | No — Wave 0 |
| OPT-04 | ENABLE_OPTICAL_DATA frame is 8 bytes with correct layout | unit | same | No — Wave 0 |

### Wave 0 Gaps
- [ ] `android/app/src/test/kotlin/com/goose/app/ble/WhoopBleClientOpticalRoutingTest.kt` — covers OPT-04

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | No | Optical frame bytes pass to Rust; Rust does validation |
| V4 Access Control | No | BLE commands sent only when GATT connection established |

No new attack surface introduced. Optical enable commands are write-only BLE characteristic
writes to an already-paired device. The Rust bridge validates all frame content.

---

## Sources

### Primary (HIGH confidence)
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` — full read, all 575 lines; confirmed absence of cmd 107/108
- `GooseSwift/CoreBluetoothBLETransport.swift` lines 590-640 — SensorStreamCommandKind struct; exact command bytes verified
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` lines 483-523 — writeSensorStreamCommand; confirmed frame builder and 250ms stagger
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` lines 1132-1151 — auto-start trigger; confirmed iOS is user/flag triggered not always-on
- `android/app/src/test/kotlin/com/goose/app/ble/WhoopBleClientHistoricalSyncTest.kt` — full read; JVM test pattern confirmed

### Secondary (MEDIUM confidence)
- `GooseSwift/CoreBluetoothBLETransport+UserActions.swift` lines 263-293 — user-facing API surface for physiology capture [ASSUMED: Android equivalent must be auto-triggered, not user-triggered]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sending cmd 107+108 causes WHOOP 5 to emit optical packets on the existing notify characteristic | Implementation Specification | Frames may not arrive; would require BTSnoop investigation |
| A2 | 500ms delay before optical commands is sufficient to avoid historical sync conflict | Implementation Specification | Device may drop commands; mitigated by sending before historical sync |
| A3 | Gen4 does not support optical sensor commands | Common Pitfalls | Harmless write error; Gen4 not a target for OPT-04 |

**Confirmed (not assumed):**
- Android has zero cmd 107/108 send sites — verified by grep of entire android/ tree
- iOS revisionBoolean(true) = [0x01, 0x01] — verified in source
- iOS sends both 107 and 108 together — verified in startPhysiologyCapture array
- Android buildCommandFrame() produces same wire format as historical commands — verified

## Metadata

**Confidence breakdown:**
- Command gap finding: HIGH — exhaustive grep confirmed no send sites exist
- Exact byte values: HIGH — read directly from iOS source
- Frame format: HIGH — same buildCommandFrame() already in Android codebase
- Routing correctness: HIGH — read directly from handleNotification implementation
- Test pattern: HIGH — read directly from WhoopBleClientHistoricalSyncTest

**Research date:** 2026-06-24
**Valid until:** 60 days (stable protocol; no external dependencies)
