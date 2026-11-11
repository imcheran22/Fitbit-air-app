---
plan: "04-01"
phase: 4
status: complete
completed: 2026-06-03
key-files:
  created:
    - GooseSwift/GooseAppModel+Upload.swift
  modified:
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+Lifecycle.swift
---

# Plan 04-01 Summary: Upload Status @Published Properties and Health Check

## What Was Built

Added three `@Published` status properties to `GooseAppModel`:

- `serverReachable: Bool?` — nil until health check resolves (nil = "A verificar...")
- `lastUploadAt: Date?` — set after each successful upload batch (wired to GooseUploadService callback)
- `pendingBatchCount: Int` — in-memory retry counter (wired to GooseUploadService callback)

Added `triggerHealthCheckIfNeeded()` to `GooseAppModel+Upload.swift`:
- One-shot guard via `GooseAppModel._didRunHealthCheck` static var
- Reads `goose.remote.serverURL` and `goose.remote.uploadEnabled` from UserDefaults
- Fires `GET /healthz` on `DispatchQueue.global(qos: .utility)` with a 5-second timeout
- Publishes result back to `@MainActor` via `Task { @MainActor in self.serverReachable = ... }`
- Logging dispatched via `Task { @MainActor [weak self] in ... }` to avoid Sendable closure warnings

Hooked `triggerHealthCheckIfNeeded()` into `GooseAppModel+Lifecycle.swift` in the `active`/`foreground` branch of `handleAppLifecycleChange(_:)`.

## Deviations

- `uploadLastTimestamp` and `uploadPendingBatchCount` (existing Phase 3 properties) are kept for backward compatibility; `lastUploadAt` and `pendingBatchCount` are added as the canonical names used by Plan 04-02 UI.
- `ble.record` calls are done via `Task { @MainActor ... }` to avoid Swift concurrency Sendable closure warnings.

## Self-Check: PASSED

- `serverReachable: Bool?` present in GooseAppModel.swift ✓
- `lastUploadAt: Date?` present ✓
- `pendingBatchCount: Int` present ✓
- `triggerHealthCheckIfNeeded()` defined in GooseAppModel+Upload.swift ✓
- Lifecycle hook in GooseAppModel+Lifecycle.swift `active` branch ✓
- One-shot guard (`_didRunHealthCheck`) present ✓
- Build: SUCCEEDED, 0 errors, 0 warnings from new code ✓
