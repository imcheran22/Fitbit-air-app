# Phase 61: BLE Bonding State Machine — Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `GooseSwift/GooseBLEBondingManager.swift` | service / state-machine | event-driven | `GooseSwift/GooseBLEReconnect.swift` | role-match |
| `GooseSwift/GooseBLETypes.swift` | model | transform | `GooseSwift/GooseBLETypes.swift` (existing enum additions) | exact |
| `GooseSwift/GooseBLEClient.swift` | service | event-driven | `GooseSwift/GooseBLEClient.swift` (property + DefaultsKey additions) | exact |
| `GooseSwift/GooseBLEClient+CentralDelegate.swift` | middleware | event-driven | `GooseSwift/GooseBLEClient+CentralDelegate.swift` (existing pattern) | exact |
| `GooseSwift/GooseBLEClient+Commands.swift` | service | request-response | `GooseSwift/GooseBLEClient+Commands.swift` (existing updateConnectionState) | exact |
| `GooseSwift/LocalizedStatusStrings.swift` | utility | transform | `GooseSwift/LocalizedStatusStrings.swift` (existing extension pattern) | exact |

---

## Pattern Assignments

### `GooseSwift/GooseBLEBondingManager.swift` (service, event-driven) — NEW FILE

**Primary analog:** `GooseSwift/GooseBLEReconnect.swift`

The new file follows the same pattern: a standalone Swift value/reference type that owns a focused piece of BLE state, lives in `GooseSwift/`, and is held as a `let` property by `GooseBLEClient`. `ReconnectBackoff` is a `struct`; `GooseBLEBondingManager` should be a `final class` (it has mutable identity-dependent callbacks and persists to UserDefaults).

**Imports pattern** — copy from `GooseSwift/GooseBLEReconnect.swift` lines 1–3:
```swift
import CoreBluetooth
import Foundation
```

**Enum pattern** — `GooseSyncToastPhase` in `GooseSwift/GooseBLETypes.swift` lines 106–110 shows the minimal enum style used in this codebase:
```swift
enum GooseSyncToastPhase: String {
  case syncing
  case synced
  case failed
}
```
`GooseBLEBondingState` follows this style but uses associated values (`.completed(deviceID: UUID)`, `.cancelled(reason: String)`) and conforms to `Equatable` manually (Swift synthesises it only when all associated values are also `Equatable`; `UUID` and `String` are, so synthesis works).

**State-owning class pattern** — `GooseSwift/GooseBLEReconnect.swift` lines 5–27 show the pattern:
```swift
struct ReconnectBackoff {
  var attemptCount: Int = 0
  let baseDelay: TimeInterval = 1.0
  let maxDelay: TimeInterval = 60.0
  let maxAttempts: Int = 10

  mutating func nextDelay() -> TimeInterval? { ... }
  mutating func reset() { attemptCount = 0 }

  var statusString: String {
    "reconnecting (attempt \(attemptCount)/\(maxAttempts))"
  }
}
```
`GooseBLEBondingManager` replicates this focused-type shape but as `final class` with a callback closure and `UserDefaults` persistence.

**UserDefaults persistence pattern** — `GooseSwift/GooseBLEClient.swift` lines 335–353:
```swift
enum DefaultsKey {
  static let rememberedDeviceID = "goose.swift.rememberedDeviceID"
  static let rememberedDeviceName = "goose.swift.rememberedDeviceName"
  ...
}
```
Bond state keys should follow the same namespace: `"goose.swift.ble.bondingState"` and `"goose.swift.ble.bondingDeviceID"`. Keys live as `static let` on the manager (not in the GooseBLEClient `DefaultsKey` enum) since they are owned by the manager type.

**Main-thread dispatch pattern** — `GooseSwift/GooseBLEClient+Commands.swift` lines 104–116, the `updateConnectionState` function shows how to safely bounce to main:
```swift
func updateConnectionState(_ value: String) {
  if !Thread.isMainThread {
    DispatchQueue.main.async { [weak self] in self?.updateConnectionState(value) }
    return
  }
  // ... mutate @Observable state
}
```
`GooseBLEBondingManager.transition(to:)` must call `onBondingStateChange` on main thread using the same pattern — not via `Task { @MainActor in }` (not used in the BLE layer), but via `DispatchQueue.main.async { [weak self] in ... }`.

---

### `GooseSwift/GooseBLETypes.swift` (model, transform) — MODIFY

**Analog:** existing file, lines 106–117 (`GooseSyncToastPhase`, `GooseSyncToast`)

The new `GooseBLEBondingState` enum is added at the bottom of the `GooseBLETypes.swift` file, after all existing type declarations, following the `// MARK: -` section separator convention visible throughout the file.

**Enum with associated values pattern** — `WhoopGeneration` in `GooseSwift/GooseBLETypes.swift` lines 212–291 shows the full pattern for a BLE-domain enum with computed properties:
```swift
enum WhoopGeneration: CustomStringConvertible {
  case gen4
  case gen5

  var description: String {
    switch self {
    case .gen4: return "WHOOP 4.0"
    case .gen5: return "WHOOP 5.0"
    }
  }

  func buildCommandFrame(sequence: UInt8, command: UInt8, data: [UInt8]) -> Data {
    switch self { ... }
  }
}
```
`GooseBLEBondingState` follows this: enum cases, computed `connectionStateString: String`, computed `isReady: Bool`, computed `persistenceKey: String`. No `CustomStringConvertible` needed (it has a dedicated `localizedDescription` in `LocalizedStatusStrings.swift`).

---

### `GooseSwift/GooseBLEClient.swift` (service, event-driven) — MODIFY

**Analog:** same file, lines 94–109 and 335–353

Two changes: (1) add `let bondingManager = GooseBLEBondingManager()` to the property list, and (2) add two new key constants to `DefaultsKey` or (preferred) keep them in `GooseBLEBondingManager` itself.

**Property list insertion pattern** — lines 94–100 show the pattern for sub-manager let properties:
```swift
let bleUIStateAggregator = BLEUIStateAggregator(publishInterval: GooseBLEClient.bleUIStatePublishInterval)
let messageStore = GooseMessageStore(
  maximumMessages: GooseBLEClient.maximumDisplayedMessages,
  flushInterval: GooseBLEClient.displayedMessageFlushInterval
)
let hrMonitorManager = GooseBLEHRMonitorManager()
```
The bonding manager fits here as: `let bondingManager = GooseBLEBondingManager()`

**Init wiring pattern** — search for where `hrMonitorManager` callback is wired in `GooseBLEClient+HRMonitor.swift`; the bonding manager callback is wired in `init()` or `setup()` using the same `[weak self]` closure:
```swift
bondingManager.onBondingStateChange = { [weak self] newState in
  guard let self else { return }
  self.updateConnectionState(newState.connectionStateString)
}
```

---

### `GooseSwift/GooseBLEClient+CentralDelegate.swift` (middleware, event-driven) — MODIFY

**Analog:** same file — existing `centralManagerDidUpdateState`, `centralManager(_:didConnect:)`, `centralManager(_:didDisconnectPeripheral:error:)` methods.

**Delegate dispatch guard pattern** — every delegate method in this file opens with the same idiom (lines 6–14):
```swift
func centralManager(
  _ central: CBCentralManager,
  willRestoreState dict: [String: Any]
) {
  if dispatchCoreBluetoothDelegateToMainIfNeeded({ [weak self] in
    self?.centralManager(central, willRestoreState: dict)
  }) {
    return
  }
  // ... actual logic
}
```
Bond loss detection is inserted **after** this guard, before the existing reconnect logic in `centralManager(_:didDisconnectPeripheral:error:)`.

**updateConnectionState call sites to replace** — in `centralManagerDidUpdateState` line 96:
```swift
updateConnectionState("disconnected")
```
This becomes: `bondingManager.transition(to: .notStarted)` — the callback fires `updateConnectionState("disconnected")` automatically.

In `centralManager(_:didConnect:)` line 49 (in `willRestoreState`) and its counterpart:
```swift
updateConnectionState("discovering")
```
becomes: `bondingManager.transition(to: .subscribed)`

**Record pattern for logging** (lines 17–18):
```swift
record(source: "ble", title: "central.restore_state", body: "peripherals=\(restored.count)")
```
Bond loss log call follows: `record(level: .warn, source: "ble.bonding", title: "bond.lost", body: error?.localizedDescription ?? "")`

---

### `GooseSwift/GooseBLEClient+Commands.swift` (service, request-response) — MODIFY

**Analog:** same file, `updateConnectionState` at line 104.

The key change is replacing the direct `updateConnectionState("ready")` call in `processDiscoveredCharacteristics` with a bonding manager transition. The `updateConnectionState` function itself (lines 104–116) remains unchanged — it is now driven by the bonding manager callback rather than called directly for bonding-path state changes.

**Pattern for the replacement** (lines 104–116, read-only for reference):
```swift
func updateConnectionState(_ value: String) {
  if !Thread.isMainThread {
    DispatchQueue.main.async { [weak self] in self?.updateConnectionState(value) }
    return
  }
  let previous = connectionState
  connectionState = value
  updateNotificationContext(connectionState: value)
  if previous != value {
    record(source: "ble", title: "connection.state", body: value)
    onConnectionStateChange?(value)
  }
}
```
The replacement call at the `"ready"` site:
```swift
// Was: updateConnectionState("ready")
// Now:
if let peripheralID = activePeripheral?.identifier {
  bondingManager.transition(to: .completed(deviceID: peripheralID))
}
// bondingManager.onBondingStateChange fires → updateConnectionState("ready") called automatically
```

---

### `GooseSwift/LocalizedStatusStrings.swift` (utility, transform) — MODIFY

**Analog:** same file — `localizedConnectionState`, `localizedReconnectState` extensions on `String` (lines 17–103).

The new extension is on `GooseBLEBondingState` (not on `String`), adding `var localizedDescription: String`. It follows the exact `switch self { case ...: return String(localized: "...") }` pattern used throughout the file.

**Extension pattern** (lines 12–26 of `LocalizedStatusStrings.swift`):
```swift
extension String {
  var localizedConnectionState: String {
    switch self {
    case "disconnected": return String(localized: "Disconnected")
    case "connecting": return String(localized: "Connecting")
    case "connected": return String(localized: "Connected")
    case "discovering": return String(localized: "A descobrir...")
    case "ready": return String(localized: "Ligado")
    default: return self
    }
  }
```
The new addition:
```swift
extension GooseBLEBondingState {
  var localizedDescription: String {
    switch self {
    case .notStarted:           return String(localized: "Não iniciado")
    case .started:              return String(localized: "A iniciar...")
    case .subscribed:           return String(localized: "A descobrir...")
    case .completed:            return String(localized: "Ligado")
    case .cancelled(let r):     return r.isEmpty ? String(localized: "Cancelado") : r
    }
  }
}
```
This extension is appended after the last existing `extension String { ... }` block, separated by two blank lines (the file's top-level declaration spacing).

---

## Shared Patterns

### Main-thread dispatch for @Observable mutations
**Source:** `GooseSwift/GooseBLEClient+Commands.swift` lines 104–108
**Apply to:** `GooseBLEBondingManager.transition(to:)` callback dispatch, any state update in the bonding manager that touches `@Observable`-tracked properties.
```swift
if !Thread.isMainThread {
  DispatchQueue.main.async { [weak self] in self?.updateConnectionState(value) }
  return
}
```

### UserDefaults key namespace
**Source:** `GooseSwift/GooseBLEClient.swift` lines 335–353 (`DefaultsKey` enum)
**Apply to:** `GooseBLEBondingManager` static key constants
```swift
enum DefaultsKey {
  static let rememberedDeviceID = "goose.swift.rememberedDeviceID"
  static let rememberedDeviceName = "goose.swift.rememberedDeviceName"
  ...
}
```
Bond state keys: `"goose.swift.ble.bondingState"`, `"goose.swift.ble.bondingDeviceID"` — same `goose.swift.*` prefix.

### Weak self in closures stored on properties
**Source:** `GooseSwift/GooseBLEClient.swift` lines 78–88 (callback properties), `GooseBLEClient+Commands.swift` `updateConnectionState` line 106
**Apply to:** `bondingManager.onBondingStateChange = { [weak self] newState in ... }` wiring in `GooseBLEClient.init()`.
```swift
var onConnectionStateChange: ((String) -> Void)?
```
Always capture `[weak self]`; guard with `guard let self else { return }`.

### OSLog record helper
**Source:** `GooseSwift/GooseBLEClient+Commands.swift` (inherited `record` helper used throughout all extensions)
**Apply to:** All log calls inside `GooseBLEBondingManager` — but the manager does not hold a `Logger` instance directly. Instead, call sites in `GooseBLEClient+CentralDelegate.swift` call `record(level:source:title:body:)` before or after the `bondingManager.transition` call. The manager itself should **not** import OSLog or hold a logger; logging stays in `GooseBLEClient` extensions.

### `String(localized:)` for UI strings
**Source:** `GooseSwift/LocalizedStatusStrings.swift` throughout
**Apply to:** `GooseBLEBondingState.localizedDescription`
```swift
return String(localized: "A descobrir...")
```
No `NSLocalizedString`; always `String(localized:)`.

---

## No Analog Found

All files have close analogs. No entries.

---

## Metadata

**Analog search scope:** `GooseSwift/` (all Swift source files)
**Files scanned:** 7 key files read in full or in targeted ranges
**Pattern extraction date:** 2026-06-11
