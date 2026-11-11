---
phase: 09-ble-stability-data-integrity
plan: "01"
subsystem: rust-core
tags: [ffi, panic-safety, storage-compaction, bridge]
dependency_graph:
  requires: []
  provides:
    - catch_unwind wrap on goose_bridge_handle_json (FIX-04)
    - storage.compact_raw_evidence bridge method (FIX-05 Rust side)
    - test.panic deterministic trigger arm (test coverage)
  affects:
    - Rust/core/src/bridge.rs
    - Rust/core/Cargo.toml
    - Rust/core/tests/bridge_tests.rs
tech_stack:
  added: []
  patterns:
    - std::panic::catch_unwind + AssertUnwindSafe at FFI boundary
    - #[cfg(debug_assertions)] for test-only dispatch arms
    - request_args + and_then + map bridge_ok pattern for new bridge method
key_files:
  created: []
  modified:
    - Rust/core/Cargo.toml
    - Rust/core/src/bridge.rs
    - Rust/core/tests/bridge_tests.rs
decisions:
  - "Used #[cfg(debug_assertions)] instead of #[cfg(test)] for test.panic arm: cfg(test) is not activated for library dependencies when integration tests compile the crate; debug_assertions achieves identical release-exclusion guarantee"
  - "Updated bridge_methods_constant_matches_dispatcher scanner to skip arms preceded by #[cfg(...)] so test.panic does not drift the BRIDGE_METHODS constant"
  - "Added storage.compact_raw_evidence to BRIDGE_METHODS constant to keep the list authoritative"
metrics:
  duration_minutes: 27
  completed_date: "2026-06-04"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 09 Plan 01: FFI Panic Safety and Storage Compaction Bridge Summary

**One-liner:** `catch_unwind` wrap on `goose_bridge_handle_json` converts Rust panics to JSON errors; `storage.compact_raw_evidence` exposes the existing 24 MB compaction algorithm via the bridge.

## What Was Built

### FIX-04 — FFI Panic Safety (Tasks 2)

- Changed `[profile.release]` in `Rust/core/Cargo.toml` from `panic = "abort"` to `panic = "unwind"` so that `std::panic::catch_unwind` can intercept panics at the FFI boundary (previously `panic = "abort"` caused unconditional process termination before `catch_unwind` could act).
- Wrapped the body of `goose_bridge_handle_json` in `std::panic::catch_unwind(AssertUnwindSafe(|| string_to_c_string(handle_bridge_request_json(request))))`. All panic-prone work (dispatch + C-string allocation) is inside the closure so unwinding cannot cross the FFI frame.
- On `Err(payload)`: extracts panic message via `downcast_ref::<&str>()` then `downcast_ref::<String>()` then falls back to `"unknown panic payload"`. Returns `response_to_c_string(&bridge_error("unknown", "panic", message))`.

### FIX-05 — Storage Compaction Bridge Method (Task 3)

- Added `StorageCompactRawEvidenceArgs { database_path: String, limit_bytes: i64 }` struct near `CaptureImportFrameBatchArgs`.
- Added `storage_compact_raw_evidence_bridge(args)` fn: opens store, calls `compact_raw_evidence_payloads_to_limit`, serialises `RawEvidencePayloadRetentionReport` to JSON.
- Added `"storage.compact_raw_evidence"` match arm following the `request_args → and_then → map bridge_ok → unwrap_or_else bridge_error` pattern.
- Registered `"storage.compact_raw_evidence"` in `BRIDGE_METHODS` constant (sorted between `storage.check` and `timeline.from_decoded_frames`).

### Deterministic Test Trigger — test.panic (Task 3)

- Added `#[cfg(debug_assertions)] "test.panic" => panic!(...)` arm in the dispatch match block. This arm is compiled only in debug/test builds and is absent from the release library (confirmed via `strings` search of `libgoose_core.a`).
- Updated `bridge_methods_constant_matches_dispatcher` unit test scanner to skip arms preceded by a `#[cfg(...)]` attribute line, so `test.panic` does not trigger a drift failure.

### Tests (Task 1 + Tasks 2/3 GREEN)

- `bridge_panic_catch_returns_error_json_and_normal_requests_still_succeed`: calls `test.panic` via `goose_bridge_handle_json` end-to-end, asserts `error.code == "panic"` and frees both returned C-string pointers; includes a regression assertion that `core.version` still returns `ok: true`.
- `bridge_compact_raw_evidence_reduces_storage_and_is_noop_when_already_below_limit`: seeds 10 raw_evidence rows (160 bytes), compacts to a 50-byte limit, asserts `compacted_rows > 0` and `after_bytes <= 50`; second pass asserts `compacted_rows == 0` (no-op).

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add failing tests for panic-catch and storage compaction (RED) | 8645088 | Rust/core/tests/bridge_tests.rs |
| 2 | FIX-04: catch_unwind wrap + panic=unwind | fa9b41f | Rust/core/Cargo.toml, Rust/core/src/bridge.rs |
| 3 | FIX-05 + test.panic: storage.compact_raw_evidence bridge method | 71686d6 | Rust/core/src/bridge.rs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] #[cfg(test)] cannot activate for library dependencies in integration tests**

- **Found during:** Task 3
- **Issue:** The plan specified `#[cfg(test)]` on the `test.panic` dispatch arm. In Rust, `cfg(test)` is only activated when the crate itself is compiled with `cargo test` — it is NOT propagated to the crate when it is imported as a library by integration tests (files in `tests/`). The integration test `bridge_panic_catch_returns_error_json_and_normal_requests_still_succeed` calls `goose_bridge_handle_json` which dispatches through `handle_bridge_request_json`. With `#[cfg(test)]`, the `test.panic` arm was absent from the compiled library and the dispatch returned `unknown_method` instead of panicking.
- **Fix:** Changed the attribute to `#[cfg(debug_assertions)]`. This achieves identical release-exclusion: `debug_assertions = false` in `[profile.release]`, `debug_assertions = true` in `[profile.test]` and `[profile.dev]`. The release binary was verified via `strings` search to not contain the `test.panic` string. A comment explains the rationale inline.
- **Files modified:** `Rust/core/src/bridge.rs`
- **Commit:** 71686d6

**2. [Rule 2 - Missing critical functionality] BRIDGE_METHODS constant drift**

- **Found during:** Task 3
- **Issue:** Adding `storage.compact_raw_evidence` to the dispatch match block caused the `bridge_methods_constant_matches_dispatcher` unit test to fail because the method was missing from the `BRIDGE_METHODS` constant, and the `test.panic` arm (present in dispatch due to `#[cfg(debug_assertions)]` being active in test builds) was also included in the scan but absent from the constant.
- **Fix:** (a) Added `"storage.compact_raw_evidence"` to the `BRIDGE_METHODS` constant in sorted order. (b) Updated the `bridge_methods_constant_matches_dispatcher` scanner to skip arms whose preceding line is a `#[cfg(...)]` attribute, so conditionally-compiled test-only arms do not trigger drift failures.
- **Files modified:** `Rust/core/src/bridge.rs`
- **Commit:** 71686d6

## Verification Results

```
cargo test --test bridge_tests -- panic compact  → 2 passed; 0 failed
cargo test                                        → all suites pass, 0 failures
cargo build --release                             → succeeds; libgoose_core.a (68 MB)
strings libgoose_core.a | grep test.panic         → empty (arm excluded from release)
grep -v '^#' Cargo.toml | grep -c 'panic = "abort"' → 0
```

## Threat Model Coverage

| Threat | Disposition | Verified |
|--------|-------------|---------|
| T-09-01: DoS via panic aborting iOS process | mitigate | Panic test passes; process continues |
| T-09-02: DoS via raw_evidence storage growth | mitigate | Compaction test passes; no-op when under limit |
| T-09-04: test.panic reaching production | mitigate | Not present in release binary |

## Known Stubs

None — all implemented functionality is fully wired. The Swift call sites for `storage.compact_raw_evidence` are out of scope for this plan (Plan 09-01 covers Rust side only).

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced beyond what is in the plan's threat model.

## Self-Check: PASSED

- FOUND: .planning/phases/09-ble-stability-data-integrity/09-01-SUMMARY.md
- FOUND: commit 8645088 (test: add failing tests)
- FOUND: commit fa9b41f (feat: catch_unwind + panic=unwind)
- FOUND: commit 71686d6 (feat: storage.compact_raw_evidence + test.panic arm)
- Tests: 2 passed; 0 failed (panic + compact)
