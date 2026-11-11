---
phase: "119"
plan: "119-01"
subsystem: ios-coach
status: complete
tags: [stealth-mode, userdefaults, coach, swift, value-types]
dependency_graph:
  requires: []
  provides: [GooseStealthMode, StealthMask, StealthStorage, CoachLocalToolContext.mask]
  affects: [CoachChatModel, CoachLocalToolContext]
tech_stack:
  added: []
  patterns: [caseless-enum-key-namespace, value-type-mask, ternary-sentinel-masking]
key_files:
  created:
    - GooseSwift/GooseStealthMode.swift
    - GooseSwiftTests/GooseStealthModeTests.swift
  modified:
    - GooseSwift/CoachLocalToolContext.swift
    - GooseSwift/CoachChatModel.swift
    - GooseSwift.xcodeproj/project.pbxproj
decisions:
  - "StealthMask.hidden stores Coach-JSON-key form (recovery, strain, sleep, stress, hrv_rmssd, resting_hr); translation from storage-suffix form happens at mask-construction time in CoachChatModel — not inside GooseStealthMode or CoachLocalToolContext"
  - "Vitals masking applied to rows array BEFORE live-HR insert at index 0 to prevent index drift"
  - "snapshot() helper kept generic; masking post-processes rows in vitals() by snapshot ID"
  - "StealthMask built on-demand at each build() call site (cheap value type, no reactive state needed)"
metrics:
  duration: "~45 minutes"
  completed: "2026-06-26T21:45:20Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 3
requirements_covered:
  - STEALTH-01
  - STEALTH-02
---

# Phase 119 Plan 119-01: Stealth Mode (Swift Core) Summary

**One-liner:** GooseStealthMode.isHidden + StealthStorage UserDefaults keys + StealthMask value type threaded into CoachLocalToolContext.build() with "hidden_by_user" sentinel for 6 metric positions.

## What Was Built

Three pure-Swift types in one new file (`GooseStealthMode.swift`) plus targeted masking in `CoachLocalToolContext` and call-site updates in `CoachChatModel`.

**StealthStorage** — caseless enum key namespace following the `RemoteServerStorage` pattern. Six `static let` constants under `"goose.swift.stealth.*"` for: `recovery_score`, `strain_score`, `hrv_rmssd`, `resting_hr`, `sleep_performance`, `stress_score`.

**GooseStealthMode** — struct with `static func isHidden(metric: String) -> Bool`. Uses a private `keyFor()` switch to map storage-suffix strings to `StealthStorage` constants. Returns `false` for unknown keys via empty-string guard (T-119-01 mitigation).

**StealthMask** — struct with `hidden: Set<String>` and `isHidden(_ metric: String) -> Bool`. `StealthMask.none` is a static constant with an empty set. Built at call sites using Coach-JSON-key form (`"recovery"`, not `"recovery_score"`).

**CoachLocalToolContext.build()** — gained `mask: StealthMask = .none` parameter. Threaded to `loadStats()` (4 score keys) and `vitals()` (2 snapshot rows by ID). Sentinel `"hidden_by_user"` replaces metric values; keys are always preserved so Coach JSON structure remains valid.

**CoachChatModel** — both build() call sites (toolContextProvider closure + buildSystemPrompt) now construct a StealthMask from GooseStealthMode immediately before calling build(), applying the storage-suffix → Coach-JSON-key translation.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | GooseStealthMode.swift + unit tests + pbxproj (TDD) | 4cc90da | GooseStealthMode.swift, GooseStealthModeTests.swift, project.pbxproj |
| 2 | CoachLocalToolContext masking (mask param + scores + vitals) | 00720b6 | CoachLocalToolContext.swift |
| 3 | CoachChatModel call sites — mask construction + pass to build() | 94d06d8 | CoachChatModel.swift |

## Verification Results

```
BUILD SUCCEEDED (xcodebuild build -scheme GooseSwift -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO)

grep -c 'GooseStealthMode.swift' project.pbxproj      → 4 (PASS)
grep -c 'GooseStealthModeTests.swift' project.pbxproj → 4 (PASS)
grep -n 'mask: StealthMask' CoachLocalToolContext.swift → lines 9, 28, 62 (PASS)
grep -c 'mask: mask' CoachChatModel.swift              → 2 (PASS)
grep -c 'hidden_by_user' CoachLocalToolContext.swift   → 6 (PASS, ≥1 required)
```

## Deviations from Plan

None — plan executed exactly as written.

The executor notes from the multi-AI review were all correctly applied:
- Both new Swift files registered in pbxproj at exactly 4 locations each (8 total)
- Vitals masking applied to `rows` BEFORE `rows.insert(..., at: 0)` — no index drift
- Snapshot IDs `"health-monitor"` and `"resting-hr"` used for vitals matching
- Metric key translation (storage-suffix → Coach-JSON-key) applied at mask-construction time in CoachChatModel

## Known Stubs

None. All 6 metric masking positions are fully wired. Phase 122 will add the toggle UI that writes the UserDefaults keys read by GooseStealthMode.isHidden.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced. UserDefaults keys are read-only in this phase; write path is Phase 122. No threat flags.

## Self-Check: PASSED

All created files exist on disk. All 3 task commits verified in git log (4cc90da, 00720b6, 94d06d8).
