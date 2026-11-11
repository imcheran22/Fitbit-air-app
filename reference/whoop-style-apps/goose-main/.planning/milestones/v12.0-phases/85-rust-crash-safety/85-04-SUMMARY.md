---
phase: 85-rust-crash-safety
plan: "04"
subsystem: testing
tags: [rust, clippy, unwrap, expect, crash-safety]

# Dependency graph
requires:
  - phase: 85-01
    provides: "#![allow(clippy::unwrap_used)] shield added to capabilities.rs as placeholder"
provides:
  - "capabilities.rs with 8 test .unwrap() converted to .expect(); no allow shield"
  - "capabilities.rs fully exposed to deny(clippy::unwrap_used) deny lint in lib.rs"
affects: [85-rust-crash-safety, 86-bridge-split]

# Tech tracking
tech-stack:
  added: []
  patterns: [".expect(descriptive message) for all test-code fallible operations in capabilities.rs"]

key-files:
  created: []
  modified:
    - Rust/core/src/capabilities.rs

key-decisions:
  - "All 8 test .unwrap() converted with call-site-specific messages (e.g. 'DeviceKind::Whoop4 should serialise to JSON') not generic strings"
  - "Shield removal proves no production .unwrap() remains: cargo clippy --lib -- -D clippy::unwrap_used passes clean"

patterns-established:
  - "Test serde round-trip pattern: .expect() messages name the type and direction (serialise/deserialise) for immediate context on failure"

requirements-completed: [ARCH-03]

# Metrics
duration: 5min
completed: 2026-06-14
---

# Phase 85 Plan 04: capabilities.rs .unwrap() → .expect() + Shield Removal Summary

**8 test-code .unwrap() calls in capabilities.rs converted to .expect() with descriptive messages; #![allow(clippy::unwrap_used)] shield removed; module now passes deny(clippy::unwrap_used) cleanly**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-14T20:00:00Z
- **Completed:** 2026-06-14T20:05:00Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments

- Removed `#![allow(clippy::unwrap_used)]` shield that Plan 01 added as a placeholder
- Converted all 8 test-code `.unwrap()` calls to `.expect("descriptive message")` per D-03
- `cargo clippy --locked --lib -- -D clippy::unwrap_used` passes with no violations
- `cargo test --locked --lib` exits 0 (180 tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert capabilities.rs test .unwrap() to .expect() and remove shield** - `22dc73f` (fix)

**Plan metadata:** (committed with state update docs commit)

## Files Created/Modified

- `Rust/core/src/capabilities.rs` — removed allow shield; 8 test `.unwrap()` → `.expect()` with descriptive messages

## Decisions Made

- `.expect()` messages name the type and the direction for serde calls (e.g. "DeviceKind::Whoop4 should serialise to JSON") so a test failure immediately identifies which variant and which direction failed
- Round-trip test messages name both the serialise step and the deserialise step separately for precise failure attribution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- capabilities.rs shield removal complete; module contributes zero allow-list entries to lib.rs
- Phase 85 Plan 05 (next in wave 2) can proceed: bridge.rs or other modules with remaining .unwrap() violations

## Self-Check

- `Rust/core/src/capabilities.rs` — FOUND (file exists, no .unwrap(), no shield)
- Commit `22dc73f` — verified (git log confirms)

## Self-Check: PASSED

---
*Phase: 85-rust-crash-safety*
*Completed: 2026-06-14*
