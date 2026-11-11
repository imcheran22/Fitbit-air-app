---
phase: 90-domain-viewmodels
requirement: ARCH-06
validated_at: 2026-06-18
validator: gsd-validate-phase (Nyquist audit)
verdict: PASSED
---

# Phase 90 Validation — ARCH-06 Domain @Observable Objects

## Requirement

ARCH-06: GooseAppModel split into domain @Observable objects: BLEState, SyncState, HealthState;
SwiftUI views observe only the relevant domain object; high-frequency BLE updates at 1Hz no longer
invalidate unrelated views.

## Gaps Audited

| # | Gap | Finding |
|---|-----|---------|
| 1 | Domain types exist as @Observable classes | FILLED |
| 2 | Domain objects owned by GooseAppModel as let properties | FILLED |
| 3 | All 3 injected at scene root via .environment() | FILLED |
| 4 | GooseAppModel itself is @Observable (not ObservableObject) | FILLED |
| 5 | Migrated BLE properties absent from GooseAppModel | FILLED |
| 6 | Migrated Sync properties absent from GooseAppModel | FILLED |
| 7 | Migrated Health properties absent from GooseAppModel | FILLED |
| 8 | View files read BLE properties from @Environment(BLEState.self) | FILLED |
| 9 | View files read Sync properties from @Environment(SyncState.self) | FILLED |
| 10 | View files read Health properties from @Environment(HealthState.self) | FILLED |

## Behavioral Evidence

### Gap 1 — @Observable on all three domain types
```
BLEState.swift:4:    @MainActor @Observable
SyncState.swift:4:   @MainActor @Observable
HealthState.swift:4: @MainActor @Observable
```
All three import `Observation` and carry `@Observable` (not `ObservableObject`). SwiftUI's
per-property dependency tracking is active — only the accessed property triggers view invalidation.

### Gap 2 — Domain objects owned by GooseAppModel
```swift
// GooseAppModel.swift lines 14-16
let bleState = BLEState()
let syncState = SyncState()
let healthState = HealthState()
```
Declared as `let` (stable identity); mutation happens through the objects' own stored properties,
not reassignment.

### Gap 3 — Scene-root injection in GooseSwiftApp
```swift
// GooseSwiftApp.swift lines 38-41
.environment(model)
.environment(model.bleState)
.environment(model.syncState)
.environment(model.healthState)
```
All three domain objects propagate down the full view hierarchy from WindowGroup root.
`.environment(model.healthStore)` and `.environmentObject(...)` follow immediately after — the
injection chain is complete.

### Gap 4 — GooseAppModel is @Observable
```
GooseAppModel.swift:9: @MainActor @Observable
```
GooseAppModel itself uses the new Observation framework. Views that still declare
`@Environment(GooseAppModel.self)` get per-property isolation from GooseAppModel state too — only
the specific properties they read will trigger invalidation.

### Gaps 5-7 — Migrated properties absent from GooseAppModel
Grep for all migrated property names (`var syncPendingRowCount`, `var liveWorkoutStrain`, etc.)
against GooseAppModel.swift returns zero hits. The only `packetImportRevision`-related symbol is
`var packetImportRevisionWorkItem: DispatchWorkItem?` (a private work item, not the UI state
property). No @Published or bare stored properties for migrated state remain in GooseAppModel.

### Gaps 8-10 — Views read from domain objects
Representative sample:

**FitnessLiveWorkoutViews.swift** (1 Hz BLE path — key isolation test):
```swift
@Environment(BLEState.self) private var bleState
// ...
bleState.liveWorkoutStrain  // read from domain object, not model
```

**CoachRouteViews.swift** (alarm state — BLE domain):
```swift
@Environment(BLEState.self) private var bleState
bleState.alarmIsArmed
bleState.scheduledAlarmTime
```

**MoreRemoteServerViews.swift** (sync domain):
```swift
@Environment(SyncState.self) private var syncState
syncState.serverReachable
syncState.pendingBatchCount
syncState.syncPendingRowCount
// ... 9 total SyncState property reads
```

**CoachChatScreen.swift / CoachLocalToolContext.swift** (health domain):
`@Environment(HealthState.self)` injected; `healthState` threaded through tool context build.

**HealthRecoveryStressViews.swift / HealthMetricFamilyStrainViews.swift**:
`@Environment(HealthState.self)` added; `packetImportRevision` reads from `healthState`.

Grep for bare `model.<migrated-property>` reads in all non-GooseAppModel Swift files returns
empty for all three domains (BLE, Sync, Health migrated properties).

### Isolation guarantee — why 1 Hz BLE updates do not invalidate unrelated views
With `@Observable`:
- `FitnessLiveWorkoutViews` reads `bleState.liveWorkoutStrain` → subscribes only to that
  property on BLEState.
- `MoreRemoteServerViews` reads `syncState.*` → subscribes only to SyncState properties.
- A 1 Hz update to `bleState.liveWorkoutStrain` does NOT invalidate SyncState views or
  HealthState views because they hold no subscription to BLEState properties.
- This is structurally enforced by `@Observable` per-property tracking — not a runtime claim.

## Deviations from Original Plan (resolved)

| Deviation | Impact | Status |
|-----------|--------|--------|
| CoachLocalToolContext not in 90-04 plan scope | Would have caused compile failure | Auto-fixed (03ea99d) |
| packetImportRevision in HealthRecoveryStressViews / HealthMetricFamilyStrainViews | Rule 1 bug | Auto-fixed (03ea99d) |
| Worktree missing 90-01/02/03 files at start of 90-04 | Merge required | Resolved (59eac9a) |

## Build Verification

Plan 04 SUMMARY records:
```
xcodebuild ... build → ** BUILD SUCCEEDED **
```
Zero errors, zero new warnings at commit 03ea99d.

## Verdict

ARCH-06 is COMPLETE. All structural requirements are met by code evidence. The three domain
@Observable classes exist, are owned by GooseAppModel, are injected at scene root, and views read
exclusively from the relevant domain object for all migrated properties. The 1 Hz BLE isolation
guarantee is structurally enforced by Swift's Observation framework.
