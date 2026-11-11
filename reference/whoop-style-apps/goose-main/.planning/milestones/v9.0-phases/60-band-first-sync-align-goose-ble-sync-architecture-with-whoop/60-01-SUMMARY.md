---
phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
plan: "01"
subsystem: ios-app
tags: [overnight-guard-removal, dead-code, refactor]
dependency_graph:
  requires: []
  provides: [overnight-guard-deleted, gooseappmodel-overnight-clean]
  affects: [GooseAppModel, HealthPacketCaptureTypes]
tech_stack:
  added: []
  patterns: [atomic-deletion-wave]
key_files:
  created: []
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/HealthPacketCaptureTypes.swift
    - GooseSwift.xcodeproj/project.pbxproj
  deleted:
    - GooseSwift/GooseAppModel+OvernightRun.swift
    - GooseSwift/GooseAppModel+OvernightState.swift
    - GooseSwift/GooseAppModel+OvernightRecovery.swift
decisions:
  - "D-01: Remove overnight guard files entirely (not deprecated/flagged)"
  - "D-04: Retain OvernightSQLiteMirrorQueue as dormant property with no callers"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  files_changed: 5
  lines_deleted: 2239
  completed_date: "2026-06-11"
---

# Phase 60 Plan 01: Delete Overnight Guard Subsystem Core — Summary

**One-liner:** Deleted 1,904 lines of overnight BLE polling code (3 extension files + 64 GooseAppModel references + 5 type definitions) as atomic deletion core for band-first sync migration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Delete the three overnight extension files | 8666337 | GooseAppModel+OvernightRun.swift, GooseAppModel+OvernightState.swift, GooseAppModel+OvernightRecovery.swift, project.pbxproj |
| 2 | Strip all overnight state from GooseAppModel.swift | df463a8 | GooseAppModel.swift |
| 3 | Remove the five overnight struct types from HealthPacketCaptureTypes.swift | 9e27d1a | HealthPacketCaptureTypes.swift |

## What Was Done

### Task 1 — Delete three overnight extension files

Removed from disk and from `GooseSwift.xcodeproj/project.pbxproj` (PBXBuildFile, PBXFileReference, PBXGroup children, PBXSourcesBuildPhase entries):

- `GooseAppModel+OvernightRun.swift` — 815 lines of overnight guard runtime methods
- `GooseAppModel+OvernightState.swift` — 404 lines of overnight state helpers
- `GooseAppModel+OvernightRecovery.swift` — 685 lines of recovery, export, and static utilities

`OvernightSQLiteMirrorQueue.swift` and `OvernightRawNotificationSpool.swift` were retained per D-04.

### Task 2 — Strip GooseAppModel.swift

Removed from `GooseAppModel.swift`:
- 25 observable `var overnightGuard*` properties
- `overnightRawSpool` stored property (D-03)
- 20 private `overnightGuard*` stored vars
- 10 `overnightGuard*` static let constants
- `ble.onRawNotificationWithContext` callback (called `persistOvernightRawNotificationBeforeInterpretation`)
- `ble.onCommandWrite` callback (called `persistOvernightCommandWrite`)
- `ble.onMessage` callback (called `persistOvernightEventLog`)
- deinit cleanup for overnight work items and raw spool
- `recoverUncleanOvernightGuardSessionIfNeeded()` init call

Retained per D-04: `let overnightSQLiteMirror = OvernightSQLiteMirrorQueue(...)` (dormant, no callers).

### Task 3 — Remove HealthPacketCaptureTypes.swift overnight structs

Removed all five overnight struct definitions:
- `OvernightGuardSession`
- `OvernightGuardRecoveredSession`
- `OvernightGuardTargetCounts`
- `OvernightGuardHistoricalOrderEvidence`
- `OvernightGuardHistoricalPacketSample`

`OvernightRawSpoolSnapshot` and `OvernightPowerState` were not touched — they are defined in `OvernightRawNotificationSpool.swift` (retained per D-04).

## Verification Results

All success criteria passed:

- `test ! -f GooseSwift/GooseAppModel+OvernightRun.swift` — PASS
- `test ! -f GooseSwift/GooseAppModel+OvernightState.swift` — PASS
- `test ! -f GooseSwift/GooseAppModel+OvernightRecovery.swift` — PASS
- `grep -v '^[[:space:]]*//' GooseAppModel.swift | grep -c overnightGuard` — returns 0
- `grep -c "struct OvernightGuard" HealthPacketCaptureTypes.swift` — returns 0
- `grep -c "let overnightSQLiteMirror" GooseAppModel.swift` — returns 1
- No references to deleted files remain in `project.pbxproj`
- No retained Swift file references the five deleted struct types

## Build Status Note

As documented in the plan, the project build is NOT expected to compile after plan 60-01 in isolation. Secondary call sites in other files (Lifecycle.swift, NotificationPipeline.swift, MoreCaptureViews.swift, CoachLocalToolContext.swift, CodexCoachSupport.swift, LocalizedStatusStrings.swift, GooseAppModel+ActivityTimeline.swift) still reference removed symbols. These are cleaned in plan 60-03. Plan 60-01 is the deletion core of an atomic removal that completes in wave 2.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan only deletes code; no stubs introduced.

## Threat Flags

None. This plan only removes code; no new trust boundaries or network endpoints introduced.

## Self-Check

- [x] 3 overnight files deleted from disk — confirmed
- [x] project.pbxproj updated — confirmed (0 references to deleted files)
- [x] GooseAppModel.swift — 0 overnightGuard references, 1 overnightSQLiteMirror — confirmed
- [x] HealthPacketCaptureTypes.swift — 0 struct OvernightGuard — confirmed
- [x] Commits exist: 8666337, df463a8, 9e27d1a — confirmed via git log

## Self-Check: PASSED
