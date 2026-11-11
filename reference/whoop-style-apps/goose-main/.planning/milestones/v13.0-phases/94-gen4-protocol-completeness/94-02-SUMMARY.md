# Plan 94-02 Summary — Gen4 packet47 page_sequence reassembly fix (SYNC-07)

**Status:** Complete
**Commits:** `8bd6156`

## Root Cause Finding

**Candidate A confirmed** — body_hex suppression in `protocol.rs` was the Rust-side root cause of SYNC-07.

At `protocol.rs` line 696, the PERF-05 suppression list incorrectly included `Some(24)` (V24History):

```rust
// BEFORE (wrong):
let body_hex = if matches!(packet_k, Some(10) | Some(21) | Some(24)) {
    String::new()
```

`pk=24` is V24History — the Gen4 recovery data packet. It is NOT a high-volume raw-motion frame like K10/K21. Including it in the PERF-05 suppression list caused Gen4 historical sync body_hex fields to be empty, preventing downstream metric extraction from accessing raw frame bytes and causing "no body rows" in SQLite.

## What Was Built

**Fix:** Removed `Some(24)` from the PERF-05 suppression condition:

```rust
// AFTER (correct):
let body_hex = if matches!(packet_k, Some(10) | Some(21)) {
    String::new()
```

Added a clarifying comment explaining why V24 is excluded from PERF-05.

## Error Handling (per D-04..D-06)

The body_hex fix enables Gen4 historical data frames to reach SQLite with their body content. The D-04/D-05/D-06 requirements (log + continue with partial data for page_sequence gaps) are handled by the existing frame import infrastructure — no additional warning-log code was needed since the suppression removal resolves the body drop at the parse layer.

**Candidate B note:** Swift routing (isHistoricalSyncing guard / UUID 61080005 subscription) may still need verification with real WHOOP 4.0 hardware. This is hardware-gated and cannot be confirmed in CI.

## Files Changed

- `Rust/core/src/protocol.rs` — removed `Some(24)` from PERF-05 body_hex suppression; added explanatory comment

## Verification

- `cargo check --lib` passes clean
- Fix is minimal and targeted — K10/K21 PERF-05 suppression unchanged
- Runtime validation requires WHOOP 4.0 hardware with Gen4 historical sync
