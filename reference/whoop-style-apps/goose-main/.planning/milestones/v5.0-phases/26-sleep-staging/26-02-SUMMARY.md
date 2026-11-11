---
phase: 26-sleep-staging
plan: 02
subsystem: algorithm
tags: [rust, sleep-staging, 4-class, actigraphy, aasm, reimposition, cole-kripke, bridge, alg-slp-04]

# Dependency graph
requires:
  - phase: 26-sleep-staging
    plan: 01
    provides: Cole-Kripke binary spine, SleepStagingInput/Output, stage_sleep, named constants
provides:
  - stage_sleep_four_class(): 4-class (wake/light/deep/rem) hypnogram from HR + motion features
  - EpochHrFeature type
  - Physiological reimposition: no early REM (15 min), minimum 5-min segment merge
  - AASM metrics: TST, TIB, efficiency, SOL, WASO, stage_minutes per class
  - Extended SleepStagingOutput with AASM fields
  - metrics.sleep_staging bridge updated to accept hr_features and call 4-class classifier
  - ALG-SLP-04 manual cross-validation gate doc comment
affects: [26-sleep-staging, sleep-ui, hypnogram]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 4-class classification via layered thresholds on Cole-Kripke spine (deep: HR <= p25 + stillness; rem: clock_proxy >= 0.4 + HR > median; light: fallback)
    - Physiological reimposition as a post-processing pass: rule (a) no-early-REM, rule (b) min-segment merge
    - AASM metric derivation as a pure helper over final epoch slice
    - Bridge arg struct extended with #[serde(default)] optional field for backward compatibility

key-files:
  modified:
    - Rust/core/src/sleep_staging.rs
    - Rust/core/src/bridge.rs

key-decisions:
  - "4-class refinement built on top of the binary spine: stage_sleep_four_class() calls cole_kripke_d_score() internally and re-classifies sleep epochs — no duplication of the D-score logic"
  - "HR feature alignment via nearest-timestamp lookup — robust when HR sample rate differs from epoch rate"
  - "Physiological reimposition runs after per-epoch classification: rules are applied in order (a then b), with rule (b) using a fixed-point iteration to catch cascading merges"
  - "SleepStagingOutput AASM fields default to 0/empty in binary stage_sleep() — additive extension preserves backward compatibility"
  - "ALG-SLP-04 manual gate documented as a code comment above stage_sleep_four_class, mirroring ALG-HRV-04 in metrics.rs"

patterns-established:
  - "Post-classification reimposition pattern: pure fn takes &mut Vec<SleepEpoch> + constraint constants; no knowledge of DB or bridge args"
  - "AASM derivation pattern: pure fn over epoch slice returns a named struct, then unpacked into output fields"

requirements-completed: []

# Metrics
duration: 27min
completed: 2026-06-08T12:12:17Z
---

# Phase 26 Plan 02: Sleep Staging — 4-Class Hypnogram + AASM Metrics Summary

**4-class Cole-Kripke + cardiorespiratory sleep classifier (wake/light/deep/rem) with physiological reimposition and AASM summary metrics, exposed via metrics.sleep_staging bridge — ALG-SLP-04 human cross-validation gate pending real overnight data**

## Performance

- **Duration:** 27 min
- **Completed:** 2026-06-08T12:12:17Z
- **Tasks executed:** 2 (Task 3 is a human checkpoint — not auto-executable)
- **Files modified:** 2 (sleep_staging.rs extended, bridge.rs updated)

## Accomplishments

### Task 1: 4-class classifier + physiological reimposition + AASM metrics
- Extended `Rust/core/src/sleep_staging.rs` with `stage_sleep_four_class()`:
  - Per-epoch 4-class assignment: deep (HR <= p25 + activity <= DEEP_STILLNESS_ACTIVITY_MAX), rem (clock_proxy >= REM_CLOCK_PROXY_MIN + HR > session median), light (fallback for sleep epochs), wake (unchanged from binary spine)
  - `EpochHrFeature { ts, hr_bpm }` struct for HR input
  - Named threshold constants: `DEEP_HR_PERCENTILE = 0.25`, `DEEP_STILLNESS_ACTIVITY_MAX = 0.05`, `REM_CLOCK_PROXY_MIN = 0.4`, `NO_REM_ONSET_MINUTES = 15.0`, `MIN_SEGMENT_MINUTES = 5.0`
  - Physiological reimposition: rule (a) no REM before 15 min onset, rule (b) merge segments < 5 min (fixed-point loop)
  - `aasm_metrics()` helper: TST, TIB, efficiency, SOL, WASO, stage_minutes BTreeMap
  - Extended `SleepStagingOutput` with AASM fields (additive, backward compatible)
  - `staging_method = "actigraphy_uncalibrated"` mandatory on every non-empty 4-class output
  - HR fallback: when `hr_features` is empty, sleep epochs become "light" (no panic)
  - 9 new unit tests (4-class deep, rem, reimposition-a, reimposition-b, AASM, no-HR fallback, empty-rows, actigraphy-uncalibrated) + 6 binary spine tests retained = 15 total, all green

### Task 2: Bridge wiring + ALG-SLP-04 manual-gate doc comment
- Extended `SleepStagingBridgeArgs` with `#[serde(default)] hr_features: Vec<HrFeatureArg>`
- `sleep_staging_bridge()` now maps `HrFeatureArg` → `EpochHrFeature` and calls `stage_sleep_four_class()` instead of binary `stage_sleep()`
- Bridge test updated to assert AASM fields present in no_imu_data response
- ALG-SLP-04 cross-validation gate doc comment added above `stage_sleep_four_class()`:
  - >= 70% epoch agreement on >= 5 real overnight sessions required before phase close
  - Known EEG-free literature ceiling: 65-73%
  - Results to be recorded in this SUMMARY

## Task Commits

1. **Task 1: 4-class hypnogram — classifier, reimposition, AASM metrics** — `fe0a870` (feat)
2. **Task 2: Bridge wiring + ALG-SLP-04 manual-gate doc comment** — `ccfe37d` (feat)

## Files Created/Modified

- `Rust/core/src/sleep_staging.rs` — stage_sleep_four_class, EpochHrFeature, threshold constants, reimposition, AASM metrics, extended output fields, 9 new tests
- `Rust/core/src/bridge.rs` — HrFeatureArg, hr_features field, 4-class bridge call, AASM field assertions in bridge test

## Decisions Made

- **Nearest-timestamp HR alignment:** HR samples are matched to gravity epochs by minimum |ts_epoch - ts_hr|; this is robust when HR sample rate (typically 1/5 s or 1/6 s) differs from the 1-minute epoch rate
- **Fixed-point reimposition for rule (b):** short-segment merging iterates until stable (max n+1 iterations) to handle cascading merges where two adjacent short segments need to merge into a third
- **Binary stage_sleep() left intact:** the original binary spine function is preserved without AASM fields for backward compatibility; `stage_sleep_four_class()` is the new primary entry point called by the bridge
- **clock_proxy derived from epoch index:** fractional position = index / (n-1); avoids dependency on wall-clock time or session timestamps inside the classifier

## Deviations from Plan

None — plan executed exactly as written.

## ALG-SLP-04 Cross-Validation Gate (Task 3 — Human Checkpoint)

**Status:** PENDING — awaiting real overnight session data

**Gate requirement:** >= 5 real overnight WHOOP sessions with:
- Epoch-by-epoch hypnogram from `metrics.sleep_staging` compared against WHOOP official stages
- Per-session epoch-level agreement (fraction of epochs with matching class)
- >= 70% agreement on each session (or documented exception for the overall mean)

**Literature context:** The known ceiling for EEG-free actigraphy staging is 65-73% (Sadeh 1994, Cole 1992, Palotti et al. 2019). A session below 70% is within this range and must be documented with the mean. The gate is met when the mean across >= 5 sessions >= 70%.

**Results table (to be filled when sessions are captured):**

| Date | Session Duration | Epoch Agreement % | Notes |
|------|-----------------|-------------------|-------|
| — | — | — | No sessions recorded yet |

**Resume signal:** Type "validated" with session agreements, or "defer" to mark ALG-SLP-04 as [~] manual-pending in ROADMAP/REQUIREMENTS (same pattern as ALG-HRV-04).

## Known Stubs

None — all fields in `SleepStagingOutput` are computed from input data; no hardcoded placeholders.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The `hr_features` deserialization is hardened via `#[serde(default)]` typed `Vec<HrFeatureArg>` — T-26-04 mitigation in place. T-26-05 (accuracy claim) addressed by the ALG-SLP-04 manual gate doc comment and this SUMMARY section.

## Self-Check: PASSED

- `fe0a870` — feat(26-02): 4-class sleep hypnogram FOUND in git log
- `ccfe37d` — feat(26-02): wire HR features through bridge FOUND in git log
- `Rust/core/src/sleep_staging.rs` — FOUND, min_lines > 200 (>700 lines)
- `grep "ALG-SLP-04" Rust/core/src/sleep_staging.rs` — FOUND at line 179
- `grep "actigraphy_uncalibrated" Rust/core/src/sleep_staging.rs` — FOUND (STAGING_METHOD_ACTIGRAPHY const + usage)
- `grep "stage_sleep_four_class" Rust/core/src/bridge.rs` — FOUND
- `cargo test sleep_staging` — 15 passed, 0 failed

---
*Phase: 26-sleep-staging*
*Completed tasks: 2/3 (Task 3 is ALG-SLP-04 human checkpoint)*
*Completed: 2026-06-08*
