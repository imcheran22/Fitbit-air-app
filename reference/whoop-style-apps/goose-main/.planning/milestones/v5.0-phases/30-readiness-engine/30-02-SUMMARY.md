---
phase: 30-readiness-engine
plan: "02"
subsystem: bridge
tags: [readiness, bridge, dispatch, integration-test]
dependency_graph:
  requires: [30-01]
  provides: [metrics.goose_readiness_v1 bridge method]
  affects: [Rust/core/src/bridge.rs]
tech_stack:
  added: []
  patterns: [bridge-dispatch, stateless-bridge-method, serde-json-to-value]
key_files:
  created: []
  modified:
    - Rust/core/src/bridge.rs
decisions:
  - Use serde_json::to_value directly (not metric_result_to_value) since ReadinessOutput is not wrapped in AlgorithmRunResult
  - No database_path required — function is stateless
  - Dispatch arm placed after goose_stress_v0 arm (alphabetical grouping convention)
metrics:
  duration: "~15 minutes"
  completed: "2026-06-08"
  tasks_completed: 1
  files_changed: 1
---

# Phase 30 Plan 02: Readiness Engine — Bridge Dispatch Summary

**One-liner:** `metrics.goose_readiness_v1` wired into bridge.rs BRIDGE_METHODS + dispatch match with 4 integration tests covering empty/equal/insufficient/rundown scenarios.

## What Was Built

Wired `goose_readiness_v1` into the bridge dispatch layer in `Rust/core/src/bridge.rs`:

1. **Import:** Added `ReadinessInput` and `goose_readiness_v1` to the `metrics::{}` import block.
2. **BRIDGE_METHODS:** Inserted `"metrics.goose_readiness_v1"` in alphabetical position between `"metrics.goose_hrv_v0"` and `"metrics.goose_recovery_v0"`.
3. **Dispatch arm:** Added `"metrics.goose_readiness_v1"` match arm using `serde_json::to_value` (stateless — no database_path).
4. **Integration tests:** 4 tests in `bridge::tests` covering all required scenarios from the plan.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Bridge dispatch + BRIDGE_METHODS + 4 integration tests | e771b98 |

## Integration Test Results

| Test | Scenario | Result |
|------|----------|--------|
| `goose_readiness_v1_bridge_empty_input_returns_unknown` | daily_strain=[] | insufficient_data=true, level="unknown" |
| `goose_readiness_v1_bridge_28_equal_strains_returns_primed` | 28 equal strains | level="primed", acwr≈1.0, zone="optimal", monotony=null |
| `goose_readiness_v1_bridge_27_strains_returns_unknown` | 27 pairs | insufficient_data=true, level="unknown" |
| `goose_readiness_v1_bridge_high_acwr_returns_rundown` | first21=5.0, last7=21.0 → acwr≈2.33 | level="rundown" |

All 4 pass. `bridge_methods_constant_matches_dispatcher` and `bridge_methods_constant_is_sorted_and_unique` also pass, confirming correct alphabetical placement.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — bridge method deserialises via serde type enforcement; invalid JSON returns bridge_error with "method_error"; no panic path. T-30-02 (mitigate disposition) is satisfied by existing serde deserialization.

## Self-Check: PASSED

- `Rust/core/src/bridge.rs` modified: confirmed
- Commit e771b98 exists: confirmed
- `"metrics.goose_readiness_v1"` in BRIDGE_METHODS: confirmed
- `cargo test -p goose-core -- readiness`: 18 passed (14 unit + 4 bridge), 0 failed
- `cargo test -p goose-core`: 127 passed, 0 failed
