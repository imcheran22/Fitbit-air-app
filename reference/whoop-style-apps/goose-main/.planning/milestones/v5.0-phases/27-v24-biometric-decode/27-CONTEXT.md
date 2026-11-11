# Phase 27: V24 Biometric Decode - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Decode all biometric sensor fields from V24 HISTORICAL_DATA packets (packet_k == 24 in type-47 frames): SpO2 red/IR, skin temperature raw, respiratory raw, signal quality, skin contact, PPG green/red-IR, and RR intervals. Store them in 4 new SQLite tables (migration v16) and expose via bridge methods. Add uncalibrated physical unit helpers for SpO2, skin temperature, and respiratory rate. This phase does NOT require full Welch spectral analysis or calibrated sensor fusion — raw values with quality_flag="uncalibrated" are the deliverable.

Source of truth for byte offsets: `my-whoop/re/verify_v24.py::decode_v24()` (762 real V24 records validated).

</domain>

<decisions>
## Implementation Decisions

### Protocol Struct Design
- Create a new `DataPacketBodySummary::V24History { ... }` variant — clean separation from `NormalHistory`, no breakage of existing parsing
- Include first gravity triplet (f32 @ data[33], data[37], data[41]) in V24History — already confirmed in verify_v24.py
- Include RR intervals (up to 4 × u16 @ data[16+2i], skip zeros) — needed for historical HRV pipeline
- Payloads shorter than expected: return `Ok` with `None` fields + warning string (consistent with existing codebase pattern)

### Unit Conversion & Quality Flags
- SpO2: store raw red/IR; quality_flag="uncalibrated" — full RoR (AC=MAD, DC=mean) is complex and deferred
- resp_rate_bpm: zero-crossing approach in [0.1–0.5 Hz] band — no FFT crate dependency; Welch can be added in Phase 31/33
- skin_temp_celsius: linear slope using raw≈930 → 33°C as reference, quality_flag="uncalibrated"
- All physical unit outputs MUST carry quality_flag="uncalibrated" — mandatory per spec

### Migration & Bridge Design
- Schema migration v16 (current = v15 from Phase 21 gravity table)
- `insert_v24_biometric_batch`: single BEGIN/COMMIT for all 4 tables — atomic insert for co-temporal samples
- Extend `biometric_streams_from_frames` in bridge.rs (already has empty `spo2`/`skin_temp` Vecs) — avoid duplication

### Claude's Discretion
- Exact naming of V24History fields (snake_case matching verify_v24.py field names is preferred)
- Whether to add a `V24History` arm in `data_packet_domain()` / `history_hr_marker_offset()` or leave as None
- Test data: synthetic 76-byte payload constructed to match verify_v24.py::decode_v24() output expectations

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataPacketBodySummary` enum in `protocol.rs:139` — add new `V24History` variant here
- `parse_data_packet_body_summary()` in `protocol.rs:533` — add `24 => { ... }` arm
- `biometric_streams_from_frames` in `bridge.rs:3152` — already has empty `spo2: Vec<>` and `skin_temp: Vec<>` to be populated
- `CURRENT_SCHEMA_VERSION: i64 = 15` in `store.rs:14` — bump to 16 for V24 tables
- Migration pattern in `store.rs:943` — follow `CREATE TABLE IF NOT EXISTS` + `UNIQUE(device_id, ts)` + index pattern from gravity table (v15)
- `I16SeriesSummary` struct with `full_samples: Option<Vec<i16>>` — for RR interval storage reference

### Established Patterns
- `matches!(packet_k, Some(10) | Some(21))` in `protocol.rs:510` — add `Some(24)` arm for body_hex exclusion
- `INSERT OR IGNORE` with `UNIQUE` constraint — existing pattern for idempotent inserts
- Warning vec return: `(Option<DataPacketBodySummary>, Vec<String>)` — existing parser return type
- Bridge method naming: `insert_*_batch` / `*_between(device_id, start_ts, end_ts)` — from Phase 21 gravity methods

### Integration Points
- `bridge.rs:2113 handle_bridge_request()` — new `"biometrics.insert_v24_batch"` / `"biometrics.v24_between"` dispatch arms
- `store.rs:943` migration block — add v16 CREATE TABLE statements for 4 new tables
- `protocol.rs:768 data_packet_domain()` — optional: map packet_k 24 to domain string
- `protocol.rs:536 parse_data_packet_body_summary()` — add `24 =>` arm calling new `parse_v24_body_summary()`

</code_context>

<specifics>
## Specific Ideas

- Byte offsets verified against `my-whoop/re/verify_v24.py::decode_v24()` — use these exactly:
  - `hr` @ data[14], `rr_count` @ data[15], `rr` @ data[16+2i] (i=0..min(rr_count,4), skip 0)
  - `ppg_green` u16 @ data[26], `ppg_red_ir` u16 @ data[28]
  - gravity: f32 @ data[33], data[37], data[41]
  - `skin_contact` u8 @ data[48]
  - `spo2_red` u16 @ data[61], `spo2_ir` u16 @ data[63]
  - `skin_temp_raw` u16 @ data[65], `ambient` u16 @ data[67]
  - `led1` u16 @ data[69], `led2` u16 @ data[71]
  - `resp_raw` u16 @ data[73], `sig_quality` u16 @ data[75]
- All 4 tables: `UNIQUE(device_id, ts)` constraint + `INSERT OR IGNORE` + index on `(device_id, ts)`
- Plausibility gates: SpO2 [70,100]%, skin_temp_celsius [25,40]°C, resp_raw [0,65535] — log warn on rejection, do NOT hard error

</specifics>

<deferred>
## Deferred Ideas

- Full SpO2 RoR windowed computation (AC = MAD-based) — deferred; raw + uncalibrated flag is sufficient
- Welch spectral resp_rate_bpm — deferred to Phase 31/33; zero-crossing is the interim approach
- gravity2 second triplet (data[49,53,57]) — deferred to Phase 31 (PROTO-02)
- skin_contact == 0 samples excluded from downstream HRV/sleep — gating is at the consumer level (Phase 26/22)

</deferred>
