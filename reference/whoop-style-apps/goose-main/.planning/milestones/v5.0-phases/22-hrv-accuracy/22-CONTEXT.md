# Phase 22: HRV Accuracy - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `goose_hrv_v0` in `Rust/core/src/metrics.rs` with:
1. BLE gap-aware RR segmentation (ALG-HRV-01)
2. Lipponen-Tarvainen ectopic beat filter (ALG-HRV-02)
3. Tiered SWS window selection (ALG-HRV-03)
4. Cross-validation gate documented as manual (ALG-HRV-04)

No UI changes. No Swift changes. Pure Rust algorithm improvement.

</domain>

<decisions>
## Implementation Decisions

### Gap Segmentation (ALG-HRV-01)
- Add `rr_timestamps_s: Option<Vec<f64>>` to `HrvInput` (additive, non-breaking)
- When `Some`: any gap > 3.0s between consecutive timestamps is a segment boundary
- RMSSD computation: compute successive differences only within each segment; cross-boundary diffs are excluded
- Segmentation happens in `goose_hrv_v0` using the timestamps if present (not in bridge)
- Fallback: when `rr_timestamps_s` is `None`, behave as today (all intervals treated as one segment)

### Ectopic Beat Filter (ALG-HRV-02)
- Lipponen-Tarvainen: rolling 5-beat local median as reference; reject interval if |interval - median| > 0.20 × median
- Application order: gap segmentation first → ectopic filter applied within each segment → RMSSD computed on clean segments
- New field `ectopic_filter_removal_fraction: f64` added to `HrvOutput` (additive)
- When no ectopic beats removed: `ectopic_filter_removal_fraction = 0.0`

### Tiered SWS Window (ALG-HRV-03)
- Add `stage_segments: Option<Vec<SleepStageSegment>>` to `HrvInput` (additive; `SleepStageSegment` already exists in `metrics.rs` at line ~200)
- When `Some`: apply 3-tier selection:
  - Tier 1: last "deep" stage segment ≥ 5 min → filter RR intervals to that window
  - Tier 2 (fallback): weighted mean approach — use all "deep" segments, weight by recency
  - Tier 3 (fallback): use full `rr_intervals_ms` as today
- When `None`: use full intervals (tier 3 behaviour)
- Expose `window_tier_used: u8` (1, 2, or 3) in `HrvOutput` as additive field

### Cross-validation Gate (ALG-HRV-04)
- Not automated — success criterion is a human gate
- Executor adds a code comment in `goose_hrv_v0` documenting the validation requirement
- Phase not considered "closed" until cross-validation results documented in SUMMARY.md
- Unit tests cover all algorithmic paths; the ≤ 1ms delta is a runtime validation

### Output Fields (new, additive)
- `ectopic_filter_removal_fraction: f64` — fraction of intervals removed by ectopic filter
- `window_tier_used: u8` — which SWS tier was applied (1, 2, or 3)

### Claude's Discretion
- Exact rolling median implementation (stack-allocated window of 5)
- Bridge update to pass `rr_timestamps_s` (defer to next phase if complex)
- Test naming and fixtures

</decisions>

<code_context>
## Existing Code Insights

### Key Locations
- `Rust/core/src/metrics.rs:25-31` — `HrvInput` struct (add `rr_timestamps_s`, `stage_segments`)
- `Rust/core/src/metrics.rs:34-45` — `HrvOutput` struct (add `ectopic_filter_removal_fraction`, `window_tier_used`)
- `Rust/core/src/metrics.rs:777-840` — `goose_hrv_v0` function (the main function to extend)
- `Rust/core/src/metrics.rs:~1880+` — `rmssd` function (helper to adapt or extend)
- `Rust/core/src/metrics.rs:~200` — `SleepStageSegment` struct (already exists, reuse)

### Current Algorithm
`goose_hrv_v0` currently: filter 300-2000ms → compute mean/rmssd/sdnn/pnn50. No ectopic filter, no gap awareness, no SWS window.

### Pattern: additive struct fields
Other fields in `HrvInput` use `#[serde(default)]` for backward compat — follow same pattern for new optional fields.

</code_context>

<specifics>
## Specific Ideas

- Rolling median of 5: `[a, b, c, d, e].sort() → middle element` — no heap needed
- `SleepStageSegment` has `stage_kind: String` and `start_time`/`end_time`; "deep" stage is `stage_kind == "deep"`
- Gap segmentation and ectopic filter can be implemented as free functions (not methods) for testability

</specifics>

<deferred>
## Deferred Ideas

- Bridge update to pass `rr_timestamps_s` (requires RR timestamp extraction from BLE frame timestamps) — deferred to post-22 or as a separate plan
- Frequency-domain HRV (LF/HF) — v6.0
- Automated cross-validation test against my-whoop Python output — deferred (requires real session data)

</deferred>
