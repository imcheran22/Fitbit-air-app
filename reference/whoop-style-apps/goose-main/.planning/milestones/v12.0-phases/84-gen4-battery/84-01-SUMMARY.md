---
phase: 84-gen4-battery
plan: "01"
subsystem: rust-core
tags: [battery, gen4, rust, parsing, bridge]
dependency_graph:
  requires: [83-06]
  provides: [battery.parse_event48_payload, battery.parse_cmd26_response, event48_battery_pct]
  affects: [Rust/core/src/bridge.rs, Rust/core/src/protocol.rs]
tech_stack:
  added: []
  patterns: [bridge-method-dispatch, cfg-test-inline-module, read_u16_le-helper]
key_files:
  created: []
  modified:
    - Rust/core/src/bridge.rs
    - Rust/core/src/protocol.rs
decisions:
  - "parse_event48_battery uses absolute payload offset 17 (== data-body offset 5); unit tests resolve assumption A1"
  - "parse_event48_battery_from_data uses data-body offset 5 for compact_parsed_frame_summary (receives data_hex not full payload)"
  - "battery_parse_tests inline #[cfg(test)] module in bridge.rs, following capabilities_tests pattern"
metrics:
  duration_minutes: 38
  completed_date: "2026-06-14"
  tasks_completed: 2
  files_modified: 2
---

# Phase 84 Plan 01: Gen4 Battery Rust Parsing Summary

Two Rust bridge methods for Gen4 battery parsing, inline unit tests, and a new compact-summary field — all parsing in Rust per D-02.

## What Was Built

### Task 1: Battery parsing functions + bridge methods + compact summary field

**protocol.rs**
- `pub(crate) fn read_u16_le` — widened from `fn` so `bridge.rs` can call `crate::protocol::read_u16_le`

**bridge.rs — private parsing functions**
- `parse_event48_battery(payload: &[u8]) -> GooseResult<u16>` — reads raw u16 at absolute payload offset 17 via `crate::protocol::read_u16_le`; guard: raw > 1100 → Err (D-05 BAT-01)
- `parse_event48_battery_from_data(data: &[u8]) -> Option<u16>` — same logic anchored at data-body offset 5 for use in `compact_parsed_frame_summary`; returns None on any failure
- `parse_cmd26_battery(payload: &[u8]) -> GooseResult<u16>` — payload.len() < 4 guard; reads payload[2..4] u16 LE / 10 (D-05 BAT-02)

**bridge.rs — args structs + bridge wrappers**
- `ParseEvent48BatteryArgs { payload_hex: String }` + `parse_event48_battery_bridge`
- `ParseCmd26ResponseArgs { payload_hex: String }` + `parse_cmd26_battery_bridge`

**bridge.rs — BRIDGE_METHODS**
- Added `"battery.parse_cmd26_response"` and `"battery.parse_event48_payload"` (alphabetically between `"apple_daily.upsert"` and `"biometrics.insert_v24_batch"`)

**bridge.rs — dispatch match**
- Two arms registered adjacent to `"device.capabilities"`

**bridge.rs — compact_parsed_frame_summary Event branch**
- Added `event48_battery_pct: Option<u16>` — decodes `data_hex`, calls `parse_event48_battery_from_data`; null on any failure; emitted as JSON key `"event48_battery_pct"`

### Task 2: #[cfg(test)] unit tests

`mod battery_parse_tests` added inline in bridge.rs (follows capabilities_tests pattern):

| Test | Coverage |
|------|---------|
| `event48_valid_85` | raw=850 → pct=85 (BAT-01 happy path) |
| `event48_boundary_accept_1100` | raw=1100 passes guard (guard is `> 1100`) |
| `event48_rejects_over_1100` | raw=1101 → Err (D-05 guard) |
| `event48_rejects_too_short` | payload 18 bytes, cannot read offset 17+1 → Err |
| `cmd26_valid_85` | raw=850 at [2..4] → pct=85 (BAT-02 happy path) |
| `cmd26_rejects_short` | payload.len()=3 → Err (D-05 guard) |
| `event48_bridge_round_trip` | hex-encode valid payload → bridge → battery_pct=85 |

All 7 tests pass. No regressions in full suite.

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| `grep -c 'pub(crate) fn read_u16_le' protocol.rs` returns 1 | 1 |
| `grep -c 'battery.parse_event48_payload' bridge.rs` >= 2 | 2 |
| `grep -c 'battery.parse_cmd26_response' bridge.rs` >= 2 | 2 |
| `grep -c 'event48_battery_pct' bridge.rs` >= 2 | 3 |
| `grep -c '1100' bridge.rs` >= 1 | 4 |
| `cargo build --locked` succeeds | pass |
| `cargo test --locked battery` >= 6 passing, 0 failed | 7 pass, 0 fail |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Design Notes

The plan correctly anticipated that two offset anchors exist:
- Absolute payload offset 17 → used in `parse_event48_battery` (bridge method path, receives full payload hex)
- Data-body offset 5 → used in `parse_event48_battery_from_data` (compact summary path, receives `data_hex` which is `payload[12..]`)

Both refer to the same physical byte (12 + 5 = 17). Unit tests with known byte sequences confirm assumption A1.

## Known Stubs

None. No placeholders or TODO markers introduced.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. Only new Rust functions reading bytes from already-parsed BLE payload data. Threat register entries T-84-01, T-84-02, T-84-03 all mitigated as planned.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 04dd231 | feat(84-01): add Gen4 battery parsing bridge methods and compact summary field |
| Task 2 | 9770fef | test(84-01): add battery_parse_tests unit tests for BAT-01 and BAT-02 parsing |

## Self-Check: PASSED
