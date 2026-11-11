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
- 🚀 **v13.0 Bug Fixes, Protocol Reliability, Device Coverage & HealthKit Export** — Phases 92-97 (active)

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
| 92 | 1/3 | In Progress|  |
| 93 | v13.0 | Pending | — |
| 94 | v13.0 | Pending | — |
| 95 | 2/2 | Complete   | 2026-06-19 |
| 96 | 1/2 | In Progress|  |
| 97 | 4/4 | Complete   | 2026-06-20 |

## Backlog

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
**Plans:** 5/6 plans executed
Plans:

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
