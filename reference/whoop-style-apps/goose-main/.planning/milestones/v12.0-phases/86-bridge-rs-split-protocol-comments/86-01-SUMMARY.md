---
phase: "86"
plan: "01"
subsystem: rust-core
tags: [refactor, bridge, rust]
dependency_graph:
  requires: []
  provides: [bridge-module-skeleton]
  affects: [Rust/core/src/bridge/]
tech_stack:
  added: []
  patterns: [module-per-domain, prefix-router]
key_files:
  created:
    - Rust/core/src/bridge/mod.rs
    - Rust/core/src/bridge/metrics.rs
    - Rust/core/src/bridge/sleep.rs
    - Rust/core/src/bridge/capture.rs
    - Rust/core/src/bridge/activity.rs
    - Rust/core/src/bridge/debug.rs
  deleted:
    - Rust/core/src/bridge.rs
decisions:
  - "bridge/mod.rs owns the router, shared utilities, battery parsing, and FFI entry points"
  - "Domain stubs (metrics/sleep/capture/activity/debug) each expose a dispatch_* function returning not_implemented until Wave 2 fills them in"
  - "metric_result_to_value restored as generic T: Serialize (stub had dropped the generic)"
metrics:
  duration: "~10 min"
  completed: "2026-06-15"
  tasks_completed: 1
  files_changed: 7
---

# Phase 86 Plan 01: Bridge Split Skeleton Summary

Bridge module split from a 509-arm monolith (`bridge.rs`, ~11 000 lines) into a `bridge/` directory with a domain-routing architecture.

## What Was Done

- Deleted `Rust/core/src/bridge.rs` (the monolith)
- Created `Rust/core/src/bridge/mod.rs` — contains the full prefix router, all shared utility functions (`bridge_ok`, `bridge_error`, `open_bridge_store`, `request_args`, etc.), battery parsing (BAT-01/BAT-02), FFI entry points (`goose_bridge_handle_json`, `goose_bridge_free_string`, `goose_core_version_json`), `BRIDGE_METHODS` constant, and all tests that were previously in bridge.rs
- Created 5 domain stub files, each exposing a single `dispatch_*` function that currently returns `not_implemented` for all methods:
  - `bridge/metrics.rs` — `dispatch_metrics`
  - `bridge/sleep.rs` — `dispatch_sleep`
  - `bridge/capture.rs` — `dispatch_capture`
  - `bridge/activity.rs` — `dispatch_activity`
  - `bridge/debug.rs` — `dispatch_debug`
- `lib.rs` already had `pub mod bridge;` which now resolves to `bridge/mod.rs` automatically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed metric_result_to_value generic signature**
- **Found during:** cargo build after bridge.rs deletion
- **Issue:** The stub in mod.rs had `fn metric_result_to_value(result: crate::metrics::AlgorithmRunResult)` — missing the generic parameter `<T>`. The original bridge.rs had `fn metric_result_to_value<T: Serialize>(result: T)`.
- **Fix:** Restored the generic signature: `pub(crate) fn metric_result_to_value<T: serde::Serialize>(result: T)`
- **Files modified:** `Rust/core/src/bridge/mod.rs`
- **Commit:** 2457409

## Build Status

PASS — `cargo build --lib` completed with no errors (31 warnings, all pre-existing unused-function warnings from stub dispatch functions; expected until Wave 2 fills in the domain dispatchers).

## Self-Check: PASSED

- `Rust/core/src/bridge/mod.rs` — exists
- `Rust/core/src/bridge/metrics.rs` — exists
- `Rust/core/src/bridge/sleep.rs` — exists
- `Rust/core/src/bridge/capture.rs` — exists
- `Rust/core/src/bridge/activity.rs` — exists
- `Rust/core/src/bridge/debug.rs` — exists
- `Rust/core/src/bridge.rs` — deleted (confirmed by git rm)
- Commit 2457409 — confirmed in git log
