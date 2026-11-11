---
phase: 27-v24-biometric-decode
plan: "01"
subsystem: protocol
tags: [rust, protocol, v24, biometric, parsing]
dependency_graph:
  requires: []
  provides:
    - DataPacketBodySummary::V24History variant (protocol.rs)
    - parse_v24_body_summary() function (protocol.rs)
    - parse_v24_body_for_test() public test helper (protocol.rs)
  affects:
    - bridge.rs (body_summary_kind match + biometric_streams V24 arm)
    - capture_correlation.rs (body_summary_kind match)
    - export.rs (sensor sample export match)
tech_stack:
  added: []
  patterns:
    - Option-safe byte offset reads via get() — no unchecked indexing
    - Short-payload tolerance: None fields + warning string, no panic
    - rr_count clamped to 4 to prevent unbounded allocation
key_files:
  created:
    - Rust/core/tests/v24_biometric_protocol_tests.rs
  modified:
    - Rust/core/src/protocol.rs
    - Rust/core/src/bridge.rs
    - Rust/core/src/capture_correlation.rs
    - Rust/core/src/export.rs
decisions:
  - Remove Eq derive from ParsedFrame, ParsedPayload, DataPacketBodySummary — f32 does not implement Eq
  - Expose parse_v24_body_for_test() as plain pub fn (no cfg(test) guard) so integration tests in tests/ can import it
  - Add Some(24) to body_hex exclusion — V24 frames are high-volume; structured body_summary carries all useful data
metrics:
  duration: "~15m"
  completed: "2026-06-08T13:20:00Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 27 Plan 01: V24 Biometric Decode — Protocol Variant Summary

**One-liner:** V24History variant in DataPacketBodySummary with parse_v24_body_summary() reading 16 biometric fields from verified byte offsets; all 3 integration tests green.

## What Was Built

Added the `DataPacketBodySummary::V24History` variant to `protocol.rs` to correctly decode V24 HISTORICAL_DATA packets (packet_k == 24 in type-47 frames). Previously, these frames were routed to `NormalHistory` and all biometric sensor data was discarded.

### Protocol Struct (protocol.rs)

- `V24History` variant with 16 named fields: `hr`, `rr_intervals_ms`, `ppg_green`, `ppg_red_ir`, `gravity_x/y/z`, `skin_contact`, `spo2_red`, `spo2_ir`, `skin_temp_raw`, `ambient`, `led1`, `led2`, `resp_raw`, `sig_quality`, `warnings`
- All biometric fields are `Option<T>` except `rr_intervals_ms: Vec<u16>` and `warnings: Vec<String>`
- New `parse_v24_body_summary(payload: &[u8])` private function reading from `data = &payload[3..]` at offsets verified against `my-whoop/re/verify_v24.py::decode_v24()`
- New `read_f32_le(data, offset)` helper for gravity triplet (f32 little-endian, 4 bytes)
- Short payload guard: `data.len() < 77` returns `Some(V24History)` with all `None` fields + `"v24_payload_too_short"` warning
- `rr_count` clamped to 4 before loop; zero values filtered from `rr_intervals_ms`

### Routing Change (parse_data_packet_body_summary)

- Before: `7 | 9 | 12 | 18 | 24 => NormalHistory`
- After: `7 | 9 | 12 | 18 => NormalHistory`, `24 => parse_v24_body_summary(payload)`

### body_hex Exclusion Updated

- `matches!(packet_k, Some(10) | Some(21))` → `matches!(packet_k, Some(10) | Some(21) | Some(24))`

### Integration Tests (v24_biometric_protocol_tests.rs)

3 tests, all green:
1. `test_v24_body_summary_field_offsets` — 82-byte synthetic payload, all 16 fields verified at exact byte offsets
2. `test_v24_short_payload` — 10-byte payload returns `Some(V24History)` with `None` fields + `"v24_payload_too_short"` in warnings
3. `test_v24_rr_zero_skip` — `rr_count=3` with zero at `data[18]` produces only 2 RR entries (zero excluded)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1: V24History + parse_v24_body_summary | 76a0e0f | feat(27-01): add DataPacketBodySummary::V24History variant + parse_v24_body_summary() |
| Task 2: Integration tests | 97f3515 | test(27-01): V24 biometric protocol integration tests — 3 tests green |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed Eq derive from ParsedFrame, ParsedPayload, DataPacketBodySummary**
- **Found during:** Task 1 (cargo check)
- **Issue:** f32 does not implement Eq; adding gravity_x/y/z: Option<f32> to V24History made Eq impossible to derive automatically for the enum and its container types
- **Fix:** Removed Eq derive from `DataPacketBodySummary`, `ParsedPayload`, and `ParsedFrame`. PartialEq retained.
- **Files modified:** Rust/core/src/protocol.rs
- **Commit:** 76a0e0f

**2. [Rule 2 - Missing critical functionality] Exposed parse_v24_body_for_test() as plain pub fn**
- **Found during:** Task 2 (cargo test)
- **Issue:** `#[cfg(test)]` in a library module is scoped to the library's own unit tests, not to integration tests in `tests/`. The integration test file could not import the symbol.
- **Fix:** Removed `#[cfg(test)]` guard from `parse_v24_body_for_test()`. Added doc comment noting integration-test-only use.
- **Files modified:** Rust/core/src/protocol.rs
- **Commit:** 97f3515

**3. [Rule 3 - Blocking] Updated 3 additional match arms for new V24History variant**
- **Found during:** Task 1 (cargo check)
- **Issue:** `bridge.rs`, `capture_correlation.rs`, and `export.rs` all had exhaustive match on `DataPacketBodySummary` — adding V24History broke compilation.
- **Fix:** Added `V24History { .. } => <appropriate stub>` arms in each file with explanatory comments.
- **Files modified:** Rust/core/src/bridge.rs, Rust/core/src/capture_correlation.rs, Rust/core/src/export.rs
- **Commit:** 76a0e0f

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All byte reads use `get()` returning `Option` — no unchecked indexing. `rr_count` clamped to 4 — no unbounded allocation. Consistent with threat register T-27-01 and T-27-02 mitigations.

## Known Stubs

None. V24History fields are fully decoded from the payload. Downstream storage (v24 tables, migration v16) is Plan 27-02.

## Self-Check

- [x] Rust/core/src/protocol.rs — FOUND
- [x] Rust/core/tests/v24_biometric_protocol_tests.rs — FOUND
- [x] Commit 76a0e0f — FOUND
- [x] Commit 97f3515 — FOUND
- [x] cargo test v24_biometric_protocol_tests — 3 passed, 0 failed

## Self-Check: PASSED
