---
phase: 20-upstream-fixes-storage
verified: 2026-06-06T23:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 20: Upstream Fixes & Storage Verification Report

**Phase Goal:** The Gen4 historical sync implementation is corrected and the `body_hex` duplication in cached JSON is eliminated — cleaning the foundation before algorithm work begins.
**Verified:** 2026-06-06T23:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SYNC-01: Gen4 historical-sync callbacks use weak self capture, documented | VERIFIED | `GooseAppModel.swift:372-381` — both `ble.onHistoricalSyncProgress` and `ble.onHistoricalRangeTelemetry` use `[weak self]`; SYNC-01 comments present above each assignment |
| 2 | SYNC-02: Three Gen4 per-sync counter increments use wrapping arithmetic | VERIFIED | `GooseBLEClient+HistoricalHandlers.swift:26,494,672` — all three use `&+= 1` with SYNC-02 comment; confirmed by commit `9d26124` changing all three sites |
| 3 | SYNC-03: buildV5CommandFrame 4-byte padding is documented in source | VERIFIED | `GooseBLEClient+Parsing.swift:948-950` — 3-line comment above `let padding` explains 4-byte-multiple requirement, CRC inclusion, PacketLogger confirmation |
| 4 | SYNC-04: connectedDeviceGeneration has main-actor queue-confinement comment | VERIFIED | `GooseAppModel.swift:59-62` — 3-line comment above `var connectedDeviceGeneration` names `@MainActor` ownership, lifecycle location, and BLE-thread prohibition |
| 5 | SYNC-05: Gen4 UUID detection lowercases before both hasPrefix comparisons | VERIFIED | `GooseBLEClient+Parsing.swift:352-363` — `generation(from:)` lowercases before `hasPrefix("61080001")`; SYNC-05 comment present confirming both paths covered; `GooseBLETypes.swift:18` covers `61080002` command UUID via `isCommandUUID` which also lowercases |
| 6 | PERF-05 (test-first): K10/K21 tests assert body_hex empty after exclusion | VERIFIED | `protocol_tests.rs:341,392` — both tests bind `body_hex` in destructure and assert `body_hex.is_empty()`; K10 test passes, K21 test passes (confirmed by `cargo test`) |
| 7 | PERF-05: body_hex empty for K10/K21 DataPacket payloads | VERIFIED | `protocol.rs:505-513` — `matches!(packet_k, Some(10) | Some(21))` yields `String::new()`; all other packet types get `hex::encode(...)` |
| 8 | PERF-05: body_hex populated for non-K10/K21 packets (K18 regression guard) | VERIFIED | `protocol_tests.rs:192` — `parses_history_packet_stable_header_and_hr_marker` asserts `body_hex: "aa4dbbccddeeff".to_string()` (K18 / packet_k=18); test passes |
| 9 | PERF-05: body_summary (RawMotionK10/K21 axes) unchanged and still present | VERIFIED | `protocol_tests.rs:342-362,393-414` — both K10 and K21 tests assert `body_summary` axes, counts, and heart_rate after exclusion; all pass |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `GooseSwift/GooseAppModel.swift` | SYNC-01 weak-capture comments + SYNC-04 confinement comment | VERIFIED | Commit `b6a25c9`: +7 lines (2 SYNC-01 comment blocks, 1 SYNC-04 3-line block) |
| `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` | Three `&+=` wrapping increments (SYNC-02) | VERIFIED | Commit `9d26124`: 3 changed lines (`+= 1` → `&+= 1` at lines 26, 494, 672) |
| `GooseSwift/GooseBLEClient+Parsing.swift` | Padding comment (SYNC-03) + lowercase confirmation comment (SYNC-05) | VERIFIED | Commit `2f38f87`: 7 added lines (3-line SYNC-03 comment, SYNC-05 comment replacing prior comment) |
| `Rust/core/src/protocol.rs` | `body_hex` conditional exclusion for K10/K21 (PERF-05) | VERIFIED | Commit `cd3d4e1`: `matches!(packet_k, Some(10) | Some(21))` conditional before struct literal |
| `Rust/core/tests/protocol_tests.rs` | K10/K21 `body_hex` empty assertions; K18 regression guard | VERIFIED | Commits `3b1447a` + `cd3d4e1`: K10 asserts `is_empty()`, K21 asserts `is_empty()`, K18 asserts populated literal; also WR-01 R17 assertion added in `db5df0e` |
| `GooseSwift/AppShellView.swift` | Unchanged (no retaining closure found) | VERIFIED | Commit `b6a25c9` confirms AppShellView.swift not touched; `healthStore` is `@State` value type, no closure capture — no teardown needed |
| `GooseSwift/GooseBLEClient.swift` | Unchanged (SYNC-04 went to GooseAppModel.swift per fork drift) | VERIFIED | No SYNC-relevant change; `activeDeviceGeneration` does not exist in fork; `connectedDeviceGeneration` is the fork equivalent, located in GooseAppModel.swift |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `GooseAppModel.onHistoricalSyncProgress` | `GooseBLEClient.onHistoricalSyncProgress` | `[weak self]` capture + SYNC-01 comment | VERIFIED | `GooseAppModel.swift:372-377` — assignment confirmed with `[weak self]` and intent comment |
| `GooseAppModel.onHistoricalRangeTelemetry` | `GooseBLEClient.onHistoricalRangeTelemetry` | `[weak self]` capture + SYNC-01 comment | VERIFIED | `GooseAppModel.swift:379-382` — same pattern |
| `parse_data_packet_payload` | `ParsedPayload::DataPacket.body_hex` | `matches!(packet_k, Some(10) | Some(21))` conditional | VERIFIED | `protocol.rs:509-513` — conditional local computed before struct literal assignment at line 524 |
| `GooseBLEClient+Parsing.generation(from:)` | `uuid.uuidString.lowercased()` | lowercase before hasPrefix | VERIFIED | `GooseBLEClient+Parsing.swift:359` — `let lower = uuid.uuidString.lowercased()` then `lower.hasPrefix("61080001")` |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| K10 body_hex is empty after PERF-05 | `cargo test -p goose-core --test protocol_tests parses_k10` | 1 passed, 0 failed | PASS |
| K21 body_hex is empty after PERF-05 | `cargo test -p goose-core --test protocol_tests parses_k21` | 1 passed, 0 failed | PASS |
| K18 body_hex still populated (regression guard) | `cargo test -p goose-core --test protocol_tests parses_history_packet_stable` | 1 passed, 0 failed | PASS |
| Full Rust test suite | `cargo test -p goose-core` | all suites green (0 failed) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SYNC-01 | 20-01-PLAN.md | Gen4 historical sync weak capture | SATISFIED | `GooseAppModel.swift:372-382` — `[weak self]` on both callbacks + SYNC-01 comment. Note: REQUIREMENTS.md still shows `[ ]` (upstream symbol names; file was not updated post-execution — documentation gap only, not a code gap) |
| SYNC-02 | 20-01-PLAN.md | Wrapping arithmetic on per-sync counters | SATISFIED | `GooseBLEClient+HistoricalHandlers.swift:26,494,672` — all three sites use `&+= 1` |
| SYNC-03 | 20-01-PLAN.md | 4-byte padding documented | SATISFIED | `GooseBLEClient+Parsing.swift:948-950` — 3-line comment present above `let padding`. Note: REQUIREMENTS.md references `GooseBLETypes.swift:buildGen4CommandFrame` but fork equivalent is `GooseBLEClient+Parsing.swift:buildV5CommandFrame` — known fork drift, documented in PLAN |
| SYNC-04 | 20-01-PLAN.md | Queue-confinement comment on device-generation property | SATISFIED | `GooseAppModel.swift:59-62` — comment on `connectedDeviceGeneration`. Note: REQUIREMENTS.md references `GooseBLEClient.swift:activeDeviceGeneration` but that symbol does not exist in the fork — known drift, documented in PLAN |
| SYNC-05 | 20-01-PLAN.md | UUID lowercased before hasPrefix | SATISFIED | `GooseBLEClient+Parsing.swift:353-360` — SYNC-05 comment + `lower.hasPrefix(...)` confirmed; `GooseBLETypes.swift:18` covers command UUID |
| PERF-05 | 20-02-PLAN.md | body_hex excluded from K10/K21 JSON | SATISFIED | `protocol.rs:509-513` — conditional exclusion; `protocol_tests.rs:341,392` — empty assertions; K18 regression guard at line 192; `cargo test` all green |

**Note on REQUIREMENTS.md checkbox status:** SYNC-01 through SYNC-05 appear as `[ ]` (unchecked) in REQUIREMENTS.md. This is a documentation tracking gap — the REQUIREMENTS.md was created before phase execution using upstream PR #26 symbol names that do not match fork identifiers. The PLAN explicitly documents this fork drift for each requirement and maps each upstream symbol to its fork equivalent. The code changes satisfy the intent of each requirement. Only PERF-05 was pre-checked as `[x]` in REQUIREMENTS.md. No code is missing.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER markers found in any modified file | — | — |

No stub implementations, no empty handlers, no hardcoded placeholders found.

---

### Code Review Issues (from 20-REVIEW.md)

A code review was conducted and a follow-up commit (`db5df0e`) was applied during the same session. Tracking:

| Finding | Severity | Status |
|---------|----------|--------|
| CR-01: body_byte_count reports 0 for K10/K21 after PERF-05 (bridge.rs:2859) | Critical | **Fixed** in `db5df0e` — `body_byte_count` now derived from `declared_len - body_offset` when `body_hex` is empty |
| WR-01: No positive body_hex assertion for R17/non-excluded frames | Warning | **Fixed** in `db5df0e` — R17 test now asserts `!body_hex.is_empty()` at `protocol_tests.rs:255-258` |
| WR-02: body_hex empty string conflates absent vs excluded (should be Option<String>) | Warning | **Not addressed** — `body_hex: String` type unchanged; empty string is exclusion sentinel. Acceptable for this phase; downstream consumers (`timeline.rs` via `non_empty()`, `bridge.rs` via conditional) handle it correctly |
| IN-01: SYNC-02 counters are Int not UInt — wrapping to negative is misleading | Info | **Not addressed** — counters remain `var ... = 0` (Int). In practice 64-bit Int cannot overflow during a BLE sync. No behavioral defect. |

WR-02 and IN-01 were review-level observations, not plan must-haves. They do not affect the phase goal.

---

### Human Verification Required

None. All behaviors are verifiable programmatically:
- Rust test suite passes (confirmed by running `cargo test`)
- Swift changes are documentation/arithmetic operators only (confirmed by reading source)
- xcodebuild was run by the executor and passed (BUILD SUCCEEDED on iPhone 17 simulator, iOS 26.5)

---

### Gaps Summary

No gaps. All 9 must-have truths are verified in the codebase. All 6 requirement IDs are satisfied by observable code artifacts. The Rust test suite is fully green. The three code review findings that remained open (WR-02, IN-01) are not plan requirements and do not affect phase goal achievement.

The only notable discrepancy is the REQUIREMENTS.md checkbox state: SYNC-01 through SYNC-05 remain `[ ]` because the REQUIREMENTS.md uses upstream symbol names and was not updated post-execution. This is a documentation tracking issue, not a code issue — every requirement's intent is demonstrably satisfied in the codebase.

---

_Verified: 2026-06-06T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
