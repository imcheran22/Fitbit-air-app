---
phase: 94
phase-slug: gen4-protocol-completeness
date: 2026-06-19
---

# Phase 94 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` |
| Config file | `Rust/core/Cargo.toml` |
| Quick run | `cd Rust/core && cargo test --lib 2>&1 \| tail -10` |
| Full suite | `cargo test --locked --manifest-path Rust/core/Cargo.toml 2>&1 \| tail -20` |

## Sampling Rate

- **Per task commit:** `cd Rust/core && cargo check 2>&1 | grep -E '^error' | head -5`
- **Per wave:** `cd Rust/core && cargo test --locked 2>&1 | tail -20`
- **Phase gate:** `cargo test --locked` passes clean — zero test failures

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | Wave 0? |
|--------|----------|-----------|-------------------|---------|
| GEN4-06 | respiratory_rate_rpm extracted from V24 pk=24 at body offset 73 | unit | `cargo test -- respiratory_rate_v24` | New test needed |
| GEN4-06 | skin_temp_delta_c chain traced; escalated if broken | unit/integration | chain trace in `v24_biometric_protocol_tests.rs` | New test needed |
| SYNC-07 | Gen4 historical frame (0x2F, pk=24) imports to decoded_frames | integration | `cargo test -- gen4_historical_import` | New test needed |
| All | Full regression | integration | `cargo test --locked --manifest-path Rust/core/Cargo.toml` | Existing |

## Wave 0 Requirements (New Tests)

- **94-01:** `Rust/core/tests/v24_biometric_protocol_tests.rs` — `respiratory_rate_v24` test validates byte-offset arithmetic at body offset 73; skin_temp chain trace
- **94-02:** `Rust/core/tests/store_tests.rs` — `gen4_historical_import` test asserts imported_frame: true for synthetic Gen4 historical frame; determines SYNC-07 root cause

## Validation Sign-Off

```
[ ] cargo test --locked passes clean (0 failures)
[ ] GEN4-06: respiratory_rate_v24 test passes
[ ] GEN4-06: skin_temp chain documented (fixed or escalated)
[ ] SYNC-07: gen4_historical_import test run; root cause documented
[ ] cargo test --locked 2>&1 | grep -c FAILED returns 0
```
