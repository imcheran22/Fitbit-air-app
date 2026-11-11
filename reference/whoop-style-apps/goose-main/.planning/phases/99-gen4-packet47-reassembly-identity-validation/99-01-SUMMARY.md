---
phase: 99-gen4-packet47-reassembly-identity-validation
plan: "01"
subsystem: BLE / Historical Sync
tags: [gen4, ble, historical-sync, frame-reassembly, SYNC-09]
status: complete
completed: "2026-06-21"
duration: "~15 min"

dependency_graph:
  requires: []
  provides:
    - GooseBLEHistoricalManager.gen4HistoricalFrameBuffer
    - CoreBluetoothBLETransport.handleHistoricalSyncValue (buffered reassembly)
  affects:
    - Gen4 historical sync packet write rate to SQLite

tech_stack:
  added: []
  patterns:
    - Prepend-and-store-tail reassembly buffer pattern (mirrors frameReassemblyBuffers in GooseAppModel.gooseFrames)

key_files:
  created: []
  modified:
    - GooseSwift/GooseBLEHistoricalManager.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift
    - GooseSwift/CoreBluetoothBLETransport+HistoricalCommands.swift

decisions:
  - "Approach A (no API change): consumed bytes computed from returned frames, suffix stored as tail — avoids modifying gen4Frames return signature"
  - "Buffer capped at 8192 bytes to prevent unbounded growth from malformed BLE frames (threat T-99-01-01/T-99-01-02)"
  - "Clear on begin/complete/fail — three clear sites guarantee no stale bytes across sessions"

requirements:
  - SYNC-09
---

# Phase 99 Plan 01: Gen4 Packet-47 Multi-Notification Frame Reassembly Summary

**One-liner:** Gen4 historical sync now prepends a `gen4HistoricalFrameBuffer` tail across 512-byte BLE notifications so type-47 body frames spanning multiple notifications are reassembled into complete frames rather than silently dropped.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add gen4HistoricalFrameBuffer field | a88fa67 | GooseBLEHistoricalManager.swift |
| 2 | Patch handleHistoricalSyncValue; clear on begin/complete/fail | a88fa67 | CoreBluetoothBLETransport+HistoricalHandlers.swift, CoreBluetoothBLETransport+HistoricalCommands.swift |
| 3 | Close GitHub issue #20 | — | (GitHub) |

## What Was Built

### Root Cause

`handleHistoricalSyncValue` called `gen4Frames(in:)` with only the bytes of the current BLE notification. When a Gen4 type-47 body frame declares a `declaredLength` that exceeds the remaining bytes in one 512-byte notification, `gen4Frames` hits the `guard bytes.count >= expectedLength else { break }` guard and returns no frame. The continuation bytes in the next notification do not start with `0xaa`, so they are also skipped. Result: zero complete type-47 frames written to SQLite during a Gen4 historical sync.

### Fix

**`GooseBLEHistoricalManager.swift`** — added `gen4HistoricalFrameBuffer: Data = Data()` in a new `// MARK: - Gen4 frame reassembly buffer (SYNC-09)` section, immediately after `gen4HistoricalPageSeq`.

**`CoreBluetoothBLETransport+HistoricalHandlers.swift`** — `handleHistoricalSyncValue` now:
1. Prepends `historicalManager.gen4HistoricalFrameBuffer` to the incoming `value` to form `inputBytes`
2. Clears the buffer optimistically (before the frame loop)
3. Calls `frames(in: inputBytes)` to get complete frames
4. Computes `consumedCount` by summing `4 + declaredLength` for each returned frame
5. Stores the unconsumed suffix back to `gen4HistoricalFrameBuffer`, capped at 8192 bytes
6. Iterates returned frames and calls `handleHistoricalSyncFrame` per frame

`completeHistoricalSync` and `failHistoricalSync` each clear `gen4HistoricalFrameBuffer = Data()` at the top, before any other teardown.

**`CoreBluetoothBLETransport+HistoricalCommands.swift`** — `beginHistoricalSync` clears `gen4HistoricalFrameBuffer = Data()` alongside the `gen4HistoricalPageSeq = 0` reset.

## Verification

| Gate | Result |
|------|--------|
| `grep -c 'gen4HistoricalFrameBuffer' GooseBLEHistoricalManager.swift` | 1 (declaration) |
| `grep -c 'gen4HistoricalFrameBuffer' CoreBluetoothBLETransport+HistoricalHandlers.swift` | 6 (prepend + optimistic clear + tail store + 2 clear sites) |
| `grep -rn 'gen4HistoricalFrameBuffer' GooseSwift/` | 8 lines total across 3 files |
| iOS simulator build (`xcodebuild … iPhone 17`) | BUILD SUCCEEDED |
| Rust tests (`cargo test --locked`) | Running (no Rust files changed — expected pass) |
| GitHub issue #20 state | CLOSED |

**Hardware-gated SC:** Full regression verification (`reassembly.dropped == 0` during Gen4 sync) requires a physical Gen4 WHOOP device. Simulator build is the CI gate.

## Deviations from Plan

None — plan executed exactly as written. Approach A (compute consumed count from returned frames, no API change to `gen4Frames`) was used as preferred. The begin-sync clear was placed in `CoreBluetoothBLETransport+HistoricalCommands.swift` (which owns `beginHistoricalSync`) rather than in `HistoricalHandlers.swift`, as directed by the plan.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. Threat mitigations T-99-01-01 and T-99-01-02 implemented:
- Buffer capped at 8192 bytes prevents memory exhaustion from malformed frames
- Buffer cleared on sync fail prevents poison bytes persisting into the next session

## Self-Check: PASSED

| Item | Status |
|------|--------|
| GooseBLEHistoricalManager.swift exists | FOUND |
| CoreBluetoothBLETransport+HistoricalHandlers.swift exists | FOUND |
| CoreBluetoothBLETransport+HistoricalCommands.swift exists | FOUND |
| SUMMARY.md exists | FOUND |
| Commit a88fa67 exists | FOUND |
