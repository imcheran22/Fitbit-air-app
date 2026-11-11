import CoreBluetooth
import Foundation


final class GooseBLEBondingManager {
  // Internal state machine — drives bondingState via validated transitions.
  // Protected by `lock`; use `withLock` for all reads and writes of `_machine`.
  private var _machine: StateMachine<GooseBLEBondingState, GooseBLEBondingEvent>
  private let lock = NSLock()

  // Read-only public access mirrors the machine's current state; satisfies private(set) semantics.
  var bondingState: GooseBLEBondingState { lock.withLock { _machine.state } }

  // Callback invoked on every state transition (on main thread).
  var onBondingStateChange: ((GooseBLEBondingState) -> Void)?

  // UserDefaults keys owned by this manager.
  static let bondingStateKey = "goose.swift.ble.bondingState"
  static let bondingDeviceIDKey = "goose.swift.ble.bondingDeviceID"

  init() {
    let initial = GooseBLEBondingManager.loadInitialState()
    _machine = StateMachine(initial: initial, transitions: gooseBLEBondingTransition)
  }

  @discardableResult
  func transition(to newState: GooseBLEBondingState) -> Bool {
    let accepted = lock.withLock { () -> Bool in
      guard newState != _machine.state else { return true }
      let event = GooseBLEBondingManager.event(for: newState)
      return _machine.handle(event)
    }
    guard accepted else { return false }
    persistState()
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.onBondingStateChange?(self.bondingState)
    }
    return true
  }

  private func persistState() {
    switch bondingState {
    case .completed(let id):
      UserDefaults.standard.set(bondingState.persistenceKey, forKey: Self.bondingStateKey)
      UserDefaults.standard.set(id.uuidString, forKey: Self.bondingDeviceIDKey)
    case .notStarted, .cancelled:
      UserDefaults.standard.removeObject(forKey: Self.bondingStateKey)
      UserDefaults.standard.removeObject(forKey: Self.bondingDeviceIDKey)
    case .started, .subscribed:
      break // transient connection states — do not persist; meaningless after app restart
    }
  }

  private static func loadInitialState() -> GooseBLEBondingState {
    let key = UserDefaults.standard.string(forKey: bondingStateKey) ?? ""
    switch key {
    case "completed":
      if let uuidString = UserDefaults.standard.string(forKey: bondingDeviceIDKey),
         let uuid = UUID(uuidString: uuidString) {
        return .completed(deviceID: uuid)
      }
      return .notStarted
    default:
      return .notStarted
    }
  }

  // Maps a target GooseBLEBondingState to the corresponding event that produces it.
  // transition(to:) is total — every state has a corresponding event.
  private static func event(for state: GooseBLEBondingState) -> GooseBLEBondingEvent {
    switch state {
    case .notStarted:              return .reset
    case .started:                 return .start
    case .subscribed:              return .subscribe
    case .completed(let id):       return .complete(deviceID: id)
    case .cancelled(let reason):   return .cancel(reason: reason)
    }
  }
}
