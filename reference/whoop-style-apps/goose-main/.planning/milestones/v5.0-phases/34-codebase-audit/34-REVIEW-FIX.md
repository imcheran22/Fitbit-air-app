---
phase: 34
fixed_at: 2026-06-08T00:00:00Z
review_path: .planning/phases/34-codebase-audit/
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 34: Code Review Fix Report — Codebase Audit HIGH Findings

**Fixed at:** 2026-06-08
**Source reviews:** AUDIT_CORRECTNESS.md, AUDIT_SECURITY.md, AUDIT_PERFORMANCE.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 HIGH findings (4 correctness, 2 security, 3 performance)
- Fixed: 9
- Skipped: 0

---

## Fixed Issues

### A-01: Keytel calorie formula divisor (unit error)

**File modified:** `Rust/core/src/energy_rollup.rs`
**Applied fix:** Replaced divisor `251.04` with `4.1868_f64` in `keytel_active_kcal_per_min`.
The Keytel (2005) formulas produce kJ/min; 1 kcal = 4.1868 kJ, so dividing by 4.1868 gives kcal/min.
The old divisor 251.04 (= 60 × 4.1868) would give kcal/hr, making every calorie figure ~60x too small.
Updated the doc comment accordingly.

---

### A-02: O(n²) gravity smoothing in exercise_detection

**File modified:** `Rust/core/src/exercise_detection.rs`
**Applied fix:** Replaced the O(n²) inner-loop centred window with an O(n) causal two-pointer
sliding window over `[ts - MOTION_SMOOTH_S, ts]`. The gravity rows are sorted by `ts` once,
then a `left` pointer advances as the window tail falls out of range, accumulating a rolling sum.
This reduces a potential ~2×10⁹ iterations (45k rows at 25 Hz) to a single linear pass.

---

### A-03: pnn50 underflow guard

**File modified:** `Rust/core/src/metrics.rs`
**Applied fix:** Added `if values.len() < 2 { return 0.0; }` at the top of `pnn50`. Without this
guard, `values.len() - 1` on a `usize` with `len == 1` wraps to `usize::MAX`, producing a
near-zero fraction rather than a crash — a silent wrong result. The guard makes the function safe
to call with any slice length.

---

### A-04: NaN guard in ACWR chronic_load

**File modified:** `Rust/core/src/metrics.rs`
**Applied fix:** Changed the `chronic_load == 0.0` guard to `!chronic_load.is_finite() || chronic_load == 0.0`.
If any of the 28 daily strain inputs is NaN, `chronic_load` becomes NaN; `NaN == 0.0` is `false`,
so the old code would compute `acute / NaN = NaN` which `clamp(0, 3)` does not sanitise.
The new guard returns `None` for any non-finite chronic load.

---

### SEC-01: Negative limit guard in rows_pending_upload

**File modified:** `Rust/core/src/store.rs`
**Applied fix:** Added `if limit <= 0 { return Err(...) }` immediately after the STREAM_ALLOWLIST
check in `rows_pending_upload`. SQLite `LIMIT -1` disables the row cap entirely, making this a
memory-exhaustion vector. The guard matches the pattern used elsewhere in the store
(e.g., `validate_non_negative` for other numeric inputs).

---

### SEC-02: Path traversal in database_path

**File modified:** `Rust/core/src/bridge.rs`
**Applied fix:** Added `validate_no_traversal(label, path)` helper that rejects any path
containing a `..` (ParentDir) component via `Path::new(path).components()`. Called from
`open_bridge_store` before `GooseStore::open` — this is the single choke-point for all
`database_path` arguments across every bridge method.

---

### PERF-01: Missing index on synced column

**File modified:** `Rust/core/src/store.rs`
**Applied fix:** Added four `CREATE INDEX IF NOT EXISTS` statements in the schema migration
block, one per stream table that has a `synced` column and is in `STREAM_ALLOWLIST`:
- `idx_hr_samples_synced_ts ON hr_samples(synced, ts)`
- `idx_rr_intervals_synced_ts ON rr_intervals(synced, ts)`
- `idx_events_synced_ts ON events(synced, ts)`
- `idx_battery_synced_ts ON battery(synced, ts)`

These cover the `WHERE synced=0 ORDER BY ts LIMIT ?1` query in `rows_pending_upload`.
Using `IF NOT EXISTS` makes the DDL idempotent for existing databases.

---

### PERF-02: HashMap rebuild in Cole-Kripke per epoch

**File modified:** `Rust/core/src/sleep_staging.rs`
**Applied fix:** Moved the `HashMap<i64, f64>` construction out of `cole_kripke_d_score` and
into each caller (`stage_sleep`, `stage_sleep_four_class`) before their epoch loops. The function
signature now accepts `lookup: &HashMap<i64, f64>` as a parameter. For an 8-hour sleep session
(480 1-minute epochs), this reduces 480 redundant HashMap allocations to 1.

---

### PERF-03: N transactions for exercise session inserts

**Files modified:** `Rust/core/src/store.rs`, `Rust/core/src/bridge.rs`
**Applied fix:** Added `insert_exercise_sessions_batch(&[ExerciseSessionRow]) -> GooseResult<usize>`
in `store.rs` that wraps all INSERT OR IGNORE statements in a single `immediate_transaction`.
Updated `exercise_detect_sessions_bridge` in `bridge.rs` to build a `Vec<ExerciseSessionRow>`
from all detected sessions and call `insert_exercise_sessions_batch` once, replacing the
prior per-session loop that acquired and released a write lock for each session.

---

## Skipped Issues

None — all 9 HIGH findings were successfully fixed.

---

## Test Results

```
test result: ok. 128 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.79s
```

All existing tests continue to pass after the fixes.

---

_Fixed: 2026-06-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
