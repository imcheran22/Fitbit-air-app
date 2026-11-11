# Phase 111: Research — Protocol Offset + FFI Safety Comments

**Researched:** 2026-06-21
**Status:** Complete
**Requirements:** COMM-04, COMM-05

---

## Summary

Phase 111 is comments-only. Zero logic changes. `cargo test --locked` must pass unchanged. The work splits into two plans matching the ROADMAP:

- **111-01-PLAN.md** — WHY comments at every empirical byte offset in `protocol.rs` and `bridge/mod.rs` (COMM-04)
- **111-02-PLAN.md** — `// SAFETY:` blocks on `goose_bridge_handle_json` (C FFI) and `Java_com_goose_app_bridge_GooseBridge_handle` (JNI) (COMM-05)

---

## Existing Comment State (What Already Exists)

### `Rust/core/src/protocol.rs` — Already Has Comments (Phase 86)

`parse_frame` already has the Gen4 / Gen5 header layout comments with "empirically verified via hardware captures":
```rust
// Gen4 frame header layout (4 bytes total):
//   byte 0: frame_start (0xaa)
//   bytes 1–2: payload length u16 LE (excludes the 4-byte header itself)
//   byte 3: CRC8 of bytes 1–2
//   empirically verified via hardware captures
DeviceType::Gen4 => u16::from_le_bytes([frame[1], frame[2]]) as usize,
```

`parse_r22_payload` already has all three offset comments (Phase 108):
```rust
// offset 1: u8, battery_pct direct (0–100); no scaling required
// offsets 2–3: u16 LE, hr_milli_bpm; hr_bpm = raw / 10.0
// offsets 4–5: [u8; 2], purpose unknown — empirical; conditional on len ≥ 6
```

`parse_v24_body_summary` already has a full doc comment block above the function listing all offsets 14–75 with types, field names, units, and the empirical verification note:
```rust
/// V24 history payload body layout (offsets relative to `data`, i.e. body start = payload[3]):
///   offset 14:    u8,   hr (beats per minute, unsigned)
///   ...
///   offset 75:    u16 LE, sig_quality (signal quality score, higher = better)
/// empirically verified via hardware captures
```

`parse_k10_raw_motion_summary` already has:
```rust
// K10 payload accelerometer/gyroscope layout (byte offsets into payload...):
//   empirically verified via hardware captures
```

**Conclusion for plan 111-01:** Most of `protocol.rs` is already annotated. The plan must verify completeness and add any missing inline `// offset N:` comments at the actual read sites — where the doc comment sits above the function but the read site (e.g. `data[14]`) lacks an inline anchor comment.

### `Rust/core/src/bridge/mod.rs` — Partially Done

`parse_event48_battery` has a doc comment block above the function explaining the layout but no inline `// offset N:` at the actual `read_u16_le(payload, 17)` call site.

`parse_event48_battery_from_data` has a doc comment above but no inline offset comment at `read_u16_le(data, 5)`.

`parse_cmd26_battery` has doc comment above and one inline comment `// payload[5..7]: data body, battery raw u16 LE (BAT-02)` already present.

`goose_bridge_handle_json` has extensive doc comments above and catch_unwind comments inline, but **lacks a `// SAFETY:` block at the `unsafe extern "C"` function itself**. The function signature is:
```rust
#[unsafe(no_mangle)]
pub unsafe extern "C" fn goose_bridge_handle_json(request_json: *const c_char) -> *mut c_char {
```

### `Rust/core/src/android_jni.rs` — Has Partial Safety

`Java_com_goose_app_bridge_GooseBridge_handle` has a `# Safety` doc comment:
```rust
/// # Safety
/// JNI contract: `env` and `_class` are valid for the duration of the call.
```
But it lacks the full `// SAFETY:` inline block at the `unsafe extern "C"` function body, and the doc comment is too brief (missing: null pointer not possible from JVM, request is a live local JNI ref, env valid for call duration, no aliasing).

---

## Offset Sites That Need Inline Comments (Plan 111-01)

### `protocol.rs` — Read Sites Without Inline Anchors

The doc comment above `parse_v24_body_summary` covers all offsets, but the actual read sites (`data[14]`, `data[15]`, `read_u16_le(data, 16)`, etc.) may lack inline `// offset N:` comments on the line of the read. The executor must check each read site and add inline anchors where missing.

Key read sites in `parse_v24_body_summary` (body relative to `payload[3]`):
- `data[14]` — `u8`, `hr`
- `data[15]` — `u8`, `rr_count`
- `read_u16_le(data, 16)` through `read_u16_le(data, 22)` — 4× `u16 LE`, RR intervals
- `read_u16_le(data, 26)` — `ppg_green`
- `read_u16_le(data, 28)` — `ppg_red_ir`
- `read_f32_le(data, 33)`, `37`, `41` — gravity XYZ
- `data[48]` — `skin_contact`
- `read_f32_le(data, 49)`, `53`, `57` — gravity2 XYZ (conditional)
- `read_u16_le(data, 61)` — `spo2_red`
- `read_u16_le(data, 63)` — `spo2_ir`
- `read_u16_le(data, 65)` — `skin_temp_raw` with `(raw - 930) / 30 + 33` NTC formula
- `read_u16_le(data, 67)` — `ambient`
- `read_u16_le(data, 69)` — `led1`
- `read_u16_le(data, 71)` — `led2`
- `read_u16_le(data, 73)` — `resp_raw`
- `read_u16_le(data, 75)` — `sig_quality`

### `bridge/mod.rs` — Inline Comments Needed

`parse_event48_battery` — add inline at `read_u16_le(payload, 17)`:
```rust
// offset 17: u16 LE, battery raw (÷10 = pct); event-48 type-48 layout;
//   data body starts at payload[12], so absolute offset 17 = data body offset 5;
//   verified via hardware captures 2026-06-14
```

`parse_event48_battery_from_data` — add inline at `read_u16_le(data, 5)`:
```rust
// offset 5 (data body): u16 LE, battery raw (÷10 = pct);
//   data body starts at payload[12]; equivalent to absolute payload offset 17
```

---

## FFI Safety Comment Content (Plan 111-02)

### `goose_bridge_handle_json` — Required `// SAFETY:` Block

The function is `pub unsafe extern "C"`. The existing doc comment covers the contract in `///` form but does not have the `// SAFETY:` inline block at the function entry. Add immediately before/after the opening brace:

```rust
// SAFETY: caller must pass a valid null-terminated UTF-8 C string for `request_json`,
//   or null (handled defensively). The returned *mut c_char must be freed with
//   `goose_bridge_free_string` — do not pass it to C `free()` or Rust `drop()`.
//   The caller must not alias `request_json` with a mutable reference during this call.
//   Called from Swift via `GooseSwift-Bridging-Header.h` (iOS) or JNI shim (Android).
```

### `Java_com_goose_app_bridge_GooseBridge_handle` — Required `// SAFETY:` Block

The existing doc comment says `/// # Safety\n/// JNI contract: env and _class are valid for the duration of the call.` — too brief. Add an inline block:

```rust
// SAFETY: called by the JVM on a JNI thread.
//   `env` is a valid JNIEnv pointer for the duration of this call; do not store it.
//   `_class` is a local JNI class reference; valid within this frame only.
//   `request` is a local JNI String reference; converted to Rust String before any await points.
//   No aliasing: the JVM guarantees `request` is not concurrently mutated.
//   Delegates to `goose_bridge_handle_json` which is independently `unsafe extern "C"` — see its SAFETY note.
```

---

## Comment Format (D-01/D-02/D-03 from CONTEXT.md)

Per CONTEXT.md decisions and COMM-01 pattern from Phase 86/91/108:

**Inline `// offset N:` format:**
```rust
// offset 17: u16 LE, battery_raw; ÷10 = battery_pct (0–100); max guard 1100
//   event-48 data body starts at payload[12]; offset 17 = data body byte 5
//   verified via hardware captures 2026-06-14
```

**Inline `// SAFETY:` format (Rust Nomicon convention):**
```rust
// SAFETY: <pointer/aliasing/lifetime contract>
//   <additional context>
```

**Rules:**
- No WHAT — no restating what the code does
- No RE tool names — use "hardware captures", "protocol observation", "BLE capture analysis"
- Neutral language throughout
- `cargo test --locked --manifest-path Rust/core/Cargo.toml` must pass after every change

---

## Scope Confirmation — What Needs No Changes

- `parse_frame` Gen4/Gen5 header comments — DONE (Phase 86)
- `parse_r22_payload` offsets 1, 2-3, 4-5 — DONE (Phase 108)
- `parse_v24_body_summary` doc block above function — DONE (Phase 86)
- `parse_k10_raw_motion_summary` axis layout — DONE (Phase 86)
- `parse_cmd26_battery` inline `// payload[5..7]` — DONE
- `goose_bridge_free_string` — has full `# Safety` doc comment — DONE

**Remaining work:**
1. Add inline `// offset N:` anchors at read sites inside `parse_v24_body_summary` body (the doc above exists; the read sites need anchors)
2. Add inline `// offset N:` at `read_u16_le(payload, 17)` in `parse_event48_battery`
3. Add inline `// offset 5` at `read_u16_le(data, 5)` in `parse_event48_battery_from_data`
4. Add `// SAFETY:` block at `goose_bridge_handle_json` function body
5. Expand `// SAFETY:` block at `Java_com_goose_app_bridge_GooseBridge_handle`

---

## Validation Architecture

- `cargo test --locked --manifest-path Rust/core/Cargo.toml` — must pass (comments only, no logic change)
- No new tests needed — this is documentation work
- Reviewer check: grep for `// offset` in modified files to confirm inline anchors exist at read sites

---

## ## RESEARCH COMPLETE

Phase 111 research complete. All offset sites catalogued, existing comment state confirmed, FFI safety contract content drafted. Ready for planning.
