---
phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
plan: "03"
subsystem: ios-app
tags:
  - overnight-guard-removal
  - band-first-sync
  - ble
  - ios
  - lifecycle

dependency_graph:
  requires:
    - "60-01 (overnight guard core deletion)"
    - "60-02 (triggerForegroundBLESync and BGAppRefreshTask wiring)"
  provides:
    - "Lifecycle.swift rewritten: triggerForegroundBLESync on active/foreground (D-08)"
    - "D-03 on-disk purge: purgeLegacyOvernightGuardDirectory removes Documents/GooseSwift/OvernightGuard idempotently"
    - "NotificationPipeline: overnightGuardActive fully removed from struct, factory, static methods, callers"
    - "ActivityTimeline: overnightGuardDirectoryURL and overnightGuardRootDirectoryURL deleted"
    - "MoreCaptureViews: Overnight Guard section and four computed properties removed (D-02)"
    - "CoachLocalToolContext and CodexCoachSupport: overnight_guard dict keys removed"
    - "LocalizedStatusStrings: localizedOvernightGuardStatus removed"
    - "Xcode project: GooseAppModel+BandFirstSync.swift registered in project.pbxproj"
    - "iOS simulator build clean with zero error: lines"
  affects:
    - "Phase 61+ (band-first sync stable baseline)"

tech-stack:
  added: []
  patterns:
    - "One-shot idempotent filesystem cleanup via UserDefaults boolean flag (goose.swift.legacyOvernightDirectoryPurged)"
    - "try? FileManager.default.removeItem best-effort: silent no-op on missing path"
    - "Inline path construction in purge helper (never call deleted static helpers)"

key-files:
  created: []
  modified:
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
    - GooseSwift/GooseAppModel.swift
    - GooseSwift.xcodeproj/project.pbxproj

key-decisions:
  - "D-03 purge helper inlines Documents/GooseSwift/OvernightGuard path rather than calling deleted overnightGuardRootDirectoryURL"
  - "D-03 idempotency via goose.swift.legacyOvernightDirectoryPurged UserDefaults flag — runs once per device"
  - "triggerForegroundBLESync called on active OR foreground (inclusive) per D-08"
  - "purgeLegacyOvernightGuardDirectory runs before triggerHealthCheckIfNeeded in the active branch"

patterns-established:
  - "Idempotent one-shot migration: UserDefaults bool flag gates filesystem work so it runs exactly once per install"
  - "Best-effort directory removal: try? removeItem is silent on missing paths — safe on all devices including fresh installs"

requirements-completed: []

duration: 45min
completed: "2026-06-11"
---

# Phase 60 Plan 03: Integration — Wire Foreground Sync, Purge Overnight Directory, Clean All Remaining References

**Band-first sync integration complete: Lifecycle.swift rewritten to call triggerForegroundBLESync on active/foreground, D-03 on-disk purge wired via idempotent UserDefaults-gated helper, all overnight symbol references removed from 13 files, iOS simulator build clean with zero errors.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-11
- **Completed:** 2026-06-11
- **Tasks:** 3 auto + 1 checkpoint
- **Files modified:** 13

## Accomplishments

- Rewrote `handleAppLifecycleChange` from scratch: removed `overnightGuardActive` guard (was a permanent no-op), now calls `purgeLegacyOvernightGuardDirectory()` + `triggerHealthCheckIfNeeded()` + `triggerForegroundBLESync()` on active/foreground (D-08)
- Added `purgeLegacyOvernightGuardDirectory()`: idempotent one-shot helper that deletes `Documents/GooseSwift/OvernightGuard` using best-effort `try? FileManager.default.removeItem`, gated by `goose.swift.legacyOvernightDirectoryPurged` UserDefaults flag (D-03)
- Cleaned `handleBLEConnectionStateChange`: removed `if overnightGuardActive { ... }` block and all `refreshOvernightReadiness` calls; kept `maybeScheduleMorningSleepSync()`
- Deleted three critical-background-task helpers: `beginOvernightGuardCriticalBackgroundTask`, `expireOvernightGuardCriticalBackgroundTask`, `endOvernightGuardCriticalBackgroundTask`
- Removed `overnightGuardActive` from `NotificationParseContext` struct, `notificationParseContext(for:)` factory, `requiresMainParsedFrameHandling`, `canHandleDataSignalOffMain`, and their call sites
- Deleted `overnightGuardDirectoryURL(sessionID:)` and `overnightGuardRootDirectoryURL()` static helpers from ActivityTimeline
- Removed the entire `Section("Overnight Guard")` block and four computed properties from MoreCaptureViews (D-02)
- Stripped `overnight_guard` dict keys from CoachLocalToolContext and CodexCoachSupport
- Removed `localizedOvernightGuardStatus` from LocalizedStatusStrings
- iOS simulator build passes with zero `error:` lines

## Task Commits

1. **Task 1: Lifecycle.swift rewrite + D-03 purge helper** — `9290b75` (feat)
2. **Task 2: NotificationPipeline + ActivityTimeline cleanup** — `a72ffba` (feat)
3. **Task 3: UI, context, status string removal + sweep clean** — `c1acbaf` (feat)
4. **Task 3 (Rule 1/3 fixes): Xcode registration + residual call sites** — `7f3c6f9` (fix)
5. **Task 4: Checkpoint (human-verify)** — APPROVED (human verifier confirmed)

## Files Created/Modified

- `GooseSwift/GooseAppModel+Lifecycle.swift` — Rewritten: triggerForegroundBLESync on active, purgeLegacyOvernightGuardDirectory D-03 helper, three critical-task helpers deleted
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` — overnightGuardActive removed from static methods and call sites; residual recordOvernightPacketTypeTarget call removed
- `GooseSwift/NotificationFrameParsing.swift` — overnightGuardActive field removed from NotificationParseContext struct
- `GooseSwift/GooseAppModel+ActivityTimeline.swift` — Two static overnight directory helpers deleted
- `GooseSwift/MoreCaptureViews.swift` — Overnight Guard section (130 lines) and four computed properties removed (D-02)
- `GooseSwift/CoachLocalToolContext.swift` — overnight_guard dict key removed
- `GooseSwift/CodexCoachSupport.swift` — overnight_guard dict key removed
- `GooseSwift/LocalizedStatusStrings.swift` — localizedOvernightGuardStatus section removed
- `GooseSwift/GooseAppModel+SleepSync.swift` — Removed overnightGuardActive guard from maybeScheduleMorningSleepSync (was stale reference to deleted property)
- `GooseSwift/GooseAppModel+HealthCapture.swift` — Removed handleOvernightHistoricalSyncProgress call (method deleted in 60-01)
- `GooseSwift/GooseAppModel+PacketPublishing.swift` — Removed recordOvernightEventTarget and recordOvernightDataSignalTarget calls (methods deleted in 60-01)
- `GooseSwift/GooseAppModel.swift` — Removed ble.onHistoricalRangeTelemetry callback calling deleted persistOvernightHistoricalRangeTelemetry
- `GooseSwift.xcodeproj/project.pbxproj` — Added GooseAppModel+BandFirstSync.swift (PBXBuildFile, PBXFileReference, PBXGroup, PBXSourcesBuildPhase)

## Decisions Made

- Purge helper inlines the `Documents/GooseSwift/OvernightGuard` path construction rather than calling `overnightGuardRootDirectoryURL()` which was deleted in 60-01 (per plan requirement)
- `purgeLegacyOvernightGuardDirectory()` is `private` and called once from the active/foreground branch of `handleAppLifecycleChange`
- Used `goose.swift.legacyOvernightDirectoryPurged` key (dot-namespaced convention per D-10)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GooseAppModel+BandFirstSync.swift not registered in Xcode project**
- **Found during:** Task 3 (build verification)
- **Issue:** File was created in 60-02 but not added to `GooseSwift.xcodeproj/project.pbxproj` — compiler could not see `triggerForegroundBLESync`, `handleBGAppRefresh`, `scheduleNextBGAppRefresh`. Four build errors related to missing symbols.
- **Fix:** Added PBXBuildFile (`D1000000000000000000005E`), PBXFileReference (`D2000000000000000000005E`), PBXGroup entry, and PBXSourcesBuildPhase entry to `project.pbxproj`. UUIDs chosen as next available in the established sequential hex scheme.
- **Files modified:** `GooseSwift.xcodeproj/project.pbxproj`
- **Committed in:** `7f3c6f9`

**2. [Rule 1 - Bug] Residual overnight call sites left by 60-01 deletion**
- **Found during:** Task 3 (build verification — same build)
- **Issue:** Four orphaned method calls to functions deleted with OvernightRun.swift/OvernightState.swift in 60-01:
  - `GooseAppModel.swift:329` — `ble.onHistoricalRangeTelemetry` callback calling `persistOvernightHistoricalRangeTelemetry` (deleted)
  - `GooseAppModel+HealthCapture.swift:310` — `handleOvernightHistoricalSyncProgress` call (deleted)
  - `GooseAppModel+PacketPublishing.swift:447` — `recordOvernightEventTarget` call (deleted)
  - `GooseAppModel+PacketPublishing.swift:472` — `recordOvernightDataSignalTarget` call (deleted)
- **Fix:** Removed each orphaned call site. The `onHistoricalRangeTelemetry` callback was removed entirely (no replacement needed — range telemetry persistence was overnight-guard-specific). The other three were single-line removals.
- **Files modified:** `GooseSwift/GooseAppModel.swift`, `GooseSwift/GooseAppModel+HealthCapture.swift`, `GooseSwift/GooseAppModel+PacketPublishing.swift`
- **Committed in:** `7f3c6f9`

**3. [Rule 1 - Bug] Stale overnightGuardActive reference in GooseAppModel+SleepSync.swift**
- **Found during:** Task 3 (repo-wide sweep — found before build)
- **Issue:** `maybeScheduleMorningSleepSync()` still had `guard !overnightGuardActive else { return }` — the property was deleted in 60-01, making this a latent compile error. The comment also referenced "overnightGuardActive == false".
- **Fix:** Removed the guard line and updated the comment. The method now proceeds directly to the time-of-day gate.
- **Files modified:** `GooseSwift/GooseAppModel+SleepSync.swift`
- **Committed in:** `c1acbaf`

**4. [Rule 1 - Bug] Residual recordOvernightPacketTypeTarget call in NotificationPipeline**
- **Found during:** Task 3 (repo-wide grep scan)
- **Issue:** `handleParsedNotificationFrame` in NotificationPipeline called `recordOvernightPacketTypeTarget(interpretation.packetType)` — method deleted with OvernightState.swift in 60-01.
- **Fix:** Removed the single call site.
- **Files modified:** `GooseSwift/GooseAppModel+NotificationPipeline.swift`
- **Committed in:** `c1acbaf`

---

**Total deviations:** 4 auto-fixed (1 Rule 3 blocking, 3 Rule 1 bug)
**Impact on plan:** All four were correctness bugs left by 60-01's deletion pass. No scope creep — all fixes are direct consequences of the overnight guard removal.

## Issues Encountered

- The `GooseAppModel+BandFirstSync.swift` file created in 60-02 was not registered in the Xcode project, causing four missing-symbol build errors. Resolved by adding the four required pbxproj entries with sequential UUID `5E`.
- Repo-wide grep revealed four orphaned overnight method calls not caught by 60-01's cleanup. All removed cleanly as single-line deletions.

## Known Stubs

None. All code paths are fully wired:
- `triggerForegroundBLESync()` calls real `ble.syncHistoricalPackets(rangeFirst: true)`
- `purgeLegacyOvernightGuardDirectory()` calls real `FileManager.default.removeItem`
- The overnight UI section is fully removed — no placeholder text or hidden sections

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The D-03 purge helper accesses only the app's own `Documents/GooseSwift/OvernightGuard` subtree using the standard `FileManager` API. T-60-07 through T-60-10 from the plan's threat register are all mitigated:
- T-60-07: handleAppLifecycleChange is a real no-op no longer — calls triggerForegroundBLESync on active
- T-60-08: Repo-wide sweep returns 0; simulator build returns 0 errors
- T-60-09: requiresMainParsedFrameHandling updated at definition and call site
- T-60-10: Purge runs once (UserDefaults flag), confined to app container, uses try? for silent no-op

## Human Verification (Task 4)

**Verified by:** User on iPhone 17 iOS 26.5 simulator
**Result:** APPROVED

Confirmed:
- More tab → Developer → Capture screen shows NO Overnight Guard section (only Session, Imports And Matching, and Recent Capture Sessions sections visible)
- `overnight.purge` event appeared in Recent Notifications And Events with status "Pronto" — D-03 on-disk purge ran successfully on app launch
- App launched and ran without crash on iPhone 17 iOS 26.5 simulator
- Build succeeded with zero errors (confirmed by executor before checkpoint)
- Screenshot captured showing the Capture screen with no overnight guard content

User response: "approved — Overnight Guard section is absent from Capture screen, overnight.purge event confirms D-03 purge ran on launch, app runs cleanly."

## Next Phase Readiness

Phase 60 is fully complete:
- 60-01: Overnight guard core deletion (done)
- 60-02: Band-first sync addition — triggerForegroundBLESync + BGAppRefreshTask (done)
- 60-03: Integration + sweep clean + human-verified (done)

The app exclusively uses the band-first sync path. No overnight guard symbol survives anywhere in GooseSwift/. Phase 61 (BLE Bonding State Machine) can begin immediately.

---
*Phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop*
*Completed: 2026-06-11*
