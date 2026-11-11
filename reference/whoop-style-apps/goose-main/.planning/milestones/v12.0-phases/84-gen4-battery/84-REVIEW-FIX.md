---
phase: 84-gen4-battery
fixed_at: 2026-06-14T00:00:00Z
review_path: .planning/phases/84-gen4-battery/84-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 84: Code Review Fix Report

**Fixed at:** 2026-06-14T00:00:00Z
**Source review:** .planning/phases/84-gen4-battery/84-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, WR-01, WR-02)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: `parse_cmd26_battery` reads wrong bytes — battery raw at payload[5..7], not [2..4]

**Files modified:** `Rust/core/src/bridge.rs`
**Commit:** d8e2e91
**Applied fix:**
- Updated `parse_cmd26_battery` to read `payload[5]` and `payload[6]` (data body
  start in the full COMMAND_RESPONSE payload) instead of `payload[2]` and `payload[3]`
  (which contained the command identifier byte 26 and origin_seq).
- Changed the length guard from `>= 4` to `>= 7`.
- Added a `raw > 1000` sanity guard at the Rust layer (tighter than the old 1100
  guard, since valid battery raw values are 0..=1000 for 0%..=100%).
- Updated the `cmd26_payload` test helper to emit the real COMMAND_RESPONSE layout:
  `[36, 49, 26, 48, 1, raw_lo, raw_hi, ...]` instead of the previous synthetic
  layout that placed raw at `[2..4]`.
- Updated `cmd26_valid_85` to use `cmd26_payload(10, 850)` and `cmd26_rejects_short`
  to use `cmd26_payload(6, 0)` (6 bytes is one short of the new >= 7 guard).
- Updated the doc-comment byte layout table on `parse_cmd26_battery` to match the
  real COMMAND_RESPONSE structure.
- All 7 `battery_parse_tests` pass: `cargo test battery_parse_tests` → ok.

### WR-02: `event48_battery_pct` emitted for every Event-48 frame regardless of event_id

**Files modified:** `Rust/core/src/bridge.rs`
**Commit:** d8e2e91
**Applied fix:**
- In `compact_parsed_frame_summary`, wrapped the `parse_event48_battery_from_data`
  call in `if *event_id == Some(3)` (BATTERY_LEVEL). Non-battery Event-48 types
  (BOOT=15, CHARGING_ON=7, CHARGING_OFF=8, etc.) now produce `event48_battery_pct: null`
  in the compact summary instead of a potentially spurious battery percentage.
- Used `*event_id` (deref) because the match arm binds `event_id` as `&Option<u16>`.

### WR-01: `OvernightRawNotificationStorageClassifier.classify()` hard-codes Gen5 header offset for packet type

**Files modified:** `GooseSwift/NotificationFrameParsing.swift`
**Commit:** 957359e
**Applied fix:**
- Replaced the hard-coded `headerBytes[8]` / `headerBytes[9]` reads with a
  `headerLen` variable derived from `event.wireProtocol`:
  - `.gen4` → `headerLen = 4` (packet_type at index 4)
  - all others → `headerLen = 8` (packet_type at index 8)
- Updated the guard from `headerBytes.count >= 9` to `>= headerLen + 1`.
- `packetType` now reads `headerBytes[headerLen]`; `packetK` reads
  `headerBytes[headerLen + 1]` when present.
- Added inline comment explaining the Gen4 vs Gen5 header layout difference.
- `swiftc -parse` syntax check passed.

---

_Fixed: 2026-06-14T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
