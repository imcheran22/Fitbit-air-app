---
phase: 85-rust-crash-safety
plan: "03"
subsystem: rust-core
tags: [rust, crash-safety, unwrap, clippy, metrics]
dependency_graph:
  requires: ["85-01"]
  provides: ["metrics.rs-no-unwrap", "metrics.rs-no-shield"]
  affects: ["85-06-gate"]
tech_stack:
  added: []
  patterns: ["f64::total_cmp for NaN-safe sort", "if-let refactor from is_some guard", "expect() with safety comment preservation"]
key_files:
  modified: ["Rust/core/src/metrics.rs"]
decisions:
  - "Used f64::total_cmp (not .expect()) at line 2020 — MSRV 1.96 > 1.62 satisfies stable requirement; total_cmp eliminates the Option entirely (no panic path at all)"
  - "if let Some(ts) = trend_score refactor at line 3607 — cleanest elimination of is_some guard + unwrap pair"
  - "timestamps_aligned .expect() at line 1058 — preserves existing safety comment reasoning verbatim"
metrics:
  duration: "8m"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 1
---

# Phase 85 Plan 03: metrics.rs Crash Safety Summary

**One-liner:** Eliminated all 11 `.unwrap()` calls in metrics.rs (3 production + 8 test), removed the `#![allow(clippy::unwrap_used)]` shield — file now passes `deny(clippy::unwrap_used)` with zero violations.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix 3 production unwrap sites in metrics.rs | a6310da | Rust/core/src/metrics.rs |
| 2 | Convert metrics.rs test .unwrap() to .expect() and remove shield | 2f0a180 | Rust/core/src/metrics.rs |

## What Was Built

### Task 1: Production unwrap fixes

Three production `.unwrap()` sites that could cause process-abort panics through the FFI boundary were eliminated:

**Site 1 — Line 1058 (`timestamps_aligned` guard):**
- Before: `working_timestamps_opt.as_ref().unwrap()[i]`
- After: `.expect("timestamps_aligned guard ensures Some — lengths verified above")[i]`
- Rationale: The `timestamps_aligned` boolean already proves `is_some()` and length equality. `.expect()` preserves the safety reasoning as a readable panic message if the invariant is ever violated.

**Site 2 — Line 2020 (`estimate_hrmax_from_history` sort):**
- Before: `finite.sort_by(|a, b| a.partial_cmp(b).unwrap())`
- After: `finite.sort_by(|a, b| a.total_cmp(b))`
- Rationale: `f64::total_cmp` returns `Ordering` directly (no `Option`), is stable since Rust 1.62, and handles NaN deterministically. Since MSRV is 1.96, this is guaranteed available. Using `.expect()` here would still leave a theoretically-reachable panic path — `total_cmp` eliminates it entirely (T-85-04).

**Site 3 — Line 3607 (`sleep_cardiovascular_score` trend block):**
- Before: `if trend_score.is_some() { ... trend_score.unwrap() * 0.15 }`
- After: `if let Some(ts) = trend_score { ... ts * 0.15 }`
- Rationale: The `is_some()` guard + unwrap pattern is the canonical `if let` refactor. Eliminates the unwrap without any semantic change (T-85-05).

### Task 2: Test conversions and shield removal

- 2 test `.unwrap()` on `score_0_to_100` (lines ~4527, ~4540) → `.expect("recovery score must be Some for valid input")`
- 6 test `.unwrap()` on `out.acwr` (lines ~4915–5079) → `.expect("acwr must be Some when sufficient strain data is provided")`
- Removed `#![allow(clippy::unwrap_used)]` inner attribute (the shield Plan 1 added to allow progressive conversion)
- Removed the stale comment on line 1 that described the shield

## Verification Results

```
cargo clippy --locked --manifest-path Rust/core/Cargo.toml --lib -- -D clippy::unwrap_used
  → Finished dev profile — 0 violations

cargo test --locked --manifest-path Rust/core/Cargo.toml --lib
  → test result: ok. 180 passed; 0 failed
```

Final state:
- `grep -c '\.unwrap()' Rust/core/src/metrics.rs` → 0
- `grep -c '#!\[allow(clippy::unwrap_used)\]' Rust/core/src/metrics.rs` → 0
- `grep -c 'total_cmp' Rust/core/src/metrics.rs` → 2
- `grep -c 'if let Some(ts) = trend_score' Rust/core/src/metrics.rs` → 1

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or missing wiring.

## Threat Flags

No new security-relevant surface introduced. Existing threat mitigations applied:
- T-85-04 (DoS — NaN panic in sort): Mitigated via `f64::total_cmp`
- T-85-05 (DoS — None panic at is_some guard sites): Mitigated via `if let` and `.expect()` refactors

## Self-Check: PASSED

- [x] Rust/core/src/metrics.rs exists and is modified
- [x] Commit a6310da exists (Task 1)
- [x] Commit 2f0a180 exists (Task 2)
- [x] Zero `.unwrap()` in metrics.rs
- [x] Zero `#![allow(clippy::unwrap_used)]` in metrics.rs
- [x] clippy deny lint: 0 violations
- [x] 180 lib tests passing
