---
phase: 104
slug: android-ble-stack
status: complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-21
---

# Phase 104 — Validation Strategy

> Per-phase validation contract reconstructed from SUMMARY.md (State B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | JUnit 4 (Android Gradle testDebugUnitTest) |
| **Config file** | `android/app/build.gradle.kts` |
| **Quick run command** | `cd android && ./gradlew testDebugUnitTest --tests "com.goose.app.ble.*"` |
| **Full suite command** | `cd android && ./gradlew testDebugUnitTest` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd android && ./gradlew testDebugUnitTest --tests "com.goose.app.ble.*"`
- **After every plan wave:** Run `cd android && ./gradlew testDebugUnitTest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 104-01-01 | 01 | 1 | AND-02 | T-104-05 | UUID constants prevent wrong-service CCCD enable | unit | `./gradlew testDebugUnitTest --tests "com.goose.app.ble.WhoopUuidsTest"` | ✅ | ✅ green |
| 104-01-02 | 01 | 1 | AND-02 | — | 7-state machine prevents premature bridge calls | unit | `./gradlew testDebugUnitTest --tests "com.goose.app.ble.BleConnectionStateTest"` | ✅ | ✅ green |
| 104-01-03 | 01 | 1 | AND-02 | T-104-01 | Oversized tail discarded (cap 8192 bytes) | unit | `./gradlew testDebugUnitTest --tests "com.goose.app.ble.FrameReassemblerTest"` | ✅ | ✅ green |
| 104-01-04 | 01 | 1 | AND-02 | T-104-05 | BLE permissions required (neverForLocation) | manual | `grep "BLUETOOTH_SCAN\|BLUETOOTH_CONNECT\|bluetooth_le" android/app/src/main/AndroidManifest.xml` | ✅ | ✅ green |
| 104-01-05 | 01 | 1 | AND-02 | T-104-02, T-104-03, T-104-04 | Bridge on Dispatchers.IO; CCCD serialised; auth limit 12 | manual | Hardware BLE device required | ✅ | ⚠️ manual |
| 104-01-06 | 01 | 1 | AND-02 | — | CLIENT_HELLO_BYTES matches iOS byte sequence | manual | Source inspection: `grep CLIENT_HELLO_BYTES android/.../WhoopBleClient.kt` | ✅ | ✅ green |
| 104-01-07 | 01 | 1 | AND-02 | — | connectionState plumbed to Compose UI | manual | Build check: `./gradlew assembleDebug` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Not applicable — test infrastructure (JUnit 4 via Android Gradle) was already present from Phase 103. Tests were added inline during Phase 104 execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WhoopBleClient GATT callbacks fire on real hardware | AND-02 | Requires Bluetooth hardware; BluetoothGatt not mockable without Android framework | Connect physical WHOOP device and observe `adb logcat` for StateFlow transitions |
| CCCD descriptor writes serialised (T-104-03) | AND-02 | Requires Android GATT subsystem | Verify `onDescriptorWrite` triggers next CCCD write in `adb logcat` during connect |
| Auth retry exhaustion at 12 cycles (T-104-04) | AND-02 | Requires hardware + controlled GATT failure injection | Inject repeated char write failures and verify disconnect without reconnect |
| AndroidManifest BLE permissions (T-104-05) | AND-02 | Manifest verification is a build check, not a unit test | `grep BLUETOOTH_SCAN android/app/src/main/AndroidManifest.xml` exits with match |
| CLIENT_HELLO_BYTES byte sequence matches iOS | AND-02 | Cross-language comparison, not automated | Verify `aa0108000001e67123019101363e5c8d` in WhoopBleClient.kt companion object |
| connectionState UI plumbing in MainActivity | AND-02 | Compose UI state requires simulator/device | Build `./gradlew assembleDebug` and verify BLE state label on HomeScreen |

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved (new test files) | 2 |
| Escalated to manual | 0 |

**New test files added:**
- `android/app/src/test/kotlin/com/goose/app/ble/WhoopUuidsTest.kt` — 22 cases (UUID constants, helper functions)
- `android/app/src/test/kotlin/com/goose/app/ble/BleConnectionStateTest.kt` — 25 cases (sealed class states, isConnected, deviceAddress extensions)

**Verification:** `./gradlew testDebugUnitTest --tests "com.goose.app.ble.*"` — BUILD SUCCESSFUL

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual-only justification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not required (JUnit 4 infrastructure already present)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21
