---
phase: 12
name: WHOOP 4.0 RTC Clock Sync
date: 2026-06-05
status: discussed
---

# Phase 12 Context — WHOOP 4.0 RTC Clock Sync

## Domain

Auto-trigger a GET_CLOCK → (if drift > 5s) SET_CLOCK sequence when a WHOOP device connects and reaches "ready" state. The full pipeline already exists in `GooseBLEClient` — only the trigger is missing.

## What Already Exists (do not re-implement)

- `writeClockCommand(.get, syncIfNeeded: true)` — sends GET_CLOCK and stores `pendingClockCommand`
- `handleClockCommandResponse` — on GET response, computes offset, auto-calls `.set(Date())` when `abs(offset) > strapClockAutoSyncThresholdSeconds` (5s)
- `canSyncClock` guard — checks `connectionState == "ready" && supportsClockCommands && pendingClockCommand == nil`
- `strapClockDate`, `strapClockOffsetSeconds`, `strapClockStatus` — all `@Published` and updated automatically
- Manual trigger exists in `DeviceView` (lines 392, 514)

## Decisions

### D-01: Trigger in onConnectionStateChange callback — inline call

**Locked:** In `GooseAppModel+Lifecycle.swift` (or wherever `onConnectionStateChange` is wired), when state transitions to `"ready"`, call:

```swift
if ble.canSyncClock {
  ble.writeClockCommand(.get, syncIfNeeded: true)
}
```

Place the call AFTER the existing `scheduleAutoStartHealthPacketCaptureIfNeeded()` and `scheduleAutoStartRespiratoryPacketWatchIfNeeded()` calls (same pattern). Log with `record(source: "ble.clock", title: "clock.auto_sync.triggered")`.

Do NOT create a new method — inline in the existing `"ready"` handler.

### D-02: No generation filter — use canSyncClock guard

**Locked:** Do not add `activeDescriptor?.generation == .gen4` checks. `canSyncClock` already provides the correct guard. If a Gen3 device responds incorrectly, `handleClockCommandResponse` handles the error via `failClockCommand()` which sets `strapClockStatus` and clears `pendingClockCommand` — no crash, no stuck state.

### D-03: Command numbers are correct as-is

**Locked:** `.get = 11`, `.set = 10` are already in `ClockCommandKind.commandNumber`. The STATE.md open question ("confirm against physical device") is resolved by the fact that the manual sync in `DeviceView` was already implemented with these values — treat as confirmed.

## Canonical Refs

- `GooseSwift/GooseBLEClient+Commands.swift` lines 225-301 — `writeClockCommand` implementation
- `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` lines 155-210 — `handleClockCommandResponse` auto-SET logic
- `GooseSwift/GooseBLEClient.swift` lines 362, 470-511, 874-878 — threshold, ClockCommandKind, canSyncClock
- `GooseSwift/GooseAppModel+Lifecycle.swift` — target file for D-01 trigger, find `onConnectionStateChange` "ready" handler
- `GooseSwift/GooseBLEClient+UserActions.swift` line 260 — existing manual GET_CLOCK call site (pattern to follow)

## Success Criteria

1. After connecting WHOOP, app automatically reads device clock (GET_CLOCK sent on "ready")
2. When drift > 5s, app writes current iPhone time (SET_CLOCK sent automatically by existing handler)
3. Sync is silent — no user prompt, does not interrupt BLE capture
4. `strapClockStatus` reflects the sync state ("Reading clock; auto-sync >5s" → "Clock synced" or "Clock within threshold")
5. Existing manual sync in DeviceView continues to work
