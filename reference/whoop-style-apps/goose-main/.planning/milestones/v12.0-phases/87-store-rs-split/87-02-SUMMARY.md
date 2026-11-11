---
phase: 87-store-rs-split
plan: "02"
subsystem: store
tags: [rust, refactor, store-split, sleep-domain]
dependency_graph:
  requires: [87-01]
  provides: [store/sleep.rs — impl GooseStore with 9 sleep methods]
  affects: [Rust/core/src/store/mod.rs, Rust/core/src/store/sleep.rs]
tech_stack:
  added: []
  patterns: [multi-impl-GooseStore submodule, pub(super) helper visibility]
key_files:
  created:
    - Rust/core/src/store/sleep.rs
  modified:
    - Rust/core/src/store/mod.rs
decisions:
  - "Made 9 helper functions pub(super) in mod.rs to expose them to the sleep submodule without widening public API"
  - "Confirmed pre-existing cargo test --locked failures are unrelated to this plan (E0424/E0599 in mod.rs test code pre-date this branch)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-15T12:29:15Z"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 87 Plan 02: Sleep Domain Move Summary

Move all 9 sleep-domain methods from `store/mod.rs` into `store/sleep.rs` as a single `impl GooseStore` block, with `pub(super)` helper visibility.

## What Was Built

`store/sleep.rs` now owns all sleep persistence methods as an `impl GooseStore` block. The 9 methods are:

1. `insert_external_sleep_session`
2. `external_sleep_session`
3. `external_sleep_sessions_between`
4. `insert_external_sleep_stage`
5. `external_sleep_stage`
6. `external_sleep_stages_for_session`
7. `insert_sleep_correction_label`
8. `sleep_correction_label`
9. `sleep_correction_labels_between`

Each method acquires the mutex lock at entry via `self.conn.lock().map_err(|_| GooseError::message("store mutex poisoned"))?`.

`store/mod.rs` changes:
- Added `mod sleep;` declaration (top of file, before imports)
- Removed all 9 sleep methods from the `impl GooseStore` block (~358 lines deleted)
- Made 9 private helper functions `pub(super)` so `sleep.rs` can import them via `use super::`:
  - `validate_required`, `validate_non_negative`, `validate_window_order`
  - `validate_external_sleep_session_input`, `validate_external_sleep_stage_input`, `validate_sleep_correction_label_input`
  - `external_sleep_session_from_row`, `external_sleep_stage_from_row`, `sleep_correction_label_from_row`

## Verification

```
grep -c 'fn insert_external_sleep_session' store/sleep.rs  → 1
grep -c 'fn insert_external_sleep_session' store/mod.rs    → 0
grep -c 'store mutex poisoned' store/sleep.rs              → 9
cargo build --lib                                          → clean (0 errors)
```

`cargo test --locked` surfaces 36 pre-existing errors in `store/mod.rs` test compilation (E0424/E0599) that exist on the baseline branch before this plan — confirmed via `git stash` baseline check.

## Deviations from Plan

### Auto-discovered — pub(super) visibility required

- **Found during:** Task 1, Step 2
- **Issue:** The 9 helper functions used by sleep methods (`validate_required`, row mappers, input validators) were all private (`fn`, no visibility modifier). A Rust submodule cannot access private items of its parent module — only `pub(super)` items are visible via `use super::`.
- **Fix:** Added `pub(super)` to all 9 helper functions in mod.rs. This keeps them invisible outside the `store/` family while making them accessible to `sleep.rs`.
- **Files modified:** `Rust/core/src/store/mod.rs`
- **Commit:** 764cb04

No other deviations. Plan executed exactly as written after accounting for the visibility requirement.

## Decisions Made

1. Used `pub(super)` (not `pub`) for helper functions — preserves encapsulation boundary at the `store/` module level. External callers (bridge, etc.) cannot access these helpers.
2. Documented pre-existing `cargo test --locked` failures rather than fixing them — they are out of scope for this plan (scope boundary rule).

## Known Stubs

None. All 9 methods are fully implemented with real SQL.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced. The split is a pure code move.

## Self-Check: PASSED

- `Rust/core/src/store/sleep.rs` exists: FOUND
- `mod sleep;` in mod.rs: FOUND (line 3)
- `insert_external_sleep_session` in sleep.rs: 1 occurrence
- `insert_external_sleep_session` in mod.rs: 0 occurrences
- `store mutex poisoned` in sleep.rs: 9 occurrences
- Commit 764cb04: exists in git log
