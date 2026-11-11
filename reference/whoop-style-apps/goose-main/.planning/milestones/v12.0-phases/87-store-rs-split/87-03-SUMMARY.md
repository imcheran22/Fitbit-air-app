---
phase: 87-store-rs-split
plan: "03"
subsystem: rust-core
tags: [rust, store-split, capture, arch-02]

provides:
  - "Capture domain methods moved to store/capture.rs"
  - "bridge/activity.rs + capture_import.rs immediate_transaction call sites fixed"

key-decisions:
  - "bridge/activity.rs had remaining immediate_transaction call sites fixed (not completed in 87-01)"
  - "capture_import.rs immediate_transaction call site updated to FnOnce(&Connection)"

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-06-15
---

# Phase 87 Plan 03: Capture Domain Methods Summary

Moved capture-domain methods from store/mod.rs to store/capture.rs via `impl GooseStore` block. Also fixed remaining immediate_transaction call sites in bridge/activity.rs and capture_import.rs.

## Files Modified
- `Rust/core/src/store/capture.rs` — created with capture domain methods
- `Rust/core/src/store/mod.rs` — capture methods removed
- `Rust/core/src/bridge/activity.rs` — immediate_transaction closure fixed
- `Rust/core/src/capture_import.rs` — immediate_transaction closure fixed

## Build Result
`cargo build --lib` — PASS, zero errors.
