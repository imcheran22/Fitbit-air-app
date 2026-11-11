---
phase: 64-hr-data-sanitizer
plan: "01"
subsystem: ios-ble-vitals
tags: [hr-sanitizer, ble, vitals, debug]
dependency_graph:
  requires: []
  provides: [GooseHRSanitizer, hrSpikeCount]
  affects: [GooseBLEClient, GooseAppModel, MoreDebugViews]
tech_stack:
  added: []
  patterns: [static-value-type-filter, callback-actor-hop, observable-debug-counter]
key_files:
  created:
    - GooseSwift/GooseHRSanitizer.swift
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+VitalsAndLogging.swift
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/MoreDebugViews.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - "UUID E100000000000000000000D / E200000000000000000000D used for GooseHRSanitizer.swift in pbxproj (000C was already taken by GooseAppDelegate)"
  - "onHRSpike callback signature is ((Int, String) -> Void)? matching onLiveHeartRate convention"
  - "WHOOP parity range is 25-220 BPM, stricter than the pre-existing 20-240 literal"
metrics:
  duration: "158s"
  completed: "2026-06-11"
  tasks_completed: 4
  files_changed: 6
---

# Phase 64 Plan 01: HR Data Sanitizer Summary

HR spike filter (GooseHRSanitizer) added as a zero-dependency Swift value type, gating recordLiveHeartRate against the WHOOP-parity valid range (25-220 BPM) with OSLog logging, a debug counter, and a More > Debug section.

## What Was Built

- `GooseHRSanitizer` struct with `static let minValidBPM = 25`, `static let maxValidBPM = 220`, `static var validRange`, and `static func sanitize(_ bpm: Int) -> Int?`
- `recordLiveHeartRate` now gates on `GooseHRSanitizer.sanitize(bpm) != nil`; the old `(20...240)` literal is gone
- Rejected samples log `heart_rate.spike_rejected` via the existing `record(level: .warn...)` path and call `onHRSpike?(bpm, source)`
- `var onHRSpike: ((Int, String) -> Void)?` added to `GooseBLEClient` alongside `onLiveHeartRate` and `onHRVSample`
- `private(set) var hrSpikeCount: Int = 0` on `GooseAppModel`; incremented on `@MainActor` via `Task { @MainActor in self?.hrSpikeCount += 1 }` inside `ble.onHRSpike`
- `Section("HR Sanitizer")` with a `Spikes Filtered` row added to `MoreDebugViews`
- File registered in `project.pbxproj` in all four required locations (PBXBuildFile, PBXFileReference, group children, Sources build phase) with UUID `E.00000000000000000000D`
- `xcodebuild` build succeeded for the GooseSwift scheme targeting iOS Simulator

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create GooseHRSanitizer value type | 95f9ecd | GooseHRSanitizer.swift, project.pbxproj |
| 2 | Gate recordLiveHeartRate through sanitizer + onHRSpike | 7df974c | GooseBLEClient.swift, GooseBLEClient+VitalsAndLogging.swift |
| 3 | Wire hrSpikeCount + More > Debug display | 5e3dce5 | GooseAppModel.swift, MoreDebugViews.swift |
| 4 | Build verification (iOS Simulator) | — | BUILD SUCCEEDED — no commit needed |

## Deviations from Plan

### Minor

**[Rule 1 - Wiring] UUID 000D used instead of 000C**
- **Found during:** Task 1
- **Issue:** `000C` was already allocated to `GooseAppDelegate.swift` in the pbxproj. The plan text referenced it as the next available slot but the file had since been added.
- **Fix:** Used `E100000000000000000000D` / `E200000000000000000000D` (next free slot).
- **Files modified:** GooseSwift.xcodeproj/project.pbxproj

**[Rule 1 - Wiring] Task 4 produced no new commit**
- **Found during:** Task 4
- **Issue:** Build verification produced no staged changes (pbxproj was already committed in Task 1). An empty commit would add noise.
- **Fix:** Skipped the Task 4 commit; build success is documented here.

## Known Stubs

None — all thresholds are wired to live constants; the debug counter is bound to a real @Observable property.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The sanitizer closes threat T-64-01 (untrusted BLE HR values reaching UI/algorithms).

## Self-Check: PASSED

- GooseSwift/GooseHRSanitizer.swift: exists
- GooseSwift/GooseBLEClient.swift: var onHRSpike declared
- GooseSwift/GooseBLEClient+VitalsAndLogging.swift: GooseHRSanitizer.sanitize gating recordLiveHeartRate, old literal removed
- GooseSwift/GooseAppModel.swift: hrSpikeCount + ble.onHRSpike handler
- GooseSwift/MoreDebugViews.swift: HR Sanitizer section
- project.pbxproj: GooseHRSanitizer.swift appears 4 times
- Commits: 95f9ecd, 7df974c, 5e3dce5
- xcodebuild: BUILD SUCCEEDED
