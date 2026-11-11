# Roadmap: Goose

## Milestones

- ✅ **v1.0 Remote Server + Upstream PRs** — Phases 1-5 (shipped 2026-06-03)
- ✅ **v2.0 Multi-Device & Platform Foundations** — Phases 6-8+8.1 (shipped 2026-06-04)
- ✅ **v3.0 Wearable UX, CI Hardening & RTC Sync** — Phases 9-15 (shipped 2026-06-05)
- ✅ **v4.0 Security, Performance & Coach Expansion** — Phases 16-19 (shipped 2026-06-06)
- ✅ **v5.0 Metrics Accuracy, IMU & Upstream Fixes** — Phases 20-35 (shipped 2026-06-08)
- ✅ **v6.0 UI Wiring, Algorithm Alignment & Parity Validation** — Phases 36-45 (shipped 2026-06-09)
- ✅ **v7.0 Sync Correctness, Async & Sleep Sync** — Phases 46-50 (shipped 2026-06-10)
- ✅ **v8.0 Quality, Completeness & Backlog Clearance** — Phases 51-59+60 (shipped 2026-06-11)
- ✅ **v9.0 BLE Reliability & Protocol Parity** — Phases 61-65+66 (shipped 2026-06-11)
- ✅ **v10.0 Protocol Parity, Haptics & Feature Completeness** — Phases 67-73 (shipped 2026-06-13)
- ✅ **v11.0 PR Integration, Code Health & App Polish** — Phases 74-82 (shipped 2026-06-14)
- ✅ **v12.0 Code Health & Protocol Foundation** — Phases 83-91 (shipped 2026-06-19)
- ✅ **v13.0 Bug Fixes, Protocol Reliability, Device Coverage & HealthKit Export** — Phases 92-97 (shipped 2026-06-20)
- ✅ **v14.0 Android Port, BLE Reliability & Protocol Depth** — Phases 98-111 (shipped 2026-06-21)
- **v15.0 Protocol Depth, Algorithms & UX** — Phases 112-126 (in progress)

## Phases

<details>
<summary>✅ v1.0 Remote Server + Upstream PRs (Phases 1-5) — SHIPPED 2026-06-03</summary>

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Multi-Device & Platform Foundations (Phases 6-8+8.1) — SHIPPED 2026-06-04</summary>

Full details: `.planning/milestones/v2.0-ROADMAP.md`

Known deferred: WEAR-02 scan UI (v3.0), CR-02 per-row filter (v3.0), hardware BLE tests (no device)

</details>

<details>
<summary>✅ v3.0 Wearable UX, CI Hardening & RTC Sync (Phases 9-15) — SHIPPED 2026-06-05</summary>

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

<details>
<summary>✅ v4.0 Security, Performance & Coach Expansion (Phases 16-19) — SHIPPED 2026-06-06</summary>

Full details: `.planning/milestones/v4.0-ROADMAP.md`

Known deferred: COACH-06 device migration test, 4 streaming provider runtime tests, 3 localisation device tests

</details>

<details>
<summary>✅ v5.0 Metrics Accuracy, IMU & Upstream Fixes (Phases 20-35) — SHIPPED 2026-06-08</summary>

Full details: `.planning/milestones/v5.0-ROADMAP.md`

Key: HRV accuracy, Sleep staging (Cole-Kripke + 4-class), Strain/Calories (Ghidra-confirmed coefficients), V24 biometric decode, Exercise detection, Upload sync infrastructure, Readiness engine, Protocol corrections, Codebase audit (9 HIGH fixed), Cross-project review.

Known deferred: ALG-HRV-04, ALG-SLP-04, VAL-01 (human gates — require real WHOOP device data)

</details>

<details>
<summary>✅ v6.0 UI Wiring, Algorithm Alignment & Parity Validation (Phases 36-45) — SHIPPED 2026-06-09</summary>

Full details: `.planning/milestones/v6.0-ROADMAP.md`

Known deferred: ALG-HRV-04 real overnight cross-validation (v7.0), ALG-SLP-04 real overnight concordance (v7.0)

</details>

<details>
<summary>✅ v7.0 Sync Correctness, Async & Sleep Sync (Phases 46-50) — SHIPPED 2026-06-10</summary>

Full details: `.planning/milestones/v7.0-ROADMAP.md`

Key: Upload round-trip (POST /v1/ingest-frames + GET export), device_uuid end-to-end, upload sync race fix, HealthDataStore full async migration (60+ calls), morning band sleep sync (gravity K18/K24 → Cole-Kripke → external_sleep_sessions).

Known deferred: Phase 51 (VAL-HRV-01, VAL-SLP-01, SLP-SYNC real-device validation) — hardware gate, requires WHOOP + ≥5 overnight sessions

</details>

<details>
<summary>✅ v8.0 Quality, Completeness & Backlog Clearance (Phases 51-59+60) — SHIPPED 2026-06-11</summary>

Full details: `.planning/milestones/v8.0-ROADMAP.md`

- [x] Phase 51: Bug Audit — 3 HIGH + 6 MEDIUM bugs fixed in v6.0–v7.0 code
- [x] Phase 52: Quick Tasks & Surface Cleanup — BT Settings, CodeQL CI, HealthKit importer, #if DEBUG gating
- [x] Phase 53: Home Dashboard Completion — Device Status Card, Tools Grid, Evidence Footer
- [x] Phase 54: Coach Score Summaries & Journal — metric highlight grid, daily journal with persistence
- [x] Phase 55: Coach Routes — Sleep Coach, Recovery Insights, Strain Guidance, Stress Guidance views
- [x] Phase 56: Biometrics & Activity — fabricated 55.0 bpm eliminated; exercise-masked stress
- [x] Phase 57: Persistence & Calibration — energy_daily_rollup to SQLite; real train/holdout calibration
- [x] Phase 58: More Tab, Previews & Health Algorithms — MorePrivacyView, #Preview macros, algorithmPreferences
- [x] Phase 59: Band Sleep Import — bandSleepImportStatus replaces static "not available" UI
- [x] Phase 60: Band-First Sync — overnight poll loop removed; foreground-trigger + BGAppRefreshTask

Known deferred: ble-api-misuse-state-restore debug session (awaiting_human_verify); hardware gates (VAL-HRV-01, VAL-SLP-01, SLP-SYNC)

</details>

<details>
<summary>✅ v9.0 BLE Reliability & Protocol Parity (Phases 61-65+66) — SHIPPED 2026-06-11</summary>

Full details: `.planning/milestones/v9.0-ROADMAP.md`

- [x] Phase 61: BLE Bonding State Machine — 5-state GooseBLEBondingManager (WHPBLEBondingManager parity)
- [x] Phase 62: Upload Watermark per Sensor — per-type watermarks (rawFrames + decodedStreams)
- [x] Phase 63: Network Monitor & Upload Gating — NWPathMonitor gate + exponential backoff
- [x] Phase 64: HR Data Sanitizer — 25-220 BPM filter at BLE parsing chokepoint
- [x] Phase 65: Generic BLE State Machine — StateMachine<State: Hashable, Event> struct
- [ ] Phase 66: Cap Sense / On-Wrist Detection — DEFERRED (GATT UUID hardware-gated; 11500X series candidates documented)

Known deferred: CAPSENSE-01 hardware gate (requires real WHOOP 5.x device for UUID identification)

</details>

<details>
<summary>✅ v10.0 Protocol Parity, Haptics & Feature Completeness (Phases 67-73) — SHIPPED 2026-06-13</summary>

Full details: `.planning/milestones/v10.0-ROADMAP.md`

- [x] Phase 67: WHOOP 5.0 Protocol Fixes — R22 realtime + v18 per-second historical (pure Rust) (completed 2026-06-12)
- [x] Phase 68: BLE Manager Refactor + Data Validator — GooseBLEHistoricalManager + GooseBLEDataValidator (completed 2026-06-12)
- [x] Phase 69: Data Foundation — 4 SQLite tables (schema v20) + strain accumulator (completed 2026-06-12)
- [x] Phase 70: Haptic Primitive + Breathe Screen — buzz(loops:) cmd 0x13 + BreatheView (completed 2026-06-12)
- [x] Phase 71: Coach VOW + NoopApp + Notifications + HR Decimation — VOW nudges, Interval Timer, Metric Explorer, NotificationScheduler (completed 2026-06-12)
- [x] Phase 72: Screens on New Foundation + Service Layer — Stress/ANS, Trends dashboard, Manual Workout Entry, protocol mocks (completed 2026-06-12)
- [x] Phase 73: Smart Alarm + Wake-Window Engine — HAP-03 alarm UI + HAP-04 RE-gated stub (completed 2026-06-12)

Known deferred: BLE5-01/02 (hardware-gated, real WHOOP 5.0 device), HAP-04 (RE-gated, BTSnoop capture needed), HAP-02/DATA-02 (promoted to v11.0 as DEF-01/DEF-02)

</details>

<details>
<summary>✅ v11.0 PR Integration, Code Health & App Polish (Phases 74-82) — SHIPPED 2026-06-14</summary>

Full details: `.planning/milestones/v11.0-ROADMAP.md`

- [x] Phase 74: Fork PR UX/i18n/Auth — units, localisation, UUID hiding, ChatGPT auth (#132–136)
- [x] Phase 75: Fork PR BLE/Sync/Home — firmware recovery, warm-up state, sync donut (#131,135,137)
- [x] Phase 76: Upstream PR Integration — main-thread offload, FFI async, scroll jitter (#4,12,29,31)
- [x] Phase 77: Codebase Audit — 7-doc map + deep review phases 67-73 + all CRITICAL fixed
- [x] Phase 78: Performance & BLE Reliability — schema v21 indexes, lazy init, auth retry (SEED-001)
- [x] Phase 79: Polish & Deferred — Debug 3-tabs, Logs & Export, Breathe haptics, live strain
- [x] Phase 80: Resting HR Floor Filter — 30 bpm minimum in metric_features.rs (#130)
- [x] Phase 81: Battery Level Fix — R22 battery_pct to Swift; Gen4 0xFF guard (#149)
- [x] Phase 82: HealthKit Import Persistence — persist to metric_series SQLite (#150)

Known deferred: Ph74/75 physical-device BLE tests (hardware gate); ble-api-misuse-state-restore (resolved/acknowledged); CAPSENSE-01, HAP-04, BLE5-01/02 hardware gates

</details>

<details>
<summary>✅ v12.0 Code Health & Protocol Foundation (Phases 83-91) — SHIPPED 2026-06-19</summary>

### Phase Details

#### Phase 83: Protocol Architecture Refactor

**Goal**: Swift and Rust share a clean typed model of device identity and wire protocol — eliminating 17 string comparisons and 8 generation guards
**Depends on**: Phase 82
**Requirements**: PROTO-01, PROTO-02, PROTO-03
**Success Criteria** (what must be TRUE):

  1. `WireProtocol { Gen4, Gen5 }` Rust enum exists and Swift uses enum checks instead of `rustDeviceType == "GEN4"` string comparisons in frame reassembly
  2. Bridge method `device.capabilities(device_kind)` returns a `DeviceCapabilities` JSON object; GooseBLEClient caches it as `connectedCapabilities` after GATT discovery
  3. DB migration runs automatically on open and all MAVERICK/PUFFIN rows become GOOSE; `parse_device_type("MAVERICK")` returns an error after migration
  4. `cargo test --locked` passes clean and the iOS build compiles without new warnings

**Plans**: 6 plansPlans:
**Wave 1**

- [x] 83-01-PLAN.md — Rust foundation: WireProtocol enum, DeviceType methods, capabilities.rs module (Wave 1)
- [x] 83-02-PLAN.md — DB migration step 22: MAVERICK/PUFFIN → GOOSE, CURRENT_SCHEMA_VERSION bump (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 83-03-PLAN.md — Bridge: device.capabilities method, BRIDGE_METHODS update, parse_device_type rejection (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 83-04-PLAN.md — Swift types: WireProtocol enum, DeviceCapabilities, connectedCapabilities, GATT discovery call (Wave 3)
- [x] 83-05-PLAN.md — Swift guards: all 23 activeDeviceGeneration + 11 rustDeviceType sites across 9 files (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 83-06-PLAN.md — Phase gate: cargo test --locked full suite + iOS build verification (Wave 4)

**Cross-cutting constraints:**

- cargo test --locked passes with no regressions
- CURRENT_SCHEMA_VERSION is 22 in store.rs
- iOS build compiles without new warnings

**Context**: `.planning/phases/83-protocol-architecture-refactor-gen4-gen5-capability-model/83-CONTEXT.md` (design decisions finalised — read before planning)

---

#### Phase 84: Gen4 Battery

**Goal**: The app displays the real battery percentage for Gen4 WHOOP devices from the wire protocol instead of a hardcoded or unavailable value
**Depends on**: Phase 83 (DeviceCapabilities.battery_via_event48 / battery_via_cmd26 fields are required for correct dispatch)
**Requirements**: BAT-01, BAT-02
**Success Criteria** (what must be TRUE):

  1. Event-48 payload (type 48) is parsed: offset 17 u16 LE / 10 with raw ≤ 1100 guard; result published to the battery UI for Gen4 devices
  2. Cmd 26 response is parsed: payload[2..4] u16 LE / 10 with count ≥ 4 guard; used as fallback when Event-48 has not yet been received in the session
  3. `cargo test --locked` includes at least one test for each parsing path (valid payload, boundary guard, fallback trigger)

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 84-01-PLAN.md — Rust: parse_event48_battery + parse_cmd26_battery, two bridge methods, event48_battery_pct compact field, unit tests (BAT-01, BAT-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 84-02-PLAN.md — Swift Event-48: event48BatteryPct compact/interpretation fields + Gen4-gated dispatch via applyBatteryLevel (BAT-01)
- [x] 84-03-PLAN.md — Swift Cmd 26: BatteryCommandKind, auto-send on Gen4 connection, handleCmd26BatteryResponse via Rust bridge (BAT-02)

---

#### Phase 85: Rust Crash Safety

**Goal**: Production Rust code cannot silently panic — every error path surfaces as a typed Result and the bridge entry point is guarded by catch_unwind
**Depends on**: Phase 82 (independent of PROTO work; can run in parallel with Phase 83/84 if desired)
**Requirements**: ARCH-03
**Success Criteria** (what must be TRUE):

  1. `#[cfg_attr(not(test), deny(clippy::unwrap_used))]` is present in the crate and `cargo clippy` passes with zero unwrap violations in production code
  2. bridge.rs dispatcher entry point is wrapped in `catch_unwind`; panics are caught and returned as an error JSON response rather than crashing the process
  3. All 133 former `.unwrap()` sites in bridge.rs and store.rs return `Result<_, GooseError>` with a specific error variant; `cargo test --locked` passes

**Plans**: 6 plans

**Wave 1**

- [x] 87-01-PLAN.md — Create store/ skeleton: store/mod.rs (Arc<Mutex<Connection>>, immediate_transaction fix), git rm store.rs, update capture_import.rs + bridge call sites, 4 empty domain stubs (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 87-02-PLAN.md — Move 13 sleep methods to store/sleep.rs (Wave 2, parallel)
- [x] 87-03-PLAN.md — Move 25 capture methods to store/capture.rs (Wave 2, parallel)
- [x] 87-04-PLAN.md — Move ~49 metrics methods to store/metrics.rs (Wave 2, parallel)
- [x] 87-05-PLAN.md — Move 49 activity methods to store/activity.rs (Wave 2, parallel)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 87-06-PLAN.md — Gate: cargo test --locked + cargo clippy --lib + human checkpoint (Wave 3)

---

#### Phase 86: bridge.rs Split + Protocol Comments

**Goal**: bridge.rs is a thin router (≤ 100 lines) delegating to per-domain handler files; every WHOOP wire-format decode site carries an offset comment explaining the protocol layout
**Depends on**: Phase 85 (ARCH-03 must complete first so the split inherits Result-typed handlers; COMM-01 collocated here because offset comments belong at the handler call sites)
**Requirements**: ARCH-01, COMM-01
**Success Criteria** (what must be TRUE):

  1. bridge.rs is reduced to a routing layer (≤ 100 lines); domain handlers exist as separate files (`bridge/metrics.rs`, `bridge/sleep.rs`, `bridge/capture.rs`, `bridge/activity.rs`, `bridge/debug.rs`)
  2. `BridgeRouter` trait (or equivalent dispatch mechanism) is defined and all 509 former match arms are handled via domain files
  3. Each WHOOP wire-format decode site (Event-48 battery layout, cmd 26 response, R22 battery_pct field) carries a comment with byte offsets, data type, empirical verification date, and source reference
  4. `cargo test --locked` passes with the reorganised module structure; no regressions in existing tests

**Plans**: 6 plans

**Wave 1**

- [x] 86-01-PLAN.md — Create bridge/ skeleton: mod.rs router shell + 5 domain stubs, delete bridge.rs (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 86-02-PLAN.md — Fill bridge/metrics.rs, bridge/sleep.rs, bridge/capture.rs with domain arms (Wave 2, parallel)
- [x] 86-03-PLAN.md — Fill bridge/activity.rs, bridge/debug.rs with domain arms + validation.* aliases (Wave 2, parallel)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 86-04-PLAN.md — Update include_str! scanner to scan all 5 domain files (Option A multi-file) (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 86-05-PLAN.md — Add COMM-01 offset comments: 11 sites in protocol.rs + 3 in bridge/metrics.rs (Wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 86-06-PLAN.md — Phase gate: cargo test --locked + clippy + human checkpoint (Wave 5)

---

#### Phase 87: store.rs Split

**Goal**: store.rs 140 public methods are reorganised into domain stores that share a connection; the schema version is validated on every SQLite open
**Depends on**: Phase 86 (bridge split must be complete before store split to avoid merge conflicts in the dispatcher)
**Requirements**: ARCH-02
**Success Criteria** (what must be TRUE):

  1. Domain stores exist as separate files (`store/sleep.rs`, `store/capture.rs`, `store/metrics.rs`, `store/activity.rs`) sharing `Arc<Connection>`
  2. Runtime schema version validation runs on SQLite open and returns an error if the on-disk schema version does not match the expected version
  3. All existing Rust integration tests pass (`cargo test --locked`) with the reorganised store module; no public API regressions visible to Swift

**Plans**: TBD

---

#### Phase 88: Swift Ownership — HealthDataStore

**Goal**: HealthDataStore is owned by GooseAppModel with a strong reference; AppShellView no longer creates or owns the store; circular back-references are eliminated
**Depends on**: Phase 82 (independent of Rust refactor phases; can be planned after Phase 87 ships or in parallel if no merge conflicts)
**Requirements**: ARCH-04
**Success Criteria** (what must be TRUE):

  1. `GooseAppModel` holds `let healthStore: HealthDataStore` as a strong reference initialised during model init
  2. `AppShellView` no longer declares `@StateObject private var healthStore`; it receives the store via `.environmentObject(model.healthStore)` injected from `GooseSwiftApp`
  3. Weak back-references from HealthDataStore to GooseAppModel and all circular closures are eliminated; the iOS build compiles without new warnings

**Plans**: 2 plans
Plans:

- [ ] 88-01-PLAN.md — Transfer HealthDataStore ownership into GooseAppModel; wire environmentObject
- [ ] 88-02-PLAN.md — Convert all child views from parameter to @EnvironmentObject

**UI hint**: yes

---

#### Phase 89: BLE Actor Refactor

**Goal**: GooseBLEClient is replaced by a BLETransport protocol and BLESessionCoordinator actor; all Gen4/Gen5 capability branching is centralised in DeviceCatalog
**Depends on**: Phase 83 (DeviceCapabilities from Phase 83 is the source of truth for Gen4/Gen5 branching in DeviceCatalog)
**Requirements**: ARCH-05
**Success Criteria** (what must be TRUE):

  1. `BLETransport` protocol exists with `CoreBluetoothBLETransport` as the concrete implementation; `GooseBLEClient` is either renamed or replaced
  2. `BLESessionCoordinator` actor manages session lifecycle; BLE callbacks are dispatched through the actor isolation boundary
  3. `DeviceCatalog` struct centralises all Gen4/Gen5 branching — no `if capabilities.historicalSync == .pageSequence` guards scattered across extension files
  4. The iOS build compiles without new warnings; existing BLE session behaviour is unchanged from the user's perspective

**Plans**: 3 plans
Plans:

- [ ] 89-01-PLAN.md — BLETransport protocol + rename GooseBLEClient → CoreBluetoothBLETransport (13 files)
- [ ] 89-02-PLAN.md — BLESessionCoordinator actor + GooseAppModel.ble → any BLETransport
- [ ] 89-03-PLAN.md — DeviceCatalog struct + replace Gen4/Gen5 capability guards

---

#### Phase 90: Domain ViewModels

**Goal**: GooseAppModel is decomposed into domain-scoped Observable objects so high-frequency BLE updates do not invalidate unrelated SwiftUI views
**Depends on**: Phase 88, Phase 89 (ownership and actor refactors must be in place before splitting GooseAppModel)
**Requirements**: ARCH-06
**Success Criteria** (what must be TRUE):

  1. `BLEState`, `SyncState`, and `HealthState` exist as separate `@Observable` objects; SwiftUI views import only the domain object they need
  2. High-frequency BLE HR updates (1 Hz) no longer trigger redraws in views that only observe `SyncState` or `HealthState`
  3. The iOS build compiles without new warnings; all existing UI screens remain functional

**Plans**: 4 plans
Plans:

- [ ] 90-01-PLAN.md — Create BLEState.swift, SyncState.swift, HealthState.swift + register in Xcode project
- [ ] 90-02-PLAN.md — Migrate GooseAppModel.swift: remove 36 var properties, add 3 domain object lets
- [ ] 90-03-PLAN.md — Update GooseAppModel extension files to write through domain objects
- [ ] 90-04-PLAN.md — Inject domain objects in GooseSwiftApp, update view files, build gate

**UI hint**: yes

---

#### Phase 91: Threading & Algorithm Comments

**Goal**: Threading invariants and algorithm coefficients are documented at their source in Swift and Rust so future contributors understand the synchronisation model and the empirical basis of each constant
**Depends on**: Phase 87 (COMM-02 Swift threading comments; COMM-03 algorithm comments in Rust — both are safest to land after the store split stabilises module boundaries)
**Requirements**: COMM-02, COMM-03
**Success Criteria** (what must be TRUE):

  1. `GooseRustBridge` usage sites and the frame reassembly buffer carry comments explaining: synchronous FFI contract, multiple-instance pattern, `@MainActor` dispatch requirement, and `NSLock` guard scope
  2. `metric_features.rs` carries comments for Banister eTRIMP (1.92/1.67 coefficients), EWMA alpha (0.0483 = 14-night half-life), and Cole-Kripke scale (0.001), each with bibliographic reference
  3. The iOS build and `cargo test --locked` pass clean; no source changes beyond comment additions

**Plans**: TBD

</details>

## Phase Details

### Phase 83: Protocol Architecture Refactor

**Goal**: Swift and Rust share a clean typed model of device identity and wire protocol — eliminating 17 string comparisons and 8 generation guards
**Depends on**: Phase 82
**Requirements**: PROTO-01, PROTO-02, PROTO-03
**Success Criteria** (what must be TRUE):

  1. `WireProtocol { Gen4, Gen5 }` Rust enum exists and Swift uses enum checks instead of `rustDeviceType == "GEN4"` string comparisons in frame reassembly
  2. Bridge method `device.capabilities(device_kind)` returns a `DeviceCapabilities` JSON object; GooseBLEClient caches it as `connectedCapabilities` after GATT discovery
  3. DB migration runs automatically on open and all MAVERICK/PUFFIN rows become GOOSE; `parse_device_type("MAVERICK")` returns an error after migration
  4. `cargo test --locked` passes clean and the iOS build compiles without new warnings

**Plans**: 6 plans
Plans:

- [x] 83-01-PLAN.md — Rust foundation: WireProtocol enum, DeviceType methods, capabilities.rs module (Wave 1)
- [x] 83-02-PLAN.md — DB migration step 22: MAVERICK/PUFFIN → GOOSE, CURRENT_SCHEMA_VERSION bump (Wave 1)
- [x] 83-03-PLAN.md — Bridge: device.capabilities method, BRIDGE_METHODS update, parse_device_type rejection (Wave 2)
- [x] 83-04-PLAN.md — Swift types: WireProtocol enum, DeviceCapabilities, connectedCapabilities, GATT discovery call (Wave 3)
- [x] 83-05-PLAN.md — Swift guards: all 23 activeDeviceGeneration + 11 rustDeviceType sites across 9 files (Wave 3)
- [x] 83-06-PLAN.md — Phase gate: cargo test --locked full suite + iOS build verification (Wave 4)

**Context**: `.planning/phases/83-protocol-architecture-refactor-gen4-gen5-capability-model/83-CONTEXT.md`

### Phase 84: Gen4 Battery

**Goal**: The app displays the real battery percentage for Gen4 WHOOP devices from the wire protocol instead of a hardcoded or unavailable value
**Depends on**: Phase 83
**Requirements**: BAT-01, BAT-02
**Success Criteria** (what must be TRUE):

  1. Event-48 payload (type 48) is parsed: offset 17 u16 LE / 10 with raw ≤ 1100 guard; result published to the battery UI for Gen4 devices
  2. Cmd 26 response is parsed: payload[2..4] u16 LE / 10 with count ≥ 4 guard; used as fallback when Event-48 has not yet been received in the session
  3. `cargo test --locked` includes at least one test for each parsing path (valid payload, boundary guard, fallback trigger)

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 84-01-PLAN.md — Rust: parse_event48_battery + parse_cmd26_battery, two bridge methods, event48_battery_pct compact field, unit tests (BAT-01, BAT-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 84-02-PLAN.md — Swift Event-48: event48BatteryPct compact/interpretation fields + Gen4-gated dispatch via applyBatteryLevel (BAT-01)
- [x] 84-03-PLAN.md — Swift Cmd 26: BatteryCommandKind, auto-send on Gen4 connection, handleCmd26BatteryResponse via Rust bridge (BAT-02)

### Phase 85: Rust Crash Safety

**Goal**: Production Rust code cannot silently panic — every error path surfaces as a typed Result and the bridge entry point is guarded by catch_unwind
**Depends on**: Phase 82
**Requirements**: ARCH-03
**Success Criteria** (what must be TRUE):

  1. `#[cfg_attr(not(test), deny(clippy::unwrap_used))]` is present in the crate and `cargo clippy` passes with zero unwrap violations in production code
  2. bridge.rs dispatcher entry point is wrapped in `catch_unwind`; panics are caught and returned as an error JSON response rather than crashing the process
  3. All 133 former `.unwrap()` sites in bridge.rs and store.rs return `Result<_, GooseError>` with a specific error variant; `cargo test --locked` passes

**Plans**: 6 plans

Plans:

- [x] 85-01-PLAN.md — Add deny(clippy::unwrap_used) to lib.rs + per-module allow shields; convert bridge.rs test unwraps to expect
- [x] 85-02-PLAN.md — Convert store.rs test unwraps to expect; remove store.rs allow shield
- [x] 85-03-PLAN.md — Fix 3 metrics.rs production unwrap sites; convert tests; remove allow shield
- [x] 85-04-PLAN.md — Convert capabilities.rs test unwraps to expect; remove allow shield
- [x] 85-05-PLAN.md — Fix 2 production unwrap sites (energy_rollup, step_discovery); convert small-file tests; remove allow shields
- [x] 85-06-PLAN.md — Gate: cargo clippy --lib -D unwrap_used = 0; verify catch_unwind exists; cargo test --locked passes

### Phase 86: bridge.rs Split + Protocol Comments

**Goal**: bridge.rs is a thin router (≤ 100 lines) delegating to per-domain handler files; every WHOOP wire-format decode site carries an offset comment explaining the protocol layout
**Depends on**: Phase 85
**Requirements**: ARCH-01, COMM-01
**Success Criteria** (what must be TRUE):

  1. bridge.rs is reduced to a routing layer (≤ 100 lines); domain handlers exist as separate files (`bridge/metrics.rs`, `bridge/sleep.rs`, `bridge/capture.rs`, `bridge/activity.rs`, `bridge/debug.rs`)
  2. `BridgeRouter` trait (or equivalent dispatch mechanism) is defined and all 509 former match arms are handled via domain files
  3. Each WHOOP wire-format decode site (Event-48 battery layout, cmd 26 response, R22 battery_pct field) carries a comment with byte offsets, data type, empirical verification date, and source reference
  4. `cargo test --locked` passes with the reorganised module structure; no regressions in existing tests

**Plans**: 6 plans

**Wave 1**

- [x] 86-01-PLAN.md — Create bridge/ skeleton: bridge/mod.rs router + 5 empty domain stubs, delete bridge.rs (Wave 1)

**Wave 2** *(blocked on Wave 1)*

- [x] 86-02-PLAN.md — Fill metrics.rs, sleep.rs, capture.rs domain handlers (Wave 2)
- [x] 86-03-PLAN.md — Fill activity.rs, debug.rs + validation.* alias arms (Wave 2)

**Wave 3** *(blocked on Wave 2)*

- [x] 86-04-PLAN.md — Update include_str! self-scanner test to multi-file concatenation (Wave 3)

**Wave 4** *(blocked on Wave 3)*

- [x] 86-05-PLAN.md — COMM-01 protocol offset comments: 11 sites in protocol.rs + 3 in bridge/metrics.rs (Wave 4)

**Wave 5** *(blocked on Wave 4)*

- [x] 86-06-PLAN.md — Gate: cargo test --locked + cargo clippy --lib + human checkpoint (Wave 5)

### Phase 87: store.rs Split

**Goal**: store.rs 140 public methods are reorganised into domain stores that share a connection; the schema version is validated on every SQLite open
**Depends on**: Phase 86
**Requirements**: ARCH-02
**Success Criteria** (what must be TRUE):

  1. Domain stores exist as separate files (`store/sleep.rs`, `store/capture.rs`, `store/metrics.rs`, `store/activity.rs`) sharing `Arc<Connection>`
  2. Runtime schema version validation runs on SQLite open and returns an error if the on-disk schema version does not match the expected version
  3. All existing Rust integration tests pass (`cargo test --locked`) with the reorganised store module; no public API regressions visible to Swift

**Plans**: 6 plans

**Wave 1**

- [ ] 87-01-PLAN.md — Create store/ skeleton: store/mod.rs (Arc<Mutex<Connection>>, immediate_transaction fix), git rm store.rs, update capture_import.rs + bridge call sites, 4 empty domain stubs (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 87-02-PLAN.md — Move 13 sleep methods to store/sleep.rs (Wave 2, parallel)
- [ ] 87-03-PLAN.md — Move 25 capture methods to store/capture.rs (Wave 2, parallel)
- [ ] 87-04-PLAN.md — Move ~49 metrics methods to store/metrics.rs (Wave 2, parallel)
- [ ] 87-05-PLAN.md — Move 49 activity methods to store/activity.rs (Wave 2, parallel)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 87-06-PLAN.md — Gate: cargo test --locked + cargo clippy --lib + human checkpoint (Wave 3)

### Phase 88: Swift Ownership — HealthDataStore

**Goal**: HealthDataStore is owned by GooseAppModel with a strong reference; AppShellView no longer creates or owns the store; circular back-references are eliminated
**Depends on**: Phase 82
**Requirements**: ARCH-04
**Success Criteria** (what must be TRUE):

  1. `GooseAppModel` holds `let healthStore: HealthDataStore` as a strong reference initialised during model init
  2. `AppShellView` no longer declares `@StateObject private var healthStore`; it receives the store via `.environmentObject(model.healthStore)` injected from `GooseSwiftApp`
  3. Weak back-references from HealthDataStore to GooseAppModel and all circular closures are eliminated; the iOS build compiles without new warnings

**Plans**: 2 plans
Plans:

- [ ] 88-01-PLAN.md — Transfer HealthDataStore ownership into GooseAppModel; wire environmentObject
- [ ] 88-02-PLAN.md — Convert all child views from parameter to @EnvironmentObject

**UI hint**: yes

### Phase 89: BLE Actor Refactor

**Goal**: GooseBLEClient is replaced by a BLETransport protocol and BLESessionCoordinator actor; all Gen4/Gen5 capability branching is centralised in DeviceCatalog
**Depends on**: Phase 83, Phase 88
**Requirements**: ARCH-05
**Success Criteria** (what must be TRUE):

  1. `BLETransport` protocol exists with `CoreBluetoothBLETransport` as the concrete implementation; `GooseBLEClient` is either renamed or replaced
  2. `BLESessionCoordinator` actor manages session lifecycle; BLE callbacks are dispatched through the actor isolation boundary
  3. `DeviceCatalog` struct centralises all Gen4/Gen5 branching — no `if capabilities.historicalSync == .pageSequence` guards scattered across extension files
  4. The iOS build compiles without new warnings; existing BLE session behaviour is unchanged from the user's perspective

**Plans**: 3 plans
Plans:

- [ ] 89-01-PLAN.md — BLETransport protocol + rename GooseBLEClient → CoreBluetoothBLETransport (13 files)
- [ ] 89-02-PLAN.md — BLESessionCoordinator actor + GooseAppModel.ble → any BLETransport
- [ ] 89-03-PLAN.md — DeviceCatalog struct + replace Gen4/Gen5 capability guards

### Phase 90: Domain ViewModels

**Goal**: GooseAppModel is decomposed into domain-scoped Observable objects so high-frequency BLE updates do not invalidate unrelated SwiftUI views
**Depends on**: Phase 88, Phase 89
**Requirements**: ARCH-06
**Success Criteria** (what must be TRUE):

  1. `BLEState`, `SyncState`, and `HealthState` exist as separate `@Observable` objects; SwiftUI views import only the domain object they need
  2. High-frequency BLE HR updates (1 Hz) no longer trigger redraws in views that only observe `SyncState` or `HealthState`
  3. The iOS build compiles without new warnings; all existing UI screens remain functional

**Plans**: 4 plans
Plans:

- [ ] 90-01-PLAN.md — Create BLEState.swift, SyncState.swift, HealthState.swift + register in Xcode project
- [ ] 90-02-PLAN.md — Migrate GooseAppModel.swift: remove 36 var properties, add 3 domain object lets
- [ ] 90-03-PLAN.md — Update GooseAppModel extension files to write through domain objects
- [ ] 90-04-PLAN.md — Inject domain objects in GooseSwiftApp, update view files, build gate

**UI hint**: yes

### Phase 91: Threading & Algorithm Comments

**Goal**: Threading invariants and algorithm coefficients are documented at their source in Swift and Rust so future contributors understand the synchronisation model and the empirical basis of each constant
**Depends on**: Phase 87
**Requirements**: COMM-02, COMM-03
**Success Criteria** (what must be TRUE):

  1. `GooseRustBridge` usage sites and the frame reassembly buffer carry comments explaining: synchronous FFI contract, multiple-instance pattern, `@MainActor` dispatch requirement, and `NSLock` guard scope
  2. `metric_features.rs` carries comments for Banister eTRIMP (1.92/1.67 coefficients), EWMA alpha (0.0483 = 14-night half-life), and Cole-Kripke scale (0.001), each with bibliographic reference
  3. The iOS build and `cargo test --locked` pass clean; no source changes beyond comment additions

**Plans**: 2 plans

Plans:

- [ ] 91-01-PLAN.md — Swift threading invariant comments (COMM-02): GooseRustBridge, CaptureFrameWriteQueue, OvernightSQLiteMirrorQueue, GooseAppModel
- [ ] 91-02-PLAN.md — Rust algorithm coefficient comments (COMM-03): Banister eTRIMP, EWMA alpha, Cole-Kripke scale

</details>

## v13.0 Bug Fixes, Protocol Reliability, Device Coverage & HealthKit Export (Phases 92–97)

### Phase Details

#### Phase 92: Export & Auth Bug Fixes

**Goal**: Export pipeline no longer OOMs on large databases; WHOOP 5.0 auth stuck state surfaces a clear recovery path
**Depends on**: Phase 91
**Requirements**: BUG-AUTH-01, BUG-EXP-01, BUG-EXP-02, BUG-EXP-03, BUG-EXP-04
**Success Criteria** (what must be TRUE):

  1. Export on a > 100 MB database completes without crash — validation pipeline passes manifest by reference, not serialised object
  2. `runFullRawExport()` does not override `includeRawBytes = false`
  3. `validate()` is called once inside `createBundle()` — redundant call removed
  4. "Include Database" button is disabled when SQLite file exceeds 20 MB
  5. WHOOP 5.0 that exhausts 12 auth retries surfaces a "Reconnect WHOOP" prompt and stops retrying
  6. iOS build compiles without new warnings

**Plans**:
1/3 plans executed

- [x] 92-02-PLAN.md — Fix export defaults + disable OOM-risk button (BUG-EXP-02, BUG-EXP-04)
- [x] 92-03-PLAN.md — Fix WHOOP 5.0 auth stuck state recovery (BUG-AUTH-01)

---

#### Phase 93: HR Data Investigation & Protocol Cleanup

**Goal**: Root cause of no HR data on WHOOP 5.0 fw 50.38.1.0 identified and fixed; protocol.rs PACKET_TYPE constants replaced with enum; silent parse drops eliminated
**Depends on**: Phase 91
**Requirements**: BUG-HR-01, PROTO-08, PROTO-09, PROTO-10, PROTO-11
**Success Criteria** (what must be TRUE):

  1. WHOOP 5.0 firmware 50.38.1.0 successfully streams HR data in the app
  2. `PACKET_TYPE_*` u16 constants replaced with a Rust enum; all match sites are exhaustive
  3. `parse_data_packet_body_summary` has no silent wildcard arm — unhandled packet_k values produce a warning string
  4. Every packet type in `data_packet_domain()` has a corresponding parse arm in `parse_data_packet_body_summary()`
  5. Bridge routing uses a central dispatch registry; `CommandDefinition` array is in sync
  6. `cargo test --locked` passes clean

**Plans**: 3 plans

Plans:

- [x] 93-01-PLAN.md — Fix BUG-HR-01: add R22Whoop5Hr arm to heart_rate_plan_from_row + r22_whoop5_hr to trusted_frames (Wave 1)
- [x] 93-02-PLAN.md — Introduce PacketType enum, delete 17 PACKET_TYPE_* constants, migrate 5 match sites (Wave 1)
- [x] 93-03-PLAN.md — Unknown variant in DataPacketBodySummary, replace wildcard, COMMAND_DEFINITIONS registry test (Wave 2)

---

#### Phase 94: Gen4 Protocol Completeness

**Goal**: WHOOP 4.0 users see respiratory rate and skin temperature in Recovery; Gen4 historical sync completes without dropping packet47 bodies
**Depends on**: Phase 93
**Requirements**: GEN4-06, SYNC-07
**Success Criteria** (what must be TRUE):

  1. `MetricFeatures.respiratory_rate_rpm` and `skin_temp_delta_c` are populated from Gen4 packet bytes — not `None`
  2. Gen4 historical sync on service UUID `61080005` produces packet47 body rows in SQLite — no bodies dropped
  3. `cargo test --locked` passes clean; Rust test fixtures updated for new parse paths

**Plans**:

- [x] 94-01-PLAN.md — Gen4 recovery metric parsing: respiratory_rate + skin_temp byte offsets in Rust (GEN4-06)
- [x] 94-02-PLAN.md — Gen4 packet47 page_sequence reassembly fix (SYNC-07)

---

#### Phase 95: WHOOP MG DeviceKind

**Goal**: WHOOP MG devices are identified as a separate DeviceKind; sync no longer fails with generic Whoop5 capabilities
**Depends on**: Phase 83 (DeviceKind infrastructure)
**Requirements**: MG-01, MG-02
**Success Criteria** (what must be TRUE):

  1. `DeviceKind::WhoopMg` exists in Rust capabilities.rs with `DeviceCapabilities` reflecting MG-specific flags
  2. `DeviceType::MG` (or equivalent) maps to `DeviceKind::WhoopMg` in `protocol.rs`
  3. iOS app parses WHOOP MG BLE advertisement and sets `connectedCapabilities` to WhoopMg
  4. Device view shows "WHOOP MG" label for MG devices; no regression on Whoop4/Whoop5 identification
  5. `cargo test --locked` passes clean

**Plans**: 2/2 plans complete

Plans:

- [x] 95-01-PLAN.md — Add DeviceKind::WhoopMg to Rust capabilities.rs + remap Maverick in protocol.rs (MG-01)
- [x] 95-02-PLAN.md — Swift: 3-way MG BLE detection + deviceKind bridge field + connectedDeviceGeneration label (MG-02)

---

#### Phase 96: Best Practices Gaps

**Goal**: Critical data paths no longer silently swallow bridge errors; Rust core uses a connection pool
**Depends on**: Phase 91
**Requirements**: BP-01, BP-02
**Success Criteria** (what must be TRUE):

  1. All 9 silent `try?` bridge calls in Swift replaced with `do/catch` + `ble.record(level: .error, ...)` — failures are logged
  2. Rust core opens SQLite via a connection pool — per-request `Connection::open()` calls eliminated in bridge handlers
  3. iOS build compiles without new warnings; `cargo test --locked` passes clean

**Plans**:

1/2 plans executed

- [x] 96-02-PLAN.md — Rust SQLite connection pool (BP-02)

---

#### Phase 97: HealthKit Export — Bevel Integration

**Goal**: WHOOP metrics written to HealthKit automatically; Bevel and other apps can read WHOOP data via HealthKit
**Depends on**: Phase 96 (bridge error handling in place before new HK write paths)
**Requirements**: HK-01, HK-02, HK-03, HK-04, HK-05
**Success Criteria** (what must be TRUE):

  1. HR samples captured from WHOOP appear in Health app under Heart Rate source "Goose"
  2. HRV (RMSSD or SDNN), SpO2, and sleep session data appear in Health app under respective categories
  3. HealthKit write is controlled by a toggle in More settings (default off); no data written without user opt-in
  4. Write errors are logged — HK permission denied is handled gracefully without crash
  5. iOS build compiles without new warnings; existing HealthKit read functionality unaffected

**Plans**: 4/4 plans complete

**Wave 1** (parallel)

- [x] 97-01-PLAN.md — Rust bridge methods: store.hr_samples_between, store.spo2_samples_between (inline SpO2), store.external_sleep_sessions_between (HK-01, HK-03, HK-04)
- [x] 97-04-PLAN.md — More settings toggle: @AppStorage goose.healthkit.export.enabled + UI in Section("Apple Health") + write gating (HK-05)

**Wave 2** (blocked on Wave 1)

- [x] 97-02-PLAN.md — GooseHealthKitExporter.swift: HKHealthStore setup, requestAuthorization, write helpers for HR/HRV/SpO2/sleep, project.pbxproj registration (HK-01..HK-05)

**Wave 3** (blocked on Wave 2)

- [x] 97-03-PLAN.md — Trigger integration: exportAfterSleepSync() call at end of syncBandSleepHistory() + enableHealthKitExport() full impl + permission-denied recovery (HK-01..HK-05)

---

<details>
<summary>✅ v14.0 Android Port, BLE Reliability & Protocol Depth (Phases 98–111) — SHIPPED 2026-06-21</summary>

Full details: `.planning/milestones/v14.0-ROADMAP.md`

Key: Android port (Kotlin/Compose + JNI + BLE + historical sync + metrics + CI), Gen5/Gen4 historical sync fixes (SYNC-08/09/10/11), BLE reliability (MTU 247 + LE 2M PHY + off-wrist), battery level all generations, WHOOP MG hardened, 0 production unwraps in Rust, SQLite connection pool (r2d2), protocol offset + FFI SAFETY comments.

Known deferred: hardware-gated BLE tests; real-device MG sync validation; ARCH-04/05/06 (HealthDataStore ownership, BLESessionCoordinator actor, Domain ViewModels)

</details>

## v15.0 Protocol Depth, Algorithms & UX (Phases 112–126)

### Phase Summary

- [x] **Phase 112: Optical Protocol Decode (v20/v21/v26)** — Rust parse variants for WHOOP 5.0 bulk sensor streams and 24 Hz PPG waveform (completed 2026-06-22)
- [x] **Phase 113: Optical Schema & Bridge** — schema v24 for optical_channel_samples + device_feature_flags + body_composition_history + realtime_frames (single migration batch) plus bridge methods and cargo test gate (completed 2026-06-22)
- [x] **Phase 114: Harvard Sleep Need Model** — sleep_need.rs algorithm + replace hardcoded 480 constant (completed 2026-06-23)
- [x] **Phase 115: Feature Flag Discovery** — GET_FF_VALUE BLE command + DeviceCapabilities.feature_flags + device_feature_flags table (completed 2026-06-23)
- [x] **Phase 116: Body Composition Rust Layer** — body_composition_history table + bridge methods (completed 2026-06-24)
- [x] **Phase 117: Android Optical Routing** — WhoopBleClient packet_k 20/21/26 forwarding for Android parity (completed 2026-06-24)
- [x] **Phase 118: PIP Realtime Queue** — RealtimePIPQueue Swift class + realtime_frames table bridge consumer (completed 2026-06-26)
- [x] **Phase 119: Stealth Mode** — GooseStealthMode + StealthMask + CoachLocalToolContext filter (completed 2026-06-26)
- [x] **Phase 120: Sleep Need UI** — Sleep dashboard dynamic need display (replaces static "8h recommended") (completed 2026-06-27)
- [x] **Phase 121: Body Composition UI** — BodyCompositionEntrySheet + HealthKit weight import + trend chart (completed 2026-06-27)
- [x] **Phase 122: Stealth UI** — Settings toggle list + dashboard "—" rendering (completed 2026-06-27)
- [x] **Phase 123: Real-Device Algorithm Validation** — ≥7 real WHOOP 5 overnight sessions for HRV and sleep staging (completed 2026-06-28)
- [x] **Phase 124: PIP Server Endpoint** — POST /v1/ingest-realtime + TimescaleDB hypertable (completed 2026-06-28)
- [x] **Phase 125: Cap Sense UUID Discovery** — BLE scan to identify capacitive sense GATT UUID + subscribe (completed 2026-06-28)
- [x] **Phase 126: Wake-Window Engine (HAP-04)** — fill GooseWakeWindowManager stub (hardware+RE gated) (completed 2026-06-28)

### Phase Details

#### Phase 112: Optical Protocol Decode (v20/v21/v26)

**Goal**: WHOOP 5.0 type-47 v20/v21 multi-channel and v26 PPG waveform packets are parsed in protocol.rs instead of silently falling to Unknown
**Depends on**: Phase 111
**Requirements**: OPT-01, OPT-02
**Success Criteria** (what must be TRUE):

  1. `DataPacketBodySummary::V20V21OpticalMultiChannel` variant exists; packet_k 20 and 21 decode presence-byte logic (0x19=active, 0x00=empty) and 3×100-sample i16 arrays without panicking on a valid synthetic payload
  2. `DataPacketBodySummary::V26PpgWaveform` variant exists; packet_k 26 decodes 24×LE-i16 at offsets [27:74] with ppg_channel gated 1–26; integration test with synthetic 88 B payload passes
  3. WHY comments at all new byte offsets; `cargo test --locked` passes clean with no regression in existing protocol tests
  4. No silent wildcard fallthrough for packet_k 20, 21, or 26 — all three route to named variants in `parse_data_packet_body_summary`

**Plans**: 2/2 plans complete
Plans:

- [x] 112-01-PLAN.md — V26PpgWaveform variant + parse_v26_ppg_body + synthetic 88B fixture tests (OPT-02)
- [x] 112-02-PLAN.md — V20V21OpticalMultiChannel variant + OpticalChannel struct + parse_v20v21_optical_body + synthetic v20/v21 fixture tests (OPT-01)

**Dependencies**: Pure Rust — no Swift or Android changes in this phase

---

#### Phase 113: Schema v24 + Optical Bridge Methods

**Goal**: A single schema v24 migration creates all four new tables (optical_channel_samples, device_feature_flags, body_composition_history, realtime_frames), bridge insert/query methods are registered, and `cargo test --locked` passes as the gate for all subsequent Swift consumer phases
**Depends on**: Phase 112
**Requirements**: OPT-03, FF-03, BODY-01 (schema only), PIP-02 (schema only)
**Success Criteria** (what must be TRUE):

  1. `CURRENT_SCHEMA_VERSION = 24` in store.rs; migration block creates all four tables in a single transaction; the schema version guard on open returns an error for any on-disk version below 24
  2. `biometrics.insert_v20v21_batch` and `biometrics.insert_v26_batch` bridge methods insert rows into `optical_channel_samples`; range query methods return rows by (device_uuid, ts range)
  3. `BRIDGE_METHODS` constant is updated; `bridge_methods_constant_matches_dispatcher` test passes
  4. `cargo test --locked` passes clean — this is the green gate before any Swift consumer work begins

**Plans**: 0/1 plans executed
Plans:

- [ ] 113-01-PLAN.md — Schema v24 migration (4 tables) + optical bridge methods + capabilities bridge + integration tests

---

#### Phase 114: Harvard Sleep Need Model

**Goal**: The Harvard sleep need model (age-bracket baseline + EWMA debt + strain adjustment) replaces the hardcoded 480-minute constant throughout the Rust codebase
**Depends on**: Phase 113
**Requirements**: SLP-NEED-01, SLP-NEED-02
**Success Criteria** (what must be TRUE):

  1. `sleep_need.rs` exists with `compute_sleep_need(age_years, 5-night history, prior_strain) -> SleepNeedResult`; age-bracket baselines (18–25: 8h, 26–64: 7.5h, 65+: 7h) are correct; Rust unit tests cover cold-start, each age bracket, and strain adjustment thresholds
  2. The hardcoded `480.0` constant in `SleepFeatureScoreOptions` and `RecoveryFeatureScoreOptions` is replaced with a bridge call to `sleep.compute_need`; `age_years: Option<u8>` is accepted in the options struct
  3. `bridge_methods_constant_matches_dispatcher` test passes; `cargo test --locked` passes clean

**Plans**: 2/2 plans complete

- [x] 114-01-PLAN.md — sleep_need.rs algorithm module: compute_sleep_need + compute_sleep_need_with_store + SleepNeedResult (SLP-NEED-01, Wave 1)
- [x] 114-02-PLAN.md — sleep.compute_need bridge method + replace hardcoded 480.0 at 4 call sites (SLP-NEED-02, Wave 2)

---

#### Phase 115: Feature Flag Discovery (GET_FF_VALUE)

**Goal**: The app discovers WHOOP device feature flags by sending GET_FF_VALUE (cmd 0x80) after handshake and storing results in SQLite and DeviceCapabilities
**Depends on**: Phase 113
**Requirements**: FF-01, FF-02, FF-03
**Success Criteria** (what must be TRUE):

  1. `GET_FF_VALUE` (cmd 0x80) is sent from Swift after `GET_HELLO` handshake completes; a 3-second timeout triggers fallback to `DeviceKind`-derived `DeviceCapabilities` if no response arrives
  2. The response is parsed into `DeviceCapabilities.feature_flags: [UInt8: UInt8]`; raw index→value is stored without semantic name claims; the flag map is visible in the Debug tab
  3. `device_feature_flags` table exists (schema v24 already landed in Phase 113); `capabilities.get_feature_flags` bridge method inserts and retrieves rows; `BRIDGE_METHODS` updated

**Plans**: 2/2 plans complete

- [x] 115-01-PLAN.md — Swift: add DeviceCapabilities.featureFlags + send GET_FF_VALUE in handshake with 3s timeout + parse response + bridge upsert (FF-01, FF-02)
- [x] 115-02-PLAN.md — Swift: display feature flags in Debug tab Runtime section as hex pairs / "None discovered" (FF-02, FF-03)

**UI hint**: yes

---

#### Phase 116: Body Composition Rust Layer

**Goal**: The Rust bridge can upsert and query body composition records; the schema v24 table is the single source of truth for weight, BMI, body fat, and muscle mass history
**Depends on**: Phase 113
**Requirements**: BODY-01
**Success Criteria** (what must be TRUE):

  1. `body_composition_history` table exists (schema v24 already landed in Phase 113); UNIQUE(source, date) constraint is enforced; INSERT OR REPLACE semantics work for healthkit-sourced rows
  2. `body_composition.upsert` and `body_composition.history_between` bridge methods are registered in `BRIDGE_METHODS` and the dispatcher; `cargo test --locked` passes with at least one test per method
  3. `source` column accepts only 'manual', 'healthkit', or 'scale' (CHECK constraint); inserting an invalid source returns an error, not a panic

**Plans**: 1/1 plans complete

- [x] 116-01-PLAN.md — Store methods + bridge module (body_composition.upsert / history_between) + BRIDGE_METHODS wiring + round-trip tests

---

#### Phase 117: Android Optical Routing

**Goal**: Android WhoopBleClient forwards packet_k 20, 21, and 26 frames to GooseBridge.safeHandle() achieving parity with the iOS v15.0 optical decode path
**Depends on**: Phase 112
**Requirements**: OPT-04
**Success Criteria** (what must be TRUE):

  1. `WhoopBleClient.kt` routing table handles packet_k 20, 21, and 26 — frames are forwarded to `GooseBridge.safeHandle()` rather than discarded or logged as unknown
  2. The existing Android CI APK build (`android-core.yml`) compiles without new warnings or errors after the routing change
  3. Unit test or log assertion confirms that a synthetic v20/v21/v26 frame received by `FrameReassembler` reaches the bridge call

**Plans**: 1/1 plans complete

- [x] 117-01-PLAN.md — Add optical enable commands (107/108) to Gen5/MG handshake + JVM routing tests

---

#### Phase 118: PIP Realtime Queue

**Goal**: A dedicated Swift queue tags BLE frames as FRAME_SOURCE_REALTIME and inserts them into the realtime_frames SQLite table via bridge, keeping realtime capture isolated from historical capture
**Depends on**: Phase 113
**Requirements**: PIP-01, PIP-02, PIP-03
**Success Criteria** (what must be TRUE):

  1. `RealtimePIPQueue` Swift class exists as a parallel to `CaptureFrameWriteQueue` with its own `NSLock` and `writeQueue`; frames are tagged `FRAME_SOURCE_REALTIME` before insertion
  2. Realtime frames land in `realtime_frames` (schema v24, already present from Phase 113); `synced = 0` on insert; a covering index on (device_uuid, captured_at) exists
  3. `CaptureFrameWriteQueue` and `RealtimePIPQueue` are distinct — no shared queue or table; backpressure accounting is independent
  4. `realtime.insert_frame` bridge method persists frames into a corrected `realtime_frames` table (schema bug fixed, `source` column added)
  5. `POST /v1/ingest-realtime` endpoint (Bearer auth) ingests realtime frames into a `realtime_frames` TimescaleDB hypertable (PIP-03)

**Plans**: 3/3 plans complete

- [x] 118-01-PLAN.md — Rust schema fix + `realtime.insert_frame` bridge method (Wave 1)
- [x] 118-02-PLAN.md — Swift `RealtimePIPQueue` + always-on notification wiring (Wave 2, depends on 118-01)
- [x] 118-03-PLAN.md — `POST /v1/ingest-realtime` endpoint + TimescaleDB hypertable (Wave 2, depends on 118-01)

---

#### Phase 119: Stealth Mode (Rust + Swift core)

**Goal**: Per-metric UserDefaults toggles suppress individual metric values from dashboard views and replace them with a sentinel in Coach context so the LLM cannot read hidden values
**Depends on**: Phase 111
**Requirements**: STEALTH-01, STEALTH-02
**Success Criteria** (what must be TRUE):

  1. `GooseStealthMode.isHidden(metric:)` exists with `StealthStorage` enum holding `static let` UserDefaults keys for all 6 metrics (recovery_score, strain_score, hrv_rmssd, resting_hr, sleep_performance, stress_score)
  2. `StealthMask` value type is passed into `CoachLocalToolContext.build()`; hidden metric values are replaced with `"hidden_by_user"` sentinel string (key preserved); Coach still receives full unmasked data for recommendations
  3. Neither class reads UserDefaults with ad-hoc string literals — all key references go through `StealthStorage` constants

**Plans**: 1/1 plans complete

Plans:

- [x] 119-01-PLAN.md — StealthStorage + GooseStealthMode + StealthMask + CoachLocalToolContext masking + CoachChatModel call sites

---

#### Phase 120: Sleep Need UI

**Goal**: The Sleep dashboard displays a dynamic nightly sleep need derived from the Harvard model instead of the static "8h recommended" label
**Depends on**: Phase 114
**Requirements**: SLP-NEED-03
**Success Criteria** (what must be TRUE):

  1. Sleep dashboard shows `SleepNeedResult.total_need_minutes` expressed as hours and minutes (e.g. "7h 45m recommended tonight")
  2. An optional breakdown row shows base / debt / strain components when available; the label is absent when the bridge call returns an error or no history exists
  3. The iOS build compiles without new warnings; SwiftUI `#Preview` macro compiles in DEBUG

**Plans**: 1 plan

- [x] 120-01-PLAN.md — DynamicSleepNeed model, bridge call, hkUserAge fix, fallback replacement, all three display sites

**UI hint**: yes

---

#### Phase 121: Body Composition UI + HealthKit Import

**Goal**: Users can manually log body composition entries and import HealthKit weight history; both appear on a trend chart in the Health tab
**Depends on**: Phase 116
**Requirements**: BODY-02, BODY-03
**Success Criteria** (what must be TRUE):

  1. `BodyCompositionEntrySheet` appears in the Health tab; user can enter weight, body fat %, and muscle mass; tapping Confirm calls `body_composition.upsert` via bridge with source='manual'
  2. HealthKit import reads `HKQuantityTypeIdentifierBodyMass` and `HKQuantityTypeIdentifierBodyFatPercentage`; rows are written with source='healthkit' using INSERT OR REPLACE
  3. A weight sparkline or trend chart in the Health tab renders at least 7 days of history when data is present; the chart is absent (not crashed) when no data exists

**Plans**: 1/1 plans complete
Plans:

- [x] 121-01-PLAN.md — HealthDataStore+BodyComposition, BodyCompositionEntrySheet, HealthBodyCompositionSection, HealthView wiring, pbxproj registration

**UI hint**: yes

---

#### Phase 122: Stealth UI

**Goal**: A Settings → Metrics toggle list lets users hide individual metrics; dashboard views render "—" for hidden metrics at the view layer
**Depends on**: Phase 119
**Requirements**: STEALTH-03, STEALTH-04
**Success Criteria** (what must be TRUE):

  1. Settings → Metrics section lists all 6 stealth-eligible metrics with Toggle controls backed by `StealthStorage` UserDefaults keys (no ad-hoc string literals)
  2. All dashboard views that render stealth-eligible metric values call `GooseStealthMode.isHidden(metric:)` at the render site and display "—" when the metric is hidden
  3. `#if DEBUG` previews use `StealthMask` environment value rather than direct UserDefaults reads; SwiftUI preview compiles clean

**Plans**: 1/1 plans complete
**UI hint**: yes

---

#### Phase 123: Real-Device Algorithm Validation (VAL-HRV-04, VAL-SLP-04)

**Goal**: RMSSD and 4-class sleep staging are cross-validated on ≥7 real WHOOP 5 overnight sessions, closing the hardware-gated validation items open since v5.0
**Depends on**: Phase 111
**Requirements**: VAL-HRV-04, VAL-SLP-04
**Success Criteria** (what must be TRUE):

  1. RMSSD delta vs the Python reference pipeline is ≤1 ms on all ≥7 real overnight sessions; validation fixtures (synthetic equivalents) are committed to `Rust/core/tests/`
  2. 4-class sleep staging concordance is ≥70% on all ≥7 real overnight sessions; results are documented as a validation artifact in `.planning/phases/123-*/`
  3. `cargo test --locked` passes with the new Rust fixture tests; no algorithm coefficients or constants were changed to force concordance

**Plans**: 1 plan

- [x] 123-01-PLAN.md — Add ≥6 HRV + ≥4 sleep synthetic fixtures; write 123-VALIDATION-ARTIFACT.md

---

#### Phase 124: PIP Server Endpoint

**Goal**: The server accepts realtime BLE frames via POST /v1/ingest-realtime and stores them in a TimescaleDB hypertable
**Depends on**: Phase 118
**Requirements**: PIP-03
**Success Criteria** (what must be TRUE):

  1. `POST /v1/ingest-realtime` endpoint exists in the FastAPI server with Bearer token auth matching the pattern of `/v1/ingest-frames`; the endpoint returns 200 on valid payloads and 401 on missing/invalid auth
  2. `realtime_frames` TimescaleDB hypertable is created on first deploy; time-partitioned on `captured_at`; existing server tests pass
  3. The endpoint rejects payloads missing `device_uuid` or `frame_hex` with a 422 response; pytest test suite confirms all three cases

**Plans**: TBD

---

#### Phase 125: Cap Sense UUID Discovery

**Goal**: Parse EVENTS_FROM_STRAP (fd4b0004) notifications to detect cap sense on-wrist state. Document the UUID + event codes. Add Debug tab display.
**Depends on**: Phase 111
**Requirements**: CAPSENSE-01
**Success Criteria** (what must be TRUE):

  1. The GATT characteristic UUID for the WHOOP 5 capacitive sense sensor is identified and documented in `.planning/research/whoop-5/CAPSENSE-UUID.md` (resolved: fd4b0004-cce1-4033-93ce-002d5875f58a, event types 10/11)
  2. Swift handles event types 10 (STRAP_DETECTED) and 11 (STRAP_REMOVED) from fd4b0004 notifications; `isOnWrist` is updated in real time — distinct from the cmd 0x54 BLE-02 path already in production
  3. The Debug tab (More → Developer → WHOOP Event Signals) shows the cap sense state and UUID label; no regression in existing cmd 0x54 detection

**Plans**: 1/1 plans complete

- [x] 125-01-PLAN.md — Add handleCapSenseEventValue, fan-in to handlePeripheralValueUpdate, Debug tab row, and CAPSENSE-UUID.md documentation

**UI hint**: yes

---

#### Phase 126: Wake-Window Engine (HAP-04)

**Goal**: GooseWakeWindowManager stub is filled with the wake-window algorithm using the confirmed SetAlarmInfoCommandPacketRev4 wire format
**Depends on**: Phase 111, `.planning/research/whoop-re/SetAlarmInfoCommandPacketRev4.md` existing
**Requirements**: HAP-04
**Success Criteria** (what must be TRUE):

  1. `SetAlarmInfoCommandPacketRev4.md` exists in `.planning/research/whoop-re/` with confirmed byte layout before any implementation begins
  2. `GooseWakeWindowManager` sends the correct alarm command payload using the confirmed wire format; BTSnoop capture of `STRAP_DRIVEN_ALARM_EXECUTED` confirms the device fires at the target window
  3. HAP-03 smart alarm UI (Phase 73) continues to function — no regression; the wake-window engine is activated only when the RE prerequisite file is present

**Note**: **DEFERRED TO v16.0** if `.planning/research/whoop-re/SetAlarmInfoCommandPacketRev4.md` does not exist at execution time. Do not begin implementation tasks for this phase until that file is confirmed present.

**Plans**: 1/1 plans complete

## v17.0 — Algorithm Depth & Noop Feature Parity (Phases 140–150)

**Goal:** Port validated health scoring algorithms into the Rust core (Baselines EWMA, HRVAnalyzer, StrainScorer, RecoveryScorer, DaytimeStress) and reach UI/UX feature parity with noopApp — Recovery Ring, Strain Gauge, sparklines, sleep hypnogram, workout detail, metric explorer — plus BLE protocol expansion, the R22 deep-stream unlock, and strap notification mirroring.

**Phase numbering:** v15.0 ended at Phase 126. v16.0 (Android UI parity milestone) reserves Phases 127–139. v17.0 starts at Phase 140 to leave that block untouched.

**Strategic ordering note:** Phase 140 (Baselines EWMA) is the keystone — RecoveryScorer (Phase 143) and DaytimeStress consume personal baselines, so the tracker must exist first. All algorithm phases (140–143) are pure Rust core and therefore ship to Android for free; no separate Android work is scheduled in v17.0. UI phases (144–147) are iOS-only this milestone — Android UI parity is v18.0 scope.

### Phase Summary

- [ ] **Phase 140: Baselines EWMA Tracker** — Rust core personal baseline engine (14-night half-life, Winsor ±3σ, tiered confidence) — keystone
- [ ] **Phase 141: HRVAnalyzer Upgrade** — Malik ectopic filter + SDNN + pNN50 + sufficiency gate in the HRV pipeline
- [ ] **Phase 142: StrainScorer** — Karvonen %HRR + Edwards 5-zone TRIMP + Tanaka HRmax 0-100 strain
- [ ] **Phase 143: RecoveryScorer + DaytimeStress** — 2-factor recovery composite + per-hour stress timeline on personal baselines
- [ ] **Phase 144: Visual Components** — Recovery Ring, Strain Gauge, 14-day sparklines on Health cards
- [ ] **Phase 145: Sleep UI** — hypnogram timeline + 14-night sleep debt ledger + multi-night navigation
- [ ] **Phase 146: Workout UI** — live in-app workout view + past-workout detail view
- [ ] **Phase 147: Data Exploration** — Metric Explorer + Compare overlay (2-4 metrics)
- [ ] **Phase 148: BLE Protocol Expansion** — cmds 0x62/0x07/0x7A + Gen5/MG 20-byte alarm payload
- [ ] **Phase 149: R22 Deep Stream Unlock** — cmd 0x78 15-flag sequence, DeviceCatalog-gated (Gen5/MG only) — high risk
- [ ] **Phase 150: Strap Notification Mirroring** — CTCallCenter + internal Goose events → strap buzz, with settings + test button

### Phase Details

#### Phase 140: Baselines EWMA Tracker

**Goal**: The Rust core computes and persists each user's personal metric baselines via EWMA so downstream recovery and stress scores are personalised, and the UI can show how mature each baseline is.
**Depends on**: Phase 111 (last shipped Rust milestone foundation)
**Requirements**: ALG-BASE-01, ALG-BASE-02
**Success Criteria** (what must be TRUE):

  1. A `baselines` engine computes an EWMA with a 14-night half-life and Winsor ±3σ clamping on each input sample, persisting per-metric baseline state (mean, variance, night count) to SQLite via a bridge method
  2. Given a synthetic 14-night fixture, the computed baseline matches the reference EWMA within tolerance and an injected outlier is clamped (not allowed to swing the baseline)
  3. The bridge exposes a tiered confidence state for each baseline — Calibrating (<4 nights), Building (4-13 nights), Solid (≥14 nights) — and the Health UI surfaces that state for at least one consuming metric
  4. `cargo test --locked` passes clean; baseline persistence survives an open/close cycle (state is read back identical)

**Plans**: TBD

**Dependencies**: Pure Rust core + minimal Swift surface to display confidence; ships to Android for free.

---

#### Phase 141: HRVAnalyzer Upgrade

**Goal**: HRV readings are computed from cleaned RR intervals with a Malik ectopic filter, expose SDNN and pNN50 alongside RMSSD, and are suppressed when the underlying data is insufficient.
**Depends on**: Phase 140
**Requirements**: ALG-HRV-10, ALG-HRV-11, ALG-HRV-12
**Success Criteria** (what must be TRUE):

  1. The Malik ectopic filter drops any beat deviating >20% from the local 5-beat median before RMSSD is computed; a synthetic series with injected premature beats yields a corrected RMSSD that excludes those beats
  2. The HRV pipeline also computes SDNN and pNN50 and exposes all three (RMSSD/SDNN/pNN50) via the bridge for display in detail views
  3. A sufficiency gate rejects any spot reading where >35% of intervals were discarded; the bridge returns an explicit "insufficient" state rather than a number, and the UI does not render a misleading value
  4. `cargo test --locked` passes clean with new fixtures covering filter, multi-metric output, and the sufficiency gate boundary

**Plans**: TBD

**Dependencies**: Pure Rust core; ships to Android for free.

---

#### Phase 142: StrainScorer

**Goal**: Each workout produces a 0-100 strain score from a Karvonen %HRR intensity model with Edwards 5-zone TRIMP weighting, using Tanaka HRmax when an observed maximum is unavailable.
**Depends on**: Phase 140
**Requirements**: ALG-STR-01, ALG-STR-02
**Success Criteria** (what must be TRUE):

  1. Strain is computed with Karvonen %HRR and Edwards 5-zone TRIMP weighting (zone cut-offs at 50/60/70/80/90% HRR), producing a deterministic 0-100 score for a synthetic HR session fixture
  2. When no observed HRmax is available, Tanaka HRmax (208 − 0.7 × age) is used; the score requires `age` from the user profile and the bridge returns a clear error/neutral state when age is missing
  3. Per-zone time and the final 0-100 strain are exposed via the bridge so the Strain Gauge UI (Phase 144) and workout detail (Phase 146) can consume them
  4. `cargo test --locked` passes clean; zone-boundary and missing-age cases are covered by tests

**Plans**: TBD

**Dependencies**: Pure Rust core; ships to Android for free. Requires `age` in user profile (Swift-side profile field if absent).

---

#### Phase 143: RecoveryScorer + DaytimeStress

**Goal**: Recovery is a personalised 2-factor composite against EWMA baselines, and daytime stress is a per-hour timeline derived from same-day data — both honest about calibration state.
**Depends on**: Phase 140, Phase 141
**Requirements**: ALG-REC-01, ALG-REC-02, ALG-DST-01, ALG-DST-02
**Success Criteria** (what must be TRUE):

  1. Recovery is computed as a 2-factor z-score composite (HRV weight 0.55, RHR weight 0.45) against personal EWMA baselines, squashed via a logistic function to 0-100, matching a reference computation on a synthetic fixture
  2. Recovery returns an explicit "calibrating" state (not an arbitrary number) when baseline history < 4 nights, and the UI honours that state
  3. Daytime stress is computed per waking hour as HR + RMSSD z-scored against the same day's quietest hour, mapped to a 0-3 scale, requiring no personal history
  4. A sustained-high-stress flag fires when the most recent 3 consecutive hours all score ≥2.0; a fixture crossing and then leaving that threshold toggles the flag correctly
  5. `cargo test --locked` passes clean across recovery, calibrating-gate, hourly-stress, and sustained-flag fixtures

**Plans**: TBD

**Dependencies**: Pure Rust core; ships to Android for free. Consumes Phase 140 baselines.

---

#### Phase 144: Visual Components

**Goal**: The Health tab shows the Recovery score as a colour-coded ring, the Strain score as a zone-banded gauge, and every metric card gains an inline 14-day trend sparkline.
**Depends on**: Phase 142, Phase 143
**Requirements**: UI-VIZ-01, UI-VIZ-02, UI-VIZ-03
**Success Criteria** (what must be TRUE):

  1. The Recovery card renders a circular gauge (Recovery Ring) colour-coded green/orange/red/teal, replacing the plain text number, and reflects the calibrating state from Phase 143
  2. The Strain card renders a horizontal gauge with zone colour bands (Low/Moderate/High/Extreme) mapped to the 0-100 strain score from Phase 142
  3. Every Health metric card shows a 14-day sparkline inline below the current value, sourced from real historical data without opening a separate screen
  4. The new components build and render correctly in the iOS simulator (verified via screenshot) with no layout regression on the existing Health tab

**Plans**: TBD
**UI hint**: yes

**Dependencies**: iOS-only (SwiftUI/CoreGraphics). No new external dependencies.

---

#### Phase 145: Sleep UI

**Goal**: The Sleep view gains a per-night hypnogram, a 14-night sleep debt ledger, and the ability to browse previous nights.
**Depends on**: Phase 144
**Requirements**: UI-SLP-01, UI-SLP-02, UI-SLP-03
**Success Criteria** (what must be TRUE):

  1. The sleep detail view shows a hypnogram — a horizontal timeline with colour-coded phase bands (Deep/Light/REM/Awake) for the selected night
  2. The sleep view shows a 14-night sleep debt ledger with daily bars (slept vs sleep need) and a running balance summary
  3. The user can navigate to previous nights via forward/back controls, browsing up to 30 nights of history, with correct data per night
  4. The view builds and renders in the iOS simulator (verified via screenshot) including an empty/insufficient-history state

**Plans**: TBD
**UI hint**: yes

**Dependencies**: iOS-only. Consumes existing sleep staging + Harvard sleep-need (v15.0).

---

#### Phase 146: Workout UI

**Goal**: An active workout has a rich in-app live view, and past workouts open a detailed breakdown.
**Depends on**: Phase 142, Phase 144
**Requirements**: UI-WRK-01, UI-WRK-02
**Success Criteria** (what must be TRUE):

  1. During an active workout the in-app view shows a large current HR, current zone number (1-5), a live effort gauge, and elapsed time — independent of the lock-screen Live Activity
  2. Tapping a past workout opens a detail view with an HR curve chart, zone time breakdown (%), peak HR, average HR, duration, and effort score from Phase 142
  3. Both views build and render in the iOS simulator (verified via screenshot), including a graceful state when no HR samples exist for a session

**Plans**: TBD
**UI hint**: yes

**Dependencies**: iOS-only. Consumes StrainScorer zone/effort output from Phase 142.

---

#### Phase 147: Data Exploration

**Goal**: Users can explore any metric over a chosen date range and overlay multiple metrics to spot correlations.
**Depends on**: Phase 144
**Requirements**: UI-EXP-01, UI-EXP-02
**Success Criteria** (what must be TRUE):

  1. A Metric Explorer opens from the Health tab; the user selects any available metric (HRV, HR, Recovery, Strain, Stress, etc.), picks a date range, and sees a full-screen chart with min/max/mean stats
  2. A Compare mode overlays 2-4 metrics on a shared timeline with distinguishable series and a legend
  3. The explorer builds and renders in the iOS simulator (verified via screenshot), handling metrics with sparse or missing data without crashing

**Plans**: TBD
**UI hint**: yes

**Dependencies**: iOS-only. Reads from existing metric history bridge methods.

---

#### Phase 148: BLE Protocol Expansion

**Goal**: The app gains three new BLE commands (extended battery, version info, stop haptics) and switches the Gen5/MG alarm to the confirmed 20-byte waveform format.
**Depends on**: Phase 111 (BLE protocol foundation)
**Requirements**: BLE-EXT-01, BLE-EXT-02, BLE-EXT-03, BLE-EXT-04
**Success Criteria** (what must be TRUE):

  1. The app sends and parses cmd `0x62` (getExtendedBatteryInfo), surfacing detailed battery state beyond the basic GATT battery level
  2. The app sends cmd `0x07` (reportVersionInfo) during the BLE handshake and stores the result so firmware info is more reliable than GATT Device Information alone
  3. The app sends cmd `0x7A` (stopHaptics) to cancel a haptic pattern mid-sequence (e.g., when a workout ends while a buzz is active), confirmed to halt an in-progress buzz
  4. Gen5/MG alarm payloads use the confirmed 20-byte format (waveform + loop control fields), replacing the opaque format; round-trip parsing of a synthetic payload matches the spec

**Plans**: TBD

**Dependencies**: iOS BLE (Swift) + Rust frame parsing for any new response bodies. Android parity for the new commands is v18.0 scope per milestone constraints, but Rust parsing ships to Android for free.

---

#### Phase 149: R22 Deep Stream Unlock

**Goal**: Gen5/MG devices receive the R22 deep-stream unlock sequence to enable deep biometric streaming, with a hard DeviceCatalog gate that never sends it to Gen4.
**Depends on**: Phase 148
**Requirements**: BLE-R22-01, BLE-R22-02
**Success Criteria** (what must be TRUE):

  1. For Gen5/MG devices only, the app sends the R22 Deep Stream Unlock sequence (15 flags via cmd `0x78`), gated by `DeviceCatalog.isGen5orMG`, and deep biometric frames (PPG/IMU) begin to arrive after unlock
  2. The `0x78` write is never issued to a Gen4 device — the DeviceCatalog gate is enforced before any write, and a unit/integration test proves a Gen4 device path never emits `0x78`
  3. The unlock failure path is handled gracefully (no crash, no stuck state) when the device does not acknowledge

**Plans**: TBD
**Note**: High risk — deep stream unlock affects a connected physical device. Gate enforcement (BLE-R22-02) is a release blocker; do not ship if any code path can send `0x78` to Gen4.

**Dependencies**: iOS BLE (Swift) + DeviceCatalog gate (v12.0). Hardware verification requires a real Gen5/MG device.

---

#### Phase 150: Strap Notification Mirroring

**Goal**: The connected strap can buzz for incoming phone calls and configurable internal Goose events, with user-controlled toggles and a test button.
**Depends on**: Phase 148
**Requirements**: HAP-NOTIF-01, HAP-NOTIF-02, HAP-NOTIF-03
**Success Criteria** (what must be TRUE):

  1. When an incoming phone call is detected via CTCallCenter, the connected strap buzzes (3 loops) as a wrist notification
  2. More → Settings exposes per-event toggles and threshold settings for internal Goose events (HR spike, HRV dip, sustained daytime stress); enabling an event causes a buzz when that event fires
  3. A test buzz button in the strap notification settings triggers a buzz immediately so the user can verify haptic output without waiting for an event
  4. The settings screen and call-detection path build and run in the iOS simulator (verified via screenshot for the settings UI; call mirroring verified against the CTCallCenter callback)

**Plans**: TBD
**UI hint**: yes

**Dependencies**: iOS-only (CoreTelephony CTCallCenter + existing buzz primitive). Consumes DaytimeStress (Phase 143) and HR/HRV signals for internal-event triggers.

---

## Progress

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 1–45 | v1.0–v6.0 | Complete | 2026-06-03 to 2026-06-09 |
| 46–50 | v7.0 | Complete | 2026-06-10 |
| 51–60 | v8.0 | Complete | 2026-06-11 |
| 61–65 | v9.0 | Complete | 2026-06-11 |
| 67–73 | v10.0 | Complete | 2026-06-13 |
| 74–82 | v11.0 | Complete | 2026-06-14 |
| 83 | 6/6 | Complete   | 2026-06-14 |
| 84 | 3/3 | Complete   | 2026-06-14 |
| 85 | 6/6 | Complete   | 2026-06-14 |
| 86 | 6/6 | Complete   | 2026-06-15 |
| 87 | 6/6 | Complete   | 2026-06-18 |
| 88 | 2/2 | Complete   | 2026-06-18 |
| 89 | 3/3 | Complete   | 2026-06-18 |
| 90 | 4/4 | Complete   | 2026-06-18 |
| 91 | 2/2 | Complete   | 2026-06-18 |
| 92 | v13.0 | Complete | 2026-06-20 |
| 93 | v13.0 | Complete | 2026-06-20 |
| 94 | v13.0 | Complete | 2026-06-20 |
| 95 | v13.0 | Complete | 2026-06-19 |
| 96 | v13.0 | Complete | 2026-06-20 |
| 97 | v13.0 | Complete | 2026-06-20 |
| 98 | 2/2 | Complete | 2026-06-21 |
| 99 | 2/2 | Complete | 2026-06-21 |
| 100 | 2/2 | Complete | 2026-06-21 |
| 101 | 3/3 | Complete   | 2026-06-21 |
| 102 | 1/1 | Complete   | 2026-06-21 |
| 103 | 1/1 | Complete   | 2026-06-21 |
| 104 | 1/1 | Complete   | 2026-06-21 |
| 105 | 1/1 | Complete   | 2026-06-21 |
| 106 | 1/1 | Complete   | 2026-06-21 |
| 107 | 1/1 | Complete    | 2026-06-21 |
| 108 | 1/1 | Complete   | 2026-06-21 |
| 109 | 1/1 | Complete   | 2026-06-21 |
| 110 | 3/3 | Complete   | 2026-06-21 |
| 111 | 2/2 | Complete    | 2026-06-21 |
| 112 | 2/2 | Complete    | 2026-06-22 |
| 113 | 0/1 | Complete    | 2026-06-22 |
| 114 | 2/2 | Complete    | 2026-06-23 |
| 115 | 2/2 | Complete    | 2026-06-23 |
| 116 | 1/1 | Complete    | 2026-06-24 |
| 117 | 1/1 | Complete    | 2026-06-24 |
| 118 | 3/3 | Complete    | 2026-06-26 |
| 119 | 1/1 | Complete    | 2026-06-26 |
| 120 | 1/1 | Complete    | 2026-06-27 |
| 121 | 1/1 | Complete    | 2026-06-27 |
| 122 | 1/1 | Complete    | 2026-06-27 |
| 123 | 1/1 | Complete    | 2026-06-28 |
| 124 | 0/0 | Complete    | 2026-06-28 |
| 125 | 1/1 | Complete    | 2026-06-28 |
| 126 | 1/1 | Complete    | 2026-06-28 |
| 140 | v17.0 | Not started | - |
| 141 | v17.0 | Not started | - |
| 142 | v17.0 | Not started | - |
| 143 | v17.0 | Not started | - |
| 144 | v17.0 | Not started | - |
| 145 | v17.0 | Not started | - |
| 146 | v17.0 | Not started | - |
| 147 | v17.0 | Not started | - |
| 148 | v17.0 | Not started | - |
| 149 | v17.0 | Not started | - |
| 150 | v17.0 | Not started | - |

## Backlog

### Deferred to v15.0

| Issue | Title | Priority | Reason deferred |
|-------|-------|----------|-----------------|
| #164 | Harvard sleep need model (age-adjusted debt + activity load) | P2 | Algorithm work, not blocking Android or BLE reliability |
| #165 | GET_FF_VALUE 0x80 — read device feature flags | P2 | Nice-to-have capability discovery; no user-facing gap today |
| #166 | Body composition history table (weight, BMI, body fat over time) | P2 | New data domain, own schema migration needed |
| #167 | UI stealth mode — hide individual metrics from dashboard | P3 | UI polish; no data or protocol dependency |
| #168 | PIP upload — separate data pipeline for Pulse Information Packets | P3 | Infrastructure work; upload path functional today |
| #172 | Protocol: decode WHOOP 5.0 type-47 v20/v21 bulk multi-channel sensor stream | P2 | Byte maps hardware-verified; needs Rust parser + bridge + export wiring |
| #173 | Protocol: decode WHOOP 5.0 type-47 v26 high-rate 24 Hz PPG waveform | P2 | Byte map hardware-verified (88 B, 24× LE-i16 @[27:74]); needs Rust parser + bridge |

---

#### Archived phase 999.5 — GooseAppModel @Observable Migration (promoted to Phase 17 — v4.0)

Promoted to Phase 17: @Observable Migration.

---

#### Archived phase 999.4 — Recovery V2 Completion (promoted to Phase 13 — v3.0)

Promoted to Phase 13: Recovery V2 Dashboard.

---

#### Archived phase 999.3 — Apply upstream PR #15 (promoted to Phase 16 — v4.0)

Promoted to Phase 16: Deep Link Security.

---

#### Archived phase 999.2 — Multi-Language Support (promoted to Phase 14 — v3.0)

Promoted to Phase 14: pt-PT Localisation.

---

#### Archived phase 999.1 — Coach Multi-Provider & Custom Endpoint (promoted to Phase 18 — v4.0)

Promoted to Phase 18: Coach Multi-Provider.

#### Archived phase 60 — Band-First Sync

**Goal:** Align Goose's BLE sync architecture with the WHOOP app's band-first model, eliminating the need for continuous overnight BLE capture. The band stores data onboard; the app fetches it opportunistically on foreground and via silent push, exactly as WHOOP does.

**Depends on:** Phase 59
**Plans:** 1/1 plans complete
Plans:

- [x] 126-01-PLAN.md

- [x] 122-01-PLAN.md

- [x] 111-01-PLAN.md

- [x] 110-01-PLAN.md

- [x] 108-01-PLAN.md

- [x] 109-01-PLAN.md

- [x] 107-01-PLAN.md

- [x] 106-01-PLAN.md

- [x] 105-01-PLAN.md

- [x] 104-01-PLAN.md

- [x] 103-01-PLAN.md

- [x] 102-01-PLAN.md

- [x] 101-01-PLAN.md

- [x] 96-01-PLAN.md

- [x] 92-01-PLAN.md

**Wave 1**

- [x] 60-01-PLAN.md — Delete overnight guard subsystem core (3 files + GooseAppModel state + overnight struct types)
- [x] 60-02-PLAN.md — Add band-first sync: BandFirstSync.swift (foreground trigger + BGAppRefreshTask handler), BGTask registration, Info.plist keys

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 60-03-PLAN.md — Wire foreground trigger + clean secondary overnight references; build clean (wave 2)

#### Archived phase 61 — BLE Bonding State Machine

**Goal:** Replace the implicit OS bonding path with a formal bonding manager that tracks bond state through distinct steps, matching the `WHPBLEBondingManager` pattern from WHOOP (NotStarted → Started → Subscribed → Completed/Cancelled).

**Depends on:** Phase 60
**Requirements:** BLE-BOND-01
**Success Criteria** (what must be TRUE):

1. A `GooseBLEBondingManager` type exists with the 5 formal states; bonding progress is observable from `GooseAppModel`
2. On BT reset or iOS reboot, the app detects bond loss, re-enters the bonding flow, and reconnects without user action
3. Bonding state is persisted across app restarts so the app can resume from the last known state
4. The existing string-based `connectionState` is replaced with the formal state machine output for the bonding portion

**Plans:** 3/3 plans complete

- [x] 61-01-PLAN.md — Foundation: GooseBLEBondingState enum + GooseBLEBondingManager class + localized strings
- [x] 61-02-PLAN.md — Integration: wire bonding manager into GooseBLEClient/delegate/commands + GooseAppModel observability + bond-loss detection
- [x] 61-03-PLAN.md — Human-verify checkpoint: bond-loss recovery + persistence across restart

---

#### Archived phase 62 — Upload Watermark per Sensor

**Goal:** Track the last successfully uploaded timestamp per data type (raw frames, processed metrics) so restarts and partial uploads never re-send data already in TimescaleDB.

**Depends on:** Phase 61
**Requirements:** UPLOAD-WM-01
**Plans:** 2/2 plans complete

- [x] 62-01-PLAN.md — Create GooseUploadWatermark store (UserDefaults, per-type Date, clearAllWatermarks)
- [x] 62-02-PLAN.md — Wire watermark into upload pipeline (gated sinceTimestamp, atomic write on 2xx, reset path)

---

#### Archived phase 63 — Network Monitor & Upload Gating

**Goal:** Gate all outbound uploads on network reachability and implement exponential-backoff retry.

**Depends on:** Phase 62
**Requirements:** NET-MON-01
**Plans:** 2/2 plans complete

- [x] 63-01-PLAN.md — Create GooseNetworkMonitor (NWPathMonitor wrapper) + wire isNetworkReachable into GooseAppModel
- [x] 63-02-PLAN.md — Reachability + APNs-token upload gating, connectivity-return retry, 5xx exponential backoff

---

#### Archived phase 64 — HR Data Sanitizer

**Goal:** Add a Swift-side heart rate sanitization step between raw BLE notification bytes and HeartRateSeriesStore.

**Depends on:** Phase 60
**Requirements:** HR-SAN-01
**Plans:** 2/2 plans complete

- [x] 64-01-PLAN.md — GooseHRSanitizer (struct + static let 25/220 thresholds), wire at recordLiveHeartRate chokepoint
- [x] 64-02-PLAN.md — Human-verify checkpoint

---

#### Archived phase 65 — Generic BLE State Machine

**Goal:** Extract a lightweight reusable StateMachine<State, Event> type and migrate BLE connection/bonding state.

**Depends on:** Phase 61
**Requirements:** SM-01
**Plans:** 1/1 plans complete

- [x] 65-01-PLAN.md — Add generic StateMachine<State, Event> struct + migrate GooseBLEBondingManager onto it

---

#### Archived phase 66 — Cap Sense / On-Wrist Detection

**Goal:** Identify the GATT characteristic for WHOOP's capacitive skin-contact sensor via Ghidra and implement on-wrist detection.

**Depends on:** Phase 60
**Requirements:** CAPSENSE-01
**Note:** GATT characteristic UUID for cap sense is not yet identified. Phase deferred — hardware gate.
**Plans:** 0 plans

---

#### Archived phase 999.6 — body_hex Storage Optimization (absorbed into Phase 20 — v5.0)

Absorbed into Phase 20: Upstream Fixes & Storage (as PERF-05).
