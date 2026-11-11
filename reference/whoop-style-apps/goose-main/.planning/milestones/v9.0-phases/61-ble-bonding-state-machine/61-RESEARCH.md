# Phase 61: BLE Bonding State Machine — Research

**Researched:** 2026-06-11
**Domain:** CoreBluetooth bonding lifecycle management, Swift state machine patterns
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BLE-BOND-01 | A `GooseBLEBondingManager` type exists with 5 formal states (NotStarted→Started→Subscribed→Completed/Cancelled); bonding progress is observable from `GooseAppModel`; bond loss on BT reset / iOS reboot is detected, triggers re-entry into bonding flow without user action; bonding state is persisted across restarts; string-based `connectionState` is replaced by the formal state machine output for the bonding portion | Sections: Standard Stack, Architecture Patterns, Code Examples |
</phase_requirements>

---

## Summary

Phase 61 replaces the implicit OS bonding path with a formal 5-state `GooseBLEBondingManager` that mirrors WHOOP's `WHPBLEBondingManager` pattern. Currently, `GooseBLEClient` tracks bonding as part of a single string `connectionState` property (values: `"disconnected"`, `"connecting"`, `"discovering"`, `"connected"`, `"ready"`). The states `"discovering"` through `"ready"` are actually the bonding progression — they will be replaced with a typed enum managed by the new bonding manager.

CoreBluetooth does not expose a bonding API directly. On iOS, BLE bonding (pairing) is triggered implicitly by the OS when a peripheral requests encrypted characteristics or when ATT operations fail with `CBATTError.insufficientAuthentication`. Bond loss is signalled by disconnect with a CoreBluetooth error (often `CBError.peerRemovedPairingInformation`, code 14, or ATT authentication error code 15). The bonding manager must intercept these signals and re-enter the bonding flow automatically.

The WHOOP reverse-engineering evidence (`ObjC_RESOLVED.txt`) shows: `WHPBLEBondingManager` has a `bondingTimer`, a `bleBondingDelegate`, and methods `bondingFailWithLostBonding:` and `bondingLinkvalid`. The log string `"Peripheral lost the bonding ->"` is emitted on bond loss and triggers re-bonding. The five state classes are all plain `class` types (not enums), but for Goose a Swift `enum` with associated values is idiomatic and more testable.

**Primary recommendation:** Implement `GooseBLEBondingManager` as a plain Swift `final class` owned by `GooseBLEClient`, exposing a `@Observable` (or `@Published`) `bondingState: GooseBLEBondingState` enum. Connect it to the existing delegate callbacks already present in `GooseBLEClient`. Replace all string-based bonding comparisons (`connectionState == "ready"`) with the typed state. Persist the last known bonding state to `UserDefaults` using a new `DefaultsKey`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bond state tracking | `GooseBLEClient` (BLE layer) | `GooseAppModel` (read-only observation) | Bonding is a BLE-transport concern; app model only observes |
| Bond loss detection | `GooseBLEClient+CentralDelegate` | `GooseBLEBondingManager` | CoreBluetooth delegate methods already land in GooseBLEClient |
| Bond state persistence | `GooseBLEBondingManager` (write) | `UserDefaults` (store) | Stateless across restarts; same pattern as `rememberedDeviceID` |
| UI observation of bond state | `GooseAppModel` | SwiftUI views | Model exposes typed state; views read via `@EnvironmentObject` |
| Re-bonding flow trigger | `GooseBLEBondingManager` | `GooseBLEClient.attemptAutomaticReconnect` | Manager resets to `.notStarted`, triggers reconnect cycle |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CoreBluetooth | iOS 26 SDK | BLE central manager, peripheral delegate, ATT error codes | Only option for BLE on iOS |
| Foundation | iOS 26 SDK | `UserDefaults`, `DispatchQueue`, `NSLock` | Required for persistence and thread safety |
| OSLog | iOS 26 SDK | Structured logging via existing `GooseBLEClient.logger` | Already used throughout BLE layer |

No external packages needed. This phase is pure Swift/CoreBluetooth. [VERIFIED: project CLAUDE.md — "Tech stack iOS: Swift/SwiftUI/URLSession — não introduzir dependências externas"]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Observation (`@Observable`) | iOS 17+ / iOS 26 | Make `GooseBLEBondingManager` observable | Already used in `GooseBLEClient` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `enum GooseBLEBondingState` (typed) | `String` (current) | Strings: fragile comparisons, hard to test. Enum: compiler-enforced exhaustiveness. Use enum. |
| `@Observable` on manager | `@Published` | `@Observable` is the modern approach (iOS 17+) already used by `GooseBLEClient`. Use `@Observable`. |
| Separate file `GooseBLEBondingManager.swift` | Nested type inside `GooseBLEClient` | Extension-split pattern already established; separate file is clearer. |

**Installation:** No packages to install.

---

## Package Legitimacy Audit

No external packages are installed in this phase. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
iOS BT Stack
    │
    │ CBCentralManager delegate callbacks
    │ (didConnect, didDisconnect, didFailToConnect)
    ▼
GooseBLEClient+CentralDelegate
    │
    │ calls bondingManager.transition(event:)
    ▼
GooseBLEBondingManager
    │ bondingState: GooseBLEBondingState  ──────▶  UserDefaults persistence
    │   .notStarted                                 ("goose.swift.ble.bondingState")
    │   .started
    │   .subscribed
    │   .completed(deviceID: UUID)
    │   .cancelled(reason: String)
    │
    │ onBondingStateChange: ((GooseBLEBondingState) -> Void)?
    ▼
GooseBLEClient (bridges state change to connectionState update)
    │
    │ connectionState string updated from bonding state
    │ onConnectionStateChange? callback fired
    ▼
GooseAppModel.handleBLEConnectionStateChange(_ state: String)
    │ (existing hook — no new coupling needed in Phase 61)
    ▼
SwiftUI views observe GooseBLEClient.connectionState (unchanged API surface)
```

**Bond loss path:**
```
CBCentralManager.didDisconnectPeripheral(error: CBError.peerRemovedPairingInformation)
    │
    ▼
GooseBLEClient+CentralDelegate detects error code 14 (or ATT code 15)
    │
    ▼
bondingManager.transition(.bondLost) → state = .notStarted
    │
    ▼
GooseBLEClient.scheduleNextReconnect(reason: "bond_lost")
    │
    ▼
Re-enter bonding flow on next connect
```

### Recommended Project Structure

```
GooseSwift/
├── GooseBLEBondingManager.swift     # New file: GooseBLEBondingState enum + GooseBLEBondingManager class
├── GooseBLEClient.swift             # Add: var bondingManager = GooseBLEBondingManager()
├── GooseBLEClient+CentralDelegate.swift  # Modify: call bondingManager on connect/disconnect
├── GooseBLEClient+PeripheralDelegate.swift  # Modify: call bondingManager.transition(.subscribed) on first characteristic subscription
├── GooseBLEClient+Commands.swift    # Modify: updateConnectionState("ready") triggers bondingManager.transition(.completed)
├── LocalizedStatusStrings.swift     # Add: localizedBondingState for new enum
```

### Pattern 1: GooseBLEBondingState Enum

**What:** A typed enum representing the 5 WHOOP-equivalent bonding states, mapping to the existing connection lifecycle.
**When to use:** Replace all string comparisons involving the bonding portion of `connectionState`.

```swift
// Source: WHOOP RE (ObjC_RESOLVED.txt lines 35851–35855, 66643–66647) + CoreBluetooth docs [ASSUMED: exact Swift spelling]
enum GooseBLEBondingState: Equatable {
  case notStarted
  case started             // CBCentralManager.connect(_:options:) called
  case subscribed          // All notification characteristics subscribed (didUpdateNotificationState)
  case completed(deviceID: UUID)  // commandCharacteristic ready → "ready" state reached
  case cancelled(reason: String)  // Explicit disconnect, BT off, bond lost

  var isReady: Bool {
    if case .completed = self { return true }
    return false
  }

  var connectionStateString: String {
    switch self {
    case .notStarted:         return "disconnected"
    case .started:            return "connecting"
    case .subscribed:         return "discovering"
    case .completed:          return "ready"
    case .cancelled(let r):   return r.isEmpty ? "disconnected" : r
    }
  }

  // Persistence: raw string for UserDefaults
  var persistenceKey: String {
    switch self {
    case .notStarted:   return "notStarted"
    case .started:      return "started"
    case .subscribed:   return "subscribed"
    case .completed:    return "completed"
    case .cancelled:    return "notStarted"  // reset on next launch
    }
  }
}
```

**IMPORTANT:** `"connected"` (service-connected but no command characteristic yet) maps to `.subscribed` in the bonding manager. The existing `updateConnectionState("connected")` in `processDiscoveredCharacteristics` already covers this transition.

### Pattern 2: GooseBLEBondingManager Class

**What:** A dedicated manager type that owns state, persistence, and a timer for bond loss detection. Owned by `GooseBLEClient`.
**When to use:** Create once in `GooseBLEClient`'s property list; never instantiate ad-hoc.

```swift
// Source: WHOOP RE (ObjC_RESOLVED.txt lines 66905–66909) + codebase patterns [ASSUMED: exact Swift API]
final class GooseBLEBondingManager {
  private(set) var bondingState: GooseBLEBondingState = .notStarted

  // Callback invoked on every state transition (on main thread).
  var onBondingStateChange: ((GooseBLEBondingState) -> Void)?

  // UserDefaults key for persisting the last completed/cancelled state.
  static let bondingStateKey = "goose.swift.ble.bondingState"
  static let bondingDeviceIDKey = "goose.swift.ble.bondingDeviceID"

  init() {
    loadPersistedState()
  }

  func transition(to newState: GooseBLEBondingState) {
    guard newState != bondingState else { return }
    bondingState = newState
    persistState()
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.onBondingStateChange?(self.bondingState)
    }
  }

  private func persistState() {
    UserDefaults.standard.set(bondingState.persistenceKey, forKey: Self.bondingStateKey)
    if case .completed(let id) = bondingState {
      UserDefaults.standard.set(id.uuidString, forKey: Self.bondingDeviceIDKey)
    }
  }

  private func loadPersistedState() {
    let key = UserDefaults.standard.string(forKey: Self.bondingStateKey) ?? ""
    switch key {
    case "completed":
      if let uuidString = UserDefaults.standard.string(forKey: Self.bondingDeviceIDKey),
         let uuid = UUID(uuidString: uuidString) {
        bondingState = .completed(deviceID: uuid)
      }
    default:
      bondingState = .notStarted
    }
  }
}
```

### Pattern 3: Bond Loss Detection via CoreBluetooth Error Codes

**What:** Detect bond loss (peripheral forgot pairing) from `didDisconnectPeripheral` error code.
**When to use:** In `GooseBLEClient+CentralDelegate.centralManager(_:didDisconnectPeripheral:error:)`.

```swift
// Source: CoreBluetooth documentation [ASSUMED: exact error code values — verify with Apple docs]
// CBError.Code.peerRemovedPairingInformation = 14
// CBATTError.Code.insufficientAuthentication = 15

func isBondLossError(_ error: Error?) -> Bool {
  guard let error else { return false }
  let nsError = error as NSError
  if nsError.domain == CBErrorDomain && nsError.code == 14 { return true }   // peerRemovedPairingInformation
  if nsError.domain == CBATTErrorDomain && nsError.code == 15 { return true } // insufficientAuthentication
  return false
}
```

**Verified signal in WHOOP RE:** The log string `"Peripheral lost the bonding ->"` (ObjC_RESOLVED.txt line 71357) confirms WHOOP detects this at the disconnect callback level, not via a separate ATT error observer. The method `bondingFailWithLostBonding:` (line 126454) is the handler.

### Pattern 4: Integration with Existing reconnect cycle

**What:** Bond loss should trigger the existing `scheduleNextReconnect` path with a `"bond_lost"` reason.
**When to use:** After `bondingManager.transition(to: .notStarted)` due to bond loss.

```swift
// In GooseBLEClient+CentralDelegate.centralManager(_:didDisconnectPeripheral:error:):
// Replace existing block — add before shouldReconnect check:
if isBondLossError(error) {
  bondingManager.transition(to: .cancelled(reason: "bond_lost"))
  record(level: .warn, source: "ble.bonding", title: "bond.lost", body: error?.localizedDescription ?? "")
  bondingManager.transition(to: .notStarted)  // ready for re-bonding
}
```

### Pattern 5: connectionState Bridge (Backward Compatibility)

**What:** The 25+ call sites that compare `connectionState == "ready"` must not break. The bonding manager drives `connectionState` via the existing `updateConnectionState()` method.
**When to use:** In `GooseBLEBondingManager.onBondingStateChange`.

```swift
// In GooseBLEClient: wire up the bonding manager callback
bondingManager.onBondingStateChange = { [weak self] newState in
  self?.updateConnectionState(newState.connectionStateString)
}
```

This means `connectionState` remains a `String` (no breaking change to 25+ comparison sites) but is now **driven by the bonding manager** rather than set ad-hoc throughout the codebase.

**Key insight:** Phase 65 (Generic State Machine) will be the phase that fully migrates away from string-based status. Phase 61's scope is to introduce the formal manager while preserving the existing string API surface.

### Anti-Patterns to Avoid

- **Setting `connectionState` directly while bonding manager exists:** All bonding-path transitions must go through `bondingManager.transition(to:)` → `onBondingStateChange` → `updateConnectionState()`. Direct calls to `updateConnectionState("ready")` that bypass the manager will desynchronise state. The non-bonding states (`"bluetooth unavailable"`, `"not a WHOOP device"`, `"hello blocked"`, error strings from GATT discovery) can still call `updateConnectionState` directly — they are not bonding states.
- **Storing bond state in `GooseBLEClient` directly:** All bonding state goes through `GooseBLEBondingManager`. `GooseBLEClient` only reads `bondingManager.bondingState` when needed.
- **Re-entering bonding from `@MainActor` synchronously:** Bond loss may trigger reconnect scheduling on `coreBluetoothQueue`. Use `coreBluetoothQueue.async` as the existing reconnect cycle does.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bond loss detection | Custom characteristic subscription monitoring | CoreBluetooth disconnect error code 14 (`peerRemovedPairingInformation`) | OS provides the signal directly on disconnect |
| Pairing/encryption negotiation | Manual ATT pairing sequence | iOS handles pairing implicitly when encrypted characteristic is accessed | iOS handles the entire BLE security negotiation |
| Bonding timer for OS-level pairing timeout | Custom `DispatchWorkItem` timeout | Let iOS manage the pairing dialog timeout | Interfering with the OS pairing timeout causes undefined behaviour |

**Key insight:** WHOOP's `bondingTimer` (seen in RE) is for their custom UI timeout (showing the "Pair WHOOP?" prompt), not for the OS-level bonding. Goose does not show a pairing prompt; iOS handles it automatically. The `bondingTimer` equivalent in Goose is the existing `reconnectBackoff` circuit breaker.

---

## Runtime State Inventory

This is not a rename/refactor phase — no runtime state rename is required. The new UserDefaults keys (`goose.swift.ble.bondingState`, `goose.swift.ble.bondingDeviceID`) are **new additions**, not renames.

**Nothing found in category:** No data migration required.

---

## Common Pitfalls

### Pitfall 1: The `"connected"` vs `"discovering"` ambiguity

**What goes wrong:** `GooseBLEClient` currently sets `connectionState = "connected"` when a service is found but no command characteristic exists yet (`processDiscoveredCharacteristics` line 1043). This is distinct from `"discovering"` (GATT service discovery in progress). The bonding manager must map both to `.subscribed` since both are mid-bonding states.
**Why it happens:** The original code did not conceptualise bonding as a separate lifecycle from connection.
**How to avoid:** In `GooseBLEBondingManager`, treat any state between `.started` and `.completed` as `.subscribed`. The `connectionStateString` property can still return `"discovering"` or `"connected"` as needed for the existing string-based comparisons.
**Warning signs:** If `"connected"` disappears from `localizedConnectionState` display, the bridge is broken.

### Pitfall 2: Calling `updateConnectionState` in non-bonding paths

**What goes wrong:** There are ~10 direct calls to `updateConnectionState` for error states (`"hello blocked"`, `"bluetooth unavailable"`, `"not a WHOOP device"`, GATT error strings). These must NOT be routed through the bonding manager — they are not bonding transitions.
**Why it happens:** Conflating connection errors with bonding state.
**How to avoid:** Only route the 4 core bonding transitions through the manager: `started`, `subscribed`, `completed`, `cancelled/notStarted`. Error strings remain direct `updateConnectionState` calls.
**Warning signs:** Error strings like `"hello blocked"` appear in `localizedBondingState`.

### Pitfall 3: Bond loss not distinguished from clean disconnect

**What goes wrong:** If bond loss is treated as a regular disconnect, the app will attempt reconnect without clearing the bond, causing authentication failures in a loop.
**Why it happens:** Error code 14 is not checked; all disconnects treated equally.
**How to avoid:** Check `CBError.peerRemovedPairingInformation` (code 14) and `CBATTError.insufficientAuthentication` (code 15) in `didDisconnectPeripheral`. Transition to `.cancelled(reason: "bond_lost")` then immediately to `.notStarted` before scheduling reconnect.
**Warning signs:** Reconnect loop that never reaches `.completed` after a BT reset.

### Pitfall 4: Breaking 25+ comparison sites for `connectionState == "ready"`

**What goes wrong:** Changing `connectionState` to a typed enum (Phase 65 scope) would break all 25+ sites found across 10 files.
**Why it happens:** Scope creep — attempting to fully type the connection state in Phase 61.
**How to avoid:** Phase 61 keeps `connectionState: String` unchanged. The bonding manager drives it via the existing `updateConnectionState()` bridge. Phase 65 handles the full enum migration.
**Warning signs:** Compiler errors in `GooseAppModel+BandFirstSync`, `MoreDebugViews`, `OnboardingStepViews` etc.

### Pitfall 5: Persisting `.cancelled` state

**What goes wrong:** Persisting `.cancelled(reason:)` to UserDefaults means the app relaunches into a cancelled state instead of `.notStarted`, preventing auto-reconnect.
**Why it happens:** Naive serialisation of all enum cases.
**How to avoid:** Map `.cancelled` to `"notStarted"` in `persistenceKey`. On launch, `.cancelled` always resolves to `.notStarted`.
**Warning signs:** App launches and `bondingState` is stuck in a non-reconnecting state.

---

## Code Examples

### Wiring GooseBLEBondingManager into GooseBLEClient

```swift
// Source: Codebase pattern (GooseBLEClient.swift lines 96–114) [ASSUMED: exact integration code]
// In GooseBLEClient (GooseBLEClient.swift), add property:
let bondingManager = GooseBLEBondingManager()

// In GooseBLEClient.init():
bondingManager.onBondingStateChange = { [weak self] newState in
  guard let self else { return }
  // Drive existing connectionState string from bonding manager
  self.updateConnectionState(newState.connectionStateString)
  // Fire existing callback that GooseAppModel listens to
  // (onConnectionStateChange is already called inside updateConnectionState)
}
```

### Transition on didConnect

```swift
// In GooseBLEClient+CentralDelegate.centralManager(_:didConnect:) [ASSUMED: integration]
// Replace: updateConnectionState("discovering")
// With:
bondingManager.transition(to: .started)
// Then immediately transition to .subscribed when GATT discovery begins:
peripheral.discoverServices(serviceDiscoveryIDs)
bondingManager.transition(to: .subscribed)
```

### Transition on Command Characteristic Ready

```swift
// In GooseBLEClient+Commands.processDiscoveredCharacteristics (line 1037) [ASSUMED]
// Replace: updateConnectionState("ready")
// With:
if let peripheralID = activePeripheral?.identifier {
  bondingManager.transition(to: .completed(deviceID: peripheralID))
}
// bondingManager.onBondingStateChange fires → updateConnectionState("ready") is called
```

### Transition on Disconnect / Bond Loss

```swift
// In GooseBLEClient+CentralDelegate.centralManager(_:didDisconnectPeripheral:error:) [ASSUMED]
let bondLost = isBondLossError(error)
if bondLost {
  bondingManager.transition(to: .cancelled(reason: "bond_lost"))
  record(level: .warn, source: "ble.bonding", title: "bond.lost", body: error?.localizedDescription ?? "")
}
bondingManager.transition(to: .notStarted)
// existing reconnect logic follows unchanged
```

### LocalizedStatusStrings extension for bonding state

```swift
// In LocalizedStatusStrings.swift [ASSUMED: following existing pattern]
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

---

## Current connectionState String Inventory

The following string values are currently set by `updateConnectionState()`. Only values in the **bonding path** column are replaced by the bonding manager; **error/non-bonding** values continue as direct calls.

| String value | Where set | Bonding path? | New bonding state |
|---|---|---|---|
| `"disconnected"` | `centralManagerDidUpdateState` (BT off), `didDisconnectPeripheral` | Yes | `.notStarted` |
| `"connecting"` | `connect(_:reason:)` | Yes | `.started` |
| `"discovering"` | `centralManager(_:didConnect:)` | Yes | `.subscribed` |
| `"connected"` | `processDiscoveredCharacteristics` (service found, no cmd char) | Yes | `.subscribed` |
| `"ready"` | `processDiscoveredCharacteristics` (cmd char found) | Yes | `.completed(deviceID:)` |
| `"connect failed"` | `centralManager(_:didFailToConnect:error:)` | Partial — transition to `.cancelled(reason:)` |
| `"bluetooth unavailable"` | `connect()`, `connectSelected()` | No — direct call retained |
| `"not a WHOOP device"` | `connect()`, `GooseBLEClient+Parsing` | No — direct call retained |
| `"hello blocked"` | `sendClientHello()` | No — direct call retained |
| `"no device selected"` | `connectSelected()` | No — direct call retained |
| Error `localizedDescription` strings | `didDisconnectPeripheral`, GATT errors | Partial — disconnect with bond loss → `.cancelled` |

**Callers of `connectionState == "ready"` (25+ sites) remain unchanged** — the bonding manager drives the value to `"ready"` via `updateConnectionState`.

---

## State Machine Transition Table

| Current State | Event | Next State | Side Effect |
|---|---|---|---|
| `.notStarted` | `connect()` called | `.started` | `updateConnectionState("connecting")` |
| `.started` | `didConnect` received | `.subscribed` | `updateConnectionState("discovering")` + start GATT discovery |
| `.subscribed` | Command characteristic discovered | `.completed(deviceID:)` | `updateConnectionState("ready")` + persist state |
| `.subscribed` | `didDisconnect` (clean) | `.notStarted` | `updateConnectionState("disconnected")` |
| `.subscribed` | `didDisconnect` (bond lost, error 14) | `.cancelled("bond_lost")` → `.notStarted` | Log warning + `updateConnectionState("disconnected")` |
| `.completed` | `didDisconnect` (any) | `.notStarted` | `updateConnectionState(error ?? "disconnected")` |
| `.completed` | BT powered off | `.notStarted` | `updateConnectionState("disconnected")` |
| Any | BT powered off | `.notStarted` | Reset |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Implicit OS bonding, string status | Same (what Phase 61 replaces) | — | Silent failures on bond loss |
| Direct `updateConnectionState` everywhere | Bonding manager drives state (Phase 61) | Phase 61 | Typed, testable, observable |
| String `connectionState` everywhere | String preserved at API level, typed internally (Phase 61); full typed migration (Phase 65) | Phase 61/65 | No breaking change |

**Deprecated/outdated after Phase 61:**
- Direct `updateConnectionState("ready")` in `processDiscoveredCharacteristics` — replaced by `bondingManager.transition(to: .completed(deviceID:))`
- Direct `updateConnectionState("connecting")` in `connect()` — replaced by `bondingManager.transition(to: .started)`
- Direct `updateConnectionState("discovering")` in `centralManager(_:didConnect:)` — replaced by `bondingManager.transition(to: .subscribed)`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CBError.peerRemovedPairingInformation` has code 14; `CBATTError.insufficientAuthentication` has code 15 | Architecture Patterns / Common Pitfalls | Bond loss detection fails; use exact Apple constants in code not raw ints |
| A2 | Exact Swift spelling of `GooseBLEBondingManager` and `GooseBLEBondingState` in code examples | Code Examples | Compilation errors — naming is intentional, not a risk |
| A3 | `bondingTimer` in WHOOP is for custom UI timeout, not OS bonding timeout | Don't Hand-Roll | If WHOOP timer fires a CBCentralManager API — unlikely given iOS does not expose pairing timeout |
| A4 | WHOOP's 5 states map cleanly to the existing Goose connection lifecycle without an intermediate state | Architecture Patterns | May need a 6th state (e.g., `"connected"` between `subscribed` and `completed`) — mitigated by mapping both to `.subscribed` |

---

## Open Questions (RESOLVED)

1. **Should `GooseBLEBondingManager` be `@Observable` or a plain class with callback?**
   - What we know: `GooseBLEClient` is already `@Observable`; bonding state is a property of it
   - What's unclear: Whether SwiftUI views need to observe `bondingManager.bondingState` directly, or always go through `GooseBLEClient.connectionState`
   - Recommendation: Use a plain class with `onBondingStateChange` callback (as shown). SwiftUI always reads `GooseBLEClient.connectionState`. The manager does not need to be `@Observable` itself — only `GooseBLEClient` needs to be.

2. **What is the exact CoreBluetooth error code for bond loss?**
   - What we know: Common codes cited in CoreBluetooth community are 14 (`peerRemovedPairingInformation`) and ATT code 15
   - What's unclear: Whether both codes appear consistently across iOS versions
   - Recommendation: Use the named constants (`CBError.peerRemovedPairingInformation`, `CBATTError.insufficientAuthentication`) in the implementation, not raw integers. Let the planner add a verification task that tests against a real device BT reset.

3. **Does `GooseAppModel` need a `bondingState` property, or is `ble.connectionState == "ready"` sufficient?**
   - What we know: 25+ comparison sites already work with the string; Phase 61 success criteria says "bonding progress is observable from `GooseAppModel`"
   - What's unclear: Whether a new `@Published var bondingState: GooseBLEBondingState` on `GooseAppModel` is required, or `ble.connectionState` bridged from the manager is sufficient
   - Recommendation: Add `var bondingState: GooseBLEBondingState { ble.bondingManager.bondingState }` as a computed property on `GooseAppModel` to satisfy observability. No extra `@Published` needed since `GooseBLEClient` is `@Observable`.

---

## Environment Availability

This phase is code-only (Swift). No external tools are required beyond the existing Xcode toolchain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode / Swift compiler | Build | ✓ | Xcode 26.5 / Swift 6.3.2 | — |
| iOS 26 SDK | CoreBluetooth | ✓ | iOS 26.0 deployment target | — |
| WHOOP band (physical device) | Bond loss verification | Unknown | — | Simulator cannot simulate bond loss; test via BT system toggle |

**Missing dependencies with no fallback:**
- Real WHOOP device for bond loss end-to-end test. Plan must include a `checkpoint:human-verify` task for the bond-loss scenario.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test`; Swift: no XCTest target detected |
| Config file | No Swift test target in Goose.xcodeproj |
| Quick run command | `cargo test --manifest-path Rust/core/Cargo.toml` |
| Full suite command | `cargo test --manifest-path Rust/core/Cargo.toml` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BLE-BOND-01a | `GooseBLEBondingState` enum transitions are exhaustive and correct | unit (Swift — manual in simulator) | — | ❌ No Swift test target |
| BLE-BOND-01b | Bond state persisted to UserDefaults; survives simulated restart | manual | — | ❌ No Swift test target |
| BLE-BOND-01c | Bond loss (BT toggle) triggers `.notStarted` → reconnect flow | manual (real device or BT toggle) | — | ❌ Requires hardware |
| BLE-BOND-01d | `connectionState == "ready"` still works at 25+ comparison sites | build + run | `xcodebuild build` | ❌ CI config TBD |

### Sampling Rate

- **Per task commit:** Visual inspection of OSLog for bonding state transitions
- **Per wave merge:** Simulator build + connect/disconnect cycle; verify bonding state in Xcode console
- **Phase gate:** `checkpoint:human-verify` for real-device BT toggle bond loss scenario

### Wave 0 Gaps

- [ ] No Swift unit test target exists — unit tests for `GooseBLEBondingState` transitions must be verified manually in simulator
- [ ] Bond loss cannot be simulated in the Simulator; requires physical device + BT toggle

*(No automated test infrastructure gaps beyond what already exists in the project — the project has no Swift test target by design)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | BLE packets not validated in this phase |
| V6 Cryptography | No | BLE bonding encryption is OS-managed |

**Security notes:**
- BLE pairing/bonding on iOS is handled by the OS. Goose does not implement custom BLE security. The bonding manager tracks state but does not participate in the cryptographic pairing exchange.
- `UserDefaults` is used for state persistence. Bond state is not sensitive data (it contains a peripheral UUID and a state label). No Keychain required.
- No new network calls in this phase.

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bond state spoofing via UserDefaults | Tampering | OS sandbox prevents other apps from reading/writing our UserDefaults |
| Reconnect loop on bond loss | Denial of Service | Existing `ReconnectBackoff` circuit breaker (10 attempts) applies |

---

## Sources

### Primary (HIGH confidence)
- `GooseSwift/GooseBLEClient.swift` — current `connectionState` string values, `DefaultsKey` enum, `reconnectBackoff`
- `GooseSwift/GooseBLEClient+CentralDelegate.swift` — all `updateConnectionState` call sites in delegate methods
- `GooseSwift/GooseBLEClient+Commands.swift` — `updateConnectionState("ready")` at line 1037, `updateConnectionState("connecting")` at line 744
- `.planning/research/whoop-re/ObjC_RESOLVED.txt` — WHOOP bonding type names (lines 35851–35855, 66905–66909, 71357, 126454–126455)
- `.planning/research/whoop-re/WHOOP-GOOSE-CROSS-COMPARE.md` — gap analysis section 1
- `GooseSwift/LocalizedStatusStrings.swift` — full enumeration of all `connectionState` string values [VERIFIED: direct codebase read]
- `GooseSwift/GooseBLEReconnect.swift` — `ReconnectBackoff` pattern to reuse [VERIFIED: direct codebase read]

### Secondary (MEDIUM confidence)
- `GooseSwift/GooseAppModel+BandFirstSync.swift` — `ble.connectionState == "ready"` usage (the primary integration point)
- `GooseSwift/GooseAppModel+Lifecycle.swift` — `handleBLEConnectionStateChange` bridge hook

### Tertiary (LOW confidence / ASSUMED)
- Exact CoreBluetooth error codes for bond loss (`CBError` code 14, `CBATTError` code 15) — training knowledge, verify with Apple documentation

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no external packages; CoreBluetooth only
- Architecture: HIGH — derived directly from codebase read + WHOOP RE evidence
- Pitfalls: HIGH — derived from thorough codebase grep of 25+ `connectionState == "ready"` sites
- CoreBluetooth bond loss error codes: LOW (ASSUMED) — verify with Apple docs before coding

**Research date:** 2026-06-11
**Valid until:** 2026-09-11 (CoreBluetooth API is stable; WHOOP RE evidence is static)
