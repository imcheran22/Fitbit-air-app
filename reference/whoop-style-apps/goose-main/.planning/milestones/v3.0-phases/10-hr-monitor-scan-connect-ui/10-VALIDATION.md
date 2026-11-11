---
phase: 10
slug: hr-monitor-scan-connect-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (GooseSwiftTests target) + `cargo test` (Rust) |
| **Config file** | `GooseSwiftTests/Info.plist` |
| **Quick run command** | `cargo test -p goose-core` |
| **Full suite command** | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:GooseSwiftTests` |
| **Estimated runtime** | ~30s (Rust), ~120s (Xcode full) |

---

## Sampling Rate

- **After every task commit:** Run `cargo test -p goose-core`
- **After every plan wave:** Build GooseSwift target to verify compilation
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (Rust), 120 seconds (Xcode)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | WEAR-04 | — | device names sanitised with prefix(64) | unit | `xcodebuild test … -only-testing:GooseSwiftTests/HRMonitorStateTests` | ❌ Wave 0 | ⬜ pending |
| 10-01-02 | 01 | 1 | WEAR-04 | — | discoveredHRDevices @Published propagates | unit | `xcodebuild test … -only-testing:GooseSwiftTests/HRMonitorStateTests` | ❌ Wave 0 | ⬜ pending |
| 10-02-01 | 02 | 2 | WEAR-05 | — | hrConnectionState transitions correctly | unit | `xcodebuild test … -only-testing:GooseSwiftTests/HRMonitorStateTests` | ❌ Wave 0 | ⬜ pending |
| 10-02-02 | 02 | 2 | WEAR-04 | — | Scan list renders correctly | manual | — | N/A | ⬜ pending |
| 10-02-03 | 02 | 2 | WEAR-05 | — | Tap-to-connect sheet appears | manual | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `GooseSwiftTests/HRMonitorStateTests.swift` — unit tests for `hrConnectionState` transitions ("disconnected" → "connecting" → "connected") and `@Published var discoveredHRDevices` promotion

*Existing `GooseBLETypesTests.swift` and `WearableDescriptorTests.swift` cover types used by this phase but do not cover new state promotion or transitions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scan list populates from live BLE scan | WEAR-04 | CoreBluetooth requires real hardware or BLE simulator | Launch app, open More > HR Monitor, verify devices appear in list with name and RSSI |
| Tap device opens connection sheet | WEAR-05 | BLE hardware required | Tap any discovered device, verify sheet appears with device name and Connect button |
| Connect button initiates connection | WEAR-05 | BLE hardware required | Tap Connect in sheet, verify spinner appears inline, verify connected state shows BPM |
| Disconnect returns to scan state | WEAR-05 | BLE hardware required | Tap Disconnect, verify scan restarts and connected state disappears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
