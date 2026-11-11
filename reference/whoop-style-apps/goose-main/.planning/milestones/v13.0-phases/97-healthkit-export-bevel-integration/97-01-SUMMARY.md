# Plan 97-01 Summary — Rust HealthKit Bridge Methods (HK-01, HK-03, HK-04)

**Status:** Complete
**Commits:** `55f3ac7`

## What Was Built

**3 new Rust bridge methods:**

- `store.hk_hr_samples_between(database_path, device_id, start_unix_s, end_unix_s)` → `{rows:[{ts:f64, bpm:i64}]}`
- `store.hk_spo2_samples_between(database_path, device_id, start_unix_s, end_unix_s)` → `{rows:[{ts:f64, spo2_percent:f64}]}` — inline ratio-of-ratios conversion (110−25·(red/ir)), filtered to 70–100%
- `store.hk_sleep_sessions_between(database_path, start_unix_ms, end_unix_ms)` → `{rows:[{sleep_id, start_time_unix_ms, end_time_unix_ms, source}]}` — reuses existing `external_sleep_sessions_between` from store/sleep.rs

**Note:** `external_sleep_sessions_between` already existed in `store/sleep.rs` — used directly without duplication.

## Files Changed

- `Rust/core/src/store/metrics.rs` — `hr_samples_between()` + `spo2_samples_between()` (new store methods)
- `Rust/core/src/bridge/debug.rs` — 3 Args structs + 3 bridge functions + 3 dispatcher match arms
- `Rust/core/src/bridge/mod.rs` — 3 entries in BRIDGE_METHODS (alphabetically sorted)

## Verification

- `cargo check --lib` passes clean
- BRIDGE_METHODS + dispatcher in sync (bridge_methods_constant_matches_dispatcher test pattern)
- HRV path not needed here — uses existing `metrics.daily_recovery_metrics` bridge
