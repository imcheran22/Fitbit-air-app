---
phase: "121"
plan: "121-01"
subsystem: swift-ui
tags: [body-composition, healthkit, sparkline, coregraphics, observable]
status: complete
requirements: [BODY-02, BODY-03]
commit: d4ac8f1

dependency_graph:
  requires: [BODY-01 (Phase 116 Rust bridge)]
  provides: [HealthBodyCompositionSection, BodyCompositionEntrySheet, HealthDataStore+BodyComposition]
  affects: [HealthView, HealthDataStore, HealthDataStore+Sleep]

tech_stack:
  added:
    - HealthDataStore+BodyComposition.swift (new extension: BodyCompositionRow, load/upsert/import)
    - BodyCompositionEntrySheet.swift (new SwiftUI sheet: manual weight/BF%/muscle entry)
    - HealthBodyCompositionSection.swift (new section card: CoreGraphics sparkline, HK import)
  patterns:
    - HKSampleQuery one-shot canonical pattern (continuation.resume exactly once per query)
    - bridge.requestValueAsync for bare-array bridge results (not requestAsync)
    - @Observable stored property pattern (plain var on base class, not @Published)
    - CoreGraphics Path sparkline with y-axis inversion formula

key_files:
  created:
    - GooseSwift/HealthDataStore+BodyComposition.swift
    - GooseSwift/BodyCompositionEntrySheet.swift
    - GooseSwift/HealthBodyCompositionSection.swift
  modified:
    - GooseSwift/HealthDataStore+Sleep.swift (hkDateFormatter private -> internal)
    - GooseSwift/HealthDataStore.swift (bodyCompositionHistory + importState stored vars)
    - GooseSwift/HealthView.swift (section insertion + onAppear load call)
    - GooseSwift.xcodeproj/project.pbxproj (3 files × 4 locations = 12 UUID entries)

decisions:
  - D-04: Bridge always receives kg; display converts to lbs only when stored UnitSystem is .imperial
  - D-05: CoreGraphics Path sparkline (import Charts causes linker error — Charts not linked)
  - D-06: bodyCompositionHistory as plain stored var on base class (extensions cannot add stored props)
  - F-03: hkDateFormatter changed to internal so HealthDataStore+BodyComposition.swift can access it
  - F-04: requestValueAsync (not requestAsync) — history_between returns bare array [[...]], not object
  - N-02: HKSampleQuery is one-shot; canonical pattern resumes continuation once in completion handler
  - N-03: importBodyCompositionFromHealthKit() is non-throwing; sets importState enum for UI

metrics:
  duration: "7 minutes"
  completed: "2026-06-27"
  tasks_completed: 4
  files_created: 3
  files_modified: 4
---

# Phase 121 Plan 01: Body Composition UI + HealthKit Import Summary

**One-liner:** SwiftUI Health tab section with CoreGraphics weight sparkline, manual entry sheet, and HealthKit bodyMass+bodyFatPercentage import via @Observable importState enum.

## What Was Built

- **HealthDataStore+BodyComposition.swift** — `BodyCompositionRow` struct (failable init from `[String: Any]`); `loadBodyCompositionHistory()` using `bridge.requestValueAsync` to handle bare-array result; `upsertBodyComposition()` with input validation before bridge call; `importBodyCompositionFromHealthKit()` as non-throwing async with `ImportState` transitions
- **BodyCompositionEntrySheet.swift** — SwiftUI Form with weight/BF%/muscle fields; uses `@AppStorage(OnboardingStorage.unitSystem)` for unit system preference; converts weight from lbs to kg before passing to bridge; dismisses on successful upsert
- **HealthBodyCompositionSection.swift** — Health tab card with last-logged weight display (unit-converted), inline `WeightSparklineView` using `GeometryReader + Path` (CoreGraphics only), action buttons for Log and Import from Health, inline error display from `healthStore.importState`

## Verification Results

All plan verification checks passed:

| Check | Result |
|-------|--------|
| `hkDateFormatter` not private | PASS |
| `bodyCompositionHistory` in base class | PASS |
| `requestValueAsync` used for history | PASS |
| No `import Charts` | PASS |
| No `Locale.current.measurementSystem` | PASS |
| y-inversion formula present | PASS |
| `HealthBodyCompositionSection` in HealthView | PASS |
| pbxproj count = 4 (all 3 files) | PASS |
| `toShare: []` (read-only) | PASS |
| `results == nil` absent | PASS |
| `importState` in base class | PASS |
| BUILD SUCCEEDED | PASS |

## Deviations from Plan

None — plan executed exactly as written. The plan's critical executor notes (HKSampleQuery one-shot pattern N-02, requestValueAsync F-04, importState enum N-03, hkDateFormatter access F-03, y-inversion F-05) were all applied as specified.

## Known Stubs

None. The section is fully wired: `loadBodyCompositionHistory()` called on `HealthView.onAppear`, `upsertBodyComposition()` called from entry sheet on confirm, `importBodyCompositionFromHealthKit()` called from section button.

## Threat Surface Scan

No new threat surface beyond what is documented in the plan's threat model (T-121-01 through T-121-08). All mitigations applied:
- T-121-01: Text field input validated (isFinite, range guards) before bridge call
- T-121-02: HK BF% fraction guarded 0.0–1.0 before multiply by 100
- T-121-07: HKSampleQuery one-shot — `cont.resume` called exactly once per query

## Self-Check: PASSED

Files created:
- GooseSwift/HealthDataStore+BodyComposition.swift — found
- GooseSwift/BodyCompositionEntrySheet.swift — found
- GooseSwift/HealthBodyCompositionSection.swift — found

Commit d4ac8f1 — verified in git log.
