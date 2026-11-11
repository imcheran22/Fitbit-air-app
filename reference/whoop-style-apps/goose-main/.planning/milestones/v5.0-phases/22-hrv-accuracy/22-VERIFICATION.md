---
phase: 22-hrv-accuracy
verified: 2026-06-07T00:00:00Z
status: human_needed
score: 16/17 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run goose_hrv_v0 on >= 5 real overnight WHOOP sessions and compare RMSSD output to the my-whoop Python reference"
    expected: "Delta <= 1 ms on all 5 sessions (ALG-HRV-04 cross-validation gate)"
    why_human: "Requires real recorded overnight BLE data and the my-whoop Python reference pipeline; no automated unit test can substitute for real-device data cross-validation"
---

# Phase 22: HRV Accuracy Verification Report

**Phase Goal:** Overnight RMSSD uses BLE-gap-aware segmentation, ectopic beat filtering with adaptive thresholds, and tiered SWS window selection — cross-validated to within 1 ms of the Python reference.
**Verified:** 2026-06-07T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `HrvInput.rr_timestamps_s: Option<Vec<f64>>` with `#[serde(default)]` exists | VERIFIED | `metrics.rs:31-32` — `#[serde(default)] pub rr_timestamps_s: Option<Vec<f64>>,` |
| 2 | Any gap > 3.0 s between consecutive RR timestamps is a segment boundary | VERIFIED | `segment_rr_by_gaps` at `metrics.rs:2140`: `timestamps[i] - timestamps[i-1] > gap_threshold_s` with call site `3.0` at `metrics.rs:964` |
| 3 | Successive RR differences that cross a segment boundary are excluded from RMSSD | VERIFIED | `rmssd_segmented` at `metrics.rs:2165` uses `windows(2)` only within each segment; cross-boundary pairs are structurally absent |
| 4 | An injected 4 s gap does not inflate RMSSD (verified by unit test) | VERIFIED | Test `goose_hrv_v0_excludes_cross_gap_differences` at `metrics_tests.rs:163` — asserts RMSSD = sqrt(200) with 4.4 s gap, strictly less than sqrt(206.25) without |
| 5 | When `rr_timestamps_s` is None, behaviour is identical to legacy (single segment, all intervals) | VERIFIED | Test `goose_hrv_v0_timestamps_none_matches_legacy` at `metrics_tests.rs:217` — asserts exact hand-derived value sqrt(200); code path at `metrics.rs:967-969` falls through to single-segment `vec![valid.clone()]` |
| 6 | Lipponen-Tarvainen filter rejects an interval when `|interval - rolling-5-beat-median| > 0.20 * median` | VERIFIED | `lipponen_tarvainen_filter` at `metrics.rs:2194` — `ECTOPIC_THRESHOLD = 0.20`, 5-beat centred window, rejects when `(segment[i] - median).abs() > ECTOPIC_THRESHOLD * median` |
| 7 | The ectopic filter is applied per gap-segment, before RMSSD computation | VERIFIED | `apply_ectopic_filter` called at `metrics.rs:982`, after `segment_rr_by_gaps` at `metrics.rs:964`, before `rmssd_segmented` at `metrics.rs:993` |
| 8 | `HrvOutput.ectopic_filter_removal_fraction: f64` exists and is 0.0 when no ectopic beats are removed | VERIFIED | `metrics.rs:48` — field present; test `goose_hrv_v0_clean_input_has_zero_removal_fraction` at `metrics_tests.rs:272` asserts `== 0.0` for clean input |
| 9 | Ectopic filter removal fraction reflects the proportion of intervals removed | VERIFIED | `metrics.rs:984-987` — `removed as f64 / total_before as f64`; test `goose_hrv_v0_removes_ectopic_beat_and_reports_fraction` asserts `> 0.0` and RMSSD `< 100.0` |
| 10 | `HrvInput.stage_segments: Option<Vec<SleepStageSegment>>` with `#[serde(default)]` exists | VERIFIED | `metrics.rs:33-34` — `#[serde(default)] pub stage_segments: Option<Vec<SleepStageSegment>>,` |
| 11 | Tier 1: last deep-sleep segment >= 5 min — RR intervals filtered to that window | VERIFIED | `select_sws_window` at `metrics.rs:799`: last deep segment with `duration_minutes >= SWS_MIN_DURATION_MINUTES (5.0)` returns tier 1; wired into `goose_hrv_v0` at `metrics.rs:884`; test `goose_hrv_v0_sws_tier1_last_deep_episode` asserts `window_tier_used == 1` |
| 12 | Tier 2: otherwise, recency-weighted mean uses all deep segments | VERIFIED | `select_sws_window` returns `(2, deep_indices)` when all deep < 5 min; `goose_hrv_v0` concatenates in chronological order; test `goose_hrv_v0_sws_tier2_weighted_mean_short_episodes` asserts `window_tier_used == 2` |
| 13 | Tier 3: no stage_segments or no deep — full intervals used (legacy behaviour) | VERIFIED | `select_sws_window` returns `(3, Vec::new())` when no deep found; test `goose_hrv_v0_sws_tier3_full_night_fallback` asserts `window_tier_used == 3` and RMSSD matches legacy sqrt(200) |
| 14 | `HrvOutput.window_tier_used: u8` exposes the tier (1, 2, or 3) | VERIFIED | `metrics.rs:49` — field present; set at `metrics.rs:1010`; all three tier tests assert correct value |
| 15 | ALG-HRV-04 code comment above `goose_hrv_v0` documents the <= 1 ms cross-validation gate | VERIFIED | `metrics.rs:855-859` — comment present, references ALG-HRV-04, states manual human gate, specifies >= 5 sessions and delta <= 1 ms |
| 16 | All existing `goose_hrv_v0` tests still pass after all three plan changes | VERIFIED | `cargo test -p goose-core` green, 0 failures across all test suites |
| 17 | RMSSD cross-validated to within 1 ms of the my-whoop Python reference on >= 5 real overnight sessions | UNCERTAIN — human needed | ALG-HRV-04 table in 22-03-SUMMARY.md shows 5 sessions all "pending"; code comment present but real-data validation not yet performed |

**Score:** 16/17 truths verified (truth 17 requires human verification)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Rust/core/src/metrics.rs` | rr_timestamps_s on HrvInput; segment_rr_by_gaps; rmssd_segmented; lipponen_tarvainen_filter; apply_ectopic_filter; ectopic_filter_removal_fraction on HrvOutput; stage_segments on HrvInput; select_sws_window; segment_interval_range; window_tier_used on HrvOutput; ALG-HRV-04 comment | VERIFIED | All symbols confirmed present at their stated line numbers |
| `Rust/core/tests/metrics_tests.rs` | 7 new test functions covering gap rejection, None parity, ectopic removal, zero-fraction baseline, and 3 SWS tiers | VERIFIED | All 7 functions present and substantive (lines 163, 217, 235, 272, 289, 336, 397) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `goose_hrv_v0` | `segment_rr_by_gaps` | Called at `metrics.rs:964` when `has_timestamps && timestamps_aligned` | WIRED | Call site confirmed with gap threshold 3.0 |
| `goose_hrv_v0` | `lipponen_tarvainen_filter` | `apply_ectopic_filter` at `metrics.rs:982` iterates each segment through `lipponen_tarvainen_filter` | WIRED | Confirmed call chain |
| `goose_hrv_v0` | `select_sws_window` | Called at `metrics.rs:884` before range gate | WIRED | Returns `(window_tier_used, sws_indices)` used to narrow interval slice |
| `HrvOutput` literal | `ectopic_filter_removal_fraction` | Set at `metrics.rs:1009` | WIRED | Single construction site; field set from computed value |
| `HrvOutput` literal | `window_tier_used` | Set at `metrics.rs:1010` | WIRED | Single construction site; field set from `select_sws_window` return |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ALG-HRV-01 | 22-01 | BLE-gap-aware segmentation; gaps > 3 s are segment boundaries | SATISFIED | `segment_rr_by_gaps` wired into `goose_hrv_v0`; gap-rejection test passes |
| ALG-HRV-02 | 22-02 | Lipponen-Tarvainen ectopic filter; `ectopic_filter_removal_fraction` exposed | SATISFIED | `lipponen_tarvainen_filter` + `apply_ectopic_filter` wired; ectopic test passes |
| ALG-HRV-03 | 22-03 | 3-tier SWS window selection; `stage_segments` on HrvInput; `window_tier_used` on HrvOutput | SATISFIED | `select_sws_window` wired; all three tier tests pass |
| ALG-HRV-04 | 22-03 | Cross-validation gate: RMSSD delta <= 1 ms vs my-whoop Python reference on >= 5 sessions | PARTIAL | Code comment present (satisfies 22-03 plan task); real-data validation pending — manual gate not completed |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| No anti-patterns found | — | — | — | No TBD/FIXME/XXX markers in any modified file; no empty implementations; no stub returns |

---

### Human Verification Required

#### 1. ALG-HRV-04 Cross-Validation (Real Overnight Sessions)

**Test:** Run `goose_hrv_v0` on the RR intervals from >= 5 real overnight WHOOP recording sessions. Compare the `rmssd_ms` output against the `my-whoop` Python reference algorithm for the same sessions.

**Expected:** Delta <= 1 ms on all 5 sessions. The table in `22-03-SUMMARY.md` must be filled in with actual values before Phase 22 is closed.

**Why human:** Requires real BLE-captured overnight RR data and the my-whoop Python pipeline. No automated unit test can substitute for real-device cross-validation on physiologically representative data. The unit tests cover algorithmic correctness on synthetic inputs; this gate verifies real-world accuracy alignment.

---

### Gaps Summary

No hard blockers. All automated must-haves are verified at all three levels (exists, substantive, wired). The single open item is the ALG-HRV-04 cross-validation gate, which was explicitly designed as a manual human step in the plan — the code comment requirement is satisfied, but the actual cross-validation on real sessions has not been performed.

The phase goal explicitly includes "cross-validated to within 1 ms of the Python reference" — this condition is not yet satisfied. Status is `human_needed`, not `passed`, until the cross-validation table is completed.

---

_Verified: 2026-06-07T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
