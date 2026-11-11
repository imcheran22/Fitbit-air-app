# AUDIT-03: Performance Audit — Phase 34 Codebase Audit

**Scope:** `Rust/core/src/store.rs`, `Rust/core/src/bridge.rs`, `Rust/core/src/sleep_staging.rs`
**Date:** 2026-06-08
**Auditor:** AUDIT-03 agent

---

## Summary

7 performance findings identified. The store layer is largely sound for a single-user iOS app, but four patterns will degrade measurably as the database grows and as real-time BLE capture increases in volume. Two are architectural (missing index on hot query path, O(N²) HashMap rebuild per epoch); two are transaction-scope issues (N+1 inserts without prepare reuse, unbatched gravity inserts).

---

## Findings

### PERF-01 — [HIGH] `rows_pending_upload` scans entire table; no index on `synced` column

**File:** `Rust/core/src/store.rs:7121`
**Tables affected:** `hr_samples`, `rr_intervals`, `events`, `battery`, `gravity`, `spo2_samples`, `skin_temp_samples`, `resp_samples`, `sig_quality_samples`

**Issue:**
`rows_pending_upload` executes:
```sql
SELECT rowid, * FROM {stream} WHERE synced=0 ORDER BY ts LIMIT ?1
```
No index exists on `synced` across any stream table. The only indices are composite `(device_id, ts)` — which SQLite cannot use for a `WHERE synced=0 ORDER BY ts` scan. Every call performs a full table scan sorted by `ts`. For `hr_samples` in a 6-month-old database (BLE at ~1 Hz = ~15M rows/year), this is a full-table scan on every upload poll cycle.

**Index definitions (lines 1636, 1647, 1659, 1670):**
```sql
CREATE INDEX IF NOT EXISTS idx_hr_samples_device_ts ON hr_samples(device_id, ts);
-- no idx on (synced, ts) or (synced) alone
```

**Fix:** Add a partial-index per stream table that covers the pending-upload query path:
```sql
CREATE INDEX IF NOT EXISTS idx_hr_samples_synced_ts ON hr_samples(synced, ts) WHERE synced = 0;
CREATE INDEX IF NOT EXISTS idx_rr_intervals_synced_ts ON rr_intervals(synced, ts) WHERE synced = 0;
CREATE INDEX IF NOT EXISTS idx_events_synced_ts ON events(synced, ts) WHERE synced = 0;
CREATE INDEX IF NOT EXISTS idx_battery_synced_ts ON battery(synced, ts) WHERE synced = 0;
```
SQLite partial indexes (`WHERE synced = 0`) shrink the index to only unsynced rows and are immediately usable by the `WHERE synced=0 ORDER BY ts` query plan.

---

### PERF-02 — [HIGH] `cole_kripke_d_score` rebuilds a `HashMap` on every epoch call — O(N²) total

**File:** `Rust/core/src/sleep_staging.rs:614-629`

**Issue:**
`cole_kripke_d_score` is called once per epoch inside the tight loop at line 242-254. Its first action every call is to construct a `HashMap<i64, f64>` from the entire `activity_counts` slice:
```rust
fn cole_kripke_d_score(i: usize, activity_counts: &[(i64, f64)]) -> f64 {
    use std::collections::HashMap;
    let lookup: HashMap<i64, f64> =
        activity_counts.iter().map(|&(idx, cnt)| (idx, cnt)).collect(); // rebuilt every call
    ...
}
```
For an 8-hour sleep session at 1-minute epochs, N = 480. The function allocates and populates a 480-entry HashMap 480 times. Total work: O(N²) allocations. For longer windows or finer granularity this compounds quickly. The HashMap heap allocation is also inside what should be a pure numeric hot path.

**Fix:** Build the lookup map once in the caller and pass it as a parameter:
```rust
// In stage_sleep / stage_sleep_four_class, before the epoch loop:
let lookup: HashMap<i64, f64> =
    activity_counts.iter().map(|&(idx, cnt)| (idx, cnt)).collect();

// Change signature:
fn cole_kripke_d_score(i: usize, activity_counts: &[(i64, f64)], lookup: &HashMap<i64, f64>) -> f64 {
    let current_epoch_idx = activity_counts[i].0;
    let mut d = 0.0_f64;
    for (coeff, &offset) in COLE_KRIPKE_COEFFS.iter().zip(COLE_KRIPKE_OFFSETS.iter()) {
        let c = COLE_KRIPKE_SCALE_FACTOR * lookup.get(&(current_epoch_idx + offset)).copied().unwrap_or(0.0);
        d += coeff * c;
    }
    d / 100.0
}
```

---

### PERF-03 — [HIGH] `exercise_detect_sessions_bridge`: N+1 transactions for session inserts, each with its own `immediate_transaction`

**File:** `Rust/core/src/bridge.rs:3766-3790`, `Rust/core/src/store.rs:6597-6622`

**Issue:**
`exercise_detect_sessions_bridge` iterates over detected sessions and calls `store.insert_exercise_session(&row)` once per session (line 3782). Each `insert_exercise_session` call wraps a single INSERT inside `immediate_transaction` (store.rs:6599), meaning each detected session acquires and releases a write lock plus a fsync-equivalent checkpoint. If 10 sessions are detected in a day's worth of data, that is 10 sequential lock/unlock/commit cycles:
```rust
for session in &sessions {               // line 3766
    ...
    match store.insert_exercise_session(&row) {  // line 3782 — 1 txn per session
```
`insert_exercise_session` does:
```rust
self.immediate_transaction(|store| {     // store.rs:6599
    store.conn.execute("INSERT OR IGNORE ...", ...)?;
    Ok(changed > 0)
})
```

**Fix:** Batch all session inserts in a single transaction in the bridge function. Extract the `INSERT OR IGNORE` SQL into a new `insert_exercise_sessions_batch` that accepts `&[ExerciseSessionRow]` and wraps the loop in one `immediate_transaction`.

---

### PERF-04 — [MEDIUM] `backfill_streams_from_decoded_frames`: unnecessary clone of full HR and RR Vec before transaction

**File:** `Rust/core/src/store.rs:7235-7237`

**Issue:**
```rust
let hr_to_insert = hr_rows.clone();     // line 7235 — full Vec clone
let rr_to_insert = rr_rows.clone();     // line 7236 — full Vec clone
let device_id_owned = device_id.to_string();

self.immediate_transaction(|store| {
    for (ts, bpm) in &hr_to_insert {
```
`hr_rows` and `rr_rows` are local `Vec`s built in the frame-parsing loop just above. They are not used after the clones. The clones exist only because the closure passed to `immediate_transaction` must satisfy borrow rules — but since the closure takes `&GooseStore` (not `self`), `hr_rows` and `rr_rows` could be moved into the closure directly. For a typical overnight session (~28,800 HR rows at 2 Hz), this is a ~230 KB unnecessary allocation.

**Fix:** Move instead of clone:
```rust
self.immediate_transaction(|store| {
    let mut hr_inserted = 0usize;
    for (ts, bpm) in &hr_rows {
        hr_inserted += store.conn.execute(...)?;
    }
    let mut rr_inserted = 0usize;
    for (ts, interval_ms) in &rr_rows {
        rr_inserted += store.conn.execute(...)?;
    }
    Ok(BackfillReport { hr_inserted, rr_inserted, events_inserted: 0, battery_inserted: 0 })
})
```
The borrow checker permits this because `hr_rows`/`rr_rows` are in the enclosing function scope, not moved into a `move` closure, and `immediate_transaction` takes `FnOnce`.

---

### PERF-05 — [MEDIUM] `insert_gravity_rows` and `insert_gravity2_batch`: row-by-row inserts without a transaction wrapper

**File:** `Rust/core/src/store.rs:6472-6490`, `6520-6538`

**Issue:**
Both gravity insert functions loop over rows issuing individual `conn.execute()` calls without an enclosing transaction:
```rust
for &(ts, x, y, z) in rows {           // store.rs:6482 / 6530
    let changed = self.conn.execute("INSERT OR IGNORE ...", ...)?;
```
SQLite in auto-commit mode (no explicit transaction) wraps each statement in an implicit transaction, meaning each row gets an individual fsync if the journal mode is DELETE (the default — no WAL pragma is set in `open()`). For a 60-second gravity burst at 25 Hz (1,500 rows), this is 1,500 individual write commits vs. 1 with a transaction.

**Note:** `insert_v24_biometric_batch` (store.rs:6665) correctly wraps its loop in `immediate_transaction`. The gravity functions are inconsistent with this pattern.

**Fix:** Wrap the insert loop in `immediate_transaction`:
```rust
pub fn insert_gravity2_batch(&self, device_id: &str, rows: &[(f64, f64, f64, f64)]) -> GooseResult<usize> {
    validate_required("device_id", device_id)?;
    if rows.is_empty() { return Ok(0); }
    self.immediate_transaction(|store| {
        let mut inserted = 0usize;
        for &(ts, x, y, z) in rows {
            inserted += store.conn.execute(
                "INSERT OR IGNORE INTO gravity2_samples (device_id, ts, x, y, z) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![device_id, ts, x, y, z],
            )?;
        }
        Ok(inserted)
    })
}
```

---

### PERF-06 — [MEDIUM] `sleep_staging_bridge`: fetches all `resp_samples` rows to check for existence

**File:** `Rust/core/src/bridge.rs:4028-4033`

**Issue:**
When `resp_available=true` (the default), the bridge calls:
```rust
let resp_count = store
    .resp_samples_between(&args.device_id, args.sleep_start_ts, args.sleep_end_ts)
    .map(|rows| rows.len())
    .unwrap_or(0);
resp_count > 0
```
`resp_samples_between` (store.rs:6582-6594) executes a full `SELECT … ORDER BY ts` and deserialises every matching row into `Vec<RespSampleRow>`. Only the length is used. For a full overnight session with data present (hundreds of rows), this allocates and deserialises a complete vector only to check `> 0`.

**Fix:** Replace with a `SELECT EXISTS` or `COUNT(*)` query, or add a dedicated `resp_samples_any_in_window` method:
```rust
pub fn resp_samples_any_in_window(&self, device_id: &str, ts_start: f64, ts_end: f64) -> GooseResult<bool> {
    let n: i64 = self.conn.query_row(
        "SELECT COUNT(*) FROM resp_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 LIMIT 1",
        params![device_id, ts_start, ts_end],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}
```
Or even more efficiently with `EXISTS`:
```sql
SELECT EXISTS(SELECT 1 FROM resp_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3)
```

---

### PERF-07 — [MEDIUM] `decoded_frames_between` JOIN on `raw_evidence.captured_at` (TEXT column) with no index — hot path for `backfill_streams`

**File:** `Rust/core/src/store.rs:5173-5204`

**Issue:**
`backfill_streams_from_decoded_frames` (line 7171) calls `decoded_frames_between`, which joins `decoded_frames` to `raw_evidence` and filters on the TEXT column `raw_evidence.captured_at`:
```sql
WHERE raw_evidence.captured_at >= ?1 AND raw_evidence.captured_at < ?2
ORDER BY raw_evidence.captured_at, decoded_frames.frame_id
```
Neither `raw_evidence` nor `decoded_frames` has any index defined in the schema (lines 1068-1099). `raw_evidence.evidence_id` is the PRIMARY KEY (auto-indexed), and `decoded_frames.evidence_id` is a FK — but there is no index on `raw_evidence.captured_at` or on `decoded_frames.evidence_id`. SQLite will therefore:
1. Full-scan `raw_evidence` to filter by `captured_at` range.
2. For each matching row, look up `decoded_frames` on `evidence_id` via a full scan (no index on the FK column).

For a 7-day backfill window this is an especially expensive double-scan.

**Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_raw_evidence_captured_at ON raw_evidence(captured_at);
CREATE INDEX IF NOT EXISTS idx_decoded_frames_evidence_id ON decoded_frames(evidence_id);
```
The second index is also required for correct FK enforcement performance and ON DELETE CASCADE performance.

---

## Finding Count by Severity

| Severity | Count |
|----------|-------|
| HIGH     | 3     |
| MEDIUM   | 4     |
| LOW      | 0     |
| **Total** | **7** |

---

## Transaction Scope Summary

| Function | Transaction Wrapping | Assessment |
|---|---|---|
| `backfill_streams_from_decoded_frames` | `immediate_transaction` — one txn for all HR+RR inserts | Correct |
| `insert_v24_biometric_batch` | `immediate_transaction` — wraps all 4 stream loops | Correct |
| `insert_exercise_session` | `immediate_transaction` per row, called N times from bridge | **PERF-03: fix needed** |
| `insert_gravity_rows` | No transaction — auto-commit per row | **PERF-05: fix needed** |
| `insert_gravity2_batch` | No transaction — auto-commit per row | **PERF-05: fix needed** |
| `mirror_overnight_batch` | `immediate_transaction` — wraps all 3 collection loops | Correct |

---

## Index Coverage Summary

| Table | Time-range index | `synced` index | FK index |
|---|---|---|---|
| `gravity2_samples` | `(device_id, ts)` — present | n/a | — |
| `exercise_sessions` | `(device_id, start_ts)` — present | n/a | — |
| `hr_samples` | `(device_id, ts)` — present | **missing** (PERF-01) | — |
| `rr_intervals` | `(device_id, ts)` — present | **missing** (PERF-01) | — |
| `events` | `(device_id, ts)` — present | **missing** (PERF-01) | — |
| `battery` | `(device_id, ts)` — present | **missing** (PERF-01) | — |
| `upload_cursors` | PRIMARY KEY `(namespace, stream)` | n/a | — |
| `raw_evidence` | **missing** on `captured_at` (PERF-07) | n/a | — |
| `decoded_frames` | — | n/a | **missing** on `evidence_id` (PERF-07) |
