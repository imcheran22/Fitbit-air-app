# Phase 116: Body Composition Rust Layer - Research

**Researched:** 2026-06-23
**Domain:** Rust bridge + SQLite store — body composition history
**Confidence:** HIGH

## Summary

The `body_composition_history` table already exists at schema v24 (Phase 113). No schema migration is needed. This phase adds two bridge methods (`body_composition.upsert` and `body_composition.history_between`) using the standard 5-location bridge pattern. The `body_composition.*` namespace has no existing domain file — it must route through a new or existing domain file. Based on the dispatcher routing structure, the best fit is a new `bridge/body_composition.rs` module registered under a new `starts_with("body_composition.")` guard. The `capabilities.rs` file (Phase 113) is the canonical pattern: one dispatcher function, Args structs, impl functions, `acquire_bridge_conn`.

**Primary recommendation:** Create `bridge/body_composition.rs` as a new domain file; add a `starts_with("body_composition.")` routing guard to the dispatcher in `mod.rs`; register the new file in the `bridge_methods_constant_matches_dispatcher` concat! block; add both methods to `BRIDGE_METHODS` between `"biometrics.v24_between"` (line 73) and `"calibration.apply"` (line 74).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `body_composition.history_between(database_path, start_date, end_date)` returns ALL sources sorted by date ascending. No source filter on the bridge — Swift filters if needed.

### Claude's Discretion
- Bridge module placement: add to existing domain file (e.g., `bridge/metrics.rs` or a new `bridge/body_composition.rs`). Researcher to determine best fit based on existing domain structure.
- Upsert behavior: INSERT OR REPLACE (consistent with UNIQUE(source, date) constraint from schema v24).
- Return shape: upsert returns `{"ok": true}`, history_between returns array of objects with all fields (weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct, source, date).
- Date format: ISO date strings ("YYYY-MM-DD") matching the existing schema.

### Deferred Ideas (OUT OF SCOPE)
- Source-filtered query variant — all sources returned (D-01); filter in Swift
- Swift UI (Phase 121)
- HealthKit import (Phase 121)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BODY-01 | `body_composition_history` SQLite table (schema v24): weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct, source CHECK('manual','healthkit','scale'); UNIQUE(source, date); bridge methods `body_composition.upsert` + `body_composition.history_between`; `BRIDGE_METHODS` updated | Table DDL verified at store/mod.rs:1922; bridge 5-location pattern confirmed; exact insertion point identified |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Upsert body composition row | Database / Storage (Rust store) | API / Bridge | Store owns SQL; bridge is the thin dispatch layer |
| Query by date range | Database / Storage (Rust store) | API / Bridge | SQLite query with WHERE date BETWEEN; bridge deserialises args and serialises result |
| JSON serialisation of rows | API / Bridge | — | Bridge maps named struct fields to serde_json::json! — store returns raw rows |

## Area 1: Schema DDL — Exact Column Names and Constraints

**Source:** `Rust/core/src/store/mod.rs` lines 1922–1932 [VERIFIED: direct codebase read]

```sql
CREATE TABLE IF NOT EXISTS body_composition_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weight_kg REAL,
    bmi REAL,
    body_fat_pct REAL,
    muscle_mass_kg REAL,
    water_pct REAL,
    source TEXT NOT NULL CHECK(source IN ('manual','healthkit','scale')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(source, date)
);
```

**Key facts:**
- All metric columns (`weight_kg`, `bmi`, `body_fat_pct`, `muscle_mass_kg`, `water_pct`) are `REAL` and nullable — all are optional on upsert.
- `source` is `TEXT NOT NULL` with a CHECK constraint limiting values to `'manual'`, `'healthkit'`, `'scale'`.
- The UNIQUE constraint is `UNIQUE(source, date)` — the combination of source + date is unique, not just date.
- `date` is `TEXT NOT NULL` — stored as ISO date string `"YYYY-MM-DD"`.
- `created_at` has a server-side default; do not pass it from Swift.
- `id` is AUTOINCREMENT — never pass it from the bridge.
- The table appears at line 3990 in the `table_names()` function, confirming it is part of the schema inventory: `"body_composition_history"`.

**INSERT OR REPLACE** (not INSERT OR IGNORE) is the correct upsert semantics because UNIQUE(source, date) should update existing values if a row already exists for that (source, date) pair.

## Area 2: Existing Store Methods for body_composition

**Source:** grep across all `Rust/core/src/store/` and `Rust/core/src/bridge/` [VERIFIED: direct codebase read]

**Result: NONE.** There are exactly two references to `body_composition` in the entire Rust codebase:

| File | Line | Content |
|------|------|---------|
| `store/mod.rs` | 1922 | DDL `CREATE TABLE IF NOT EXISTS body_composition_history (` |
| `store/mod.rs` | 3990 | `"body_composition_history"` in `table_names()` |

No `pub fn` store methods, no bridge arms, no bridge tests exist yet. Phase 116 implements everything from scratch.

## Area 3: Bridge Module Structure — Where to Place New Methods

**Source:** `Rust/core/src/bridge/` directory listing and mod.rs dispatcher [VERIFIED: direct codebase read]

### Existing domain files

| File | Dispatcher guard (`starts_with`) | Methods prefixed |
|------|----------------------------------|------------------|
| `capabilities.rs` | `"capabilities."` | capabilities.* |
| `metrics.rs` | `"metrics."`, `"metric_series."`, `"exercise."`, `"biometrics."`, `"calibration."`, `"diagnostics."` | many |
| `sleep.rs` | `"sleep."`, `"overnight."`, `"health_sync."` | sleep.*, overnight.*, health_sync.* |
| `capture.rs` | `"capture."`, `"protocol."`, `"historical_sync."`, `"sync."` | capture.*, protocol.*, etc. |
| `activity.rs` | `"activity."`, `"workout."`, `"apple_daily."`, `"journal."`, `"timeline."` | activity.*, journal.* (upsert pattern) |
| `debug.rs` | `"debug."`, `"commands."`, `"settings."`, `"storage."`, `"store."`, `"export."`, `"upload."`, `"privacy."`, `"ui_coverage."`, `"device."`, `"local_health."`, `"validation."` | debug.*, commands.*, export.*, etc. |
| `mod.rs` | inline equality guards | `"core.version"`, `"core.list_methods"`, `"openwhoop.reference_report"`, `"battery.*"` |

### Recommendation: new `bridge/body_composition.rs`

`body_composition.*` does not fit any existing domain's semantic group. The correct approach matches the Phase 113 precedent where `capabilities.rs` was created as a new domain file for a new namespace. A new `bridge/body_composition.rs` keeps the namespace clean and avoids polluting unrelated domain files.

**Required changes to `mod.rs` when adding the new domain file:**

1. Add `mod body_composition;` at the top of `bridge/mod.rs` alongside the other `mod` declarations.
2. Add a new dispatcher guard (after the `capabilities.` guard, before the `metrics.` guard, to maintain approximate alphabetical order):
   ```rust
   if method.starts_with("body_composition.") {
       return body_composition::dispatch_body_composition(&request);
   }
   ```
3. Add `include_str!("body_composition.rs")` to the `concat!()` block inside `bridge_methods_constant_matches_dispatcher` test.

## Area 4: BRIDGE_METHODS Alphabetical Insertion Point

**Source:** `Rust/core/src/bridge/mod.rs` lines 50–180 [VERIFIED: direct codebase read]

The relevant sorted neighbourhood in `BRIDGE_METHODS`:

```
line 68:  "biometrics.insert_v20v21_batch",
line 69:  "biometrics.insert_v24_batch",
line 70:  "biometrics.insert_v26_batch",
line 71:  "biometrics.optical_between",
line 72:  "biometrics.spo2_from_raw",
line 73:  "biometrics.v24_between",
          <-- INSERT: "body_composition.history_between" here
          <-- INSERT: "body_composition.upsert" here
line 74:  "calibration.apply",
line 75:  "calibration.evaluate_dataset",
```

**Exact insertion:** After `"biometrics.v24_between"` (line 73) and before `"calibration.apply"` (line 74). Both `body_composition.history_between` and `body_composition.upsert` sort before `"calibration"` (`bo` < `ca`) and after `"biometrics"` (`bo` > `bi`). Within the `body_composition.*` group, `history_between` sorts before `upsert` (`h` < `u`).

**Resulting lines after insertion:**
```
"biometrics.v24_between",
"body_composition.history_between",
"body_composition.upsert",
"calibration.apply",
```

## Area 5: Existing body_composition Tests

**Source:** `Rust/core/tests/` directory listing [VERIFIED: direct codebase read]

**Result: NONE.** No test file matching `body_composition` exists in `Rust/core/tests/`. The integration test file `Rust/core/tests/body_composition_round_trip.rs` does not exist and must be created as part of this phase.

The test file should:
- Use `GooseStore::open_in_memory().expect("open in-memory store")` (confirmed pattern from store/mod.rs lines 4007, 4129, 4269, 4445)
- Upsert two rows for different dates and/or sources
- Call `history_between` and assert the count and field values
- Test UNIQUE(source, date) replacement: upsert the same (source, date) twice and verify one row remains

## Area 6: bridge_methods_constant_matches_dispatcher Test Structure

**Source:** `Rust/core/src/bridge/mod.rs` lines 1089–1192 [VERIFIED: direct codebase read]

The test reads all domain files via `include_str!` in a `concat!()` call and scans for match arm patterns. The current `concat!()` block is:

```rust
let domain_source = concat!(
    include_str!("capabilities.rs"),
    include_str!("metrics.rs"),
    include_str!("sleep.rs"),
    include_str!("capture.rs"),
    include_str!("activity.rs"),
    include_str!("debug.rs"),
);
```

When adding `body_composition.rs`, this block MUST be updated to include:
```rust
include_str!("body_composition.rs"),
```

The test scans for lines that:
- Are trimmed and start with `"`
- Contain a `.` in the method name
- Have `=>`, `|`, or empty rest after the closing `"` (Pattern A, A2)

The test also has an `inline_methods` set for methods handled directly in `mod.rs`. The `body_composition.*` methods will be in `body_composition.rs` dispatch arms — they do NOT belong in `inline_methods`.

**What fails if the concat! is not updated:** The test will report `body_composition.history_between` and `body_composition.upsert` as "Methods in BRIDGE_METHODS with no dispatch arm" because the scanner won't see the arms in the new file.

**What fails if BRIDGE_METHODS is not updated:** The test will report the arms as "Dispatch arms not in BRIDGE_METHODS".

Both assertions must pass before committing.

## Architecture Patterns

### Bridge 5-Location Pattern (from capabilities.rs — Phase 113)

New domain file structure, verbatim from `bridge/capabilities.rs` as the template:

```rust
use serde::Deserialize;

use super::{BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok, request_args};
use crate::GooseResult;

pub(crate) fn dispatch_body_composition(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "body_composition.upsert" => request_args::<BodyCompositionUpsertArgs>(request)
            .and_then(body_composition_upsert_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "body_composition.history_between" => request_args::<BodyCompositionHistoryBetweenArgs>(request)
            .and_then(body_composition_history_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_body_composition called with non-body_composition method: {}",
            request.method
        ),
    }
}
```

### Args Structs

```rust
#[derive(Debug, Deserialize)]
struct BodyCompositionUpsertArgs {
    database_path: String,
    date: String,
    source: String,
    weight_kg: Option<f64>,
    bmi: Option<f64>,
    body_fat_pct: Option<f64>,
    muscle_mass_kg: Option<f64>,
    water_pct: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct BodyCompositionHistoryBetweenArgs {
    database_path: String,
    start_date: String,
    end_date: String,
}
```

### Bridge Impl Functions

```rust
fn body_composition_upsert_bridge(args: BodyCompositionUpsertArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    store.upsert_body_composition(
        &args.date,
        &args.source,
        args.weight_kg,
        args.bmi,
        args.body_fat_pct,
        args.muscle_mass_kg,
        args.water_pct,
    )?;
    Ok(serde_json::json!({"ok": true}))
}

fn body_composition_history_between_bridge(
    args: BodyCompositionHistoryBetweenArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.body_composition_history_between(&args.start_date, &args.end_date)?;
    let result = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "date": r.date,
                "source": r.source,
                "weight_kg": r.weight_kg,
                "bmi": r.bmi,
                "body_fat_pct": r.body_fat_pct,
                "muscle_mass_kg": r.muscle_mass_kg,
                "water_pct": r.water_pct,
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!(result))
}
```

**Critical:** The history query returns `Vec<NamedStruct>` — use named field access (`r.weight_kg`), never tuple destructuring. Tuple destructuring causes `E0308: mismatched types` at compile time.

### Store Methods (to add to store/mod.rs)

```rust
pub fn upsert_body_composition(
    &self,
    date: &str,
    source: &str,
    weight_kg: Option<f64>,
    bmi: Option<f64>,
    body_fat_pct: Option<f64>,
    muscle_mass_kg: Option<f64>,
    water_pct: Option<f64>,
) -> GooseResult<()> {
    let conn = self.conn.lock().map_err(|_| GooseError::message("mutex poisoned"))?;
    conn.execute(
        "INSERT OR REPLACE INTO body_composition_history
         (date, source, weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![date, source, weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct],
    )?;
    Ok(())
}

pub fn body_composition_history_between(
    &self,
    start_date: &str,
    end_date: &str,
) -> GooseResult<Vec<BodyCompositionRow>> {
    let conn = self.conn.lock().map_err(|_| GooseError::message("mutex poisoned"))?;
    let mut stmt = conn.prepare(
        "SELECT date, source, weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct
         FROM body_composition_history
         WHERE date >= ?1 AND date <= ?2
         ORDER BY date ASC",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![start_date, end_date], |row| {
            Ok(BodyCompositionRow {
                date: row.get(0)?,
                source: row.get(1)?,
                weight_kg: row.get(2)?,
                bmi: row.get(3)?,
                body_fat_pct: row.get(4)?,
                muscle_mass_kg: row.get(5)?,
                water_pct: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

Define the result struct near the store methods:

```rust
pub struct BodyCompositionRow {
    pub date: String,
    pub source: String,
    pub weight_kg: Option<f64>,
    pub bmi: Option<f64>,
    pub body_fat_pct: Option<f64>,
    pub muscle_mass_kg: Option<f64>,
    pub water_pct: Option<f64>,
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mutex acquisition | Custom locking | `self.conn.lock()` pattern from existing store methods | Consistent with all other store methods; avoids deadlock |
| JSON in store | bare `json!` macro | `serde_json::json!` (fully qualified) | `json!` is not in scope in store/mod.rs; causes compile error |
| Upsert logic | manual SELECT then INSERT | `INSERT OR REPLACE INTO` | UNIQUE(source, date) constraint makes this correct and atomic |
| Test store setup | file-backed temp DB | `GooseStore::open_in_memory().expect(...)` | Confirmed pattern in store/mod.rs lines 4007, 4129, 4269, 4445 |

## Common Pitfalls

### Pitfall 1: Tuple destructuring in history_between bridge map
**What goes wrong:** `|( date, source, weight_kg, ... )|` compiles only if the store returns `Vec<(...)>` tuples.
**Why it happens:** Confusion with tuple-returning query patterns elsewhere.
**How to avoid:** The store method returns `Vec<BodyCompositionRow>` (named struct). Use `|r| serde_json::json!({ "date": r.date, ... })`.

### Pitfall 2: Forgetting to update concat!() in bridge_methods_constant_matches_dispatcher
**What goes wrong:** Test reports both new methods as "Methods in BRIDGE_METHODS with no dispatch arm" even though the arms exist.
**Why it happens:** The test scans only files listed in `concat!(include_str!(...))` — new domain files must be explicitly added.
**How to avoid:** Add `include_str!("body_composition.rs"),` to the concat! block. Run `cargo test bridge_methods_constant_matches_dispatcher` to verify.

### Pitfall 3: Bare `json!` in store/mod.rs
**What goes wrong:** `cannot find macro 'json' in this scope` compile error.
**Why it happens:** `json!` is not imported in store/mod.rs; the macro is `serde_json::json!`.
**How to avoid:** Always use fully qualified `serde_json::json!` in store methods.

### Pitfall 4: Missing `mod body_composition;` declaration
**What goes wrong:** `file not found for module 'body_composition'` compile error.
**Why it happens:** Rust requires explicit `mod` declarations even for sibling files.
**How to avoid:** Add `mod body_composition;` to `bridge/mod.rs` alongside the other `mod` declarations at the top of the file.

### Pitfall 5: Missing dispatcher routing guard
**What goes wrong:** `body_composition.*` methods fall through to the end of `handle_bridge_request_inner` and return an "unknown method" error at runtime — no compile error.
**Why it happens:** The dispatcher uses prefix guards, not a single match. A new namespace needs a new guard.
**How to avoid:** Add `if method.starts_with("body_composition.") { return body_composition::dispatch_body_composition(&request); }` between the `capabilities.` and `metrics.` guards.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (built-in) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test --locked body_composition` |
| Full suite command | `cargo test --locked` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BODY-01 | upsert inserts a row | integration | `cargo test --locked body_composition_upsert` | No — Wave 0 |
| BODY-01 | upsert replaces on (source,date) collision | integration | `cargo test --locked body_composition_upsert_replace` | No — Wave 0 |
| BODY-01 | history_between returns all sources in range | integration | `cargo test --locked body_composition_history_between` | No — Wave 0 |
| BODY-01 | history_between is sorted by date ASC | integration | `cargo test --locked body_composition_history_sorted` | No — Wave 0 |
| BODY-01 | BRIDGE_METHODS sync (dispatcher test) | unit | `cargo test --locked bridge_methods_constant_matches_dispatcher` | Yes (existing test) |

### Wave 0 Gaps
- [ ] `Rust/core/tests/body_composition_round_trip.rs` — covers all BODY-01 test cases above

### Sampling Rate
- Per task commit: `cargo test --locked body_composition`
- Per wave merge: `cargo test --locked`
- Phase gate: full suite green before `/gsd-verify-work`

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure Rust/SQLite phase, no tools beyond `cargo`).

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Source CHECK constraint enforced at SQLite layer; invalid source values are rejected by the DB |
| V4 Access Control | no | Local SQLite; no network surface in this phase |
| V6 Cryptography | no | No secrets in this phase |

The source CHECK constraint (`CHECK(source IN ('manual','healthkit','scale'))`) is the primary input validation gate. The bridge does not need to re-validate source values in Rust — SQLite enforces it. An invalid source will produce a `GooseError` from rusqlite which propagates as a bridge error response.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Store method naming: `upsert_body_composition` and `body_composition_history_between` — follows project convention but not yet confirmed by existing method | Area 2 / Code Examples | Low — naming is discretionary; the planner can use any consistent name |
| A2 | `BodyCompositionRow` struct name — new type, not yet in codebase | Code Examples | Low — naming is discretionary |

## Open Questions

None — all research areas are fully resolved from direct codebase inspection.

## Sources

### Primary (HIGH confidence)
- `Rust/core/src/store/mod.rs` lines 1922–1932 — exact DDL verified
- `Rust/core/src/store/mod.rs` lines 3980–3993 — table_names() confirms body_composition_history in schema inventory
- `Rust/core/src/bridge/mod.rs` lines 50–180 — BRIDGE_METHODS exact line numbers
- `Rust/core/src/bridge/mod.rs` lines 510–600 — dispatcher routing guards
- `Rust/core/src/bridge/mod.rs` lines 1089–1192 — bridge_methods_constant_matches_dispatcher test structure and concat! block
- `Rust/core/src/bridge/capabilities.rs` — canonical new domain file pattern (Phase 113)
- `Rust/core/src/bridge/activity.rs` lines 230–327 — journal.upsert as reference upsert pattern
- grep across all Rust source — confirmed zero existing body_composition store/bridge methods

## Metadata

**Confidence breakdown:**
- Schema DDL: HIGH — read directly from store/mod.rs
- Bridge pattern: HIGH — read directly from capabilities.rs and mod.rs
- BRIDGE_METHODS insertion point: HIGH — exact line numbers confirmed
- Test structure: HIGH — read directly from mod.rs test block
- Store method design: MEDIUM — follows established patterns but new code not yet written

**Research date:** 2026-06-23
**Valid until:** No expiry — codebase facts, stable until implementation changes the files
