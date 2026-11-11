---
phase: 89-ble-actor-refactor
plan: "03"
subsystem: ios-ble
tags:
  - swift
  - ble
  - refactor
  - device-catalog
dependency_graph:
  requires:
    - 89-01
  provides:
    - DeviceCatalog struct (centralised Gen4/Gen5 branching)
  affects:
    - CoreBluetoothBLETransport+HistoricalCommands.swift
    - CoreBluetoothBLETransport+DebugAndSync.swift
    - CoreBluetoothBLETransport+Parsing.swift
    - CoreBluetoothBLETransport+HistoricalHandlers.swift
tech_stack:
  added:
    - DeviceCatalog value-type struct
  patterns:
    - Capability-query centralisation via value-type wrapper
key_files:
  created:
    - GooseSwift/DeviceCatalog.swift
  modified:
    - GooseSwift/CoreBluetoothBLETransport+HistoricalCommands.swift
    - GooseSwift/CoreBluetoothBLETransport+DebugAndSync.swift
    - GooseSwift/CoreBluetoothBLETransport+Parsing.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - DeviceCatalog is a struct (value type) wrapping optional DeviceCapabilities
  - nil capabilities return Gen5 defaults matching prior optional-chain behaviour
  - catalog bindings are local let inside each function scope, not stored properties
  - switch on catalog.capabilities?.wireProtocol retained for detailed protocol dispatch (frames/payload)
metrics:
  duration: "~20 minutes"
  completed: "2026-06-18"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 5
---

# Phase 89 Plan 03: DeviceCatalog — Centralise Gen4/Gen5 Capability Branching

**One-liner:** DeviceCatalog struct replaces 14 scattered `connectedCapabilities?.historicalSync/wireProtocol` guard patterns across 4 CoreBluetoothBLETransport extension files with typed computed property queries.

## What Was Built

Created `GooseSwift/DeviceCatalog.swift` — a value-type struct that wraps `DeviceCapabilities?` and exposes five computed properties:

- `usesPageSequenceSync: Bool` — replaces `connectedCapabilities?.historicalSync == .pageSequence`
- `isGen4: Bool` — replaces `connectedCapabilities?.wireProtocol == .gen4`
- `generationLabel: String` — replaces `connectedCapabilities.map { $0.wireProtocol == .gen4 ? "gen4" : "gen5" } ?? "unknown"`
- `historicalRetryLabel: String` — replaces inline ternary for sync retry log strings
- `historicalDeviceType: String` — replaces `switch connectedCapabilities?.historicalSync { case .pageSequence: "GEN4" }` (now also uses `capabilities?.wireProtocol.bridgeString ?? "GOOSE"` for the non-gen4 path)

Updated 4 extension files replacing all 14 raw capability guard occurrences with `DeviceCatalog` queries. Also added `DeviceCatalog.swift` to the Xcode project (PBXBuildFile + PBXFileReference + group + Sources build phase).

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Create DeviceCatalog struct | Done | bf524cf |
| 2 | Replace scattered capability guards | Done | efb833d |

## Verification

```
grep -rn "connectedCapabilities?.historicalSync|connectedCapabilities?.wireProtocol" \
  GooseSwift/CoreBluetoothBLETransport+{HistoricalCommands,DebugAndSync,Parsing,HistoricalHandlers}.swift
```
Result: 0 matches.

iOS build: BUILD SUCCEEDED (iPhone 17 Pro simulator, CODE_SIGNING_ALLOWED=NO).

## Deviations from Plan

**1. [Rule 2 - Missing] Added DeviceCatalog.swift to xcodeproj**
- **Found during:** Task 2 build
- **Issue:** Build failed with "cannot find 'DeviceCatalog' in scope" — DeviceCatalog.swift was not referenced in GooseSwift.xcodeproj
- **Fix:** Added PBXBuildFile, PBXFileReference, group children entry, and Sources build phase entry for DeviceCatalog.swift
- **Files modified:** GooseSwift.xcodeproj/project.pbxproj
- **Commit:** efb833d

**2. [Rule 1 - Bug] Replaced additional guard occurrences not listed in plan**
- **Found during:** Task 2
- **Issue:** Plan listed guards at specific lines but the success criteria required zero raw patterns; HistoricalHandlers.swift had 5 occurrences (lines 80, 453, 567, 593, 672) vs the plan's listing of only line 80-81
- **Fix:** Replaced all 5 occurrences in HistoricalHandlers using `catalog` bindings scoped to each function
- **Commits:** efb833d

**3. [Rule 3 - Adaptation] Worktree lacked CoreBluetoothBLETransport files**
- **Found during:** Task 2 start
- **Issue:** Worktree was branched before 89-01 merge; had GooseBLEClient+*.swift not CoreBluetoothBLETransport+*.swift
- **Fix:** Merged `gsd/v12.0-milestone` into the worktree branch (clean merge, no conflicts) to obtain the renamed files
- **Result:** Merge commit a68f8de; all subsequent work applied to CoreBluetoothBLETransport+*.swift as intended by plan

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- GooseSwift/DeviceCatalog.swift: FOUND
- struct DeviceCatalog: FOUND (1 occurrence)
- Zero raw guards in 4 extension files: VERIFIED
- Commits bf524cf, efb833d: FOUND in git log
- iOS build: BUILD SUCCEEDED
