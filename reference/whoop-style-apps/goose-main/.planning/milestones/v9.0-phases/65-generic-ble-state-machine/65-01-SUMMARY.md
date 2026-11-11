---
phase: 65-generic-ble-state-machine
plan: "01"
subsystem: ble
tags: [state-machine, ble, bonding, refactor]
dependency_graph:
  requires: []
  provides: [SM-01]
  affects: [GooseBLEBondingManager, GooseBLETypes]
tech_stack:
  added: []
  patterns:
    - "Generic StateMachine<State: Hashable, Event> value type with closure-based transition table"
    - "DEBUG assertionFailure + RELEASE OSLog error for invalid transitions"
key_files:
  created:
    - GooseSwift/GooseStateMachine.swift
  modified:
    - GooseSwift/GooseBLETypes.swift
    - GooseSwift/GooseBLEBondingManager.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - "GooseBLEBondingState promoted from Equatable to Hashable (required by StateMachine<State: Hashable, Event>; Hashable implies Equatable so no consumer breaks)"
  - "transition(to:) remains total and maps target state to the corresponding GooseBLEBondingEvent before calling machine.handle(); illegal paths are caught by the StateMachine's assert+OSLog without removing the safety net of accepting any target state"
  - "Used UUID pair D1/D2-5F (next available after D1/D2-5E) for GooseStateMachine.swift in project.pbxproj"
metrics:
  duration_minutes: 20
  tasks_completed: 2
  tasks_total: 2
  completed_date: "2026-06-11"
---

# Phase 65 Plan 01: Generic BLE State Machine Summary

Generic `StateMachine<State: Hashable, Event>` struct extracted into `GooseStateMachine.swift`; `GooseBLEBondingManager` migrated onto it internally via a typed event enum and validated transition table, with all public API and 33 `connectionState ==` call sites preserved intact.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add generic StateMachine struct + GooseBLEBondingEvent transition table | ce82401 | GooseStateMachine.swift, GooseBLETypes.swift |
| 2 | Wire new file into pbxproj and refactor GooseBLEBondingManager onto StateMachine | 6547f42 | project.pbxproj, GooseBLEBondingManager.swift, GooseBLETypes.swift |

## What Was Built

### GooseStateMachine.swift (new)

`struct StateMachine<State: Hashable, Event>` — a minimal value type holding a `private(set) var state: State` and a `transitions: (State, Event) -> State?` closure. The `mutating func handle(_ event: Event) -> Bool` method calls the closure; on `nil` (invalid transition) it fires `assertionFailure` in DEBUG and always logs via `Logger(subsystem: "com.goose.swift", category: "ble")` at `.error` level, then returns `false`. On a valid next state it assigns `state` and returns `true`.

### GooseBLETypes.swift (modified)

Added `enum GooseBLEBondingEvent` with cases `start`, `subscribe`, `complete(deviceID: UUID)`, `cancel(reason: String)`, `reset`. Added `func gooseBLEBondingTransition(_ state:, _ event:) -> GooseBLEBondingState?` encoding the legal bonding graph (notStarted→start→started, started→subscribe→subscribed, subscribed→complete→completed; reset/cancel legal from any state; all other pairs return nil). `GooseBLEBondingState` promoted from `Equatable` to `Hashable`.

### GooseBLEBondingManager.swift (refactored)

`private var machine: StateMachine<GooseBLEBondingState, GooseBLEBondingEvent>` initialised from persisted state. `bondingState` is now a computed property (`{ machine.state }`) retaining `private(set)` semantics. `transition(to:)` maps the target state to its corresponding event via the private helper `event(for:)` and calls `machine.handle(_:)`; the guard for no-op same-state transitions, `persistState()`, and `onBondingStateChange` dispatch remain identical.

### project.pbxproj (modified)

Four parallel entries added for `GooseStateMachine.swift` using UUID pair `D1000000000000000000005F` / `D2000000000000000000005F`: PBXBuildFile, PBXFileReference, PBXGroup children, PBXSourcesBuildPhase files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GooseBLEBondingState promoted from Equatable to Hashable**
- **Found during:** Task 2 (first build attempt)
- **Issue:** `struct StateMachine<State: Hashable, Event>` requires `State: Hashable`; `GooseBLEBondingState` was only `Equatable`. Swift synthesises `Hashable` for enums with Hashable associated values (`UUID` and `String` are both Hashable), so the promotion has no semantic effect on consumers — all `==` comparisons and pattern matches still work identically.
- **Fix:** Changed conformance declaration from `Equatable` to `Hashable` in GooseBLETypes.swift.
- **Files modified:** GooseSwift/GooseBLETypes.swift
- **Commit:** 6547f42

## Verification Results

- `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO` — **BUILD SUCCEEDED**
- `grep -c "connectionState ==" GooseSwift/` — **33** (unchanged)
- `grep -rn "bondingManager.transition(to:" GooseSwift/` — **8 call sites** all unmodified (Commands.swift:744, 1038, 1045; CentralDelegate.swift:49, 53, 96, 216, 293)
- `grep -n "GooseStateMachine" project.pbxproj` — **4 entries** (PBXBuildFile, PBXFileReference, PBXGroup, PBXSourcesBuildPhase)

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The StateMachine is a pure in-memory value type. Threat register items T-65-01 and T-65-02 are fully mitigated:
- T-65-01: invalid transitions return nil → assertionFailure(DEBUG) + OSLog error(RELEASE); state not corrupted.
- T-65-02: existing main-thread-only contract preserved verbatim.

## Known Stubs

None.

## Self-Check: PASSED

- GooseSwift/GooseStateMachine.swift — FOUND
- GooseSwift/GooseBLETypes.swift (contains GooseBLEBondingEvent) — FOUND
- GooseSwift/GooseBLEBondingManager.swift (contains StateMachine<GooseBLEBondingState) — FOUND
- Commit ce82401 — FOUND
- Commit 6547f42 — FOUND
