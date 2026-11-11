---
phase: 27-v24-biometric-decode
plan: "02"
subsystem: store
tags: [schema-migration, sqlite, biometrics, v24, spo2, skin-temp, resp, sig-quality]
dependency_graph:
  requires: []
  provides: [schema-v16, insert_v24_biometric_batch, v24_biometric_samples_between]
  affects: [bridge.rs, plan-27-03]
tech_stack:
  added: []
  patterns: [immediate_transaction, INSERT OR IGNORE, UNIQUE(device_id, ts)]
key_files:
  created: []
  modified:
    - Rust/core/src/store.rs
decisions:
  - "Used immediate_transaction wrapper (BEGIN IMMEDIATE / COMMIT / ROLLBACK) for atomic multi-table insert"
  - "Stored contact=0 rows without filtering — gating is consumer responsibility per CONTEXT.md"
  - "V24BiometricBatch uses tuple Vecs matching gravity pattern; no separate Input struct needed"
metrics:
  duration: "~10 min"
  completed: "2026-06-08"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 27 Plan 02: Schema Migration v16 + Store Methods Summary

**One-liner:** SQLite schema v16 with 4 V24 biometric tables (spo2, skin_temp, resp, sig_quality) and atomic insert/query store methods.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Schema migration v16 | dc30550 | Rust/core/src/store.rs |
| 2 | insert_v24_biometric_batch + v24_biometric_samples_between | dc30550 | Rust/core/src/store.rs |

## What Was Built

### Schema Changes (Task 1)

- `CURRENT_SCHEMA_VERSION` bumped from 15 to 16
- Four new tables added to `migrate()` execute_batch:
  - `spo2_samples (device_id, ts, red, ir, contact, created_at)` — UNIQUE(device_id, ts)
  - `skin_temp_samples (device_id, ts, raw, contact, created_at)` — UNIQUE(device_id, ts)
  - `resp_samples (device_id, ts, raw, contact, created_at)` — UNIQUE(device_id, ts)
  - `sig_quality_samples (device_id, ts, quality, contact, created_at)` — UNIQUE(device_id, ts)
- Indexes: `idx_spo2_samples_device_ts`, `idx_skin_temp_samples_device_ts`, `idx_resp_samples_device_ts`, `idx_sig_quality_samples_device_ts`
- Migration record: `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (16)`
- `PRAGMA user_version = 16`
- Added 4 new tables to `known_tables()` list

### Store Methods + Structs (Task 2)

New structs added near `GravityRow`:
- `Spo2SampleRow { device_id, ts, red, ir, contact }`
- `SkinTempSampleRow { device_id, ts, raw, contact }`
- `RespSampleRow { device_id, ts, raw, contact }`
- `SigQualitySampleRow { device_id, ts, quality, contact }`
- `V24BiometricBatch { spo2: Vec<(f64, i64, i64, i64)>, skin_temp: Vec<(f64, i64, i64)>, resp: Vec<(f64, i64, i64)>, sig_quality: Vec<(f64, i64, i64)> }`
- `V24BiometricWindow { spo2, skin_temp, resp, sig_quality }`

New store methods:
- `insert_v24_biometric_batch(&self, device_id, batch)` — wraps all 4 table inserts in `immediate_transaction`; uses `INSERT OR IGNORE`; validates device_id
- `v24_biometric_samples_between(&self, device_id, ts_start, ts_end)` — queries all 4 tables with half-open window `ts >= ts_start AND ts < ts_end`; returns `V24BiometricWindow`

### Tests (3 passing)

```
test store::v24_biometric_tests::test_insert_v24_batch_contact_zero ... ok
test store::v24_biometric_tests::test_insert_v24_batch_idempotent ... ok
test store::v24_biometric_tests::test_insert_v24_batch_roundtrip ... ok
```

## Deviations from Plan

None — plan executed exactly as written.

Note: `cargo check` reports unrelated compilation errors in bridge.rs, sleep_staging.rs, capture_correlation.rs, and export.rs due to the new `V24History` enum variant added by Plan 27-01 running in parallel. These are out of scope for this plan (store.rs only). No errors exist in store.rs itself.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All SQL uses `params!` macro — no string interpolation. `validate_required` called on `device_id` before any DB operation (T-27-03 mitigated). UNIQUE constraint enforces deduplication (T-27-04 accepted).

## Self-Check: PASSED

- `Rust/core/src/store.rs` modified: FOUND
- Commit dc30550 exists: FOUND
- `CURRENT_SCHEMA_VERSION == 16`: FOUND (line 14)
- Four new tables in migrate(): FOUND (spo2_samples, skin_temp_samples, resp_samples, sig_quality_samples)
- `insert_v24_biometric_batch`: FOUND
- `v24_biometric_samples_between`: FOUND
- 3 tests pass: CONFIRMED (cargo test output above)
