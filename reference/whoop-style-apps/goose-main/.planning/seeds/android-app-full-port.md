---
name: android-app-full-port
description: Full Android port — Kotlin/Compose app feature-equivalent to iOS, same UI, JNI bridge to Rust core, APK on release
metadata:
  type: seed
  trigger_condition: when defining v14.0 milestone scope
  planted_date: 2026-06-19
---

## Goal

Build `android/` — a Kotlin/Compose Android app that is feature-equivalent to the iOS SwiftUI app:
- Same 4-tab UI (Home, Health, Coach, More)
- Same BLE stack (Gen4 + Gen5 + Puffin when v13 lands)
- Same Rust core via JNI bridge
- SQLite persistence through the same bridge methods
- Server upload via Retrofit
- APK produced on every GitHub release

---

## Architecture

### Android mirrors iOS exactly

| iOS layer | Android equivalent |
|-----------|-------------------|
| SwiftUI | Jetpack Compose |
| GooseAppModel (@MainActor) | GooseViewModel (StateFlow/ViewModel) |
| GooseBLEClient (CoreBluetooth) | GooseBLEManager (BluetoothGatt) |
| GooseRustBridge (C FFI) | GooseRustBridge (JNI) |
| HealthDataStore | HealthDataStore (same bridge methods) |
| URLSession server upload | Retrofit + OkHttp |
| Keychain | Android Keystore / EncryptedSharedPreferences |
| UserDefaults | SharedPreferences |

### Project structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/app/goose/
│   │   │   ├── MainActivity.kt              # single-activity, NavHost
│   │   │   ├── ble/
│   │   │   │   ├── GooseBLEManager.kt       # BluetoothGatt central
│   │   │   │   ├── GooseBLEManager+Commands.kt
│   │   │   │   ├── GooseBLEManager+HistoricalSync.kt
│   │   │   │   └── GooseBLETypes.kt         # UUIDs, packet types
│   │   │   ├── bridge/
│   │   │   │   └── GooseRustBridge.kt       # JNI bridge (mirrors Swift)
│   │   │   ├── data/
│   │   │   │   ├── HealthDataStore.kt
│   │   │   │   ├── GoosePreferences.kt      # SharedPreferences
│   │   │   │   └── upload/GooseUploadService.kt
│   │   │   ├── ui/
│   │   │   │   ├── GooseApp.kt              # NavHost + BottomNavBar
│   │   │   │   ├── home/HomeScreen.kt       # ReadinessEngine view
│   │   │   │   ├── health/HealthScreen.kt   # HRV/strain/sleep
│   │   │   │   ├── coach/CoachScreen.kt     # AI chat
│   │   │   │   └── more/MoreScreen.kt       # Settings, server, debug
│   │   │   └── GooseAppModel.kt             # Hilt ViewModel
│   │   └── res/
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── buildSrc/                                # version catalog
├── build.gradle.kts
└── settings.gradle.kts
```

---

## JNI Bridge

Rust core already compiles to `aarch64-linux-android` etc. JNI shim wraps the same `goose_bridge_handle_json` C function:

```kotlin
// GooseRustBridge.kt
object GooseRustBridge {
    init { System.loadLibrary("goose_core") }
    external fun handleJson(requestJson: String): String
    
    fun request(method: String, args: Map<String, Any>, databasePath: String): BridgeResponse {
        val json = buildRequestJson(method, args + ("database_path" to databasePath))
        val result = handleJson(json)
        return parseBridgeResponse(result)
    }
}
```

Same JSON-RPC protocol: `{"schema":"goose.bridge.request.v1","method":"metrics.*","args":{...}}`.

Rust JNI entry point to add in `Rust/core/src/lib.rs`:
```rust
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_app_goose_bridge_GooseRustBridge_handleJson(
    env: JNIEnv, _: JClass, input: JString,
) -> jstring { ... }
```

---

## BLE Stack

Android has `BluetoothGatt` which mirrors CoreBluetooth closely:

```
iOS                          Android
CBCentralManager         →   BluetoothAdapter + LeScanner
CBPeripheral             →   BluetoothGatt
CBCharacteristic         →   BluetoothGattCharacteristic
setNotifyValue(true)     →   setCharacteristicNotification + CCCD descriptor write
writeWithoutResponse     →   WRITE_TYPE_NO_RESPONSE
```

UUIDs: same as iOS (`fd4b0001-...`, `6108xxxx-...`) — already in `GooseBLETypes.kt`.

MTU 247: `bluetoothGatt.requestMtu(247)` in `onConnectionStateChange`.

---

## UI (Compose, mirrors SwiftUI)

### Tab structure
```kotlin
enum class GooseTab { Home, Health, Coach, More }

@Composable
fun GooseApp() {
    val navController = rememberNavController()
    Scaffold(bottomBar = { GooseBottomBar(navController) }) {
        NavHost(navController, startDestination = GooseTab.Home.name) {
            composable(GooseTab.Home.name) { HomeScreen() }
            composable(GooseTab.Health.name) { HealthScreen() }
            composable(GooseTab.Coach.name) { CoachScreen() }
            composable(GooseTab.More.name) { MoreScreen() }
        }
    }
}
```

### Home tab
- ReadinessScore ring (same metric: `metrics.goose_readiness_v1`)
- Recovery / Strain / Sleep cards
- Live HR from BLE R22

### Health tab
- HRV RMSSD trend (7-day)
- Sleep staging hypnogram
- V24 biometrics (SpO2, skin temp)
- Exercise sessions list

### Coach tab
- ChatInterface Compose (LazyColumn messages)
- Same provider enum: Claude / ChatGPT / Custom / Gemini
- Provider picker BottomSheet

### More tab
- Server URL + API key (EncryptedSharedPreferences)
- BLE device selector
- Export (raw frames)
- Debug: bridge version, schema version, sync status

---

## CI — APK on release

Update `android-core.yml` to also build the APK once `android/` exists:

```yaml
- name: Build debug APK
  working-directory: android
  run: ./gradlew assembleRelease

- name: Attach APK to release
  run: |
    gh release upload "$TAG" android/app/build/outputs/apk/release/app-release-unsigned.apk \
      --clobber --repo "$GITHUB_REPOSITORY"
```

Signing: use unsigned APK for AltStore-style sideloading. Add signing config when Apple Developer Program / Play Store is funded.

---

## Implementation phases (within v14.0)

| Phase | Deliverable | Effort |
|-------|------------|--------|
| 14-01 | Android skeleton + Gradle setup + JNI bridge compiles | 1 day |
| 14-02 | BLE stack Gen4/Gen5 + historical sync | 2 days |
| 14-03 | Home + Health screens (read-only, Rust bridge) | 2 days |
| 14-04 | Coach screen (Retrofit + LLM providers) | 1 day |
| 14-05 | More screen + server upload + SharedPreferences | 1 day |
| 14-06 | CI APK build + release attachment | 0.5 days |
| 14-07 | Parity test: same session data on iOS and Android | 1 day |

Total: ~8-9 days.

---

## Dependencies

- Rust JNI shim: ~50 lines, `jni` crate (`jni = "0.21"` dev-dep)
- `cargo-ndk` for cross-compilation (already in android-core.yml)
- Kotlin 2.0 / Compose BOM 2026.x
- Hilt for DI (mirrors GooseAppModel injection pattern)
- Retrofit + OkHttp for server upload
- `accompanist-permissions` for Bluetooth permissions

## Issues resolved

- #169 Port to Android

## Related seeds

- [[v13-hardware-bands-and-arch]] — Puffin UUID must land in v13.0 before Android port; Android will include Puffin scanning from day one
- [[backlog-issues-159-169]] — #159 (MTU) and #160 (ring buffer) fixes should be in iOS before Android shares the same Rust logic
