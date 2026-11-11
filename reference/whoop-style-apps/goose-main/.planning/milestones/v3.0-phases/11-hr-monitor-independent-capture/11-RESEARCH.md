# Phase 11: HR Monitor Independent Capture — Research

**Researched:** 2026-06-05
**Domain:** Swift / SwiftUI — BLE capture lifecycle, `GooseAppModel` extension patterns
**Confidence:** HIGH (all findings verified directly from codebase source files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add `startHRMonitorCapture()` to `GooseAppModel` (in `GooseAppModel+HealthCapture.swift`). Does NOT gate on `ble.connectionState == "ready"`. Gates only on `ble.hrConnectionState == "connected"`. Matching `stopHRMonitorCapture(reason:)`. Existing `startHealthPacketCapture(mode:duration:source:)` is UNCHANGED.
- **D-02:** Auto-start on `hrConnectionState → "connected"`, auto-stop on `hrConnectionState → "disconnected"`. Mirror the `scheduleAutoStartHealthPacketCaptureIfNeeded()` pattern. Source string: `"auto.hr_monitor_connected"`. Parallel to WHOOP capture (both may be active simultaneously).
- **D-03:** Add case `.hrMonitor` to `HealthPacketCaptureMode` enum in `HealthPacketCaptureTypes.swift`. Mode processes only standard GATT HR frames (2A37). Does NOT require K2/K20/K47 WHOOP packets. Guards checking `.walk` or `.physiology` must NOT apply to `.hrMonitor` sessions.
- **D-04:** Upload payload — `device_class: "HR_MONITOR"` already exists. Verify BPM/RR frames written during `.hrMonitor` capture are included in upload. Confirm upload filter does not gate on WHOOP session.

### Claude's Discretion

None specified.

### Deferred Ideas (OUT OF SCOPE)

None specified.
</user_constraints>

---

## Summary

Phase 11 adds independent HR monitor BLE capture to `GooseAppModel`. The existing architecture already handles HR monitor notifications end-to-end: `GooseBLEHRMonitorManager` fires `onNotification` callbacks through the same path as WHOOP, `GooseNotificationEvent.rustDeviceType` returns `"HR_MONITOR"` for characteristic `2A37`, and the upload service already tags HR monitor payloads with `device_class: "HR_MONITOR"`. The only missing pieces are: (1) a new `.hrMonitor` case on `HealthPacketCaptureMode`, (2) a `startHRMonitorCapture()` / `stopHRMonitorCapture(reason:)` method pair without the WHOOP gate, and (3) an observer on `ble.$hrConnectionState` that calls those methods automatically.

**Primary recommendation:** Add `.hrMonitor` to the enum, add the method pair to `GooseAppModel+HealthCapture.swift`, wire the observer in `GooseAppModel+Lifecycle.swift` alongside `handleBLEConnectionStateChange`, and verify `shouldWriteCapturedFrame` returns `true` for `.hrMonitor` mode (it already does — the throttle only applies to `.walk`).

The upload path requires zero changes: `triggerUpload(for:deviceEvent:)` already uses `deviceEvent.rustDeviceType` which resolves to `"HR_MONITOR"` for 2A37 frames, and `GooseUploadService.buildUploadPayload` already emits `device_class: "HR_MONITOR"` for any non-GEN4/GOOSE device type.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HR monitor BLE lifecycle (connect/disconnect) | `GooseBLEHRMonitorManager` (BLE queue) | `GooseBLEClient` (@Published state) | CB delegate methods live on the BLE callback queue; state surfaced to `GooseBLEClient` via `DispatchQueue.main.async` |
| Capture session lifecycle | `GooseAppModel` (@MainActor) | `GooseRustBridge` (background) | `startHRMonitorCapture` / `stopHRMonitorCapture` follow the existing @MainActor pattern; the Rust `capture.start_session` / `capture.finish_session` calls happen inline (synchronous bridge, but called from methods that run on @MainActor) |
| Frame routing / ingest | `GooseAppModel+NotificationPipeline` (`notificationIngestQueue`) | `CaptureFrameWriteQueue` (background) | `onNotification` fires from the BLE queue; `notificationIngestQueue.async` reassembles and routes |
| Frame persistence | Rust core via `CaptureFrameWriteQueue` | — | All SQLite inserts go through the Rust bridge |
| Upload trigger | `GooseAppModel+Upload` (@MainActor) | `GooseUploadService` (detached Task) | Upload fires after each successful write batch |
| Mode classification | `HealthPacketCaptureMode` enum | `ActiveHealthPacketCapture` struct | Mode determines `targetFamilies`, `statusPrefix`, `initialTargetSummary` |

---

## Research Findings

### Q1 — `startHealthPacketCapture` signature and `ActiveHealthPacketCapture` creation

**Verified from:** `GooseSwift/GooseAppModel+HealthCapture.swift`

The primary internal method:

```swift
// GooseAppModel+HealthCapture.swift line 81
func startHealthPacketCapture(
  mode: HealthPacketCaptureMode,
  duration: TimeInterval,
  source: String
) {
  guard ble.connectionState == "ready" else { ... }   // ← WHOOP gate — line 87
  guard activeHealthPacketCapture == nil else { ... }  // ← guard duplicate — line 92

  let sessionID = "ios.health-packet-capture.\(UUID().uuidString)"
  let startedAt = Date()
  // ... Rust capture.start_session call ...
  activeHealthPacketCapture = ActiveHealthPacketCapture(
    sessionID: sessionID,
    startedAt: startedAt,
    mode: mode,
    importedFrameCount: 0
  )
  // ... UI state resets, requestStreamsForActiveCapture, scheduleTimeout ...
}
```

`ActiveHealthPacketCapture` is a plain `struct` (no class, no actor):

```swift
// HealthPacketCaptureTypes.swift line 83
struct ActiveHealthPacketCapture {
  let sessionID: String
  let startedAt: Date
  let mode: HealthPacketCaptureMode
  var importedFrameCount: Int
}
```

**Implication for D-01:** `startHRMonitorCapture()` must skip the `ble.connectionState == "ready"` guard (line 87) and replace it with `guard ble.hrConnectionState == "connected"`. It must NOT skip the `activeHealthPacketCapture == nil` guard — that guard prevents duplicate starts for the same slot. HR monitor capture occupies `activeHealthPacketCapture`, so a second call while one is running should be rejected the same way.

**Critical:** The existing `stopHealthPacketCapture(reason:)` method has walk/physiology-specific cleanup (lines 185-225):

```swift
if capture.mode == .walk {
  ble.stopMovementHeartRateCapture()
} else if capture.mode == .physiology {
  ble.stopPhysiologySignalCapture()
}
```

For `.hrMonitor` mode, neither `ble.stopMovementHeartRateCapture()` nor `ble.stopPhysiologySignalCapture()` should be called — HR monitor frames flow passively via GATT notifications, no stream command is needed to stop them. The `stopHRMonitorCapture(reason:)` method should therefore call `rust.request("capture.finish_session", ...)` directly without delegating to `stopHealthPacketCapture`.

---

### Q2 — Auto-start pattern: `scheduleAutoStartHealthPacketCaptureIfNeeded`

**Verified from:** `GooseSwift/GooseAppModel+HealthCapture.swift` lines 503-538, `GooseAppModel+Lifecycle.swift` lines 98-130

The existing WHOOP auto-start is a **polling retry loop with a 1-second delay**, NOT a Combine subscriber:

```swift
// GooseAppModel+HealthCapture.swift line 503
func scheduleAutoStartHealthPacketCaptureIfNeeded() {
  guard autoStartHealthPacketCaptureOnReady || ... else { return }
  autoStartHealthPacketCaptureWorkItem?.cancel()
  let workItem = DispatchWorkItem { [weak self] in
    Task { @MainActor in self?.attemptAutoStartHealthPacketCapture() }
  }
  autoStartHealthPacketCaptureWorkItem = workItem
  DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: workItem)
}

func attemptAutoStartHealthPacketCapture() {
  // checks connectionState == "ready", retries up to 120 times
  if ble.connectionState == "ready" { ... start ... return }
  guard attempt < 120 else { ... timeout ... return }
  scheduleAutoStartHealthPacketCaptureIfNeeded()   // ← reschedule
}
```

This pattern polls because the WHOOP `connectionState` requires a full GATT service discovery and session handshake — it does not transition to `"ready"` immediately on connect. 

For `.hrMonitor`, the situation is different: `hrConnectionState` becomes `"connected"` in `GooseBLEHRMonitorManager.centralManager(_:didConnect:)` (line 162), then immediately posts to `DispatchQueue.main.async { owner?.hrConnectionState = "connected" }`. The state is already final when the main-thread notification fires. **A Combine `sink` on `ble.$hrConnectionState` or an `onConnectionStateChange`-style callback is the correct pattern — no polling required.**

The `ble.onConnectionStateChange` callback (set up in `GooseAppModel.init`, line 358) delivers WHOOP states to `handleBLEConnectionStateChange`. There is **no equivalent `onHRConnectionStateChange` callback** on `GooseBLEClient` today. The implementation must either:

1. Add `var onHRConnectionStateChange: ((String) -> Void)?` to `GooseBLEClient` and fire it from `GooseBLEHRMonitorManager.centralManager(_:didConnect:)` / `didDisconnectPeripheral`, then handle it in `GooseAppModel.init` (analogous to the existing `onConnectionStateChange`). **This is the cleanest approach and mirrors the established pattern exactly.**
2. Or subscribe to `ble.$hrConnectionState` using Combine in `GooseAppModel` (requires storing a `AnyCancellable`). SwiftUI views already use `.onChange(of: ble.hrConnectionState)` but `GooseAppModel` itself has no Combine subscriptions visible in the read files.

**Recommendation:** Option 1 (new `onHRConnectionStateChange` callback on `GooseBLEClient`). It matches the WHOOP pattern precisely and avoids introducing Combine into `GooseAppModel`.

---

### Q3 — `CaptureMode` type

**Verified from:** `GooseSwift/HealthPacketCaptureTypes.swift`

`CaptureMode` is named `HealthPacketCaptureMode` in the actual codebase (the CONTEXT.md uses "CaptureMode" as an informal alias). It is a `String`-backed `enum`:

```swift
// HealthPacketCaptureTypes.swift line 4
enum HealthPacketCaptureMode: String {
  case walk
  case temperature
  case physiology
}
```

It has four computed properties: `purpose`, `targetFamilies`, `initialTargetSummary`, and `statusPrefix`. Adding `.hrMonitor` requires implementing all four.

**New case definition to add:**

```swift
case hrMonitor

// purpose
case .hrMonitor: return "standard_gatt_hr_monitor_capture"

// targetFamilies
case .hrMonitor: return ["embedded_heart_rate"]
// (HR_MONITOR frames parse to "embedded_heart_rate" family — same as walk mode's HR family,
//  but the device type routes them to the standard GATT 2A37 parse path, not K-packet path)

// initialTargetSummary
case .hrMonitor: return "frames 0 | BPM 0 | RR 0"

// statusPrefix
case .hrMonitor: return "Capturing HR monitor"
```

**Important:** The `targetFamilies` array is stored in the Rust bridge `capture.start_session` provenance. The existing code uses `mode.targetFamilies` as the `target_families` arg. For `.hrMonitor` the value is informational only (no stream gating in the Rust layer has been observed).

---

### Q4 — HR frame data callbacks and flow into `GooseAppModel`

**Verified from:** `GooseSwift/GooseBLEClient+HRMonitor.swift` lines 222-244, `GooseSwift/GooseAppModel+NotificationPipeline.swift` lines 704-738

The HR data flow is already fully wired:

1. `GooseBLEHRMonitorManager.peripheral(_:didUpdateValueFor:)` (line 222) fires on the BLE queue.
2. It creates a `GooseNotificationEvent` with `serviceUUID: "180D"`, `characteristicUUID: "2A37"`.
3. It calls `owner?.onNotification?(event)` — the same callback used by WHOOP notifications.
4. It also calls `owner?.handleStandardHeartRate(...)` for live HR display.

In `GooseAppModel.init` (line 342):
```swift
ble.onNotification = { [weak self] event in
  Task { @MainActor [weak self] in
    self?.handleNotification(event)
  }
}
```

In `notificationIngestResult(for:)` (line 704):
```swift
// HR monitor 0x2A37 payloads are standard GATT bytes — bypass WHOOP reassembly.
if event.rustDeviceType == "HR_MONITOR" {
  let frameHex = event.value.hexString
  return NotificationIngestResult(event: event, frames: [NotificationFrame(hex: frameHex)], ...)
}
```

`event.rustDeviceType` is computed from `characteristicUUID`:
```swift
// GooseBLETypes.swift line 75
var rustDeviceType: String {
  let normalizedUUID = characteristicUUID.replacingOccurrences(of: "-", with: "").lowercased()
  if normalizedUUID == "2a37" || normalizedUUID.hasPrefix("00002a37") {
    return "HR_MONITOR"
  }
  ...
}
```

**The entire BLE→SQLite path already works for HR monitor frames.** The only issue is line 8 in `handleNotification`:

```swift
let captureImportActive = activeHealthPacketCapture != nil || activeActivityPersistence != nil
```

When `captureImportActive` is `false` (no capture active), the code at line 25 skips `importCapturedFrames` entirely and calls only `handleNotificationIngestResultWithoutCapture`. This means: **frames are only written to SQLite when `activeHealthPacketCapture != nil`**. Adding `.hrMonitor` capture via `startHRMonitorCapture()` sets `activeHealthPacketCapture`, so frames will be written. No changes to the pipeline routing code are needed.

---

### Q5 — Upload payload filter: does it gate on WHOOP session?

**Verified from:** `GooseSwift/GooseUploadService.swift`, `GooseSwift/GooseAppModel+Upload.swift`

The upload path is **device-ID-keyed, not session-keyed**. `performUpload` calls:

```swift
rust.request(
  method: "upload.get_recent_decoded_streams",
  args: [
    "database_path": databasePath,
    "device_id": deviceID.uuidString,
    "since_ts": sinceTimestamp.timeIntervalSince1970,
  ]
)
```

There is **no `session_id` filter** in the upload query. It fetches all decoded streams for a given `device_id` since the timestamp. The upload is triggered from two places:

1. **Manual upload** (`triggerManualUpload`): iterates WHOOP device _and_ HR monitor device separately (lines 25-44). HR upload is triggered when `hrManager.hrConnectionState != "disconnected"` — meaning it only fires when the HR monitor is currently connected. This is a **latent limitation** for D-04: if the HR monitor disconnects before the user triggers upload, the HR monitor upload for that session will not fire from the manual path.

2. **Auto-upload after write batch** (`triggerUpload(for:deviceEvent:)`): fires after every successful frame write batch, using `deviceEvent.rustDeviceType` and `deviceEvent.deviceID`. For HR monitor frames, `deviceEvent.rustDeviceType == "HR_MONITOR"` and `deviceEvent.deviceID == hrPeripheral.identifier`. This path fires automatically and does not require the HR monitor to still be connected. **This is the correct path for D-04.**

**D-04 verdict:** The auto-upload path (`triggerUpload`) works correctly for `.hrMonitor` frames because it fires per-write-batch from within `handleCaptureFrameWriteResult`. No upload code changes are needed. The manual upload trigger has the connected-only limitation but that is pre-existing behaviour and out of scope for this phase.

---

### Q6 — Threading: @MainActor constraints

**Verified from:** `GooseSwift/GooseAppModel+HealthCapture.swift`, `GooseSwift/GooseAppModel+Lifecycle.swift`

All `GooseAppModel` methods are implicitly `@MainActor` (the class is declared `@MainActor final class GooseAppModel`). The existing call sites confirm:

- `handleBLEConnectionStateChange` runs on `@MainActor` (called via `Task { @MainActor in ... }` from `ble.onConnectionStateChange`).
- `startHealthPacketCapture` and `stopHealthPacketCapture` are called from `@MainActor`.
- The Rust bridge call `rust.request("capture.start_session", ...)` inside `startHealthPacketCapture` is synchronous and blocks the calling thread. This is acceptable because `start_session` is a lightweight SQLite insert with no heavy computation. The existing code accepts this pattern throughout.

**`startHRMonitorCapture()` and `stopHRMonitorCapture(reason:)` must be `@MainActor`.** No threading changes are required — they follow the same pattern as the existing methods.

The new `onHRConnectionStateChange` callback (if added to `GooseBLEClient`) must hop to `@MainActor` before calling `startHRMonitorCapture()`, matching the existing pattern:
```swift
ble.onHRConnectionStateChange = { [weak self] state in
  Task { @MainActor in
    self?.handleHRConnectionStateChange(state)
  }
}
```

---

## Architecture Patterns

### Notification → Capture Flow (existing, no changes needed)

```
GooseBLEHRMonitorManager           BLE queue
  └─ didUpdateValueFor (2A37)
       ├─ owner?.onNotification?(event)      ──── fires on BLE queue
       └─ owner?.handleStandardHeartRate(...)     ──── live HR display

GooseAppModel.init sets:
  ble.onNotification = { Task { @MainActor in handleNotification(event) } }

handleNotification(@MainActor)
  captureImportActive = activeHealthPacketCapture != nil   ← KEY FLAG
  notificationIngestQueue.async {
    notificationIngestResult(for:)            ── nonisolated, BG queue
      → if rustDeviceType == "HR_MONITOR":
          bypass WHOOP reassembly, return 1 frame per notification
    → if captureImportActive:
        DispatchQueue.main.async { handleNotificationIngestResult(result) }
          → importCapturedFrames(frames, event:)
              → CaptureFrameWriteQueue (Rust bridge, background)
                  → SQLite insert
                  → triggerUpload(for:deviceEvent:)
                        → GooseUploadService.upload(deviceID:deviceType:sinceTimestamp:)
                              → upload.get_recent_decoded_streams (device_id filter, no session filter)
                              → POST /v1/ingest-decoded with device_class:"HR_MONITOR"
  }
```

### `startHRMonitorCapture()` pattern (to implement)

```swift
// GooseAppModel+HealthCapture.swift — new method
func startHRMonitorCapture(source: String = "auto.hr_monitor_connected") {
  ble.record(source: "health.packet_capture", title: "hr_monitor.start.requested", body: "source=\(source)")
  guard ble.hrConnectionState == "connected" else {   // ← no WHOOP gate
    healthPacketCaptureStatus = "HR monitor not connected. State: \(ble.hrConnectionState)"
    return
  }
  guard activeHealthPacketCapture == nil else {
    ble.record(level: .debug, source: "health.packet_capture", title: "hr_monitor.start.skipped", body: "capture already active")
    return
  }
  // … identical session creation to startHealthPacketCapture(mode: .hrMonitor, …) …
  // No duration timeout: HR monitor capture runs until disconnect
  // No requestStreamsForActiveCapture call: frames arrive passively via GATT notifications
}
```

### `stopHRMonitorCapture(reason:)` pattern (to implement)

```swift
// GooseAppModel+HealthCapture.swift — new method
func stopHRMonitorCapture(reason: String = "hr_monitor_disconnected") {
  healthPacketCaptureTimeoutWorkItem?.cancel()
  flushCaptureFrameEnqueueUpdates()
  guard let capture = activeHealthPacketCapture, capture.mode == .hrMonitor else {
    ble.record(level: .debug, source: "health.packet_capture", title: "hr_monitor.stop.skipped", body: reason)
    return
  }
  do {
    _ = try rust.request(
      method: "capture.finish_session",
      args: [ "database_path": ..., "session_id": capture.sessionID, ... ]
    )
    activeHealthPacketCapture = nil
    // … status update …
    // No ble.stopMovementHeartRateCapture() — HR monitor needs no stream stop command
    // No ble.stopPhysiologySignalCapture() — same reason
  } catch { ... }
}
```

### `handleHRConnectionStateChange` observer (to implement)

```swift
// GooseAppModel+Lifecycle.swift — new method
func handleHRConnectionStateChange(_ state: String) {
  if state == "connected" {
    startHRMonitorCapture(source: "auto.hr_monitor_connected")
  } else if state == "disconnected" {
    stopHRMonitorCapture(reason: "hr_monitor_disconnected")
  }
}
```

Wired in `GooseAppModel.init`:
```swift
ble.onHRConnectionStateChange = { [weak self] state in
  Task { @MainActor in self?.handleHRConnectionStateChange(state) }
}
```

And `GooseBLEClient` needs:
```swift
var onHRConnectionStateChange: ((String) -> Void)?
```

Fired from `GooseBLEHRMonitorManager` after the main-thread dispatch in `didConnect` / `didDisconnectPeripheral`, or from `GooseBLEClient` in a `didSet` on `hrConnectionState` (simpler — avoids modifying `GooseBLEHRMonitorManager`):
```swift
// GooseBLEClient.swift — add didSet to @Published var hrConnectionState
@Published var hrConnectionState: String = "disconnected" {
  didSet {
    guard oldValue != hrConnectionState else { return }
    onHRConnectionStateChange?(hrConnectionState)
  }
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame routing for 2A37 | Custom routing logic | Existing `notificationIngestResult` + `rustDeviceType` | Already handles HR_MONITOR bypass path |
| Session persistence | Direct SQLite writes | Existing `rust.request("capture.start_session")` / `"capture.finish_session"` | Rust bridge owns the schema |
| Upload triggering | Manual upload calls | Existing `triggerUpload(for:deviceEvent:)` in `handleCaptureFrameWriteResult` | Fires automatically per write batch; already device-ID-keyed |
| Connection state observation | Combine publisher or timer | `didSet` on `@Published var hrConnectionState` + existing callback pattern | No new dependencies; matches established `onConnectionStateChange` pattern |

---

## Common Pitfalls

### Pitfall 1: Calling `stopHealthPacketCapture` instead of `stopHRMonitorCapture`
**What goes wrong:** `stopHealthPacketCapture` contains walk/physiology-specific teardown (`ble.stopMovementHeartRateCapture()`, `finishAutoDetectedActivityIfActive`). Calling it for `.hrMonitor` session would attempt to stop streams that were never started, and would fire activity-detection cleanup unnecessarily.
**How to avoid:** Implement a dedicated `stopHRMonitorCapture(reason:)` that checks `capture.mode == .hrMonitor` and only calls `rust.request("capture.finish_session", ...)`.
**Warning signs:** Log entry `health.packet_capture / finish.deferred_active_activity` appearing for HR monitor stops — means the walk guard incorrectly matched.

### Pitfall 2: Forgetting that `captureImportActive` gates frame writes
**What goes wrong:** Frames arrive via `onNotification` but are silently discarded if `activeHealthPacketCapture == nil` at the time `handleNotification` is called (line 8 captures this flag synchronously on @MainActor before dispatching to `notificationIngestQueue`).
**How to avoid:** Ensure `startHRMonitorCapture()` sets `activeHealthPacketCapture` _before_ any frames arrive. Because connect and stream setup are sequential (GATT subscribe → notifications), this is safe in practice.
**Warning signs:** Frame count stays at 0 after connect despite HR notifications visible in BLE log.

### Pitfall 3: `shouldWriteCapturedFrame` throttle for `.hrMonitor`
**What goes wrong:** `shouldWriteCapturedFrame` (line 309) throttles writes when `activeHealthPacketCapture?.mode == .walk`. For `.hrMonitor`, the guard `guard !fullRateCaptureActive, activeHealthPacketCapture?.mode == .walk else { return true }` means `true` is returned for `.hrMonitor` (it's not `.walk`), so **all frames are written at full rate**. This is correct and requires no changes.
**Action:** No fix needed; document in plan tasks as verified.

### Pitfall 4: `requestStreamsForActiveCapture` switch exhaustiveness
**What goes wrong:** `requestStreamsForActiveCapture(reason:)` (line 337) has a `switch capture.mode` with three cases. Adding `.hrMonitor` without extending the switch causes a compile error.
**How to avoid:** Add `case .hrMonitor: break` (or a no-op path) — HR monitor frames arrive passively via GATT notifications without a BLE stream command.

### Pitfall 5: `stopHealthPacketCapture` mode-specific guards not covering `.hrMonitor`
**What goes wrong:** `stopHealthPacketCapture` (line 160) has logic that checks `capture.mode == .walk` to defer stop when an active workout is running. This guard does not apply to `.hrMonitor` sessions. If someone calls `stopHealthPacketCapture` on an `.hrMonitor` session (wrong path), it might correctly stop it but call the wrong BLE teardown.
**How to avoid:** The `stopHRMonitorCapture` method guards on `capture.mode == .hrMonitor` before proceeding. Do not reuse `stopHealthPacketCapture` for `.hrMonitor`.

---

## Code Examples

### `HealthPacketCaptureMode` — complete new case (all computed properties required)

```swift
// Source: GooseSwift/HealthPacketCaptureTypes.swift (current pattern)
enum HealthPacketCaptureMode: String {
  case walk
  case temperature
  case physiology
  case hrMonitor     // ← NEW

  var purpose: String {
    switch self {
    // ... existing ...
    case .hrMonitor:
      return "standard_gatt_hr_monitor_capture"
    }
  }

  var targetFamilies: [String] {
    switch self {
    // ... existing ...
    case .hrMonitor:
      return ["embedded_heart_rate"]
    }
  }

  var initialTargetSummary: String {
    switch self {
    // ... existing ...
    case .hrMonitor:
      return "frames 0 | BPM 0 | RR 0"
    }
  }

  var statusPrefix: String {
    switch self {
    // ... existing ...
    case .hrMonitor:
      return "Capturing HR monitor"
    }
  }
}
```

### `GooseBLEClient` — `hrConnectionState` with callback `didSet`

```swift
// Source: GooseSwift/GooseBLEClient.swift (current: line 26, no didSet)
var onHRConnectionStateChange: ((String) -> Void)?

@Published var hrConnectionState: String = "disconnected" {
  didSet {
    guard oldValue != hrConnectionState else { return }
    onHRConnectionStateChange?(hrConnectionState)
  }
}
```

### `GooseAppModel.init` — wiring the HR connection observer

```swift
// Source: GooseSwift/GooseAppModel.swift init — analogous to line 358
ble.onHRConnectionStateChange = { [weak self] state in
  Task { @MainActor in
    self?.handleHRConnectionStateChange(state)
  }
}
```

---

## Package Legitimacy Audit

Phase 11 installs **no external packages**. All code is pure Swift using existing project dependencies. Audit skipped.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Cargo built-in (`cargo test`) |
| Config file | `Rust/core/Cargo.toml` |
| Quick run command | `cargo test -p goose-core 2>&1 \| tail -20` |
| Full suite command | `cargo test -p goose-core` |

Note: No Swift test target is detected in the Xcode project. All automated tests are Rust-side integration tests in `Rust/core/tests/`. Phase 11 is pure Swift — functional validation must be manual (device-side BLE test) or via UI automation.

### Phase Requirements → Test Map

| Req | Behaviour | Test Type | Automated Command | File Exists? |
|-----|-----------|-----------|-------------------|-------------|
| D-01 | `startHRMonitorCapture()` gates on `hrConnectionState == "connected"`, not `connectionState == "ready"` | Unit (Swift logic) | Manual — no Swift test target | N/A |
| D-01 | `activeHealthPacketCapture` is set with mode `.hrMonitor` | Manual | Device BLE test | N/A |
| D-02 | Auto-start fires on `hrConnectionState → "connected"` | Manual | Device connect/disconnect cycle | N/A |
| D-02 | Auto-stop fires on `hrConnectionState → "disconnected"` | Manual | Device disconnect | N/A |
| D-03 | `.hrMonitor` enum case compiles with all 4 computed properties | Build | `xcodebuild build` | N/A — added by this phase |
| D-03 | `shouldWriteCapturedFrame` returns `true` for `.hrMonitor` (no throttle) | Code review | Visual inspection | N/A |
| D-04 | Upload payload contains `device_class: "HR_MONITOR"` for HR frames | Existing unit tests cover `buildUploadPayload` | `cargo test` / Swift test if exists | Check `GooseSwiftTests` |

### Wave 0 Gaps

- No Swift unit test target detected. If `GooseSwiftTests` exists in the Xcode project, verify a test for `buildUploadPayload` with `deviceType != "GEN4" && != "GOOSE"` already passes.
- No new test files required for this phase (changes are wiring-only Swift, no algorithmic logic).

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V2 Authentication | No | Upload auth unchanged (Bearer token from Keychain) |
| V3 Session Management | No | Capture session IDs are UUID-based, already implemented |
| V4 Access Control | No | No new endpoints or user-facing permissions |
| V5 Input Validation | No | HR frame bytes routed through existing `notificationIngestResult`; no new user input |
| V6 Cryptography | No | No new crypto operations |

**Threat pattern:** Malformed 2A37 BLE payloads. Mitigated by existing `notificationIngestResult` which returns an empty frame for empty values (`guard !frameHex.isEmpty`). The Rust parser receives the raw hex and handles decode errors without crashing.

---

## Environment Availability

Phase 11 is pure Swift + existing Rust bridge. No new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode + iOS 26.0 SDK | All Swift changes | Assumed present (project builds today) | 26.0 | — |
| HR monitor device (GATT 2A37) | Manual functional testing | Physical device required | — | BLE simulator not available for real GATT |

**Missing dependencies with no fallback:**
- Physical BLE HR monitor device required for end-to-end functional validation of D-02 (auto-start/stop on real connect/disconnect cycle).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `"embedded_heart_rate"` is the correct `targetFamilies` label for standard GATT 2A37 frames in the Rust parser | Q1 / Code Examples | Wrong family label stored in session provenance; no functional impact on capture or upload |
| A2 | `didSet` on `@Published var hrConnectionState` is a safe pattern (no double-fire, no race with CBCentralManager callback queue) | Architecture Patterns | Could fire twice if `GooseBLEHRMonitorManager` sets the property before the main-thread dispatch and the main-thread dispatch fires again; mitigation: `guard oldValue != hrConnectionState` in `didSet` |
| A3 | The upload Rust method `upload.get_recent_decoded_streams` fetches HR BPM/RR frames by device_id without filtering on capture session or WHOOP connection | Q5 / D-04 | If the Rust method has an undiscovered session or device_class filter, HR monitor frames might not appear in upload streams |

**Confirmed NOT assumed:**
- `HealthPacketCaptureMode` is `String`-backed enum with exactly three current cases — VERIFIED from `HealthPacketCaptureTypes.swift`.
- `ActiveHealthPacketCapture` is a `struct` with `mode: HealthPacketCaptureMode` — VERIFIED.
- `rustDeviceType == "HR_MONITOR"` for characteristic `2A37` — VERIFIED from `GooseBLETypes.swift`.
- `captureImportActive` gates frame writes — VERIFIED from `GooseAppModel+NotificationPipeline.swift` line 8.
- `shouldWriteCapturedFrame` returns `true` for non-`.walk` modes — VERIFIED from line 311.
- Upload does not filter on WHOOP session ID — VERIFIED from `GooseUploadService.performUpload`.

---

## Open Questions

1. **`upload.get_recent_decoded_streams` Rust implementation**
   - What we know: The Swift call passes `device_id` and `since_ts`. No Swift-side session filter.
   - What's unclear: Whether the Rust layer has any device_class or session gating that would exclude HR monitor frames.
   - Recommendation: D-04 verification task in the plan should include a Rust-side grep: `grep -n "HR_MONITOR\|device_class\|hr_monitor" Rust/core/src/upload.rs` (or equivalent module).

2. **`didSet` on `@Published` in `GooseBLEClient`**
   - What we know: `GooseBLEClient` is declared `@unchecked Sendable` and mutations arrive from both `@MainActor` (Swift UI) and the BLE callback queue (via `DispatchQueue.main.async { self?.hrConnectionState = ... }`).
   - What's unclear: Whether `@Published var` with a `didSet` that calls a closure is safe when set from `DispatchQueue.main.async` (which is main-actor equivalent).
   - Recommendation: Because `GooseBLEHRMonitorManager` already dispatches `hrConnectionState` writes to `DispatchQueue.main.async`, the `didSet` closure fires on the main thread. The `Task { @MainActor in ... }` wrapper in `GooseAppModel.init` is therefore safe.

---

## Sources

### Primary (HIGH confidence — verified from codebase)

- `GooseSwift/HealthPacketCaptureTypes.swift` — `HealthPacketCaptureMode` enum, all 4 computed properties, `ActiveHealthPacketCapture` struct
- `GooseSwift/GooseAppModel+HealthCapture.swift` — `startHealthPacketCapture(mode:duration:source:)` full signature, `stopHealthPacketCapture(reason:)`, `scheduleAutoStartHealthPacketCaptureIfNeeded`, `attemptAutoStartHealthPacketCapture`, `shouldWriteCapturedFrame`
- `GooseSwift/GooseAppModel+Lifecycle.swift` — `handleBLEConnectionStateChange`, callback wiring pattern
- `GooseSwift/GooseAppModel+NotificationPipeline.swift` — `captureImportActive` gate, `notificationIngestResult` HR_MONITOR bypass, `importCapturedFrames`, `shouldWriteCapturedFrame`
- `GooseSwift/GooseAppModel+Upload.swift` — `triggerManualUpload` (HR monitor branch), `triggerUpload(for:deviceEvent:)`
- `GooseSwift/GooseUploadService.swift` — `performUpload` (no session filter), `buildUploadPayload` (device_class HR_MONITOR)
- `GooseSwift/GooseBLEClient+HRMonitor.swift` — `didConnect`, `didDisconnectPeripheral`, `didUpdateValueFor` data callback
- `GooseSwift/GooseBLEClient.swift` — `@Published var hrConnectionState`, `@Published var connectionState`
- `GooseSwift/GooseBLETypes.swift` — `GooseNotificationEvent.rustDeviceType` computed property
- `GooseSwift/GooseAppModel.swift` — `init`, all `@Published` and stored properties, callback wiring

### Secondary (MEDIUM confidence)

- `GooseSwift/HRMonitorView.swift` — confirms `.onChange(of: ble.hrConnectionState)` is used in views; Combine not used in `GooseAppModel`
- `GooseSwift/MoreDataStore.swift` — confirms `ble.$hrConnectionState.removeDuplicates()` Combine publisher used in a store, not in `GooseAppModel`

---

## Metadata

**Confidence breakdown:**
- `HealthPacketCaptureMode` enum shape: HIGH — read directly from source
- `startHealthPacketCapture` signature and `ActiveHealthPacketCapture` struct: HIGH — read directly
- Auto-start pattern (polling vs Combine): HIGH — code flow traced completely
- HR frame ingest path: HIGH — all four steps verified
- Upload path (no session filter): HIGH — `performUpload` args verified
- Threading model: HIGH — `@MainActor` class declaration verified, callback hop pattern verified
- `targetFamilies` value for `.hrMonitor`: MEDIUM/ASSUMED — `"embedded_heart_rate"` inferred from walk mode, not confirmed from Rust parse output

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable codebase; no fast-moving dependencies)
