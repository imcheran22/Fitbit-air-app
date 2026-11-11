---
phase: "04"
phase_name: "upload-status-feedback"
status: clean
depth: standard
files_reviewed: 4
reviewed_at: 2026-06-03
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
---

# Code Review — Phase 04: Upload Status Feedback

## Files Reviewed

1. `GooseSwift/GooseAppModel.swift` (additions: lines 56–58)
2. `GooseSwift/GooseAppModel+Upload.swift` (rewritten)
3. `GooseSwift/GooseAppModel+Lifecycle.swift` (single-line hook addition)
4. `GooseSwift/MoreRemoteServerViews.swift` (Status section + previews)

## Summary

No critical bugs or security issues found. The implementation correctly follows the established patterns (`@Published private(set) var` on `@MainActor`, `Task { @MainActor in ... }` for cross-actor dispatch, `DispatchQueue.global` for background work). Build passes with 0 errors and 0 new warnings. Two informational observations noted below.

---

## Findings

### INFO-01: Duplicate state properties for upload tracking

**File:** `GooseSwift/GooseAppModel.swift` (lines 54–58)
**Severity:** Info

**Observation:**  
`GooseAppModel` now declares five related properties:
- `uploadLastTimestamp: Date?` (Phase 3, original name)
- `uploadPendingBatchCount: Int` (Phase 3, original name)
- `serverReachable: Bool?` (Phase 4, new)
- `lastUploadAt: Date?` (Phase 4, new alias)
- `pendingBatchCount: Int` (Phase 4, new alias)

`lastUploadAt` and `pendingBatchCount` are kept as new canonical names for Phase 4 UI, while `uploadLastTimestamp` and `uploadPendingBatchCount` are preserved for backward compatibility. `configureUploadService()` sets all four in the same callback. This is a pragmatic choice but creates two sources of truth for the same values.

**Recommendation:**  
In a future cleanup phase, remove `uploadLastTimestamp` and `uploadPendingBatchCount` after auditing all consumers. For now, dual-setting in the callback is safe since both sets are on `@MainActor`.

**No action required for this phase.**

---

### INFO-02: `MoreRemoteServerView` reads `vm.serverURL` for `uploadIsActive` but `model.serverURL` does not exist

**File:** `GooseSwift/MoreRemoteServerViews.swift` (line 37)
**Severity:** Info

**Observation:**  
`uploadIsActive` computes `vm.uploadEnabled && !vm.serverURL.isEmpty`. The `vm` (`MoreRemoteServerViewModel`) reads its initial state from UserDefaults on construction and is not synced back when UserDefaults changes outside the view. This means if the user saves a new URL (calling `vm.save()`), `vm.serverURL` updates; if they close and reopen the screen, the ViewModel reinitializes from UserDefaults (correct). The current behavior is consistent with the existing Phase 2 pattern.

The status section condition correctly uses `vm.serverURL` (the local form state) rather than re-reading UserDefaults; this means the Status section appears or disappears based on what the user has typed, which is appropriate UX.

**No action required.**

---

## Security Assessment

| Check | Result |
|-------|--------|
| Health check URL constructed from UserDefaults (server-controlled input) | Safe — `URL(string:)` rejects malformed URLs; nil guard is in place |
| Health check response body not parsed or stored | Confirmed — only HTTP status code 200 is checked |
| Health check runs at most once per session | Confirmed — `_didRunHealthCheck` static var guards re-entry |
| Bearer token not exposed in status UI | Confirmed — only reachability/timestamp/count displayed |
| `ble.record` logging does not include server URL or token | Confirmed — only "reachable=true/false" logged |

---

## Build Verification

```
xcodebuild build — SUCCEEDED
Errors: 0
New warnings introduced: 0
```

All acceptance criteria from both plans verified against the compiled code.
