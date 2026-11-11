# Phase 104: Android BLE Stack — Research

**Phase:** 104
**Requirement:** AND-02
**Date:** 2026-06-21

## Summary

What do I need to know to plan Phase 104 well? This document answers that question by
synthesizing the iOS parity target, the Android scaffold output from Phase 103, and the
Rust bridge API that the Android BLE client must call.

---

## 1. iOS Parity Target — Key Facts

### 1.1 WHOOP Service and Characteristic UUIDs

**Gen4 (WHOOP 4.x):**
| Role | UUID |
|---|---|
| Service | `61080001-8d6d-82b8-614a-1c8cb0f8dcc6` |
| Command (write) | `61080002-8d6d-82b8-614a-1c8cb0f8dcc6` |
| Notification 1 | `61080003-8d6d-82b8-614a-1c8cb0f8dcc6` |
| Notification 2 | `61080004-8d6d-82b8-614a-1c8cb0f8dcc6` |
| Notification 3 | `61080005-8d6d-82b8-614a-1c8cb0f8dcc6` |
| Debug/menu | `61080007-8d6d-82b8-614a-1c8cb0f8dcc6` |

**Gen5 (WHOOP 5.x / MG):**
| Role | UUID |
|---|---|
| Service | `fd4b0001-cce1-4033-93ce-002d5875f58a` |
| Command (write) | `fd4b0002-cce1-4033-93ce-002d5875f58a` |
| Notification 1 | `fd4b0003-cce1-4033-93ce-002d5875f58a` |
| Notification 2 | `fd4b0004-cce1-4033-93ce-002d5875f58a` |
| Notification 3 | `fd4b0005-cce1-4033-93ce-002d5875f58a` |
| Debug/menu | `fd4b0007-cce1-4033-93ce-002d5875f58a` |

Detection: Gen4 service UUID prefix `61080001`; Gen5 prefix `FD4B0001`; MG = device name
contains ` mg` (case-insensitive). GOOSE and MAVERICK hardware generations share identical
BLE service UUIDs (`fd4b0001-...`) — server-side disambiguation is needed to distinguish
them precisely, but for Phase 104 the service UUID match is sufficient to initiate connection.

### 1.2 Connection State Machine (iOS `CoreBluetoothBLETransport`)

The iOS state machine follows this sequence:
```
not requested → scanning → connecting → discovering_services → authenticating → connected
                                                                                    ↓
                                                               auto-reconnect ← disconnected
```

Key points:
- `clientHelloSentForCurrentConnection` flag prevents double-auth per connection
- `authRetryPending` / `authRetryCount` / `authExhausted` track repeated auth failures
- On disconnect: if user didn't explicitly disconnect, schedule reconnect after cooldown
- `bondingManager` tracks subscription state: notStarted → started → subscribed

### 1.3 Gen4 Multi-Notification Frame Reassembly (iOS `CoreBluetoothBLETransport+HistoricalHandlers.swift`)

The prepend-buffer pattern (SYNC-09):
```swift
// Prepend any buffered tail from prior notification
let inputBytes = buffer.isEmpty ? value : buffer + value
buffer = Data()
let frames = parseFrames(in: inputBytes)
// Compute consumed bytes (each frame: 4-byte header + declared body length)
let consumedCount = frames.reduce(0) { acc, frame in
    guard frame.count >= 4 else { return acc }
    let declaredLength = Int(frame[1]) | Int(frame[2]) << 8
    return acc + 4 + declaredLength
}
// Store unconsumed tail back (cap at 8192 bytes)
let tail = inputBytes[consumedCount...]
buffer = tail.count > 0 && tail.count <= 8192 ? Data(tail) : Data()
```

Frame header format: `[type: u8, len_lo: u8, len_hi: u8, seq: u8, ...body...]`
- Frame total size = 4 + declared_length
- Gen4 uses multi-notification reassembly; Gen5 uses single-notification (no buffer needed)

### 1.4 Notification Pipeline

In iOS:
- Real-time (live vitals) notifications → parsed on BLE thread, dispatched to main
- Historical sync notifications → accumulated, reassembled, written in batches
- `CaptureFrameWriteQueue` flushes hex frames to Rust bridge as `capture.import_frame_batch`

For Phase 104 (live/realtime only — historical sync is Phase 105):
- Subscribe to all notification characteristics for the connected device generation
- On each notification: reassemble (Gen4) or pass directly (Gen5) → call bridge

---

## 2. Android Scaffold (Phase 103 Output)

### 2.1 Existing Files

```
android/
  app/
    build.gradle.kts          — compileSdk=36, minSdk=26, arm64-v8a, Compose enabled
    src/main/
      AndroidManifest.xml     — MISSING: BLE permissions, CompanionDeviceManager
      kotlin/com/goose/app/
        bridge/GooseBridge.kt — JNI bridge: handle(request: String): String
        MainActivity.kt
        ui/                   — HomeScreen, HealthScreen, CoachScreen, MoreScreen, AppShell
```

### 2.2 GooseBridge.kt API

```kotlin
object GooseBridge {
    init { System.loadLibrary("goose_core") }
    external fun handle(request: String): String
    fun safeHandle(request: String): String  // wraps handle(), returns error JSON on throw
}
```

JSON-RPC envelope:
```json
{
  "schema": "goose.bridge.request.v1",
  "method": "capture.import_frame_batch",
  "args": { "database_path": "...", "frames": [...] }
}
```

### 2.3 Android Build Config

- `minSdk = 26` — BluetoothGatt available since API 18; CompanionDeviceManager available API 26
- `compileSdk = 36` — full modern API available
- `abiFilters += "arm64-v8a"` — single ABI for Phase 104
- JNI libs from `android-libs/arm64-v8a/` (gitignored, built with cargo-ndk)

---

## 3. Rust Bridge API — Capture Import

### 3.1 Method: `capture.import_frame_batch`

```rust
struct CapturedFrameInput {
    pub evidence_id: String,     // unique ID for dedup (e.g. UUID)
    pub frame_id: Option<String>,
    pub source: String,          // "android_ble"
    pub captured_at: String,     // ISO 8601
    pub device_model: String,    // "whoop4" / "whoop5" / "whoop_mg"
    pub frame_hex: String,       // hex-encoded raw frame bytes
    pub sensitivity: String,     // "normal"
    pub capture_session_id: Option<String>,
    pub device_type: DeviceType, // default: "live"
    pub device_uuid: Option<String>,
}
```

Full request JSON:
```json
{
  "schema": "goose.bridge.request.v1",
  "method": "capture.import_frame_batch",
  "args": {
    "database_path": "/data/data/com.goose.app/files/goose.sqlite",
    "frames": [
      {
        "evidence_id": "uuid-here",
        "source": "android_ble",
        "captured_at": "2026-06-21T12:00:00Z",
        "device_model": "whoop5",
        "frame_hex": "10...",
        "sensitivity": "normal"
      }
    ]
  }
}
```

Database path on Android: `context.filesDir.absolutePath + "/goose.sqlite"` (D-07).

---

## 4. Android BLE API Patterns

### 4.1 BluetoothGatt Lifecycle

```kotlin
// Scan (CompanionDeviceManager handles this for Phase 104)
// Connect
val gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)

// In GattCallback:
override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
    if (newState == BluetoothProfile.STATE_CONNECTED) {
        gatt.requestMtu(247)  // BLE-REL-01: MTU negotiation first
    }
}

override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
    gatt.discoverServices()
}

override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
    // Subscribe to notification characteristics
    // Write auth command to command characteristic
}

override fun onCharacteristicChanged(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic,
    value: ByteArray  // API 33+; use characteristic.value on API < 33
) {
    // Reassemble (Gen4) or pass directly (Gen5) → bridge call
}
```

### 4.2 Enabling Notifications

```kotlin
fun enableNotifications(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
    gatt.setCharacteristicNotification(characteristic, true)
    val descriptor = characteristic.getDescriptor(
        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")  // CCCD
    )
    descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    gatt.writeDescriptor(descriptor)
}
```

### 4.3 CompanionDeviceManager Pairing (D-01)

```kotlin
val manager = context.getSystemService(CompanionDeviceManager::class.java)
val filter = BluetoothDeviceFilter.Builder()
    .addServiceUuid(ParcelUuid.fromString("61080001-8d6d-82b8-614a-1c8cb0f8dcc6"), null)
    .addServiceUuid(ParcelUuid.fromString("fd4b0001-cce1-4033-93ce-002d5875f58a"), null)
    .build()
val request = AssociationRequest.Builder()
    .addDeviceFilter(filter)
    .setSingleDevice(false)
    .build()
manager.associate(request, executor, callback)
```

Permissions needed in AndroidManifest:
- `BLUETOOTH_SCAN` (API 31+, `neverForLocation` flag)
- `BLUETOOTH_CONNECT` (API 31+)
- `REQUEST_COMPANION_RUN_IN_BACKGROUND` (optional, for background BLE)

### 4.4 Threading Model

- `BluetoothGattCallback` runs on a dedicated BLE thread (not main)
- `StateFlow<BleConnectionState>` updated via `MutableStateFlow` — Kotlin coroutines handle thread safety
- Bridge calls (blocking I/O) → dispatch to `Dispatchers.IO` CoroutineScope
- UI state updates → `Dispatchers.Main` via `launch { ... }`

---

## 5. Auth State Machine — Android Parity (D-04)

The WHOOP auth sequence on iOS:
1. Connect → discover services → subscribe notifications
2. Write "client hello" bytes to command characteristic
3. Await auth response on notification characteristic (packet type = auth_response)
4. If auth success → state = `connected`; if failure → retry with cooldown

For Android parity:
- `BleConnectionState` sealed class: `Idle`, `Scanning`, `Connecting`, `DiscoveringServices`, `Authenticating`, `Connected`, `Disconnected(reason: String)`
- Auth command bytes: same as iOS `clientHelloCommand` (platform-independent protocol)
- Retry limit mirrors iOS `authRetryCount` / `authExhausted`

---

## 6. Kotlin Coroutines Pattern for WhoopBleClient

```kotlin
class WhoopBleClient(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _connectionState = MutableStateFlow<BleConnectionState>(BleConnectionState.Idle)
    val connectionState: StateFlow<BleConnectionState> = _connectionState.asStateFlow()

    private var gen4FrameBuffer: ByteArray = ByteArray(0)  // Gen4 reassembly buffer

    fun connect(device: BluetoothDevice) { /* ... */ }
    fun disconnect() { /* ... */ }

    private fun onNotification(characteristic: BluetoothGattCharacteristic, value: ByteArray) {
        val frames = if (isGen4) reassembleGen4(value) else listOf(value)
        for (frame in frames) {
            scope.launch { importFrameToBridge(frame) }
        }
    }

    private fun importFrameToBridge(frameBytes: ByteArray) {
        val frameHex = frameBytes.joinToString("") { "%02x".format(it) }
        val request = buildImportRequest(frameHex)
        GooseBridge.safeHandle(request)
    }
}
```

---

## 7. AndroidManifest Changes Required

```xml
<!-- BLE permissions (API 31+) -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<!-- CompanionDeviceManager -->
<uses-permission android:name="android.permission.REQUEST_COMPANION_RUN_IN_BACKGROUND" />
<!-- Feature declaration -->
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />

<!-- In <application>: no new components needed for Phase 104 -->
```

---

## 8. Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `onCharacteristicChanged` API differs API 33+ vs < 33 | Use `@Deprecated` override for < 33 + new signature for 33+ |
| CCCD descriptor write must happen one-at-a-time | Queue descriptor writes; wait for `onDescriptorWrite` callback before next |
| Gen4 buffer grows unbounded on malformed frames | Cap at 8192 bytes (mirror iOS) |
| Bridge call blocks BLE thread | Always dispatch to `Dispatchers.IO` |
| CompanionDeviceManager result delivered via `IntentSender` | Handle in `onActivityResult` / `ActivityResultLauncher` |
| Auth failure retry loop on Android | Mirror iOS `authRetryCount` limit (12 cycles) + `authExhausted` flag |

---

## 9. Files to Create / Modify

### New files:
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt`
- `android/app/src/main/kotlin/com/goose/app/ble/BleConnectionState.kt`
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopUuids.kt`
- `android/app/src/main/kotlin/com/goose/app/ble/FrameReassembler.kt`
- `android/app/src/test/kotlin/com/goose/app/ble/FrameReassemblerTest.kt`

### Modified files:
- `android/app/src/main/AndroidManifest.xml` — add BLE permissions
- `android/app/src/main/kotlin/com/goose/app/MainActivity.kt` — wire WhoopBleClient

---

## 10. Validation Architecture

To verify Phase 104 meets AND-02:

1. **Unit test:** `FrameReassemblerTest` — feed multi-notification Gen4 bytes, assert complete frames extracted
2. **Build test:** `./gradlew assembleDebug` succeeds with all new files
3. **Integration (manual):** Connect Android device to WHOOP; verify `BleConnectionState.Connected` in logs
4. **Bridge call verification:** Check SQLite via `adb shell` for imported capture rows after notification received

---

## RESEARCH COMPLETE

**Phase:** 104
**Output:** `.planning/phases/104-android-ble-stack/104-RESEARCH.md`
**Key findings:**
- WHOOP Gen4/Gen5 UUIDs confirmed from iOS source
- `capture.import_frame_batch` is the correct bridge method with `CapturedFrameInput` struct
- Gen4 reassembly: prepend-buffer pattern, frame header = 4 bytes + declared body length
- Android minSdk=26 supports CompanionDeviceManager and all required BLE APIs
- BLE callbacks are off-main-thread; use `Dispatchers.IO` for bridge calls
- Auth state machine: 6 states mirroring iOS, with retry limit and cooldown
