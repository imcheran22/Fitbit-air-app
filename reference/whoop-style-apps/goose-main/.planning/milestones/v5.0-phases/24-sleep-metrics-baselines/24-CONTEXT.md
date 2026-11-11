# Phase 24: Sleep Metrics Without Staging + Baselines - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Two independent workstreams:

**ALG-SLP-01 — Sleep Metrics computation from HR data:**
- Fields already exist in `SleepInput` and `SleepScoreOutput` but are filled with placeholders in bridge.rs:
  - `sleep_latency_minutes: 0.0` (line 5153)
  - `wake_after_sleep_onset_minutes: awake_minutes` (rough proxy, line 5154)
  - `heart_rate_dip_percent: None` (line 5157)
  - `disturbance_count: 0` (lines 8612, 8845)
- Computation requires querying HR samples from `decoded_frames` during the sleep session window
- New Rust helper functions in `metrics.rs`:
  - `heart_rate_dip_pct(hr_series: &[f64], baseline_awake_hr: f64) -> Option<f64>`
  - `waso_from_hr(hr_series: &[(f64, f64)], resting_hr: f64, onset_ts: f64) -> f64` — timestamps + HR, threshold 1.05×resting_hr
  - `sol_from_hr(hr_series: &[(f64, f64)], resting_hr: f64, window_minutes: f64) -> Option<f64>` — first sustained low-HR period ≥ 3 min
- Bridge update: query HR from decoded_frames for sleep window, compute metrics before constructing `SleepInput`

**ALG-SLP-02 — `baselines.rs` EWMA module:**
- New file `Rust/core/src/baselines.rs` (add to lib.rs)
- `EwmaState` struct: `mean: f64, variance: f64, night_count: usize`
- `EwmaBaseline::fold_history(db: &GooseStore, device_id: &str) -> GooseResult<Self>` — reads `daily_recovery_metrics` rows ordered by date, reconstructs EWMA state
- Cold-start guard: return `None` for z-score when `night_count < 4`; baseline "inactive" (ready but not yet trusted) until `night_count >= 7`
- `EwmaBaseline::update(conn: &Connection, date_key: &str, hrv_rmssd: f64, rhr_bpm: f64) -> GooseResult<()>` — writes daily update, `BEGIN EXCLUSIVE` transaction, `WHERE last_updated_date < ?` guard
- Trust levels: `calibrating` (< 4), `provisional` (4–13), `trusted` (≥ 14) — exposed as `EwmaTrustLevel` enum
- Alpha: 0.10 (10-day memory constant)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- HR series extraction from `decoded_frames` for sleep window — use existing `get_recent_decoded_streams` pattern from bridge.rs
- `disturbance_count`: threshold crossings above `resting_hr * 1.05` after sleep onset (≥ 3 transitions)
- Gate on HR coverage: gate `heart_rate_dip_pct` computation on ≥ 50% HR coverage of sleep window
- WASO gate: only count epochs after first low-HR onset (SOL)
- `baselines.rs` does NOT require a new SQLite table — state is reconstructed from `daily_recovery_metrics` on each call
- Bridge methods: `"store.ewma_baseline_update"` and `"store.ewma_baseline_fold_history"`

</decisions>

<code_context>
## Existing Code Insights

### Key Locations
- `bridge.rs:5150-5157` — SleepInput construction with placeholder values (target for ALG-SLP-01)
- `bridge.rs:8612, 8845` — other SleepInput constructions with `disturbance_count: 0`
- `metrics.rs:56-76` — `SleepInput` struct (fields already exist)
- `metrics.rs:79-94` — `SleepScoreOutput` struct (fields already exist)  
- `store.rs` — `GooseStore` pattern for DB access
- `daily_recovery_metrics` table — used by `baselines.rs` to rebuild EWMA state

### Patterns
- HR extraction: `upload.get_recent_decoded_streams` in bridge.rs shows how to query decoded_frames
- Transaction: `conn.execute("BEGIN EXCLUSIVE", [])` pattern from store.rs
- Module declaration: add `pub mod baselines;` to `lib.rs`

</code_context>

<specifics>
## Specific Ideas

- For sleep SOL: "first 3 consecutive minutes" where all HR samples ≤ resting_hr × 1.05
- For WASO: "wake epochs after SOL" = time where HR > resting_hr × 1.05, only counted after SOL
- For HR dip: `(mean_awake_hr_pre_sleep - min_5min_rolling_sleep_hr) / mean_awake_hr_pre_sleep × 100`
- EWMA alpha = 0.1: `μ_new = 0.9 × μ_old + 0.1 × x_new`
- Variance (for z-score): running: `σ²_new = 0.9 × σ²_old + 0.1 × (x_new - μ_old)²`

</specifics>

<deferred>
## Deferred Ideas

- Full `rem_latency_minutes` from staging segments (requires sleep staging — Phase 26)
- Per-session HR coverage display in Sleep V2 dashboard UI
- Advanced WASO detection using motion from IMU gravity table (Phase 26)

</deferred>
