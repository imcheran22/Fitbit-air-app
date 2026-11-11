---
phase: 61-ble-bonding-state-machine
fixed_at: 2026-06-11T00:00:00Z
review_path: .planning/phases/61-ble-bonding-state-machine/61-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 61: Code Review Fix Report

**Fixed at:** 2026-06-11
**Source review:** .planning/phases/61-ble-bonding-state-machine/61-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01 + CR-02: Shadowed `.cancelled` transition and racing `updateConnectionState` in `didDisconnectPeripheral`

**Files modified:** `GooseSwift/GooseBLEClient+CentralDelegate.swift`
**Commit:** 6c9e8ca
**Applied fix:** Removed the `bondingManager.transition(to: .cancelled(reason: "bond_lost"))` call that was immediately followed by `bondingManager.transition(to: .notStarted)` — the `.cancelled` state was never observable because both async callbacks were enqueued back-to-back. The bond-loss event is now logged via `record()` and the state machine goes directly to `.notStarted`. The direct `updateConnectionState(error?.localizedDescription ?? "disconnected")` call was also removed — the bonding manager's `onBondingStateChange` callback already drives `connectionState` via `connectionStateString`, so the direct call was a racing third write that produced a raw Apple error string instead of the mapped "disconnected" value.

---

### CR-03: `isBondLossError` missing `CBError.encryptionTimedOut`

**Files modified:** `GooseSwift/GooseBLEClient+CentralDelegate.swift`
**Commit:** 34aedd3
**Applied fix:** Refactored the `CBErrorDomain` check to use `CBError.Code(rawValue:)` and added `.encryptionTimedOut` alongside `.peerRemovedPairingInformation`. This covers the common failure mode where a WHOOP is factory-reset or re-paired from another device without sending a `peerRemovedPairingInformation` event.

---

### WR-01: Thread contract not enforced on `GooseBLEBondingManager`

**Files modified:** `GooseSwift/GooseBLEBondingManager.swift`
**Commit:** 8515a9f
**Applied fix:** Added a class-level comment documenting the main-thread-only contract. The `@MainActor` annotation suggested in the review was attempted but caused a compiler error (`call to main actor-isolated initializer 'init()' in a synchronous nonisolated context`) because `GooseBLEClient` is `@unchecked Sendable` and not `@MainActor` — it cannot call a `@MainActor` initialiser synchronously. The comment approach documents the contract clearly without breaking the existing threading model, which already enforces main-thread execution through `dispatchCoreBluetoothDelegateToMainIfNeeded` at every BLE delegate entry point.

---

### WR-02: Persisting transient `.started` and `.subscribed` states

**Files modified:** `GooseSwift/GooseBLEBondingManager.swift`
**Commit:** cad8649
**Applied fix:** Replaced the unconditional `persistState()` implementation with a `switch` that only writes to UserDefaults for `.completed` (stores state + device UUID), clears UserDefaults for `.notStarted` and `.cancelled`, and is a no-op for `.started` and `.subscribed`. This eliminates useless disk I/O on every connection attempt and avoids leaving stale transient keys in UserDefaults if the app is killed during connection setup.

---

### WR-03: `bondingState` computed property on `GooseAppModel` not tracked by `@Observable`

**Files modified:** `GooseSwift/GooseAppModel.swift`
**Commit:** 60b929b
**Applied fix:** Changed `bondingState` from a computed property delegating to `ble.bondingManager.bondingState` into a stored `var bondingState: GooseBLEBondingState = .notStarted`. In `GooseAppModel.init()`, the `ble.bondingManager.onBondingStateChange` closure (previously set in `GooseBLEClient.init()`) is overridden to both call `ble.updateConnectionState(newState.connectionStateString)` (preserving the original `connectionState` drive) and assign `self.bondingState = newState` (mirroring into the observable stored property). SwiftUI views reading `model.bondingState` now receive proper invalidation on every bonding state transition. The build was verified to succeed after this change.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-06-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
