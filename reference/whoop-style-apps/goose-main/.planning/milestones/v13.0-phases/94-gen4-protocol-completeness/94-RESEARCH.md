# Phase 94: Gen4 Protocol Completeness - Research

**Researched:** 2026-06-19
**Domain:** WHOOP Gen4 BLE protocol — packet parsing, metric feature extraction, historical sync body rows
**Confidence:** HIGH (all findings sourced directly from codebase grep/read)

## Summary

Phase 94 fixes two independent bugs in the Gen4 WHOOP 4.0 code path. Both bugs cause data that physically arrives over BLE to be silently discarded before it reaches the UI.

**Bug 1 — respiratory_rate_rpm always None for Gen4 (GEN4-06):** The V24History packet (packet_k=24) is the Gen4 history body format. It carries `resp_raw` at body offset 73 and `skin_temp_raw` at body offset 65. The `skin_temperature_plan_from_payload` function correctly accepts `packet_k=24` and maps it to the right byte offsets. However, `respiratory_rate_plan_from_payload` only accepts `packet_k=18` — it does **not** have an arm for `packet_k=24`. V24History frames are therefore silently skipped for respiratory rate extraction. The V24 `resp_raw` field is a raw 16-bit ADC value (zero-crossing algorithm applied at the metrics layer); the correct encoding and scale for this field is not yet confirmed in the codebase — this is the key unknown the planner must flag.

**Bug 2 — packet47 body rows dropped in Gen4 historical sync (SYNC-07):** Gen4 historical sync uses the page-sequence protocol on service UUID 61080005. Frames are accumulated in `pendingHistoricalFrames` and flushed in batches via `capture.import_frame_batch` → `import_captured_frame_timed`. Each frame is parsed with `parse_frame(DeviceType::Gen4, ...)`. The Gen4 frame format uses a 4-byte header (0xAA + u16 LE payload length + CRC8) and a 4-byte CRC32 trailer. The Swift `gen4Frames()` / `gen4Payload()` correctly extracts the inner payload bytes. The Rust `parse_frame` for Gen4 correctly validates CRC8. Once the parsed frame reaches `insert_decoded_frame`, historical data packets (packet type 0x2F = 47 decimal) should produce a decoded row. The `packet47_count` counter in the sleep session table is incremented via a separate path. Investigation shows `packet47_count` is tracked only in `store/mod.rs` sleep session upsert — the SQLite counter is updated, but whether the corresponding body hex rows are actually written depends on `insert_decoded_frame` completing without error and on `body_hex` being non-empty. The `body_hex` is suppressed for `packet_k` values 10, 21, and 24 (K10/K21 PERF-05 compaction) — packet_k=24 body is **suppressed** (`body_hex = ""`), which means even if the frame is stored, the body content is not available for metric extraction. This is the core of SYNC-07: the `compact_raw_payloads: true` flag in the flush call may be vacuuming raw evidence, but separately the body_hex suppression for packet_k=24 means metric features cannot read the payload back out.

**Primary recommendation:** For GEN4-06: add `packet_k=24` arm to `respiratory_rate_plan_from_payload` in `metric_features.rs` using the V24 body's `resp_raw` field at absolute offset `3 + 73 = 76`. For SYNC-07: investigate whether `body_hex` suppression for `packet_k=24` is the root cause of missing body rows, or if the bug is upstream in the Gen4 frame parsing / device_type routing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gen4 frame parsing (BLE bytes → payload) | Rust core (protocol.rs) | Swift (gen4Frames/gen4Payload) | Swift extracts inner bytes; Rust validates CRC and structures ParsedFrame |
| packet_k dispatch (payload → DataPacketBodySummary) | Rust core (protocol.rs) | — | parse_data_packet_body_summary owns all packet_k routing |
| Metric feature extraction (frames → respiratory_rate_rpm) | Rust core (metric_features.rs) | — | respiratory_rate_plan_from_payload + respiratory_rate_feature_from_plan |
| Historical sync body row persistence | Rust core (store/mod.rs, capture_import.rs) | Swift flush pipeline | insert_decoded_frame writes; Swift batches and flushes |
| packet47_count tracking | Rust core (store/mod.rs) | bridge/sleep.rs | Counter in sleep_sessions table |
| Recovery metric population (skin_temp_delta_c) | Rust core (metric_features.rs) | — | recovery_provided_vitals_feature reads from options |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GEN4-06 | MetricFeatures.respiratory_rate_rpm and skin_temp_delta_c populated from Gen4 packet bytes — not None | Root cause found: respiratory_rate_plan_from_payload missing packet_k=24 arm; skin_temp already works via packet_k=24 arm in skin_temperature_plan_from_payload |
| SYNC-07 | Gen4 historical sync on service UUID 61080005 produces packet47 body rows in SQLite — no bodies dropped | Root cause direction: body_hex suppression for packet_k=24 (PERF-05 compaction path in protocol.rs line 696) may zero out body content; need to verify store insert path |

## Standard Stack

### Core (this phase touches only existing Rust files — no new dependencies)
| File | Current State | Change Required |
|------|--------------|-----------------|
| `src/metric_features.rs` | `respiratory_rate_plan_from_payload` only accepts packet_k=18 | Add packet_k=24 arm targeting resp_raw at body offset 73 (absolute offset 76) |
| `src/metric_features.rs` | `skin_temperature_plan_from_payload` accepts packet_k=24 correctly | No change needed — skin_temp works |
| `src/protocol.rs` | body_hex suppressed for `packet_k=Some(10) | Some(21) | Some(24)` at line 696 | Evaluate if packet_k=24 suppression is causing SYNC-07; historical frames need body_hex |
| `src/store/mod.rs` | packet47_count tracked in sleep_sessions | Verify this counter increments when Gen4 historical frames arrive |
| `tests/v24_biometric_protocol_tests.rs` | Tests parse_v24_body_for_test round-trip | Add test for respiratory_rate_plan extraction on V24 packet_k=24 frames |

**Installation:** No new packages — pure Rust source edits.

## Package Legitimacy Audit

This phase installs no external packages. No audit required.

## Architecture Patterns

### System Architecture Diagram

```
BLE (Gen4, UUID 61080005)
        |
        v
Swift: gen4Frames() → gen4Payload()       [CoreBluetoothBLETransport+Parsing.swift]
        |
        v
Swift: pendingHistoricalFrames.append()   [CoreBluetoothBLETransport+HistoricalHandlers.swift]
        |  (batched, device_type = "GEN4")
        v
Rust: capture.import_frame_batch          [bridge/capture.rs:55]
        |
        v
Rust: parse_frame(DeviceType::Gen4, raw)  [protocol.rs]
  → 4-byte header: 0xAA + u16LE len + CRC8
  → 4-byte CRC32 trailer
  → payload = bytes[4..len+4]
  → packet_type = payload[0]  (0x2F = 47 = historicalData)
  → packet_k   = payload[1]  (24 for V24History on Gen4)
  → body_hex suppressed if packet_k in {10, 21, 24}   ← SYNC-07 suspect
        |
        v
Rust: insert_decoded_frame()              [store/mod.rs]
        |
        v
[for metric extraction, later:]
Rust: respiratory_rate_plan_from_payload  [metric_features.rs:4268]
  → ONLY accepts packet_k=18             ← GEN4-06 bug
  → does NOT accept packet_k=24
  → V24History resp_raw at body[73] is never read
```

### Recommended Project Structure

No structural changes required — this is a targeted bug fix phase. All edits are within existing files.

### Pattern 1: Adding a packet_k arm to an extractor plan function

The pattern for `skin_temperature_plan_from_payload` already shows how to add a V24 arm (packet_k=24). The same pattern applies to `respiratory_rate_plan_from_payload`:

```rust
// Source: src/metric_features.rs:4223-4265 (skin_temperature_plan_from_payload)
// The existing packet_k=24 arm for skin temp uses:
//   raw_body_offset: 3   (body-relative offset of skin_temp_raw)
//   raw_absolute_offset: 16  (payload[0..3] header + 3 = 16... wait — see Pitfall 1)
//
// For respiratory rate (resp_raw at body offset 73):
//   raw_body_offset: 73
//   raw_absolute_offset: 76  (3-byte data-packet header + 73)
//   encoding: TBD — "u16_le" is the raw type; scale factor unknown
24 => Some(RespiratoryRatePlan {
    packet_k: *packet_k,
    timestamp_seconds: *timestamp_seconds,
    timestamp_subseconds: *timestamp_subseconds,
    schema_field: "v24_history_k24_body_73_respiratory_rate_candidate",
    raw_body_offset: 73,
    raw_absolute_offset: 76,
    encoding: "u16_le_x??",   // UNKNOWN — see Open Questions
    scale: ???,
}),
```

**Critical note on body_summary guard:** `respiratory_rate_plan_from_payload` currently guards on `DataPacketBodySummary::NormalHistory { .. } | DataPacketBodySummary::V18History { .. }`. It must also accept `DataPacketBodySummary::V24History { .. }` for packet_k=24 to be reachable.

### Pattern 2: body_hex suppression check

```rust
// Source: src/protocol.rs:696
// This line suppresses body_hex for packet_k values 10, 21, 24:
let body_hex = if matches!(packet_k, Some(10) | Some(21) | Some(24)) {
    // ...body_hex = ""
```

For historical sync, the body content of packet_k=24 frames is the entire V24 sensor payload. If `body_hex` is empty, `respiratory_rate_feature_from_plan` cannot read the raw bytes — it calls `decode_hex_with_whitespace(&row.payload_hex)` and then indexes into `plan.raw_absolute_offset`. The payload_hex (full frame hex) is still stored; only body_hex is stripped. This means the metric extractor works off `payload_hex` not `body_hex` — so suppressing `body_hex` does NOT break respiratory rate extraction. This means SYNC-07 is a different bug.

### Anti-Patterns to Avoid

- **Adding only the packet_k=24 arm without updating the body_summary guard:** `respiratory_rate_plan_from_payload` currently guards on `NormalHistory | V18History`. Adding `packet_k=24` without also adding `V24History` to the guard produces dead code — packet_k=24 always goes through the V24History path, which is excluded by the guard.
- **Changing body_hex suppression for packet_k=24 without testing K10/K21 compaction:** The suppression at line 696 was added for PERF-05 (K10/K21 raw motion compaction). packet_k=24 was added alongside K10/K21 — it may have been intentional suppression (V24 is large). Removing suppression for historical frames only requires conditional logic.
- **Assuming resp_raw scale from skin_temp scale:** skin_temp uses NTC linearisation formula `(raw − 930) / 30 + 33`. resp_raw is a zero-crossing signal — the scale factor (if any) is different and unconfirmed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Respiratory rate from raw signal | Custom zero-crossing in metric_features | Read from packet's pre-computed resp_raw field | Device firmware already runs zero-crossing; resp_raw is the output |
| Gen4 frame parsing | New Swift/Rust parser | Existing `gen4Frames()` + `parse_frame(DeviceType::Gen4,...)` | Both are tested and correct |
| packet_k routing | New dispatch table | Existing `parse_data_packet_body_summary` match | Adding a match arm is the correct extension point |
| Body row insertion | Direct SQL | `insert_decoded_frame` via `import_captured_frame_timed` | Transaction safety, dedup, schema version guard |

## Common Pitfalls

### Pitfall 1: raw_absolute_offset arithmetic for V24

**What goes wrong:** The data-packet payload layout is `[packet_type, packet_k, status/flags, body...]`. The body starts at `payload[3]`. V24 body offsets are body-relative (relative to `payload[3]`), so `raw_absolute_offset = 3 + raw_body_offset`.

**Why it happens:** `parse_v24_body_summary` does `let data = payload.get(3..).unwrap_or(&[])` and then uses body-relative offsets. The plan's `raw_absolute_offset` must account for the 3-byte header skip.

**Verification:** `skin_temperature_plan_from_payload` for packet_k=24 uses `raw_body_offset: 3, raw_absolute_offset: 16`. That gives `16 - 3 = 13` — but the V24 layout comment says skin_temp_raw is at body offset 65. This does NOT match. Read that arm carefully:

```
// Source: src/metric_features.rs:4254-4263
24 => Some(SkinTempera  encoding: "u16_le_x1000",
    scale: 1000.0,
}),
```

This refers to a **different** skin temperature field — not the NTC field at body offset 65 (`skin_temp_raw` in V24History), but a different candidate at body offset 3 of that specific packet format. The schema_field name is `"normal_history_k24_body_3_skin_temperature_c"`. So packet_k=24 has TWO temperature candidates: the one at body offset 3 (captured by the existing plan, scale 1000) and the NTC field at body offset 65 (in the V24History struct, converted by formula). The existing skin_temp plan is a DIFFERENT byte than the V24History `skin_temp_raw`.

**Warning signs:** If skin_temp_delta_c is always None despite body rows existing, check whether `vital_event_plan_from_payload` (not `skin_temperature_plan_from_payload`) is the path that populates the recovery score inputs.

### Pitfall 2: V24History body_summary guard is missing from respiratory_rate_plan_from_payload

**What goes wrong:** The guard at line 4278 only matches `NormalHistory | V18History`. Even if packet_k=24 arm is added to the inner `match`, the outer `let Some(ParsedPayload::DataPacket { body_summary: Some(NormalHistory | V18History), ...})` guard returns `None` first for V24History packets.

**How to avoid:** Update the body_summary guard to include `| DataPacketBodySummary::V24History { .. }` alongside the existing variants.

**Warning signs:** respiratory_rate_inputs count remains 0 after the fix — verify the guard was updated, not just the inner match arm.

### Pitfall 3: Tracing the actual SYNC-07 root cause

**What goes wrong:** body_hex suppression for packet_k=24 is NOT the cause of missing packet47 body rows — the metric extractor reads from `payload_hex` (full frame hex), not `body_hex`. The real bug is likely one of:

1. Gen4 frames arriving on the data characteristic (UUID 61080005) are not routed to `handleHistoricalSyncValue` because `isHistoricalSyncing` is false at the time data arrives (timing issue between page request acknowledgment and data arrival).
2. `parse_frame(DeviceType::Gen4, ...)` is called with the wrong device_type — if `catalog.historicalDeviceType` returns "GEN4" but this is mapped to a different `DeviceType` enum variant.
3. The `pendingHistoricalFrames` flush uses `compact_raw_payloads: true` which calls `compact_raw_evidence_payloads_to_limit` — this trims the oldest raw_evidence rows but does not affect decoded_frames rows. This is not the cause.
4. The `shouldDispatchNotificationSideEffectsToMain` guard routes historical data packets to main only `if isHistoricalSyncing` — but on Gen4, the data arrives on UUID 61080005 which must be in `notificationCharacteristicIDs`. Verify this UUID is subscribed.

**How to avoid:** Add a targeted test that creates a Gen4-framed historical data packet (packet type 0x2F, device_type Gen4) and verifies `import_captured_frame_timed` produces a decoded_frames row and that `packet47_count` increments in the session.

**Warning signs:** `historicalPacketsReceivedThisSync` is 0 even though the BLE log shows notifications arriving on 61080005.

### Pitfall 4: Cargo test fixture updates required

**What goes wrong:** Adding V24History to the `respiratory_rate_plan_from_payload` body_summary guard will cause no compilation error but may require test fixture updates if any test uses a V24History frame and checks that respiratory_rate_inputs is empty.

**How to avoid:** After the fix, run `cargo test --locked` and look for assertion failures in `v24_biometric_protocol_tests.rs` and any metric_features integration tests.

## Code Examples

### V24 body layout (key offsets for this phase)

```
// Source: src/protocol.rs:917-935 (V24 history payload body layout)
// Offsets are body-relative (relative to payload[3]):
//   offset 14:    u8,   hr (bpm)
//   offset 65:    u16 LE, skin_temp_raw; degC = (raw − 930) / 30 + 33
//   offset 73:    u16 LE, resp_raw (respiration signal; zero-crossing)
//   offset 75:    u16 LE, sig_quality
//
// Absolute payload offsets (add 3 for the data-packet header):
//   payload[68..70] = skin_temp_raw  (body 65)
//   payload[76..78] = resp_raw       (body 73)
//
// Guard: body must be ≥ 77 bytes (body offset 75 + 2)
// So payload must be ≥ 80 bytes (77 body + 3 header)
```

### respiratory_rate_plan_from_payload — required change

```rust
// Source: src/metric_features.rs:4268-4301 (current implementation)
// BEFORE: only NormalHistory | V18History in body_summary guard, only packet_k=18 in match

// AFTER (required):
fn respiratory_rate_plan_from_payload(
    parsed_payload: &Option<ParsedPayload>,
) -> Option<RespiratoryRatePlan> {
    let Some(ParsedPayload::DataPacket {
        packet_k: Some(packet_k),
        timestamp_seconds,
        timestamp_subseconds,
        body_summary:
            Some(
                DataPacketBodySummary::NormalHistory { .. }
                | DataPacketBodySummary::V18History { .. }
                | DataPacketBodySummary::V24History { .. },  // ADD THIS
            ),
        ..
    }) = parsed_payload
    else {
        return None;
    };

    match *packet_k {
        18 => Some(RespiratoryRatePlan { /* existing */ }),
        24 => Some(RespiratoryRatePlan {
            packet_k: *packet_k,
            timestamp_seconds: *timestamp_seconds,
            timestamp_subseconds: *timestamp_subseconds,
            schema_field: "v24_history_k24_body_73_resp_raw_candidate",
            raw_body_offset: 73,
            raw_absolute_offset: 76,  // 3-byte data-packet header + 73
            encoding: "u16_le_raw",   // TBD — see Open Questions
            scale: 1.0,
        }),
        _ => None,
    }
}
```

### Gen4 historical frame flow (Swift → Rust)

```swift
// Source: CoreBluetoothBLETransport+HistoricalHandlers.swift:68-123
// Swift accumulates frames and calls: bridge.request(method: "capture.import_frame_batch", args)
// args["frames"] contains: { "device_type": "GEN4", "frame_hex": "<hex>", ... }
// args["compact_raw_payloads"] = true  (PERF-05: trims raw_evidence, not decoded_frames)
```

```rust
// Source: src/capture_import.rs:566-750 (import_captured_frame_timed)
// DeviceType::Gen4 routes to: parse_frame(DeviceType::Gen4, &raw_bytes)
// Gen4 frame structure: [0xAA][len_lo][len_hi][CRC8][payload...][CRC32 x4]
// packet_type = payload[0] = 0x2F (47) for historical data
// packet_k    = payload[1] = 24 for V24History
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single history body format (NormalHistory) | Multiple variants: NormalHistory, V18History, V24History, Unknown | v12.0 Phase 83/86 | V24History is the Gen4 format; extractors not fully updated |
| bridge.rs monolith | Modular bridge/ submodules | v12.0 Phase 86 | bridge/capture.rs, bridge/metrics.rs, bridge/sleep.rs |
| store.rs monolith | Modular store/ submodules | v12.0 Phase 87 | store/sleep.rs, store/capture.rs, store/metrics.rs, store/activity.rs |
| respiratory_rate: validation only | respiratory_rate: candidate extraction from packet_k=18 | v11.0 | packet_k=24 was never added |

**Deprecated/outdated:**
- `respiratory_rate_semantics_unverified` quality flag: still present because resp_raw encoding/scale for V24 is unconfirmed. The planner must treat this phase as adding a "candidate" feature (with quality flags), not a production-promoted metric.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | resp_raw at V24 body offset 73 is the respiration signal for Gen4 | Code Examples | If wrong offset, extracted values will be noise — quality range gate (6–30 rpm) will catch most bad values |
| A2 | respiratory_rate_feature_from_plan reads from payload_hex (full frame), not body_hex | Common Pitfalls | If it reads from body_hex and body_hex is suppressed for pk=24, extraction will always return None |
| A3 | SYNC-07 root cause is NOT body_hex suppression but rather a timing/routing issue | Common Pitfalls | If suppression IS the cause, the fix is to un-suppress pk=24 body_hex for historical frames |
| A4 | resp_raw encoding for V24 is raw u16 LE with no firmware-side scale factor | Open Questions | If scale is e.g. 1/10 (like pk=18 u16_le_x10), the extracted values will be 10x too high |

## Open Questions (RESOLVED)

1. **What is the correct scale/encoding for V24 resp_raw (body offset 73)?**
   - RESOLVED: Use `u16_le_raw` with scale=1.0, tagged as `provisional_capture_schema_candidate` with quality flag `v24_resp_raw_encoding_unverified`. Plausibility range gate (6–30 rpm) catches implausible values. A hardware capture can validate later.

2. **What is the true SYNC-07 root cause?**
   - RESOLVED: TDD probe at runtime — executor adds integration test calling `import_captured_frame_timed` with a synthetic Gen4 historical frame (type 0x2F, pk=24). If test fails, the Rust import path is the bug; if passes, the bug is in Swift routing. Plan 94-02 documents whichever root cause is found.

3. **Does skin_temp_delta_c actually work end-to-end for Gen4?**
   - RESOLVED: Executor traces the full chain READ-ONLY: `skin_temperature_plan_from_payload` → `skin_temperature_feature_from_plan` → `VitalEventFeatureReport.skin_temperature_inputs` → `MetricFeatures.skin_temp_delta_c`. If the chain is broken, the executor escalates (does not silently file a follow-up); GEN4-06 may require splitting into GEN4-06a (respiratory rate) and GEN4-06b (skin temp) for the next phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | cargo test --locked | ✓ | 1.96 (MSRV) | — |
| Cargo.lock | reproducible builds | ✓ | committed | — |
| WHOOP 4.0 hardware | SYNC-07 live validation | ✗ (not available in CI) | — | Integration test with synthetic Gen4 frames |

**Missing dependencies with no fallback:**
- Physical WHOOP 4.0 device: live BLE validation of packet47 body insertion. Mitigated by synthetic fixture tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in + cargo integration tests |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test --locked --test v24_biometric_protocol_tests` |
| Full suite command | `cargo test --locked` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEN4-06 | respiratory_rate_plan returns Some for V24History packet_k=24 | unit | `cargo test --locked --test v24_biometric_protocol_tests -- respiratory_rate` | ❌ Wave 0 |
| GEN4-06 | resp_raw at body offset 73 extracted correctly for pk=24 payload | unit | `cargo test --locked --test v24_biometric_protocol_tests -- v24_resp_raw` | ❌ Wave 0 |
| SYNC-07 | Gen4-framed historical data packet (type 0x2F, pk=24) produces decoded_frames row | integration | `cargo test --locked --test store_tests -- gen4_historical_import` | ❌ Wave 0 |
| SYNC-07 | packet47_count increments when Gen4 historical frame imported | integration | `cargo test --locked --test store_tests -- packet47_count_gen4` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test --locked --test v24_biometric_protocol_tests`
- **Per wave merge:** `cargo test --locked`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Add respiratory rate extraction test for V24History frames to `Rust/core/tests/v24_biometric_protocol_tests.rs`
- [ ] Add Gen4 historical frame import integration test to `Rust/core/tests/store_tests.rs`

## Security Domain

This phase modifies protocol parsing and metric extraction only. No authentication, session management, cryptography, or input validation from untrusted external sources is touched beyond what is already present. The body_hex field is internal to the SQLite store — no injection vectors introduced.

ASVS V5 (Input Validation) applies only to the `resp_raw` range gate (6–30 rpm) which is already implemented in `respiratory_rate_feature_from_plan` for the existing pk=18 path and must be preserved for pk=24.

## Sources

### Primary (HIGH confidence — verified by direct codebase read)
- `src/metric_features.rs:4268-4301` — `respiratory_rate_plan_from_payload` implementation; confirmed packet_k=18 only
- `src/metric_features.rs:4223-4265` — `skin_temperature_plan_from_payload`; confirmed packet_k=24 arm exists
- `src/protocol.rs:917-1035` — V24 body layout; confirmed resp_raw at body offset 73, skin_temp_raw at body offset 65
- `src/protocol.rs:696` — body_hex suppression for packet_k in {10, 21, 24}
- `src/protocol.rs:727-743` — packet_k dispatch; confirmed 24 routes to V24History
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift:68-123` — flush pipeline confirmed
- `GooseSwift/CoreBluetoothBLETransport+PeripheralDelegate.swift:156-179` — isHistoricalSyncing guard confirmed
- `GooseSwift/DeviceCatalog.swift:38-40` — historicalDeviceType returns "GEN4" for page-sequence devices
- `src/store/mod.rs:286,1906,2028,2053,2081` — packet47_count schema and upsert confirmed
- `src/openwhoop_reference.rs:65` — WHOOP_DATA_FROM_STRAP_GEN4 = "61080005-8d6d-82b8-614a-1c8cb0f8dcc6"

### Secondary (MEDIUM confidence — inferred from cross-file reading)
- `respiratory_rate_feature_from_plan` reads from `row.payload_hex` via `decode_hex_with_whitespace` — body_hex suppression does not break extraction path
- Gen4 historical packet flow: Swift `gen4Frames()` → `gen4Payload()` → `pendingHistoricalFrames` → `capture.import_frame_batch` → `parse_frame(DeviceType::Gen4)` → `insert_decoded_frame`

## Metadata

**Confidence breakdown:**
- Bug 1 root cause (GEN4-06): HIGH — missing match arm is a code fact, not an inference
- Bug 2 root cause (SYNC-07): MEDIUM — body_hex suppression ruled out; actual root cause requires targeted test to confirm
- V24 resp_raw encoding/scale: LOW — field documented but scale factor not confirmed from hardware

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable protocol codebase; unlikely to change without this phase touching it)
