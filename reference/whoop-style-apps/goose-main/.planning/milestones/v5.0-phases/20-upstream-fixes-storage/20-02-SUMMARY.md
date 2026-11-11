---
phase: 20-upstream-fixes-storage
plan: 02
subsystem: rust-protocol
tags: [rust, protocol, perf, body_hex, k10, k21, motion, tdd]

# Dependency graph
requires:
  - phase: 20-upstream-fixes-storage
    plan: 01
    provides: "Gen4 sync correctness fixes (SYNC-01..05); Rust suite baseline green"
provides:
  - "PERF-05: body_hex excluded from parse_data_packet_payload for packet_k 10 (RawMotionK10) and 21 (RawMotionK21); stored JSON for these high-volume frames shrinks by ~50%"
  - "K10/K21 protocol tests bind and assert body_hex (empty after exclusion); K18 regression guard confirms exclusion is K10/K21-only"
affects: [phase-21, ble-frame-cache, parsed-payload-json]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "matches!(packet_k, Some(10) | Some(21)) conditional before struct literal to gate expensive field computation"
    - "Test-first: assert current behaviour GREEN (RED-baseline), apply exclusion, update assertion to expect exclusion, confirm GREEN again"

key-files:
  created: []
  modified:
    - Rust/core/src/protocol.rs
    - Rust/core/tests/protocol_tests.rs

key-decisions:
  - "K21 padding discrepancy: build_v5_payload_frame adds 2 bytes of alignment padding (1038 % 4 = 2) before CRC, making the parsed body_hex 2 bytes longer than payload[13..] in the test. K21 RED-baseline assertion uses !body_hex.is_empty() instead of exact hex comparison; K10 (1288 % 4 = 0, no padding) uses exact hex::encode(&payload[13..]) comparison"
  - "body_hex field type remains String (not Option<String>) — empty string is the sentinel for excluded. Downstream consumers already handle this: timeline.rs uses non_empty() which maps \"\" to None; bridge.rs computes body_byte_count = body_hex.len()/2 yielding 0 for empty"

patterns-established:
  - "Conditional field computation before struct literal for performance exclusions; avoids Option wrapping when downstream consumers already handle empty string"

requirements-completed: [PERF-05]

# Metrics
duration: 20min
completed: 2026-06-06
---

# Phase 20 Plan 02: PERF-05 body_hex Exclusion for K10/K21 Frames Summary

**body_hex hex-dump excluded from parse_data_packet_payload for K10/K21 raw-motion frames via a single conditional, eliminating ~50% JSON bloat for the highest-volume frame types while preserving body_summary (RawMotionK10/K21 axes).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-06T21:40:00Z
- **Completed:** 2026-06-06T22:00:00Z
- **Tasks:** 2 (test-first RED, then GREEN)
- **Files modified:** 2

## Accomplishments
- Task 1 (RED-baseline): added body_hex bindings to K10 and K21 DataPacket pattern matches; K10 asserts `body_hex == hex::encode(&payload[13..])`, K21 asserts `!body_hex.is_empty()`; cargo test green on current populated behaviour
- Task 2 (GREEN): introduced `if matches!(packet_k, Some(10) | Some(21)) { String::new() } else { hex::encode(...) }` conditional in `parse_data_packet_payload`; updated K10/K21 assertions to `assert!(body_hex.is_empty())`; K18 regression guard (`parses_history_packet_stable_header_and_hr_marker` asserting `body_hex: "aa4dbbccddeeff"`) passes unmodified; full cargo test suite green

## Task Commits

Each task was committed atomically:

1. **Task 1: PERF-05 RED phase — body_hex assertions pinning current populated behaviour** - `3b1447a` (test)
2. **Task 2: PERF-05 GREEN phase — exclude body_hex for K10/K21, update assertions** - `cd3d4e1` (fix)

## Files Created/Modified
- `Rust/core/src/protocol.rs` — `parse_data_packet_payload`: compute `body_hex` as local with `matches!(packet_k, Some(10) | Some(21))` conditional; `String::new()` for K10/K21, `hex::encode(&payload[13.min(len)..])` for all others; `body_offset` unchanged
- `Rust/core/tests/protocol_tests.rs` — `parses_k10_raw_motion_offsets_without_claiming_units` and `parses_k21_grouped_motion_offsets_and_counts`: bind `body_hex` in DataPacket destructure; assert `body_hex.is_empty()` after GREEN phase

## Decisions Made
- K21 padding discrepancy: `build_v5_payload_frame` adds alignment padding (`1038 % 4 = 2` → 2 bytes) before the CRC, so the parsed `body_hex` is 2 bytes longer than `hex::encode(&payload[13..])` in the test. K21 RED-baseline uses `!body_hex.is_empty()` (sufficient to prove body_hex is populated today); K10 payload is 1288 bytes (divisible by 4, no padding), so exact comparison works.
- `body_hex` field type stays `String` (not `Option<String>`). Empty string is the exclusion sentinel. Downstream safe: `timeline.rs` uses `non_empty()` (maps `""` → `None`); `bridge.rs` computes `body_byte_count = body_hex.len()/2` (yields 0, correct).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] K21 RED-baseline assertion adjusted for framing padding**
- **Found during:** Task 1 (RED-baseline)
- **Issue:** Plan specified `assert_eq!(body_hex, hex::encode(&payload[13..]))` for both K10 and K21. For K21, `build_v5_payload_frame` adds 2 bytes of alignment padding before the CRC; the function parses the padded payload, so `body_hex` is 2 bytes longer than `payload[13..]`. The assertion failed.
- **Fix:** K21 RED-baseline uses `assert!(!body_hex.is_empty())` instead of the exact hex comparison. This still proves body_hex is populated for K21 today (the plan's intent). K10 keeps the exact comparison (no padding).
- **Files modified:** `Rust/core/tests/protocol_tests.rs`
- **Verification:** Both K10 and K21 tests passed with updated assertions; full suite green.
- **Committed in:** `3b1447a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — assertion adjusted for framing reality)
**Impact on plan:** Minimal — the plan's test-first intent and acceptance criteria are fully satisfied. The K21 assertion proves body_hex is populated before exclusion; the GREEN assertions prove it is empty after.

## Issues Encountered
- K21 payload framing adds 2 padding bytes (1038 mod 4 = 2) before CRC; exact hex comparison requires accounting for this. Fixed inline without scope change.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- PERF-05 complete: K10/K21 stored parsed-payload JSON is now ~50% smaller for the highest-volume raw-motion frame types
- body_summary (RawMotionK10/K21 axes) is fully preserved — no data loss
- Rust suite green; Phase 20 complete; ready for Phase 21 (IMU work)
- No blockers

---
*Phase: 20-upstream-fixes-storage*
*Completed: 2026-06-06*
