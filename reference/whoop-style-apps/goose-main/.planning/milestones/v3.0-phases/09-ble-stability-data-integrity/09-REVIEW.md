---
phase: 09-ble-stability-data-integrity
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - GooseSwift/CaptureFrameWriteQueue.swift
  - GooseSwift/ConnectionView.swift
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/GooseAppModel+Lifecycle.swift
  - GooseSwift/GooseBLEClient.swift
  - GooseSwift/GooseBLEClient+CentralDelegate.swift
  - GooseSwift/GooseBLEClient+Commands.swift
  - GooseSwift/GooseBLEClient+HRMonitor.swift
  - GooseSwift/GooseBLEReconnect.swift
  - Rust/core/Cargo.toml
  - Rust/core/src/bridge.rs
  - Rust/core/src/capture_import.rs
  - Rust/core/src/perf_budget.rs
  - Rust/core/src/store.rs
  - Rust/core/tests/bridge_tests.rs
  - Rust/core/tests/capture_import_tests.rs
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The phase introduces: (1) a `ReconnectBackoff` exponential-backoff state machine for WHOOP BLE reconnection; (2) a `GooseBLEHRMonitorManager` with its own backoff cycle; (3) `activeDeviceID` propagation from Swift into the Rust `capture.import_frame_batch` call; (4) an FFI `catch_unwind` wrapper in `bridge.rs`; (5) `storage.compact_raw_evidence` calls at launch and after each write batch.

The Rust side is in good shape — `catch_unwind` is present and correct, `active_device_id` propagation reaches `store.set_capture_session_device_id`, and `panic = "unwind"` is set in the release profile. The Swift threading model contains three correctness defects worth blocking on, plus several quality issues.

---

## Critical Issues

### CR-01: `@Published` reconnect/connection state mutated off main thread via `stopReconnect` / `retryReconnect`

**File:** `GooseSwift/GooseBLEClient+Commands.swift:725-739`

**Issue:** `stopReconnect()` and `retryReconnect()` both dispatch their bodies onto `coreBluetoothQueue`. Inside those bodies they call `cancelReconnectCycle()`, `reconnectBackoff.reset()`, `updateReconnectState(...)`, and `scheduleNextReconnect(...)`. `updateReconnectState` mutates the `@Published var reconnectState` property **directly** — without a main-thread hop. All CB delegate handlers redirect to main via `dispatchCoreBluetoothDelegateToMainIfNeeded`, but these two public entry points bypass that pattern and can land on `coreBluetoothQueue`. Mutating an `@Published` property of an `ObservableObject` off the main thread is undefined behaviour in SwiftUI and triggers a `[Publishing changes from background threads is not allowed]` runtime warning in Xcode.

The same problem applies to `scheduleNextReconnect` when it calls `updateReconnectState` — it can be called from `coreBluetoothQueue` (e.g. from the `reconnectWorkItem` closure at line 717, which is posted to `coreBluetoothQueue`).

**Fix:**
```swift
// In updateReconnectState — add a main-thread guard:
func updateReconnectState(_ value: String) {
  if !Thread.isMainThread {
    DispatchQueue.main.async { [weak self] in self?.updateReconnectState(value) }
    return
  }
  let previous = reconnectState
  reconnectState = value
  if previous != value {
    record(source: "ble", title: "reconnect.state", body: value)
  }
}
```
Alternatively, dispatch all mutations inside `stopReconnect`/`retryReconnect` to main after the coreBluetoothQueue work.

---

### CR-02: `CaptureFrameWriteQueue` completion state (`pendingCompletion`, `pendingCompletionResult`, `completionFlushScheduled`) accessed without `stateLock`

**File:** `GooseSwift/CaptureFrameWriteQueue.swift:335-372`

**Issue:** `recordCompletion`, `scheduleCompletionFlush`, and `flushCompletion` are all called from `writeQueue` (the serial write queue), and they read/write `pendingCompletion`, `pendingCompletionResult`, and `completionFlushScheduled` without holding `stateLock`. This is safe *only if* all three functions are exclusively called on `writeQueue`. The `scheduleCompletionFlush` posts `flushCompletion` via `writeQueue.asyncAfter`, so `flushCompletion` does run on `writeQueue`. However `recordCompletion` is called directly from `flushNext` (which runs on `writeQueue`), so the serial-queue discipline holds today.

The defect is a latent one: `pendingCompletion` is **never cleared** after `flushCompletion` fires. After `flushCompletion` dispatches `completion(result)` to main and clears `pendingCompletionResult`, `pendingCompletion` still holds the old closure. If `scheduleCompletionFlush`'s `asyncAfter` fires again after a flush-due-to-error path, `flushCompletion` guards on `pendingCompletionResult` being non-nil (correct), but the retained closure is never released until a new `recordCompletion` call overwrites it. This creates an unintended strong reference cycle (the closure captures `self` of the caller) that persists until the next write batch.

**Fix:**
```swift
private func flushCompletion() {
  completionFlushScheduled = false
  guard let result = pendingCompletionResult, let completion = pendingCompletion else {
    return
  }
  pendingCompletionResult = nil
  pendingCompletion = nil   // <-- ADD THIS LINE
  DispatchQueue.main.async {
    completion(result)
  }
}
```

---

### CR-03: `nonisolated(unsafe) var frameReassemblyBuffers` is a data-race risk when BLE delivers concurrent notifications

**File:** `GooseSwift/GooseAppModel.swift:180`, `GooseSwift/GooseAppModel+NotificationPipeline.swift:808-860`

**Issue:** `frameReassemblyBuffers` is declared `nonisolated(unsafe) var` and mutated inside `gooseFrames(in:event:)`, which is a `nonisolated` function. `gooseFrames` is called from `notificationIngestQueue.async` blocks (line 14). If CoreBluetooth delivers two notifications concurrently (which it can when two notification characteristics fire back-to-back), two tasks on the serial `notificationIngestQueue` will run in sequence — but the `nonisolated` function can be invoked from *any* calling queue, and there is no serialisation guarantee across callers because `notificationIngestQueue` is not enforced as the only caller at the call site. The `nonisolated(unsafe)` annotation suppresses the Swift concurrency checker without providing thread safety.

In practice the current caller is always `notificationIngestQueue.async`, making this safe *today*, but the annotation removes the compile-time check that would catch future callers. If `gooseFrames` is ever called from another context (e.g. from an `@MainActor` path or a test), it silently introduces a data race on the `[String: Data]` dictionary.

**Fix:** Remove the `nonisolated(unsafe)` annotation. Make `frameReassemblyBuffers` an `@MainActor` property (matching `GooseAppModel`) or protect it with a dedicated lock used inside `gooseFrames`. Simpler: require `gooseFrames` to be called exclusively from `notificationIngestQueue` and remove the `nonisolated` attribute.

```swift
// Option A: remove nonisolated(unsafe), add a private lock
private let frameReassemblyLock = NSLock()
private var frameReassemblyBuffers: [String: Data] = [:]

// Inside gooseFrames, acquire frameReassemblyLock around all read/write access.
```

---

## Warnings

### WR-01: `activeDeviceID` read on `writeQueue` while written from `@MainActor` — no lock

**File:** `GooseSwift/CaptureFrameWriteQueue.swift:196, 285`

**Issue:** `activeDeviceID` is a plain `var` with no synchronisation (`internal` access, no `stateLock` protection). It is written from `@MainActor` via `GooseAppModel+Lifecycle.swift:102-107` and read from `writeQueue` inside `flushNext()` at line 285 (`activeDeviceID ?? NSNull()`). This is a benign data race under the current Swift memory model but will produce a Swift 6 strict-concurrency error and is technically undefined behaviour.

**Fix:**
```swift
// Make activeDeviceID stateLock-protected:
private var _activeDeviceID: String?
var activeDeviceID: String? {
  get { stateLock.withLock { _activeDeviceID } }
  set { stateLock.withLock { _activeDeviceID = newValue } }
}
```

---

### WR-02: `debugMenuCharacteristic` not cleared on Bluetooth power-off

**File:** `GooseSwift/GooseBLEClient+CentralDelegate.swift:82-97`

**Issue:** When Bluetooth powers off (`central.state != .poweredOn` branch), `activePeripheral` and `commandCharacteristic` are set to `nil` (lines 91-92), but `debugMenuCharacteristic` is not cleared. On the next BT power-on and reconnect, `processDiscoveredCharacteristics` may find a stale `debugMenuCharacteristic` pointing to a dead `CBCharacteristic` object from the previous connection. The same asymmetry exists for `debugMenuCharacteristic` in the `didDisconnectPeripheral` path (lines 278-282 clear `activeDescriptor`, `batteryLevelCharacteristic`, `batteryLevelStatusCharacteristic`, but not `debugMenuCharacteristic`).

**Fix:**
```swift
// In centralManagerDidUpdateState (power-off branch), add:
debugMenuCharacteristic = nil

// In didDisconnectPeripheral, add:
debugMenuCharacteristic = nil
```

---

### WR-03: `writeSensorStreamCommands` weak-captures `activePeripheral`/`commandCharacteristic` but does not re-validate state before write

**File:** `GooseSwift/GooseBLEClient+Commands.swift:430-448`

**Issue:** The staggered `DispatchQueue.main.asyncAfter` loop captures `activePeripheral` and `commandCharacteristic` as `weak` references, correctly guarding against use-after-free. However, the closure does not re-validate that the BLE connection is still in the `"ready"` state before calling `writeSensorStreamCommand`. If the device disconnects between the first and the last staggered command (up to 7 × 0.25s = 1.75s window), subsequent commands will be written to a peripheral that is no longer active — the write will silently fail at the CoreBluetooth layer without any error log or state update at the app level.

**Fix:**
```swift
DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak activePeripheral, weak commandCharacteristic] in
  guard
    let self,
    let activePeripheral,
    let commandCharacteristic,
    self.connectionState == "ready"   // <-- ADD THIS CHECK
  else {
    return
  }
  self.writeSensorStreamCommand(...)
}
```

---

### WR-04: `CaptureFrameWriteQueue.importTimingSummary` references `raw_hex_encode_us` — a field that does not exist in `CapturedFrameBatchTimingReport`

**File:** `GooseSwift/CaptureFrameWriteQueue.swift:473`

**Issue:** The timing summary string contains `"rawHex \(milliseconds("raw_hex_encode_us"))ms"`, but `CapturedFrameBatchTimingReport` (in `Rust/core/src/capture_import.rs:127-135`) has no `raw_hex_encode_us` field. The JSON returned by the bridge will never contain this key. `intValue(timing["raw_hex_encode_us"])` returns `nil`, so `milliseconds(...)` outputs `"0.0"` unconditionally. The diagnostic display is silently wrong — it always shows `rawHex 0.0ms` regardless of actual cost.

**Fix:** Remove `raw_hex_encode_us` from the summary string, or add the field to `CapturedFrameBatchTimingReport` on the Rust side if raw-hex encoding time is a metric worth tracking.

```swift
// Remove the rawHex segment:
return "total \(milliseconds("total_us"))ms | hex \(milliseconds("hex_decode_us"))ms | raw \(milliseconds("raw_insert_us"))ms | parse \(milliseconds("frame_parse_us"))ms | decoded \(milliseconds("decoded_insert_us"))ms | timeline \(milliseconds("timeline_us"))ms | compact \(milliseconds("raw_compaction_us"))ms"
```

---

## Info

### IN-01: `ReconnectBackoff.statusString` uses `attemptCount` after it has already been incremented

**File:** `GooseSwift/GooseBLEReconnect.swift:24-27`

**Issue:** `statusString` returns `"reconnecting (attempt \(attemptCount)/\(maxAttempts))"`. `attemptCount` is incremented inside `nextDelay()` *before* the status string is read in `scheduleNextReconnect`. So for the very first attempt `nextDelay()` sets `attemptCount = 1` and the UI shows `"reconnecting (attempt 1/10)"` — which is correct. This is intentional by the comment. However the `ConnectionView` hard-codes `"10 attempts"` in line 61 of `ConnectionView.swift` to match `maxAttempts = 10` from `GooseBLEReconnect.swift`. If `maxAttempts` is ever changed in one place but not the other, the string will be wrong. The two constants should share a single source of truth.

**Fix:** Expose `maxAttempts` from `ReconnectBackoff` and reference it in the view string interpolation, or move the message into `ReconnectBackoff` itself.

---

### IN-02: `GooseBLEHRMonitorManager.centralManagerDidUpdateState` is a no-op — BT unavailability not handled

**File:** `GooseSwift/GooseBLEClient+HRMonitor.swift:103-105`

**Issue:** `centralManagerDidUpdateState` is intentionally empty with a comment "State changes are informational; scanning starts only when explicitly requested." If the HR monitor peripheral's BT radio powers off while scanning or connected, the manager does not call `cancelHRReconnectCycle()`, does not clear `hrPeripheral`, and does not update the HR reconnect state. `didDisconnectPeripheral` will only fire if a connection was active, so a BT power-off during a scan leaves the manager in a stale "scanning" state with no recovery path until the next explicit user action.

**Fix:** Handle the power-off case similarly to the main `GooseBLEClient`:
```swift
func centralManagerDidUpdateState(_ central: CBCentralManager) {
  if central.state != .poweredOn {
    cancelHRReconnectCycle()
    reconnectBackoff.reset()
    pendingHRPeripheral = nil
    hrPeripheral = nil
    hrConnectionState = "disconnected"
    owner?.updateHRReconnectState("waiting for bluetooth")
  }
}
```

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
