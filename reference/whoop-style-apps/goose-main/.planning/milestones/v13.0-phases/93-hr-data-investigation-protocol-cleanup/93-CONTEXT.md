# Phase 93: HR Data Investigation & Protocol Cleanup - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust-only work across three concerns:
1. **BUG-HR-01**: Investigate and fix the root cause of no HR data on WHOOP 5.0 fw 50.38.1.0 — best-effort fix from code analysis (no BLE capture required to proceed). Document what remains hardware-gated.
2. **PROTO-08**: Replace all `PACKET_TYPE_*` u8 constants in `protocol.rs` with a Rust enum `PacketType`; delete the old constants entirely; migrate all match sites to be exhaustive.
3. **PROTO-09..11**: Eliminate silent wildcard arms in `parse_data_packet_body_summary`; sync `data_packet_domain()` with all parse arms; centralise bridge routing into a dispatch registry in sync with the `CommandDefinition` array.

No Swift changes in this phase. All changes are in `Rust/core/src/`.

</domain>

<decisions>
## Implementation Decisions

### PACKET_TYPE Enum Design (PROTO-08)
- **D-01:** Enum name: `PacketType` (not `BlePacketType` — matches the existing `PACKET_TYPE_*` naming scope).
- **D-02:** Unknown byte values map to `PacketType::Unknown(u8)` — non-exhaustive-safe catch-all. This keeps all match arms exhaustive at compile time without panicking on firmware-added packet types.
- **D-03:** Old `PACKET_TYPE_*` constants are **deleted entirely** from `protocol.rs` after the enum lands. No aliases, no `#[allow(dead_code)]` leftovers. Compiler enforces migration at all call sites.
- **D-04:** `PacketType` implements `From<u8>` (infallible) mapping to `Unknown(u8)` for unrecognised values. No `TryFrom`.
- **D-05:** All existing match sites on `packet_type: u8` are migrated to `PacketType` — the compiler's exhaustiveness check replaces the old wildcard arms.

### BUG-HR-01 Investigation Approach
- **D-06:** **Best-effort code-analysis fix** — researcher and executor trace the WHOOP 5.0 HR data path in code (BLE notification handler → packet framing → `parse_data_packet_body_summary` → bridge → Swift display), identify the most likely root cause, and apply the fix. No BLE capture from a real device required to proceed.
- **D-07:** Likely suspects to investigate (researcher decides after reading code): wrong service UUID for fw 50.38.1.0, packet_k value not handled in `parse_data_packet_body_summary`, `PACKET_TYPE_REALTIME_DATA` (40) vs `PACKET_TYPE_R22_REALTIME_DATA` (0x10=16) routing, or firmware-version-gated capability flag.
- **D-08:** If the root cause cannot be confirmed from code alone (e.g. requires live BLE capture), document the hypothesis clearly in code comments + issue #156 and apply a defensive fix (e.g. add the missing packet handler). Mark remaining validation as hardware-gated in the SUMMARY.

### Silent Drop Elimination (PROTO-09..11)
- **D-09:** `parse_data_packet_body_summary` wildcard `_ => None` arm replaced with `_ => Some(DataPacketBodySummary::Unknown { packet_k })` — unhandled values produce a visible warning string, not a silent drop.
- **D-10:** Every packet type returned by `data_packet_domain()` must have a corresponding arm in `parse_data_packet_body_summary`. Add stub arms for any gaps found.
- **D-11:** Bridge registry (`CommandDefinition` array) must be kept in sync with the dispatcher match arms — planner decides whether to enforce via a compile-time test or a runtime panic on mismatch. Preference: compile-time test (consistent with existing `bridge_methods_constant_matches_dispatcher` test pattern).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol Layer
- `Rust/core/src/protocol.rs` — all `PACKET_TYPE_*` constants (lines 7–23), `packet_type_name()` fn (line 474), `DataPacketBodySummary` enum (line 185), `parse_data_packet_body_summary` function
- `Rust/core/src/bridge/debug.rs` — bridge routing dispatch, `CommandDefinition` array, silent wildcard arms

### HR Data Path (for BUG-HR-01 investigation)
- `GooseSwift/CoreBluetoothBLETransport.swift` — BLE notification handler, service UUID for data notifications
- `GooseSwift/NotificationFrameParsing.swift` — frame reassembly, delegates to Rust bridge
- GitHub issue #156 — original bug report with fw version and symptom description

### Requirements
- `.planning/REQUIREMENTS.md` §BUG-HR-01, PROTO-08..11
- `.planning/ROADMAP.md` §Phase 93

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packet_type_name(packet_type: u8) -> Option<&'static str>` in `protocol.rs` line 474 — existing name lookup; will need to be replaced or updated to take `PacketType`.
- `PACKET_TYPE_R22_REALTIME_DATA: u8 = 0x10` (line 23) — this is the WHOOP 5.0 realtime data packet type. It's already defined; the HR investigation should check whether this is handled in `parse_data_packet_body_summary`.
- Existing `bridge_methods_constant_matches_dispatcher` test in `Rust/core/tests/` — model for the D-11 compile-time registry sync test.

### Established Patterns
- `DataPacketBodySummary` is already a Rust enum (line 185) — `PacketType` enum follows same file location.
- `#[repr(u8)]` not needed since `From<u8>` is infallible via `Unknown(u8)` — keep simple, no repr attribute.
- cargo test timeout: use Bash with ≥180,000ms timeout, NOT Monitor (per project pattern).

### Integration Points
- All code is Rust-side only. No Swift changes needed unless the HR fix requires a new bridge method.
- The `CommandDefinition` registry sync test should live in `Rust/core/tests/` alongside existing bridge tests.

</code_context>

<specifics>
## Specific Ideas

- `PACKET_TYPE_R22_REALTIME_DATA = 0x10` (=16) is the WHOOP 5.0-specific realtime packet type. If fw 50.38.1.0 changed which packet type carries HR data, this is the most likely culprit — investigate whether it has a matching arm in `parse_data_packet_body_summary`.
- The `Unknown(u8)` variant of `PacketType` should round-trip back to `u8` via `u8::from(PacketType::Unknown(x)) == x` for logging purposes.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 93-HR Data Investigation & Protocol Cleanup*
*Context gathered: 2026-06-19*
