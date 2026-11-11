---
phase: 85-rust-crash-safety
plan: "05"
subsystem: rust-core
tags: [crash-safety, unwrap, clippy, energy_rollup, step_discovery, openwhoop_reference, exercise_detection]
dependency_graph:
  requires: ["85-01"]
  provides: ["zero-unwrap-small-files", "all-four-shields-removed"]
  affects: ["85-06-gate"]
tech_stack:
  added: []
  patterns: ["if-let match-arm guard (edition 2024 / MSRV 1.96 stable)"]
key_files:
  modified:
    - Rust/core/src/energy_rollup.rs
    - Rust/core/src/step_discovery.rs
    - Rust/core/src/openwhoop_reference.rs
    - Rust/core/src/exercise_detection.rs
decisions:
  - "if-let match-arm guard chosen over .ok_or()/.map_err() for single call + no unwrap in a match arm — edition 2024 stable"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 4
---

# Phase 85 Plan 05: Fix Small-File Production Unwraps and Remove Shields Summary

Production if-let guards eliminate the final 2 production `.unwrap()` sites; 4 test `.unwrap()` converted to `.expect()`; all 4 `#![allow(clippy::unwrap_used)]` shields removed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix 2 production unwrap sites via if-let match-arm guards | 63c02df | energy_rollup.rs, step_discovery.rs |
| 2 | Convert small-file test .unwrap() to .expect() and remove all four shields | 98423fe | energy_rollup.rs, step_discovery.rs, openwhoop_reference.rs, exercise_detection.rs |

## What Was Built

### Task 1 — Production if-let guards (energy_rollup.rs, step_discovery.rs)

Both files had the same double-call+unwrap pattern in a match wildcard arm:
```rust
// Before (double call + unwrap)
_ if official_label_policy_issue_action(issue).is_some() => (
    "...",
    official_label_policy_issue_action(issue).unwrap(),
),
// After (single call, if-let guard, action bound directly)
_ if let Some(action) = official_label_policy_issue_action(issue) => (
    "...",
    action,
),
```
In `step_discovery.rs` where the arm type is `String`, `.to_string()` is applied on the bound `action`.

### Task 2 — Test .unwrap() → .expect() and shield removal

- `openwhoop_reference.rs`: 3 test `.unwrap()` on `openwhoop_history_field_reference(...)` converted to `.expect()` with descriptive messages about the reference table invariant.
- `exercise_detection.rs`: 1 test `.unwrap()` in `hr.sort_by(|a, b| a.ts.partial_cmp(&b.ts).unwrap())` converted to `.expect("HrSample ts values must be finite (no NaN) in test fixtures")`.
- `#![allow(clippy::unwrap_used)]` removed from all four files (energy_rollup.rs, step_discovery.rs, openwhoop_reference.rs, exercise_detection.rs).

## Verification

- `grep -c 'official_label_policy_issue_action(issue).unwrap()'` returns 0 for energy_rollup.rs and step_discovery.rs
- `grep -c '.unwrap()'` returns 0 for all four files
- `grep -c '#![allow(clippy::unwrap_used)]'` returns 0 for all four files
- `cargo clippy --locked --manifest-path Rust/core/Cargo.toml --lib -- -D clippy::unwrap_used` exits 0, no violations
- `cargo test --locked --manifest-path Rust/core/Cargo.toml --lib` exits 0 — 180 tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-85-07: Denial of Service — energy_rollup.rs:1744 / step_discovery.rs:1024 unwrap-on-None in validation loop | if-let match-arm guard binds the Some value once, eliminating both the unwrap and the duplicate call (Pitfall 5) |
| T-85-08: Tampering — test-only unwrap masking reference/exercise-detection failures | D-03 conversion to .expect("..."); shield removal proves no production unwrap remains |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- energy_rollup.rs: 0 .unwrap(), 0 shields, if-let guard present at ~1741
- step_discovery.rs: 0 .unwrap(), 0 shields, if-let guard present at ~1022
- openwhoop_reference.rs: 0 .unwrap(), 0 shields, 3 .expect() in #[cfg(test)]
- exercise_detection.rs: 0 .unwrap(), 0 shields, 1 .expect() in #[cfg(test)]
- Commits 63c02df and 98423fe verified in git log
- clippy -D clippy::unwrap_used: 0 violations
- cargo test --lib: 180/180 pass
