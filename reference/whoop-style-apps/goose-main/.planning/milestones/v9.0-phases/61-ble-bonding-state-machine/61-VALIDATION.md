---
phase: 61
slug: ble-bonding-state-machine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Xcode build + simulator launch (no Swift test target in project) |
| **Config file** | GooseSwift.xcodeproj |
| **Quick run command** | `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 17' build 2>&1 | grep -E "^error:|BUILD"` |
| **Full suite command** | Build + simulator boot + app launch + manual BLE state observation |
| **Estimated runtime** | ~60 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run quick build command
- **After every plan wave:** Full build + simulator launch, verify no crash
- **Before `/gsd-verify-work`:** Build must be green, app must launch clean
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | BLE-BOND-01 | — | GooseBLEBondingState enum defines 5 cases | build | `grep -r "GooseBLEBondingState" GooseSwift/ \| wc -l` | ❌ W0 | ⬜ pending |
| 61-01-02 | 01 | 1 | BLE-BOND-01 | — | GooseBLEBondingManager class exists | build | `grep -l "GooseBLEBondingManager" GooseSwift/` | ❌ W0 | ⬜ pending |
| 61-01-03 | 01 | 2 | BLE-BOND-01 | — | connectionState still compiles at all 25+ sites | build | xcodebuild build — zero errors | ❌ W0 | ⬜ pending |
| 61-01-04 | 01 | 3 | BLE-BOND-01 | — | Bond loss (CBError 14) triggers .notStarted transition | manual | CBError simulation / device BT toggle | — | ⬜ pending |
| 61-01-05 | 01 | 3 | BLE-BOND-01 | — | UserDefaults key goose.swift.ble.bondingState persists across kills | manual | Kill app, relaunch, check UserDefaults via debug | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `GooseSwift/GooseBLEBondingManager.swift` — new file with GooseBLEBondingState enum + GooseBLEBondingManager class stubs
- [ ] Build must pass with zero errors after Wave 0 (before any integration)

*No test framework to install — project has no Swift test target.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bond loss auto-recovery | BLE-BOND-01 | Requires physical BT toggle or peripheral pairing info removal | Toggle BT off/on on simulator while app is running; verify bonding manager re-enters .notStarted → .started flow |
| BT reset recovery | BLE-BOND-01 | Requires iOS restart or Airplane mode cycle | Restart simulator; verify app reads persisted state and re-enters bonding flow |
| bondingState observable from GooseAppModel | BLE-BOND-01 | No automated UI assertion without UITest target | Verify `ble.bondingManager.bondingState` is accessible from GooseAppModel context |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
