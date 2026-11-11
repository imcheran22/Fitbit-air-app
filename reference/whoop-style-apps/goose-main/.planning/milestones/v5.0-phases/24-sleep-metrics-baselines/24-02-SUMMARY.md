---
phase: 24-sleep-metrics-baselines
plan: 02
subsystem: algorithm
tags: [rust, ewma, baselines, hrv, resting-hr, sqlite, timescaledb, bridge]

# Dependency graph
requires:
  - phase: 23-strain-calories
    provides: existing GooseStore patterns, DailyRecoveryMetricRow, daily_recovery_metrics table

provides:
  - "baselines.rs EWMA engine (alpha=0.10) with EwmaState, EwmaBaseline, EwmaTrustLevel"
  - "fold_history reconstructs per-metric state from daily_recovery_metrics (no new table)"
  - "idempotent ewma_baseline_update under BEGIN EXCLUSIVE with date guard (T-24-04)"
  - "store.ewma_baseline_fold_history bridge method callable from Swift"
  - "store.ewma_baseline_update bridge method callable from Swift"

affects: [25-recovery-score, future phases reading EWMA baselines for z-score computation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "EWMA recurrence: mean_new = 0.9*mean_old + 0.1*x; variance_new = 0.9*var_old + 0.1*(x-mean_old)^2"
    - "Cold-start gate: z_score returns None when night_count < MIN_NIGHTS_SEED (4)"
    - "Baseline reconstruction from existing table: no new SQLite table, always fold from daily_recovery_metrics"
    - "BEGIN EXCLUSIVE transaction with date-key guard for idempotent daily updates (T-24-04)"
    - "Bridge args structs pattern: EwmaBaselineFoldHistoryArgs / EwmaBaselineUpdateArgs"

key-files:
  created:
    - "Rust/core/src/baselines.rs — EwmaState, EwmaBaseline, EwmaTrustLevel, fold_history, update (382 lines)"
  modified:
    - "Rust/core/src/lib.rs — pub mod baselines declaration added"
    - "Rust/core/src/store.rs — daily_recovery_metrics_all_ordered, ewma_baseline_update, ewma_baseline_update_inner"
    - "Rust/core/src/bridge.rs — EwmaBaselineFoldHistoryArgs, EwmaBaselineUpdateArgs, dispatch arms, bridge tests"

key-decisions:
  - "EWMA state is never persisted directly — always reconstructed via fold_history from daily_recovery_metrics (no new table, per 24-CONTEXT)"
  - "ewma_baseline_update inserts a local_estimate row so it appears in fold_history reconstruction"
  - "Date guard: if a row for date_key already exists (any values), second call returns skipped=true (T-24-04 idempotency)"
  - "Non-finite values (NaN/Inf) rejected at store layer before folding (T-24-05 mitigation)"
  - "Trust boundaries: Calibrating <4, Provisional 4-13, Trusted >=14; readiness flag at >=7 nights"

patterns-established:
  - "baselines module: pure EWMA logic in baselines.rs, DB access via GooseStore methods, bridge in bridge.rs"
  - "Store-backed EWMA tests use GooseStore::open_in_memory() + insert_daily_recovery_metric"

requirements-completed: [ALG-SLP-02]

# Metrics
duration: 45min
completed: 2026-06-08
---

# Phase 24 Plan 02: Sleep Metrics Baselines Summary

**EWMA baseline engine (alpha=0.10) in baselines.rs reconstructing per-metric HRV/RHR state from daily_recovery_metrics with cold-start gate, trust levels, and idempotent BEGIN EXCLUSIVE update — exposed via two bridge methods**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-08T08:27:00Z
- **Completed:** 2026-06-08T09:12:31Z
- **Tasks:** 3 (TDD: RED + GREEN phases for Tasks 1 and 2, plus bridge Task 3)
- **Files modified:** 4

## Accomplishments

- Created `Rust/core/src/baselines.rs` with EwmaState (fold, z_score, is_ready, trust_level), EwmaTrustLevel enum, and EwmaBaseline (fold_history from DB)
- Added GooseStore methods: `daily_recovery_metrics_all_ordered` (ordered read for fold) and `ewma_baseline_update` (BEGIN EXCLUSIVE idempotent upsert)
- Added two bridge methods (`store.ewma_baseline_fold_history`, `store.ewma_baseline_update`) with args structs, dispatch arms, and round-trip tests
- 25 baselines unit + store-backed tests green; 3 bridge round-trip tests green; `bridge_methods_constant_matches_dispatcher` guard passes

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: EWMA engine failing tests** - `6312d67` (test)
2. **Task 1 GREEN: baselines.rs EWMA engine + store methods** - `7ee81af` (feat)
3. **Task 2: store-backed fold_history + idempotent update** - `b568177` (feat)
4. **Task 3: bridge methods fold_history + update** - `30d14f5` (feat)

_TDD plan: RED commit followed by GREEN commit per task._

## Files Created/Modified

- `Rust/core/src/baselines.rs` (created) — EwmaState, EwmaBaseline, EwmaTrustLevel, 25 unit + store-backed tests
- `Rust/core/src/lib.rs` (modified) — `pub mod baselines;` declaration
- `Rust/core/src/store.rs` (modified) — `daily_recovery_metrics_all_ordered`, `ewma_baseline_update`, `ewma_baseline_update_inner`
- `Rust/core/src/bridge.rs` (modified) — args structs, dispatch arms, bridge tests, BRIDGE_METHODS const entries

## Decisions Made

- **No new SQLite table**: EWMA state is always reconstructed on-demand via `fold_history` reading `daily_recovery_metrics`. `ewma_baseline_update` writes a `local_estimate` row to that existing table so it becomes part of future fold_history calls. This satisfies the ALG-SLP-02 requirement and the 24-CONTEXT decision.
- **source_kind = `local_estimate`**: The `ewma_baseline_update_inner` raw INSERT uses `local_estimate` (a valid allowed value) rather than a custom `ewma_baseline` label which would fail downstream validation.
- **Date guard simplification**: Instead of a complex `WHERE last_updated_date < ?` SQL predicate, the guard checks whether a row for `date_key` already exists in `daily_recovery_metrics`. If yes, the second call returns `skipped=true` regardless of value difference (preventing double-update, T-24-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] source_kind validation: `ewma_baseline` is not a valid allowed value**
- **Found during:** Task 2 (store-backed fold_history tests)
- **Issue:** `ewma_baseline_update_inner` used `source_kind = 'ewma_baseline'` in raw INSERT; the validation layer in `insert_daily_recovery_metric` (used in tests) requires one of `device_counter, device_sensor, local_estimate, unavailable`
- **Fix:** Changed raw INSERT to use `local_estimate` as source_kind; changed test helper to use `local_estimate` via `insert_daily_recovery_metric`
- **Files modified:** `Rust/core/src/store.rs`, `Rust/core/src/baselines.rs`
- **Verification:** All 25 baselines tests pass
- **Committed in:** `b568177` (Task 2 commit)

**2. [Rule 1 - Bug] Unused `mut` warnings in z_score tests**
- **Found during:** Task 1 GREEN compilation
- **Issue:** Two test EwmaState bindings declared `mut` but never mutated
- **Fix:** Removed `mut` from both `let mut state` bindings in `test_z_score_magnitude_one_std_above_mean` and `test_z_score_negative_below_mean`
- **Files modified:** `Rust/core/src/baselines.rs`
- **Verification:** Compiler warnings resolved
- **Committed in:** `7ee81af` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 bug)
**Impact on plan:** Both fixes necessary for correctness and clean compilation. No scope creep.

## Issues Encountered

**Pre-existing integration test failure (out of scope):** `tests/metrics_tests.rs` imports `heart_rate_dip_pct`, `sol_from_hr`, `waso_from_hr`, `hr_disturbance_count` from `goose_core::metrics` — functions that are part of plan 24-01 (ALG-SLP-01) which is not yet implemented. This is a pre-existing failure unrelated to plan 24-02. Running `cargo test --lib` (lib tests only) is green. Logged to deferred-items.

## Known Stubs

None — all functionality is fully implemented. fold_history correctly reads real DB rows and the EWMA recurrence is mathematically verified by hand-computed tests.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced. The two new bridge methods access the existing SQLite database path passed as an argument (same pattern as all other bridge methods). T-24-04 and T-24-05 are mitigated as specified in the plan's threat model.

## Next Phase Readiness

- Phase 25 (Recovery Score v1) can now call `store.ewma_baseline_fold_history` to get per-metric baselines and use z_score for personalised HRV/RHR scoring
- The EWMA engine is ready: fold_history reconstructs full state in ~O(n) over nightly rows; z_score is None until 4 nights (cold-start), trust levels are exposed for UI

---
*Phase: 24-sleep-metrics-baselines*
*Completed: 2026-06-08*

## Self-Check: PASSED

- baselines.rs exists at Rust/core/src/baselines.rs
- 24-02-SUMMARY.md exists at .planning/phases/24-sleep-metrics-baselines/24-02-SUMMARY.md
- All 4 task commits found in git log: 6312d67, 7ee81af, b568177, 30d14f5
- 25 baselines unit+store tests passing; 3 bridge round-trip tests passing
- No new SQLite table (grep confirms only daily_recovery_metrics referenced in baselines.rs)
- Both bridge method names present in BRIDGE_METHODS const and dispatch table
