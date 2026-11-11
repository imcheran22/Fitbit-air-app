# Phase 95: WHOOP MG DeviceKind - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Add WHOOP MG as a first-class `DeviceKind::WhoopMg` in the Rust capabilities layer and parse the MG BLE advertisement in Swift to set `connectedCapabilities` correctly.

Two sub-scopes:
1. **Rust (MG-01):** `DeviceKind::WhoopMg` + `DeviceCapabilities` in `capabilities.rs`; `DeviceType::MG` (or equivalent) → `WhoopMg` mapping in `protocol.rs`
2. **Swift (MG-02):** BLE advertisement parsing to detect WHOOP MG devices; `connectedCapabilities` set to `WhoopMg`; Device view label "WHOOP MG"

</domain>

<decisions>
## Implementation Decisions

### MG DeviceCapabilities (MG-01)
- **D-01:** Researcher determines MG-specific capabilities from the Android APK decompile (`re-assets/whoop-decompiled/`) before planning. Do NOT assume Whoop5 capabilities — check whether MG has different service UUIDs, sync protocol, or supported commands.
- **D-02:** If researcher can confirm capabilities: use them. If researcher cannot confirm (APK doesn't reveal clear differences): default to Whoop5 capabilities with a code comment marking the assumption as `candidate_MG_capabilities_unverified`.

### MG BLE Advertisement Identification (MG-02)
- **D-03:** Best-effort identification from APK analysis — researcher finds the most likely MG identifier byte(s) from the Android APK decompile. Executor applies the best-known pattern and marks it in a code comment as `candidate_MG_advertisement_byte_unverified`.
- **D-04:** No feature flag, no blocking on real device capture. The identification is a best-effort guess that is better than the current state (MG misidentified as Whoop5).
- **D-05:** If MG BLE advertisement cannot be determined at all from code/APK, the Swift advertisement parsing falls back to Whoop5 identification (existing behavior) — executor documents this in SUMMARY as "MG identification hardware-gated".

### Device Label
- **D-06:** Device view shows "WHOOP MG" label when `connectedCapabilities.deviceKind == .WhoopMg`. No other UI changes.

### Existing Pattern Reuse
- **D-07:** `DeviceKind` enum already exists in `capabilities.rs` with `Whoop4`, `Whoop5`, `HrMonitor`. Follow the same pattern for `WhoopMg`.
- **D-08:** `DeviceType` enum in `protocol.rs` maps to `DeviceKind` via `device_kind()`. Same pattern for MG mapping.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rust Layer
- `Rust/core/src/capabilities.rs` — `DeviceKind` enum (lines 5–10), `DeviceCapabilities::for_kind()` (line 23), existing Whoop4/Whoop5/HrMonitor patterns
- `Rust/core/src/protocol.rs` — `DeviceType` enum, `device_kind()` method (line 166)

### Swift Layer
- `GooseSwift/GooseBLETypes.swift` — BLE types and device identification patterns
- `GooseSwift/CoreBluetoothBLETransport.swift` — `connectedCapabilities` property, advertisement parsing, device type detection

### APK Research (gitignored, local only)
- `re-assets/whoop-decompiled/` — jadx Android decompile output; search for "MG", "WHOOP_MG", "WhoopMg", or model strings to find advertisement byte patterns
- `re-assets/FINDINGS-commands.md` — existing APK analysis findings

### Requirements
- `.planning/REQUIREMENTS.md` §MG-01, MG-02
- `.planning/ROADMAP.md` §Phase 95
- GitHub issue #22 — MG Sync (upstream reference)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DeviceKind` enum pattern in `capabilities.rs` — add `WhoopMg` variant, add `for_kind(DeviceKind::WhoopMg)` arm
- `DeviceType::device_kind()` in `protocol.rs` — add MG variant → `WhoopMg` mapping
- `connectedCapabilities` in `CoreBluetoothBLETransport.swift` — existing property updated when device type confirmed

### Established Patterns
- `DeviceKind` serialises with `SCREAMING_SNAKE_CASE` (existing tests confirm `"WHOOP4"`, `"WHOOP5"`)  — `WhoopMg` → `"WHOOP_MG"` follows same pattern
- Advertisement parsing in `CoreBluetoothBLETransport.swift` uses the BLE peripheral name/advertisement data — researcher finds which byte/field identifies MG

### Integration Points
- Adding `DeviceKind::WhoopMg` requires updating any exhaustive match on `DeviceKind` in the codebase (`cargo build` will surface all sites)
- Swift `DeviceView` label logic reads `connectedCapabilities.deviceKind` — add a "WHOOP MG" case

</code_context>

<specifics>
## Specific Ideas

- `"WHOOP_MG"` serialisation string (SCREAMING_SNAKE_CASE from `WhoopMg` variant) — consistent with existing `"WHOOP4"` / `"WHOOP5"` pattern
- The Android APK decompile at `re-assets/whoop-decompiled/` is the primary source for MG identifier bytes — researcher should search for "MG" model strings or BLE advertisement classes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 95-WHOOP MG DeviceKind*
*Context gathered: 2026-06-19*
