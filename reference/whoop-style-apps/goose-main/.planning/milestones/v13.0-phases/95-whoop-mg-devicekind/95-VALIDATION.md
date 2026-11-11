---
phase: 95
phase-slug: whoop-mg-devicekind
date: 2026-06-19
---

# Phase 95 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test`; Swift: Xcode (no Swift test target) |
| Quick run | `cd Rust/core && cargo test --lib 2>&1 \| tail -10` |
| Full suite | `cargo test --locked --manifest-path Rust/core/Cargo.toml 2>&1 \| tail -20` |

## Sampling Rate

- **Per task commit:** `cd Rust/core && cargo check 2>&1 | grep -E '^error' | head -5`
- **Phase gate:** `cargo test --locked` passes clean

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | Wave 0? |
|--------|----------|-----------|-------------------|---------|
| MG-01 | WhoopMg DeviceKind serialises/deserialises correctly | unit | `cargo test -- whoop_mg` | New test needed |
| MG-01 | Maverick DeviceType maps to WhoopMg (not Whoop5) | unit | `cargo test -- device_kind_maverick` | New test (rename existing) |
| MG-02 | Swift: " mg" name detection sets WhoopMg | manual | Simulator BLE mock or real device | Hardware-gated |
| MG-02 | DeviceView shows "WHOOP MG" label | manual | Simulator screenshot | Manual |
| All | Whoop4/Whoop5 identification unaffected | unit | `cargo test --locked` (regression) | Existing |

## Wave 0 Requirements (New Tests)

- **95-01:** `Rust/core/src/capabilities.rs` — `whoop_mg_capabilities` test + serde round-trip test; rename existing Maverick→Whoop5 test to Maverick→WhoopMg
- **95-02:** Manual simulator verification only (no Swift test target)

## Validation Sign-Off

```
[ ] cargo test --locked passes clean (0 failures)
[ ] WhoopMg serde round-trip: "WHOOP_MG" ↔ DeviceKind::WhoopMg
[ ] Maverick DeviceType → WhoopMg (not Whoop5)
[ ] Whoop4/Whoop5 regression: no device kind changes
[ ] Swift: device kind string surfaces in bridge JSON response
[ ] Manual: "WHOOP MG" label visible in DeviceView (hardware-gated)
```
