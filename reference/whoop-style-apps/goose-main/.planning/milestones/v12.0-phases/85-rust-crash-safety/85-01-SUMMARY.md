---
phase: 85-rust-crash-safety
plan: "01"
subsystem: rust-core
tags: [clippy, lint, unwrap, crash-safety, test-quality]
dependency_graph:
  requires: []
  provides: [deny-unwrap-lint-gate, bridge-rs-zero-unwrap, per-module-allow-shields]
  affects: [Rust/core/src/lib.rs, Rust/core/src/bridge.rs]
tech_stack:
  added: []
  patterns: [cfg_attr-deny-lint, per-module-allow-shield, expect-descriptive-message]
key_files:
  created: []
  modified:
    - Rust/core/src/lib.rs
    - Rust/core/src/bridge.rs
    - Rust/core/src/store.rs
    - Rust/core/src/metrics.rs
    - Rust/core/src/capabilities.rs
    - Rust/core/src/openwhoop_reference.rs
    - Rust/core/src/exercise_detection.rs
    - Rust/core/src/energy_rollup.rs
    - Rust/core/src/step_discovery.rs
decisions:
  - "D-04: cfg_attr(not(test), deny(clippy::unwrap_used)) added to lib.rs — lint active for production code from day 1; test code exempt"
  - "D-05: clippy::unnecessary_unwrap kept in existing allow block — different lint, must not be removed"
  - "D-03: 46 bridge.rs test .unwrap() converted to .expect(descriptive message) for richer test failure output"
metrics:
  duration_seconds: 335
  completed_date: "2026-06-14"
  tasks_completed: 2
  files_modified: 9
---

# Phase 85 Plan 01: Deny Lint Gate + Bridge Test Quality Summary

**One-liner:** `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` added to lib.rs with per-module allow shields on 7 unconverted modules; bridge.rs converted from 46 test `.unwrap()` to `.expect("descriptive message")` leaving zero `.unwrap()` in the file.

## What Was Built

### Task 1 — Deny attribute + per-module shields (commit `90407ed`)

Added `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` to `Rust/core/src/lib.rs` immediately after the existing `#![allow(...)]` block. The existing allow block was not modified — `clippy::unnecessary_unwrap` is preserved per D-05.

Added `#![allow(clippy::unwrap_used)]` (inner attribute with `!`) at the top of 7 modules that still have unconverted test `.unwrap()` calls:

| Module | Remaining unconverted | Removed in plan |
|--------|-----------------------|-----------------|
| `store.rs` | 62 test | Plan 2 |
| `metrics.rs` | 8 test + 3 prod | Plan 3 |
| `capabilities.rs` | 8 test | Plan 4 |
| `openwhoop_reference.rs` | 3 test | Plan 5 |
| `exercise_detection.rs` | 1 test | Plan 5 |
| `energy_rollup.rs` | 1 prod | Plan 5 |
| `step_discovery.rs` | 1 prod | Plan 5 |

`bridge.rs` received no shield — it is fully converted in Task 2.

**Acceptance criteria met:**
- `grep -c 'cfg_attr(not(test), deny(clippy::unwrap_used))' Rust/core/src/lib.rs` → 1
- `grep -c 'clippy::unnecessary_unwrap' Rust/core/src/lib.rs` → 1
- All 7 modules have `#![allow(clippy::unwrap_used)]` at file top
- `cargo build --manifest-path Rust/core/Cargo.toml --lib` → exit 0

### Task 2 — Convert bridge.rs test `.unwrap()` to `.expect()` (commit `3698ee7`)

Replaced all 46 `.unwrap()` calls in `bridge.rs` (all inside `#[cfg(test)] mod tests`, starting at line 9828) with `.expect("descriptive message")`. Conversion groups:

| Test function | Converted calls | Message theme |
|---------------|-----------------|---------------|
| `core_list_methods_*` | 3 | JSON field type assertions |
| `capture_arrival_next_focus_*` | 2 | Option result from non-empty input |
| `sleep_history_schedule_baseline_*` | 1 | Option result with usable night |
| `sleep_v1_external_history_prefers_*` | 7 | In-memory store open + inserts + query |
| `sleep_v1_external_history_excludes_low_confidence_*` | 7 | In-memory store open + inserts + query |
| `sleep_v1_external_history_excludes_manual_*` | 5 | In-memory store open + inserts + query |
| `sleep_v1_external_nap_credit_excludes_platform_*` | 9 | In-memory store open + inserts + query |
| `sleep_v1_external_nap_credit_excludes_low_confidence_*` | 6 | In-memory store open + inserts + query |
| `ewma_baseline_update_*` | 1 | f64 field in JSON result |
| `test_device_capabilities_bridge_whoop4` | 3 | Ok result + JSON string fields |

The `.unwrap_or_else(|| "unknown panic payload".to_string())` in the `catch_unwind` block at line ~3116 was intentionally left unchanged — it is `unwrap_or_else` (not `unwrap()`), which `clippy::unwrap_used` does not flag.

**Acceptance criteria met:**
- `grep -c '\.unwrap()' Rust/core/src/bridge.rs` → 0
- `grep -c '\.expect(' Rust/core/src/bridge.rs` → 79 (≥ 46)
- `cargo test --locked --manifest-path Rust/core/Cargo.toml --lib` → 180 passed, 0 failed
- `cargo clippy --lib -- -D clippy::unwrap_used` → no bridge.rs violation

## Deviations from Plan

None — plan executed exactly as written. The research note that bridge.rs has zero production unwrap violations was confirmed: all 46 `.unwrap()` calls were inside `#[cfg(test)]`, making Task 2 a pure D-03 test-quality pass.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan modifies only lint attributes and test helper messages — no trust boundary changes.

## Known Stubs

None — this plan adds no UI or data wiring.

## Self-Check: PASSED

All modified files confirmed present on disk. Both task commits verified in git log:
- `90407ed` — chore(85-01): add deny(clippy::unwrap_used) to lib.rs and install per-module shields
- `3698ee7` — refactor(85-01): convert 46 bridge.rs test .unwrap() to .expect() (D-03)
