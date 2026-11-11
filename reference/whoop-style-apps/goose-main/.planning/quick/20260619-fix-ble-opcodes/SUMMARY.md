---
status: complete
completed: 2026-06-19
---

Fixed 4 wrong BLE command opcodes in commands.rs (enter_high_freq_sync 96→85, exit_high_freq_sync 97→86, get_extended_battery_info 98→87, toggle_imu_mode_historical 105→100) and GET_HELLO missing revision byte in GooseBLETypes.swift (data: [] → data: [0x01]). Cargo check passed.
