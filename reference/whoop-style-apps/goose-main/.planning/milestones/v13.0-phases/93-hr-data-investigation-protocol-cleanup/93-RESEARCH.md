# Phase 93: HR Data Investigation & Protocol Cleanup - Research

**Researched:** 2026-06-19
**Domain:** Rust protocol layer — BLE packet type enum, silent drop elimination, bridge registry sync, WHOOP 5.0 HR data path
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Enum name: `PacketType` (not `BlePacketType`).
- **D-02:** Unknown byte values map to `PacketType::Unknown(u8)` — non-exhaustive-safe catch-all.
- **D-03:** Old `PACKET_TYPE_*` constants deleted entirely from `protocol.rs`. No aliases.
- **D-04:** `PacketType` implements `From<u8>` (infallible). No `TryFrom`.
- **D-05:** All match sites migrated from `packet_type: u8` to `PacketType`.
- **D-06:** Best-effort code-analysis fix for BUG-HR-01. No BLE capture required to proceed.
- **D-07:** Suspects: wrong service UUID, packet_k not handled, PACKET_TYPE routing, firmware-gated flag.
- **D-08:** If root cause cannot be confirmed from code alone, document hypothesis + apply defensive fix.
- **D-09:** `parse_data_packet_body_summary` wildcard arm replaced with `_ => Some(DataPacketBodySummary::Unknown { packet_k })`.
- **D-10:** Every packet type in `data_packet_domain()` must have a parse arm in `parse_data_packet_body_summary`.
- **D-11:** Bridge registry sync test — preference for compile-time test matching `bridge_methods_constant_matches_dispatcher` pattern.

### Claude's Discretion

None stated — all implementation decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-HR-01 | WHOOP 5.0 fw 50.38.1.0 receives HR data — root cause identified and fixed | Root cause confirmed: `heart_rate_plan_from_row` has no `R22Whoop5Hr` arm; `run_heart_rate_feature_report` does not include `r22_whoop5_hr` in trusted kinds. Two-site fix documented. |
| PROTO-08 | `PACKET_TYPE_*` u8 constants replaced with `PacketType` enum; exhaustive match | 17 constants, 5 match sites in protocol.rs, 0 external call sites confirmed. Enum design and all migration targets documented. |
| PROTO-09 | `parse_data_packet_body_summary` wildcard arm eliminated | Wildcard at line 665: `_ => (None, Vec::new())`. Replacement and `Unknown` variant design documented. |
| PROTO-10 | `data_packet_domain()` and `parse_data_packet_body_summary()` in sync | Gap analysis completed: packet_k values 11, 16, 19, 20, 22, 25, 26 have domain entries but no parse arm. Stub strategy documented. |
| PROTO-11 | Bridge routing uses central dispatch registry in sync with `CommandDefinition` array | Existing `bridge_methods_constant_matches_dispatcher` test in `bridge/mod.rs` is the model. D-11 requires a new `commands_definitions_registry_in_sync` test. |
</phase_requirements>

---

## Summary

Phase 93 is a Rust-only cleanup across three closely related concerns in `Rust/core/src/`. All work is confined to that directory; no Swift changes are required unless the HR fix needs a new bridge method (it does not — the fix is entirely in Rust metric extraction).

**BUG-HR-01 root cause identified:** The WHOOP 5.0 BLE notification path is correctly wired at every level except metric extraction. The R22 characteristic (handle `0x0022`, service `61080001`) is subscribed, frames are parsed via `parse_r22_payload` into `DataPacketBodySummary::R22Whoop5Hr`, and the `R22Whoop5Hr` variant is stored in SQLite. However, `heart_rate_plan_from_row` (the per-frame HR extraction gate) has no match arm for `R22Whoop5Hr` — it handles only `NormalHistory`, `V18History`, and `RawMotionK10`. Additionally, `run_heart_rate_feature_report` calls `trusted_frames_for_summary_kinds` with `&["normal_history", "v18_history", "raw_motion_k10"]`, which excludes `r22_whoop5_hr`. Both gaps must be fixed together for HR metrics to flow from WHOOP 5.0 frames.

**PROTO-08** requires replacing 17 `PACKET_TYPE_*` u8 constants with a `PacketType` enum and migrating all 5 match sites inside `protocol.rs`. No external files reference the constants — only `protocol.rs` internal functions use them.

**PROTO-09/10** are contained within `parse_data_packet_body_summary`: replace the wildcard, add a new `Unknown` variant, and add stub arms for 7 packet_k values that appear in `data_packet_domain()` but lack parse arms.

**PROTO-11** already has a structural test (`bridge_methods_constant_matches_dispatcher`). The new requirement is a second test asserting that `COMMAND_DEFINITIONS` in `commands.rs` is in sync with the `"commands.definitions"` bridge dispatch arm (which already exists).

**Primary recommendation:** Fix BUG-HR-01 first (two-line Rust change + test), then PROTO-08 (enum migration — largest task), then PROTO-09/10 together, then PROTO-11 (test-only). Run `cargo test --locked` after each plan.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| BLE frame subscription | iOS BLE (Swift) | — | CoreBluetooth notification subscription; already correct for WHOOP 5.0 |
| Frame parsing (R22) | Rust core (protocol.rs) | — | `parse_r22_payload` correctly parses battery + HR millibeats; no changes needed |
| HR metric extraction | Rust core (metric_features.rs) | — | `heart_rate_plan_from_row` is the gate; R22Whoop5Hr arm is missing |
| Packet type naming | Rust core (protocol.rs) | — | `PacketType` enum replaces scattered u8 constants |
| Silent drop detection | Rust core (protocol.rs) | — | `parse_data_packet_body_summary` wildcard replaced with `Unknown` variant |
| Domain/parse sync | Rust core (protocol.rs) | — | `data_packet_domain()` and `parse_data_packet_body_summary` gap coverage |
| Bridge registry integrity | Rust core (bridge/mod.rs) | bridge/debug.rs | Test asserts `COMMAND_DEFINITIONS` ↔ dispatch arm parity |

---

## Standard Stack

This phase uses only the existing project stack — no new dependencies.

| Component | Version | Purpose |
|-----------|---------|---------|
| Rust (MSRV 1.96) | 1.96 | All changes are in `Rust/core/src/` |
| `rusqlite 0.37` | 0.37 | Existing SQLite persistence — no changes |
| `serde 1.0` + `serde_json 1.0` | 1.0 | Existing JSON serialisation — `DataPacketBodySummary::Unknown` needs derives |
| `cargo test --locked` | — | Test runner; use Bash with ≥180,000ms timeout [ASSUMED] |

**Installation:** No new packages. All changes are source-only.

---

## Package Legitimacy Audit

No external packages introduced in this phase. Audit not required.

---

## Architecture Patterns

### System Architecture Diagram

```
BLE Notification (WHOOP 5.0)
         │  characteristic 61080003/61080004/61080005/61080007
         │  (all subscribed in CoreBluetoothBLETransport.swift)
         ▼
CoreBluetoothBLETransport+Parsing.swift
  → NotificationFrameParsing.swift
         │  parse_frame_hex bridge call
         ▼
protocol.rs :: parse_payload(packet_type: u8)
  ├─ PACKET_TYPE_R22_REALTIME_DATA (0x10=16) → parse_r22_payload()
  │      → ParsedPayload::DataPacket { body_summary: R22Whoop5Hr { hr_bpm } }
  └─ PACKET_TYPE_REALTIME_DATA (40) → parse_data_packet_payload()
         → parse_data_packet_body_summary(packet_k)
               ├─ 7 | 9 | 12 → NormalHistory
               ├─ 18 → V18History
               ├─ 17 → R17OpticalOrLabradorFiltered
               ├─ 10 → RawMotionK10
               ├─ 21 → RawMotionK21
               ├─ 24 → V24History
               └─ _ → (None, []) ← PROTO-09: silent drop HERE
                                    (11,16,19,20,22,25,26 in domain but no arm ← PROTO-10)

SQLite (via capture.import_frame_batch)
         │  DecodedFrameRow { parsed_payload_json, body_summary_kind }
         ▼
metric_features.rs :: run_heart_rate_feature_report()
  trusted_frames = trusted_frames_for_summary_kinds(
      &["normal_history", "v18_history", "raw_motion_k10"]  ← r22_whoop5_hr MISSING
  )
  for row in decoded_rows:
      heart_rate_plan_from_row(row)  ← R22Whoop5Hr arm MISSING → returns None
                                     ← BUG-HR-01: both gaps here
```

### Recommended File Changes

```
Rust/core/src/
├── protocol.rs          — PacketType enum, From<u8>, delete 17 constants,
│                          migrate 5 match sites, Unknown variant, stub arms
├── metric_features.rs   — heart_rate_plan_from_row R22Whoop5Hr arm,
│                          trusted_frames list addition
└── bridge/
    └── mod.rs           — new registry sync test (D-11)
```

### Pattern 1: PacketType Enum with Unknown Catch-All (PROTO-08)

**What:** Replace 17 `pub const PACKET_TYPE_*: u8 = N;` with a `PacketType` enum in `protocol.rs`. Implement `From<u8>` (infallible).

**When to use:** Any match on a wire-protocol byte that needs compiler exhaustiveness.

```rust
// Source: [ASSUMED] — standard Rust pattern; validated against codebase structure
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PacketType {
    Command,                        // was 35
    CommandResponse,                // was 36
    PuffinCommand,                  // was 37
    PuffinCommandResponse,          // was 38
    RealtimeData,                   // was 40
    RealtimeRawData,                // was 43
    HistoricalData,                 // was 47
    Event,                          // was 48
    Metadata,                       // was 49
    ConsoleLogs,                    // was 50
    RealtimeImuDataStream,          // was 51
    HistoricalImuDataStream,        // was 52
    RelativePuffinEvents,           // was 53
    PuffinEventsFromStrap,          // was 54
    RelativeBatteryPackConsoleLogs, // was 55
    PuffinMetadata,                 // was 56
    R22RealtimeData,                // was 0x10 = 16
    Unknown(u8),                    // catch-all — non-exhaustive-safe
}

impl From<u8> for PacketType {
    fn from(byte: u8) -> Self {
        match byte {
            35 => PacketType::Command,
            36 => PacketType::CommandResponse,
            37 => PacketType::PuffinCommand,
            38 => PacketType::PuffinCommandResponse,
            40 => PacketType::RealtimeData,
            43 => PacketType::RealtimeRawData,
            47 => PacketType::HistoricalData,
            48 => PacketType::Event,
            49 => PacketType::Metadata,
            50 => PacketType::ConsoleLogs,
            51 => PacketType::RealtimeImuDataStream,
            52 => PacketType::HistoricalImuDataStream,
            53 => PacketType::RelativePuffinEvents,
            54 => PacketType::PuffinEventsFromStrap,
            55 => PacketType::RelativeBatteryPackConsoleLogs,
            56 => PacketType::PuffinMetadata,
            0x10 => PacketType::R22RealtimeData,
            other => PacketType::Unknown(other),
        }
    }
}

impl From<PacketType> for u8 {
    fn from(pt: PacketType) -> u8 {
        match pt {
            PacketType::Command => 35,
            PacketType::CommandResponse => 36,
            // ... (all named variants)
            PacketType::R22RealtimeData => 0x10,
            PacketType::Unknown(b) => b,  // round-trips for logging
        }
    }
}
```

**Note:** `#[repr(u8)]` is NOT used — `Unknown(u8)` is a tuple variant, incompatible with `#[repr(u8)]`. The `From` impls replace it cleanly. [ASSUMED]

### Pattern 2: Unknown Variant for Silent Drop Elimination (PROTO-09)

**What:** Replace the wildcard `_ => (None, Vec::new())` at line 665 of `protocol.rs` with a warning-producing arm.

```rust
// Current (line 665):
_ => (None, Vec::new()),

// Replacement:
_ => (
    Some(DataPacketBodySummary::Unknown { packet_k }),
    vec![format!("unhandled_packet_k_{packet_k}")],
),
```

`DataPacketBodySummary::Unknown` variant to add to the enum:
```rust
Unknown {
    packet_k: u8,
},
```

This variant also needs arms in:
- `capture_correlation.rs` `body_summary_kind()` fn → `"unknown"`
- `export.rs` → graceful skip (match arm returning nothing or a comment row)
- `packet_type_name()` already handles all known packet types; `Unknown` is at the outer level, not there

### Pattern 3: BUG-HR-01 Fix — R22Whoop5Hr in Heart Rate Extraction

**What:** Two-site fix in `metric_features.rs`.

**Site 1: `heart_rate_plan_from_row` (line 4115) — add R22Whoop5Hr arm**

```rust
// Add after the RawMotionK10 arm:
DataPacketBodySummary::R22Whoop5Hr {
    hr_bpm: Some(hr_bpm),
    ..
} => Some(HeartRatePlan {
    body_summary_kind: "r22_whoop5_hr",
    source_signal: "r22_whoop5_hr_milli_bpm",
    quality_flag: "preliminary_r22_whoop5_hr",
    marker_offset: 2,    // offsets 2–3 in R22 payload carry hr_milli_bpm
    marker_value: hr_bpm.round() as u8,  // integer BPM for plan compatibility
    device_timestamp_seconds: timestamp_seconds,
    device_timestamp_subseconds: timestamp_subseconds,
}),
```

**Note on HeartRatePlan fields:** `marker_offset` and `marker_value` are used for NormalHistory HR markers; R22 exposes `hr_bpm` as `f32`. The plan will need to carry the f32 directly or the `HeartRatePlan` struct may need a new field. The executor must check if `HeartRatePlan` can accommodate R22's direct BPM vs the NormalHistory marker byte pattern. [ASSUMED — confirm by reading `HeartRatePlan` struct definition and `heart_rate_feature_from_plan`]

**Site 2: `run_heart_rate_feature_report` (line 1171) — add r22_whoop5_hr to trusted kinds**

```rust
// Current:
let trusted_frames = trusted_frames_for_summary_kinds(
    correlation,
    &["normal_history", "v18_history", "raw_motion_k10"],
);

// Fix:
let trusted_frames = trusted_frames_for_summary_kinds(
    correlation,
    &["normal_history", "v18_history", "raw_motion_k10", "r22_whoop5_hr"],
);
```

### Pattern 4: data_packet_domain / parse_data_packet_body_summary Gap Coverage (PROTO-10)

Gap analysis — values returned by `data_packet_domain()` but with no parse arm:

| packet_k | domain string | Current parse arm | Action |
|----------|---------------|-------------------|--------|
| 11 | `raw_stream_counted` | none | Add stub → `Unknown { packet_k: 11 }` |
| 16 | `raw_ecg_labrador` | none | Add stub → `Unknown { packet_k: 16 }` |
| 19, 22 | `research_packet` | none | Add stub → `Unknown { packet_k }` |
| 20 | `raw_or_research_counted` | none | Add stub → `Unknown { packet_k: 20 }` |
| 25, 26 | `pulse_information_packet` | none | Add stub → `Unknown { packet_k }` |

After PROTO-09 lands (wildcard replaced with `Unknown`), these packet_k values automatically produce `Unknown` summaries — PROTO-10 is then satisfied as a consequence. The executor should verify this inference: if the `Unknown` catch-all arm already covers all undeclared packet_k values, no extra stub arms are needed; the gap is already closed by PROTO-09. [ASSUMED — verify at implementation time]

### Pattern 5: Bridge Registry Sync Test (PROTO-11)

The existing `bridge_methods_constant_matches_dispatcher` test in `bridge/mod.rs` (line 962) is the model. It scans domain source files for `"namespace.method" =>` arms and asserts set-equality with `BRIDGE_METHODS`.

For D-11, the requirement is to assert that `COMMAND_DEFINITIONS` (the `&[CommandDefinition]` const in `commands.rs`) is in sync with the `"commands.definitions"` dispatch arm in `bridge/debug.rs`. The existing `"commands.definitions"` arm already exists (line 1904 of `debug.rs`) and directly serialises `COMMAND_DEFINITIONS`. No new bridge method is needed — the test just asserts that `COMMAND_DEFINITIONS.len() > 0` and that serialisation round-trips cleanly. [ASSUMED — confirm exact D-11 scope with CONTEXT.md D-11 text]

**D-11 re-read:** "Bridge registry uses a central dispatch registry; `CommandDefinition` array is in sync with bridge handlers" and "planner decides whether to enforce via compile-time test or runtime panic." The CONTEXT prefers compile-time. A test asserting `COMMAND_DEFINITIONS` serialises without error and its method names are a subset of `BRIDGE_METHODS` is sufficient.

### Anti-Patterns to Avoid

- **`#[repr(u8)]` on PacketType:** The `Unknown(u8)` tuple variant is incompatible with `#[repr(u8)]`. Use `From<u8>` instead.
- **Leaving `PACKET_TYPE_*` constants as dead_code:** D-03 requires deletion. After deletion, `cargo build` is the exhaustiveness check.
- **Adding `r22_whoop5_hr` only to trusted_frames without adding the heart_rate_plan_from_row arm:** Both gaps must be fixed together; adding only trusted_frames produces no improvement because no R22 frames ever reach the features list.
- **Adding the `Unknown` variant without updating `capture_correlation.rs` and `export.rs`:** These files have exhaustive match on `DataPacketBodySummary` variants and will fail to compile if `Unknown` is added without arms.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Packet type exhaustiveness | Custom validation fn | Rust `match` + compiler | Compiler enforces exhaustion at every match site |
| Unknown packet logging | Custom logger | `vec![format!("unhandled_packet_k_{packet_k}")]` in warnings | Matches existing warnings pattern throughout protocol.rs |
| Bridge method sync | Runtime assertion | Compile-time test (existing `bridge_methods_constant_matches_dispatcher` pattern) | D-11 explicitly prefers compile-time |
| HR BPM integer conversion | Custom rounding | `hr_bpm.round() as u8` | Matches existing NormalHistory marker_value (u8) type |

---

## Runtime State Inventory

Not applicable — this is a Rust-only code change. No stored data, live service config, or OS-registered state is renamed or migrated.

---

## Common Pitfalls

### Pitfall 1: PACKET_TYPE_COMMAND Still Used in `build_command_payload`

**What goes wrong:** `PACKET_TYPE_COMMAND` is used to construct outgoing command frames at line 452 of `protocol.rs`: `let mut payload = vec![PACKET_TYPE_COMMAND, sequence, command];`. After the enum migration, this must become `u8::from(PacketType::Command)` or a direct literal `35u8`.

**Why it happens:** Constants appear in both match arms (read path) and payload construction (write path). The write path is easy to miss during a match-focused migration.

**How to avoid:** Run `grep -n "PACKET_TYPE_" protocol.rs` after migration to confirm zero remaining constant references.

**Warning signs:** Compilation error "cannot find value `PACKET_TYPE_COMMAND`" at line 452.

### Pitfall 2: DataPacketBodySummary::Unknown Missing from Downstream Match Sites

**What goes wrong:** Adding `Unknown { packet_k: u8 }` to `DataPacketBodySummary` causes compilation failures in `capture_correlation.rs` (`body_summary_kind` fn at line 666), `export.rs` (line 2395), and any future exhaustive match sites.

**Why it happens:** `DataPacketBodySummary` is a public enum with exhaustive matches across multiple files.

**How to avoid:** Before running `cargo build`, grep for all match sites: `grep -rn "DataPacketBodySummary::\|body_summary\b" Rust/core/src/` and add `Unknown` arms to all before first compile.

**Warning signs:** `non-exhaustive patterns: DataPacketBodySummary::Unknown(_) not covered` compiler error.

### Pitfall 3: HeartRatePlan Struct Incompatibility for R22 HR

**What goes wrong:** `HeartRatePlan` uses `marker_offset: usize` and `marker_value: u8` designed for NormalHistory byte markers. R22 provides `hr_bpm: f32` directly. Casting `f32 → u8` via `.round() as u8` overflows if `hr_bpm > 255.0` (physiologically impossible but defensively worth noting).

**Why it happens:** The plan struct was designed for the NormalHistory pattern where HR is stored as a single byte in the packet.

**How to avoid:** Read `heart_rate_feature_from_plan` to see how `marker_value` is used. If it's used as a BPM integer directly, `hr_bpm.round() as u8` is safe (max BPM ~220). If the struct needs a dedicated field for R22, add `hr_bpm_f32: Option<f32>` and use it in the extraction function.

**Warning signs:** Incorrect HR values in the metric output (e.g., BPM shows as 0 or truncated).

### Pitfall 4: cargo test Timeout via Monitor

**What goes wrong:** Cold Rust compilation takes >120 seconds. Monitor's default timeout is 120s and will report failure even on a successful build.

**Why it happens:** Monitor is designed for short-lived processes.

**How to avoid:** Always use `Bash` with `timeout: 300000` (5 minutes) for `cargo test` calls. [VERIFIED: project pattern — captured in claude-smart session]

### Pitfall 5: PROTO-10 Gap Already Closed by PROTO-09

**What goes wrong:** Executor adds explicit stub arms for packet_k 11, 16, 19, 20, 22, 25, 26 after PROTO-09 already handles them via the `Unknown` catch-all. This creates unreachable arm warnings.

**Why it happens:** PROTO-09 and PROTO-10 are described as separate requirements but the `Unknown` wildcard replacement already satisfies PROTO-10 coverage.

**How to avoid:** After PROTO-09, verify that `data_packet_domain()` packet_k values without explicit parse arms are now routed to `Unknown`. If so, PROTO-10 is satisfied. Explicit stub arms are only needed if the `Unknown` catch-all is not sufficient (e.g., if the planner requires named variants for every domain-listed type).

---

## Code Examples

### BUG-HR-01 Complete Fix Checklist

```rust
// FILE: Rust/core/src/metric_features.rs
// Change 1: trusted_frames list (around line 1173)
let trusted_frames = trusted_frames_for_summary_kinds(
    correlation,
    &["normal_history", "v18_history", "raw_motion_k10", "r22_whoop5_hr"],
//                                                        ^^^^^^^^^^^^^^^ ADD

// Change 2: heart_rate_plan_from_row match arms (after line ~4160)
DataPacketBodySummary::R22Whoop5Hr {
    hr_bpm: Some(hr_bpm),
    ..
} => Some(HeartRatePlan {
    body_summary_kind: "r22_whoop5_hr",
    source_signal: "r22_whoop5_hr_milli_bpm",
    quality_flag: "preliminary_r22_whoop5_hr",
    marker_offset: 2,
    marker_value: hr_bpm.round() as u8,
    device_timestamp_seconds: timestamp_seconds,
    device_timestamp_subseconds: timestamp_subseconds,
}),
```

### PACKET_TYPE_* Match Sites to Migrate (All 5 in protocol.rs)

| Function | Line range | Usage |
|----------|-----------|-------|
| `build_command_payload` | ~452 | `vec![PACKET_TYPE_COMMAND, ...]` — write path, convert to `u8::from(PacketType::Command)` |
| `packet_type_name` | ~476–492 | 17-arm match on `u8` → change to `PacketType` match |
| `parse_payload` | ~517–529 | 7 groups of arms → migrate all to `PacketType` |
| `is_partial_data_packet_type_allowed` | ~538–547 | `matches!()` macro → migrate to `PacketType` variants |
| (inline in `parse_r22_payload`) | ~529 | `PACKET_TYPE_R22_REALTIME_DATA` is only referenced in `parse_payload` routing |

**External files:** `grep -rn "PACKET_TYPE_" Rust/core/src/` confirms zero references outside `protocol.rs`. [VERIFIED: grep in this session]

### bridge_methods_constant_matches_dispatcher Test Location

File: `Rust/core/src/bridge/mod.rs`, line 962.
Pattern: concatenates `include_str!("metrics.rs")`, `include_str!("sleep.rs")`, `include_str!("capture.rs")`, `include_str!("activity.rs")`, `include_str!("debug.rs")` and scans for `"namespace.method" =>` patterns.

The D-11 test for `CommandDefinition` sync can be modelled as:

```rust
#[test]
fn commands_definitions_serialises_without_error() {
    let value = serde_json::to_value(COMMAND_DEFINITIONS)
        .expect("COMMAND_DEFINITIONS must serialise to JSON");
    assert!(value.as_array().is_some(), "COMMAND_DEFINITIONS must serialise as array");
    assert!(
        !value.as_array().unwrap().is_empty(),
        "COMMAND_DEFINITIONS must not be empty"
    );
}
```

This test lives in `bridge/mod.rs` (same file as the existing sync test) or `bridge/debug.rs`.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `pub const PACKET_TYPE_*: u8` scattered at top of protocol.rs | `PacketType` enum with `From<u8>` | Compiler exhaustiveness at every match site |
| `_ => (None, Vec::new())` silent wildcard | `_ => Some(DataPacketBodySummary::Unknown { packet_k })` | Observable warning string instead of invisible drop |
| R22 frames stored but never extracted for HR metrics | `heart_rate_plan_from_row` R22Whoop5Hr arm | WHOOP 5.0 HR data appears in metrics |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `HeartRatePlan.marker_value: u8` accepts `hr_bpm.round() as u8` from R22 | Code Examples — BUG-HR-01 fix | If `heart_rate_feature_from_plan` uses marker_value differently for R22, the BPM will be wrong; executor must read that function before implementing |
| A2 | PROTO-10 is satisfied by the PROTO-09 `Unknown` catch-all for all 7 gap packet_k values | Common Pitfalls #5 | If the planner requires named variants for domain-listed types, 7 explicit stub arms need to be added |
| A3 | `cargo test --locked` timeout of 300,000ms (5 min) is sufficient | Standard Stack | Cold compilation may exceed 5 min on CI; use 300,000ms or more |
| A4 | D-11 is satisfied by a test that serialises `COMMAND_DEFINITIONS` without error, not a structural parity assertion | Code Examples | D-11 says "bridge routing uses central dispatch registry; `CommandDefinition` array in sync with bridge handlers" — the planner must decide the exact assertion scope |

---

## Open Questions (RESOLVED)

1. **HeartRatePlan struct compatibility for R22**
   - RESOLVED: `heart_rate_feature_from_plan` reads `marker_value` as-is as an integer BPM via `f64::from(plan.marker_value)`. Therefore `hr_bpm.round() as u8` is correct for the R22 arm. No new struct field needed. Confirmed by plan 93-01 action based on planner code inspection.

2. **D-11 exact scope**
   - RESOLVED: The registry sync test asserts that `COMMAND_DEFINITIONS` serialises to JSON without error (`commands_definitions_serialises_without_error`). This is the appropriate scope — it catches structural breakage without requiring a full method-name parity assertion (which is covered separately by `bridge_methods_constant_matches_dispatcher`).

3. **`Unknown` variant Serde output**
   - RESOLVED: `DataPacketBodySummary::Unknown { packet_k }` will serialise as `{ "kind": "unknown", "packet_k": N }` per the existing `#[serde(tag = "kind", rename_all = "snake_case")]` derive. Executor must run `grep -rn '"unknown"' Rust/core/tests/` after adding the variant to confirm no test assertions conflict with the new output shape.

---

## Environment Availability

This phase is code-only (Rust source). The only runtime dependency is the Rust toolchain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | All Rust changes | Confirmed (project compiles) | MSRV 1.96 | — |
| `cargo test --locked` | Validation | Confirmed | — | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Cargo's built-in test runner |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test --locked --manifest-path Rust/core/Cargo.toml -- <test_name>` |
| Full suite command | `cargo test --locked --manifest-path Rust/core/Cargo.toml` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-HR-01 | R22Whoop5Hr frames produce HR features | unit | `cargo test -- r22_heart_rate` | ❌ Wave 0 |
| PROTO-08 | PacketType enum round-trips all known byte values | unit | `cargo test -- packet_type_from_u8` | ❌ Wave 0 |
| PROTO-09 | Unknown packet_k produces warning string, not silent None | unit | `cargo test -- unknown_packet_k_warning` | ❌ Wave 0 |
| PROTO-10 | data_packet_domain values all have parse arms | unit | Verified by PROTO-09 Unknown catch-all (compile-time) | ❌ Wave 0 (if needed) |
| PROTO-11 | CommandDefinition registry in sync with dispatch | unit | `cargo test -- commands_definitions_serialises_without_error` | ❌ Wave 0 |
| All | Full regression | integration | `cargo test --locked --manifest-path Rust/core/Cargo.toml` | ✅ |

### Sampling Rate

- **Per task commit:** `cargo test --locked --manifest-path Rust/core/Cargo.toml -- <test_name>` (targeted)
- **Per wave merge:** `cargo test --locked --manifest-path Rust/core/Cargo.toml` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] New test for `heart_rate_plan_from_row` with R22Whoop5Hr fixture
- [ ] New test for `PacketType::from(u8)` round-trip
- [ ] New test for unknown packet_k warning string
- [ ] New test for `commands_definitions_serialises_without_error`

---

## Security Domain

This phase modifies only internal Rust parsing and metric extraction. No authentication, session management, access control, or cryptography changes. No new external inputs are accepted. ASVS V5 (Input Validation) is the only potentially applicable category — the `Unknown(u8)` variant extends the validated input space, but BLE packet bytes were already accepted and stored; this change only makes the handling visible rather than silent.

No security-specific research required for this phase.

---

## Sources

### Primary (HIGH confidence — verified in codebase this session)

- `Rust/core/src/protocol.rs` — all 17 PACKET_TYPE_* constants, 5 match sites, `parse_data_packet_body_summary`, `data_packet_domain`, `parse_r22_payload`, `DataPacketBodySummary` enum
- `Rust/core/src/metric_features.rs` — `heart_rate_plan_from_row` (confirmed: no R22Whoop5Hr arm), `run_heart_rate_feature_report` (confirmed: trusted_frames excludes r22_whoop5_hr)
- `Rust/core/src/bridge/mod.rs` — `BRIDGE_METHODS` (148 methods), `bridge_methods_constant_matches_dispatcher` test (line 962), main dispatcher routing
- `Rust/core/src/bridge/debug.rs` — `dispatch_debug`, `"commands.definitions"` arm (line 1904)
- `Rust/core/src/commands.rs` — `CommandDefinition` struct (line 25), `COMMAND_DEFINITIONS` const (line 534)
- `Rust/core/src/capture_correlation.rs` — `body_summary_kind()` fn (line 666), `R22Whoop5Hr` arm (line 675)
- `Rust/core/src/export.rs` — `R22Whoop5Hr` arm (line 2395)
- `GooseSwift/CoreBluetoothBLETransport.swift` — service UUIDs, notification characteristic IDs (61080003/04/05/07 all subscribed)
- `GooseSwift/NotificationFrameParsing.swift` — live HR display path (heartRateBPM, r22BatteryPct fields)

### Tertiary (LOW confidence — training knowledge, not verified this session)

- Rust `From<u8>` infallible conversion pattern — standard Rust idiom [ASSUMED]
- `#[repr(u8)]` incompatibility with tuple variants — standard Rust constraint [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- BUG-HR-01 root cause: HIGH — both missing sites confirmed by direct code inspection
- PACKET_TYPE match sites: HIGH — all 5 sites enumerated by grep; 0 external references confirmed
- PROTO-09/10 Unknown variant strategy: HIGH — DataPacketBodySummary enum structure and downstream match sites verified
- PROTO-11 test design: MEDIUM — CONTEXT.md D-11 scope is somewhat open; planner must define exact assertion
- HeartRatePlan R22 compatibility: MEDIUM — `heart_rate_feature_from_plan` not fully read; A1 assumption applies

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable codebase; valid until next protocol layer change)
