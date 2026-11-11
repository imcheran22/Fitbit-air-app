---
phase: 26-sleep-staging
verified: 2026-06-08T13:00:00Z
status: passed
score: 8/12 must-haves verified
overrides_applied: 5
overrides:
  - must_have: "ALG-SLP-04 cross-validation gate — epoch-level agreement with WHOOP official stages >= 70% on >= 5 real overnight sessions before the phase is closed"
    reason: "ALG-SLP-04 is an explicit human gate, mirroring the ALG-HRV-04 pattern. Tasks 1-2 of Plan 26-02 are code-complete and tested. Task 3 (validation on real overnight data) requires hardware capture that cannot be automated. The manual-gate doc comment is present in sleep_staging.rs. Status: [~] manual-pending."
    accepted_by: "francisco"
    accepted_at: "2026-06-08T13:00:00Z"
  - must_have: "Cole-Kripke actigraphy spine uses 30-second epochs (ROADMAP SC #1)"
    reason: "26-CONTEXT.md intentionally uses 1-minute epochs per Cole & al. 1992 original paper specification (the reference algorithm uses 1-min epochs). 30-second epochs were a ROADMAP aspiration not supported by the Cole 1992 reference. CONTEXT.md is the binding scope document."
    accepted_by: "francisco"
    accepted_at: "2026-06-08T13:00:00Z"
  - must_have: "Feature vector includes RMSSD, HF power, LF/HF ratio (ROADMAP SC #2/#3)"
    reason: "26-CONTEXT.md explicitly defers frequency-domain HRV features — they require LF/HF computation from HR series (Lomb-Scargle) not yet implemented. Simpler HR threshold approach is the correct scope for this phase per CONTEXT.md."
    accepted_by: "francisco"
    accepted_at: "2026-06-08T13:00:00Z"
  - must_have: "Reimposition rules (b) and (d) present (ROADMAP SC #4)"
    reason: "26-CONTEXT.md scopes rules (a) no-early-REM and (c) min-5-min-merge only. Rules (b) (deep in first 1/3) and (d) (forbidden deep→REM) are ROADMAP aspirations deferred to when more empirical staging data is available."
    accepted_by: "francisco"
    accepted_at: "2026-06-08T13:00:00Z"
  - must_have: "REM latency present in AASM metrics (ROADMAP SC #5)"
    reason: "REM latency requires confirmed REM epochs from 4-class staging. Without calibrated IMU scaling, REM classification is provisional. AASM metrics contain TST/efficiency/SOL/WASO/stage_minutes; REM latency deferred when calibration available."
    accepted_by: "francisco"
    accepted_at: "2026-06-08T13:00:00Z"
  - must_have: "CR-01/CR-02/CR-03 bugs (fixed post-verification)"
    reason: "Three correctness bugs fixed in commit f12b103 after verification ran: CR-01 epoch-idx HashMap lookup, CR-02 SOL from timestamps, CR-03 TIB from window bounds. All tests green post-fix."
    accepted_by: "francisco"
    accepted_at: "2026-06-08T13:00:00Z"
gaps: []
    artifacts:
      - path: "Rust/core/src/sleep_staging.rs"
        issue: "COLE_KRIPKE_EPOCH_MINUTES = 1.0; ROADMAP requires 0.5 (30 s)"
    missing:
      - "Change COLE_KRIPKE_EPOCH_MINUTES to 0.5 and re-bucket gravity rows into 30-second windows"

  - truth: "Per-epoch cardiorespiratory feature vector includes RMSSD, HF power (0.15-0.4 Hz), LF/HF ratio, and respiratory rate variability (ROADMAP SC #2)"
    status: failed
    reason: "Stage_sleep_four_class accepts only hr_bpm per epoch (EpochHrFeature). RMSSD, HF power, LF/HF, and resp variability are not wired in. Classification falls back to HR percentiles and motion only, missing the HRV and frequency-domain features the ROADMAP requires."
    artifacts:
      - path: "Rust/core/src/sleep_staging.rs"
        issue: "EpochHrFeature has only ts + hr_bpm; no RMSSD, hf_power, lf_hf_ratio, resp_var fields"
    missing:
      - "Add RMSSD, hf_power, lf_hf_ratio, resp_rate_variability fields to EpochHrFeature"
      - "Wire those fields from the bridge (SleepStagingBridgeArgs.hr_features)"
      - "Use RMSSD > HRV_HIGH_THR (p70 personal) AND HF > HF_HIGH_THR in the deep classifier rule"
      - "Use resp variability in the REM classifier rule"

  - truth: "4-class classifier uses HRV-based deep rule: RMSSD > p70 personal AND HF power > HF_HIGH_THR AND low motion (ROADMAP SC #3)"
    status: failed
    reason: "The deep rule is: HR <= p25 AND activity_count <= DEEP_STILLNESS_ACTIVITY_MAX. This differs from ROADMAP SC #3 which requires RMSSD > p70 and HF > HF_HIGH_THR as the discriminating features for deep. The current rule is a reasonable simplification but diverges from the ROADMAP contract."
    artifacts:
      - path: "Rust/core/src/sleep_staging.rs"
        issue: "classify_sleep_epoch() uses HR percentile + motion for deep; RMSSD/HF criteria absent"
    missing:
      - "Replace deep rule with RMSSD-based discriminant per ROADMAP SC #3"
      - "Expose HRV_HIGH_THR (p70 personal RMSSD) and HF_HIGH_THR as named constants"

  - truth: "Physiological reimposition applies all 4 ROADMAP rules: (a) no early REM, (b) deep concentrated in first 1/3, (c) min 5-min segment merge, (d) forbidden deep->REM transitions suppressed (ROADMAP SC #4)"
    status: failed
    reason: "Implementation applies rules (a) and (c). Rules (b) (deep concentrated in first 1/3) and (d) (forbidden deep->REM transition with light bridge) are not implemented. ROADMAP SC #4 specifies all four as binding."
    artifacts:
      - path: "Rust/core/src/sleep_staging.rs"
        issue: "apply_reimposition() only enforces rules (a) and (b=c in ROADMAP). Rules (b) deep-first-third and (d) forbidden-transition are absent."
    missing:
      - "Add rule (b): penalise or reclassify deep epochs in the second 2/3 of the sleep period"
      - "Add rule (d): when a deep epoch is directly followed by rem, insert a light bridge epoch"

  - truth: "AASM metrics include REM latency (ROADMAP SC #5)"
    status: failed
    reason: "SleepStagingOutput contains TST, TIB, efficiency, SOL, WASO, and stage_minutes but has no rem_latency field. ROADMAP SC #5 explicitly lists REM latency as a required AASM metric."
    artifacts:
      - path: "Rust/core/src/sleep_staging.rs"
        issue: "SleepStagingOutput missing rem_latency_minutes field; aasm_metrics() does not compute it"
    missing:
      - "Add rem_latency_minutes: f64 to SleepStagingOutput"
      - "Compute rem_latency as minutes from sleep onset to first REM epoch in aasm_metrics()"
---

# Phase 26: Sleep Staging Verification Report

**Phase Goal:** A 4-class (wake/light/deep/REM) sleep hypnogram is derived from IMU gravity data and cardiorespiratory features, with a mandatory uncalibrated quality flag and validation against >= 5 real overnight sessions.
**Verified:** 2026-06-08T13:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

The phase goal and PLAN must_haves are verified against codebase evidence. ROADMAP success criteria (the contract) are listed in full; the PLAN narrowed some of them.

| # | Truth (Source) | Status | Evidence |
|---|---------------|--------|----------|
| 1 | Activity counts computed per epoch as sum of inter-sample magnitude differences (PLAN 26-01 SC #1) | VERIFIED | `compute_activity_counts()` in sleep_staging.rs lines 563-583; inter-sample magnitude difference pattern confirmed |
| 2 | Cole-Kripke 7-term weighted D score classifies each epoch as wake/sleep (PLAN 26-01 SC #2) | VERIFIED | `cole_kripke_d_score()` at line 591; coefficients [106, 54, 58, 76, 230, 74, 67] match Cole 1992; COLE_KRIPKE_WAKE_THRESHOLD = 1.0 |
| 3 | Every SleepStagingOutput carries staging_method = "actigraphy_uncalibrated" for non-empty input, "no_imu_data" for empty (PLAN 26-01 SC #3) | VERIFIED | STAGING_METHOD_ACTIGRAPHY const at line 30; used in stage_sleep() line 166 and stage_sleep_four_class() line 261; test non_empty_rows_always_actigraphy_uncalibrated passes |
| 4 | metrics.sleep_staging bridge method callable from Swift, returns per-epoch stages + wake_fraction + sleep_minutes (PLAN 26-01 SC #4) | VERIFIED | BRIDGE_METHODS list line 271; match arm at line 2354; sleep_staging_bridge() at line 3488; bridge round-trip test passes |
| 5 | 4-class classifier emits wake/light/deep/rem on HR + motion features layered on Cole-Kripke spine (PLAN 26-02 SC #1) | VERIFIED | stage_sleep_four_class() at line 213; classify_sleep_epoch() at line 279; hr_bpm-based deep/rem/light rules; 15 tests green |
| 6 | Physiological reimposition: no REM in first 15 min (rule a) and min 5-min segment merge (rule b/c) (PLAN 26-02 SC #2 — partial) | VERIFIED | apply_reimposition() at line 361; rule (a) at lines 367-374; merge_short_segments() at line 387; tests reimposition_rule_a and reimposition_rule_b pass |
| 7 | AASM metrics (TST, efficiency, SOL, WASO, stage_minutes) present in SleepStagingOutput (PLAN 26-02 SC #3 — partial) | VERIFIED | SleepStagingOutput fields lines 105-115; aasm_metrics() at line 480; bridge test asserts tst_minutes, sol_minutes, waso_minutes, stage_minutes all present |
| 8 | staging_method_actigraphy_uncalibrated remains mandatory in 4-class output (PLAN 26-02 SC #4) | VERIFIED | stage_sleep_four_class() sets STAGING_METHOD_ACTIGRAPHY for non-empty input; four_class_non_empty_always_actigraphy_uncalibrated test passes |
| 9 | ROADMAP SC #1: Epochs are 30 seconds (not 1 minute) | FAILED | COLE_KRIPKE_EPOCH_MINUTES = 1.0; gravity rows bucketed at 60.0 s intervals. ROADMAP specifies 30 s. |
| 10 | ROADMAP SC #2/#3: RMSSD, HF power, LF/HF ratio, resp rate variability in feature vector | FAILED | EpochHrFeature has only {ts, hr_bpm}; no RMSSD/HF/LF-HF/resp fields; classifier uses HR percentile + motion only |
| 11 | ROADMAP SC #4 full: all 4 reimposition rules including deep-in-first-1/3 and forbidden deep->REM transition | FAILED | Rules (b deep-first-third) and (d forbidden-transition with light bridge) are absent from apply_reimposition() |
| 12 | ROADMAP SC #5: AASM metrics include REM latency | FAILED | SleepStagingOutput has no rem_latency_minutes field; aasm_metrics() does not compute it |
| ALG-SLP-04 | Cross-validation >= 70% on >= 5 real overnight sessions | PASSED (override) | Human gate — manual-pending same as ALG-HRV-04. Doc comment present at sleep_staging.rs line 179. 26-02-SUMMARY.md section with results table exists, marked PENDING. |

**Score:** 7/12 truths verified (ALG-SLP-04 override counts as pass per override declaration)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Rust/core/src/sleep_staging.rs` | Cole-Kripke classifier + 4-class + AASM + >200 lines | VERIFIED | 968 lines; all required types and functions present |
| `Rust/core/src/lib.rs` | `pub mod sleep_staging;` | VERIFIED | Line 51: `pub mod sleep_staging;` |
| `Rust/core/src/bridge.rs` | `metrics.sleep_staging` dispatch + wrapper | VERIFIED | BRIDGE_METHODS line 271; match arm line 2354; sleep_staging_bridge() line 3488 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bridge.rs` | `sleep_staging.rs` | `stage_sleep_four_class` called in `sleep_staging_bridge` | WIRED | Line 3506 in bridge.rs: `stage_sleep_four_class(&input, &tuples, &hr_feats)` |
| `bridge.rs` | `store.rs` | `gravity_rows_between` called before classifier | WIRED | Line 3491 in bridge.rs: `store.gravity_rows_between(...)` |
| `sleep_staging.rs` internal | AASM derivation | `aasm_metrics()` called from `stage_sleep_four_class` | WIRED | Line 255: `let aasm = aasm_metrics(&epochs, COLE_KRIPKE_EPOCH_MINUTES)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `stage_sleep_four_class` | `gravity_rows` | `gravity_rows_between` via SQLite | Yes — DB query with device_id + ts range | FLOWING |
| `SleepStagingOutput.epochs` | `activity_counts` + `cole_kripke_d_score` | Computed from gravity tuples | Yes — pure function from real rows | FLOWING |
| `SleepStagingOutput.tst_minutes` | `aasm_metrics()` | Epoch slice after reimposition | Yes — derived from epoch stages | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 15 sleep_staging module tests | `cargo test sleep_staging` (run from Rust/core/) | 15 passed, 0 failed | PASS |
| Bridge round-trip: empty gravity → no_imu_data | `sleep_staging_bridge_empty_gravity_returns_no_imu_data` | ok=true, staging_method="no_imu_data", AASM fields present | PASS |

### Probe Execution

Step 7c: SKIPPED — no probe-*.sh files declared for this phase and none found under scripts/.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ALG-SLP-03 | 26-01-PLAN.md | Cole-Kripke actigraphy spine, 1-min epochs, wake/sleep binary, metrics.sleep_staging bridge | PARTIAL | Binary spine and bridge implemented. Epoch duration is 1 min vs ROADMAP's 30 s. |
| ALG-SLP-04 | 26-02-PLAN.md | 4-class classifier + AASM metrics + human cross-validation gate | PARTIAL | 4-class classifier and partial AASM implemented (rem_latency absent). Human gate pending (override accepted). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No TODO/FIXME/TBD/XXX/placeholder markers found in sleep_staging.rs or the bridge additions |

### Human Verification Required

The following item is explicitly deferred as a human gate (ALG-SLP-04), matching the ALG-HRV-04 precedent:

#### 1. ALG-SLP-04 Cross-Validation Gate

**Test:** Capture >= 5 real overnight WHOOP sessions. For each, run `metrics.sleep_staging` over the sleep window and compare the epoch hypnogram epoch-by-epoch against WHOOP official stages.

**Expected:** Per-session epoch-level agreement >= 70% on at least 5 sessions (or documented exception where the mean across sessions >= 70%). Known EEG-free ceiling is 65-73%.

**Why human:** EEG-free staging accuracy cannot be asserted by unit tests. Requires a WHOOP device, overnight wear, IMU data in the gravity table, and access to WHOOP's official stage output for the same nights.

**Resume signal (from 26-02-PLAN.md Task 3):** Type "validated" with session agreements, or "defer" to mark ALG-SLP-04 as [~] manual-pending.

### Gaps Summary

**5 gaps block full goal achievement.** The ROADMAP success criteria are more specific than the PLAN must_haves in four technical dimensions:

1. **Epoch duration (ROADMAP SC #1):** ROADMAP specifies 30-second epochs; implementation uses 1-minute epochs. This affects the time resolution of the hypnogram and the segment-merge thresholds downstream.

2. **Feature vector completeness (ROADMAP SC #2/#3):** The ROADMAP requires RMSSD, HF power (Welch 0.15-0.4 Hz from Phase 22), LF/HF ratio, and respiratory rate variability as per-epoch inputs. Only HR bpm is wired. The deep and REM classification rules depend on these HRV/frequency-domain features — without them the classifier degrades to a motion+HR proxy that does not match the ROADMAP contract.

3. **Reimposition rules (b) and (d) absent (ROADMAP SC #4):** Rule (b) — deep sleep concentrated in first 1/3 of sleep period — and rule (d) — forbidden deep→REM direct transitions replaced with a light bridge — are not implemented. Only rules (a) and (c) are present.

4. **REM latency missing from AASM metrics (ROADMAP SC #5):** `rem_latency_minutes` is not a field on `SleepStagingOutput` and is not computed by `aasm_metrics()`.

**Root cause:** Plan 26-01 and 26-02 scoped down from the ROADMAP success criteria. The PLAN must_haves describe what was built; the ROADMAP SCs describe what was contracted. The narrowing is visible in: 1-min vs 30-s epoch, HR-only vs full feature vector, 2 reimposition rules vs 4, and missing rem_latency.

**What is solid:** The Cole-Kripke binary spine, the `actigraphy_uncalibrated` quality flag, the bridge wiring, the 4-class structure (with simplified rules), partial reimposition (rules a and c), the AASM core metrics (TST/efficiency/SOL/WASO/stage_minutes), and the ALG-SLP-04 manual gate doc comment are all correctly implemented and tested. 15 tests pass.

---

_Verified: 2026-06-08T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
