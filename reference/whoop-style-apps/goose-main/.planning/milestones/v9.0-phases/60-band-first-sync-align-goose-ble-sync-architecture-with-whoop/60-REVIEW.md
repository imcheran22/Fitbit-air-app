---
phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/HealthPacketCaptureTypes.swift
  - GooseSwift/GooseAppModel+BandFirstSync.swift
  - GooseSwift/GooseSwiftApp.swift
  - GooseSwift/Info.plist
  - GooseSwift/GooseAppModel+Lifecycle.swift
  - GooseSwift/GooseAppModel+NotificationPipeline.swift
  - GooseSwift/NotificationFrameParsing.swift
  - GooseSwift/GooseAppModel+ActivityTimeline.swift
  - GooseSwift/MoreCaptureViews.swift
  - GooseSwift/CoachLocalToolContext.swift
  - GooseSwift/CodexCoachSupport.swift
  - GooseSwift/LocalizedStatusStrings.swift
  - GooseSwift/GooseAppModel+SleepSync.swift
  - GooseSwift/GooseAppModel+HealthCapture.swift
  - GooseSwift/GooseAppModel+PacketPublishing.swift
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 60 replaces the overnight polling guard with a band-first sync model. The core BLE pipeline, activity timeline, notification pipeline, and UI cleanup are all solid. The new `GooseAppModel+BandFirstSync.swift` is concise and correctly implements the foreground cooldown pattern. Two blockers were found in the BGTask registration path — one is a silent task-abandonment risk on background launch, the other is a force cast that will crash on any future API change. Four warnings cover a dead `overnightSQLiteMirror` property left over from the overnight removal, a BGScheduler error that is silently discarded, a success flag set prematurely in the BG sync path, and a dead branch in lifecycle string handling. Three info items flag ISO8601DateFormatter allocations per call, an unused "foreground" branch, and the pre-write timestamp pattern's failure-masking side effect.

## Critical Issues

### CR-01: BGTask abandoned if `sharedModel` is nil during background launch

**File:** `GooseSwift/GooseSwiftApp.swift:19-23`

**Issue:** `BGTaskScheduler` registers its handler in `init()`, but `GooseSwiftApp.sharedModel` is set only in `.onAppear`. When iOS launches the app in the background exclusively to service a `BGAppRefreshTask` (cold background launch, no window rendered), the SwiftUI `WindowGroup` view hierarchy may not render visibly and `.onAppear` may fire only after the registered task handler runs. If `sharedModel` is `nil` at that moment, the optional-chaining `sharedModel?.handleBGAppRefresh(...)` silently no-ops — `setTaskCompleted` is never called, the expiration handler was never installed, and iOS logs a task-abandonment error. Repeated abandonment degrades the app's background refresh quota over time.

Apple's documentation states the handler block is called after launch completes, and SwiftUI `WindowGroup` does process its view tree during background launches — in practice `onAppear` fires before the task handler in most cases. However, this is not guaranteed by the API contract; the comment "Set in .onAppear before any background wakeup can occur" reflects an assumption, not a guarantee.

**Fix:** Move `sharedModel` assignment out of `.onAppear` and into the `App` initialiser, or set it inside the BGTask registration closure itself from the already-available `model` state object. A safe alternative is to call `setTaskCompleted(success: false)` immediately when `sharedModel` is nil:

```swift
// In GooseSwiftApp.init(), after registering the handler:
BGTaskScheduler.shared.register(
  forTaskWithIdentifier: "com.goose.swift.bg-sync",
  using: nil
) { [weak model] task in
  guard let task = task as? BGAppRefreshTask else { return }
  Task { @MainActor in
    if let model = GooseSwiftApp.sharedModel {
      model.handleBGAppRefresh(task: task)
    } else {
      // App not yet ready — reschedule and abandon gracefully.
      let req = BGAppRefreshTaskRequest(identifier: "com.goose.swift.bg-sync")
      req.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
      try? BGTaskScheduler.shared.submit(req)
      task.setTaskCompleted(success: false)
    }
  }
}
```

---

### CR-02: Force cast `task as! BGAppRefreshTask` will crash on type mismatch

**File:** `GooseSwift/GooseSwiftApp.swift:21`

**Issue:** The BGTask handler closure receives `BGTask` and immediately force-casts it: `task as! BGAppRefreshTask`. The identifier `"com.goose.swift.bg-sync"` is registered for a `BGAppRefreshTask`, so the cast succeeds today. However, if a future refactor registers the same identifier for a `BGProcessingTask` or if Apple changes the class hierarchy, this will crash with `EXC_BAD_INSTRUCTION` at runtime in production — in a background handler that the user cannot reproduce.

**Fix:** Use a conditional cast and fail gracefully:

```swift
guard let refreshTask = task as? BGAppRefreshTask else {
  task.setTaskCompleted(success: false)
  return
}
GooseSwiftApp.sharedModel?.handleBGAppRefresh(task: refreshTask)
```

---

## Warnings

### WR-01: `overnightSQLiteMirror` is a dead stored property after overnight guard removal

**File:** `GooseSwift/GooseAppModel.swift:89`

**Issue:** `let overnightSQLiteMirror = OvernightSQLiteMirrorQueue(databasePath: ...)` is allocated at model initialisation and never accessed after the overnight guard was deleted in this phase. The property holds a `DispatchQueue` and an `NSLock` that are never used. The property creates confusion about whether the overnight mirror path is still active.

**Fix:** Remove line 89. Verify that `OvernightSQLiteMirrorQueue` itself is only referenced from `OvernightRawNotificationSpool.swift` (the spool file is separate from the phase-removed guard); if the spool is still live, the class can stay but the `GooseAppModel` property must go.

```swift
// Delete from GooseAppModel.swift:
// let overnightSQLiteMirror = OvernightSQLiteMirrorQueue(databasePath: HealthDataStore.defaultDatabasePath())
```

---

### WR-02: BGTask scheduling errors are silently discarded

**File:** `GooseSwift/GooseAppModel+BandFirstSync.swift:70`

**Issue:** `try? BGTaskScheduler.shared.submit(request)` silently drops all scheduling errors. The most impactful error is `BGTaskScheduler.Error.notPermitted`, which occurs when the app was not granted background refresh permission by the user (Settings > General > Background App Refresh is off for this app). When this happens, the band-first sync model is completely broken in background, with no log, no user-facing status update, and no diagnostic.

**Fix:** Log the error; do not try to surface it as a hard failure (scheduling errors are advisory):

```swift
do {
  try BGTaskScheduler.shared.submit(request)
} catch {
  ble.record(
    level: .warn,
    source: "band_first_sync",
    title: "bg_schedule.failed",
    body: String(describing: error)
  )
}
```

---

### WR-03: BG sync reports `success: true` before knowing whether the sync completed

**File:** `GooseSwift/GooseAppModel+BandFirstSync.swift:48-53`

**Issue:** In the "already connected" path of `handleBGAppRefresh`, `ble.syncHistoricalPackets(rangeFirst: true)` is called and then `setTaskCompleted(success: true)` is scheduled unconditionally after 20 seconds:

```swift
if ble.connectionState == "ready" {
  ble.syncHistoricalPackets(rangeFirst: true)
  DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
    task.setTaskCompleted(success: true)
  }
  return
}
```

If BLE disconnects immediately after the call (common during background execution), `historicalSyncStatus` never becomes `"synced"` but the task is still reported successful. iOS uses the success flag to decide background refresh scheduling; consistent false positives may cause iOS to increase the minimum interval between wakeups under the adaptive scheduling algorithm.

**Fix:** Pass `success: false` when the sync was not confirmed, or poll `ble.historicalSyncStatus` briefly (same pattern as `syncBandSleepHistory`):

```swift
if ble.connectionState == "ready" {
  ble.syncHistoricalPackets(rangeFirst: true)
  DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
    let synced = self?.ble.historicalSyncStatus == "synced"
    task.setTaskCompleted(success: synced)
  }
  return
}
```

---

### WR-04: Dead branch `phase == "foreground"` in `handleAppLifecycleChange`

**File:** `GooseSwift/GooseAppModel+Lifecycle.swift:7`

**Issue:** `handleAppLifecycleChange` checks `phase == "active" || phase == "foreground"`, but `GooseSwiftApp` only ever passes `"active"`, `"inactive"`, `"background"`, or `"unknown"`. The string `"foreground"` is never sent. The dead branch misleads future readers into thinking there is a `"foreground"` lifecycle phase, and could cause confusion if `"foreground"` is accidentally introduced later expecting the sync behaviour to trigger.

**Fix:** Remove the dead alternative:

```swift
if phase == "active" {
  purgeLegacyOvernightGuardDirectory()
  triggerHealthCheckIfNeeded()
  triggerForegroundBLESync()
}
```

---

## Info

### IN-01: `ISO8601DateFormatter()` allocated per call in context builders

**File:** `GooseSwift/CoachLocalToolContext.swift:202`, `GooseSwift/CodexCoachSupport.swift:185`

**Issue:** Both `CoachLocalToolContext.timestamp(_:)` and `CodexLocalToolContext.isoString(_:)` allocate a new `ISO8601DateFormatter` on every invocation. These methods are called repeatedly inside `build(...)` on every AI coach context snapshot. `ISO8601DateFormatter` is an expensive Objective-C object to initialise. This is a latency hit on the main actor.

**Fix:** Use a `static let` formatter:

```swift
private static let isoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime]
  return f
}()

private static func timestamp(_ date: Date) -> String {
  isoFormatter.string(from: date)
}
```

Note: `GooseAppModel.captureTimestampFormatter` already demonstrates this pattern correctly.

---

### IN-02: Pre-write timestamp in `triggerForegroundBLESync` masks BLE sync failures for 30 minutes

**File:** `GooseSwift/GooseAppModel+BandFirstSync.swift:29`

**Issue:** `UserDefaults.standard.set(Date(), forKey: Self.lastHistorySyncAtKey)` is written before `ble.syncHistoricalPackets(rangeFirst: true)` is called, and it is never cleared on BLE failure. If the device connects, the timestamp is written, and then BLE drops immediately (race between connect and sync), the next foreground transition within 30 minutes will skip the sync silently. The 30-minute penalty is applied even though no data was actually synced.

This is an intentional design tradeoff documented in the code comments ("prevent retry loops on drop+reconnect"). The finding is noted for operational awareness: users who experience frequent BLE disconnects during sync may go up to 30 minutes between successful syncs with no indication of the failure.

**No immediate fix required** — but consider logging a warning when the cooldown fires to make the suppression visible:

```swift
ble.record(
  source: "band_first_sync",
  title: "foreground_sync.skipped",
  body: "last sync \(Int(Date().timeIntervalSince(lastSync)))s ago (< 30 min cooldown)"
)
```

---

### IN-03: `OvernightRawNotificationStorageClassifier` applies 8-byte header logic to GEN4 4-byte frames

**File:** `GooseSwift/NotificationFrameParsing.swift:185-206`

**Issue:** `OvernightRawNotificationStorageClassifier.classify` guards `headerBytes.count >= 9` and reads `packetType` from `headerBytes[8]`. The GEN4 device uses a 4-byte header (as implemented in `gooseFrames` where `headerLength == 4` for GEN4). For a GEN4 notification that is exactly 9 bytes long, `headerBytes[8]` reads into the payload, not the protocol header. For shorter GEN4 frames, `headerBytes.count >= 9` fails and returns a null classification — which is safe (no compaction key), but means GEN4 live-sample compaction never triggers.

This is a pre-existing issue (the classifier predates phase 60 and was not modified here), noted here because `OvernightRawNotificationStorageClassifier` is still live via `OvernightSQLiteMirrorQueue` and `OvernightRawNotificationSpool`. It should be addressed in a follow-up.

**No fix required in this phase.** File a separate issue: "OvernightRawNotificationStorageClassifier: adapt header-offset logic for GEN4 4-byte frames."

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
