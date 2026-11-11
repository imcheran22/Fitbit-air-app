---
phase: 61-ble-bonding-state-machine
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/GooseBLEBondingManager.swift
  - GooseSwift/GooseBLEClient.swift
  - GooseSwift/GooseBLEClient+CentralDelegate.swift
  - GooseSwift/GooseBLEClient+Commands.swift
  - GooseSwift/GooseBLETypes.swift
  - GooseSwift/LocalizedStatusStrings.swift
findings:
  critical: 3
  warning: 3
  info: 1
  total: 7
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The BLE bonding state machine is mostly well-structured. The `GooseBLEBondingState` enum and `GooseBLEBondingManager` are clean, the `dispatchCoreBluetoothDelegateToMainIfNeeded` pattern is applied consistently across all six delegate entry points, and the 33+ `connectionState == "ready"` comparison sites remain intact (backward-compatible, as required).

Three blocking issues were found, all in `GooseBLEClient+CentralDelegate.swift`: (1) the bond-loss branch in `didDisconnectPeripheral` transitions through `.cancelled` and then immediately overwrites that state with `.notStarted`, so the `.cancelled` state is always shadowed before the `onBondingStateChange` callback fires on the main thread; (2) a direct `updateConnectionState()` call that follows the bonding-manager transitions bypasses the bonding manager entirely and produces a second, racing `connectionState` write; and (3) the bond-loss detection is missing `CBError.encryptionTimedOut`, which is a documented bond-loss indicator on iOS.

---

## Critical Issues

### CR-01: `.cancelled` bonding state immediately overwritten — bond loss is silently swallowed

**File:** `GooseSwift/GooseBLEClient+CentralDelegate.swift:287-291`

**Issue:** In `didDisconnectPeripheral`, when a bond-loss error is detected, the code transitions to `.cancelled(reason: "bond_lost")` and then unconditionally calls `bondingManager.transition(to: .notStarted)` on the very next line. Both `transition()` calls are synchronous: they set `bondingState`, call `persistState()`, and then post `onBondingStateChange` via `DispatchQueue.main.async`. Because the two `.async` blocks are enqueued back-to-back, the main-thread callback always fires with the _second_ state (`.notStarted`). The `.cancelled` state is never observable by any listener — `GooseAppModel.bondingState` will never be `.cancelled`, and `LocalizedStatusStrings` localisation for the cancelled case is dead code.

```swift
// Current (broken):
if isBondLossError(error) {
    bondingManager.transition(to: .cancelled(reason: "bond_lost"))  // async callback posted
    record(level: .warn, source: "ble.bonding", title: "bond.lost", body: ...)
}
bondingManager.transition(to: .notStarted)  // immediately overwrites — callback fires here
updateConnectionState(error?.localizedDescription ?? "disconnected")  // third write below
```

**Fix:** Either keep `.cancelled` as a terminal state for the bond-loss path (and let the UI react before re-connecting), or skip the intermediate `.cancelled` transition and emit a log event only:

```swift
// Option A — cancel is the terminal state; caller handles reconnect from it:
if isBondLossError(error) {
    bondingManager.transition(to: .cancelled(reason: "bond_lost"))
    record(level: .warn, source: "ble.bonding", title: "bond.lost", body: error?.localizedDescription ?? "")
    // Do NOT follow with .notStarted here; let the auto-reconnect path call .started/.notStarted
} else {
    bondingManager.transition(to: .notStarted)
}

// Option B — remove .cancelled, just log and transition once:
if isBondLossError(error) {
    record(level: .warn, source: "ble.bonding", title: "bond.lost", body: error?.localizedDescription ?? "")
}
bondingManager.transition(to: .notStarted)
```

---

### CR-02: `updateConnectionState()` after bonding transitions creates a duplicate, racing write

**File:** `GooseSwift/GooseBLEClient+CentralDelegate.swift:291-292`

**Issue:** Immediately after the two `bondingManager.transition()` calls, `updateConnectionState(error?.localizedDescription ?? "disconnected")` is called directly. `updateConnectionState` posts to `DispatchQueue.main.async` when not on the main thread, which means there are now _three_ asynchronous `connectionState` mutations queued in the same disconnect handler. After the bonding manager's callback fires (`.notStarted` → `"disconnected"`), the direct `updateConnectionState` call fires a second time with `error.localizedDescription` (e.g. `"The specified device has disconnected from us."`). This third write sets `connectionState` to the raw system error string, bypassing the bonding manager's `connectionStateString` contract entirely, and causing `connectionState == "ready"` guards in 33 locations to continue working correctly but makes the displayed connection state text wrong (it shows Apple's internal English string rather than the mapped "disconnected").

This is also the reason `LocalizedStatusStrings.localizedConnectionState` has a `default: return self` fallback — it catches these raw error strings.

```swift
// Current (line 291-292):
bondingManager.transition(to: .notStarted)        // sets connectionState = "disconnected"
updateConnectionState(error?.localizedDescription ?? "disconnected")  // overwrites with raw error
```

**Fix:** Remove the direct `updateConnectionState` call from the disconnect path. All state transitions must go through `bondingManager.transition()` so that `connectionStateString` is the single source of truth:

```swift
// For the error case, let the bonding manager own the state:
if isBondLossError(error) {
    record(level: .warn, source: "ble.bonding", title: "bond.lost", body: error?.localizedDescription ?? "")
}
bondingManager.transition(to: .notStarted)
// Remove: updateConnectionState(error?.localizedDescription ?? "disconnected")
record(
    level: error == nil ? .info : .warn,
    source: "ble",
    title: "disconnect",
    body: error?.localizedDescription ?? peripheral.identifier.uuidString
)
```

---

### CR-03: `isBondLossError` misses `CBError.encryptionTimedOut` — bond losses go undetected on reconnect

**File:** `GooseSwift/GooseBLEClient+CentralDelegate.swift:248-258`

**Issue:** `isBondLossError` checks two error conditions: `CBError.peerRemovedPairingInformation` and `CBATTError.insufficientAuthentication`. However, on iOS, a lost pairing bond also produces `CBError.encryptionTimedOut` (code 9) when the device is powered on but the pairing key has been removed from the peer side without sending a `peerRemovedPairingInformation` event. This is the common failure mode when a WHOOP is factory-reset or re-paired from another device. Without detecting this code, the reconnect path will attempt to reconnect without clearing the stale bond record, causing repeated connect-then-fail cycles.

```swift
// Current — misses encryptionTimedOut:
func isBondLossError(_ error: Error?) -> Bool {
    guard let error else { return false }
    let nsError = error as NSError
    if nsError.domain == CBErrorDomain && nsError.code == CBError.peerRemovedPairingInformation.rawValue {
        return true
    }
    if nsError.domain == CBATTErrorDomain && nsError.code == CBATTError.insufficientAuthentication.rawValue {
        return true
    }
    return false
}
```

**Fix:** Add the `encryptionTimedOut` case:

```swift
func isBondLossError(_ error: Error?) -> Bool {
    guard let error else { return false }
    let nsError = error as NSError
    if nsError.domain == CBErrorDomain {
        let code = CBError.Code(rawValue: nsError.code)
        if code == .peerRemovedPairingInformation || code == .encryptionTimedOut {
            return true
        }
    }
    if nsError.domain == CBATTErrorDomain && nsError.code == CBATTError.insufficientAuthentication.rawValue {
        return true
    }
    return false
}
```

---

## Warnings

### WR-01: `GooseBLEBondingManager.transition()` mutates `bondingState` on the calling thread (BLE queue), then posts callback to main — no synchronization on `bondingState` itself

**File:** `GooseSwift/GooseBLEBondingManager.swift:19-27`

**Issue:** `transition()` is called on the main thread (via `dispatchCoreBluetoothDelegateToMainIfNeeded`) in all the CentralDelegate paths, which is correct. However, in `GooseBLEClient+Commands.swift:744`, `connect()` calls `bondingManager.transition(to: .started)` and that function is itself guarded with `if !Thread.isMainThread { DispatchQueue.main.async ... return }`, so in practice transition always runs on main. The issue is that `GooseBLEBondingManager` has no `@MainActor` annotation, no thread protection on `bondingState`, and the class-level comment says "on main thread" but this is enforced only by convention. If any future caller misses the pattern, `bondingState` (a `private(set)` stored property read by `GooseAppModel.bondingState` on the main actor through `@Observable`) will be mutated off-main, causing a data race.

**Fix:** Annotate `GooseBLEBondingManager` with `@MainActor` to enforce the threading contract at compile time:

```swift
@MainActor
final class GooseBLEBondingManager {
    private(set) var bondingState: GooseBLEBondingState = .notStarted
    var onBondingStateChange: ((GooseBLEBondingState) -> Void)?
    // ...
    func transition(to newState: GooseBLEBondingState) {
        // Remove the DispatchQueue.main.async wrapper — caller is already on main
        guard newState != bondingState else { return }
        bondingState = newState
        persistState()
        onBondingStateChange?(bondingState)  // synchronous, no async needed
    }
```

This also eliminates the need for the inner `DispatchQueue.main.async` block in `transition()`.

---

### WR-02: Persisting `.started` and `.subscribed` states to UserDefaults is useless and misleads on next launch

**File:** `GooseSwift/GooseBLEBondingManager.swift:29-33`, `GooseSwift/GooseBLETypes.swift:321-322`

**Issue:** `persistState()` is called on every `transition()`, including transitions to `.started` and `.subscribed`. These states represent an in-progress connection (post-connect, pre-GATT-ready) and are meaningless after app restart — there is no peripheral to reconnect to in these states. `loadPersistedState()` only handles `"completed"` (and maps everything else to `.notStarted`), so the writes for `"started"` and `"subscribed"` produce disk I/O on every connection attempt with no benefit. More importantly, if the app crashes or is killed during connection setup, the stale key `"started"` or `"subscribed"` is left in UserDefaults, and on next launch `loadPersistedState()` correctly maps it to `.notStarted` — but this only works by accident (the `default:` case). The intent is not documented.

**Fix:** Only persist terminal/meaningful states:

```swift
private func persistState() {
    switch bondingState {
    case .completed(let id):
        UserDefaults.standard.set(bondingState.persistenceKey, forKey: Self.bondingStateKey)
        UserDefaults.standard.set(id.uuidString, forKey: Self.bondingDeviceIDKey)
    case .notStarted, .cancelled:
        UserDefaults.standard.removeObject(forKey: Self.bondingStateKey)
        UserDefaults.standard.removeObject(forKey: Self.bondingDeviceIDKey)
    case .started, .subscribed:
        break  // transient states; do not persist
    }
}
```

---

### WR-03: `bondingState` computed property on `GooseAppModel` exposes a non-`@Observable` class through `@Observable` boundary

**File:** `GooseSwift/GooseAppModel.swift:111`

**Issue:** `var bondingState: GooseBLEBondingState { ble.bondingManager.bondingState }` is a computed property on the `@Observable GooseAppModel`. The `@Observable` macro tracks reads and writes of _stored_ properties. Computed properties that delegate to other non-`@Observable` types (`GooseBLEBondingManager` is neither `@Observable` nor `ObservableObject`) are not tracked — SwiftUI views that read `model.bondingState` will not be automatically invalidated when `bondingManager.bondingState` changes. The UI display in `LocalizedStatusStrings` will show stale data until an unrelated observable property triggers a view refresh.

**Fix:** Either make `GooseBLEBondingManager` `@Observable`, or mirror the state into a stored `@Observable` property on `GooseAppModel`. Given that the `onBondingStateChange` callback already calls `updateConnectionState`, the simplest fix is a stored mirror:

```swift
// In GooseAppModel:
var bondingState: GooseBLEBondingState = .notStarted  // stored — tracked by @Observable

// In GooseAppModel.init, after ble.onBondingStateChange is set:
ble.bondingManager.onBondingStateChange = { [weak self] newState in
    // existing connection state update:
    self?.ble.updateConnectionState(newState.connectionStateString)
    // mirror into the observable stored property:
    Task { @MainActor in
        self?.bondingState = newState
    }
}
```

---

## Info

### IN-01: `cancelled(reason:)` `connectionStateString` exposes an internal key as visible UI state

**File:** `GooseSwift/GooseBLETypes.swift:314`

**Issue:** The `cancelled(reason:)` case returns `r` (the raw reason string, e.g. `"bond_lost"`) as its `connectionStateString` when the reason is non-empty. This value feeds directly into `connectionState` (a visible property in debug and production UI via `MoreDebugViews`). The raw string `"bond_lost"` is an internal diagnostic token, not a localised user-facing label. `LocalizedStatusStrings.localizedConnectionState` does not handle it (`default: return self`), so it would appear verbatim to users.

**Fix:** Map internal reason codes to user-facing strings in `connectionStateString` or in `LocalizedStatusStrings`:

```swift
// In connectionStateString:
case .cancelled(let r):
    switch r {
    case "bond_lost": return "disconnected"  // or a distinct "pairing lost" value
    default: return "disconnected"
    }

// Or add to LocalizedStatusStrings:
case "bond_lost": return String(localized: "Ligação perdida")
```

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
