# Phase 65: Generic BLE State Machine - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Extract a lightweight reusable `StateMachine<State, Event>` type matching WHPStateMachine + WHPStateMachineState + WHPStateMachineEventDefinition, and migrate the BLE connection and bonding states (from Phase 61's GooseBLEBondingManager) into it, replacing ad-hoc string status scattered across GooseBLEClient. Scope is deliberately minimal: one generic type + migration of BLE connection/bonding states only. No broader adoption beyond the BLE layer.

Note from ROADMAP: "Previously flagged as over-engineering for the codebase's current size — added at user request. Scope is deliberately minimal."

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — pure infrastructure phase.

Key constraints from ROADMAP:
- StateMachine<State: Hashable, Event> struct exists in GooseBLETypes.swift or new GooseStateMachine.swift
- BLE connection states (bonding manager + existing connection states) expressed as StateMachine instances
- Invalid state transitions asserted in DEBUG builds; RELEASE = no-op + OSLog error
- No reduction in observable behaviour — existing UI reflecting connection state continues to work
- DELIBERATELY minimal scope — one generic type + BLE migration only

Key design from Phase 61 context:
- GooseBLEBondingManager already has the 5-state bonding lifecycle
- The `connectionState: String` public API surface stays unchanged (Phase 65 is the migration to typed states mentioned in Phase 61 pitfall notes)
- StateMachine wraps GooseBLEBondingManager's state transitions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseBLEBondingManager.swift` — already has the 5-state bonding logic; StateMachine wraps or replaces its internal state tracking
- `GooseBLEBondingState` enum — already defined in GooseBLETypes.swift; maps to StateMachine states
- `GooseBLEReconnect.swift` — analog for focused BLE subsystem class
- Phase 61 pitfall notes: "Phase 65 handles the full string→enum migration"

### Established Patterns
- `struct` for value types (GooseHRSanitizer analog)
- `NSLock` for thread safety (GooseNetworkMonitor pattern)
- Existing `GooseBLEBondingState` as the State type
- Keep `connectionState: String` unchanged at the API surface (25+ comparison sites)

### Integration Points
- `GooseBLEBondingManager.swift` — refactor to use StateMachine internally
- `GooseBLETypes.swift` — add StateMachine struct definition
- No other files should need changes if GooseBLEBondingManager's public API is preserved

</code_context>

<specifics>
## Specific Ideas

Minimal implementation:
```swift
struct StateMachine<State: Hashable, Event> {
  private(set) var state: State
  private let transitions: (State, Event) -> State?  // nil = invalid transition
  
  init(initial: State, transitions: @escaping (State, Event) -> State?) {
    self.state = initial
    self.transitions = transitions
  }
  
  mutating func handle(_ event: Event) -> Bool {
    guard let next = transitions(state, event) else {
      assert(false, "Invalid transition from \(state) on \(event)")
      // In RELEASE: log OSLog error, return false
      return false
    }
    state = next
    return true
  }
}
```

Then refactor GooseBLEBondingManager to use StateMachine<GooseBLEBondingState, GooseBLEBondingEvent> internally, keeping the same public `bondingState`, `transition(to:)`, and `onBondingStateChange` API.

</specifics>

<deferred>
## Deferred Ideas

- Full `connectionState: String` → typed enum migration — deferred beyond Phase 65 scope
- StateMachine adoption beyond BLE layer — explicitly out of scope per ROADMAP note
- WHPStateMachineEventDefinition full parity (typed event definitions) — stretch goal

</deferred>
