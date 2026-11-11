---
phase: 84
slug: gen4-battery
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-14
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in (`cargo test`) |
| **Config file** | `Rust/core/Cargo.lock` |
| **Quick run command** | `cargo test --locked -q -p goose-core battery 2>&1 \| tail -5` |
| **Full suite command** | `cargo test --locked` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo test --locked -q 2>&1 | tail -5`
- **After every plan wave:** Run `cargo test --locked`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 84-01-T1 | 01 | 1 | BAT-01 | T-84-01 | raw ≤ 1100 guard rejects out-of-range values | unit (Rust) | `cargo test --locked battery_parse` | ❌ W0 | ⬜ pending |
| 84-01-T2 | 01 | 1 | BAT-02 | T-84-02 | count ≥ 4 guard rejects short payloads | unit (Rust) | `cargo test --locked battery_parse` | ❌ W0 | ⬜ pending |
| 84-02-T1 | 02 | 2 | BAT-01 | — | N/A | source assertion | `grep -n "event48.battery" GooseSwift/GooseAppModel+NotificationPipeline.swift` | ❌ W0 | ⬜ pending |
| 84-02-T2 | 02 | 2 | BAT-01 | — | N/A | source assertion | `grep -n "batteryViaEvent48.*wireProtocol.*gen4\|wireProtocol.*gen4.*batteryViaEvent48" GooseSwift/` | ❌ W0 | ⬜ pending |
| 84-03-T1 | 03 | 2 | BAT-02 | — | N/A | source assertion | `grep -n "cmd26.battery" GooseSwift/` | ❌ W0 | ⬜ pending |
| 84-03-T2 | 03 | 2 | BAT-02 | — | N/A | source assertion | `grep -n "handleCmd26BatteryResponse\|sendCmd26Battery" GooseSwift/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Rust/core/src/bridge.rs` (or `Rust/core/src/battery.rs`) — `#[cfg(test)] mod battery_parse_tests` covering:
  - BAT-01: valid Event-48 payload → correct battery_pct
  - BAT-01: raw > 1100 → Err returned
  - BAT-02: valid Cmd 26 payload (≥ 4 bytes) → correct battery_pct
  - BAT-02: payload.len() < 4 → Err returned

*Wave 0 is Plan 84-01 (Rust parsing functions + unit tests). Must complete before Wave 2 Swift wiring tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gen4 battery % visible in UI on real device after connection | BAT-01, BAT-02 | Requires physical WHOOP 4.0 hardware | Connect Gen4 device, observe `batteryLevelPercent` in DeviceView and HomeDashboardView |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
