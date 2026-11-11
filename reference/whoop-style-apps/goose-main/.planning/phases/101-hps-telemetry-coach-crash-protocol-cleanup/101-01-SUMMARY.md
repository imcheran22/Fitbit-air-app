---
phase: 101-hps-telemetry-coach-crash-protocol-cleanup
plan: "01"
subsystem: ble-sync-telemetry
tags: [sync, telemetry, schema-migration, rust, swift, ble]
status: complete

dependency_graph:
  requires: []
  provides:
    - sync_telemetry SQLite table (schema v23)
    - sync.record_hps_telemetry Rust bridge method
    - GooseBLEHistoricalManager.burstStartedAt / burstBytesReceived
    - per-burst ble.record(hps.telemetry) log
  affects:
    - Rust/core/src/store/mod.rs
    - Rust/core/src/bridge/capture.rs
    - Rust/core/src/bridge/mod.rs
    - GooseSwift/GooseBLEHistoricalManager.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift

tech_stack:
  added:
    - sync_telemetry SQLite table with session_id / burst_index / bytes_received / duration_ms / missing_packets / sequence_gaps / result columns
    - idx_sync_telemetry_session index
  patterns:
    - bridge method + store method + integration test (5-location pattern in capture.rs)
    - burst boundary instrumentation with Date() + burstBytesReceived accumulator

key_files:
  created:
    - Rust/core/tests/sync_telemetry_round_trip.rs
  modified:
    - Rust/core/src/store/mod.rs
    - Rust/core/src/bridge/mod.rs
    - Rust/core/src/bridge/capture.rs
    - GooseSwift/GooseBLEHistoricalManager.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift

decisions:
  - SYNC-12: sequence_gaps always written as 0 for now; future plan to compute actual gap count from frame sequence numbers

metrics:
  duration: "~30 min"
  completed: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
  files_created: 1
---

# Phase 101 Plan 01: HPS Sync Telemetry Summary

Implements SYNC-12: per-burst HPS sync quality telemetry via schema v23 migration, a new Rust bridge method, and Swift burst boundary instrumentation.

## What Was Built

**Rust (Task 1):**
- `CURRENT_SCHEMA_VERSION` bumped from 22 to 23
- `sync_telemetry` table created in `migrate()` with 9 columns: `id`, `session_id`, `burst_index`, `bytes_received`, `duration_ms`, `missing_packets`, `sequence_gaps`, `result`, `created_at`
- `idx_sync_telemetry_session` index on `session_id` for efficient per-session queries
- `GooseStore::insert_sync_telemetry()` public method
- `SyncRecordHpsTelemetryArgs` struct, dispatcher arm, `sync_record_hps_telemetry_bridge` fn in `bridge/capture.rs`
- `"sync.record_hps_telemetry"` registered in `BRIDGE_METHODS` constant

**Swift (Task 2):**
- `burstStartedAt: Date?` and `burstBytesReceived: Int` added to `GooseBLEHistoricalManager`
- `handleHistoricalSyncValue` accumulates `value.count` into `burstBytesReceived`
- `case .historyStart` resets both fields with `Date()` and `0`
- `case .historyEnd` computes `burstDurationMs`, emits `ble.record(level: .debug, source: "ble.sync", title: "hps.telemetry", ...)`, then dispatches `sync.record_hps_telemetry` bridge call on `historicalWriteQueue`

## Verification Results

| Check | Result |
|-------|--------|
| `cargo test --test sync_telemetry_round_trip` | PASS (1/1) |
| `cargo test bridge_methods_constant_matches_dispatcher` | PASS |
| `cargo test bridge_methods_constant_is_sorted_and_unique` | PASS |
| `xcodebuild build (iPhone 17 Pro simulator)` | BUILD SUCCEEDED |

## Commits

| Hash | Description |
|------|-------------|
| 35b6670 | feat(101-01): schema v23 + sync_telemetry store + bridge method (SYNC-12) |
| e1f5d4b | feat(101-01): Swift burst instrumentation — bytes, duration, ble.record, bridge call (SYNC-12) |

## Deviations from Plan

**1. [Rule 1 - Context] Rust and Swift changes already partially present**
- Found during: initial inspection
- Issue: `CURRENT_SCHEMA_VERSION`, `sync_telemetry` DDL, `insert_sync_telemetry`, bridge dispatcher and args struct, `sync.record_hps_telemetry` in BRIDGE_METHODS, and the integration test file were all already committed to the working tree from a prior session. The `GooseBLEHistoricalManager.swift` and `CoreBluetoothBLETransport+HistoricalHandlers.swift` instrumentation was absent.
- Fix: Verified existing Rust artifacts were complete and correct; implemented only the missing Swift instrumentation.
- No plan deviation — plan executed as written.

## Known Stubs

- `sequence_gaps` is always written as `0` in the Swift bridge call. Actual gap computation from frame sequence numbers is deferred per SYNC-12 plan note.
- `missing_packets` is always `0`. Neither stub prevents the plan's goal (telemetry row persisted per burst with bytes and duration).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surfaces introduced beyond those documented in the plan's threat model.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| Rust/core/tests/sync_telemetry_round_trip.rs | FOUND |
| GooseSwift/GooseBLEHistoricalManager.swift | FOUND |
| GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift | FOUND |
| commit 35b6670 | FOUND |
| commit e1f5d4b | FOUND |
