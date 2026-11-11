---
phase: 26-sleep-staging
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - Rust/core/src/sleep_staging.rs
  - Rust/core/src/bridge.rs
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 26: Sleep Staging — Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 2 (sleep_staging.rs, bridge.rs — bridge_tests.rs read for coverage context)
**Status:** issues_found

## Summary

Phase 26 adds a Cole-Kripke actigraphy spine and a 4-class (wake/light/deep/rem) sleep classifier to the Rust core, exposed via `metrics.sleep_staging` in the bridge. The algorithm structure is sound and the coefficients are correct, but three logic bugs in the epoch-index model produce incorrect results whenever gravity data is non-contiguous or does not start exactly at `sleep_start_ts`. The AASM metrics (SOL, TIB, efficiency) are the most visibly wrong outputs. A secondary concern is the median computation method and a dead reimposition rule that is documented as active but unreachable in the full pipeline.

---

## Critical Issues

### CR-01: Cole-Kripke D-score uses array-position offsets, not epoch-index offsets (sparse epoch bug)

**File:** `Rust/core/src/sleep_staging.rs:591-603`

**Issue:** `cole_kripke_d_score` accesses neighbours as `activity_counts[i + offset_k]` where `i` is the array position. `activity_counts` is a sorted `Vec<(epoch_idx, count)>` produced from a `BTreeMap`; it contains only epochs that had at least one IMU sample. If any 1-minute window had no gravity rows (BLE gap, device removed), its `epoch_idx` is absent and the array indices no longer correspond to consecutive epoch indices.

For example, if the session has data only in minutes 0 and 10:
- `activity_counts = [(0, c0), (10, c10)]`
- For the epoch at array position 0 (epoch_idx 0), the code looks at `activity_counts[0+1]` = `(10, c10)` as the "next minute" neighbour in the weighted sum.
- But Cole-Kripke requires the count from minute 1, which is absent and should be 0, not the count from minute 10.

This produces wrong D-scores and therefore wrong wake/sleep classification for any session with data gaps.

**Fix:** Build a `HashMap<i64, f64>` from epoch_idx to count, then look up by `epoch_idx[i] + offset_k` instead of `i + offset_k`:

```rust
fn cole_kripke_d_score(i: usize, activity_counts: &[(i64, f64)]) -> f64 {
    let base_idx = activity_counts[i].0;
    let lookup: std::collections::HashMap<i64, f64> =
        activity_counts.iter().map(|&(idx, c)| (idx, c)).collect();
    let mut d = 0.0_f64;
    for (coeff, &offset) in COLE_KRIPKE_COEFFS.iter().zip(COLE_KRIPKE_OFFSETS.iter()) {
        let c = COLE_KRIPKE_SCALE_FACTOR
            * lookup.get(&(base_idx + offset)).copied().unwrap_or(0.0);
        d += coeff * c;
    }
    d / 100.0
}
```

Alternatively, pass the lookup map as a parameter to avoid rebuilding it on every call.

---

### CR-02: SOL computed from array index instead of epoch timestamp

**File:** `Rust/core/src/sleep_staging.rs:490-493` (function `aasm_metrics`)

**Issue:** Sleep-onset latency is computed as:

```rust
let sol = match first_sleep_idx {
    None => tib,
    Some(idx) => idx as f64 * epoch_minutes,  // BUG: array position, not window offset
};
```

`first_sleep_idx` is the array position of the first non-wake epoch. If gravity data begins after `sleep_start_ts` (device reconnected mid-window, or any gap at the start), the array's position 0 maps to an epoch that is already N minutes into the window. The computed SOL would be 0 minutes when it should be N minutes.

Example: `sleep_start_ts = 0`, gravity data starts at ts=300 (minute 5). Epoch at minute 5 is the first sleep epoch; array position = 0. Computed SOL = 0 * 1.0 = 0 min. Actual SOL = 5 min.

**Fix:** Use the epoch's timestamp relative to `sleep_start_ts`:

```rust
// aasm_metrics needs sleep_start_ts as a parameter
Some(idx) => (epochs[idx].ts - sleep_start_ts) / 60.0,
```

Pass `sleep_start_ts` into `aasm_metrics` and use it for the SOL calculation.

---

### CR-03: `time_in_bed_minutes` derived from epoch count, not declared window duration

**File:** `Rust/core/src/sleep_staging.rs:482` (function `aasm_metrics`)

**Issue:**

```rust
let tib = n as f64 * epoch_minutes;  // n = epochs.len() = number of DATA epochs
```

AASM defines TIB as the duration of the entire sleep window (`sleep_end_ts - sleep_start_ts`). Using the count of epochs with IMU data produces a TIB that is shorter than the actual window whenever there are data gaps or when data starts/ends inside the declared window. This cascades into `sleep_efficiency_fraction` (TST / TIB) being incorrect: a session with 30 minutes of data in a 60-minute window would report 100% efficiency if all 30 data epochs are sleep, instead of the correct 50%.

The `empty_output_with_aasm` helper correctly uses `(sleep_end_ts - sleep_start_ts).max(0.0) / 60.0` but `aasm_metrics` has no access to the window bounds.

**Fix:** Add `sleep_start_ts: f64` and `sleep_end_ts: f64` parameters to `aasm_metrics`:

```rust
fn aasm_metrics(epochs: &[SleepEpoch], epoch_minutes: f64, sleep_start_ts: f64, sleep_end_ts: f64) -> AasmMetrics {
    let tib = ((sleep_end_ts - sleep_start_ts).max(0.0) / 60.0);
    // ...
}
```

And update the call site in `stage_sleep_four_class` to pass `input.sleep_start_ts, input.sleep_end_ts`.

---

## Warnings

### WR-01: Median computed as lower-middle value for even-n datasets

**File:** `Rust/core/src/sleep_staging.rs:350`

**Issue:**

```rust
let med_idx = (n - 1) / 2;
```

For even `n`, integer division gives the lower of the two middle values. With 40 HR samples where 20 are 55 bpm and 20 are 75 bpm, `med_idx = 19`, so the computed median is 55 instead of the statistically correct 65 `(55+75)/2`. The test comment at line 781 incorrectly states "Session median will be 65" but the code produces 55. The test still passes because 75 > 55, but the underestimated median causes the REM classifier to label more epochs as REM than a correct median computation would, inflating REM percentages.

**Fix:**

```rust
let med_idx = n / 2;  // upper-middle for even n; same as lower-middle for odd n
// Or for a true average-of-two-middles median:
let median = if n % 2 == 0 {
    (vals[n / 2 - 1] + vals[n / 2]) / 2.0
} else {
    vals[n / 2]
};
```

Also fix the test comment at line 781 to say "Session median will be 55 (lower-middle of even-n dataset)".

---

### WR-02: Reimposition rule (a) is unreachable in the full pipeline

**File:** `Rust/core/src/sleep_staging.rs:367-373`

**Issue:** The public doc comment for `stage_sleep_four_class` describes physiological reimposition rule (a) as: "REM epochs < `NO_REM_ONSET_MINUTES` from sleep onset are reclassified as light." However, `classify_sleep_epoch` (the per-epoch step that runs before reimposition) already requires `minutes_from_onset >= NO_REM_ONSET_MINUTES` as a precondition for assigning `"rem"`. So when `apply_reimposition` runs, no epoch can have `stage == "rem"` with `minutes_from_onset < 15`. Rule (a) is dead code in the full pipeline.

The only test that exercises rule (a) — `reimposition_rule_a_removes_early_rem` — bypasses `classify_sleep_epoch` by manually constructing an epoch sequence with `"rem"` at minute 5. This tests the isolated `apply_reimposition` function correctly, but the integration path never exercises rule (a).

**Fix options:**
1. Remove the `minutes_from_onset >= NO_REM_ONSET_MINUTES` guard from `classify_sleep_epoch` and rely exclusively on reimposition rule (a). This separates concerns correctly.
2. Remove rule (a) from `apply_reimposition` and update the doc comment to remove the claim.
3. Document explicitly that the guard in `classify_sleep_epoch` makes rule (a) a no-op.

---

### WR-03: Unused `_total_sleep_secs` parameter in `classify_sleep_epoch`

**File:** `Rust/core/src/sleep_staging.rs:229, 246, 286`

**Issue:** `stage_sleep_four_class` computes `total_sleep_secs = input.sleep_end_ts - input.sleep_start_ts` (line 229) and passes it to `classify_sleep_epoch` (line 246). Inside `classify_sleep_epoch`, the parameter is named `_total_sleep_secs` (leading underscore = acknowledged-unused). The clock proxy uses `epoch_index / (total_epochs - 1)` instead. The caller is doing unnecessary work computing and passing a value that is immediately discarded.

**Fix:** Remove the `total_sleep_secs` local variable from `stage_sleep_four_class` and the corresponding parameter from `classify_sleep_epoch`.

---

### WR-04: No bridge-level integration test with actual gravity data

**File:** `Rust/core/src/bridge.rs:9356-9410`

**Issue:** The only bridge-level test for `metrics.sleep_staging` is `sleep_staging_bridge_empty_gravity_returns_no_imu_data`, which only covers the empty-gravity code path. There is no test that:
- Inserts gravity rows via `store.insert_gravity_rows`
- Calls `metrics.sleep_staging` with those rows
- Asserts on the staging output (epoch count, stage distribution, AASM metrics)

The unit tests in `sleep_staging.rs` cover the algorithm in isolation. The bridge layer (DB query → tuple construction → four-class call → serialisation) has no end-to-end coverage at all for the non-empty path. Bugs CR-01, CR-02, and CR-03 above would not be caught by the existing test suite.

**Fix:** Add at least one bridge integration test that inserts ~30 minutes of gravity rows, calls `metrics.sleep_staging`, and verifies: `staging_method == "actigraphy_uncalibrated"`, non-empty `epochs`, and plausible `tst_minutes` / `time_in_bed_minutes` values.

---

## Info

### IN-01: `activity_counts.is_empty()` after non-empty rows is unreachable dead code

**File:** `Rust/core/src/sleep_staging.rs:145-147` and `224-225`

**Issue:** Both `stage_sleep` and `stage_sleep_four_class` check `activity_counts.is_empty()` after calling `compute_activity_counts`. However, `compute_activity_counts` inserts at least one `BTreeMap` entry for every row in `rows`. If `rows` is non-empty, `activity_counts` is guaranteed non-empty. The guard can never fire when reached.

**Fix:** Remove the dead guard or add a comment explaining why it exists if it is intentional defensive programming. If kept, an `#[allow(unreachable_code)]` or a `debug_assert!(!activity_counts.is_empty())` would be clearer.

---

### IN-02: Test comment incorrectly states session median as 65 bpm

**File:** `Rust/core/src/sleep_staging.rs:781`

**Issue:** The comment in `four_class_late_high_hr_yields_rem` states:

```
// First 20 epochs HR = 55 (low), last 20 epochs HR = 75 (high).
// Session median will be 65, p25 will be ~55.
```

The actual median computed by `hr_percentiles` for n=40 with 20×55 and 20×75 is `vals[19] = 55` (not 65). The test passes anyway because 75 > 55 satisfies `hr > median`, but the comment is factually wrong and will mislead future readers about the classifier's behaviour.

**Fix:** Update the comment to reflect the actual computed median:

```
// Session median will be 55 (lower-middle of 40 values; vals[19] in sorted order).
// p25 will be vals[9] = 55.
```

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
