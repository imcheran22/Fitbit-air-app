# Phase 9: BLE Stability & Data Integrity - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 8 (1 new + 7 modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `GooseSwift/GooseBLEReconnect.swift` | utility struct | event-driven | `GooseSwift/GooseBLEClient.swift` (ReconnectBackoff fields) | role-match |
| `GooseSwift/GooseBLEClient+Commands.swift` | BLE controller | event-driven | self (lines 693–750) | exact — refactor in place |
| `GooseSwift/GooseBLEClient+HRMonitor.swift` | BLE controller | event-driven | `GooseBLEClient+Commands.swift` lines 693–750 | exact |
| `GooseSwift/GooseBLEClient.swift` | observable state | — | self (lines 7–70) | exact — add @Published |
| `GooseSwift/CaptureFrameWriteQueue.swift` | service / writer | batch | self (lines 260–315) | exact — extend args |
| `GooseSwift/GooseAppModel.swift` | coordinator | request-response | `GooseAppModel+Upload.swift` (background bridge dispatch) | role-match |
| `GooseSwift/ConnectionView.swift` | view | request-response | self (lines 1–144) | exact — add Section rows |
| `Rust/core/src/bridge.rs` | bridge | request-response | self — existing method entries & `goose_bridge_handle_json` | exact |

---

## Pattern Assignments

### `GooseSwift/GooseBLEReconnect.swift` (new file — utility struct)

**Analog:** No existing struct in the codebase; pattern derived from value-type conventions in the project.

**Imports pattern** — follow `GooseBLEClient+HRMonitor.swift` lines 1–3:
```swift
import CoreBluetooth
import Foundation
```

**Core pattern — value type struct with mutating methods:**
```swift
// Convention: value types (struct) for state bags; no class needed.
// Pattern: struct with stored var + computed property + mutating func.
// Reference: GooseBLEClient.swift lines 7–70 for field naming style.
struct ReconnectBackoff {
  var attemptCount: Int = 0
  let baseDelay: TimeInterval = 1.0
  let maxDelay: TimeInterval = 60.0
  let maxAttempts: Int = 10

  /// Returns the delay before the next attempt, or nil if maxAttempts exhausted.
  mutating func nextDelay() -> TimeInterval? {
    guard attemptCount < maxAttempts else { return nil }
    let delay = min(baseDelay * pow(2.0, Double(attemptCount)), maxDelay)
    attemptCount += 1
    return delay
  }

  mutating func reset() {
    attemptCount = 0
  }

  var statusString: String {
    "reconnecting (attempt \(attemptCount)/\(maxAttempts))"
  }
}
```

**Threading note:** `ReconnectBackoff` is a value type. Both callers (`GooseBLEClient`, `GooseBLEHRMonitorManager`) own an independent copy. Mutations happen exclusively on `coreBluetoothQueue`. No lock required.

---

### `GooseSwift/GooseBLEClient+Commands.swift` (modified — WHOOP reconnect refactor)

**Analog:** `GooseSwift/GooseBLEClient+Commands.swift` lines 693–750 — `attemptAutomaticReconnect()`

**Existing pattern to refactor** (lines 693–750):
```swift
// GooseSwift/GooseBLEClient+Commands.swift lines 693–750
func attemptAutomaticReconnect(reason: String) {
  guard let central, central.state == .poweredOn else {
    updateReconnectState("waiting for bluetooth")
    return
  }
  guard activePeripheral == nil else {
    updateReconnectState("already connected")
    return
  }
  guard !autoReconnectInFlight else {          // ← REPLACE with ReconnectBackoff guard
    record(level: .debug, source: "ble", title: "reconnect.skipped", body: "already in flight")
    return
  }
  // ... rest of method
}
```

**Target pattern — DispatchQueue.asyncAfter for timed retry:**
```swift
// Pattern: asyncAfter on the existing coreBluetoothQueue, mirroring
// how GooseBLEHRMonitorManager schedules main-thread UI updates.
// Reference: GooseBLEClient+HRMonitor.swift line 82.
coreBluetoothQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
  self?.attemptAutomaticReconnect(reason: "backoff_retry")
}
```

**State update pattern — @Published from background** (existing, lines 695–705):
```swift
// Existing helper — use consistently for all reconnect state strings.
updateReconnectState("reconnecting (attempt \(backoff.attemptCount)/\(backoff.maxAttempts))")
// updateReconnectState dispatches to main via Task { @MainActor in ... }
```

**On circuit breaker exhaustion:**
```swift
// Pattern: set @Published state, then stop. Do not clear rememberedDeviceID.
updateReconnectState("reconnection failed after \(backoff.maxAttempts) attempts")
reconnectBackoff.reset()   // ready for manual "Try again"
```

---

### `GooseSwift/GooseBLEClient+HRMonitor.swift` (modified — FIX-03 backoff)

**Analog:** `GooseSwift/GooseBLEClient+Commands.swift` lines 693–750 — same structure applied here.

**Existing disconnect stub** (lines 94–101):
```swift
// GooseSwift/GooseBLEClient+HRMonitor.swift lines 94–101
func centralManager(
  _ central: CBCentralManager,
  didDisconnectPeripheral peripheral: CBPeripheral,
  error: Error?
) {
  hrConnectionState = "disconnected"
  hrPeripheral = nil        // ← nil BEFORE asyncAfter; capture peripheral locally first
}
```

**Target pattern — capture peripheral before nil, schedule retry:**
```swift
// CRITICAL: capture peripheral in a local before setting hrPeripheral = nil.
// Reference: RESEARCH.md Pitfall 4.
let disconnectedPeripheral = peripheral   // local capture for closure
hrPeripheral = nil
hrConnectionState = "disconnected"

if let delay = reconnectBackoff.nextDelay() {
  owner?.updateHRReconnectState(reconnectBackoff.statusString)
  central.asyncAfter(deadline: .now() + delay) { [weak self, disconnectedPeripheral] in
    self?.central?.connect(disconnectedPeripheral, options: nil)
  }
} else {
  owner?.updateHRReconnectState("reconnection failed after \(reconnectBackoff.maxAttempts) attempts")
  reconnectBackoff.reset()
}
```

**On successful connect** (existing lines 87–92 — add reset):
```swift
func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
  hrConnectionState = "connected"
  hrPeripheral = peripheral
  reconnectBackoff.reset()    // ← add this line
  peripheral.delegate = self
  peripheral.discoverServices([CBUUID(string: "180D")])
}
```

**Publishing hrReconnectState to ConnectionView:**
```swift
// Pattern: GooseBLEHRMonitorManager notifies owner via existing objectWillChange path.
// Reference: GooseBLEClient+HRMonitor.swift line 82–84.
DispatchQueue.main.async { [weak self] in
  self?.owner?.objectWillChange.send()
}
// Add @Published var hrReconnectState: String = "idle" to GooseBLEClient (lines 23 area).
```

---

### `GooseSwift/GooseBLEClient.swift` (modified — add @Published state)

**Analog:** `GooseSwift/GooseBLEClient.swift` lines 7–70 — existing @Published declarations.

**Pattern — add new @Published fields following existing style** (after line 23):
```swift
// GooseSwift/GooseBLEClient.swift — existing examples:
@Published var reconnectState = "idle"           // line 23 — WHOOP reconnect
// ADD alongside:
@Published var hrReconnectState: String = "idle" // HR monitor reconnect
@Published var reconnectAttemptCount: Int = 0    // for ConnectionView attempt counter
```

**Stored var for backoff** (not @Published — internal state on coreBluetoothQueue):
```swift
// Pattern: private stored var for queue-protected mutable state.
// Convention: GooseBLEClient uses GooseBLEHRMonitorManager reference (line 79 area).
var reconnectBackoff = ReconnectBackoff()
```

---

### `GooseSwift/CaptureFrameWriteQueue.swift` (modified — FIX-01 + FIX-05)

**Analog:** `GooseSwift/CaptureFrameWriteQueue.swift` lines 260–315 — existing bridge call.

**FIX-01 — add active_device_id to bridge args** (at lines 275–285):
```swift
// GooseSwift/CaptureFrameWriteQueue.swift lines 275–285 — existing args:
let report = try rust.request(
  method: "capture.import_frame_batch",
  args: [
    "database_path": databasePath,
    "parser_version": "goose-swift/live-notification",
    "include_timeline_rows": false,
    "compact_raw_payloads": false,
    "include_results": false,
    "frames": rows.map(\.bridgeObject),
    // ADD:
    "active_device_id": activeDeviceID ?? NSNull(),
  ]
)
```

**Reference for device_id arg pattern** (`GooseSwift/OvernightSQLiteMirrorQueue.swift` line 95):
```swift
"device_id": event.deviceID.uuidString   // ← reference pattern to replicate
```

**Add mutable property** (recommended integration point per RESEARCH.md Open Question #1):
```swift
// Property set by GooseAppModel when peripheral connects/disconnects.
// Avoids changing enqueue() signatures.
var activeDeviceID: String?
```

**FIX-05 — call compaction after each batch write** (after line 316 — after `recordCompletion`):
```swift
// Pattern: bridge call on existing background queue; never from @MainActor.
// Reference: existing rust.request call at lines 275–285.
if let deviceID = activeDeviceID {
  _ = try? rust.request(
    method: "storage.compact_raw_evidence",
    args: [
      "database_path": databasePath,
      "limit_bytes": 25_165_824,
    ]
  )
  // Compaction result logged via ble.record — but CaptureFrameWriteQueue
  // does not hold a ble reference. Log via completion callback or omit here;
  // GooseAppModel launch-time compaction covers the logging requirement (D-10).
}
```

---

### `GooseSwift/GooseAppModel.swift` (modified — FIX-05 launch compaction)

**Analog:** `GooseSwift/GooseAppModel.swift` lines 277–383 — existing `init` pattern.

**Background dispatch from init** (pattern used at lines 288–333 via Task closures):
```swift
// GooseAppModel.init is @MainActor. Bridge calls block calling thread.
// Pattern: DispatchQueue.global async for blocking work; dispatch results back.
// Reference: RESEARCH.md Pitfall 6.
DispatchQueue.global(qos: .utility).async { [weak self] in
  guard let self else { return }
  self.runStorageCompactionIfNeeded()
}
```

**Compaction method body pattern** — modelled on existing bridge call style in `GooseAppModel+Upload.swift`:
```swift
private func runStorageCompactionIfNeeded() {
  // Runs on background queue. Never call from @MainActor directly.
  guard let report = try? rust.request(
    method: "storage.compact_raw_evidence",
    args: [
      "database_path": HealthDataStore.defaultDatabasePath(),
      "limit_bytes": 25_165_824,
    ]
  ) else { return }

  let compactedRows = (report["compacted_rows"] as? Int) ?? 0
  let freedBytes = (report["freed_bytes"] as? Int) ?? 0
  if compactedRows > 0 {
    let mbFreed = String(format: "%.1f", Double(freedBytes) / 1_048_576)
    ble.record(source: "storage", title: "compact", body: "\(compactedRows) rows, \(mbFreed) MB freed")
  }
}
```

---

### `GooseSwift/ConnectionView.swift` (modified — FIX-02/FIX-03 UI + FIX-05 log)

**Analog:** `GooseSwift/ConnectionView.swift` lines 1–144 — existing Status Section and Actions Section.

**Existing Status Section pattern** (lines 19–28):
```swift
// GooseSwift/ConnectionView.swift lines 19–28
Section("Status") {
  LabeledContent("Bluetooth", value: ble.bluetoothState)
  LabeledContent("Connection", value: ble.connectionState)
  LabeledContent("Reconnect", value: ble.reconnectState)   // ← add attempt count here
  // ADD:
  LabeledContent("HR Reconnect", value: ble.hrReconnectState)
}
```

**Existing Actions Section pattern** (lines 30–63):
```swift
// GooseSwift/ConnectionView.swift lines 30–63
Section("Actions") {
  Button("Reconnect Remembered") { ble.reconnectRemembered() }
    .disabled(!ble.canReconnectRemembered)
  // ADD after existing reconnect button:
  Button("Retry Reconnect") { ble.retryReconnect() }
    .disabled(!ble.isReconnectFailed)
  Button("Stop Reconnect") { ble.stopReconnect() }
    .disabled(!ble.isReconnecting)
}
```

**Conditional display pattern** (existing style — use for failed state):
```swift
// Pattern: computed property returning conditional string, as per lines 124–143.
private var reconnectStatusValue: String {
  if ble.isReconnectFailed {
    return "Reconnection failed after \(ReconnectBackoff().maxAttempts) attempts"
  }
  return ble.reconnectState
}
```

---

### `Rust/core/src/bridge.rs` (modified — FIX-04 + FIX-05)

**Analog:** `Rust/core/src/bridge.rs` — existing entry point and match arm patterns.

**FIX-04 — wrap `goose_bridge_handle_json` in catch_unwind** (lines 2685–2706):
```rust
// Rust/core/src/bridge.rs lines 2685–2706 — current entry point:
#[unsafe(no_mangle)]
pub unsafe extern "C" fn goose_bridge_handle_json(request_json: *const c_char) -> *mut c_char {
    if request_json.is_null() {
        return response_to_c_string(&bridge_error("unknown", "null_request", "..."));
    }
    let request = match unsafe { CStr::from_ptr(request_json) }.to_str() {
        Ok(r) => r,
        Err(e) => return response_to_c_string(&bridge_error("unknown", "invalid_utf8", e.to_string())),
    };
    // CURRENT: string_to_c_string(handle_bridge_request_json(request))
    // REPLACE with:
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        string_to_c_string(handle_bridge_request_json(request))
    }));
    match result {
        Ok(ptr) => ptr,
        Err(payload) => {
            let message = payload.downcast_ref::<&str>().map(|s| s.to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic payload".to_string());
            response_to_c_string(&bridge_error("unknown", "panic", message))
        }
    }
}
```

**FIX-05 — new bridge method arm** — follow existing `match` arm pattern (line 2113 area):
```rust
// Rust/core/src/bridge.rs — existing arm pattern at lines 2113–2120:
"some.method" => request_args::<SomeArgs>(&request)
    .and_then(some_method_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

// ADD in handle_bridge_request_inner match:
"storage.compact_raw_evidence" => request_args::<StorageCompactRawEvidenceArgs>(&request)
    .and_then(storage_compact_raw_evidence_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

**FIX-05 — args struct + bridge function** (following `request_args` pattern at line 8033):
```rust
#[derive(Debug, Deserialize)]
struct StorageCompactRawEvidenceArgs {
    database_path: String,
    limit_bytes: i64,
}

fn storage_compact_raw_evidence_bridge(
    args: StorageCompactRawEvidenceArgs,
) -> GooseResult<serde_json::Value> {
    let store = open_bridge_store(&args.database_path)?;  // pattern: line 8009
    let report = store.compact_raw_evidence_payloads_to_limit(args.limit_bytes)?;
    serde_json::to_value(report)
        .map_err(|e| GooseError::message(format!("cannot serialize compaction report: {e}")))
}
```

**FIX-01 — add `active_device_id` to CaptureImportFrameBatchArgs** (follow `CaptureSessionInput` pattern from `capture_import.rs`):
```rust
// In the existing CaptureImportFrameBatchArgs struct — add one field:
active_device_id: Option<String>,

// At line 400 in capture_import.rs — change:
// active_device_id: None,
// to:
active_device_id: args.active_device_id.as_deref(),
```

**Cargo.toml change** (line 161):
```toml
[profile.release]
# Before:
panic = "abort"
# After:
panic = "unwind"
# ONLY change [profile.release]. Do not touch [profile.dev].
```

---

## Shared Patterns

### Background bridge calls (never from @MainActor)
**Source:** `GooseSwift/GooseAppModel.swift` lines 288–333 (Task closures); `GooseSwift/CaptureFrameWriteQueue.swift` lines 245–260 (existing write queue)
**Apply to:** `runStorageCompactionIfNeeded()` in GooseAppModel, compaction call in CaptureFrameWriteQueue
```swift
// Pattern A: DispatchQueue.global for one-shot background work from init
DispatchQueue.global(qos: .utility).async { [weak self] in
  guard let self else { return }
  self.runStorageCompactionIfNeeded()
}

// Pattern B: existing write queue (CaptureFrameWriteQueue already on background queue)
// No extra dispatch needed — the write loop is already off @MainActor.
```

### @Published state mutation from background
**Source:** `GooseSwift/GooseBLEClient+HRMonitor.swift` lines 82–84; `GooseSwift/GooseBLEClient+Commands.swift` (updateReconnectState helper)
**Apply to:** All reconnect state string updates in both WHOOP and HR monitor paths
```swift
// Pattern: dispatch to main for @Published mutation
DispatchQueue.main.async { [weak self] in
  self?.owner?.objectWillChange.send()
}
// OR via Task for @MainActor types:
Task { @MainActor in
  self.reconnectState = backoff.statusString
}
```

### bridge_error / bridge_ok / request_args / open_bridge_store
**Source:** `Rust/core/src/bridge.rs` lines 8009–8039, 8149–8180
**Apply to:** New `storage.compact_raw_evidence` bridge method (FIX-05)
```rust
// open_bridge_store (line 8009): validates non-empty path, opens GooseStore
// request_args<T> (line 8033): deserialises request.args into typed struct
// bridge_ok (line 8149): wraps serde_json::Value into BridgeResponse {ok: true}
// bridge_error (line 8160): wraps string message into BridgeResponse {ok: false}
// ALL four are used in the standard match arm pattern.
```

### Logging with ble.record
**Source:** `GooseSwift/GooseBLEClient+Commands.swift` line 703; referenced throughout
**Apply to:** Compaction result in GooseAppModel, reconnect state transitions
```swift
ble.record(level: .debug, source: "ble", title: "reconnect.skipped", body: "already in flight")
// For compaction result (D-10):
ble.record(source: "storage", title: "compact", body: "\(compactedRows) rows, \(mbFreed) MB freed")
// Call only when compactedRows > 0 (silent otherwise).
```

---

## No Analog Found

All files have close analogs. No file requires falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `GooseSwift/`, `Rust/core/src/`
**Files scanned:** 10 source files read directly
**Pattern extraction date:** 2026-06-04
