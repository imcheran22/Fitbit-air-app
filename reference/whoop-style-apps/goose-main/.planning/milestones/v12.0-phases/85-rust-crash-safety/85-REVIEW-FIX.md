---
phase: 85-rust-crash-safety
fixed_at: 2026-06-14T23:30:00Z
review_path: .planning/phases/85-rust-crash-safety/85-REVIEW.md
iteration: 3
findings_in_scope: 3
fixed: 4
skipped: 1
status: partial
---

# Phase 85: Code Review Fix Report

**Fixed at:** 2026-06-14T23:30:00Z
**Source review:** .planning/phases/85-rust-crash-safety/85-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope (Critical + Warning): 3 (WR-01, WR-02, WR-03)
- Info findings also fixed (per guidance): IN-01, IN-02
- Fixed: 4 (WR-02, WR-03, IN-01, IN-02)
- Skipped: 1 (WR-01 — intentional per guidance)

## Fixed Issues

### WR-02: `detect_exercise_sessions` does not sort the `hr` slice

**Files modified:** `Rust/core/src/exercise_detection.rs`
**Commit:** 5893243
**Applied fix:** Added `hr_sorted` Vec sorted by `a.ts.partial_cmp(&b.ts)` before Step 4 alignment loop, mirroring the existing `sorted_gravity` treatment. Changed `for sample in hr` to `for sample in &hr_sorted`. This ensures the `aligned` Vec and derived `active` slice are time-ordered so the gap computation at line 152 (`active[i].ts - active[i-1].ts`) is always non-negative.

---

### WR-03: Dead `rmssd()` function contains a latent usize underflow

**Files modified:** `Rust/core/src/metrics.rs`
**Commit:** 0581e22
**Applied fix:** Added `if values.len() < 2 { return 0.0; }` guard at the top of the `#[allow(dead_code)] fn rmssd()` function, preventing the `values.len() - 1` subtraction from underflowing on an empty or single-element slice.

### IN-01: `sol_from_hr` contains unreachable `!hr.is_finite()` guard inside `below` branch

**Files modified:** `Rust/core/src/metrics.rs`
**Commit:** 0581e22
**Applied fix:** Removed the dead inner `if !hr.is_finite() { run_start = None; continue; }` block from inside the `if below` branch. Replaced the misleading `// WR-02 fix` comment with an explanatory comment that NaN `hr` is already excluded by IEEE 754 (`NaN <= threshold` is always false). Changed `let below = *hr <= threshold` to `let below = hr.is_finite() && *hr <= threshold` to make the NaN-exclusion explicit at the condition level, matching the suggested fix in REVIEW.md.

### IN-02: `segment_rr_by_gaps` called twice — redundant O(n) allocation

**Files modified:** `Rust/core/src/metrics.rs`
**Commit:** 0581e22
**Applied fix:** Restructured the pre-output block to compute segments once via `(segments_hoisted, segment_count_outer)`. The `segments_hoisted` is `Option<Vec<Vec<f64>>>`: `Some(segs)` when timestamps are aligned, `Some(vec![valid.clone()])` for the single-segment fallback, `None` when there are errors. Inside the `output` block, replaced the second `segment_rr_by_gaps` call with `segments_hoisted.unwrap_or_else(|| vec![valid.clone()])`. The `segment_count` inside the block is now just `segment_count_outer`. This eliminates the redundant O(n) allocation while preserving all existing behaviour.

## Skipped Issues

### WR-01: Ectopic-filter median uses lower-median index

**File:** `Rust/core/src/metrics.rs:2683`
**Reason:** Intentional skip per iteration 3 guidance — this is the same false positive as WR-03 from iteration 2. The `(window.len()-1)/2` lower-median formula is correct per the Lipponen-Tarvainen 2019 specification as implemented in Phase 85. The previous iteration's fix must not be reverted.
**Original issue:** Even-length windows after candidate removal use lower-median index instead of true (interpolated) median, slightly biasing the ectopic acceptance band upward.

---

_Fixed: 2026-06-14T23:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
