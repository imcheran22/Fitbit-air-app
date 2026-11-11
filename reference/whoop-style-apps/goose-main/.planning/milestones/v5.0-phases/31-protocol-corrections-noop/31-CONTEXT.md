# Phase 31: Protocol Corrections (noop) - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Auto-generated (pure infrastructure — all choices at Claude's discretion)

<domain>
## Phase Boundary

Three protocol-level corrections from tigercraft4/noop cross-verification:
1. Cole-Kripke weights corrected to exact noop/literature values (PROTO-01)
2. V24 gravity2 second triplet extracted and stored in gravity2_samples table (PROTO-02)
3. Sleep staging graceful degradation when resp stream is absent (PROTO-03)

All changes are in Rust core. No Swift changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure corrections.

**PROTO-01:** Replace existing Cole-Kripke weights in sleep_staging.rs with exact values: [106, 54, 58, 76, 230, 74, 67], scale=0.001, look-back 4 epochs, look-forward 2 epochs, sleep threshold < 1.0. Unit test asserts D-score for known activity sequence matches expected value.

**PROTO-02:** Extract gravity2 second triplet from V24 frames: gravity2_x (f32 @ data[49]), gravity2_y (f32 @ data[53]), gravity2_z (f32 @ data[57]). Store in gravity2_samples table (same schema as gravity). Bridge methods: insert_gravity2_batch + gravity2_samples_between.

**PROTO-03:** Sleep staging uses resp_raw window for RRV feature. When resp stream missing: RRV feature → None, classifier falls back to 3-class (wake/deep/light without REM). No hard error.

Migration: schema v19 (current = v18) for gravity2_samples table.
Update known_tables() and storage_check.rs.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- sleep_staging.rs: COLE_KRIPKE_SCALE_FACTOR constant, existing weight array — just replace values
- protocol.rs: V24History variant (Phase 27) — add gravity2_x/y/z fields here
- store.rs: gravity table (v15) + v24 biometric tables (v16) — gravity2 follows same pattern
- bridge.rs: insert_gravity_rows/gravity_rows_between — gravity2 mirrors exactly

</code_context>

<specifics>
## Specific Ideas

- PROTO-01: change weights array from current values to [106, 54, 58, 76, 230, 74, 67]; threshold from > 1.0 to < 1.0 (sleep = D_score < 1.0); window: 4 back + 2 forward (not symmetric)
- PROTO-02: V24History adds gravity2_x/y/z: Option<f32> fields at data[49,53,57]; gravity2_samples table with (device_id, ts, x, y, z, UNIQUE(device_id, ts))
- PROTO-03: In sleep_staging.rs, make resp_raw_window parameter Option<&[u16]>; when None, skip REM classification

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
