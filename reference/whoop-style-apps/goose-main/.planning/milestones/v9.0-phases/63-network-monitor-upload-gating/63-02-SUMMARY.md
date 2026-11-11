---
phase: 63-network-monitor-upload-gating
plan: "02"
subsystem: upload
tags: [upload, reachability, apns, backoff, iOS, swift, gating]

requires:
  - phase: 63-01
    provides: GooseNetworkMonitor and isNetworkReachable on GooseAppModel

provides:
  - Reachability gate on triggerManualUpload, triggerBackfillAndUpload, triggerUpload
  - APNs token soft gate (warn, not error) on all upload triggers
  - Exponential backoff (1s, 2s, 4s … capped 60s) for 5xx responses in GooseUploadService
  - Visible uploadErrorState published to GooseAppModel on retry exhaustion
  - Automatic retry of deferred uploads when connectivity returns
  - GooseAppDelegate registering for APNs and storing hex token into GooseAppModel

affects:
  - GooseAppModel (new properties: apnsDeviceToken, uploadErrorState, hasPendingUploadAfterReconnect)
  - GooseAppModel+Upload (gates, setAPNSDeviceToken setter, uploadErrorState wiring)
  - GooseAppModel+Lifecycle (handleReachabilityChange for connectivity-return retry)
  - GooseUploadService (UploadAttemptResult enum, exponential backoff loop, uploadErrorState tracking)
  - GooseSwiftApp (UIApplicationDelegateAdaptor)

tech-stack:
  added: [UIKit (UIApplicationDelegate — OS-provided, no new dependency)]
  patterns:
    - "Reachability gate: guard isNetworkReachable else { hasPendingUploadAfterReconnect = true; return }"
    - "APNs token soft gate: guard apnsDeviceToken != nil else { log warn; return }"
    - "Exponential backoff: min(1.0 * pow(2, attempt-1), 60.0) nanosecond sleep, 7 total attempts"
    - "UploadAttemptResult enum: .success(Int) / .serverError(Int) / .transientError"
    - "Connectivity-return retry in handleReachabilityChange called from GooseAppModel.init callback"

key-files:
  created:
    - GooseSwift/GooseAppDelegate.swift
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+Upload.swift
    - GooseSwift/GooseAppModel+Lifecycle.swift
    - GooseSwift/GooseUploadService.swift
    - GooseSwift/GooseSwiftApp.swift
    - GooseSwift.xcodeproj/project.pbxproj

key-decisions:
  - "apnsDeviceToken is internal (not private(set)) so the setAPNSDeviceToken extension setter can write it; external callers cannot write it but can read it via @Observable observation"
  - "APNs gate is soft (warn + return, not error state) — absence before registration is expected; uploadErrorState is not set for a missing token"
  - "UploadAttemptResult enum scoped private inside GooseUploadService.swift — not exposed to callers"
  - "Max 7 total attempts (attempt 0 immediate + 6 retried): delays 1,2,4,8,16,32,60s — T-63-02 DoS mitigation, battery protection"
  - "handleReachabilityChange in GooseAppModel+Lifecycle — called from networkMonitor.onReachabilityChange in init after isNetworkReachable update"
  - "setAPNSDeviceToken also triggers deferred upload if network is reachable and hasPendingUploadAfterReconnect is true — so first token registration enables queued work"

requirements-completed: [NET-MON-01]

duration: 5min
completed: 2026-06-11
---

# Phase 63 Plan 02: Upload Gating Summary

**Upload pipeline gated on network reachability + APNs token; 5xx exponential backoff (1/2/4s…max 60s) with visible error state; connectivity-return retry; GooseAppDelegate captures device token**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-11T13:54:45Z
- **Completed:** 2026-06-11T14:00:00Z
- **Tasks:** 4
- **Files modified:** 6 (+ 1 created)

## Accomplishments

- Added three new @Observable properties to GooseAppModel: `apnsDeviceToken`, `uploadErrorState`, `hasPendingUploadAfterReconnect`
- Gated `triggerManualUpload`, `triggerBackfillAndUpload`, `triggerUpload` on `apnsDeviceToken != nil` (soft warn) and `isNetworkReachable` (defers with flag); `importHistoricalDataFromServer`, `testServerConnection`, `checkServerHealth` left ungated per plan
- Added `setAPNSDeviceToken` setter method on GooseAppModel+Upload (needed because `apnsDeviceToken` must be writable from extension file; relaxed from `private(set)` to plain var — see Deviations)
- Added `handleReachabilityChange(_ reachable: Bool)` in GooseAppModel+Lifecycle; called from networkMonitor callback in init; when connectivity returns + pending flag, clears flag and error state, fires triggerManualUpload
- Introduced `UploadAttemptResult` private enum in GooseUploadService: `.success(Int)` / `.serverError(Int)` / `.transientError`
- Replaced fixed 3-attempt retry with exponential backoff: attempt 0 immediate, then delays `min(1.0 * pow(2, attempt-1), 60.0)` seconds — capped at 60s per delay, 7 total attempts (matches T-63-02 threat mitigation)
- Added `_uploadErrorState` lock-guarded property in GooseUploadService; set to human-readable string on retry exhaustion, cleared on success; included in GooseUploadStatus and published via onStatusUpdate
- Created GooseAppDelegate: registers for remote notifications on launch, stores hex token via setAPNSDeviceToken on main actor, logs (does not crash) on failure
- Attached GooseAppDelegate via `@UIApplicationDelegateAdaptor` in GooseSwiftApp
- Registered GooseAppDelegate.swift in project.pbxproj (PBXBuildFile E1...C, PBXFileReference E2...C, group children, Sources build phase)
- Simulator build succeeded

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate upload triggers + observable error/token state** — `676edc1` (feat)
2. **Task 2: Exponential backoff for 5xx + visible error state** — `1409e1f` (feat)
3. **Task 3: APNs registration AppDelegate** — `fdb6b4c` (feat)
4. **Task 4: Build for simulator** — `e082540` (fix — apnsDeviceToken access level; build confirmed)

## Files Created/Modified

- `GooseSwift/GooseAppDelegate.swift` — UIApplicationDelegate; APNs registration; token storage; failure logging
- `GooseSwift/GooseAppModel.swift` — Added apnsDeviceToken, uploadErrorState, hasPendingUploadAfterReconnect; networkMonitor callback extended to call handleReachabilityChange
- `GooseSwift/GooseAppModel+Upload.swift` — Reachability + APNs gates on upload triggers; setAPNSDeviceToken setter; uploadErrorState wired from status updates
- `GooseSwift/GooseAppModel+Lifecycle.swift` — handleReachabilityChange: connectivity-return retry
- `GooseSwift/GooseUploadService.swift` — UploadAttemptResult enum; exponential backoff loop; _uploadErrorState property; performRequest returns UploadAttemptResult; publishStatus includes uploadErrorState
- `GooseSwift/GooseSwiftApp.swift` — @UIApplicationDelegateAdaptor(GooseAppDelegate.self) added
- `GooseSwift.xcodeproj/project.pbxproj` — Four entries for GooseAppDelegate.swift

## Decisions Made

- apnsDeviceToken is plain var (not private(set)) — private(set) restricts the setter to the declaring file; the setter method is in a separate extension file and must write the property
- APNs gate is soft (warn log, no error state) — absence before registration completes is expected behaviour; uploadErrorState is reserved for server failures
- UploadAttemptResult private enum stays within GooseUploadService.swift — no public API change
- Max 7 total attempts for exponential backoff — 1+2+4+8+16+32+60 = 123s worst case wait before giving up; bounded to prevent battery drain (T-63-02 threat mitigation)
- handleReachabilityChange called from init callback after isNetworkReachable is set — single source of truth for reachability transitions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Relaxed apnsDeviceToken from private(set) to plain var**
- **Found during:** Task 4 (simulator build)
- **Issue:** Plan specified `private(set) var apnsDeviceToken` on GooseAppModel. Swift `private(set)` restricts the setter to the same source file as the declaration (`GooseAppModel.swift`), not to the type. `setAPNSDeviceToken()` in `GooseAppModel+Upload.swift` (a separate file) could not write the property — compiler error: "cannot assign to property: 'apnsDeviceToken' setter is inaccessible"
- **Fix:** Changed to plain `var apnsDeviceToken: String? = nil` (internal access). The property remains read-only to external modules (not public/open); views in the same module can read it via @Observable; only `setAPNSDeviceToken()` writes it.
- **Files modified:** GooseSwift/GooseAppModel.swift
- **Commit:** e082540

## Known Stubs

None — all upload gates, error state, and token storage are wired end-to-end.

## Threat Flags

No new security surface introduced beyond what the plan's threat model covers (T-63-02, T-63-03, T-63-04).

---
## Self-Check: PASSED

- GooseAppDelegate.swift: FOUND
- GooseAppModel+Upload.swift: FOUND
- SUMMARY.md: FOUND
- Commits verified: e082540, fdb6b4c, 1409e1f, 676edc1

*Phase: 63-network-monitor-upload-gating*
*Completed: 2026-06-11*
