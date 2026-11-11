---
phase: 25-recovery-score-v1
plan: 01
subsystem: algorithm
tags: [rust, ewma, recovery-score, z-score, logistic-squash, baselines, bridge]

# Dependency graph
requires:
  - phase: 24-sleep-metrics-baselines
    provides: EwmaBaseline, EwmaState, EwmaTrustLevel, EwmaBaseline::fold_history, store.ewma_baseline_update
provides:
  - ColourBand enum (Vermelho/Amarelo/Verde) with from_score and as_str in metrics.rs
  - RecoveryV1Input and RecoveryV1Output structs in metrics.rs
  - goose_recovery_v1 pure function: Z-score + logistic squash personal recovery score
  - metrics.goose_recovery_v1 bridge method: store-backed, Swift-callable
affects: [25-recovery-score-v1/25-02, swift-healthdatastore-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function receives EwmaBaseline as parameter (bridge reconstructs via fold_history); enables unit testing without SQLite"
    - "Sign-flip for RHR in combined Z: negative z_rhr contribution improves score when RHR < baseline mean"
    - "Population mean fallback for colour band during cold-start: UI always sees a band even when score is None"

key-files:
  created: []
  modified:
    - Rust/core/src/metrics.rs
    - Rust/core/src/bridge.rs

key-decisions:
  - "goose_recovery_v1 takes EwmaBaseline as a parameter (not GooseStore) to remain unit-testable without a database"
  - "Combined Z weights: 0.7 * z_hrv - 0.3 * z_rhr — z_rhr sign-flipped so lower RHR yields positive contribution"
  - "When z_rhr is None (RHR baseline not seeded), fall back to z_hrv alone rather than blocking the score"
  - "During Calibrating cold-start: score is None but colour_band defaults to Amarelo (population mean 58.0)"
  - "serde_json::to_value error mapped to GooseError::message (serde_json::Error has no From<> impl for GooseError)"

patterns-established:
  - "Recovery V1 bridge pattern: open_bridge_store → fold_history → pure fn → serde_json::to_value with map_err"

requirements-completed: [ALG-REC-01, ALG-REC-02]

# Metrics
duration: 12min
completed: 2026-06-08
---

# Phase 25 Plan 01: Recovery Score V1 Summary

**Personal-baseline recovery score with EWMA Z-score + logistic squash: goose_recovery_v1 function, ColourBand PT-PT enum, and metrics.goose_recovery_v1 bridge method backed by EwmaBaseline::fold_history**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-08T10:11:57Z
- **Completed:** 2026-06-08T10:23:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented `goose_recovery_v1` pure Rust function: Z-score composite (0.7 * z_hrv - 0.3 * z_rhr) with logistic squash yielding ≈57.9% when combined Z=0
- Added `ColourBand` enum (Verde ≥67, Amarelo 34–66, Vermelho <34) with PT-PT names and `from_score` factory
- Added cold-start gate: score is None when HRV baseline < 4 nights; colour band falls back to Amarelo (population mean 58.0) so calibrating UI shows a band
- Wired `metrics.goose_recovery_v1` bridge method: reconstructs EWMA baseline via `fold_history`, delegates to pure function, serialises output
- 14 tests total: 12 unit tests in metrics.rs (Z=0→58%, RHR sign flip, cold-start None, colour band boundaries, trust levels, z_rhr fallback) + 2 bridge round-trip tests; all green

## Task Commits

1. **Task 1: RecoveryV1Input/Output, ColourBand, goose_recovery_v1 in metrics.rs** - `ad8d87c` (feat)
2. **Task 2: metrics.goose_recovery_v1 store-backed bridge method in bridge.rs** - `47f20dc` (feat)

## Files Created/Modified

- `/Users/francisco/Documents/goose/Rust/core/src/metrics.rs` - Added GOOSE_RECOVERY_V1_ID/VERSION constants, ColourBand enum, RecoveryV1Input/RecoveryV1Output structs, goose_recovery_v1 function, 12 unit tests; added `baselines::EwmaBaseline` import
- `/Users/francisco/Documents/goose/Rust/core/src/bridge.rs` - Added RecoveryV1BridgeArgs, goose_recovery_v1_bridge handler, dispatch arm for "metrics.goose_recovery_v1", method registration, 2 bridge tests; updated metrics imports

## Decisions Made

- Pure function takes `EwmaBaseline` parameter, not `GooseStore` — keeps the function unit-testable without SQLite (mirrors goose_recovery_v0 pattern)
- Z weights 0.7/0.3 from CONTEXT.md "Claude's Discretion" decision; RHR sign-flipped (lower RHR = better)
- When `z_rhr` is None (RHR cold-start), combined Z collapses to `z_hrv` alone rather than returning None score
- `serde_json::to_value` error wrapped via `map_err` to `GooseError::message` — `serde_json::Error` has no `From<>` impl for `GooseError`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] serde_json::to_value ? operator compile error**
- **Found during:** Task 2 (bridge handler implementation)
- **Issue:** `serde_json::to_value(output)?` failed — `From<serde_json::Error>` not implemented for `GooseError`
- **Fix:** Replaced `?` with `.map_err(|e| GooseError::message(format!(...)))` — matches the pattern used in other bridge handlers (e.g., `timeline_from_decoded_frames_bridge`, `storage_check_bridge`)
- **Files modified:** `Rust/core/src/bridge.rs`
- **Verification:** `cargo test goose_recovery_v1` — 2 bridge tests pass
- **Committed in:** `47f20dc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 compile error)
**Impact on plan:** Fix was trivial and matched established codebase patterns. No scope creep.

## Issues Encountered

None beyond the serde_json compile error documented above.

## Known Stubs

None — `goose_recovery_v1` is fully functional: reads real EWMA baseline from the database, computes real Z-scores, returns real score. No placeholder data flows to any output field.

## Threat Flags

No new threat surface beyond what was assessed in the plan's threat model. The `metrics.goose_recovery_v1` bridge method follows the same store-backed pattern as `store.ewma_baseline_update` (T-25-02 accepted, same trust model). Numeric inputs are sanitised by `EwmaState::z_score` which applies `VARIANCE_FLOOR` (T-25-01 mitigated by Phase 24 implementation). No new network endpoints, auth paths, or schema changes introduced.

## Next Phase Readiness

- `goose_recovery_v1` and `metrics.goose_recovery_v1` are ready for Phase 25-02 (Swift integration: `HealthDataStore+Recovery.swift` and `RecoveryV2DashboardView` calibrating state)
- No blockers — `cargo test -p goose-core` is fully green

---
*Phase: 25-recovery-score-v1*
*Completed: 2026-06-08*
