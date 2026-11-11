---
phase: 101-hps-telemetry-coach-crash-protocol-cleanup
plan: "03"
subsystem: rust-protocol
status: complete
tags: [proto, protocol, packet-domain, rust]
dependency_graph:
  requires: []
  provides: [PROTO-10]
  affects: [Rust/core/src/protocol.rs]
tech_stack:
  added: []
  patterns: [match-arm-split]
key_files:
  modified:
    - Rust/core/src/protocol.rs
decisions:
  - "Split '9 | 12 | 18 | 24 => normal_history_with_hr_marker' into two arms; packet_k=24 receives domain 'v24_biometric_stream' to match parse_v24_body_summary routing"
  - "history_hr_marker_offset left unchanged — packet_k=24 still returns Some(17); domain name is independent of offset"
metrics:
  duration: "~8 min"
  completed: "2026-06-21"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
requirements:
  - PROTO-10
---

# Phase 101 Plan 03: PROTO-10 — data_packet_domain v24_biometric_stream fix Summary

Fixed domain label mismatch in `data_packet_domain()` for packet_k=24: split the combined match arm so packet_k=24 returns `"v24_biometric_stream"` instead of `"normal_history_with_hr_marker"`, aligning the domain string with `parse_v24_body_summary` routing and eliminating packet_k=24 miscategorisation in domain-based queries and exports. Closes issue #157.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix data_packet_domain mismatch for packet_k=24 | 86699f6 | Rust/core/src/protocol.rs |

## What Was Built

Single match-arm split in `data_packet_domain()` in `Rust/core/src/protocol.rs`:

**Before:**
```rust
9 | 12 | 18 | 24 => "normal_history_with_hr_marker",
```

**After:**
```rust
9 | 12 | 18 => "normal_history_with_hr_marker",
24 => "v24_biometric_stream",
```

The `history_hr_marker_offset` function at line 1247 was not touched — packet_k=24 continues to return `Some(17)` there. The domain name change is orthogonal to the HR marker offset.

## Verification Results

| Check | Result |
|-------|--------|
| `grep "v24_biometric_stream" protocol.rs` | Found on new arm |
| `grep -c "9 \| 12 \| 18 \| 24"` | 0 (old combined arm removed) |
| `grep -c "9 \| 12 \| 18 =>"` | 1 (new arm present) |
| `cargo test --locked` | 153 passed, 0 failed |

## Test Fixture Audit

Searched all test files for `"normal_history_with_hr_marker"` assertions referencing packet_k=24:

- `protocol_tests.rs:197` — asserts domain for packet_k=18. No change needed.
- `protocol_tests.rs:532` — asserts domain for packet_k=9. No change needed.
- `timeline_tests.rs:69` — references `historical_k18_packet` (k=18). No change needed.
- `fixture_tests.rs:1054–1078` — asserts `body_summary.kind == "v24_history"`, not domain string. No change needed.
- `bridge_tests.rs:9670–9702` — builds synthetic k=24 frames for gravity extraction; no domain assertion. No change needed.

No test fixture updates required.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — `data_packet_domain` is a pure internal function with no external input or security boundary.

## Self-Check

- [x] `Rust/core/src/protocol.rs` modified — FOUND
- [x] Commit `86699f6` exists — FOUND
- [x] `cargo test --locked` 153 passed, 0 failed — CONFIRMED

## Self-Check: PASSED
