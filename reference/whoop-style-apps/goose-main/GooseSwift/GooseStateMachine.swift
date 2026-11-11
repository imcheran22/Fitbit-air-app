import Foundation
import OSLog

// MARK: - StateMachine

/// A minimal, reusable generic state machine backed by a transition table closure.
/// State is a value type; mutations via `handle(_:)` are explicit and auditable.
///
/// Thread contract: `StateMachine` is not thread-safe. The caller is responsible for
/// ensuring all access occurs on the same thread (main thread for BLE bonding usage).
struct StateMachine<State: Hashable, Event> {
  private(set) var state: State
  private let transitions: (State, Event) -> State?

  private static var bleLogger: Logger { Logger(subsystem: "com.goose.swift", category: "ble") }

  init(initial: State, transitions: @escaping (State, Event) -> State?) {
    self.state = initial
    self.transitions = transitions
  }

  /// Attempt to advance the machine by handling `event` from the current state.
  ///
  /// - Returns: `true` if the transition was valid and state advanced; `false` if
  ///   the (state, event) pair has no mapping in the transition table.
  ///   In DEBUG builds an `assertionFailure` is also raised for invalid transitions.
  @discardableResult
  mutating func handle(_ event: Event) -> Bool {
    guard let next = transitions(state, event) else {
      let message = "StateMachine: invalid transition from \(state) on \(event)"
      assertionFailure(message)
      Self.bleLogger.error("\(message, privacy: .public)")
      return false
    }
    state = next
    return true
  }
}
