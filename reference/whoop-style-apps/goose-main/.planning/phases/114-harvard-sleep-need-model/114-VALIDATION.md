---
phase: 114
slug: harvard-sleep-need-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 114 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` |
| **Config file** | `Rust/core/Cargo.toml` |
| **Quick run command** | `cd Rust/core && cargo test --locked sleep_need 2>&1 | tail -20` |
| **Full suite command** | `cd Rust/core && cargo test --locked 2>&1 | tail -20` |
| **Estimated runtime** | ~60 seconds (cold), ~15 seconds (warm) |

---

## Sampling Rate

- **After every task commit:** Run `cd Rust/core && cargo test --locked sleep_need 2>&1 | tail -20`
- **After every plan wave:** Run `cd Rust/core && cargo test --locked 2>&1 | tail -20`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 114-01-01 | 01 | 1 | SLP-NEED-01 | unit | `cargo test --locked sleep_need::tests::age_bracket` | ⬜ pending |
| 114-01-02 | 01 | 1 | SLP-NEED-01 | unit | `cargo test --locked sleep_need::tests::ewma_debt` | ⬜ pending |
| 114-01-03 | 01 | 1 | SLP-NEED-01 | unit | `cargo test --locked sleep_need::tests::strain_adjustment` | ⬜ pending |
| 114-01-04 | 01 | 1 | SLP-NEED-01 | unit | `cargo test --locked sleep_need::tests::cold_start` | ⬜ pending |
| 114-02-01 | 02 | 2 | SLP-NEED-02 | integration | `cargo test --locked bridge_methods_constant_matches_dispatcher` | ⬜ pending |
| 114-02-02 | 02 | 2 | SLP-NEED-02 | integration | `cargo test --locked compute_need_bridge` | ⬜ pending |
| 114-02-03 | 02 | 2 | SLP-NEED-02 | unit | `cargo test --locked -- --nocapture 2>&1 | grep -E 'FAILED|ok'` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `Rust/core/src/sleep_need.rs` — new module with `compute_sleep_need()` and inline `#[cfg(test)]` tests
- [ ] `Rust/core/src/lib.rs` — add `pub mod sleep_need;`

*Wave 0 creates the module; tests are inline per Rust convention.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Swift bridge call returns valid SleepNeedResult JSON | SLP-NEED-02 | Requires iOS simulator + device | Run app, check Debug tab for sleep_need bridge call result |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
