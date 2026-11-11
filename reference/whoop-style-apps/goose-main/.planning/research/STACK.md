# Technology Stack — v15.0 Delta

**Project:** Goose Biometric Platform
**Milestone:** v15.0 — Protocol Depth, Algorithms & UX
**Researched:** 2026-06-21
**Scope:** NEW additions and changes only. Existing stack unchanged unless called out.

---

## Summary

v15.0 adds zero new crates to Cargo.toml and zero new iOS frameworks. All new
capability (v20/v21/v26 decode, Harvard sleep need, GET_FF_VALUE, body composition
history, stealth mode, PIP realtime pipeline, CAPSENSE-01, HAP-04) is implemented
purely in existing layers: Rust protocol.rs / store, Swift UserDefaults / HealthKit,
FastAPI endpoint, SQLite migration. The one real change is a schema bump from v23
to v24 (three new tables: `realtime_frames`, `body_composition_history`, `device_feature_flags`).

---

## New Dependencies

### Rust — None

No new crates are required.

| Capability | Why no new crate | Implementation path |
|---|---|---|
| v20/v21/v26 multi-channel optical decode | Pure byte-slice parsing, same as v18/v24 | Extend `parse_v20_body`, `parse_v21_body`, `parse_v26_body` in `protocol.rs` |
| Harvard sleep need model | Pure arithmetic: age baseline + EWMA debt + strain load | New function in `sleep_staging.rs` or `metric_features.rs` |
| GET_FF_VALUE (0x80) response decode | Single-byte flag → `DeviceCapabilities` fields | New arm in `commands.rs` response parser |
| PIP realtime frames | SQLite insert via existing rusqlite / r2d2 | New `realtime_frames` table + store method |
| Body composition history | SQLite insert via existing rusqlite / r2d2 | New `body_composition_history` table + store method |

Current versions (already present, no bump needed):

| Crate | Current | Status |
|---|---|---|
| `rusqlite` | 0.39 (bundled) | Keep |
| `r2d2` | 0.8.10 | Keep |
| `r2d2_sqlite` | 0.34.0 | Keep |
| `serde` / `serde_json` | 1.0 | Keep |
| `crc32fast` | 1.4 | Keep |
| `sha2` | 0.11 | Keep |
| `thiserror` | 2.0 | Keep |
| `zip` | 8.6 | Keep |
| `tungstenite` | 0.29 (non-Android) | Keep |
| `jni` | 0.21 (Android) | Keep |
| `tempfile` | 3.13 (dev) | Keep |

### iOS (Swift) — No New Frameworks

All v15.0 features are implemented with frameworks already imported by the app.

| Capability | Framework | Already present? |
|---|---|---|
| Body composition history UI | SwiftUI | Yes |
| HealthKit weight autofill | HealthKit (`HKQuantityType.bodyMass`) | Yes — already read for profile |
| Stealth mode toggles | Foundation (UserDefaults) | Yes |
| CAPSENSE-01 on-wrist UUID subscription | CoreBluetooth | Yes |
| HAP-04 wake-window haptic timing | CoreBluetooth (buzz cmd) + Foundation | Yes |
| PIP realtime upload | URLSession | Yes |
| GET_FF_VALUE response wiring | Already in `CoreBluetoothBLETransport+Commands` pattern | Yes |

### Android — No New Libraries

The Android BLE client (WhoopBleClient / FrameReassembler) already handles
arbitrary packet routing. v20/v21/v26 routing follows the same pattern as type-47
v18. No new Gradle dependencies required.

Current Android versions (keep):

| Library | Version |
|---|---|
| AGP | 9.2.0 |
| Kotlin | 2.4.0 |
| Compose BOM | 2026.05.00 |
| androidx.core.ktx | 1.16.0 |
| lifecycle-runtime-compose | 2.9.1 |
| datastore-preferences | 1.1.4 |

### Server (FastAPI) — One New Route, No New Libraries

New endpoint: `POST /v1/ingest-realtime` — receives `realtime_frames` rows
from the PIP pipeline. Implemented with existing psycopg + FastAPI patterns;
no new Python packages required.

Current server dependencies (keep):

| Package | Version |
|---|---|
| fastapi | 0.136.3 |
| uvicorn[standard] | 0.49.0 |
| psycopg[binary] | 3.3.4 |
| neurokit2 | 0.2.13 |
| numpy | 2.4.6 |
| scipy | 1.17.1 |
| scikit-learn | 1.9.0 |
| pandas | 2.3.3 |
| httpx | >=0.28.1 |

---

## Schema Changes

**Current:** `CURRENT_SCHEMA_VERSION = 23` (`store/mod.rs` line 23)
**Required:** Bump to `24`

Migration block adds three tables. All wrapped in a single `PRAGMA user_version = 24`
block following the existing migration pattern (appended after the `user_version = 23` block).

### New Table: `realtime_frames`

Stores per-second PPG/biometric frames from the PIP realtime pipeline (FRAME_SOURCE_REALTIME).
Distinct from `decoded_frames` (which stores historical sync batches) — realtime frames
arrive continuously during an active session.

```sql
CREATE TABLE IF NOT EXISTS realtime_frames (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    ts              INTEGER NOT NULL,          -- Unix epoch ms
    frame_source    TEXT NOT NULL DEFAULT 'realtime',
    packet_type     INTEGER NOT NULL,
    format_version  INTEGER NOT NULL,
    payload_hex     TEXT NOT NULL,
    parsed_json     TEXT,                      -- nullable: populated after decode
    synced          INTEGER NOT NULL DEFAULT 0,
    captured_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_realtime_frames_device_ts
    ON realtime_frames(device_id, ts);
CREATE INDEX IF NOT EXISTS idx_realtime_frames_session
    ON realtime_frames(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_realtime_frames_synced
    ON realtime_frames(synced, ts);
```

### New Table: `body_composition_history`

Stores timestamped body composition entries (weight, body fat %, lean mass).
Used by `#166` body composition history feature and HealthKit weight autofill.

```sql
CREATE TABLE IF NOT EXISTS body_composition_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       TEXT NOT NULL,
    ts              INTEGER NOT NULL,          -- Unix epoch ms (measurement date)
    weight_kg       REAL,
    body_fat_pct    REAL,
    lean_mass_kg    REAL,
    source          TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'healthkit'
    synced          INTEGER NOT NULL DEFAULT 0,
    captured_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_body_composition_device_ts
    ON body_composition_history(device_id, ts);
```

### New Table: `device_feature_flags`

Stores raw GET_FF_VALUE (cmd 0x80) response bytes and decoded capability flags
per device. One row per flag key per device; upsert on (device_id, flag_key).

```sql
CREATE TABLE IF NOT EXISTS device_feature_flags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       TEXT NOT NULL,
    flag_key        TEXT NOT NULL,
    raw_value       BLOB,
    decoded_value   TEXT,                      -- JSON string of interpreted value
    firmware_ver    TEXT,
    captured_at     INTEGER NOT NULL,
    UNIQUE(device_id, flag_key)
);
CREATE INDEX IF NOT EXISTS idx_device_feature_flags_device
    ON device_feature_flags(device_id);
```

### No Changes to Existing Tables

`decoded_frames`, `raw_evidence`, `hr_samples`, `rr_intervals`, `spo2_samples`,
`skin_temp_samples`, `resp_samples`, `sync_telemetry`, `capture_sessions`, and
all other existing tables are unchanged. The stealth mode feature uses only
UserDefaults (Swift), not SQLite.

---

## Server Changes

### New Route: `POST /v1/ingest-realtime`

**File:** `server/ingest/app/main.py`
**Pattern:** Identical to `/v1/ingest-frames` (line 453 in main.py). Accepts a
batch of realtime frame rows from the iOS/Android app during an active PIP session.
Inserts into a new `realtime_frames` TimescaleDB hypertable (mirror of the SQLite
table).

**TimescaleDB side:** Add `realtime_frames` hypertable in the migration script
(`server/db/`). Same schema as the SQLite table above, with `ts` as the time
partitioning column. Hypertable is appropriate here (high-frequency time-series,
up to 1 row/second/device).

**Auth:** Same `require_auth` Bearer-token dependency.

**Rate characteristics:** Up to 1 row/second per device during active sessions —
same order as `/v1/ingest-decoded` which is already designed for high-frequency
writes. No throttling changes needed.

### No Other Server Changes

The existing `/v1/ingest`, `/v1/ingest-decoded`, `/v1/ingest-frames` routes
are unchanged. Body composition and feature flags data are stored locally (SQLite)
only for v15.0 — no server upload endpoints needed for those.

---

## Rust Module Changes (No New Files Unless Warranted)

| Feature | File | Change Type |
|---|---|---|
| v20 decode (2140B) | `protocol.rs` | New `parse_v20_body()` fn + dispatch arm at `20 =>` |
| v21 decode (1244B) | `protocol.rs` | New `parse_v21_body()` fn + dispatch arm at `21 =>` |
| v26 decode (88B, 24 Hz PPG) | `protocol.rs` | New `parse_v26_body()` fn + dispatch arm at `26 =>` |
| Harvard sleep need | `metric_features.rs` | Extend existing `sleep_need_minutes` input; new `compute_sleep_need_result()` returning `SleepNeedResult` struct |
| GET_FF_VALUE wiring | `commands.rs` + `bridge/` | New bridge method `device.get_feature_flag`; response stored in `device_feature_flags` table |
| Body composition store | `store/metrics.rs` | New `insert_body_composition()` + `list_body_composition()` methods |
| PIP realtime store | `store/capture.rs` | New `insert_realtime_frame()` + `list_realtime_frames_unsynced()` methods |
| CAPSENSE-01 | `capabilities.rs` | New `has_capsense: bool` field on `DeviceCapabilities` when UUID identified |

`DeviceCapabilities` struct in `capabilities.rs` gains two new boolean fields:
- `has_capsense: bool` — set true when CAPSENSE UUID subscribable
- `feature_flags_supported: bool` — set true after successful GET_FF_VALUE read

New `DataPacketBodySummary` variants (or extend existing if field overlap allows):
- `V20MultiChannel { green_ch1: u16, green_ch2: u16, red_ir: u16, ... }`
- `V21MultiChannel { ... }`
- `V26Ppg24Hz { samples: Vec<u16> }` — 24 Hz waveform, up to 24 samples per packet

---

## Swift Changes (No New Frameworks)

| Feature | File(s) | Change |
|---|---|---|
| Stealth mode | New `StealthModeStore.swift` + existing dashboard views | `@Observable` UserDefaults wrapper; per-metric `isHidden: Bool`; views render `"—"` when hidden |
| Body composition entry UI | New `BodyCompositionViews.swift` | SwiftUI form; bridge insert call; HealthKit `.bodyMass` autofill |
| PIP realtime upload | `GooseAppModel+NotificationPipeline.swift` | Tag realtime frames `FRAME_SOURCE_REALTIME`; batch POST to `/v1/ingest-realtime` via existing URLSession pattern |
| GET_FF_VALUE | `CoreBluetoothBLETransport+Commands.swift` | New `readFeatureFlagValue(key:)` — sends cmd 0x80; parses response; persists to `device_feature_flags` via bridge; updates `DeviceCapabilities` |
| CAPSENSE-01 | `CoreBluetoothBLETransport.swift` | Subscribe to CAPSENSE characteristic UUID once identified; publish `isOnWrist` via existing `BLETransport` protocol property |
| HAP-04 wake-window | `GooseWakeWindowManager.swift` | Remove RE-GATED stub; implement sleep-stage aware alarm timing using `BLESessionCoordinator` buzz cmd after BTSnoop prerequisites met |

---

## What NOT to Add

| Temptation | Why Not |
|---|---|
| `bindgen` / `cbindgen` crates | Bridge header is hand-written and stable; code generation adds build complexity with no benefit |
| `tokio` or `async-std` | The Rust core is synchronous by design — FFI callers manage threading on the Swift/Kotlin side; async runtime complicates the cdylib ABI |
| `log` + `env_logger` crates | OSLog handles iOS logging; JNI logcat handles Android; a Rust logging facade duplicates infrastructure |
| `uuid` crate | Device UUIDs come from CoreBluetooth / Android BLE stack as strings; no UUID generation needed in Rust |
| `chrono` or `time` crates | All timestamps are Unix epoch integers; `std::time::SystemTime` is sufficient for the one place a wall-clock timestamp is needed |
| Android HealthConnect | Not needed for v15.0; body composition is manual entry + HealthKit (iOS only) for now; HealthConnect requires Play Services |
| Compose Navigation library | Android app uses simple tab state, not deep navigation graphs; navigation-compose is premature |
| Server ML inference endpoint | Algorithm scores are computed Rust-side via the bridge; no server-side Python inference route needed |
| TimescaleDB hypertables for body_composition / device_feature_flags | These are low-volume lookup tables (one row per measurement / per flag per device); plain PostgreSQL tables are correct; hypertables only for high-frequency streams |
| React/Next.js dashboard | Out of scope per PROJECT.md; server-side data analysis is explicitly excluded |
| New SQLite table for stealth mode | Stealth is a UI preference — UserDefaults is the right store; SQLite would be over-engineering |

---

## Integration Considerations

**Protocol parsing (v20/v21/v26):** The `format_version` byte sits at the same
offset in all type-47 packets. The existing `parse_data_packet_body_summary()`
dispatch in `protocol.rs` adds arms `20 =>`, `21 =>`, `26 =>` exactly as v18
and v24 were added in earlier milestones. Parsed fields are stored in new
`DataPacketBodySummary` variants or folded into existing if field overlap allows.

**Harvard sleep need:** `sleep_need_minutes` is already threaded through
`MetricFeatureOptions` and bridge sleep methods (hardcoded to 480.0 default).
The Harvard model computes `age_baseline_minutes + ewma_debt_minutes +
strain_contribution_minutes` and stores the result in `metric_series` under
`sleep.sleep_need_modeled_minutes`. No new table needed; the field replaces the
hardcoded 480.0 for users who have entered their age in settings.

**Stealth mode:** Implemented entirely in Swift with `UserDefaults`. A
`StealthModeStore` with `@Observable` publishes per-metric `isHidden: Bool`.
Dashboard views read `isHidden` and substitute `"—"` for the numeric value.
The Rust bridge always returns real values — stealth is a presentation layer
concern only.

**Android parity for v20/v21/v26:** Per the iOS/Android parity rule, new
protocol formats routable by the Rust core must also be routable by the Android
`FrameReassembler`. Since decoding is Rust-side (via JNI bridge), only the routing
switch in `WhoopBleClient.kt` needs new version arms — no separate Android parsing.

**Schema migration safety:** The v23→v24 migration block checks
`schema_version < 24` before running DDL, consistent with the existing guard
pattern. All three new tables use `IF NOT EXISTS` DDL so the migration is
idempotent across reinstalls.
