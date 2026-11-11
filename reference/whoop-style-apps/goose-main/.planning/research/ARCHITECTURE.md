# Architecture: v15.0 Integration Analysis

**Project:** Goose — Multi-Device Biometric Platform
**Milestone:** v15.0 — Protocol Depth, Algorithms & UX
**Analyzed:** 2026-06-21
**Schema baseline:** v23 (CURRENT_SCHEMA_VERSION in store/mod.rs)

---

## Summary

Seven new features land in v15.0. Five are pure additions to existing seams (new enum variants, new bridge methods, new SQLite tables). Two require cross-layer wiring that touches more than one module. None require changes to the BLETransport protocol contract or the bridge JSON-RPC envelope. The r2d2 pool, BridgeRouter domain routing, and store domain split from v12.0–v14.0 all remain intact.

---

## Existing Architecture Recap (do not re-research)

```
BLE bytes
  → CoreBluetoothBLETransport (CBCentralManagerDelegate, CBPeripheralDelegate)
  → GooseNotificationEvent / GooseCommandWriteEvent callbacks
  → GooseAppModel (onNotification, onRawNotificationWithContext)
  → CaptureFrameWriteQueue (NSLock, serial writeQueue)
  → bridge "capture.import_frame_batch" (Rust, sync, background queue)
  → GooseStore / CaptureStore → goose.sqlite

On-demand metrics:
  HealthDataStore → bridge "metrics.*" (async Task.detached)
  → GooseStore / MetricsStore → SQLite

Upload:
  GooseAppModel+Upload → GooseUploadService
  → POST /v1/ingest-frames (raw BLE frames)
  → POST /v1/ingest-decoded (decoded streams)

Bridge routing (bridge/mod.rs → domain files):
  metrics.* / metric_series.* / exercise.* / biometrics.* / calibration.* / diagnostics.*
    → bridge/metrics.rs
  sleep.* / overnight.* / health_sync.*
    → bridge/sleep.rs
  capture.* / protocol.* / historical_sync.* / sync.*
    → bridge/capture.rs
  activity.* / workout.* / apple_daily.* / journal.* / timeline.*
    → bridge/activity.rs
  debug.* / commands.* / settings.* / storage.* / store.* / export.* /
  upload.* / privacy.* / ui_coverage.* / device.* / local_health.* / validation.*
    → bridge/debug.rs
```

---

## Feature 1: v20/v21/v26 Decode (#172, #173)

### What changes

**Rust — protocol.rs**

`DataPacketBodySummary` gains two new variants:

```rust
V20V21OpticalMultiChannel {
    // v20: 8-channel PPG sample burst; v21: same layout, different gain config
    channel_count: u8,
    sample_count: Option<u16>,
    channels: Vec<I16SeriesSummary>, // one per active channel
    flags: Option<u16>,
    warnings: Vec<String>,
},
V26PpgWaveform {
    // 24 Hz raw PPG waveform samples
    sample_rate_hz: u8,              // confirmed 24 from protocol observation
    sample_count: Option<u16>,
    samples: I16SeriesSummary,       // single green-channel stream
    warnings: Vec<String>,
},
```

`parse_data_packet_body_summary` gains two new match arms:

```rust
20 | 21 => parse_v20v21_optical_body(payload),
26 => parse_v26_ppg_waveform_body(payload),
```

This eliminates `unhandled_packet_k_20`, `unhandled_packet_k_21`, and `unhandled_packet_k_26` warnings from the capture pipeline. The `Unknown { packet_k }` catch-all arm remains for any future unrecognised values.

**BRIDGE_METHODS constant (bridge/mod.rs)**

Add the new methods in sorted order and register corresponding dispatch arms. The `bridge_methods_constant_matches_dispatcher` test enforces this at compile time — the build will fail if entries are added to `BRIDGE_METHODS` without a matching arm, or vice versa.

New methods:
- `"biometrics.insert_v20v21_batch"` → bridge/metrics.rs (MetricsStore)
- `"biometrics.insert_v26_batch"` → bridge/metrics.rs (MetricsStore)
- `"biometrics.v20v21_between"` → bridge/metrics.rs (query range)
- `"biometrics.v26_between"` → bridge/metrics.rs (query range)

**Rust — store (extension of MetricsStore)**

V20/V21 are multi-channel arrays; V26 is a single 24 Hz waveform. Neither maps cleanly to the existing scalar tables (spo2_samples, resp_samples, etc.). Add to `store/metrics.rs` (MetricsStore) because these are optical biometric channels, consistent with where `insert_v24_batch` / `v24_between` live:

```sql
-- schema v24 migration
CREATE TABLE IF NOT EXISTS optical_channel_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    device_id TEXT NOT NULL,
    packet_k INTEGER NOT NULL,   -- 20, 21, or 26
    channel_index INTEGER NOT NULL,
    sample_index INTEGER NOT NULL,
    value INTEGER NOT NULL,      -- i16 cast to INTEGER
    synced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_optical_channel_ts
    ON optical_channel_samples(device_id, packet_k, ts);
```

Storing one row per sample allows the existing `synced` / upload-cursor logic to apply without special-casing. For V26 waveform bursts the `channel_index` is always 0; for V20/V21 it identifies the PPG channel.

**Swift — no new component**

`CaptureFrameWriteQueue` calls `capture.import_frame_batch` which already parses packet bodies and persists via the Rust store. Once the Rust variants exist, raw V20/V21/V26 frames flow through the existing pipeline automatically. No Swift-side changes required unless the UI wants to surface channel data — that would be a `HealthDataStore+OpticalChannels.swift` extension calling `biometrics.v20v21_between`.

### Build order

1. Add variants to `DataPacketBodySummary` and parse functions in `protocol.rs`
2. Add `optical_channel_samples` table in `store/mod.rs` (schema v24 migration)
3. Add insert/query methods on `MetricsStore` in `store/metrics.rs`
4. Register bridge methods in `bridge/mod.rs` and add arms to `bridge/metrics.rs`
5. Update `BRIDGE_METHODS` constant (compile-time test enforces correctness)
6. Swift UI (optional, subsequent phase): `HealthDataStore+OpticalChannels.swift`

---

## Feature 2: Harvard Sleep Need Model (#164)

### What changes

**Rust — new function in metrics domain**

New public function: `compute_sleep_need(labels: &[SleepCorrectionLabel], strain: &GooseStrainResult) -> SleepNeedResult`

```rust
pub struct SleepNeedResult {
    pub base_need_minutes: f64,      // age-adjusted baseline (Harvard model)
    pub ewma_debt_minutes: f64,      // 7-night EWMA of sleep deficit
    pub strain_adjustment_minutes: f64, // Banister TRIMP → additional need
    pub total_need_minutes: f64,     // base + ewma_debt + strain_adjustment
    pub confidence: String,          // "high" / "medium" / "low"
    pub nights_used: usize,
}
```

Inputs come from two existing bridge methods:
- `sleep.list_correction_labels` → already in `bridge/sleep.rs` → `SleepStore`
- `metrics.goose_strain_v1` → already in `bridge/metrics.rs` → `MetricsStore`

The new function belongs in a new file `src/sleep_need.rs` (not in metric_features.rs which is already very large) and is exposed via a new bridge method.

**BRIDGE_METHODS / bridge/sleep.rs**

New method: `"sleep.compute_need"` → bridge/sleep.rs

```rust
"sleep.compute_need" => {
    // args: { database_path, date, age_years }
    // 1. load correction labels via SleepStore
    // 2. load strain result via MetricsStore
    // 3. call compute_sleep_need()
    // 4. return SleepNeedResult as JSON
}
```

This goes in `bridge/sleep.rs` because it is fundamentally a sleep metric (sleep debt + need), not a strain metric, even though it consumes strain as an input.

**Swift — HealthDataStore+Sleep.swift (extension)**

Add one async method:

```swift
func loadSleepNeed(date: Date) async -> SleepNeedResult?
```

This calls `bridge.request(method: "sleep.compute_need", args: [...])` on a background task, then publishes to a `@Published var sleepNeed: SleepNeedResult?` on `HealthDataStore`.

No new Swift type or component needed — consistent with how all other metric results are surfaced.

### Build order

1. `src/sleep_need.rs` — core algorithm
2. Schema: no new table needed (reads from existing `sleep_correction_labels` + existing metric tables)
3. Register `"sleep.compute_need"` in `BRIDGE_METHODS` and `bridge/sleep.rs`
4. `HealthDataStore+Sleep.swift` — add `loadSleepNeed` + `@Published var sleepNeed`
5. SwiftUI: add Sleep Need card to Sleep V2 dashboard (reads `healthStore.sleepNeed`)

---

## Feature 3: GET_FF_VALUE / Feature Flag Discovery (#165)

### What changes

**Context**

`GET_FF_VALUE` (command number 128 = 0x80) is already registered in `CoreBluetoothBLETransport.swift` as a debug research command (`id: "get_feature_flag_value"`, commandNumber: 128). The plumbing to send it via `sendDebugResearchCommand` exists. What v15.0 adds is: sending it automatically post-handshake with known flag keys and parsing the response into `DeviceCapabilities`.

**Swift — CoreBluetoothBLETransport+Commands.swift (modified)**

Post-handshake hook: after `sendClientHello()` succeeds and capabilities are resolved, call a new private method `discoverFeatureFlags()`. This method sends command 128 with each known flag key hex. The response arrives as a `CommandResponse` notification and is routed through the existing notification pipeline.

No new component. The existing `CoreBluetoothBLETransport+HistoricalHandlers.swift` already shows the pattern for handling async command responses.

**Swift — CoreBluetoothBLETransport+Parsing.swift (modified)**

In the `CommandResponse` arm of the notification parser, add a case for command 128 that extracts the flag value byte and calls a new private method `applyFeatureFlag(key:value:)`.

**Rust — capabilities.rs (modified)**

Extend `DeviceCapabilities` with optional feature-flag fields:

```rust
pub struct DeviceCapabilities {
    // existing fields unchanged
    pub wire_protocol: String,
    pub historical_sync: String,
    pub battery_via_r22: bool,
    pub battery_via_event48: bool,
    pub battery_via_cmd26: bool,
    pub r22_realtime: bool,
    // new optional fields (None = not yet discovered or not supported)
    pub feature_flags: Option<FeatureFlagSet>,
}

pub struct FeatureFlagSet {
    pub discovered_at: String,          // ISO8601 timestamp
    pub flags: Vec<FeatureFlagEntry>,
}

pub struct FeatureFlagEntry {
    pub key_hex: String,
    pub value: u8,
    pub name: Option<String>,           // human-readable if key is known
}
```

The `device.capabilities` bridge method already serialises `DeviceCapabilities` to JSON. Adding `feature_flags: Option<FeatureFlagSet>` to the struct is backward-compatible: `None` serialises to `null` and old callers ignore the field.

**Swift — BLETransport.swift (not modified)**

`connectedCapabilities: DeviceCapabilities?` already exists on the protocol. The new feature-flag fields appear in the JSON response from `device.capabilities` — Swift decodes them as a `Codable` struct. No protocol change needed.

**Where does the command go?**

`CoreBluetoothBLETransport+Commands.swift` — same file as other post-handshake commands (`readStrapClock`, `refreshBatteryLevel`). The trigger point is the existing `onCapabilitiesUpdated` callback path: after capabilities are resolved, `GooseAppModel` already receives a callback; the transport itself can initiate feature-flag discovery as a follow-on step from its own `sendClientHello` completion path.

### Build order

1. Extend `DeviceCapabilities` in `capabilities.rs` (Rust) — backward compatible
2. `CoreBluetoothBLETransport+Commands.swift` — add `discoverFeatureFlags()` post-handshake call
3. `CoreBluetoothBLETransport+Parsing.swift` — parse cmd-128 response, call `applyFeatureFlag`
4. `CoreBluetoothBLETransport.swift` — update `connectedCapabilities` from decoded feature flags
5. Update `GooseAppModel` / `bleState` if any feature flag gates a UI element

---

## Feature 4: Body Composition History (#166)

### What changes

**New SQLite table (schema v24 migration)**

```sql
CREATE TABLE IF NOT EXISTS body_composition_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,                   -- Unix timestamp of measurement
    source TEXT NOT NULL,               -- "manual" | "healthkit" | "whoop"
    weight_kg REAL,
    body_fat_pct REAL,
    lean_mass_kg REAL,
    bmi REAL,
    device_id TEXT,
    synced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_body_comp_ts
    ON body_composition_entries(ts DESC);
```

**Rust — new domain store file**

Body composition is neither sleep, capture, nor activity. Given the existing pattern (sleep.rs, metrics.rs, capture.rs, activity.rs are all sizeable domain files), a new `store/body_composition.rs` is cleaner than adding to `store/mod.rs`.

Methods needed:
- `insert_body_composition_entry(input: &BodyCompositionInput) -> GooseResult<()>`
- `list_body_composition_entries(since: f64, limit: usize) -> GooseResult<Vec<BodyCompositionRow>>`

**BRIDGE_METHODS / bridge domain**

Body composition fits in the `metrics` domain (biometric measurement, consistent with `biometrics.*`):

```
"body_comp.upsert"  → bridge/metrics.rs
"body_comp.list"    → bridge/metrics.rs
```

Add routing in `bridge/mod.rs`:

```rust
if method.starts_with("body_comp.") {
    return metrics::dispatch_metrics(&request);
}
```

**Swift — new HealthDataStore extension**

`HealthDataStore+BodyComposition.swift`:
- `func loadBodyCompositionHistory() async -> [BodyCompositionEntry]`
- `@Published var bodyCompositionEntries: [BodyCompositionEntry] = []`

**HealthKit integration**

`GooseAppModel+HealthKitExport.swift` already handles HealthKit write for HR/HRV/SpO2/sleep. Add body weight (`HKQuantityTypeIdentifierBodyMass`) write there. HealthKit import for initial backfill can go in the same file.

### Build order

1. `store/body_composition.rs` — new module with table DDL and CRUD methods
2. `store/mod.rs` — add `mod body_composition`, schema v24 migration, delegate methods
3. `bridge/mod.rs` — register `body_comp.*` routing and add to `BRIDGE_METHODS`
4. `bridge/metrics.rs` — add `body_comp.upsert` and `body_comp.list` arms
5. `HealthDataStore+BodyComposition.swift` — new extension
6. `GooseAppModel+HealthKitExport.swift` — add HealthKit weight write/import
7. `BodyCompositionViews.swift` + SwiftUI wiring in More or Health tab

---

## Feature 5: Stealth Mode (#167)

### What changes

Stealth mode is a per-metric UserDefaults toggle that replaces a metric value with "—" in dashboards. It is purely a presentation-layer feature — no Rust changes needed.

**Swift — new helper type (GooseStealthMode.swift)**

```swift
enum GooseStealthMode {
    static func isHidden(metric: String) -> Bool {
        UserDefaults.standard.bool(forKey: "goose.stealth.\(metric)")
    }

    static func setHidden(_ hidden: Bool, metric: String) {
        UserDefaults.standard.set(hidden, forKey: "goose.stealth.\(metric)")
    }

    // Canonical metric keys
    static let hrv = "hrv"
    static let recovery = "recovery"
    static let strain = "strain"
    static let sleep = "sleep"
    static let spo2 = "spo2"
}
```

**Where does it live architecturally?**

`GooseStealthMode` is a stateless utility — no integration with `GooseAppModel` or `HealthDataStore` needed. Views call `GooseStealthMode.isHidden(metric:)` directly in their body. This is correct because:
- Stealth state is user preference (UserDefaults), not biometric data
- `GooseAppModel` should not know about presentation hiding
- SwiftUI views already conditionally render based on UserDefaults elsewhere (e.g., HealthKit write toggle)

No `@Published` state needed because stealth is read at render time from UserDefaults (synchronous, cheap). The view observes its own `@State` toggle state for the settings screen.

**Settings UI**

A new section in `MoreView` or `MorePrivacyView` child sheet with per-metric toggles. Each toggle calls `GooseStealthMode.setHidden(_:metric:)`.

### Build order

1. `GooseStealthMode.swift` — static helper with canonical metric keys
2. Update dashboard views to call `GooseStealthMode.isHidden(metric:)` before rendering values
3. Add stealth toggles in More settings UI

---

## Feature 6: PIP Realtime Pipeline (#168)

### What changes

The PIP pipeline captures realtime BLE frames separately from the historical capture pipeline and uploads them to a dedicated server endpoint.

**Rust — new SQLite table (schema v24 migration)**

```sql
CREATE TABLE IF NOT EXISTS realtime_frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    device_id TEXT NOT NULL,
    frame_hex TEXT NOT NULL,
    packet_type INTEGER,
    synced INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_realtime_frames_device_ts
    ON realtime_frames(device_id, ts);
CREATE INDEX IF NOT EXISTS idx_realtime_frames_synced
    ON realtime_frames(synced, ts);
```

A separate `realtime_frames` table (not a `frame_source` column on `raw_evidence`) keeps the upload cursor simpler and avoids scanning historical frames during realtime upload queries.

**Bridge methods (capture domain)**

```
"capture.insert_realtime_frame_batch"  → bridge/capture.rs
"capture.realtime_frames_pending"      → bridge/capture.rs
"capture.mark_realtime_synced"         → bridge/capture.rs
```

Already routed by the `capture.*` prefix — no routing change in `bridge/mod.rs` needed beyond adding to `BRIDGE_METHODS`.

**Swift — new RealtimePIPQueue class (not a modification of CaptureFrameWriteQueue)**

`CaptureFrameWriteQueue` is tightly coupled to `capture.import_frame_batch` which runs the full parse + SQLite pipeline (raw_evidence + decoded_frames). Realtime PIP frames need a lighter path: store the raw hex immediately without full parse overhead, then upload.

Decision: **new `RealtimePIPQueue` class**, parallel to `CaptureFrameWriteQueue`. Reasons:
- Different bridge method
- Different storage table
- Different upload endpoint
- Existing queue's `maxQueuedRows` / backpressure logic must not be affected

**Swift — GooseAppModel integration**

`GooseAppModel` routes notifications in `GooseAppModel+NotificationPipeline.swift`. Add a parallel path for realtime packet types (R22RealtimeData = 0x10, RealtimeData = 40, RealtimeRawData = 43):

```swift
// In GooseAppModel+NotificationPipeline.swift (modified)
if isRealtimePIPEligible(event) {
    realtimePIPQueue.enqueue(rows: [pipRow], completion: { _ in })
}
// Existing path continues unchanged:
captureWriteQueue.enqueue(rows: frameRows, completion: { ... })
```

**Swift — upload path**

Extend `GooseUploadService` with a `uploadRealtimeFrames(deviceID:since:)` method. Triggered from `GooseAppModel+Upload.swift` after each `RealtimePIPQueue` flush.

**Server — new endpoint**

`POST /v1/ingest-realtime` on the FastAPI server. Same frame JSON shape as `/v1/ingest-frames` but routes to a dedicated TimescaleDB hypertable.

### Data flow (PIP)

```
BLE realtime frame (PacketType 0x10 / 40 / 43)
  → CoreBluetoothBLETransport (onRawNotificationWithContext)
  → GooseAppModel+NotificationPipeline (MODIFIED — parallel fork)
    ├── CaptureFrameWriteQueue (existing, unchanged)
    │     → capture.import_frame_batch → raw_evidence + decoded_frames
    │     → GooseUploadService → POST /v1/ingest-frames
    └── RealtimePIPQueue (NEW)
          → capture.insert_realtime_frame_batch → realtime_frames (NEW table)
          → GooseUploadService.uploadRealtimeFrames → POST /v1/ingest-realtime (NEW)
```

### Build order

1. `store/mod.rs` — add `realtime_frames` table in schema v24 migration
2. `store/capture.rs` — add insert/query/mark-synced methods for realtime_frames
3. `bridge/mod.rs` — register 3 new `capture.*` methods in `BRIDGE_METHODS`
4. `bridge/capture.rs` — add dispatch arms for the three new methods
5. `RealtimePIPQueue.swift` — new Swift class
6. `GooseAppModel+NotificationPipeline.swift` — add parallel PIP enqueue path
7. `GooseUploadService` — add `uploadRealtimeFrames` method
8. `GooseAppModel+Upload.swift` — trigger realtime upload after PIP flush
9. FastAPI server — `POST /v1/ingest-realtime` endpoint + integration test

---

## Feature 7: ALG-HRV-04 / ALG-SLP-04 Real-Data Validation

### What changes

These are validation gates (hardware-gated since v5.0), not new features. The architecture is already in place:
- `src/sleep_validation.rs` — all validation logic
- `Rust/core/tests/` — integration test directory (47 existing files)
- `goose-sleep-v1-release-gate` binary — existing release gate binary

**Rust — two new integration test files**

- `tests/hrv_overnight_validation.rs` — loads a real overnight fixture (anonymised JSON), calls `rmssd_segment_aware`, asserts delta ≤ 1 ms vs Python reference output
- `tests/sleep_staging_overnight_validation.rs` — loads a real overnight fixture, calls `metrics.sleep_staging`, asserts ≥ 70% epoch concordance with human labels

**Fixture handling**

Existing fixtures in `Rust/core/tests/fixtures/` use JSON. Real-data fixtures must be anonymised before commit (strip device_uuid, shift timestamps). The existing `goose-capture-sanitize` binary handles anonymisation.

**No new bridge methods or Swift changes.** Validation runs entirely in `cargo test`.

### Build order

1. Capture real overnight session (hardware gate now unblocked with WHOOP 5)
2. Anonymise via `goose-capture-sanitize`
3. Add anonymised fixture JSON to `Rust/core/tests/fixtures/`
4. Write `tests/hrv_overnight_validation.rs`
5. Write `tests/sleep_staging_overnight_validation.rs`
6. `cargo test` — gate passes when assertions hold
7. Update `ALG-HRV-04` and `ALG-SLP-04` in PROJECT.md as validated

---

## Component Change Summary

| Feature | Component | Change Type |
|---------|-----------|-------------|
| v20/v21/v26 decode | `protocol.rs` `DataPacketBodySummary` | Modified — 2 new variants |
| v20/v21/v26 decode | `protocol.rs` `parse_data_packet_body_summary` | Modified — 2 new match arms |
| v20/v21/v26 decode | `store/mod.rs` | Modified — new table, schema v24 |
| v20/v21/v26 decode | `store/metrics.rs` | Modified — new insert/query methods |
| v20/v21/v26 decode | `bridge/mod.rs` BRIDGE_METHODS | Modified — 4 new entries |
| v20/v21/v26 decode | `bridge/metrics.rs` | Modified — 4 new arms |
| Harvard sleep need | `src/sleep_need.rs` | New file |
| Harvard sleep need | `bridge/mod.rs` BRIDGE_METHODS | Modified — 1 new entry |
| Harvard sleep need | `bridge/sleep.rs` | Modified — 1 new arm |
| Harvard sleep need | `HealthDataStore+Sleep.swift` | Modified — 1 new method + @Published |
| GET_FF_VALUE | `capabilities.rs` | Modified — extended DeviceCapabilities |
| GET_FF_VALUE | `CoreBluetoothBLETransport+Commands.swift` | Modified — post-handshake call |
| GET_FF_VALUE | `CoreBluetoothBLETransport+Parsing.swift` | Modified — cmd-128 response arm |
| Body composition | `store/body_composition.rs` | New file |
| Body composition | `store/mod.rs` | Modified — new module + table + migration |
| Body composition | `bridge/mod.rs` BRIDGE_METHODS + routing | Modified |
| Body composition | `bridge/metrics.rs` | Modified — new arms |
| Body composition | `HealthDataStore+BodyComposition.swift` | New file |
| Body composition | `BodyCompositionViews.swift` | New file |
| Body composition | `GooseAppModel+HealthKitExport.swift` | Modified — weight write/import |
| Stealth mode | `GooseStealthMode.swift` | New file |
| Stealth mode | Dashboard views | Modified — conditional rendering |
| Stealth mode | More settings UI | Modified — toggle section |
| PIP pipeline | `store/mod.rs` | Modified — realtime_frames table |
| PIP pipeline | `store/capture.rs` | Modified — new insert/query/sync methods |
| PIP pipeline | `bridge/mod.rs` BRIDGE_METHODS | Modified — 3 new entries |
| PIP pipeline | `bridge/capture.rs` | Modified — 3 new arms |
| PIP pipeline | `RealtimePIPQueue.swift` | New file |
| PIP pipeline | `GooseAppModel+NotificationPipeline.swift` | Modified — parallel PIP path |
| PIP pipeline | `GooseUploadService` | Modified — uploadRealtimeFrames |
| PIP pipeline | `GooseAppModel+Upload.swift` | Modified — realtime trigger |
| PIP pipeline | FastAPI server | New endpoint |
| ALG validation | `Rust/core/tests/` | 2 new test files |
| ALG validation | `Rust/core/tests/fixtures/` | 2 new fixture files |

---

## Build Order (Cross-Feature, Dependency-Ordered)

**Wave 1 — Rust protocol + schema (no Swift dependencies)**
1. `protocol.rs` — V20V21 and V26 variants + parse functions
2. `store/mod.rs` — schema v24 migration (batch all new tables: `optical_channel_samples`, `realtime_frames`, `body_composition_entries`)
3. `store/metrics.rs` — optical channel insert/query
4. `store/capture.rs` — realtime frames insert/query/sync
5. `store/body_composition.rs` — new module with CRUD
6. `src/sleep_need.rs` — Harvard model algorithm
7. `capabilities.rs` — extend `DeviceCapabilities` with `feature_flags`

**Wave 2 — Bridge registration (depends on Wave 1)**
8. `bridge/mod.rs` — update `BRIDGE_METHODS` with all new entries; add `body_comp.*` routing
9. `bridge/metrics.rs` — V20V21/V26 biometric arms + body_comp arms
10. `bridge/capture.rs` — realtime frame arms
11. `bridge/sleep.rs` — `sleep.compute_need` arm
12. `cargo test` — compile-time `bridge_methods_constant_matches_dispatcher` must pass before any Swift work

**Wave 3 — Swift plumbing (depends on Wave 2)**
13. `HealthDataStore+Sleep.swift` — `loadSleepNeed` + `@Published var sleepNeed`
14. `HealthDataStore+BodyComposition.swift` — new extension
15. `GooseStealthMode.swift` — new stateless helper
16. `RealtimePIPQueue.swift` — new class
17. `CoreBluetoothBLETransport+Commands.swift` — `discoverFeatureFlags()` post-handshake
18. `CoreBluetoothBLETransport+Parsing.swift` — cmd-128 response arm
19. `GooseAppModel+NotificationPipeline.swift` — parallel PIP enqueue path
20. `GooseAppModel+Upload.swift` — realtime upload trigger
21. `GooseAppModel+HealthKitExport.swift` — body weight HealthKit write

**Wave 4 — SwiftUI + validation**
22. `BodyCompositionViews.swift` — entry form + history list
23. Dashboard views — `GooseStealthMode.isHidden(metric:)` conditional rendering
24. More settings UI — stealth toggles + body composition entry point
25. Real overnight capture anonymisation + fixture prep
26. `tests/hrv_overnight_validation.rs`
27. `tests/sleep_staging_overnight_validation.rs`

**Wave 5 — Server**
28. FastAPI `POST /v1/ingest-realtime` endpoint
29. Server integration test

---

## Data Flow Changes

### New: V20/V21/V26 optical channel storage

```
BLE R17/V20/V21/V26 frame (existing notification path, unchanged)
  → CaptureFrameWriteQueue → capture.import_frame_batch
    → parse_data_packet_body_summary:
        20 | 21 → parse_v20v21_optical_body (NEW match arm)
        26      → parse_v26_ppg_waveform_body (NEW match arm)
    → insert into optical_channel_samples (NEW table via MetricsStore)
```

### New: Harvard sleep need computation

```
HealthDataStore.loadSleepNeed(date:) (NEW Swift method)
  → Task.detached → bridge "sleep.compute_need" (NEW method)
    → SleepStore.list_correction_labels (existing)
    → MetricsStore.goose_strain_v1 (existing)
    → compute_sleep_need() in sleep_need.rs (NEW)
  → @Published sleepNeed: SleepNeedResult? (NEW property)
  → SwiftUI Sleep V2 dashboard
```

### New: PIP realtime pipeline

```
BLE realtime frame (PacketType 0x10 / 40 / 43)
  → GooseAppModel+NotificationPipeline (MODIFIED — parallel fork)
    ├── CaptureFrameWriteQueue (unchanged)
    │     → capture.import_frame_batch → raw_evidence + decoded_frames
    │     → POST /v1/ingest-frames
    └── RealtimePIPQueue (NEW)
          → capture.insert_realtime_frame_batch → realtime_frames (NEW)
          → POST /v1/ingest-realtime (NEW)
```

### New: Feature flag discovery

```
sendClientHello() success
  → discoverFeatureFlags() (NEW, CoreBluetoothBLETransport+Commands.swift)
    → sendDebugResearchCommand id "get_feature_flag_value" cmd 128
  → CommandResponse notification
  → CoreBluetoothBLETransport+Parsing.swift cmd-128 arm (NEW)
    → applyFeatureFlag(key:value:)
    → connectedCapabilities.feature_flags updated (MODIFIED struct)
  → onCapabilitiesUpdated() callback → GooseAppModel
```

---

## No Architectural Regressions

- `BLETransport` protocol: no changes to existing methods or properties
- `GooseRustBridge` FFI: no changes (new methods use existing JSON-RPC envelope)
- `BridgeRouter` domain routing: additive only (`body_comp.*` added; all other prefixes unchanged)
- `r2d2` connection pool: no changes (new methods use `checkout_bridge_conn` like existing ones)
- `CaptureFrameWriteQueue`: not modified — PIP uses a new parallel class
- Schema migrations: additive only (new tables in a single v24 migration; no column renames or drops)
- `BRIDGE_METHODS` constant: compile-time test `bridge_methods_constant_matches_dispatcher` prevents drift
- `DataPacketBodySummary::Unknown` catch-all: preserved; new variants are added before it
