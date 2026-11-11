---
phase: "31"
plan: "02"
subsystem: protocol-storage
tags: [v24, gravity2, schema-migration, bridge, protocol-correction]
completed: "2026-06-08"
duration_minutes: 15
tasks_completed: 4
files_changed: 5
key-decisions:
  - "gravity2 triplet parsed from data[49..60] (offsets 49, 53, 57 for x, y, z as f32 LE) when data.len() >= 60; absent in short packets"
  - "New table gravity2_samples uses same schema as gravity but no synced column (not a sync stream yet)"
  - "Schema v18 → v19 via INSERT OR IGNORE migration pattern and PRAGMA user_version = 19"
  - "Bridge reuses InsertGravityRowsArgs and GravityRowsBetweenArgs types for gravity2 methods (same shape)"
---

# Phase 31 Plan 02: PROTO-02 V24 gravity2 Triplet Summary

Added second gravity triplet (gravity2_x/y/z) to V24 protocol parsing, schema, and bridge layer.

## What Was Built

- `DataPacketBodySummary::V24History` extended with `gravity2_x/y/z: Option<f32>` fields
- `parse_v24_body_summary` parses bytes 49/53/57 as f32 LE when `data.len() >= 60`; None otherwise
- `gravity2_samples` table created in schema migration v19 with index on `(device_id, ts)`
- `CURRENT_SCHEMA_VERSION` bumped 18 → 19
- `insert_gravity2_batch` and `gravity2_samples_between` store methods (mirror of gravity equivalents)
- `resp_samples_between` standalone store method (added here; used by PROTO-03 bridge)
- Bridge dispatch: `store.insert_gravity2_batch` and `store.gravity2_samples_between` arms added
- `storage_check.rs` column registry updated with `gravity2_samples` entry
- Integration test pattern matches updated to include `gravity2_x/y/z`

## Key Files

- **Modified:** `Rust/core/src/protocol.rs`
- **Modified:** `Rust/core/src/store.rs`
- **Modified:** `Rust/core/src/bridge.rs`
- **Modified:** `Rust/core/src/storage_check.rs`
- **Modified:** `Rust/core/tests/v24_biometric_protocol_tests.rs`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1-4 | ccc05b1 | fix(31): PROTO-01 Cole-Kripke scale=0.001; PROTO-02 gravity2 table; PROTO-03 resp graceful degrade |

## Deviations from Plan

- **[Rule 2 - Missing functionality]** Added `resp_samples_between` standalone store method in this plan (needed by PROTO-03 bridge); included here for cohesion.

## Self-Check: PASSED

- `gravity2_samples` table created in schema SQL confirmed in store.rs
- `CURRENT_SCHEMA_VERSION = 19` confirmed
- All 128 tests pass including updated v24 protocol fixture tests
