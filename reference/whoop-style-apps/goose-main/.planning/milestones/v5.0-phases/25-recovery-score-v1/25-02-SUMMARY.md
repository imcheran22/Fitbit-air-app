---
phase: 25-recovery-score-v1
plan: 02
subsystem: ui
tags: [swift, swiftui, healthdatastore, recovery, ewma, calibrating, colour-band, bridge]

# Dependency graph
requires:
  - phase: 25-recovery-score-v1/25-01
    provides: metrics.goose_recovery_v1 bridge method, ColourBand PT-PT enum, RecoveryV1Output with trust_level and score_0_to_100
provides:
  - RecoveryV1Result Swift struct (score, trustLevel, colourBand, zHRV, zRHR) with bandColor helper
  - HealthDataStore+Recovery.swift extension: runRecoveryV1(), recoveryV1IsCalibrating, recoveryV1TrustLabel
  - recoveryV1Result stored property on HealthDataStore
  - RecoveryV2CalibratingHero view: hourglass + "A calibrar" + "< 4 noites de dados" label
  - Colour-band capsule indicator in RecoveryV2OverviewPage hero (verde/amarelo/vermelho)
  - "Provisório" trust label capsule shown when trust is provisional
affects: [recovery-dashboard, healthdatastore-consumers, coach-summaries]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runRecoveryV1() dispatches bridge call on packetInputQueue then publishes result on @MainActor via DispatchQueue.main.async — mirrors runPacketScores() pattern"
    - "Calibrating state shown as full hero replacement (RecoveryV2CalibratingHero), not overlay, to avoid showing fabricated numeric score (T-25-04 mitigation)"
    - "bandColor computed on RecoveryV1Result — keeps colour logic co-located with the data type, not the view"
    - "recoveryV1Result stored in HealthDataStore base class body (Swift extension cannot add stored properties to @Observable class)"

key-files:
  created:
    - GooseSwift/HealthDataStore+Recovery.swift
  modified:
    - GooseSwift/HealthDataStore.swift
    - GooseSwift/HealthRecoveryStressViews.swift
    - GooseSwift.xcodeproj/project.pbxproj

key-decisions:
  - "runRecoveryV1() sources HRV and RHR from existing preferredDailyRecoveryMetric helpers, falling back to packet reports then HealthKit values — same data chain used by recoveryHRVDisplayText / recoveryRestingHRDisplayText"
  - "device_id passed as 'goose.swift.recovery.v1' sentinel string (bridge expects it for logging; baselines are keyed by date, not device)"
  - "When HRV is unavailable (nil or <= 0), runRecoveryV1() sets recoveryV1Result = nil instead of fabricating a score"
  - "RecoveryV2CalibratingHero replaces SleepV2Hero entirely during calibration — no numeric score shown (T-25-04 mitigated)"
  - "Colour-band capsule and trust label rendered as separate views below SleepV2Hero, not via palette override, to avoid modifying the shared SleepV2Hero component"

patterns-established:
  - "Calibrating state pattern: replace hero view entirely rather than conditionally hiding score text inside a shared component"
  - "Trust-level label pattern: pt-PT string returned as Optional<String> by recoveryV1TrustLabel — nil means no label, not empty string"

requirements-completed: [ALG-REC-03]

# Metrics
duration: 18min
completed: 2026-06-08
---

# Phase 25 Plan 02: Recovery Score V1 Swift Integration Summary

**Swift extension + dashboard update wiring goose_recovery_v1 EWMA recovery score into RecoveryV2OverviewPage with "A calibrar" calibrating state and colour-band indicator**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-08T10:30:00Z
- **Completed:** 2026-06-08T10:48:00Z
- **Tasks:** 2 (Task 3 is checkpoint — human UI verification pending)
- **Files modified:** 4

## Accomplishments

- Created `HealthDataStore+Recovery.swift`: `RecoveryV1Result` struct, `bandColor` colour mapping (Verde→green, Amarelo→orange, Vermelho→red), `runRecoveryV1()` bridge call on background queue publishing on `@MainActor`, `recoveryV1IsCalibrating` and `recoveryV1TrustLabel` helpers with pt-PT labels
- Added `var recoveryV1Result: RecoveryV1Result?` to `HealthDataStore` base class (extensions cannot add stored properties to `@Observable` classes)
- Registered `HealthDataStore+Recovery.swift` in the Xcode project with 4 `project.pbxproj` entries (PBXBuildFile, PBXFileReference, group, Sources phase)
- Updated `RecoveryV2OverviewPage` to show `RecoveryV2CalibratingHero` (hourglass + "A calibrar" + "< 4 noites de dados") when calibrating, and a colour-band capsule + "Provisório" trust label when not calibrating
- `xcodebuild` clean build succeeded for iOS Simulator target with no new errors or warnings

## Task Commits

1. **Task 1: HealthDataStore+Recovery.swift — recoveryV1Result + bridge call** - `35c629b` (feat)
2. **Task 2: RecoveryV2OverviewPage — "A calibrar" state + colour band indicator** - `397d16a` (feat)

## Files Created/Modified

- `/Users/francisco/Documents/goose/GooseSwift/HealthDataStore+Recovery.swift` - New extension: RecoveryV1Result struct, bandColor, runRecoveryV1(), recoveryV1IsCalibrating, recoveryV1TrustLabel
- `/Users/francisco/Documents/goose/GooseSwift/HealthDataStore.swift` - Added `var recoveryV1Result: RecoveryV1Result?` stored property to base class
- `/Users/francisco/Documents/goose/GooseSwift/HealthRecoveryStressViews.swift` - Updated RecoveryV2OverviewPage (calibrating hero, colour band, trust label, runRecoveryV1 calls); added RecoveryV2CalibratingHero struct
- `/Users/francisco/Documents/goose/GooseSwift.xcodeproj/project.pbxproj` - 4 entries for HealthDataStore+Recovery.swift (IDs: C1000000000000000000010B, C2000000000000000000010B)

## Decisions Made

- `device_id` passed as the sentinel `"goose.swift.recovery.v1"` — the Rust baseline is keyed by `date_key`, not device ID, so this sentinel is stable and safe
- HRV sourced from `preferredDailyRecoveryMetric(valueKey: "hrv_rmssd_ms")` → packet report `rmssd_ms` → `hkHRVSDNNMs` (same fallback chain as the display text functions)
- RHR fallback to 55.0 bpm (population default) when no measured RHR is available, rather than returning nil — allows the bridge to compute a partial score
- Colour band and trust label are overlaid below the existing `SleepV2Hero` (not by modifying `SleepV2Hero`), keeping the shared component unchanged

## Deviations from Plan

None — plan executed exactly as written. The only structural decision was adding the `recoveryV1Result` stored property to the base class (required by Swift's `@Observable` constraint — noted in the plan as "Claude's Discretion").

## Issues Encountered

None — build succeeded on first attempt.

## Known Stubs

None — `runRecoveryV1()` reads real HRV/RHR values from existing packet reports and HealthKit data. The bridge call invokes the real `goose_recovery_v1` Rust function (Phase 25-01). No placeholder data flows to the UI.

## Threat Flags

No new threat surface. The bridge call follows T-25-03 mitigation: dispatched off `@MainActor` on `packetInputQueue`, result published back via `DispatchQueue.main.async`. T-25-04 mitigation applied: calibrating state shows "A calibrar" with no fabricated numeric score.

## Next Phase Readiness

- Human UI verification (Task 3 checkpoint) is the remaining gate for ALG-REC-03
- After approval, RecoveryV2OverviewPage is fully wired to the personal-baseline EWMA recovery score
- No blockers — `runRecoveryV1()` gracefully handles nil HRV/RHR with no crash

---
*Phase: 25-recovery-score-v1*
*Completed: 2026-06-08*
