---
phase: 29-upload-sync-infrastructure
plan: "01"
subsystem: rust-core/store
tags: [schema-migration, sqlite, sync, upload]
dependency_graph:
  requires: []
  provides: [schema-v18, hr_samples, rr_intervals, events, battery, upload_cursors, synced-column]
  affects: [storage_check, bridge]
tech_stack:
  added: []
  patterns: [alter-table-add-column, ensure-columns-idempotent, insert-or-replace-cursor]
key_files:
  created: []
  modified:
    - Rust/core/src/store.rs
    - Rust/core/src/storage_check.rs
decisions:
  - "Upload cursors use INSERT OR REPLACE with (namespace, stream) PRIMARY KEY to allow two-namespace design (highwater + read pointer)"
  - "ensure_synced_columns() follows the existing ensure_*_columns() pattern — checks PRAGMA table_info before ALTER TABLE to be idempotent on re-migration"
  - "New stream tables (hr_samples, rr_intervals, events, battery) define synced in the CREATE TABLE DDL; existing tables (spo2_samples, skin_temp_samples, resp_samples, gravity) receive it via ALTER TABLE in the post-migration helper"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 29 Plan 01: Schema Migration v18 (Upload Sync Infrastructure) Summary

Schema v18 adds the per-row `synced` flag infrastructure and cursor bookkeeping table required by the upload sync pipeline. Four new dedicated stream tables ship with the column built in; four existing tables receive it via idempotent `ALTER TABLE`. A two-namespace `upload_cursors` table completes the schema foundation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema migration v18 — new stream tables, ALTER TABLE, upload_cursors | dc4b674 | Rust/core/src/store.rs |
| 2 | Update storage_check.rs — register new tables and synced columns | dc4b674 | Rust/core/src/storage_check.rs |

## What Was Built

### store.rs changes
- `CURRENT_SCHEMA_VERSION` bumped from 17 to 18
- Four new stream tables created with `synced INTEGER NOT NULL DEFAULT 0` built in:
  - `hr_samples` (device_id, ts, bpm, synced, created_at)
  - `rr_intervals` (device_id, ts, interval_ms, synced, created_at)
  - `events` (device_id, ts, event_id, event_name, synced, created_at)
  - `battery` (device_id, ts, level_pct, synced, created_at)
- `upload_cursors` table with `PRIMARY KEY (namespace, stream)` for two-pointer cursor design
- `ensure_synced_columns()` post-migration helper: idempotently ALTERs `spo2_samples`, `skin_temp_samples`, `resp_samples`, `gravity` to add `synced INTEGER NOT NULL DEFAULT 0`
- `upsert_upload_cursor(namespace, stream, value)` and `get_upload_cursor(namespace, stream)` store methods
- `HrSampleRow`, `RrIntervalRow`, `EventRow`, `BatteryRow` structs (derive Serialize, Deserialize, Debug)
- `known_tables()` updated: 5 new entries appended
- 10 new `sync_schema_tests` unit tests; schema version assertion in `exercise_session_tests` updated to v18
- Migration record `VALUES(18)` and `PRAGMA user_version = 18` added to migration batch

### storage_check.rs changes
- `required_columns()` updated:
  - 5 new entries: `battery`, `events`, `hr_samples`, `rr_intervals`, `upload_cursors`
  - 4 updated entries now include `"synced"`: `gravity`, `resp_samples`, `skin_temp_samples`, `spo2_samples`
  - All entries kept in alphabetical order consistent with BTreeMap insertion

## Verification Results

| Check | Result |
|-------|--------|
| `cargo test --lib sync_schema_tests` | 10/10 passed |
| `cargo test --lib` (full suite) | 102/102 passed |
| `cargo check -p goose-core` | Clean (1 pre-existing warning unrelated to this plan) |
| `cargo test --test bridge_tests bridge_runs_storage_check` | Passed |
| PRAGMA user_version | 18 |
| `known_tables()` length increase | +5 (from 32 to 37) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated schema version assertion in exercise_session_tests**
- **Found during:** Task 1 GREEN phase (running full test suite)
- **Issue:** `test_exercise_sessions_schema_version` asserted `user_version == 17`; the v18 migration legitimately advances it to 18
- **Fix:** Updated assertion message and expected value from 17 to 18
- **Files modified:** Rust/core/src/store.rs
- **Commit:** dc4b674

## Known Stubs

None — no placeholder data, hardcoded empties, or TODO markers introduced.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes. All new SQL uses parameterised statements. `ensure_synced_columns()` checks PRAGMA table_info before executing ALTER TABLE (T-29-01 mitigation applied). `upload_cursors` enforces PRIMARY KEY at DB level and uses INSERT OR REPLACE (T-29-02 mitigation applied).

## Self-Check: PASSED

- `Rust/core/src/store.rs` — modified, contains `CURRENT_SCHEMA_VERSION: i64 = 18`
- `Rust/core/src/storage_check.rs` — modified, contains `upload_cursors` entry
- Commit dc4b674 — verified present in git log
- All 102 lib tests green; bridge_runs_storage_check integration test green
