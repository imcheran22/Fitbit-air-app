---
phase: 86-bridge-rs-split-protocol-comments
plan: "05"
subsystem: rust-core-protocol
tags:
  - documentation
  - protocol
  - wire-format
  - COMM-01
dependency_graph:
  requires:
    - 86-04
  provides:
    - COMM-01-complete
  affects:
    - protocol.rs
    - bridge/metrics.rs
tech_stack:
  added: []
  patterns:
    - "Inline offset comments at byte-decode sites (// offset N: type, field = formula)"
    - "Function-level doc block listing full payload layout (/// Byte layout ...)"
key_files:
  created: []
  modified:
    - Rust/core/src/protocol.rs
    - Rust/core/src/bridge/metrics.rs
decisions:
  - "Used function-level /// doc block for parse_v24_body_summary (16 offsets — too many for inline per-field comments)"
  - "Applied cargo fmt scoped to the two modified files only; reverted formatter changes to unowned files"
  - "skin_temp comment updated parse_v18_body existing partial comment to full format with empirical reference"
metrics:
  duration_minutes: 20
  completed_date: "2026-06-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 86 Plan 05: COMM-01 Protocol Offset Comments Summary

**One-liner:** Protocol offset and algorithm comments at all 14 non-obvious WHOOP wire-format decode sites — 11 in protocol.rs and 3 in bridge/metrics.rs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add offset comments to protocol.rs at 11 decode sites | 5829fff | Rust/core/src/protocol.rs |
| 2 | Add algorithm comments to bridge/metrics.rs at 3 formula sites | 5829fff | Rust/core/src/bridge/metrics.rs |

## What Was Built

### Task 1 — protocol.rs (11 sites)

Added wire-format offset comments at every non-obvious byte-decode site in protocol.rs, following the format established by the BAT-01 comment block in bridge/metrics.rs:

| Site | Function | Comment Added |
|------|----------|---------------|
| 1 | `parse_r22_payload` | offset 1: u8, battery_pct; R22 BLE characteristic 0x0022 context |
| 2 | `parse_r22_payload` | offsets 2–3: u16 LE, hr_milli_bpm; hr_bpm = raw / 10.0 |
| 3 | `parse_r22_payload` | offsets 4–5: [u8; 2], extra; purpose unknown (empirical) |
| 4 | `parse_frame` Gen4 | Gen4 frame header layout: 4 bytes, length at bytes 1–2 |
| 5 | `parse_frame` Gen5 | Gen5 header layout: 8 bytes, length at bytes 2–3, flags byte at byte 1 |
| 6 | `parse_frame` Gen5 CRC | Gen5 CRC16 Modbus trailer at bytes 6–7, covering header bytes 0–5 |
| 7 | `expected_frame_len` Gen4 | Stream reassembly: payload length at buffer[1..=2] + 4-byte header |
| 8 | `expected_frame_len` Gen5 | Stream reassembly: payload length at buffer[2..=3] + 8-byte header |
| 9 | `parse_v24_body_summary` | Function-level doc block: all 16 offsets (14–75) with types, formulas, guard |
| 10 | `parse_v18_body` | offsets 45/49/53: f32 LE gravity axes; offset 73: skin_temp_raw degC = raw / 128.0 |
| 11 | `parse_k10_raw_motion_summary` | IMU axis offsets array: accel x/y/z at 85/285/485, gyro x/y/z at 688/888/1088 |

### Task 2 — bridge/metrics.rs (3 sites)

Added algorithm/formula comments above the three helper functions:

| Site | Function | Comment Added |
|------|----------|---------------|
| 1 | `spo2_from_raw_uncalibrated` | Ratio-of-ratios formula R = red/ir; SpO2 ≈ 110 − 25×R; gate 70–100%; source openwhoop + Ghidra |
| 2 | `skin_temp_celsius_from_raw` | NTC linearisation: degC = (raw − 930) / 30 + 33; anchor 930 → 33°C; gate 25–40°C |
| 3 | `resp_rate_bpm_zero_crossing` | Zero-crossing algorithm: mean-centre, count sign changes, rate = (crossings/2) / window_s × 60 |

## Verification

```
grep -c "empirically verified" Rust/core/src/protocol.rs  → 11
grep -c "empirically verified" Rust/core/src/bridge/metrics.rs → 3
cargo test --lib → 151 passed; 0 failed
cargo build --lib → 0 errors
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Adjustments

**1. cargo fmt scoped to modified files only**
- Ran `cargo fmt -- src/protocol.rs src/bridge/metrics.rs` (not `--all`) per project convention.
- Formatter touched other files (bridge/mod.rs, store.rs, etc.) — reverted those via `git checkout --` before staging.
- Only protocol.rs and bridge/metrics.rs were committed.

**2. parse_v18_body skin_temp comment replaced (not added)**
- The function already had a partial inline comment: `// skin_temp_raw stored as raw u16; degC = raw / 128.0, gate 5..=45 applied at persistence site.`
- Replaced with the full COMM-01 format including body-relative offset, formula derivation, and empirical verification date.

**3. parse_v24_body_summary skin_temp formula discrepancy noted**
- The V24 doc block documents `degC = (raw − 930) / 30 + 33` (NTC linearisation, matching `skin_temp_celsius_from_raw`).
- The V18 comment documents `degC = raw / 128.0` (simpler formula, matching the existing partial comment).
- These are two different formulas — V18 uses a simpler LSB-per-degC model, V24 uses an anchor-point NTC model. Both comments reflect what the code actually does; no code was changed.

## Known Stubs

None — this plan adds documentation comments only; no data flows or UI rendering are affected.

## Threat Flags

None — documentation-only changes introduce no new trust boundaries or network surfaces.

## Self-Check: PASSED

- [x] `Rust/core/src/protocol.rs` modified — confirmed in commit 5829fff
- [x] `Rust/core/src/bridge/metrics.rs` modified — confirmed in commit 5829fff
- [x] `grep -c "empirically verified" protocol.rs` = 11 (≥ 6 required)
- [x] `grep -c "empirically verified" bridge/metrics.rs` = 3 (≥ 2 required)
- [x] `cargo test --lib` = 151 passed, 0 failed
- [x] No code changes — comments only
