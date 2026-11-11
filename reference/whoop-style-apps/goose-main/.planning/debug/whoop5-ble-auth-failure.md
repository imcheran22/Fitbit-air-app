---
status: resolved
trigger: "WHOOP 5.0 enters semi-connected state — 'Authentication failed' but HR notifications still flowing; auth retry timer stale-state unsafe; stream retry loop continues (writes blocked by connectionState guard, but not cancelled)"
created: 2026-06-14
updated: 2026-06-20
resolution: "Fixed in v13.0 Phase 92 (BUG-AUTH-01) — authRetryCount counter added; alert fires after 12 failures; disconnect+forget+reconnect flow implemented."
cross_ai_review: "Codex o4-mini: PARTIALLY_CONFIRMED. Gemini: PARTIALLY_CONFIRMED. Both corrected two claims."
---

## Symptoms

- **Reported by:** @andrii-tropin and @arrowcircle (GitHub Discussion #128)
- **Device:** WHOOP 5.0, firmware 50.38.1.0
- App shows "disconnected" / "Authentication failed — please reconnect WHOOP" in connection state
- Live HR notifications still arriving (58–72 bpm visible in UI)
- `stream.requested retry_7` visible in event log — retry loop running against failed auth
- `write.auth.retry.failed: insufficientAuthentication persists on FD4B0002-CCE1-4033-93CE-002D5875F58A`
- `clock.command.failed: GET_CLOCK timed out waiting for command response sequence N`
- All command buttons greyed out; Firmware visible (50.38.1.0) despite "Authentication failed" state
- Secondary: app crashes on "More → Developer → Raw export"

## Hypothesis

**H1 (confirmed):** The stream retry loop in `GooseAppModel+HealthCapture.swift` does not gate on connection state before retrying writes. After `authRetryPending` resets (2.5s window), subsequent stream retries re-trigger the auth failure cycle.

**H2 (confirmed):** HR characteristic (`2A37` standard GATT) does not require encryption — so notifications continue even after the command characteristic (`FD4B0002-CCE1-4033-93CE-002D5875F58A`) fails authentication. This explains the "semi-connected" appearance.

**H3 (likely):** WHOOP 5.0 requires BLE pairing (bonded + encrypted connection) for the proprietary command characteristic. The current retry path (2.5s delay → `updateConnectionState("Authentication failed")`) does not trigger or wait for iOS pairing handshake. The `user action required` message in the log suggests iOS is expecting a pairing confirmation that is never surfaced to the user.

## Evidence

### From screenshots (Discussion #128)

Event log at 12:48 and 13:10–13:11:
```
write.auth.retry.failed
  insufficientAuthentication persists on FD4B0002-CCE1-4033-93CE-002D5875F58A; user action required

clock.command.failed
  GET_CLOCK timed out waiting for command response sequence 98 / 120

stream.requested retry_7
  (health.packet_capture)

sensor.write.blocked
  Needs ready connection; current state Authentication failed — please reconnect WHOOP

connection.state
  Authentication failed — please reconnect WHOOP
```

Advanced panel shows:
- Firmware: 50.38.1.0
- Live HR: 58 bpm Now
- Connection: Authentication failed (truncated)
- Strap clock: GET_CLOCK timed out

### From source code

**`GooseBLEClient+PeripheralDelegate.swift` lines 328–358:**
```swift
if let attError = error as? CBATTError, attError.code == .insufficientAuthentication {
    if !authRetryPending {
        authRetryPending = true
        // schedules 2.5s delay then:
        self.updateConnectionState("Authentication failed — please reconnect WHOOP")
        self.record(..., title: "write.auth.retry.failed", ...)
        // Does NOT replay the write. Does NOT wait for pairing. Does NOT suppress further retries.
    }
}
```

**`GooseAppModel+HealthCapture.swift` lines 466–489:**
```swift
func scheduleMovementHeartRateStreamRetryIfNeeded() {
    guard activeHealthPacketCapture?.mode == .walk,
          healthPacketCaptureFrameCount == 0,
          healthPacketCaptureStreamRetryAttempt < 12 else { return }
    // schedules retry in 8s — NO check on ble.connectionState
}
```

The stream retry guard has NO check on `ble.isReady` / `connectionState`. It fires every 8s up to retry_12, each time calling `startMovementHeartRateCapture()` → write to command characteristic → `insufficientAuthentication` → `authRetryPending` fires → 2.5s → fails again. Loop repeats.

## Root Cause (revised after cross-AI review — Codex + Gemini both PARTIALLY_CONFIRMED)

Three compounding issues:

1. **Auth retry timer is stale-state unsafe — primary bug** (`GooseBLEClient+PeripheralDelegate.swift:332`):
   The `DispatchQueue.main.asyncAfter(deadline: .now() + 2.5)` closure has no `DispatchWorkItem` to cancel it, no generation token, and no peripheral identity check. It unconditionally calls `updateConnectionState("Authentication failed — please reconnect WHOOP")` regardless of whether:
   - The pairing completed successfully in the 2.5s window
   - A subsequent write succeeded
   - The peripheral disconnected and reconnected
   This is the direct cause of the stuck UI: iOS may complete pairing and the state returns to "ready", but the pending closure fires 2.5s later and overwrites it with "Authentication failed".

2. **Stream retry loop not cancelled on auth failure** (`GooseAppModel+HealthCapture.swift:466`, `handleBLEConnectionStateChange`):
   `scheduleMovementHeartRateStreamRetryIfNeeded()` has no connection-readiness guard. When auth failure hits, it keeps scheduling retries every 8s × 12. However (correction from original analysis): the actual writes are blocked by `guard connectionState == "ready"` in `writeSensorStreamCommands()` at `GooseBLEClient+Commands.swift:437`, so retries produce `sensor.write.blocked` log events rather than new `insufficientAuthentication` errors. The loop is noisy but not harmful to the BLE stack. `handleBLEConnectionStateChange` does not cancel `healthPacketCaptureStreamRetryWorkItem` on non-ready transitions — confirmed design gap.

3. **Original command frame not replayed after auth** (`GooseBLEClient+PeripheralDelegate.swift:332`):
   After `insufficientAuthentication`, iOS automatically prompts the pairing dialog on the first write attempt — the app does NOT need to replay to trigger pairing. However, the original write data is lost whether or not pairing succeeds; the app must replay the frame to complete the command. Current code emits an error instead of replaying — so commands remain permanently pending after auth.

## Correction to original analysis

❌ **Original claim:** "stream retries issue writes after auth failure and re-trigger insufficientAuthentication"
✅ **Correct:** stream retries are blocked at `writeSensorStreamCommands()` guard (`connectionState == "ready"`). They produce `sensor.write.blocked` log noise, not additional ATT errors.

❌ **Original claim:** "replaying the write is what triggers the iOS pairing dialog"
✅ **Correct:** the first write that returns `insufficientAuthentication` is the trigger. Replay is needed to complete the application command after pairing, not to initiate pairing.

## Fix Direction

1. **Gate stream retries on connection readiness** — in `scheduleMovementHeartRateStreamRetryIfNeeded()`, add `ble.isReady` (or `connectionState == "ready"`) to the guard. Cancel the retry work item when connection state transitions to failed.

2. **Replay the original write on auth retry** — CoreBluetooth requires the app to re-issue the exact write to trigger the pairing prompt. Store the pending write bytes before the first write and replay them in the 2.5s handler instead of just emitting an error.

3. **Cancel stream retry on auth failure** — when `updateConnectionState("Authentication failed...")` is called, cancel `healthPacketCaptureStreamRetryWorkItem` to stop the retry loop immediately.

## Related

- Discussion #128: https://github.com/tigercraft4/goose/discussions/128
- Characteristic UUID: `FD4B0002-CCE1-4033-93CE-002D5875F58A` (WHOOP proprietary command)
- Existing auth retry flag: `GooseBLEClient.swift:339` — `var authRetryPending = false`
- `isReady` computed property: `GooseBLEClient.swift:886`
