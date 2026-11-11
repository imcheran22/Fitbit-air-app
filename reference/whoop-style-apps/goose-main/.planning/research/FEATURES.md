# Feature Landscape — v15.0

**Domain:** Self-hosted WHOOP biometric platform (iOS Swift + Rust core + Android Kotlin)
**Researched:** 2026-06-21
**Scope:** New capabilities only — existing features (BLE, v18/v24 decode, dashboards, Coach, Android v14.0) are out of scope.

---

## Summary

v15.0 has ten distinct feature areas spanning three categories: WHOOP 5.0 protocol decoding, algorithm improvements, and UX/infrastructure. The protocol features (#172, #173) are table stakes for WHOOP 5.0 users because without them large classes of recorded data appear as `Unknown { packet_k }` and are discarded. The algorithm improvement (#164) and the hardware-gated validations (ALG-HRV-04, ALG-SLP-04) are differentiators — they increase metric fidelity, but the app is not broken without them. The remaining features (body composition, stealth mode, PIP pipeline, feature-flag discovery, CAPSENSE-01, HAP-04) range from useful-but-optional to high-risk and RE-gated.

Build order recommendation:
1. Protocol decode (#172, #173) — unblocks stored data; pure Rust, no Swift changes
2. GET_FF_VALUE (#165) — small BLE command + capabilities; no schema migration
3. Harvard sleep need model (#164) — algorithm-only, builds on existing `sleep_need_minutes` scalar
4. Body composition (#166) — schema migration v24, new SwiftUI entry sheet
5. Stealth mode (#167) — UserDefaults toggles, view-layer only, no data changes
6. PIP realtime pipeline (#168) — new table + server endpoint; moderate scope
7. ALG-HRV-04 / ALG-SLP-04 — hardware gate; run overnight, compare vs Python reference
8. CAPSENSE-01 — hardware gate; BLE scan + UUID capture required
9. HAP-04 — RE gate; BTSnoop + Ghidra decompilation required before any code

---

## Table Stakes

Features users expect once a WHOOP 5.0 device is connected. Missing = captured data silently discarded, dashboards show stale/missing values.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| #172 v20/v21 multi-channel optical decode | Every WHOOP 5.0 packet-47 sync produces v20/v21 frames; currently logged as `unhandled_packet_k_20` warnings | High | 2140B / 1244B payloads; presence bytes; i32/i16 arrays; two variants with different layouts |
| #173 v26 24 Hz PPG waveform decode | Type-47 v26 appears in realtime stream; without decode, PPG waveform data is silently dropped | Medium | 88B payload; fixed layout; 24x LE-i16 at offsets [27:74]; simpler than v20/v21 |
| ALG-HRV-04 / ALG-SLP-04 real overnight validation | Algorithm correctness promise made since v5.0; hardware gate finally lifted | Medium | Requires real WHOOP 5.0 + Python reference pipeline; delta <= 1 ms HRV, >= 70% staging concordance |

---

## Differentiators

Features that set Goose apart. Not required to function, but meaningfully improve the product.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| #164 Harvard sleep need model | Per-user dynamic sleep target (age + 5-night EWMA debt + prior strain) vs. hardcoded 480 min | Medium | `sleep_need_minutes` scalar already feeds Recovery and Sleep scores; model replaces the constant with a computed value; needs SQLite persistence of nightly debt |
| #165 GET_FF_VALUE (0x80) feature flag read | Passive capability discovery without RE assumptions; populates `DeviceCapabilities` dynamically | Low | Command number 128 already in `CommandDefinition` registry; needs BLE send-after-HELLO sequence + response parser |
| #166 Body composition history | Weight, BMI, body fat %, muscle mass, water % with manual/HealthKit/scale source tagging; time-series view | Medium | Schema migration v24 (new table); SwiftUI entry sheet; HealthKit weight read already partially in `apple_daily`; no Rust algorithm needed |
| #167 Stealth mode | Per-metric UserDefaults toggle hides values in dashboards with "--"; Coach still receives raw data | Low | View-layer substitution; no data model or algorithm change; UserDefaults key per metric; does not affect export or server upload |
| #168 PIP realtime pipeline | Tag real-time BLE frames as `FRAME_SOURCE_REALTIME`, store in separate `realtime_frames` table, POST to new `/v1/ingest-realtime` endpoint | Medium | New SQLite table (schema v24 or v25); new server FastAPI route; adds upload path separate from historical sync; needed for sub-second server observability |
| CAPSENSE-01 cap sense UUID discovery | On-wrist detection via capacitive sense characteristic; parity with official WHOOP app | High | Currently gated on real BLE scan to identify UUID; `cmd 0x54` (off-wrist via optical) already implemented as BLE-02 in v14.0; CAPSENSE uses a different GATT characteristic |
| HAP-04 wake-window engine | Smart alarm delivers haptic buzz within a user-configured optimal window before alarm time | High | Gated on BTSnoop capture of `STRAP_DRIVEN_ALARM_EXECUTED` + Ghidra decompile of `SetAlarmInfoCommandPacketRev4`; stub `GooseWakeWindowManager` exists; `HAP-03` smart alarm UI (v10.0) is the prerequisite |

---

## Anti-Features

Features to explicitly NOT build in v15.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full optical signal processing (SpO2 from v20/v21 channels) | Requires calibration data from WHOOP hardware that is not accessible; produces uncalibrated numbers that could mislead users | Store raw channel arrays in SQLite; tag as `uncalibrated`; expose in Debug view only |
| SET_FEATURE_FLAG_VALUE (cmd 120) | Writing feature flags risks device firmware state changes; no validated use case | Read-only via GET_FF_VALUE (cmd 128); log results; never write |
| Body composition algorithms (lean mass from impedance) | No bioimpedance sensor in WHOOP devices; any derived numbers would be fabrications | Accept source values from HealthKit or manual entry; no computation |
| Realtime server dashboard / alerts | Out of scope per PROJECT.md; requires significant server-side work | PIP pipeline (#168) delivers the data stream; server-side consumers are a separate future project |
| Stealth mode for Coach context | Coach must retain full raw data access to give useful recommendations | The toggle applies display-layer only; Coach provider always receives unmasked values |

---

## Feature Dependencies

```
HAP-03 (v10.0, done) --> HAP-04 (wake-window)
BLE-02 (v14.0, done) --> CAPSENSE-01 (different UUID, same on-wrist semantic)
#172 v20/v21 decode --> body in SQLite --> potential future optical-derived metrics
#173 v26 decode --> realtime PPG store --> PIP realtime pipeline (#168)
GET_FF_VALUE (#165) --> DeviceCapabilities enrichment --> optional guards on v20/v21 decode
sleep_need_minutes constant (exists) --> Harvard model (#164) replaces with computed value
#164 Harvard model --> Recovery score input (existing pipeline accepts it as a scalar)
Schema v23 (current) --> v24 migration (body composition + realtime_frames tables, can coexist)
ALG-HRV-04 / ALG-SLP-04 --> real WHOOP 5.0 device required (unblocked since v14.0)
```

---

## Per-Feature Deep Dive

### #172 — v20/v21 WHOOP 5.0 Multi-Channel Optical Decode

**Expected Behavior:**
`parse_data_packet_body_summary` currently falls to `Unknown { packet_k }` for `packet_k = 20` or `21`. After this feature: two new `DataPacketBodySummary` variants (`V20MultiChannel`, `V21MultiChannel`) are returned; their channel arrays are persisted to a new `optical_channels` SQLite table; a bridge method surfaces them for the Debug view.

v20 payload is 2140B; v21 is 1244B. Both carry a presence bitmap followed by i32 (v20) or i16 (v21) per-channel arrays. `COMM-04`-style WHY comments required at every byte offset.

**Complexity:** High
**Dependencies:** None (pure Rust protocol change)
**Risk:** Medium. Payload layout is hardware-verified per ROADMAP backlog note. Risk is misreading presence-byte semantics for channels that are conditionally present. Need at least two distinct captures (different optical states) to verify the presence bitmap interpretation.
**Lowest-effort path:** Add the two enum variants, parse the presence byte, store raw channel bytes as a hex blob initially, add the WHY comments. Defer per-channel structured parsing to a follow-up.

---

### #173 — v26 WHOOP 5.0 24 Hz PPG Waveform Decode

**Expected Behavior:**
`packet_k = 26` in `parse_data_packet_body_summary` currently produces `Unknown`. After this feature: `DataPacketBodySummary::V26PpgWaveform { channel: u8, samples: Vec<i16> }` (24 samples x LE-i16 at offsets [27:74]). Channel index (1-26) identifies which LED/photodiode channel the waveform belongs to. Persist to a `ppg_waveform_samples` table (device_id, ts, channel, sample_idx, value_raw).

**Complexity:** Medium
**Dependencies:** None (pure Rust; layout hardware-verified at 88B)
**Risk:** Low. Fixed-size payload with no presence bits; simpler than v20/v21. The 24x2-byte array fits within the existing `I16SeriesSummary` pattern used by `R17OpticalOrLabradorFiltered`.

---

### #164 — Harvard Sleep Need Model

**Expected Behavior:**
Replaces the hardcoded `sleep_need_minutes: 480.0` constant in `SleepFeatureScoreOptions` and `RecoveryFeatureScoreOptions` with a computed value from a new `compute_sleep_need` Rust function.

Formula: `base_hours(age) + ewma_debt_adjustment(5-night history) + activity_factor(prior_day_strain)`.

- Age-adjusted baseline: literature table mapping age bracket to hours (18-25: 8.0h, 26-64: 7.5h, 65+: 7.0h).
- 5-night EWMA debt: `debt_hours = sum(sleep_need - actual_sleep) x ewma_weight` using alpha 0.0483 (matching existing baseline engine).
- Activity factor: prior-day strain >= 15 adds +0.25h; >= 10 adds +0.1h.
- Bridge input: `age_years`, past 5 nights of `actual_sleep_minutes` from `external_sleep_sessions`, prior strain from `daily_recovery_metrics`.
- Output struct: `SleepNeedResult { needed_hours, base_hours, debt_adjustment_hours, activity_factor_hours }`.
- `sleep_need_minutes` passed into existing score pipeline unchanged in type; only its source changes.

**Complexity:** Medium
**Dependencies:** `external_sleep_sessions` table (exists since v7.0); `daily_recovery_metrics` for prior strain (exists); age/sex input from user profile (needs a new Swift UI field in More settings if not already present).
**Risk:** Low algorithmically. Medium integration risk: the bridge method must pull 5 nights of data then call the model in one Rust function. Do not call the bridge 5x from Swift.

---

### #165 — GET_FF_VALUE (0x80) Feature Flag Read

**Expected Behavior:**
After `GET_HELLO` exchange completes, Swift sends cmd `0x80` (decimal 128, already in `CommandDefinition` registry as `get_feature_flag_value`) with a flag index byte payload. Response carries flag index to value pairs; values are small integers or booleans. Rust logs each pair to a `device_feature_flags` table. `DeviceCapabilities` gains `feature_flags: HashMap<u8, u8>`. Bridge method: `capabilities.get_feature_flags(database_path, device_id)`. Results surfaced in Debug tab.

**Complexity:** Low
**Dependencies:** `DeviceCapabilities` struct (exists); cmd 128 `CommandDefinition` (registered); `BLESessionCoordinator` (exists) triggers read post-auth.
**Risk:** Low. Read-only; no firmware state change. Device ignores unknown flag indices gracefully per protocol observation. The main uncertainty is which specific flag indices are meaningful — log all observed values and document post-capture.

---

### #166 — Body Composition History

**Expected Behavior:**
New SQLite table `body_composition` with columns: id, device_id, date TEXT, weight_kg REAL, bmi REAL, body_fat_pct REAL, muscle_mass_kg REAL, water_pct REAL, source TEXT CHECK(source IN ('manual','healthkit','scale')), created_at, updated_at. SwiftUI `BodyCompositionEntrySheet` for manual entry. HealthKit import reads `HKQuantityTypeIdentifierBodyMass` and `HKQuantityTypeIdentifierBodyFatPercentage`. Weight_kg also written back to HealthKit. Trend chart in Health tab.

**Complexity:** Medium
**Dependencies:** Schema migration v24; HealthKit write entitlement (already granted); `apple_daily.weight_kg` provides a pre-existing source to backfill from.
**Risk:** Low. No algorithm risk. Schema migration must be coordinated with any other v24 tables (#173, #168) so they land in a single migration increment.

---

### #167 — Stealth Mode

**Expected Behavior:**
`StealthSettings` type stores per-metric `Bool` in UserDefaults under keys like `goose.stealth.hrv`, `goose.stealth.recovery_score`, etc. In each dashboard view, a metric value is replaced with `Text("--")` when stealth is on. Settings screen in More tab with a "Coach still sees raw data" disclaimer. Coach `buildSystemPrompt()` always passes real numeric values. No server upload changes.

**Complexity:** Low
**Dependencies:** None. Pure view-layer change.
**Risk:** Low. The only risk is missing a metric display location in a non-obvious view (e.g. Coach score summary grid, Home device card). A review pass over all views that display numeric metrics is sufficient.

---

### #168 — PIP Realtime Pipeline

**Expected Behavior:**
`FrameSource` enum gains `realtime` variant alongside `historical`. New SQLite table `realtime_frames` (id, device_id, ts REAL, frame_hex TEXT, packet_type INTEGER, parsed_summary_json TEXT, uploaded INTEGER DEFAULT 0). `CaptureFrameWriteQueue` routes realtime notification frames to `realtime_frames`; historical frames continue to `raw_evidence` / `decoded_frames`. New FastAPI endpoint `POST /v1/ingest-realtime` accepts `{ device_id, frames: [...] }` batches. Swift uploads every 5 s if server reachable. Bridge method: `pip.pending_realtime(database_path, device_id, limit)`.

**Complexity:** Medium
**Dependencies:** Schema v24 (coordinate with #166, #173); existing upload watermark pattern (exists since v9.0); `CaptureFrameWriteQueue` routing point in `GooseAppModel+NotificationPipeline.swift`.
**Risk:** Medium. The routing decision (realtime vs. historical) must be made at the BLE notification handler level and propagated correctly through the write queue. If frames are incorrectly tagged, historical sync data lands in the wrong table and is unreachable by the existing decode pipeline.

---

### ALG-HRV-04 / ALG-SLP-04 — Real Overnight Cross-Validation

**Expected Behavior:**
Wear real WHOOP 5.0 overnight for >= 5 nights. Extract RR intervals and motion data from SQLite. Run through Rust `compute_rmssd` and `classify_sleep_stage`. Compare HRV delta (<= 1 ms) against `pyhrv` reference on same intervals. Compare staging concordance (>= 70%) against WHOOP app's reported stages. Fix any discovered bugs. Promote requirements to Validated.

**Complexity:** Medium (execution complexity; algorithms already written)
**Dependencies:** Real WHOOP 5.0 device (unblocked since v14.0); Python reference at `~/Documents/my-whoop/server/ingest/app/analysis/`; existing `goose-local-health-validation-suite` binary.
**Risk:** Medium. Algorithms have run on synthetic fixtures only since v5.0. Real overnight data may expose BLE gap handling edge cases or staging edge cases near wake/sleep boundaries.

---

### CAPSENSE-01 — Cap Sense UUID Discovery

**Expected Behavior:**
During BLE enumeration, scan all characteristics. Identify the cap sense characteristic by observing which characteristic changes when the band is donned/removed. Subscribe to it. Parse on/off byte. Publish `isOnWrist: Bool` via `BLETransport`. `DeviceCapabilities` gains `capsense_uuid: Option<String>`.

**Complexity:** High
**Dependencies:** Real WHOOP 5.0 device; BLE-02 optical off-wrist (v14.0) provides fallback. UUID must be documented in `.planning/research/whoop-re/` before any Swift code is written.
**Risk:** High. UUID unknown. Discovery requires full characteristic enumeration and behavioral observation — cannot be done in simulator. Risk of false identification if another characteristic also changes state at donning time.

---

### HAP-04 — Wake-Window Engine

**Expected Behavior:**
`GooseWakeWindowManager` implements: given alarm time + configured window (default 30 min), compute optimal wake point from sleep stage transitions. Send `SetAlarmInfoCommandPacketRev4` via BLE. Device buzzes at computed time.

**Complexity:** High
**Dependencies:** HAP-03 smart alarm UI (done, v10.0); BTSnoop capture of `STRAP_DRIVEN_ALARM_EXECUTED`; Ghidra decompile of `SetAlarmInfoCommandPacketRev4` field layout.
**Risk:** High. Fully RE-gated. The stub file `GooseWakeWindowManager.swift` explicitly blocks implementation until both prerequisites are documented in `.planning/research/whoop-re/SetAlarmInfoCommandPacketRev4.md`. Writing any functional code before the Ghidra analysis is complete risks sending a malformed command that corrupts alarm state on the device.

---

## MVP Recommendation for v15.0

Prioritize (in order):

1. **#172 v20/v21 decode** — highest data-correctness impact; every WHOOP 5.0 sync session produces these packets
2. **#173 v26 decode** — simpler payload; complements realtime use case
3. **ALG-HRV-04 / ALG-SLP-04** — closes the oldest open gate; directly improves metric trust
4. **#164 Harvard sleep need model** — meaningful algorithm improvement; low risk
5. **#165 GET_FF_VALUE** — small effort, enriches DeviceCapabilities permanently
6. **#166 Body composition** — new data domain; schema migration batched with #173 table

Defer to later v15.x or v16.0:

- **CAPSENSE-01** — hardware discovery work; BLE-02 optical off-wrist already covers the functional gap
- **HAP-04** — RE prerequisites must be completed first; do not rush
- **#167 Stealth mode** — pure polish; does not affect any data flow
- **#168 PIP realtime** — upload infrastructure works today; realtime sub-5s delivery is a nice-to-have

---

## Sources

- Codebase analysis: `Rust/core/src/protocol.rs`, `capabilities.rs`, `commands.rs`, `metric_features.rs`, `store/mod.rs`
- `.planning/PROJECT.md` — requirements and deferred gate history
- `.planning/ROADMAP.md` — backlog table with priority and deferral rationale
- `GooseSwift/GooseWakeWindowManager.swift` — HAP-04 stub and gate conditions
