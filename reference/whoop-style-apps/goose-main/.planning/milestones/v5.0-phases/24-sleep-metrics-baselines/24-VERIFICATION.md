---
phase: 24-sleep-metrics-baselines
verified: 2026-06-08T10:30:00Z
status: human_needed
score: 8/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the iOS app in simulator (scheme GooseSwift), go to Health tab -> Sleep V2, tap the primary sleep card to open PrimarySleepDetailSheet. Confirm the 'Sleep quality' stat group shows HR dip %, WASO, SOL, and disturbance count with no layout regression in the existing Asleep / In bed / Quality row or Stages section."
    expected: "New 'Sleep quality' section visible with four labelled stats: HR dip %, WASO (minutes), Sleep onset (minutes), Disturbances (count). Values are non-placeholder (not '--') for a session with >= 50% HR coverage. Existing rows and Stages section are undisturbed."
    why_human: "SwiftUI layout, visual grouping, and placeholder vs real-value appearance require runtime rendering. Grep confirms all four metric strings are passed into PrimarySleepDetailSheet but cannot verify pixel-level layout, correct formatting, or that no view is hidden/clipped."
---

# Phase 24: Sleep Metrics Baselines Verification Report

**Phase Goal:** Sleep quality metrics (HR dip, WASO, SOL, disturbance count) are computed from existing HR data and surfaced in the Sleep V2 dashboard; the EWMA baseline engine required by Recovery is implemented and idempotent.
**Verified:** 2026-06-08T10:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `SleepScoreOutput` exposes `sol_minutes`, `waso_minutes`, `disturbance_count`, `rem_latency_minutes` as populated fields | VERIFIED | `metrics.rs` lines 95-105: all four fields declared on `SleepScoreOutput`; populated at lines 1273-1279 in `goose_sleep_v0` output construction |
| 2 | `heart_rate_dip_pct` uses rolling 5-min minimum vs pre-sleep baseline, not stage-segment proxy | VERIFIED | `metrics.rs` lines 4061-4092: dedicated `pub fn heart_rate_dip_pct` with explicit rolling 5-min window scan; labelled as separate from any heuristic path |
| 3 | WASO and SOL are derived from HR-threshold method (HR vs resting_hr × 1.05), gated on >= 50% HR coverage | VERIFIED | `metric_features.rs` lines 4969 (gate computation) and 5083-5107: `if heart_rate_coverage_fraction >= 0.50` selects HR-threshold path; < 50% adds `sleep_hr_metrics_low_coverage_fallback` quality flag |
| 4 | Sleep V2 primary-sleep detail surfaces HR dip %, WASO, SOL, and disturbance count | VERIFIED (code) / UNCERTAIN (visual) | `SleepDetailViews.swift` lines 162-178: "Sleep quality" `VStack` renders four `SleepV2SleepDetailStat` rows; `HealthDataStore+Sleep.swift` lines 36-40 read all four fields from `output`; `HealthDataTypes.swift` lines 153-156 declare the four `String` fields on `PrimarySleepDetail` — visual layout requires human check |
| 5 | `baselines.rs` implements EWMA (alpha=0.10) reconstructable from `daily_recovery_metrics` | VERIFIED | `baselines.rs` fully implemented (382 lines): `EwmaState`, `EwmaBaseline`, `EwmaTrustLevel`; `fold_history` reads `daily_recovery_metrics_all_ordered` (no new table) |
| 6 | Cold-start guard returns None for z-score until night_count >= 4; trust levels `calibrating/provisional/trusted` exposed | VERIFIED | `baselines.rs` lines 19 (`MIN_NIGHTS_SEED = 4`), 122-128 (z_score guard), 36-65 (`EwmaTrustLevel` with `from_night_count` covering 3/4/13/14 boundaries); tests at lines 278-334 confirm boundaries |
| 7 | EWMA update is idempotent: `BEGIN EXCLUSIVE` transaction + date guard prevents double-update | VERIFIED | `store.rs` lines 3619-3620: `BEGIN EXCLUSIVE TRANSACTION`; lines 3640-3660: date guard checks for existing row and returns `Ok(false)` (skipped) for any second call with same date_key regardless of value difference |
| 8 | `store.ewma_baseline_fold_history` and `store.ewma_baseline_update` bridge methods callable from Swift | VERIFIED | `bridge.rs` lines 298-299: both names in `BRIDGE_METHODS` const; lines 2668-2675: dispatch arms; lines 3363-3376: bridge functions implemented |
| 9 | Sleep V2 detail sheet renders correctly with no layout regression (human) | UNCERTAIN | Code wiring is complete; visual rendering requires human verification |

**Score:** 8/9 truths verified (truth 9 pending human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Rust/core/src/metrics.rs` | `heart_rate_dip_pct`, `waso_from_hr`, `sol_from_hr`, `hr_disturbance_count` helpers + `SleepScoreOutput` fields | VERIFIED | All four `pub fn` helpers at lines 4061/4098/4113/4160; `SleepScoreOutput` extended at lines 92-105 |
| `Rust/core/src/metric_features.rs` | `sleep_window_feature` wired to HR-threshold helpers | VERIFIED | Lines 17 (import), 5083-5107 (gate + calls): `heart_rate_dip_pct`, `sol_from_hr`, `waso_from_hr`, `hr_disturbance_count` called inside coverage gate |
| `Rust/core/src/baselines.rs` | `EwmaState`, `EwmaBaseline`, `EwmaTrustLevel`, `fold_history`, idempotent update | VERIFIED | File exists (382 lines); all required types and functions present with full test coverage |
| `Rust/core/src/lib.rs` | `pub mod baselines` declaration | VERIFIED | Line 19: `pub mod baselines;` |
| `Rust/core/src/store.rs` | `daily_recovery_metrics_all_ordered`, `ewma_baseline_update` | VERIFIED | Lines 3556 and 3601: both methods implemented |
| `Rust/core/src/bridge.rs` | `store.ewma_baseline_fold_history` + `store.ewma_baseline_update` dispatch | VERIFIED | Both in `BRIDGE_METHODS` const (lines 298-299) and dispatch table (lines 2668-2675) |
| `GooseSwift/HealthDataTypes.swift` | `PrimarySleepDetail` gains four `String` fields | VERIFIED | Lines 153-156: `heartRateDipText`, `wasoText`, `solText`, `disturbanceText` declared |
| `GooseSwift/HealthDataStore+Sleep.swift` | `primarySleepDetail` reads four metrics from `score_result.output` | VERIFIED | Lines 36-40 and 53-56: all four fields read and passed to `PrimarySleepDetail` |
| `GooseSwift/SleepDetailViews.swift` | "Sleep quality" stat group with four rows | VERIFIED | Lines 162-178: `VStack` titled "Sleep quality" with `SleepV2SleepDetailStat` rows for HR dip, WASO, Sleep onset, Disturbances |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `metric_features.rs` | `metrics.rs` | `heart_rate_dip_pct` / `waso_from_hr` / `sol_from_hr` | WIRED | Line 17 imports all four helpers; lines 5085/5094/5097/5098 call them inside the >= 50% coverage gate |
| `HealthDataStore+Sleep.swift` | `metrics.sleep_score_from_features` output | reads `sol_minutes`, `waso_minutes`, `heart_rate_dip_percent`, `disturbance_count` | WIRED | Lines 36-40: all four field reads from `output` dict; values passed into `PrimarySleepDetail` at lines 53-56 |
| `baselines.rs` | `daily_recovery_metrics` | `fold_history` reads ordered rows via `GooseStore` | WIRED | `fold_history` calls `store.daily_recovery_metrics_all_ordered()` (line 160); `ewma_baseline_update` inserts into `daily_recovery_metrics` (line 3672) |
| `bridge.rs` | `baselines.rs` | dispatch calls `fold_history` / `ewma_baseline_update` | WIRED | Lines 2668-2675: both dispatch arms call through to the store/baselines methods; bridge functions at 3363/3374 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `SleepDetailViews.swift` | `sleep.heartRateDipText`, `sleep.wasoText`, `sleep.solText`, `sleep.disturbanceText` | `primarySleepDetail(fromSleepReport:)` reads `output["heart_rate_dip_percent"]` etc. from Rust bridge response | Yes — `SleepScoreOutput` fields populated from `sleep_window_feature` HR-threshold computation; `"--"` placeholder only when field is absent/nil | FLOWING |
| `EwmaBaseline` / bridge | `hrv.mean`, `resting_hr.mean` | `daily_recovery_metrics_all_ordered()` SQL read, folded into `EwmaState` | Yes — reads real DB rows; idempotent update inserts real `hrv_rmssd` + `resting_hr_bpm` values into same table | FLOWING |

### Behavioral Spot-Checks

Step 7b skipped for UI artifact (`SleepDetailViews.swift`) — requires simulator. Rust logic was tested via `cargo test` (commits e1959bf, 0483c45, 7ee81af, b568177, 30d14f5 documented in SUMMARYs as green). Bridge round-trip tests exist in `bridge.rs` lines 9046-9143.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust cargo test: baselines + HR helpers + bridge | Documented in SUMMARY: all tests green at commit 30d14f5 | Tests green per commit record | PASS (commit-verified) |
| Bridge methods in METHODS const | `grep "ewma_baseline" Rust/core/src/bridge.rs` | Lines 298-299 confirm both names in const | PASS |
| No new SQLite table created | `grep "CREATE TABLE" Rust/core/src/baselines.rs` | No CREATE TABLE in baselines.rs; writes only to `daily_recovery_metrics` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ALG-SLP-01 | 24-01-PLAN.md | HR dip %, WASO, SOL, disturbance count computed via HR-threshold method and exposed in `SleepScoreOutput`; Sleep V2 dashboard updated | SATISFIED | All four pure helpers implemented in `metrics.rs`; `metric_features.rs` gates on 50% HR coverage; `SleepScoreOutput` carries all fields; UI wired in `SleepDetailViews.swift` |
| ALG-SLP-02 | 24-02-PLAN.md | `baselines.rs` EWMA engine; `fold_history` from `daily_recovery_metrics`; cold-start guard; `BEGIN EXCLUSIVE` idempotent update; two bridge methods | SATISFIED | `baselines.rs` exists (382 lines) with all required types; store methods verified; bridge dispatch confirmed |

### Anti-Patterns Found

No `TBD`, `FIXME`, or `XXX` markers detected in any of the 8 modified files. No placeholder returns or stub implementations found. `rem_latency_minutes: None` is an intentional design decision (Phase 26 deferral per 24-CONTEXT), documented in a code comment.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

### Human Verification Required

#### 1. Sleep V2 Detail Sheet — Visual Layout and Real Values

**Test:** Build and run the app in the iOS simulator (XcodeBuildMCP build_run_sim, scheme GooseSwift). Open the Health tab, navigate to Sleep V2, and tap the primary sleep card to open `PrimarySleepDetailSheet`.

**Expected:**
- A new "Sleep quality" card group appears below the existing "Asleep / In bed / Quality" row
- The group shows four labelled stats: "HR dip" (value with %), "WASO" (minutes text), "Sleep onset" (minutes text), "Disturbances" (count)
- For a session with >= 50% HR coverage, values are real numbers (not "--" placeholders)
- For a HealthKit-imported session (no Rust HR data), values show "--" placeholders
- The existing "Asleep / In bed / Quality" row and the "Stages" section below are unaffected (no layout regression)

**Why human:** SwiftUI layout and visual correctness — whether the stat group renders at the correct size, does not clip or overflow, and that formatted strings (e.g., "7%" for HR dip, "23 min" for WASO) match expectations — cannot be verified by static code inspection.

---

### Gaps Summary

No gaps. All 8 automated must-haves are fully verified in the codebase. Truth 9 (visual layout of the Sleep V2 detail sheet) is the sole item requiring human verification per the plan's `checkpoint:human-verify` gate on Task 3.

---

_Verified: 2026-06-08T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
