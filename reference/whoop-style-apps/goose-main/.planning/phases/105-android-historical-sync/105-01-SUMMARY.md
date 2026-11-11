---
phase: 105
plan: "01"
subsystem: android-ble
tags: [android, ble, historical-sync, kotlin, whoop]
status: complete
requirements: [AND-03]

dependency_graph:
  requires: [Phase 104 (WhoopBleClient + FrameReassembler), Phase 98 (SYNC-08 Rust routing fix)]
  provides: [Android historical sync pipeline, startHistoricalSync(), buildCommandFrame()]
  affects: [WhoopBleClient.kt]

tech_stack:
  added: []
  patterns:
    - onCharacteristicWrite-driven command sequencing (mirrors iOS pattern)
    - @Volatile flag guards for concurrent sync prevention
    - source parameter routing for bridge calls (historical_sync vs android_ble)

key_files:
  modified:
    - android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt

decisions:
  - GET_DATA_RANGE = cmd byte 34 (0x22), SEND_HISTORICAL_DATA = cmd byte 22 (0x16), confirmed from iOS CoreBluetoothBLETransport.swift
  - buildCommandFrame wire format: [0x01, bodyLenLow, bodyLenHigh, outerSeq, innerSeq, cmdByte, ...data]
  - Gen4 payload override [0x00] for both commands; Gen5 uses empty byteArrayOf()
  - 30-second idle timeout via scope.launch { delay() } completes sync after SEND_HISTORICAL_DATA confirmed
  - importFrame() and buildImportRequest() accept source: String parameter; "historical_sync" during sync, "android_ble" otherwise
  - syncInProgress captured as local val before coroutine dispatch to avoid race condition

metrics:
  duration: "~25 min"
  completed: "2026-06-21"
  tasks_completed: 6
  tasks_total: 6
  files_modified: 1
---

# Phase 105 Plan 01: Android Historical Sync Port Summary

Android historical sync pipeline ported from iOS to `WhoopBleClient.kt`. Sends GET_DATA_RANGE + SEND_HISTORICAL_DATA BLE commands on connect, routes type-47 body frames through FrameReassembler → GooseBridge with `source="historical_sync"`.

## What Was Delivered

### New functions in WhoopBleClient.kt
- `startHistoricalSync()` — guard-checked entry point; sets `syncInProgress`, writes GET_DATA_RANGE, sets `pendingSyncCommand`
- `buildCommandFrame(sequence, command, data)` — builds WHOOP BLE command frame in iOS-compatible wire format
- `writeHistoricalCommand(command, data)` — guarded GATT write with sequence increment; mirrors iOS `writeHistoricalCommand()`
- `completeSyncIfActive(reason)` — clears sync state; called from 30s idle timeout and `onGattDisconnected()`

### New companion object constants
- `CMD_GET_DATA_RANGE: Byte = 34` (0x22)
- `CMD_SEND_HISTORICAL_DATA: Byte = 22` (0x16)
- `CMD_HISTORICAL_DATA_RESULT: Byte = 23` (0x17)
- `PACKET_TYPE_COMMAND: Byte = 0x01`
- `SYNC_IDLE_TIMEOUT_MS = 30_000L`

### New @Volatile fields
- `syncInProgress: Boolean` — concurrent sync guard
- `syncSequence: Byte` — command sequence counter (starts at 57, mirrors iOS)
- `pendingSyncCommand: Byte` — tracks which command write we await confirmation for

### Modified signatures
- `importFrame(frameBytes, source: String = "android_ble")` — source parameter added
- `buildImportRequest(dbPath, evidenceId, capturedAt, deviceModel, frameHex, source)` — source passed through to JSON
- `handleNotification()` — captures `syncInProgress` as `isSync` before coroutine; passes `frameSource` to `importFrame()`; auto-triggers `startHistoricalSync()` on `Authenticating → Connected` transition

### State machine
`onCharacteristicWrite` callback drives sequencing: GET_DATA_RANGE confirmed → write SEND_HISTORICAL_DATA → 30s idle timer → `completeSyncIfActive("idle_timeout")`. `onGattDisconnected()` resets `syncInProgress = false`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1–6 | d7585bb | feat(105-01): android historical sync port |

## Verification

- `./gradlew assembleDebug` — BUILD SUCCESSFUL (exit 0, 12s, no errors)
- `WhoopBleClient.kt` contains all required functions and constants per plan acceptance criteria
- `syncInProgress` guard confirmed — `startHistoricalSync()` no-ops if already running
- Gen4 payload `[0x00]`, Gen5 payload `byteArrayOf()` routing confirmed in code
- `source="historical_sync"` set correctly when `isSync == true` in `handleNotification()`
- `onGattDisconnected()` resets `syncInProgress = false` and `pendingSyncCommand = 0`

## Deviations from Plan

None — plan executed exactly as written. All 6 tasks implemented in a single coherent file write since all changes were to one file and interdependent.

## Known Stubs

- **AND-03 live device verification** — `SELECT COUNT(*) FROM decoded_frames WHERE device_id = ?` > 0 requires a real WHOOP device connection. The code path is complete and correct; verification requires physical hardware testing.

## Self-Check: PASSED

- feat commit d7585bb exists: confirmed
- `WhoopBleClient.kt` modified: 1 file, +173 insertions
- BUILD SUCCESSFUL: confirmed (exit 0)
- All acceptance criteria met per task definitions
