# Phase 110: Code Health — Unwraps + Connection Pool + Bot Audit - Research

**Researched:** 2026-06-21
**Status:** Complete

## Validation Architecture

No external literature needed — all findings are direct code inspection results on HEAD.

---

## Track 1: Naked `.unwrap()` in Production Rust — ALREADY COMPLETE

### Finding

`grep -rn '\.unwrap()' Rust/core/src/ --include='*.rs'` returns 38 matches.

**All 38 are in test code.** Every match in `Rust/core/src/store/mod.rs` (lines 3980–4776) is inside a `#[test]` function within the `mod tests { … }` block, which is covered by the crate-level `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` exemption.

No other source file (`bridge/`, `lib.rs`, etc.) has any `.unwrap()` call.

### Clippy Gate Status

Running `cargo clippy --manifest-path Rust/core/Cargo.toml --lib -- -D clippy::unwrap_used` exits 0 with no warnings. The production-code unwrap gate is **already passing**.

### Plan 110-01 Scope Adjustment

The CONTEXT.md says "Replace 38 naked `.unwrap()`" — but those 38 are all test-exempt. Plan 110-01 work is:

1. **Verify** the clippy gate passes (confirmed above).
2. **Add `cargo clippy` to CI / test script** as a hard gate so it stays green (if not already there).
3. **Document** that the 38 test-code unwraps are intentional and exempt (update `lib.rs` comment if it implies 38 remain in production).
4. If any production unwraps are found during the plan's `cargo clippy` run, fix them; otherwise the plan is a verification + hardening task.

This is a narrow correctness-verification plan, not a mass-replacement plan.

---

## Track 2: SQLite Connection Pool — r2d2 Declared, Not Wired

### Current State

`Rust/core/Cargo.toml` already declares:
```toml
r2d2 = "0.8.10"
r2d2_sqlite = "0.34.0"
rusqlite = { version = "0.39", features = ["bundled"] }
```

**But r2d2 is not used anywhere in `Rust/core/src/`.** The dependency was added in v13.0 in preparation for this phase.

### GooseStore Current Architecture

```rust
// store/mod.rs:175
pub struct GooseStore {
    pub(super) conn: Arc<Mutex<Connection>>,
}
```

Single connection protected by a mutex. Per-request open pattern in bridge:
- `open_bridge_store(path)` — validates + opens + migrates
- `open_bridge_store_hot(path)` — validates + opens (skips migration if current)
- `acquire_bridge_conn(path)` — process-lifetime cache via `OnceLock<Mutex<HashSet<String>>>`, skips migration on subsequent opens

Bridge domain files (`capture.rs`, `activity.rs`, `debug.rs`, `metrics.rs`, `sleep.rs`) call `open_bridge_store_hot` or `acquire_bridge_conn` per bridge request — each call opens a new SQLite connection.

### r2d2 Pool Design

`r2d2_sqlite::SqliteConnectionManager` wraps rusqlite's `Connection`. Pool type:
```rust
type BridgePool = r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>;
type BridgeConn = r2d2::PooledConnection<r2d2_sqlite::SqliteConnectionManager>;
```

Pool initialization:
```rust
let manager = r2d2_sqlite::SqliteConnectionManager::file(path)
    .with_flags(rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_CREATE);
let pool = r2d2::Pool::builder().max_size(4).build(manager)?;
```

### Migration Integration Challenge

`GooseStore::open()` runs schema migrations. With a pool, migrations must run once on pool creation, not per-checkout. Strategy:
1. Pool init: open first connection, run `GooseStore::migrate()`, close.
2. Pool checkouts: use `open_existing_current` semantics — assume schema is current.
3. `GooseStore` struct stays intact for non-bridge use (tests, bins use it directly); pool is an additional bridge-layer abstraction.

### Process-Lifetime Pool (OnceLock pattern)

The existing `BRIDGE_MIGRATED_PATHS: OnceLock<Mutex<HashSet<String>>>` shows the pattern already used. Pool follows same idiom:

```rust
static BRIDGE_POOL: OnceLock<BridgePool> = OnceLock::new();

pub(crate) fn get_bridge_pool(database_path: &str) -> GooseResult<BridgeConn> {
    let pool = BRIDGE_POOL.get_or_try_init(|| init_pool(database_path))?;
    pool.get().map_err(|e| GooseError::message(&format!("pool checkout: {e}")))
}
```

**SQLite WAL mode:** Enable WAL on pool init for read concurrency:
```rust
manager.with_init(|conn| { conn.execute_batch("PRAGMA journal_mode=WAL;")?; Ok(()) });
```

### Impact on GooseStore

`GooseStore` wraps a `PooledConnection` checkout via a newtype or by replacing `Arc<Mutex<Connection>>` with the pool reference. Simplest approach: keep `GooseStore` as-is for test compatibility, add a separate `BridgeConn` alias used only by bridge handlers. Bridge handlers switch from `let store = acquire_bridge_conn(...)` to `let conn = get_bridge_pool(...)`.

GooseStore methods that take `&self` and call `self.conn.lock().unwrap()` in tests stay unchanged — tests create in-memory GooseStore instances, not pool connections.

---

## Track 3: Bot Audit Issue #59 — Already Closed, Different Scope

### Finding

GitHub issue #59 (`tigercraft4/goose`) is **CLOSED**. The finding was:

> Planning doc marks `/v1/ingest-frames` and `/v1/export/frames` endpoints as complete, but they don't exist in the versioned server.

Owner comment: "Planning doc is stale — the raw-frame roundtrip endpoints are planned but not yet implemented on the server. Tracked as Phase 46 in the v7.0 roadmap."

This is a **server-side planning doc issue** (Python FastAPI server), not a Rust core issue. It was resolved in v7.0 context. It has no relationship to the unwrap or connection pool work.

### Plan 110-03 Scope

Since #59 is already closed and its finding is about server endpoints (out of scope for Rust-only phase 110), plan 110-03 should:
1. Verify current HEAD state — confirm `/v1/ingest-frames` and `/v1/export/frames` exist or note they are tracked elsewhere.
2. Add a comment to #59 confirming the state as of HEAD (neutral language — no audit tool references).
3. Re-open #59 only if the endpoints are genuinely missing from the current server and the issue is still actionable; otherwise confirm it is correctly closed.

If the endpoints exist in current server HEAD: plan 110-03 is a one-task verification plan.
If they do not exist: document the gap in the REQUIREMENTS backlog, confirm #59 is correctly closed with a tracking reference.

---

## Revised Plan Outline

| Plan | Goal | Wave | Requirements |
|------|------|------|--------------|
| 110-01-PLAN.md | Verify clippy unwrap gate passes; harden CI gate; update misleading lib.rs comment | 1 | ARCH-11 |
| 110-02-PLAN.md | Wire r2d2 pool into bridge dispatcher; replace per-request open_bridge_store calls | 2 (after 01) | BP-03 |
| 110-03-PLAN.md | Verify issue #59 state in HEAD; close with neutral comment confirming resolution | 1 (parallel) | AUDIT-01 |

Plans 110-01 and 110-03 can run in wave 1 in parallel. Plan 110-02 runs in wave 2.

---

## Key Constraints

- **No RE references** in any commit, comment, or planning artifact.
- **`cargo test --locked --manifest-path Rust/core/Cargo.toml` must pass** after each wave.
- **Pool must compile for iOS targets** (`aarch64-apple-ios`). r2d2 and r2d2_sqlite are pure Rust with no platform-specific deps — they compile fine on iOS. rusqlite with `bundled` feature already compiles for iOS.
- **GooseStore tests** use in-memory connections and must not break. Pool is bridge-only.
- **`acquire_bridge_conn` and `BRIDGE_MIGRATED_PATHS` OnceLock**: after pool introduction, `acquire_bridge_conn` becomes either a thin wrapper around `get_bridge_pool` or is deprecated. The OnceLock migration cache becomes redundant once the pool handles connection reuse.

## RESEARCH COMPLETE
