# Phase 116: Body Composition Rust Layer - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure Rust bridge phase. Delivers:
1. `body_composition.upsert` bridge method — upsert one row into `body_composition_history`
2. `body_composition.history_between` bridge method — query all rows in a date range, all sources
3. `BRIDGE_METHODS` constant updated

The `body_composition_history` table already exists in schema v24 (Phase 113). No schema change needed. No Swift changes in this phase.

Requirements in scope: BODY-01 (bridge methods portion — table portion already done in Phase 113)
Out of scope: BODY-02, BODY-03 (Swift UI and HealthKit import — Phase 121)

</domain>

<decisions>
## Implementation Decisions

### Query Scope
- **D-01:** `body_composition.history_between(database_path, start_date, end_date)` returns ALL sources sorted by date ascending. No source filter on the bridge — Swift filters if needed.

### Claude's Discretion
- Bridge module placement: add to existing domain file (e.g., `bridge/metrics.rs` or a new `bridge/body_composition.rs`). Researcher to determine best fit based on existing domain structure.
- Upsert behavior: INSERT OR REPLACE (consistent with UNIQUE(source, date) constraint from schema v24).
- Return shape: upsert returns `{"ok": true}`, history_between returns array of objects with all fields (weight_kg, bmi, body_fat_pct, muscle_mass_kg, water_pct, source, date).
- Date format: ISO date strings ("YYYY-MM-DD") matching the existing schema.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema (already exists)
- `Rust/core/src/store/mod.rs` line ~1922 — `body_composition_history` table DDL; verify existing field names and UNIQUE constraint

### Bridge Pattern
- `Rust/core/src/bridge/mod.rs` — BRIDGE_METHODS constant; 5-location pattern; sorted insertion point for `body_composition.*`
- `Rust/core/src/bridge/capabilities.rs` (Phase 113) — recent example of a new bridge domain module to follow as pattern
- `bridge_methods_constant_matches_dispatcher` test — must pass after BRIDGE_METHODS update

### Requirements
- `.planning/REQUIREMENTS.md` §Body Composition History (#166) — BODY-01 field list and source CHECK constraint

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `body_composition_history` table at store/mod.rs:1922 — already migrated in schema v24; use existing DDL to confirm field names
- Bridge 5-location pattern: BRIDGE_METHODS + Args struct + dispatcher arm + impl fn + store fn (serde_json::json! fully qualified)
- `capabilities.rs` as recent domain module example

### Established Patterns
- Store methods return `GooseResult<T>` 
- Bridge fn opens store via `GooseStore::open(&args.database_path)?`
- JSON serialization uses `serde_json::json!` (not bare `json!`)

### Integration Points
- Phase 121 (Body Composition UI) will call both bridge methods from Swift
- No iOS consumer yet — just the Rust layer this phase

</code_context>

<specifics>
## Specific Ideas

- `body_composition.upsert` args: `{ database_path, date, source, weight_kg?, bmi?, body_fat_pct?, muscle_mass_kg?, water_pct? }` — all metric fields optional
- `body_composition.history_between` args: `{ database_path, start_date, end_date }` → array of full rows

</specifics>

<deferred>
## Deferred Ideas

- Source-filtered query variant — all sources returned (D-01); filter in Swift
- Swift UI (Phase 121)
- HealthKit import (Phase 121)

</deferred>

---

*Phase: 116-Body Composition Rust Layer*
*Context gathered: 2026-06-23*
