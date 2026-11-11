# Phase 103: Android Scaffold + JNI Bridge - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Create `android/` Kotlin/Compose project skeleton and `GooseBridge.kt` JNI wrapper. `./gradlew assembleDebug` must succeed with a prebuilt `libgoose_core.so`. No BLE, no real functionality — stubs only. Phase 107 adds full CI APK pipeline.

**In scope:** `android/` project structure, `app/` module, Kotlin/Compose 4-tab skeleton, `GooseBridge.kt` JNI class, `android-libs/arm64-v8a/libgoose_core.so` prebuilt, unit test for bridge call.
**Out of scope:** BLE stack (Phase 104), historical sync (Phase 105), server upload (Phase 106), CI APK (Phase 107), real data.

</domain>

<decisions>
## Implementation Decisions

### Build configuration
- **D-01:** minSdkVersion = **26** (Android 8.0); targetSdkVersion = 35. BLE CompanionDeviceManager and stable BLE scanning APIs available at 26.
- **D-02:** ABI: **arm64-v8a only**. Covers modern Android devices and M-series Mac emulator. Smallest APK and simplest NDK config.
- **D-03:** Package name: `com.goose.app` — consistent with iOS bundle ID.

### libgoose_core.so sourcing
- **D-04:** Commit a prebuilt `android-libs/arm64-v8a/libgoose_core.so` to the repo so `./gradlew assembleDebug` works without requiring Rust + NDK locally. The existing `android-core.yml` CI workflow already cross-compiles the Rust core for Android targets — Phase 107 will wire the full CI APK pipeline using those artifacts.
- **D-05:** `android-libs/` directory is tracked in git for Phase 103. Phase 107 may move it to CI-only artifacts.

### Project structure
- **D-06:** 4-tab skeleton: Home / Health / Coach / More — matching iOS tab structure. All tabs are stub screens (empty `Text("Coming soon")` or equivalent).
- **D-07:** `GooseBridge.kt` in `app/src/main/kotlin/com/goose/app/bridge/`: `System.loadLibrary("goose_core")` + `external fun handle(request: String): String`. Mirrors `GooseRustBridge.swift` pattern.

### Claude's Discretion
- Complementation (2024.x series).
- Gradle version: use Gradle 8.x with Kotlin DSL (`build.gradle.kts`).
- JNI error handling in `GooseBridge.kt`: wrap `handle()` call in try/catch returning error JSON on exception.
- Unit test: use JUnit4 + Robolectric or a plain JVM test with a mock .so stub — whichever compiles without Android emulator.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CI workflow
- `.github/workflows/android-core.yml` — already builds `libgoose_core.so` for aarch64-linux-android, armv7-linux-androideabi, x86_64-linux-android via cargo-ndk; shows expected .so artifact structure

### iOS counterpart (pattern reference)
- `GooseSwift/GooseRustBridge.swift` — the Swift JNI/FFI equivalent; `GooseBridge.kt` should mirror its request/response JSON pattern (`method` + `args`, returns `{ok, result, error, timing}`)
- `GooseSwift/GooseSwift-Bridging-Header.h` — C header showing the two exported symbols: `goose_bridge_handle_json` / `goose_bridge_free_string`

### Rust bridge entry point
- `Rust/core/src/bridge/mod.rs` — dispatcher; the Android JNI must call the same C-exported function

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `android-core.yml` CI already cross-compiles Rust for Android — prebuilt .so can be obtained from a CI run on the current branch
- `Rust/core/src/bridge/mod.rs` exposes `goose_bridge_handle_json(input: *const c_char) -> *mut c_char` — same symbol Android JNI will call

### Established Patterns
- JSON-RPC envelope: `{"schema":"goose.bridge.request.v1","method":"...","args":{...}}` → `{"ok":true,"result":...,"error":null,"timing":...}`
- iOS uses `goose_bridge_handle_json` + `goose_bridge_free_string`; Android JNI must declare the same extern C symbols

### Integration Points
- `android/app/src/main/jniLibs/arm64-v8a/libgoose_core.so` — standard Android JNI .so placement (Gradle picks this up automatically)
- Alternatively: `android-libs/arm64-v8a/` with `sourceSets { main { jniLibs.srcDirs = ['../../android-libs'] } }`

</code_context>

<specifics>
## Specific Ideas

- CI APK is Phase 107 scope — this phase only needs `./gradlew assembleDebug` to pass locally
- Unit test for GooseBridge can use `@Test fun bridgeReturnsJson()` with a mocked/stubbed call — full integration test is Phase 107
- The .so prebuilt should be arm64-v8a (matches M-series Mac emulator and modern physical devices)

</specifics>

<deferred>
## Deferred Ideas

- armeabi-v7a and x86_64 ABI support — deferred to Phase 107 CI pipeline
- Full CI APK workflow — Phase 107
- Actual BLE integration — Phase 104

</deferred>

---

*Phase: 103-android-scaffold-jni-bridge*
*Context gathered: 2026-06-21*
