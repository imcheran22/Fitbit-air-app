# Phase 87: store.rs Split - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Split store.rs (9 944 lines, 140 public methods) into a `store/` subdirectory where domain methods live in separate files but all operate on the same `GooseStore` public type. Zero breaking changes to callers in bridge/ or integration tests. Add `Arc<Mutex<Connection>>` to make the connection shareable across the domain files.

**Out of scope:** store.rs API changes visible to Swift (no new or removed bridge methods), any metrics/algorithm logic, bridge.rs changes (Phase 86), Swift changes (Phase 88+).

</domain>

<decisions>
## Implementation Decisions

### Split Strategy — `impl GooseStore` not struct split (D-01)
- **D-01:** Domain files use **multiple `impl GooseStore` blocks**, NOT separate domain struct types (SleepStore, MetricsStore, etc.). Each domain file (`store/sleep.rs`, `store/capture.rs`, `store/metrics.rs`, `store/activity.rs`) adds methods to `GooseStore` via `impl GooseStore` in that file. The public API is identical before and after the split — callers still call `store.method_name()`. No type changes visible to bridge/ or tests.

### Connection — Arc<Mutex<Connection>> (D-02)
- **D-02:** `GooseStore { conn: Connection }` becomes `GooseStore { conn: Arc<Mutex<Connection>> }`. Each `impl GooseStore` block in domain files acquires the lock with `let conn = self.conn.lock().map_err(|_| GooseError::message("store lock poisoned"))?;`. Arc<Mutex> chosen (not Arc<Connection>) because rusqlite `Connection` is not `Sync`, making raw `Arc<Connection>` unsound in multi-threaded context.

### Schema/Migration/Init — store/mod.rs (D-03)
- **D-03:** All schema-related methods (`open()`, `schema_version()`, migrations, `CURRENT_SCHEMA_VERSION`) stay in `store/mod.rs`. Domain files import nothing from store/mod.rs — they access the connection via `self.conn.lock()`. The existing schema validation at open time (line 1068-1071 of current store.rs) satisfies ARCH-02 SC2 — it already returns an error if `schema_version != CURRENT_SCHEMA_VERSION`.

### Method Grouping (D-04)
- **D-04:** 140 methods split across 5 files:

| Target file | Domain |
|-------------|--------|
| `Rust/core/src/store/mod.rs` | GooseStore struct, open/init, schema, migrations, CURRENT_SCHEMA_VERSION, connection helpers |
| `Rust/core/src/store/sleep.rs` | sleep sessions, sleep stages, external_sleep_sessions, nap records |
| `Rust/core/src/store/capture.rs` | decoded_frames, capture sessions, historical sync, raw frames, step_counter |
| `Rust/core/src/store/metrics.rs` | metric_series, metric_features, energy_rollup, resting_hr, recovery, hrv, activity baselines, calibration |
| `Rust/core/src/store/activity.rs` | activity sessions, activity intervals, activity metrics, workout, journal, apple_daily, gravity/IMU rows |

Planner may adjust grouping if cross-dependencies force it — this mapping is the target, not a hard constraint.

### Claude's Discretion
- Exact method-to-file assignment beyond the high-level grouping above
- Whether to keep `#[cfg(test)]` test helpers in store/mod.rs or split them per domain
- Whether existing `GooseStore` tests in store.rs move to dedicated domain test files or stay in a single tests file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/ROADMAP.md` Phase 87 — 3 success criteria; note SC2 ("runtime schema version validation") is already implemented at store.rs:1068-1071
- `.planning/REQUIREMENTS.md` — ARCH-02

### Phase 86 Dependency
- `Rust/core/src/bridge/debug.rs` and `Rust/core/src/bridge/mod.rs` — these call `open_bridge_store()` which returns `GooseStore`. The return type must stay `GooseStore` after the split.
- `Rust/core/src/bridge/mod.rs` — `open_bridge_store(database_path)` helper at line ~684; after split it creates `GooseStore` which now internally uses `Arc<Mutex<Connection>>`

### Current store.rs Structure
- `Rust/core/src/store.rs` — the monolith to split; `GooseStore { conn: Connection }` at line 166; `CURRENT_SCHEMA_VERSION = 22` at line 14; schema check at lines 1068-1071
- `Rust/core/tests/store_tests.rs` — integration tests; must all pass after split with no changes to test code

### Rust Convention for multi-file impl
- CLAUDE.md — Rust Edition 2024, MSRV 1.96; `pub mod` declarations in lib.rs; no new dependencies without approval
- Pattern from Phase 86: domain split via multiple files under a subdirectory, with `mod.rs` as the entry point

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `open_bridge_store()` helper in `bridge/mod.rs` — calls `GooseStore::open(path)` and returns `GooseStore`; this signature must be preserved
- Existing `Arc<Mutex<Connection>>` pattern not yet in store.rs — will be new
- `GooseStore::open()` at approx line 1050 performs migrations + schema validation; must stay in store/mod.rs

### Established Patterns
- Phase 86 bridge split used `impl GooseStore` approach for domain files — same pattern here
- `deny(clippy::unwrap_used)` active — `lock().map_err(...)` required, not `lock().unwrap()`
- All public methods that call the database must acquire `self.conn.lock()?` at the start

### Integration Points
- `Rust/core/src/lib.rs` — `pub mod store;` must change to `pub mod store { pub use store::*; }` or remain as-is if `store/mod.rs` re-exports everything from store.rs
- `Rust/core/tests/store_tests.rs` — uses `GooseStore::open()` and all store methods; must compile unchanged

</code_context>

<specifics>
## Specific Ideas

- `Arc<Mutex<Connection>>` acquire pattern: `let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;`
- store/mod.rs should declare the domain submodules: `mod sleep; mod capture; mod metrics; mod activity;`
- lib.rs needs `pub mod store;` unchanged — Rust resolves `src/store.rs` OR `src/store/mod.rs` automatically

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 87-store-rs-split*
*Context gathered: 2026-06-15*
