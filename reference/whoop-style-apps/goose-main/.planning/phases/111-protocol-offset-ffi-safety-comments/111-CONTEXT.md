# Phase 111: Protocol Offset + FFI Safety Comments - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add WHY comments at every empirical WHOOP byte offset in Rust source, and document safety contracts at C FFI and JNI entry points. Comments only — no code logic changes.

**In scope:** `//` WHY comments at byte offsets in `protocol.rs`, `bridge/mod.rs`, `android_jni.rs`; `// SAFETY:` blocks on `goose_bridge_handle_json` and `Java_com_goose_app_bridge_GooseBridge_handle`; `cargo test --locked` passes.
**Out of scope:** Any code logic changes, new features.

</domain>

<decisions>
## Implementation Decisions

### Comment format for byte offsets (COMM-04)
- **D-01:** Format: `// offset N: <type>, <field>; <why-non-obvious>` — e.g. `// offset 17: u16 LE, event48 battery raw; empirically confirmed via hardware capture 2026-06-14`
- **D-02:** Only add WHY comments where the offset is empirical or non-obvious. Skip self-documenting arithmetic or well-known protocol positions already obvious from context.
- **D-03:** Never explain WHAT the code does — only WHY the offset is that value or why that constraint exists.

### FFI safety (COMM-05)
- **D-04:** `goose_bridge_handle_json` (C FFI) gets a `// SAFETY:` block: "caller must pass a valid null-terminated UTF-8 C string; returned pointer must be freed with goose_bridge_free_string"
- **D-05:** `Java_com_goose_app_bridge_GooseBridge_handle` (JNI) gets a `// SAFETY:` block: "called by JVM on a JNI thread; env pointer is valid for the duration of this call; request_json is a local JNI reference"

### Claude's Discretion
- How many offsets to annotate — all in `parse_v24_body_summary`, `parse_r22_payload`, `parse_event48_battery`, `parse_cmd26_battery`, Gen4 frame parser
- Whether to use a consistent "verified via hardware captures" phrase or vary by offset

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Byte offset sites to annotate
- `Rust/core/src/protocol.rs` — `parse_v24_body_summary` (offsets 14-65), `parse_r22_payload`, `parse_frame` (Gen4 vs Maverick layout)
- `Rust/core/src/bridge/mod.rs` — `parse_event48_battery` (offset 17), `parse_cmd26_battery` (data body offsets), `parse_event48_battery_from_data` (offset 5)

### FFI entry points
- `Rust/core/src/bridge/mod.rs` — `goose_bridge_handle_json` C FFI function
- `Rust/core/src/android_jni.rs` — `Java_com_goose_app_bridge_GooseBridge_handle` JNI function

</canonical_refs>

<code_context>
## Existing Code Insights

### Already has some comments (verify)
- Phase 86 added protocol comments; `bridge/mod.rs` may already have partial offset docs
- R22 byte 1 = battery_pct direct was documented in Phase 108

### No logic changes
- All plans are comment-only — no risk of breaking builds or tests
- `cargo test --locked` should pass unchanged

</code_context>

<specifics>
## Specific Ideas

- event48 battery offset 17: "empirically derived from hardware capture; matches openwhoop type-48 layout"
- cmd26 response: "WHOOP GET_BATTERY_LEVEL response: [0]=len, [1]=ack, [2]=cmd_id(26), [3..]=data body"
- FFI SAFETY: use exact phrasing from Rust Nomicon unsafe conventions

</specifics>

<deferred>
## Deferred Ideas

- None — this is the final phase of v14.0

</deferred>

---

*Phase: 111-protocol-offset-ffi-safety-comments*
*Context gathered: 2026-06-21*
