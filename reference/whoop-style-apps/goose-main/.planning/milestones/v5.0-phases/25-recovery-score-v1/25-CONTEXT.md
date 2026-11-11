# Phase 25: Recovery Score v1 - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

**Rust (metrics.rs + bridge.rs):**
- New `RecoveryV1Input` struct: `{device_id, date_key, hrv_rmssd_ms, resting_hr_bpm, database_path}` — takes raw nightly metrics + DB path to reconstruct EWMA baseline
- `goose_recovery_v1(input: &RecoveryV1Input, store: &GooseStore)` — reads EWMA baseline via `EwmaBaseline::fold_history`, computes Z-scores, applies logistic squash
- `RecoveryV1Output` struct: `{score_0_to_100: Option<f64>, trust_level: EwmaTrustLevel, colour_band: ColourBand, z_hrv: Option<f64>, z_rhr: Option<f64>}`
- Bridge method `"metrics.goose_recovery_v1"`

**Swift (new file + existing view update):**
- `GooseSwift/HealthDataStore+Recovery.swift` — new extension calling `metrics.goose_recovery_v1`
- Update `RecoveryV2DashboardView` with "A calibrar" state when `trust_level == .calibrating` and colour band indicator

**Formulae (exact):**
- Logistic squash: `score = 100.0 / (1.0 + (-1.6 * (z + 0.20)).exp())`
- Z=0 → ≈ 58% (100 / (1 + exp(-0.32)) ≈ 57.9%)
- Z-score: `z = (value - mean) / (variance.sqrt().max(VARIANCE_FLOOR.sqrt()))` from EwmaState
- Combined Z: `z_combined = 0.7 * z_hrv - 0.3 * z_rhr` (positive HRV = better; lower RHR = better so sign flip)
- Cold-start gate: return `None` for score when `trust_level == Calibrating` (< 4 nights)

**Colour bands:**
- Verde: score ≥ 67
- Amarelo: 34 ≤ score < 67
- Vermelho: score < 34

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- `ColourBand` enum: `Vermelho`, `Amarelo`, `Verde` (PT-PT names)
- Z-score weights: 0.7 for HRV (higher = better), -0.3 for RHR (lower = better, sign flipped)
- `EwmaBaseline::fold_history` already exists in `baselines.rs` (Phase 24) — use directly
- Bridge method pattern: same as `store.ewma_baseline_update` from Phase 24
- Swift: `@Published var recoveryV1Result: RecoveryV1Result?` on `HealthDataStore`

</decisions>

<code_context>
## Existing Code Insights

### Key Locations
- `Rust/core/src/metrics.rs:2191` — `goose_recovery_v0` (pattern to follow)
- `Rust/core/src/metrics.rs:456` — `RecoveryScoreOutput` (pattern, not reusing)
- `Rust/core/src/baselines.rs` — `EwmaBaseline`, `EwmaTrustLevel`, `EwmaState` (Phase 24)
- `GooseSwift/HealthDataStore+Snapshots.swift` — existing recovery display pattern
- `GooseSwift/RecoveryDashboardViews.swift` or `HealthDashboardViews.swift` — RecoveryV2DashboardView location (need to find)

### Patterns
- `GOOSE_RECOVERY_V1_ID = "goose.recovery.v1"`, `GOOSE_RECOVERY_V1_VERSION = "0.1.0"`
- Bridge dispatch: request_args macro + handler fn pattern from bridge.rs

</code_context>

<specifics>
## Specific Ideas

- `score_0_to_100: Option<f64>` — None when calibrating (< 4 nights), avoids fabricated scores
- Trust level display in Swift: "A calibrar" for Calibrating, "Provisório" for Provisional, no label for Trusted
- Colour band: map to SwiftUI Color (verde=green, amarelo=orange, vermelho=red)

</specifics>

<deferred>
## Deferred Ideas

- Resp rate Z-score in combined Z (needs resp rate in baselines — deferred)
- Sleep score contribution to recovery — deferred
- Historical recovery score chart in dashboard — deferred

</deferred>
