---
phase: 97
phase-slug: healthkit-export-bevel-integration
date: 2026-06-20
---

# Phase 97 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test`; Swift: Xcode (no Swift test target) |
| Quick Rust run | `cd Rust/core && cargo test --lib 2>&1 \| tail -10` |
| Full Rust suite | `cargo test --locked --manifest-path Rust/core/Cargo.toml 2>&1 \| tail -20` |

## Sampling Rate

- **Per Rust task:** `cargo check 2>&1 | grep -E '^error' | head -5`
- **Phase gate:** `cargo test --locked` passes + iOS build succeeds + Health app shows Goose samples (manual)

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | Wave 0? |
|--------|----------|-----------|-------------------|---------|
| HK-01 | store.hr_samples_between returns HR rows | unit | `cargo test -- hr_samples_between` | New test needed |
| HK-03 | store.spo2_samples_between returns SpO2 % values | unit | `cargo test -- spo2_samples_between` | New test needed |
| HK-04 | store.external_sleep_sessions_between returns sessions | unit | `cargo test -- sleep_sessions_between` | New test needed |
| HK-01..04 | GooseHealthKitExporter.swift compiles | build | `xcodebuild build` | Existing |
| HK-05 | Toggle in More settings controls write gating | manual | Simulator: toggle off → no HK write; toggle on → write | Manual only |
| HK-01..04 | HR/HRV/SpO2/sleep appear in Health app | manual | Real device or simulator Health app | Manual |

## Wave 0 Requirements (New Rust Tests)

- **97-01:** `Rust/core/tests/` or inline — `hr_samples_between` with a temp DB fixture, `spo2_samples_between` verifies SpO2 % conversion, `external_sleep_sessions_between`

## Validation Sign-Off

```
[ ] cargo test --locked passes clean (0 failures)
[ ] All 3 new bridge methods in BRIDGE_METHODS + dispatcher
[ ] GooseHealthKitExporter.swift registered in project.pbxproj
[ ] Toggle in MoreView Section("Apple Health") present
[ ] UserDefaults key "goose.healthkit.export.enabled" gates writes
[ ] iOS build compiles without new warnings (xcodebuild)
[ ] Manual: Health app shows "Goose" as HR source (manual/device)
```
