---
phase: 23-strain-calories
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - Rust/core/src/metrics.rs
  - Rust/core/src/energy_rollup.rs
  - Rust/core/src/bridge.rs
  - Rust/core/tests/metrics_tests.rs
  - Rust/core/tests/energy_rollup_tests.rs
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-06-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase adds Tanaka HRmax estimation, Banister TRIMP, strain-denominator fitting,
Mifflin-St Jeor RMR, Keytel active kcal, and Harris-Benedict RMR to the Goose Rust core,
and wires them through the energy rollup pipeline. The arithmetic for all six formulas is
correct against the published coefficients. However, two bugs produce wrong numeric results
in realistic call paths, and three quality issues degrade reliability.

---

## Critical Issues

### CR-01: `estimate_hrmax_from_history` p99.5 index is off-by-one — returns a value above the true 99.5th percentile

**File:** `Rust/core/src/metrics.rs:1896`

**Issue:** The index computation is:

```rust
let index = ((0.995 * len as f64).ceil() as usize).min(len - 1);
```

For `len = 600`, `0.995 * 600.0 = 597.0`, `.ceil() = 597.0`, cast to `usize = 597`.
`sorted[597]` is the 598th element (0-indexed), which corresponds to the **99.67th percentile**,
not the 99.5th.

The standard definition of the p-th percentile index (nearest-rank) over a sorted array of
`n` items is `ceil(p * n) - 1` (0-indexed). The implementation omits the `- 1`, so it always
returns the element one position above the target percentile. For `n = 600` the result is
`sorted[597]` rather than the correct `sorted[596]`.

The test `estimate_hrmax_from_history_returns_p99_5_percentile` reproduces the same
off-by-one in its expected-value calculation, so it does not catch the bug:

```rust
// test line 1854 — mirrors the production formula, not the correct one
let expected_index = ((0.995 * len).ceil() as usize).min(samples.len() - 1);
```

**Fix:**

```rust
// production code
let index = ((0.995 * len as f64).ceil() as usize)
    .saturating_sub(1)
    .min(len - 1);
```

```rust
// test expected value
let expected_index = ((0.995 * len).ceil() as usize)
    .saturating_sub(1)
    .min(samples.len() - 1);
```

---

### CR-02: `banister_trimp_zone_midpoint` sex dispatch uses exact literal match — inconsistent with `energy_rollup.rs` and silently falls back for any capitalisation variant

**File:** `Rust/core/src/metrics.rs:1944-1948`

**Issue:** `banister_trimp_zone_midpoint` and the `b_constant` block in `goose_strain_v1`
(lines 2067-2071) match `Some("male")` / `Some("female")` with exact byte-equality:

```rust
let b: f64 = match sex {
    Some("male") => 1.92,
    Some("female") => 1.67,
    _ => 1.795,
};
```

The caller in `goose_strain_v1` passes `input.profile_sex.as_deref()`, which gives `Some("Male")`
when the profile field contains a capitalised value. Any such input silently uses `b = 1.795`
(the sex-unknown mean) rather than `1.92`, producing a wrong TRIMP score with no error or
quality flag.

By contrast, every function in `energy_rollup.rs` (`rmr_mifflin_st_jeor`, `keytel_active_kcal_per_min`,
`harris_benedict_rmr_kcal_day`) consistently uses `s.eq_ignore_ascii_case("male")`. The
inconsistency means the same `profile_sex` string value will route correctly through Keytel
but silently mis-route through Banister TRIMP.

The test suite only exercises lowercase `"male"` / `"female"` literals, so this is not caught.

**Fix:** Apply `eq_ignore_ascii_case` in `banister_trimp_zone_midpoint` and in the
`b_constant` provenance block inside `goose_strain_v1`:

```rust
let b: f64 = match sex {
    Some(s) if s.eq_ignore_ascii_case("male") => 1.92,
    Some(s) if s.eq_ignore_ascii_case("female") => 1.67,
    _ => 1.795,
};
```

```rust
// goose_strain_v1 b_constant block (line ~2067)
let b_constant: f64 = match input.profile_sex.as_deref() {
    Some(s) if s.eq_ignore_ascii_case("male") => 1.92,
    Some(s) if s.eq_ignore_ascii_case("female") => 1.67,
    _ => 1.795,
};
```

---

## Warnings

### WR-01: `banister_trimp_zone_midpoint` divides by zero when `hrmax == resting_hr_bpm`

**File:** `Rust/core/src/metrics.rs:1953`

**Issue:**

```rust
let hr_range = hrmax - resting_hr_bpm;
// ...
let x = ((zone_mid_hr - resting_hr_bpm) / hr_range).clamp(0.0, 1.0);
```

When `hrmax == resting_hr_bpm`, `hr_range = 0.0` and the division produces `NaN` (or ±inf).
The subsequent `clamp(0.0, 1.0)` call on `NaN` returns `NaN`, and the returned TRIMP is `NaN`.

`goose_strain_v1` does guard `input.max_hr_bpm <= input.resting_hr_bpm` with an error, but
`banister_trimp_zone_midpoint` is a public function that can be called directly with degenerate
inputs (e.g. from the bridge test harness or future callers). The function has no guard of its own.

**Fix:**

```rust
let hr_range = hrmax - resting_hr_bpm;
if hr_range <= 0.0 {
    return 0.0;
}
```

---

### WR-02: `fit_strain_denominator` does not guard against `trimp == -1.0` (ln(0) = -inf)

**File:** `Rust/core/src/metrics.rs:1995`

**Issue:**

```rust
let c = 21.0 * (trimp + 1.0).ln();
if !c.is_finite() {
    return None;
}
```

When `trimp = -1.0`, `(trimp + 1.0).ln() = ln(0.0) = -inf`. The `is_finite()` check correctly
returns `None` here. However, when `trimp < -1.0`, `(trimp + 1.0)` is negative and `ln` returns
`NaN`. `!NaN.is_finite()` is also true, so `None` is returned — correct behavior but the
comment says "non-finite values" without acknowledging the negative-TRIMP domain. More importantly,
`trimp = 0.0` gives `c = 0.0`, so a pair `(0.0, strain)` contributes nothing to the numerator
but also nothing to the denominator — effectively a silent no-op rather than an error. This means
a caller could pass two identical zero-TRIMP pairs and receive `None` instead of a meaningful
denominator, violating the stated "at least 2 pairs" contract without a diagnostic.

**Fix:** Add an explicit guard for non-positive TRIMP values before the ln call, and document
the behaviour:

```rust
if trimp <= 0.0 {
    return None; // TRIMP must be strictly positive for ln(TRIMP+1) to be meaningful
}
let c = 21.0 * (trimp + 1.0).ln();
```

---

### WR-03: `rollup_energy_hour_for_store` uses a simple `weight * 22.0` resting proxy rather than Mifflin-St Jeor, even when `profile_height_cm` is available on the daily path

**File:** `Rust/core/src/energy_rollup.rs:891`

**Issue:** The daily rollup (`rollup_energy_day_for_store`) uses the Mifflin-St Jeor formula
when both `profile_height_cm` and `profile_age_years` are present (line 424-432). The hourly
rollup always falls through to the weight-only proxy:

```rust
// rollup_energy_hour_for_store, line 891
let resting = resting_kcal(effective_weight_kg, covered_minutes);
```

`EnergyHourlyRollupOptions` has no `profile_height_cm` field (by design — it is absent from the
struct at lines 53-68), so the Mifflin path is structurally inaccessible from the hourly rollup.
This creates a silent inconsistency: for the same user on the same day, the daily resting kcal
uses Mifflin while each hourly resting kcal uses the cruder `weight * 22` proxy, making daily
and hourly totals non-additive.

If hourly and daily resting kcal are ever summed or compared by the iOS client, the discrepancy
will be confusing and difficult to trace because neither the hourly report nor the quality flags
indicate which formula was used.

**Fix (two options):**
1. Add `profile_height_cm: Option<f64>` to `EnergyHourlyRollupOptions` and mirror the Mifflin
   branch from the daily rollup.
2. Emit a quality flag `"resting_kcal_proxy_weight_22_used"` from the hourly rollup so the
   discrepancy is visible to callers.

---

## Info

### IN-01: `lipponen_tarvainen_filter` uses a non-standard even-index median (lower-of-two)

**File:** `Rust/core/src/metrics.rs:2537`

**Issue:**

```rust
window.sort_by(|a, b| a.partial_cmp(b).unwrap());
let median = window[window.len() / 2];
```

When `window.len()` is even, `window.len() / 2` picks the upper of the two middle elements
(e.g. index 2 for a 4-element window after the candidate is excluded from a window-of-5), which
is the upper-median, not the true median (average of the two middle elements). The original
Lipponen-Tarvainen (2019) paper uses the conventional median. This is a minor approximation
but it means the threshold `|x - median| > 0.20 * median` may differ slightly from the
specification for even-length windows. The practical impact is small but the discrepancy
is not documented.

**Fix:** Document the approximation, or use the average of the two central elements:

```rust
let median = if window.len() % 2 == 0 {
    (window[window.len() / 2 - 1] + window[window.len() / 2]) / 2.0
} else {
    window[window.len() / 2]
};
```

---

### IN-02: `goose_strain_v1` calls `resolve_effective_hrmax` with an empty history slice — the observed path is permanently unreachable from this function

**File:** `Rust/core/src/metrics.rs:2063-2064`

**Issue:**

```rust
let (effective_hrmax, hrmax_source) =
    resolve_effective_hrmax(input.max_hr_bpm, input.profile_age, &[]);
```

The empty slice `&[]` means `estimate_hrmax_from_history` always returns `None` (fewer than 600
samples), so the `"observed"` path is dead code from `goose_strain_v1`'s perspective. Future
callers who expect `hrmax_source == "observed"` when history is provided will be surprised.
The `StrainInput` struct has no `hr_history` field, so a proper fix requires a struct change,
but the dead-code call is at minimum misleading.

**Fix:** Either add `hr_history: Vec<f64>` to `StrainInput` (and pass it through the bridge
args), or document that `goose_strain_v1` only supports the `tanaka` and `fallback` paths,
and call `resolve_effective_hrmax` only when `profile_age` is present:

```rust
// Simpler: document the limitation in the function doc comment
/// HRmax source will always be "tanaka" (when profile_age is Some)
/// or "fallback". The "observed" path requires an hr_history slice
/// which is not available in StrainInput; a future StrainV2Input
/// should include this field.
```

---

_Reviewed: 2026-06-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
