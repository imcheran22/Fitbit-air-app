# Phase 87: store.rs Split - Research

**Researched:** 2026-06-15
**Domain:** Rust module refactoring — SQLite store split into domain files
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Domain files use **multiple `impl GooseStore` blocks**, NOT separate domain struct types. Each domain file (`store/sleep.rs`, `store/capture.rs`, `store/metrics.rs`, `store/activity.rs`) adds methods to `GooseStore` via `impl GooseStore`. Public API is identical before and after.
- **D-02:** `GooseStore { conn: Connection }` becomes `GooseStore { conn: Arc<Mutex<Connection>> }`. Each domain `impl` block acquires the lock with `let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;`
- **D-03:** All schema-related methods (`open()`, `schema_version()`, migrations, `CURRENT_SCHEMA_VERSION`) stay in `store/mod.rs`. The existing schema check at `open_existing_current()` (lines 1064-1075) already satisfies SC2.
- **D-04:** 5 files: `store/mod.rs` (infra), `store/sleep.rs`, `store/capture.rs`, `store/metrics.rs`, `store/activity.rs`
- `deny(clippy::unwrap_used)` active — no `.unwrap()` allowed anywhere in non-test code

### Claude's Discretion
- Exact method-to-file assignment beyond the high-level D-04 grouping
- Whether `#[cfg(test)]` helpers stay in `store/mod.rs` or split per domain
- Whether existing in-module tests move to dedicated domain test files or stay together

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-02 | store.rs 140 public methods → domain stores sharing `Arc<Connection>` in `store/` subdirectory; runtime schema version validation on SQLite open | D-02 covers Arc<Mutex<Connection>>; D-03 confirms SC2 already met by open_existing_current(); method mapping below covers the full split |
</phase_requirements>

---

## Summary

store.rs is a 9,944-line monolith with 139 public methods (grep count — CONTEXT.md says 140, difference is likely a method split across two lines). The goal is to split it into 5 files under `src/store/` without any public API change: callers in `bridge/` and integration tests continue calling `store.method_name()` identically.

The single most important architectural finding is the **`immediate_transaction` deadlock risk** (Pitfall 1 below). The current implementation passes `&GooseStore` (i.e., `self`) into the closure, and closures within the call sites access `store.conn` directly. After converting `conn` to `Arc<Mutex<Connection>>`, the lock acquired at the top of each regular method would **not** be held inside `immediate_transaction`'s closure — because `immediate_transaction` itself does not acquire a lock; it calls `self.conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")` directly. The closures then do `store.conn.execute(...)` which would try to acquire the lock from an already-not-held lock. However, this creates a **re-entrancy anti-pattern**: if any method that acquires the lock calls `immediate_transaction`, and the closure inside calls another method that also acquires the lock, it would deadlock on `std::sync::Mutex` (which is not re-entrant). The planner must address this — see Architecture Patterns section.

The schema validation requirement (SC2) is **already implemented** in `open_existing_current()` at lines 1064-1075. No new code is needed for SC2.

All public types (`GooseStore`, `RawEvidenceInput`, `RawEvidenceRow`, ~67 pub structs/enums/consts) are defined in store.rs and must be re-exported from `store/mod.rs`. The integration test `store_tests.rs` imports them via `use goose_core::store::{...}` — the re-export path must stay identical.

**Primary recommendation:** Use the `Arc<Mutex<Connection>>` pattern but keep `immediate_transaction` operating on a raw lock guard rather than going through the per-method lock acquisition path. Domain method implementations call `self.conn.lock()` directly; `immediate_transaction` acquires the lock once for the BEGIN/COMMIT/ROLLBACK and passes an already-locked guard to a different interface — or alternatively, `immediate_transaction` stays as-is calling raw execute_batch and the closure receives `&Connection` (not `&GooseStore`), eliminating re-entrancy.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Store struct definition + open/init/migrate | `store/mod.rs` | — | D-03: schema infra stays in mod.rs |
| Sleep domain methods | `store/sleep.rs` | — | D-04 mapping |
| Capture + historical sync domain methods | `store/capture.rs` | — | D-04 mapping |
| Metrics + recovery + calibration + algorithm domain | `store/metrics.rs` | — | D-04 mapping |
| Activity + workout + journal + gravity/IMU domain | `store/activity.rs` | — | D-04 mapping |
| Connection lock acquisition | Each `impl GooseStore` block | — | Every public method acquires lock at entry |
| Transaction management | `immediate_transaction` in `store/mod.rs` | — | Cannot be split — cross-cuts all domains |
| Type definitions (pub structs/enums) | `store/mod.rs` | — | All 67+ types defined before GooseStore; re-exported |
| `#[cfg(test)]` helpers | `store/mod.rs` or per-domain | — | Claude's discretion |

---

## Standard Stack

No new dependencies. This is a pure refactoring phase.

| Crate | Version | Role | Status |
|-------|---------|------|--------|
| `rusqlite` | 0.40 (bundled) | SQLite connection + queries | Already present [VERIFIED: Cargo.toml] |
| `std::sync::{Arc, Mutex}` | std | Shared connection wrapper | Standard library — no addition needed |
| `serde` / `serde_json` | 1.0 | Type serialisation | Already present |
| `sha2` | 0.11 | SHA-256 in store | Already present |

**No new packages to install.** Package legitimacy audit: N/A.

---

## Architecture Patterns

### System Architecture Diagram

```
lib.rs
  └─ pub mod store;          (resolves to src/store/mod.rs automatically)

src/store/mod.rs             ← GooseStore struct, ALL pub types, open/migrate/schema/transaction
  ├─ mod sleep;              ← impl GooseStore { sleep methods }
  ├─ mod capture;            ← impl GooseStore { capture methods }
  ├─ mod metrics;            ← impl GooseStore { metrics methods }
  └─ mod activity;           ← impl GooseStore { activity methods }

bridge/mod.rs
  └─ open_bridge_store() → GooseStore::open(path)   (unchanged)
  └─ use crate::store::{CURRENT_SCHEMA_VERSION, GooseStore}  (unchanged)

tests/store_tests.rs
  └─ use goose_core::store::{GooseStore, ...all types}  (unchanged)
```

Data flow: `GooseStore::open()` → `migrate()` → domain `impl` methods each call `self.conn.lock()?` → execute SQL → release lock.

### Recommended Project Structure

```
Rust/core/src/
├─ store.rs           ← DELETED (replaced by store/ directory)
└─ store/
   ├─ mod.rs          ← GooseStore struct, all pub types, open/migrate/schema/transaction helpers
   ├─ sleep.rs        ← impl GooseStore — sleep domain (14 methods)
   ├─ capture.rs      ← impl GooseStore — capture + overnight + raw evidence (22 methods)
   ├─ metrics.rs      ← impl GooseStore — metrics, recovery, calibration, algorithm (46 methods)
   └─ activity.rs     ← impl GooseStore — activity, intervals, labels, gravity, journal (57 methods)
```

### Pattern 1: Multiple `impl GooseStore` blocks across files

**What:** Rust allows multiple `impl TypeName` blocks in different files within the same module. Each domain file is a private submodule of `store` (declared via `mod sleep;` etc. in `store/mod.rs`). They access `GooseStore` via `super::GooseStore`.

**When to use:** Always — D-01 locks this pattern.

```rust
// store/sleep.rs
use super::GooseStore;
use crate::{GooseError, GooseResult};

impl GooseStore {
    pub fn insert_external_sleep_session(
        &self,
        input: ExternalSleepSessionInput<'_>,
    ) -> GooseResult<bool> {
        let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
        // ... SQL using conn
    }
}
```

**Why this works:** `mod sleep;` inside `store/mod.rs` makes `sleep` a submodule of `store`. Submodules can access private fields of parent-module types if they import them. However, `conn` is a **private field** — submodules do NOT have access to private fields of types from the parent module. [VERIFIED: Rust reference, field visibility rules]

**Critical implication:** `conn` must be made `pub(super)` or `pub(crate)` in the struct definition, OR accessed via a private accessor method. See Pitfall 2 below.

### Pattern 2: `Arc<Mutex<Connection>>` lock acquisition

**What:** Every public method that needs database access acquires the lock at entry.

```rust
// Standard pattern for all domain methods
pub fn some_store_method(&self, ...) -> GooseResult<...> {
    let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
    let mut stmt = conn.prepare_cached("SELECT ...")?;
    // ...
}
```

**`std::sync::Mutex` is NOT re-entrant.** Calling `lock()` from a thread that already holds the lock will deadlock. This means:
- Domain methods must acquire the lock at method entry and release it at method exit.
- `immediate_transaction` CANNOT acquire the lock and then call domain methods inside the closure — that would deadlock.

### Pattern 3: `immediate_transaction` — the critical design decision

**Current implementation (store.rs:1091-1106):**
```rust
pub fn immediate_transaction<F, T>(&self, operation: F) -> GooseResult<T>
where
    F: FnOnce(&GooseStore) -> GooseResult<T>,
{
    self.conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
    match operation(self) {    // ← passes &GooseStore to closure
        Ok(value) => { self.conn.execute_batch("COMMIT")?; Ok(value) }
        Err(error) => { let _ = self.conn.execute_batch("ROLLBACK"); Err(error) }
    }
}
```

**Call sites (6 total in store.rs + 3 in bridge/):**
- `self.immediate_transaction(|store| { store.conn.execute(...) })` — closure accesses `store.conn` directly
- `store.immediate_transaction(|store| store.insert_activity_metrics(&inputs))` — closure calls a public method

**The problem:** With `Arc<Mutex<Connection>>`, if `immediate_transaction` acquires the lock for BEGIN/COMMIT/ROLLBACK, and the closure then calls `store.insert_activity_metrics()` which ALSO acquires the lock → **deadlock**.

**Recommended solution:** Change `immediate_transaction` to NOT use the Arc<Mutex> pattern. Instead, acquire the lock ONCE for the entire transaction and expose it via a different interface:

```rust
// Option A: immediate_transaction acquires lock once, closure receives &Connection
pub fn immediate_transaction<F, T>(&self, operation: F) -> GooseResult<T>
where
    F: FnOnce(&Connection) -> GooseResult<T>,
{
    let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
    match operation(&conn) {
        Ok(value) => { conn.execute_batch("COMMIT")?; Ok(value) }
        Err(error) => { let _ = conn.execute_batch("ROLLBACK"); Err(error) }
    }
}
```

**Consequence:** All 9 call sites of `immediate_transaction` must be updated — closures currently doing `store.conn.execute(...)` become `conn.execute(...)`, and closures calling public store methods (e.g. `store.insert_activity_metrics`) must inline those SQL operations instead.

This is the single most impactful change in the entire split. The planner must budget tasks for updating all `immediate_transaction` call sites.

**Call sites inventory:**

| Location | Line | Current closure body |
|----------|------|---------------------|
| `store.rs` | 1860 | `mirror_overnight_batch` — multiple inserts via `store.conn` |
| `store.rs` | 6745 | `insert_exercise_session` — `store.conn.execute(...)` |
| `store.rs` | 6779 | `insert_exercise_sessions_batch` — `store.conn.execute(...)` loop |
| `store.rs` | 6853 | `insert_v24_biometric_batch` — `store.conn.execute(...)` |
| `store.rs` | 7570 | `backfill_streams_from_decoded_frames` — `store.conn.execute(...)` loop |
| `bridge/activity.rs` | 700 | `store.insert_activity_metrics(&inputs)` — public method call |
| `bridge/activity.rs` | 804 | `store.insert_activity_metrics(inputs)` — public method call |
| `bridge/sleep.rs` | 475 | multi-step inserts via store methods |
| `capture_import.rs` | 248 | multi-step inserts |

### Pattern 4: Private field access in submodules

**The problem:** `GooseStore.conn` is currently a private field. Submodules declared via `mod sleep;` inside `store/mod.rs` are children of `store`, but Rust private fields are only accessible within the declaring module (the file where the struct is declared), not in child submodules.

**Solution:** In `store/mod.rs`, declare the field as `pub(super)` (accessible by parent) or provide a private accessor:

```rust
// store/mod.rs
pub struct GooseStore {
    pub(super) conn: Arc<Mutex<Connection>>,   // accessible within store/ submodules
}
```

OR use a crate-private accessor:
```rust
impl GooseStore {
    pub(crate) fn connection(&self) -> &Arc<Mutex<Connection>> { &self.conn }
}
```

`pub(super)` is cleaner — it limits access to the `store/` module family only. [VERIFIED: Rust reference, visibility/privacy]

### Pattern 5: Rust module resolution — `store.rs` → `store/mod.rs`

**What:** When Rust sees `pub mod store;` in `lib.rs`, it looks for EITHER:
- `src/store.rs` (current), OR
- `src/store/mod.rs` (after split)

**No change to `lib.rs` is needed.** Simply deleting `src/store.rs` and creating `src/store/mod.rs` makes Rust automatically resolve to the directory form. [VERIFIED: Rust reference, module system]

### Anti-Patterns to Avoid

- **Calling a locking domain method inside `immediate_transaction`'s closure:** Deadlock on `std::sync::Mutex`. All 9 call sites must be migrated to the `&Connection` closure signature.
- **Leaving `pub struct GooseStore { conn: Connection }` with private field and adding submodules:** Submodules cannot access private fields. Must use `pub(super)`.
- **Adding `pub use store::*;` in lib.rs:** lib.rs already has `pub mod store;` — this is sufficient. Adding a glob re-export would create duplicate public paths.
- **Using `Arc<Connection>` without Mutex:** `rusqlite::Connection` does not implement `Sync`, so `Arc<Connection>` would not compile in a multi-threaded context. `Arc<Mutex<Connection>>` is the correct choice. [VERIFIED: rusqlite docs, Connection is !Sync]

---

## Method-to-File Mapping

**Total: 139 public methods** (verified by grep `^    pub fn`)

### store/mod.rs — Infrastructure (7 methods + all types + private helpers)

| # | Method | Line |
|---|--------|------|
| 1 | `open` | 1056 |
| 2 | `open_existing_current` | 1064 |
| 3 | `open_read_only` | 1077 |
| 4 | `open_in_memory` | 1083 |
| 5 | `immediate_transaction` | 1091 |
| 6 | `migrate` | 1108 |
| 7 | `schema_version` | 1848 |

Also in mod.rs: `configure_read_write_connection`, `configure_read_only_connection` (private), `CURRENT_SCHEMA_VERSION`, `DEFAULT_RAW_EVIDENCE_PAYLOAD_RETENTION_LIMIT_BYTES`, all `ALLOWED_*` constants, and all 67+ `pub struct`/`pub type`/`pub enum` definitions.

### store/capture.rs — Capture + Overnight + Raw Evidence + Decoded Frames + Step Counter + Upload (22 methods)

| # | Method | Line |
|---|--------|------|
| 8 | `mirror_overnight_batch` | 1854 |
| 9 | `overnight_mirror_counts` | 1908 |
| 10 | `insert_raw_evidence` | 2259 |
| 11 | `insert_decoded_frame` | 2321 |
| 12 | `start_capture_session` | 2378 |
| 13 | `set_capture_session_device_id` | 2435 |
| 14 | `finish_capture_session` | 2454 |
| 15 | `capture_session` | 2489 |
| 16 | `capture_sessions_between` | 2514 |
| 17 | `insert_step_counter_sample` | 4402 |
| 18 | `step_counter_sample` | 4466 |
| 19 | `step_counter_samples_between` | 4499 |
| 20 | `raw_evidence` | 5165 |
| 21 | `raw_evidence_between` | 5201 |
| 22 | `raw_evidence_payload_bytes` | 5240 |
| 23 | `compact_raw_evidence_payloads_to_limit` | 5252 |
| 24 | `decoded_frames_between` | 5309 |
| 25 | `decoded_frame` | 5352 |
| 26 | `upsert_upload_cursor` | 7402 |
| 27 | `get_upload_cursor` | 7415 |
| 28 | `mark_synced_rows` | 7429 |
| 29 | `rows_pending_upload` | 7449 |
| 30 | `backfill_streams_from_decoded_frames` | 7496 |
| 31 | `rr_intervals_between` | 7595 |
| 32 | `prune_synced_stream_rows` | 7625 |

### store/metrics.rs — Metrics, Recovery, Calibration, Algorithm (46 methods)

| # | Method | Line |
|---|--------|------|
| 33 | `insert_daily_recovery_metric` | 3723 |
| 34 | `upsert_daily_recovery_metric` | 3793 |
| 35 | `daily_recovery_metric` | 3869 |
| 36 | `daily_recovery_metrics_between` | 3905 |
| 37 | `daily_recovery_metrics_all_ordered` | 3951 |
| 38 | `ewma_baseline_update` | 3996 |
| 39 | `insert_metric_provenance` | 4115 |
| 40 | `upsert_metric_provenance` | 4164 |
| 41 | `metric_provenance` | 4212 |
| 42 | `metric_provenance_for_metric` | 4241 |
| 43 | `insert_metric_debug_feature` | 4273 |
| 44 | `metric_debug_feature` | 4331 |
| 45 | `metric_debug_features_between` | 4362 |
| 46 | `upsert_algorithm_definition` | 5389 |
| 47 | `algorithm_definition` | 5455 |
| 48 | `set_algorithm_preference` | 5501 |
| 49 | `algorithm_preference` | 5551 |
| 50 | `algorithm_preferences` | 5580 |
| 51 | `insert_algorithm_run` | 5612 |
| 52 | `algorithm_run` | 5746 |
| 53 | `algorithm_runs_overlapping` | 5780 |
| 54 | `metric_values_for_run` | 5821 |
| 55 | `metric_components_for_run` | 5855 |
| 56 | `insert_calibration_run` | 5888 |
| 57 | `calibration_run` | 5928 |
| 58 | `calibration_runs_overlapping` | 5969 |
| 59 | `insert_calibration_label` | 6014 |
| 60 | `calibration_label` | 6082 |
| 61 | `calibration_labels_between` | 6105 |
| 62 | `upsert_command_validation_record` | 6132 |
| 63 | `command_validation_record` | 6163 |
| 64 | `command_validation_records` | 6182 |
| 65 | `insert_gravity_rows` | 6618 |
| 66 | `gravity_rows_between` | 6638 |
| 67 | `insert_gravity2_batch` | 6666 |
| 68 | `gravity2_samples_between` | 6686 |
| 69 | `resp_samples_between` | 6716 |
| 70 | `insert_v24_biometric_batch` | 6847 |
| 71 | `v24_biometric_samples_between` | 6882 |
| 72 | `insert_metric_series` | 7036 |
| 73 | `query_metric_series_range` | 7051 |
| 74 | `insert_daily_activity_metric` | 3275 |
| 75 | `upsert_daily_activity_metric` | 3345 |
| 76 | `daily_activity_metric` | 3421 |
| 77 | `daily_activity_metrics_between` | 3457 |
| 78 | `insert_hourly_activity_metric` | 3499 |
| 79 | `upsert_hourly_activity_metric` | 3569 |
| 80 | `hourly_activity_metric` | 3645 |
| 81 | `hourly_activity_metrics_between` | 3681 |

### store/activity.rs — Activity Sessions, Intervals, Labels, Workout, Journal, Exercise (41 methods)

| # | Method | Line |
|---|--------|------|
| 82 | `insert_activity_session` | 2552 |
| 83 | `update_activity_session` | 2616 |
| 84 | `delete_activity_session` | 2680 |
| 85 | `activity_session` | 2689 |
| 86 | `activity_sessions_between` | 2720 |
| 87 | `activity_sessions_by_type` | 2760 |
| 88 | `activity_sessions_by_source` | 2794 |
| 89 | `activity_sessions_by_sync_status` | 2827 |
| 90 | `activity_sessions_by_custom_label` | 2861 |
| 91 | `activity_sessions_by_external_activity_type_code` | 2894 |
| 92 | `activity_sessions_by_external_activity_type_name` | 2930 |
| 93 | `insert_activity_metric` | 2966 |
| 94 | `insert_activity_metrics` | 2977 |
| 95 | `activity_metric` | 3066 |
| 96 | `activity_metrics_for_session` | 3092 |
| 97 | `activity_metrics_for_sessions` | 3126 |
| 98 | `activity_metrics_by_name` | 3168 |
| 99 | `activity_metrics_for_session_in_window` | 3196 |
| 100 | `activity_metrics_in_window` | 3240 |
| 101 | `insert_activity_interval` | 4538 |
| 102 | `activity_interval` | 4592 |
| 103 | `activity_intervals_for_session` | 4618 |
| 104 | `activity_intervals_in_window` | 4652 |
| 105 | `insert_activity_label` | 4687 |
| 106 | `activity_label` | 5085 |
| 107 | `activity_labels_for_session` | 5109 |
| 108 | `activity_labels_by_type` | 5141 |
| 109 | `insert_debug_session` | 6195 |
| 110 | `debug_session` | 6238 |
| 111 | `debug_sessions_between` | 6262 |
| 112 | `insert_debug_command` | 6291 |
| 113 | `debug_command` | 6334 |
| 114 | `debug_commands_for_session` | 6357 |
| 115 | `debug_commands_between` | 6382 |
| 116 | `next_debug_event_sequence` | 6410 |
| 117 | `insert_debug_event` | 6425 |
| 118 | `debug_events_for_session` | 6496 |
| 119 | `debug_events_between` | 6521 |
| 120 | `debug_events_after_sequence` | 6552 |
| 121 | `table_count` | 6590 |
| 122 | `table_columns` | 6598 |
| 123 | `foreign_keys_enabled` | 6605 |
| 124 | `integrity_check` | 6612 |
| 125 | `insert_exercise_session` | 6743 |
| 126 | `insert_exercise_sessions_batch` | 6772 |
| 127 | `exercise_sessions_between` | 6811 |
| 128 | `insert_journal` | 6957 |
| 129 | `insert_workout` | 6972 |
| 130 | `insert_apple_daily` | 7015 |

### store/sleep.rs — Sleep Sessions, Stages, Correction Labels (13 methods)

| # | Method | Line |
|---|--------|------|
| 131 | `insert_external_sleep_session` | 4735 |
| 132 | `external_sleep_session` | 4794 |
| 133 | `external_sleep_sessions_between` | 4826 |
| 134 | `insert_external_sleep_stage` | 4864 |
| 135 | `external_sleep_stage` | 4914 |
| 136 | `external_sleep_stages_for_session` | 4942 |
| 137 | `insert_sleep_correction_label` | 4969 |
| 138 | `sleep_correction_label` | 5021 |
| 139 | `sleep_correction_labels_between` | 5050 |

> Note on method count: grep finds 139 `pub fn` declarations. CONTEXT.md states 140 — one method's signature likely spans two lines with the `pub fn` keyword not at the exact indentation the grep pattern matches. The planner should not treat this as a discrepancy; it's a grep artifact.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shared SQLite connection | Custom connection pool or RwLock | `Arc<Mutex<Connection>>` | rusqlite Connection is !Sync, Mutex is the standard safe wrapper |
| Transaction BEGIN/COMMIT/ROLLBACK | Manual PRAGMA calls | rusqlite `Connection.execute_batch()` (already used) | Existing pattern, no change needed |
| Module re-exports | Wildcard re-exports in domain files | Define all types in mod.rs, no re-exports needed in domain files | Domain files only add `impl GooseStore` blocks — types stay in mod.rs |
| Re-entrant locking | `parking_lot::ReentrantMutex` or custom locking | Restructure `immediate_transaction` to pass `&Connection` | Simpler, no new dependency, matches existing call site patterns |

**Key insight:** The only non-trivial design work in this phase is the `immediate_transaction` interface change. Everything else is mechanical file splitting.

---

## Common Pitfalls

### Pitfall 1: Deadlock in `immediate_transaction` with `Arc<Mutex<Connection>>`

**What goes wrong:** If `immediate_transaction` acquires the mutex (for BEGIN/COMMIT/ROLLBACK) and then the closure calls a domain method that also acquires the mutex, Rust's `std::sync::Mutex` deadlocks because it is not re-entrant — the second `lock()` call on the same thread blocks forever.

**Why it happens:** `std::sync::Mutex` is designed to be non-re-entrant. A thread that holds the lock and calls `lock()` again will deadlock. This is by design.

**How to avoid:** Change `immediate_transaction` so the closure receives `&rusqlite::Connection` directly (already locked), not `&GooseStore`. All 9 call sites of `immediate_transaction` must be updated: closure bodies that call `store.conn.execute(...)` become `conn.execute(...)`, and closures that call public store methods (like `store.insert_activity_metrics(...)`) must inline their SQL or be restructured.

**Warning signs:** Test hangs instead of failing. `cargo test` appears to freeze on any test that exercises `insert_exercise_session`, `insert_exercise_sessions_batch`, `insert_v24_biometric_batch`, `backfill_streams_from_decoded_frames`, `mirror_overnight_batch`, or bridge activity calls.

### Pitfall 2: Private field access in submodules

**What goes wrong:** `store/sleep.rs` is compiled as `mod sleep;` inside `store/mod.rs`. Child submodules cannot access private fields of types defined in the parent module. `self.conn` in a domain file will produce "field `conn` of struct `GooseStore` is private".

**Why it happens:** Rust visibility rules: `private` = accessible only in the declaring module and its descendants only if field is `pub(super)` or wider.

**How to avoid:** Declare `conn` as `pub(super)` in `GooseStore`:
```rust
pub struct GooseStore {
    pub(super) conn: Arc<Mutex<Connection>>,
}
```
This gives all files under `store/` access while keeping it private from `bridge/`, `lib.rs`, and external crates.

**Warning signs:** Compile error "field `conn` of struct `GooseStore` is private" in domain files.

### Pitfall 3: Tests that access `store.conn` directly

**What goes wrong:** Several `#[cfg(test)]` blocks at the end of store.rs (lines 9444, 9591, 9595) and within domain-level test modules access `store.conn.execute(...)` directly. After changing `conn` to `Arc<Mutex<Connection>>`, these must become `store.conn.lock().unwrap().execute(...)` (inside `#[cfg(test)]`, `.unwrap()` is allowed — the `deny(clippy::unwrap_used)` attr uses `cfg_attr(not(test), ...)`).

**Why it happens:** In-module tests have access to private fields. The field type changes but the access pattern must be updated.

**How to avoid:** After changing the struct field, grep for `\.conn\.` and update all occurrences. Inside `#[cfg(test)]` blocks, `.unwrap()` is permitted by the existing `#![cfg_attr(not(test), deny(clippy::unwrap_used))]`.

**Warning signs:** Compile errors in test modules: "no method named `execute` found for type `Arc<Mutex<Connection>>`".

### Pitfall 4: `store.rs` → `store/mod.rs` and forgetting to delete the old file

**What goes wrong:** If `src/store.rs` exists AND `src/store/` directory exists, Rust will error: "file found to be dirtied alongside module file".

**How to avoid:** The migration task must `git rm src/store.rs` as part of creating `src/store/mod.rs`.

### Pitfall 5: Private validation helpers not visible to domain files

**What goes wrong:** store.rs has private validation functions (`validate_required`, `validate_allowed`, `is_allowed_activity_type`, `is_allowed_sync_status`, etc.) defined after line ~8026. Domain files calling these helpers won't compile because they are private to the `store` module scope as it currently stands.

**How to avoid:** These helpers must be declared in `store/mod.rs` (not in any domain file) so they are in scope for all submodules via `use super::validate_allowed;` or just `validate_allowed(...)` since submodules inherit the parent module's namespace.

Actually in Rust, functions defined in a parent module are NOT automatically in scope in child modules. Child modules must explicitly import them: `use super::validate_required;`. Plan for these explicit imports in each domain file that uses them.

**Private helpers to move to mod.rs:** `validate_required`, `validate_allowed`, `is_allowed_activity_type`, `is_allowed_sync_status`, `is_allowed_detection_method`, `is_allowed_interval_type`, `is_allowed_label_type`, `is_allowed_metric_unit`, `is_allowed_external_sleep_platform`, `is_allowed_external_sleep_stage_kind`, `is_allowed_sleep_correction_label_type`, `sha256_hex`, `is_allowed_calibration_label_source`, `is_allowed_profile_platform_context`, `configure_read_write_connection`, `configure_read_only_connection`.

---

## Code Examples

### GooseStore struct — before and after

```rust
// BEFORE (store.rs:166)
#[derive(Debug)]
pub struct GooseStore {
    conn: Connection,
}

// AFTER (store/mod.rs)
use std::sync::{Arc, Mutex};
use rusqlite::Connection;

#[derive(Debug)]
pub struct GooseStore {
    pub(super) conn: Arc<Mutex<Connection>>,
}
```

### open_in_memory — updated for Arc<Mutex>

```rust
// store/mod.rs
pub fn open_in_memory() -> GooseResult<Self> {
    let conn = Connection::open_in_memory()?;
    configure_read_write_connection(&conn)?;
    let store = Self { conn: Arc::new(Mutex::new(conn)) };
    store.migrate()?;
    Ok(store)
}
```

### Domain method — standard lock acquisition pattern

```rust
// store/sleep.rs
use super::GooseStore;
use crate::{GooseError, GooseResult};
use rusqlite::params;

impl GooseStore {
    pub fn insert_external_sleep_session(
        &self,
        input: ExternalSleepSessionInput<'_>,
    ) -> GooseResult<bool> {
        let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
        let changed = conn.execute(
            "INSERT OR IGNORE INTO external_sleep_sessions (...) VALUES (...)",
            params![...],
        )?;
        Ok(changed > 0)
    }
}
```

### immediate_transaction — updated signature

```rust
// store/mod.rs
pub fn immediate_transaction<F, T>(&self, operation: F) -> GooseResult<T>
where
    F: FnOnce(&Connection) -> GooseResult<T>,   // ← &Connection not &GooseStore
{
    let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")?;
    match operation(&conn) {
        Ok(value) => {
            conn.execute_batch("COMMIT")?;
            Ok(value)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}
```

### migrate() — must acquire lock

```rust
// store/mod.rs
pub fn migrate(&self) -> GooseResult<()> {
    let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
    conn.execute_batch(r#"PRAGMA foreign_keys = ON; ..."#)?;
    Ok(())
}
```

### schema_version — updated

```rust
pub fn schema_version(&self) -> GooseResult<i64> {
    let conn = self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?;
    let version: i64 = conn.query_row(
        "SELECT MAX(version) FROM goose_schema_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}
```

### Test helper in cfg(test) — updated

```rust
#[cfg(test)]
mod some_domain_tests {
    use super::*;

    fn make_store() -> GooseStore {
        GooseStore::open_in_memory().expect("open in-memory store")
    }

    #[test]
    fn test_direct_conn_access() {
        let store = make_store();
        // .unwrap() is allowed inside #[cfg(test)] due to cfg_attr(not(test), deny(...))
        store.conn.lock().unwrap().execute(
            "INSERT INTO ...",
            [],
        ).expect("insert should succeed");
    }
}
```

---

## Schema Validation Status (SC2)

**SC2 is already implemented.** The existing `open_existing_current()` method (lines 1064-1075) returns an error if `schema_version != CURRENT_SCHEMA_VERSION`:

```rust
pub fn open_existing_current(path: &Path) -> GooseResult<Self> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    configure_read_write_connection(&conn)?;
    let store = Self { conn };
    let schema_version = store.schema_version()?;
    if schema_version != CURRENT_SCHEMA_VERSION {
        return Err(GooseError::message(format!(
            "database schema version {schema_version} is not current {CURRENT_SCHEMA_VERSION}"
        )));
    }
    Ok(store)
}
```

The planner does not need to create tasks for SC2 beyond preserving this code in `store/mod.rs`.

---

## Integration Test Impact

**`Rust/core/tests/store_tests.rs`** imports at line 13-22:
```rust
use goose_core::store::{
    ActivityIntervalInput, ActivityLabelInput, ActivityMetricInput, ActivitySessionInput,
    AlgorithmPreferenceRecord, CURRENT_SCHEMA_VERSION, CalibrationLabelInput,
    CaptureSessionInput, CommandValidationRecord, DailyActivityMetricInput,
    DailyRecoveryMetricInput, DebugCommandRow, DebugEventRow, DebugSessionRow,
    DecodedFrameInput, ExternalSleepSessionInput, ExternalSleepStageInput, GooseStore,
    GravityRow, HourlyActivityMetricInput, MetricDebugFeatureInput, MetricProvenanceInput,
    RawEvidenceInput, StepCounterSampleInput,
};
```

All these types must remain pub-exported from `goose_core::store` (i.e., defined in `store/mod.rs`). No changes to test code are required — the public API is unchanged.

The test file also accesses `GooseStore::open_in_memory()` — this stays in `store/mod.rs`.

---

## `bridge/` Impact

`bridge/mod.rs` line 23:
```rust
use crate::store::{CURRENT_SCHEMA_VERSION, GooseStore};
```

`open_bridge_store()` (line 687) and `open_bridge_store_hot()` (line 696) call `GooseStore::open()` and `GooseStore::open_existing_current()` — both stay in `store/mod.rs`. No changes needed in `bridge/`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in (`cargo test`) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cd Rust/core && cargo test store -- --test-threads=1` |
| Full suite command | `cd Rust/core && cargo test --locked` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-02 | All 139 public methods callable after split | integration | `cd Rust/core && cargo test --locked` | Yes — `tests/store_tests.rs` |
| ARCH-02 | Arc<Mutex<Connection>> does not deadlock | integration | `cd Rust/core && cargo test store -- --test-threads=1` | Yes — existing tests exercise all paths |
| ARCH-02 | Schema version check returns error on mismatch | unit | `cd Rust/core && cargo test schema_version` | Yes — existing tests cover `open_existing_current` |

### Sampling Rate
- **Per task commit:** `cd Rust/core && cargo test --locked 2>&1 | tail -5`
- **Per wave merge:** `cd Rust/core && cargo test --locked`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. No new test files needed.

---

## Security Domain

`security_enforcement: true` in config. ASVS Level 1.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | yes (existing) | `validate_required`, `validate_allowed` already in store.rs — move to mod.rs |
| V6 Cryptography | no | No new crypto |
| V2/V3 Auth/Session | no | Store layer has no auth |

This phase introduces no new security surface. The split is mechanical. The only security-adjacent concern is ensuring the `validate_*` private helpers remain accessible to domain files (via `super::` imports).

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. This phase is a pure Rust source refactoring; only `cargo` (already available) is needed.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Single `store.rs` 9,944 lines | `store/` directory with 5 files | Editor navigation, review diff size, module clarity |
| `conn: Connection` (single-threaded) | `conn: Arc<Mutex<Connection>>` | Enables domain files to share same connection; no multi-threading benefit in this codebase since Rust bridge calls are synchronous from Swift |

**Note:** `Arc<Mutex<Connection>>` is added for architectural consistency with D-02, not because concurrent access is required. The Rust bridge is called synchronously from Swift, so there is no actual concurrent access. The Arc<Mutex wrapping is purely structural to satisfy the multi-impl-block pattern cleanly.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | grep count of 139 vs CONTEXT.md's 140 — one method's `pub fn` is split across two lines | Method-to-File Mapping | Planner might miss one method; mitigated by line-number-based mapping |
| A2 | debug sessions/commands/events belong in `activity.rs` (not a separate `debug.rs`) | Method-to-File Mapping | Minor: planner may move them; grouping is Claude's discretion |
| A3 | gravity/resp/v24_biometric belong in `metrics.rs` rather than `capture.rs` | Method-to-File Mapping | Minor: they are sensor data, could go in capture; grouping is Claude's discretion |

---

## Open Questions

1. **`immediate_transaction` call sites in `capture_import.rs` (line 248)**
   - What we know: `capture_import.rs` is a non-store file that calls `store.immediate_transaction(|store| {...})` and uses `store.conn` inside the closure.
   - What's unclear: After changing the closure signature to `|conn: &Connection|`, this external call site must also be updated.
   - Recommendation: The planner should include a task for updating `capture_import.rs` in addition to the 8 call sites inside `store.rs` and `bridge/`.

2. **Where should `#[cfg(test)]` inline test modules go?**
   - What we know: store.rs has 8+ `#[cfg(test)] mod *_tests { ... }` blocks at lines 8992, 9114, 9251, 9414, 9742, 9832. These access `store.conn` directly.
   - What's unclear: Claude's discretion — they can stay in mod.rs or split by domain.
   - Recommendation: Keep all in-module tests in `store/mod.rs` for this phase (simpler, lower risk). Tests in `store_tests.rs` (integration) remain in `tests/` unchanged.

---

## Sources

### Primary (HIGH confidence)
- `Rust/core/src/store.rs` — verified directly; all line numbers, method counts, field definitions, test patterns [VERIFIED: codebase grep]
- `Rust/core/src/bridge/mod.rs` — verified `open_bridge_store` and imports [VERIFIED: codebase grep]
- `Rust/core/tests/store_tests.rs` — verified import list and test patterns [VERIFIED: codebase read]
- `Rust/core/Cargo.toml` — verified rusqlite 0.40 bundled, edition 2024, MSRV 1.96 [VERIFIED: codebase read]
- `.planning/phases/87-store-rs-split/87-CONTEXT.md` — locked decisions D-01 through D-04 [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- Rust reference — module system (mod.rs resolution, visibility rules, multi-impl blocks) [ASSUMED from training; well-established Rust behaviour]
- rusqlite docs — `Connection` is `!Sync`, `Arc<Mutex<Connection>>` is the standard pattern [ASSUMED from training; verified indirectly by D-02 decision]

---

## Metadata

**Confidence breakdown:**
- Method-to-file mapping: HIGH — derived directly from grep of store.rs with line numbers
- `immediate_transaction` deadlock risk: HIGH — verified by reading all 9 call sites
- `pub(super)` field visibility requirement: HIGH — Rust language rule
- Arc<Mutex<Connection>> thread-safety: HIGH — standard Rust pattern, no new dependencies
- Schema validation SC2 already implemented: HIGH — verified open_existing_current() source

**Research date:** 2026-06-15
**Valid until:** Indefinite (no external dependencies; only changes if store.rs is modified before Phase 87 executes)
