---
phase: 106
slug: android-metrics-server-upload
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
audited: 2026-06-21
---

# Phase 106 — Validation Strategy

> Per-phase validation contract for Android Metrics + Server Upload (AND-04).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | JUnit 4 (Android Gradle JVM unit tests) |
| **Config file** | `android/app/build.gradle.kts` — `testImplementation(libs.junit)` |
| **Quick run command** | `cd android && ./gradlew testDebugUnitTest` |
| **Full suite command** | `cd android && ./gradlew testDebugUnitTest` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd android && ./gradlew testDebugUnitTest`
- **After every plan wave:** Run `cd android && ./gradlew testDebugUnitTest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 106-01-01 | 01 | 1 | AND-04 (D-01) | — | DataStore key name stable; default empty disables upload | unit | `./gradlew testDebugUnitTest` | ✅ | ✅ green |
| 106-01-02 | 01 | 1 | AND-04 (D-02) | — | onSyncComplete invoked after sync; null-safe | unit | `./gradlew testDebugUnitTest` | ✅ | ✅ green |
| 106-01-03 | 01 | 1 | AND-04 (D-03) | — | Empty URL guard; /v1/ingest-frames endpoint; no OkHttp | unit | `./gradlew testDebugUnitTest` | ✅ | ✅ green |
| 106-01-04 | 01 | 1 | AND-04 (D-04) | — | R22 packet type=0x10 guard; milli-bpm LE decode; zero=null | unit | `./gradlew testDebugUnitTest` | ✅ | ✅ green |
| 106-01-05 | 01 | 1 | AND-04 (D-05) | — | Bridge called on IO dispatcher; null on error; no crash | unit | `./gradlew testDebugUnitTest` | ✅ | ✅ green |
| 106-01-06 | 01 | 1 | AND-04 (D-06) | — | Method names match iOS HealthDataStore+Snapshots.swift exactly | unit | `./gradlew testDebugUnitTest` | ✅ | ✅ green |
| 106-01-07 | 01 | 1 | AND-04 (D-04) | — | HomeScreen liveHeartRateBPM StateFlow parameter | manual | N/A — UI wiring; build verify | ✅ | ✅ green |
| 106-01-08 | 01 | 1 | AND-04 (D-05) | — | HealthScreen Recovery/Strain/Sleep display | manual | N/A — UI wiring; build verify | ✅ | ✅ green |
| 106-01-09 | 01 | 1 | AND-04 (D-01) | — | MoreScreen OutlinedTextField for server URL | manual | N/A — UI composable; build verify | ✅ | ✅ green |
| 106-01-10 | 01 | 1 | AND-04 | — | Full debug build: BUILD SUCCESSFUL | build | `./gradlew assembleDebug` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing JUnit 4 infrastructure covers all phase requirements. No additional framework installation needed.

New test files created by this validation pass:

- `android/app/src/test/kotlin/com/goose/app/data/DataStoreModuleTest.kt` — D-01 (6 tests)
- `android/app/src/test/kotlin/com/goose/app/upload/GooseUploadClientLogicTest.kt` — D-02, D-03 (12 tests)
- `android/app/src/test/kotlin/com/goose/app/ble/LiveHeartRateDecodingTest.kt` — D-04 (11 tests)
- `android/app/src/test/kotlin/com/goose/app/viewmodel/MetricsBridgeRequestTest.kt` — D-05, D-06 (15 tests)

Total new tests: **44** — all passing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HomeScreen shows "HR: N bpm" when BLE connected | AND-04 (D-04) | Requires physical WHOOP + Android device; UI composable not unit-testable without Compose test runner | Connect WHOOP, observe Home tab HR text updates |
| HealthScreen shows Recovery/Strain/Sleep with real data | AND-04 (D-05) | Requires populated SQLite DB with bridge data | Open Health tab after sync; verify metric values appear |
| MoreScreen OutlinedTextField persists URL across restart | AND-04 (D-01) | DataStore persistence requires Android runtime (Context) | Enter server URL, kill app, reopen, verify URL retained |
| Upload POST reaches server after sync completes | AND-04 (D-02, D-03) | Requires running server + WHOOP sync session | Configure server URL, trigger historical sync, verify `/v1/ingest-frames` hit in server logs |

---

## Test Results Summary

| Suite | Tests | Failures | Errors |
|-------|-------|----------|--------|
| `DataStoreModuleTest` | 6 | 0 | 0 |
| `GooseUploadClientLogicTest` | 12 | 0 | 0 |
| `LiveHeartRateDecodingTest` | 11 | 0 | 0 |
| `MetricsBridgeRequestTest` | 15 | 0 | 0 |
| **Total (phase 106 new)** | **44** | **0** | **0** |

Run: `cd android && ./gradlew testDebugUnitTest` — BUILD SUCCESSFUL (2026-06-21)

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual-only with reason
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all previously MISSING requirements (D-01 through D-06)
- [x] No watch-mode flags in any test command
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21
