---
phase: 14-pt-pt-localisation
plan: "02"
subsystem: localisation
tags: [localisation, pt-PT, xcstrings, home, health, recovery, sleep, coach, strain, stress, cardio]
dependency_graph:
  requires: [14-01]
  provides: [pt-PT translations for Home / Health / Recovery / Sleep / Coach static UI strings]
  affects: [GooseSwift/Localizable.xcstrings]
tech_stack:
  added: []
  patterns: [xcstrings catalog-only localisation via SwiftUI Text LocalizedStringKey auto-resolution]
key_files:
  modified:
    - GooseSwift/Localizable.xcstrings
decisions:
  - "Kept 'Stress' untranslated as a loanword (consistent with pt-PT medical usage)"
  - "Used 'Actividade' (with 'c') and 'Esforço' for Activity/Strain per pt-PT orthographic convention"
  - "Used 'Esforço' for Strain throughout (consistent with Wave 1 glossary)"
  - "Used 'VFC' (Variabilidade da Frequência Cardíaca) for HRV — established glossary term"
  - "Duplicate keys Export, Resting HRV, and Target were removed — one entry each retained"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-05"
  tasks_completed: 2
  files_modified: 1
---

# Phase 14 Plan 02: pt-PT Localisation Wave 2 Summary

pt-PT translations for Home dashboard, Health Monitor, Recovery V2, Stress V2, Strain V2, Sleep V2, Cardio Load, and Coach static UI strings added to Localizable.xcstrings — catalog grows from 47 entries (Wave 1) to 215 unique entries with no Swift code changes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract and translate Home + Health-family static strings | 6d136df | GooseSwift/Localizable.xcstrings |
| 2 | Translate Coach view static strings | 6d136df | GooseSwift/Localizable.xcstrings |

## What Was Done

### Task 1 — Home + Health-family strings

Audited the following files and extracted all user-visible static string literals:

- `HomeDashboardView.swift` — "Today", "Daily Scores", "Device" (accessibilityLabel)
- `HealthDashboardViews.swift` — "Health Sources", "Preview", "Live", "Today", "Activity", "Steps", "Active Calories", "Heart Rate", "Vitals", "Open Health Monitor", "Health Monitor", "Timeline", "Export", "Share Local Health Snapshot", "Packet Inputs"
- `HealthRecoveryStressViews.swift` — "Resting HRV", "Resting HR", "Respiratory Rate", "Oxygen Saturation", "Wrist Temperature", "Target Strain Today", "No recovery timeline", "No recovery insights", "Trends", "Insights", "Stress", "Confidence", "Average HR", "No stress timeline", "No stress trends", "Choose Stress date", "Stress Date", "Breakdown", "Duration:", "High", "Med", "Low"
- `HealthSleepOverviewViews.swift` — "Time in Bed", "Time Asleep", "View insights", "Sleep alarm settings", "Sleep schedule", "Tonight", "Wind down", "Target bedtime"
- `HealthMetricFamilyStrainViews.swift` — "Add Sleep Unavailable", "OK", hero subtitle strings, "Strain", "Target Strain", "Duration", "Total Energy", "View data gaps", "Activities", "No activities", "No strain trends", "Choose Strain date", "Daily load", "Score", "Target", "Energy", "Heart rate zones", "No strain insights", "Strain Data"
- `HealthCardioViews.swift` — "Cardio Load", "Close", "Cardio Load Help", "Range", "Previous/Next/Pick Cardio Load" accessibility labels, "No Cardio Load", "Cardio Status Breakdown", "Status", "Resources", "The Basics: Cardio Load", "Cardio Status", "Pick Date", "Cardio Load Calibration"
- `HealthSupplementalViews.swift` — "Energy Bank", "Energy And Stress", "Energy Usage", "Energy charge…" subtitle, "Primary Selection", "Algorithm Definitions", "Reference Definitions", "Policy", "Comparisons", "References", "Actions", "Calibration", "No Trend Data", "Trend", "Analysis", "Extract Packet-Derived Inputs", "Run Packet-Derived Scores", "Run Reference Comparisons", "Import Labels", "Family"
- `HealthSleepSheetsViews.swift` — "Tonight's sleep needed", "Target time in bed…", "Target amount", "Your preferred sleep duration…", "Calculation", "Sleep goal", "Recent strain", "Sleep debt", "Efficiency buffer", "Total", "Sleep Needed", "Sleep Alarm", "Alarm config", "Wake up at", "Wake-up time", "Alarm mode", "Used by Needed mode…", "Haptic", "Band controls", "Test haptic", "Run now", "Turn off", "Disable on band", "Band write diagnostics", "Diagnostics", "Save to Band", "Run Now", "Disable on Band"
- `SleepV2BevelTrendViews.swift` — "Trends Analysis", "No trend data", "Trend Date", "Trend end date", "Resources"

### Task 2 — Coach view strings

Audited:

- `CoachView.swift` — "Coach Chat", "Coach Sign In", "Model", "New Conversation", "Sign Out", "Coach account", "Metric Highlights", "Data Gaps", "Ask About This", "Chat ready", "Chat signed out", "Open", "Sign In"
- `CoachChatScreen.swift` — "Start Here" (section header above prompt suggestions)
- `CoachComposer.swift` — "Ask Coach" (TextField placeholder), "Stop streaming", "Send message" (accessibilityLabel)

Excluded as required: `HealthDataStore+CoachSummaries.swift` (AI context strings), CoachTips.swift AI-prompt interpolations, `@Published` status property values, SF Symbol names.

## Verification

```
python3 -c "import json,sys; d=json.load(open('GooseSwift/Localizable.xcstrings')); print(len(d['strings'])); sys.exit(0 if len(d['strings'])>=100 else 1)"
# → 215  (was 47 after Wave 1)

python3 -m json.tool GooseSwift/Localizable.xcstrings > /dev/null && echo ok
# → ok
```

Both acceptance criteria satisfied: ≥100 entries and valid JSON.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate keys Export, Resting HRV, and Target**
- **Found during:** Task 1 — initial draft had comment-annotated duplicate entries
- **Issue:** JSON spec silently overwrites duplicate keys; xcstrings toolchain rejects them
- **Fix:** Removed the second occurrence of each duplicate key; unique entry retained
- **Files modified:** GooseSwift/Localizable.xcstrings
- **Commit:** 6d136df (same task commit)

## Known Stubs

None — this plan only modifies the string catalog. No UI stubs were introduced.

## Threat Flags

None — catalog-only edit, no new network endpoints or auth paths.

## Self-Check

- [x] `GooseSwift/Localizable.xcstrings` exists and contains 215 entries
- [x] Commit 6d136df exists in git log
- [x] JSON parses without error
- [x] Entry count ≥ 100

## Self-Check: PASSED
