# Phase 35: Schema Comparison — Goose SQLite vs my-whoop TimescaleDB

**Reviewed:** 2026-06-08
**Scope:** Table-level comparison of Goose SQLite schema (store.rs, CURRENT_SCHEMA_VERSION=19)
vs my-whoop TimescaleDB schema (server/db/init.sql).

---

## Overview

Goose uses an embedded SQLite database managed via rusqlite. my-whoop uses PostgreSQL +
TimescaleDB with hypertables for time-series data. The schemas have diverged significantly
because Goose is a superset in algorithmic metadata (algorithm_definitions, algorithm_runs,
calibration infrastructure) and my-whoop is a superset in raw biometric detail (devices table,
raw_batches, sig_quality).

---

## 1. Core Biometric Tables

### 1.1 Present in both

| Table | Goose SQLite | my-whoop TimescaleDB | Structural notes |
|-------|-------------|---------------------|-----------------|
| `hr_samples` | `device_id, ts (INTEGER unix_ms), bpm (INTEGER)` | `device_id, ts (TIMESTAMPTZ), bpm (SMALLINT)` | my-whoop: TIMESTAMPTZ + hypertable. Goose: unix_ms INTEGER. Type: SMALLINT vs INTEGER (both OK for bpm). |
| `rr_intervals` | `device_id, ts, rr_ms (INTEGER)` | `device_id, ts, rr_ms (INTEGER)` | my-whoop: triple PK includes rr_ms (allows duplicate ts). Goose: simpler PK. |
| `gravity` / `gravity_samples` | `device_id, ts, x, y, z (REAL)` | `gravity_samples: device_id, ts, x, y, z (REAL)` | Goose has both `gravity` and `gravity2_samples`. my-whoop has `gravity_samples`. |
| `spo2_samples` | `device_id, ts, red, ir (INTEGER)` | `device_id, ts, red, ir (INTEGER)` | CONFIRMED identical column structure. |
| `skin_temp_samples` | `device_id, ts, raw (INTEGER)` | `device_id, ts, raw (INTEGER)` | CONFIRMED identical. |
| `resp_samples` | `device_id, ts, raw (INTEGER)` | `device_id, ts, raw (INTEGER)` | CONFIRMED identical. |
| `battery` | `device_id, ts, soc, mv, charging` | `device_id, ts, soc, mv, charging` | CONFIRMED identical. |
| `events` | `device_id, ts, kind, payload (TEXT/JSON)` | `device_id, ts, kind, payload (JSONB)` | my-whoop: JSONB for indexable JSON. Goose: TEXT. |
| `exercise_sessions` | `session_id, start_time_unix_ms, end_time_unix_ms, avg_hr, peak_hr, strain, kind ...` | Implicit via `activity_sessions` | Different table structures (see §3). |

### 1.2 In my-whoop ONLY (not in Goose)

| Table | Purpose | Notes |
|-------|---------|-------|
| `devices` | Device registry (device_id, mac, name, first_seen, last_seen) | Goose has no standalone devices table; device_id is embedded in all sample tables. |
| `raw_batches` | Index of raw binary batch files (batch_id, device_id, sha256, file_path, packet_count) | Goose uses `raw_evidence` + `decoded_frames` instead; different granularity. |
| `sig_quality_samples` | Signal quality per epoch | Goose has `sig_quality_samples` (present in store.rs line 1596) — actually PRESENT in Goose too. |

### 1.3 In Goose ONLY (not in my-whoop)

| Table | Purpose | v6.0 Action |
|-------|---------|-------------|
| `algorithm_definitions` | Registry of algorithm metadata (id, version, schema, params) | BACKLOG — my-whoop has no equivalent; Goose has richer algorithm governance |
| `algorithm_runs` | Per-run algorithm output and provenance | BACKLOG |
| `algorithm_preferences` | Per-scope algorithm selection | BACKLOG |
| `calibration_labels` | User-provided label data for model training | BACKLOG |
| `calibration_runs` | Calibration run results | BACKLOG |
| `metric_values` | Generic metric storage | IN_ROADMAP (generalization target) |
| `metric_components` | Component breakdown per metric | BACKLOG |
| `metric_provenance` | Source tracking for computed metrics | BACKLOG |
| `external_sleep_sessions` | Imported sleep data (HealthKit, Health Connect) | IN_ROADMAP |
| `external_sleep_stages` | Stage segments from external sources | IN_ROADMAP |
| `sleep_correction_labels` | Human-correction labels for sleep staging | BACKLOG |
| `overnight_sync_sessions` | Overnight BLE sync session tracking | Goose-specific |
| `ble_raw_notifications` | Raw BLE notification log | Goose-specific |
| `historical_range_polls` | BLE historical data poll tracking | Goose-specific |
| `capture_sessions` | Capture session metadata | Goose-specific |
| `debug_sessions / commands / events` | Debug infrastructure | Goose-specific |
| `upload_cursors` | Upload checkpoint state | Goose-specific |
| `step_counter_samples` | Step counter data | BACKLOG vs my-whoop |
| `activity_intervals` | Lap/pause/work/rest intervals within a session | BACKLOG |
| `activity_labels` | Label taxonomy for activities | BACKLOG |
| `gravity2_samples` | Second-generation gravity table | Goose-specific |
| `command_validation_records` | Validated BLE command records | Goose-specific |

---

## 2. Daily/Recovery Metric Tables

### 2.1 daily_recovery_metrics (Goose) — no direct equivalent in my-whoop

Goose has a unified `daily_recovery_metrics` table that stores HRV, resting HR, respiratory rate,
oxygen saturation, and skin temperature per date. my-whoop computes these on-demand from the raw
hypertables and does not persist a per-day recovery snapshot. The Goose table is the primary input
for the EWMA baseline engine.

my-whoop equivalent: computed by `recovery.py` and `baselines.py` on each request; no persisted
snapshot table.

**Gap:** No migration path for historical Goose daily_recovery_metrics → my-whoop (would require
a new table or backfill from raw streams).

### 2.2 daily_activity_metrics and hourly_activity_metrics (Goose)

Goose stores computed calorie and step estimates per day and per hour with source_kind
(device_counter, local_estimate, unavailable). my-whoop has no equivalent persisted table —
calories are computed on-demand from raw HR+motion.

**Gap:** If syncing Goose to my-whoop, a `daily_activity` table would need to be created
in my-whoop. Currently only raw streams are stored server-side.

---

## 3. Activity / Exercise Sessions

| Aspect | Goose SQLite | my-whoop TimescaleDB |
|--------|-------------|---------------------|
| Table | `activity_sessions` + `exercise_sessions` | `activity_sessions` (exercise.py writes to this) |
| Extended fields | `zone_time_pct`, `avg_hrr_pct`, `hrmax`, `hrmax_source`, `calories_kcal` | `duration_s`, `zone_time_pct`, `avg_hrr_pct`, `hrmax`, `hrmax_source`, `calories_kcal`, `calories_kj` |
| Schema status | Both have documented "integration task must migrate" notes | Python exercise.py notes these as not yet persisted |

**Note:** Both schemas are in a transitional state for exercise session extended fields.
The Goose `exercise_sessions` table (store.rs:1607) likely lacks `zone_time_pct`, `avg_hrr_pct`,
etc. as columns since they are marked as "not yet in the DB schema." Both projects have the same
technical debt here.

---

## 4. Timestamp Format Differences

| Aspect | Goose SQLite | my-whoop TimescaleDB |
|--------|-------------|---------------------|
| Timestamp type | INTEGER (unix milliseconds) for most tables; TEXT (RFC3339) for some | TIMESTAMPTZ (PostgreSQL native) |
| Precision | milliseconds | microseconds (TIMESTAMPTZ) |
| Timezone | All timestamps UTC by convention; no TZ stored in ts column | TIMESTAMPTZ stores offset; effective UTC |

**Gap:** If data is ever synced between Goose SQLite and my-whoop PostgreSQL, the unix_ms →
TIMESTAMPTZ conversion must be handled explicitly. No current migration tooling exists.

---

## 5. Column Format Differences

| Table/Column | Goose SQLite | my-whoop TimescaleDB | Issue |
|--------------|-------------|---------------------|-------|
| `rr_intervals.rr_ms` | INTEGER | INTEGER | Match |
| `hr_samples.bpm` | INTEGER | SMALLINT | Goose uses wider type; compatible |
| `events.payload` | TEXT (JSON string) | JSONB | my-whoop has indexed JSON; Goose requires JSON parsing |
| `gravity.ts` | INTEGER (unix_ms) | TIMESTAMPTZ | Incompatible format for direct joins |
| `spo2_samples` columns | `red, ir` | `red, ir` | Match |
| `skin_temp_samples.raw` | INTEGER | INTEGER | Match |

---

## 6. Missing Tables — v6.0 Backlog Candidates

### IN_ROADMAP (planned for near-term)

| Missing in Goose | Reason |
|-----------------|--------|
| `devices` device registry | Needed for multi-device support; currently device_id embedded inline |
| External sleep session import pipeline | `external_sleep_sessions` exists but sync to my-whoop not wired |

### BACKLOG (v6.0 candidates)

| Missing in my-whoop | Required for Goose→my-whoop sync |
|--------------------|----------------------------------|
| `daily_activity_metrics` | To persist Goose local calorie estimates server-side |
| `daily_recovery_metrics` | To persist daily HRV/RHR snapshots server-side |
| `algorithm_runs` | To track which algorithm produced which metric |
| `step_counter_samples` | Step data from device counter |

### NOT NEEDED (Goose-specific, no my-whoop equivalent)

- BLE protocol tables (`raw_evidence`, `decoded_frames`, `capture_sessions`, `ble_raw_notifications`, etc.)
- Debug infrastructure (`debug_sessions`, `debug_commands`, `debug_events`)
- Overnight sync tables (`overnight_sync_sessions`, `historical_range_polls`)

---

## 7. Summary Assessment

The two schemas serve different deployment targets and are not expected to be identical.
Key actionable gaps:

1. **No timestamp format migration tooling**: unix_ms → TIMESTAMPTZ conversion needed if
   syncing Goose data to my-whoop server.

2. **Exercise session extended fields are un-migrated in both projects**: Both have open
   technical debt for `zone_time_pct`, `hrmax`, `calories_kcal` columns.

3. **my-whoop lacks persisted daily metric snapshot tables**: If the server is to store
   Goose-computed metrics (calories, recovery), new tables are needed.

4. **Goose lacks a device registry table**: If multi-device support is added, a `devices`
   table equivalent to my-whoop's is required.

5. **`events.payload` type mismatch**: Goose uses TEXT; my-whoop uses JSONB. Cross-system
   queries on event payloads require explicit parsing.
