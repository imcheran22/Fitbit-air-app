# Phase 90 Context: Domain ViewModels

## Phase Goal
GooseAppModel decomposed into 3 domain-scoped @Observable objects so high-frequency BLE updates (1 Hz HR) do not invalidate unrelated SwiftUI views.

## Decision: Full scope — BLEState + SyncState + HealthState

## Domain Object Definitions

### BLEState @Observable
High-frequency BLE-connection properties — updated every BLE callback, 1 Hz HR.

Properties moved FROM GooseAppModel:
- `bondingState: GooseBLEBondingState`
- `connectedDeviceGeneration: String?`
- `liveWorkoutStrain: Double`
- `heartRateHourlyRanges: [HeartRateHourlyRange]`
- `heartRateStorageStatus: String`
- `onboardingComplete: Bool` (gated on BLE pairing)
- `alarmIsArmed: Bool` / `scheduledAlarmTime: Date?` (HAP-03 — driven by BLE sync)

### SyncState @Observable
Upload/sync status properties — updated during sync operations.

Properties moved FROM GooseAppModel:
- `syncPendingRowCount: Int`
- `pendingBatchCount: Int`
- `lastSyncedCount: Int?`
- `serverImportInProgress: Bool`
- `serverImportLastFrameCount: Int?`
- `lastUploadAt: Date?`
- `uploadErrorState: String?`
- `hasPendingUploadAfterReconnect: Bool`
- `serverReachable: Bool?`
- `connectionTestRunning: Bool`
- `connectionTestResult: String?`
- `isNetworkReachable: Bool`
- `apnsDeviceToken: String?`

### HealthState @Observable
Health packet capture + activity + overnight status.

Properties moved FROM GooseAppModel:
- `healthPacketCaptureSessionID: String?`
- `healthPacketCaptureStatus: String`
- `healthPacketCaptureStartedAt: Date?`
- `healthPacketCaptureFrameCount: Int`
- `healthPacketCaptureTargetSummary: String`
- `healthPacketCaptureLastPacketSummary: String`
- `healthPacketCaptureFamilyRows: [HealthPacketCaptureFamily]`
- `respiratoryPacketWatchActive: Bool`
- `respiratoryPacketWatchStatus: String`
- `activityPersistenceStatus: String`
- `homeActivityTimelineItems: [ActivityTimelineItem]`
- `homeActivityTimelineStatus: String`
- `activityDetectionStatus: String`
- `movementPacketValidationStatus: String`
- `movementPacketValidationIsRunning: Bool`
- `packetImportRevision: Int`
- `packetImportStatus: String`

### GooseAppModel (coordinator, stays)
- `rustStatus: String`
- `helloSummary: String`
- All work item properties (DispatchWorkItem)
- `let bleState: BLEState`
- `let syncState: SyncState`
- `let healthState: HealthState`
- Extension files access domain objects via `model.bleState.xxx`

## Pattern: Extension File Access
GooseAppModel extensions mutate domain objects directly:
```swift
// Before
self.bondingState = newState
// After
bleState.bondingState = newState
```
Extensions remain on GooseAppModel; they reference `bleState.xxx`, `syncState.xxx`, `healthState.xxx`.

## Pattern: View Injection
All 3 domain objects injected from GooseSwiftApp via `.environment()`:
```swift
.environment(model.bleState)
.environment(model.syncState)
.environment(model.healthState)
```
Views declare only the domain object they need:
```swift
@Environment(BLEState.self) private var bleState
```

## Files Created
- `GooseSwift/BLEState.swift` — new @Observable class
- `GooseSwift/SyncState.swift` — new @Observable class
- `GooseSwift/HealthState.swift` — new @Observable class

## GooseAppModel stays as coordinator
GooseAppModel itself is NOT removed. Views that need cross-domain coordination still use `@EnvironmentObject model` via GooseAppModel. Only domain-specific views switch to the appropriate domain object.

## Out of Scope
- Moving DispatchWorkItem properties out of GooseAppModel
- Changing GooseAppModel extension file structure
- Removing GooseAppModel from environment injection
