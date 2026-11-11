---
phase: 94-gen4-protocol-completeness
plan: "01"
subsystem: rust-core
tags: [gen4, protocol, metric-extraction, respiratory-rate, tdd]
status: complete

dependency_graph:
  requires: []
  provides:
    - respiratory_rate_plan_from_payload accepts V24History/packet_k=24
    - resp_raw extracted from absolute payload offset 76 (body offset 73) for Gen4
  affects:
    - VitalEventFeatureReport.respiratory_rate_inputs (populated for Gen4 users)
    - daily_recovery_metrics.respiratory_rate_rpm (unblocked for Gen4)

tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN via run_vital_event_feature_report integration boundary
    - Candidate schema_field tagging for unverified encoding (D-02 pattern)

key_files:
  created: []
  modified:
    - Rust/core/src/metric_features.rs
    - Rust/core/tests/v24_biometric_protocol_tests.rs

decisions:
  - "D-01: display metrics as-is, no Gen4 caveat in UI"
  - "D-02: tag resp_raw arm as _candidate with encoding=u16_le_raw, scale=1.0 — encoding unverified"
  - "D-03: NTC formula for skin_temp — out of scope this plan (skin_temp chain uses different path)"

metrics:
  duration: "~45 min"
  completed: "2026-06-19"
  tasks_completed: 2
  files_modified: 2
---

# Phase 94 Plan 01: Gen4 respiratory_rate_plan V24History Fix Summary

Gen4 users had `respiratory_rate_rpm` always None because `respiratory_rate_plan_from_payload` only
accepted `NormalHistory | V18History` in its body_summary guard. V24History frames (packet_k=24,
the Gen4 history format) were silently rejected before the inner packet_k match was reached — making
the pk=24 arm dead code. This plan adds V24History to the guard and the pk=24 arm with correct byte
offsets, unblocking respiratory rate extraction for all stored Gen4 frames without any new BLE capture.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add V24History guard + pk=24 arm to respiratory_rate_plan_from_payload (TDD) | 73c0855 | metric_features.rs, v24_biometric_protocol_tests.rs |
| 2 | Integration test v24_resp_raw_feature_extraction_from_decoded_row | 73c0855 | v24_biometric_protocol_tests.rs |
| style | cargo fmt v24_biometric_protocol_tests | 3e5dd1c | v24_biometric_protocol_tests.rs |

## Changes Made

### metric_features.rs — respiratory_rate_plan_from_payload (line ~4278)

**Guard update:** Added `DataPacketBodySummary::V24History { .. }` alongside `NormalHistory` and
`V18History` in the `let Some(ParsedPayload::DataPacket { body_summary: Some(...) })` guard.
Without this, packet_k=24 frames always returned None before reaching the inner match.

**New packet_k=24 arm:**
```rust
24 => Some(RespiratoryRatePlan {
    packet_k: *packet_k,
    timestamp_seconds: *timestamp_seconds,
    timestamp_subseconds: *timestamp_subseconds,
    schema_field: "v24_history_k24_body_73_resp_raw_candidate",
    raw_body_offset: 73,
    raw_absolute_offset: 76,  // 3-byte data-packet header + body offset 73
    encoding: "u16_le_raw",   // scale unknown — tagged as unverified candidate (D-02)
    scale: 1.0,
}),
```

The `_candidate` suffix in `schema_field` and `u16_le_raw` encoding communicate that resp_raw
scale/encoding for Gen4 is unconfirmed from hardware. The existing plausibility gate (6–30 rpm)
in `respiratory_rate_feature_from_plan` rejects implausible values, mitigating T-94-01.

### v24_biometric_protocol_tests.rs — New test infrastructure

Added helpers `passing_correlation()` and `make_v24_decoded_frame_row()` for building minimal
`DecodedFrameRow` fixtures with V24History `parsed_payload_json`, enabling integration tests that
exercise `run_vital_event_feature_report` without a SQLite database.

**5 new tests:**
- `respiratory_rate_plan_returns_some_for_v24` — Test A: pk=24 produces a respiratory_rate_input with correct schema_field and raw_absolute_offset=76
- `resp_raw_offset_reads_correct_bytes` — Test B: byte offset arithmetic confirms pkt[76..78] = resp_raw at body offset 73
- `pk18_regression_still_returns_some` — Test C: two pk=24 rows both produce inputs (stability)
- `pk99_v24_returns_none` — Test D: unrecognised packet_k with V24History returns zero inputs (no spurious arm)
- `v24_resp_raw_feature_extraction_from_decoded_row` — Task 2: resp_raw=240 seeded at payload[76..78] reads back as raw_u16_le=Some(240) in the feature report

**TDD gate compliance:** RED confirmed (`respiratory_rate_plan_returns_some_for_v24` failed before fix with message "Expected 1 respiratory_rate_input for V24History pk=24 frame; got 0"). GREEN confirmed (all 8 tests passed after fix).

## Skin-Temp Chain Finding (Step 3 — READ-ONLY trace)

**Finding:** `skin_temp_delta_c` in `MetricFeatures` / `RecoveryFeatureScoreOptions` is NOT populated
by `skin_temperature_plan_from_payload`. It is passed as `args.skin_temp_delta_c` by the caller
(bridge/metrics.rs line 3343), sourced from `official_whoop_skin_temperature_delta_c` (WHOOP app
data) or from `run_temperature_capture_validation_for_store` (temperature capture path).

The `skin_temperature_plan_from_payload` pk=24 arm exists in the code but is also dead code due to
the same guard bug (`NormalHistory | V18History` only). However, that arm maps to a DIFFERENT
temperature field (body offset 3, scale 1000) — not the NTC field at body offset 65 that feeds
`skin_temp_delta_c`. Fixing the guard for `skin_temperature_plan_from_payload` is out of scope for
this plan.

**Chain for skin_temp_delta_c:**
- `skin_temp_delta_c` in recovery scoring ← `args.skin_temp_delta_c` (passed by caller)
- Caller gets it from `official_whoop_skin_temperature_delta_c` (WHOOP cloud data) OR from
  `local_skin_temperature_delta_c` computed in `run_temperature_capture_validation_for_store`
- The temperature capture validation path uses `SkinTemperaturePlan` from
  `skin_temperature_plan_from_payload` — which also has the V24History guard bug
- This means Gen4 `skin_temp_delta_c` from local capture path is also broken, but via a
  DIFFERENT mechanism than respiratory rate. Follow-up issue recommended.

**Recommendation:** File a follow-up issue for `skin_temperature_plan_from_payload` V24History guard
fix. It is a separate plan because: (a) the arm maps to a different byte offset (body 3, not 65),
(b) the NTC formula at body 65 is in the body_summary struct, not the plan extractor, and
(c) the chain to `skin_temp_delta_c` goes through a different function than respiratory rate.

## Deviations from Plan

None — plan executed exactly as written. The skin_temp chain finding (Step 3) revealed a second
dead-code guard bug in `skin_temperature_plan_from_payload` but no code edit was made (read-only
per the plan). The finding is documented above and in the SUMMARY as recommended.

## Verification Results

```
cargo test --locked --test v24_biometric_protocol_tests
running 8 tests
test resp_raw_offset_reads_correct_bytes ... ok
test test_v24_body_summary_field_offsets ... ok
test test_v24_rr_zero_skip ... ok
test test_v24_short_payload ... ok
test pk99_v24_returns_none ... ok
test respiratory_rate_plan_returns_some_for_v24 ... ok
test pk18_regression_still_returns_some ... ok
test v24_resp_raw_feature_extraction_from_decoded_row ... ok

test result: ok. 8 passed; 0 failed
```

Full suite (`cargo test --locked`): 0 FAILED across all test suites.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced.
The pk=24 arm reads from existing `payload_hex` bytes via existing `decode_hex_with_whitespace`.
T-94-01 (tampering via raw_absolute_offset) mitigated by existing plausibility gate (6–30 rpm).
T-94-02 (information disclosure) accepted — `_candidate` schema_field suffix tags unverified data.

## Self-Check: PASSED

- `Rust/core/src/metric_features.rs` — modified, confirmed `v24_history_k24_body_73` present
- `Rust/core/tests/v24_biometric_protocol_tests.rs` — modified, confirmed `v24_resp_raw_feature_extraction_from_decoded_row` present
- Commits 73c0855 and 3e5dd1c — confirmed in git log
