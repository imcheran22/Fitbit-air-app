# Phase 17: @Observable Migration — Research

**Researched:** 2026-06-05
**Domain:** Swift Observation framework, SwiftUI property wrappers, Combine interop
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Migrate all three classes — GooseAppModel, HealthDataStore, GooseBLEClient**

All three classes migrate to `@Observable`.

Per-class changes:
- `@MainActor final class GooseAppModel: ObservableObject` → `@MainActor @Observable final class GooseAppModel`
- `@MainActor final class HealthDataStore: ObservableObject` → `@MainActor @Observable final class HealthDataStore`
- `final class GooseBLEClient: NSObject, ObservableObject, @unchecked Sendable` → `@Observable final class GooseBLEClient: NSObject, @unchecked Sendable`

Remove all `@Published` annotations. `@Observable` uses the macro's own property observation (no wrapper needed).

NSObject + @Observable: compatible in Swift 5.9+. CoreBluetooth delegate conformances unaffected. Existing main-thread guards remain — @Observable does not add thread safety.

**D-02: Replace @EnvironmentObject → @Environment in all 26 view files**

```swift
// Before:
@EnvironmentObject private var model: GooseAppModel
// After:
@Environment(GooseAppModel.self) private var model

// Injection (before):
.environmentObject(model)
// Injection (after):
.environment(model)
```

@ObservedObject views: remove wrapper, access directly.
@StateObject: migrate to @State.

**D-03: Migration wave order (safe)**

1. Wave 1: GooseAppModel class body + all views that @EnvironmentObject it
2. Wave 2: HealthDataStore class body + all views that @ObservedObject or @EnvironmentObject it
3. Wave 3: GooseBLEClient class body + views that @ObservedObject var ble
4. Wave 4: Injection sites (GooseSwiftApp, AppShellView) + final build verification

Each wave must compile before the next starts.

### Claude's Discretion

(None specified in CONTEXT.md — all major decisions are locked.)

### Deferred Ideas (OUT OF SCOPE)

(None specified in CONTEXT.md.)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | GooseAppModel uses Swift @Observable macro — views that do not access a changed property do not re-render | D-01 locked; Wave 1 plan covers class body + 26 view files |
| PERF-02 | HealthDataStore uses Swift @Observable macro — same per-property tracking benefit | D-01 locked; Wave 2 covers class body + all @ObservedObject store: HealthDataStore sites |
| PERF-03 | "Update NavigationRequestObserver tried to update multiple times per frame" warning eliminated at capture startup | Caused by global objectWillChange broadcasts from GooseAppModel; eliminated when @Observable stops firing on unrelated property changes |
</phase_requirements>

---

## Summary

Phase 17 migrates three `ObservableObject` classes to the `@Observable` macro introduced in Swift 5.9 / iOS 17. The principal benefit is per-property observation tracking: SwiftUI views only re-render when a property they actually read changes, eliminating the global `objectWillChange` broadcast that currently causes the PERF-03 warning during capture startup.

The scope is well-understood and bounded. The three target classes carry a combined 145 `@Published` annotations (GooseAppModel: 52, HealthDataStore: 25, GooseBLEClient: 68). View-side wiring touches approximately 57 view files/structs that hold `@ObservedObject`, `@StateObject`, or `@EnvironmentObject` declarations targeting these three classes.

**Critical finding:** A Combine pipeline in `MoreDataStore.bindRouteStatus(_:model:)` directly subscribes to `ble.$connectionState`, `ble.$hrConnectionState`, and `model.$helloSummary` as `Publisher` objects. `@Observable` does not emit `Published.Publisher` values — the `$property` syntax disappears entirely. This pipeline must be replaced before or during Wave 3 (GooseBLEClient migration). `MoreDataStore` itself is NOT being migrated to `@Observable` in this phase (it is out of scope), but it depends on the Combine publishers of the two classes that ARE being migrated.

**Primary recommendation:** Execute waves in the locked order (D-03). Fix the `MoreDataStore` Combine dependency as an explicit sub-task of Wave 3. Use `withObservationTracking` or a polling-on-appear pattern as the replacement.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Observation tracking (properties) | Swift macro (compile-time) | — | @Observable rewrites storage at compile time via macro expansion |
| View re-render triggering | SwiftUI runtime | — | SwiftUI access tracking replaces Combine objectWillChange pipeline |
| Combine interop (MoreDataStore pipeline) | API layer (MoreDataStore) | — | MoreDataStore owns the subscription; must be rewritten when publishers disappear |
| Injection into SwiftUI environment | App entry point (GooseSwiftApp) | Per-subtree injection sites | .environment() replaces .environmentObject() at same call sites |
| Thread safety on property writes | Caller (main-thread guards) | — | @Observable does not add thread safety; existing guards remain unchanged |

---

## @Published Audit (Verified by grep)

### GooseAppModel (`GooseSwift/GooseAppModel.swift`)

52 `@Published` properties, all in the main class file (no split across extension files — extensions carry methods, not stored properties). [VERIFIED: grep -c]

Complete list:
1. `onboardingComplete: Bool`
2. `rustStatus: String`
3. `helloSummary: String`
4. `packetImportRevision: Int`
5. `packetImportStatus: String`
6. `activityPersistenceStatus: String`
7. `homeActivityTimelineItems: [ActivityTimelineItem]`
8. `homeActivityTimelineStatus: String`
9. `activityDetectionStatus: String`
10. `movementPacketValidationStatus: String`
11. `movementPacketValidationIsRunning: Bool`
12. `heartRateHourlyRanges: [HeartRateHourlyRange]`
13. `heartRateStorageStatus: String`
14. `healthPacketCaptureSessionID: String?`
15. `healthPacketCaptureStatus: String`
16. `healthPacketCaptureStartedAt: Date?`
17. `healthPacketCaptureFrameCount: Int`
18. `healthPacketCaptureTargetSummary: String`
19. `healthPacketCaptureLastPacketSummary: String`
20. `healthPacketCaptureFamilyRows: [HealthPacketCaptureFamily]`
21. `respiratoryPacketWatchActive: Bool`
22. `respiratoryPacketWatchStatus: String`
23. `overnightGuardActive: Bool`
24. `overnightGuardStatus: String`
25. `overnightGuardReadinessStatus: String`
26. `overnightGuardReadinessSummary: String`
27. `overnightGuardRawNotificationCount: Int`
28. `overnightGuardRangePollCount: Int`
29. `overnightGuardRangeTelemetryCount: Int`
30. `overnightGuardSuccessfulRangePollCount: Int`
31. `overnightGuardCommandWriteCount: Int`
32. `overnightGuardEventLogCount: Int`
33. `overnightGuardTargetSummary: String`
34. `overnightGuardHistoricalOrderSummary: String`
35. `overnightGuardLastPacketSummary: String`
36. `overnightGuardSpoolPath: String`
37. `overnightGuardSpoolSizeSummary: String`
38. `overnightGuardSQLiteMirrorSummary: String`
39. `overnightGuardPowerSummary: String`
40. `overnightGuardWatchdogSummary: String`
41. `overnightGuardWarning: String`
42. `overnightGuardExportStatus: String`
43. `overnightGuardExportInProgress: Bool`
44. `overnightGuardExportURL: URL?`
45. `overnightGuardExportManifestURL: URL?`
46. `overnightGuardExportManifestError: String?`
47. `overnightGuardCanExportLastSession: Bool`
48. `serverReachable: Bool?`
49. `lastUploadAt: Date?`
50. `pendingBatchCount: Int`
51. `lastSyncedCount: Int?`
52. `connectedDeviceGeneration: String?`

**No property observers (`didSet`/`willSet`) found on any `@Published` in GooseAppModel.** [VERIFIED: grep]

### HealthDataStore (`GooseSwift/HealthDataStore.swift`)

25 `@Published` properties. [VERIFIED: grep -c]

Complete list:
1. `algorithmDefinitions: [HealthAlgorithmDefinition]`
2. `referenceDefinitions: [HealthAlgorithmDefinition]`
3. `selectedAlgorithmByFamily: [String: String]`
4. `catalogStatus: String`
5. `catalogSource: HealthDataSource`
6. `packetInputStatus: String`
7. `packetScoreStatus: String`
8. `bandSleepImportStatus: String`
9. `externalSleepImportStatus: String`
10. `referenceRunStatusByFamily: [String: String]`
11. `primarySleepDetail: PrimarySleepDetail?`
12. `hkRestingHR: Double?`
13. `hkHRVSDNNMs: Double?`
14. `hkRespiratoryRate: Double?`
15. `hkSpO2Percent: Double?`
16. `hkSkinTempDeltaC: Double?`
17. `hkSteps: Int?`
18. `hkActiveKcal: Double?`
19. `hkWorkouts: [ActivityTimelineItem]`
20. `hkImportStatus: String`
21. `calibrationTargetFamily: String`
22. `calibrationLabelsImported: Bool`
23. `calibrationRunComplete: Bool`
24. `heartRateHourlyRanges: [HeartRateHourlyRange]`
25. `heartRateTimelineStatus: String`

Note: `hkHRVHistory` and `hkRHRHistory` are plain `var` (no `@Published`) — they do NOT need `@Published` removed (already plain).

**No property observers on any `@Published` in HealthDataStore.** [VERIFIED: grep]

### GooseBLEClient (`GooseSwift/GooseBLEClient.swift`)

68 `@Published` properties, all in the main class file. [VERIFIED: grep -c]

Complete list (lines 7–74):
1. `bluetoothState: String`
2. `connectionState: String`
3. `isScanning: Bool`
4. `discoveredDevices: [GooseDiscoveredDevice]`
5. `liveHeartRateBPM: Int?`
6. `liveHeartRateSource: String`
7. `liveHeartRateUpdatedAt: Date?`
8. `restingHeartRateEstimateBPM: Double?`
9. `restingHeartRateEstimateSampleCount: Int`
10. `restingHeartRateEstimateSource: String`
11. `restingHeartRateEstimateUpdatedAt: Date?`
12. `liveHRVRMSSD: Double?`
13. `liveHRVRRIntervalCount: Int`
14. `liveHRVSource: String`
15. `liveHRVUpdatedAt: Date?`
16. `liveHRVRMSSDSampleCount: Int`
17. `reconnectState: String`
18. `hrReconnectState: String`
19. `discoveredHRDevices: [GooseDiscoveredDevice]`
20. `hrConnectionState: String`
21. `hrBluetoothState: String`
22. `rememberedDeviceDescription: String`
23. `activeDeviceName: String`
24. `activeDeviceIdentifier: UUID?`
25. `selectedDeviceID: UUID?`
26. `connectedAt: Date?`
27. `lastSyncAt: Date?`
28. `batteryLevelPercent: Int?`
29. `batteryUpdatedAt: Date?`
30. `batteryIsCharging: Bool?`
31. `batteryPowerStatus: String`
32. `firmwareVersion: String?`
33. `modelNumber: String?`
34. `hardwareRevision: String?`
35. `softwareRevision: String?`
36. `manufacturerName: String?`
37. `isHistoricalSyncing: Bool`
38. `historicalSyncStatus: String`
39. `historicalPacketCount: Int`
40. `lastHistoricalSyncCompletedAt: Date?`
41. `lastHistoricalRangeCommandStatus: String`
42. `alarmCommandStatus: String`
43. `lastAlarmCommandFrameHex: String`
44. `lastAlarmResponseSummary: String`
45. `lastAlarmResponsePayloadHex: String`
46. `lastAlarmEventSummary: String`
47. `lastAlarmEventPayloadHex: String`
48. `lastAlarmScheduledAt: Date?`
49. `lastAlarmID: Int?`
50. `physiologyCaptureStatus: String`
51. `lastPhysiologyCommandSummary: String`
52. `highFrequencyHistorySyncStatus: String`
53. `highFrequencyHistorySyncActive: Bool`
54. `highFrequencyHistorySyncExpiresAt: Date?`
55. `lastHighFrequencyHistorySyncResponse: String`
56. `lastHighFrequencyHistorySyncEvent: String`
57. `strapClockDate: Date?`
58. `strapClockOffsetSeconds: TimeInterval?`
59. `strapClockUpdatedAt: Date?`
60. `strapClockStatus: String`
61. `lastClockCommandFrameHex: String`
62. `lastClockResponsePayloadHex: String`
63. `syncToast: GooseSyncToast?`
64. `lastSyncFailure: GooseSyncFailure?`
65. `syncFailureSheet: GooseSyncFailure?`
66. `debugCommandStatus: String`
67. `debugCommandResponses: [GooseDebugCommandResponse]`
68. `debugCommandSnapshotPath: String`

**No property observers on any `@Published` in GooseBLEClient.** [VERIFIED: grep]

---

## NSObject + @Observable Compatibility Assessment

**Declaration inspected (GooseBLEClient.swift, line 6):**
```swift
final class GooseBLEClient: NSObject, ObservableObject, @unchecked Sendable {
```

**After migration (D-01):**
```swift
@Observable final class GooseBLEClient: NSObject, @unchecked Sendable {
```

**Assessment:** COMPATIBLE. [ASSUMED — based on Swift 5.9+ documentation and known behaviour; no blocking issues reported in official release notes for NSObject + @Observable combination]

Key points:
- `@Observable` macro generates a conformance to the `Observable` protocol; it does not conflict with `NSObject` inheritance.
- `CBCentralManagerDelegate` and `CBPeripheralDelegate` conformances (declared in extension files) are unaffected — they depend on `NSObject`, not on `ObservableObject`.
- `@unchecked Sendable` is kept as-is. `@Observable` does not inject thread safety; the existing `DispatchQueue` guards and `NSLock` instances remain necessary and unchanged.
- The `BLEUIStateAggregator` stored as a `let` property is a plain `final class` (not `ObservableObject`, not `@Observable`) — no change required.
- Stored `DispatchQueue`, `NSLock`, `Logger`, and `GooseMessageStore` properties are all plain `let` — no change required.

---

## CRITICAL: Combine Subscription Blocker

### The Problem

`MoreDataStore.bindRouteStatus(ble:model:)` (`GooseSwift/MoreDataStore.swift`, lines 154–168) constructs a Combine pipeline that subscribes to Combine publishers emitted by `@Published` properties on the two classes being migrated:

```swift
Publishers.MergeMany(
  ble.$connectionState.removeDuplicates().map { _ in () },
  ble.$hrConnectionState.removeDuplicates().map { _ in () },
  model.$helloSummary.removeDuplicates().map { _ in () }
)
.debounce(for: .milliseconds(50), scheduler: DispatchQueue.main)
.sink { [weak self, weak ble, weak model] in ... }
.store(in: &bleStatusCancellables)
```

**Why this breaks:** `@Observable` does not synthesize `Published.Publisher` values. The `$connectionState`, `$hrConnectionState`, and `$helloSummary` syntax will fail to compile after Waves 1 and 3 migrate their owner classes. [VERIFIED: Apple Observation framework documentation — `@Observable` types do not conform to `ObservableObject` and do not expose `@Published` publishers]

**Where it lives:** `MoreDataStore` is NOT being migrated in Phase 17 (it is not `GooseAppModel`, `HealthDataStore`, or `GooseBLEClient`). However, it reads `@Published` publishers from classes that ARE being migrated.

**When it breaks:**
- After Wave 1 (GooseAppModel migrated): `model.$helloSummary` no longer compiles
- After Wave 3 (GooseBLEClient migrated): `ble.$connectionState` and `ble.$hrConnectionState` no longer compile

### Required Replacement

`MoreDataStore.bindRouteStatus` must be rewritten to not use Combine publishers. Two viable approaches:

**Option A — Poll on `.onAppear` (simplest, zero Combine):**
Remove `bindRouteStatus` entirely. Call `refreshRouteStatus(ble:model:)` directly in the `.onAppear` modifier of `MoreView` (already done at line 102) plus any other site that currently calls `bindRouteStatus`. Accept that route status is recalculated only on view appearance, not reactively mid-session.

**Option B — `withObservationTracking` loop (reactive, no Combine):**
Replace the Combine pipeline with a `Task`-based loop using `withObservationTracking`:
```swift
func observeRouteStatus(ble: GooseBLEClient, model: GooseAppModel) {
  Task { @MainActor [weak self] in
    while !Task.isCancelled {
      await withObservationTracking {
        self?.refreshRouteStatus(ble: ble, model: model)
      } onChange: { ... }
    }
  }
}
```

**Recommendation:** Option A (poll on appear) is lower-risk for this phase. `MoreView.onAppear` already calls `bindRouteStatus`; removing the Combine subscription means `routeStatus` updates once on appear instead of reactively. This is sufficient for a status list view. Option B can be added if PERF-03 is still triggered after the main migration.

This sub-task belongs in **Wave 3** (GooseBLEClient migration), since that is when `ble.$connectionState` would break. It can be addressed in Wave 1 (model.$helloSummary breaks first) if the team prefers to fix it atomically.

---

## View-Side Wiring Inventory

### @EnvironmentObject (GooseAppModel) — Must change to @Environment

| File | Line | Current | After |
|------|------|---------|-------|
| MoreCaptureViews.swift | 57 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HealthDashboardViews.swift | 562 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| MoreView.swift | 11 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| LiveActivityView.swift | 7 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| MoreProfileViews.swift | 89 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HRMonitorView.swift | 5 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HRMonitorView.swift | 14 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| LiveActivityContentView.swift | 22 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| ConnectionView.swift | 4 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| ConnectionView.swift | 13 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| RootView.swift | 4 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HomeDashboardView.swift | 4 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| AppShellView.swift | 4 | `@EnvironmentObject private var router: AppRouter` | out of scope (AppRouter not migrated) |
| DeviceView.swift | 5 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| DeviceView.swift | 19 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| MoreRemoteServerViews.swift | 34 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HealthRecoveryStressViews.swift | 8 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HealthRecoveryStressViews.swift | 221 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| OnboardingView.swift | 9 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| MoreDebugViews.swift | 4 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HealthMetricFamilyStrainViews.swift | 7 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HealthMetricFamilyStrainViews.swift | 397 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| CoachView.swift | 4 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| MoreInfoViews.swift | 79 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |
| HealthView.swift | 7 | `@EnvironmentObject private var model: GooseAppModel` | `@Environment(GooseAppModel.self) private var model` |

### @ObservedObject (GooseAppModel) — Remove wrapper

| File | Line | Current | After |
|------|------|---------|-------|
| CoachChatScreen.swift | 6 | `@ObservedObject var appModel: GooseAppModel` | Remove `@ObservedObject` |
| DeviceView.swift | 305 | `@ObservedObject var model: GooseAppModel` | Remove `@ObservedObject` |
| DeviceView.swift | 455 | `@ObservedObject var model: GooseAppModel` | Remove `@ObservedObject` |

### @StateObject (GooseAppModel) — Change to @State

| File | Line | Current | After |
|------|------|---------|-------|
| GooseSwiftApp.swift | 6 | `@StateObject private var model = GooseAppModel()` | `@State private var model = GooseAppModel()` |

### .environmentObject(model) injection sites — Change to .environment(model)

| File | Line | Current | After |
|------|------|---------|-------|
| GooseSwiftApp.swift | 16 | `.environmentObject(model)` | `.environment(model)` |
| HRMonitorView.swift | 9 | `.environmentObject(model)` | `.environment(model)` |
| ConnectionView.swift | 8 | `.environmentObject(model)` | `.environment(model)` |
| DeviceView.swift | 9 | `.environmentObject(model)` | `.environment(model)` |
| LiveActivityView.swift | 15 | `.environmentObject(model)` | `.environment(model)` |
| CoachView.swift | 672 | `.environmentObject(GooseAppModel(startBLE: false))` | `.environment(GooseAppModel(startBLE: false))` |
| HealthPreviews.swift | 14 | `.environmentObject(GooseAppModel(startBLE: false))` | `.environment(GooseAppModel(startBLE: false))` |
| HealthPreviews.swift | 23 | `.environmentObject(GooseAppModel(startBLE: false))` | `.environment(GooseAppModel(startBLE: false))` |

Note: `GooseSwiftApp.swift:17` injects `model.packetMonitor` and `:18` injects `model.ble.messageStore`. Both `PacketMonitorModel` and `GooseMessageStore` are `ObservableObject` subclasses NOT in scope for Phase 17 migration. Their `.environmentObject(...)` calls remain unchanged.

### @ObservedObject (HealthDataStore) — Remove wrapper

| File | Lines |
|------|-------|
| MoreView.swift | 13 |
| MoreRawExportViews.swift | 144, 145 |
| CoachChatScreen.swift | 5 |
| HealthDashboardViews.swift | 342, 361, 387, 473, 563 |
| SleepBridgeViews.swift | 7 |
| SleepV2ScheduleViews.swift | 85 |
| HomeDashboardView.swift | 6 |
| HealthSupplementalViews.swift | 7, 52, 92, 118 |
| HealthCardioViews.swift | 8, 20, 28 |
| CoachView.swift | 6 |
| HealthView.swift | 8 |
| HealthRecoveryStressViews.swift | 9, 222 |
| HealthSleepOverviewViews.swift | 8 |
| HealthMetricFamilyStrainViews.swift | 10, 398, 836 |

### @StateObject (HealthDataStore) — Change to @State

| File | Line | Current | After |
|------|------|---------|-------|
| AppShellView.swift | 5 | `@StateObject private var healthStore = HealthDataStore()` | `@State private var healthStore = HealthDataStore()` |
| HealthDashboardViews.swift | 324 | `@StateObject private var store: HealthDataStore` | `@State private var store: HealthDataStore` |

Note: `HealthDashboardViews.swift:332` uses `_store = StateObject(wrappedValue: store)` in a custom initialiser — must change to `_store = State(initialValue: store)`.

### @ObservedObject (GooseBLEClient) — Remove wrapper

| File | Lines |
|------|-------|
| HealthSleepSheetsViews.swift | 224, 760 |
| SleepV2ScheduleViews.swift | 86 |
| RootView.swift | 64 |
| HRMonitorView.swift | 15, 161, 226 |
| ConnectionView.swift | 15 |
| FitnessLiveWorkoutViews.swift | 10, 134 |
| SleepBridgeViews.swift | 8, 91 |
| OnboardingStepViews.swift | 196, 348 |
| LiveActivityContentView.swift | 25 |
| DeviceView.swift | 21, 307, 456, 562 |
| FitnessSummaryViews.swift | 9 |
| HealthSleepOverviewViews.swift | 9 |

---

## Out-of-Scope ObservableObject Classes

The following classes are `ObservableObject` but are NOT targets of Phase 17 migration. Their `@ObservedObject`/`@StateObject`/`@EnvironmentObject` wiring is unchanged:

| Class | File | Reason out of scope |
|-------|------|---------------------|
| `AppRouter` | AppRouter.swift | Not in D-01 |
| `PacketMonitorModel` | PacketMonitorModel.swift | Not in D-01 |
| `GooseMessageStore` | GooseMessageStore.swift | Not in D-01 |
| `MoreDataStore` | MoreDataStore.swift | Not in D-01 |
| `ActivitySessionModel` | ActivitySessionModel.swift | Not in D-01 |
| `ActivityLocationTracker` | ActivityLocationTracker.swift | Not in D-01 |
| `OpenAICoachChatModel` | OpenAICoachChat.swift | Not in D-01 |
| `MoreRemoteServerViewModel` | MoreRemoteServerViews.swift | Not in D-01 |

---

## Architecture Patterns

### @Observable Macro — How it works

The `@Observable` macro rewrites stored properties to use `_$observationRegistrar` under the hood. The macro expansion:
1. Adds a private `_$observationRegistrar: ObservationRegistrar` stored property
2. Wraps each stored property's `get`/`set` with `_$observationRegistrar.access(self, keyPath: \...)` and `_$observationRegistrar.withMutation(self, keyPath: \...)` calls
3. Adds a conformance to the `Observable` marker protocol

Net effect: SwiftUI's body evaluation registers which properties were accessed; future mutations notify only affected views.

### @Observable + NSObject Pattern

```swift
// Correct — @Observable before NSObject in class declaration
@Observable final class GooseBLEClient: NSObject, @unchecked Sendable {
  // No @Published annotations — plain var
  var bluetoothState = "not requested"
  var connectionState = "disconnected"
  // ...
}
```

`CBCentralManagerDelegate` and `CBPeripheralDelegate` extensions remain on separate files unchanged.

### @Environment Consumption Pattern

```swift
// In a view struct — no property wrapper prefix
@Environment(GooseAppModel.self) private var model
```

Note: `@Environment` with a type key requires the type to conform to `Observable`. This is satisfied by `@Observable`. Without `@Observable`, this line would crash at runtime.

### @State for Owned Observable Objects

```swift
// Before:
@StateObject private var model = GooseAppModel()

// After:
@State private var model = GooseAppModel()
```

`@State` with a reference type keeps the instance alive for the view's lifetime (same semantics as `@StateObject`), and `@Observable` makes it reactive without `@Published`.

### Custom Init with @State

```swift
// HealthDashboardViews.swift — Before:
_store = StateObject(wrappedValue: store)

// After:
_store = State(initialValue: store)
```

---

## Common Pitfalls

### Pitfall 1: Combine `$property` Publisher Access

**What goes wrong:** After `@Observable` migration, any code using `model.$property` or `ble.$connectionState` as a `Publisher` fails to compile: `Value of type 'GooseAppModel' has no member '$...'`.

**Why it happens:** `@Observable` does not synthesize `Published.Publisher` projections. The `$` prefix is specific to the `@Published` property wrapper, which is removed.

**Affected site:** `MoreDataStore.bindRouteStatus(ble:model:)` — lines 157–159. **Must be fixed before or during the wave that migrates the owner class.**

**How to avoid:** Rewrite using poll-on-appear (Option A) or `withObservationTracking` (Option B). See Combine Subscription Blocker section.

**Warning signs:** Compiler error `Value of type '...' has no member '$...'`.

### Pitfall 2: @EnvironmentObject Crash at Runtime

**What goes wrong:** If a view uses `@EnvironmentObject var model: GooseAppModel` after the class is marked `@Observable`, the runtime crashes: `No ObservableObject of type GooseAppModel found`. `@Observable` types do NOT conform to `ObservableObject`; they cannot be injected with `.environmentObject(...)`.

**Why it happens:** `@EnvironmentObject` looks for an `ObservableObject` conformance in the environment. `@Observable` types have `Observable` conformance, not `ObservableObject`.

**How to avoid:** Replace ALL `@EnvironmentObject`/`.environmentObject(...)` pairs atomically within the same wave. This is why D-03 requires class body + view updates in a single atomic wave.

**Warning signs:** App crashes on launch or view presentation with `Fatal error: No ObservableObject of type ... found.`

### Pitfall 3: @ObservedObject Wrapper on @Observable Type

**What goes wrong:** Leaving `@ObservedObject var ble: GooseBLEClient` after migration compiles with a deprecation warning in Swift 5.9 but does not produce per-property tracking — it still uses the old `objectWillChange` path for that view.

**Why it happens:** `@ObservedObject` accepts any `ObservableObject`. After migration, `GooseBLEClient` no longer conforms to `ObservableObject`, so the compiler will error. During the transition period (partial migration), mixing old and new wrappers silently degrades performance.

**How to avoid:** Remove `@ObservedObject` wrapper when passing an `@Observable` type. The variable becomes a plain `var` parameter — SwiftUI still tracks it because the body evaluator observes property accesses.

### Pitfall 4: StateObject Custom Init Pattern

**What goes wrong:** `_store = StateObject(wrappedValue: store)` → `_store = State(wrappedValue: store)` (WRONG).

`@State` uses `initialValue:`, not `wrappedValue:`:

```swift
// Wrong:
_store = State(wrappedValue: store)

// Correct:
_store = State(initialValue: store)
```

**Affected site:** `HealthDashboardViews.swift:332`.

**Warning signs:** Compiler error on the `State(wrappedValue:)` call.

### Pitfall 5: @unchecked Sendable + @Observable Thread Safety

**What goes wrong:** Developers assume `@Observable` adds thread safety because the macro rewrites property access. It does not.

**Why it happens:** The `ObservationRegistrar` calls added by the macro do not add locks. `GooseBLEClient` mutates `@Published` properties from CoreBluetooth delegate callbacks (on the CoreBluetooth queue). After migration, those same properties are mutated from the same queue without `@MainActor` isolation.

**How to avoid:** All existing `DispatchQueue.main.async { ... }` guards around `@Published` mutations in `GooseBLEClient` extension files must be preserved exactly as-is after removing `@Published`. The macro expansion does not make the code thread-safe.

### Pitfall 6: Unused Combine Import in MoreDataStore

**What goes wrong:** After replacing `bindRouteStatus`, `MoreDataStore.swift` imports `Combine` and declares `private var bleStatusCancellables = Set<AnyCancellable>()`. If Option A (poll-on-appear) is used, the import and property become dead code. Leaving them causes no compile error but is misleading.

**How to avoid:** Remove `import Combine` and the `bleStatusCancellables` property from `MoreDataStore.swift` when removing the Combine pipeline.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Xcode build (no Swift test target detected in project) |
| Quick run command | `xcodebuild build -project GooseSwift.xcodeproj -scheme GooseSwift -sdk iphonesimulator -arch arm64 CODE_SIGNING_ALLOWED=NO` |
| Full suite command | Same — no automated unit tests exist for Swift layer |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | GooseAppModel uses @Observable | Build verification | xcodebuild build | N/A — structural |
| PERF-02 | HealthDataStore uses @Observable | Build verification | xcodebuild build | N/A — structural |
| PERF-03 | No NavigationRequestObserver warning | Manual / log inspection | App launch, initiate capture, inspect console | N/A — runtime |

### Wave 0 Gaps

None — this phase is structural refactoring. No new test files are needed. Verification is:
1. Each wave: `xcodebuild build` must succeed before next wave starts
2. Final: Manual app launch + BLE connection + capture start to confirm PERF-03 elimination

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode with iOS 17+ SDK | @Observable macro (iOS 17+) | ✓ (iOS 26 SDK, project target) | iOS 26.0 SDK | — |
| Swift 5.9+ compiler | @Observable macro | ✓ (Xcode ships 5.9+) | Bundled with Xcode | — |
| Observation framework | @Observable runtime | ✓ (bundled iOS 17+) | iOS 26 deployment target | — |

---

## Package Legitimacy Audit

> No external packages are installed in this phase. Migration is purely source-code changes within the existing codebase.

---

## Security Domain

`security_enforcement: true`, ASVS level 1.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | — |
| V6 Cryptography | No | — |

This phase performs no data ingestion, no authentication, no network communication, and no persistent storage changes. The migration is purely an observation/reactivity mechanism change. No ASVS controls are applicable.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | @Observable is compatible with NSObject subclasses in Swift 5.9+ without compiler issues | NSObject + @Observable section | Wave 3 GooseBLEClient migration would produce unexpected compiler errors; fallback: keep GooseBLEClient as ObservableObject |
| A2 | The 26 view files referenced in D-02 are fully covered by the @EnvironmentObject audit above | View-Side Wiring Inventory | Missing a view would cause a runtime crash after injection site is changed to .environment() |

---

## Open Questions

1. **HealthDashboardViews @StateObject custom init**
   - What we know: Line 324 uses `@StateObject private var store: HealthDataStore` with `_store = StateObject(wrappedValue: store)` at line 332
   - What's unclear: Whether additional custom init overloads exist beyond line 326–333 that use the same pattern
   - Recommendation: Read all `HealthRouteDetailView` init overloads before authoring the edit

2. **GooseSwiftApp.swift:17–18 injection sites**
   - What we know: `.environmentObject(model.packetMonitor)` and `.environmentObject(model.ble.messageStore)` inject out-of-scope `ObservableObject` instances
   - What's unclear: Whether any view that receives these injections ALSO receives `GooseAppModel` and will be confused by mixed injection styles
   - Recommendation: Keep these two lines as `.environmentObject(...)` (not migrated); they are independent of the three target classes

---

## Sources

### Primary (HIGH confidence)
- Apple Developer Documentation — Observation framework / `@Observable` macro: https://developer.apple.com/documentation/observation
- Codebase grep audit (this session) — all @Published counts, @ObservedObject sites, Combine usage

### Secondary (MEDIUM confidence)
- GooseSwift/MoreDataStore.swift — Combine pipeline at lines 154–168 (directly inspected)
- GooseSwift/GooseBLEClient.swift lines 1–150 (directly inspected)
- GooseSwift/HealthDataStore.swift (directly inspected)
- GooseSwift/GooseAppModel.swift (directly inspected)

---

## Metadata

**Confidence breakdown:**
- @Published property counts: HIGH — verified by grep -c in session
- Combine blocker identification: HIGH — directly read MoreDataStore.swift source
- NSObject + @Observable compatibility: ASSUMED — based on Swift 5.9+ known behaviour
- View wiring inventory: HIGH — full grep across GooseSwift/ directory

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable framework; @Observable API is stable in iOS 17+)
