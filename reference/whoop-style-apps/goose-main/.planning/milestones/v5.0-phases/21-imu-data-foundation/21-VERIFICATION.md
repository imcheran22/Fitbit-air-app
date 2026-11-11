---
phase: 21-imu-data-foundation
verified: 2026-06-06T22:45:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 21: IMU Data Foundation — Verification Report

**Phase Goal:** Full IMU acceleration samples flow from WHOOP BLE frames through the Rust parser into the SQLite `gravity` table — unblocking sleep staging and any future motion-based analysis.
**Verified:** 2026-06-06T22:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `I16SeriesSummary` carries a `full_samples: Option<Vec<i16>>` field | VERIFIED | `protocol.rs:178`: `pub full_samples: Option<Vec<i16>>` |
| 2  | `summarize_i16_series` populates `full_samples` with all `parsed_count` values (not capped at 8) | VERIFIED | `protocol.rs:683–706`: `let mut full = Vec::new(); full.push(value)` at both construction sites |
| 3  | The `preview` field remains capped at 8 values and unchanged in behaviour | VERIFIED | `protocol.rs:690–692`: `if preview.len() < 8 { preview.push(value); }` unchanged |
| 4  | All existing K10/K21/R17 protocol tests pass | VERIFIED | `cargo test --test protocol_tests`: 16/16 passed |
| 5  | The `gravity` table exists at schema user_version 15 with columns `(device_id, ts, x, y, z)` and index on `(device_id, ts)` | VERIFIED | `store.rs:1418–1427`: CREATE TABLE + CREATE INDEX; `store.rs:1444`: `PRAGMA user_version = 15` |
| 6  | `GooseStore::insert_gravity_rows` inserts a batch of gravity rows | VERIFIED | `store.rs:6048–6066`: validates device_id, iterates tuples, returns inserted count; empty slice returns `Ok(0)` |
| 7  | `GooseStore::gravity_rows_between` returns rows for a device within `[ts_start, ts_end)` window ordered by ts | VERIFIED | `store.rs:6068–6094`: half-open `ts >= ?2 AND ts < ?3 ORDER BY ts` query |
| 8  | K10 frames populate the gravity Vec with LSB-to-g converted rows via `IMU_LSB_PER_G` | VERIFIED | `bridge.rs:3127–3198`: `let mut gravity` populated from `accelerometer_x/y/z` full_samples divided by `IMU_LSB_PER_G` |
| 9  | `IMU_LSB_PER_G` (3900.0) is a named constant driving the LSB→g conversion | VERIFIED | `bridge.rs:3081`: `const IMU_LSB_PER_G: f64 = 3900.0` |
| 10 | `store.insert_gravity_rows` and `store.gravity_rows_between` are registered in `BRIDGE_METHODS` and dispatched | VERIFIED | `bridge.rs:295–296`: both in BRIDGE_METHODS; `bridge.rs:2635–2641`: dispatch arms present; handler fns at `bridge.rs:3309` and `3317` |
| 11 | TOGGLE_IMU_MODE (command 106) already-in-production status is documented in code (IMU-04) | VERIFIED | `bridge.rs:3083–3087`: doc comment confirming command is sent by Swift `startPhysiologyCapture / stopPhysiologyCapture`; verified live in `GooseBLEClient.swift:533,550` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Rust/core/src/protocol.rs` | `I16SeriesSummary.full_samples` field + population in `summarize_i16_series` | VERIFIED | Field at line 178; populated at lines 666 and 706 |
| `Rust/core/tests/protocol_tests.rs` | Test asserting full_samples preserves all 100 K10 samples | VERIFIED | Lines 363–366: length 100 assertion, first 3 values, preview capped at 8; truncation length invariant at line 476 |
| `Rust/core/src/store.rs` | Schema v15 gravity DDL + `insert_gravity_rows` + `gravity_rows_between` | VERIFIED | Table at lines 1418–1425, index at 1427, migration at 1443–1444, methods at 6048–6094; `GravityRow` struct at line 617–624 |
| `Rust/core/tests/store_tests.rs` | Tests for table creation, insert, and time-range query | VERIFIED | 3 gravity tests: insert+order, half-open window + device isolation, empty-slice no-op |
| `Rust/core/src/bridge.rs` | K10 gravity extraction + `IMU_LSB_PER_G` constant + two new bridge methods + IMU-04 doc comment | VERIFIED | All 4 elements confirmed at respective line ranges |
| `Rust/core/tests/bridge_tests.rs` | Test: known K10 payload yields LSB-to-g converted gravity rows; insert+query roundtrip | VERIFIED | 3 tests: `bridge_k10_gravity_extraction_lsb_to_g_conversion`, `bridge_k10_gravity_row_count_and_base_ts`, `bridge_gravity_insert_query_roundtrip` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `summarize_i16_series` | `I16SeriesSummary.full_samples` | field assignment of the full parsed `Vec<i16>` | VERIFIED | `let mut full = Vec::new()` built in the parse loop; `full_samples: Some(full)` at both construction sites |
| `GooseStore::initialize` | `gravity` table + `idx_gravity_device_ts` | migration v15 DDL in `execute_batch` | VERIFIED | `VALUES (15)` at line 1443; `PRAGMA user_version = 15` at line 1444; DDL unconditionally in the batch (IF NOT EXISTS guard) |
| `GooseStore::gravity_rows_between` | gravity table | `SELECT ... WHERE device_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts` | VERIFIED | `store.rs:6081` exact query pattern |
| K10 upload arm | gravity Vec | `full_samples` axes / `IMU_LSB_PER_G` per sample | VERIFIED | `bridge.rs:3180–3198`: axis lookup by name, `xs[i] as f64 / IMU_LSB_PER_G` |
| `store.insert_gravity_rows` bridge method | `GooseStore::insert_gravity_rows` | bridge dispatch arm + BRIDGE_METHODS registration | VERIFIED | `bridge.rs:295`, `2639`, `3309` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `bridge.rs` upload handler | `gravity: Vec<serde_json::Value>` | K10 `RawMotionK10` arm reads `full_samples` from `axes`, converts LSB→g | Yes — real i16 values from parsed BLE frames | FLOWING |
| `store.rs:insert_gravity_rows` | `rows: &[(f64, f64, f64, f64)]` | Bridge maps `GravityRowArg` tuples to store call | Yes — actual INSERT statements via `rusqlite` `execute` | FLOWING |
| `store.rs:gravity_rows_between` | `Vec<GravityRow>` | `query_map` over `SELECT ... FROM gravity` | Yes — reads from persisted SQLite rows | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| K10 gravity extraction LSB-to-g correctness | `cargo test --test bridge_tests bridge_k10_gravity_extraction_lsb_to_g_conversion` | ok | PASS |
| K10 gravity row count = min of axis lengths | `cargo test --test bridge_tests bridge_k10_gravity_row_count_and_base_ts` | ok | PASS |
| Insert/query roundtrip via bridge | `cargo test --test bridge_tests bridge_gravity_insert_query_roundtrip` | ok | PASS |
| Gravity store tests (insert, half-open window, empty slice) | `cargo test --test store_tests gravity` | 3 passed | PASS |
| Protocol full_samples preservation (100 samples, truncation invariant) | `cargo test --test protocol_tests` | 16 passed | PASS |
| Full test suite — bridge_tests | `cargo test --test bridge_tests` | 96 passed, 0 failed | PASS |
| Full test suite — store_tests | `cargo test --test store_tests` | 32 passed, 0 failed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| IMU-01 | 21-01 | `I16SeriesSummary.full_samples: Option<Vec<i16>>` — additive, non-breaking; `preview` unchanged | SATISFIED | `protocol.rs:178`; `summarize_i16_series` at both construction sites; 16 protocol tests green |
| IMU-02 | 21-02 | `gravity` table at schema v15; `insert_gravity_rows` and `gravity_rows_between` bridge methods | SATISFIED | `store.rs` DDL at lines 1418–1427; methods at 6048–6094; 3 store tests green |
| IMU-03 | 21-03 | K10 gravity extraction in `bridge.rs` replaces `Vec::new()` placeholder; LSB→g via `IMU_LSB_PER_G` | SATISFIED | `bridge.rs:3127` `let mut gravity` populated from accel axes; 3 bridge tests green |
| IMU-04 | 21-03 | TOGGLE_IMU_MODE already in production; documented in code — no Rust code change needed | SATISFIED (per 21-CONTEXT.md scope resolution) | `bridge.rs:3083–3087` doc comment; `GooseBLEClient.swift:533,550` confirm live in `startPhysiologyCapture/stopPhysiologyCapture` |

**Note on IMU-04:** The REQUIREMENTS.md wording ("feature-flagged off by default; type-51 packet parsing implemented") was scoped down by 21-CONTEXT.md line 22: "The 'feature flag' requirement is satisfied by noting this in code (no action needed)." The 21-CONTEXT.md is the authoritative planning artefact for this phase. The TOGGLE_IMU_MODE command is confirmed active in production Swift code and the doc comment in bridge.rs establishes this. No behavioural regression introduced.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | — | — | — | — |

No TBD/FIXME/XXX markers found in the modified files. No empty-Vec placeholders remaining — `let gravity: Vec<serde_json::Value> = Vec::new()` replaced with `let mut gravity` populated from real data. K21 is an explicit documented deferral (axis-to-physical mapping unconfirmed), not an accidental stub.

### Human Verification Required

(None — all must-haves are mechanically verifiable and confirmed.)

---

_Verified: 2026-06-06T22:45:00Z_
_Verifier: Claude (gsd-verifier)_
