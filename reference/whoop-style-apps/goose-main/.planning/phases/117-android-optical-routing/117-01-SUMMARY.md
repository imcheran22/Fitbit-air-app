---
phase: 117-android-optical-routing
plan: "01"
subsystem: android-ble
status: complete
tags: [android, ble, optical, whoop5, gen5, mg, otp-04]
requirements: [OPT-04]

dependency_graph:
  requires:
    - "Phase 112: Rust optical frame parsing (packet_k 20/21/26 decode)"
    - "Phase 105: Android historical sync (WhoopBleClient base)"
  provides:
    - "Android sends optical enable BLE commands to Gen5/MG after auth"
    - "JVM tests pin optical command bytes and no-filter routing contract"
  affects:
    - "android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt"
    - "android/app/src/test/kotlin/com/goose/app/ble/WhoopBleClientOpticalRoutingTest.kt"

tech_stack:
  added: []
  patterns:
    - "Dedicated sequence counter per command domain (sensorSequence vs syncSequence)"
    - "Coroutine-delayed command stagger matching iOS 0.25s spacing"
    - "Gen5/MG generation guard — Gen4 excluded from optical commands"

key_files:
  modified:
    - android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt
  created:
    - android/app/src/test/kotlin/com/goose/app/ble/WhoopBleClientOpticalRoutingTest.kt

decisions:
  - "D-01 honored: no changes to importFrame or when(generation) routing dispatch — Gen5/MG already forwards all frames"
  - "D-02: optical commands sent after auth transition with 500ms delay so historical sync commands queue first"
  - "D-03: JVM tests verify packet_k 20/21/26 pass through Gen5/MG routing unfiltered"
  - "Dedicated sensorSequence counter starting at signed -76 (unsigned 180) — never shared with syncSequence"

metrics:
  duration: "~20 minutes"
  completed: "2026-06-24T14:29:03Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
  files_created: 1
  commits: 2
---

# Phase 117 Plan 01: Android Optical Routing Summary

**One-liner:** Android Gen5/MG BLE client now sends ENABLE_OPTICAL_DATA (cmd 107, 0x6B) and TOGGLE_OPTICAL_MODE (cmd 108, 0x6C) after auth, enabling the WHOOP 5 to emit optical frames that the existing routing already forwards to GooseBridge.safeHandle().

## What Was Built

### Task 1 — Optical enable commands in WhoopBleClient.kt (commit a676c61)

Added to the companion object:
- `CMD_ENABLE_OPTICAL_DATA: Byte = 107` (0x6B)
- `CMD_TOGGLE_OPTICAL_MODE: Byte = 108` (0x6C)
- `REVISION_BOOLEAN_TRUE: ByteArray = byteArrayOf(0x01, 0x01)` — mirrors iOS `revisionBoolean(true)`

Added instance field:
- `sensorSequence: Byte = (-76).toByte()` — dedicated counter starting at unsigned 180, separate from `syncSequence` (research Pitfall 2)

Added `sendOpticalEnableCommands(gatt: BluetoothGatt)`:
- Resolves service and command characteristic via `WhoopUuids.commandCharFor()` — same helper as `writeHistoricalCommand`
- Determines writeType from characteristic properties
- Sends ENABLE_OPTICAL_DATA then TOGGLE_OPTICAL_MODE, each staggered by 250ms (matching iOS 0.25s spacing)
- Uses `@Suppress("DEPRECATION")` on `characteristic.value` and `gatt.writeCharacteristic` (consistent with existing write sites)

Modified `handleNotification`:
- After existing `scope.launch { startHistoricalSync() }`, added Gen5/MG guard:
  ```kotlin
  if (generation == WhoopGeneration.GEN5 || generation == WhoopGeneration.MG) {
    val currentGatt = gatt
    if (currentGatt != null) {
      scope.launch { delay(500); sendOpticalEnableCommands(currentGatt) }
    }
  }
  ```
- 500ms delay ensures historical sync commands queue first (research A2)
- Gen4 is never reached by this guard (research Pitfall 3)
- No changes to `importFrame` or `when (generation)` dispatch (D-01)

### Task 2 — JVM unit tests (commit 980fee2)

Created `WhoopBleClientOpticalRoutingTest.kt` following `WhoopBleClientHistoricalSyncTest` pattern:
- No Android framework dependencies, no GooseBridge/native calls
- `buildCommandFrame` replicated inline as private helper

Tests written:
1. `ENABLE_OPTICAL_DATA command byte equals 0x6B (107 decimal)` — pins byte value
2. `TOGGLE_OPTICAL_MODE command byte equals 0x6C (108 decimal)` — pins byte value
3. `revisionBoolean true payload is two bytes 0x01 0x01` — pins payload encoding
4. `buildCommandFrame for ENABLE_OPTICAL_DATA produces correct 8-byte wire frame` — pins full wire format: `[0x01, 0x04, 0x00, -76, -76, 0x6B, 0x01, 0x01]`
5. `sensorSequence initial value is signed -76 matching unsigned 180` — pins counter start
6. Gen4 exclusion: optical enable dispatch must NOT fire for GEN4
7. Gen5 inclusion: optical enable dispatch MUST fire for GEN5
8. MG inclusion: optical enable dispatch MUST fire for MG
9. Gen5 routing forwards packet_k 20 (0x14) to importFrame unfiltered
10. Gen5 routing forwards packet_k 21 (0x15) to importFrame unfiltered
11. Gen5 routing forwards packet_k 26 (0x1A) to importFrame unfiltered
12. MG routing forwards packet_k 20 to importFrame unfiltered

All 12 tests pass. Full Android unit suite remains green.

## Verification

- `./gradlew :app:compileDebugKotlin` — BUILD SUCCESSFUL in 10s, EXIT=0
- `./gradlew :app:testDebugUnitTest --tests "*.WhoopBleClientOpticalRoutingTest"` — BUILD SUCCESSFUL in 3s, EXIT=0
- `./gradlew :app:testDebugUnitTest` (full suite) — BUILD SUCCESSFUL in 1s, EXIT=0

## Deviations from Plan

None — plan executed exactly as written.

- D-01 honored: `importFrame` and `when (generation)` dispatch left untouched.
- D-02 honored: optical commands sent after auth, with 500ms delay, Gen5/MG only.
- D-03 honored: JVM tests pin the routing contract for packet_k 20/21/26.
- Threat T-117-03 (Gen4 DoS via optical commands) mitigated by generation guard.
- Threat T-117-04 (sequence collision) mitigated by dedicated `sensorSequence` counter.

## Known Stubs

None — no stub values, placeholders, or hardcoded empty collections introduced.

## Threat Flags

No new threat surface beyond what the plan's threat model covers. The two new BLE write commands use the existing authenticated GATT connection and the same characteristic write path as historical sync.
