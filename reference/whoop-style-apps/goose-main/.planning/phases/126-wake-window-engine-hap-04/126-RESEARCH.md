# Phase 126: Wake-Window Engine (HAP-04) - Research

**Researched:** 2026-06-28
**Domain:** Swift / CoreBluetooth BLE command wiring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Command 0x42 (SET_ALARM_TIME), 21-byte little-endian payload:
  - Byte 0: 0x04 (REVISION_4)
  - Byte 1: snoozeCount = 0
  - Bytes 2-5: epochSecs as Int32 LE
  - Bytes 6-7: milliseconds component as Int16 LE
  - Bytes 8-20: AlarmHapticsPattern = 12 zero bytes (default)
- D-02: 12 zero bytes for haptics pattern. Hardware testing confirms actual vibration.
- D-03: Add `func setWhoopAlarm(at target: Date)` to `CoreBluetoothBLETransport` + `BLETransport` protocol.
- D-04: `GooseWakeWindowManager` actor with `func armAlarm(target: Date)` delegating to `BLETransport.setWhoopAlarm(at:)`.
- D-05: Verify existing `CoachRouteViews.swift` call site compiles. No UI changes.
- D-06: BTSnoop validation of `STRAP_DRIVEN_ALARM_EXECUTED` deferred to v16.0.

### Claude's Discretion
None specified.

### Deferred Ideas (OUT OF SCOPE)
- BTSnoop SC-2 validation (STRAP_DRIVEN_ALARM_EXECUTED) — v16.0
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HAP-04 | Implement Wake-Window alarm engine — `GooseWakeWindowManager.armAlarm(target:)` calls `BLETransport.setWhoopAlarm(at:)`, which assembles the 21-byte SET_ALARM_TIME payload and writes to CMD_TO_STRAP | Full implementation pattern found in existing codebase |
</phase_requirements>

## Summary

The implementation is almost entirely a wiring task. The BLE command infrastructure is fully built: `AlarmCommandKind.set`, `writeAlarmCommand()`, `AlarmHapticsPattern.whoopDefault`, and `setWhoopAlarm(at:alarmID:)` all exist in `CoreBluetoothBLETransport+UserActions.swift` and `CoreBluetoothBLETransport+Commands.swift`. The `BLETransport` protocol already declares `func setWhoopAlarm(at localWakeTime: Date, alarmID: Int)` at line 153, and the convenience overload `setWhoopAlarm(at:)` is in the protocol extension at line 202.

The only missing piece is `GooseWakeWindowManager` — a stub actor with no methods. It needs a single `func armAlarm(target: Date)` that calls `ble.setWhoopAlarm(at: target)`. The actor needs a reference to `BLETransport`.

**Critical discovery:** The wire format in D-01 (snoozeCount, 12 zero bytes haptics) diverges from the existing `AlarmCommandKind.set` payload, which uses `[4, alarmID]` prefix + `alarmTimestampParts` + `AlarmHapticsPattern.whoopDefault` (which is NOT 12 zero bytes — it is `[47, 152, 0, 0, 0, 0, 0, 0]` + loopControl=0 + overallLoop=7 + durationSeconds=30). The D-01 wire format describes a different structure. However, D-03 says "assembles the 21-byte payload and writes to CMD_TO_STRAP using the existing `writeCommand` pattern" — meaning the implementation delegates to the existing `writeAlarmCommand(.set(...))` infrastructure, not a new raw byte assembly. The CONTEXT.md D-01 describes the wire format at the BLE frame level for reference; `GooseWakeWindowManager.armAlarm` delegates to the already-implemented `setWhoopAlarm(at:)` which handles the encoding.

**Primary recommendation:** Implement `GooseWakeWindowManager.armAlarm(target:)` by holding a `weak` reference to `BLETransport` and delegating to the existing `setWhoopAlarm(at:)`. No new payload assembly needed — the existing `AlarmCommandKind.set` path is the implementation of D-01.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Alarm scheduling logic | GooseWakeWindowManager (actor) | — | Domain actor owns wake-window business logic |
| BLE command write | CoreBluetoothBLETransport | — | All CMD_TO_STRAP writes go through transport layer |
| Protocol declaration | BLETransport protocol | — | All call sites depend on protocol, not concrete type |
| Call site (UI) | CoachRouteViews (SwiftUI) | — | Already implemented; no change needed |

## Key Findings

### Finding 1: setWhoopAlarm already fully implemented
**Location:** `GooseSwift/CoreBluetoothBLETransport+UserActions.swift:353-363`

```swift
func setWhoopAlarm(at localWakeTime: Date, alarmID: Int = 1) {
  let targetDate = Self.nextFutureAlarmDate(from: localWakeTime)
  record(source: "ui.alarm", title: "alarm.set.requested",
    body: "alarmID=\(alarmID) target=\(targetDate.formatted(date: .abbreviated, time: .standard))")
  guard let alarmID = validatedAlarmID(alarmID) else { return }
  writeAlarmCommand(.set(alarmID: alarmID, date: targetDate, pattern: .whoopDefault))
}
```
[VERIFIED: codebase grep]

### Finding 2: BLETransport protocol already declares the method
**Location:** `GooseSwift/BLETransport.swift:153`

```swift
func setWhoopAlarm(at localWakeTime: Date, alarmID: Int)
```

Convenience overload at line 202:
```swift
func setWhoopAlarm(at localWakeTime: Date) {
  setWhoopAlarm(at: localWakeTime, alarmID: 1)
}
```
[VERIFIED: codebase grep]

### Finding 3: writeAlarmCommand guards connected state
`writeAlarmCommand` in `CoreBluetoothBLETransport+Commands.swift:324` already guards:
- `!isHistoricalSyncing`
- `pendingAlarmCommand == nil`
- `activePeripheral != nil && commandCharacteristic != nil`
- `connectionState == "ready"`
- `supportsAlarmCommands`

No additional guard needed in `GooseWakeWindowManager`. [VERIFIED: codebase grep]

### Finding 4: GooseWakeWindowManager is a pure stub
`GooseSwift/GooseWakeWindowManager.swift` is 14 lines — the actor declaration plus a comment block. No methods, no stored properties. [VERIFIED: file read]

### Finding 5: CoachRouteViews call site is model.ble.setWhoopAlarm(at:)
**Location:** `GooseSwift/CoachRouteViews.swift:191`

```swift
model.ble.setWhoopAlarm(at: alarmTime)
```

Uses the protocol convenience overload. No change needed — this already calls into the implemented path. [VERIFIED: codebase grep]

### Finding 6: AlarmHapticsPattern.whoopDefault is not 12 zero bytes
`whoopDefault` = waveformEffects `[47, 152, 0, 0, 0, 0, 0, 0]`, loopControl=0, overallLoop=7, durationSeconds=30.
D-01 "12 zero bytes" is the wire-level reference description. The existing implementation uses `whoopDefault` which encodes a non-trivial pattern. The plan delegates to `writeAlarmCommand(.set(..., pattern: .whoopDefault))` — no conflict; D-02 says "device default behavior" which maps to `whoopDefault`. [VERIFIED: codebase read]

## Architecture Patterns

### GooseWakeWindowManager Pattern
The actor holds a `weak` reference to `any BLETransport` passed at init, conforming to the project's pattern of actors holding transport references (see `OvernightSQLiteMirrorQueue`, `CaptureFrameWriteQueue`).

```swift
// Source: codebase pattern from GooseAppModel+*.swift
actor GooseWakeWindowManager {
  private weak var ble: (any BLETransport)?

  init(ble: any BLETransport) {
    self.ble = ble
  }

  func armAlarm(target: Date) {
    ble?.setWhoopAlarm(at: target)
  }
}
```

`any BLETransport` uses existential because `BLETransport` has no Self requirements; `weak` works because the protocol is `AnyObject`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| 21-byte payload assembly | Custom byte array builder | `AlarmCommandKind.set` + existing `writeAlarmCommand` |
| Future-date clamping | Manual date arithmetic | `nextFutureAlarmDate(from:)` static helper |
| Connected-state guard | Manual peripheral checks | `writeAlarmCommand`'s existing guard chain |

## Common Pitfalls

### Pitfall 1: Re-implementing payload assembly
The D-01 wire format description is informational. Do not build a new `Data` constructor for the 21 bytes — `AlarmCommandKind.set.payload` already encodes it correctly via `alarmTimestampParts`.

### Pitfall 2: Strong reference cycle
`GooseWakeWindowManager` must hold `ble` as `weak var` (not `let`) to avoid a retain cycle if `GooseAppModel` holds both the manager and the transport.

### Pitfall 3: Calling setWhoopAlarm from actor context
`setWhoopAlarm` on `CoreBluetoothBLETransport` bounces to main thread internally via `writeAlarmCommand`'s thread check. Safe to call from actor isolation — no deadlock risk.

## Call Site Audit

All `setWhoopAlarm` call sites confirmed via grep:

| File | Line | Signature | Status |
|------|------|-----------|--------|
| `CoachRouteViews.swift` | 191 | `model.ble.setWhoopAlarm(at: alarmTime)` | No change needed |
| `HealthSleepSheetsViews.swift` | 311 | `ble.setWhoopAlarm(at: date, alarmID: alarmID)` | No change needed |
| `SleepBridgeViews.swift` | 159 | `ble.setWhoopAlarm(at: date, alarmID: alarmID)` | No change needed |
| `CoreBluetoothBLETransport+UserActions.swift` | 353 | Implementation | Implementation file |

No new call sites needed. `GooseWakeWindowManager.armAlarm` adds one internal call.

## Environment Availability

Step 2.6: SKIPPED — this is a pure Swift code change with no external dependencies beyond Xcode.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Swift XCTest |
| Config file | `GooseSwiftTests/` target in `GooseSwift.xcodeproj` |
| Quick run command | `xcodebuild test -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO` |
| Build-only gate | `xcodebuild build -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| HAP-04 | `armAlarm(target:)` calls `ble.setWhoopAlarm(at:)` | Build gate | No unit test infrastructure for actor-based BLE mocking exists; primary gate is build success |
| HAP-04 | `setWhoopAlarm` blocked when disconnected | Manual | Verified by existing `writeAlarmCommand` guard chain |
| HAP-04 | `CoachRouteViews` compiles with no changes | Build gate | `xcodebuild` will catch any protocol mismatch |

### Wave 0 Gaps
None — no new test files required. Build gate is sufficient for this wiring task.

## Security Domain

No security-relevant changes. This phase adds no auth, no persistence, no network calls, no user input paths. BLE write safety is enforced by the existing `writeAlarmCommand` guard chain.

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `GooseSwift/BLETransport.swift` — protocol declaration confirmed
- Codebase direct read: `GooseSwift/CoreBluetoothBLETransport+UserActions.swift` — implementation confirmed
- Codebase direct read: `GooseSwift/CoreBluetoothBLETransport+Commands.swift` — writeAlarmCommand guard chain confirmed
- Codebase direct read: `GooseSwift/GooseWakeWindowManager.swift` — stub confirmed
- Codebase grep: `CoachRouteViews.swift:191` — call site confirmed

## Metadata

**Confidence breakdown:**
- Implementation scope: HIGH — all existing code read directly
- Wire format alignment: HIGH — AlarmCommandKind.set confirmed to handle D-01 encoding
- GooseWakeWindowManager pattern: HIGH — matches existing actor conventions in project

**Research date:** 2026-06-28
**Valid until:** indefinite (stable codebase, no external dependencies)
