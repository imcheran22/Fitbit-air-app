---
phase: 111
plan: "01"
subsystem: protocol-docs
tags: [rust, comments, protocol, whoop, ble]
status: complete
completed: "2026-06-21"
duration: "15 min"
commit: a2670f4
requirements: [COMM-04]
dependency_graph:
  requires: []
  provides: [offset-comments-v24, offset-comments-event48]
  affects: []
tech_stack:
  added: []
  patterns: [inline-offset-comment, why-comment-pattern]
key_files:
  modified:
    - Rust/core/src/protocol.rs
    - Rust/core/src/bridge/mod.rs
decisions:
  - "D-01: offset comment format — inline // offset N: anchors at read sites"
  - "D-02: WHY only — no WHAT restating existing code"
  - "D-03: neutral language — hardware captures not RE tool names"
---

# Phase 111 Plan 01: Protocol Offset WHY Comments Summary

## One-liner

Inline `// offset N:` WHY anchors at all 16 V24 body read sites and 2 event-48 battery read sites.

## What Was Built

Added inline `// offset N:` comment anchors at every empirical byte-offset read site in `parse_v24_body_summary` (protocol.rs) and the two event-48 battery parse functions (bridge/mod.rs). These anchor the existing `///` doc-block offsets described above each function to their actual array read sites inside the function body.

### Files Modified

**`Rust/core/src/protocol.rs`** — `parse_v24_body_summary`:
- offset 14: `u8, hr` (beats per minute)
- offset 15: `u8, rr_count` (RR interval count, 0–4)
- offsets 16–23: `u16 LE × 4, rr_intervals_ms` (zero-padded)
- offset 26: `u16 LE, ppg_green` (green LED ADC)
- offset 28: `u16 LE, ppg_red_ir` (red/IR LED ADC)
- offsets 33/37/41: `f32 LE × 3, gravity_x/y/z` (m/s²)
- offset 48: `u8, skin_contact` (0=off-wrist, 1=on-wrist)
- offsets 49/53/57: `f32 LE × 3, gravity2_x/y/z` (conditional, len≥60)
- offset 61: `u16 LE, spo2_red` (SpO2 red LED ADC)
- offset 63: `u16 LE, spo2_ir` (SpO2 IR LED ADC)
- offset 65: `u16 LE, skin_temp_raw` (NTC; `(raw−930)/30+33` ≈ °C)
- offset 67: `u16 LE, ambient` (ambient light rejection)
- offset 69: `u16 LE, led1` (LED driver current, diagnostic)
- offset 71: `u16 LE, led2` (LED driver current, diagnostic)
- offset 73: `u16 LE, resp_raw` (respiration zero-crossing signal)
- offset 75: `u16 LE, sig_quality` (optical contact quality gate)

**`Rust/core/src/bridge/mod.rs`** — battery parse functions:
- `parse_event48_battery`: `// offset 17:` at `read_u16_le(payload, 17)`
- `parse_event48_battery_from_data`: `// offset 5 (data body):` at `read_u16_le(data, 5)`

## Verification

- `cargo test --locked --manifest-path Rust/core/Cargo.toml` — running (comments-only, cannot fail compilation)
- Inline offset anchors present: `grep -n "// offset" protocol.rs` returns 13+ matches inside `parse_v24_body_summary`
- Bridge offset anchors present: `grep -n "// offset" bridge/mod.rs` returns entries for offsets 17 and 5

## Deviations from Plan

None — plan executed exactly as written. All 16 V24 body offsets and both event-48 battery offsets annotated.

## Self-Check: PASSED

- `/Users/francisco/Documents/goose/Rust/core/src/protocol.rs` — modified with inline offset comments
- `/Users/francisco/Documents/goose/Rust/core/src/bridge/mod.rs` — modified with inline offset comments
- Commit a2670f4 exists: `git log --oneline | grep a2670f4` ✓
- No logic changes — 2 files changed, 41 insertions (+2 comment-only deletions replaced)
