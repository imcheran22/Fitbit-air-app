---
phase: "97"
plan: "02"
subsystem: healthkit-export
status: complete
tags: [healthkit, swift, ble, export, bevel]
completed: "2026-06-20"
duration_minutes: 35

dependency_graph:
  requires:
    - "97-01"  # Rust bridge methods store.hk_hr_samples_between, store.hk_spo2_samples_between, store.hk_sleep_sessions_between
  provides:
    - "GooseHealthKitExporter.enum"  # consumed by 97-03 (sync trigger) and 97-04 (toggle)
  affects:
    - "GooseSwift.xcodeproj/project.pbxproj"

tech_stack:
  added:
    - "GooseHealthKitExporter (caseless Swift enum — namespace pattern)"
  patterns:
    - "#if canImport(HealthKit) file-level guard"
    - "withCheckedThrowingContinuation for HKHealthStore.requestAuthorization"
    - "Batch HKHealthStore.save(_ objects: [HKObject]) — one call per data type"
    - "logError closure pattern for non-fatal HK write errors (D-11)"

key_files:
  created:
    - GooseSwift/GooseHealthKitExporter.swift
  modified:
    - GooseSwift.xcodeproj/project.pbxproj

decisions:
  - "HRV unit: HKUnit.secondUnit(with: .milli) with rmssd_ms value directly — confirmed by HealthKitFullImporter.swift line 219 which reads HRV using the same unit without dividing"
  - "SpO2: spo2_percent divided by 100.0 before write; values outside [0.0, 1.0] skipped (T-97-07)"
  - "Sleep: asleepUnspecified enum case — non-deprecated iOS 16+ value"
  - "HRV time range: start_time_unix_ms..end_time_unix_ms from daily_recovery_metrics row (not midnight of date_key)"
  - "Bridge method names confirmed from 97-01-SUMMARY: hk_hr_samples_between / hk_spo2_samples_between / hk_sleep_sessions_between (not the names assumed in 97-02-PLAN.md)"

metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
  commits: 1
---

# Phase 97 Plan 02: GooseHealthKitExporter.swift Summary

**One-liner:** Caseless Swift enum centralising all HK write logic — HR/HRV/SpO2/sleep — with requestAuthorization and exportAfterSleepSync entry points, gated by UserDefaults toggle.

## What Was Built

`GooseSwift/GooseHealthKitExporter.swift` — new file, 243 lines, entirely wrapped in `#if canImport(HealthKit)`.

**Public API:**

- `GooseHealthKitExporter.requestAuthorization() async throws` — uses `withCheckedThrowingContinuation` (HealthKitFullImporter pattern) to request share authorization for heartRate, heartRateVariabilitySDNN, oxygenSaturation, sleepAnalysis. Read types are empty — Goose already holds read permission from existing import flows.
- `GooseHealthKitExporter.exportAfterSleepSync(dbPath:deviceId:startTs:endTs:bridge:logError:) async` — guarded by `isExportEnabled` and `HKHealthStore.isHealthDataAvailable()`. Calls four private write helpers in sequence.

**Four write helpers (private static):**

| Helper | Bridge method | HK type | Unit / value |
|--------|--------------|---------|--------------|
| `writeHeartRateSamples` | `store.hk_hr_samples_between` | `.heartRate` | `count/min`, start == end == sample ts |
| `writeHRVSamples` | `metrics.daily_recovery_metrics` | `.heartRateVariabilitySDNN` | `.secondUnit(with: .milli)`, rmssd_ms passed directly |
| `writeSpO2Samples` | `store.hk_spo2_samples_between` | `.oxygenSaturation` | `.percent()`, spo2_percent / 100.0 (fraction) |
| `writeSleepSessions` | `store.hk_sleep_sessions_between` | `.sleepAnalysis` | `asleepUnspecified`, ms→Date conversion |

**Error handling (D-11):** every `HKHealthStore.save()` wrapped in do/catch; errors forwarded to `logError(typeLabel, description)` closure. App continues on all write failures.

**project.pbxproj:** 4 entries added — PBXBuildFile (A10000000000000000000043), PBXFileReference (A20000000000000000000043), PBXGroup children, PBXSourcesBuildPhase files.

## Commits

| Hash | Message |
|------|---------|
| `8c38bb4` | feat(97-02): add GooseHealthKitExporter with HR/HRV/SpO2/sleep write paths |

## Verification

- `grep -c "GooseHealthKitExporter.swift" project.pbxproj` → **4** (all four locations)
- `xcodebuild ... build` → **BUILD SUCCEEDED** (iPhone 17 Pro simulator, Xcode 26.5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bridge method names differ from plan assumptions**
- **Found during:** Task 1 — reading 97-01-SUMMARY.md before writing code
- **Issue:** 97-02-PLAN.md assumed method names `store.hr_samples_between`, `store.spo2_samples_between`, `store.external_sleep_sessions_between`. Plan 97-01 actually created `store.hk_hr_samples_between`, `store.hk_spo2_samples_between`, `store.hk_sleep_sessions_between`; also arg names differ (`start_unix_s`/`end_unix_s` not `start_ts`/`end_ts`; sleep uses `start_unix_ms`/`end_unix_ms`).
- **Fix:** Used correct method and arg names from 97-01-SUMMARY.md and verified against bridge/debug.rs source.
- **Files modified:** GooseSwift/GooseHealthKitExporter.swift

**2. [Rule 1 - Decision] HRV unit: pass rmssd_ms directly with .secondUnit(with: .milli)**
- **Found during:** Task 1 — cross-checking RESEARCH.md assumption against existing codebase
- **Issue:** RESEARCH.md noted HK expects seconds and suggested dividing rmssd_ms by 1000. But `HealthKitFullImporter.swift` line 219 reads HRV using `.secondUnit(with: .milli)` directly — confirming the millisecond unit is the correct HK unit for heartRateVariabilitySDNN, no division needed.
- **Fix:** Used `.secondUnit(with: .milli)` with rmssd_ms passed directly (no ÷1000). Added inline comment explaining the decision with codebase evidence.
- **Files modified:** GooseSwift/GooseHealthKitExporter.swift

**3. [Rule 2 - Security] SpO2 range guard added**
- **Found during:** Task 1 — threat model T-97-07
- **Issue:** spo2_percent could theoretically be outside [0, 100] due to bridge computation edge cases; writing out-of-range fractions to HK is incorrect.
- **Fix:** Added `guard fraction >= 0.0 && fraction <= 1.0 else { continue }` after the division.
- **Files modified:** GooseSwift/GooseHealthKitExporter.swift

**4. [Rule 2 - Missing] HRV rows where rmssd_ms == 0 skipped**
- **Found during:** Task 1 — threat model T-97-06
- **Issue:** daily_recovery_metrics rows may have rmssd_ms = 0 (not nil) when computation failed; writing 0 ms HRV to HK would pollute data.
- **Fix:** Guard `rmssdMs > 0` (not just nil check) before building HK sample.
- **Files modified:** GooseSwift/GooseHealthKitExporter.swift

**5. [Rule 2 - Missing] Sleep session end > start validation**
- **Found during:** Task 1
- **Issue:** Bridge rows could theoretically have end <= start (corrupt data); HK rejects such samples.
- **Fix:** Guard `endMs > startMs` before building HKCategorySample.
- **Files modified:** GooseSwift/GooseHealthKitExporter.swift

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-97-06 HRV unit mismatch | Verified unit against HealthKitFullImporter.swift; used .secondUnit(with:.milli) directly; inline comment documents decision |
| T-97-07 SpO2 range | Divide by 100.0 + guard [0.0, 1.0] before write |
| T-97-08 HK write failure | All save() in do/catch; logError closure; app continues |
| T-97-09 Raw PPG in HK | store.hk_spo2_samples_between returns computed spo2_percent only (97-01 responsibility confirmed) |

## Known Stubs

None. GooseHealthKitExporter is a complete implementation. The four write helpers call real bridge methods and write real HK samples. No placeholder data flows to UI.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `/Users/francisco/Documents/goose/GooseSwift/GooseHealthKitExporter.swift` — FOUND
- Commit `8c38bb4` — confirmed via git log
- `grep -c GooseHealthKitExporter.swift project.pbxproj` == 4 — CONFIRMED
- BUILD SUCCEEDED — CONFIRMED
