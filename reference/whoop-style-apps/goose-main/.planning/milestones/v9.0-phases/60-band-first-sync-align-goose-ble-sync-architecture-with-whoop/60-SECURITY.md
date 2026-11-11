---
phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
plans: [60-01, 60-02, 60-03]
asvs_level: 1
audited: 2026-06-11
auditor: gsd-security-auditor
result: SECURED
threats_total: 11
threats_closed: 11
threats_open: 0
---

# Security Audit — Phase 60: Band-First Sync

## Summary

**Phase:** 60 — Band-First Sync (Align Goose BLE Sync Architecture with WHOOP)
**Plans audited:** 60-01, 60-02, 60-03
**Closed:** 10/11 | **Open:** 1/11
**ASVS Level:** 1
**Block condition:** none — all 11 threats closed

---

## Threat Verification

### Closed Threats

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-60-01 | Tampering | mitigate | `grep -v '^[[:space:]]*//' GooseSwift/GooseAppModel.swift \| grep -c overnightGuard` → 0; `grep -c "struct OvernightGuard" GooseSwift/HealthPacketCaptureTypes.swift` → 0; three files deleted from disk; repo-wide sweep of 11 deleted symbols across GooseSwift/ → 0 files |
| T-60-02 | Denial of Service | accept | `OvernightSQLiteMirrorQueue.swift` retained on disk; `grep -rn overnightSQLiteMirror GooseSwift/ \| grep -v GooseAppModel.swift` → 0 results (no callers); accepted risk documented below |
| T-60-04 | Denial of Service | mitigate | `GooseAppModel+BandFirstSync.swift` line 43: expirationHandler calls `ble.stopScan()`; line 59: asyncAfter 20s calls `self?.ble.stopScan()`. Both timeout paths confirmed |
| T-60-05 | Tampering | accept | `as? Date` cast at line 19 of `GooseAppModel+BandFirstSync.swift` fails safe to nil (falls through to sync); accepted risk documented below |
| T-60-06 | Information Disclosure | accept | No new data path introduced; BGTask reuses existing BLE pairing + GATT encryption model; accepted risk documented below |
| T-60-07 | Denial of Service | mitigate | `handleAppLifecycleChange` in `GooseAppModel+Lifecycle.swift` line 10: `triggerForegroundBLESync()` present in active/foreground branch; no `overnightGuardActive` guard present; method rewritten from scratch |
| T-60-08 | Tampering | mitigate | Repo-wide grep of 11 deleted overnight symbols across `GooseSwift/` → 0 files; iOS simulator build clean with zero `error:` lines (confirmed in 60-03-SUMMARY.md human checkpoint) |
| T-60-09 | Elevation of Privilege | mitigate | `overnightGuardActive` removed from: `NotificationFrameParsing.swift` (struct field), `GooseAppModel+NotificationPipeline.swift` (factory, static method signatures, call sites); confirmed by git commit `a72ffba`; `grep -c overnightGuardActive GooseSwift/GooseAppModel+NotificationPipeline.swift` → 0; `grep -n overnightGuardActive GooseSwift/NotificationFrameParsing.swift` → 0 matches. Note: plan acceptance criterion stated 3 occurrences of `requiresMainParsedFrameHandling`; actual count is 2 (1 definition + 1 caller). This discrepancy is benign — the plan over-counted by treating the parameter in the old signature as a second call site. The parameter was removed; the single call site was updated. All entries of the old `overnightGuardActive:` argument label are confirmed absent |
| T-60-10 | Denial of Service | mitigate | `GooseAppModel+Lifecycle.swift` lines 20–30: UserDefaults flag `goose.swift.legacyOvernightDirectoryPurged` gates the purge; `try? FileManager.default.removeItem(at: url)` is best-effort silent; confined to `Documents/GooseSwift/OvernightGuard` within app container; flag set to `true` after removal so it runs once per install |
| T-60-SC | Tampering | accept | `import BackgroundTasks` and `import Foundation` are Apple system frameworks; no external package installs introduced; accepted risk documented below |

---

### Open Threat

| Threat ID | Category | Mitigation Expected | Files Searched | Finding |
|-----------|----------|---------------------|----------------|---------|
| T-60-03 | Denial of Service | `task.expirationHandler` set before any work; both connected and scan branches call `setTaskCompleted`; `scheduleNextBGAppRefresh` runs first | `GooseSwift/GooseAppModel+BandFirstSync.swift`, `GooseSwift/GooseSwiftApp.swift` | **OPEN — cold background launch gap** |

**T-60-03 Detailed Finding:**

The declared mitigation exists and is correctly implemented for the normal case (foreground-first launch): `GooseAppModel+BandFirstSync.swift` lines 39–60 confirm `scheduleNextBGAppRefresh()` runs first, `task.expirationHandler` is set before any work, and both the `ready` branch (line 51) and the scan branch (line 60) call `setTaskCompleted`.

However, the mitigation has a gap in the cold-background-launch scenario, explicitly flagged by the audit constraint (CR-01):

**Scenario:** iOS wakes the app exclusively for a `BGAppRefreshTask` with no prior foreground session (e.g., first-ever background run after install, or after memory eviction).

**Sequence:**
1. `GooseSwiftApp.init()` runs → `BGTaskScheduler.shared.register(...)` registers the handler correctly.
2. `nonisolated(unsafe) static weak var sharedModel` is declared `nil` at this point (`GooseSwiftApp.swift` line 12).
3. `GooseSwiftApp.sharedModel` is only assigned in `.onAppear` (`GooseSwiftApp.swift` line 34) — which executes when the SwiftUI view appears.
4. On a cold background launch, iOS invokes the registered BGTask handler callback before `.onAppear` has a chance to execute.
5. The handler closure dispatches to `@MainActor` and executes: `GooseSwiftApp.sharedModel?.handleBGAppRefresh(task: task as! BGAppRefreshTask)` — with `sharedModel == nil`, this is a Swift silent no-op.
6. `handleBGAppRefresh` is never called → `task.expirationHandler` is never set → `task.setTaskCompleted(success:)` is never called.
7. iOS BGTask specification: if the app does not call `setTaskCompleted`, the OS will eventually kill the process and may reduce the frequency of future background launches (throttling / BGTask DoS).

**Scope:** The gap affects only the cold-background-launch path. After any foreground session, `sharedModel` is populated and subsequent background launches are handled correctly.

**Impact:** iOS BGAppRefreshTask throttling — reduced frequency of background BLE sync. Not a crash, not a data leak. The severity aligns with the T-60-03 DoS category.

**Required action before shipping:** Either (a) assign `GooseSwiftApp.sharedModel` during `App.init()` rather than `.onAppear`, or (b) add a fallback in the handler closure to call `task.setTaskCompleted(success: false)` when `sharedModel` is nil, or (c) formally accept this residual risk in the accepted risks log below with justification.

---

## Unregistered Flags

The following threat flags were reported in SUMMARY.md files but have no separate mapping outside the declared threat register:

**60-02-SUMMARY.md Threat Surface Scan:** Reports T-60-03, T-60-04, T-60-05, T-60-06 as mitigated. All four map to registered threats — no unregistered surface.

**60-03-SUMMARY.md Threat Surface Scan:** Reports T-60-07, T-60-08, T-60-09, T-60-10 as mitigated. All four map to registered threats — no unregistered surface.

**60-01-SUMMARY.md Threat Flags:** None declared.

No unregistered flags.

---

## Accepted Risks Log

| Threat ID | Risk | Justification |
|-----------|------|---------------|
| T-60-02 | Retained `OvernightSQLiteMirrorQueue` with no callers | Property is a dormant declaration with no `enqueue` calls anywhere in `GooseSwift/`. No runtime cost. Retained intentionally per D-04 for potential future use. No security impact. |
| T-60-05 | `UserDefaults` cooldown timestamp corrupted or missing | The `as? Date` cast fails safe to `nil`, which causes the sync to proceed (benign: at worst one extra fetch). No crash. No data disclosure. |
| T-60-06 | Background BLE fetch exposes data | BGAppRefreshTask trigger reuses existing BLE pairing and GATT encryption model unchanged. No new data path or trust boundary. |
| T-60-SC | System framework imports (`BackgroundTasks`, `Foundation`, `OSLog`) | All are Apple system frameworks included in the iOS SDK. No external packages or supply chain risk introduced. |

---

## Verification Commands Run

```
# T-60-01
grep -v '^[[:space:]]*//' GooseSwift/GooseAppModel.swift | grep -c "overnightGuard"  → 0
grep -c "let overnightSQLiteMirror" GooseSwift/GooseAppModel.swift                    → 1
grep -c "struct OvernightGuard" GooseSwift/HealthPacketCaptureTypes.swift              → 0
test ! -f GooseSwift/GooseAppModel+OvernightRun.swift                                 → PASS
test ! -f GooseSwift/GooseAppModel+OvernightState.swift                               → PASS
test ! -f GooseSwift/GooseAppModel+OvernightRecovery.swift                            → PASS

# T-60-02
grep -rn "overnightSQLiteMirror" GooseSwift/ | grep -v GooseAppModel.swift            → 0 results

# T-60-03
grep -c "expirationHandler" GooseSwift/GooseAppModel+BandFirstSync.swift              → 1
grep -c "setTaskCompleted" GooseSwift/GooseAppModel+BandFirstSync.swift               → 4 (expiration + both branches)
grep -n "sharedModel" GooseSwift/GooseSwiftApp.swift                                  → set only in .onAppear (line 34)

# T-60-04
grep -n "stopScan" GooseSwift/GooseAppModel+BandFirstSync.swift                       → lines 43, 59

# T-60-07
grep -c "triggerForegroundBLESync()" GooseSwift/GooseAppModel+Lifecycle.swift         → 1 (in active branch)
grep -c "overnightGuardActive" GooseSwift/GooseAppModel+Lifecycle.swift               → 0

# T-60-08
grep -rl "<deleted-symbols>" GooseSwift/ | wc -l                                      → 0

# T-60-09
grep -c "overnightGuardActive" GooseSwift/GooseAppModel+NotificationPipeline.swift    → 0
grep -c "overnightGuardActive" GooseSwift/NotificationFrameParsing.swift              → 0

# T-60-10
grep -n "legacyOvernightDirectoryPurged" GooseSwift/GooseAppModel+Lifecycle.swift     → lines 20, 30
grep -c "FileManager.default.removeItem" GooseSwift/GooseAppModel+Lifecycle.swift     → 1
```

---

## Remediation Audit — 2026-06-11

### T-60-03 — BGTask abandoned on cold background launch

**Status before:** OPEN — `handleBGAppRefresh` never called when `sharedModel` is nil (`.onAppear` not yet fired on cold launch); `setTaskCompleted` never invoked; iOS throttles future BGAppRefresh.

**Fix applied:** `GooseSwift/GooseSwiftApp.swift` — BGTaskScheduler handler rewritten (commit `58a096e`):
- `task as! BGAppRefreshTask` → `guard let bgTask = task as? BGAppRefreshTask` (fixes CR-02 force cast)
- `sharedModel?.handleBGAppRefresh(...)` → explicit nil guard with `bgTask.setTaskCompleted(success: false)` fallback (fixes CR-01 cold launch abandonment)

**Build verification:** iOS Simulator build SUCCEEDED with zero errors after fix.

**Status after:** CLOSED (mitigate) — `setTaskCompleted` is always called regardless of `sharedModel` state.

| Metric | Count |
|--------|-------|
| Threats found | 11 |
| Closed | 11 |
| Open | 0 |
