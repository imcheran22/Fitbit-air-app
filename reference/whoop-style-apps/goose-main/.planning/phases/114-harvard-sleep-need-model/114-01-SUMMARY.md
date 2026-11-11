---
plan: "114-01"
phase: "114"
status: complete
requirement: SLP-NEED-01
commit: de61b49
---

# Plan 114-01: Harvard Sleep Need Algorithm Module

## What Was Done

Created `Rust/core/src/sleep_need.rs` (270 lines) implementing the Harvard sleep need model:

- `SleepNeedResult` struct with 4 breakdown fields: `base_need_minutes`, `debt_adjustment_minutes`, `strain_adjustment_minutes`, `total_need_minutes`
- `compute_sleep_need(age_years, history, prior_strain)` — pure algorithm, no I/O
- `compute_sleep_need_with_store(store, age_years, prior_strain)` — store-backed wrapper for bridge use
- Age brackets: 18-25 → 480.0, 26-64/None → 450.0 (D-03), 65+ → 420.0
- EWMA debt via `crate::baselines::EwmaState::fold()` with alpha 0.0483; cold-start → 0.0
- Strain: ≥15 → +15 min, ≥10 → +6 min, else 0; NaN-safe
- `last_5_sleep_durations` helper: queries `external_sleep_sessions_between(0, i64::MAX)`, filters ≥60 min (nap guard), takes last 5 by `end_time_unix_ms`
- Registered in `Rust/core/src/lib.rs` with `pub mod sleep_need;`
- 17 inline unit tests: cold start, all age brackets (18/25/26/65/None), strain thresholds (10/15/NaN), EWMA debt positive/zero, total=sum, store-backed cold start

## Test Results

```
test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 153 filtered out
```
