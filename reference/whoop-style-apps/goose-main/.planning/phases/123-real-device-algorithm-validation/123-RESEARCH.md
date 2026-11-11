# Phase 123: Real-Device Algorithm Validation — Research

**Researched:** 2026-06-28
**Domain:** Rust algorithm comparison test infrastructure (HRV + sleep staging)
**Confidence:** HIGH

## Summary

Phase 123 extends `Rust/core/tests/algorithm_compare_tests.rs` with ≥7 synthetic HRV fixture
tests and ≥7 synthetic sleep fixture tests. All infrastructure already exists — no new functions,
no new types, no new files beyond the test additions and the validation artifact doc.

The existing file contains exactly 9 tests: 1 HRV passing, 1 HRV failure-mode, 2 sleep (v0), 2
sleep-v1, 1 external-reference-report negative, 1 strain, 1 stress. Counting only the HRV
comparison tests that exercise `compare_hrv_goose_to_reference`, there is 1 passing fixture.
Counting only `compare_sleep_goose_to_reference` / `compare_sleep_v1_goose_to_reference` there
are 3 passing fixtures (one v0, one v1, one v1-external). The coverage gap is therefore:
6 additional HRV fixtures + 4 additional sleep fixtures needed to reach ≥7 of each.

The report struct for HRV asserts `report.pass == true` and iterates `report.deltas` checking
`delta.absolute_delta ≈ 0.0`. There is no explicit per-field ≤1ms assertion — passing is defined
by `report.pass`. For sleep, `report.pass` and `delta.absolute_delta ≈ 0.0` are the canonical
assertions; the comparable fields list is fixed at 7 items for every v0 and v1 call.

**Primary recommendation:** Add 6 HRV tests (covering low-HRV, high-HRV, bradycardic, young/mid/old
age brackets) and 4 sleep tests (deep-heavy, REM-heavy, fragmented, long-session) inline in
`algorithm_compare_tests.rs`. All inlined — no separate JSON fixtures needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Extend `Rust/core/tests/algorithm_compare_tests.rs` with ≥7 named synthetic HRV fixtures
  and ≥7 synthetic sleep session fixtures.
- D-02: Each HRV fixture uses 20–60 realistic RR intervals (ms) with known RMSSD. Use
  `compare_hrv_goose_to_reference` for each. Assert `report.pass == true`. At least one fixture
  per age-bracket range.
- D-03: Each sleep fixture uses `compare_sleep_goose_to_external_reference_report` or
  `compare_sleep_v1_goose_to_reference`. At least one per stage distribution: deep-heavy,
  light-heavy, mixed, REM-heavy, short-session, long-session, fragmented.
- D-04: Write `.planning/phases/123-real-device-algorithm-validation/123-VALIDATION-ARTIFACT.md`
  documenting fixture coverage, delta tolerance, `cargo test --locked` status, hardware-gate note.
- D-05: Do NOT create new comparison functions. Reuse existing infrastructure only.

### Claude's Discretion
- Fixtures may be inlined in test code (not separate JSON files) if simpler.
- `cargo test --locked` is the gate; no build changes needed.
- No Swift changes.

### Deferred Ideas (OUT OF SCOPE)
- SC-1: Real overnight RMSSD validation (hardware-gated — WHOOP 5 device needed).
- SC-2: Real sleep concordance ≥70% (hardware-gated — WHOOP 5 device needed).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAL-HRV-04 | ≥7 synthetic HRV session fixtures validating RMSSD against Python reference | HrvInput struct + compare_hrv_goose_to_reference signature fully verified |
| VAL-SLP-04 | ≥7 synthetic sleep session fixtures validating staging against reference (partial — fixture tests only) | SleepInput, SleepV1Input signatures fully verified; v0 + v1 comparison functions both usable |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HRV comparison | Rust core (`algorithm_compare.rs`) | — | Pure Rust, no FFI call at test time |
| Sleep comparison | Rust core (`algorithm_compare.rs`) | — | Pure Rust, no FFI call at test time |
| Validation artifact doc | Planning layer | — | Documents fixture coverage for release gate SC-3 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| goose_core (internal) | workspace | Provides all comparison functions and input types | It is the codebase |
| cargo test | Rust built-in | Test runner | No external runner needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| serde_json | workspace | Used only for external-reference-report fixtures (sleep external) | When constructing a `Value` reference report |

**Installation:** None — no new dependencies.

## Package Legitimacy Audit

No external packages are added in this phase.

## Architecture Patterns

### System Architecture Diagram

```
Test fn (inline RR intervals / SleepInput literal)
    │
    ▼
compare_hrv_goose_to_reference(&HrvInput)   OR   compare_sleep_v1_goose_to_reference(&SleepV1Input)
    │                                                    │
    ▼                                                    ▼
goose_hrv_v0(input)      reference_hrv_time_domain(input)    goose_sleep_v1(input)    reference_sleep_actigraphy_summary(input)
    │                              │                                │                        │
    └─────────── AlgorithmComparisonReport ─────────────────────────┴────────────────────────┘
                        │
                        ▼
                 assert!(report.pass)
                 for delta in report.deltas { assert_close(delta.absolute_delta, 0.0) }
```

### Recommended Project Structure

No structural changes — all additions are in the existing test file:

```
Rust/core/tests/
└── algorithm_compare_tests.rs   # Add ≥6 HRV + ≥4 sleep test functions here
.planning/phases/123-real-device-algorithm-validation/
└── 123-VALIDATION-ARTIFACT.md   # New doc; no code changes
```

### Pattern 1: HRV fixture (verified from algorithm_compare_tests.rs lines 13–40)

**What:** Construct `HrvInput` with realistic RR-interval sequence, call `compare_hrv_goose_to_reference`, assert `report.pass` and zero absolute deltas.

**When to use:** Every HRV fixture test. `rr_timestamps_s` and `stage_segments` are always `None` for synthetic fixtures.

```rust
// Source: Rust/core/tests/algorithm_compare_tests.rs lines 15-39 [VERIFIED: codebase]
#[test]
fn hrv_<scenario>() {
    let report = compare_hrv_goose_to_reference(&HrvInput {
        start_time: "2026-05-27T00:00:00Z".to_string(),
        end_time:   "2026-05-27T00:01:00Z".to_string(),
        rr_intervals_ms: vec![/* 20–60 realistic values */],
        input_ids: vec!["synthetic.<scenario>".to_string()],
        rr_timestamps_s: None,
        stage_segments: None,
    })
    .unwrap();

    assert!(report.pass, "{:?}", report.errors);
    for delta in report.deltas {
        assert_close(delta.absolute_delta, 0.0);
    }
}
```

**Minimum interval count for `report.pass == true`:** The failure-mode test (line 421) uses a single
interval `[100.0]` and produces `"goose:not_enough_valid_rr_intervals"`. The passing fixture uses
20 intervals. Use ≥20 intervals per fixture. [VERIFIED: codebase]

### Pattern 2: Sleep v0 fixture (verified from algorithm_compare_tests.rs lines 43–95)

**What:** Construct `SleepInput` with `..Default::default()` for optional fields, call
`compare_sleep_goose_to_reference`. Assert `report.pass` and 7 zero-delta entries.

```rust
// Source: Rust/core/tests/algorithm_compare_tests.rs lines 44-87 [VERIFIED: codebase]
#[test]
fn sleep_<scenario>() {
    let report = compare_sleep_goose_to_reference(&SleepInput {
        start_time: "2026-05-27T22:30:00Z".to_string(),
        end_time:   "2026-05-28T06:30:00Z".to_string(),
        sleep_duration_minutes: 420.0,
        sleep_need_minutes: 480.0,
        time_in_bed_minutes: 480.0,
        midpoint_deviation_minutes: 30.0,
        disturbance_count: 4,
        input_ids: vec!["synthetic.<scenario>".to_string()],
        ..Default::default()
    })
    .unwrap();

    assert!(report.pass, "{:?}", report.errors);
    assert_eq!(report.comparable_fields.len(), 7);
    for delta in &report.deltas {
        assert_close(delta.absolute_delta, 0.0);
    }
}
```

**Comparable fields for sleep v0 (always 7):** [VERIFIED: codebase, lines 59-69]
`time_in_bed_minutes`, `sleep_minutes`, `wake_minutes`, `sleep_efficiency_fraction`,
`wake_after_sleep_onset_minutes`, `disturbance_count`, `fragmentation_index_per_hour`.

### Pattern 3: Sleep v1 fixture (verified from algorithm_compare_tests.rs lines 98–145)

**What:** Wrap `SleepInput` in `SleepV1Input` with `model_status: SleepModelStatusInput { sleep_permission_granted: true, imported_platform_sleep_nights: N, .. }`. The `..Default::default()` on both inner structs covers all optional fields. [VERIFIED: codebase]

```rust
// Source: Rust/core/tests/algorithm_compare_tests.rs lines 99-144 [VERIFIED: codebase]
#[test]
fn sleep_v1_<scenario>() {
    let report = compare_sleep_v1_goose_to_reference(&SleepV1Input {
        sleep: SleepInput {
            start_time: "2026-05-27T22:30:00Z".to_string(),
            end_time:   "2026-05-28T06:30:00Z".to_string(),
            sleep_duration_minutes: 360.0,
            sleep_need_minutes: 480.0,
            time_in_bed_minutes: 420.0,
            midpoint_deviation_minutes: 45.0,
            disturbance_count: 8,
            wake_after_sleep_onset_minutes: 60.0,
            input_ids: vec!["synthetic.<scenario>".to_string()],
            ..Default::default()
        },
        model_status: SleepModelStatusInput {
            sleep_permission_granted: true,
            imported_platform_sleep_nights: 7,
            motion_coverage_fraction: Some(0.85),
            heart_rate_coverage_fraction: Some(0.75),
            ..Default::default()
        },
        data_coverage_fraction: Some(0.88),
        ..Default::default()
    })
    .unwrap();

    assert!(report.pass, "{:?}", report.errors);
    assert_eq!(report.goose_algorithm_id, "goose.sleep.v1");
    for delta in &report.deltas {
        assert_close(delta.absolute_delta, 0.0);
    }
}
```

### Anti-Patterns to Avoid

- **Fewer than ~20 RR intervals in an HRV fixture:** The ectopic-filter / validity check
  requires a minimum sample size. The failure-mode test uses 1 interval intentionally. Use ≥20
  for passing fixtures. [VERIFIED: codebase]
- **Omitting `wake_after_sleep_onset_minutes` from sleep v1 SleepInput:** The v1 comparison
  includes WASO in the 7 comparable fields. The existing v1 test sets it explicitly (line 108).
  Omit it only for v0 fixtures where `..Default::default()` fills it as 0.0 (which is also
  tested implicitly). [VERIFIED: codebase]
- **Constructing `SleepV1Input` without `model_status.sleep_permission_granted: true`:**
  The sleep v1 algorithm may gate output behind this flag; all existing passing fixtures set it.
  [VERIFIED: codebase]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RMSSD calculation | Custom formula in test | `compare_hrv_goose_to_reference` | Already validated against Python reference; test asserts delta is 0, so any divergence would fail |
| Sleep metric derivation | Custom wake-minutes math | `compare_sleep_goose_to_reference` | wake_minutes = time_in_bed - sleep_duration is derived inside the function; just pass the raw inputs |
| Reference report JSON | Hand-constructed reference JSON | `compare_sleep_v1_goose_to_reference` (not the external variant) | Simpler; external-report variant is already tested by the existing `sleep_v1_comparison_accepts_external_reference_report_output` test |

## Common Pitfalls

### Pitfall 1: Fixture produces `not_enough_valid_rr_intervals`
**What goes wrong:** `report.pass == false` with error `"goose:not_enough_valid_rr_intervals"`.
**Why it happens:** RR vector has fewer than the minimum valid count after ectopic filtering.
**How to avoid:** Use ≥20 intervals within physiological range (600–1200ms for normal HR).
**Warning signs:** `report.deltas.is_empty()` and `report.quality_flags` contains
`"comparison_outputs_missing"`. [VERIFIED: codebase, lines 419-448]

### Pitfall 2: HRV fixture with very high variance fails ectopic filter
**What goes wrong:** Intervals like `[400.0, 1500.0, 400.0, 1500.0, ...]` alternating wildly get
filtered out, leaving too few valid intervals.
**Why it happens:** The ectopic filter removes intervals > some threshold deviation from the local
mean.
**How to avoid:** Keep adjacent RR differences ≤200ms. A ±50ms jitter around a central value
(e.g., 800ms ± 50ms) is safe for all fixture scenarios. [ASSUMED — based on HRV physiology
conventions; ectopic threshold not read from source]

### Pitfall 3: Sleep fixture with `time_in_bed_minutes < sleep_duration_minutes`
**What goes wrong:** Derived `wake_minutes` becomes negative, causing reference algorithm errors.
**How to avoid:** Always ensure `time_in_bed_minutes >= sleep_duration_minutes`. Set
`wake_after_sleep_onset_minutes <= time_in_bed_minutes - sleep_duration_minutes`. [ASSUMED]

### Pitfall 4: Test name collision with existing tests
**What goes wrong:** Two tests with same name cause compile error.
**How to avoid:** Prefix all new test names with the scenario descriptor:
`hrv_low_hrv_rmssd_fixture`, `hrv_bradycardic_resting_fixture`, etc. [VERIFIED: codebase pattern]

## Code Examples

### HRV fixture design matrix (7 scenarios)

The existing test covers: normal resting HRV, 20 intervals, ~800ms RR (75 BPM).

New fixtures needed (6 additional):

```rust
// [VERIFIED: HrvInput struct fields from Rust/core/src/metrics.rs lines 32-42]

// Fixture 2: Low HRV — high stress, tight RR spread
// ~800ms mean, ±5ms jitter → RMSSD ≈ 7ms
rr_intervals_ms: vec![
    800.0, 802.0, 798.0, 801.0, 799.0, 803.0, 797.0, 801.0, 799.0, 800.0,
    802.0, 798.0, 800.0, 801.0, 799.0, 802.0, 798.0, 800.0, 801.0, 799.0,
]

// Fixture 3: High HRV — well-recovered, wide RR spread
// ~800ms mean, ±80ms jitter → RMSSD ≈ 113ms
rr_intervals_ms: vec![
    800.0, 880.0, 720.0, 850.0, 760.0, 840.0, 730.0, 870.0, 750.0, 820.0,
    800.0, 870.0, 730.0, 850.0, 750.0, 840.0, 760.0, 820.0, 800.0, 860.0,
]

// Fixture 4: Bradycardic resting HR (~45 BPM → ~1333ms RR)
rr_intervals_ms: vec![
    1330.0, 1340.0, 1320.0, 1335.0, 1325.0, 1340.0, 1320.0, 1330.0, 1335.0, 1325.0,
    1330.0, 1340.0, 1320.0, 1335.0, 1325.0, 1340.0, 1320.0, 1330.0, 1335.0, 1325.0,
]

// Fixture 5: Longer window — 60 intervals, moderate HRV
// (covers ≥3 "overnight" minutes of RR data)
// 60 intervals at ~950ms (63 BPM), ±30ms → RMSSD ≈ 42ms

// Fixture 6: Age-bracket young (18–25) — same algorithm but CONTEXT age note
// Algorithm does not use age — label documents fixture intent
// ~700ms RR (85 BPM), ±25ms

// Fixture 7: Age-bracket old (65+) — lower HR, wide intervals
// ~1050ms RR (57 BPM), ±35ms
```

### Sleep fixture design matrix (7 scenarios)

Existing tests cover: standard 8h sleep (v0), standard 8h sleep (v1), standard 8h sleep (v1+external).

New fixtures needed (4 additional to reach ≥7 total passing sleep tests):

```rust
// [VERIFIED: SleepInput struct from Rust/core/src/metrics.rs lines 61-81]

// Fixture 4: Deep-heavy — long sleep, low disturbance, high efficiency
sleep_duration_minutes: 450.0, time_in_bed_minutes: 460.0,
sleep_need_minutes: 480.0, disturbance_count: 1,
midpoint_deviation_minutes: 10.0,
wake_after_sleep_onset_minutes: 10.0   // for v1 variant

// Fixture 5: Short session — 5h sleep, high disturbance
sleep_duration_minutes: 300.0, time_in_bed_minutes: 360.0,
sleep_need_minutes: 480.0, disturbance_count: 10,
midpoint_deviation_minutes: 60.0

// Fixture 6: Long session — 9.5h sleep, low efficiency
sleep_duration_minutes: 480.0, time_in_bed_minutes: 570.0,
sleep_need_minutes: 480.0, disturbance_count: 3,
midpoint_deviation_minutes: 20.0

// Fixture 7: Fragmented — moderate sleep, very high disturbance
sleep_duration_minutes: 360.0, time_in_bed_minutes: 480.0,
sleep_need_minutes: 480.0, disturbance_count: 15,
midpoint_deviation_minutes: 0.0
```

### Key numeric constraint (verified)
`wake_minutes = time_in_bed_minutes - sleep_duration_minutes`
`fragmentation_index_per_hour = disturbance_count / (sleep_duration_minutes / 60.0)`
`sleep_efficiency_fraction = sleep_duration_minutes / time_in_bed_minutes`

All three are asserted zero-delta, so consistency between the input fields is critical.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single HRV fixture | ≥7 HRV fixtures (this phase) | Phase 123 | VAL-HRV-04 requirement met |
| 3 passing sleep fixtures | ≥7 sleep fixtures (this phase) | Phase 123 | VAL-SLP-04 partial requirement met |

**Not deprecated:** `compare_sleep_goose_to_reference` (v0) is still usable and should be used for
some of the new fixtures to exercise both the v0 and v1 paths. [VERIFIED: codebase — both
functions present and tested]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ectopic filter threshold is ~200ms adjacent-interval deviation | Pitfall 2 | Fixture with ±80ms jitter might get filtered; test would fail with `not_enough_valid_rr_intervals` — easy to diagnose |
| A2 | `time_in_bed_minutes < sleep_duration_minutes` produces negative wake_minutes and causes an error | Pitfall 3 | Might silently produce unexpected results rather than an error — low risk as long as inputs are physiologically valid |

## Open Questions

1. **Should the 7 sleep fixtures span both v0 and v1?**
   - What we know: existing file has 1 v0 and 2 v1 passing tests (3 total). D-03 says "at least one per stage distribution."
   - What's unclear: whether the ≥7 count must be per-function or across both.
   - Recommendation: Mix — use `compare_sleep_goose_to_reference` (v0) for 3 new fixtures and `compare_sleep_v1_goose_to_reference` for 1 new fixture, reaching ≥7 total passing sleep tests.

## Environment Availability

Step 2.6: SKIPPED — pure Rust test additions, no external dependencies. `cargo test --locked` is
the only gate and requires no additional tooling beyond the existing Rust toolchain.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | cargo test (built-in) |
| Config file | Rust/core/Cargo.toml |
| Quick run command | `cd Rust/core && cargo test --locked algorithm_compare` |
| Full suite command | `cd Rust/core && cargo test --locked` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VAL-HRV-04 | ≥7 HRV synthetic fixtures pass | unit/integration | `cargo test --locked hrv_` | ✅ (will exist after phase) |
| VAL-SLP-04 | ≥7 sleep synthetic fixtures pass | unit/integration | `cargo test --locked sleep_` | ✅ (will exist after phase) |

### Sampling Rate
- **Per task commit:** `cd Rust/core && cargo test --locked algorithm_compare`
- **Phase gate:** `cd Rust/core && cargo test --locked` (full suite green)

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. The test file exists; only new
`#[test]` functions are needed.

## Security Domain

Security enforcement: not applicable. This phase adds only test code — no user-facing surface,
no network, no storage, no auth.

## Sources

### Primary (HIGH confidence)
- `Rust/core/tests/algorithm_compare_tests.rs` — exact function call signatures, assertion
  patterns, minimum interval count for pass, comparable fields list [VERIFIED: codebase]
- `Rust/core/src/metrics.rs` — complete struct field listings for `HrvInput`, `SleepInput`,
  `SleepV1Input`, `SleepModelStatusInput`, `SleepStageSegment` [VERIFIED: codebase]
- `Rust/core/src/algorithm_compare.rs` — function signatures for all 5 comparison functions
  [VERIFIED: codebase]
- `Rust/core/src/sleep_need.rs` — age bracket boundaries: 18-25 → 480min, 26-64/None → 450min,
  65+ → 420min [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `Rust/core/fixtures/synthetic/hrv_goose_v0_hand_derived.json` — confirmed inline inlining is
  equivalent to JSON fixture pattern [VERIFIED: codebase]

## Metadata

**Confidence breakdown:**
- Function signatures and struct fields: HIGH — read directly from source
- Assertion patterns: HIGH — read directly from tests
- RR interval threshold for ectopic filter: LOW (ASSUMED) — based on HRV physiology, not source read
- Sleep input consistency rules: LOW (ASSUMED) — derived from formula understanding

**Research date:** 2026-06-28
**Valid until:** Stable indefinitely — pure Rust codebase, no external dependencies
