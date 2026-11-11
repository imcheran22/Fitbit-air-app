---
phase: 101-hps-telemetry-coach-crash-protocol-cleanup
slug: hps-telemetry-coach-crash-protocol-cleanup
status: complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-21
---

# Phase 101 — Validation Strategy

> Per-phase validation contract reconstructed from PLAN and SUMMARY artifacts (State B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Rust)** | `cargo test` (built-in, Edition 2024, MSRV 1.96) |
| **Framework (Swift)** | `xcodebuild test` — `GooseSwiftTests` target |
| **Config file** | `Rust/core/Cargo.toml` (Cargo.lock committed) |
| **Quick run command** | `cargo test --locked --manifest-path Rust/core/Cargo.toml -- sync_telemetry bridge_methods_constant domain_gap data_packet_domain_24` |
| **Full suite command** | `cargo test --locked --manifest-path Rust/core/Cargo.toml` |
| **Estimated runtime** | ~60–90 seconds (full Rust suite) |

---

## Sampling Rate

- **After every task commit:** Run quick Rust filter command above
- **After every plan wave:** Run full `cargo test --locked`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 101-01-01 | 01 | 1 | SYNC-12 | T-101-01 | sync_telemetry rows are append-only diagnostic data; no user-controlled session_id | integration | `cargo test --locked --manifest-path Rust/core/Cargo.toml --test sync_telemetry_round_trip` | ✅ | ✅ green |
| 101-01-02 | 01 | 1 | SYNC-12 | T-101-02 | bridge dispatcher rejects unknown methods before dispatch | unit | `cargo test --locked --manifest-path Rust/core/Cargo.toml -- bridge_methods_constant_matches_dispatcher bridge_methods_constant_is_sorted_and_unique` | ✅ | ✅ green |
| 101-01-03 | 01 | 1 | SYNC-12 | T-101-03 | Swift burst instrumentation — bytes accumulate, historyEnd emits log + bridge call | manual | Run app on simulator; trigger historical sync; check Debug > Logs for `hps.telemetry` entries | N/A (no Swift unit test) | ✅ manual-verified |
| 101-02-01 | 02 | 1 | BUG-COACH-01 | T-101-02-01 | At most one OAuth poll loop active; prior task cancelled before new one starts | manual | Rapid-tap "Connect Codex" 4×; UI must not freeze | N/A (no Swift unit test) | ✅ simulator-verified |
| 101-03-01 | 03 | 1 | PROTO-10 | T-101-03-01 | data_packet_domain(24) returns "v24_biometric_stream", not "normal_history_with_hr_marker" | unit | `cargo test --locked --manifest-path Rust/core/Cargo.toml -- data_packet_domain_24` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework was installed. Rust integration tests and the `cargo test` runner were already in place; the new test files added are:

- `Rust/core/tests/sync_telemetry_round_trip.rs` — SYNC-12 round-trip (created in Plan 01)
- `Rust/core/tests/protocol_tests.rs` — extended with `data_packet_domain_24` (added by validate-phase, Plan 03 gap)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Swift burst instrumentation: `burstBytesReceived` accumulates per BLE notification value; `historyEnd` emits `ble.record(hps.telemetry)` and dispatches `sync.record_hps_telemetry` bridge call | SYNC-12 | No Rust bridge mock for CoreBluetooth notification path in Swift unit tests; would require a hardware or simulator BLE environment | Run app on iPhone Simulator; trigger historical sync from a paired WHOOP; check Debug > Logs for lines containing `hps.telemetry`; then query `SELECT * FROM sync_telemetry;` via SQLite inspector |
| Coach sign-in task cancellation: rapid "Connect Codex" taps do not stack polling loops | BUG-COACH-01 | Requires live Codex OAuth endpoint interaction; cannot be mocked without network stub infrastructure | Run app on iPhone Simulator (iPhone 16/17, iOS 26); navigate Coach tab; tap sign-in button 4× rapidly; UI must remain responsive; no hung "Waiting for approval" state |

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved (automated) | 1 |
| Escalated to manual-only | 0 |

### Gap resolved: PROTO-10 direct domain assertion

**Gap:** No test asserted `data_packet_domain(24) == "v24_biometric_stream"` directly. The existing `domain_gap_packet_ks_produce_unknown` test in `protocol_tests.rs` covers gap values `{11, 16, 19, 20, 22, 25, 26}` but not packet_k=24's new domain string.

**Resolution:** Added `data_packet_domain_24` test to `Rust/core/tests/protocol_tests.rs` asserting the split arm produces `Some("v24_biometric_stream")` for packet_k=24 and `Some("normal_history_with_hr_marker")` for packet_k=9, 12, 18.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are in Manual-Only table
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (101-01-01, 101-01-02 are automated; 101-01-03 and 101-02-01 manual-only are isolated gaps covered by simulator UAT in SUMMARY)
- [x] Wave 0 — no new framework installs needed; existing Cargo infra used
- [x] No watch-mode flags
- [x] Feedback latency < 90s for Rust suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21
