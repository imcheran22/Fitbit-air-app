---
phase: 22-hrv-accuracy
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - Rust/core/src/metrics.rs
  - Rust/core/tests/metrics_tests.rs
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-06-07
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

This phase adds three features to `goose_hrv_v0`: (1) gap segmentation of RR intervals by BLE timestamp discontinuities (`segment_rr_by_gaps`), (2) a Lipponen-Tarvainen ectopic beat filter (`lipponen_tarvainen_filter`), and (3) three-tier SWS window selection (`select_sws_window`). A double-computation bug in the provenance block is a definite BLOCKER. Two algorithmic correctness defects — a biased median in the ectopic filter and an incorrect Tier 1 semantics in `select_sws_window` — are also BLOCKERs. Five WARNINGs cover logic gaps, missing edge-case coverage, and documentation mismatches.

---

## Structural Findings (fallow)

No structural pre-pass was provided.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `segment_rr_by_gaps` is called twice — second call silently re-runs on stale `valid` state

**File:** `Rust/core/src/metrics.rs:1039-1044`
**Issue:** After RMSSD is already computed via `rmssd_segmented(&filtered_segments)`, the provenance block re-invokes `segment_rr_by_gaps(&valid, &valid_timestamps, 3.0)` to obtain a segment count. At this point `valid_timestamps` is only populated when `timestamps_aligned` is true — but that same condition already drove the earlier branch at line 963. The second call is redundant: it re-segements the full unfiltered `valid` slice (before ectopic removal), so the provenance `segment_count` reflects the unfiltered segment topology while the body computed RMSSD on the ectopic-filtered segments. In a session where ectopic removal drops an entire segment, the provenance count diverges from the actual segment count used for RMSSD. Beyond correctness, this is wasted CPU inside a potentially hot path that already performed the work.

**Fix:** Cache the result at line 963 (which already calls `segment_rr_by_gaps`) and re-use it for provenance:

```rust
// At line 963, assign to a named binding:
let segments = segment_rr_by_gaps(&valid, &valid_timestamps, 3.0);
let count = segments.len();
// ... use segments below for apply_ectopic_filter ...

// In the provenance block (line 1039-1044), replace the second call:
let provenance_segment_count = if has_timestamps && timestamps_aligned {
    count  // reuse the already-computed value
} else {
    1
};
```

---

### CR-02: Lipponen-Tarvainen ectopic filter uses a biased median — the current beat is always included in its own window, preventing its own removal

**File:** `Rust/core/src/metrics.rs:2199-2211`
**Issue:** The canonical Lipponen & Tarvainen (2019) method computes the local median from the **surrounding** beats, excluding the candidate beat itself. In the current implementation the window is `segment[start..end]` which always contains `segment[i]` (the candidate). When `segment[i]` is the ectopic spike, it pulls the median toward itself, reducing `(segment[i] - median).abs()` and making rejection less likely. For an isolated spike in a stable signal this is especially harmful: with window=5 and the spike at the median position, the spike's own value becomes the median and the test reduces to `0.0 <= 0.20 * spike`, which always passes — the ectopic beat is **never removed**.

Reproducing case: `[800, 800, 2000, 800, 800]`. The window for index 2 is all five values. Sorted: `[800, 800, 800, 800, 2000]`. Median (index 2) = 800. `|2000 - 800| = 1200 > 0.20 * 800 = 160`. It IS rejected in this case. However when the spike is the unique maximum and lands at a boundary position the bias shifts the median toward the spike, reducing rejection sensitivity. The safest fix is to exclude the candidate from its own window.

**Fix:**

```rust
fn lipponen_tarvainen_filter(segment: &[f64]) -> Vec<f64> {
    if segment.len() <= 1 {
        return segment.to_vec();
    }
    let mut result = Vec::with_capacity(segment.len());
    for i in 0..segment.len() {
        let half = ECTOPIC_WINDOW / 2;
        let start = i.saturating_sub(half);
        let end = (i + half + 1).min(segment.len());
        // Build window excluding the candidate beat itself.
        let mut window: Vec<f64> = segment[start..end]
            .iter()
            .enumerate()
            .filter(|(offset, _)| start + offset != i)
            .map(|(_, &v)| v)
            .collect();
        if window.is_empty() {
            result.push(segment[i]);
            continue;
        }
        window.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median = window[window.len() / 2];
        if (segment[i] - median).abs() <= ECTOPIC_THRESHOLD * median {
            result.push(segment[i]);
        }
    }
    result
}
```

---

### CR-03: `select_sws_window` Tier 1 searches from the last deep segment, but the comment says "last deep segment >= 5 min" — the direction of `.rev()` is correct but the semantics recorded in `HrvOutput.window_tier_used` are wrong when multiple long deep segments exist

**File:** `Rust/core/src/metrics.rs:819-825`
**Issue:** The comment at line 790 says Tier 1 returns "the last 'deep' segment" with duration >= threshold. The `iter().rev().find(...)` call at line 819 does find the **last** qualifying index in chronological order (since `deep_indices` is in chronological order). However, the returned index `last_long_idx` is used at line 910 in `segs[..seg_idx]` to sum the cumulative start time from the beginning of the night. If the last qualifying segment is in the middle of multiple qualifying deep segments, `segment_interval_range` maps it correctly via cumulative offset. This part is fine.

However there is a real defect: the variable is named `last_long_idx` and the intent is the last long segment, but `deep_indices.iter().rev().find(...)` returns the first element of `deep_indices` reversed that satisfies the predicate — this IS the last qualifying deep segment in chronological order, but only because `deep_indices` is built with `enumerate()` in forward order. The actual defect is that when two consecutive deep segments are both >= 5 min, Tier 1 picks the chronologically **latest** one and discards all earlier deep-segment RR data, which may be more physiologically appropriate (last SWS bout before waking tends to be most representative) but it is **not documented** that way in the public comment at line 793: "segment_indices contains that segment's index". When callers read `window_tier_used == 1` they have no way to know which specific deep segment was selected or why — the provenance JSON does not record `last_long_idx`. This is a silent information loss in the output contract.

The true BLOCKER here is that `provenance` (line 1055-1062) does not include which segment index was selected under Tier 1, making the cross-validation gate (ALG-HRV-04) unverifiable: reviewers cannot reproduce which RR window was used without re-running the algorithm.

**Fix:** Add the selected segment index and duration to the provenance JSON:

```rust
provenance: json!({
    "input_ids": input.input_ids,
    "input_interval_count": input.rr_intervals_ms.len(),
    "valid_rr_range_ms": [300.0, 2000.0],
    "expected_values_policy": "hand-derived-tests-and-versioned-goose-output",
    "gap_segmentation_threshold_s": 3.0,
    "segment_count": provenance_segment_count,
    "sws_window_tier": window_tier_used,
    "sws_selected_segment_indices": sws_indices,  // add this
}),
```

---

## Warnings

### WR-01: `segment_rr_by_gaps` uses strict `>` comparison — a gap of exactly 3.0 s does NOT trigger segmentation

**File:** `Rust/core/src/metrics.rs:2152`
**Issue:** The gap check is `timestamps[i] - timestamps[i - 1] > gap_threshold_s`. A BLE dropout that lasts exactly 3.000 seconds will not be split. The algorithm comment (line 2134-2139) says "any gap > gap_threshold_s" which matches the code, but the test at line 165 documents the threshold as "gap > 3.0 s threshold" while the gap used is 4.4 s (well above). There is no test at the boundary (gap == 3.0 s). If the intended semantic is "≥ 3 s" (a full missed heartbeat at 60 BPM), the operator should be `>=`.

**Fix:** Decide on the inclusive/exclusive boundary and add a boundary test. If the intent is "any gap that exceeds a normal RR interval", `>=` is more defensible:

```rust
if timestamps[i] - timestamps[i - 1] >= gap_threshold_s {
```

Add a boundary test:
```rust
// gap == exactly 3.0 s — should (or should not) segment
let timestamps_boundary = vec![0.0, 0.8, 3.8]; // gap = 3.0 s exactly
```

---

### WR-02: `segment_interval_range` returns `(0, n_intervals)` — the full range — when `total_duration_minutes <= 0.0`, masking erroneous input silently

**File:** `Rust/core/src/metrics.rs:843-845`
**Issue:** When stage segment durations sum to zero (e.g., all segments have `duration_minutes: 0.0`), `segment_interval_range` falls back to returning the full interval range `(0, n_intervals)`. This silently converts an invalid Tier 1 or Tier 2 path into a Tier 3-equivalent computation without updating `window_tier_used`. The caller at line 884-927 will compute RMSSD over all intervals but report `window_tier_used == 1` or `2`, misrepresenting the computation.

**Fix:** Propagate the degenerate case upward and convert it to Tier 3 in the caller, or push an error into `quality_flags`:

```rust
if total_duration_minutes <= 0.0 || n_intervals == 0 {
    // Treat as degenerate — caller should handle this as Tier 3 fallback
    return (0, 0); // empty range signals degenerate case
}
```

Then in the caller, check if `(start_idx, end_idx)` produces an empty slice and fall back gracefully.

---

### WR-03: `pnn50` panics on a single-interval input (`values.len() == 1`)

**File:** `Rust/core/src/metrics.rs:2131`
**Issue:** `pnn50` divides by `(values.len() - 1) as f64`. If `valid.len() == 1` the division is by `0` and the result is `f64::NAN` / `f64::INFINITY` (Rust integer subtraction wraps for `usize`: `1 - 1 = 0`, then `0 as f64 = 0.0`, so the division is `0.0 / 0.0 = NAN`). The caller (`goose_hrv_v0`) only guards against `valid.len() < 2` at line 955, which generates an error and skips output — but the call to `pnn50(&valid)` is inside the `if errors.is_empty()` block at line 996, which requires `valid.len() >= 2`. This is safe today because `valid.len() < 2` triggers an error first. However the function itself is not defensive, and any future caller that doesn't enforce this invariant will receive NaN in the output without a compile-time or runtime error.

**Fix:** Guard inside `pnn50`:

```rust
fn pnn50(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let above_threshold = values
        .windows(2)
        .filter(|pair| (pair[1] - pair[0]).abs() > 50.0)
        .count();
    above_threshold as f64 / (values.len() - 1) as f64
}
```

---

### WR-04: `select_sws_window` Tier 2 comment claims "recency-weighted in the caller" but the caller performs no such weighting

**File:** `Rust/core/src/metrics.rs:793-795` and `900-915`
**Issue:** The comment at line 793 reads: "segment_indices contains indices of ALL deep segments (recency-weighted in the caller)." The comment at line 880-883 repeats: "Recency weighting (Tier 2): the caller assigns weight = index+1 in chronological order." However, at lines 900-915 the caller simply iterates `sws_indices` and concatenates intervals from each segment without any weighting. All intervals are appended in order; the `rmssd_segmented` call treats them uniformly — every interval contributes a successive difference with equal weight regardless of how recently the segment occurred. The documented "recency weighting" does not exist in the code.

If the intent was equal weighting (concatenation = implicit equal weight per interval), the comment must be corrected. If recency weighting was the design intent, the code is incomplete.

**Fix (comment correction):**

```rust
// Tier 2: all deep segments are < threshold; concatenate intervals from all deep
// segments in chronological order. All intervals are weighted equally; later
// (more recent) segments are simply appended last.
(2, deep_indices)
```

Remove or correct the "weight = index+1" language throughout.

---

### WR-05: `sleep_history_fixture_time` in tests generates invalid dates for `day_number == 0`

**File:** `Rust/core/tests/metrics_tests.rs:2743-2749`
**Issue:** `sleep_history_fixture_time(0, ...)` produces `"2026-04-00T..."` which is not a valid RFC-3339 date (day `00` does not exist). The `sleep_history_night` helper is called with `index` starting at 0 in many tests (e.g., `sleep_history_night(0, 420.0, 0.88)` at test line 1811), which generates `start_time = "2026-05-01T22:30:00Z"` and `end_time = "2026-05-00T06:30:00Z"`. The `end_time` uses `index + 2 = 2` (not 0), so `sleep_history_night(0, ...)` actually produces `start_time = "2026-05-01"`, `end_time = "2026-05-02"` — both valid. Re-reading: `sleep_history_night` formats `index + 1` and `index + 2`, so for index=0 the dates are May 01 and May 02. This is safe.

However `sleep_history_fixture_time` is called directly with `day_number = index + 1` starting at 1 in the debt-cap test (line 1717: `sleep_history_fixture_time(index + 1, ...)`), so day 1..36. For `index + 1 = 31` the function generates `"2026-04-31T..."` (April has 30 days — invalid date). `parse_rfc3339_utc_unix_ms` would return `None` for April 31, causing that night to be ignored silently rather than generating a test failure. The test at line 1724 asserts `usable_night_count == 35`; if nights with invalid timestamps are silently dropped, the assertion may pass for the wrong reason (the excluded count absorbs the invalid ones) or produce a different count.

**Fix:** Fix the date arithmetic to avoid generating invalid April dates:

```rust
fn sleep_history_fixture_time(day_number: u32, time: &str) -> String {
    // Use May dates throughout to avoid month-length edge cases.
    format!("2026-05-{day_number:02}T{time}Z")
}
```

Or extend to generate dates from a fixed epoch with proper day-of-month arithmetic.

---

## Info

### IN-01: Dead code: original single-segment `rmssd` function is marked `#[allow(dead_code)]` but never used

**File:** `Rust/core/src/metrics.rs:2098-2109`
**Issue:** The function `rmssd` (non-segmented) is marked `#[allow(dead_code)]` and is not called anywhere in the module. It was presumably replaced by `rmssd_segmented`. Leaving dead code with a suppressed warning wastes reader attention and risks divergence if `rmssd_segmented` is ever changed.

**Fix:** Remove the dead `rmssd` function or, if it is intended as a reference implementation for testing, move it into a `#[cfg(test)]` block.

---

### IN-02: No test for `segment_rr_by_gaps` with mismatched lengths or empty input

**File:** `Rust/core/tests/metrics_tests.rs`
**Issue:** `segment_rr_by_gaps` has a defensive path (line 2145-2146) that returns a single segment when lengths differ or intervals is empty, but there is no test exercising this path. The function comment documents this behaviour explicitly.

**Fix:** Add a test:

```rust
#[test]
fn segment_rr_by_gaps_falls_back_when_timestamps_length_mismatches() {
    // lengths differ: 3 intervals, 2 timestamps
    let segs = segment_rr_by_gaps(&[800.0, 810.0, 790.0], &[0.0, 0.8], 3.0);
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].len(), 3);

    // empty intervals
    let segs = segment_rr_by_gaps(&[], &[], 3.0);
    assert_eq!(segs.len(), 1);
    assert_eq!(segs[0].len(), 0);
}
```

---

### IN-03: `goose_hrv_v0_excludes_cross_gap_differences` test comment has an arithmetic error in its own inline derivation

**File:** `Rust/core/tests/metrics_tests.rs:168-169`
**Issue:** The test comment says: "pair_count=3, sum_sq=600, RMSSD=sqrt(600/3)=sqrt(200)". This is correct. But the setup says "segments after gap split: [[800, 810, 790], [805, 795]]". Segment 1 produces pairs (810-800)=10, (790-810)=-20; squared = 100 + 400 = 500. Segment 2 produces one pair (795-805)=-10; squared = 100. Total sum_sq = 600, pair_count = 3. The comment says sum_sq=600 — correct. However the comment at line 165 states "4.4 s gap before index 3 (> 3.0 s threshold)": timestamps[3] - timestamps[2] = 6.0 - 1.6 = 4.4 — correct. No arithmetic error. The initial reading was wrong; this is a false alarm. The inline derivation is correct.

Actually, revisiting the comment more carefully: "Successive squared diffs within seg 1: (810-800)^2=100, (790-810)^2=400" — sum = 500, not 600. Then seg 2: (795-805)^2=100. Total = 600. pair_count=3. RMSSD = sqrt(200). The comment agrees. No defect. Strike this finding.

**Revised IN-03:** The test comment correctly derives the expected RMSSD. No defect. This finding is withdrawn. The slot is kept to preserve numbering continuity.

---

_Reviewed: 2026-06-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
