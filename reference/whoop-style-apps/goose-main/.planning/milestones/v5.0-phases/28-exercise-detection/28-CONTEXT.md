# Phase 28: Exercise Detection - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Retroactive workout session detection from 1 Hz HR + gravity streams. A session is detected when HR > (RHR + 30 bpm margin) AND rolling-mean gravity activity magnitude > 0.01 g/sample, sustained for >= 10 min. Adjacent sessions separated by < 60 s are merged. Per-session metrics: avg_hr, peak_hr, duration_s, strain (via goose_strain_v1), calories_kcal (Keytel active + H-B resting split on 30% HRR), zone_time_pct (Edwards 5-zone). Results persisted in `exercise_sessions` table (schema v17) and exposed via bridge methods.

Source: `my-whoop/server/ingest/app/analysis/exercise.py`.

</domain>

<decisions>
## Implementation Decisions

### Exercise Detection Algorithm
- New module `Rust/core/src/exercise_detection.rs` — isolates detection logic, fully testable
- Use `GravityRow` from store.rs directly — no new abstraction
- Rolling mean smoothing in 3s window (`MOTION_SMOOTH_S = 3`) before threshold gate — consistent with exercise.py
- Alignment tolerance ±5s (`ALIGN_TOLERANCE_S = 5.0`) as named constant — fixed (not configurable)

### Calorie & Strain Wiring
- Reutilizar `goose_strain_v1` via `StrainInput` — call the existing bridge function, avoid duplication
- Calories: active EE via Keytel (HR > 30% HRR threshold) + resting EE via Harris-Benedict — split as in Phase 23
- RHR fallback: 10th percentile of day's HR values (`rhr_source: "daily_p10"`) when no sleep session available — consistent with exercise.py `RESTING_PERCENTILE=10`

### Schema & Bridge Design
- Schema migration v17 (current v16 from Phase 27)
- `zone_time_pct_json: TEXT` column — serialised BTreeMap<u8, f64> — consistent with ROADMAP SC and easy Swift-side parsing
- Bridge methods: `exercise.detect_sessions` + `exercise.sessions_between`
- `insert_exercise_session` + `exercise_sessions_between` store methods

### Claude's Discretion
- Constants: `MIN_EXERCISE_MIN=10`, `MERGE_GAP_S=60`, `HR_MARGIN_BPM=30`, `MOTION_THRESHOLD=0.01`, `MIN_INTENSITY_Z2PLUS=0.50`
- Module structure within exercise_detection.rs
- Internal representation of aligned HR+gravity pairs

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GravityRow` in `store.rs` — existing struct with (device_id, ts, x, y, z) fields
- `gravity_rows_between(device_id, start_ts, end_ts)` in store.rs — query existing gravity data
- `goose_strain_v1(input: &StrainInput)` in metrics.rs — existing strain computation with Edwards zones
- `StrainInput` struct in metrics.rs:415 — carries hr_samples, profile_age, profile_sex, etc.
- `StrainScoreOutput` in metrics.rs — carries zone_time_pct, strain_score, calories fields
- `CURRENT_SCHEMA_VERSION = 16` in store.rs:14 → bump to 17
- Migration pattern from store.rs:943 — gravity table (v15) and V24 tables (v16) as models
- `immediate_transaction` for atomic inserts

### Established Patterns
- Bridge dispatch: `"exercise.detect_sessions" =>` arm in handle_bridge_request (bridge.rs:2178)
- Insert+query roundtrip pattern from v24_biometric_tests.rs
- `INSERT OR IGNORE` + `UNIQUE(device_id, start_ts)` for idempotent inserts
- `rhr_source` ∈ {"sleep_session", "daily_p10", "profile_override"} — as per ROADMAP SC

### Integration Points
- `bridge.rs:2113 handle_bridge_request()` — add exercise.detect_sessions + exercise.sessions_between
- `store.rs:943` migration block — add v17 exercise_sessions table
- New module: `src/exercise_detection.rs` + declare in `src/lib.rs`
- Tests: `tests/exercise_detection_tests.rs`

</code_context>

<specifics>
## Specific Ideas

- Detection algorithm ports from exercise.py — preserve exact parameter names as Rust constants
- `detect_exercise_sessions(hr: &[HrSample], gravity: &[GravityRow], profile: &ExerciseProfile) -> Vec<ExerciseSession>`
- `HrSample { ts: f64, bpm: u8 }` (matches existing hr_samples JSON format)
- `ExerciseProfile { resting_hr: Option<f64>, max_hr: Option<f64>, age: Option<u8>, sex: Option<String>, weight_kg: Option<f64>, height_cm: Option<f64> }`
- `ExerciseSession { device_id, start_ts, end_ts, duration_s, avg_hr, peak_hr, strain, calories_kcal, zone_time_pct, hrmax, hrmax_source, rhr_source, avg_hrr_pct }`

</specifics>

<deferred>
## Deferred Ideas

- Apple Health integration for workout export — out of scope
- Real-time detection (process during capture) — retroactive only per spec
- Sport classification (running vs cycling) — not in EX-01 to EX-04

</deferred>
