---
name: wake-window-alarm
description: Smart alarm wake-window engine — strap polls sleep state during a time window and fires autonomously at the optimal moment (distinct from single-shot alarm)
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Extend the single-shot alarm (seeded in `smart-alarm-strap-haptic.md`) into a full wake-window engine: the user sets an earliest and latest acceptable wake time, the strap monitors sleep state during that window, and fires the haptic alarm at the lightest-sleep moment — exactly how the WHOOP Smart Alarm works.

This is distinct from the existing seed, which documents the `SET_ALARM_TIME` payload bytes for a single-fire alarm. The wake-window concept requires a separate command format and a phone-side window manager.

## What WHOOP has (Ghidra — WhoopSleepCoach framework)

Classes identified in `~/Desktop/ObjC_RESOLVED.txt`:
- `WakeWindow` — data type holding `lowerTimeBound` + `upperTimeBound`
- `WakeWindowDuration` — enum of window lengths (15 min, 30 min, 45 min, 60 min)
- `SmartAlarmTriggerManager` — phone-side orchestrator; polls sleep state during open window
- `hasTriggeredSmartAlarmForWindow` — guard preventing double-fire
- `SetAlarmInfoCommandPacketRev4` — the BLE command that arms a windowed alarm (distinct from single-shot `SET_ALARM_TIME`)
- `alarm_bounds(lowerTimeBound:upperTimeBound:)` — factory method

## RE gap — `SetAlarmInfoCommandPacketRev4` layout unknown

The single-shot `SET_ALARM_TIME` (cmd `0x42`, REVISION_4, 20 bytes) is documented in `smart-alarm-strap-haptic.md`. The windowed `SetAlarmInfo` command appears to encode additional fields:
- `alarmMode`: Exact vs Range
- `lowerTimeBound` + `upperTimeBound` (epoch seconds)
- `enabled` flag

**RE task:** Decompile `SetAlarmInfoCommandPacketRev4` in Ghidra to find field offsets. BTSnoop capture of WHOOP app setting a smart alarm provides ground-truth bytes for validation.

Until this RE is done, the windowed alarm cannot be implemented correctly.

## Goose current state

- `GooseBLEClient` has alarm write infrastructure (`GooseBLEClient+Commands.swift`)
- Rust core has sleep staging (`sleep_stager.rs`) — can classify current sleep stage on demand
- `smart-alarm-strap-haptic.md` seed documents single-shot `SET_ALARM_TIME` payload
- Missing: `SetAlarmInfoCommandPacketRev4` wire layout, `WakeWindow` data type, window manager

## Phone-side orchestration (no RE needed)

The `SmartAlarmTriggerManager` pattern is clear from the class names. Goose can implement this in Swift before the strap command is fully known:

1. User sets window: `earliestWake` (e.g. 06:30) + `latestWake` (e.g. 07:00)
2. At `earliestWake - 5 min`: arm the strap with the range command (window bounds → strap RTC)
3. Strap monitors internally; if the strap-driven approach works: wait for `STRAP_DRIVEN_ALARM_EXECUTED` (event `57`) on notification characteristic
4. Fallback (phone-driven): if event not received by `latestWake - 1 min`, query live sleep stage via bridge; if stage ≤ light → fire single-shot alarm; else wait and retry at `latestWake`
5. `hasTriggeredSmartAlarmForWindow` guard: set flag on first fire, reset at noon same day

## Implementation plan (post-RE)

1. RE `SetAlarmInfoCommandPacketRev4` byte layout (prerequisite)
2. `GooseBLEClient+AlarmCommands.swift`: add `setWindowedAlarm(lower:upper:alarmId:)` alongside existing `setAlarm(wakeEpochMs:)`
3. `GooseWakeWindowManager.swift`: window orchestration, sleep-stage polling fallback, fired-guard
4. Update Sleep Coach UI: add earliest/latest pickers alongside single-shot alarm toggle
5. Handle `STRAP_DRIVEN_ALARM_EXECUTED` (event 57) already named in `protocol.rs:870-894` — confirm field-level parse of the inbound payload (see `smart-alarm-strap-haptic.md` RE task)

## Files to create

- `GooseSwift/GooseWakeWindowManager.swift`
- (update) `GooseSwift/GooseBLEClient+AlarmCommands.swift` — add windowed variant
- (update) Sleep Coach / alarm UI views

## Related seeds

- `smart-alarm-strap-haptic.md` — single-shot alarm payload bytes; shares buzz wire-up prerequisite and `STRAP_DRIVEN_ALARM_EXECUTED` RE task
