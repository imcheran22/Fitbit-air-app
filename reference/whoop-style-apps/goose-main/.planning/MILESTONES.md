# Milestones

## v15.0 v15.0 (Shipped: 2026-06-28)

**Phases completed:** 15 phases, 19 plans, 8 tasks

**Key accomplishments:**

- 113 — schema-v24-optical-bridge-methods
- New stored properties
- Android Gen5/MG BLE client now sends ENABLE_OPTICAL_DATA (cmd 107, 0x6B) and TOGGLE_OPTICAL_MODE (cmd 108, 0x6C) after auth, enabling the WHOOP 5 to emit optical frames that the existing routing already forwards to GooseBridge.safeHandle().
- RealtimePIPQueue — isolated NSLock/DispatchQueue/GooseRustBridge write queue wired unconditionally before the capture-session guard in the BLE notification pipeline.
- Authenticated realtime-frame ingestion endpoint backed by a `realtime_frames` TimescaleDB hypertable partitioned on `captured_at`, with ON CONFLICT DO NOTHING idempotency and pytest coverage for 200/401/422/idempotent cases.
- GooseStealthMode.isHidden + StealthStorage UserDefaults keys + StealthMask value type threaded into CoachLocalToolContext.build() with "hidden_by_user" sentinel for 6 metric positions.
- DynamicSleepNeed struct
- SwiftUI Health tab section with CoreGraphics weight sparkline, manual entry sheet, and HealthKit bodyMass+bodyFatPercentage import via @Observable importState enum.
- 123 — Real-Device Algorithm Validation
- Added `MoreInfoRow` for "Cap Sense" in `Section("WHOOP Event Signals")` immediately after "Latest Event" row:

---

## v13.0 v13.0 (Shipped: 2026-06-20)

**Phases completed:** 6 phases, 16 plans, 4 tasks

**Key accomplishments:**

- 1. [Rule 2 - Missing critical functionality] Added writeManifestToDisk() and writeValidationSidecarsAfterManifest() helpers
- Auth exhaustion counter (authRetryCount) and recovery alert (authExhausted) after 12 insufficientAuthentication retry cycles with Reconnect WHOOP / Cancel actions.
- Complete
- Complete
- Complete
- Added `DataPacketBodySummary::V24History { .. }` alongside `NormalHistory` and
- Complete
- Complete
- Replaced all 9 silent `try? bridge.request` / `try? await bridge.requestAsync` calls with `do/catch` blocks using each file's established logging idiom — bridge errors now visible in Xcode console and OSLog.
- Complete
- Complete
- Caseless Swift enum centralising all HK write logic — HR/HRV/SpO2/sleep — with requestAuthorization and exportAfterSleepSync entry points, gated by UserDefaults toggle.
- Task 1 pre-read
- HealthKit export opt-in toggle with @AppStorage persistence and HKHealthStore availability guard wired to GooseAppModel stub.

---

## v12.0 v12.0 (Shipped: 2026-06-19)

**Phases completed:** 9 phases, 38 plans, 39 tasks

**Key accomplishments:**

- SQLite migration step 22 normalises `decoded_frames.device_type` by rewriting MAVERICK/PUFFIN rows to GOOSE, and bumps CURRENT_SCHEMA_VERSION from 21 to 22.
- device.capabilities bridge method wired in bridge.rs and parse_device_type() rejects MAVERICK/PUFFIN, with regression tests proving DB normalization via migration step 22
- WireProtocol/HistoricalSyncKind/DeviceCapabilities types added to GooseBLETypes.swift; GooseBLEClient uses connectedCapabilities from device.capabilities bridge call instead of activeDeviceGeneration
- All 9 remaining Swift files migrated to typed connectedCapabilities/wireProtocol API; zero string-based device-type comparisons remain in GooseSwift/
- All Phase 83 structural invariants confirmed: 7 targeted test filters green, iOS BUILD SUCCEEDED, zero rustDeviceType/activeDeviceGeneration, MAVERICK/PUFFIN absent from production write paths
- protocol.rs
- Event-48 battery value wired from Rust compact summary through NotificationFrameInterpretation to applyBatteryLevel, gated on batteryViaEvent48 + wireProtocol gen4
- GooseBLEClient.swift
- `#![cfg_attr(not(test), deny(clippy::unwrap_used))]` added to lib.rs with per-module allow shields on 7 unconverted modules; bridge.rs converted from 46 test `.unwrap()` to `.expect("descriptive message")` leaving zero `.unwrap()` in the file.
- 62 test `.unwrap()` calls in store.rs converted to `.expect()` and `#![allow(clippy::unwrap_used)]` shield removed — store.rs now passes `deny(clippy::unwrap_used)` clean.
- Eliminated all 11 `.unwrap()` calls in metrics.rs (3 production + 8 test), removed the `#![allow(clippy::unwrap_used)]` shield — file now passes `deny(clippy::unwrap_used)` with zero violations.
- 8 test-code .unwrap() calls in capabilities.rs converted to .expect() with descriptive messages; #![allow(clippy::unwrap_used)] shield removed; module now passes deny(clippy::unwrap_used) cleanly
- ARCH-03 deny(clippy::unwrap_used) gate confirmed with zero lint violations; catch_unwind verified at bridge.rs FFI entry; 180 unit tests pass; 2 pre-existing export_tests failures documented as not caused by Phase 85
- 1. [Rule 1 - Bug] Fixed metric_result_to_value generic signature
- 1. [Rule 1 - Bug] Worktree was behind gsd/v12.0-milestone
- activity.rs
- Task 1: Replace placeholder test with Option A multi-file scanner
- Protocol offset and algorithm comments at all 14 non-obvious WHOOP wire-format decode sites — 11 in protocol.rs and 3 in bridge/metrics.rs.
- All integration test suites pass — bridge.rs split verified complete.
- All 49 activity-domain methods moved from store/mod.rs to store/activity.rs; store/mod.rs now contains only 7 infrastructure pub fn.
- 1. [Rule 1 - Bug] Used .environment() instead of .environmentObject() for HealthDataStore
- 1. [Rule 1 - Bug] @EnvironmentObject vs @Environment — Plan said @EnvironmentObject, actual conformance requires @Environment
- BLETransport protocol extracted from GooseBLEClient public surface; GooseBLEClient renamed to CoreBluetoothBLETransport across 13 files + xcodeproj with BUILD SUCCEEDED.
- BLESessionCoordinator actor created; GooseAppModel.ble typed as any BLETransport with 15 additional BLETransport protocol members and 12 view files updated to compile with the abstraction boundary.
- DeviceCatalog struct replaces 14 scattered `connectedCapabilities?.historicalSync/wireProtocol` guard patterns across 4 CoreBluetoothBLETransport extension files with typed computed property queries.
- All HealthState property accesses redirected through `healthState.xxx`:
- 1. [Rule 1 - Bug] CoachLocalToolContext not in plan scope

---

## v10.0 Protocol Parity, Haptics & Feature Completeness (Shipped: 2026-06-13)

**Phases completed:** 7 phases, 17 plans, 16 tasks

**Key accomplishments:**

- buzz(loops:) BLE command extension on GooseBLEClient — writes Data([0x13, N]) directly to commandCharacteristic with UInt8 clamping and nil-guard, no frame sequence
- BreatheView with 4s/4s/4s box-breathing loop (circle 0.6→1.0→0.6 scaleEffect), buzz(loops:1) at each phase start, Wellness section in MoreView, full navigation wiring via MoreRoute.breathe
- CoachVOWNudge priority enum (4 cases) + CoachVOWCard dismissable view inserted between CoachJournalCard and CoachRoutesSection in CoachOverviewScreen, computing urgency from existing healthStore snapshots with nil-safe Double() parse
- IntervalTimerView
- NotificationScheduler actor encapsulating all UNUserNotificationCenter calls, wired to three event sites: sleep sync completion, passive workout detection, and WHOOP battery ≤ 20%
- 1. [Rule 1 - Bug] Typo in TrendsDashboardViews.swift stroke style
- GooseAppModel.swift
- GooseWakeWindowManager.swift RE-gated stub — empty compilable class with BTSnoop/Ghidra prerequisite doc comment, registered at 4 pbxproj locations, xcodebuild succeeds

---

## v8.0 Quality, Completeness & Backlog Clearance (Shipped: 2026-06-11)

**Phases completed:** 9 phases (51–59) + Phase 60 (Band-First Sync, v9.0 start)
**Plans:** 9 autonomous + 3 (Phase 60) = 12 plans
**Requirements shipped:** 22/22
**Known deferred items at close:** 1 (see STATE.md Deferred Items — ble-api-misuse-state-restore debug session)

**Key accomplishments:**

- Bug audit (Phase 51): 3 HIGH + 6 MEDIUM bugs fixed in v6.0–v7.0 code; data race on GooseRustBridge NSLock eliminated; main-thread FFI safety net added
- Quick tasks & surface cleanup (Phase 52): BT Settings button wired; CodeQL CI confirmed; HealthKit importer confirmed; previewMissingData gated in #if DEBUG
- Home dashboard (Phase 53): Device Status Card (live name/state/battery/HR/sync), Tools Grid (Coach/Activity/Journal/Calibration), Evidence Footer (Rust version, store path, provenance)
- Coach content (Phases 54–55): Score summaries grid; daily journal with UserDefaults persistence; 4 route views (Sleep, Recovery, Strain, Stress) populated from bridge data
- Biometrics & activity (Phase 56): Fabricated 55.0 bpm RHR baseline eliminated; non-activity stress computation now excludes exercise session windows
- Persistence & calibration (Phase 57): Energy daily rollup persisted to SQLite; calibration pipeline uses real train/holdout splits from bridge
- More tab, previews & health algorithms (Phase 58): MorePrivacyView with export/deletion; #Preview macros for Home and More; algorithmPreferences wired to bridge catalog
- Band sleep import (Phase 59): bandSleepImportStatus replaces static "not available" UI; pipeline was already complete since Phase 50
- Band-first sync (Phase 60): Overnight poll loop removed; foreground-trigger + BGAppRefreshTask added; aligned with WHOOP's WHPBLEHistoricalDataManager pattern

---

## v6.0 : UI Wiring, Algorithm Alignment & Parity Validation (Backfilled: 2026-06-11)

**Note:** Synthesized from archive snapshot by `/gsd-health --backfill`. Original completion date unknown.

---

## v7.0 Sync Correctness, Async & Sleep Sync (Shipped: 2026-06-10)

**Phases completed:** 5 phases (46-50), 18 plans
**Known deferred:** Phase 51 (VAL-HRV-01, VAL-SLP-01, SLP-SYNC real-device) — hardware gate

**Key accomplishments:**

- Upload round-trip completo: POST /v1/ingest-frames + GET /v1/export/frames com cursor pagination e autenticação Bearer (ROUTE-01, ROUTE-02)
- device_uuid end-to-end: coluna nullable adicionada a raw_evidence + decoded_frames, CoreBluetooth UUID mapeado em ligação BLE, propagado até servidor (DEVID-01, DEVID-02)
- Upload sync race fix: captureAllPendingRowIDs pré-HTTP, markStreamsSynced apenas após 2xx — elimina blind-marking (SYNCR-01)
- HealthDataStore async migration: 60+ bridge calls migrados de GCD para async/await; GCD queues removidos; zero sync calls na @MainActor scope (ASYNC-01, ASYNC-02)
- Morning band sleep sync: gravity K18/K24 V24History wired, syncBandSleepHistory() com SQLite-first check, "A aguardar sincronização" confirmado no simulador (SLP-SYNC-01/02/03 parcial)

---

## v5.0 Metrics Accuracy, IMU & Upstream Fixes (Phases 20-26) — PLANNED

**Phases:** 7 (Phases 20–26)
**Requirements:** 26 (SYNC-01–05, PERF-05, IMU-01–04, ALG-HRV-01–04, ALG-STR-01–03, ALG-CAL-01–02, ALG-SLP-01–02, ALG-REC-01–03, ALG-SLP-03–04)

**Goal:** Port validated algorithms from `my-whoop` into the Rust core — confirmed against WHOOP 5.37.0 IPA via Ghidra and peer-reviewed literature — so each metric (HRV, Recovery, Strain, Calories, Sleep) produces values aligned with WHOOP from the same raw data.

---

## v4.0 Security, Performance & Coach Expansion (Shipped: 2026-06-06)

**Phases completed:** 4 phases (16-19), 12 plans
**Known deferred items at close:** 6 (see STATE.md Deferred Items)

**Key accomplishments:**

- Deep link security: `allowsRemoteInvocation` guard blocks state-changing BLE commands from external `gooseswift://` invocations (SEC-01, upstream PR #15)
- Full `@Observable` migration: GooseAppModel + HealthDataStore + GooseBLEClient — 68 `@Published` removed; NavigationRequestObserver warning eliminated (PERF-01, PERF-02, PERF-03)
- Coach multi-provider: four AI backends (ChatGPT, Claude, Custom endpoint, Gemini OAuth PKCE); `CoachProvider` protocol; `CoachProviderRegistry`; provider picker UI in settings (COACH-01–06)
- pt-PT localisation complete: 128 strings covering all v4.0 UI additions including Coach settings, provider config, model preset names; onboarding skip button; startup non-blocking (L10N-03, PERF-04, UX-01)

---

## v3.0 Wearable UX, CI Hardening & RTC Sync (Shipped: 2026-06-05)

**Phases completed:** 8 phases (9–15 + 10.1), 17 plans

**Key accomplishments:**

- BLE stability: FFI catch_unwind + panic=unwind; 24 MB storage cap; exponential reconnect backoff (1s/60s) for WHOOP and HR monitor; per-row device_id in capture sessions
- HR monitor scan/connect UI: live scan list with RSSI, connect sheet, connected panel, wired into More tab Device section
- BLE main-thread publishing fix: all @Published mutations dispatched to main thread; eliminates background-thread CoreBluetooth warnings
- HR monitor independent capture: .hrMonitor mode; startHRMonitorCapture/stopHRMonitorCapture not gated on WHOOP session
- WHOOP 4.0 RTC clock sync: silent drift correction via BLE after connection
- Recovery V2 dashboard: hero score, HRV, RHR from bridge; 7-day trend
- pt-PT localisation infrastructure: Localizable.xcstrings, 650+ strings, dynamic status strings via LocalizedStatusStrings.swift
- Recovery formula SDNN accuracy: rmssd_segment_aware, hkHRVSDNNMs rename, baseline normalization

---

## v2.0 Multi-Device & Platform Foundations (Shipped: 2026-06-04)

**Phases completed:** 8 phases, 13 plans, 19 tasks

**Key accomplishments:**

- Duration:
- Duration:
- Duration:
- One-liner:
- WearableDescriptor.genericHRMonitor descriptor, empty-prefix guard, normalized HR_MONITOR rustDeviceType, and dedicated 0x180D BLE scan/connect/notify flow with background-queue dispatch — completing the WEAR-02 iOS acquisition path
- One-liner:
- Pure buildUploadPayload function extracted from performUpload plus 6-test GooseUploadServiceTests suite locking the WEAR-03 device taxonomy (GEN4/GOOSE/HR_MONITOR) behind regression tests — resolves cross-AI review HIGH-3.
- Root cause fix (capture_import.rs):
- `bridge_hr_monitor_upload_stream_contains_bpm_and_rr`

---

## v1.0 Servidor Remoto + PRs Upstream (Shipped: 2026-06-03)

**Phases completed:** 5 phases, 12 plans, 6 tasks

**Key accomplishments:**

- (none recorded)

---
