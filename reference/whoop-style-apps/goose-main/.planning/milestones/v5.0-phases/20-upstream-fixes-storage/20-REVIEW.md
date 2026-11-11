---
phase: 20-upstream-fixes-storage
reviewed: 2026-06-06T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/GooseBLEClient+HistoricalHandlers.swift
  - GooseSwift/GooseBLEClient+Parsing.swift
  - Rust/core/src/protocol.rs
  - Rust/core/tests/protocol_tests.rs
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-06-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files were reviewed targeting four upstream fixes: SYNC-01 (weak self doc comments on two closures), SYNC-02 (wrapping arithmetic on Gen4 historical page sequence counters), SYNC-03 (padding alignment comment on command frame builder), SYNC-04 (doc comment on `connectedDeviceGeneration`), SYNC-05 (lowercased UUID comment in `generation()`), and PERF-05 (body_hex exclusion for K10/K21 frames).

The SYNC-xx changes are all comment-only or cosmetically correct. The wrapping arithmetic (`&+=`) on the three `Int`-typed counters is safe in practice but technically conflates signed-wrapping semantics with the intent of a monotonic counter — no real-world sync will overflow, so this is a latent quality concern rather than a correctness bug.

The PERF-05 change has one concrete correctness defect: `compact_parsed_frame_summary` in `bridge.rs` computes `body_byte_count` directly from `body_hex.len() / 2`, producing `body_byte_count = 0` for every K10 and K21 frame. This incorrect value propagates through the Swift compact-summary path (`NotificationFrameParsing` → `WhoopEventSamples` → diagnostic strings), causing every K10/K21 frame to be reported as "0 bytes" in the UI and BLE event log. The `body_summary` data (axes, heart_rate, etc.) is unaffected — this is a display-layer data error.

Two additional quality issues are noted: the PERF-05 test suite lacks a positive assertion that body_hex is non-empty for non-K10/K21 high-volume candidates (e.g., K17 R17), and the `body_hex = ""` sentinel conflates two distinct conditions ("body absent/truncated" and "body excluded by PERF-05") in the serialized type.

---

## Critical Issues

### CR-01: body_byte_count Reports Zero for All K10/K21 Frames After PERF-05

**File:** `Rust/core/src/bridge.rs:2859`
**Issue:** `compact_parsed_frame_summary` computes `body_byte_count` as `body_hex.len() / 2`. After PERF-05, `body_hex` is unconditionally `String::new()` for K10 and K21 frames, so `body_byte_count` is always 0 regardless of actual frame size (K10 ~1275 bytes, K21 ~1037 bytes). This value propagates:

- `NotificationFrameParsing.swift:113` reads `body_byte_count` from the compact JSON into `bodyByteCount`.
- `WhoopEventSamples.swift:277` logs `"K10 raw_motion_stream_result body=0 bytes"` for every K10 frame.
- `WhoopDataSignalPipeline.swift:116` emits `"K10 0 bytes"` in the UI device signal display.
- `WhoopEventSamples.swift:325–326` includes `bytes=\(bodyByteCount)` in the full log summary, where it will always show `bytes=0` for K10/K21.

The body_summary carries the correct structured data, so no metric or algorithm is broken. But the diagnostic layer systematically misreports the actual body size for the two most voluminous packet types, making it impossible to distinguish "empty body" from "body present but excluded" in the log.

**Fix:** Compute `body_byte_count` from the payload slice length rather than from `body_hex` when parsing K10/K21. The cleanest fix is to carry an explicit `body_byte_count: usize` field from `parse_data_packet_payload` that is always the actual byte count of the body region, independent of whether `body_hex` is populated:

```rust
// In parse_data_packet_payload, before the PERF-05 conditional:
let body_start = 13.min(payload.len());
let body_byte_count = payload.len().saturating_sub(body_start);

let body_hex = if matches!(packet_k, Some(10) | Some(21)) {
    String::new()
} else {
    hex::encode(&payload[body_start..])
};

// Add body_byte_count to the DataPacket variant and to compact_parsed_frame_summary:
// "body_byte_count": body_byte_count,   // actual count, not body_hex.len()/2
```

Alternatively, fix only the compact summary by computing the byte count from `declared_len` and `body_offset` fields that are already present in `ParsedFrame`.

---

## Warnings

### WR-01: PERF-05 Test Coverage Missing Positive body_hex Preservation Assertion for R17/Other High-Volume Candidates

**File:** `Rust/core/tests/protocol_tests.rs:234`
**Issue:** The two K10 and K21 tests both assert `body_hex.is_empty()` (GREEN state). There is no corresponding test that explicitly asserts `body_hex` is **non-empty** for a frame type that is not excluded by PERF-05 but is structurally similar (e.g., K17 R17 optical, K11, K19). The `parses_history_packet_stable_header_and_hr_marker` test (K18) implicitly does this via an exact struct equality assertion, but:

1. That test predates PERF-05 and was not written to guard the exclusion boundary.
2. The two R17 tests (`parses_r17_optical_body_offsets_and_signed_sample_stats`, `r17_truncated_samples_warn_without_losing_available_values`) destructure with `..` and never inspect `body_hex`, so a future regression that accidentally adds K17 to the exclusion list would not be caught.

**Fix:** Add an explicit assertion to one of the R17 tests (the preferred place because R17 is the next-largest structured packet type):

```rust
// In parses_r17_optical_body_offsets_and_signed_sample_stats:
ParsedPayload::DataPacket { body_hex, .. } => {
    assert!(
        !body_hex.is_empty(),
        "body_hex must be populated for R17 (PERF-05 only excludes K10/K21)"
    );
    // ... existing assertions
}
```

### WR-02: body_hex Empty String Conflates Two Distinct Conditions (Structural Type Ambiguity)

**File:** `Rust/core/src/protocol.rs:505–513`
**Issue:** The `DataPacket` variant uses `body_hex: String` (not `Option<String>`). After PERF-05, an empty string (`""`) now means either:

- (A) The payload is too short to have a body (`payload.len() <= 13`), which is the natural `hex::encode(&[][..])` result.
- (B) The frame is K10 or K21 and body_hex was intentionally suppressed.

These conditions are externally indistinguishable. A consumer reading the serialized JSON for a K10 frame with a full-sized payload cannot tell whether the empty `body_hex` is because the packet was tiny or because it was excluded. The `body_summary` field's presence/variant provides a secondary signal, but the primary field is ambiguous.

This becomes observable when doing post-hoc analysis of stored frame JSON: a short K10 frame (e.g., during truncation) and a full K10 frame both serialize identically for `body_hex`.

**Fix:** Change the field type to `Option<String>`:

```rust
DataPacket {
    // ...
    body_hex: Option<String>,  // None = excluded by PERF-05; Some("") = genuinely empty body
    // ...
}
```

Set `body_hex = None` in the PERF-05 exclusion branch and `body_hex = Some(hex::encode(...))` otherwise (even when the encoded string is empty). Update all pattern-match consumers accordingly. This is a breaking schema change but adds unambiguous semantics.

If the type change is out of scope, at minimum document the dual meaning in a code comment on the `body_hex` field.

---

## Info

### IN-01: SYNC-02 Wrapping Arithmetic on Signed Int Counters Is Misleading

**File:** `GooseSwift/GooseBLEClient+HistoricalHandlers.swift:26,494,672`
**Issue:** The three counters `historicalPacketsReceivedThisSync`, `historicalRangePendingResponses`, and `coalescedHistoricalSyncProgressCallbackCount` are declared as `Int` (signed, 64-bit). The `&+=` operator applies wrapping (two's complement) semantics. If these counters ever wrapped, they would become negative, and the `== 0`, `== 1`, and `> 0` comparisons used downstream would produce incorrect results (e.g., `historicalPacketsReceivedThisSync == 0` would be `false` even after a wrap to `Int.min`, producing "N historical packets captured" where N is a large negative number in the completion message at line 624).

In practice, overflowing a 64-bit counter during a single BLE sync session is not realistic, so this is not an active bug. However, the stated justification ("long sync wraps instead of trapping") implies the developer anticipated real wrap scenarios, which is not the case for these counters.

**Fix:** Prefer `UInt` for these counters, eliminating wrapping from signed territory entirely:

```swift
var historicalPacketsReceivedThisSync: UInt = 0
var historicalRangePendingResponses: UInt = 0
var coalescedHistoricalSyncProgressCallbackCount: UInt = 0
```

With `UInt`, `&+=` still wraps on overflow but wraps to a large positive number (not negative), so `== 0` and `> 0` checks remain meaningful. Alternatively, if the counters should never overflow, use plain `+=` with a precondition, which makes the intent explicit.

---

_Reviewed: 2026-06-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
