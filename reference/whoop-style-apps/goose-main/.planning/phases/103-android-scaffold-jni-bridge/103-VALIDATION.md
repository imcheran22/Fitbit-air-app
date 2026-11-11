---
phase: 103
slug: android-scaffold-jni-bridge
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
---

# Phase 103 — Validation Strategy

> Per-phase validation contract: Android project scaffold + Kotlin/Compose skeleton + GooseBridge.kt JNI bridge.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | JUnit 4 (Android Gradle Plugin test runner) |
| **Config file** | `android/app/build.gradle.kts` (`testImplementation(libs.junit)`) |
| **Quick run command** | `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:testDebugUnitTest` |
| **Full suite command** | `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug :app:testDebugUnitTest` |
| **Rust check command** | `cd Rust/core && cargo build --lib` |
| **Estimated runtime** | ~3–4 min (Gradle cold), ~30s (incremental) |

---

## Sampling Rate

- **After every task commit:** Run `./gradlew :app:testDebugUnitTest`
- **After every plan wave:** Run `./gradlew assembleDebug :app:testDebugUnitTest`
- **Before `/gsd-verify-work`:** Full suite must be green + APK > 1MB
- **Max feedback latency:** 30 seconds (incremental JVM-only tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 103-01-T1 | 01 | 1 | AND-01 | — | N/A | file-check | `ls android/settings.gradle.kts android/gradle/libs.versions.toml android/gradlew` | ✅ | ✅ green |
| 103-01-T2 | 01 | 1 | AND-01 | — | N/A | file-check | `grep "minSdk = 26" android/app/build.gradle.kts && grep "abiFilters" android/app/build.gradle.kts` | ✅ | ✅ green |
| 103-01-T3 | 01 | 1 | AND-01 | — | N/A | build | `cd android && ./gradlew assembleDebug` (4 NavigationBarItem composables present) | ✅ | ✅ green |
| 103-01-T4 | 01 | 1 | AND-01 | jni_boundary | safeHandle() returns `"ok":false` JSON on exception (never crashes caller) | unit | `cd android && ./gradlew :app:testDebugUnitTest` — `buildErrorJsonContainsOkFalse` | ✅ | ✅ green |
| 103-01-T5 | 01 | 1 | AND-01 | — | android_jni.rs not compiled for iOS/macOS (cfg-gated) | build | `cd Rust/core && cargo build --lib 2>&1 \| grep -c "^error"` → 0 | ✅ | ✅ green |
| 103-01-T6 | 01 | 1 | AND-01 | jni_boundary | libgoose_core.so exports correct JNI mangled symbol | binary-check | `nm -D android-libs/arm64-v8a/libgoose_core.so \| grep Java_com_goose_app_bridge_GooseBridge_handle` | ✅ | ✅ green |
| 103-01-T7 | 01 | 1 | AND-01 | — | N/A | build + unit | `./gradlew assembleDebug && ./gradlew :app:testDebugUnitTest` — all 3 tests PASS | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

Test file `android/app/src/test/kotlin/com/goose/app/bridge/GooseBridgeTest.kt` was created as part of Task 6 execution. Three JVM tests:

- `buildErrorJsonContainsOkFalse` — verifies `"ok":false` and error message in JSON
- `buildErrorJsonEscapesBackslashesAndQuotes` — verifies quote and backslash escaping
- `buildErrorJsonStructureIsValid` — verifies all 4 fields present (`ok`, `result`, `error`, `timing`)

All 3 PASS as of 2026-06-21 (BUILD SUCCESSFUL — `./gradlew :app:testDebugUnitTest`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `./gradlew assembleDebug` produces APK > 1MB (actually 30MB) | AND-01 | Requires Android SDK + Gradle on host; CI validates this automatically | `ls -la android/app/build/outputs/apk/debug/app-debug.apk` — expect > 1MB |
| 4-tab navigation renders correctly on Android device | AND-01 | UI rendering requires Android emulator or device | Install APK, verify Home/Health/Coach/More tabs are visible and tappable |
| `handle("{}"))` from native JNI returns valid JSON on device | AND-01 | `System.loadLibrary` cannot run in JVM unit test — requires instrumented test (Phase 107) | Phase 107 will add `androidTest/` instrumented tests |

---

## Verification Evidence

| Check | Command | Result |
|-------|---------|--------|
| `./gradlew assembleDebug` exits 0 | `cd android && ./gradlew assembleDebug` | PASS — BUILD SUCCESSFUL (3m 27s) |
| APK exists > 1MB | `ls -la android/app/build/outputs/apk/debug/app-debug.apk` | PASS — 30MB |
| libgoose_core.so is ELF ARM64 | `file android-libs/arm64-v8a/libgoose_core.so` | PASS — ELF 64-bit LSB shared object, ARM aarch64 |
| JNI symbol exported | `nm -D libgoose_core.so \| grep Java_com_goose_app_bridge_GooseBridge_handle` | PASS — 1 match |
| 4 NavigationBarItem composables | `grep -r "NavigationBarItem" android/app/src/main/kotlin/ \| wc -l` | PASS — 5 (4 items + 1 import) |
| GooseBridge.kt package | `grep "^package" .../bridge/GooseBridge.kt` | PASS — `package com.goose.app.bridge` |
| cargo build --lib on macOS host | `cd Rust/core && cargo build --lib \| grep -c "^error"` | PASS — 0 errors |
| 3 JVM unit tests pass | `./gradlew :app:testDebugUnitTest` | PASS — BUILD SUCCESSFUL (3m 33s) |

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual-only rationale
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0: no new stubs needed — test file created during execution
- [x] No watch-mode flags in any command
- [x] Feedback latency: ~30s incremental JVM test run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-21
