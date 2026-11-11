---
phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
plan: "02"
subsystem: ios-app
tags:
  - band-first-sync
  - background-tasks
  - ble
  - ios
dependency_graph:
  requires:
    - "60-01 (overnight guard removal — GooseAppModel base cleaned up)"
  provides:
    - "GooseAppModel+BandFirstSync.swift with triggerForegroundBLESync, handleBGAppRefresh, scheduleNextBGAppRefresh"
    - "BGAppRefreshTask registered in GooseSwiftApp.init()"
    - "Info.plist permits BGTaskSchedulerPermittedIdentifiers + fetch background mode"
  affects:
    - "GooseSwift/GooseSwiftApp.swift (BGTask registration + sharedModel wiring)"
    - "GooseSwift/Info.plist (new plist keys)"
tech_stack:
  added:
    - "BackgroundTasks framework (BGAppRefreshTask, BGAppRefreshTaskRequest, BGTaskScheduler)"
  patterns:
    - "Cooldown guard with UserDefaults timestamp written BEFORE BLE call (from GooseAppModel+SleepSync.swift)"
    - "nonisolated(unsafe) static weak var for cross-actor model reference (sharedModel pattern)"
    - "BGTask handler: reschedule-first, expirationHandler-before-work, 20s asyncAfter timeout"
key_files:
  created:
    - GooseSwift/GooseAppModel+BandFirstSync.swift
  modified:
    - GooseSwift/GooseSwiftApp.swift
    - GooseSwift/Info.plist
decisions:
  - "D-07: triggerForegroundBLESync only fires when ble.connectionState == ready — no reconnect attempt"
  - "D-09/D-10: 30-minute cooldown stored in UserDefaults goose.swift.lastHistorySyncAt, persists across app kills"
  - "D-11: BGTaskSchedulerPermittedIdentifiers contains com.goose.swift.bg-sync"
  - "D-12/D-13: BGTask handler attempts scan+connect with 20s timeout, calls setTaskCompleted on both paths"
  - "D-14: expirationHandler set before any work, calls stopScan + setTaskCompleted(false)"
  - "sharedModel pattern chosen (Pattern B from RESEARCH.md) — nonisolated(unsafe) static weak var on GooseSwiftApp"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 60 Plan 02: Band-First Sync — BGAppRefreshTask Wiring Summary

**One-liner:** BGAppRefreshTask handler + 30-min cooldown foreground sync trigger using UserDefaults persistence and GooseSwiftApp.sharedModel wiring.

## What Was Built

### Task 1 — GooseAppModel+BandFirstSync.swift (new file, 72 lines)

Three methods added as an `extension GooseAppModel`:

- **`triggerForegroundBLESync()`** — Guards on `ble.connectionState == "ready"` (D-07). Reads `goose.swift.lastHistorySyncAt` from UserDefaults; skips with a `ble.record(source: "band_first_sync", title: "foreground_sync.skipped")` if within 30 minutes. Otherwise writes the timestamp BEFORE the BLE call (established SleepSync pattern to prevent retry loops), logs `foreground_sync.start`, then calls `ble.syncHistoricalPackets(rangeFirst: true)`.

- **`handleBGAppRefresh(task: BGAppRefreshTask)`** — Called by the BGTask handler closure via `GooseSwiftApp.sharedModel`. Reschedules next wakeup first (`scheduleNextBGAppRefresh()`). Sets `task.expirationHandler` before any work. On `ready` state: calls `syncHistoricalPackets(rangeFirst: true)` + 20s asyncAfter `setTaskCompleted(success: true)`. On not-ready: `startScan()` + 20s asyncAfter `stopScan() + setTaskCompleted(success: false)`.

- **`scheduleNextBGAppRefresh()`** — Builds `BGAppRefreshTaskRequest(identifier: "com.goose.swift.bg-sync")`, sets `earliestBeginDate` to 30 minutes from now, submits via `try? BGTaskScheduler.shared.submit(request)`.

Two static constants: `lastHistorySyncAtKey = "goose.swift.lastHistorySyncAt"` and `bandFirstSyncCooldown: TimeInterval = 30 * 60`.

### Task 2 — GooseSwiftApp.swift + Info.plist

**GooseSwiftApp.swift changes:**
- Added `import BackgroundTasks`
- Added `nonisolated(unsafe) static weak var sharedModel: GooseAppModel?` — module-level weak reference for BGTask handler access (Pattern B from RESEARCH.md)
- In `init()`: registered `"com.goose.swift.bg-sync"` with `BGTaskScheduler.shared.register(forTaskWithIdentifier:using:)` before app launch completes (Pitfall 5 avoidance). Handler closure dispatches to `@MainActor` via `Task { @MainActor in }` and calls `GooseSwiftApp.sharedModel?.handleBGAppRefresh(task:)`.
- Added `.onAppear` modifier on the WindowGroup body: sets `GooseSwiftApp.sharedModel = model` and calls `model.scheduleNextBGAppRefresh()` for first scheduling at scene launch.

**Info.plist changes:**
- Added `BGTaskSchedulerPermittedIdentifiers` array with `com.goose.swift.bg-sync` (D-11)
- Added `<string>fetch</string>` to `UIBackgroundModes` (Pitfall 6 avoidance — without `fetch`, iOS registers the identifier but never schedules the task)
- `plutil -lint` passes: OK

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored Info.plist after `plutil -extract` overwrote the file**
- **Found during:** Task 2 verification
- **Issue:** Running `plutil -extract UIBackgroundModes json GooseSwift/Info.plist` (without `-o -`) writes the extracted JSON directly to the plist file, overwriting its entire contents with `["bluetooth-central","fetch","location"]`. The verification command in the acceptance criteria triggered this.
- **Fix:** Rewrote the full Info.plist content using the Write tool, restoring all original keys and the two new additions (`BGTaskSchedulerPermittedIdentifiers` and `fetch` in `UIBackgroundModes`). Subsequent verification used `grep` instead of `plutil -extract`.
- **Files modified:** `GooseSwift/Info.plist`
- **Commit:** 9a561b1 (same task commit)

## Known Stubs

None. All three methods are fully implemented. The foreground sync trigger and background task handler both call real BLE methods (`syncHistoricalPackets`, `startScan`, `stopScan`) with real UserDefaults persistence. No hardcoded empty values or placeholders.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The BGAppRefreshTask trigger reuses the existing BLE pairing and GATT encryption model. New plist keys are OS-registration only (no data exposure). Threat register T-60-03 through T-60-06 from the plan's `<threat_model>` have been mitigated as designed:
- T-60-03: `expirationHandler` set before work; both branches call `setTaskCompleted`; `scheduleNextBGAppRefresh` runs first.
- T-60-04: 20s asyncAfter and expirationHandler both call `stopScan()`.
- T-60-05: `as? Date` cast fails safe to nil (benign — triggers a sync rather than crashing).
- T-60-06: No new data path; existing BLE security model unchanged.

## Commits

| Task | Commit | Files | Description |
|------|--------|-------|-------------|
| Task 1 | 66340b0 | GooseAppModel+BandFirstSync.swift | Create band-first sync extension with all three methods |
| Task 2 | 9a561b1 | GooseSwiftApp.swift, Info.plist | BGTask registration + plist keys |

## Self-Check: PASSED

- GooseSwift/GooseAppModel+BandFirstSync.swift: FOUND
- GooseSwift/GooseSwiftApp.swift: modified with sharedModel + BGTask registration
- GooseSwift/Info.plist: plutil -lint OK, BGTaskSchedulerPermittedIdentifiers present, fetch in UIBackgroundModes
- Commits 66340b0 and 9a561b1: present in git log
