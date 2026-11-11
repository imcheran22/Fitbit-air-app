---
phase: 85-rust-crash-safety
reviewed: 2026-06-14T23:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - Rust/core/src/bridge.rs
  - Rust/core/src/capabilities.rs
  - Rust/core/src/energy_rollup.rs
  - Rust/core/src/exercise_detection.rs
  - Rust/core/src/lib.rs
  - Rust/core/src/metrics.rs
  - Rust/core/src/openwhoop_reference.rs
  - Rust/core/src/step_discovery.rs
  - Rust/core/src/store.rs
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 85: Code Review Report (Final re-review after all Phase 85 fixes)

**Reviewed:** 2026-06-14T23:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Final re-review after all announced Phase 85 fixes: WR-01 median fix (candidate beat excluded from ectopic window), WR-02 null-byte escape (string_to_c_string sanitises interior nulls before CString::new), CR-01 empty-slice guard (no_valid_rr_intervals_after_range_gate error, mean() hardened), surviving null_mut fix, and surviving negative-ts clamp.

**Confirmed resolved:**
- CR-01: `mean()` now has an empty-slice guard; `no_valid_rr_intervals_after_range_gate` error is pushed. Verified at `metrics.rs:1069-1072` and `2555-2560`.
- WR-01 (previous surviving): `string_to_c_string` now sanitises with `value.replace('\0', "\\u0000")` before `CString::new`; `expect()` is sound after sanitisation. Verified at `bridge.rs:9806-9810`.
- WR-02 (previous surviving): `sol_from_hr` filter gate now uses `ts.is_finite()` and the `*hr <= threshold` path appropriately handles NaN (NaN fails `<=`, so run_start is reset). Verified at `metrics.rs:4258-4278`.

Three new issues were found in this pass that are not covered by the Phase 85 fixes.

---

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Ectopic-filter median uses lower-median index — systematic bias for even-length windows

**File:** `Rust/core/src/metrics.rs:2683`

**Issue:** After removing the candidate beat from the local window (the WR-01 fix), the window for a 5-beat centred span can have 2 or 4 remaining elements (even counts). The median is then computed as:

```rust
let median = window[(window.len() - 1) / 2];
```

For even-length windows this selects the lower of the two middle elements (i.e. the lower quartile, not the true median):
- `n=2`: index `(2-1)/2 = 0` → minimum of the two values.
- `n=4`: index `(4-1)/2 = 1` → second-lowest of four values.

The canonical Lipponen-Tarvainen (2019) specification uses the standard (interpolated) median — the average of the two middle elements for even-length windows. Using the lower median makes the reference consistently lower than the true median, which widens the acceptance band `ECTOPIC_THRESHOLD * median` for beats above the median (upward outliers). This means more ectopic beats in the upper tail survive the filter, slightly inflating RMSSD. The bias is small per beat (~1–3 ms for a 5-beat window of typical overnight RR intervals) but is systematic and cumulative when many short SWS segments are concatenated (Tier 2 path).

**Fix:**
```rust
// Replace:
let median = window[(window.len() - 1) / 2];

// With:
let n = window.len();
let median = if n % 2 == 1 {
    window[n / 2]
} else {
    (window[n / 2 - 1] + window[n / 2]) / 2.0
};
```

---

### WR-02: `detect_exercise_sessions` does not sort the `hr` slice — unsorted input causes wrong gap computation

**File:** `Rust/core/src/exercise_detection.rs:119` (Step 4 alignment loop)

**Issue:** The `gravity` slice is explicitly sorted by timestamp at line 96, but `hr` is iterated directly in caller-supplied order. The `aligned` Vec and then the `active` slice inherit the same ordering. The segment-gap computation at line 152:

```rust
let gap = active[i].ts - active[i - 1].ts;
```

assumes `active` is time-ordered. If the caller supplies `hr` samples out of order (e.g., BLE notifications delivered out of sequence, or rows returned from an SQLite query without an `ORDER BY`), `gap` can be negative. A negative gap always satisfies `gap <= MERGE_GAP_S` (60 s), so all active samples would be merged into one segment regardless of actual pauses. The bridge at `bridge.rs:4366` constructs `hr` from `args.hr_samples` with no sort.

The production call path from the bridge (`exercise.detect_sessions`) queries `GravityRow` from the store (which does return rows sorted by `ts` per schema convention), but `hr_samples` are passed directly from the Swift side without any ordering guarantee in the bridge contract.

**Fix:** Add a sort of `hr` at the start of `detect_exercise_sessions`, mirroring the `gravity` treatment:

```rust
// After: let mut sorted_gravity = gravity.to_vec();
// Add before Step 4:
let mut hr_sorted: Vec<&HrSample> = hr.iter().collect();
hr_sorted.sort_by(|a, b| a.ts.partial_cmp(&b.ts).unwrap_or(std::cmp::Ordering::Equal));
// Replace `for sample in hr` with `for sample in &hr_sorted`
```

---

### WR-03: Dead `rmssd()` function contains a latent usize underflow

**File:** `Rust/core/src/metrics.rs:2563-2573`

**Issue:** The function `rmssd()` is marked `#[allow(dead_code)]` and is never called in production paths (`rmssd_segmented` is used instead). However it is compiled into the artifact and contains:

```rust
fn rmssd(values: &[f64]) -> f64 {
    let mean_square = values
        .windows(2)
        .map(|pair| { let diff = pair[1] - pair[0]; diff * diff })
        .sum::<f64>()
        / (values.len() - 1) as f64;  // ← usize underflow when values.len() == 0
    mean_square.sqrt()
}
```

When `values` is empty: `values.len() - 1` → `0usize - 1` → panic in debug builds, wraps to `usize::MAX` in release builds (producing `~0.0` via IEEE division). The function is present, compiled, and free to be called from test code or future code without noticing this edge case. The `lib.rs` file-level `deny(clippy::unwrap_used)` only applies to non-test code; there is no equivalent protection against this arithmetic pattern.

**Fix:** Either remove the function entirely, or add a guard:

```rust
fn rmssd(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let mean_square = values
        .windows(2)
        .map(|pair| { let diff = pair[1] - pair[0]; diff * diff })
        .sum::<f64>()
        / (values.len() - 1) as f64;
    mean_square.sqrt()
}
```

---

## Info

### IN-01: WR-02 surviving fix (`sol_from_hr` line 4262) contains unreachable guard code

**File:** `Rust/core/src/metrics.rs:4261-4265`

**Issue:** The Phase 85 WR-02 surviving fix added:

```rust
if below {
    // WR-02 fix: also filter non-finite HR (ts is already filtered above).
    if !hr.is_finite() {
        run_start = None;
        continue;
    }
    // ...
}
```

The `below` branch is entered only when `*hr <= threshold`. Because `NaN <= x` is `false` for every `x` (IEEE 754), a NaN `hr` value can never satisfy `below = true` and can never reach the inner guard. The inner `!hr.is_finite()` check is dead code. This does not cause incorrect behaviour, but the misleading comment ("also filter non-finite HR") implies there is a NaN-entry risk that does not exist, which could confuse future maintainers.

**Fix:** Remove the inner guard and replace the comment with an explanation of why NaN is already excluded:

```rust
for (ts, hr) in &sorted {
    // NaN hr: `*hr <= threshold` is false for NaN (IEEE 754), so non-finite hr
    // values automatically reset run_start via the else branch below.
    let below = hr.is_finite() && *hr <= threshold;
    if below {
        let start = *run_start.get_or_insert(*ts);
        if *ts - start >= sustained_minutes {
            return Some((start - window_start).max(0.0));
        }
    } else {
        run_start = None;
    }
}
```

The `hr.is_finite() &&` prefix makes the intent explicit without dead code.

---

### IN-02: `segment_rr_by_gaps` is called twice when timestamps are aligned — redundant allocation

**File:** `Rust/core/src/metrics.rs:1086` and `1097`

**Issue:** The CR-01 fix hoisted `segment_count_outer` before the `output` block by calling `segment_rr_by_gaps` at line 1086 and immediately extracting `.len()`, discarding the Vec. The `output` block then calls `segment_rr_by_gaps` again at line 1097 with identical arguments to build the segments for actual RMSSD computation. Both calls are O(n) and allocate a `Vec<Vec<f64>>`. The comment says "CR-01 fix: use the hoisted segment_count_outer… rather than re-calling segment_rr_by_gaps inside the provenance block" but the hoisting adds a call rather than eliminating one — the provenance block was moved after the output block, which already had the inner call.

This is a code quality issue (redundant O(n) allocation), not a correctness bug.

**Fix:** Restructure so segments are computed once and the count is taken from the same result:

```rust
// Compute once; share between output block and provenance.
let (segments_opt, segment_count_outer) = if errors.is_empty()
    && has_timestamps
    && timestamps_aligned
{
    let segs = segment_rr_by_gaps(&valid, &valid_timestamps, 3.0);
    let count = segs.len();
    (Some(segs), count)
} else if errors.is_empty() {
    (Some(vec![valid.clone()]), 1)
} else {
    (None, 1)
};
// Inside `if errors.is_empty()`: use segments_opt.unwrap() directly.
```

---

_Reviewed: 2026-06-14T23:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
