---
phase: 92
phase-slug: export-auth-bug-fixes
date: 2026-06-19
---

# Phase 92 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` / Swift: Xcode (no Swift test target) |
| Config file | `Rust/core/Cargo.lock` |
| Quick run | `cd Rust/core && cargo test --lib 2>&1 \| tail -5` |
| Full suite | `cd Rust/core && cargo test 2>&1 \| tail -20` |
| iOS gate | `xcodebuild build` compiles without new warnings |

## Sampling Rate

- **Per task commit:** `cd Rust/core && cargo build --lib 2>&1 | tail -5`
- **Per wave merge (BUG-EXP-01 Rust changes):** `cd Rust/core && cargo test 2>&1 | tail -20`
- **Phase gate:** iOS build compiles without new warnings

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | Manual Step |
|--------|----------|-----------|-------------------|-------------|
| BUG-EXP-01 | Manifest path accepted by Rust runbook/review handlers | unit (Rust) | `cargo test local_health_validation` | — |
| BUG-EXP-02 | `runFullRawExport` does not override `includeRawBytes` | manual | — | Simulator: tap "Full Raw Export" with toggle off; verify `includeRawBytes` stays false |
| BUG-EXP-03 | `validate()` called once — no redundant call | code review | `grep -c "validate()" GooseSwift/GooseLocalDataExporter.swift` (expect 1 inside `createBundle`) | — |
| BUG-EXP-04 | sqlite toggle disabled when DB > 20 MB | manual | — | Simulator screenshot: sqlite Toggle greyed out when database > 20 MB |
| BUG-AUTH-01 | Alert fires at retry count 12, clears device | manual | — | Simulator BLE mock: confirm alert appears after 12th auth failure, device ID cleared |

## Wave 0 Requirements

No new test files required. Rust tests exist for `BUG-EXP-01` validation. All Swift fixes (BUG-EXP-02, BUG-EXP-03, BUG-EXP-04, BUG-AUTH-01) require manual simulator verification — no Swift test target in project.

## Manual-Only Verifications

- **BUG-EXP-02:** Build and run in simulator. In More → Raw Export, disable "Include Raw Bytes" toggle. Tap "Full Raw Export." Confirm export runs with `includeRawBytes = false` (check debug logs; export should not include raw bytes).
- **BUG-EXP-04:** With a database > 20 MB, navigate to More → Raw Export → Data Families. Confirm the "sqlite" Toggle is greyed out (disabled state, not hidden).
- **BUG-AUTH-01:** Simulate or trigger 12 consecutive auth failures. Confirm alert "Authentication Failed" appears with "Reconnect WHOOP" and "Cancel" options. Tap "Reconnect WHOOP" — confirm remembered device ID is cleared and scan restarts.

## Validation Sign-Off

```
[ ] cargo test passes clean (BUG-EXP-01 Rust path)
[ ] iOS build compiles without new warnings
[ ] BUG-EXP-02: manual simulator verification
[ ] BUG-EXP-03: grep confirms single validate() in createBundle
[ ] BUG-EXP-04: manual simulator screenshot (sqlite toggle disabled)
[ ] BUG-AUTH-01: manual simulator BLE mock (alert at 12 retries, device cleared)
```
