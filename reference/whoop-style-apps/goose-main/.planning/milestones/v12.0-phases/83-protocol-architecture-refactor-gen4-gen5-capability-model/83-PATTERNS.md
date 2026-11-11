# Phase 83: Protocol Architecture Refactor — Gen4/Gen5 Capability Model - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 13 files (2 new, 11 modified)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `Rust/core/src/capabilities.rs` | model | request-response | `Rust/core/src/protocol.rs` (DeviceType enum + impl) | role-match |
| `Rust/core/src/protocol.rs` | model | transform | itself (existing DeviceType impl block) | exact |
| `Rust/core/src/bridge.rs` | service | request-response | itself (existing `request_args` + match arm pattern) | exact |
| `Rust/core/src/store.rs` | model | CRUD | itself (existing migration batch at lines 1809-1830) | exact |
| `Rust/core/src/lib.rs` | config | — | itself (existing `pub mod` declarations) | exact |
| `GooseSwift/GooseBLETypes.swift` | model | transform | itself (`WhoopGeneration` enum + `rustDeviceType` property) | exact |
| `GooseSwift/GooseBLEClient.swift` | model | — | itself (line 275 property declaration) | exact |
| `GooseSwift/GooseBLEClient+Commands.swift` | service | request-response | `GooseSwift/GooseRustBridge.swift` (bridge.request pattern) | role-match |
| `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` | service | event-driven | itself (existing gen4 guard pattern at line 80) | exact |
| `GooseSwift/GooseBLEClient+HistoricalCommands.swift` | service | event-driven | itself (existing gen4 guard at line 68) | exact |
| `GooseSwift/GooseBLEClient+Parsing.swift` | service | transform | itself (line 548 reset pattern) | exact |
| `GooseSwift/GooseBLEClient+DebugAndSync.swift` | utility | request-response | itself (lines 399, 419, 440) | exact |
| `GooseSwift/GooseAppModel+NotificationPipeline.swift` | service | event-driven | itself (lines 829, 841, 881) | exact |

---

## Pattern Assignments

### `Rust/core/src/capabilities.rs` (NEW — model, request-response)

**Analog:** `Rust/core/src/protocol.rs` — DeviceType enum and impl block

**Imports pattern** (`protocol.rs` lines 1-3):
```rust
use serde::{Deserialize, Serialize};

use crate::{GooseError, GooseResult};
```

**Core enum + struct + impl pattern** (`protocol.rs` lines 25-68):
```rust
// DeviceType follows: derive macro block, serde rename, enum variants, then separate impl block.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeviceType {
    Gen4,
    Maverick,
    // ...
}

impl DeviceType {
    pub fn header_len(self) -> usize {
        match self {
            DeviceType::Gen4 => 4,
            DeviceType::Maverick
            | DeviceType::Puffin
            | DeviceType::Goose
            | DeviceType::HrMonitor => 8,
        }
    }
}
```

**Apply to `capabilities.rs`:** Use same derive block pattern for `DeviceKind` enum. Use `snake_case` serde rename for `DeviceCapabilities` fields (they map to JSON that Swift decodes). The `for_kind()` impl method matches the `match self { Variant => result }` arm style.

---

### `Rust/core/src/protocol.rs` (MODIFY — add WireProtocol enum + DeviceType methods)

**Analog:** itself — existing `impl DeviceType` block at lines 35-68

**Existing impl block to extend** (lines 35-68):
```rust
impl DeviceType {
    pub fn header_len(self) -> usize {
        match self {
            DeviceType::Gen4 => 4,
            DeviceType::Maverick
            | DeviceType::Puffin
            | DeviceType::Goose
            | DeviceType::HrMonitor => 8,
        }
    }

    pub fn expected_frame_len(self, buffer: &[u8]) -> Option<usize> {
        match self {
            DeviceType::Gen4 => { /* ... */ }
            DeviceType::Maverick
            | DeviceType::Puffin
            | DeviceType::Goose
            | DeviceType::HrMonitor => { /* ... */ }
        }
    }
}
```

**Pattern to add `WireProtocol` enum** — place after line 68, same derive style as `DeviceType` (line 25-26):
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireProtocol {
    Gen4,
    Gen5,
}
```

**Pattern to extend `impl DeviceType`** — add methods following same `match self` style:
```rust
pub fn wire_protocol(self) -> WireProtocol {
    match self {
        DeviceType::Gen4 => WireProtocol::Gen4,
        DeviceType::Maverick
        | DeviceType::Puffin
        | DeviceType::Goose
        | DeviceType::HrMonitor => WireProtocol::Gen5,
    }
}

pub fn is_gen5_family(self) -> bool {
    matches!(
        self,
        DeviceType::Maverick | DeviceType::Puffin | DeviceType::Goose | DeviceType::HrMonitor
    )
}
```

---

### `Rust/core/src/bridge.rs` (MODIFY — new bridge method + parse_device_type rejection)

**Analog:** itself — existing bridge method arm pattern (lines 2253-2256) and `parse_device_type` function (lines 9515-9526)

**Bridge method arm pattern to copy** (lines 2253-2256):
```rust
"metrics.reference_compare" => request_args::<ReferenceCompareArgs>(&request)
    .and_then(reference_compare_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

**New `device.capabilities` arm follows identical shape:**
```rust
"device.capabilities" => request_args::<DeviceCapabilitiesArgs>(&request)
    .and_then(device_capabilities_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

**`BRIDGE_METHODS` constant** (lines 183-332) — insert `"device.capabilities"` alphabetically between `"debug.start_session"` (line 232) and `"diagnostics.perf_budget"` (line 233). Keep sorted order.

**`parse_device_type` to modify** (lines 9515-9526):
```rust
fn parse_device_type(value: &str) -> GooseResult<DeviceType> {
    match value {
        "GEN4" | "GEN_4" | "Gen4" | "gen4" => Ok(DeviceType::Gen4),
        "MAVERICK" | "Maverick" | "maverick" => Ok(DeviceType::Maverick),  // REMOVE these arms
        "PUFFIN" | "Puffin" | "puffin" => Ok(DeviceType::Puffin),          // REMOVE these arms
        "GOOSE" | "Goose" | "goose" => Ok(DeviceType::Goose),
        "HR_MONITOR" | "hr_monitor" => Ok(DeviceType::HrMonitor),
        other => Err(GooseError::message(format!(
            "unsupported device_type: {other}"
        ))),
    }
}
```

**`request_args` helper** (line 9510-9513):
```rust
fn request_args<T: serde::de::DeserializeOwned>(
    request: &BridgeRequest,
) -> GooseResult<T> {
    serde_json::from_value(request.args.clone())
        .map_err(|error| GooseError::message(format!("invalid args: {error}")))
}
```

---

### `Rust/core/src/store.rs` (MODIFY — migration step 22)

**Analog:** itself — existing migration batch at lines 1809-1830 and `CURRENT_SCHEMA_VERSION` at line 14

**Schema version constant** (line 14):
```rust
pub const CURRENT_SCHEMA_VERSION: i64 = 21;  // bump to 22
```

**Migration batch pattern** (lines 1809-1830):
```rust
INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (1);
// ... one per version ...
INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (21);
PRAGMA user_version = 21;
```

**New step 22 follows same pattern — add after the v21 INSERT:**
```sql
UPDATE decoded_frames SET device_type = 'GOOSE'
WHERE device_type IN ('MAVERICK', 'PUFFIN');

INSERT OR IGNORE INTO goose_schema_migrations(version) VALUES (22);
PRAGMA user_version = 22;
```

**`device_type_name()` function** (lines 8918-8926) — do NOT change output strings. Keep MAVERICK/PUFFIN arms to avoid Rust exhaustiveness errors (enum variants are kept per D-16):
```rust
fn device_type_name(device_type: DeviceType) -> &'static str {
    match device_type {
        DeviceType::Gen4 => "GEN_4",
        DeviceType::Maverick => "MAVERICK",
        DeviceType::Puffin => "PUFFIN",
        DeviceType::Goose => "GOOSE",
        DeviceType::HrMonitor => "HR_MONITOR",
    }
}
```

---

### `Rust/core/src/lib.rs` (MODIFY — pub mod declaration)

**Analog:** itself — lines 18-60 module declarations

**Pattern** (lines 18-20):
```rust
pub mod activity_candidates;
pub mod activity_identity;
// ...alphabetical order...
pub mod protocol;
```

**Add `pub mod capabilities;`** between `pub mod calibration;` (line 24) and `pub mod capture_correlation;` (line 25) — alphabetical ordering.

---

### `GooseSwift/GooseBLETypes.swift` (MODIFY — replace rustDeviceType, add WireProtocol + DeviceCapabilities)

**Analog:** itself — `rustDeviceType` computed property (lines 75-84) and `WhoopGeneration` enum (lines 209-291)

**`rustDeviceType` computed property to replace** (lines 75-84):
```swift
var rustDeviceType: String {
  if characteristicUUID.lowercased().hasPrefix("610800") {
    return "GEN4"
  }
  let normalizedUUID = characteristicUUID.replacingOccurrences(of: "-", with: "").lowercased()
  if normalizedUUID == "2a37" || normalizedUUID.hasPrefix("00002a37") {
    return "HR_MONITOR"
  }
  return "GOOSE"
}
```

**Replace with `wireProtocol` computed property** — same UUID-prefix detection logic, return `WireProtocol` enum instead of `String`:
```swift
var wireProtocol: WireProtocol {
  if characteristicUUID.lowercased().hasPrefix("610800") {
    return .gen4
  }
  let normalizedUUID = characteristicUUID.replacingOccurrences(of: "-", with: "").lowercased()
  if normalizedUUID == "2a37" || normalizedUUID.hasPrefix("00002a37") {
    return .hrMonitor
  }
  return .gen5
}
```

**`WhoopGeneration` enum pattern** (lines 209-291) — copy `enum` + `// MARK:` section structure for new `WireProtocol` enum. Place after `WhoopGeneration`:
```swift
// MARK: - WireProtocol

enum WireProtocol {
  case gen4
  case gen5
  case hrMonitor
}

enum HistoricalSyncKind {
  case pageSequence
  case stream
}
```

**`DeviceCapabilities` struct** — follows same plain struct pattern as `GooseCommandWriteEvent` and similar types in the file (no @Published, no observable, pure value type):
```swift
struct DeviceCapabilities: Decodable {
  let wireProtocol: WireProtocol
  let historicalSync: HistoricalSyncKind
  let batteryViaR22: Bool
  let batteryViaEvent48: Bool
  let batteryViaCMD26: Bool
  let r22Realtime: Bool
}
```

---

### `GooseSwift/GooseBLEClient.swift` (MODIFY — replace activeDeviceGeneration declaration)

**Analog:** itself — property block at lines 270-284

**Property to replace** (line 275):
```swift
var activeDeviceGeneration: WhoopGeneration = .gen5
```

**Replacement pattern follows same inline comment style** (lines 270-275):
```swift
// connectedCapabilities is nil when disconnected; set by processDiscoveredCharacteristics
// after a successful device.capabilities bridge call.
var connectedCapabilities: DeviceCapabilities?
```

---

### `GooseSwift/GooseBLEClient+Commands.swift` (MODIFY — add capabilities bridge call at GATT discovery)

**Analog:** `GooseSwift/GooseRustBridge.swift` — `bridge.request(method:args:)` call pattern (lines 32-33)

**GATT discovery call site pattern** (lines 986-998 — existing):
```swift
commandCharacteristic = characteristic
activeDeviceGeneration = WhoopGeneration.detect(from: characteristic)
activeDescriptor = characteristic.uuid.uuidString.lowercased().hasPrefix("61080002")
  ? .whoopGen4 : .whoopGen5
record(
  source: "ble",
  title: cached ? "command_characteristic.cached" : "command_characteristic.discovered",
  body: "..."
)
```

**Pattern to add capabilities call after line 986** — follow try? + optional chaining pattern used in other bridge calls (no guard let to avoid disrupting flow):
```swift
let detectedGeneration = WhoopGeneration.detect(from: characteristic)
let deviceKindString = detectedGeneration == .gen4 ? "WHOOP4" : "WHOOP5"
if let result = try? rustBridge.request(method: "device.capabilities", args: ["device_kind": deviceKindString]),
   let capData = try? JSONSerialization.data(withJSONObject: result),
   let caps = try? JSONDecoder().decode(DeviceCapabilities.self, from: capData) {
  connectedCapabilities = caps
}
```

**Frame building calls** (lines 262, 361, 496 — existing `activeDeviceGeneration.buildCommandFrame(...)`) — derive `WhoopGeneration` from `connectedCapabilities`:
```swift
// Before:
activeDeviceGeneration.buildCommandFrame(sequence: seq, command: cmd, data: data)
// After:
whoopGenerationFromCapabilities().buildCommandFrame(sequence: seq, command: cmd, data: data)
```

Add private helper on the class:
```swift
private func whoopGenerationFromCapabilities() -> WhoopGeneration {
  connectedCapabilities?.wireProtocol == .gen4 ? .gen4 : .gen5
}
```

---

### `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` (MODIFY — 6 guard sites)

**Analog:** itself — existing guard pattern at lines 80-83 and 453

**Switch statement to replace** (lines 80-83):
```swift
switch activeDeviceGeneration {
case .gen4: deviceType = "GEN4"
case .gen5: deviceType = "MAVERICK"
}
```

**Replacement — switch on capabilities.historicalSync:**
```swift
switch connectedCapabilities?.historicalSync {
case .pageSequence: deviceType = "GEN4"
default: deviceType = "MAVERICK"
}
```

**Boolean guard pattern to replace** (lines 453, 567, 593, 672):
```swift
// Before:
if activeDeviceGeneration == .gen4 {
// After:
if connectedCapabilities?.historicalSync == .pageSequence {

// Before:
if activeDeviceGeneration != .gen4 {
// After:
if connectedCapabilities?.historicalSync != .pageSequence {
```

---

### `GooseSwift/GooseBLEClient+HistoricalCommands.swift` (MODIFY — 2 guard sites)

**Analog:** itself — lines 68, 108, 114

**Guard replacement pattern** (lines 68 and 108):
```swift
// Before:
if activeDeviceGeneration == .gen4 {
// After:
if connectedCapabilities?.historicalSync == .pageSequence {
```

**Frame building call** (line 114 — `activeDeviceGeneration.buildCommandFrame(...)`):
```swift
// Before:
activeDeviceGeneration.buildCommandFrame(sequence: seq, command: cmd, data: data)
// After:
whoopGenerationFromCapabilities().buildCommandFrame(sequence: seq, command: cmd, data: data)
```

---

### `GooseSwift/GooseBLEClient+Parsing.swift` (MODIFY — 5 sites)

**Analog:** itself — reset at line 548, switches at lines 1015 and 1022

**Reset pattern** (line 548):
```swift
// Before:
activeDeviceGeneration = .gen5
// After:
connectedCapabilities = nil
```

**Guard patterns** (lines 737, 748):
```swift
// Before:
if activeDeviceGeneration != .gen4 {
// After:
if connectedCapabilities?.wireProtocol != .gen4 {
```

**Switch patterns** (lines 1015, 1022 — `switch activeDeviceGeneration`):
```swift
// Before:
switch activeDeviceGeneration {
case .gen4: /* ... */
case .gen5: /* ... */
}
// After:
switch connectedCapabilities?.wireProtocol {
case .gen4: /* ... */
default: /* ... */
}
```

---

### `GooseSwift/GooseAppModel+NotificationPipeline.swift` (MODIFY — reassembly string comparisons)

**Analog:** itself — lines 829 and 841 (primary), 524, 700, 720, 881

**String comparisons to replace** (lines 829 and 841):
```swift
// Before:
let headerLength = event.rustDeviceType == "GEN4" ? 4 : 8
if event.rustDeviceType == "GEN4" {
// After:
let headerLength = event.wireProtocol == .gen4 ? 4 : 8
if event.wireProtocol == .gen4 {
```

**HR_MONITOR bypass check** (line 720):
```swift
// Before:
if event.rustDeviceType == "HR_MONITOR" {
// After:
if event.wireProtocol == .hrMonitor {
```

**Bridge arg pass-throughs** (lines 524, 700) — produce canonical string from `wireProtocol`:
```swift
// Before:
"device_type": event.rustDeviceType
// After:
"device_type": event.wireProtocol.bridgeString
```

Add computed property to `WireProtocol` in `GooseBLETypes.swift`:
```swift
var bridgeString: String {
  switch self {
  case .gen4: return "GEN4"
  case .gen5: return "GOOSE"
  case .hrMonitor: return "HR_MONITOR"
  }
}
```

**Frame reassembly cache key** (line 881):
```swift
// Before:
let key = "\(event.deviceID)-\(event.rustDeviceType)"
// After:
let key = "\(event.deviceID)-\(event.wireProtocol.bridgeString)"
```

---

## Shared Patterns

### Rust `match self` exhaustive arm style
**Source:** `Rust/core/src/protocol.rs` lines 36-68
**Apply to:** All new `impl DeviceType` methods, `impl DeviceCapabilities::for_kind()`, `impl DeviceKind`

Pattern: multi-variant `|` pipe grouping on separate lines with 4-space indent for grouped variants. Use `matches!()` macro for boolean queries.

### Bridge `request_args` + `and_then` chain
**Source:** `Rust/core/src/bridge.rs` lines 2253-2256 and 9510-9513
**Apply to:** New `device.capabilities` bridge arm

```rust
"method.name" => request_args::<ArgsStruct>(&request)
    .and_then(handler_fn)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```

### Swift optional chaining for capabilities guards
**Source:** `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` replacement pattern
**Apply to:** All 8 `activeDeviceGeneration == .gen4` guard sites

Pattern: use `connectedCapabilities?.historicalSync == .pageSequence` for positive checks. Use `connectedCapabilities?.wireProtocol == .gen4` for wire-protocol checks. Do not force-unwrap.

### Swift `try? bridge.request` + JSONDecoder pattern
**Source:** `GooseSwift/GooseRustBridge.swift` lines 32-89 (bridge.request contract)
**Apply to:** `device.capabilities` bridge call in `GooseBLEClient+Commands.swift`

```swift
if let result = try? bridge.request(method: "method.name", args: argsDict),
   let data = try? JSONSerialization.data(withJSONObject: result),
   let decoded = try? JSONDecoder().decode(SomeType.self, from: data) {
  self.someProperty = decoded
}
```

---

## No Analog Found

All files have close analogs in the codebase. No new patterns are needed from external sources.

---

## Metadata

**Analog search scope:** `Rust/core/src/`, `GooseSwift/`
**Files scanned:** 13 source files (protocol.rs, bridge.rs, store.rs, lib.rs, GooseBLETypes.swift, GooseBLEClient.swift, GooseRustBridge.swift, GooseBLEClient+Commands.swift, GooseBLEClient+Parsing.swift, GooseBLEClient+HistoricalHandlers.swift, GooseBLEClient+HistoricalCommands.swift)
**Pattern extraction date:** 2026-06-14
