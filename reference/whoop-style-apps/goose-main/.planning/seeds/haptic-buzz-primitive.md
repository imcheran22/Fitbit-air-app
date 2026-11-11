---
name: haptic-buzz-primitive
description: Wire buzz(loops:) for WHOOP 5.0 — cmd 0x13 in puffin frame — shared prerequisite for Breathe, Interval Timer, smart alarm, and advanced haptics
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add `func buzz(loops: UInt8)` to `GooseBLEClient+Commands.swift`. This is a single Swift function that unblocks four separate features: Breathe screen, Interval Timer, smart alarm UI feedback, and the advanced haptic pattern system.

This seed exists to avoid repeating the same implementation detail across four other seeds. All four reference this one.

## Implementation (no RE needed — confirmed on real MG hardware)

**Command:** `RUN_HAPTIC_PATTERN_MAVERICK` — cmd `0x13` (19)

**Payload — 12 bytes:**
```
[0x01]                                    // REVISION_1
[0x2F, 0x98, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]  // waveformEffects
[0x00, 0x00]                              // loopControlForEffects u16 LE = 0
[loops]                                   // overallWaveformLoopControl
```

**Frame wrapping:** puffin envelope (CRC16-Modbus header):
```swift
// inner record = [type=35, seq, cmd=0x13] + payload = 15 bytes → padded to 16
let frame = puffinCommandFrame(cmd: 0x13, seq: nextSeq(), payload: buzzPayload)
activePeripheral.writeValue(frame, for: commandCharacteristic, type: writeType)
```

**`loops` values used by features:**
| Caller | loops | Meaning |
|---|---|---|
| Breathe — inhale | 1 | one pulse |
| Breathe — exhale | 2 | two pulses |
| Interval Timer — WORK | 3 | strong cue |
| Interval Timer — REST | 1 | soft cue |
| Interval Timer — countdown | 1 | tick |
| Interval Timer — done | 5 | long cue |

## File to modify

- `GooseSwift/GooseBLEClient+Commands.swift` — add `func buzz(loops: UInt8)` (~15 lines)

**Effort: 2 hours.**

## Dependents (seeds that need this first)

- `noop-feature-import.md` — Breathe screen + Interval Timer
- `smart-alarm-strap-haptic.md` — alarm UI feedback
- `advanced-haptic-breathe-primitive.md` — pattern system (Step 2+ builds on buzz)
