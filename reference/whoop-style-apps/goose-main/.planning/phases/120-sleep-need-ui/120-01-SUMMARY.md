---
phase: "120"
plan: "120-01"
subsystem: "sleep-ui"
status: complete
tags: [sleep, dynamic-sleep-need, bridge, swiftui, observable]
completed: "2026-06-27"
duration_seconds: 964

dependency_graph:
  requires: ["Phase 114 — sleep.compute_need Rust bridge"]
  provides: ["dynamicSleepNeed property on HealthDataStore", "SleepV2SleepNeededSheet dynamic label", "SleepV2SleepWindowCard dynamic value", "SleepV2ClockDial dynamic value"]
  affects: ["sleep score accuracy via 450.0 fallback", "recovery score via corrected sleep_need_minutes"]

tech_stack:
  added: []
  patterns:
    - "@Observable stored property extension pattern (plain var in base class body)"
    - "bridge.requestAsync with conditional arg omission for nil age_years"
    - "@Environment(HealthDataStore.self) on sheet structs"
    - ".task { await healthStore.runDynamicSleepNeed() } for sheet self-loading"

key_files:
  created: []
  modified:
    - GooseSwift/HealthDataStore.swift
    - GooseSwift/HealthDataStore+Sleep.swift
    - GooseSwift/HealthDataStore+Snapshots.swift
    - GooseSwift/HealthDataStore+Utilities.swift
    - GooseSwift/HealthSleepSheetsViews.swift
    - GooseSwift/SleepV2ScheduleViews.swift
    - GooseSwift/HealthSleepOverviewViews.swift

decisions:
  - "DynamicSleepNeed struct declared in HealthDataStore+Sleep.swift before the extension block — top-level struct, not nested"
  - "age_years key omitted entirely from bridgeArgs when nil — not passed as null — so Rust serde default kicks in"
  - "prior_strain omitted per D-03 — Rust defaults to nil adjustment"
  - "SleepV2ClockDial needed its own @Environment(HealthDataStore.self) injection and sleepNeedDisplayText property — it is a separate struct from SleepV2SleepWindowCard"
  - "Fallback updated from 480.0 to 450.0 at all four sites — aligns with Phase 114 D-03 (age-nil bracket = 7.5h = 450 min)"

metrics:
  tasks_completed: 3
  tasks_total: 3
  files_modified: 7
  commits: 3
---

# Phase 120 Plan 01: Sleep Need UI Summary

Dynamic sleep need label "Xh Ym recommended tonight" + breakdown row wired from sleep.compute_need Rust bridge into the Sleep dashboard, replacing all static 480.0/7h39m hardcoded values.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | DynamicSleepNeed model + bridge call + hkUserAge internal + ordering fix | 9fecc0f | HealthDataStore.swift, HealthDataStore+Sleep.swift, HealthDataStore+Snapshots.swift |
| 2 | Replace all four 480.0 sleep_need_minutes fallbacks | ab66215 | HealthDataStore+Snapshots.swift, HealthDataStore+Utilities.swift |
| 3 | Dynamic display — sheet label + breakdown row + schedule card + overview trigger | 6359f52 | HealthSleepSheetsViews.swift, SleepV2ScheduleViews.swift, HealthSleepOverviewViews.swift |

## What Was Built

**DynamicSleepNeed struct** (`HealthDataStore+Sleep.swift`):
- Four Double fields: totalNeedMinutes, baseNeedMinutes, debtAdjustmentMinutes, strainAdjustmentMinutes
- Declared as top-level struct before the extension block

**runDynamicSleepNeed() async** (`HealthDataStore+Sleep.swift`):
- Calls `sleep.compute_need` bridge with database_path + optional age_years (UInt8, clamped 0–120)
- age_years key omitted entirely when nil (not null) so Rust serde default applies
- prior_strain omitted per D-03
- Sets self.dynamicSleepNeed = nil on error or missing total

**var dynamicSleepNeed: DynamicSleepNeed?** (`HealthDataStore.swift`):
- Plain stored property in base class body — no @Published, matches @Observable pattern
- Stored after imuStepCountResult following existing convention

**hkUserAge() made internal** (`HealthDataStore+Snapshots.swift`):
- Removed private keyword so HealthDataStore+Sleep.swift can call it

**refreshSleepAfterBandSync ordering fix** (`HealthDataStore.swift`):
- runDynamicSleepNeed() inserted FIRST before runPacketInputs()
- Ensures packet scores read fresh dynamicSleepNeed at Snapshots:28

**480.0 → 450.0 at all four sites**:
- HealthDataStore+Snapshots.swift line 28 (runPacketScores sleepArgs)
- HealthDataStore+Snapshots.swift line 68 (runSleepScore sleepArgs)
- HealthDataStore+Utilities.swift line 128 (sleepScoreReport baseArgs)
- HealthDataStore+Utilities.swift line 153 (recoveryScoreBridgeArgs)
- All replaced with `dynamicSleepNeed?.totalNeedMinutes ?? 450.0`

**SleepV2SleepNeededSheet** (`HealthSleepSheetsViews.swift`):
- @Environment(HealthDataStore.self) private var healthStore added
- sleepNeededText: returns "" when nil, "Xh Ym recommended tonight" when set
- breakdownText(_ need:) helper: "Base Xh · Debt ±Ym · Strain ±Zm"
- Hero text block conditionally shown only when sleepNeededText non-empty
- Breakdown Text row shown below hero when dynamicSleepNeed != nil
- .task { await healthStore.runDynamicSleepNeed() } on root NavigationStack

**SleepV2SleepWindowCard** (`SleepV2ScheduleViews.swift`):
- @Environment(HealthDataStore.self) private var healthStore added
- sleepNeedDisplayText: "--" when nil, "Xh Ym" (no suffix) when set
- Action-row value: "7h 39m" → sleepNeedDisplayText (Site A)

**SleepV2ClockDial** (`SleepV2ScheduleViews.swift`):
- @Environment(HealthDataStore.self) private var healthStore added (separate struct)
- sleepNeedDisplayText computed property added (same logic as SleepV2SleepWindowCard)
- Clock-ring center label: "7h 39m" → sleepNeedDisplayText (Site B)

**HealthSleepOverviewViews.swift**:
- Task { await healthStore.runDynamicSleepNeed() } added in onAppear alongside other refresh tasks

## Verification Results

```
grep -r '"sleep_need_minutes": 480' GooseSwift/  → CLEAN — no 480 fallback remains
grep -c '"7h 39m"' GooseSwift/SleepV2ScheduleViews.swift  → 0
xcodebuild BUILD SUCCEEDED
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SleepV2ClockDial requires its own @Environment injection**
- **Found during:** Task 3
- **Issue:** The plan referred to SleepV2SleepWindowCard for both "7h 39m" replacement sites. Site B (line ~366) is actually inside SleepV2ClockDial — a separate struct. sleepNeedDisplayText defined on SleepV2SleepWindowCard is not accessible there.
- **Fix:** Added @Environment(HealthDataStore.self) private var healthStore and a duplicate sleepNeedDisplayText computed property to SleepV2ClockDial. Both structs now independently resolve their values via environment injection.
- **Files modified:** GooseSwift/SleepV2ScheduleViews.swift
- **Commit:** 6359f52

## Known Stubs

None — all display sites are wired to live dynamicSleepNeed data. When nil, the sheet hero label is hidden and the card/dial show "--". The Calculation section rows in the sheet (strain, debt, efficiency buffer) still show hardcoded "+0m"/"+9m" placeholder values — these are pre-existing UI stubs in the sheet's "Calculation" card. They are not part of SLP-NEED-03 scope and are not rendered from dynamicSleepNeed. A future plan (SLP-NEED-04 or equivalent) should wire those rows to the breakdown components.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. UserDefaults read for dateOfBirth was already present in hkUserAge() — no new disclosure surface (T-120-03 accepted per plan threat model).

## Self-Check: PASSED

- GooseSwift/HealthDataStore.swift — exists, contains `var dynamicSleepNeed: DynamicSleepNeed?`
- GooseSwift/HealthDataStore+Sleep.swift — exists, contains `struct DynamicSleepNeed` and `func runDynamicSleepNeed()`
- GooseSwift/HealthDataStore+Snapshots.swift — hkUserAge() is internal, both sleep_need_minutes sites use 450.0 fallback
- GooseSwift/HealthDataStore+Utilities.swift — both sleep_need_minutes sites use 450.0 fallback
- GooseSwift/HealthSleepSheetsViews.swift — @Environment injected, .task added, breakdown row present
- GooseSwift/SleepV2ScheduleViews.swift — 0 occurrences of "7h 39m"
- GooseSwift/HealthSleepOverviewViews.swift — runDynamicSleepNeed() called in onAppear
- Commits: 9fecc0f, ab66215, 6359f52 — all present in git log
- BUILD SUCCEEDED
