---
phase: 96-best-practices-gaps
plan: "01"
subsystem: swift-error-handling
tags: [error-handling, logging, bridge, do-catch, bp-01]
status: complete

requires: []
provides: [silent-bridge-call-elimination]
affects: [GooseSwift/GooseAppModel+Upload.swift, GooseSwift/GooseAppModel.swift, GooseSwift/GooseUploadService.swift, GooseSwift/HealthDataStore+Sleep.swift, GooseSwift/CaptureFrameWriteQueue.swift, GooseSwift/HealthDataStore+V24Biometrics.swift]

tech-stack:
  added: []
  patterns:
    - do/catch wrapping GooseRustBridge.request and requestAsync calls
    - per-file logging idiom (ble.record, logger.warning, print, empty-catch-with-comment)

key-files:
  created: []
  modified:
    - GooseSwift/GooseAppModel+Upload.swift
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseUploadService.swift
    - GooseSwift/HealthDataStore+Sleep.swift
    - GooseSwift/CaptureFrameWriteQueue.swift
    - GooseSwift/HealthDataStore+V24Biometrics.swift

decisions:
  - D-05 applied: every silent try? replaced with do/catch
  - D-06 applied: per-file logging idiom used (ble.record in GooseAppModel context, logger.warning in GooseUploadService, print in CaptureFrameWriteQueue, empty catch in HealthDataStore+V24Biometrics)
  - D-07 applied: all 9 call sites converted (8 mandatory + V24Biometrics)
  - D-08 applied: no catch block propagates — all end with return, continue, or fall-through

metrics:
  duration: "6 min"
  completed: "2026-06-20"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 6
  call_sites_converted: 9

requirements: [BP-01]
---

# Phase 96 Plan 01: Fix 9 Silent try? Bridge Calls in Swift Summary

**One-liner:** Replaced all 9 silent `try? bridge.request` / `try? await bridge.requestAsync` calls with `do/catch` blocks using each file's established logging idiom — bridge errors now visible in Xcode console and OSLog.

## What Was Built

Six Swift files modified. Nine call sites converted from silent `try?` to explicit `do/catch`. Zero new dependencies. Zero behaviour changes on the happy path.

### Call Sites Converted

| # | File | Method | Logging idiom |
|---|------|--------|---------------|
| 1 | `GooseAppModel+Upload.swift` | `capture.import_frame_batch` | `ble.record(level: .error, ...)` + continue |
| 2 | `GooseAppModel+Upload.swift` | `sync.backfill_streams` | `ble.record(level: .error, ...)` |
| 3 | `GooseAppModel.swift` | `storage.compact_raw_evidence` | `ble.record(level: .error, ...)` via `DispatchQueue.main.async` |
| 4 | `GooseUploadService.swift` | `sync.rows_pending_upload` | `logger.warning(...)` + `result[entry.table] = []` + continue |
| 5 | `HealthDataStore+Sleep.swift` | `metric_series.query_range` (queryLatest) | return nil |
| 6 | `HealthDataStore+Sleep.swift` | `metric_series.query_range` (queryHistory) | return [] |
| 7 | `HealthDataStore+Sleep.swift` | `metric_series.upsert` | return (fire-and-forget) |
| 8 | `CaptureFrameWriteQueue.swift` | `storage.compact_raw_evidence` | `print(...)` |
| 9 | `HealthDataStore+V24Biometrics.swift` | `biometrics.spo2_from_raw` | empty catch (spo2Percent stays nil) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GooseRustBridge.request / requestAsync return non-Optional**
- **Found during:** Task 3 (Swift build verification — BUILD FAILED)
- **Issue:** The PLAN.md (authored before the RESEARCH confirmed return types) showed guard-let and if-let patterns (`guard let r = try localRust.request(...)`, `if let spo2Report = try await bridge.requestAsync(...)`). Swift compiler rejected these because both methods return `[String: Any]` (non-Optional), not `[String: Any]?`. `try?` had been the only reason Optional-binding worked — it wraps the result in Optional on success and returns nil on failure.
- **Fix:** Replaced all guard-let / if-let constructs around non-Optional `try` calls with direct assignment (`report = try ...`). HealthDataStore+Sleep.swift `queryLatest` and `queryHistory` changed from `let rows: [String: Any]?` + `guard let rows` to `let rows: [String: Any]` + no optional unwrap. V24Biometrics changed from `if let spo2Report = try await bridge.requestAsync(...)` to `let spo2Report = try await bridge.requestAsync(...)`.
- **Files modified:** GooseAppModel.swift, GooseUploadService.swift, HealthDataStore+Sleep.swift, HealthDataStore+V24Biometrics.swift
- **Commits:** a4e28f3

**2. [Rule 1 - Bug] GooseUploadService guard-let nil-branch eliminated**
- **Found during:** Task 2 implementation
- **Issue:** The original `try?` guard-let had an else-branch that executed `result[entry.table] = []; continue` when the bridge returned nil. Since `request` is non-Optional (never returns nil), this branch was dead code. With do/catch the nil-branch is gone; the catch block handles the error case instead.
- **Fix:** The catch block assigns `result[entry.table] = []` and continues — same observable behaviour as the old else-branch, but triggered only on actual errors.
- **Files modified:** GooseSwift/GooseUploadService.swift
- **Commits:** a4e28f3 (corrected in type-fix commit)

## Verification

- `grep -rn "try? bridge\.request\|try? rust\.request\|try? localRust\.request\|try? await bridge\.requestAsync" GooseSwift/ --include="*.swift"` → **0 lines**
- `xcodebuild build -project GooseSwift.xcodeproj -scheme GooseSwift -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17 Pro" CODE_SIGNING_ALLOWED=NO` → **BUILD SUCCEEDED**

## Known Stubs

None. All 9 call sites are wired to real logging or silent-return per design.

## Threat Flags

None. Error descriptions are logged to console/OSLog only — not transmitted externally. No PII in bridge error strings (per T-96-01 disposition: accept).

## Self-Check: PASSED

Files exist:
- FOUND: GooseSwift/GooseAppModel+Upload.swift
- FOUND: GooseSwift/GooseAppModel.swift
- FOUND: GooseSwift/GooseUploadService.swift
- FOUND: GooseSwift/HealthDataStore+Sleep.swift
- FOUND: GooseSwift/CaptureFrameWriteQueue.swift
- FOUND: GooseSwift/HealthDataStore+V24Biometrics.swift

Commits:
- e3a497e: fix(96-01): replace silent try? with do/catch in GooseAppModel-family (3 sites)
- 4bfa845: fix(96-01): replace silent try? with do/catch in remaining 6 bridge call sites
- a4e28f3: fix(96-01): correct do/catch patterns for non-Optional bridge return types
