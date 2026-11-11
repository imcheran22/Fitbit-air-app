# Phase 60: Band-First Sync - Research

**Researched:** 2026-06-11
**Domain:** iOS Swift — BGAppRefreshTask, CoreBluetooth historical sync, overnight guard removal
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Overnight Guard Removal**
- D-01: Remove GooseAppModel+OvernightRun.swift completely — the overnight guard feature is deleted, not deprecated or hidden behind a flag.
- D-02: Remove overnight guard card/section from More tab entirely. No replacement UI in this phase.
- D-03: Remove overnightRawSpool from GooseAppModel and the overnight session directory from ApplicationSupport.
- D-04: Keep OvernightSQLiteMirrorQueue (no active use after removal, kept for potential future background insert utility).
- D-05: GooseAppModel+Lifecycle.swift handleBLEConnectionStateChange has overnightGuardActive dependencies — must be cleaned up as part of the overnight guard removal plan.

**Foreground Sync Trigger**
- D-06: New dedicated method `triggerForegroundBLESync()` in a new file `GooseAppModel+BandFirstSync.swift`. Do NOT generalize `maybeScheduleMorningSleepSync()` — that method has a time-of-day gate and is sleep-import specific.
- D-07: Trigger condition: only fire if `ble.connectionState == "ready"` (already connected). No reconnect attempt from this path.
- D-08: Called from `handleAppLifecycleChange` when `phase == "active"` (the branch already exists in GooseAppModel+Lifecycle.swift).
- D-09: Cooldown: 30 minutes between foreground syncs.
- D-10: Last sync timestamp stored in UserDefaults with key `"goose.swift.lastHistorySyncAt"`. Persists across app launches.

**BGAppRefreshTask**
- D-11: Register identifier `"com.goose.swift.bg-sync"` in Info.plist under `BGTaskSchedulerPermittedIdentifiers`.
- D-12: BGAppRefreshTask handler: schedule next wakeup + attempt BLE scan+connect (device may not be connected in background).
- D-13: 20-second timeout for BLE scan+connect attempt in background. On timeout: cancel scan, call `completionHandler(false)`, schedule next refresh.
- D-14: Register `BGTask.expirationHandler` to handle OS revocation gracefully (cancel scan, call completionHandler).
- D-15: Same scan+connect+timeout behavior applies whether triggered by BGAppRefreshTask or (future) silent push.

**Server Role**
- D-16: Server has no changes in this phase.
- D-17: `goose-daily-ready` and `start-sync-data` push types are out of scope for this phase.

### Claude's Discretion

- BGAppRefreshTask scheduling interval: planner to choose a reasonable interval (e.g., 15 minutes minimum as enforced by iOS, practical value ~30 min). iOS may not honor the exact interval.
- Whether `triggerForegroundBLESync()` logs via `ble.record(...)` or OSLog: follow existing patterns in the file.

### Deferred Ideas (OUT OF SCOPE)

- Server-side APNs integration — `goose-daily-ready` and `start-sync-data` push types from server.
- Watermark-based upload optimization — ROADMAP mentions this as a stretch goal.
- BTHR (Background Tracked Heart Rate).
</user_constraints>

---

## Summary

Phase 60 is a deletion-heavy refactoring phase. The overnight guard subsystem is approximately 1,900 lines across three extension files (OvernightRun.swift 815 lines, OvernightRecovery.swift 685 lines, OvernightState.swift 404 lines) plus 64 references in GooseAppModel.swift (25 observable `var` properties, 10 static constants, and 9 private state vars). A further 14 computed status properties in GooseAppModel+Lifecycle.swift reference `overnightGuardActive`.

The replacement is small: one new file `GooseAppModel+BandFirstSync.swift` containing `triggerForegroundBLESync()` (a cooldown-guarded call to `ble.syncHistoricalPackets(rangeFirst: true)`) plus BGAppRefreshTask wiring in `GooseSwiftApp.swift`. The pattern to replicate is `maybeScheduleMorningSleepSync()` in GooseAppModel+SleepSync.swift, which already demonstrates the UserDefaults cooldown guard idiom.

The complexity is in tracking every overnight reference to ensure no dangling symbol remains after the three overnight extension files and the GooseAppModel properties are removed. The notification pipeline (`GooseAppModel+NotificationPipeline.swift`) uses `overnightGuardActive` as a routing flag — after removal, that flag always reads `false`, changing two static methods' behavior (`requiresMainParsedFrameHandling` and `canHandleDataSignalOffMain`). The simplest cleanup is to remove the `overnightGuardActive` parameter from both methods and inline the `false` case.

**Primary recommendation:** Remove all four overnight files and all overnight properties as a single atomic wave. Add `GooseAppModel+BandFirstSync.swift` + BGTask wiring. Then clean secondary references (NotificationPipeline, CoachLocalToolContext, CodexCoachSupport, LocalizedStatusStrings, MoreCaptureViews, GooseBLEClient side-channel log wiring, GooseAppModel.swift init callbacks, deinit).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Foreground sync trigger | iOS App (GooseAppModel) | GooseBLEClient | GooseAppModel is the single coordinator; BLE client owns the GATT command |
| Cooldown guard | iOS App (UserDefaults) | — | Must persist across kills; UserDefaults is the established pattern |
| BGAppRefreshTask registration | iOS App entry point (GooseSwiftApp.swift init) | — | BGTaskScheduler.shared.register must be called before app finishes launching |
| BGAppRefreshTask handler | iOS App (GooseAppModel or inline in App struct) | GooseBLEClient | BLE scan+connect on background wakeup |
| Info.plist keys | iOS build config | — | BGTaskSchedulerPermittedIdentifiers and UIBackgroundModes["fetch"] |
| Overnight guard UI removal | MoreCaptureViews.swift (Section "Overnight Guard") | — | Self-contained list section; full removal |
| Notification pipeline cleanup | GooseAppModel+NotificationPipeline.swift | — | overnightGuardActive routing flag becomes dead code |
| Coach context cleanup | CoachLocalToolContext.swift, CodexCoachSupport.swift | — | overnight* dict keys in context snapshot |

---

## File-by-File Removal Scope

### Files to DELETE entirely

| File | Lines | Why |
|------|-------|-----|
| `GooseSwift/GooseAppModel+OvernightRun.swift` | 815 | All overnight guard methods: `startOvernightGuard`, `requestOvernightGuardFinalSync`, `stopOvernightGuard`, `exportLastOvernightGuardBundle`, `persistOvernightRawNotificationBeforeInterpretation`, `persistOvernightCommandWrite`, `persistOvernightEventLog`, `scheduleOvernightGuardHeartbeat`, `scheduleOvernightGuardRangePoll`, `completeOvernightGuard`, `exportOvernightGuardBundle`, `writeOvernightGuardStatus` + inner helpers |
| `GooseSwift/GooseAppModel+OvernightState.swift` | 404 | All overnight state helpers: `refreshOvernightPowerState`, `applyOvernightPowerState`, `updateOvernightGuardWarning`, `refreshOvernightReadiness`, `applyOvernightSQLiteMirrorSnapshot`, `enqueueOvernightSQLiteSession`, `overnightGuardReadinessEvaluation`, `refreshOvernightWatchdogState`, static format helpers |
| `GooseSwift/GooseAppModel+OvernightRecovery.swift` | 685 | Recovery, export, and static utility methods: `recoverUncleanOvernightGuardSessionIfNeeded`, `resumeOvernightGuardStreamsIfReady`, `latestRecoverableOvernightGuardSession`, `finalizeRecoveredOvernightGuardSessionForExport`, `overnightGuardDirectoryURL`, `overnightGuardRootDirectoryURL` + 10+ static helpers |

**Note:** `overnightGuardDirectoryURL` and `overnightGuardRootDirectoryURL` are defined in `GooseAppModel+OvernightRecovery.swift` (despite being called by `GooseAppModel+ActivityTimeline.swift` lines 668–679). Those two static methods in ActivityTimeline.swift are ALSO `overnightGuardDirectoryURL` and `overnightGuardRootDirectoryURL` — they are the same declarations, in the same extension, just located in ActivityTimeline.swift. [VERIFIED: code read] Wait — on re-read, ActivityTimeline.swift line 668 is `static func overnightGuardDirectoryURL` and OvernightRecovery.swift line 338 contains `finalizeRecoveredOvernightGuardSessionForExport`. These are distinct. The `overnightGuardDirectoryURL` in ActivityTimeline.swift (lines 668–679) MUST also be removed as it references `overnightGuardRootDirectoryURL()` — a method that lives in OvernightRecovery.swift.

### Properties to REMOVE from GooseAppModel.swift

**Observable stored properties (lines 30–54, 120–140):**
```
overnightGuardActive, overnightGuardStatus, overnightGuardReadinessStatus,
overnightGuardReadinessSummary, overnightGuardRawNotificationCount,
overnightGuardRangePollCount, overnightGuardRangeTelemetryCount,
overnightGuardSuccessfulRangePollCount, overnightGuardCommandWriteCount,
overnightGuardEventLogCount, overnightGuardTargetSummary,
overnightGuardHistoricalOrderSummary, overnightGuardLastPacketSummary,
overnightGuardSpoolPath, overnightGuardSpoolSizeSummary,
overnightGuardSQLiteMirrorSummary, overnightGuardPowerSummary,
overnightGuardWatchdogSummary, overnightGuardWarning, overnightGuardExportStatus,
overnightGuardExportInProgress, overnightGuardExportURL,
overnightGuardExportManifestURL, overnightGuardExportManifestError,
overnightGuardCanExportLastSession
```
(25 observable `var` properties)

**Let/var stored on the class (lines 120–140):**
```
overnightRawSpool (OvernightRawNotificationSpool),
overnightGuardSession (OvernightGuardSession?),
overnightGuardHeartbeatWorkItem, overnightGuardRangePollWorkItem,
overnightGuardFinalSyncDrainWorkItem, overnightGuardFinalSyncPending,
overnightGuardCriticalBackgroundTaskID, overnightGuardCriticalBackgroundTaskReason,
overnightGuardStartedHealthCapture, overnightGuardTargetCounts,
overnightGuardHistoricalOrder, overnightGuardPowerWarning,
overnightGuardWatchdogWarning, overnightGuardRawSpoolWarning,
overnightGuardBLELogWarning, overnightGuardSQLiteMirrorWarning,
overnightGuardWroteInitialRawNotificationStatus,
overnightGuardWroteInitialSQLiteMirrorStatus,
overnightGuardLastRawStaleWarningAt, overnightGuardLastRangeSuccessWarningAt,
overnightGuardLastTargetMissingWarningAt
```
(21 private stored properties)

**Static constants (lines 287–296):**
```
overnightGuardDuration, overnightGuardHeartbeatInterval,
overnightGuardRangePollInterval, overnightGuardRangeBlockedRetryInterval,
overnightGuardRangeFailureRetryInterval, overnightGuardFinalSyncDrainInterval,
overnightGuardRawStaleWarningInterval, overnightGuardRangeSuccessWarningDelay,
overnightGuardTargetMissingWarningDelay, overnightGuardWarningRepeatInterval
```
(10 static let constants)

**init callbacks to REMOVE (GooseAppModel.swift lines 349–402):**
- `ble.onRawNotificationWithContext` closure (calls `persistOvernightRawNotificationBeforeInterpretation`)
- `ble.onCommandWrite` closure (calls `persistOvernightCommandWrite`)
- `ble.onMessage` closure (calls `persistOvernightEventLog`)

**deinit cleanup to REMOVE (GooseAppModel.swift lines 431–444):**
- `overnightGuardHeartbeatWorkItem?.cancel()`
- `overnightGuardRangePollWorkItem?.cancel()`
- `overnightGuardFinalSyncDrainWorkItem?.cancel()`
- `if overnightGuardCriticalBackgroundTaskID != .invalid { ... }` block
- `if overnightRawSpool.isActive { ... }` block

**init call to REMOVE (line 412):**
- `recoverUncleanOvernightGuardSessionIfNeeded()`

### Files to MODIFY

#### `GooseSwift/GooseAppModel+Lifecycle.swift`

**Current `handleAppLifecycleChange`:** The entire method body is guarded by `guard overnightGuardActive else { return }`. After removal, the method needs to be rewritten to always handle lifecycle changes and call `triggerForegroundBLESync()` on `.active`. [VERIFIED: code read]

**Current structure (entire method):**
```swift
func handleAppLifecycleChange(_ phase: String) {
  let power = Self.currentOvernightPowerState()  // REMOVE (currentOvernightPowerState is in OvernightState.swift)
  ble.record(source: "app.lifecycle", title: "scene_phase", body: "\(phase) | \(power.summary)")  // simplify
  guard overnightGuardActive else { return }  // REMOVE — this guard is the entire function body

  applyOvernightPowerState(power)
  if phase == "background" || phase == "inactive" { ... }
  else if phase == "active" || phase == "foreground" {
    resumeOvernightGuardStreamsIfReady(reason: "scene_phase_\(phase)")  // REMOVE
    triggerHealthCheckIfNeeded()  // KEEP
  }
  writeOvernightGuardStatus(reason: "scene_phase_\(phase)")  // REMOVE
}
```

**After removal, new minimal form:**
```swift
func handleAppLifecycleChange(_ phase: String) {
  ble.record(source: "app.lifecycle", title: "scene_phase", body: phase)
  if phase == "active" || phase == "foreground" {
    triggerHealthCheckIfNeeded()
    triggerForegroundBLESync()  // NEW — from GooseAppModel+BandFirstSync.swift
  }
}
```

**`handleBLEConnectionStateChange`:** The `if overnightGuardActive { ... return }` block (lines 138–152) is removed. The `refreshOvernightReadiness(reason:)` calls (lines 148, 156, 159) are removed. `maybeScheduleMorningSleepSync()` (line 166) is kept. `schedulePassiveActivityCapture` and `scheduleAutoStartRespiratoryPacketWatchIfNeeded` and `ble.writeClockCommand` are kept. [VERIFIED: code read]

**Methods to REMOVE from GooseAppModel+Lifecycle.swift:**
- `beginOvernightGuardCriticalBackgroundTask(reason:)`
- `expireOvernightGuardCriticalBackgroundTask()`
- `endOvernightGuardCriticalBackgroundTask(reason:)`

#### `GooseSwift/MoreCaptureViews.swift`

Remove the entire `Section("Overnight Guard") { ... }` block (lines 78–205 of MoreCaptureViews.swift). This includes all MoreInfoRow displays, the Start Guard / Final Sync / Stop Guard buttons, and the ShareLink exports. [VERIFIED: code read]

Remove the four private computed properties at lines 260–314:
- `overnightGuardStatus: MoreStatusKind`
- `overnightGuardReadinessStatus: MoreStatusKind`
- `overnightGuardSQLiteMirrorStatus: MoreStatusKind`
- `overnightGuardExportStatus: MoreStatusKind`

#### `GooseSwift/GooseAppModel+NotificationPipeline.swift`

The `overnightGuardActive` flag is captured in `NotificationParseContext` and passed to two static methods. After removal, this flag is always `false`.

- `notificationParseContext(for:)` (line 513): remove `overnightGuardActive: overnightGuardActive` from the context init.
- `struct NotificationParseContext` (line 571): remove `overnightGuardActive: Bool` field.
- `requiresMainParsedFrameHandling(_:overnightGuardActive:)` (line 569): remove `overnightGuardActive` parameter; remove the `if overnightGuardActive, let packetType` branch (lines 580–582) — this branch only matters during overnight capture, and `packetType == 47/49/56` packets will still be handled by the other conditions above.
- `canHandleDataSignalOffMain(_:overnightGuardActive:respiratoryPacketWatchActive:)` (line 586): remove `overnightGuardActive` parameter; remove `guard !overnightGuardActive` from the guard (line 594) — keep `!respiratoryPacketWatchActive`.
- Fix callers of both static methods: remove `overnightGuardActive:` argument (lines 408, 420).

#### `GooseSwift/GooseAppModel+ActivityTimeline.swift`

Remove the two static methods (lines 668–679):
- `static func overnightGuardDirectoryURL(sessionID: String) -> URL`
- `nonisolated static func overnightGuardRootDirectoryURL() -> URL`

These are only called from OvernightRun.swift and OvernightRecovery.swift — which are deleted. [VERIFIED: code read]

#### `GooseSwift/CoachLocalToolContext.swift`

Remove overnight lines from the context snapshot dict (lines 127–132):
```swift
"active": appModel.overnightGuardActive,
"status": appModel.overnightGuardStatus,
"readiness": appModel.overnightGuardReadinessSummary,
"targets": appModel.overnightGuardTargetSummary,
"last_packet": appModel.overnightGuardLastPacketSummary,
"spool": appModel.overnightGuardSpoolSizeSummary,
```

#### `GooseSwift/CodexCoachSupport.swift`

Remove overnight lines from the context snapshot dict (lines 120–129):
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

#### `GooseSwift/LocalizedStatusStrings.swift`

Remove the `MARK: - Overnight Guard Status` section (lines 185–198):
- The `localizedOvernightGuardStatus` computed property on String.
- Only called by MoreCaptureViews.swift line 81 (which is also being removed).

#### `GooseSwift/HealthPacketCaptureTypes.swift`

The overnight type definitions (lines 99–294) are used by deleted files. After deletion:
- `struct OvernightGuardSession` — remove
- `struct OvernightGuardRecoveredSession` — remove
- `struct OvernightGuardTargetCounts` — remove
- `struct OvernightGuardHistoricalOrderEvidence` — remove
- `struct OvernightGuardHistoricalPacketSample` — remove (line 294)

Note: `OvernightRawSpoolSnapshot` and `OvernightPowerState` are defined in `OvernightRawNotificationSpool.swift`, NOT in HealthPacketCaptureTypes.swift. These remain since `OvernightRawNotificationSpool.swift` is kept per D-04 (but `OvernightPowerState` is only used by the deleted OvernightState.swift — check if it leaks into Lifecycle.swift). [VERIFIED: code read — `currentOvernightPowerState()` is in OvernightRecovery.swift line 643; Lifecycle.swift line 7 calls it, so after removal Lifecycle.swift no longer needs it]

#### `GooseSwift/GooseBLEClient.swift`

`overnightSideChannelLogURL` (lines 218–230) is a stored property on GooseBLEClient used in `GooseBLEClient+VitalsAndLogging.swift` lines 250 and 269. This property writes to `Documents/GooseSwift/goose-ble-live.log` as a side-channel log file. It is NOT exclusively used by the overnight guard — it is part of the general BLE log export. **Keep it.** [VERIFIED: code read — VitalsAndLogging uses it alongside diagnosticLogURL for the general log share sheet]

### Files to CREATE

#### `GooseSwift/GooseAppModel+BandFirstSync.swift`

New file following the established `GooseAppModel+SleepSync.swift` pattern:

```swift
import Foundation
import BackgroundTasks
import OSLog


extension GooseAppModel {
  static let lastHistorySyncAtKey = "goose.swift.lastHistorySyncAt"
  static let bandFirstSyncCooldown: TimeInterval = 30 * 60  // 30 minutes

  // Called from handleAppLifecycleChange when phase == "active".
  // Skips if already connected and a sync completed within the cooldown window.
  func triggerForegroundBLESync() {
    guard ble.connectionState == "ready" else { return }
    if let lastSync = UserDefaults.standard.object(forKey: Self.lastHistorySyncAtKey) as? Date,
       Date().timeIntervalSince(lastSync) < Self.bandFirstSyncCooldown {
      ble.record(source: "band_first_sync", title: "foreground_sync.skipped",
                 body: "foreground sync skipped — last sync within 30 min")
      return
    }
    ble.record(source: "band_first_sync", title: "foreground_sync.start")
    UserDefaults.standard.set(Date(), forKey: Self.lastHistorySyncAtKey)
    ble.syncHistoricalPackets(rangeFirst: true)
  }
}
```

**Note on `import BackgroundTasks`:** The BGAppRefreshTask handler should go in `GooseSwiftApp.swift`, not this file, to keep registration at app launch. This file only needs `Foundation`.

### Info.plist Changes

Two additions required:

1. `BGTaskSchedulerPermittedIdentifiers` array with `"com.goose.swift.bg-sync"`:
```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.goose.swift.bg-sync</string>
</array>
```

2. Add `"fetch"` to `UIBackgroundModes`:
```xml
<key>UIBackgroundModes</key>
<array>
  <string>bluetooth-central</string>
  <string>fetch</string>
  <string>location</string>
</array>
```

Current UIBackgroundModes only has `bluetooth-central` and `location`. BGAppRefreshTask requires `"fetch"` in UIBackgroundModes. [VERIFIED: code read — current Info.plist confirmed at lines 76–81]

BGTaskSchedulerPermittedIdentifiers is currently absent from Info.plist. [VERIFIED: code read]

No changes needed to GooseSwift.entitlements — BGAppRefreshTask does not require a specific entitlement key (unlike push notifications). [VERIFIED: code read — entitlements only contains healthkit]

### GooseSwiftApp.swift Changes

BGTaskScheduler registration must happen in the app entry point before the app finishes launching. The current `init()` only calls `GooseTheme.configureAppearance()`. BGTask registration goes here:

```swift
import SwiftUI
import BackgroundTasks

@main
struct GooseSwiftApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @State private var model = GooseAppModel()
  @StateObject private var router = AppRouter()

  init() {
    GooseTheme.configureAppearance()
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: "com.goose.swift.bg-sync",
      using: nil
    ) { task in
      GooseSwiftApp.handleBGAppRefresh(task: task as! BGAppRefreshTask, model: ???)
    }
  }
  ...
}
```

**Problem:** The `init()` runs before `@State private var model` is available. The handler closure must capture the model. Two patterns exist:

**Pattern A — Module-level handler that receives model via Task:**
Register with a closure that dispatches to the `@MainActor` model via `Task { @MainActor in ... }`. The model is `@State` so it's available on the main actor from the WindowGroup body, but not in `init()`.

**Pattern B — Store a shared reference:** Keep a module-level `var appModel: GooseAppModel?` set in `.onAppear` or the WindowGroup body, referenced by the BGTask handler closure via a weak capture.

**Pattern C — Inline the BLE logic in the handler:** The BGAppRefreshTask handler does not need to reach into GooseAppModel — it can call `GooseBLEClient` methods directly from a background context if BLE client were shared. But BLE client is owned by GooseAppModel.

**Recommended approach (Pattern B, consistent with iOS standard):**

```swift
@main
struct GooseSwiftApp: App {
  @Environment(\.scenePhase) private var scenePhase
  @State private var model = GooseAppModel()
  @StateObject private var router = AppRouter()

  init() {
    GooseTheme.configureAppearance()
    registerBGTasks()
  }

  private func registerBGTasks() {
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: "com.goose.swift.bg-sync",
      using: nil
    ) { task in
      // Dispatch to main actor to reach GooseAppModel
      Task { @MainActor in
        // model is captured via a nonisolated accessor or a weak ref set at scene launch
        // See BGTask handler implementation note below
      }
    }
  }
}
```

**BGTask handler implementation:** The handler closure passed to `BGTaskScheduler.shared.register` is called on an arbitrary queue. It cannot directly access `@State var model` (which is `@MainActor` isolated). The handler must:

1. Schedule the next BGAppRefreshTask wakeup immediately (iOS requires this).
2. Dispatch a BLE scan+connect attempt to the main actor.
3. Register a 20-second timeout via `DispatchQueue.main.asyncAfter`.
4. Set `task.expirationHandler` before starting any work.
5. Call `task.setTaskCompleted(success:)` either on timeout or on sync completion.

A clean implementation puts the handler on GooseAppModel itself:

```swift
// In GooseAppModel+BandFirstSync.swift
func handleBGAppRefresh(task: BGAppRefreshTask) {
  scheduleNextBGAppRefresh()
  task.expirationHandler = { [weak self] in
    self?.ble.stopScan()
    task.setTaskCompleted(success: false)
  }
  // If already connected, sync immediately
  if ble.connectionState == "ready" {
    ble.syncHistoricalPackets(rangeFirst: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
      task.setTaskCompleted(success: true)
    }
    return
  }
  // Otherwise attempt scan+connect with 20s timeout
  ble.startScan()
  DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
    self?.ble.stopScan()
    task.setTaskCompleted(success: false)
  }
}

func scheduleNextBGAppRefresh() {
  let request = BGAppRefreshTaskRequest(identifier: "com.goose.swift.bg-sync")
  request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
  try? BGTaskScheduler.shared.submit(request)
}
```

The `GooseSwiftApp` BGTask registration closure then calls `Task { @MainActor in model.handleBGAppRefresh(task: task as! BGAppRefreshTask) }`. Since `model` is a `@State` property on the `App` struct (which is `@MainActor`), this works if the task registration is on the same actor. However, `BGTaskScheduler.shared.register` callbacks run on an arbitrary thread, so `Task { @MainActor in ... }` is the correct bridge. [ASSUMED — based on iOS BackgroundTasks API knowledge]

**Alternative wiring (simpler, used by many production apps):**

```swift
// In GooseSwiftApp
nonisolated(unsafe) static weak var sharedModel: GooseAppModel?

var body: some Scene {
  WindowGroup {
    RootView()
      .onAppear {
        GooseSwiftApp.sharedModel = model
        model.scheduleNextBGAppRefresh()
      }
  }
}
```

Then the registered handler references `GooseSwiftApp.sharedModel`. This is safe because the handler is only called when the app is running (iOS lifecycle guarantee).

**Planner decision point:** Whether to put `handleBGAppRefresh` on GooseAppModel or inline it in GooseSwiftApp. Either is valid. The GooseAppModel approach is more testable and follows the existing pattern of business logic living in GooseAppModel extensions.

---

## Standard Stack

### Core (no new packages — iOS stdlib only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| BackgroundTasks | iOS 13+ / SDK 26 | BGAppRefreshTask registration and scheduling | Apple-native, no alternative for periodic background wakeup |
| UserDefaults | iOS stdlib | Cooldown timestamp persistence | Established pattern in codebase (`lastBandSleepSyncDateKey`, `serverURL`, etc.) |
| Foundation | iOS stdlib | DispatchQueue, Date, TimeInterval | Universal; already imported everywhere |

No external packages required. The constraint "no external iOS dependencies" is fully satisfied. [VERIFIED: code read — CLAUDE.md confirms URLSession only]

**Installation:** None required. BackgroundTasks is a system framework imported via `import BackgroundTasks`.

---

## Package Legitimacy Audit

No external packages are introduced in this phase. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
scenePhase == .active
        |
        v
handleAppLifecycleChange("active")  [GooseAppModel+Lifecycle.swift]
        |
        +-- triggerHealthCheckIfNeeded()  [existing — keep]
        |
        +-- triggerForegroundBLESync()  [NEW — GooseAppModel+BandFirstSync.swift]
                |
                +-- guard ble.connectionState == "ready"
                |         (skip if not connected — D-07)
                |
                +-- cooldown check: UserDefaults "goose.swift.lastHistorySyncAt"
                |         (skip if < 30 min — D-09/D-10)
                |
                +-- ble.record("band_first_sync", "foreground_sync.start")
                |
                +-- UserDefaults.set(Date(), ...) [write BEFORE BLE call]
                |
                +-- ble.syncHistoricalPackets(rangeFirst: true)
                        |
                        v
                  GooseBLEClient begins historical GATT sync


BGAppRefreshTask wakeup  [registered in GooseSwiftApp.init()]
        |
        v
handleBGAppRefresh(task:)  [GooseAppModel+BandFirstSync.swift]
        |
        +-- scheduleNextBGAppRefresh()  [submit next BGAppRefreshTaskRequest]
        |
        +-- task.expirationHandler = { stopScan; task.setTaskCompleted(false) }
        |
        +-- if ble.connectionState == "ready":
        |       ble.syncHistoricalPackets(rangeFirst: true)
        |       asyncAfter(20s): task.setTaskCompleted(success: true)
        |
        +-- else:
                ble.startScan()
                asyncAfter(20s): stopScan; task.setTaskCompleted(success: false)
```

### Recommended Project Structure (new file only)

```
GooseSwift/
├── GooseAppModel+BandFirstSync.swift    # NEW: triggerForegroundBLESync + BGTask handler
├── GooseAppModel.swift                  # MODIFY: remove ~64 overnight references
├── GooseAppModel+Lifecycle.swift        # MODIFY: rewrite handleAppLifecycleChange, clean handleBLEConnectionStateChange
├── GooseAppModel+NotificationPipeline.swift  # MODIFY: remove overnightGuardActive param
├── GooseSwiftApp.swift                  # MODIFY: BGTaskScheduler.shared.register in init()
├── MoreCaptureViews.swift               # MODIFY: remove Section("Overnight Guard")
├── GooseAppModel+ActivityTimeline.swift # MODIFY: remove 2 static methods
├── CoachLocalToolContext.swift          # MODIFY: remove overnight dict keys
├── CodexCoachSupport.swift              # MODIFY: remove overnight dict keys
├── LocalizedStatusStrings.swift         # MODIFY: remove localizedOvernightGuardStatus
├── HealthPacketCaptureTypes.swift       # MODIFY: remove 5 overnight struct definitions
```

Files to DELETE: `GooseAppModel+OvernightRun.swift`, `GooseAppModel+OvernightState.swift`, `GooseAppModel+OvernightRecovery.swift`

### Pattern 1: Cooldown Guard (replicate from SleepSync)

**What:** Write the UserDefaults timestamp BEFORE the async BLE operation to prevent retry loops on reconnect.
**When to use:** All time-gated automatic BLE sync triggers.

```swift
// Source: GooseAppModel+SleepSync.swift (Phase 50)
func triggerForegroundBLESync() {
  guard ble.connectionState == "ready" else { return }
  if let lastSync = UserDefaults.standard.object(forKey: Self.lastHistorySyncAtKey) as? Date,
     Date().timeIntervalSince(lastSync) < Self.bandFirstSyncCooldown {
    ble.record(source: "band_first_sync", title: "foreground_sync.skipped",
               body: "foreground sync skipped — last sync within 30 min")
    return
  }
  // Write BEFORE the BLE call (per SleepSync pattern)
  UserDefaults.standard.set(Date(), forKey: Self.lastHistorySyncAtKey)
  ble.record(source: "band_first_sync", title: "foreground_sync.start")
  ble.syncHistoricalPackets(rangeFirst: true)
}
```

### Pattern 2: BGAppRefreshTask Handler with Timeout

**What:** Schedule next wakeup first, set expiration handler, attempt work with explicit timeout.
**When to use:** Any BGAppRefreshTask implementation.

```swift
// Source: Apple BackgroundTasks framework documentation [ASSUMED]
func handleBGAppRefresh(task: BGAppRefreshTask) {
  scheduleNextBGAppRefresh()  // Always reschedule immediately

  task.expirationHandler = { [weak self] in
    self?.ble.stopScan()
    task.setTaskCompleted(success: false)
  }

  // ... do work ...

  DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
    task.setTaskCompleted(success: false)
  }
}
```

### Anti-Patterns to Avoid

- **Calling `refreshOvernightReadiness` after removing overnight guard:** This function is defined in OvernightState.swift (deleted). Any remaining call site will fail to compile. Verify all callers are removed.
- **Not scheduling next BGAppRefreshTask inside the handler:** iOS requires the next request to be submitted from within the handler, before `setTaskCompleted`. Submitting after completion or not submitting at all means the app never wakes again.
- **Writing UserDefaults AFTER the BLE call:** On drop+reconnect, the BLE state change fires `handleBLEConnectionStateChange` which calls `triggerForegroundBLESync` again. Writing the timestamp BEFORE prevents a double-sync loop (established in SleepSync Phase 50).
- **Referencing OvernightPowerState in Lifecycle.swift after deletion:** `currentOvernightPowerState()` is defined in OvernightRecovery.swift (deleted). Lifecycle.swift line 7 calls it — must be removed from `handleAppLifecycleChange`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Periodic background wakeup | Custom keepalive timer or `beginBackgroundTask` loop | BGAppRefreshTask | OS-managed, battery-aware, Apple-approved for this use case |
| Cooldown persistence | In-memory Date variable | UserDefaults | Must survive app kills (D-10: kill+restart within 30 min should not re-sync) |
| BLE historical sync | Custom GATT command sequence | `ble.syncHistoricalPackets(rangeFirst: true)` | Established command; handles command sequencing, ACK, completion callbacks |

---

## Common Pitfalls

### Pitfall 1: `overnightGuardActive` Guard in `handleAppLifecycleChange`

**What goes wrong:** The entire `handleAppLifecycleChange` function body is currently wrapped in `guard overnightGuardActive else { return }`. If the developer only removes the overnight-specific branches but leaves the guard, the method becomes a no-op (always returns early since `overnightGuardActive` will be `false`).

**Why it happens:** The guard was added to short-circuit when the guard is not active. After removal, the function needs a completely new implementation.

**How to avoid:** Rewrite `handleAppLifecycleChange` from scratch — do not try to surgically remove branches from the existing implementation.

**Warning signs:** `triggerHealthCheckIfNeeded()` stops being called; server upload heartbeat stops working.

### Pitfall 2: `refreshOvernightReadiness` Left in `handleBLEConnectionStateChange`

**What goes wrong:** `refreshOvernightReadiness(reason:)` is called at lines 148, 156, and 159 of Lifecycle.swift. These are inside and outside the `overnightGuardActive` block. The function is defined in OvernightState.swift (deleted). A missed call site causes a compile error.

**Why it happens:** The function appears in both the `if overnightGuardActive` block and the `guard state == "ready" else` block below.

**How to avoid:** Search for all `refreshOvernightReadiness` occurrences after deletion. The function is not needed after overnight guard removal.

### Pitfall 3: `onRawNotificationWithContext` and `onCommandWrite` Callbacks Left in GooseAppModel init

**What goes wrong:** `ble.onRawNotificationWithContext` (line 349) calls `persistOvernightRawNotificationBeforeInterpretation`. `ble.onCommandWrite` (line 356) calls `persistOvernightCommandWrite`. Both are defined in OvernightRun.swift (deleted). If the callback assignments remain but the methods are gone, the app fails to compile.

**Why it happens:** GooseAppModel.init() configures these callbacks for overnight spool persistence. They have no function post-removal.

**How to avoid:** Remove both callback assignments from init() entirely. Check if `ble.onRawNotificationWithContext` and `ble.onCommandWrite` have any other consumers — they do not; they were added exclusively for the overnight spool. After removal, `ble.onMessage` (line 401–402) also calls `persistOvernightEventLog` (deleted) — remove it too.

### Pitfall 4: `OvernightGuardSession`, `OvernightGuardTargetCounts`, etc. Left in HealthPacketCaptureTypes.swift

**What goes wrong:** Five struct types defined in HealthPacketCaptureTypes.swift (lines 99–294) are referenced by GooseAppModel.swift properties that are also being deleted. If the properties in GooseAppModel.swift are removed but the type definitions are left in HealthPacketCaptureTypes.swift, there are no compile errors — but they become dead code. The real risk is the reverse: if the property declarations are left in GooseAppModel.swift but the type definition file changes are missed.

**How to avoid:** Delete all five type definitions from HealthPacketCaptureTypes.swift in the same wave as the GooseAppModel.swift property removals.

### Pitfall 5: BGTaskScheduler Registration After App Launch

**What goes wrong:** `BGTaskScheduler.shared.register(forTaskWithIdentifier:using:launchHandler:)` must be called before the application finishes launching (i.e., before `applicationDidFinishLaunching` completes). In SwiftUI, this means it must be called from the `App.init()`, not from `.onAppear` or a view's `task` modifier.

**Why it happens:** The SwiftUI `App` struct body (WindowGroup) is evaluated after launch. `.onAppear` is called even later.

**Warning signs:** `BGTaskScheduler.shared.submit()` crashes at runtime with "Background task identifier is not permitted" or the task handler is never called.

**How to avoid:** Put `BGTaskScheduler.shared.register(...)` in `GooseSwiftApp.init()`.

### Pitfall 6: `fetch` Missing from UIBackgroundModes

**What goes wrong:** Without `"fetch"` in `UIBackgroundModes`, the BGAppRefreshTask identifier registration succeeds but the OS never schedules the task. The app will silently never receive background wakeups.

**Warning signs:** The task handler is never invoked in testing (simulated via `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.goose.swift.bg-sync"]` in debugger).

**How to avoid:** Add `<string>fetch</string>` to UIBackgroundModes in Info.plist.

### Pitfall 7: NotificationPipeline Static Method Signature Change

**What goes wrong:** `requiresMainParsedFrameHandling` and `canHandleDataSignalOffMain` are `nonisolated static` methods called from background queues. If the function signatures change (removing the `overnightGuardActive:` parameter) but some call sites are missed, the compile error appears on the call site, not on the method definition.

**How to avoid:** Search for all callers: `requiresMainParsedFrameHandling(` and `canHandleDataSignalOffMain(` — there are exactly 2 call sites each in NotificationPipeline.swift (lines 408, 420, 594). Update both callers at the same time as the definition change.

---

## Runtime State Inventory

This is a deletion/refactoring phase with no stored data migration required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | UserDefaults key `"goose.swift.lastHistorySyncAt"` — NEW key being added | Write in triggerForegroundBLESync before BLE call |
| Stored data | `OvernightGuard/` directory in `Documents/GooseSwift/OvernightGuard/` — session directories written by OvernightRawNotificationSpool | No migration; these are research artifacts, not user data. Left on disk (no cleanup code needed). |
| Live service config | None — no external service registrations | None |
| OS-registered state | `UIBackgroundModes: fetch` — being ADDED to Info.plist | Requires new build/install |
| OS-registered state | `BGTaskSchedulerPermittedIdentifiers: com.goose.swift.bg-sync` — being ADDED to Info.plist | Requires new build/install |
| Secrets/env vars | None affected | None |
| Build artifacts | None — no package renames | None |

**Nothing found in stored data that requires migration** — the overnight guard wrote session files as research artifacts, not user health data. The Rust SQLite database (`goose.sqlite`) is unaffected.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no Swift test target detected in GooseSwift.xcodeproj) |
| Rust tests | `cargo test` in `Rust/core/` — not relevant to Swift phase |
| Config file | None |
| Quick run command | Build in Xcode (`xcodebuild -scheme GooseSwift`) |
| Full suite command | Build + simulator smoke test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | OvernightRun.swift deleted, no compile errors | Build | `xcodebuild -scheme GooseSwift -destination 'platform=iOS Simulator,...'` | n/a — deletion |
| D-06/D-09/D-10 | triggerForegroundBLESync skips when called within 30 min | Manual (no Swift test target) | — | ❌ no test target |
| D-11/D-12/D-13 | BGAppRefreshTask handler registered, completes within 20s | Manual debugger simulation | `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.goose.swift.bg-sync"]` | n/a |
| D-02 | Overnight guard card absent from More tab | Simulator screenshot | XcodeBuildMCP tap + screenshot | n/a |

### Wave 0 Gaps

- No Swift test target exists. All validation is build success + simulator UI verification.
- Simulator test: navigate to More tab > Capture; verify no "Overnight Guard" section exists.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode 26+ | iOS 26.0 SDK (BGAppRefreshTask) | Confirmed | Xcode 26.5 | None |
| BackgroundTasks.framework | BGAppRefreshTask | Built-in (iOS 13+) | iOS 26.0 | None needed |
| iOS Simulator (iPhone) | UI smoke test | Available | iOS 26 | — |

BGAppRefreshTask is available from iOS 13.0. Deployment target is iOS 26.0, so no availability annotation is needed. [VERIFIED: Info.plist IPHONEOS_DEPLOYMENT_TARGET = 26.0]

---

## Security Domain

No new authentication, network, or cryptographic operations introduced. The phase removes code and adds a BGAppRefreshTask trigger. No ASVS categories apply.

BGAppRefreshTask does not expose any data — it only triggers a local BLE scan. The existing BLE security model (device pairing, GATT encryption) is unchanged.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | BGAppRefreshTask requires `"fetch"` in UIBackgroundModes (not a separate background mode key) | File-by-File Removal Scope / Info.plist Changes | If wrong, task still registers but iOS may not schedule it — low risk since testing will reveal it |
| A2 | `BGTaskScheduler.shared.register` can be called from `App.init()` before the SwiftUI scene is created | GooseSwiftApp.swift Changes | Apple documentation states registration must happen before app finishes launching; init() satisfies this [ASSUMED] |
| A3 | `ble.startScan()` is a valid method name on GooseBLEClient for initiating a BLE device scan | Architecture Patterns | If wrong, planner must find the correct scan-start method |
| A4 | `ble.stopScan()` is a valid method name on GooseBLEClient | Architecture Patterns | Same risk as A3 |
| A5 | OvernightSQLiteMirrorQueue (kept per D-04) has no active callers after the three overnight files are deleted | File-by-File Removal Scope | If there are other callers, the queue remains active unexpectedly |

For A3 and A4: The planner should verify the actual scan start/stop method names on GooseBLEClient before writing the BGTask handler. Search for `func startScan\|func stopScan\|func beginScan` in GooseBLEClient.swift.

---

## Open Questions

1. **`ble.startScan()` method name in BGTask handler**
   - What we know: `GooseBLEClient` manages BLE scanning, but the exact public API for starting a scan from a non-BLE context (e.g., background task) is not confirmed. The BLE client likely has `startScanning()` or `startScan()`.
   - What's unclear: Whether the existing scan API is safe to call from a background task when the peripheral may be powered off or out of range.
   - Recommendation: Planner reads `GooseBLEClient+UserActions.swift` for the scan start method before writing the BGTask handler. If no public scan method exists, the background task handler simply calls `task.setTaskCompleted(success: false)` immediately (since connecting requires prior pairing/scan which happens in foreground).

2. **`overnightSQLiteMirror` in GooseAppModel.init — is it a caller?**
   - The `overnightSQLiteMirror` let property (line 114) references `OvernightSQLiteMirrorQueue`. After overnight guard removal, this queue has no callers but the property declaration in GooseAppModel.swift remains (per D-04). The question is whether any code in the deleted files feeds data into this queue via `overnightSQLiteMirror.enqueueRawNotification(...)`.
   - Recommendation: Keep `let overnightSQLiteMirror = OvernightSQLiteMirrorQueue(...)` in GooseAppModel.swift as a dormant property (no callers, no deinit cleanup needed).

3. **Whether `ble.onRawNotificationWithContext` and `ble.onCommandWrite` should be set to nil or fully removed**
   - The callbacks are `var` properties on GooseBLEClient (lines 80–81). After removal of the overnight spool, they become nil. The GooseBLEClient will check `onRawNotificationWithContext?(event, context)` and it will be nil — a no-op. This is safe.
   - Recommendation: Simply do not assign these callbacks in `GooseAppModel.init()`. The properties remain on GooseBLEClient as nil optionals.

---

## Sources

### Primary (HIGH confidence — direct code read)

- `GooseSwift/GooseAppModel+OvernightRun.swift` — all 815 lines, full method inventory
- `GooseSwift/GooseAppModel.swift` — all 64 overnight property/constant references identified
- `GooseSwift/GooseAppModel+Lifecycle.swift` — full method text, guard structure confirmed
- `GooseSwift/GooseAppModel+SleepSync.swift` — cooldown pattern reference implementation
- `GooseSwift/GooseSwiftApp.swift` — current init structure, scenePhase wiring
- `GooseSwift/Info.plist` — UIBackgroundModes confirmed: bluetooth-central, location only
- `GooseSwift/GooseSwift.entitlements` — confirmed: no fetch entitlement needed
- `GooseSwift/MoreCaptureViews.swift` — overnight guard section lines 78–205 confirmed
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` — overnightGuardActive routing confirmed
- `GooseSwift/GooseBLEClient+UserActions.swift` — syncHistoricalPackets API confirmed
- `GooseSwift/HealthPacketCaptureTypes.swift` — 5 overnight struct types confirmed
- `GooseSwift/GooseAppModel+ActivityTimeline.swift` — 2 static overnight methods confirmed
- `.planning/phases/60-band-first-sync-align-goose-ble-sync-architecture-with-whoop/60-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md §Phase 60` — Ghidra reverse engineering findings for WHOOP band-first sync model, BGAppRefreshTask framework presence, cooldown log strings

### Tertiary (LOW confidence / ASSUMED)

- BGAppRefreshTask registration in `App.init()` timing requirement — Apple documentation pattern [ASSUMED]
- `ble.startScan()` / `ble.stopScan()` method names in BGTask handler — not verified in GooseBLEClient source

---

## Metadata

**Confidence breakdown:**
- Removal scope (what to delete): HIGH — all files read directly
- Foreground sync pattern: HIGH — SleepSync reference implementation read
- BGAppRefreshTask wiring: MEDIUM — pattern is standard iOS, but exact method names for BLE scan in background not verified
- Info.plist changes: HIGH — current state confirmed by direct read

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (stable iOS APIs, no dependencies on fast-moving libraries)
