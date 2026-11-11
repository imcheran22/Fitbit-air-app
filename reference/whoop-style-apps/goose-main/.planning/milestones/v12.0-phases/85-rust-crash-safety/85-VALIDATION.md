---
phase: 85
slug: rust-crash-safety
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-14
---

# Phase 85 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in (`cargo test`) + Clippy |
| **Config file** | `Rust/core/Cargo.toml` |
| **Quick run command** | `cargo clippy --lib -- -D clippy::unwrap_used && cargo test --locked --lib` |
| **Full suite command** | `cargo test --locked` |
| **Estimated runtime** | ~5–10 seconds (lib), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cargo clippy --lib -- -D clippy::unwrap_used && cargo test --locked --lib`
- **After every plan wave:** Run `cargo test --locked` (full suite including 45 integration test files)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds (lib)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 85-01-01 | 01 | 1 | ARCH-03 | — | deny(clippy::unwrap_used) compiles | lint | `cargo clippy --lib -- -D clippy::unwrap_used` | ✅ (clippy) | ⬜ pending |
| 85-02-01 | 02 | 2 | ARCH-03 | — | bridge.rs test unwraps → .expect() | code review | `grep -c '\.unwrap()' Rust/core/src/bridge.rs` | ✅ | ⬜ pending |
| 85-03-01 | 03 | 2 | ARCH-03 | — | store.rs test unwraps → .expect() | code review | `grep -c '\.unwrap()' Rust/core/src/store.rs` | ✅ | ⬜ pending |
| 85-04-01 | 04 | 3 | ARCH-03 | — | metrics.rs production unwraps eliminated | lint | `cargo clippy --lib -- -D clippy::unwrap_used` | ✅ | ⬜ pending |
| 85-05-01 | 05 | 3 | ARCH-03 | — | small files production unwraps eliminated | lint | `cargo clippy --lib -- -D clippy::unwrap_used` | ✅ | ⬜ pending |
| 85-06-01 | 06 | 4 | ARCH-03 | — | zero violations, all tests green | lint + unit | `cargo clippy --lib -- -D clippy::unwrap_used && cargo test --locked` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| catch_unwind exists at FFI boundary | ARCH-03 SC2 | Read-only verification | `grep -n 'catch_unwind' Rust/core/src/bridge.rs` confirms line 3107 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
