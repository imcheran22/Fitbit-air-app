---
phase: 108
slug: battery-level-gen4-gen5
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
---

# Phase 108 — Validation Strategy

> Per-phase validation contract for BAT-01: battery level pipeline for Gen4, Gen5, and MG.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` (integration tests via JSON bridge dispatch) |
| **Config file** | `Rust/core/Cargo.toml` (MSRV 1.96, edition 2024) |
| **Quick run command** | `cd Rust/core && cargo test --locked --test battery_parsing` |
| **Full suite command** | `cd Rust/core && cargo test --locked` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd Rust/core && cargo test --locked --test battery_parsing`
- **After every plan wave:** Run `cd Rust/core && cargo test --locked`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 108-01-01 | 01 | 1 | BAT-01 | T-108-01 | `event48_battery_pct` key matches Swift reader; integer clamped 0-100 | integration | `cargo test --locked --test battery_parsing -- test_parse_event48_battery_valid` | ✅ | ✅ green |
| 108-01-01 | 01 | 1 | BAT-01 | T-108-01 | raw > 1100 guard rejects out-of-range payload | integration | `cargo test --locked --test battery_parsing -- test_parse_event48_battery_boundary_guard` | ✅ | ✅ green |
| 108-01-02 | 01 | 1 | BAT-01 | — | cmd-26 auto-send called on Gen4 connection | manual | — see Manual-Only — | ❌ | ⚠️ manual |
| 108-01-03 | 01 | 1 | BAT-01 | T-108-02 | `battery_pct` key correct; payload >= 7 bytes required | integration | `cargo test --locked --test battery_parsing -- test_parse_cmd26_battery_valid test_parse_cmd26_battery_too_short` | ✅ | ✅ green |
| 108-01-04 | 01 | 1 | BAT-01 | — | DeviceConnectionHeader renders combined Gen X · Y% chip | manual | — see Manual-Only — | ❌ | ⚠️ manual |
| 108-01-05 | 01 | 1 | BAT-01 | — | Full build succeeds; all battery tests pass | integration | `cargo test --locked` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ manual-only*

---

## Wave 0 Requirements

Existing infrastructure covers all automatable phase requirements.

`Rust/core/tests/battery_parsing.rs` was created as part of phase execution (Task 3) — it contains 4 integration tests covering event-48 and cmd-26 battery parsing via full JSON bridge dispatch.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| cmd-26 auto-sent at Gen4 connection | BAT-01 | BLE connection-time side-effect; requires physical WHOOP Gen4 device to observe | Connect a Gen4 WHOOP; confirm battery % appears in Home tab device chip within first BLE cycle (before first event-48, which fires every ~8 min). Check that `sendCmd26BatteryRequest` is called in `CoreBluetoothBLETransport+Commands.swift` post-auth path. |
| DeviceConnectionHeader renders `Gen X · Y%` combined chip | BAT-01 (D-02) | SwiftUI rendering requires simulator or device; snapshot testing OOS for this phase | Run app on iOS Simulator with a mocked `batteryLevelPercent` (or real device); verify Home tab device chip shows format `"WHOOP 5.0 · 78%"` (or equivalent). Wiring is at `DeviceView.swift` — `DeviceConnectionHeader(generation:batteryPercent:)`. |

---

## Test Files Produced

| File | Description | Tests |
|------|-------------|-------|
| `Rust/core/tests/battery_parsing.rs` | Integration tests for battery bridge methods via JSON dispatch | 4 (all pass) |

### Tests Covered

- `test_parse_event48_battery_valid` — valid 30-byte event-48 payload, raw=850 → `event48_battery_pct=85`
- `test_parse_event48_battery_boundary_guard` — raw=1101 exceeds guard; bridge returns error
- `test_parse_cmd26_battery_valid` — valid cmd-26 response payload, raw=850 → `battery_pct=85`
- `test_parse_cmd26_battery_too_short` — 6-byte payload (< 7 required) → bridge returns error

---

## Validation Sign-Off

- [x] All tasks have automated verify or Manual-Only classification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0: `battery_parsing.rs` created during phase execution — covers all code-testable requirements
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Requirements in scope | 1 (BAT-01) |
| Tasks audited | 5 |
| Gaps found | 2 |
| Resolved (automated) | 4 tests across 2 tasks |
| Manual-only (hardware/UI gated) | 2 |
| Test files confirmed present | 1 |
