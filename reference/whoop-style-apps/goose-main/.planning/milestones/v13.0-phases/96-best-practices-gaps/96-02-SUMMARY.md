# Plan 96-02 Summary — Rust r2d2 Connection Pool (BP-02)

**Status:** Complete
**Commits:** `27b8b79`

## What Was Built

**Task 1 — Cargo.toml:**
- Downgraded `rusqlite` from 0.40 → 0.39 (r2d2_sqlite 0.34.0 requires rusqlite ^0.39; no newer r2d2_sqlite version exists for 0.40)
- Added `r2d2 = "0.8.10"` and `r2d2_sqlite = "0.34.0"`

**Task 2 — bridge/mod.rs (BRIDGE_POOL + acquire_bridge_conn):**
- Added `static BRIDGE_POOL: OnceLock<Pool<SqliteConnectionManager>>`
- Added `acquire_bridge_conn(database_path: &str)` — initialises pool on first call with `max_size=4` (WAL mode confirmed enabled in store/mod.rs), WAL/synchronous/foreign_keys/busy_timeout PRAGMAs on each new connection
- Pool stored as OnceLock for thread-safe lazy init per D-03/D-04

**Task 3 — Bridge domain file migration:**
- Migrated all bridge domain files to use `acquire_bridge_conn()`:
  - `bridge/activity.rs`
  - `bridge/capture.rs`
  - `bridge/debug.rs`
  - `bridge/metrics.rs`
  - `bridge/sleep.rs`
- `open_bridge_store_hot()` unchanged (4 call sites, not pooled)

## Files Changed

- `Rust/core/Cargo.toml` — rusqlite 0.40→0.39, r2d2 + r2d2_sqlite added
- `Rust/core/Cargo.lock` — updated
- `Rust/core/src/bridge/mod.rs` — BRIDGE_POOL + acquire_bridge_conn
- `Rust/core/src/bridge/activity.rs`, `capture.rs`, `debug.rs`, `metrics.rs`, `sleep.rs` — migrated

## Verification

- `cargo check --lib` passes clean
- rusqlite 0.39 is API-compatible with 0.40 for all query/execute patterns used in this project
- Per-request `Connection::open()` eliminated from bridge handlers (replaced by pool acquire)

## Deviation Note

Original plan used `r2d2_sqlite = "0.34.0"` with `rusqlite = "0.40"` — incompatible (r2d2_sqlite requires ^0.39). User approved downgrade to rusqlite 0.39.
