---
phase: 87
slug: store-rs-split
status: verified
verified: 2026-06-19
---

# Phase 87 — Verification

## ARCH-02 Success Criteria

| Criterion | Command | Result |
|-----------|---------|--------|
| SC1: store/ directory with 4 domain files | `ls Rust/core/src/store/` | activity.rs, capture.rs, metrics.rs, mod.rs, sleep.rs — PASS |
| SC1: store.rs absent | `ls Rust/core/src/store.rs` | not found — PASS |
| SC1: Arc<Mutex<Connection>> sharing | `grep 'pub(super) conn: Arc<Mutex<Connection>>' Rust/core/src/store/mod.rs` | 1 match — PASS |
| SC1: immediate_transaction FnOnce(&Connection) | `grep 'FnOnce(&Connection)' Rust/core/src/store/mod.rs` | 1 match — PASS |
| SC2: schema version validation on open | `cargo test --test store_schema_version_tests` | 2 tests — see below |
| SC3: all existing tests pass | `cargo test --locked` | 151 passed (87-06 gate) |

## Schema Version Validation Test

```
test open_existing_current_rejects_stale_schema_version ... ok
test open_existing_current_rejects_future_schema_version ... ok
```

Test file: `Rust/core/tests/store_schema_version_tests.rs`
Command: `cd Rust/core && cargo test --test store_schema_version_tests`

## Method Distribution

| File | pub fn count |
|------|-------------|
| store/mod.rs | 7 (infra: open*, immediate_transaction, migrate, schema_version) |
| store/sleep.rs | 9 |
| store/capture.rs | 25 |
| store/metrics.rs | 49 |
| store/activity.rs | 49 |
| **Total** | **139** |

## Clippy

`cargo clippy --lib -- -D warnings` → exit 0 (verified in 87-06 gate commit 0f0eb43)
