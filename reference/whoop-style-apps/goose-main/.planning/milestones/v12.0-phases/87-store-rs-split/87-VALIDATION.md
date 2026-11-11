---
phase: 87
slug: store-rs-split
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
audited: 2026-06-19
---

# Phase 87 — Validation Strategy

> Nyquist validation audit for Phase 87 (store-rs-split). Requirement: ARCH-02 — store.rs 140 public methods decomposed into domain stores sharing Arc<Mutex<Connection>>: SleepStore, CaptureStore, MetricsStore, ActivityStore in store/ subdirectory; runtime schema version validation on SQLite open.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in test runner (`cargo test`) |
| **Config file** | `Rust/core/Cargo.toml` |
| **Quick run command** | `cd Rust/core && cargo test --test store_schema_version_tests` |
| **Full suite command** | `cd Rust/core && cargo test --locked` |
| **Estimated runtime** | ~60 seconds (full), ~10 seconds (targeted) |

---

## Sampling Rate

- **After every task commit:** Run `cd Rust/core && cargo build --lib`
- **After every plan wave:** Run `cd Rust/core && cargo test --locked`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 87-01-01 | 01 | 1 | ARCH-02 | T-87-01 | Arc<Mutex<Connection>> prevents conn field access outside store/ | integration | `cd Rust/core && cargo build --lib` | ✅ | ✅ green |
| 87-01-02 | 01 | 1 | ARCH-02 | T-87-01 | immediate_transaction closure is FnOnce(&Connection) — no deadlock risk | integration | `cd Rust/core && cargo build --lib` | ✅ | ✅ green |
| 87-02-01 | 02 | 2 | ARCH-02 | T-87-02 | 9 sleep methods in store/sleep.rs, absent from store/mod.rs | integration | `cd Rust/core && cargo test --locked` | ✅ | ✅ green |
| 87-03-01 | 03 | 2 | ARCH-02 | T-87-03 | 25 capture methods in store/capture.rs, absent from store/mod.rs | integration | `cd Rust/core && cargo test --locked` | ✅ | ✅ green |
| 87-04-01 | 04 | 2 | ARCH-02 | T-87-04 | 49 metrics methods in store/metrics.rs, absent from store/mod.rs | integration | `cd Rust/core && cargo test --locked` | ✅ | ✅ green |
| 87-05-01 | 05 | 2 | ARCH-02 | T-87-05 | 49 activity methods in store/activity.rs; insert_exercise_session uses |conn| closure | integration | `cd Rust/core && cargo test --locked` | ✅ | ✅ green |
| 87-06-01 | 06 | 3 | ARCH-02 | T-87-06 | store/mod.rs retains exactly 7 infrastructure pub fn | integration | `cd Rust/core && cargo test --locked` | ✅ | ✅ green |
| 87-06-02 | 06 | 3 | ARCH-02 | — | open_existing_current() returns Err on schema version mismatch | integration | `cd Rust/core && cargo test --test store_schema_version_tests` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Structural Verification (non-test evidence)

Verified by code inspection on 2026-06-19:

```
Rust/core/src/store/
├── mod.rs      — GooseStore struct (pub(super) conn: Arc<Mutex<Connection>>), 7 pub fn infra only
├── sleep.rs    — 9 sleep domain methods, each acquires mutex lock at entry
├── capture.rs  — 25 capture domain methods
├── metrics.rs  — 49 metrics/calibration/algorithm domain methods
└── activity.rs — 49 activity/debug/exercise domain methods

store.rs — ABSENT (git rm'd in plan 87-01)
```

Key grep results:
- `grep 'pub(super) conn: Arc<Mutex<Connection>>' Rust/core/src/store/mod.rs` → 1 match
- `grep 'FnOnce(&Connection)' Rust/core/src/store/mod.rs` → 1 match (immediate_transaction)
- `grep 'schema_version != CURRENT_SCHEMA_VERSION' Rust/core/src/store/mod.rs` → 2 matches (check + test)
- `grep -c '^    pub fn' Rust/core/src/store/mod.rs` → 7 (infra only)

---

## Nyquist Gap Analysis (2026-06-19 audit)

### Gaps Found: 1

| Gap ID | Requirement | Gap Type | Resolution |
|--------|-------------|----------|------------|
| G-87-01 | SC2: open_existing_current() returns Err on schema version mismatch | MISSING — no test exercised the rejection path | Created `Rust/core/tests/store_schema_version_tests.rs` |

### Tests Created by Audit

| # | File | Type | Command |
|---|------|------|---------|
| 1 | `Rust/core/tests/store_schema_version_tests.rs` | integration | `cd Rust/core && cargo test --test store_schema_version_tests` |

### Test Coverage

**`open_existing_current_rejects_stale_schema_version`** — creates a SQLite file with `PRAGMA user_version = CURRENT_SCHEMA_VERSION - 1`, calls `open_existing_current()`, asserts `Err` is returned with a message containing "not current" or "schema".

**`open_existing_current_rejects_future_schema_version`** — same but with `CURRENT_SCHEMA_VERSION + 1` to cover forward-incompatibility.

### Audit Trail

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or test coverage
- [x] Sampling continuity: each wave has cargo test gate
- [x] Wave 0: existing Rust test infrastructure covers all phase requirements (no new framework needed)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-19
