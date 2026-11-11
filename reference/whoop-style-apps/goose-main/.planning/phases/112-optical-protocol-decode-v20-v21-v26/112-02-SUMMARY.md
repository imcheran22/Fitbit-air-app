---
phase: "112"
plan: "112-02"
status: complete
completed_at: 2026-06-22
requirement: OPT-01
commit: e34d593
tags:
  - protocol
  - optical
  - rust
subsystem: Rust core / protocol.rs
---

# Phase 112 Plan 02: V20V21OpticalMultiChannel — OPT-01 Summary

## One-liner

v20 optical multi-channel parser with 5-block presence-byte layout, producing Vec<OpticalChannel> with 50 i32 samples per sub-channel.

## What Was Built

### New Types

- `OpticalChannel` public struct: `{ index: u8, samples_i32: Option<Vec<i32>>, samples_i16: Option<Vec<i16>> }`
- `DataPacketBodySummary::V20V21OpticalMultiChannel { version: u8, channels: Vec<OpticalChannel>, warnings: Vec<String> }` enum variant

### New Functions

- `parse_v20v21_optical_body(packet_k, payload)` private parse function for packet_k=20
  - Skips 3-byte header; reads body from `payload[3..]`
  - 5 blocks at body offsets [26, 448, 870, 1292, 1714]
  - Presence byte 0x19 = active; any other value = skip silently
  - Each active block yields 2 OpticalChannel entries (indices block_num*2, block_num*2+1)
  - Each sub-channel: 50 i32 LE samples (200B per sub-channel)
  - Empty payload → (None, warning); truncated block → warning + partial data
- `parse_v20v21_optical_body_for_test(packet_k, payload)` public test accessor

### Dispatch and Domain Updates

- `parse_data_packet_body_summary`: added `20 => parse_v20v21_optical_body(20, payload)` arm
- `data_packet_domain(20)`: changed from `"raw_or_research_counted"` to `"v20v21_optical_multi_channel"`
- `body_summary_kind` in `bridge/capture.rs`: added `V20V21OpticalMultiChannel` arm
- `summary_kind_str` in `capture_correlation.rs`: added `V20V21OpticalMultiChannel` arm
- `export.rs`: added graceful skip arm (persistence deferred to Phase 113)
- `bridge/debug.rs`: added graceful skip arm

### k=21 Decision

packet_k=21 was NOT rerouted to the new optical parser. The existing `parse_k21_raw_motion_summary` / `RawMotionK21` path is heavily used by motion metrics, step counter, and metric_readiness across 15+ sites. The plan's own condition "only remove if still used for a different purpose" applies — k=21 IS used for a critical different purpose (raw motion). Future hardware confirmation of k=21 as optical would require a separate migration plan.

## Verification

- `cargo test --locked --test protocol_tests -- test_v20` → 4/4 new tests pass
- `cargo test --locked` full suite → 153 passed, 0 failed, 0 regressions

## Tests Written

1. `test_v20_three_active_blocks_yields_six_channels` — 3 active blocks → 6 OpticalChannel entries, 50 i32 samples each (all = 42)
2. `test_v20_payload_too_short_warns_no_panic` — 10B payload, all 5 blocks emit presence_missing warnings, no panic, returns empty channels
3. `test_v20_mixed_presence_returns_only_active_channels` — blocks 0 and 3 active → 4 channels, indices [0, 1, 6, 7]
4. `test_v20_empty_payload_returns_none_with_warning` — header-only payload → None + "empty" warning

## Commits

- e34d593 — feat(protocol): add V20V21OpticalMultiChannel variant and parse_v20v21_optical_body (OPT-01, Task 1)
- 44c3724 — test(protocol): add synthetic v20 optical fixture tests (OPT-01, Task 2)

## Deviations from Plan

### Decision: k=21 left as RawMotionK21 (plan clause applied)

The plan instructs: "only remove if packet_k=21 was previously routed there; do NOT remove if it's still used for a different purpose."

k=21 is routed to `parse_k21_raw_motion_summary` and produces `RawMotionK21` which is consumed by:
- `metric_features.rs` (motion plan extraction, step motion counter)
- `step_motion_estimator.rs` (step counting)
- `capture_correlation.rs`, `export.rs`, `bridge/capture.rs`, `bridge/debug.rs` (match arms)
- `metric_readiness.rs` (required_summary_kinds), `historical_sync.rs`, `openwhoop_reference.rs`

This satisfies the "different purpose" clause. The new `V20V21OpticalMultiChannel` variant is available for future k=21 optical routing if hardware evidence confirms k=21 is optical on a given firmware version.

### Auto-added: multi-site exhaustive match updates (Rule 2)

The plan only mentioned protocol.rs and one test, but the new variant required exhaustive match updates in:
- `bridge/capture.rs` (body_summary_kind)
- `capture_correlation.rs` (summary_kind_str)
- `export.rs` (sensor sample export)
- `bridge/debug.rs` (upload stream)

These are correctness requirements — missing arms cause compile errors in Rust exhaustive match.

## Known Stubs

None — the parser is fully functional for packet_k=20. Persistence to SQLite is intentionally deferred to Phase 113 (out of scope for this plan).

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. Pure Rust parsing addition.
