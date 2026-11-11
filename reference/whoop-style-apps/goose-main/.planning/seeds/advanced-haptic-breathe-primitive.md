---
name: advanced-haptic-breathe-primitive
description: AdvancedHaptic / HapticHeartbeat paced-vibration primitive — unblocks Breathe screen; wire run_haptics_pattern + get_all_haptics_pattern from commands.rs to Swift
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Wire the haptic pattern commands from `commands.rs` to Swift and RE the `HapticsPatternType` payload encoding. This unblocks the seeded Breathe HRV-biofeedback screen and Interval Timer, and opens the door to WHOOP's `AdvancedHaptic` paced-vibration mode that ties haptic cues to a live HR range.

## Current state

`Rust/core/src/commands.rs` already catalogues:
- `run_haptics_pattern` — run a selected haptic pattern by ID
- `stop_haptics` — stop active haptics
- `get_all_haptics_pattern` — query available patterns from strap

None of these are wired to Swift. `GooseBLEClient+Commands.swift` has no haptic-pattern calls. The simpler `run_haptic_pattern_maverick` (cmd `0x13`) payload is documented in `smart-alarm-strap-haptic.md` and confirmed on hardware — that's the immediate fix. This seed covers the richer pattern system.

## What WHOOP has (Ghidra — WhoopBiotelemetry framework)

Classes in `~/Desktop/ObjC_RESOLVED.txt`:
- `RunHapticsPatternCommandPacket` — encodes a pattern fire by ID
- `RunHapticsPatternOnHarvardCommandPacket` — Harvard (WHOOP 5.0/MG firmware variant) form of the same command
- `HapticsPatternType` — enum of pattern IDs (unknown values — this is what needs RE)
- `StrapHapticsPatternBLECommandACKType` — ACK variants for haptic commands
- `AdvancedHapticRange` — HR range object (`lowerBound`, `upperBound` in BPM)
- `HapticHeartbeat` — paced vibration tied to a `currentHeartbeatRange`
- `enableAdvancedHaptics` / `disableAdvancedHaptics` — toggle for the paced mode
- `LogHapticsManager` — strap-side haptics log (distinct from phone UIImpactFeedbackGenerator)

## RE gap — `HapticsPatternType` values unknown

The `get_all_haptics_pattern` command (already in `commands.rs`) would return the list of supported pattern IDs from a live WHOOP 5.0. This is a **one-command RE session**: send the command, read the response, map pattern IDs.

`AdvancedHapticRange` and `HapticHeartbeat` likely map to a mode flag on `RunHapticsPatternCommandPacket` or a separate command — needs Ghidra decompile of `enableAdvancedHaptics` to find the wire encoding.

## Prerequisite

`buzz(loops: UInt8)` — the basic cmd `0x13` notification haptic — is documented and extracted into its own seed: **`haptic-buzz-primitive.md`**. Implement that first. This seed covers the richer pattern system that builds on top.

## Implementation plan

### Step 1 — buzz(loops:) primitive
See `haptic-buzz-primitive.md`. ~2 hours, no RE.

### Step 2 — After `get_all_haptics_pattern` RE
- Send `get_all_haptics_pattern` to live WHOOP 5.0, parse response → `[PatternID: String]` map
- Implement `GooseBLEClient+Haptics.swift`: `runHapticsPattern(id:)`, `stopHaptics()`
- Route Harvard vs non-Harvard variant on firmware version string (from `GET_HELLO` response, `pay[93]==50` sentinel)

### Step 3 — After `AdvancedHaptic` RE
- Wire `enableAdvancedHaptics(range: AdvancedHapticRange)` — enables the strap's own HR-zone buzzing
- This makes the Breathe screen's HRV coaching more autonomous: the strap buzzes when HR drifts outside coherence range without phone involvement

## Files to create

- (update) `GooseSwift/GooseBLEClient+Commands.swift` — `buzz(loops:)` (Step 1)
- `GooseSwift/GooseBLEClient+Haptics.swift` — pattern system (Step 2+3)

## Related seeds

- `noop-feature-import.md` — Breathe screen + Interval Timer depend on `buzz(loops:)` from Step 1
- `smart-alarm-strap-haptic.md` — shares the `puffinCommandFrame` + `notificationBuzz` payload; alarm RE tasks overlap
