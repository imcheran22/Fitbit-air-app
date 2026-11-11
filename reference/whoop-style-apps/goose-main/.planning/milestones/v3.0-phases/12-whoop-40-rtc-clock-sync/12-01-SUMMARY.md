---
phase: 12
plan: 01
subsystem: ble-clock-sync
tags: [ble, clock-sync, whoop, auto-trigger]
dependency_graph:
  requires: []
  provides: [auto-rtc-clock-sync-on-ready]
  affects: [GooseAppModel+Lifecycle, GooseBLEClient+Commands]
tech_stack:
  added: []
  patterns: [inline-trigger-in-state-handler]
key_files:
  modified:
    - GooseSwift/GooseAppModel+Lifecycle.swift
decisions:
  - "D-01: Inline trigger in handleBLEConnectionStateChange 'ready' handler — no new method"
  - "D-02: canSyncClock guard used instead of generation check"
  - "D-03: ClockCommandKind values (.get=11, .set=10) confirmed as-is"
metrics:
  duration: "5m"
  completed: "2026-06-05"
  tasks_completed: 1
  files_modified: 1
---

# Phase 12 Plan 01: Auto-trigger RTC Clock Sync on WHOOP Ready — Summary

**One-liner:** Auto-trigger GET_CLOCK on WHOOP "ready" via `canSyncClock` guard + `writeClockCommand(.get, syncIfNeeded: true)` inline in `handleBLEConnectionStateChange`.

## What Was Built

Added 4 lines to `GooseAppModel+Lifecycle.swift` inside the `handleBLEConnectionStateChange` "ready" path (after `scheduleAutoStartRespiratoryPacketWatchIfNeeded()`):

```swift
if ble.canSyncClock {
  ble.writeClockCommand(.get, syncIfNeeded: true)
  ble.record(source: "ble.clock", title: "clock.auto_sync.triggered", body: "state=ready")
}
```

The full pipeline — `handleClockCommandResponse` auto-calling SET_CLOCK when drift > 5s, `pendingClockCommand` tracking, `strapClockStatus` publishing — was already implemented in `GooseBLEClient`. Only the trigger was missing.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 7b6307c | feat(12): auto-trigger RTC clock sync on WHOOP ready | GooseAppModel+Lifecycle.swift |

## Acceptance Criteria Results

| Criterion | Result |
|-----------|--------|
| `grep -c "clock.auto_sync.triggered\|writeClockCommand"` → ≥1 | 2 (PASS) |
| `grep -c "canSyncClock"` → 1 | 1 (PASS) |
| Existing wri |
| cargo test passes | ok. 9 passed; 0 failed (PASS) |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File `/Users/francisco/Documents/goose/GooseSwift/GooseAppModel+Lifecycle.swift` modified and committed
- Commit `7b6307c` exists in git log
- All acceptance criteria met
