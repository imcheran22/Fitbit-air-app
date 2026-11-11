---
plan: "116-01"
phase: "116"
status: complete
requirement: BODY-01
commit: b1eda19
---

# Plan 116-01: Body Composition Rust Bridge

## What Was Done

Added two bridge methods for the existing `body_composition_history` schema v24 table:

**New files:**
- `Rust/core/src/bridge/body_composition.rs` — domain bridge module with `BodyCompositionUpsertArgs`, `BodyCompositionHistoryBetweenArgs`, and two impl fns
- `Rust/core/tests/body_composition_round_trip.rs` — 4 integration tests (upsert, replace, range query, sort order)

**Modified files:**
- `Rust/core/src/store/mod.rs` — `BodyCompositionRow` struct + `upsert_body_composition()` (INSERT OR REPLACE) + `body_composition_history_between()` (all sources, ORDER BY date ASC)
- `Rust/core/src/bridge/mod.rs` — `mod body_composition;`, two BRIDGE_METHODS entries, `starts_with("body_composition.")` dispatch guard, `include_str!("body_composition.rs")` in concat! block

## Test Results

```
test body_composition_history_between ... ok
test result: ok. 4 passed; 0 failed; 0 ignored
bridge_methods_constant_matches_dispatcher ... ok
```
