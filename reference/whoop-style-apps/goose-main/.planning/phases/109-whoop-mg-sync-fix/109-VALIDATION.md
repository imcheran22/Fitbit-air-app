---
phase: 109
slug: whoop-mg-sync-fix
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
---

# Phase 109 — Validation Strategy

> Per-phase validation contract for Nyquist audit of MG sync logging hardening (MG-03).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (Swift) |
| **Config file** | GooseSwift.xcodeproj (GooseSwiftTests target) |
| **Quick run command** | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination "platform=iOS Simulator,name=iPhone 16" -only-testing:GooseSwiftTests/DeviceCatalogTests CODE_SIGNING_ALLOWED=NO 2>&1 \| grep -E "Test Suite|passed|failed"` |
| **Full suite command** | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination "platform=iOS Simulator,name=iPhone 16" CODE_SIGNING_ALLOWED=NO 2>&1 \| grep -E "Test Suite|passed|failed"` |
| **Estimated runtime** | ~90 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run DeviceCatalogTests quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 109-01-01 | 01 | 1 | MG-03: generationLabel="mg" for WHOOP_MG | — | Logging label accurate; no logic change | unit | `xcodebuild test … -only-testing:GooseSwiftTests/DeviceCatalogTests/test_generationLabel_whoopMG_returnsMg` | ✅ | ✅ green |
| 109-01-02 | 01 | 1 | MG-03: historicalDeviceType="WHOOP_MG" for WHOOP_MG | — | Bridge device_type field accurate | unit | `xcodebuild test … -only-testing:GooseSwiftTests/DeviceCatalogTests/test_historicalDeviceType_whoopMG_returnsWhoopMG` | ✅ | ✅ green |
| 109-01-03 | 01 | 1 | MG-03: displayGeneration no regression (still "MG") | — | UI display unaffected | unit | `xcodebuild test … -only-testing:GooseSwiftTests/DeviceCatalogTests/test_displayGeneration_whoopMG_returnsMG` | ✅ | ✅ green |
| 109-01-04 | 01 | 1 | MG-03: usesPageSequenceSync no regression (false for MG) | — | MG still routes to Gen5 stream path | unit | `xcodebuild test … -only-testing:GooseSwiftTests/DeviceCatalogTests/test_usesPageSequenceSync_whoopMG_returnsFalse` | ✅ | ✅ green |
| 109-02-01 | 01 | 1 | Hardware gate comment present | — | No RE/Ghidra/APK text in comment block | grep | `grep "hardware_gate: MG historical sync" GooseSwift/CoreBluetoothBLETransport+Commands.swift` | ✅ | ✅ green |
| 109-02-02 | 01 | 1 | Name heuristic unchanged (D-02) | — | MG detection via peripheral name preserved | grep | `grep "peripheral.name?.lowercased().contains(\" mg\")" GooseSwift/CoreBluetoothBLETransport+Commands.swift` | ✅ | ✅ green |
| 109-03-01 | 01 | 1 | GitHub issue #22 comment posted | — | Neutral language; no internal class names | manual | See Manual-Only section | n/a | ✅ verified |
| 109-04-01 | 01 | 1 | xcodebuild BUILD SUCCEEDED | — | Zero compile errors from DeviceCatalog changes | manual | `xcodebuild build … 2>&1 \| grep "BUILD SUCCEEDED"` | n/a | ✅ verified |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `GooseSwiftTests/DeviceCatalogTests.swift` — 10 unit tests covering MG-03 requirements

*All automated tests are new in this phase. No additional infrastructure required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub issue #22 has neutral progress comment | MG-03 (D-05 communication) | External GitHub side effect; not automatable in unit tests | `gh issue view 22 --repo tigercraft4/goose --comments` — confirm comment at https://github.com/tigercraft4/goose/issues/22#issuecomment-4762870987 contains "hardware testing" and "What remains hardware-gated" |
| xcodebuild BUILD SUCCEEDED with MG changes | MG-03 (build gate) | Requires iOS simulator environment | `xcodebuild build -project GooseSwift.xcodeproj -scheme GooseSwift -destination "platform=iOS Simulator,name=iPhone 16" CODE_SIGNING_ALLOWED=NO 2>&1 \| grep -E "BUILD SUCCEEDED\|error:"` |
| Physical WHOOP MG packet delivery | MG-03 (hardware gate) | Requires physical WHOOP MG hardware | Connect physical MG device, trigger historical sync after recording workout, confirm packets arrive |

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 4 |
| Resolved (automated) | 4 |
| Escalated to manual-only | 0 |
| Pre-existing manual-only | 3 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual-only classification
- [x] Sampling continuity: all automated tasks covered in single wave
- [x] Wave 0 covers all MISSING references (DeviceCatalogTests.swift created)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21
