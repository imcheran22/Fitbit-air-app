---
phase: 21-imu-data-foundation
plan: "02"
subsystem: store
tags: [rust, sqlite, imu, gravity, schema-migration]
dependency_graph:
  requires: []
  provides: [gravity-table-v15, insert_gravity_rows, gravity_rows_between]
  affects: [Rust/core/src/store.rs, Rust/core/src/storage_check.rs, Rust/core/tests/store_tests.rs]
tech_stack:
  added: []
  patterns: [IF NOT EXISTS DDL migration, validate_required, half-open window query, query_map collect]
key_files:
  created: []
  modified:
    - Rust/core/src/store.rs
    - Rust/core/src/storage_check.rs
    - Rust/core/tests/store_tests.rs
decisions:
  - "GravityRow derives PartialEq but not Eq because f64 does not implement Eq"
  - "storage_check.rs columns map updated alongside known_tables to keep storage_check test passing"
  - "gravity_rows_between uses half-open [ts_start, ts_end) window matching existing _between convention"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-06"
  tasks_completed: 2
  files_modified: 3
---

# Phase 21 Plan 02: Gravity Table Schema + Store Methods Summary

Gravity SQLite table added at schema v15 with `insert_gravity_rows` batch insert and `gravity_rows_between` half-open time-range query on `GooseStore`, covered by three tests.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add gravity table schema migration v15 | 21fa249 | Rust/core/src/store.rs |
| 2 | Implement insert_gravity_rows + gravity_rows_between with tests | 148161b | Rust/core/src/store.rs, Rust/core/src/storage_check.rs, Rust/core/tests/store_tests.rs |

## What Was Built

- `gravity` table: `device_id TEXT, ts REAL, x REAL, y REAL, z REAL, created_at TEXT` with `idx_gravity_device_ts ON gravity(device_id, ts)` composite index
- Schema migration: `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (15)` + `PRAGMA user_version = 15`
- `CURRENT_SCHEMA_VERSION` constant bumped from 14 to 15
- `GravityRow` struct: `{ device_id: String, ts: f64, x: f64, y: f64, z: f64 }` with `#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]`
- `GooseStore::insert_gravity_rows(device_id: &str, rows: &[(f64, f64, f64, f64)]) -> GooseResult<usize>`: validates non-empty device_id, iterates tuples `(ts, x, y, z)`, empty slice returns Ok(0)
- `GooseStore::gravity_rows_between(device_id: &str, ts_start: f64, ts_end: f64) -> GooseResult<Vec<GravityRow>>`: half-open `[ts_start, ts_end)` window, ordered by ts
- Three tests in `Rust/core/tests/store_tests.rs`: insert+order, half-open window+device isolation, empty-slice no-op

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added gravity to storage_check.rs columns map**
- **Found during:** Task 2 verification (`cargo test -p goose-core` full suite)
- **Issue:** Adding `gravity` to `known_tables()` in store.rs caused `bridge_runs_storage_check_against_app_database_path` to fail — the storage_check iteration `assert!(columns.contains_key(table))` fails for any table not registered in `storage_check.rs`
- **Fix:** Added `columns.insert("gravity", vec!["device_id", "ts", "x", "y", "z", "created_at"])` to `storage_check.rs`
- **Files modified:** `Rust/core/src/storage_check.rs`
- **Commit:** 148161b

## Verification

- `cargo build -p goose-core`: green
- `cargo test -p goose-core gravity`: 3 passed
- `cargo test -p goose-core`: full suite green (all tests pass including bridge_tests)

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

- `Rust/core/src/store.rs` exists and contains `CREATE TABLE IF NOT EXISTS gravity`, `idx_gravity_device_ts`, `VALUES (15)`, `PRAGMA user_version = 15`, `pub fn insert_gravity_rows`, `pub fn gravity_rows_between`, `FROM gravity`
- `Rust/core/src/storage_check.rs` exists and contains `gravity` column registration
- `Rust/core/tests/store_tests.rs` exists and contains 11 occurrences of "gravity" (table/insert/query coverage)
- Commit 21fa249: feat(21-02): add gravity table schema migration v15 — FOUND
- Commit 148161b: feat(21-02): implement insert_gravity_rows and gravity_rows_between with tests — FOUND
