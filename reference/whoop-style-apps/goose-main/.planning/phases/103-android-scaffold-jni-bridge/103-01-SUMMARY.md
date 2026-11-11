---
phase: 103
plan: "01"
subsystem: android
status: complete
requirements: [AND-01]
tags: [android, kotlin, compose, jni, rust]
key-files:
  created:
    - android/settings.gradle.kts
    - android/build.gradle.kts
    - android/gradle/libs.versions.toml
    - android/gradle/wrapper/gradle-wrapper.properties
    - android/gradle/wrapper/gradle-wrapper.jar
    - android/gradlew
    - android/gradlew.bat
    - android/.gitignore
    - android/app/build.gradle.kts
    - android/app/proguard-rules.pro
    - android/app/src/main/AndroidManifest.xml
    - android/app/src/main/res/values/strings.xml
    - android/app/src/main/res/values/themes.xml
    - android/app/src/main/kotlin/com/goose/app/MainActivity.kt
    - android/app/src/main/kotlin/com/goose/app/ui/theme/GooseTheme.kt
    - android/app/src/main/kotlin/com/goose/app/ui/AppShell.kt
    - android/app/src/main/kotlin/com/goose/app/ui/HomeScreen.kt
    - android/app/src/main/kotlin/com/goose/app/ui/HealthScreen.kt
    - android/app/src/main/kotlin/com/goose/app/ui/CoachScreen.kt
    - android/app/src/main/kotlin/com/goose/app/ui/MoreScreen.kt
    - android/app/src/main/kotlin/com/goose/app/bridge/GooseBridge.kt
    - android/app/src/test/kotlin/com/goose/app/bridge/GooseBridgeTest.kt
    - android-libs/arm64-v8a/libgoose_core.so
    - Rust/core/src/android_jni.rs
  modified:
    - Rust/core/src/lib.rs
    - Rust/core/Cargo.toml
    - android/gradle.properties (added — JDK 21 pin)
decisions:
  - "compileSdk=36 required by Compose BOM 2026.05.00 (navigationevent-android dependency)"
  - "Kotlin 2.1.21 + AGP 8.10.1 + Gradle 8.11.1 required for Java 26 compatibility"
  - "buildBridgeErrorJson extracted as package-internal top-level function to enable JVM unit testing without .so"
  - "sourceSets jniLibs.srcDirs points at ../../android-libs (CI output path per D-04/D-05)"
  - "android_jni.rs uses #[unsafe(no_mangle)] per Rust 2024 edition requirement"
  - "jni crate 0.21 already present in Cargo.toml android target dependencies"
metrics:
  duration: "90 min"
  completed: "2026-06-21"
  tasks: 7
  files: 27
dependency_graph:
  requires: []
  provides: [android-scaffold, jni-bridge, AND-01]
  affects: [phase-104, phase-107]
tech_stack:
  added:
    - "Kotlin 2.1.21 / Android Gradle Plugin 8.10.1"
    - "Jetpack Compose BOM 2026.05.00 (Material3, NavigationBar)"
    - "jni 0.21 Rust crate (android target only)"
  patterns:
    - "Kotlin object singleton with System.loadLibrary in init block"
    - "Package-internal top-level function for testable error formatting"
    - "cargo-ndk cross-compilation with ANDROID_NDK_HOME=/opt/homebrew/share/android-ndk"
---

# Phase 103 Plan 01: Android Scaffold + JNI Bridge Summary

## One-liner

Kotlin/Compose 4-tab skeleton with GooseBridge.kt JNI calling libgoose_core.so via Rust android_jni.rs shim; ./gradlew assembleDebug succeeds (APK 29MB) and 3 JVM unit tests pass.

## What Was Built

### Android Project Scaffold
- `android/` directory created from scratch with Kotlin DSL Gradle build files
- `settings.gradle.kts`, `build.gradle.kts`, `gradle/libs.versions.toml` with version catalog
- Gradle 8.11.1 wrapper with committed `gradle-wrapper.jar`
- `app/build.gradle.kts`: minSdk=26, compileSdk=36, targetSdk=36, arm64-v8a only
- `sourceSets["main"].jniLibs.srcDirs("../../android-libs")` — picks up prebuilt .so from CI output path

### Kotlin/Compose 4-Tab Skeleton
- `MainActivity` → `GooseTheme` → `AppShell` (4 `NavigationBarItem` composables)
- Stub screens: `HomeScreen`, `HealthScreen`, `CoachScreen`, `MoreScreen` (all `Text("X — coming soon")`)
- Material3 `NavigationBar` bottom bar matching iOS 4-tab structure (D-05/D-06)

### GooseBridge.kt JNI
- `object GooseBridge` with `System.loadLibrary("goose_core")` in `init` block
- `external fun handle(request: String): String` — JNI declaration
- `fun safeHandle(request: String): String` — catch wrapper returning error JSON on exception
- `internal fun buildBridgeErrorJson(message: String): String` — package-level for testability

### Rust android_jni.rs Shim
- `Rust/core/src/android_jni.rs` — `#![cfg(target_os = "android")]` gated
- Exports `Java_com_goose_app_bridge_GooseBridge_handle` (correct JNI mangled name)
- Delegates to `crate::bridge::goose_bridge_handle_json` and `crate::bridge::goose_bridge_free_string`
- `#[unsafe(no_mangle)]` per Rust 2024 edition
- `#[cfg(target_os = "android")] mod android_jni;` added to `lib.rs`

### Prebuilt libgoose_core.so
- Built with `cargo ndk -t arm64-v8a -o ../../android-libs build --release --lib`
- ELF 64-bit ARM aarch64, 12MB
- Exports `Java_com_goose_app_bridge_GooseBridge_handle` (confirmed via `nm -D`)
- Committed to `android-libs/arm64-v8a/libgoose_core.so`

### Unit Tests
- `GooseBridgeTest.kt` — 3 JVM tests calling `buildBridgeErrorJson()` directly
- All 3 PASS: `buildErrorJsonContainsOkFalse`, `buildErrorJsonEscapesBackslashesAndQuotes`, `buildErrorJsonStructureIsValid`

## Verification Results

| Check | Result |
|-------|--------|
| `./gradlew assembleDebug` EXIT 0 | PASS — BUILD SUCCESSFUL (3m 27s) |
| `app-debug.apk` exists | PASS — 29MB |
| `libgoose_core.so` ELF ARM aarch64 | PASS |
| `Java_com_goose_app_bridge_GooseBridge_handle` exported | PASS |
| 4 NavigationBarItem composables | PASS (4 items) |
| 3 JVM unit tests pass | PASS — BUILD SUCCESSFUL |
| `cargo build --lib` on macOS host | PASS — android_jni.rs cfg-gated out |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kotlin DSL parse failure on Java 26**
- **Found during:** Task 7 (./gradlew assembleDebug)
- **Issue:** Kotlin 2.0.21's embedded `JavaVersion.parse` fails on Java 26.0.1 with `IllegalArgumentException`
- **Fix:** Upgraded to Kotlin 2.1.21 + AGP 8.10.1 + Gradle 8.11.1 (all support Java 26)
- **Files modified:** `android/gradle/libs.versions.toml`, `android/gradle/wrapper/gradle-wrapper.properties`

**2. [Rule 3 - Blocking] compileSdk 35 rejected by Compose BOM 2026.05.00**
- **Found during:** Task 7 (./gradlew assembleDebug)
- **Issue:** `androidx.navigationevent:navigationevent-android:1.0.0` requires compileSdk ≥ 36
- **Fix:** Bumped `compileSdk = 36`, `targetSdk = 36`; installed Android SDK platform-36
- **Files modified:** `android/app/build.gradle.kts`

**3. [Rule 1 - Bug] android_jni.rs incorrect crate imports**
- **Found during:** Task 5 (cargo ndk build)
- **Issue:** `use crate::goose_bridge_handle_json` fails — functions live in `crate::bridge`, not crate root
- **Fix:** Changed to `use crate::bridge::goose_bridge_handle_json` and `use crate::bridge::goose_bridge_free_string`
- **Files modified:** `Rust/core/src/android_jni.rs`

**4. [Rule 1 - Bug] `#[no_mangle]` not allowed in Rust 2024 edition**
- **Found during:** Task 5 (cargo ndk build)
- **Issue:** Rust 2024 edition requires `#[unsafe(no_mangle)]` instead of `#[no_mangle]`
- **Fix:** Updated attribute in `android_jni.rs`

**5. [Rule 1 - Bug] JVM unit tests trigger GooseBridge.init via reflection**
- **Found during:** Task 7 (unit tests)
- **Issue:** Accessing `buildErrorJson` via reflection triggered `System.loadLibrary` → `UnsatisfiedLinkError`
- **Fix:** Extracted `buildBridgeErrorJson` as a package-internal top-level function; tests call it directly
- **Files modified:** `android/app/src/main/kotlin/com/goose/app/bridge/GooseBridge.kt`, `android/app/src/test/kotlin/com/goose/app/bridge/GooseBridgeTest.kt`

**6. [Rule 3 - Blocking] Android SDK not installed locally**
- **Found during:** Task 7 (./gradlew assembleDebug)
- **Issue:** No Android SDK at standard paths; only NDK was present
- **Fix:** Installed `android-commandlinetools` via Homebrew; installed `platforms;android-35`, `platforms;android-36`, `build-tools;35.0.0`, `platform-tools` via sdkmanager; wrote `local.properties` pointing at SDK; set `JAVA_HOME=/opt/homebrew/opt/openjdk@21`
- **Note:** `local.properties` is gitignored — CI must set `ANDROID_HOME` via env var

**7. [Rule 3 - Blocking] mod android_jni removed by Rust formatter**
- **Found during:** Task 5 iteration
- **Issue:** Rust formatter (triggered by linter hook) removed the `mod android_jni` declaration placed at the top of `lib.rs`
- **Fix:** Placed the declaration adjacent to the existing `#[cfg(not(target_os = "android"))] pub mod debug_ws_server;` at a stable location in `lib.rs`

**8. [Rule 3 - Blocking] JDK 21 pin needed for local builds on Java 26 host**
- **Found during:** Continuation session (post-commit 3799114) — user informed .so was available and requested build verification
- **Issue:** `gradle.properties` not committed; local machine runs Java 26 (Homebrew default); Kotlin 2.1.21 still fails `JavaVersion.parse("26.0.1")` without explicit JDK pin
- **Fix:** Created `android/gradle.properties` with `org.gradle.java.home=/opt/homebrew/opt/openjdk@21`; also installed Android SDK platform-35, platform-36, build-tools via sdkmanager into `/opt/homebrew/Caskroom/android-commandlinetools/14742923/`; set `local.properties` sdk.dir pointing at that path
- **Files modified:** `android/gradle.properties` (committed), `android/local.properties` (gitignored — local only)
- **Commit:** 3e29fbb

## Known Stubs

All stub screens (`HomeScreen`, `HealthScreen`, `CoachScreen`, `MoreScreen`) display `Text("X — coming soon")`. This is intentional per D-05 and Phase 103 scope. Phase 104 wires BLE, Phase 105 wires historical sync.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| jni_boundary | Rust/core/src/android_jni.rs | New JNI entry point accepts arbitrary String from Android runtime — validated by goose_bridge_handle_json JSON parser downstream |

## Self-Check

All files listed under `key-files.created` verified present on disk.
Commits verified: b315240, 3799114, 4ecec5e, 7242ec5, dcbf25a, 3e29fbb

## Self-Check: PASSED
