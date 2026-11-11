---
name: realtime-strain-accumulation
description: Continuous Swift-side strain accumulator for live workout feedback — mirrors WHPBiotelemetry pattern
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add a Swift-side strain accumulator that updates in real time during an active workout session, equivalent to `WHPBiotelemetry`'s strain accumulator in WHOOP v5.37.0.

## Problem

Currently: strain is computed by the Rust bridge at the end of a session (or on explicit request). During a live workout, the user sees a static or stale strain value — there is no real-time accumulation.

WHOOP resets the accumulator on session start/end (`WHPBiotelemetry - resetStrainAccumulator`) and accumulates incrementally as each HR sample arrives via BLE.

## What to build

A `GooseStrainAccumulator` actor/class that:
1. Subscribes to live HR samples from `WhoopDataSignalPipeline`
2. Applies the strain-per-HR-interval formula already implemented in Rust (`Rust/core/src/` — strain computation module)
3. Publishes `@Published var liveSessionStrain: Double` on `GooseAppModel` (or `HealthDataStore`)
4. Resets on `activitySession.start()` and freezes on `activitySession.stop()`

The formula is already known (Ghidra-confirmed coefficients in v5.0). The Swift accumulator mirrors the Rust logic incrementally rather than batch.

## User-visible impact

During an active workout, the strain card updates continuously instead of showing the pre-session value. Matches WHOOP UX.

## Research basis

`WHPBiotelemetry` + `WHPBiotelemetryDelegate` + `WHPBiotelemetrySample` in WHOOP v5.37.0.
`com.whoop.biotelemtry.strainaccumulator` notification name found in binary.
`resetStrainAccumulator` method confirmed via Ghidra string search.

## Files to touch

- New: `GooseSwift/GooseStrainAccumulator.swift`
- Modify: `GooseSwift/GooseAppModel+ActivityRecording.swift` (wire accumulator to session lifecycle)
- Modify: `GooseSwift/WhoopDataSignalPipeline.swift` (feed samples to accumulator)
- Modify: relevant workout UI view (display `liveSessionStrain`)
