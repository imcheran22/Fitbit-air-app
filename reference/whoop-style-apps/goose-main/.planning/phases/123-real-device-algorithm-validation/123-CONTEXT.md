# Phase 123: Real-Device Algorithm Validation — Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust-only validation phase. Extends existing algorithm comparison infrastructure with ≥7 synthetic session fixtures — one per "overnight session equivalent" — to validate RMSSD and 4-class sleep staging against the Python reference pipeline.

**Why proxy data:** No physical WHOOP 5 device available for real overnight sessions. The existing `compare_hrv_goose_to_reference` and `compare_sleep_goose_to_reference` functions already validate algorithmic correctness against the Python reference pipeline on synthetic data. Phase 123 extends this coverage to ≥7 session-scale fixtures, documenting them as the validation artifact per SC-3.

SC-1 and SC-2 (real overnight sessions) are hardware-gated — documented as deferred pending device access, not as failures.

Requirements in scope: VAL-HRV-04, VAL-SLP-04 (partial — fixture tests only)

</domain>

<decisions>
## Implementation Decisions

### Proxy data approach
- **D-01:** Extend `Rust/core/tests/algorithm_compare_tests.rs` with ≥7 named synthetic HRV fixtures (different RR-interval sequences) and ≥7 synthetic sleep session fixtures. Each fixture is a "session equivalent" — distinct enough to provide variance (different heart rates, different sleep stages mix).

### HRV fixture design
- **D-02:** Each HRV fixture uses 20–60 realistic RR intervals (ms) with known RMSSD. Use `compare_hrv_goose_to_reference` for each. Assert `report.pass == true` and check RMSSD delta is within tolerance. At least one fixture should exercise each age-bracket range from `sleep_need.rs`.

### Sleep staging fixture design
- **D-03:** Each sleep session fixture uses `compare_sleep_goose_to_external_reference_report` or `compare_sleep_v1_goose_to_reference`. At least one per stage distribution: deep-heavy, light-heavy, mixed, REM-heavy, short-session, long-session, fragmented.

### Validation artifact
- **D-04:** Write `.planning/phases/123-real-device-algorithm-validation/123-VALIDATION-ARTIFACT.md` documenting:
  - Number of fixture sessions: ≥7 HRV + ≥7 sleep
  - Delta tolerance used (≤1ms for RMSSD, ≥70% concordance would be for real sessions)
  - `cargo test --locked` pass status
  - Hardware-gated note: SC-1 (real overnight RMSSD) and SC-2 (real sleep concordance) deferred pending WHOOP 5 device access

### Existing infrastructure to reuse
- **D-05:** Do NOT create new comparison functions. Reuse:
  - `compare_hrv_goose_to_reference` (in `algorithm_compare_tests.rs`)
  - `compare_sleep_goose_to_reference` / `compare_sleep_v1_goose_to_reference`
  - `Rust/core/fixtures/synthetic/hrv_goose_v0_hand_derived.json` as the pattern for new fixtures
  - Add new fixtures to `Rust/core/fixtures/synthetic/` or inline in the test

### Claude's Discretion
- Fixtures may be inlined in test code (not separate JSON files) if simpler
- `cargo test --locked` is the gate; no build changes needed
- No Swift changes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary files to modify
- `Rust/core/tests/algorithm_compare_tests.rs` — add ≥7 HRV + ≥7 sleep fixture tests
- *(new)* `.planning/phases/123-real-device-algorithm-validation/123-VALIDATION-ARTIFACT.md` — validation documentation

### Pattern references
- `Rust/core/tests/algorithm_compare_tests.rs` — existing `hrv_comparison_reports_zero_deltas_for_shared_time_domain_fields` test
- `Rust/core/fixtures/synthetic/hrv_goose_v0_hand_derived.json` — fixture data format
- `Rust/core/tests/sleep_validation_tests.rs` — sleep staging test patterns

### Requirements
- `.planning/REQUIREMENTS.md` §Real-Device Algorithm Validation — VAL-HRV-04, VAL-SLP-04

</canonical_refs>

<code_context>
## Existing Code Insights

- `compare_hrv_goose_to_reference` takes `HrvInput { rr_intervals_ms: Vec<f64>, ... }` and returns a report with `report.pass`
- `compare_sleep_goose_to_reference` takes `SleepInput` / `SleepV1Input` and compares staging
- The comparison tests already pass with 1 HRV fixture; adding 6 more creates the ≥7 session coverage
- No hardware dependency in the test infrastructure — all comparison is in-process Rust

</code_context>
