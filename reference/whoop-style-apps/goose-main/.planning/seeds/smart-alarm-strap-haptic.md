---
name: smart-alarm-strap-haptic
description: BLE-commanded strap vibration alarm — WHOOP writes wake window schedule to strap; strap fires autonomously via haptic
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
  updated_date: 2026-06-11
---

## Idea

Implement a smart alarm that writes a wake window schedule to the WHOOP strap via BLE. The strap fires autonomously at the optimal moment within the window using its built-in haptic motor — no phone involvement at wake time.

## What WHOOP has (from Ghidra RE, 2026-06-11)

Discovered via Ghidra, `WhoopSleepCoach` framework (114+ classes):
- `SmartAlarmStrapService` — writes alarm schedule to strap via a BLE command
- `SmartAlarmManager` + `SmartAlarmTriggerManager` — orchestrate the alarm lifecycle
- `SmartAlarmDiagnosticManager` + `SmartAlarmDiagnosticService` — diagnostics/logging
- `LogHapticsManager` — manages haptic feedback on strap side (distinct from phone UIImpactFeedbackGenerator)
- `WakeWindow` — defines the earliest/latest acceptable wake time range
- `StrapDrivenAlarmSetEventData` — event payload for alarm set confirmation

The strap receives the alarm schedule and fires the haptic vibration **independently** — it does not need the phone to be connected at wake time.

## NOOP reverse-engineering findings (2026-06-11)

**Source:** `NoopApp/noop` — `Packages/WhoopProtocol/Sources/WhoopProtocol/HapticPayloads.swift`

NOOP has fully reverse-engineered the WHOOP 5.0/MG haptic + alarm wire format. All commands use the puffin frame envelope (CRC16-Modbus header) — `puffinCommandFrame()` in `Framing.swift`.

### Buzz — RUN_HAPTIC_PATTERN_MAVERICK — cmd `0x13` (19)

```
Payload: 12 bytes
[0x01]                          // REVISION_1
[0x2F, 0x98, 0x00, 0x00,       // waveformEffects (confirmed waveform pair)
 0x00, 0x00, 0x00, 0x00]
[0x00, 0x00]                    // loopControlForEffects u16 LE = 0
[loops]                         // overallWaveformLoopControl (1 = buzz once, 2 = twice, etc.)
```

**CONFIRMED on real MG hardware.** The Breathe screen uses 1 loop inhale, 2 loops exhale. The Interval Timer uses 3 loops (WORK), 1 loop (REST), 5 loops (done).

Note: inner record = `[type=35, seq, cmd=0x13] + payload` = 15 bytes → padded to 16 (4-byte boundary required by puffin framing).

### SET_ALARM_TIME — cmd `0x42` (66) — REVISION_4

```
Payload: 20 bytes
[0x04]                          // REVISION_4
[alarmId]                       // typically 0x01
[s0, s1, s2, s3]               // epoch seconds u32 LE
[ss0, ss1]                      // subseconds u16 LE: (ms % 1000) * 32768 / 1000
[0x2F, 0x98, 0x00, 0x00,       // haptic waveformEffects (same pair as buzz)
 0x00, 0x00, 0x00, 0x00]
[0x00, 0x00]                    // loopControl u16 LE = 0
[0x07]                          // overallLoop = 7
[30]                            // duration = 30 s
```

**Status: EXPERIMENTAL.** Strap ACKed the command on hardware. **Wake-fire event not yet captured** — `STRAP_DRIVEN_ALARM_EXECUTED` has not been observed by NOOP or Goose.

### DISABLE_ALARM — cmd `0x45` (69)

```
Payload: 2 bytes
[0x02, 0xFF]    // REVISION_2, alarmId=0xFF (disable all)
```

### RUN_ALARM — cmd `0x44` (68)

```
Payload: 2 bytes
[0x02, alarmId]    // REVISION_2, fire stored alarm now
```

## Open questions / RE still needed

### STRAP_DRIVEN_ALARM_EXECUTED event — UNKNOWN
This is the only missing piece. When the strap fires the alarm autonomously, it presumably sends an event back on the notification characteristic. Format is unknown.

**RE plan (prerequisite task before alarm implementation phase):**
1. Arm the alarm for T+2 minutes via `SET_ALARM_TIME` command
2. Start BTSnoop HCI capture (`tshark` at `/opt/homebrew/bin/tshark`)
3. Wait for the strap to fire
4. Filter the capture for handle `0x0022` or `0x0027` packets after the alarm fires
5. Identify the event type byte and payload layout

This is a single focused session (~30 min). Should be planned as a standalone task before the alarm implementation phase begins.

### GET_ALL_HAPTICS_PATTERN — cmd `0x3F` (63)
Already catalogued in `commands.rs`. Send this command to get the full list of available waveform pattern IDs from the WHOOP 5.0. Could reveal additional patterns beyond `[47, 152]`.

## Goose current state (verified 2026-06-11)

**Already implemented in Swift:**
- `AlarmCommandKind` enum — `GooseBLEClient.swift:637`
- `AlarmHapticsPattern` struct with exact documented payload — `GooseBLEClient.swift:612`
- `writeAlarmCommand()` — writes SET_ALARM_TIME, GET_ALARM_TIME, RUN_ALARM, DISABLE_ALARM
- ACK parse for alarm responses
- `GooseBLEClient+UserActions.swift` — user-facing alarm wiring

**Still missing:**
1. `buzz(loops: UInt8)` — the simple notification haptic (cmd `0x13`) for Breathe/Intervals (see `haptic-buzz-primitive.md`)
2. `STRAP_DRIVEN_ALARM_EXECUTED` (event 57, `protocol.rs:891`) — event named but inbound payload field-level parse is partial
3. Smart alarm UI — confirmation/cancel feedback in the Sleep Coach view

## Implementation plan

### Step 1 — buzz(loops:) primitive
See `haptic-buzz-primitive.md`. Shared prerequisite with Breathe + Interval Timer.

### Step 2 — Event-57 payload RE
RE `StrapDrivenAlarmSetEventPacketRev1/Rev3` via BTSnoop:
1. Arm alarm for T+2 min via existing `writeAlarmCommand()`
2. Capture with tshark at `/opt/homebrew/bin/tshark`
3. Identify inbound payload layout: `[Rev:u8][Type:u8][Epoch:u32][AlarmId][DurationSeconds][HapticsPattern][Padding]`
4. Add field-level parser to `strap_events.rs`

### Step 3 — Smart alarm UI
In existing Sleep Coach view: show confirmation when alarm is armed, cancel button, fire notification on `STRAP_DRIVEN_ALARM_EXECUTED`.

## Files to modify

- `GooseSwift/GooseBLEClient+Commands.swift` — add `buzz(loops:)` (Step 1)
- `Rust/core/src/strap_events.rs` (or protocol.rs) — event-57 field parser (Step 2)
- Sleep Coach UI views — confirmation/cancel (Step 3)

## Related seeds

- `noop-feature-import.md` — full NOOP feature import plan (Breathe, Intervals, CSV import, etc.) — buzz wire-up is shared prerequisite
