---
phase: 98
slug: gen5-historical-sync-routing-hps-ring-buffer
status: partial
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-21
---

# Phase 98 — Validation Strategy

> Nyquist validation for Gen5 historical sync dispatch routing (SYNC-08) and HPS ring buffer parsing (SYNC-10).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (Swift) + `cargo test` (Rust) |
| **Config file** | `GooseSwift.xcodeproj` / `Rust/core/Cargo.toml` |
| **Quick run command** | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:GooseSwiftTests/HistoricalRangeParsingTests` |
| **Full suite command** | `xcodebuild test -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` |
| **Rust suite** | `cd Rust/core && cargo test --locked` |
| **Estimated runtime** | ~30s (targeted) / ~120s (full suite) |

> Note: `GooseSwiftTests` target has pre-existing build failures in `HRMonitorStateTests.swift` and `GooseBLETypesTests.swift` (unrelated to Phase 98). The `-only-testing:GooseSwiftTests/HistoricalRangeParsingTests` filter discovers 11 tests correctly despite the pre-existing failures; fixing those failures is tracked separately.

---

## Sampling Rate

- **After every task commit:** `xcodebuild test ... -only-testing:GooseSwiftTests/HistoricalRangeParsingTests`
- **After every plan wave:** Full Rust + targeted Swift suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (targeted run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | SYNC-08 | T-98-01 | `isHistoricalSyncing` read on CB queue — benign race documented by SAFETY comment | static | `grep -n "SAFETY: isHistoricalSyncing" GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift` | ✅ | ✅ green |
| 98-01-02 | 01 | 1 | SYNC-08 | T-98-02 | Packet types 47/52 route to main handler when syncing; skip counter not incremented | static | `grep -n "historicalPacketsReceivedThisSync" GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` | ✅ | ✅ green |
| 98-01-03 | 01 | 1 | SYNC-08 | — | GitHub issue #24 closed | manual | `gh issue view 24 --json state -q .state` | N/A | ✅ green |
| 98-02-01 | 02 | 1 | SYNC-10 | T-98-10 | Ring fields parsed from 37-byte body; nil when body < 37 bytes (bounds-checked) | unit | `xcodebuild test ... -only-testing:GooseSwiftTests/HistoricalRangeParsingTests` | ✅ | ✅ green |
| 98-02-01b | 02 | 1 | SYNC-10 | T-98-10 | `ringWrapped = currentPage < readPointer`; `pagesBehindCorrected` formula (wrapped + non-wrapped) | unit | `xcodebuild test ... -only-testing:GooseSwiftTests/HistoricalRangeParsingTests` | ✅ | ✅ green |
| 98-02-01c | 02 | 1 | SYNC-10 | — | Existing `pagesBehind` computed property unchanged when ring fields present | unit | `xcodebuild test ... -only-testing:GooseSwiftTests/HistoricalRangeParsingTests` | ✅ | ✅ green |
| 98-02-02 | 02 | 1 | SYNC-10 | T-98-11 | `historical_sync.get_data_range.ring` log emitted in both branches (present + absent) | static | `grep -n "historical_sync.get_data_range.ring" GooseSwift/CoreBluetoothBLETransport+Parsing.swift` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

8 new unit tests added to `GooseSwiftTests/HistoricalRangeParsingTests.swift` in this validation pass:
- `testRingBufferFieldsParsedWhenBodyIs37BytesOrMore`
- `testRingBufferFieldsNilWhenBodyShorterThan37Bytes`
- `testRingWrappedTrueWhenCurrentPageLessThanReadPointer`
- `testRingWrappedFalseWhenCurrentPageGreaterThanOrEqualToReadPointer`
- `testPagesBehindCorrectedWrappedCase`
- `testPagesBehindCorrectedNonWrappedCase`
- `testPagesBehindCorrectedNilWhenRingFieldsAbsent`
- `testExistingPagesBehindUnchangedWhenRingFieldsPresent`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dispatch gate routes types 47/52 to `handleHistoricalSyncValue` on main thread at runtime | SYNC-08 | Requires CoreBluetooth hardware; CBCentralManager cannot be instantiated in unit test target without entitlements | Connect Gen5 WHOOP device; confirm `historicalPacketsReceivedThisSync` increments during active sync via `ble.record()` logs |
| GitHub issue #24 state = CLOSED COMPLETED | SYNC-08 | External GitHub API state | `gh issue view 24 --json state,stateReason` |
| `historical_sync.get_data_range.ring` log fires at runtime with correct ring field values | SYNC-10 | BLE hardware path; `emitHistoricalRangeTelemetry` only invoked during live GET_DATA_RANGE response | Connect Gen5 device; observe WebSocket debug logs for `ring_capacity=N` entry |
| GitHub issue #160 state = CLOSED COMPLETED | SYNC-10 | External GitHub API state | `gh issue view 160 --json state,stateReason` |

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 4 automated, 4 manual-only |
| Resolved automated | 4 (8 new unit tests added to HistoricalRangeParsingTests.swift) |
| Resolved manual | 4 (already verified in VERIFICATION.md) |
| Escalated | 0 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual-only classification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (8 new unit tests added)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (targeted run)
- [ ] `nyquist_compliant: true` — not yet set; blocked by pre-existing `HRMonitorStateTests.swift` build failures preventing full test suite run

**Approval:** partial 2026-06-21 — all SYNC-08/SYNC-10 behaviors verified; pre-existing build failures in unrelated test files prevent full nyquist_compliant sign-off
