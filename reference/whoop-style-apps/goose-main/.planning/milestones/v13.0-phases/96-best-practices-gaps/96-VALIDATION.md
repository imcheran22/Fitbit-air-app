---
phase: 96
phase-slug: best-practices-gaps
date: 2026-06-20
---

# Phase 96 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test`; Swift: Xcode (no Swift test target) |
| Quick run | `cd Rust/core && cargo test --lib 2>&1 \| tail -10` |
| Full suite | `cargo test --locked --manifest-path Rust/core/Cargo.toml 2>&1 \| tail -20` |

## Sampling Rate

- **Per task commit:** `cargo check 2>&1 | grep -E '^error' | head -5` (Rust); `grep -c 'try? bridge\|try? self.bridge' GooseSwift/**/*.swift` (Swift)
- **Phase gate:** `cargo test --locked` + `grep -r 'try? bridge\|try? self.bridge\|try? await bridge' GooseSwift/ | wc -l` = 0

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | Wave 0? |
|--------|----------|-----------|-------------------|---------|
| BP-01 | Zero silent try? bridge calls remain | source scan | `grep -r 'try? ' GooseSwift/ --include='*.swift' \| grep 'bridge\|request' \| wc -l` = 0 | No new test files |
| BP-01 | iOS build compiles without new warnings | build | `xcodebuild build` (CI) | Existing |
| BP-02 | acquire_bridge_conn uses pool, not Connection::open | source | `grep -c 'Connection::open' Rust/core/src/bridge/mod.rs` = 0 (in bridge handlers) | New Rust test |
| BP-02 | cargo test --locked passes clean | integration | `cargo test --locked 2>&1 \| grep -c FAILED` = 0 | Existing |

## Validation Sign-Off

```
[ ] cargo test --locked passes clean (0 failures)
[ ] grep silent try? bridge calls returns 0
[ ] acquire_bridge_conn() uses r2d2 pool (not Connection::open)
[ ] Cargo.toml has r2d2 and r2d2_sqlite entries
[ ] iOS build compiles without new warnings (CI)
```
