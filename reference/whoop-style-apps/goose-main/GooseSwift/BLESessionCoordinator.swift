// BLESessionCoordinator — actor thin wrapper around CoreBluetoothBLETransport for session
// lifecycle (connect/disconnect/state). Does not replace CoreBluetoothBLETransport internals.
// See BLETransport.swift for the protocol.
import Foundation


actor BLESessionCoordinator {
  let transport: CoreBluetoothBLETransport

  // MARK: - Initialiser

  init(startCentral: Bool) {
    transport = CoreBluetoothBLETransport(startCentral: startCentral)
  }

  // MARK: - Protocol access

  // Provides `any BLETransport` view of the underlying transport. GooseAppModel stores this
  // as `let ble: any BLETransport` so that all non-lifecycle call sites go through the protocol.
  // nonisolated: transport is a let stored property; reading it does not require actor isolation.
  nonisolated var asTransport: any BLETransport { transport }

  // MARK: - Session lifecycle methods

  // Initiates the BLE central manager lifecycle. Pass startCentral: true when a fresh
  // CBCentralManager start is needed (equivalent to calling requestBluetooth on the transport).
  func connect(startCentral: Bool) {
    if startCentral {
      transport.requestBluetooth()
    }
  }

  func startScan() {
    transport.startScan()
  }

  func startScan(reason: String, clearDiscovered: Bool) {
    transport.startScan(reason: reason, clearDiscovered: clearDiscovered)
  }

  func stopScan() {
    transport.stopScan()
  }

  func stopScan(reason: String) {
    transport.stopScan(reason: reason)
  }

  func reconnect() {
    transport.reconnectRemembered()
  }

  func disconnect() {
    transport.stopScan()
    transport.record(source: "session", title: "disconnect")
  }

  // MARK: - State queries

  // nonisolated: CoreBluetoothBLETransport guards these with NSLock/DispatchQueue; safe to
  // read without hopping to the actor's executor.
  nonisolated var connectionState: String { transport.connectionState }
  nonisolated var bluetoothState: String { transport.bluetoothState }
  nonisolated var isScanning: Bool { transport.isScanning }
}
