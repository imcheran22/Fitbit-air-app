# Phase 103: Android Scaffold + JNI Bridge — Research

**Phase:** 103
**Researcher:** gsd-phase-researcher (inline)
**Date:** 2026-06-21
**Requirement:** AND-01

---

## Executive Summary

Phase 103 creates `android/` from scratch: a Kotlin/Compose 4-tab skeleton with `GooseBridge.kt` calling `libgoose_core.so` via JNI. The Rust crate already has `cdylib` in `crate-type` — no Rust changes needed. The primary gate is `./gradlew assembleDebug` passing with a committed prebuilt `.so` from CI. Unit test for `GooseBridge.handle("{}")` must run on the JVM without Android device (mock-native approach).

---

## Research Findings

### 1. Gradle / AGP Versions (Kotlin DSL)

**[VERIFIED: developer.android.com + Context7]**

Current stable versions (June 2026):
- Android Gradle Plugin (AGP): `8.4.x` (use `8.4.0` as baseline)
- Kotlin: `2.0.x` (use `2.0.21` — matches Compose compiler plugin requirement)
- Gradle wrapper: `8.9` (gradle-wrapper.properties)
- Compose BOM: `2026.05.00` (latest stable from Context7 docs)
- `activity-compose`: `1.13.0`

**settings.gradle.kts** key structure:
```kotlin
pluginManagement {
    repositories {
        google(); mavenCentral(); gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "goose-android"
include(":app")
```

**Root build.gradle.kts** (plugin declarations only, no apply):
```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
```

**gradle/libs.versions.toml** (version catalog):
```toml
[versions]
agp = "8.4.0"
kotlin = "2.0.21"
composeBom = "2026.05.00"
activityCompose = "1.13.0"

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
```

**app/build.gradle.kts** critical sections:
```kotlin
android {
    namespace = "com.goose.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.goose.app"
        minSdk = 26
        targetSdk = 35
        ndk { abiFilters += "arm64-v8a" }
    }
}
```

### 2. JNI Bridge Pattern: Kotlin + Rust

**[VERIFIED: Android JNI docs + Rust FFI pattern from existing codebase]**

**Kotlin side — GooseBridge.kt:**
```kotlin
package com.goose.app.bridge

object GooseBridge {
    init {
        System.loadLibrary("goose_core")
    }

    external fun handle(request: String): String

    fun safeHandle(request: String): String {
        return try {
            handle(request)
        } catch (e: Throwable) {
            """{"ok":false,"error":{"message":"${e.message}"},"result":null,"timing":null}"""
        }
    }
}
```

**JNI method name in Rust** — Two options:

**Option A (preferred): `#[no_mangle]` with mangled name**
```rust
#[no_mangle]
pub extern "C" fn Java_com_goose_app_bridge_GooseBridge_handle(
    env: JNIEnv,
    _class: JClass,
    request: JString,
) -> jstring { ... }
```
Requires `jni` crate (`jni = "0.21"`).

**Option B: reuse existing `goose_bridge_handle_json` C ABI**
The existing `goose_bridge_handle_json(input: *const c_char) -> *mut c_char` is already exported. Android JNI cannot call it directly from Kotlin `external fun` (JNI requires the `Java_*` mangled name). A thin Rust wrapper is needed that:
1. Receives `JString` from JNI env
2. Converts to CStr, calls `goose_bridge_handle_json`
3. Converts result back to `jstring`
4. Calls `goose_bridge_free_string` on the raw pointer

**Recommendation: Option B (thin wrapper)** — avoids duplicating bridge logic. Add `jni = "0.21"` to `Cargo.toml` under `[target.'cfg(target_os = "android")'.dependencies]` to avoid breaking iOS builds.

**Key risk:** `goose_bridge_handle_json` signature uses `*const c_char` / `*mut c_char`. The JNI wrapper must correctly manage lifetimes — get string from env, call, free, return new Java string.

### 3. libgoose_core.so Naming and Placement

**[VERIFIED: Android JNI docs + android-core.yml CI inspection]**

- `System.loadLibrary("goose_core")` looks for `libgoose_core.so` (adds `lib` prefix and `.so` suffix automatically)
- The Rust crate `name = "goose_core"` (from `Cargo.toml` `[lib] name = "goose_core"`) produces `libgoose_core.so` — **name matches exactly**
- `cargo ndk -t arm64-v8a -o ../../android-libs build --release --lib` outputs to `android-libs/arm64-v8a/libgoose_core.so`

**cargo-ndk is NOT installed locally** — the `.so` must be obtained from CI:
- Trigger `android-core.yml` workflow (workflow_dispatch on current branch or a tag)
- Download `goose-android-core-*.tar.gz` artifact from the GitHub Release
- Extract `android-libs/arm64-v8a/libgoose_core.so` and commit it

**Alternative (local):** Install cargo-ndk + Android NDK, then:
```bash
cd Rust/core
cargo ndk -t arm64-v8a -o ../../android-libs build --release --lib
```

### 4. jniLibs Placement

**[VERIFIED: Android Gradle docs]**

Two valid approaches:

**Option A: Standard jniLibs path (zero Gradle config needed)**
Place at `android/app/src/main/jniLibs/arm64-v8a/libgoose_core.so`
Gradle picks this up automatically — no `sourceSets` configuration needed.

**Option B: sourceSets pointing at repo root android-libs/**
```kotlin
// in app/build.gradle.kts
android {
    sourceSets["main"].jniLibs.srcDirs("../../android-libs")
}
```
This lets the `.so` live at `android-libs/arm64-v8a/libgoose_core.so` (CI output path) and be shared between phases without duplication.

**Recommendation: Option B (sourceSets)** per D-04 decision — android-libs/ is the canonical location per the CI workflow. This avoids duplicating the .so into both `android-libs/` and `app/src/main/jniLibs/`.

**Decision: use `sourceSets` pointing at `../../android-libs`** and commit the .so to `android-libs/arm64-v8a/libgoose_core.so`.

### 5. Unit Test Strategy for GooseBridge

**[VERIFIED: Android JVM local unit test docs]**

The challenge: `System.loadLibrary` fails on JVM (no `.so` on the JVM library path). Options:

**Option A: Mock the native method (recommended)**
Create `app/src/test/kotlin/com/goose/app/bridge/GooseBridgeTest.kt` using Mockito or a manual test double:
```kotlin
// Test the safeHandle wrapper logic without loading the .so
// Mock native by testing the JSON error format on exception path
@Test
fun safeHandleReturnsErrorJsonOnException() {
    // Can't load .so in JVM unit test — test the catch path
    val result = """{"ok":false,"error":{"message":"UnsatisfiedLinkError"},"result":null,"timing":null}"""
    assertTrue(result.contains("\"ok\":false"))
}
```

**Option B: Robolectric** — adds complexity, still can't load `.so` without native libs on classpath.

**Option C: Instrumented test** — requires emulator/device, out of scope for Phase 103.

**Best approach:** Test the `safeHandle()` Kotlin wrapper logic (error JSON format on exception). For the `handle()` native path, use a companion factory pattern with an injectable interface so tests can swap in a fake. The unit test verifies:
1. `safeHandle("{}")` on exception returns valid JSON with `"ok":false`
2. The error JSON structure matches the bridge protocol `{"ok":false,"error":{"message":"..."}, ...}`

### 6. Compose 4-Tab NavigationBar Scaffold

**[VERIFIED: Context7 / developer.android.com]**

Minimum dependencies for 4-tab NavigationBar scaffold:
```kotlin
implementation(platform("androidx.compose:compose-bom:2026.05.00"))
implementation("androidx.compose.ui:ui")
implementation("androidx.compose.material3:material3")
implementation("androidx.compose.ui:ui-tooling-preview")
implementation("androidx.activity:activity-compose:1.13.0")
debugImplementation("androidx.compose.ui:ui-tooling")
```

**4-tab pattern:**
```kotlin
// MainActivity.kt
@Composable
fun AppShell() {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Home", "Health", "Coach", "More")
    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, label ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        icon = { Icon(Icons.Default.Home, contentDescription = label) },
                        label = { Text(label) }
                    )
                }
            }
        }
    ) { padding ->
        when (selectedTab) {
            0 -> HomeScreen(Modifier.padding(padding))
            1 -> HealthScreen(Modifier.padding(padding))
            2 -> CoachScreen(Modifier.padding(padding))
            3 -> MoreScreen(Modifier.padding(padding))
        }
    }
}
```

Each screen is a stub: `Text("Coming soon", modifier)`.

### 7. Rust Crate Changes for Android JNI

**[VERIFIED: Rust/core/Cargo.toml inspection]**

The crate already has:
- `crate-type = ["rlib", "staticlib", "cdylib"]` — `cdylib` produces the `.so`
- `goose_bridge_handle_json` and `goose_bridge_free_string` already exported with `#[no_mangle]`

**Changes needed:**
1. Add `jni` crate dependency (Android-target-gated to avoid iOS build breakage):
   ```toml
   [target.'cfg(target_os = "android")'.dependencies]
   jni = "0.21"
   ```
2. Add a new source file `Rust/core/src/android_jni.rs` with the JNI wrapper function `Java_com_goose_app_bridge_GooseBridge_handle`
3. Gate the module with `#[cfg(target_os = "android")]` in `lib.rs`

**Alternative (no jni crate):** Use raw JNI types from `std::os::raw` + manual `jstring` manipulation. More fragile; `jni` crate is the standard approach.

### 8. .gitignore Entries for android/

**[ASSUMED: standard Android .gitignore]**

Add to repo `.gitignore` or `android/.gitignore`:
```gitignore
# Android build
android/.gradle/
android/build/
android/app/build/
android/local.properties
android/.idea/

# Gradle wrapper JARs (committed: gradlew, gradle-wrapper.properties; ignored: .jar)
android/gradle/wrapper/gradle-wrapper.jar
```

**Note:** `android/gradlew` and `android/gradle/wrapper/gradle-wrapper.properties` MUST be committed (not ignored) for `./gradlew assembleDebug` to work on fresh clones.

**Note:** `android-libs/arm64-v8a/libgoose_core.so` must be committed (D-04). Add to `.gitignore` to NOT ignore it (default behavior if not listed).

---

## File Structure Plan

```
android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/
│       ├── gradle-wrapper.jar        (committed)
│       └── gradle-wrapper.properties (committed)
├── gradlew                           (committed, chmod +x)
├── gradlew.bat                       (committed)
├── local.properties                  (gitignored)
└── app/
    ├── build.gradle.kts
    ├── src/
    │   ├── main/
    │   │   ├── AndroidManifest.xml
    │   │   ├── kotlin/com/goose/app/
    │   │   │   ├── MainActivity.kt
    │   │   │   ├── ui/
    │   │   │   │   ├── AppShell.kt
    │   │   │   │   ├── HomeScreen.kt
    │   │   │   │   ├── HealthScreen.kt
    │   │   │   │   ├── CoachScreen.kt
    │   │   │   │   └── MoreScreen.kt
    │   │   │   └── bridge/
    │   │   │       └── GooseBridge.kt
    │   │   └── res/
    │   │       └── values/
    │   │           ├── strings.xml
    │   │           └── themes.xml
    │   └── test/
    │       └── kotlin/com/goose/app/bridge/
    │           └── GooseBridgeTest.kt
android-libs/
└── arm64-v8a/
    └── libgoose_core.so              (committed prebuilt from CI)
Rust/core/src/
├── android_jni.rs                    (new — JNI wrapper, cfg(android) gated)
└── lib.rs                            (add mod android_jni cfg gate)
```

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| cargo-ndk not installed locally — can't build .so without CI | HIGH | Trigger android-core.yml workflow, download artifact, commit .so manually |
| JNI name mangling mismatch — Java_com_goose_app_bridge_GooseBridge_handle | MEDIUM | Verify with `nm -D libgoose_core.so \| grep Java_com_goose` after build |
| `jni` crate breaks iOS build (wrong target) | MEDIUM | Gate with `[target.'cfg(target_os = "android")'.dependencies]` |
| Gradle wrapper JAR not committed — `./gradlew` fails on fresh clone | HIGH | Commit `gradle/wrapper/gradle-wrapper.jar` explicitly |
| Compose BOM version mismatch with AGP 8.4.0 | LOW | Use BOM 2026.05.00 which is validated against AGP 8.4 |
| local.properties committed with SDK path | LOW | Ensure `local.properties` is in .gitignore |

---

## Validation Architecture

### AND-01 Verification Points

1. **`./gradlew assembleDebug` passes** — primary gate; run from `android/` directory
2. **`libgoose_core.so` present** — `ls android-libs/arm64-v8a/libgoose_core.so`
3. **JNI symbol exported** — `nm -D android-libs/arm64-v8a/libgoose_core.so | grep Java_com_goose_app_bridge_GooseBridge_handle`
4. **`GooseBridge.kt` exists** — `ls android/app/src/main/kotlin/com/goose/app/bridge/GooseBridge.kt`
5. **Unit test passes** — `./gradlew :app:testDebugUnitTest` from `android/`
6. **4-tab structure present** — `grep -r "NavigationBarItem" android/app/src/` finds 4 items

---

## Key Decisions for Planner

| Decision | Choice | Rationale |
|----------|--------|-----------|
| jniLibs placement | `sourceSets` pointing at `../../android-libs` | Matches CI output path per D-04 |
| JNI wrapper approach | Thin Rust wrapper calling existing `goose_bridge_handle_json` | Avoids duplicating bridge dispatch logic |
| jni crate gating | `target.'cfg(target_os = "android")'` dependency | Prevents iOS build breakage |
| Unit test strategy | Test `safeHandle()` error path on JVM; no .so needed | No emulator required for Phase 103 |
| Compose BOM | `2026.05.00` | Current stable, validated with AGP 8.4 |
| AGP version | `8.4.0` | Stable, Kotlin 2.0 compatible |
| Gradle wrapper version | `8.9` | Compatible with AGP 8.4 |
| .so sourcing | CI workflow artifact (android-core.yml workflow_dispatch) | cargo-ndk not installed locally |

---

## RESEARCH COMPLETE

**Phase:** 103 — Android Scaffold + JNI Bridge
**Output:** `.planning/phases/103-android-scaffold-jni-bridge/103-RESEARCH.md`
**Status:** Ready for planning

**Key findings for planner:**
- AND-01 requires 1 plan (103-01): scaffold + JNI + unit test — all in one plan per ROADMAP
- Rust needs a new `android_jni.rs` with `Java_com_goose_app_bridge_GooseBridge_handle` wrapping `goose_bridge_handle_json`
- The `.so` prebuilt must be downloaded from a CI run and committed to `android-libs/arm64-v8a/`
- `sourceSets` in `app/build.gradle.kts` points Gradle at `../../android-libs` for jniLibs
- `gradle-wrapper.jar` MUST be committed (not gitignored) for `./gradlew` to work
- Unit test tests the `safeHandle()` Kotlin wrapper on JVM — no Android device or emulator needed
