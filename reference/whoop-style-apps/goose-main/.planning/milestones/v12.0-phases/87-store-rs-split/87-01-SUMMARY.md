---
phase: 87
plan: "01"
subsystem: rust-core
tags: [bridge, store, immediate_transaction, mutex, rusqlite]
key-files:
  modified:
    - Rust/core/src/bridge/sleep.rs
    - Rust/core/src/store/mod.rs
decisions:
  - "Inlined SQL into two private helper functions in bridge/sleep.rs rather than calling GooseStore methods inside immediate_transaction, avoiding mutex re-entrancy"
  - "Fixed 7 self.conn.* call sites in store/mod.rs that called through Arc<Mutex<Connection>> after the lock guard was already held"
metrics:
  completed: "2026-06-15"
---

# Phase 87 Plan 01: immediate_transaction fix — bridge/sleep.rs + store/mod.rs

One-liner: Fixed mutex re-entrancy in `immediate_transaction` by inlining SQL helpers, and corrected 7 `self.conn.*` call sites that bypassed the lock guard.

## What was done

### Problem
`bridge/sleep.rs::external_sleep_history_import_bridge` called `store.immediate_transaction(|store| { ... store.insert_external_sleep_session(...) ... })`. The closure parameter was named `store` but is typed `&Connection` (per the updated `immediate_transaction` signature: `FnOnce(&Connection) -> GooseResult<T>`). Calling `GooseStore` methods inside the closure would re-acquire `self.conn.lock()` while it was already held — causing a deadlock or a type error since `&Connection` has no such methods.

Separately, 7 locations in `store/mod.rs` called `self.conn.query_row/prepare/prepare_cached(...)` after already locking: `let conn = self.conn.lock()...`, then using `self.conn` instead of `conn`. These produced `E0599: no method named X found for Arc<Mutex<Connection>>`.

### Fix — bridge/sleep.rs
- Added two private functions:
  - `insert_external_sleep_session_conn(&Connection, ExternalSleepSessionInput) -> GooseResult<bool>` — mirrors `GooseStore::insert_external_sleep_session` but operates on the already-locked `&Connection`; does idempotency check via inline `SELECT`, then `INSERT`
  - `insert_external_sleep_stage_conn(&Connection, ExternalSleepStageInput) -> GooseResult<bool>` — mirrors `GooseStore::insert_external_sleep_stage`; validates parent session exists via inline `SELECT`, does idempotency check, then `INSERT`
- Updated `immediate_transaction` closure to call these helpers instead of the `GooseStore` methods
- Added `use rusqlite::{Connection, OptionalExtension, params};` import

### Fix — store/mod.rs
Replaced `self.conn.X(...)` with `conn.X(...)` at 7 call sites:
- `schema_version` — `query_row("PRAGMA user_version")`
- `insert_raw_evidence` (approx line 2335) — `prepare_cached("SELECT sha256...")`
- `upsert_daily_recovery_metrics` (approx line 4108) — `query_row` for existing hrv/rhr check
- `upsert_daily_recovery_metrics` (approx line 4146) — `query_row` for NULL-row id
- `insert_debug_event` (approx line 6570) — `query_row` for last sequence
- `foreign_keys_enabled` — `query_row("PRAGMA foreign_keys")`
- `index_columns_unchecked` — `prepare("PRAGMA index_info(...)")`

## Build result

`cargo build --manifest-path Rust/core/Cargo.toml --lib` — **zero errors, zero unused-import warnings**.

## Files

| File | Change |
|------|--------|
| `Rust/core/src/bridge/sleep.rs` | Added `insert_external_sleep_session_conn`, `insert_external_sleep_stage_conn`; updated closure; added rusqlite imports |
| `Rust/core/src/store/mod.rs` | Fixed 7 `self.conn.*` → `conn.*` call sites |

## Commit

`d28b208` — fix(bridge): fix immediate_transaction closure — use &Connection directly in sleep.rs

## Self-Check: PASSED

- `Rust/core/src/bridge/sleep.rs` — exists, modified
- `Rust/core/src/store/mod.rs` — exists, modified
- Commit `d28b208` — confirmed in git log
- `cargo build` — clean
