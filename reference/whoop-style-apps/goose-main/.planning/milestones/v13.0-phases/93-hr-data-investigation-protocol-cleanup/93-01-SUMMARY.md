# Plan 93-01 Summary — Fix HR Data Path (BUG-HR-01)

**Status:** Complete
**Commits:** `500e58b`

## What Was Built

Fixed two missing sites in `Rust/core/src/metric_features.rs` that caused WHOOP 5.0 fw 50.38.1.0 HR data to be silently discarded:

**Task 1 — trusted_frames_for_summary_kinds:**
Added `"r22_whoop5_hr"` to the trusted frame kind list in `run_heart_rate_feature_report` (line ~1173). Without this, R22 frames were excluded from the trusted-frame set and never marked reliable for the HR feature pipeline.

**Task 2 — heart_rate_plan_from_row:**
Added `DataPacketBodySummary::R22Whoop5Hr { hr_bpm: Some(hr_bpm), .. }` arm returning a `HeartRatePlan` with `marker_value: hr_bpm.round() as u8`. Confirmed that `heart_rate_feature_from_plan` reads `marker_value` as an integer BPM via `f64::from(plan.marker_value)`, so the round-and-cast is correct.

## Files Changed

- `Rust/core/src/metric_features.rs` — 2 sites fixed (+18 lines)

## Verification

- `cargo check --lib` passes clean
- Root cause confirmed: BLE subscription (61080003) and R22 parsing were already correct; the gap was in the metric feature extraction layer
- Runtime validation requires real WHOOP 5.0 device with fw 50.38.1.0 — hardware gated
