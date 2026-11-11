# Phase 113: Schema v24 + Optical Bridge Methods - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure Rust/SQLite phase. Bump `CURRENT_SCHEMA_VERSION` 23 → 24 with a single migration transaction that creates four new tables. Add bridge insert/query methods for OPT-03 (optical samples) and FF-03 (feature flags) only. BODY-01 and PIP-02 tables are created but get no bridge methods here — those come in Phases 116 and 118 respectively. Gate: `cargo test --locked` passes clean.

</domain>

<decisions>
## Implementation Decisions

### Schema Migration
- **D-01:** Single migration block: bump `CURRENT_SCHEMA_VERSION = 24` in `Rust/core/src/store/mod.rs`, append all four `CREATE TABLE IF NOT EXISTS` DDL statements and the `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (24)` + `PRAGMA user_version = 24` pair in one transaction block — matching the pattern of migrations 22 and 23.
- **D-02:** Update the existing `test_schema_version_is_N` test (if present) to assert version 24.

### optical_channel_samples Table (OPT-03)
- **D-03:** One row per (device_id, ts, packet_k, channel_index). Samples stored as `samples_json TEXT NOT NULL` (JSON array of integers — i32 for v20, i16 for v21/v26). Matches the existing `spo2_samples` single-column-per-metric pattern but uses JSON for the variable-length array.
- **D-04:** Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS optical_channel_samples (
      device_id TEXT NOT NULL,
      ts REAL NOT NULL,
      packet_k INTEGER NOT NULL,
      version INTEGER NOT NULL,
      channel_index INTEGER NOT NULL,
      samples_json TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(device_id, ts, packet_k, channel_index)
  );
  CREATE INDEX IF NOT EXISTS idx_optical_channel_samples_device_ts
      ON optical_channel_samples(device_id, ts);
  ```
- **D-05:** `INSERT OR IGNORE` on duplicate (device_id, ts, packet_k, channel_index) — idempotent, matching spo2_samples.

### device_feature_flags Table (FF-03)
- **D-06:** One row per (device_id, flag_index). Latest value wins: `INSERT OR REPLACE`.
- **D-07:** Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS device_feature_flags (
      device_id TEXT NOT NULL,
      flag_index INTEGER NOT NULL,
      flag_value INTEGER NOT NULL,
      discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY(device_id, flag_index)
  ) WITHOUT ROWID;
  ```

### body_composition_history Table (BODY-01 schema only)
- **D-08:** Schema as specified in REQUIREMENTS.md — `weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct, source CHECK('manual','healthkit','scale'), date TEXT NOT NULL, UNIQUE(source, date)`. No bridge methods in this phase.
  ```sql
  CREATE TABLE IF NOT EXISTS body_composition_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL,
      bmi REAL,
      body_fat_pct REAL,
      muscle_mass_kg REAL,
      water_pct REAL,
      source TEXT NOT NULL CHECK(source IN ('manual','healthkit','scale')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(source, date)
  );
  ```

### realtime_frames Table (PIP-02 schema only)
- **D-09:** Schema as specified in REQUIREMENTS.md. No bridge methods in this phase.
  ```sql
  CREATE TABLE IF NOT EXISTS realtime_frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_uuid TEXT NOT NULL,
      frame_hex TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT 'realtime_pip',
      synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_realtime_frames_device_captured
      ON realtime_frames(device_uuid, captured_at);
  ```

### Bridge Methods — OPT-03
- **D-10:** `biometrics.insert_v20v21_batch` args:
  ```json
  {
    "database_path": "...",
    "device_id": "...",
    "packets": [
      { "ts": 1234567890.0, "packet_k": 20, "version": 20,
        "channels": [{"index": 0, "samples": [1,2,3,...]}, ...] }
    ]
  }
  ```
  Returns `{"inserted": N}`.
- **D-11:** `biometrics.insert_v26_batch` args:
  ```json
  {
    "database_path": "...",
    "device_id": "...",
    "packets": [
      { "ts": 1234567890.0, "packet_k": 26, "version": 26,
        "ppg": [1,2,3,...], "num_channels": 8 }
    ]
  }
  ```
  Stored as channel_index=0 with samples_json = ppg array. Returns `{"inserted": N}`.
- **D-12:** `biometrics.optical_between` (range query) args: `database_path, device_id, packet_k, start_ts, end_ts`. Returns array of `{ts, packet_k, version, channel_index, samples_json}`.

### Bridge Methods — FF-03
- **D-13:** `capabilities.get_feature_flags` args: `database_path, device_id`. Returns array of `{flag_index, flag_value, discovered_at}`.
- **D-14:** Add a matching `capabilities.upsert_feature_flags` method args: `database_path, device_id, flags: [{index, value}]` for Phase 115 to call when GET_FF_VALUE response is parsed. Include it now so Phase 115 only touches Swift.

### BRIDGE_METHODS and Tests
- **D-15:** Add all new method strings to `BRIDGE_METHODS` constant in `bridge/mod.rs` in alphabetical order within their group. The `bridge_methods_constant_matches_dispatcher` test must pass.
- **D-16:** Write one round-trip integration test per new bridge method in `Rust/core/tests/` using `GooseStore::open_in_memory().expect(...)` + `.migrate()`. Do NOT use `open_for_testing` (doesn't exist).

### Claude's Discretion
- Bridge implementations go in: optical methods → `bridge/capture.rs` alongside `insert_v24_batch`; capabilities methods → new `bridge/capabilities.rs` (doesn't exist yet, create it and add dispatch arm in `mod.rs`).
- Wave plan: single plan (no parallelism — sequential schema then bridge).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema Pattern
- `Rust/core/src/store/mod.rs` lines 1853–1900 — existing migration 22/23 pattern to follow exactly
- `Rust/core/src/store/mod.rs` lines 1650–1700 — `spo2_samples` table schema (column style model for `optical_channel_samples`)

### Bridge Pattern
- `Rust/core/src/bridge/metrics.rs` lines 1402–1413 — `InsertV24BatchArgs` struct (pattern for new batch args structs)
- `Rust/core/src/bridge/mod.rs` lines 65–67 — `BRIDGE_METHODS` constant (alphabetical insertion point)

### Requirements
- `.planning/REQUIREMENTS.md` — OPT-03, FF-03, BODY-01 (schema only), PIP-02 (schema only)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseStore::open_in_memory().expect(...)` + `.migrate()` — test store pattern; use in all new round-trip tests
- `bridge_ok` / `bridge_error` helpers — return JSON response wrappers already in `bridge/mod.rs`
- `request_args::<T>(request).and_then(fn).map(bridge_ok).unwrap_or_else(bridge_error)` — dispatch arm boilerplate (copy from `metrics.rs` lines 381–384)

### Established Patterns
- All existing tables use `device_id TEXT NOT NULL` (not `device_uuid`) — use `device_id` for new tables for consistency
- `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` — timestamp column convention
- `INSERT OR IGNORE` for time-series tables; `INSERT OR REPLACE` / `PRIMARY KEY` for lookup tables
- Store methods return `Vec<NamedStruct>` — map with struct field access in bridge, NOT tuple destructuring

### Integration Points
- `parse_v20v21_optical_body_for_test` (added in Phase 112) — test fixtures for optical data available
- `parse_v26_ppg_body` (added in Phase 112) — v26 parsed data to insert
- `bridge/metrics.rs` dispatch block — add optical method arms here; capabilities arms go in new `bridge/capabilities.rs`

</code_context>

<specifics>
## Specific Ideas

- Phase 113 is the "unlock" phase — once `cargo test --locked` passes here, Phases 114–122 can consume the new tables from Swift/Kotlin without touching Rust schema again.
- `capabilities.upsert_feature_flags` included proactively (D-14) so Phase 115 is purely Swift.

</specifics>

<deferred>
## Deferred Ideas

- Bridge methods for `body_composition_history` → Phase 116
- Bridge methods for `realtime_frames` → Phase 118
- Android parity (OPT-04) → Phase 117

</deferred>

---

*Phase: 113-schema-v24-optical-bridge-methods*
*Context gathered: 2026-06-22*
