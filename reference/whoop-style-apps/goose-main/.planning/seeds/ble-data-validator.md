---
name: ble-data-validator
description: Swift-side BLE frame validation layer before Rust/SQLite — prevents corrupt frames from reaching persistent storage
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add a dedicated Swift-side validation layer (`GooseBLEDataValidator`) between BLE frame receipt and Rust bridge ingestion, equivalent to `WHPBLEProcessDataValidator` in WHOOP v5.37.0.

## Problem

Currently: BLE bytes → Rust bridge → SQLite. If the WHOOP device sends a truncated, out-of-order, or CRC-invalid frame, the Rust layer may reject it — but the error is logged and silently discarded. There is no Swift-side gate.

Impact: corrupt frames can affect HRV, sleep staging, and strain computation without any observable warning to the user or developer.

## What to build

A `GooseBLEDataValidator` struct/class that runs before `CaptureFrameWriteQueue`:
1. Frame type in expected set for current capture mode
2. Minimum/maximum byte length per frame type
3. CRC check (already computed in Rust — expose result back to Swift as a pre-check)
4. Sequence continuity (detect large gaps in frame counter)

On failure: log via `ble.record(level: .warn, ...)` + increment a discarded-frame counter visible in diagnostics. Do NOT surface to user UI — silent rejection with telemetry.

## Research basis

WHOOP has `WHPBLEProcessDataValidator` + `WHPBLEProcessDataValidatorV` as a separate class in the pipeline, distinct from `WHPBLEProcessDataManager`. Marked "Critical" in WHOOP-GOOSE-CROSS-COMPARE.md (2026-06-11).

## Files to touch

- New: `GooseSwift/GooseBLEDataValidator.swift`
- Modify: `GooseSwift/CaptureFrameWriteQueue.swift` (insert validation step)
- Modify: `GooseSwift/NotificationFrameParsing.swift` (or equivalent entry point)
