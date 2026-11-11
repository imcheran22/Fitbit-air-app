# Phase 112: Optical Protocol Decode (v20/v21/v26) — Context

**Gathered:** 2026-06-22
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — research-backed)

<domain>
## Phase Boundary

Add `DataPacketBodySummary::V20V21OpticalMultiChannel` and `DataPacketBodySummary::V26PpgWaveform` variants to `protocol.rs` with parse arms for packet_k 20, 21, and 26. Currently all three packet types fall to `Unknown` and emit `unhandled_packet_k_N` warnings — every WHOOP 5.0 sync discards this data silently.

**In scope:**
- `protocol.rs`: 2 new enum variants, 2 new parse functions
- WHY comments at all byte offsets (SEED-005 pattern)
- `cargo test --locked` with synthetic fixture tests
- `data_packet_domain()` updated to cover packet_k 20/21/26 explicitly

**Out of scope:**
- SQLite persistence (Phase 113)
- Swift consumer changes (Phase 117)
- Per-channel LED identity claims (log raw channel index only)
- SpO2 derivation (requires calibration data — out of scope)

</domain>

<decisions>
## Implementation Decisions

### v20 layout (2140B)
Five channel blocks, each with presence byte (0x19=active, 0x00=empty).
Presence bytes at @0x1a / 0x1c0 / 0x366 / 0x50c / 0x6b2.
Ten channel slots (two 50-sample i32 channels each).

### v21 layout (1244B)
Three 100-sample i16 channels at @28 / @228 / @428 (200B apart).
Descriptor `(100, 100, 3)` near @22.

### v26 layout (88B) — hardware-verified
- Bytes 8/9: type 47 / version 26
- Byte 12: `ppg_channel` u8 (values 1–26)
- Bytes 15–18: `unix` u32 LE
- Bytes 27–74: 24× LE-i16 PPG waveform
- Bytes 84–87: CRC32

### Enum design
Use separate variants (not a generic catch-all) so `match` exhaustion catches regressions.
`V20V21OpticalMultiChannel` covers both packet_k 20 and 21 (same variant, version byte differentiates).
`V26PpgWaveform { channel: u8, samples: Vec<i16> }` — 24 samples fixed.

### Error handling
Parse failures return `DataPacketBodySummary::Unknown { packet_k, warnings }` with specific warning string — never panic.
`ppg_channel` gated: if value not in 1–26, return Unknown with warning.

### WHY comments
Every byte offset gets a `// offset N: <field> — <source>` ns>

<code_context>
## Existing Code Insights

Key files:
- `Rust/core/src/protocol.rs` — `DataPacketBodySummary` enum, `parse_data_packet_body_summary(packet_k, payload)`, `data_packet_domain()`
- Existing pattern: `parse_v18_body()`, `parse_v24_body()` — follow these exactly
- `Rust/core/tests/protocol_tests.rs` — synthetic fixture tests live here
- `I16SeriesSummary` type already exists for sample arrays
- CRC32 validation: `validate_crc32_trailing` utility already exists

The `Unknown { packet_k, warnings }` catch-all arm must remain — only add explicit arms for 20/21/26.
`BRIDGE_METHODS` constant does NOT need updating in Phase 112 (no new bridge methods — just protocol parsing).

</code_context>

<specifics>
## Specific Requirements

- OPT-01: V20V21OpticalMultiChannel variant + parse arms for packet_k 20 and 21
- OPT-02: V26PpgWaveform variant + parse arm for packet_k 26
- Integration tests: synthetic payloads for v20 (2140B), v21 (1244B), v26 (88B)
- `cargo test --locked` must pass clean after changes
- No Swift changes, no schema changes, no BRIDGE_METHODS changes

</specifics>

<deferred>
## Deferred

- optical_channel_samples SQLite table → Phase 113
- bridge methods for v20/v21/v26 → Phase 113
- Android routing → Phase 117
- Swift UI consumer → beyond Phase 117

</deferred>
