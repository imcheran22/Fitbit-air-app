---
phase: "97"
plan: "04"
subsystem: "MoreView / GooseAppModel"
tags: ["healthkit", "toggle", "appstorage", "swift"]
status: complete

requires:
  - "97-CONTEXT.md decisions D-04, D-08, D-09"
provides:
  - "@AppStorage('goose.healthkit.export.enabled') opt-in toggle in MoreView"
  - "GooseAppModel.enableHealthKitExport() stub (replaced by 97-03)"
affects:
  - "GooseSwift/MoreView.swift"
  - "GooseSwift/GooseAppModel+HealthKitExport.swift"

tech-stack:
  added:
    - "@AppStorage persisted UserDefaults key goose.healthkit.export.enabled"
    - "HKHealthStore.isHealthDataAvailable() guard on toggle visibility"
  patterns:
    - "onChange(of:) fires only when newValue == true (D-09 pattern)"
    - "Stub extension file replaced by later plan"

key-files:
  modified:
    - "GooseSwift/MoreView.swift"
    - "GooseSwift.xcodeproj/project.pbxproj"
  created:
    - "GooseSwift/GooseAppModel+HealthKitExport.swift"

decisions:
  - "D-08: @AppStorage key 'goose.healthkit.export.enabled' default false in MoreView"
  - "D-09: onChange only fires when newValue == true — toggling off does not re-request auth"
  - "Stub added in separate extension file GooseAppModel+HealthKitExport.swift (not inline in MoreView) for clean separation of concerns"

metrics:
  duration: "~10 minutes"
  completed: "2026-06-20T15:47:41Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 2
---

# Phase 97 Plan 04: More Settings Toggle + Write Gating Summary

**One-liner:** HealthKit export opt-in toggle with @AppStorage persistence and HKHealthStore availability guard wired to GooseAppModel stub.

## What Was Built

Added the HealthKit export toggle to `MoreView` Section("Apple Health") per decisions D-08, D-09, and HK-05 requirement:

- `@AppStorage("goose.healthkit.export.enabled") private var hkExportEnabled = false` — persists the user opt-in across launches, default off
- Toggle "Export WHOOP data to Health" with `Label(..., systemImage: "heart.text.clipboard")` inside `if HKHealthStore.isHealthDataAvailable()` — hidden on simulator and iPad without Health
- `onChange(of: hkExportEnabled)` fires `Task { await model.enableHealthKitExport() }` **only when `newValue == true`** — toggling off does not re-request authorization (per D-09, mitigates T-97-04)
- `GooseAppModel+HealthKitExport.swift` stub (`func enableHealthKitExport() async {}`) satisfies the call site until plan 97-03 delivers the full implementation

All changes registered in `project.pbxproj` at 4 locations (PBXBuildFile, PBXFileReference, PBXGroup, PBXSourcesBuildPhase). Build verified: **BUILD SUCCEEDED** on iPhone 17 Pro simulator.

## Commits

| Hash | Message |
|------|---------|
| a9facfd | feat(97-04): add HK export toggle to MoreView Section Apple Health |

## Deviations from Plan

None — plan executed exactly as written.

The stub was placed in a dedicated extension file (`GooseAppModel+HealthKitExport.swift`) rather than inline in `MoreView.swift` — this is consistent with the codebase convention of one concern per extension file and makes the 97-03 replacement straightforward.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Toggle visibility is correctly gated by `HKHealthStore.isHealthDataAvailable()` (T-97-05 mitigated). `onChange` only fires on `newValue == true` (T-97-04 mitigated).

## Self-Check: PASSED

- [x] `GooseSwift/MoreView.swift` modified — @AppStorage property + Toggle in Section("Apple Health")
- [x] `GooseSwift/GooseAppModel+HealthKitExport.swift` created — stub method
- [x] `GooseSwift.xcodeproj/project.pbxproj` updated — 4 entries verified (`grep -c` == 4)
- [x] Commit `a9facfd` exists in git log
- [x] BUILD SUCCEEDED on iPhone 17 Pro simulator
