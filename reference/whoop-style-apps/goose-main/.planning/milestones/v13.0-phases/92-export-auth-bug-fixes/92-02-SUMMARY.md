---
phase: 92-export-auth-bug-fixes
plan: "02"
subsystem: export
tags: [bug-fix, export, oom-guard, swift]
requirements: [BUG-EXP-02, BUG-EXP-04]
depends_on: ["92-01"]

dependency_graph:
  requires: []
  provides:
    - MoreDataStore.isDatabaseTooLarge
    - runFullRawExport without includeRawBytes override
    - sqlite Toggle .disabled guard
  affects:
    - GooseSwift/MoreDataStore.swift
    - GooseSwift/MoreDataStore+Validation.swift
    - GooseSwift/MoreRawExportViews.swift

tech_stack:
  added: []
  patterns:
    - SwiftUI .disabled modifier on ForEach Toggle row (conditional per family)
    - FileManager.attributesOfItem for file size guard

key_files:
  modified:
    - GooseSwift/MoreDataStore+Validation.swift
    - GooseSwift/MoreDataStore.swift
    - GooseSwift/MoreRawExportViews.swift

decisions:
  - D-08: runFullRawExport() must not override includeRawBytes; user value preserved
  - D-10: sqlite Toggle disabled (greyed out) when DB > 20 MB — no alert, no hide

metrics:
  duration: ~5 minutes
  completed: 2026-06-19
  tasks_completed: 2
  files_modified: 3

status: complete
---

# Phase 92 Plan 02: Fix Export Defaults + Disable OOM-Risk Button Summary

Removed the silent `includeRawBytes = true` override from `runFullRawExport()` and added an OOM guard that disables the `sqlite` family Toggle when the SQLite database exceeds 20 MB.

## What Was Built

| Symbol / File | Kind | Description |
|---|---|---|
| `MoreDataStore.isDatabaseTooLarge` | Swift computed var (new) | Returns true when SQLite file > 20 MB; uses same 20 MB threshold and 1_048_576 divisor as `fetchSQLiteDBSizeLabel()` |
| `runFullRawExport()` | Swift fn (modified) | Removed `includeRawBytes = true` line; user-configured `@Published var includeRawBytes` value now flows unchanged into `runRawExport()` |
| sqlite Toggle `.disabled` modifier | SwiftUI modifier (new) | `.disabled(family == "sqlite" && store.isDatabaseTooLarge)` applied to the Toggle inside the `ForEach(MoreDataStore.rawFamilies)` loop in the Data Families section |

## Tasks

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Remove includeRawBytes override; add isDatabaseTooLarge | 7730b16 | MoreDataStore+Validation.swift, MoreDataStore.swift |
| 2 | Disable sqlite Toggle when isDatabaseTooLarge | 7730b16 | MoreRawExportViews.swift |

## Verification Results

1. `grep "includeRawBytes" MoreDataStore+Validation.swift` — zero matches in `runFullRawExport()` body (correct)
2. `grep "isDatabaseTooLarge" MoreDataStore.swift` — line 471: computed property present
3. `grep "isDatabaseTooLarge" MoreRawExportViews.swift` — line 44: `.disabled(family == "sqlite" && store.isDatabaseTooLarge)` present
4. `grep "showDatabaseTooLargeAlert" MoreRawExportViews.swift` — zero matches (no alert pattern introduced)

## Deviations from Plan

None — plan executed exactly as written. Both changes in Task 1 were committed together with Task 2 in a single atomic commit (all three files are part of the same bug fix surface; separating them would leave the codebase in an intermediate state).

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced. `isDatabaseTooLarge` reads file size via `FileManager.attributesOfItem` — read-only access on the app's own sandbox file, consistent with T-92-02-03 (accepted).

## Self-Check: PASSED

- `GooseSwift/MoreDataStore.swift` — modified, committed at 7730b16
- `GooseSwift/MoreDataStore+Validation.swift` — modified, committed at 7730b16
- `GooseSwift/MoreRawExportViews.swift` — modified, committed at 7730b16
- All four verification greps confirm expected state
