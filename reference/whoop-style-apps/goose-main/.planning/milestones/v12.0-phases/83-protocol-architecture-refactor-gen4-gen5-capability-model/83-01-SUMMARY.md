---
phase: 83
plan: 01
subsystem: rust-core
tags: [rust, protocol, capabilities, device-kind, wire-protocol, refactor]
dependency_graph:
  requires: []
  provides:
    - WireProtocol enum (Rust/core/src/protocol.rs)
    - DeviceType::wire_protocol() method
    - DeviceType::is_gen5_family() method
    - DeviceType::device_kind() method
    - DeviceKind enum (Rust/core/src/capabilities.rs)
    - DeviceCapabilities struct (Rust/core/src/capabilities.rs)
    - DeviceCapabilities::for_kind() factory
    - pub mod capabilities (Rust/core/src/lib.rs)
  affects:
    - Rust/core/src/bridge.rs (Plan 03 will add device.capabilities arm)
    - GooseSwift (Plans 04-05 will consume these types via JSON FFI)
tech_stack:
  added: []
  patterns:
    - match self exhaustive arm style for Rust enums
    - serde SCREAMING_SNAKE_CASE for DeviceKind (matches Swift send format)
    - serde snake_case for DeviceCapabilities JSON keys
    - matches! macro for boolean enum predicate
key_files:
  created:
    - Rust/core/src/capabilities.rs
  modified:
    - Rust/core/src/protocol.rs
    - Rust/core/src/lib.rs
decisions:
  - WireProtocol placed in protocol.rs (co-located with DeviceType; natural home)
  - DeviceKind and DeviceCapabilities placed in new capabilities.rs (keeps bridge.rs from growing before Phase 86 split)
  - DeviceKind uses SCREAMING_SNAKE_CASE serde to match Swift's send format (WHOOP4, WHOOP5, HR_MONITOR)
  - DeviceCapabilities uses PartialEq derive to support serde roundtrip test assertion
metrics:
  duration: "~25 minutes (includes ~90s cargo build + test cycles)"
  completed: "2026-06-14"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
  files_created: 1
---

# Phase 83 Plan 01: Add WireProtocol Enum and DeviceCapabilities Module Summary

Rust foundation types for Phase 83: WireProtocol enum in protocol.rs, DeviceType method extensions, and new capabilities.rs module with DeviceKind and DeviceCapabilities — implementing the source of truth consumed by the bridge method (Plan 03) and by Swift via JSON deserialization (Plans 04-05).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add WireProtocol enum and DeviceType method extensions to protocol.rs | 604350c | Rust/core/src/protocol.rs |
| 2 | Create capabilities.rs with DeviceKind, DeviceCapabilities, and unit tests | 86e4577 | Rust/core/src/capabilities.rs, Rust/core/src/lib.rs |

## What Was Built

### Task 1: WireProtocol enum + DeviceType methods (protocol.rs)

Added to `Rust/core/src/protocol.rs`:

- `WireProtocol { Gen4, Gen5 }` enum with `#[serde(rename_all = "snake_case")]`
- `use crate::capabilities::DeviceKind` import
- `DeviceType::wire_protocol(self) -> WireProtocol` — Gen4 maps to Gen4; all others to Gen5
- `DeviceType::is_gen5_family(self) -> bool` — uses `matches!` macro for Maverick|Puffin|Goose|HrMonitor
- `DeviceType::device_kind(self) -> DeviceKind` — Gen4→Whoop4, Maverick|Puffin|Goose→Whoop5, HrMonitor→HrMonitor
- Doc comment on `Puffin` variant: "Hardware code name with no known generation mapping — likely unshipped. Parses as Gen5-family wire format (8-byte header)." (per D-16)
- `wire_protocol_tests` module with 15 unit tests covering all behavior cases

### Task 2: capabilities.rs module (new file + lib.rs)

Created `Rust/core/src/capabilities.rs`:

- `DeviceKind { Whoop4, Whoop5, HrMonitor }` enum with `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]` — serialises to WHOOP4/WHOOP5/HR_MONITOR matching Swift send format
- `DeviceCapabilities` struct with fields: `wire_protocol: String`, `historical_sync: String`, `battery_via_r22: bool`, `battery_via_event48: bool`, `battery_via_cmd26: bool`, `r22_realtime: bool`
- `DeviceCapabilities::for_kind(kind: DeviceKind) -> Self` factory with per-kind values
- `capabilities_tests` module with 7 unit tests: per-kind capability values, SCREAMING_SNAKE_CASE serde, deserialization, unknown variant rejection, roundtrip

Modified `Rust/core/src/lib.rs`:
- Added `pub mod capabilities;` between `pub mod calibration;` and `pub mod capture_correlation;` (alphabetical order)

## Test Results

| Test Suite | Tests | Result |
|-----------|-------|--------|
| wire_protocol_tests | 15/15 | PASS |
| capabilities_tests | 7/7 | PASS |

## Deviations from Plan

None — plan executed exactly as written.

Pre-existing test failures (not caused by this plan):
- `exports_sqlite_timeframe_to_jsonl_csv_and_sqlite_bundle` — assertion failure in export_tests.rs:518
- `raw_export_can_select_sensor_samples_only` — related export test failure

Both failures verified pre-existing via git stash revert. Not in scope of this plan.

## Known Stubs

None — all capability values are real constants from the RESEARCH.md SEED-002 analysis. No placeholder data flows to any consumer.

## Threat Flags

No new security surface beyond the plan's threat model. T-83-01 (unknown DeviceKind string via serde) is mitigated: the `device_kind_unknown_variant_rejected` test confirms that `serde_json::from_str::<DeviceKind>("\"UNKNOWN\"")` returns `Err`.

## Self-Check: PASSED

- [x] `Rust/core/src/protocol.rs` — exists with WireProtocol enum
- [x] `Rust/core/src/capabilities.rs` — exists with DeviceCapabilities struct
- [x] `Rust/core/src/lib.rs` — contains `pub mod capabilities`
- [x] Commit 604350c exists (Task 1)
- [x] Commit 86e4577 exists (Task 2)
- [x] `wire_protocol_tests`: 15 passed, 0 failed
- [x] `capabilities_tests`: 7 passed, 0 failed
- [x] Pre-existing export_tests failures confirmed not introduced by this plan
