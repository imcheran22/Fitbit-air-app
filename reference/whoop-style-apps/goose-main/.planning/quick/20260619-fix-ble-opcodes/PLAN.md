---
slug: fix-ble-opcodes
created: 2026-06-19
status: in_progress
---

# Fix BLE Command Opcodes and GET_HELLO Revision Byte

## Goal

Fix 4 wrong command_number values in commands.rs and missing revision byte in GET_HELLO Swift command. All confirmed via Android APK analysis.

## Changes

### Rust/core/src/commands.rs

Four command_number values are wrong vs APK ground truth:

| id | Current (wrong) | Correct (APK) |
|----|-----------------|---------------|
| enter_high_freq_sync | Some(96) | Some(85) — 0x55 |
| exit_high_freq_sync | Some(97) | Some(86) — 0x56 |
| get_extended_battery_info | Some(98) | Some(87) — 0x57 |
| toggle_imu_mode_historical | Some(105) | Some(100) — 0x64 |

Lines ~837-865 in commands.rs.

### GooseSwift/GooseBLETypes.swift

GET_HELLO (command 145 = 0x91) Gen4 path sends empty payload `data: []`.
APK confirms payload must be `[0x01]` (REVISION_1 prefix).
Line ~239.

## Verification

Run `cd Rust/core && cargo check` — must pass with zero errors.

## Commit

Single commit: "fix: correct BLE command opcodes for high-freq sync, extended battery, IMU historical mode"
