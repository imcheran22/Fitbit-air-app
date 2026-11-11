# Phase 106: Android Metrics + Server Upload - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Display WHOOP metrics in Android Compose UI (live HR on Home tab, Recovery/Strain/Sleep on Health tab) via GooseBridge metrics.* calls. Upload captured frames to configured server URL via HTTP POST after each sync. Server URL stored in DataStore.

**In scope:** Home tab live HR display, Health tab Recovery/Strain/Sleep, DataStore server URL config, HTTP POST upload after sync, Settings screen for server URL input.
**Out of scope:** Android CI APK (Phase 107), background periodic jobs, push notifications, OAuth.

</domain>

<decisions>
## Implementation Decisions

### Server URL storage
- **D-01:** Use **Jetpack DataStore (Preferences)** for server URL — async, coroutines-native, correct for simple config. Key: `server_url`. Default: empty string (upload disabled when empty).

### Upload trigger
- **D-02:** Upload **automatically after each historical sync** completes (`completeSyncIfActive()`). Fire-and-forget on `Dispatchers.IO`. Mirror iOS URLSession upload pattern.
- **D-03:** Upload endpoint: `POST {server_url}/upload` with JSON body matching iOS upload format. If server URL is empty, skip upload silently.

### Metrics display
- **D-04:** **Home tab:** live HR from `WhoopBleClient` `StateFlow` (already wired in Phase 104)
- **D-05:** **Health tab:** Recovery score, Strain, Sleep score via `GooseBridge.handle("metrics.get_recovery_snapshot", ...)` and sibling methods. Same bridge calls as iOS `HealthDataStore`.
- **D-06:** Parity with iOS v13.0 data surface — use same metric query method names as iOS `HealthDataStore+Snapshots.swift`.

### Claude's Discretion
- Compose ViewModel: `MetricsViewModel` with `StateFlow` for Recovery/Strain/Sleep; refresh on resume + after sync
- HTTP client: `HttpURLConnection` (no external dependency) or OkHttp if already in build.gradle
- Settings screen: simple TextField for server URL in the More tab (existing stub screen)
- Metrics refresh: call bridge on app foreground + after sync completes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iOS metrics pattern (parity target)
- `GooseSwift/HealthDataStore+Snapshots.swift` — metric bridge call method names and args
- `GooseSwift/HealthDashboardViews.swift` — what data surfaces in Health tab

### iOS server upload pattern
- `GooseSwift/GooseAppModel+SyncToServer.swift` (or equivalent) — iOS upload endpoint and JSON format

### Android scaffold (existing)
- `android/app/src/main/kotlin/com/goose/app/bridge/GooseBridge.kt` — JNI bridge
- `android/app/src/main/kotlin/com/goose/app/ble/WhoopBleClient.kt` — sync completion hook
- `android/app/src/main/kotlin/com/goose/app/` — existing HomeScreen, HealthScreen, MoreScreen stubs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseBridge.kt` — `handle(request)` ready; use same JSON-RPC schema as iOS
- `WhoopBleClient.kt` — `completeSyncIfActive()` is the hook for post-sync upload trigger
- Home/Health/More screen stubs exist from Phase 103 — fill them in

### Established Patterns
- Bridge call format: `{"schema":"goose.bridge.request.v1","method":"metrics.get_recovery_snapshot","args":{"database_path":"..."}}`
- DB path: `context.filesDir.absolutePath + "/goose.sqlite"`

### Integration Points
- `WhoopBleClient` sync complete → `MetricsViewModel.refresh()` → bridge calls → UI update
- `WhoopBleClient` sync complete → read server URL from DataStore → HTTP POST if non-empty
- Settings screen (More tab) → DataStore write of server URL

</code_context>

<specifics>
## Specific Ideas

- DataStore key: `PreferencesKeys.stringKey("server_url")`
- HTTP POST: `{server_url}/api/v1/upload` — check iOS `GooseAppModel` for exact path
- MetricsViewModel collects from GooseBridge and exposes StateFlow<RecoverySnapshot?>
- Health tab shows: Recovery %, HRV RMSSD, Strain score, Sleep performance % — same as iOS Home/Health tabs

</specifics>

<deferred>
## Deferred Ideas

- Background periodic upload (WorkManager) — out of scope for Phase 106
- Push notifications on sync complete — out of scope
- Android CI APK — Phase 107

</deferred>

---

*Phase: 106-android-metrics-server-upload*
*Context gathered: 2026-06-21*
