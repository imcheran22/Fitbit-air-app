---
phase: 24-sleep-metrics-baselines
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - Rust/core/src/metrics.rs
  - Rust/core/src/baselines.rs
  - Rust/core/src/store.rs
  - Rust/core/tests/metrics_tests.rs
  - GooseSwift/HealthDataTypes.swift
  - GooseSwift/HealthDataStore+Sleep.swift
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-06-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This phase introduces EWMA baselines (baselines.rs), HR-threshold sleep-quality helpers (`sol_from_hr`, `waso_from_hr`, `heart_rate_dip_pct`, `hr_disturbance_count`), an idempotent `ewma_baseline_update` transaction in store.rs, and four new fields on `PrimarySleepDetail` surfaced in HealthDataStore+Sleep.swift.

The EWMA recurrence, trust-level boundaries, cold-start guard, and the `fold_history` reconstruction are all correct. The `BEGIN EXCLUSIVE` date guard works as intended. The HR coverage gate (≥50%) is correctly applied before dip computation in `metric_features.rs`. The Swift `PrimarySleepDetail` additions are safe — all construction sites supply the new fields.

Two blockers are present: a logic error in `sol_from_hr` that makes the sustained-period criterion sample-spacing-dependent (not time-duration-dependent), and a silent data-loss path in `ewma_baseline_update_inner` where a row that exists with one metric as NULL will be silently skipped even though the new call could supply the missing value. Four warnings round out findings on waso unit, missing non-finite filter in sol_from_hr, variance cold-start variance-floor interpretation, and the `heart_rate_dip_percent` field name mismatch between v0 and v1 output JSON keys consumed by the Swift layer.

---

## Critical Issues

### CR-01: `sol_from_hr` sustained-duration check is sample-spacing-dependent, not time-based

**File:** `Rust/core/src/metrics.rs:4143`

**Issue:** The sustained-low-HR criterion that determines sleep-onset latency uses:

```rust
if *ts - start >= sustained_minutes - 1.0 {
```

This is documented as "Duration = current_ts − run_start (end inclusive of the last sample)." The `- 1.0` correction assumes samples are spaced exactly 1 minute apart. When the caller passes a series with samples spaced at 5-minute intervals (common for WHOOP BLE average HR packets), `sustained_minutes = 3.0` becomes the condition `ts - start >= 2.0`. With 5-minute spacing a run of even two samples spans 5 minutes but at `ts - start = 5 >= 2.0` the condition fires immediately on the second sample — dramatically underestimating SOL. Conversely, with 30-second (0.5-min) spacing, `ts - start >= 2.0` requires 5 samples to trigger, which is correct for 3 minutes but only by coincidence. The fix is to compare raw elapsed time against `sustained_minutes` without the spacing-dependent correction:

```rust
// Correct: elapsed time between run start and current sample must reach threshold.
// No sample-spacing correction needed because ts and start are both in minutes.
if *ts - start >= sustained_minutes {
    return Some((start - window_start).max(0.0));
}
```

The test `sol_from_hr_returns_latency_to_first_sustained_low_hr_period` passes because it uses exactly 1-minute spacing (timestamps 3, 4, 5), which makes the `- 1.0` bias cancel out. The bug is invisible to the existing test suite.

**Fix:**
```rust
if *ts - start >= sustained_minutes {
    return Some((start - window_start).max(0.0));
}
```

---

### CR-02: `ewma_baseline_update_inner` silently skips rows where one metric is NULL — missing value never filled

**File:** `Rust/core/src/store.rs:3651-3660`

**Issue:** The idempotency guard reads:

```rust
if let Some((existing_hrv, existing_rhr)) = existing {
    let hrv_matches = existing_hrv.map_or(false, |v| (v - hrv_rmssd).abs() < 1e-9);
    let rhr_matches = existing_rhr.map_or(false, |v| (v - rhr_bpm).abs() < 1e-9);
    if hrv_matches && rhr_matches {
        return Ok(false); // skipped
    }
    // Row exists with different values — skip to prevent double-update
    return Ok(false);
}
```

`existing_hrv.map_or(false, ...)` evaluates to `false` when the stored column is NULL. If a prior `insert_daily_recovery_metric` call wrote a row for the date with `hrv_rmssd_ms = NULL` (e.g. from a night where HRV was unavailable), `ewma_baseline_update_inner` sees `hrv_matches = false`, falls through to the "different values" branch, and returns `Ok(false)` — silently refusing to fill in the previously-NULL HRV. The baseline row remains permanently incomplete for that date.

The function is documented as recording raw metric values so they become part of `fold_history`, but the date guard as written prevents any update once *any* row exists for the date, even a NULL row. This means `fold_history` will forever skip that night's HRV contribution.

**Fix:** Only block the update when the row already has non-NULL values for **both** metrics. When one or both are NULL, update is acceptable:

```rust
if let Some((existing_hrv, existing_rhr)) = existing {
    // Exact match on both non-null values → idempotent no-op.
    let hrv_matches = existing_hrv.map_or(false, |v| (v - hrv_rmssd).abs() < 1e-9);
    let rhr_matches = existing_rhr.map_or(false, |v| (v - rhr_bpm).abs() < 1e-9);
    if hrv_matches && rhr_matches {
        return Ok(false); // true duplicate
    }
    // Both existing values non-null but differ → date guard blocks double-update.
    if existing_hrv.is_some() && existing_rhr.is_some() {
        return Ok(false);
    }
    // At least one column was NULL → fall through to UPDATE to fill the missing value.
    self.conn.execute(
        "UPDATE daily_recovery_metrics SET hrv_rmssd_ms = ?1, resting_hr_bpm = ?2 WHERE date_key = ?3",
        rusqlite::params![hrv_rmssd, rhr_bpm, date_key],
    )?;
    return Ok(true);
}
```

---

## Warnings

### WR-01: `waso_from_hr` counts samples, not elapsed time — unit is samples, not minutes

**File:** `Rust/core/src/metrics.rs:4098-4104`

**Issue:** The docstring says "Each sample contributes 1 minute to WASO." The implementation counts elements:

```rust
.count() as f64
```

This is correct only when samples are spaced exactly 1 minute apart. When the caller in `metric_features.rs` passes a series built from `timed_heart_rate_features` (which are per-minute summaries derived from the ring buffer), spacing is nominally 1 minute, so the current behaviour is usually correct. However, there is no assertion or guard: if the HR series ever contains sub-minute or multi-minute samples, the WASO value becomes wrong without any quality flag. The function contract should be explicit about the required sample spacing, or should compute elapsed time from timestamps.

**Fix:** Either document the 1-minute assumption as a hard precondition (and add a debug assertion) or compute elapsed time directly:

```rust
// Time-based approach using actual timestamps:
pub fn waso_from_hr(hr_series: &[(f64, f64)], resting_hr: f64, onset_ts: f64) -> f64 {
    let threshold = resting_hr * 1.05;
    let mut sorted: Vec<(f64, f64)> = hr_series
        .iter()
        .copied()
        .filter(|(ts, hr)| ts.is_finite() && hr.is_finite() && *ts > onset_ts)
        .collect();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    // Each sample represents the interval to the next sample (or 1.0 for the last).
    sorted.windows(2)
        .filter(|w| w[0].1 > threshold)
        .map(|w| w[1].0 - w[0].0)
        .sum::<f64>()
        + if sorted.last().map_or(false, |(_, hr)| *hr > threshold) { 1.0 } else { 0.0 }
}
```

---

### WR-02: `sol_from_hr` does not filter non-finite HR values — threshold comparison with NaN is always false

**File:** `Rust/core/src/metrics.rs:4120-4124`

**Issue:** The series is filtered for finite timestamps:

```rust
.filter(|(ts, _)| ts.is_finite())
```

but HR values are not filtered. If a sample has a finite timestamp and a NaN/Inf HR, `*hr <= threshold` evaluates to `false` (NaN comparisons are always false), which is treated as "above threshold — broke the run." A single NaN sample in the middle of an otherwise valid sustained-sleep period will silently terminate the run and prevent SOL detection. This contrasts with `waso_from_hr` and `hr_disturbance_count`, which correctly filter `hr.is_finite()`.

**Fix:**
```rust
let mut sorted: Vec<(f64, f64)> = hr_series
    .iter()
    .copied()
    .filter(|(ts, hr)| ts.is_finite() && hr.is_finite())
    .collect();
```

---

### WR-03: `heart_rate_dip_percent` field name used to read from v0 output, but v0 does not emit `heart_rate_dip_percent` in its JSON top-level for the Swift layer

**File:** `GooseSwift/HealthDataStore+Sleep.swift:36`

**Issue:** The Swift code reads:

```swift
let heartRateDipText = numberText(output["heart_rate_dip_percent"], fractionDigits: 1)
    .map { $0 + "%" } ?? "--"
```

In `SleepScoreOutput` (v0), the field is `heart_rate_dip_percent` (serialised as `"heart_rate_dip_percent"`). In `SleepV1Output`, the corresponding field is `sleep_hr_dip_percent`. The Swift code reads from `output` (which is the `score_result.output` blob), so for v1 runs it will always get `nil` for `output["heart_rate_dip_percent"]` and fall back to `"--"`, silently dropping the dip value even when computed.

**Fix:** Read both field names with fallback:

```swift
let heartRateDipText = (
    numberText(output["sleep_hr_dip_percent"], fractionDigits: 1)
    ?? numberText(output["heart_rate_dip_percent"], fractionDigits: 1)
).map { $0 + "%" } ?? "--"
```

---

### WR-04: EWMA variance is always 0 for the second fold when called via `ewma_baseline_update` then `fold_history` — z-score at night 4 uses a variance of 0 or near-zero, making z-score arbitrarily large

**File:** `Rust/core/src/baselines.rs:95-105`

**Issue:** On the first fold, `variance` is set to 0 (correct per the initialisation convention). On the second fold:

```rust
self.variance = (1.0 - ALPHA) * self.variance + ALPHA * (x - old_mean).powi(2);
// = 0.9 * 0 + 0.1 * (x2 - x1)^2 = 0.1 * (x2 - x1)^2
```

This is correct. However, when night_count reaches exactly `MIN_NIGHTS_SEED = 4`, the z-score is enabled and may be computed against a variance that has had only 3 EWMA updates. For a user whose first four HRV values are [60, 60, 60, 60], variance ≈ 0 (negligible deviation), and the `VARIANCE_FLOOR = 1e-6` clamp means z-score(60.0) = (60 - 60) / 1e-3 = 0, which is fine. But for a user whose first value is 60 and next three are all 90, the variance at night 4 is approximately `0.1*(30^2) + 0.9*0.1*(30^2) + ...` — still only ~27, std_dev ≈ 5.2. A measurement of 100 would yield z ≈ 7.7, which is arguably reasonable. The VARIANCE_FLOOR is too small (1e-6) relative to realistic HRV variance (HRV RMSSD typically 20–100 ms). At exactly 4 nights with low variance (e.g. all readings identical), any new outlier generates an enormous z-score. This is a UX/accuracy concern rather than a crash-level issue, but the floor should be domain-appropriate (e.g. `1.0` for HRV in ms² units):

```rust
// Suggested domain-appropriate floor: 1.0 ms² (std_dev floor = 1 ms)
const VARIANCE_FLOOR: f64 = 1.0;
```

This is still low enough to not mask real variance, but prevents astronomic z-scores from 4-night datasets where the observations happen to be nearly identical.

---

## Info

### IN-01: `ewma_baseline_update` always inserts `start_time_unix_ms = end_time_unix_ms` — zero-duration row

**File:** `Rust/core/src/store.rs:3685`

**Issue:** The INSERT uses the same value for both `start_time_unix_ms` and `end_time_unix_ms`:

```sql
VALUES (?1, ?2, 'UTC', ?3, ?3, ...)
```

Both receive `now_ms`. Any query joining or ordering by time range using these columns will treat the EWMA provenance rows as zero-duration events. This is a minor data quality issue because the rows don't represent a real time window. Consider using the actual night's start/end times passed to `ewma_baseline_update`.

---

### IN-02: Test `test_ewma_baseline_update_date_guard_different_values` conflates two behaviours

**File:** `Rust/core/tests/metrics_tests.rs` (baselines.rs inline tests at line ~544)

**Issue:** The test name says "date guard must prevent double-update even with different values." This is correct, but the test does not verify that the pre-existing row in the database is **unchanged** after the second call. The second call returns `Ok(false)` correctly, but no assertion checks that the stored values are still `(60.0, 55.0)` rather than `(65.0, 58.0)`. If a future implementation accidentally updated the row and returned `Ok(false)`, this test would not catch it.

**Fix:** Add a read-back assertion:

```rust
// Verify the stored values are unchanged after the blocked second call
let baseline = EwmaBaseline::fold_history(&store).expect("fold_history");
assert!((baseline.hrv.mean - 60.0).abs() < 1e-9, "stored HRV must be unchanged");
```

---

_Reviewed: 2026-06-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
