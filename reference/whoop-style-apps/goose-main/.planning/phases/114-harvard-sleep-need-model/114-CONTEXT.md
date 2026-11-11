# Phase 114: Harvard Sleep Need Model - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure Rust phase. Delivers:
1. `Rust/core/src/sleep_need.rs` — `compute_sleep_need()` algorithm (age-bracket baseline + EWMA debt + strain adjustment)
2. `sleep.compute_need` bridge method — self-querying, replaces 480.0 at all algorithm call sites
3. Replace hardcoded `480.0` in `SleepFeatureScoreOptions` and `RecoveryFeatureScoreOptions` defaults + `bridge/metrics.rs` unwrap_or fallbacks

Requirements in scope: SLP-NEED-01, SLP-NEED-02
Out of scope: SLP-NEED-03 (Sleep Need UI → Phase 120), any Swift changes

</domain>

<decisions>
## Implementation Decisions

### Bridge Data Ownership
- **D-01:** `sleep.compute_need` is self-querying. Bridge args: `{ database_path, age_years: Option<u8>, prior_strain: Option<f64> }`. The bridge fetches the last 5 nights of sleep duration from SQLite internally — Swift does not pre-fetch or pass history array.

### SleepNeedResult Shape
- **D-02:** Full breakdown exposed now so Phase 120 UI can consume components without another bridge change:
  ```rust
  pub struct SleepNeedResult {
      pub base_need_minutes: f64,       // from age bracket
      pub debt_adjustment_minutes: f64, // EWMA-based, positive = more needed
      pub strain_adjustment_minutes: f64, // +15 if strain≥15, +6 if strain≥10, else 0
      pub total_need_minutes: f64,      // sum of above
  }
  ```

### age_years Cold-Start
- **D-03:** When `age_years` is `None`, use the 26-64 bracket baseline (450 min / 7.5h). This is a deliberate visible change from the current hardcoded 480 — more accurate per algorithm.

### Claude's Discretion
- `perf_budget.rs:677` hardcoded `480.0` — **keep as literal**. That file is a performance budget test, not algorithm logic. Replacing it would couple the perf test to the algorithm.
- EWMA debt: query last 5 completed sleep sessions from SQLite (not necessarily calendar nights). Use `total_sleep_time_minutes` or equivalent from the sleep feature score report.
- cold-start (fewer than 5 nights available): EWMA over however many nights exist; debt_adjustment = 0.0 if no history.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Algorithm Parameters (locked)
- `.planning/REQUIREMENTS.md` §Sleep Need Algorithm — SLP-NEED-01, SLP-NEED-02 — age brackets, EWMA alpha 0.0483, strain thresholds, bridge method name

### Existing Code — Files to Modify
- `Rust/core/src/metric_features.rs` lines 149, 159 — `SleepFeatureScoreOptions`, `RecoveryFeatureScoreOptions` structs and Default impls (lines 242, 255, 247, 263 are the 480.0 defaults)
- `Rust/core/src/bridge/metrics.rs` lines 3243, 3341 — `unwrap_or(480.0)` to replace with bridge call result
- `Rust/core/src/bridge/sleep.rs` — where `sleep.compute_need` dispatcher arm goes
- `Rust/core/src/bridge/mod.rs` lines 183–190 — BRIDGE_METHODS constant (add `sleep.compute_need` alphabetically)
- `Rust/core/src/perf_budget.rs` line 677 — keep 480.0 as literal, do not replace

### Bridge Pattern
- `Rust/core/src/bridge/mod.rs` — BRIDGE_METHODS 5-location pattern (BRIDGE_METHODS + Args struct + dispatcher + impl fn + store fn)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SleepFeatureScoreOptions` (metric_features.rs:149): has `sleep_need_minutes: f64` field — replace default with `compute_sleep_need` result; also add `age_years: Option<u8>` field
- `RecoveryFeatureScoreOptions` (metric_features.rs:159): same `sleep_need_minutes` field — same treatment
- `bridge/sleep.rs`: existing dispatcher for sleep.* methods — add `sleep.compute_need` arm here
- `bridge/metrics.rs:3243, 3341`: `unwrap_or(480.0)` — these are the active call sites that pass sleep_need_minutes into options; replace with bridge call result or pass through from args

### Established Patterns
- Bridge method Args structs: `#[derive(Debug, Clone, Deserialize)]` with `database_path: String` + method-specific fields
- Store functions use `serde_json::json!` (fully qualified, not bare `json!`)
- All new Rust modules go in `Rust/core/src/`

### Integration Points
- `sleep_need.rs` → imported by `bridge/sleep.rs` implementation function
- `sleep.compute_need` bridge output → consumed by Swift in Phase 120 to display dynamic sleep need (not wired in Phase 114)
- `SleepFeatureScoreOptions.sleep_need_minutes` — used by `metric_features.rs:2221` and `5004` (sleep scoring functions)

</code_context>

<specifics>
## Specific Ideas

- `SleepNeedResult` with 4 fields: `base_need_minutes`, `debt_adjustment_minutes`, `strain_adjustment_minutes`, `total_need_minutes` — expose all breakdown components now for Phase 120 UI
- `sleep.compute_need` self-queries SQLite for last 5 sleep sessions; cold-start (fewer than 5) uses EWMA over available nights, debt=0 if none
- Age brackets: 18-25→480.0, 26-64→450.0, 65+→420.0; None→450.0 (26-64 default)
- Strain thresholds: ≥15→+15.0 min, ≥10→+6.0 min, else 0.0 (from REQUIREMENTS: +0.25h/+0.1h)
- EWMA alpha 0.0483 (matches existing recovery EWMA baseline alpha in codebase)

</specifics>

<deferred>
## Deferred Ideas

- Swift UI wiring of SleepNeedResult → Phase 120 (Sleep Need UI)
- User age input / Settings screen → Phase 120 or later
- HealthKit date-of-birth import for auto-filling age_years → future phase

</deferred>

---

*Phase: 114-Harvard Sleep Need Model*
*Context gathered: 2026-06-22*
