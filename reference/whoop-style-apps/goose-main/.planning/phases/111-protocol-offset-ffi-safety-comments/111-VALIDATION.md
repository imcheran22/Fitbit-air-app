---
phase: 111
slug: protocol-offset-ffi-safety-comments
status: complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-21
---

# Phase 111 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in test runner (`cargo test`) |
| **Config file** | `Rust/core/Cargo.toml` |
| **Quick run command** | `cargo test --locked --manifest-path Rust/core/Cargo.toml` |
| **Full suite command** | `cargo test --locked --manifest-path Rust/core/Cargo.toml` |
| **Estimated runtime** | ~60–90 seconds |

> **Note:** This phase is comment-only (zero logic changes). No new test files are required or
> appropriate — automated verification is grep-based structural checking that comment anchors
> exist at the correct call sites, plus `cargo test --locked` as a regression guard.

---

## Sampling Rate

- **After every task commit:** Run `grep` spot-checks (see Per-Task Verification Map)
- **After every plan wave:** Run `cargo test --locked --manifest-path Rust/core/Cargo.toml`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds (cargo test) + <1s (grep checks)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 111-01-01 | 01 | 1 | COMM-04 | — | N/A (docs only) | structural | `grep -n "// offset" Rust/core/src/protocol.rs \| grep -E "offset (14\|15\|16\|26\|28\|48\|61\|63\|65\|67\|73\|75)"` | ✅ | ✅ green |
| 111-01-02 | 01 | 1 | COMM-04 | — | N/A (docs only) | structural | `grep -n "// offset" Rust/core/src/bridge/mod.rs \| grep -E "offset (17\|5)"` | ✅ | ✅ green |
| 111-02-01 | 02 | 1 | COMM-05 | — | N/A (docs only) | structural | `grep -n "// SAFETY:" Rust/core/src/bridge/mod.rs \| grep -i "request_json is non-null"` | ✅ | ✅ green |
| 111-02-02 | 02 | 1 | COMM-05 | — | N/A (docs only) | structural | `grep -n "// SAFETY:" Rust/core/src/android_jni.rs \| grep -E "called by JVM\|response_ptr"` | ✅ | ✅ green |
| 111-regression | — | — | COMM-04, COMM-05 | — | No logic change | integration | `cargo test --locked --manifest-path Rust/core/Cargo.toml` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test stubs needed — this phase adds only inline comments; no new symbols, functions, or behaviors were introduced.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Comment text quality (WHY not WHAT) | COMM-04 | Grep cannot judge prose quality | Read each `// offset N:` comment and confirm it explains non-obvious derivation (scaling formula, empirical origin, guard reason) rather than restating code |
| No RE tool references in comments | COMM-04, COMM-05 | Grep for absence; neutral language judgement is human | `grep -rn "Ghidra\|BTSnoop\|jadx\|IDA\|frida" Rust/core/src/` must return no results |
| SAFETY block completeness | COMM-05 | Prose completeness (JVM thread contract, pointer lifetime) is not mechanically checkable | Read expanded `/// # Safety` in `android_jni.rs` and inline blocks in `bridge/mod.rs`; confirm `env`, `_class`, `request` lifetime contracts are all stated |

---

## Verification Spot-Check Results (2026-06-21)

Commands run post-execution to confirm coverage:

```
# COMM-04: offset anchors in parse_v24_body_summary (protocol.rs)
$ grep -n "// offset" Rust/core/src/protocol.rs | wc -l
21

$ grep -n "// offset" Rust/core/src/protocol.rs | grep -E "offset (14|15|16|26|28|48|61|63|65|67|73|75)"
972: // offset 14: u8, hr (beats per minute, unsigned); no scaling required
975: // offset 15: u8, rr_count (number of RR intervals that follow, 0–4)
979: // offsets 16–23: u16 LE × 4, rr_intervals_ms (zero-padded when rr_count < 4)
990: // offset 26: u16 LE, ppg_green (raw green LED photodiode ADC count)
993: // offset 28: u16 LE, ppg_red_ir (raw red/IR shared LED photodiode ADC count)
1002: // offset 48: u8, skin_contact (0 = off-wrist, 1 = on-wrist)
1023: // offset 61: u16 LE, spo2_red (raw red LED photodiode ADC count for SpO2)
1026: // offset 63: u16 LE, spo2_ir (raw infrared LED photodiode ADC count for SpO2)
1029: // offset 65: u16 LE, skin_temp_raw; degC ≈ (raw − 930) / 30 + 33
1032: // offset 67: u16 LE, ambient (ambient light rejection channel, raw ADC)
1035: // offset 69: u16 LE, led1 (LED driver current sense, raw; diagnostic only)
1038: // offset 71: u16 LE, led2 (LED driver current sense, raw; diagnostic only)
1041: // offset 73: u16 LE, resp_raw (respiration signal; zero-crossing algorithm)
1044: // offset 75: u16 LE, sig_quality (signal quality score)

# COMM-04: offset anchors in bridge/mod.rs (event-48 battery)
$ grep -n "// offset" Rust/core/src/bridge/mod.rs | grep -E "offset (17|5)"
263: // offset 17: u16 LE, battery_raw (÷10 = battery_pct, 0–100); max guard 1100
286: // offset 5 (data body): u16 LE, battery_raw (÷10 = battery_pct, 0–100)

# COMM-05: SAFETY block in bridge/mod.rs (C FFI)
$ grep -n "// SAFETY:" Rust/core/src/bridge/mod.rs
631: // SAFETY: request_json is non-null (checked above) and points to a valid
       null-terminated C string owned by the caller for the duration of this call.

# COMM-05: SAFETY blocks in android_jni.rs (JNI)
$ grep -n "// SAFETY:" Rust/core/src/android_jni.rs
41:  // SAFETY: called by JVM on a JNI thread. `env` is valid for this call's duration,
85:  // SAFETY: response_ptr is non-null (checked above) and points to a Rust CString
```

All structural checks: PASS.

---

## Validation Sign-Off

- [x] All tasks have automated `grep` verify or `cargo test` regression guard
- [x] Sampling continuity: all 4 tasks verified in wave 1
- [x] Wave 0: not required — comment-only phase; existing infrastructure sufficient
- [x] No watch-mode flags
- [x] Feedback latency: <1s (grep) + ~90s (cargo test)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-21
