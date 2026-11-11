# Phase 106: Android Metrics + Server Upload — Research

**Phase:** 106
**Date:** 2026-06-21
**Requirement:** AND-04

---

## ## RESEARCH COMPLETE

---

## Executive Summary

Phase 106 wires up three orthogonal features to the existing Android scaffold: (1) live HR on Home tab from `WhoopBleClient`, (2) Recovery/Strain/Sleep scores on Health tab via `GooseBridge` metric calls, and (3) automatic HTTP POST of captured frames to a configured server URL after each historical sync. All infrastructure is already in place; this phase fills in the stubs.

---

## 1. Current State — What Exists

### Android scaffold (Phase 103–105)
| File | Status |
|------|--------|
| `android/app/src/main/kotlin/com/goose/app/bridge/GooseBridge.kt` | Ready — `safeHandle(request)` wraps JNI, returns error JSON on throw |
| `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` | Ready — `connectionState: StateFlow<BleConnectionState>`, `completeSyncIfActive(reason)` hook at line 480 |
| `android/app/src/main/kotlin/com/goose/app/ui/HomeScreen.kt` | Stub — shows BLE state text only |
| `android/app/src/main/kotlin/com/goose/app/ui/HealthScreen.kt` | Stub — "coming soon" |
| `android/app/src/main/kotlin/com/goose/app/ui/MoreScreen.kt` | Stub — "coming soon" |
| `android/app/src/main/kotlin/com/goose/app/ui/AppShell.kt` | Passes `connectionState` to HomeScreen; no ViewModel |
| `android/app/src/main/kotlin/com/goose/app/MainActivity.kt` | Creates `WhoopBleClient`; no ViewModel or DataStore |
| `android/gradle/libs.versions.toml` | No DataStore, ViewModel, or OkHttp entries |
| `android/app/build.gradle.kts` | No DataStore, lifecycle-viewmodel, or HTTP deps |

### Missing pieces for this phase
1. **Live HR StateFlow** — `WhoopBleClient` has no `liveHeartRateBPM: StateFlow<Int>` yet
2. **MetricsViewModel** — not created; needed to hold Recovery/Strain/Sleep and trigger bridge calls
3. **DataStore dependency** — not in `libs.versions.toml` or `build.gradle.kts`
4. **ViewModel dependency** — `lifecycle-viewmodel-compose` not in deps
5. **Server upload logic** — not implemented anywhere in Android

---

## 2. Live HR Implementation Path

### How WhoopBleClient already decodes HR
In `WhoopBleClient`, raw BLE notifications are decoded in `onCharacteristicChanged`. The R22 packet format (confirmed from WHOOP 5.0 BLE capture) is:
- Byte 0 = `0x10` (type marker)
- Bytes 2–3 = HR in milli-bpm little-endian (divide by 10 = BPM)

The existing `importFrame()` method (line ~495) sends frames to Rust for persistence. It does NOT yet expose a live HR StateFlow.

### Required addition to WhoopBleClient
Add a `_liveHeartRateBPM: MutableStateFlow<Int?> = MutableStateFlow(null)` alongside `_connectionState`. Populate it in the BLE notification handler when packet type matches R22 (`0x10`). Expose as `val liveHeartRateBPM: StateFlow<Int?> = _liveHeartRateBPM.asStateFlow()`.

The R22 bytes 2–3 decoding: `(bytes[2].toInt() and 0xFF) or ((bytes[3].toInt() and 0xFF) shl 8)` then divide by 10.

### HomeScreen wiring
`AppShell.kt` already receives `connectionState` and passes it to `HomeScreen`. Same pattern: add `liveHeartRateBPM: StateFlow<Int?>` parameter to `AppShell` and `HomeScreen`, collect in Compose with `collectAsStateWithLifecycle()`.

**Dependency needed:** `lifecycle-viewmodel-compose` (already in `lifecycleRuntimeCompose` entry — check if `collectAsStateWithLifecycle` is covered). Actually `collectAsStateWithLifecycle` is in `lifecycle-runtime-compose` which IS already in `build.gradle.kts` as `libs.androidx.lifecycle.runtime.compose`. No additional dep needed for StateFlow collection.

---

## 3. MetricsViewModel and Health Tab

### iOS parity — bridge method names (from `HealthDataStore+Snapshots.swift`)
| Metric | Bridge method |
|--------|---------------|
| Recovery score | `metrics.recovery_score_from_features` |
| Strain score | `metrics.strain_score_from_features` |
| Sleep score | `metrics.sleep_score_from_features` |
| Sleep performance | `metrics.sleep_score_from_features` (same method) |

### Bridge call pattern
```json
{
  "schema": "goose.bridge.request.v1",
  "method": "metrics.recovery_score_from_features",
  "args": { "database_path": "<context.filesDir.absolutePath>/goose.sqlite" }
}
```
Response: `{"ok":true,"result":{...},"error":null,"timing":{...}}`

Parse `result` JSON object. Fields to surface: `score` (0–100 float), `hrv_rmssd` (float ms). For strain: `score` (0–21 float). For sleep: `score` (0–100 float).

### MetricsViewModel design
- `class MetricsViewModel(app: Application) : AndroidViewModel(app)` — needs `Application` for `filesDir`
- Exposes `StateFlow<Float?>` for each of: `recoveryScore`, `strainScore`, `sleepScore`
- `fun refresh()` — coroutine on `Dispatchers.IO`, calls bridge 3 times, updates StateFlow
- Trigger: on `init {}` (initial load) and from `WhoopBleClient` post-sync callback

### ViewModel dependency
Need `androidx.lifecycle:lifecycle-viewmodel-compose` in `build.gradle.kts`. Add to `libs.versions.toml`:
```toml
lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleRuntimeCompose" }
```
(Same version as existing `lifecycleRuntimeCompose = "2.9.1"`)

---

## 4. DataStore for Server URL

### Dependency
Need `androidx.datastore:datastore-preferences` in `libs.versions.toml`:
```toml
datastore-version = "1.1.4"
datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore-version" }
```

### Implementation pattern
```kotlin
val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "goose_settings")
val SERVER_URL_KEY = stringPreferencesKey("server_url")
```
- Read: `context.dataStore.data.map { it[SERVER_URL_KEY] ?: "" }`
- Write: `context.dataStore.edit { it[SERVER_URL_KEY] = url }`

### Settings screen (More tab)
Replace "More — coming soon" stub with a simple `TextField` for server URL:
- Label: "Server URL"
- Hint: "http://your-server:8000"
- On value change: write to DataStore
- Load initial value: `collectAsStateWithLifecycle()` from DataStore flow

### SettingsViewModel
- Owns the DataStore read/write
- Exposes `serverUrl: StateFlow<String>`
- `fun setServerUrl(url: String)` — writes to DataStore on `Dispatchers.IO`

---

## 5. Server Upload Implementation

### iOS upload endpoints (from `GooseUploadService.swift`)
| Endpoint | Purpose |
|----------|---------|
| `{server_url}/v1/ingest-frames` | Raw BLE frames upload (POST) |
| `{server_url}/v1/ingest-decoded` | Decoded metric streams upload (POST) |

**Decision D-03 says `{server_url}/upload`** but iOS source uses `/v1/ingest-frames`. The planner should use `/v1/ingest-frames` (the actual iOS endpoint) for raw frame upload. If AND-04 requires a simpler upload of "captured frames", `/v1/ingest-frames` is the correct endpoint.

### Upload trigger
`completeSyncIfActive(reason: String)` at WhoopBleClient line 480 is the hook. Currently it only resets flags. Add a callback lambda or interface:
```kotlin
var onSyncComplete: (() -> Unit)? = null
// In completeSyncIfActive:
onSyncComplete?.invoke()
```

### HTTP client
`HttpURLConnection` (no external dep) is sufficient:
```kotlin
val url = URL("$serverUrl/v1/ingest-frames")
val conn = url.openConnection() as HttpURLConnection
conn.requestMethod = "POST"
conn.setRequestProperty("Content-Type", "application/json")
```

### Upload payload
Use the Rust bridge to get pending frames: call `upload.get_recent_decoded_streams` (same as iOS). Or simpler for AND-04: just POST the sync completion event with the db path as a trigger for server-side pull. Check the iOS GooseUploadService for the actual JSON body format.

**Simpler approach for AND-04:** After sync, call `GooseBridge.safeHandle` with `upload.get_recent_decoded_streams` to get encoded frames, then POST to `/v1/ingest-frames`. Fire-and-forget on `Dispatchers.IO`.

### Where to place upload code
- `GooseUploadClient.kt` — new file, `object` or `class`, takes `context: Context`
- Called from `MainActivity` or an `AppViewModel` that holds both `WhoopBleClient` and `GooseUploadClient`
- Reads server URL from DataStore, skips if empty

---

## 6. AppViewModel — Coordinator

Currently `MainActivity` creates `WhoopBleClient` directly and passes state through Compose. To wire everything together cleanly:
- Create `AppViewModel(app: Application) : AndroidViewModel(app)` 
- Owns `WhoopBleClient`, `MetricsViewModel`-equivalent state, `SettingsViewModel`-equivalent state
- Or keep `WhoopBleClient` in `MainActivity` and use `MetricsViewModel` + `SettingsViewModel` separately via `viewModel<T>()` in Compose

**Recommendation:** Single `AppViewModel` owning `WhoopBleClient` (lifecycle-safe) + metrics refresh + upload trigger. `SettingsViewModel` separate (UI concern only).

---

## 7. Gradle / Version Catalog Changes Required

### `android/gradle/libs.versions.toml` additions
```toml
[versions]
datastoreVersion = "1.1.4"

[libraries]
datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastoreVersion" }
lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleRuntimeCompose" }
```

### `android/app/build.gradle.kts` additions
```kotlin
implementation(libs.datastore.preferences)
implementation(libs.lifecycle.viewmodel.compose)
```

No OkHttp or Retrofit needed — `HttpURLConnection` is sufficient for the fire-and-forget upload.

---

## 8. Threading and Coroutine Notes

- `GooseBridge.safeHandle()` blocks the calling thread — always call from `Dispatchers.IO`
- DataStore reads return `Flow` — collect with `collectAsStateWithLifecycle()` in Compose
- `WhoopBleClient.liveHeartRateBPM` is a `StateFlow` — safe to collect from any thread; update from BLE callback thread (MutableStateFlow is thread-safe)
- Upload is fire-and-forget: `scope.launch(Dispatchers.IO) { ... }` in the ViewModel or client; no UI blocking
- `MetricsViewModel.refresh()` on `Dispatchers.IO`; updates `MutableStateFlow` which Compose observes

---

## 9. Build Verification

After implementation:
```bash
cd /Users/francisco/Documents/goose/android
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`. APK at `app/build/outputs/apk/debug/app-debug.apk`.

The Rust .so is pre-built and in `android-libs/arm64-v8a/libgoose_core.so` (sourced via `sourceSets["main"].jniLibs.srcDirs("../../android-libs")`). No Rust rebuild needed for this phase unless `GooseBridge` JNI interface changes (it doesn't — we're just calling `safeHandle()`).

---

## 10. File Map

| File | Action |
|------|--------|
| `android/gradle/libs.versions.toml` | Add `datastoreVersion`, `datastore-preferences`, `lifecycle-viewmodel-compose` |
| `android/app/build.gradle.kts` | Add 2 new deps |
| `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` | Add `_liveHeartRateBPM` StateFlow; populate from R22 packet; add `onSyncComplete` callback |
| `android/app/src/main/kotlin/com/goose/app/ui/HomeScreen.kt` | Show live HR from StateFlow |
| `android/app/src/main/kotlin/com/goose/app/ui/HealthScreen.kt` | Show Recovery/Strain/Sleep from MetricsViewModel |
| `android/app/src/main/kotlin/com/goose/app/ui/MoreScreen.kt` | Settings UI: server URL TextField |
| `android/app/src/main/kotlin/com/goose/app/ui/AppShell.kt` | Pass liveHR + metricsViewModel to child screens |
| `android/app/src/main/kotlin/com/goose/app/viewmodel/AppViewModel.kt` | New — coordinates BLE, metrics refresh, upload trigger |
| `android/app/src/main/kotlin/com/goose/app/viewmodel/MetricsViewModel.kt` | New — bridge calls for Recovery/Strain/Sleep |
| `android/app/src/main/kotlin/com/goose/app/viewmodel/SettingsViewModel.kt` | New — DataStore read/write for server URL |
| `android/app/src/main/kotlin/com/goose/app/upload/GooseUploadClient.kt` | New — HTTP POST to `/v1/ingest-frames` |
| `android/app/src/main/kotlin/com/goose/app/MainActivity.kt` | Wire AppViewModel; pass StateFlows to AppShell |

---

## 11. Key Risks / Landmines

1. **DataStore singleton**: `preferencesDataStore` delegate must be defined at top level or in a singleton object — not inside a ViewModel. Define in a `DataStoreModule.kt` or directly on `MainActivity`.
2. **`Application` context for ViewModel**: `AndroidViewModel(app)` requires declaring the ViewModel factory; with `lifecycle-viewmodel-compose`, `viewModel<AppViewModel>()` in a Composable handles this automatically if the ViewModel has no custom constructor (use `Application` as the only arg).
3. **liveHeartRateBPM null state**: Initially `null` until first BLE notification — UI must handle `null` gracefully (show "--" or "—").
4. **R22 packet presence**: Live HR only flows when the device is Connected and sending R22 notifications. Ensure the packet type check (`bytes[0] == 0x10.toByte()`) is correct for the actual BLE characteristic being used.
5. **Upload endpoint**: CONTEXT.md says `/api/v1/upload` but iOS source uses `/v1/ingest-frames`. Confirm with the iOS `GooseUploadService.swift` — the actual path is `/v1/ingest-frames`. Use that.

---

## Validation Architecture

| Checkpoint | Verification |
|-----------|--------------|
| Live HR visible | HomeScreen shows numeric BPM when WHOOP connected |
| Health tab metrics | Recovery/Strain/Sleep non-null after sync |
| Server URL persists | Close/reopen app — URL retained in MoreScreen |
| Upload fires | Logcat shows upload POST after historical sync completes |
| Build clean | `./gradlew assembleDebug` BUILD SUCCESSFUL |
