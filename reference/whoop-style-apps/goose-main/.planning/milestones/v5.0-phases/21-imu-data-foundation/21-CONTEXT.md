# Phase 21: IMU Data Foundation - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Pure Rust work in 3 files. Swift is already complete:
- `TOGGLE_IMU_MODE_ON/OFF` (command 106) is already sent in `SensorStreamCommandKind.startPhysiologyCapture/stopPhysiologyCapture` — no Swift changes needed.
- Type-51 (PACKET_TYPE_REALTIME_IMU_DATA_STREAM) is already routed through `parse_data_packet_payload` at `protocol.rs:418` — not a `Raw` fallback.

What's missing (Rust only):

**IMU-01 — `I16SeriesSummary` full samples:** `summarize_i16_series` at `protocol.rs:648` currently fills `preview: Vec<i16>` capped at 8 samples (line 687). K10/K21 axes have 100 samples per axis. Add `full_samples: Option<Vec<i16>>` to `I16SeriesSummary` (non-breaking additive field) and populate it with the full `parsed_count` values in `summarize_i16_series`. The `preview` field stays unchanged.

**IMU-02 — `gravity` SQLite table (schema v15):** `store.rs` has schema migrations 1-14 (lines 1409-1422). Add migration v15 creating `gravity(device_id TEXT, ts REAL, x REAL, y REAL, z REAL)` with index on `(device_id, ts)`. Add `insert_gravity_rows` method and `gravity_rows_between` query method to `GooseStore`.

**IMU-03 — Bridge gravity extraction:** `bridge.rs:3106` has `let gravity: Vec<serde_json::Value> = Vec::new();` as an empty placeholder. `bridge.rs:3162` has `// K21 raw motion — gravity/accel data; no direct extraction` comment. Replace both with actual extraction of K10/K21 `full_samples` axes → LSB→g conversion (factor ~3900, configurable via constant). Each gravity row: `{"ts": unix_s_f64, "x": f64, "y": f64, "z": f64}` from the 3 axes (accelX/Y/Z, offsets 82/282/482 in K10 packet, 100 samples per axis). The `insert_gravity_rows` bridge method should call the store method from IMU-02.

**IMU-04 — TOGGLE_IMU_MODE already in production:** TOGGLE_IMU_MODE is already being sent. The "feature flag" requirement is satisfied by noting this in code (no action needed). The Rust pipeline just needs to correctly store the data.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — pure infrastructure phase. Key invariants:
- `full_samples: Option<Vec<i16>>` is additive — `preview` field unchanged, no existing test assertions broken
- LSB→g conversion factor: expose as a named constant `IMU_LSB_PER_G: f64 = 3900.0` in `protocol.rs` or `bridge.rs` for future calibration
- `gravity` rows: one row per sample timestamp, not per packet
- Bridge method name: `"store.insert_gravity_rows"` 
- Gravity query: `"store.gravity_rows_between"` accepting `{device_id, ts_start, ts_end, database_path}`

</decisions>

<code_context>
## Existing Code Insights

### Key File Locations
- `Rust/core/src/protocol.rs:169` — `I16SeriesSummary` struct (has `preview: Vec<i16>`, needs `full_samples`)
- `Rust/core/src/protocol.rs:648-704` — `summarize_i16_series` function (cap at 8 for preview)
- `Rust/core/src/protocol.rs:586-644` — `parse_k10_raw_motion_summary` / `parse_k21_raw_motion_summary`
- `Rust/core/src/bridge.rs:3082-3228` — `upload.get_recent_decoded_streams` handler with `gravity: Vec::new()` placeholder at line 3106
- `Rust/core/src/bridge.rs:3150-3190` — K10/K21 extraction section with `no direct extraction` comment at 3162
- `Rust/core/src/store.rs:934-1422` — Schema initialization with migrations 1-14

### Schema Migration Pattern
`store.rs` uses `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (N)` to gate DDL. Pattern is: add the migration DDL in `GooseStore::initialize` gated on `schema_version < 15`.

### Rust Conventions
- All public methods on `GooseStore` follow `pub fn method_name(&self, ...) -> GooseResult<...>`
- JSON serialization via `serde_json::json!({...})` macro
- Error type: `GooseError` / `GooseResult<T>`

</code_context>

<specifics>
## Specific Ideas

- LSB→g factor: research confirmed ~3900 LSB/g for WHOOP accelerometer. Expose as constant.
- K10 axis offsets: accelX=82, accelY=282, accelZ=482 (each 100 i16 samples × 2 bytes = 200 bytes per axis)
- `ts` in gravity rows: use `timestamp_seconds` + `timestamp_subseconds` from the `DataPacket` (already parsed in `parse_data_packet_payload`)
- `device_id`: use the device_id passed in the upload args (already present in the upload handler)

</specifics>

<deferred>
## Deferred Ideas

- Optional: expose `full_samples` in the upload payload to the server (can be done in a later phase)
- Optional: per-axis gravity calibration (future)
- Type-51 specific packet parsing (K51 body) — may have different format than K10; defer until empirical data available

</deferred>
