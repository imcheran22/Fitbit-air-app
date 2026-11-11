---
phase: 27-v24-biometric-decode
plan: "03"
subsystem: bridge
tags: [rust, bridge, v24, biometric, spo2, skin-temp, resp, plausibility-gates, uncalibrated]
dependency_graph:
  requires:
    - "27-01 (DataPacketBodySummary::V24History variant)"
    - "27-02 (insert_v24_biometric_batch, v24_biometric_samples_between, V24BiometricBatch)"
  provides:
    - V24History arm in upload_get_recent_decoded_streams_bridge (bridge.rs)
    - spo2_from_raw_uncalibrated() private helper (bridge.rs)
    - skin_temp_celsius_from_raw() private helper (bridge.rs)
    - resp_rate_bpm_zero_crossing() private helper (bridge.rs)
    - biometrics.insert_v24_batch bridge method (bridge.rs)
    - biometrics.v24_between bridge method (bridge.rs)
    - biometrics.spo2_from_raw bridge method (bridge.rs)
    - 4 integration tests in v24_biometric_bridge_tests.rs
  affects:
    - Swift HealthDataStore (future — these bridge methods are now callable)
    - Phase 31 resp rate computation (resp_rate_bpm_zero_crossing helper)
tech_stack:
  added: []
  patterns:
    - Plausibility gates at bridge layer (reject before storage, emit warning string, never hard error)
    - quality_flag="uncalibrated" carried through all physical unit helpers
    - Skin contact gate (contact=0 rows stored but not pushed to upload payload)
    - RR interval timestamps accumulated cumulatively from base ts
key_files:
  created:
    - Rust/core/tests/v24_biometric_bridge_tests.rs
  modified:
    - Rust/core/src/bridge.rs
decisions:
  - "sig_quality excluded from POST /v1/ingest-decoded upload payload — server schema does not include it; stored locally via insert_v24_biometric_batch"
  - "Plausibility gates live at bridge layer (not store layer) — spo2 out of [70,100]% and skin_temp outside [25,40]°C are rejected with warnings but not hard errors"
  - "contact=0 rows ARE stored in all 4 tables — downstream consumers decide whether to filter; this matches CONTEXT.md decision"
  - "resp_rate_bpm_zero_crossing carries quality_flag='uncalibrated' and requires window_len>=10 to avoid noisy estimates"
  - "BRIDGE_METHODS constant keeps alphabetical sort: biometrics.* placed between activity.* and calibration.*"
metrics:
  duration: "~20 min"
  completed: "2026-06-08T14:45:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 27 Plan 03: Bridge V24 Wiring + Unit Helpers + Dispatch Arms Summary

**One-liner:** V24History wired into upload pipeline with plausibility-gated unit helpers and three new bridge methods (insert_v24_batch, v24_between, spo2_from_raw) callable from Swift; 4 integration tests green.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | V24History arm in upload pipeline + physical unit helpers | 4d33d72 | Rust/core/src/bridge.rs |
| 2 | Bridge dispatch arms + comprehensive tests | fbf3150 | Rust/core/src/bridge.rs, Rust/core/tests/v24_biometric_bridge_tests.rs |

## What Was Built

### Physical Unit Helpers (bridge.rs, before upload_get_recent_decoded_streams_bridge)

Three private helper functions added with quality_flag="uncalibrated" semantics:

**`spo2_from_raw_uncalibrated(red: u16, ir: u16) -> Option<f64>`**
- R = red/ir; SpO2 = 110.0 - 25.0*R
- Returns None if ir==0 or SpO2 outside [70.0, 100.0]
- Used by: insert_v24_biometric_batch_bridge (plausibility gate) and spo2_from_raw_bridge

**`skin_temp_celsius_from_raw(raw: u16) -> Option<f64>`**
- Linear model: raw=930 → 33°C, 30 ADC units per °C
- Returns None if celsius outside [25.0, 40.0]
- Used by: insert_v24_biometric_batch_bridge (plausibility gate)

**`resp_rate_bpm_zero_crossing(window: &[u16]) -> Option<f64>`**
- Detrend (subtract mean) → count sign changes → rate = (crossings/2)/len*60
- Returns None if window_len < 10 or rate outside (0.0, 60.0]
- Used by: Phase 31 respiratory rate computation (future)

### Upload Pipeline Wiring (upload_get_recent_decoded_streams_bridge)

- Changed `let rr`, `let spo2`, `let skin_temp`, `let resp` from immutable to `let mut`
- Added `DataPacketBodySummary::V24History { hr: v24_hr, rr_intervals_ms, skin_contact, spo2_red, spo2_ir, skin_temp_raw, resp_raw, .. }` match arm:
  - skin_contact==1: hr, spo2, skin_temp, resp all populated
  - skin_contact==0: no data pushed to any upload stream (sig_quality excluded entirely from payload)
  - rr_intervals_ms: timestamps accumulated cumulatively per interval

### Bridge Dispatch Methods

**`biometrics.insert_v24_batch`** (InsertV24BatchArgs → insert_v24_biometric_batch_bridge):
- Parses typed arg structs for spo2/skin_temp/resp/sig_quality Vecs
- SpO2 plausibility gate: rejects rows where spo2_from_raw_uncalibrated returns None; emits warning string
- skin_temp plausibility gate: rejects rows where skin_temp_celsius_from_raw returns None; emits warning string
- resp: no plausibility rejection (u16 range always valid; gate is no-op by type)
- sig_quality: stored as-is (no plausibility gate — dimensionless score)
- Calls store.insert_v24_biometric_batch atomically via immediate_transaction
- Returns `{"inserted": true, "warnings": [...]}`

**`biometrics.v24_between`** (V24BetweenArgs → v24_biometric_samples_between_bridge):
- Calls store.v24_biometric_samples_between
- Returns `{"spo2": [...], "skin_temp": [...], "resp": [...], "sig_quality": [...]}`

**`biometrics.spo2_from_raw`** (Spo2FromRawArgs → spo2_from_raw_bridge):
- Lightweight inline computation — no store access
- Returns `{"spo2_pct": <f64|null>, "quality_flag": "uncalibrated"}` always
- If rejected: adds `"rejected": true`

All 3 methods registered in `BRIDGE_METHODS` constant (alphabetically sorted).

### Integration Tests (v24_biometric_bridge_tests.rs)

4 tests, all green:
1. `test_v24_bridge_insert_and_query` — Insert spo2/skin_temp/resp/sig_quality row, query back, assert all 4 tables have inserted rows
2. `test_v24_plausibility_spo2_reject` — red=2000, ir=1000 → SpO2=60% (out of range) → warning emitted, row not stored
3. `test_v24_uncalibrated_flag` — spo2_from_raw response always carries quality_flag="uncalibrated" (valid and rejected)
4. `test_v24_skin_contact_gate` — contact=0 and contact=1 rows both stored; both visible via v24_between

## Test Results Summary

| Test Suite | Tests | Status |
|-----------|-------|--------|
| Lib unit tests (bridge::, store::) | 79 | All green |
| v24_biometric_bridge_tests.rs | 4 | All green |
| v24_biometric_protocol_tests.rs | 3 | All green |
| store v24_biometric_tests (unit) | 3 | All green |
| bridge_tests.rs (integration) | 95 / 96 | 95 green, 1 pre-existing failure (see Deferred Issues) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BRIDGE_METHODS sort order**
- **Found during:** Task 2 (cargo test)
- **Issue:** Added `biometrics.*` entries before `storage.check` instead of alphabetically (between `activity.*` and `calibration.*`). `bridge_methods_constant_is_sorted_and_unique` test failed.
- **Fix:** Moved the 3 new entries to correct alphabetical position (after `activity.update_session`, before `calibration.apply`).
- **Files modified:** Rust/core/src/bridge.rs
- **Commit:** fbf3150

## Deferred Issues

**bridge_runs_storage_check_against_app_database_path (pre-existing failure):**
- `storage_check.rs::required_columns()` does not include the 4 new V24 tables (spo2_samples, skin_temp_samples, resp_samples, sig_quality_samples) added by Plan 27-02.
- The `known_tables()` function already lists them (causing the assertion to fail in storage_check.rs line 924).
- This failure predates Plan 27-03; Plan 27-02 added the tables to `known_tables()` but did not update `required_columns()` in storage_check.rs.
- Deferred to Phase 27 cleanup or a dedicated storage_check plan. No action taken here (storage_check.rs is not in this plan's file scope).

## Threat Surface Scan

No new network endpoints or auth paths introduced. All SQL flows through V24BiometricBatch typed tuples then params! macro (T-27-05 mitigated). quality_flag is produced server-side in Rust and returned read-only to Swift (T-27-08 accepted). No new crate additions (T-27-SC accepted).

## Known Stubs

None. All three bridge methods are fully implemented with plausibility gates, storage, and serialization. resp_rate_bpm_zero_crossing is implemented but its consumer (Phase 31 resp rate computation) is deferred by design — the helper itself is complete.

## Self-Check

- [x] Rust/core/src/bridge.rs modified — FOUND
- [x] Rust/core/tests/v24_biometric_bridge_tests.rs created — FOUND
- [x] Commit 4d33d72 (Task 1) — FOUND
- [x] Commit fbf3150 (Task 2) — FOUND
- [x] `grep -c "V24History" bridge.rs >= 2` — 2 FOUND
- [x] `grep -c "biometrics.insert_v24_batch" bridge.rs >= 1` — 3 FOUND (list, dispatch, function)
- [x] `grep -c "quality_flag.*uncalibrated" bridge.rs >= 1` — 3 FOUND
- [x] 4 new v24 bridge tests green — CONFIRMED
- [x] 79 lib tests green — CONFIRMED
- [x] bridge_methods_constant_matches_dispatcher — PASSED
- [x] bridge_methods_constant_is_sorted_and_unique — PASSED

## Self-Check: PASSED
