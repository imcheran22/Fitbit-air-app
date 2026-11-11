---
phase: 83-protocol-architecture-refactor-gen4-gen5-capability-model
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - Rust/core/src/capabilities.rs
  - Rust/core/src/protocol.rs
  - Rust/core/src/lib.rs
  - Rust/core/src/store.rs
  - Rust/core/src/bridge.rs
  - Rust/core/tests/bridge_tests.rs
  - Rust/core/tests/store_tests.rs
  - GooseSwift/GooseBLETypes.swift
  - GooseSwift/GooseBLEClient.swift
  - GooseSwift/GooseBLEClient+Commands.swift
  - GooseSwift/GooseBLEClient+Haptics.swift
  - GooseSwift/GooseBLEClient+UserActions.swift
  - GooseSwift/GooseBLEClient+HistoricalHandlers.swift
  - GooseSwift/GooseBLEClient+HistoricalCommands.swift
  - GooseSwift/GooseBLEClient+Parsing.swift
  - GooseSwift/GooseBLEClient+DebugAndSync.swift
  - GooseSwift/GooseAppModel+NotificationPipeline.swift
  - GooseSwift/GooseAppModel+Upload.swift
  - GooseSwift/OvernightRawNotificationSpool.swift
  - GooseSwift/OvernightSQLiteMirrorQueue.swift
  - GooseSwift/MovementPacketSamples.swift
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: fixed
---

# Phase 83: Code Review Report

**Reviewed:** 2026-06-14
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 83 refactors device-type handling from string comparisons to typed enums (`WireProtocol`, `DeviceCapabilities`) across the Rust core and Swift layers. The structural work — `DeviceKind` enum, `DeviceCapabilities` factory, migration step 22, `parse_device_type` rejection of MAVERICK/PUFFIN — is sound and well-tested in the Rust layer.

The critical finding is a silent failure path in the `device.capabilities` bridge call during GATT discovery: triple-nested `try?` means that if the bridge call, JSON serialisation, or JSON decoding fails, `connectedCapabilities` stays nil with no log. The fallback to `.gen5` then causes every command written to a Gen4 device to use the wrong frame format (8-byte Gen5 header instead of 4-byte Gen4 header), silently breaking BLE communication.

Four warning-level issues cover: the blocking Rust FFI call on the main thread during GATT discovery; two upload functions that bypass the new `connectedCapabilities` API and regress to the old string-comparison approach; a missing integration test for the `device.capabilities` JSON dispatch path; and an `os_log` call that bypasses the structured BLE logging pipeline.

---

## Critical Issues

### CR-01: Silent failure in `device.capabilities` bridge call leaves `connectedCapabilities` nil without any log

**File:** `GooseSwift/GooseBLEClient+Commands.swift:999-1005`

**Issue:** The `device.capabilities` bridge call is wrapped in three sequential `try?` expressions. If any of the three steps (bridge request, `JSONSerialization.data`, `JSONDecoder.decode`) throws, the entire chain silently returns nil and `connectedCapabilities` remains nil. There is no log message and no fallback assignment.

When `connectedCapabilities` is nil, every call to `whoopGenerationFromCapabilities()` falls back to `.gen5` (logged at `os_log(.error)` level, which may be suppressed in production). A Gen4 device connected during this condition will receive 8-byte Gen5-format command frames instead of 4-byte Gen4 frames, silently breaking command writes (clock sync, alarm scheduling, historical sync negotiation, sensor stream control, haptic feedback).

```swift
// Current (silent failure):
if let result = try? historicalDirectWriteBridge.request(
      method: "device.capabilities",
      args: ["device_kind": deviceKindString]),
   let capData = try? JSONSerialization.data(withJSONObject: result),
   let caps = try? JSONDecoder().decode(DeviceCapabilities.self, from: capData) {
  connectedCapabilities = caps
}
// If any step throws: connectedCapabilities stays nil, no log, .gen5 fallback used for all commands
```

**Fix:** Separate the steps, log each failure with the existing `record` pipeline, and assign a typed fallback based on the detected generation so commands are never silently mis-framed:

```swift
let deviceKindString = detectedGeneration == .gen4 ? "WHOOP4" : "WHOOP5"
do {
  let result = try historicalDirectWriteBridge.request(
    method: "device.capabilities",
    args: ["device_kind": deviceKindString])
  let capData = try JSONSerialization.data(withJSONObject: result)
  connectedCapabilities = try JSONDecoder().decode(DeviceCapabilities.self, from: capData)
} catch {
  record(
    level: .error,
    source: "ble",
    title: "device.capabilities.failed",
    body: "generation=\(deviceKindString) error=\(error)"
  )
  // Assign a typed fallback so whoopGenerationFromCapabilities() never mis-frames
  connectedCapabilities = detectedGeneration == .gen4
    ? DeviceCapabilities(
        wireProtocol: .gen4,
        historicalSync: .pageSequence,
        batteryViaR22: false,
        batteryViaEvent48: true,
        batteryViaCMD26: true,
        r22Realtime: false)
    : DeviceCapabilities(
        wireProtocol: .gen5,
        historicalSync: .stream,
        batteryViaR22: true,
        batteryViaEvent48: true,
        batteryViaCMD26: true,
        r22Realtime: true)
}
```

Alternatively, define `DeviceCapabilities.gen4Default` and `gen5Default` static properties in Swift to avoid duplicating the values. If a local fallback struct is too verbose, at minimum log the failure before the silent nil.

---

## Warnings

### WR-01: Synchronous Rust FFI call on main thread during GATT discovery

**File:** `GooseSwift/GooseBLEClient+Commands.swift:999`

**Issue:** `processDiscoveredCharacteristics` runs on the main thread (bounced from `coreBluetoothQueue` via `dispatchCoreBluetoothDelegateToMainIfNeeded`). The `historicalDirectWriteBridge.request(method: "device.capabilities", ...)` call is synchronous and blocks the main thread until the Rust FFI returns. CLAUDE.md explicitly lists "Calling GooseRustBridge from @MainActor inline" as a forbidden anti-pattern.

For this specific call the Rust side performs only pure computation (no SQLite I/O), so in practice the block time is sub-millisecond. However, it violates the established contract and will become a latency hazard if the implementation ever changes (e.g., if capabilities lookup is later backed by stored preferences).

**Fix:** Dispatch the bridge call to `historicalWriteQueue` (already available) and write `connectedCapabilities` back on main:

```swift
let kindString = detectedGeneration == .gen4 ? "WHOOP4" : "WHOOP5"
let bridge = historicalDirectWriteBridge
historicalWriteQueue.async { [weak self] in
  do {
    let result = try bridge.request(method: "device.capabilities",
                                    args: ["device_kind": kindString])
    let capData = try JSONSerialization.data(withJSONObject: result)
    let caps = try JSONDecoder().decode(DeviceCapabilities.self, from: capData)
    DispatchQueue.main.async { self?.connectedCapabilities = caps }
  } catch {
    DispatchQueue.main.async {
      self?.record(level: .error, source: "ble",
                   title: "device.capabilities.failed", body: "\(error)")
    }
  }
}
```

Note: this makes `connectedCapabilities` set asynchronously after the characteristic is discovered; `sendClientHelloIfNeeded` (called a few lines later at line 1059) would fire before capabilities are set. That race already exists implicitly (nil guard + gen5 fallback), but the async approach makes the timing explicit and allows the hello frame to be sent immediately while capabilities resolve in background.

### WR-02: `triggerManualUpload` and `triggerBackfillAndUpload` bypass `connectedCapabilities` — revert to old string-comparison approach

**File:** `GooseSwift/GooseAppModel+Upload.swift:56-62` and `81-86`

**Issue:** Two of the three upload trigger functions still derive `whoopType` from `activeDescriptor.commandCharacteristicPrefix` using a raw string prefix check:

```swift
whoopType = desc.commandCharacteristicPrefix.hasPrefix("610800") ? "GEN4" : "GOOSE"
```

This is the old approach this phase was designed to replace. The third function `triggerUpload(for:deviceEvent:)` correctly uses `deviceEvent.wireProtocol.bridgeString`. The inconsistency means that if `activeDescriptor` is nil but `connectedCapabilities` is set (a theoretically reachable state during BT state restoration), both upload functions fall through to the hardcoded `"GOOSE"` default rather than querying the typed capability.

This is a quality regression: the refactor is incomplete. It doesn't cause a runtime bug today (descriptor and capabilities are set together in `processDiscoveredCharacteristics`), but it means the new API is not the single source of truth for device type during upload.

**Fix:** Replace the prefix checks with:

```swift
let whoopType = ble.connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"
```

Apply to both `triggerManualUpload` (line 81-85) and `triggerBackfillAndUpload` (line 56-60).

### WR-03: No integration test for `device.capabilities` JSON dispatch path in `bridge_tests.rs`

**File:** `Rust/core/tests/bridge_tests.rs`

**Issue:** The `device.capabilities` bridge method (added in this phase) has no integration test exercising the full JSON dispatch path (`handle_bridge_request_json` → `DeviceCapabilitiesArgs` deserialisation → `device_capabilities_bridge`). The only coverage is a unit test in `bridge.rs` (line 10886) that calls `device_capabilities_bridge()` directly, bypassing JSON deserialisation.

This matters because the Rust `DeviceKind` uses `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]`, so `"WHOOP4"` → `DeviceKind::Whoop4` and `"WHOOP5"` → `DeviceKind::Whoop5`. The mapping is correct, but a future rename of the enum variants or a change to the serde attribute would silently break Swift → Rust communication with no test catching it at the integration boundary.

**Fix:** Add a test in `bridge_tests.rs` that mirrors what Swift sends:

```rust
#[test]
fn test_device_capabilities_bridge_whoop4_via_json_dispatch() {
    let response = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "caps-whoop4",
        "method": "device.capabilities",
        "args": { "device_kind": "WHOOP4" }
    }));
    assert!(response.ok, "{:?}", response.error);
    let result = response.result.unwrap();
    assert_eq!(result["wire_protocol"].as_str().unwrap(), "gen4");
    assert_eq!(result["historical_sync"].as_str().unwrap(), "page_sequence");
    assert_eq!(result["battery_via_r22"].as_bool().unwrap(), false);
}

#[test]
fn test_device_capabilities_bridge_whoop5_via_json_dispatch() {
    let response = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "caps-whoop5",
        "method": "device.capabilities",
        "args": { "device_kind": "WHOOP5" }
    }));
    assert!(response.ok, "{:?}", response.error);
    let result = response.result.unwrap();
    assert_eq!(result["wire_protocol"].as_str().unwrap(), "gen5");
    assert_eq!(result["historical_sync"].as_str().unwrap(), "stream");
    assert_eq!(result["battery_via_r22"].as_bool().unwrap(), true);
}

#[test]
fn test_device_capabilities_bridge_unknown_kind_rejected() {
    let response = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "caps-unknown",
        "method": "device.capabilities",
        "args": { "device_kind": "UNKNOWN" }
    }));
    assert!(!response.ok, "unknown device_kind must be rejected");
}
```

### WR-04: `whoopGenerationFromCapabilities` uses `os_log` directly instead of the structured `record` pipeline

**File:** `GooseSwift/GooseBLEClient+Commands.swift:530`

**Issue:** The nil-capabilities error log uses the global `os_log(.error, ...)` function instead of `self.record(level: .error, source:, title:, body:)`. Every other error in this class goes through `record()`, which feeds `GooseMessageStore`, the `onMessage` callback, and `writeOSLog` (which uses the named logger with `subsystem: "com.goose.swift"`, `category: "ble"`). Using bare `os_log` bypasses this pipeline entirely — the log appears with a different subsystem and will not appear in the in-app debug message list or be captured by `onMessage` handlers.

**Fix:**

```swift
func whoopGenerationFromCapabilities() -> WhoopGeneration {
  guard let caps = connectedCapabilities else {
    record(
      level: .error,
      source: "ble",
      title: "capabilities.nil",
      body: "connectedCapabilities is nil — generation unknown, defaulting to gen5"
    )
    return .gen5
  }
  return caps.wireProtocol == .gen4 ? .gen4 : .gen5
}
```

---

## Info

### IN-01: Migration step 22 runs unconditionally on every `GooseStore::open()` — the `UPDATE` is a full-table scan on each app launch

**File:** `Rust/core/src/store.rs:1831-1832`

**Issue:** The migration SQL:

```sql
UPDATE decoded_frames SET device_type = 'GOOSE'
WHERE device_type IN ('MAVERICK', 'PUFFIN');
```

is embedded in a single `execute_batch` that runs on every `GooseStore::open()`. For databases that have already migrated, this `UPDATE` is a no-op but SQLite still executes the WHERE-clause scan. On a large database (many thousands of `decoded_frames` rows) this scan adds latency on every app launch.

The `INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (22)` guard only records that the migration ran; it does not skip the UPDATE. Unlike a proper incremental migration system (where step 22 would only run if version < 22), this phase embeds the step in the monolithic `migrate()` batch.

This is consistent with the existing pattern (steps 1–21 are also unconditional DML in the same batch), so it is not a new regression. Flag as informational for the architectural backlog.

**Fix:** Long-term: split `migrate()` into conditional per-step blocks that read `PRAGMA user_version` and only apply pending steps. Short-term: acceptable as-is given the UPDATE is idempotent and fast once all rows are normalised.

### IN-02: `store_tests.rs` migration step 22 tests absent — coverage exists only in `bridge_tests.rs`

**File:** `Rust/core/tests/store_tests.rs`

**Issue:** The phase scope document lists `store_tests.rs` as "MODIFIED — migration step 22 tests," but the file contains no migration_step_22 tests. The step 22 migration tests (`test_migration_step_22_maverick_puffin_to_goose`, `test_migration_step_22_idempotent`) are located in `bridge_tests.rs` (lines 9798+). The `store_tests.rs` file ends at line 3297 with gravity-row tests.

This is a documentation mismatch — the tests do exist (in `bridge_tests.rs`) and are thorough. The mismatch between scope description and actual file modification may cause confusion during future maintenance.

No code change needed; noting for documentation accuracy.

---

_Reviewed: 2026-06-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
