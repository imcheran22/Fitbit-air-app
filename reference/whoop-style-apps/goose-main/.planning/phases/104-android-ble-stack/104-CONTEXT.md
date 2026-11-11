# Phase 104: Android BLE Stack - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement full-parity Android BLE stack: `WhoopBleClient` connects to WHOOP Gen4/Gen5/MG via `BluetoothGatt`, performs characteristic notification subscription, reassembles multi-notification Gen4 frames, and forwards decoded packets to `GooseBridge.handle()`. Full parity with iOS `GooseBLEClient` in framing, auth state machine, and retry.

**In scope:** BluetoothGatt connection, CompanionDeviceManager pairing, BLUETOOTH_SCAN + BLUETOOTH_CONNECT permissions, Gen4 multi-notification frame reassembly, Gen5 single-notification frames, auth state machine, reconnect on disconnect, packet routing to GooseBridge.
**Out of scope:** Historical sync commands (Phase 105), server upload (Phase 106), Android CI APK (Phase 107).

</domain>

<decisions>
## Implementation Decisions

### BLE Permissions
- **D-01:** Use **CompanionDeviceManager** for device pairing — system UI pairing flow, BLUETOOTH_SCAN + BLUETOOTH_CONNECT in AndroidManifest. Requires `COMPANION_DEVICE_SETUP` permission. On API 33+, no LOCATION permission needed for BLE scan.

### Packet Framing
- **D-02:** **Full parity with iOS** — implement Gen4 multi-notification frame reassembly equivalent to `gen4HistoricalFrameBuffer` prepend pattern (from Phase 99 iOS). Incoming BLE bytes for Gen4 (service UUID `61080001`) are accumulated across notifications until a complete frame is assembled.
- **D-03:** Gen5 (service UUID `FD4B0001-...`) uses single-notification frames — no reassembly needed; pass bytes directly to GooseBridge.

### Connection + Auth State Machine
- **D-04:** **Full parity with `GooseBLEClient` iOS** — implement equivalent states: scanning → connecting → discovering_services → authenticating → connected → disconnected. Cooldown timer on repeated connection failures. Bond status tracking.
- **D-05:** On disconnect: automatic reconnect after cooldown (same as iOS). Do not reconnect if user explicitly disconnected.

### WHOOP Device Detection
- **D-06:** Service UUIDs to match: Gen4 = `61080001-...`, Gen5 = `FD4B0001-...`, MG = peripheral name contains " mg" (heuristic, same as iOS). CompanionDeviceManager filter on service UUIDs.

### SQLite Path (Android)
- **D-07:** Database path on Android: `context.filesDir.absolutePath + "/goose.sqlite"` — equivalent to iOS `ApplicationSupport/GooseSwift/goose.sqlite`. Pass to GooseBridge.handle() in every call that needs storage.

### Claude's Discretion
- Kotlin coroutines vs callbacks for BluetoothGatt: prefer coroutines with StateFlow for connection state (matches Compose reactive model)
- Thread model: BluetoothGatt callbacks are on BLE thread; dispatch to dedicated CoroutineScope for processing
- Raw frame format passed to GooseBridge: hex string (matching iOS `CaptureFrameWriteQueue` pattern)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iOS BLE counterpart (full parity target)
- `GooseSwift/GooseBLEClient.swift` — primary parity target; connection state machine, auth flow, packet dispatch
- `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` — Gen4/Gen5 frame handling patterns
- `GooseSwift/NotificationFrameParsing.swift` — `NotificationFrameParser`; frame reassembly logic

### Gen4 multi-notification reassembly (Phase 99)
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — `gen4HistoricalFrameBuffer` prepend pattern

### Android scaffold (Phase 103 output)
- `android/app/src/main/kotlin/com/goose/app/bridge/GooseBridge.kt` — JNI bridge to Rust; `handle(request: String): String`
- `android/app/src/main/kotlin/com/goose/app/` — existing package structure

### Protocol
- `Rust/core/src/protocol.rs` — service UUID constants, packet framing rules (Gen4 vs Gen5 boundary)
- `Rust/core/src/capabilities.rs` — DeviceKind variants: Whoop4, Whoop5, WhoopMg

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseBridge.kt` (Phase 103) — JNI bridge is ready; `handle("{...}")` returns JSON
- `android-libs/arm64-v8a/libgoose_core.so` — gitignored, built locally via `cd Rust/core && ANDROID_NDK_HOME=/opt/homebrew/share/android-ndk cargo ndk -t arm64-v8a build --release`

### Established Patterns (from iOS)
- BLE state machine: `scanning → connecting → discovering → authenticating → connected` — mirror in Kotlin StateFlow
- Gen4 reassembly: `gen4HistoricalFrameBuffer.prepend(bytes)` until frame complete; forward to bridge
- Database path: `filesDir.absolutePath + "/goose.sqlite"` on Android

### Integration Points
- `WhoopBleClient.kt` → `GooseBridge.handle(captureImportJson)` on BLE notification
- CompanionDeviceManager result → triggers `WhoopBleClient.connect(device)`

</code_context>

<specifics>
## Specific Ideas

- `WhoopBleClient` should expose a `StateFlow<BleConnectionState>` that MainActivity/ViewModels observe
- Gen4 service UUID prefix: `61080001` (first 8 chars of UUID); Gen5: `FD4B0001`
- CompanionDeviceManager request: filter by service UUID in `BluetoothDeviceFilter.Builder()`
- Auth state: WHOOP requires writing to auth characteristic on connect (same as iOS `authenticateWhoop()`)
- Capture import bridge call: `{"schema":"goose.bridge.request.v1","method":"capture.import_frames","args":{"database_path":"...","frames":[...]}}`

</specifics>

<deferred>
## Deferred Ideas

- Historical sync commands (BLE write commands for sync start/stop) — Phase 105
- Server upload after sync — Phase 106
- armeabi-v7a / x86_64 ABI support — Phase 107

</deferred>

---

*Phase: 104-android-ble-stack*
*Context gathered: 2026-06-21*
