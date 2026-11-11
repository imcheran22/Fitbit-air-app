---
phase: 09-ble-stability-data-integrity
plan: 03
subsystem: ble
tags: [swift, bluetooth, reconnect, backoff, storage-compaction, device-id]

requires:
  - phase: 09-01
    provides: storage.compact_raw_evidence bridge method
  - phase: 09-02
    provides: active_device_id field on capture.import_frame_batch Rust args

provides:
  - WHOOP BLE reconnect with exponential backoff (1s base, doubles to 60s cap, 10-attempt circuit breaker)
  - ReconnectBackoff shared value type (GooseBLEReconnect.swift) consumed by Plan 04
  - DispatchWorkItem + generation-token cancellation mechanism for scheduled retries
  - ConnectionView Stop Reconnecting / Try Again controls + attempt counter
  - active_device_id propagated from Swift peripheral UUID into capture.import_frame_batch
  - Storage compaction triggered at launch (with log) and after each write (silent)

affects: [09-04]

tech-stack:
  added: []
  patterns:
    - ReconnectBackoff value type shared across WHOOP and HR monitor paths
    - DispatchWorkItem + Int generation token for cancellable asyncAfter scheduling
    - cancelReconnectCycle() called on BT-off, connect-success, Stop, and manual retry

key-files:
  created:
    - GooseSwift/GooseBLEReconnect.swift
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+Commands.swift
    - GooseSwift/GooseBLEClient+CentralDelegate.swift
    - GooseSwift/GooseAppModel.swift
    - GooseSwift/GooseAppModel+Lifecycle.swift
    - GooseSwift/CaptureFrameWriteQueue.swift
    - GooseSwift/ConnectionView.swift

key-decisions:
  - "First WHOOP reconnect attempt fires after 1s delay (not immediately) to avoid hammering on transient disconnects"
  - "DispatchWorkItem + Int generation token chosen over DispatchSourceTimer: simpler, queue-native, and testable by reasoning"
  - "stopReconnect() does NOT clear rememberedDeviceID (D-05 decision: Stop ≠ Forget)"
  - "Storage compaction limit hardcoded at 25_165_824 bytes (24 MB) at both call sites (D-11)"
  - "cancelReconnectCycle() added to BT-off branch (fix over plan spec) to prevent ghost timers on Bluetooth disable"

patterns-established:
  - "ReconnectBackoff value type: nextDelay() returns nil at circuit-breaker limit, callers check nil to detect exhaustion"
  - "All reconnect-state mutations confined to coreBluetoothQueue; @Published updates dispatched to main"
  - "cancelReconnectCycle() = cancel workItem + nil it + bump generation — call on every transition that ends the cycle"

requirements-completed: [FIX-02, FIX-05, FIX-01]

duration: ~65min
completed: 2026-06-04
---

# Phase 09-03: WHOOP BLE Reconnect Backoff + Swift Wiring Summary

**WHOOP BLE reconnect refactored onto exponential backoff (1s→60s, 10-attempt circuit breaker) with cancellable DispatchWorkItem scheduling; active_device_id and storage compaction wired into Swift write path and app launch**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-06-04T19:00Z
- **Completed:** 2026-06-04T20:10Z
- **Tasks:** 3 auto + 1 fix + checkpoint pending
- **Files modified:** 8

## Accomplishments

- `GooseBLEReconnect.swift` created with `struct ReconnectBackoff` — value type, `nextDelay()` returns nil at attempt 10, shared with Plan 04 (HR monitor path)
- `autoReconnectInFlight` bool fully removed from `GooseBLEClient` and all 8 assignment sites; replaced by `isReconnecting` / `reconnectFailed` computed properties driven by `reconnectState`
- Cancellable scheduling: `reconnectWorkItem: DispatchWorkItem?` + `reconnectGeneration: Int` — stale retries no-op via generation guard inside the scheduled closure
- `stopReconnect()` and `retryReconnect()` added; Stop does not clear rememberedDeviceID
- ConnectionView: "Stop Reconnecting" visible when `isReconnecting`, "Try Again" + failure text visible when `reconnectFailed`
- `active_device_id` arg added to `capture.import_frame_batch` call in `CaptureFrameWriteQueue` via `activeDeviceID: String?` property
- `runStorageCompactionIfNeeded()` added to `GooseAppModel` — calls `storage.compact_raw_evidence` bridge at launch on background queue, logs when compacted_rows > 0
- Post-write compaction in `CaptureFrameWriteQueue` — silent fast no-op when under 24 MB limit

## Task Commits

1. **Task 1: ReconnectBackoff + WHOOP reconnect refactor** — `0d3e4c3`
2. **Task 2: active_device_id + storage compaction wiring** — `8868373`
3. **Task 3: ConnectionView Stop/Try Again UI** — `4394197`
4. **Fix: cancelReconnectCycle on BT-off** — `f56492b`

## Files Created/Modified

- `GooseSwift/GooseBLEReconnect.swift` — `struct ReconnectBackoff` value type
- `GooseSwift/GooseBLEClient.swift` — replaced autoReconnectInFlight; added reconnectBackoff, reconnectWorkItem, reconnectGeneration, isReconnecting, reconnectFailed
- `GooseSwift/GooseBLEClient+Commands.swift` — scheduleNextReconnect, cancelReconnectCycle, stopReconnect, retryReconnect; refactored attemptAutomaticReconnect onto backoff
- `GooseSwift/GooseBLEClient+CentralDelegate.swift` — didConnect calls cancelReconnectCycle + reset; BT-off branch now calls cancelReconnectCycle + reset (fix)
- `GooseSwift/GooseAppModel.swift` / `GooseAppModel+Lifecycle.swift` — runStorageCompactionIfNeeded at launch
- `GooseSwift/CaptureFrameWriteQueue.swift` — activeDeviceID property; active_device_id arg in import call; post-write compaction
- `GooseSwift/ConnectionView.swift` — Stop Reconnecting / Try Again buttons + failure text

## Decisions Made

- First attempt fires after 1s (not immediately) — documented in-code for future readers
- `DispatchWorkItem` + generation token chosen over alternative approaches for queue-native simplicity
- `stopReconnect()` resets to idle without forgetting device (D-05)
- Storage compaction limit 24 MB (25_165_824 bytes) hardcoded at both call sites per D-11

## Deviations from Plan

### Auto-fixed Issues

**1. [Bug] cancelReconnectCycle not called in BT-off branch**
- **Found during:** Checkpoint review (orchestrator code review)
- **Issue:** `centralManagerDidUpdateState` else-branch did not call `cancelReconnectCycle()`, leaving pending `reconnectWorkItem` alive when Bluetooth powers off
- **Fix:** Added `cancelReconnectCycle()` and `reconnectBackoff.reset()` before `updateConnectionState("disconnected")` in the BT-off branch
- **Committed in:** `f56492b`

## Issues Encountered

None beyond the bug above.

## Self-Check

- `grep -c 'autoReconnectInFlight' GooseSwift/*.swift` → 0 (confirmed removed)
- `grep -n 'reconnectWorkItem\|reconnectGeneration' GooseSwift/GooseBLEClient*.swift` → shows stored workitem + generation guard
- `grep -n 'cancelReconnectCycle' GooseSwift/GooseBLEClient+CentralDelegate.swift` → lines 83, 167, 179 (BT-off, connect-failed, connect-success)
- `grep -c '25_165_824\|25165824' GooseSwift/GooseAppModel.swift GooseSwift/CaptureFrameWriteQueue.swift` → 2
- Automated: `cargo build` passes (Rust unaffected by Swift changes)
- Human BLE test: **PENDING** — checkpoint at Task 4; user to verify reconnect backoff UI after merge to main

## Next Phase Readiness

- `ReconnectBackoff` in `GooseBLEReconnect.swift` is ready to be consumed by Plan 04 (HR monitor reconnect path)
- `ConnectionView` has a placeholder comment for the HR Reconnect row (Plan 04 adds `hrReconnectState`)
- Plans 01 and 02 Rust side fully merged and tested; Plan 03 Swift side pending human BLE verification

---
*Phase: 09-ble-stability-data-integrity*
*Completed: 2026-06-04*
