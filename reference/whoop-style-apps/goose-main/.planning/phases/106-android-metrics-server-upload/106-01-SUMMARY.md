---
phase: 106
plan: "01"
subsystem: android-metrics-upload
tags: [android, kotlin, compose, metrics, datastore, upload, ble]
status: complete
requirements: [AND-04]

dependency_graph:
  requires: [Phase 105 (WhoopBleClient historical sync + completeSyncIfActive hook)]
  provides:
    - Android live HR display (D-04)
    - Android Recovery/Strain/Sleep metrics via GooseBridge (D-05, D-06)
    - Jetpack DataStore server URL persistence (D-01)
    - HTTP POST upload to server after sync (D-02, D-03)
    - AppViewModel lifecycle coordinator
  affects:
    - android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt
    - android/app/src/main/kotlin/com/goose/app/ui/ (all 4 screens)
    - android/gradle/libs.versions.toml
    - android/app/build.gradle.kts

tech_stack:
  added:
    - Jetpack DataStore Preferences 1.1.4
    - lifecycle-viewmodel-compose 2.9.1
  patterns:
    - AndroidViewModel with Application for bridge + DataStore access
    - StateFlow delegation from AppViewModel to UI screens
    - fire-and-forget upload on Dispatchers.IO via HttpURLConnection
    - preferencesDataStore top-level extension (package-level, not class-level)

key_files:
  created:
    - android/app/src/main/kotlin/com/goose/app/viewmodel/AppViewModel.kt
    - android/app/src/main/kotlin/com/goose/app/viewmodel/MetricsViewModel.kt
    - android/app/src/main/kotlin/com/goose/app/viewmodel/SettingsViewModel.kt
    - android/app/src/main/kotlin/com/goose/app/data/DataStoreModule.kt
    - android/app/src/main/kotlin/com/goose/app/upload/GooseUploadClient.kt
  modified:
    - android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt
    - android/app/src/main/kotlin/com/goose/app/ui/HomeScreen.kt
    - android/app/src/main/kotlin/com/goose/app/ui/HealthScreen.kt
    - android/app/src/main/kotlin/com/goose/app/ui/MoreScreen.kt
    - android/app/src/main/kotlin/com/goose/app/ui/AppShell.kt
    - android/app/src/main/kotlin/com/goose/app/MainActivity.kt
    - android/gradle/libs.versions.toml
    - android/app/build.gradle.kts

decisions:
  - DataStore top-level extension must be package-level (not inside class) to avoid delegate init issues
  - GooseBridge.safeHandle() always on Dispatchers.IO — never main thread
  - Upload uses HttpURLConnection (no OkHttp) for zero external HTTP dependency
  - Upload endpoint confirmed from iOS source as /v1/ingest-frames (not /api/v1/upload as in CONTEXT.md)
  - MetricsViewModel refresh triggered by onSyncComplete callback and init{}
  - AppViewModel owns WhoopBleClient lifecycle; onCleared() calls disconnect()

metrics:
  duration: "~45 min"
  completed: "2026-06-21"
  tasks_completed: 10
  tasks_total: 10
  files_modified: 13
  files_created: 5
---

# Phase 106 Plan 01: Android Metrics + Server Upload Summary

## What Was Delivered

Android app now shows live WHOOP metrics and uploads captured frames to a configured server.

**Live HR (D-04):** Added `liveHeartRateBPM: StateFlow<Int?>` to `WhoopBleClient`. R22 BLE packets (byte[0]==0x10) decoded in the notification handler — milli-bpm bytes[2-3] little-endian divided by 10. HomeScreen shows `HR: N bpm` when connected, `—` before first reading.

**Health metrics (D-05, D-06):** `MetricsViewModel` calls `GooseBridge.safeHandle()` on `Dispatchers.IO` with `metrics.recovery_score_from_features`, `metrics.strain_score_from_features`, `metrics.sleep_score_from_features` — matching iOS `HealthDataStore+Snapshots.swift` method names exactly. HealthScreen shows Recovery %, Strain (0-21), Sleep % with null-safe formatting.

**Server URL (D-01):** `DataStoreModule.kt` defines `val Context.gooseDataStore` at package level with `SERVER_URL_KEY = stringPreferencesKey("server_url")`. `SettingsViewModel` exposes `serverUrl: StateFlow<String>` and `setServerUrl()` via DataStore. MoreScreen shows `OutlinedTextField` for URL input.

**Upload (D-02, D-03):** `GooseUploadClient.upload()` called via `onSyncComplete` callback in `completeSyncIfActive()`. Posts to `{serverUrl}/v1/ingest-frames` using `HttpURLConnection`. Skips silently when URL is empty. Fire-and-forget on `Dispatchers.IO`.

**Coordinator:** `AppViewModel` owns `WhoopBleClient`, `MetricsViewModel`, `SettingsViewModel`. Delegates all StateFlows to `MainActivity` which passes them down to `AppShell` and child screens.

**Build:** `./gradlew assembleDebug` BUILD SUCCESSFUL. APK at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (Gradle deps) | b19d7d1 | Add DataStore and ViewModel deps |
| 2 (WhoopBleClient) | 96f7bfc | Live HR StateFlow + onSyncComplete callback |
| 3-5 (ViewModels) | 0d0d10b | MetricsViewModel, SettingsViewModel, DataStore, GooseUploadClient |
| 6-9 (AppViewModel + UI) | bad2e26 | AppViewModel, MainActivity, all screens wired |
| Fix (SettingsViewModel) | 9fbd237 | Missing DataStore edit import |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SettingsViewModel missing DataStore `edit` import**
- **Found during:** Task 10 (build verification)
- **Issue:** `androidx.datastore.preferences.core.edit` is not imported by default; the extension function is not in scope without an explicit import. Also, `app` local parameter is not accessible inside a `viewModelScope.launch` closure without `getApplication()`.
- **Fix:** Added `import androidx.datastore.preferences.core.edit` and replaced `app.gooseDataStore.edit` with `getApplication<Application>().gooseDataStore.edit`
- **Files modified:** `SettingsViewModel.kt`
- **Commit:** 9fbd237

**2. [Informational] Upload endpoint path corrected**
- CONTEXT.md D-03 specified `{server_url}/upload` but iOS source (`GooseUploadService.swift`) uses `/v1/ingest-frames`
- Used the actual iOS endpoint for parity
- No functional impact on Android-only users; server URL is user-configured

## Known Stubs

None — all three data surfaces (live HR, metrics, server URL) are wired to real data sources. Metrics show `—` until first bridge response, which is correct null-state behavior (not a stub).

## Self-Check: PASSED

- [x] `android/app/src/main/kotlin/com/goose/app/viewmodel/AppViewModel.kt` exists
- [x] `android/app/src/main/kotlin/com/goose/app/viewmodel/MetricsViewModel.kt` exists
- [x] `android/app/src/main/kotlin/com/goose/app/viewmodel/SettingsViewModel.kt` exists
- [x] `android/app/src/main/kotlin/com/goose/app/data/DataStoreModule.kt` exists
- [x] `android/app/src/main/kotlin/com/goose/app/upload/GooseUploadClient.kt` exists
- [x] `WhoopBleClient.kt` has `liveHeartRateBPM` and `onSyncComplete`
- [x] Build: BUILD SUCCESSFUL (exit 0)
- [x] APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- [x] Commits b19d7d1, 96f7bfc, 0d0d10b, bad2e26, 9fbd237 all present
