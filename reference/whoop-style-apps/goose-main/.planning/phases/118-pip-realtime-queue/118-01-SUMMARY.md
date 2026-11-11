---
plan: "118-01"
phase: "118"
status: complete
requirement: PIP-01, PIP-02
commit: efb2674
---

# Plan 118-01: Rust Schema Fix + realtime.insert_frame Bridge

## What Was Done

**Schema fix (PIP-02):**
- Fixed `realtime_frames` DDL bug in `store/mod.rs`: removed incorrect `DEFAULT 'realtime_pip'` from `captured_at` TEXT column; added `source TEXT NOT NULL DEFAULT 'realtime_pip'` column
- Added `ensure_realtime_source_column()` idempotent migration

**Bridge method (PIP-01):**
- New `Rust/core/src/bridge/realtime.rs` domain module with `RealtimeInsertFrameArgs` + `insert_frame_bridge()`
- `realtime.insert_frame` added to BRIDGE_METHODS (between `privacy.lint` and `protocol.parse_frame_hex`)
- `dispatch_realtime()` guard added in `handle_bridge_request_inner`
- `include_str!("realtime.rs")` added to concat!() consistency test block
- `insert_realtime_frame()` store method: INSERT OR IGNORE ON CONFLICT DO NOTHING

**Tests:**
- `Rust/core/tests/realtime_pip_tests.rs`: 2 round-trip tests pass
- `bridge_methods_constant_matches_dispatcher` passes

## Test Results

```
test insert_realtime_frame_round_trip ... ok
test insert_realtime_frame_different_captured_at_creates_new_row ... ok
test result: ok. 2 passed; 0 failed
bridge_methods_constant_matches_dispatcher ... ok
```
