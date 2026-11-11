# Phase 60: Band-First Sync - Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 12 (3 delete, 1 create, 8 modify)
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `GooseAppModel+BandFirstSync.swift` (CREATE) | coordinator-extension | event-driven + request-response | `GooseAppModel+SleepSync.swift` | exact |
| `GooseSwiftApp.swift` (MODIFY) | app-entry | event-driven | `GooseSwiftApp.swift` itself (init pattern) | self |
| `GooseAppModel+Lifecycle.swift` (MODIFY) | coordinator-extension | event-driven | `GooseAppModel+Lifecycle.swift` itself | self |
| `GooseAppModel.swift` (MODIFY) | model | — | `GooseAppModel.swift` itself | self |
| `MoreCaptureViews.swift` (MODIFY) | view | — | `MoreCaptureViews.swift` itself | self |
| `GooseAppModel+NotificationPipeline.swift` (MODIFY) | coordinator-extension | event-driven | `GooseAppModel+NotificationPipeline.swift` | self |
| `GooseAppModel+ActivityTimeline.swift` (MODIFY) | coordinator-extension | CRUD | `GooseAppModel+ActivityTimeline.swift` | self |
| `CoachLocalToolContext.swift` (MODIFY) | utility | request-response | `CoachLocalToolContext.swift` | self |
| `CodexCoachSupport.swift` (MODIFY) | utility | request-response | `CodexCoachSupport.swift` | self |
| `LocalizedStatusStrings.swift` (MODIFY) | utility | transform | `LocalizedStatusStrings.swift` | self |
| `HealthPacketCaptureTypes.swift` (MODIFY) | model | — | `HealthPacketCaptureTypes.swift` | self |
| `GooseAppModel+OvernightRun.swift` (DELETE) | — | — | — | — |
| `GooseAppModel+OvernightState.swift` (DELETE) | — | — | — | — |
| `GooseAppModel+OvernightRecovery.swift` (DELETE) | — | — | — | — |

## Pattern Assignments

### `GooseAppModel+BandFirstSync.swift` (CREATE — coordinator-extension, event-driven)

**Analog:** `GooseSwift/GooseAppModel+SleepSync.swift`

**Imports pattern** (SleepSync.swift lines 1–2):
```swift
import Foundation
```
BandFirstSync needs `Foundation` for `UserDefaults`, `Date`, `TimeInterval`. Also needs `BackgroundTasks` only if the BGTask handler lives here. Per RESEARCH.md recommendation, place `handleBGAppRefresh` on GooseAppModel — so `import BackgroundTasks` is required.

**Static constants pattern** (SleepSync.swift lines 8):
```swift
static let lastBandSleepSyncDateKey = "goose.swift.last_band_sleep_sync_date"
```
New file uses:
```swift
static let lastHistorySyncAtKey = "goose.swift.lastHistorySyncAt"
static let bandFirstSyncCooldown: TimeInterval = 30 * 60
```

**Cooldown guard pattern** (SleepSync.swift lines 44–52):
```swift
func maybeScheduleMorningSleepSync() {
  guard !overnightGuardActive else { return }
  guard Calendar.current.component(.hour, from: Date()) >= 4 else { return }
  if let lastSync = UserDefaults.standard.object(forKey: Self.lastBandSleepSyncDateKey) as? Date,
     Calendar.current.isDateInToday(lastSync) {
    return
  }
  Task { @MainActor in await self.syncBandSleepHistory() }
}
```
The `triggerForegroundBLESync()` follows this exact pattern but replaces the time-of-day gate with the 30-minute interval check, and removes the `overnightGuardActive` guard.

**Write-before-BLE pattern** (SleepSync.swift lines 57–58):
```swift
// Write UserDefaults BEFORE any await to prevent retry loops on drop+reconnect.
UserDefaults.standard.set(Date(), forKey: Self.lastBandSleepSyncDateKey)
```
BandFirstSync writes `UserDefaults.standard.set(Date(), forKey: Self.lastHistorySyncAtKey)` before calling `ble.syncHistoricalPackets(rangeFirst: true)`.

**BLE command** (SleepSync.swift line 105):
```swift
ble.syncHistoricalPackets(rangeFirst: true)
```
Same call used in both foreground trigger and BGTask handler.

**BLE logging pattern** (Lifecycle.swift line 8):
```swift
ble.record(source: "app.lifecycle", title: "scene_phase", body: "\(phase) | \(power.summary)")
```
BandFirstSync uses `ble.record(source: "band_first_sync", title: "foreground_sync.skipped", body: "foreground sync skipped — last sync within 30 min")` and `ble.record(source: "band_first_sync", title: "foreground_sync.start")`.

**BGTask expiration handler pattern** — no direct analog in codebase; follow Apple BackgroundTasks docs:
```swift
task.expirationHandler = { [weak self] in
  self?.ble.stopScan()
  task.setTaskCompleted(success: false)
}
```

**BGTask schedule next wakeup** — no codebase analog; standard pattern:
```swift
func scheduleNextBGAppRefresh() {
  let request = BGAppRefreshTaskRequest(identifier: "com.goose.swift.bg-sync")
  request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
  try? BGTaskScheduler.shared.submit(request)
}
```

**BLE scan method names** — VERIFIED in `GooseBLEClient+UserActions.swift`:
- `func startScan()` — line 13 (no-argument variant)
- `func stopScan()` — line 18 (no-argument variant)
- `func syncHistoricalPackets(rangeFirst: Bool = false)` — line 229

---

### `GooseSwiftApp.swift` (MODIFY — app-entry, event-driven)

**Analog:** `GooseSwift/GooseSwiftApp.swift` (current file)

**Current init pattern** (lines 9–11):
```swift
init() {
  GooseTheme.configureAppearance()
}
```

**New init with BGTask registration** — add after `GooseTheme.configureAppearance()`:
```swift
import BackgroundTasks

init() {
  GooseTheme.configureAppearance()
  BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.goose.swift.bg-sync",
    using: nil
  ) { task in
    Task { @MainActor in
      // GooseSwiftApp.sharedModel is set in WindowGroup .onAppear
      GooseSwiftApp.sharedModel?.handleBGAppRefresh(task: task as! BGAppRefreshTask)
    }
  }
}

nonisolated(unsafe) static weak var sharedModel: GooseAppModel?
```

**WindowGroup .onAppear** — add alongside existing `.onChange(of: scenePhase)`:
```swift
.onAppear {
  GooseSwiftApp.sharedModel = model
  model.scheduleNextBGAppRefresh()
}
```

**`nonisolated(unsafe)` pattern** for module-level weak reference — matches existing usage in codebase (e.g., `HeartRateSeriesStore.shared` pattern for module-level state).

---

### `GooseAppModel+Lifecycle.swift` (MODIFY — coordinator-extension, event-driven)

**Current `handleAppLifecycleChange`** (lines 6–38) — REWRITE from scratch:
```swift
// CURRENT (to be replaced entirely):
func handleAppLifecycleChange(_ phase: String) {
  let power = Self.currentOvernightPowerState()   // REMOVE — method deleted with OvernightRecovery.swift
  ble.record(source: "app.lifecycle", title: "scene_phase", body: "\(phase) | \(power.summary)")
  guard overnightGuardActive else { return }       // REMOVE — always false after removal
  // ... overnight-only body ...
}

// NEW minimal form:
func handleAppLifecycleChange(_ phase: String) {
  ble.record(source: "app.lifecycle", title: "scene_phase", body: phase)
  if phase == "active" || phase == "foreground" {
    triggerHealthCheckIfNeeded()       // keep
    triggerForegroundBLESync()         // NEW call from BandFirstSync
  }
}
```

**Current `handleBLEConnectionStateChange`** — remove the `overnightGuardActive` block (lines 138–152) and all `refreshOvernightReadiness` calls (lines 156, 159). Keep everything else. Result:
```swift
func handleBLEConnectionStateChange(_ state: String) {
  // ... device generation + captureFrameWriteQueue setup (lines 116–136) — KEEP ...

  guard state == "ready" else {
    passiveActivityCaptureWorkItem?.cancel()
    return                             // refreshOvernightReadiness calls REMOVED
  }
  schedulePassiveActivityCapture(reason: "ble_ready")
  scheduleAutoStartRespiratoryPacketWatchIfNeeded()
  if ble.canSyncClock {
    ble.writeClockCommand(.get, syncIfNeeded: true)
    ble.record(source: "ble.clock", title: "clock.auto_sync.triggered", body: "state=ready")
  }
  maybeScheduleMorningSleepSync()       // KEEP
}
```

**Methods to DELETE** from Lifecycle.swift (lines 232–279):
- `beginOvernightGuardCriticalBackgroundTask(reason:)`
- `expireOvernightGuardCriticalBackgroundTask()`
- `endOvernightGuardCriticalBackgroundTask(reason:)`

---

### `GooseAppModel.swift` (MODIFY — model)

**Properties to REMOVE** (lines 30–54, 120–140):
25 observable `var overnightGuard*` properties + `overnightRawSpool` (line 120) + 20 private `overnightGuard*` stored vars (lines 121–140).

**Static constants to REMOVE** — 10 `overnightGuard*` static let constants.

**init callbacks to REMOVE** (lines 349–402):
```swift
// REMOVE these three callback assignments:
ble.onRawNotificationWithContext = { ... persistOvernightRawNotificationBeforeInterpretation ... }
ble.onCommandWrite = { ... persistOvernightCommandWrite ... }
ble.onMessage = { ... persistOvernightEventLog ... }
```

**deinit cleanup to REMOVE** (lines 431–444):
```swift
// REMOVE:
overnightGuardHeartbeatWorkItem?.cancel()
overnightGuardRangePollWorkItem?.cancel()
overnightGuardFinalSyncDrainWorkItem?.cancel()
if overnightGuardCriticalBackgroundTaskID != .invalid { ... }
if overnightRawSpool.isActive { ... }
```

**init call to REMOVE** (line 412):
```swift
recoverUncleanOvernightGuardSessionIfNeeded()   // REMOVE
```

**Property to KEEP** (D-04):
```swift
let overnightSQLiteMirror = OvernightSQLiteMirrorQueue(databasePath: HealthDataStore.defaultDatabasePath())
```

---

### `GooseAppModel+NotificationPipeline.swift` (MODIFY — coordinator-extension, event-driven)

**Pattern for removing a parameter from a static method:**

Remove `overnightGuardActive: Bool` from `struct NotificationParseContext` and from both static methods:
- `requiresMainParsedFrameHandling(_:overnightGuardActive:)` → `requiresMainParsedFrameHandling(_:)`
- `canHandleDataSignalOffMain(_:overnightGuardActive:respiratoryPacketWatchActive:)` → `canHandleDataSignalOffMain(_:respiratoryPacketWatchActive:)`

Remove `overnightGuardActive: overnightGuardActive` from `notificationParseContext(for:)` factory (line 513).

Remove call sites at lines 408 and 420 of the `overnightGuardActive:` argument.

In `requiresMainParsedFrameHandling`, remove the branch:
```swift
// REMOVE this branch (lines 580–582):
if overnightGuardActive, let packetType { ... }
```

In `canHandleDataSignalOffMain`, remove from the guard:
```swift
// REMOVE: guard !overnightGuardActive else { ... }
// KEEP:   guard !respiratoryPacketWatchActive else { ... }
```

---

### `MoreCaptureViews.swift` (MODIFY — view)

**Section to DELETE** (lines 78–205):
```swift
Section("Overnight Guard") {
  // ... all MoreInfoRow displays, Start Guard / Final Sync / Stop Guard buttons, ShareLink exports
}
```

**Computed properties to DELETE** (lines 260–314):
```swift
private var overnightGuardStatus: MoreStatusKind { ... }
private var overnightGuardReadinessStatus: MoreStatusKind { ... }
private var overnightGuardSQLiteMirrorStatus: MoreStatusKind { ... }
private var overnightGuardExportStatus: MoreStatusKind { ... }
```

---

### `GooseAppModel+ActivityTimeline.swift` (MODIFY — coordinator-extension, CRUD)

**Static methods to DELETE** (lines 668–679):
```swift
static func overnightGuardDirectoryURL(sessionID: String) -> URL { ... }
nonisolated static func overnightGuardRootDirectoryURL() -> URL { ... }
```
These are only called from deleted OvernightRun.swift and OvernightRecovery.swift.

---

### `CoachLocalToolContext.swift` (MODIFY — utility)

**Dict keys to REMOVE** (lines 127–132):
```swift
"active": appModel.overnightGuardActive,
"status": appModel.overnightGuardStatus,
"readiness": appModel.overnightGuardReadinessSummary,
"targets": appModel.overnightGuardTargetSummary,
"last_packet": appModel.overnightGuardLastPacketSummary,
"spool": appModel.overnightGuardSpoolSizeSummary,
```
Remove the entire `overnight_guard` key and its value dict from the context snapshot.

---

### `CodexCoachSupport.swift` (MODIFY — utility)

**Dict keys to REMOVE** (lines 120–129):
```swift
"active": appModel.overnightGuardActive,
"status": appModel.overnightGuardStatus,
"readiness": appModel.overnightGuardReadinessSummary,
"raw_notifications": appModel.overnightGuardRawNotificationCount,
"target": appModel.overnightGuardTargetSummary,
"last_packet": appModel.overnightGuardLastPacketSummary,
"spool": appModel.overnightGuardSpoolSizeSummary,
"sqlite_mirror": appModel.overnightGuardSQLiteMirrorSummary,
"power": appModel.overnightGuardPowerSummary,
"watchdog": appModel.overnightGuardWatchdogSummary,
```
Remove the entire `overnight_guard` key and its value dict.

---

### `LocalizedStatusStrings.swift` (MODIFY — utility)

**Section to DELETE** (lines 185–198):
```swift
// MARK: - Overnight Guard Status
// computed property: localizedOvernightGuardStatus on String
// Only called by MoreCaptureViews.swift line 81 — which is also deleted.
```

---

### `HealthPacketCaptureTypes.swift` (MODIFY — model)

**Struct definitions to DELETE** (lines 99–294):
```swift
struct OvernightGuardSession { ... }
struct OvernightGuardRecoveredSession { ... }
struct OvernightGuardTargetCounts { ... }
struct OvernightGuardHistoricalOrderEvidence { ... }
struct OvernightGuardHistoricalPacketSample { ... }
```
Remove all five. `OvernightRawSpoolSnapshot` and `OvernightPowerState` are in `OvernightRawNotificationSpool.swift` — leave those (file kept per D-04).

---

### `Info.plist` (MODIFY — config)

**Add `BGTaskSchedulerPermittedIdentifiers`** (currently absent):
```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.goose.swift.bg-sync</string>
</array>
```

**Add `fetch` to `UIBackgroundModes`** (currently: bluetooth-central, location only):
```xml
<key>UIBackgroundModes</key>
<array>
  <string>bluetooth-central</string>
  <string>fetch</string>
  <string>location</string>
</array>
```

---

## Shared Patterns

### UserDefaults Key Naming
**Source:** `GooseSwift/RemoteServerPersistence.swift` (lines 6–7) and `GooseAppModel+SleepSync.swift` (line 8)
**Apply to:** `GooseAppModel+BandFirstSync.swift` static key declaration
```swift
// Pattern:
static let serverURL = "goose.remote.serverURL"
static let lastBandSleepSyncDateKey = "goose.swift.last_band_sleep_sync_date"
// New key follows same convention:
static let lastHistorySyncAtKey = "goose.swift.lastHistorySyncAt"
```

### BLE Connection State Gate Check
**Source:** `GooseAppModel+Lifecycle.swift` (lines 190–192) and `GooseAppModel+SleepSync.swift` (line 99)
**Apply to:** `triggerForegroundBLESync()` and `handleBGAppRefresh(task:)`
```swift
guard ble.connectionState == "ready" else { return }
```

### BLE Logging
**Source:** `GooseAppModel+Lifecycle.swift` (line 8)
**Apply to:** All new methods in `GooseAppModel+BandFirstSync.swift`
```swift
ble.record(source: "band_first_sync", title: "foreground_sync.start")
ble.record(source: "band_first_sync", title: "foreground_sync.skipped", body: "foreground sync skipped — last sync within 30 min")
```

### DispatchWorkItem with asyncAfter timeout
**Source:** `GooseAppModel+Lifecycle.swift` (lines 178–184, 215–221)
**Apply to:** BGTask 20-second timeout in `handleBGAppRefresh(task:)`
```swift
let workItem = DispatchWorkItem { [weak self] in
  Task { @MainActor in
    self?.someCleanup()
  }
}
DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: workItem)
```

### Extension File Structure
**Source:** Any `GooseAppModel+*.swift` file
**Apply to:** `GooseAppModel+BandFirstSync.swift`
```swift
import Foundation
import BackgroundTasks


extension GooseAppModel {
  static let lastHistorySyncAtKey = "goose.swift.lastHistorySyncAt"
  static let bandFirstSyncCooldown: TimeInterval = 30 * 60

  func triggerForegroundBLESync() { ... }
  func handleBGAppRefresh(task: BGAppRefreshTask) { ... }
  func scheduleNextBGAppRefresh() { ... }
}
```
Two blank lines between import block and extension body (per CLAUDE.md conventions).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| BGAppRefreshTask handler | background-task | event-driven | No existing BGTask usage in codebase — first BGAppRefreshTask. Use Apple docs pattern + RESEARCH.md §Pattern 2. |

---

## Deletion Checklist (for planner reference)

Files to delete entirely — no replacement:
- `GooseSwift/GooseAppModel+OvernightRun.swift` (815 lines)
- `GooseSwift/GooseAppModel+OvernightState.swift` (404 lines)
- `GooseSwift/GooseAppModel+OvernightRecovery.swift` (685 lines)

Secondary cleanup — search terms for missed references after deletion:
- `overnightGuardActive` — must be zero occurrences after cleanup
- `refreshOvernightReadiness` — must be zero occurrences
- `currentOvernightPowerState` — must be zero occurrences
- `persistOvernightRawNotificationBeforeInterpretation` — must be zero occurrences
- `persistOvernightCommandWrite` — must be zero occurrences
- `persistOvernightEventLog` — must be zero occurrences
- `recoverUncleanOvernightGuardSessionIfNeeded` — must be zero occurrences
- `OvernightGuardSession` — must be zero occurrences (after types removed)
- `OvernightGuardTargetCounts` — must be zero occurrences

## Metadata

**Analog search scope:** `GooseSwift/`, `GooseWorkoutLiveActivityExtension/`
**Key files read:** GooseAppModel+SleepSync.swift, GooseSwiftApp.swift, GooseAppModel+Lifecycle.swift, GooseAppModel.swift (lines 1–160), RemoteServerPersistence.swift, GooseBLEClient+UserActions.swift (grep)
**Pattern extraction date:** 2026-06-11
