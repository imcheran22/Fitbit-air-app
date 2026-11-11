# Phase 114: Harvard Sleep Need Model — Research

**Researched:** 2026-06-22
**Domain:** Rust algorithm + bridge method + SQLite self-query
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `sleep.compute_need` is self-querying. Bridge args: `{ database_path, age_years: Option<u8>, prior_strain: Option<f64> }`. The bridge fetches the last 5 nights of sleep duration from SQLite internally — Swift does not pre-fetch or pass history array.
- **D-02:** Full breakdown exposed: `SleepNeedResult { base_need_minutes, debt_adjustment_minutes, strain_adjustment_minutes, total_need_minutes }`.
- **D-03:** `age_years = None` → use 26–64 bracket (450 min / 7.5h). Deliberate visible change from hardcoded 480.

### Claude's Discretion

- `perf_budget.rs:677` hardcoded `480.0` — **keep as literal**. Performance budget test, not algorithm logic.
- EWMA debt: query last 5 completed sleep sessions from SQLite. Use `total_sleep_time_minutes` or equivalent from the sleep feature score report.
- Cold-start (fewer than 5 nights): EWMA over however many nights exist; `debt_adjustment = 0.0` if no history.

### Deferred Ideas (OUT OF SCOPE)

- Swift UI wiring of `SleepNeedResult` → Phase 120
- User age input / Settings screen → Phase 120 or later
- HealthKit date-of-birth import → future phase
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SLP-NEED-01 | `Rust/core/src/sleep_need.rs` — `compute_sleep_need(age_years, 5-night history, prior_strain) -> SleepNeedResult`; age-bracket baseline (18–25: 8h, 26–64: 7.5h, 65+: 7h); EWMA alpha 0.0483; strain adjustment (+0.25h if ≥15, +0.1h if ≥10); `cargo test --locked` with cold-start + age-bracket + strain tests | Algorithm parameters confirmed from REQUIREMENTS.md; EWMA alpha = `baselines::ALPHA = 0.0483` [VERIFIED: codebase]; `EwmaState::fold()` is the reusable EWMA primitive |
| SLP-NEED-02 | Replace hardcoded `480.0` in `SleepFeatureScoreOptions` + `RecoveryFeatureScoreOptions` with bridge call `sleep.compute_need`; `age_years: Option<u8>` added to options struct; bridge method registered in `BRIDGE_METHODS` | All 5 occurrences of `480.0` confirmed [VERIFIED: codebase grep]; `BRIDGE_METHODS` sort position confirmed; `bridge_methods_constant_matches_dispatcher` test analysed |
</phase_requirements>

---

## Summary

Phase 114 is a pure Rust phase with three deliverables: (1) a new `sleep_need.rs` algorithm module, (2) a `sleep.compute_need` bridge RPC, and (3) replacement of the hardcoded `480.0` constant at four algorithm call sites (one occurrence in `perf_budget.rs` stays as-is).

The codebase already has a production-quality EWMA engine in `baselines.rs` — `EwmaState::fold()` with `ALPHA = 0.0483` — that `sleep_need.rs` can import directly instead of re-implementing the recurrence. The bridge pattern in `bridge/sleep.rs` is clear and consistent: add one `match` arm, one `#[derive(Debug, Clone, Deserialize)]` Args struct, one bridge function, and register the method name alphabetically in `BRIDGE_METHODS`. The self-querying requirement (D-01) is best satisfied by calling `store.external_sleep_sessions_between(0, i64::MAX)`, taking the last 5 sessions ordered by `end_time_unix_ms` DESC, and converting `duration_ms / 60_000.0` to `sleep_duration_minutes`.

For the score bridge call sites (bridge/metrics.rs:3243 and 3341), the cleanest replacement is: add `age_years: Option<u8>` to `SleepFeatureScoreArgs` and `RecoveryFeatureScoreArgs`, then replace `args.sleep_need_minutes.unwrap_or(480.0)` with `args.sleep_need_minutes.unwrap_or_else(|| compute_sleep_need_from_store(&store, args.age_years, None).total_need_minutes)`.

**Primary recommendation:** Implement `sleep_need.rs` as a pure function over `age_years: Option<u8>`, `history: &[f64]`, `prior_strain: Option<f64>` with no I/O; the bridge function handles all SQLite access and composes these inputs.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Age-bracket baseline lookup | Algorithm (sleep_need.rs) | — | Pure computation, no I/O |
| EWMA debt computation | Algorithm (sleep_need.rs) | — | Reuses EwmaState::fold() |
| Strain adjustment | Algorithm (sleep_need.rs) | — | Pure computation |
| Fetching last 5 sleep sessions | Bridge (bridge/sleep.rs) | Store (store/sleep.rs) | Bridge owns I/O; algorithm stays pure |
| Registering bridge method | bridge/mod.rs BRIDGE_METHODS | bridge/sleep.rs dispatch | BRIDGE_METHODS is the canonical registry |
| Wiring score bridges | bridge/metrics.rs | — | SleepFeatureScoreArgs and RecoveryFeatureScoreArgs modification |
| Default impl update | metric_features.rs | — | SleepFeatureScoreOptions and RecoveryFeatureScoreOptions |

---

## Research Area Findings

### 1. SleepFeatureScoreOptions and RecoveryFeatureScoreOptions (metric_features.rs)

**Exact struct signatures** [VERIFIED: codebase]

```rust
// metric_features.rs:149–156
#[derive(Debug, Clone, Copy)]
pub struct SleepFeatureScoreOptions {
    pub min_owned_captures_per_summary: usize,
    pub require_trusted_evidence: bool,
    pub sleep_need_minutes: f64,
    pub low_motion_threshold_0_to_1: f64,
    pub disturbance_motion_threshold_0_to_1: f64,
    pub target_midpoint_minutes_since_midnight: f64,
}
```

```rust
// metric_features.rs:159–177 (abbreviated)
#[derive(Debug, Clone)]
pub struct RecoveryFeatureScoreOptions {
    pub min_owned_captures_per_summary: usize,
    pub require_trusted_evidence: bool,
    pub resting_baseline_min_days: usize,
    pub hrv_min_rr_intervals_to_compute: usize,
    pub hrv_baseline_min_days: usize,
    pub sleep_need_minutes: f64,
    pub low_motion_threshold_0_to_1: f64,
    pub disturbance_motion_threshold_0_to_1: f64,
    pub target_midpoint_minutes_since_midnight: f64,
    // ... 6 more fields
}
```

**Default impls** [VERIFIED: codebase]
- `SleepFeatureScoreOptions::default()` at line 242: `sleep_need_minutes: 480.0` — **must change to 450.0 (26–64 default)**
- `RecoveryFeatureScoreOptions::default()` at line 263: `sleep_need_minutes: 480.0` — **must change to 450.0**

**How sleep_need_minutes is consumed** [VERIFIED: codebase]
- `metric_features.rs:2258`: guard `if options.sleep_need_minutes <= 0.0 || !options.sleep_need_minutes.is_finite()` → pushes `"sleep_need_minutes_invalid"` issue
- `metric_features.rs:2290`: passed into `SleepWindowFeature` as `sleep_need_minutes`
- `metric_features.rs:2394`: same for recovery report
- The value flows into the sleep performance fraction calculation

**CONTEXT.md says to add `age_years: Option<u8>` to the options structs.** This field will be carried through so the score bridge can read it and call `compute_sleep_need_from_store` if `sleep_need_minutes` was not explicitly provided by the caller. The field itself is `#[serde(default)]`-compatible with `Option<u8>`.

---

### 2. Existing EWMA Implementation [VERIFIED: codebase]

**Location:** `Rust/core/src/baselines.rs`

```rust
/// EWMA alpha (14-night half-life: 1 - 0.5^(1/14) ≈ 0.0483).
pub const ALPHA: f64 = 0.0483;

pub struct EwmaState {
    pub mean: f64,
    pub variance: f64,
    pub night_count: usize,
}

impl EwmaState {
    pub fn fold(&mut self, x: f64) {
        if self.night_count == 0 {
            self.mean = x;
            self.variance = 0.0;
        } else {
            let old_mean = self.mean;
            self.mean = (1.0 - ALPHA) * old_mean + ALPHA * x;
            self.variance = (1.0 - ALPHA) * self.variance + ALPHA * (x - old_mean).powi(2);
        }
        self.night_count += 1;
    }
}
```

**Reuse pattern for sleep_need.rs:**

```rust
use crate::baselines::{ALPHA, EwmaState};

fn ewma_debt_minutes(history: &[f64], base_need: f64) -> f64 {
    if history.is_empty() {
        return 0.0;
    }
    let mut state = EwmaState::default();
    for &duration in history {
        state.fold(duration);
    }
    // debt = base_need - ewma_mean (positive means sleep-deprived)
    (base_need - state.mean).max(0.0)
}
```

The EWMA mean of recent sleep durations compared to the base_need gives the debt. The `EwmaState::fold()` function is already public. `ALPHA = 0.0483` is re-exported from `baselines`. **Do not re-implement the EWMA recurrence.**

---

### 3. Bridge Method 5-Location Pattern [VERIFIED: codebase]

The five locations for adding `sleep.compute_need`:

**Location 1: `bridge/mod.rs` BRIDGE_METHODS constant** (line ~183)

Insert alphabetically between `"sleep.add_correction_label"` and `"sleep.import_external_history"`:

```rust
"sleep.add_correction_label",
"sleep.compute_need",       // INSERT HERE
"sleep.import_external_history",
```

**Verified sort position:**
```
sleep.add_correction_label
sleep.compute_need           ← correct alphabetical position
sleep.import_external_history
sleep.list_correction_labels
sleep.validate_stage_labels
...
```

**Location 2: `bridge/sleep.rs` dispatcher** — add arm in `dispatch_sleep()`:

```rust
"sleep.compute_need" => request_args::<SleepComputeNeedArgs>(request)
    .and_then(sleep_compute_need_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

**Location 3: `bridge/sleep.rs` Args struct:**

```rust
#[derive(Debug, Clone, Deserialize)]
struct SleepComputeNeedArgs {
    database_path: String,
    #[serde(default)]
    age_years: Option<u8>,
    #[serde(default)]
    prior_strain: Option<f64>,
}
```

**Location 4: `bridge/sleep.rs` bridge function:**

```rust
fn sleep_compute_need_bridge(args: SleepComputeNeedArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let history = fetch_last_5_sleep_durations(&store)?;
    let result = compute_sleep_need(args.age_years, &history, args.prior_strain);
    Ok(serde_json::json!({
        "schema": "goose.sleep-need-result.v1",
        "base_need_minutes": result.base_need_minutes,
        "debt_adjustment_minutes": result.debt_adjustment_minutes,
        "strain_adjustment_minutes": result.strain_adjustment_minutes,
        "total_need_minutes": result.total_need_minutes,
    }))
}
```

**Location 5: `sleep_need.rs` algorithm function** (new file, imported by `bridge/sleep.rs`):

```rust
pub fn compute_sleep_need(
    age_years: Option<u8>,
    history: &[f64],       // sleep_duration_minutes for last ≤5 nights, oldest-first
    prior_strain: Option<f64>,
) -> SleepNeedResult { ... }
```

**Key constraint:** `serde_json::json!` must be **fully qualified** in bridge/sleep.rs (the file already imports `use serde_json::json;` at the top — confirmed at line 31 of the file). The existing pattern uses bare `json!` throughout bridge/sleep.rs which is consistent.

---

### 4. All 5 Hardcoded 480.0 Occurrences and Actions [VERIFIED: codebase]

| File | Line | Context | Action |
|------|------|---------|--------|
| `metric_features.rs` | 247 | `Default for SleepFeatureScoreOptions { sleep_need_minutes: 480.0 }` | **Change to 450.0** (26–64 bracket default per D-03) |
| `metric_features.rs` | 263 | `Default for RecoveryFeatureScoreOptions { sleep_need_minutes: 480.0 }` | **Change to 450.0** |
| `bridge/metrics.rs` | 3243 | `sleep_need_minutes: args.sleep_need_minutes.unwrap_or(480.0)` | **Replace with dynamic compute** — see wiring strategy below |
| `bridge/metrics.rs` | 3341 | `sleep_need_minutes: args.sleep_need_minutes.unwrap_or(480.0)` | **Replace with dynamic compute** — see wiring strategy below |
| `perf_budget.rs` | 677 | `sleep_need_minutes: 480.0` inside `SleepInput` for perf benchmark | **Keep as literal** (D-01 Claude's Discretion) |

**Wiring strategy for bridge/metrics.rs:3243 and 3341:**

Add `age_years: Option<u8>` to `SleepFeatureScoreArgs` (line ~1083) and `RecoveryFeatureScoreArgs` (line ~1114). Then replace the unwrap_or:

```rust
// Before:
sleep_need_minutes: args.sleep_need_minutes.unwrap_or(480.0),

// After:
sleep_need_minutes: args.sleep_need_minutes.unwrap_or_else(|| {
    let history = fetch_last_5_sleep_durations(&store).unwrap_or_default();
    compute_sleep_need(args.age_years, &history, None).total_need_minutes
}),
```

`fetch_last_5_sleep_durations` is a helper that will be defined in `bridge/sleep.rs` and made `pub(crate)`, or alternatively duplicated in bridge/metrics.rs. Given bridge/metrics.rs imports from crate modules, the cleanest approach is to export `compute_sleep_need` from `sleep_need.rs` and add a private helper in each bridge file, or put the helper in a shared utility in bridge/mod.rs. The simplest option: define `pub(crate) fn compute_sleep_need_for_store(store: &GooseStore, age_years: Option<u8>, prior_strain: Option<f64>) -> f64` in `bridge/sleep.rs` that wraps both the SQL fetch and the pure computation, returning `total_need_minutes`. Then bridge/metrics.rs can call it after importing from the sibling module via `super::sleep::compute_sleep_need_for_store`.

Actually, since both bridge/sleep.rs and bridge/metrics.rs are sibling modules under `bridge/`, they cannot directly import from each other via `super::sleep::`. The correct approach is to put the helper in the `sleep_need` crate module itself:

```rust
// sleep_need.rs — public helper that takes a store reference
pub fn compute_sleep_need_with_store(
    store: &GooseStore,
    age_years: Option<u8>,
    prior_strain: Option<f64>,
) -> GooseResult<SleepNeedResult> {
    let history = fetch_last_5_sleep_durations_from_store(store)?;
    Ok(compute_sleep_need(age_years, &history, prior_strain))
}
```

Both `bridge/sleep.rs` and `bridge/metrics.rs` import `sleep_need::compute_sleep_need_with_store` from the crate root.

---

### 5. Self-Querying Pattern: Fetching Last 5 Sleep Sessions from SQLite [VERIFIED: codebase]

**Available store method:** `store.external_sleep_sessions_between(0, i64::MAX)` returns all external sleep sessions as `Vec<ExternalSleepSessionRow>` [VERIFIED: `store/sleep.rs:113`].

`ExternalSleepSessionRow` has `duration_ms: i64` and `end_time_unix_ms: i64`. [VERIFIED: `store/mod.rs:832`]

**Pattern for fetching last 5 non-nap completed sessions:**

```rust
fn fetch_last_5_sleep_durations_from_store(store: &GooseStore) -> GooseResult<Vec<f64>> {
    let all_sessions = store.external_sleep_sessions_between(0, i64::MAX)?;
    let mut sessions_with_duration: Vec<(i64, f64)> = all_sessions
        .into_iter()
        .filter_map(|session| {
            let duration_min = session.duration_ms as f64 / 60_000.0;
            // Minimum viable sleep: 60 minutes (nap guard — mirrors existing nap logic)
            if duration_min < 60.0 { return None; }
            Some((session.end_time_unix_ms, duration_min))
        })
        .collect();
    sessions_with_duration.sort_by_key(|(end_ms, _)| *end_ms);
    let n = sessions_with_duration.len().min(5);
    let last_5 = sessions_with_duration
        .into_iter()
        .rev()
        .take(n)
        .map(|(_, duration)| duration)
        .rev()  // restore chronological order for EWMA fold
        .collect();
    Ok(last_5)
}
```

**Note:** The existing `external_sleep_history_nights_for_sleep_v1` function in `bridge/metrics.rs` uses a 60-minute guard for nap detection. The nap threshold for `sleep_need` should be consistent — use `duration_min < 60.0` as the exclusion rule.

**Cold-start behavior:** If `external_sleep_sessions` is empty (no history imported), the history `Vec` is empty, `debt_adjustment_minutes = 0.0`, and `total_need_minutes = base_need_minutes + strain_adjustment_minutes`. This is correct per D-03.

---

### 6. Test Patterns in Rust/core/tests/ [VERIFIED: codebase]

**Inline unit tests (preferred for pure algorithm modules):**
Located in `#[cfg(test)] mod tests { ... }` blocks at the bottom of source files. `baselines.rs` is the canonical example — it has ~15 inline tests covering cold-start, EWMA recurrence, and variance.

**Pattern for sleep_need.rs inline tests:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn age_bracket_18_25_returns_480_minutes() {
        let result = compute_sleep_need(Some(22), &[], None);
        assert_eq!(result.base_need_minutes, 480.0);
        assert_eq!(result.debt_adjustment_minutes, 0.0);
        assert_eq!(result.strain_adjustment_minutes, 0.0);
        assert_eq!(result.total_need_minutes, 480.0);
    }

    #[test]
    fn age_bracket_none_returns_450_minutes() {
        let result = compute_sleep_need(None, &[], None);
        assert_eq!(result.base_need_minutes, 450.0);
    }

    #[test]
    fn age_bracket_65_plus_returns_420_minutes() {
        let result = compute_sleep_need(Some(70), &[], None);
        assert_eq!(result.base_need_minutes, 420.0);
    }

    #[test]
    fn strain_above_15_adds_15_minutes() {
        let result = compute_sleep_need(None, &[], Some(16.0));
        assert_eq!(result.strain_adjustment_minutes, 15.0);
    }

    #[test]
    fn strain_above_10_adds_6_minutes() {
        let result = compute_sleep_need(None, &[], Some(12.0));
        assert_eq!(result.strain_adjustment_minutes, 6.0);
    }

    #[test]
    fn cold_start_no_history_zero_debt() {
        let result = compute_sleep_need(None, &[], None);
        assert_eq!(result.debt_adjustment_minutes, 0.0);
    }

    #[test]
    fn ewma_debt_positive_when_sleep_short() {
        // 5 nights of only 360 min vs 450 base need
        let history = vec![360.0; 5];
        let result = compute_sleep_need(None, &history, None);
        assert!(result.debt_adjustment_minutes > 0.0,
            "expected debt when consistently undersleeping");
    }

    #[test]
    fn ewma_debt_zero_when_sleep_adequate() {
        // 5 nights of 450+ min
        let history = vec![450.0, 460.0, 455.0, 470.0, 450.0];
        let result = compute_sleep_need(None, &history, None);
        assert_eq!(result.debt_adjustment_minutes, 0.0);
    }
}
```

**Integration bridge tests pattern** (in `tests/bridge_tests.rs`):

```rust
#[test]
fn sleep_compute_need_returns_default_age_bracket() {
    let tempdir = tempfile::tempdir().unwrap();
    let db_path = tempdir.path().join("goose.sqlite").to_str().unwrap().to_string();
    let response = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "sleep-need-1",
        "method": "sleep.compute_need",
        "args": { "database_path": db_path }
    }));
    assert!(response.ok, "{:?}", response.error);
    let result = response.result.unwrap();
    assert_eq!(result["base_need_minutes"], 450.0); // None age → 26-64 bracket
    assert_eq!(result["debt_adjustment_minutes"], 0.0); // no history
    assert_eq!(result["strain_adjustment_minutes"], 0.0);
    assert_eq!(result["total_need_minutes"], 450.0);
}
```

---

### 7. bridge_methods_constant_matches_dispatcher Test [VERIFIED: codebase]

**Location:** `bridge/mod.rs` lines 1085–1200 (inline `#[cfg(test)] mod tests`).

**What it checks:** Set-equality between `BRIDGE_METHODS` constant and all dispatch arms found by scanning `bridge/sleep.rs`, `bridge/metrics.rs`, `bridge/capture.rs`, `bridge/activity.rs`, `bridge/capabilities.rs`, `bridge/debug.rs`. It uses `include_str!` at compile time.

**Two-part enforcement:**
1. `bridge_methods_constant_matches_dispatcher` — set equality; will fail if `sleep.compute_need` is in `BRIDGE_METHODS` but has no arm in `bridge/sleep.rs`, or vice versa.
2. `bridge_methods_constant_is_sorted_and_unique` — verifies alphabetical order and no duplicates in `BRIDGE_METHODS`.

**Constraint:** BOTH `BRIDGE_METHODS` insertion AND the dispatch arm in `bridge/sleep.rs` must be added in the same commit or the test suite fails. The pattern the scanner looks for is any line in a domain file that:
- Starts with `"` (after trim)
- Contains a `.` in the method name
- Ends with `=>` or `|` or is empty (multi-line arms)

The exact match line format must be:
```rust
        "sleep.compute_need" => request_args::<SleepComputeNeedArgs>(request)
```

---

## Standard Stack

No new external dependencies required. All dependencies are already in `Cargo.toml`:

| Used | Version | Purpose |
|------|---------|---------|
| `rusqlite` | 0.37 (bundled) | Store access via `GooseStore` |
| `serde` + `serde_json` | 1.0 | Args deserialization and JSON response |
| `crate::baselines` | local | `EwmaState`, `ALPHA` (EWMA engine) |
| `crate::store::GooseStore` | local | `external_sleep_sessions_between()` |

**No new Cargo.toml entries needed.**

---

## Architecture Patterns

### Recommended Project Structure

```
Rust/core/src/
├── sleep_need.rs          # NEW — pure algorithm: compute_sleep_need() + SleepNeedResult
├── bridge/
│   ├── mod.rs             # MODIFY — add "sleep.compute_need" to BRIDGE_METHODS
│   ├── sleep.rs           # MODIFY — add dispatch arm + Args struct + bridge fn + store helper
│   └── metrics.rs         # MODIFY — replace 2× unwrap_or(480.0), add age_years arg
├── metric_features.rs     # MODIFY — Default impls: 480.0 → 450.0 + add age_years field
└── lib.rs                 # MODIFY — add `pub mod sleep_need;`
```

### Pattern: Pure Algorithm + Bridge Wrapper

`sleep_need.rs` must be a pure Rust module with zero I/O and zero bridge imports. It receives pre-fetched data as function arguments. This keeps it testable without SQLite.

```rust
// sleep_need.rs
use crate::baselines::{ALPHA, EwmaState};
use crate::{GooseResult, store::GooseStore};

pub struct SleepNeedResult {
    pub base_need_minutes: f64,
    pub debt_adjustment_minutes: f64,
    pub strain_adjustment_minutes: f64,
    pub total_need_minutes: f64,
}

pub fn compute_sleep_need(
    age_years: Option<u8>,
    history: &[f64],
    prior_strain: Option<f64>,
) -> SleepNeedResult {
    let base = age_bracket_baseline(age_years);
    let debt = ewma_debt(history, base);
    let strain = strain_adjustment(prior_strain);
    SleepNeedResult {
        base_need_minutes: base,
        debt_adjustment_minutes: debt,
        strain_adjustment_minutes: strain,
        total_need_minutes: base + debt + strain,
    }
}

fn age_bracket_baseline(age_years: Option<u8>) -> f64 {
    match age_years {
        Some(a) if a <= 25 => 480.0,   // 18–25: 8h
        Some(a) if a >= 65 => 420.0,   // 65+: 7h
        _ => 450.0,                    // 26–64 and None: 7.5h
    }
}

fn ewma_debt(history: &[f64], base_need: f64) -> f64 {
    if history.is_empty() {
        return 0.0;
    }
    let mut state = EwmaState::default();
    for &d in history {
        state.fold(d);
    }
    (base_need - state.mean).max(0.0)
}

fn strain_adjustment(prior_strain: Option<f64>) -> f64 {
    match prior_strain {
        Some(s) if s >= 15.0 => 15.0,   // +0.25h
        Some(s) if s >= 10.0 => 6.0,    // +0.1h
        _ => 0.0,
    }
}

/// Store-level helper for bridge callers.
pub fn compute_sleep_need_with_store(
    store: &GooseStore,
    age_years: Option<u8>,
    prior_strain: Option<f64>,
) -> GooseResult<SleepNeedResult> {
    let history = last_5_sleep_durations(store)?;
    Ok(compute_sleep_need(age_years, &history, prior_strain))
}

fn last_5_sleep_durations(store: &GooseStore) -> GooseResult<Vec<f64>> {
    let mut sessions = store.external_sleep_sessions_between(0, i64::MAX)?;
    sessions.sort_by_key(|s| s.end_time_unix_ms);
    let durations: Vec<f64> = sessions
        .into_iter()
        .filter_map(|s| {
            let d = s.duration_ms as f64 / 60_000.0;
            if d >= 60.0 { Some(d) } else { None }
        })
        .rev()
        .take(5)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    Ok(durations)
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EWMA recurrence | Custom mean/variance loop | `crate::baselines::EwmaState::fold()` | Already verified at alpha=0.0483; variance tracking included for free |
| SQLite connection management | Manual rusqlite calls | `crate::bridge::acquire_bridge_conn()` | Handles migration, BRIDGE_MIGRATED_PATHS cache, path validation |
| JSON serialization | Manual string building | `serde_json::json!` macro | Consistent with all other bridge methods |

---

## Common Pitfalls

### Pitfall 1: BRIDGE_METHODS Sort Order Broken

**What goes wrong:** Adding `"sleep.compute_need"` in the wrong position (e.g., after `"sleep.import_external_history"`) causes `bridge_methods_constant_is_sorted_and_unique` to fail.

**How to avoid:** Verified insertion point is between `"sleep.add_correction_label"` and `"sleep.import_external_history"`. Double-check with `echo '...' | sort` after adding.

### Pitfall 2: Dispatch Arm Present but Missing from BRIDGE_METHODS (or vice versa)

**What goes wrong:** `bridge_methods_constant_matches_dispatcher` fails with "Methods in BRIDGE_METHODS with no dispatch arm" or "Dispatch arms not in BRIDGE_METHODS".

**How to avoid:** Always add both the BRIDGE_METHODS entry AND the dispatch arm in the same commit. The scanner reads `bridge/sleep.rs` at compile time via `include_str!`.

### Pitfall 3: EWMA fold() Receives History in Wrong Order

**What goes wrong:** If history is sorted newest-first, the EWMA gives more weight to the oldest nights (EWMA weights are exponentially decaying from left to right). Debt estimate will be wrong.

**How to avoid:** Pass history chronologically (oldest first). Sort by `end_time_unix_ms` ascending before folding. Confirmed: `EwmaState::fold()` processes the slice left-to-right, and the last element receives the most weight.

### Pitfall 4: perf_budget.rs 480.0 Accidentally Replaced

**What goes wrong:** Blanket search-and-replace of 480.0 also replaces the perf budget constant, coupling the perf test to the algorithm. This was explicitly noted in D-01 (Claude's Discretion).

**How to avoid:** Only touch the 4 target occurrences in metric_features.rs and bridge/metrics.rs. The perf_budget.rs line 677 stays as `480.0` literal.

### Pitfall 5: SleepFeatureScoreOptions is Copy, RecoveryFeatureScoreOptions is Clone

**What goes wrong:** `SleepFeatureScoreOptions` derives `Copy` — adding `age_years: Option<u8>` is fine (Option<u8> is Copy). But if a non-Copy type is accidentally added, the derive breaks.

**How to avoid:** `Option<u8>` is Copy. No issue. `RecoveryFeatureScoreOptions` derives `Clone` only (already has non-Copy fields like `Option<String>`).

### Pitfall 6: external_sleep_sessions_between(0, i64::MAX) with Mutex Lock

**What goes wrong:** `GooseStore::conn` is `Arc<Mutex<Connection>>`. Calling `store.external_sleep_sessions_between()` acquires the lock internally. If a bridge function has already locked the mutex earlier in the call chain, this can deadlock.

**How to avoid:** `acquire_bridge_conn` returns a fresh `GooseStore` with its own mutex (it opens the file fresh). The bridge function acquires the store once and then calls all store methods through that single instance — no nested lock acquisition. The pattern is already safe as used throughout all bridge files.

### Pitfall 7: age_years Boundary — 25 vs 26

**What goes wrong:** Using `a < 26` vs `a <= 25` matters at exactly age 25. Requirement says 18–25 bracket is 8h.

**How to avoid:** Match arm `Some(a) if a <= 25 => 480.0` is correct (ages 0–25 → 8h; age 26 → 7.5h). There's no lower bound guard needed (a child under 18 using this app defaults to 8h, which is reasonable).

---

## Runtime State Inventory

> Skipped — this is a greenfield algorithm phase. No rename, refactor, or migration involved. The 4 call sites changed are code edits only; no stored data carries the 480.0 constant.

---

## Environment Availability

```
cargo --version  → cargo 1.96.x (MSRV 1.96 required)
```

All Rust toolchain dependencies are present. No new external tools required. [ASSUMED — not verified in this session, but Rust toolchain is a project prerequisite]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Rust built-in test runner (`cargo test`) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cd Rust/core && cargo test --locked sleep_need 2>&1` |
| Full suite command | `cd Rust/core && cargo test --locked 2>&1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLP-NEED-01 | age bracket 18–25 → 480.0 min | unit | `cargo test --locked test_age_bracket_18_25` | ❌ Wave 0 |
| SLP-NEED-01 | age bracket 26–64 and None → 450.0 min | unit | `cargo test --locked test_age_bracket_none` | ❌ Wave 0 |
| SLP-NEED-01 | age bracket 65+ → 420.0 min | unit | `cargo test --locked test_age_bracket_65_plus` | ❌ Wave 0 |
| SLP-NEED-01 | EWMA alpha = 0.0483 applied | unit | `cargo test --locked test_ewma_debt` | ❌ Wave 0 |
| SLP-NEED-01 | cold-start (no history) → debt = 0 | unit | `cargo test --locked test_cold_start` | ❌ Wave 0 |
| SLP-NEED-01 | strain ≥15 → +15 min | unit | `cargo test --locked test_strain_high` | ❌ Wave 0 |
| SLP-NEED-01 | strain ≥10 → +6 min | unit | `cargo test --locked test_strain_mid` | ❌ Wave 0 |
| SLP-NEED-01 | strain <10 → +0 min | unit | `cargo test --locked test_strain_low` | ❌ Wave 0 |
| SLP-NEED-02 | bridge BRIDGE_METHODS/dispatcher consistent | unit | `cargo test --locked bridge_methods_constant_matches_dispatcher` | ✅ existing |
| SLP-NEED-02 | bridge BRIDGE_METHODS sorted | unit | `cargo test --locked bridge_methods_constant_is_sorted_and_unique` | ✅ existing |
| SLP-NEED-02 | sleep.compute_need bridge round-trip (empty db) | integration | `cargo test --locked sleep_compute_need_returns_default_age_bracket` | ❌ Wave 0 |
| SLP-NEED-02 | Default for SleepFeatureScoreOptions is now 450.0 | unit | `cargo test --locked sleep_feature_score_options_default` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd Rust/core && cargo test --locked sleep_need bridge_methods 2>&1`
- **Per wave merge:** `cd Rust/core && cargo test --locked 2>&1`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Inline `#[cfg(test)] mod tests` in `Rust/core/src/sleep_need.rs` — covers SLP-NEED-01 (all 8 unit tests above)
- [ ] Bridge round-trip test in `Rust/core/tests/bridge_tests.rs` — covers SLP-NEED-02 bridge registration

---

## Security Domain

> This phase has no external inputs, network calls, or authentication surfaces. The only new data path is reading `external_sleep_sessions.duration_ms` and `end_time_unix_ms` from SQLite, both of which are already stored by existing trusted ingestion paths.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (bridge args) | `age_years: Option<u8>` saturates u8 range; `prior_strain: Option<f64>` checked for NaN/Inf in algorithm logic |
| V6 Cryptography | no | No cryptographic operations |
| V2 Authentication | no | No new endpoints; bridge already authenticated by iOS process isolation |

**Threat:** `prior_strain = f64::NAN` or `f64::INFINITY` passed from Swift.
**Mitigation:** `strain_adjustment()` matches on `Some(s) if s >= 15.0` — NaN comparisons return false, falling through to `_ => 0.0`. Safe by default.

**Threat:** `duration_ms = i64::MIN` in a corrupted DB row.
**Mitigation:** `duration_ms as f64 / 60_000.0` → negative value → fails `< 60.0` guard → excluded from history. Safe.

---

## Open Questions

1. **How should `compute_sleep_need_with_store` be shared between bridge/sleep.rs and bridge/metrics.rs?**
   - What we know: both bridge files need it; bridge module siblings cannot import from each other directly.
   - What's unclear: whether to export from `sleep_need.rs` (crate root) or define a helper in bridge/mod.rs.
   - Recommendation: export from `sleep_need.rs`. Both `bridge/sleep.rs` and `bridge/metrics.rs` import via `use crate::sleep_need::compute_sleep_need_with_store;`. This is the pattern used for other shared algorithm functions.

2. **Should `age_years: Option<u8>` be added to `SleepFeatureScoreOptions` and `RecoveryFeatureScoreOptions` or only to the bridge Args structs?**
   - What we know: CONTEXT.md says "add `age_years: Option<u8>` field" to the options structs.
   - What's unclear: whether it's needed in the options struct or only in the Args struct.
   - Recommendation: Add to both Args structs (for deserialisation from Swift) and to the options structs (for potential direct Rust callers like `metric_features_tests.rs`). If added to options structs, it must also be plumbed through `Default` impl (default: `None`).

---

## Sources

### Primary (HIGH confidence)

- Codebase — `Rust/core/src/baselines.rs` — EWMA implementation, ALPHA constant, EwmaState::fold()
- Codebase — `Rust/core/src/bridge/sleep.rs` — dispatch_sleep() pattern, existing arms
- Codebase — `Rust/core/src/bridge/mod.rs` — BRIDGE_METHODS constant, dispatcher test
- Codebase — `Rust/core/src/bridge/metrics.rs` — SleepFeatureScoreArgs, RecoveryFeatureScoreArgs, unwrap_or(480.0) locations
- Codebase — `Rust/core/src/metric_features.rs` — struct signatures, Default impls, consumption
- Codebase — `Rust/core/src/store/mod.rs` — ExternalSleepSessionRow, GooseStore struct
- Codebase — `Rust/core/src/store/sleep.rs` — external_sleep_sessions_between()
- Codebase — `.planning/phases/114-harvard-sleep-need-model/114-CONTEXT.md` — locked decisions
- Codebase — `.planning/REQUIREMENTS.md` §Sleep Need Algorithm — algorithm parameters

### Secondary (MEDIUM confidence)

- Codebase — `Rust/core/tests/bridge_tests.rs` — bridge test patterns (tempfile + request() helper)
- Codebase — `Rust/core/tests/metric_features_tests.rs` — integration test patterns

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Rust toolchain (cargo 1.96) available in dev environment | Environment Availability | Phase cannot compile; low risk as it's a project prerequisite |
| A2 | `external_sleep_sessions` is the canonical store for "completed sleep sessions" for EWMA input | Research Area 5 | If another table is authoritative, the 5-night history would be empty; debt_adjustment would always be 0.0 |

**Notes on A2:** The CONTEXT.md says "Use `total_sleep_time_minutes` or equivalent from the sleep feature score report." The `external_sleep_sessions.duration_ms` is the best available field in the store. If the project stores full sleep feature score reports in `algorithm_runs.output_json`, those could also be queried, but parsing JSON from `algorithm_runs` is more complex. The `external_sleep_sessions` approach is simpler and consistent with how `external_sleep_history_nights_for_sleep_v1` works.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all crate internals verified directly
- Architecture: HIGH — all 5 locations confirmed with exact line numbers and code
- Pitfalls: HIGH — derived from direct code inspection of existing patterns and constraints

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (codebase-derived; stable until schema changes)
