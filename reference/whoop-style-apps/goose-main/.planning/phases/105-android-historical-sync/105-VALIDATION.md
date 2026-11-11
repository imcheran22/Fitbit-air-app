---
phase: 105
slug: android-historical-sync
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
audited: 2026-06-21
---

# Phase 105 — Validation Strategy

> Nyquist validation for Phase 105: Android Historical Sync Port (AND-03).
> Reconstructed from SUMMARY.md (State B — no prior VALIDATION.md).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | JUnit 4 (via `testImplementation(libs.junit)` in `app/build.gradle.kts`) |
| **Config file** | `android/app/build.gradle.kts` — `testImplementation(libs.junit)` |
| **Quick run command** | `cd android && ./gradlew :app:testDebugUnitTest --tests "com.goose.app.ble.WhoopBleClientHistoricalSyncTest"` |
| **Full suite command** | `cd android && ./gradlew :app:testDebugUnitTest` |
| **Estimated runtime** | ~3 min (Gradle cold), ~20 s (daemon warm) |
| **Test file** | `android/app/src/test/kotlin/com/goose/app/ble/WhoopBleClientHistoricalSyncTest.kt` |

---

## Sampling Rate

- **After every task commit:** Run quick run command above
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~3 min cold / ~20 s warm

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 105-01-01 | 01 | 1 | AND-03 | T-105-01 | Constants correct (CMD bytes, PACKET_TYPE) | unit | `./gradlew :app:testDebugUnitTest --tests "*.WhoopBleClientHistoricalSyncTest"` | ✅ | ✅ green |
| 105-01-02 | 01 | 1 | AND-03 | T-105-02 | buildCommandFrame wire format correct | unit | `./gradlew :app:testDebugUnitTest --tests "*.WhoopBleClientHistoricalSyncTest"` | ✅ | ✅ green |
| 105-01-03 | 01 | 1 | AND-03 | T-105-01 | syncInProgress guard prevents concurrent syncs | unit | `./gradlew :app:testDebugUnitTest --tests "*.WhoopBleClientHistoricalSyncTest"` | ✅ | ✅ green |
| 105-01-04 | 01 | 1 | AND-03 | T-105-02 | source routing: "historical_sync" vs "android_ble" | unit | `./gradlew :app:testDebugUnitTest --tests "*.WhoopBleClientHistoricalSyncTest"` | ✅ | ✅ green |
| 105-01-05 | 01 | 1 | AND-03 | T-105-01 | Auto-trigger on Authenticating→Connected | manual | Device-only — BLE callback required | — | ✅ manual-verified (SUMMARY) |
| 105-01-06 | 01 | 1 | AND-03 | — | `./gradlew assembleDebug` BUILD SUCCESSFUL | build | `cd android && ./gradlew assembleDebug` | ✅ | ✅ green (SUMMARY d7585bb) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing JUnit 4 infrastructure covers all phase requirements.
Test file created as part of this validation pass:

- [x] `android/app/src/test/kotlin/com/goose/app/ble/WhoopBleClientHistoricalSyncTest.kt` — 15 tests covering AND-03 wire format, source routing, guard semantics, sequence wrapping, Gen4/Gen5 payload branching

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auto-trigger `startHistoricalSync()` on `Authenticating → Connected` BLE transition | AND-03 | Requires live CoreBluetooth GATT callback from real or emulated WHOOP device; no Android mock for BluetoothGatt | Connect Android app to WHOOP device, confirm `startHistoricalSync` log line appears in Logcat immediately after auth |
| GET_DATA_RANGE (cmd 34) + SEND_HISTORICAL_DATA (cmd 22) written to BLE command characteristic | AND-03 | Requires live WHOOP device accepting BLE writes | Observe `hist cmd=0x22` then `hist cmd=0x16` in Logcat after BLE connect |
| `decoded_frames` rows inserted in SQLite after Gen5 historical sync | AND-03 | Requires real WHOOP Gen5 device; end-to-end path through Rust bridge | After sync, run `adb shell "run-as com.goose.app sqlite3 files/goose.sqlite 'SELECT COUNT(*) FROM decoded_frames'"` — expect count > 0 |
| 30-second idle timeout calls `completeSyncIfActive("idle_timeout")` | AND-03 | Requires real timing; coroutine delay not mockable in unit test without coroutine test framework | Observe `Historical sync complete: reason=idle_timeout` in Logcat ~30s after SEND_HISTORICAL_DATA write |

---

## Test Coverage Summary

### Automated (15 JUnit tests in `WhoopBleClientHistoricalSyncTest.kt`)

| Test | Covers |
|------|--------|
| `GET_DATA_RANGE command byte is 34 (0x22)` | Constant correctness |
| `SEND_HISTORICAL_DATA command byte is 22 (0x16)` | Constant correctness |
| `HISTORICAL_DATA_RESULT ack byte is 23 (0x17)` | Constant correctness |
| `PACKET_TYPE_COMMAND is 0x01` | Constant correctness |
| `buildCommandFrame with empty data produces correct wire bytes` | Wire format, Gen5 path |
| `buildCommandFrame with Gen4 zero-byte payload produces correct wire bytes` | Wire format, Gen4 path |
| `buildCommandFrame SEND_HISTORICAL_DATA Gen5 wire bytes` | Wire format, sequence 58 |
| `buildCommandFrame bodyLen encoding handles value requiring two bytes` | bodyLen low byte overflow |
| `buildCommandFrame bodyLen encoding handles value above 255` | bodyLen high byte encoding |
| `source is historical_sync when syncInProgress is true` | Source routing — sync path |
| `source is android_ble when syncInProgress is false` | Source routing — live path |
| `Gen5 historical command payload is empty byteArray` | Gen5 payload branch |
| `Gen4 historical command payload is single zero byte` | Gen4 payload override |
| `MG generation uses Gen5 payload path (empty byteArray)` | MG → non-Gen4 path |
| `concurrent sync guard — second call skipped when flag is true` | syncInProgress guard |
| `completeSyncIfActive clears syncInProgress and pendingSyncCommand` | State reset on complete |
| `onGattDisconnected resets syncInProgress to false` | Disconnect cleanup |
| `syncSequence starts at 57 matching iOS initial value` | Sequence init value |
| `syncSequence wraps correctly on byte overflow` | Wrapping byte arithmetic |
| `command frame header format compatible with 4-byte frame header` | Header format contract |

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 5 (wire format, source routing, guard semantics, Gen4/Gen5 branching, sequence wrap) |
| Resolved (automated) | 5 |
| Escalated (manual-only) | 4 (BLE hardware-gated behaviors) |

---

## Validation Sign-Off

- [x] All tasks have automated verify or manual-only justification
- [x] Sampling continuity: no consecutive tasks without automated verify
- [x] Wave 0 test file covers all MISSING gaps found
- [x] No watch-mode flags
- [x] Feedback latency: ~20 s warm
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21
