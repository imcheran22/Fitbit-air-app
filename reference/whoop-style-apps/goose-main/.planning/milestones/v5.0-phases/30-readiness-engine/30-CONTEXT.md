# Phase 30: Readiness Engine - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — all choices at Claude's discretion)

<domain>
## Phase Boundary

Daily readiness level (5-class: rundown/strained/balanced/primed/unknown) derived from ACWR (acute:chronic workload ratio) and Foster training monotony. Inputs: trailing 28 days of daily strain values. Outputs: ReadinessOutput with acwr, acwr_zone, monotony, readiness_level. Exposed as bridge method metrics.goose_readiness_v1. Pure Rust implementation in metrics.rs (or new readiness.rs module).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.
Follow the ROADMAP phase success criteria exactly:
- acwr = acute_load(7d mean) / chronic_load(28d mean); clamp [0, 3]; None when < 28 days data
- foster_monotony = mean/std of 7-day window; flag when >= 2.0; None when std=0 or < 3 days
- ReadinessOutput.level ∈ {rundown, strained, balanced, primed, unknown} per synthesis rules
- acwr_zone: < 0.8 = under-training, 0.8-1.3 = optimal, 1.3-1.5 = caution, >= 1.5 = danger
- Bridge method: metrics.goose_readiness_v1
- cargo test covering: ACWR zone boundaries, monotony flag at 2.0, rundown rule, primed rule, unknown when < 28 days

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- metrics.rs: goose_strain_v1, goose_recovery_v1 — pattern for algorithm functions
- AlgorithmRunResult<T> return type — use for readiness
- clamp_0_100 helper in metrics.rs

### Established Patterns
- Input/Output struct pattern (StrainInput/StrainScoreOutput, RecoveryV1Input/RecoveryScoreOutput)
- Bridge dispatch arm pattern from bridge.rs
- BRIDGE_METHODS sorted array registration

</code_context>

<specifics>
## Specific Ideas

- ReadinessInput { daily_strain: Vec<(f64, f64)> } — (date_ts, strain_score) pairs, trailing 28 days minimum
- ReadinessOutput { acwr: Option<f64>, acwr_zone: String, monotony: Option<f64>, monotony_high: bool, level: ReadinessLevel, insufficient_data: bool }
- ReadinessLevel enum: Rundown, Strained, Balanced, Primed, Unknown (serde snake_case)

</specifics>

<deferred>
## Deferred Ideas

- Dashboard UI for readiness display — deferred
- Recovery trend integration — out of scope for this phase

</deferred>
