---
phase: "97"
plan: "03"
subsystem: healthkit-export
status: complete
tags: [healthkit, sleep-sync, export-trigger, authorization]
completed: "2026-06-20"

dependency_graph:
  requires:
    - "97-02"  # GooseHealthKitExporter class (entry points defined)
    - "97-04"  # enableHealthKitExport stub + MoreView toggle wiring
  provides:
    - enableHealthKitExport() full implementation (D-07 authorization + denial recovery)
    - exportAfterSleepSync() wired into syncBandSleepHistory() success path (D-01)
  affects:
    - GooseSwift/GooseAppModel+HealthKitExport.swift
    - GooseSwift/GooseAppModel+SleepSync.swift

tech_stack:
  added: []
  patterns:
    - "#if canImport(HealthKit) guards on all HK call sites"
    - "weak self capture in async HK logError closure (T-97-12)"
    - "HKHealthStore.authorizationStatus proxy check after requestAuthorization for denial detection"

key_files:
  modified:
    - GooseSwift/GooseAppModel+HealthKitExport.swift
    - GooseSwift/GooseAppModel+SleepSync.swift

decisions:
  - "Replaced stub in GooseAppModel+HealthKitExport.swift in-place rather than creating a new GooseAppModel+HKExport.swift — file was already registered in pbxproj from 97-04; renaming would require pbxproj edits with no benefit"
  - "requestAuthorization() does not throw on denial — checked authorizationStatus(for: .heartRate) as proxy to detect user denial (per RESEARCH Pitfall 6)"
  - "logError closure in exportAfterSleepSync uses [weak self] — silent drop if self deallocated during async HK writes is correct behavior (T-97-12)"

metrics:
  duration_minutes: 10
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
  commits: 1
---

# Phase 97 Plan 03: Trigger Wiring Summary

One-liner: HealthKit export trigger wired into syncBandSleepHistory() and enableHealthKitExport() implemented with authorization + denial recovery.

## What Was Built

### Task 1 — enableHealthKitExport() (GooseAppModel+HealthKitExport.swift)

Replaced the empty stub from 97-04 with the full implementation:

- Calls `GooseHealthKitExporter.requestAuthorization()` inside a do/catch
- After authorization completes (which never throws on denial), checks `HKHealthStore.authorizationStatus(for: HKQuantityType(.heartRate))` as a proxy
- On `.sharingAuthorized` missing: reverts `UserDefaults.standard.set(false, forKey: exportEnabledKey)` on MainActor, then logs via `ble.record(level: .error, source: "healthkit", ...)`
- On system-level error (catch): same revert + log path
- Entire extension guarded by `#if canImport(HealthKit)`

### Task 2 — exportAfterSleepSync() call site (GooseAppModel+SleepSync.swift)

Added call immediately after `store.bandSleepImportStatus = String(localized: "Synced from band")`, inside the `do` block success path:

```swift
#if canImport(HealthKit)
await GooseHealthKitExporter.exportAfterSleepSync(
  dbPath: dbPath,
  deviceId: deviceId,
  startTs: overnightStart,
  endTs: overnightEnd,
  bridge: localRust,
  logError: { [weak self] typeLabel, errorDesc in
    self?.ble.record(level: .error, source: "healthkit", title: typeLabel, body: errorDesc)
  }
)
#endif
```

- `localRust`, `dbPath`, `deviceId`, `overnightStart`, `overnightEnd` all in scope at insertion point
- Not called in the `catch` block (D-01, T-97-11)
- `logError` captures self weakly — errors silently dropped if self is deallocated (T-97-12)

## Deviations from Plan

### Auto-applied Naming Deviation

**Found during:** Task 1 pre-read

**Issue:** Plan specified creating `GooseAppModel+HKExport.swift` as a new file, but 97-04 had already created and registered `GooseAppModel+HealthKitExport.swift` in pbxproj. Creating a second file with a different name would require new pbxproj entries and leave the existing stub file unreferenced.

**Fix:** Replaced the stub content in `GooseAppModel+HealthKitExport.swift` in-place. The stub file already had all three pbxproj entries (PBXBuildFile, PBXFileReference, group children). No pbxproj changes needed.

**Impact:** Zero — file name difference has no runtime or API effect; MoreView already calls `model.enableHealthKitExport()` by method name.

## Verification

- `xcodebuild BUILD SUCCEEDED` with `iPhone 17 Pro` simulator
- `grep -c "GooseHealthKitExporter.exportAfterSleepSync" GooseAppModel+SleepSync.swift` → 1 (exactly once)
- `grep -c "GooseAppModel+HealthKitExport.swift" project.pbxproj` → 4 (PBXBuildFile + PBXFileReference + 2 group children entries)
- No duplicate `enableHealthKitExport()` in the codebase

## Commits

| Hash | Message |
|------|---------|
| a7c4eef | feat(97-03): wire HealthKit export trigger and implement enableHealthKitExport() |

## Self-Check: PASSED

- `/Users/francisco/Documents/goose/GooseSwift/GooseAppModel+HealthKitExport.swift` — FOUND
- `/Users/francisco/Documents/goose/GooseSwift/GooseAppModel+SleepSync.swift` — FOUND
- Commit `a7c4eef` — FOUND (confirmed from git output above)
