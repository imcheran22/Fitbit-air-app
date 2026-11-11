# Domain Pitfalls — v15.0 Feature Set

**Domain:** WHOOP biometric platform (iOS Swift + Rust core + Android Kotlin)
**Researched:** 2026-06-21
**Scope:** Adding v20/v21/v26 protocol decode, Harvard sleep need, GET_FF_VALUE, body composition history, stealth mode, PIP realtime pipeline, ALG-HRV-04/SLP-04 real-device validation, HAP-04 wake window

---

## Summary

Eight feature areas in v15.0 each carry integration risks specific to this codebase. The highest-severity risks are: (1) the `BRIDGE_CONN_POOL` `OnceLock` binding only to the first `database_path` seen in a process — new tables that go through `checkout_bridge_conn` silently ignore migrations if the pool was already initialised without those tables; (2) the Coach context builder (`CoachLocalToolContext`) serialises every published health value into the LLM prompt — a stealth toggle stored only in Swift `UserDefaults` will not suppress values that are already in the context dict unless the filter is applied at the builder site; (3) v20/v21/v26 are packet_k values with no parse arm in `parse_data_packet_body_summary` — they currently fall through to the `Unknown` arm and emit `unhandled_packet_k_N` warnings, which means any Swift code that checks for warnings will surface errors on every frame until the arms are added.

---

## Critical Pitfalls

### Pitfall 1: `BRIDGE_CONN_POOL` OnceLock Binds to the First `database_path` — New Tables Never Created in the Pool's Connections

**What goes wrong:** `checkout_bridge_conn` uses a process-lifetime `OnceLock<Mutex<Option<BridgePool>>>`. The pool is initialised once from the first `database_path` argument received. Any new bridge method added for v15.0 (realtime_frames, body_composition_history) that calls `checkout_bridge_conn` will get a connection to the already-open SQLite file. If the schema migration that creates those tables runs via `GooseStore::open` before the pool is initialised (i.e., on the first bridge call), everything is fine. If, however, new Rust bridge methods are added that call `checkout_bridge_conn` but the table-creation DDL lives only in the `migrate()` path of `GooseStore`, then the tables exist. The actual risk is the inverse: if a developer writes a bridge method for a new table and routes it through `checkout_bridge_conn` but does *not* add the table DDL inside `migrate()`, the pool's connections will never see the new table — and the error will be a confusing "no such table" SQLite error at runtime, not a compile error.

**Why it happens:** `BRIDGE_CONN_POOL` calls `GooseStore::open` exactly once during `init_bridge_pool`, which runs `migrate()`. After that, `SqliteConnectionManager::file(database_path)` opens raw connections without going through migration. If any table is created outside `migrate()` (e.g., in an `ensure_*` helper that is called on a `GooseStore` instance but not added to the pool's migration path), pool-acquired connections won't have it.

**Warning signs:**
- `no such table: body_composition_history` (or `realtime_frames`) at runtime after launch.
- Bridge method succeeds in unit tests (which use `GooseStore::open` directly) but fails in the app.
- `ensure_*` helpers exist in `store/mod.rs` that create columns or tables but are called on the `GooseStore` instance, not wired into the pool's first-open path.

**Prevention:**
- All new table DDL for v15.0 must live inside `migrate()`, inside the versioned migration block, with `CURRENT_SCHEMA_VERSION` incremented (currently 23 — new tables need 24).
- Never use `CREATE TABLE IF NOT EXISTS` in an `ensure_*` helper for tables that bridge pool callers need; use it only for ADD COLUMN idempotency on existing tables.
- Add a Rust integration test that calls `checkout_bridge_conn` and immediately selects from the new table — this will catch the mismatch before a device run.

**Phase to address:** Any phase that adds `realtime_frames` or `body_composition_history` tables. Schema version must be 24 in `CURRENT_SCHEMA_VERSION` and in the migration block.

---

### Pitfall 2: Stealth State Leaks Into the Coach LLM Context Via `CoachLocalToolContext`

**What goes wrong:** `CoachLocalToolContext.build()` serialises scores (sleep, recovery, strain, stress), vitals snapshots, and status strings directly from `HealthDataStore` into the JSON tool context passed to every LLM provider. If stealth mode suppresses metric display in SwiftUI views but does not filter the values out of the `CoachLocalToolContext` dict, the LLM still receives the actual numeric values and will reason about them — effectively leaking the hidden metric to the user via the Coach's response.

**Why it happens:** The existing Coach context builder has no concept of "which metrics are hidden". It eagerly reads `healthStore.sleepFeatureScoreSummary()`, `.recoveryFeatureScoreSummary()`, etc. and places them in the `"scores"` dict unconditionally. A `UserDefaults` flag read only at SwiftUI render time has no effect on this path.

**Warning signs:**
- Coach says "your HRV is 42ms" after the user hid HRV in stealth settings.
- `CoachLocalToolContext.build()` is never touched during stealth implementation.
- Stealth toggle is implemented only in view modifier code (`.redacted(reason:)` or conditional `Text`).

**Prevention:**
- Define a `StealthMask` value type (a `Set<MetricKind>`) that is read from `UserDefaults` once at `@MainActor` level and passed into `CoachLocalToolContext.build()`.
- For each hidden metric, replace its value in the context dict with `NSNull()` or a sentinel string like `"hidden_by_user"` rather than omitting the key (omitting a key breaks LLM prompt expectations silently).
- Add a unit test: build context with all metrics stealthed; assert no numeric score values appear.

**Phase to address:** Stealth mode phase (feature #167). Must be addressed before Coach routes are exercised with stealth on.

---

### Pitfall 3: v20/v21/v26 Packet Arms Missing — `Unknown` Fallthrough Emits Noise and Loses Data

**What goes wrong:** `parse_data_packet_body_summary` in `protocol.rs` has explicit arms for packet_k values 7, 9, 12, 18, 17, 10, 21, and 24. Packet_k 20 is noted in `data_packet_domain()` as `"raw_or_research_counted"` and 25/26 as `"pulse_information_packet"`, but neither has a parse arm — they fall to the `Unknown` arm which emits `unhandled_packet_k_N` warnings and returns no structured data. The v20/v21 multi-channel arrays and v26 24 Hz PPG waveform will arrive from a real WHOOP 5.0, hit the `Unknown` arm, and generate a warning per frame. If `GooseBLEDataValidator` in Swift checks for unexpected warnings and surfaces them as capture errors, every optical frame will look like a parse failure.

**Why it happens:** Protocol decode was added incrementally; v20/v26 were deprioritised until real-device data was available. The `Unknown` arm is intentional for unknown packet types, but emitting `unhandled_packet_k_N` as a warning string means it is indistinguishable from a real parse error at the Swift layer, which checks for non-empty warning arrays.

**Warning signs:**
- Capture log fills with `unhandled_packet_k_20` / `unhandled_packet_k_26` during optical capture on WHOOP 5.
- Health packet capture shows 0 frames for optical families despite the band streaming data.
- `body_hex` is populated (raw data is present) but `domain` is nil in the parsed frame.

**Prevention:**
- Add parse arms for packet_k 20 and 26 in `parse_data_packet_body_summary` before enabling optical capture commands.
- For packet_k 20 (v20/v21 multi-channel): define a `DataPacketBodySummary::MultiChannelOptical` variant with a `Vec<Vec<u16>>` channel array and parse it from the payload. Add the persistence path in `CaptureStore` before enabling the stream command.
- For packet_k 26 (v26 PPG waveform): define `DataPacketBodySummary::PpgWaveform` with a `Vec<u16>` sample array. Persist as a new table (schema v24).
- Add a synthetic fixture test for each new variant before device validation.
- Update `data_packet_domain()` and `history_hr_marker_offset()` to cover 20 and 26 explicitly.

**Phase to address:** Feature #172 (type-47 v20/v21) and #173 (v26 PPG). Must be done before any optical capture is enabled.

---

## Moderate Pitfalls

### Pitfall 4: Harvard Sleep Need EWMA Cold Start — `MIN_NIGHTS_SEED` Threshold Mismatch

**What goes wrong:** The existing EWMA baseline engine (`baselines.rs`) gates mean output on `MIN_NIGHTS_SEED = 4` nights. The Harvard sleep need model accumulates debt across nights using an EWMA. If the Harvard model is implemented as a separate EWMA over `sleep_need_minutes` and uses its own cold-start threshold, it may diverge from the existing `EwmaTrustLevel` convention. The specific risk: age baseline (e.g., 8h for 18–25, 7.5h for 25–64) needs to be the seed value on night 0; if the seed defaults to the field default of `480.0` (`sleep_need_minutes` in `MetricFeaturesOptions`) regardless of age, the first 3 nights of debt computation will be wrong.

**Why it happens:** `MetricFeaturesOptions` already carries `sleep_need_minutes: 480.0` as a fixed constant. The Harvard model needs age to vary the baseline, but age is not currently in `MetricFeaturesOptions` or the EWMA state — it is a user profile field. Wiring a new age-dependent seed into the existing EWMA machinery requires touching `GooseStore`, `daily_recovery_metrics`, and the bridge.

**Warning signs:**
- Sleep need always shows 480 minutes regardless of user age.
- EWMA debt accumulates but is identical for a 20-year-old and a 60-year-old.
- `sleep_need_minutes` in bridge args is never overridden by an age-adjusted value.
- Cold start returns 0 debt for the first 3 nights (before `MIN_NIGHTS_SEED` is reached) rather than a neutral age baseline.

**Prevention:**
- Add `age_years: Option<u8>` to `MetricFeaturesOptions` (or a separate `HarvardSleepNeedOptions` struct).
- Implement `age_baseline_minutes(age: u8) -> f64` as a pure function with the Harvard age brackets; use it to initialise the EWMA seed on the first fold, not `480.0`.
- When `strain_0_to_21` is 0 (rest day), the debt should not be credited as a full recovery — add an explicit guard: if strain is 0, use resting baseline only.
- Test: feed 0 nights, assert output is `None`; feed 1 night at age 22, assert seed uses 8h bracket; feed strain=0, assert debt does not decrease.

**Phase to address:** Feature #164 (Harvard sleep need model).

---

### Pitfall 5: Body Composition SQLite Schema Migration — Version Must Increment and NULL Columns Must Be Handled

**What goes wrong:** `CURRENT_SCHEMA_VERSION` is currently 23. Adding a `body_composition_history` table requires incrementing to 24 and adding the DDL inside `migrate()`. There are two sub-risks:

1. **Version not incremented:** The schema validation in `GooseStore::open` checks `schema_version != CURRENT_SCHEMA_VERSION` and returns an error; if the new table is added to `migrate()` but `CURRENT_SCHEMA_VERSION` is not updated, the test `test_schema_version_is_current` will fail — but only if that test runs. If the developer adds the table outside `migrate()` (e.g., in a new `ensure_body_comp_columns` helper), the version stays at 23 and existing databases are never migrated.

2. **HealthKit race condition on weight:** `apple_daily` already stores `weight_kg REAL` (nullable). HealthKit weight samples can arrive via `HKObserverQuery` concurrently with a manual entry being saved by the user. If `body_composition_history` is populated from both HealthKit import and manual SwiftUI entry without a unique constraint, duplicates accumulate silently — the same date gets two rows with different weights, and whichever is queried first becomes the "current" weight.

**Warning signs:**
- "database schema version 23 is not current 24" errors in app log after update.
- `body_composition_history` has duplicate rows per date after a HealthKit background sync.
- Manual weight entry overwrites HealthKit weight (or vice versa) without user confirmation.
- `ensure_body_comp_columns()` added but not called in `GooseStore::open` after `migrate()`.

**Prevention:**
- Add a `UNIQUE(source, date)` constraint on `body_composition_history` (matching the pattern used by `apple_daily` and `metric_series`).
- Increment `CURRENT_SCHEMA_VERSION` to 24 in the same commit as the DDL.
- Use `INSERT OR REPLACE` or `INSERT OR IGNORE` for HealthKit-sourced rows; use a distinct `source = 'manual'` row for user entries so both can coexist with the unique constraint.
- Represent all optional fields (`body_fat_pct`, `lean_mass_kg`, `bmi`) as `REAL` columns with no `NOT NULL` — write queries with `COALESCE` and map `NULL` to `Option<f64>` on the Rust side.
- Add the idempotency test: run `migrate()` twice on the same database; assert no error and version is 24.

**Phase to address:** Feature #166 (body composition history).

---

### Pitfall 6: GET_FF_VALUE (0x80) — No Timeout on BLE Write and Unknown Flag Index Meaning

**What goes wrong:** `get_feature_flag_value` exists in `CoreBluetoothBLETransport` and is guarded in `CoreBluetoothBLETransport+HistoricalCommands.swift` but has no corresponding Rust parse arm for the response payload. The response format (flag index to boolean/byte meaning) is not documented in `commands.rs` or `protocol.rs`. Two failure modes:

1. **Device does not support the command:** Firmware below a certain version may return a NACK or simply not respond. The existing command infrastructure has no timeout path for unanswered commands — the Swift caller will block (or async-wait) indefinitely if no response arrives on the characteristic.
2. **Unknown flag index meaning:** Even when the response arrives, mapping flag index N to a capability name is RE-derived. An incorrect mapping silently enables or disables capabilities in `DeviceCapabilities`.

**Warning signs:**
- App hangs or shows a spinner for "feature flag discovery" indefinitely.
- `DeviceCapabilities.r22_realtime` is toggled based on a flag index whose meaning is uncertain.
- No timeout guard around the BLE write-and-await for 0x80.
- `get_feature_flag_value` response is parsed in Swift without a Rust bridge method.

**Prevention:**
- Add a 3-second timeout to any `get_feature_flag_value` command write; on timeout, fall back to the existing `DeviceCapabilities` defaults determined by `DeviceKind`.
- Parse the response payload in Rust (`commands.rs` or `protocol.rs`) and expose it via a bridge method — do not parse raw BLE bytes in Swift for this response.
- Store the raw flag index to raw byte mapping in `DeviceCapabilities` initially; do not map to a named capability until the meaning is confirmed against real device captures.
- Add an explicit `supports_ff_query: bool` field to `DeviceCapabilities`, defaulting to `false`, set to `true` only after a successful 0x80 response.

**Phase to address:** Feature #165 (GET_FF_VALUE). Must have fallback before shipping.

---

### Pitfall 7: PIP Realtime Pipeline — FRAME_SOURCE Tag Atomicity and Table Scan Performance

**What goes wrong:** The `realtime_frames` table (new for v15.0) needs a `frame_source` column that distinguishes realtime frames from historical ones. Two risks:

1. **FRAME_SOURCE not atomic with insert:** If the Swift side writes a frame row and then sets `frame_source = 'realtime'` in a separate UPDATE, a crash or app-backgrounding between the INSERT and UPDATE leaves orphan rows with a null `frame_source`. A query that filters `WHERE frame_source = 'realtime_pip'` will miss those rows; a query that does not filter will mix them with historical frames.
2. **Full table scan on `realtime_frames`:** The existing `captured_frames` and `raw_evidence` tables have covering indexes. If `realtime_frames` is added without an index on `(device_uuid, captured_at)`, the `/v1/ingest-realtime` upload cursor query will do a full table scan — which becomes slow once a long capture session accumulates thousands of rows.

**Warning signs:**
- Upload endpoint receives realtime frames mixed with historical frames.
- `frame_source` is NULL in some rows in `realtime_frames`.
- `/v1/ingest-realtime` HTTP requests take more than 2s for sessions longer than 30 minutes.
- A new `URLRequest` is constructed ad hoc without using `RemoteServerStorage.serverURL` and the Bearer token pattern — auth silently fails with 401.

**Prevention:**
- Include `frame_source TEXT NOT NULL DEFAULT 'realtime_pip'` in the `CREATE TABLE` DDL so the column is always set at insert time, never in a separate UPDATE.
- Add `CREATE INDEX IF NOT EXISTS idx_realtime_frames_device_captured ON realtime_frames(device_uuid, captured_at)` in the same migration block.
- Add the new server endpoint path as a constant in `RemoteServerStorage` (matching the `v1/ingest-*` pattern) and use `GooseUploadService`'s existing auth header assembly.
- Wrap the insert in the same `immediate_transaction` pattern used by `CaptureStore` (`store/capture.rs` line 932).

**Phase to address:** Feature #168 (PIP realtime pipeline).

---

### Pitfall 8: ALG-HRV-04 / ALG-SLP-04 Validation — Synthetic Fixtures Are Not Acceptable, Statistical Power Requires Enough Real Sessions

**What goes wrong:** ALG-HRV-04 and ALG-SLP-04 have been deferred since v5.0 because they require real overnight captures from a WHOOP 5.0 device (delta ≤ 1 ms for RMSSD; concordance ≥ 70% for 4-class staging). In v6.0, synthetic fixtures were created as a placeholder and the gates were declared partially satisfied. The risk in v15.0 is treating a small sample as statistically sufficient:

- With only 5 overnight sessions, a single outlier night (arrhythmia, poor contact, off-wrist) can move concordance by 20 percentage points.
- The existing `sleep_staging.rs` uses Cole-Kripke at 30s epochs; the WHOOP app uses 1-minute epochs on older firmware — if the real device uses 1-minute gravity snapshots, the epoch mismatch produces systematic staging errors that look like algorithm failure rather than an input mismatch.
- RMSSD validation requires gap-aware segment processing (`rmssd_segment_aware`); if the real-device capture has BLE gaps larger than 3 minutes, the gap filter discards segments and the session may not produce a computable RMSSD at all.

**Warning signs:**
- Validation report shows only 3 of 5 sessions computed (2 rejected due to gaps or off-wrist).
- Concordance is 68% on 5 sessions but the gate is 70%.
- The Python reference uses 1-minute epochs and the Rust implementation uses 30s epochs; they agree on synthetic data but disagree on real overnight data.

**Prevention:**
- Capture at least 7 overnight sessions to have statistical buffer for outlier rejection.
- Before running the validation, run `goose-sleep-v1-release-gate` and `goose-sleep-window-validator` against the captured database to confirm epoch length alignment.
- Compare RMSSD values to the Python reference (`tools/reference/`) on the same raw RR intervals, not on nightly averages.
- Document the session count, gap-rejection count, and outlier nights in the phase verification artifact — do not declare a gate passed on fewer than 5 valid sessions.

**Phase to address:** Phase 51 (hardware-gated validation). Run after the device is available and after captures accumulate over at least 7 nights.

---

### Pitfall 9: HAP-04 Wake Window — Ghidra Symbols May Not Resolve `SetAlarmInfoCommandPacketRev4`

**What goes wrong:** `GooseWakeWindowManager` is currently a stub actor with a comment: "do not add functional implementation until both prerequisites are complete" — requiring a BTSnoop capture of `STRAP_DRIVEN_ALARM_EXECUTED` packets and a Ghidra decompilation of `SetAlarmInfoCommandPacketRev4`. The risk is attempting to implement the alarm packet format based on partial Ghidra output where the field layout is inferred rather than confirmed:

- The WHOOP 5.37.0 IPA was reverse-engineered for calorie coefficients (confirmed), but Swift binary RE for a BLE command packet struct is less reliable — Ghidra's Swift demangler may not resolve the exact field offsets for `SetAlarmInfoCommandPacketRev4` if the struct uses value-type packing or is optimised away.
- Implementing an alarm command with wrong byte offsets causes the device to receive a malformed packet; some firmware versions accept the command silently and set a garbage alarm time.

**Warning signs:**
- Ghidra shows `SetAlarmInfoCommandPacketRev4` as a function rather than a struct (demangling failure).
- The BTSnoop capture shows the command bytes but the alarm time field is ambiguous (could be UTC seconds or local minutes-since-midnight).
- The stub actor is filled in without a BTSnoop capture, relying only on Ghidra inference.

**Prevention:**
- Keep `GooseWakeWindowManager` as a stub until a live BTSnoop capture confirms the exact byte layout by comparing sent bytes to the alarm time that fires.
- If Ghidra cannot resolve the struct, use the BTSnoop capture as the ground truth: write a parsing test that decodes a known captured packet and asserts the alarm time field value.
- Add a `#if DEBUG` preview-only alarm command that sends a 1-minute wake alarm and validates the device response before enabling the production path.
- Do not remove the RE-gated comment from `GooseWakeWindowManager.swift` until a round-trip capture confirms the format.

**Phase to address:** HAP-04 phase. If BTSnoop capture is not possible, defer to v16.0.

---

## Minor Pitfalls

### Pitfall 10: UserDefaults Key Collision Risk for Stealth Toggles

**What goes wrong:** The existing codebase has very few `UserDefaults` keys under `"goose.*"` (only `"goose.swift.liveHRVRMSSD"` and `"goose.swift.profile.weightGrams"` confirmed in source). Stealth mode will add per-metric keys. If the key names are not defined as `static let` constants on a dedicated type and are instead written as string literals at each call site, typos produce independent keys that are always `false` (UserDefaults returns false for missing Bool keys), effectively disabling stealth silently.

**Prevention:** Define all stealth keys as `static let` constants on a `StealthStorage` enum, mirroring the `RemoteServerStorage` pattern used for server config keys. Add a unit test that reads each key via the constant and via the literal — they must match.

**Phase to address:** Feature #167 (stealth mode).

---

### Pitfall 11: `#if DEBUG` Previews Require Mock Stealth State

**What goes wrong:** Views that read stealth state from `UserDefaults` at render time will silently render the hidden metric as visible in previews, making it impossible to preview the stealthed state. A view that calls `UserDefaults.standard.bool(forKey: StealthStorage.hrv)` directly has no injectable seam for `#Preview`.

**Prevention:** Define a `StealthMask` value type and pass it as an environment value, not read from `UserDefaults` directly inside views. Provide `.stealthAll()` and `.stealthNone()` static factories on `StealthMask` for use in `#Preview` bodies. Verify previews render correctly in both states before closing the stealth phase.

**Phase to address:** Feature #167 (stealth mode).

---

### Pitfall 12: r2d2 Pool Exhaustion When Multiple Bridge Methods Are Called Concurrently From New Queues

**What goes wrong:** The existing documentation in `CLAUDE.md` warns that `goose_bridge_handle_json` blocks the calling thread. The r2d2 pool has a default `max_size` of 10. If v15.0 adds multiple new bridge methods for realtime pipeline, body comp, and feature flags — all called from different background queues — pool checkout contention is possible. A pool exhaustion returns a `pool checkout` error after a timeout, which manifests as a bridge failure on the Swift side.

**Prevention:** Ensure new bridge methods for high-frequency realtime frames (PIP pipeline) are called from a single dedicated queue, not one queue per frame. Add a `pool checkout timeout` log at `WARNING` level so pool exhaustion is surfaced in the OSLog capture. Do not introduce more than two new background queues for v15.0 bridge calls.

**Phase to address:** Feature #168 (PIP realtime pipeline), and any phase adding multiple new bridge call sites.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| v20/v21/v26 protocol decode (#172/#173) | `Unknown` arm fallthrough emits noise, no data persisted | Add parse arms before enabling optical stream commands |
| Harvard sleep need (#164) | Age baseline seed uses fixed 480 min; strain=0 edge case ignored | Pass age from user profile to EWMA init; guard strain=0 explicitly |
| GET_FF_VALUE (#165) | No timeout on BLE write; unknown flag index meaning | 3s timeout + fallback to DeviceKind defaults; parse in Rust not Swift |
| Body composition (#166) | Schema version not incremented; HealthKit race produces duplicates | Increment CURRENT_SCHEMA_VERSION to 24; UNIQUE(source, date) constraint |
| Stealth mode (#167) | LLM context builder leaks hidden metrics; UserDefaults key typos | Filter in CoachLocalToolContext; static key constants on StealthStorage |
| PIP realtime (#168) | frame_source not atomic; table scan on upload; auth header mismatch | NOT NULL DEFAULT in DDL; covering index; use RemoteServerStorage pattern |
| ALG-HRV-04/SLP-04 (Phase 51) | Synthetic fixtures counted as passing; epoch mismatch; too few real sessions | Capture at least 7 nights; epoch alignment check; gap-rejection audit |
| HAP-04 wake window | Ghidra symbol unresolved; wrong byte offsets fire garbage alarm time | Keep stub until BTSnoop round-trip confirms format |
