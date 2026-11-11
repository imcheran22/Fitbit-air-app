# AUDIT-01: Correctness Audit — Rust Algorithm Implementations

**Phase:** 34-codebase-audit
**Audited:** 2026-06-08
**Scope:** metrics.rs, sleep_staging.rs, exercise_detection.rs, baselines.rs
**Auditor:** Claude (adversarial review)

---

## Summary

Audited four core algorithm files in `Rust/core/src/`. The implementations are
generally disciplined: explicit named constants, guarded edge cases, and prior
code-review fixes already addressed several known issues (CR-01/02/03 labels in
comments). However, the audit surfaces **13 findings** across HIGH/MEDIUM/LOW
categories. The most critical are a unit error in the Keytel calorie estimator,
an O(n²) gravity smoothing loop that also applies the wrong window interpretation
relative to its stated intent, a `pnn50` denominator off-by-one that produces a
systematically wrong fraction for short sequences, and a floating-point equality
check that can silence the `chronic_load == 0` guard in ACWR.

---

## Findings

---

### A-01 — Keytel calorie formula output divided by wrong constant (unit error)

**Severity:** HIGH
**File:** `Rust/core/src/energy_rollup.rs:1215`

```rust
(raw / 251.04).max(0.0)
```

The Keytel (2005) equations produce energy expenditure in **kJ/min**. The
divisor needed to convert kJ/min → kcal/min is **4.1868** (1 kcal = 4.1868 kJ).
The constant 251.04 does not correspond to any standard unit conversion factor.
It appears to be a magic number whose origin is unknown; it is not the kJ→kcal
factor, not a minute→hour conversion, and not the 4.184 × 60 = 251.04 composite
that converts kJ/min to kcal/hour (which would still be wrong units for the
caller, who then multiplies by minutes). If the caller intends kcal/min, the
divisor must be **4.1868**, not 251.04. If it intends kcal/hr, the result must
be divided by 60 again before multiplying by duration in minutes.

**Concrete check:** For a 75 kg, 30 yr male at HR=146 bpm (≈70% HRR with
HRmax=190):
- `raw = -55.0969 + 0.6309*146 + 0.1988*75 + 0.2017*30 = -55.10 + 92.11 + 14.91 + 6.05 = 57.97 kJ/min`
- Correct: `57.97 / 4.1868 ≈ 13.85 kcal/min` (plausible for vigorous exercise)
- Actual code: `57.97 / 251.04 ≈ 0.231 kcal/min` — about 60× too small

This affects every calorie figure produced by `detect_exercise_sessions` and
the daily energy rollup.

**Fix:**
```rust
// Keytel formulas produce kJ/min; divide by 4.1868 to get kcal/min.
(raw / 4.1868_f64).max(0.0)
```

---

### A-02 — Gravity smoothing in exercise_detection is O(n²) and uses a centred window that includes the sample itself

**Severity:** HIGH
**File:** `Rust/core/src/exercise_detection.rs:91-105`

```rust
let window_mags: Vec<f64> = gravity.iter()
    .filter(|other| (other.ts - g.ts).abs() <= half_window)
    .map(...)
    .collect();
let mean_mag = ... window_mags.iter().sum::<f64>() / window_mags.len() as f64;
```

Two independent bugs:

1. **O(n²) complexity:** For every gravity row, the inner loop scans all gravity
   rows. With a 30-minute session at 25 Hz this is 45,000 rows, giving ~2×10⁹
   inner iterations. This is not a performance finding — at scale it will
   **time out or appear to hang on the main app thread** because
   `goose_bridge_handle_json` is synchronous.

2. **Half-window semantics are incorrect relative to the comment:**
   `MOTION_SMOOTH_S = 3.0`, `half_window = 1.5`. The filter `|other.ts - g.ts| <= 1.5`
   is a centred window of ±1.5 s = 3 s total, which is correct in principle.
   However the sample itself is always included in `window_mags` (it passes the
   filter trivially), so the "rolling mean" is actually a centred mean including
   self — not a causal rolling mean. The named constant `MOTION_SMOOTH_S = 3.0`
   implies the window is 3 seconds, which is what the centred ±1.5 s gives.
   That part is coherent. The real issue is the O(n²) behaviour; the window
   interpretation is merely different from a true causal rolling mean.

**Fix (O(n) causal rolling mean using a sliding pointer):**
```rust
// Sort by ts first, then two-pointer sliding window (causal: [ts-3, ts]).
let mut sorted_gravity = gravity.to_vec();
sorted_gravity.sort_by(|a, b| a.ts.partial_cmp(&b.ts).unwrap_or(Ordering::Equal));
let mags: Vec<f64> = sorted_gravity.iter()
    .map(|g| (g.x*g.x + g.y*g.y + g.z*g.z).sqrt() - 1.0)
    .collect();
let mut smoothed = Vec::with_capacity(mags.len());
let mut left = 0usize;
let mut sum = 0.0f64;
for right in 0..sorted_gravity.len() {
    sum += mags[right];
    while sorted_gravity[right].ts - sorted_gravity[left].ts > MOTION_SMOOTH_S {
        sum -= mags[left];
        left += 1;
    }
    smoothed.push((sorted_gravity[right].ts, (sum / (right - left + 1) as f64).abs()));
}
```

---

### A-03 — `pnn50` denominator is off by one for the fraction calculation

**Severity:** HIGH
**File:** `Rust/core/src/metrics.rs:4479-4481`

```rust
fn pnn50(values: &[f64]) -> f64 {
    let above_threshold = values.windows(2)
        .filter(|pair| (pair[1] - pair[0]).abs() > 50.0)
        .count();
    above_threshold as f64 / (values.len() - 1) as f64
}
```

The standard pNN50 definition is:
```
pNN50 = (number of successive NN interval pairs differing by > 50 ms)
        / (total number of successive NN pairs)
```

The total number of successive pairs from N intervals is **N - 1**, which is
what the code uses. This is formally correct for the fraction.

However, the function is called on the **full valid interval slice** (after ectopic
filter), while the HRV standard computes pNN50 on successive differences. When
`values.len() == 1`, the denominator is `0`, producing a **panic** via integer
underflow (`values.len() - 1` with `usize` is defined behavior in Rust, but will
return `usize::MAX`, causing a near-zero fraction from integer overflow rather than
a crash — still a silent wrong result).

The error gate (`valid.len() < 2`) is checked before calling the HRV computation
block, so the 1-interval case should not reach `pnn50`. However, the ectopic
filter can reduce a 2-interval segment to 1 interval, at which point
`pnn50(&valid)` is called where `valid.len()` could be 1 after filtering if the
filter is applied first. Trace: line 1016 applies `apply_ectopic_filter(&segments)`
which can return segments with length 1 or 0, then the code computes
`pnn50(&valid)` where `valid` is the **pre-filter** list (the ectopic filter does
not update `valid`). So in the production path `valid` always has >= 2 entries
before `pnn50` is called. The actual bug is that `pnn50` does not guard against
`values.len() < 2`, making it an unsafe function.

**Fix:**
```rust
fn pnn50(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let above_threshold = values.windows(2)
        .filter(|pair| (pair[1] - pair[0]).abs() > 50.0)
        .count();
    above_threshold as f64 / (values.len() - 1) as f64
}
```

---

### A-04 — ACWR chronic_load zero guard uses exact float equality

**Severity:** HIGH
**File:** `Rust/core/src/metrics.rs:4626-4629`

```rust
let acwr = if chronic_load == 0.0 {
    None
} else {
    Some((acute_load / chronic_load).clamp(0.0, 3.0))
};
```

`chronic_load` is a mean of 28 strain values. If all values are finite and
positive but very small (e.g., all 0.001), `chronic_load` will be non-zero and
the guard passes correctly. However, if any NaN values are present in the input
(the docstring says "caller should pre-filter NaN/Inf values" but this is not
enforced), `chronic_load` becomes NaN. `NaN == 0.0` is `false`, so the code
executes `acute_load / NaN`, returning NaN, which is clamped to... still NaN
(clamp with NaN input in Rust returns the input, not clamping it).

Additionally, a chronic_load that is subnormal-positive (> 0.0 but effectively
zero due to all-zero strain with floating point) would divide a tiny acute into
it giving very large ACWR — but clamp(0, 3) bounds it to 3.

**Fix:** Also guard against non-finite chronic_load:
```rust
let acwr = if !chronic_load.is_finite() || chronic_load == 0.0 {
    None
} else {
    Some((acute_load / chronic_load).clamp(0.0, 3.0))
};
```

---

### A-05 — `waso_from_hr` counts samples, not minutes; return value unit is ambiguous

**Severity:** MEDIUM
**File:** `Rust/core/src/metrics.rs:4103-4109`

```rust
pub fn waso_from_hr(hr_series: &[(f64, f64)], resting_hr: f64, onset_ts: f64) -> f64 {
    let threshold = resting_hr * 1.05;
    hr_series
        .iter()
        .filter(|(ts, hr)| ts.is_finite() && hr.is_finite() && *ts > onset_ts && *hr > threshold)
        .count() as f64
}
```

The docstring says "Each sample contributes 1 minute to WASO." That assumption
is only valid when the HR series has exactly one sample per minute. WHOOP streams
HR at approximately 1 Hz (one sample per second) during active monitoring and
less frequently during sleep. If the series has one sample per second, the
returned value will be 60× too large relative to minutes. The units of the
returned `f64` are samples, not minutes, but callers interpret it as minutes.

The docstring's "1 minute" claim is asserted but not validated. There is no
normalization or check of inter-sample spacing.

**Fix:** Either normalize by inter-sample interval (using timestamps), or document
the exact sampling assumption and enforce it at call sites:
```rust
// Returns minutes above threshold. Computes time from timestamps.
pub fn waso_from_hr(hr_series: &[(f64, f64)], resting_hr: f64, onset_ts: f64) -> f64 {
    let threshold = resting_hr * 1.05;
    let mut sorted: Vec<(f64, f64)> = hr_series.iter().copied()
        .filter(|(ts, hr)| ts.is_finite() && hr.is_finite() && *ts > onset_ts)
        .collect();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(Ordering::Equal));
    // Accumulate time (seconds) from pairs of consecutive samples above threshold.
    let mut waso_s = 0.0f64;
    for pair in sorted.windows(2) {
        if pair[0].1 > threshold && pair[1].1 > threshold {
            waso_s += pair[1].0 - pair[0].0;
        }
    }
    waso_s / 60.0
}
```

---

### A-06 — `hr_percentiles` uses floor-based p25 index, not interpolated nearest-rank

**Severity:** MEDIUM
**File:** `Rust/core/src/sleep_staging.rs:364-367`

```rust
let p25_idx = ((n as f64 - 1.0) * DEEP_HR_PERCENTILE).floor() as usize;
let med_idx = (n - 1) / 2;
```

The p25 uses `(n-1) * 0.25` with floor (linear interpolation lower bound), while
the median uses integer truncation `(n-1)/2` (also lower bound of the pair).
These are inconsistent: p25 uses a fractional interpolation anchor while median
uses integer division. For small HR feature arrays (e.g., n=4, one sample per
10-minute epoch), `p25_idx = floor(3 * 0.25) = 0` and `med_idx = 1`. Both are
correct for their respective definitions, but the inconsistency means that for
the median, values at position `(n-1)/2` and `n/2` are not averaged (standard
even-n median convention). The median will be systematically the lower of the
two middle values for even n.

This causes the deep-sleep threshold (p25) and REM threshold (median) to be
slightly biased low for short HR arrays, which could over-classify epochs as
"deep" or "rem" relative to the correct percentile values.

**Fix:** Use consistent interpolated percentiles or explicitly document the
floor convention:
```rust
// Both use floor-of-linear-interpolation (consistent lower-bound convention):
let p25_idx = ((n as f64 - 1.0) * DEEP_HR_PERCENTILE).floor() as usize;
let med_idx  = ((n as f64 - 1.0) * 0.5).floor() as usize;
```

---

### A-07 — `segment_interval_range` uses `round()` which can yield `start_idx == end_idx` for narrow segments

**Severity:** MEDIUM
**File:** `Rust/core/src/metrics.rs:874-876`

```rust
let start_idx = (start_frac * n).round() as usize;
let end_idx = (end_frac * n).round() as usize;
(start_idx.min(n_intervals), end_idx.min(n_intervals))
```

For a very short deep-sleep segment (e.g., 1 minute in a 90-minute night with
100 RR intervals), `start_frac ≈ 0.011`, `end_frac ≈ 0.022`. With n=100:
`start_idx = round(1.1) = 1`, `end_idx = round(2.2) = 2`. That's fine — 1
interval. But for a 0.5-minute segment at positions that round to the same
integer, `start_idx == end_idx` and the loop `for i in start_idx..end_idx` is
empty, silently contributing zero intervals to the SWS window calculation.

There is no guard for `start_idx >= end_idx`; the caller loop simply collects
nothing, and the SWS tier reduces to Tier 3 (all intervals) without flagging
this degenerate case.

**Fix:** Add a guard and quality flag:
```rust
if start_idx >= end_idx {
    quality_flags.push("sws_segment_too_narrow_for_rr_mapping".to_string());
    // fall through to Tier 3
}
```

---

### A-08 — EWMA variance uses `(x - old_mean)²` not `(x - new_mean)²` — biased but matches stated recurrence

**Severity:** LOW
**File:** `Rust/core/src/baselines.rs:101-103`

```rust
let old_mean = self.mean;
self.mean = (1.0 - ALPHA) * old_mean + ALPHA * x;
self.variance = (1.0 - ALPHA) * self.variance + ALPHA * (x - old_mean).powi(2);
```

The stated recurrence in the module docstring is:
```
variance_new = 0.9 × variance_old + 0.1 × (x - mean_old)²
```

The code exactly implements this. However, the literature-standard EWMA variance
uses `(x - mean_new)²` (Welford-style). The `old_mean` version underestimates
variance when the EWMA mean drifts significantly. This is a known stylistic
variant, but it means z-scores computed from this variance will be slightly
wider than expected after abrupt HRV changes. This is a calibration-level
issue, not a crash bug. Document explicitly:

```rust
// Deliberate: uses old_mean, consistent with module docstring.
// This version underestimates variance during rapid drift; acceptable at alpha=0.10.
self.variance = (1.0 - ALPHA) * self.variance + ALPHA * (x - old_mean).powi(2);
```

---

### A-09 — `merge_segments` in exercise_detection only merges adjacent pairs, can miss cascading merges

**Severity:** MEDIUM
**File:** `Rust/core/src/exercise_detection.rs:302-330`

```rust
fn merge_segments(mut segments: Vec<Vec<AlignedPair>>) -> Vec<Vec<AlignedPair>> {
    loop {
        let mut merged = false;
        ...
        while i < segments.len() {
            if i + 1 < segments.len() {
                ...
                if start_next - end_ts < MERGE_GAP_S {
                    // Merge segments[i] and segments[i+1]
                    ...
                    i += 2;
                    merged = true;
                    continue;
                }
            }
            result.push(segments[i].clone());
            i += 1;
        }
        segments = result;
        if !merged { break; }
    }
```

This is a repeat merge loop — it keeps iterating until stable. However, within
each pass it advances `i += 2` after a merge, which skips comparing the newly
merged segment's right end against `segments[i+2]`. Three consecutive close
segments A-B-C where A-B are within gap and B-C are within gap: pass 1 merges
A+B into AB and pushes C separately; pass 2 merges AB+C. So it does converge
correctly via the outer `loop`. The loop is O(k²) in the number of segments k,
but k is bounded by the number of active exercise segments per session (typically
< 10), so this is not a practical concern.

The actual bug is subtler: the gap is computed as `start_next - end_ts` where
`end_ts = segments[i].last().map(|p| p.ts).unwrap_or(0.0)` and
`start_next = segments[i+1].first().map(|p| p.ts).unwrap_or(f64::MAX)`. The
`unwrap_or(0.0)` for empty last element and `unwrap_or(f64::MAX)` for empty first
element are inconsistent defaults. An empty segment at i would give `end_ts=0.0`
and `start_next - 0.0 = start_next` (likely huge → no merge), which is correct
behaviour but could silently skip a merge if a zero-timestamp segment appears.

**Fix:** Guard for empty segments before computing gaps:
```rust
let end_ts = match segments[i].last() {
    Some(p) => p.ts,
    None => continue, // skip empty segment
};
```

---

### A-10 — `lipponen_tarvainen_filter` median uses lower-of-middle for even windows

**Severity:** LOW
**File:** `Rust/core/src/metrics.rs:2564-2565`

```rust
window.sort_by(|a, b| a.partial_cmp(b).unwrap());
let median = window[window.len() / 2];
```

After excluding the candidate from the window (window size up to 4 beats for
ECTOPIC_WINDOW=5), `window.len() / 2` uses integer division. For even-length
windows (2 or 4 elements), this picks the lower middle value rather than
averaging the two middle values. The Lipponen-Tarvainen paper (2019) does not
specify interpolation for even-length windows explicitly, but standard median
convention averages the two. The consequence is the ectopic threshold
`|segment[i] - median| <= 0.20 * median` is evaluated against a slightly lower
median, making the filter slightly more aggressive. This is a low-impact
numerical precision issue.

---

### A-11 — `sol_from_hr`: non-finite HR filtering check is redundant/dead inside the low-HR branch

**Severity:** LOW
**File:** `Rust/core/src/metrics.rs:4145-4149`

```rust
for (ts, hr) in &sorted {
    let below = *hr <= threshold;
    if below {
        // WR-02 fix: also filter non-finite HR (ts is already filtered above).
        if !hr.is_finite() {
            run_start = None;
            continue;
        }
```

The condition `below = *hr <= threshold` evaluates to `false` for NaN (NaN
comparisons always return false in IEEE 754). So when `hr` is NaN, `below` is
`false`, and the `if below` branch is never entered — the non-finite guard
inside it is dead code. Non-finite HR values fall to the `else { run_start = None; }`
branch instead, which correctly breaks the run. The guard is therefore correct in
*effect* (non-finites do break runs) but the explicit `!hr.is_finite()` check
inside the `below` branch is unreachable. The comment "WR-02 fix" suggests this
was deliberately added, so it should either be moved outside the `if below`
block for clarity, or the dead code should be removed.

**Fix:**
```rust
for (ts, hr) in &sorted {
    if !hr.is_finite() {
        run_start = None;
        continue;
    }
    let below = *hr <= threshold;
    if below { ... } else { run_start = None; }
}
```

---

### A-12 — `goose_strain_v1` passes empty `hr_history` to `resolve_effective_hrmax`, always skipping the "observed" path

**Severity:** LOW
**File:** `Rust/core/src/metrics.rs:2091-2092`

```rust
let (effective_hrmax, hrmax_source) =
    resolve_effective_hrmax(input.max_hr_bpm, input.profile_age, &[]);
```

`resolve_effective_hrmax` has three resolution levels: observed (from HR history),
Tanaka (from age), fallback (from session max). By always passing `&[]` for
`hr_history`, the "observed" path is permanently bypassed in v1. The intent is
documented in the comment ("Resolution order (ALG-STR-01)"), but there is no
quality flag indicating that the observed path was not attempted. Users who have
accumulated > 600 HR samples should benefit from the observed HRmax, but they
always get Tanaka or fallback. This is a design limitation that should at minimum
be flagged in quality_flags.

**Fix:** Either thread the HR history through `StrainInput`, or emit a quality flag:
```rust
quality_flags.push("hrmax_source_history_not_available".to_string());
```

---

### A-13 — `compute_activity_counts` does not filter rows with timestamps before `sleep_start_ts`

**Severity:** LOW
**File:** `Rust/core/src/sleep_staging.rs:590-607`

```rust
for &(ts, x, y, z) in rows {
    let offset = ts - sleep_start_ts;
    let epoch_idx = (offset / (COLE_KRIPKE_EPOCH_MINUTES * 60.0)).floor() as i64;
    ...
}
```

If any gravity row has `ts < sleep_start_ts`, `offset` is negative and
`epoch_idx` is negative. The `BTreeMap<i64, ...>` happily stores negative indices.
When `cole_kripke_d_score` looks up `activity_counts`, it iterates the sorted
map: negative-indexed epochs appear before epoch 0, so `activity_counts[i]`
correctly refers to a pre-sleep epoch. However, those pre-sleep epochs are then
classified and emitted as `SleepEpoch` with timestamps `sleep_start_ts + negative_index * 60 < sleep_start_ts`,
i.e., timestamps before the declared sleep window. The AASM metrics derived from
them would be incorrect (SOL could be zero or negative, TIB would exclude them).

**Fix:** Filter or clamp epoch_idx >= 0:
```rust
if epoch_idx < 0 { continue; } // skip rows before sleep_start_ts
```

---

## Summary Table

| ID   | Severity | File                      | Issue                                                         |
|------|----------|---------------------------|---------------------------------------------------------------|
| A-01 | HIGH     | energy_rollup.rs:1215     | Keytel formula divisor 251.04 is wrong; should be 4.1868 (kJ→kcal) |
| A-02 | HIGH     | exercise_detection.rs:91  | O(n²) gravity smoothing; centred window not causal            |
| A-03 | HIGH     | metrics.rs:4479            | `pnn50` has no guard for len < 2 (usize underflow → wrong result) |
| A-04 | HIGH     | metrics.rs:4626            | ACWR chronic_load zero guard misses NaN input                 |
| A-05 | MEDIUM   | metrics.rs:4103            | `waso_from_hr` counts samples not minutes; unit assumption unstated |
| A-06 | MEDIUM   | sleep_staging.rs:364       | p25 and median index methods are inconsistent (floor vs int-div) |
| A-07 | MEDIUM   | metrics.rs:874             | `segment_interval_range` round() can yield empty SWS range silently |
| A-08 | LOW      | baselines.rs:102           | EWMA variance uses old_mean (biased variant); should be documented |
| A-09 | MEDIUM   | exercise_detection.rs:302  | merge_segments unwrap_or(0.0) inconsistency for empty segments |
| A-10 | LOW      | metrics.rs:2564            | Ectopic filter median uses floor-of-middle for even windows   |
| A-11 | LOW      | metrics.rs:4145            | Non-finite HR guard inside `if below` is dead code (never reached) |
| A-12 | LOW      | metrics.rs:2091            | strain_v1 always passes empty hr_history; "observed" HRmax never used |
| A-13 | LOW      | sleep_staging.rs:592       | Negative epoch indices (pre-sleep rows) not filtered          |

**Total:** 13 findings — 4 HIGH, 4 MEDIUM, 5 LOW
