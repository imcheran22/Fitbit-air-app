---
phase: 17-observable-migration
plan: "03"
subsystem: ui
tags: [swift, observable, swiftui, observation, corebluetooth, ble]

# Dependency graph
requires:
  - phase: 17-observable-migration/17-02
    provides: HealthDataStore migrated to @Observable; @ObservedObject store sites removed

provides:
  - "@Observable GooseBLEClient (NSObject + @unchecked Sendable preserved)"
  - "Zero @Published in GooseBLEClient.swift and all GooseBLEClient+*.swift"
  - "Zero @ObservedObject GooseBLEClient consumer sites"
  - "MoreView reactive route-status refresh via 3 onChange modifiers (connectionState, hrConnectionState, helloSummary)"
  - "MoreDataStore confirmed Combine-free"

affects:
  - 17-observable-migration/17-04
  - any wave reading GooseBLEClient properties from SwiftUI views

# Tech tracking
tech-stack:
  added: ["Observation framework (import Observation)"]
  patterns:
    - "@Observable + NSObject subclass pattern (GooseBLEClient)"
    - "@Bindable local variable in View.body for bindings to @Observable plain-var parameters"
    - "onChange modifiers as Combine-pipeline replacement for reactive route-status updates"

key-files:
  created: []
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/ConnectionView.swift
    - GooseSwift/DeviceView.swift
    - GooseSwift/FitnessLiveWorkoutViews.swift
    - GooseSwift/FitnessSummaryViews.swift
    - GooseSwift/HRMonitorView.swift
    - GooseSwift/HealthSleepOverviewViews.swift
    - GooseSwift/HealthSleepSheetsViews.swift
    - GooseSwift/LiveActivityContentView.swift
    - GooseSwift/MoreView.swift
    - GooseSwift/OnboardingStepViews.swift
    - GooseSwift/RootView.swift
    - GooseSwift/SleepBridgeViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift

key-decisions:
  - "Used @Bindable local variable in SyncToastHost.body to restore .sheet(item:) binding after @ObservedObject removal"
  - "Added .onChange(of: model.helloSummary) to complete the three reactive triggers that replaced the old Combine MergeMany pipeline"
  - "import Observation added explicitly; Combine import left in place (Wave 4 sweep will flag if unused)"

patterns-established:
  - "@Bindable local: when a View receives an @Observable object as a plain var parameter and needs a binding ($ syntax), declare @Bindable var obj = obj inside body"
  - "Three onChange modifiers (connectionState, hrConnectionState, helloSummary) are the canonical replacement for MoreDataStore.bindRouteStatus Combine pipeline"

requirements-completed: [PERF-03]

# Metrics
duration: 28min
completed: 2026-06-05
---

# Phase 17 Plan 03: GooseBLEClient @Observable Migration (Wave 3) Summary

**GooseBLEClient migrated to @Observable macro — 68 @Published removed, 21 @ObservedObject sites cleared, NSObject + @unchecked Sendable preserved, MoreView reactive route-status complete with 3 onChange modifiers**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-06-05T19:00:00Z
- **Completed:** 2026-06-05T19:28:41Z
- **Tasks:** 3 (+ 1 Rule 1 auto-fix)
- **Files modified:** 14

## Accomplishments

- Added `@Observable` macro to `GooseBLEClient` class declaration; removed `ObservableObject` conformance; added `import Observation`
- Removed all 68 `@Published` annotations from `GooseBLEClient.swift` (properties `bluetoothState` through `debugCommandSnapshotPath`)
- Confirmed zero `@Published` across all 11 GooseBLEClient extension files
- Removed `@ObservedObject` wrapper from all 21 GooseBLEClient consumer sites across 12 view files
- Added `@Bindable` local variable in `SyncToastHost.body` to restore `$ble.syncFailureSheet` binding (Rule 1 fix)
- Confirmed `MoreDataStore` is Combine-free (no `bleStatusCancellables`, `AnyCancellable`, `bindRouteStatus`, or `.$` syntax)
- Added `.onChange(of: model.helloSummary)` to MoreView — completing the three reactive triggers that replace the old Combine pipeline
- Build: `BUILD SUCCEEDED` (xcodebuild -sdk iphonesimulator -arch arm64 CODE_SIGNING_ALLOWED=NO)

## Task Commits

All tasks committed atomically in a single commit:

1. **Task 1: Convert GooseBLEClient to @Observable** — included in `934a23c`
2. **Task 2: Finalize MoreDataStore Combine fix + onChange in MoreView** — included in `934a23c`
3. **Task 3: Remove @ObservedObject GooseBLEClient wrappers** — included in `934a23c`

**Task commit:** `934a23c` — `feat(17): migrate GooseBLEClient to @Observable — remove ObservableObject, 68 @Published, 21 @ObservedObject sites (Wave 3)`

## Files Created/Modified

- `GooseSwift/GooseBLEClient.swift` — Class declaration changed to `@Observable final class GooseBLEClient: NSObject, @unchecked Sendable`; 68 `@Published` annotations removed; `import Observation` added
- `GooseSwift/RootView.swift` — `@ObservedObject` removed from `SyncToastHost`; `@Bindable var ble = ble` added inside `body` for `.sheet(item: $ble.syncFailureSheet)` binding
- `GooseSwift/MoreView.swift` — `.onChange(of: model.helloSummary)` added (3rd reactive trigger); prior two onChange modifiers retained
- `GooseSwift/ConnectionView.swift` — `@ObservedObject` removed from `var ble: GooseBLEClient`
- `GooseSwift/DeviceView.swift` — `@ObservedObject` removed from 4 `var ble: GooseBLEClient` declarations
- `GooseSwift/FitnessLiveWorkoutViews.swift` — `@ObservedObject` removed from 2 declarations
- `GooseSwift/FitnessSummaryViews.swift` — `@ObservedObject` removed
- `GooseSwift/HRMonitorView.swift` — `@ObservedObject` removed from 3 declarations
- `GooseSwift/HealthSleepOverviewViews.swift` — `@ObservedObject` removed
- `GooseSwift/HealthSleepSheetsViews.swift` — `@ObservedObject` removed from 2 declarations
- `GooseSwift/LiveActivityContentView.swift` — `@ObservedObject` removed
- `GooseSwift/OnboardingStepViews.swift` — `@ObservedObject` removed from 2 declarations
- `GooseSwift/SleepBridgeViews.swift` — `@ObservedObject` removed from 2 declarations
- `GooseSwift/SleepV2ScheduleViews.swift` — `@ObservedObject` removed

## Decisions Made

- **@Bindable local for binding restoration:** After removing `@ObservedObject`, the `$ble` binding syntax in `SyncToastHost` was no longer valid. Used `@Bindable var ble = ble` inside `body` — the standard Swift @Observable pattern for creating bindings from plain-var parameters. This is the correct approach per Apple Observation documentation.
- **Three onChange modifiers in MoreView:** The plan required `connectionState`, `hrConnectionState`, and `helloSummary`. MoreView already had the first two from Wave 1; added `helloSummary` to complete the set. This matches the original Combine `MergeMany` pipeline's three subscriptions.
- **import Observation kept explicit:** Added as a separate import line; `import Combine` left in MoreDataStore (it has other Combine-unrelated usage potential; Wave 4 will sweep).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored binding after @ObservedObject removal in SyncToastHost**
- **Found during:** Task 3 (Remove @ObservedObject wrappers) — compile error after edit
- **Issue:** `SyncToastHost.body` used `.sheet(item: $ble.syncFailureSheet)` — the `$` binding projector comes from `@ObservedObject`'s wrappedValue. With plain `var ble: GooseBLEClient`, `$ble` no longer exists, causing compiler error `cannot find '$ble' in scope`.
- **Fix:** Added `@Bindable var ble = ble` at the top of `body`. `@Bindable` is the designated Swift Observation pattern for creating bindings from `@Observable` types passed as plain parameters.
- **Files modified:** `GooseSwift/RootView.swift`
- **Verification:** `BUILD SUCCEEDED` after fix
- **Committed in:** `934a23c` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix required for compilation)
**Impact on plan:** The @Bindable fix is the expected migration pattern for views that use `$property` bindings on @Observable types — not scope creep.

## Issues Encountered

None beyond the Rule 1 auto-fix above. The `@Observable` + `NSObject` combination compiled cleanly with no KVO conflicts.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 3 complete: GooseAppModel, HealthDataStore, and GooseBLEClient are all `@Observable`
- Wave 4 (Plan 17-04): Injection sites (GooseSwiftApp, AppShellView), final import sweep, build verification
- The `@ObservedObject` store: MoreDataStore wrappers are out of scope for Phase 17 and remain unchanged
- No runtime concerns: all CoreBluetooth main-thread guards preserved; `@unchecked Sendable` retained

## Known Stubs

None — this plan performs structural refactoring only; no data is stubbed.

## Threat Flags

None — this plan performs no data ingestion, authentication, network communication, or schema changes.

## Self-Check: PASSED

- `GooseSwift/GooseBLEClient.swift` exists: FOUND
- Commit `934a23c` exists: FOUND
- `grep -c "@Published" GooseSwift/GooseBLEClient.swift` = 0: PASS
- `grep -c "@Observable" GooseSwift/GooseBLEClient.swift` = 1: PASS
- `grep -c "ObservableObject" GooseSwift/GooseBLEClient.swift` = 0: PASS
- `grep -rn "@ObservedObject" GooseSwift/ | grep "GooseBLEClient"` = 0 results: PASS
- `grep -c "onChange" GooseSwift/MoreView.swift` = 3: PASS
- BUILD SUCCEEDED: PASS

---
*Phase: 17-observable-migration*
*Completed: 2026-06-05*
