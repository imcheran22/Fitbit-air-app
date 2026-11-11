---
plan: 104-01
phase: 104
subsystem: android-ble
tags: [android, ble, kotlin, whoop, gen4, gen5]
requirements: [AND-02]
status: complete
dependency_graph:
  requires: [103-01]
  provides: [WhoopBleClient, FrameReassembler, BleConnectionState, WhoopUuids]
  affects: [android-app, android-bridge]
tech_stack:
  added: [lifecycle-runtime-compose 2.9.1]
  patterns: [BluetoothGatt callback, StateFlow, Dispatchers.IO bridge dispatch, CCCD serialised writes]
key_files:
  created:
    - android/app/src/main/kotlin/com/goose/app/ble/WhoopUuids.kt
    - android/app/src/main/kotlin/com/goose/app/ble/BleConnectionState.kt
    - android/app/src/main/kotlin/com/goose/app/ble/FrameReassembler.kt
    - android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt
    - android/app/src/test/kotlin/com/goose/app/ble/FrameReassemblerTest.kt
  modified:
    - android/app/src/main/AndroidManifest.xml
    - android/app/src/main/kotlin/com/goose/app/MainActivity.kt
    - android/app/src/main/kotlin/com/goose/app/ui/AppShell.kt
    - android/app/src/main/kotlin/com/goose/app/ui/HomeScreen.kt
    - android/gradle/libs.versions.toml
    - android/app/build.gradle.kts
decisions:
  - WhoopBleClient uses BluetoothGattCallback (not coroutine-wrapped) for lowest-level control; StateFlow exposes state reactively
  - CLIENT_HELLO_BYTES derived from iOS GooseHello.clientHelloFrameHex (aa0108000001e67123019101363e5c8d)
  - CCCD writes serialised via ArrayDeque + onDescriptorWrite chain (T-104-03)
  - Bridge calls always on Dispatchers.IO, never on BLE callback thread (T-104-02)
  - org.json.JSONObject used for bridge request building (Android SDK built-in, no extra deps)
metrics:
  duration: "~90 min"
  completed: "2026-06-21"
  tasks: 7
  files: 11
---

# Phase 104 Plan 01: Android BLE Stack Summary

## One-liner

Android `WhoopBleClient` connects to WHOOP Gen4/Gen5/MG via BluetoothGatt, reassembles Gen4 multi-notification frames using iOS SYNC-09 prepend-buffer algorithm, and forwards decoded frame hex to `GooseBridge.safeHandle()` via `capture.import_frame_batch`.

## What was delivered

### New BLE package (`android/app/src/main/kotlin/com/goose/app/ble/`)

- **WhoopUuids.kt** — All WHOOP BLE UUID constants (Gen4 service `61080001-...`, Gen5 `fd4b0001-...`, command/notify chars, CCCD). Helper functions `isWhoopService()`, `isGen4()`, `notifyCharsFor()`, `commandCharFor()`.

- **BleConnectionState.kt** — 7-state sealed class mirroring iOS `CoreBluetoothBLETransport` state machine: `Idle → Scanning → Connecting → DiscoveringServices → Authenticating → Connected → Disconnected`. `WhoopGeneration` enum: GEN4, GEN5, MG.

- **FrameReassembler.kt** — Gen4 multi-notification frame reassembler. Implements iOS SYNC-09 prepend-buffer algorithm exactly: prepend stored tail + incoming bytes, parse complete frames (header = 4 bytes + declared body length), store unconsumed tail (capped at 8192 bytes per T-104-01). `reset()` clears buffer on disconnect.

- **WhoopBleClient.kt** — Main GATT client:
  - Connects via `device.connectGatt(..., TRANSPORT_LE)`, requests MTU 247, discovers services, queues serialised CCCD writes
  - Sends `CLIENT_HELLO_BYTES` (16-byte auth frame matching iOS `GooseHello.clientHelloFrameHex`)
  - Auth retry limit: 12 cycles (mirrors iOS `authExhausted` threshold)
  - Gen4 notifications → `FrameReassembler.feed()` → `importFrame()` per complete frame
  - Gen5/MG notifications → `importFrame()` directly
  - `importFrame()` dispatches to `Dispatchers.IO`, calls `GooseBridge.safeHandle()` with `capture.import_frame_batch` JSON
  - Auto-reconnect after 5s cooldown; suppressed when `disconnect()` sets `userDisconnected=true`
  - Both `onCharacteristicChanged` overrides (API 33+ and deprecated API < 33)
  - DB path: `context.filesDir.absolutePath + "/goose.sqlite"` (D-07)

- **FrameReassemblerTest.kt** — 8 unit tests: single complete frame, split across 2 notifications, split across 3 notifications, two frames in one notification, oversized tail discarded, reset clears buffer, zero-body frame valid, empty notification no crash.

### Modified files

- **AndroidManifest.xml** — `BLUETOOTH_SCAN` (neverForLocation), `BLUETOOTH_CONNECT`, legacy BLE for API < 31, `REQUEST_COMPANION_RUN_IN_BACKGROUND`, `android.hardware.bluetooth_le` required.
- **MainActivity.kt** — Lazy `WhoopBleClient`, `collectAsStateWithLifecycle()`, `onDestroy()` cleanup.
- **AppShell.kt** — `connectionState: BleConnectionState` parameter threaded to `HomeScreen`.
- **HomeScreen.kt** — Displays BLE state label (debug proof of state plumbing).
- **libs.versions.toml / build.gradle.kts** — `lifecycle-runtime-compose 2.9.1`.

## Verification results

- `./gradlew testDebugUnitTest` — BUILD SUCCESSFUL (all 8 FrameReassemblerTest cases pass)
- `./gradlew assembleDebug` — BUILD SUCCESSFUL (1m 21s)
- Kotlin compilation: BUILD SUCCESSFUL (no errors)
- `capture.import_frame_batch` present in WhoopBleClient.kt
- RESEARCH.md in correct location: `.planning/phases/104-android-ble-stack/104-RESEARCH.md`
- No RE references in `android/` directory

## Deviations from Plan

None — plan executed exactly as written.

Tasks 5 and 6 (WhoopBleClient + auth bytes) were implemented together as a single unit since auth bytes were discovered during the same file-reading pass (iOS `GooseHello.swift` line 5: `clientHelloFrameHex = "aa0108000001e67123019101363e5c8d"`).

## Known Stubs

- `HomeScreen` BLE state display is a debug string (`Text("BLE: ${connectionState.statusLabel()}")`). Full UI polish is deferred to a future UI phase.
- `WhoopBleClient.connect()` must be called externally with a `BluetoothDevice` — no scan/CompanionDeviceManager UI is wired yet. Scan flow is deferred to Phase 107 (Android CI + CompanionDeviceManager).

## Threat Surface Scan

No new network endpoints, auth paths beyond those in `<threat_model>`, or trust boundary changes. `GooseBridge.safeHandle()` is an existing internal JNI boundary. DB path is local to app sandbox.

## Self-Check: PASSED

- WhoopUuids.kt: FOUND
- BleConnectionState.kt: FOUND
- FrameReassembler.kt: FOUND
- WhoopBleClient.kt: FOUND
- FrameReassemblerTest.kt: FOUND
- Commits b447b9d, 2a2bc8a, ff5164c: FOUND
- BUILD SUCCESSFUL (assembleDebug + testDebugUnitTest)
