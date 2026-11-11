# AUDIT-02: Security Audit — Rust Bridge & Store Layer

**Files reviewed:**
- `Rust/core/src/bridge.rs` (FFI bridge, JSON dispatch, SQL calls)
- `Rust/core/src/store.rs` (SQL queries, schema, parameterisation)

**Date:** 2026-06-08
**Reviewer:** AUDIT-02 adversarial review pass

---

## Summary

Both files are structurally sound: all user-supplied values that land in SQL
`WHERE`/`VALUES` clauses are parameterised via rusqlite `params![]`. The
`STREAM_ALLOWLIST` correctly blocks SQL injection via table-name interpolation
in `mark_synced_rows`, `rows_pending_upload`, and `prune_synced_stream_rows`.

Four issues were found:

| ID | Severity | Area |
|----|----------|------|
| SEC-01 | HIGH | Negative `limit` in `rows_pending_upload` removes `LIMIT` guard entirely |
| SEC-02 | HIGH | `database_path` / `output_dir` / `input_path` / `output_path` / `path` accepted without path-traversal validation |
| SEC-03 | MEDIUM | `STREAM_ALLOWLIST` includes `spo2_samples`, `skin_temp_samples`, `resp_samples`, `gravity` — tables whose `synced` column is added by a migration helper, not by the base `CREATE TABLE` DDL, leaving schema and allowlist permanently out of sync and test coverage absent for these streams |
| SEC-04 | LOW | `rows_pending_upload` silently replaces NaN/Infinity real values with `0` when serialising to JSON, corrupting biometric data without any error signal |

---

## SEC-01 — HIGH: Negative `limit` in `rows_pending_upload` removes row cap

**File:** `Rust/core/src/store.rs:7112–7155`
**Also affected:** `Rust/core/src/bridge.rs:3665–3691` (no validation before dispatch)

### Issue

`rows_pending_upload` accepts `limit: i64` and passes it unchanged to
`LIMIT ?1` in SQLite. SQLite documents that `LIMIT -1` (and any negative
value) disables the limit and returns **all matching rows**. A caller that
passes `limit = -1` (or any negative integer) from the Swift side will cause
the store to deserialise every unsynced row in the stream table into a
`Vec<serde_json::Value>` in memory, with no upper bound.

For large or corrupted databases this is a memory-exhaustion vector: an
adversary who can craft the JSON payload (or a bug on the Swift side) can
allocate unbounded heap memory in the Rust library, killing the iOS app
process.

Compare with `compact_raw_evidence_payloads_to_limit` (line 5112) which
correctly calls `validate_non_negative("limit_bytes", limit_bytes)` before
proceeding.

```rust
// store.rs:7112 — current (vulnerable)
pub fn rows_pending_upload(
    &self,
    stream: &str,
    limit: i64,          // ← i64; SQLite LIMIT -1 = no limit
) -> GooseResult<Vec<serde_json::Value>> {
    if !STREAM_ALLOWLIST.contains(&stream) {
        return Err(GooseError::message(format!("unknown stream: {stream}")));
    }
    // ...
    let sql = format!("SELECT rowid, * FROM {stream} WHERE synced=0 ORDER BY ts LIMIT ?1");
```

### Fix

Add the same guard used elsewhere:

```rust
pub fn rows_pending_upload(
    &self,
    stream: &str,
    limit: i64,
) -> GooseResult<Vec<serde_json::Value>> {
    if !STREAM_ALLOWLIST.contains(&stream) {
        return Err(GooseError::message(format!("unknown stream: {stream}")));
    }
    if limit <= 0 {
        return Err(GooseError::message("limit must be a positive integer"));
    }
    // ...
```

Also consider an application-level maximum (e.g. `limit > 10_000` →
error) to bound worst-case allocation even for valid callers.

---

## SEC-02 — HIGH: Path traversal — `database_path`, `output_dir`, and file paths are accepted without validation

**Files:**
- `Rust/core/src/bridge.rs:8878–8883` (`open_bridge_store`)
- `Rust/core/src/bridge.rs:4523–4558` (`raw_export_bridge` — `output_dir`, `zip_output_path`)
- `Rust/core/src/bridge.rs:4643–4651` (`privacy_lint_bridge` — `path`)
- `Rust/core/src/bridge.rs:4698–4712` (`capture_sanitize_bridge` — `input_path`, `output_path`)

### Issue

Every bridge method that accepts file-system paths (`database_path`, `output_dir`,
`zip_output_path`, `path`, `input_path`, `output_path`) passes them directly to
`Path::new(...)` and then to OS calls without canonicalisation, prefix-checking,
or `..` component rejection.

```rust
// bridge.rs:8878 — open_bridge_store
fn open_bridge_store(database_path: &str) -> GooseResult<GooseStore> {
    if database_path.trim().is_empty() {
        return Err(GooseError::message("database_path is required"));
    }
    GooseStore::open(Path::new(database_path))   // ← no traversal check
}
```

Under normal operation the Swift caller supplies a fixed, sandboxed path
(`ApplicationSupport/GooseSwift/goose.sqlite`). However:

1. On a jailbroken device or iOS Simulator, any JSON that reaches
   `goose_bridge_handle_json` can supply `"database_path": "../../Library/..."`.
   The Rust library will open (and migrate / write) that file.
2. `export.raw_timeframe` with a crafted `output_dir` or `zip_output_path`
   can write files to arbitrary locations writable by the process.
3. `capture.sanitize` with crafted `input_path`/`output_path` can read from or
   write to arbitrary locations.

In the current architecture the bridge is synchronous and called from the
main app process, so the blast radius is bounded by the iOS app sandbox on
non-jailbroken devices. But the Rust library makes no attempt to enforce any
path policy of its own, relying entirely on OS-level sandboxing — a single
point of failure.

### Fix

Add a path validation helper and call it from `open_bridge_store` and each
file-path bridge function:

```rust
/// Reject paths containing `..` components to prevent traversal.
/// On iOS all valid database paths are absolute and within the app container.
fn validate_no_traversal(label: &str, path: &str) -> GooseResult<()> {
    if Path::new(path).components().any(|c| c == std::path::Component::ParentDir) {
        return Err(GooseError::message(format!(
            "{label}: path traversal (.. component) is not permitted"
        )));
    }
    Ok(())
}
```

Call it before `Path::new(...)` in `open_bridge_store`, `raw_export_bridge`,
`privacy_lint_bridge`, and `capture_sanitize_bridge`.

---

## SEC-03 — MEDIUM: `STREAM_ALLOWLIST` includes tables whose `synced` column is absent from base DDL — silent runtime failure on fresh databases

**File:** `Rust/core/src/store.rs`

| Line | Location |
|------|----------|
| 694–703 | `STREAM_ALLOWLIST` definition |
| 1562–1606 | `CREATE TABLE` for `spo2_samples`, `skin_temp_samples`, `resp_samples`, `sig_quality_samples` — no `synced` column |
| 1538–1546 | `CREATE TABLE` for `gravity` — no `synced` column |
| 7045–7057 | `ensure_synced_columns()` adds the column post-hoc during `migrate()` |

### Issue

The `STREAM_ALLOWLIST` contains `"spo2_samples"`, `"skin_temp_samples"`,
`"resp_samples"`, and `"gravity"`. None of these tables declare a `synced`
column in their base `CREATE TABLE` DDL. A `synced` column is added lazily by
`ensure_synced_columns()` (line 7045), which is called from `migrate()`.

This means:

- **For the normal code path** (`GooseStore::open` → `migrate()`) the column
  exists by the time `rows_pending_upload` or `mark_synced_rows` is called —
  so these succeed.
- **For `GooseStore::open_read_only`** (line 1028–1031) `migrate()` is NOT
  called, and `ensure_synced_columns` never runs. Any code path that opens a
  read-only store and then (directly or indirectly) calls a synced-column method
  on these tables will receive a SQL error at runtime rather than at compile
  time.
- The structural gap between the DDL and the allowlist makes the schema
  harder to audit: a reader of the `CREATE TABLE` statements cannot determine
  which tables support the sync pattern without also reading `ensure_synced_columns`.
- No test in the suite calls `rows_pending_upload` or `mark_synced_rows` on
  `spo2_samples`, `skin_temp_samples`, `resp_samples`, or `gravity` — the
  tests all use `hr_samples` (which has `synced` in its DDL). A regression
  in `ensure_synced_columns` would go undetected.

### Fix

Add `synced INTEGER NOT NULL DEFAULT 0` to the `CREATE TABLE` DDL for each of
the four affected tables. Keep `ensure_synced_columns` for backward migration
compatibility, but the DDL should be the source of truth:

```sql
CREATE TABLE IF NOT EXISTS spo2_samples (
    device_id TEXT NOT NULL,
    ts REAL NOT NULL,
    red INTEGER NOT NULL,
    ir INTEGER NOT NULL,
    contact INTEGER NOT NULL DEFAULT 1,
    synced INTEGER NOT NULL DEFAULT 0,   -- add this
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(device_id, ts)
);
```

And add integration tests that call `rows_pending_upload("spo2_samples", 10)`,
`mark_synced_rows("spo2_samples", &[rowid])`, and `prune_synced_stream_rows("gravity", ts)`.

---

## SEC-04 — LOW: NaN/Infinity silently coerced to `0` in `rows_pending_upload` JSON serialisation

**File:** `Rust/core/src/store.rs:7136–7139`

### Issue

When serialising real-valued columns from a stream table row, the code uses:

```rust
rusqlite::types::ValueRef::Real(v) => serde_json::Value::Number(
    serde_json::Number::from_f64(v)
        .unwrap_or_else(|| serde_json::Number::from(0)),  // ← silent corruption
),
```

`serde_json::Number::from_f64` returns `None` for `NaN`, `+Infinity`, and
`-Infinity` (values that are not valid JSON numbers). The `unwrap_or_else`
silently replaces these with `0`. If a biometric stream table ever contains
a `ts = NaN` or `ts = Infinity` row (possible via a bug in a sensor ingest
path), the row appears in the upload batch with `ts = 0` (Unix epoch, January 1970),
corrupting the time-series on the server side with no error signal back to the caller.

### Fix

Return an error or skip the row explicitly rather than silently substituting 0:

```rust
rusqlite::types::ValueRef::Real(v) => {
    match serde_json::Number::from_f64(v) {
        Some(n) => serde_json::Value::Number(n),
        None => return Err(rusqlite::Error::InvalidColumnType(
            i,
            name.clone(),
            rusqlite::types::Type::Real,
        )),
    }
}
```

Alternatively, if non-finite values are expected for non-critical columns,
map them to `serde_json::Value::Null` and document the behaviour.

---

## Findings not raised

The following areas were checked and found clean:

- **SQL injection via parameterisation:** All `INSERT`, `UPDATE`, `SELECT` statements
  in `store.rs` that accept user-supplied scalar values use `params![]` binding.
  No string formatting of user-controlled values into SQL query bodies was found
  outside of the table-name paths explicitly guarded by `STREAM_ALLOWLIST` and
  `is_known_table`.
- **Stream allowlist enforcement:** `mark_synced_rows`, `rows_pending_upload`,
  and `prune_synced_stream_rows` all check `STREAM_ALLOWLIST` before constructing
  the dynamic SQL. The test at line 9142–9148 covers injection attempts.
- **Enum/string field validation:** `activity_type`, `sync_status`,
  `detection_method`, `interval_type`, `label_type`, `unit`, `source_kind`,
  `platform`, and `stage_kind` are all validated against allowlists before
  persistence (lines 7676–7748). These fields pass through SQL as bound
  parameters, so even without validation they could not inject SQL; the
  validation provides an additional correctness layer.
- **FFI null pointer handling:** `goose_bridge_handle_json` checks for a null
  `request_json` pointer and returns a structured error instead of
  dereferencing it (line 2832–2838).
- **Panic safety at FFI boundary:** `catch_unwind` wraps the entire dispatch
  path (line 2857) preventing Rust panics from crossing the FFI boundary and
  causing UB in Swift.
- **Integer overflow in `mark_synced_rows` placeholder generation:** The
  `(1..=row_ids.len()).map(|i| format!("?{i}"))` loop is bounded by the
  number of submitted row IDs; no overflow path exists.
- **Negative float-to-unsigned cast in `unix_f64_to_iso8601`:** Since Rust
  1.45, `f64 as u64` saturates to 0 for negative values (no longer UB).
  Negative timestamps produce an incorrect epoch date rather than a crash.
  This is a correctness issue on the calling side, not a security vulnerability.
- **`table_columns_unchecked` unquoted table name in PRAGMA:** Called only
  from internal migration helpers with hardcoded table names — not
  user-reachable.

---

_Audit performed: 2026-06-08_
_Scope: bridge.rs (FFI dispatch) + store.rs (SQL layer)_
_Finding count: 4 (2 HIGH, 1 MEDIUM, 1 LOW)_
