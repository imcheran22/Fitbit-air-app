# WHOOP App vs Goose — Implementation Cross-Comparison

**Source (WHOOP):** ObjC_RESOLVED.txt — ObjcClassDumper output from Whoop iOS v5.37.0 (Mach-O AARCH64), 290k lines, 545 WHP* classes.
**Source (Goose):** GooseSwift/ Swift source files, Rust/core/src/ Rust modules.
**Date:** 2026-06-11
**Purpose:** Reference for future implementation — identifies gaps, partial implementations, and missing subsystems relative to WHOOP's architecture.

---

## 1. BLE Layer — Connection & Bonding

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Central Manager | `WHPBLEManager` + `WHPBLEManagerProtocol` (DI, mockable) | `GooseBLEClient` (monolithic, 1024 lines) | ⚠ Partial |
| Connection State Machine | `WHPBLEConnectionManager` — 6 formal states: NotStarted→Started→Subscribed→Completed/Cancelled/Restored | Ad-hoc string status in `updateConnectionState()` | ❌ Missing |
| Bonding Manager | `WHPBLEBondingManager` + 5 states (NotStarted/Started/Subscribed/Completed/Cancelled) | No dedicated bonding system; relies on OS implicit bonding | ❌ Missing |
| Strap-level Manager | `WHPBLEStrapManager` — separate from connection manager | Merged into `GooseBLEClient` | ❌ Missing |
| Typed Command Dispatch | `WHPBLECommandType` + `WHPBLECommandACKType` + `WHPBLECommandManager` | Ad-hoc enums (`HistoricalCommandKind`, `ClockCommandKind`, `AlarmCommandKind`) | ⚠ Partial |
| BLE Constants | `WHPBLEConstants` / `WHPBLEConstantsC` — centralised | UUIDs hard-coded with prefix checks spread across extension files | ⚠ Partial |
| Testability / Mock | `WHPBLEManagerMock`, `WHPBLEManagerProtocol`, `WHPBLEBondingManagerMock`, `WHPProcessDataManagerMock` | No mock or protocol layer | ❌ Missing |

**Key gap:** No formal bonding state machine. WHOOP tracks bonding as a separate multi-step flow with its own state machine; Goose piggybacks on the OS implicit bond, which can fail silently on reconnect edge cases.

---

## 2. Data Processing Pipeline

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Process Manager | `WHPBLEProcessDataManager` + `WHPBLEProcessDataManaging` | `NotificationFrameParser` → `CaptureFrameWriteQueue` | ✅ Equivalent |
| Data Validation Layer | `WHPBLEProcessDataValidator` / `WHPBLEProcessDataValidatorV` — separate class | Validation inline in Rust (`isValidStrapPacket`) | ⚠ Partial |
| Async Processing Operation | `WHPBLEStrapProcessingOperation` (NSOperation-based async queue) | `CaptureFrameWriteQueue` (serial DispatchQueue) | ✅ Equivalent |
| HR Sanitizer | `WHPHeartRateDataSanitizer` — dedicated pipeline step | No sanitizer; basic filtering in Rust | ❌ Missing |
| HR Decimation | `WHPHeartRateDecimator2` + Delegate — reduces samples for display | `HeartRateSeriesStore.shared` without decimation | ❌ Missing |
| HR Ground Truth Fusion | `WHPHeartRateTruth` — fuses sensor HR + estimation sources | Not implemented; raw BLE HR only | ❌ Missing |

---

## 3. Historical Data Sync

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Dedicated Historical Manager | `WHPBLEHistoricalDataManager` — called on `applicationWillEnterForeground` | `GooseBLEClient+HistoricalCommands/Handlers` integrated in BLE client | ⚠ Partial |
| High-Water Mark | `WHPStrapHighWaterMarkDateKey` (UserDefaults) | Implemented in Rust-side (phase 60) | ✅ Implemented |
| Upload Watermark | `WHPStrapLatestUploadedMetricDateKey` — separate tracking of what has been sent to cloud | Not implemented separately | ❌ Missing |
| Sync Notification Granularity | 4 states: `WHPSyncStarted` → `WHPSyncProgress` → `WHPSyncFinished` → `WHPSyncCompleted` | `GooseSyncToast` with 3 phases (syncing/synced/failed) | ⚠ Partial |
| Cycle-level Sync Tracking | `WHPCyclesSyncStarted` / `WHPCyclesSyncFinished` — cycles tracked separately from raw data | No separation between cycle sync vs raw data sync | ❌ Missing |
| Recent Stats as Separate Op | `WHPRecentStatsDownloadStarted` / `WHPRecentStatsDownloadEnded` | No separate recent-stats fetch operation | ❌ Missing |

---

## 4. Real-time Biotelemetry

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Biotelemetry Engine | `WHPBiotelemetry` + `WHPBiotelemetryDelegate` + `WHPBiotelemetrySample` — real-time strain accumulator | `WhoopDataSignalPipeline` → Rust core | ⚠ Partial |
| Real-time Strain Accumulation | `WHPBiotelemetry - reset Strain Accumulator` — Swift-side, continuous | Computed in Rust off-device; not continuously accumulated | ❌ Partial |
| HR Truth Fusion | `WHPHeartRateTruth` — fuses sources | Not implemented | ❌ Missing |
| Live Sensor Status | `WHPWhoopStrapSensorsStatusLiveChangedNotification` | `GooseBLEClient+VitalsAndLogging` (basic) | ⚠ Partial |
| Cap Sense (on-wrist detect) | `WHPWhoopStrapCapSenseSuccessNotification` / `CapSenseFailed` | Not implemented | ❌ Missing |
| Fuel Gauge (battery events) | `WHPWhoopStrapFuelGaugeSuccessNotification` / `FuelGaugeFailed` | `persistBatterySample` — manual, not event-driven | ⚠ Partial |

---

## 5. Activity Recording

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Recording Engine | `WHPActivityRecording` + `WHPActivityRecordingDelegate` | `GooseAppModel+ActivityRecording.swift` | ✅ Equivalent |
| Activity Types | Workout, Sleep, Nap, Meditation (from UI strings) | Workout, Sleep, Nap | ⚠ Missing Meditation |
| Auto-Detection | Implicit via `WHPActivityStarting` state + biotelemetry | `PassiveActivityDetectionPipeline` (heuristic) | ✅ Implemented |
| Dedicated Uploader | `WHPActivityRecordingUploader` — separate class, decoupled | `GooseAppModel+Upload.swift` — generic upload, coupled to app model | ⚠ Partial |
| Per-session Strain Reset | `WHPBiotelemetry - reset Strain Accumulator` (called on session start/end) | Rust computes; no Swift-side per-session reset | ❌ Partial |
| GPS Track | `WHPActivityPath` + `WHPActivityPathRenderer` + `WHPActivityMapView` | `ActivityLocationTracker.swift` + MapKit | ✅ Implemented |

---

## 6. Firmware Update (OTA)

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Firmware Delegates | `WHPBLEFirmwareDelegate` + `WHPBLEProcessFirmwareUpdateDelegate` | None | ❌ Missing |
| Firmware Model | `WHPWhoopStrapFirmware` + `WHPWhoopStrapFirmwareVersion` | Firmware version read via GATT characteristic; no OTA flow | ❌ Missing |
| Update UI | `WHPBLEConnectingStrap.onboardingFirmwareUpdate`, `WHPPullDownUpdate` | None | ❌ Missing |

**Note:** OTA is high-complexity, low-priority for Goose's use case (single-device personal use). WHOOP's OTA sends new firmware via BLE using a proprietary protocol — would require substantial reverse engineering of the DFU flow.

---

## 7. App Architecture & Lifecycle

| Component | WHOOP Class | Goose Equivalent | Status |
|---|---|---|---|
| Generic State Machine | `WHPStateMachine` + `WHPStateMachineState` + `WHPStateMachineEventDefinition` | No formal state machine; ad-hoc string status everywhere | ❌ Missing |
| Service Layer / DI | `WHPAppService` + `WHPAppServicing` — protocol-based DI | `GooseAppModel` (God object with 8 extensions) | ❌ Missing |
| App Data + Migration | `WHPAppData` singleton + `WHPAppDataMigrator` | No formal migration; SQLite schema managed in Rust | ⚠ Partial |
| Thread-safe Primitives | `WHPAtomicFlag` + `WHPAtomicFlagCounter` | `NSLock` inline at each use site | ⚠ Partial |
| Network Monitor | `WHPNetworkMonitor` — reachability gating for uploads | No network monitor; URLSession called directly | ❌ Missing |
| Upload Auth Gating | `WHPAccountCanUploadDataStatusChanged` — uploads only attempted when account authorized | No gating; upload always attempted | ❌ Missing |
| Logging | `WHPAppLog` | OSLog via `GooseMessage` | ✅ Equivalent |

---

## 8. Strap Status Events

| WHOOP Notification | Goose Equivalent | Status |
|---|---|---|
| `WHPWhoopStrapConnected` / `Disconnected` | `GooseConnectionState` enum | ✅ Equivalent |
| `WHPWhoopStrapReady` | `connectionState = "ready"` (informal string) | ⚠ Informal |
| `WHPWhoopStrapOnWrist` / `OffWrist` | Not implemented | ❌ Missing |
| `WHPWhoopStrapBatteryStatusChanged` | `persistBatterySample` without event push | ⚠ Partial |
| `WHPWhoopStrapCapSenseFailed/Success` | Not implemented (capacitive contact sensor) | ❌ Missing |
| `WHPStrapRoundTripDateChanged` | Not implemented | ❌ Missing |
| `WHPRecoveryProcessedNotification` | No push equivalent; pull-only via `HealthDataStore` | ⚠ Pull-only |
| `WHPMetricsBacklogEmptyNotification` | Not implemented | ❌ Missing |

---

## Priority Matrix for Future Implementation

### Critical (impacts core data reliability)

1. **`WHPBLEBondingManager` — Formal bonding state machine**
   - WHOOP separates connection from bonding; Goose merges them and relies on OS implicit bonding
   - Impact: silent reconnect failures after device reboot or iOS Bluetooth reset
   - Files to create: `GooseBLEBondingManager.swift` + states

2. **`WHPBLEProcessDataValidator` — Data validation layer**
   - Currently frames go from BLE directly to Rust without Swift-side validation
   - Impact: corrupt frames or out-of-order packets reach SQLite
   - Files to create: `GooseBLEDataValidator.swift`

3. **Upload watermark (`WHPStrapLatestUploadedMetricDateKey`)**
   - Without this, re-uploads after restart will duplicate data in TimescaleDB
   - Files to modify: `GooseAppModel+Upload.swift`, add UserDefaults key

4. **Network Monitor for upload gating**
   - Uploads should not be attempted when offline; currently URLSession fails silently
   - Files to create: `GooseNetworkMonitor.swift`

### Important (reliability and correctness)

5. **`WHPStateMachine` — Generic formal state machine**
   - Would simplify BLE client, overnight guard, and sync state considerably
   - Current string-based status creates hard-to-test state management

6. **`WHPHeartRateDataSanitizer` — HR spike filtering**
   - Raw BLE HR values arrive with occasional spikes (200+ BPM noise)
   - Currently displayed raw to user

7. **Cap sense / on-wrist detection**
   - `WHPWhoopStrapCapSenseSuccessNotification` — sensor for skin contact
   - Determines whether physiological data is valid
   - GATT characteristic not yet identified for this

8. **`WHPBLEHistoricalDataManager` — Separate historical manager**
   - Decouple from `GooseBLEClient`; called independently on foreground enter
   - WHOOP calls this explicitly in `applicationWillEnterForeground`

### Lower Priority (out of current milestone scope)

9. **Firmware OTA** — High complexity, proprietary protocol, low user-facing value for single-device use
10. **`WHPHeartRateDecimator2`** — Display optimisation; current approach acceptable
11. **`WHPHeartRateTruth` fusion** — Proprietary algorithm; not reverse-engineerable from strings alone
12. **Meditation activity type** — Minor addition once recording pipeline is stable
13. **Cycle-level sync tracking** — WHOOP tracks physiological cycles separately; Goose's flat sync is sufficient for current scope

---

## Coverage Summary

| Domain | WHOOP Classes | Goose Coverage | % |
|---|---|---|---|
| BLE Connection + Bonding | 15 | 7 | ~47% |
| Data Processing Pipeline | 8 | 5 | ~62% |
| Historical Sync | 8 | 5 | ~62% |
| Real-time Biotelemetry | 6 | 2 | ~33% |
| Activity Recording | 7 | 6 | ~85% |
| Firmware OTA | 5 | 0 | 0% |
| App Architecture | 8 | 4 | ~50% |
| Strap Status Events | 8 | 3 | ~37% |
| **Overall** | **~65** | **~32** | **~55%** |

---

## Reverse Engineering Notes

- Source: Ghidra 12.1.1, ObjcClassDumper.java script, WHOOP iOS v5.37.0 (Mach-O AARCH64)
- Binary is stripped — function names not recoverable directly
- Class names, notification name strings, and debug log strings survive in `__cstring` and `__objc_methname` sections
- AWS SDK present in binary (Amplify + IoT) — cloud sync uses AWS IoT/MQTT, not REST
- `Approov.framework` present — Approov SDK for certificate pinning and API protection
- `WHPBLECommandType` / `WHPBLECommandACKType` are enums; actual numeric values require decompilation of the enum initialiser functions
- `WHPStrapHighWaterMarkDateKey` confirms watermark approach matches Goose phase 60 implementation
