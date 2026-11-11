# Phase 93: HR Data Investigation & Protocol Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 93-hr-data-investigation-protocol-cleanup
**Areas discussed:** PACKET_TYPE enum approach, HR investigation scope

---

## PACKET_TYPE enum — unknown byte handling

| Option | Description | Selected |
|--------|-------------|----------|
| Unknown(u8) catch-all variant | Non-exhaustive safe: unknown byte maps to Unknown(u8). Exhaustive at compile time, no panic. | ✓ |
| TryFrom<u8> — Err on unknown | Strict: unknown bytes are Err. Breaks existing wildcard arms. | |
| Panic / unreachable! on unknown | Would crash on firmware-added packet types. | |

**User's choice:** Unknown(u8) catch-all variant
**Notes:** `From<u8>` infallible (not `TryFrom`); Unknown(u8) rounds back to `u8` for logging.

---

## PACKET_TYPE enum — old constants fate

| Option | Description | Selected |
|--------|-------------|----------|
| Delete them — only enum | Remove PACKET_TYPE_* entirely. Compiler enforces migration. | ✓ |
| Keep as #[allow(dead_code)] aliases | Leave constants as u8 values. Risk: they linger indefinitely. | |
| Keep for FFI/Swift boundary only | Remove only non-Swift-facing constants. | |

**User's choice:** Delete them — only enum
**Notes:** Clean break; compiler finds all migration sites.

---

## HR investigation scope (BUG-HR-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort fix from code analysis | Trace HR path in code, identify most likely root cause, apply fix. Document hardware-gated remainder. | ✓ |
| Gate on real device BLE capture | No code change until BLE logs from fw 50.38.1.0 confirm root cause. | |
| Document hypothesis only | Write root cause analysis only, no code change this phase. | |

**User's choice:** Best-effort fix from code analysis
**Notes:** Most likely suspects: PACKET_TYPE_R22_REALTIME_DATA (0x10) handling, wrong service UUID, or packet_k mismatch.

---

## Claude's Discretion

- `PacketType` enum name (vs `BlePacketType`) — chose `PacketType` to match existing `PACKET_TYPE_*` scope
- `#[repr(u8)]` not used — `From<u8>` + `Unknown(u8)` makes it unnecessary
- D-11 registry sync enforcement method (compile-time test vs runtime panic) — planner decides, preference noted for compile-time test

## Deferred Ideas

None.
