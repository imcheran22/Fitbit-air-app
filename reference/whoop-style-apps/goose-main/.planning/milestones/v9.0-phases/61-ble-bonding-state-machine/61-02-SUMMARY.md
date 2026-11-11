---
phase: 61-ble-bonding-state-machine
plan: 02
subsystem: ble
tags: [swift, corebluetooth, state-machine, bonding, bond-loss]

# Dependency graph
requires:
  - 61-01 (GooseBLEBondingState enum + GooseBLEBondingManager)
provides:
  - GooseBLEClient owns bondingManager and wires onBondingStateChange callback to updateConnectionState
  - Four bonding-path transitions route through bondingManager.transition(to:)
  - Bond loss detection via named CBError/CBATTError constants with auto-recovery into reconnect cycle
  - GooseAppModel.bondingState computed property for observability
affects:
  - 61-03 (human-verify checkpoint for bond loss on real hardware)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 5 bridge: bondingManager.onBondingStateChange drives updateConnectionState() — manager is source of truth, string API unchanged"
    - "Bond loss detection via named CoreBluetooth constants (peerRemovedPairingInformation, insufficientAuthentication) — no raw integer literals"
    - "Pitfall 3 order: .cancelled(bond_lost) then .notStarted before reconnect scheduling"
    - "Computed var bondingState on GooseAppModel as passthrough to ble.bondingManager.bondingState — observable transitively, no @Published needed"

key-files:
  modified:
    - GooseSwift/GooseBLEClient.swift
    - GooseSwift/GooseBLEClient+CentralDelegate.swift
    - GooseSwift/GooseBLEClient+Commands.swift
    - GooseSwift/GooseAppModel.swift

key-decisions:
  - "bondingManager callback fires updateConnectionState(newState.connectionStateString) — all 33 connectionState == comparison sites remain unchanged (string API preserved)"
  - "Non-bonding error strings (bluetooth unavailable, connect failed, GATT errors, disconnect error descriptions) remain as direct updateConnectionState calls — only bonding-path transitions route through manager"
  - "Bond loss uses CBError.peerRemovedPairingInformation and CBATTError.insufficientAuthentication named constants — no raw integer literals"
  - "Bond loss re-enters existing reconnectBackoff circuit breaker (max 10 attempts) — no new uncapped reconnect path added (T-61-03 mitigated)"

requirements-completed: [BLE-BOND-01]

# Metrics
duration: 5min
completed: 2026-06-11
---

# Phase 61 Plan 02: BLE Bonding Manager Integration Summary

**GooseBLEBondingManager wired into the live BLE flow via Pattern 5 bridge — four bonding-path transitions route through bondingManager.transition(to:), bond loss is detected via named CoreBluetooth constants, and bondingState is observable from GooseAppModel**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-11T13:04:00Z
- **Completed:** 2026-06-11T13:07:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- GooseBLEClient gains `let bondingManager = GooseBLEBondingManager()` property alongside `hrMonitorManager`
- `bondingManager.onBondingStateChange` wired in `init()` to call `updateConnectionState(newState.connectionStateString)` — Pattern 5 bridge keeps all 33 existing comparison sites working without any changes
- Four bonding-path transitions replaced: `connecting` (connect), `discovering` (didConnect + willRestoreState connected), `connecting` (willRestoreState connecting), `disconnected` (BT off), `ready` (command characteristic ready), `connected` (else-branch) all route through `bondingManager.transition(to:)` now
- `isBondLossError(_:)` helper using named `CBError.peerRemovedPairingInformation` and `CBATTError.insufficientAuthentication` constants — no raw integer literals
- Bond loss on disconnect: `.cancelled(reason: "bond_lost")` logged first, then `.notStarted`, then existing reconnect cycle re-enters (Pitfall 3 order enforced)
- `var bondingState: GooseBLEBondingState { ble.bondingManager.bondingState }` on GooseAppModel — observable via transitivity from GooseBLEClient
- Project builds clean (BUILD SUCCEEDED) after each task

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bondingManager property + init wiring + GooseAppModel observability** - `dec33ec` (feat)
2. **Task 2: Route bonding-path transitions through bondingManager** - `0d53797` (feat)
3. **Task 3: Detect bond loss on disconnect and re-enter bonding flow** - `a13879c` (feat)

## Files Modified

- `GooseSwift/GooseBLEClient.swift` — `let bondingManager = GooseBLEBondingManager()` added; `bondingManager.onBondingStateChange` wired in `init()`
- `GooseSwift/GooseBLEClient+CentralDelegate.swift` — `isBondLossError()` helper added; `willRestoreState` and `didConnect` transitions replaced; bond loss detection + `.cancelled`/`.notStarted` transitions added to `didDisconnectPeripheral`
- `GooseSwift/GooseBLEClient+Commands.swift` — `connect()` "connecting" replaced with `.started`; `processDiscoveredCharacteristics` "ready"/"connected" replaced with `.completed(deviceID:)`/`.subscribed`
- `GooseSwift/GooseAppModel.swift` — `var bondingState: GooseBLEBondingState` computed property added

## Decisions Made

- Non-bonding error strings (`"bluetooth unavailable"`, `"connect failed"`, GATT error descriptions, `error?.localizedDescription` in disconnect) remain as direct `updateConnectionState` calls — only the formal bonding lifecycle transitions go through the manager (Pitfall 2)
- `bondingManager.transition(to: .notStarted)` is called on every disconnect (not just bond loss) so the manager resets cleanly; the explicit `updateConnectionState(error?.localizedDescription ?? "disconnected")` is kept to preserve human-readable disconnect reason in the UI (last write wins, acceptable per plan)
- Computed `bondingState` on GooseAppModel rather than a new `@Published` stored property — GooseBLEClient is `@Observable`, making the computed property observable transitively without extra state

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — all bonding transitions are real and wired to the live BLE delegate callbacks.

## Threat Flags

No new threat surface introduced beyond what was covered in the plan threat model. T-61-03 (reconnect loop) mitigated by reusing existing `reconnectBackoff` circuit breaker. T-61-04 (malformed CBError spoofing) mitigated by named constant matching only.

---
*Phase: 61-ble-bonding-state-machine*
*Completed: 2026-06-11*

## Self-Check: PASSED

- GooseSwift/GooseBLEClient.swift: FOUND
- GooseSwift/GooseBLEClient+CentralDelegate.swift: FOUND
- GooseSwift/GooseBLEClient+Commands.swift: FOUND
- GooseSwift/GooseAppModel.swift: FOUND
- .planning/phases/61-ble-bonding-state-machine/61-02-SUMMARY.md: FOUND
- Commit dec33ec (Task 1): FOUND
- Commit 0d53797 (Task 2): FOUND
- Commit a13879c (Task 3): FOUND
