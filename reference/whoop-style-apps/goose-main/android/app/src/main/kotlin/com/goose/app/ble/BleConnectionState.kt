package com.goose.app.ble

/**
 * WHOOP hardware generations.
 *
 * Gen4 and Gen5/MG share the same BLE scan/connect flow; generation is resolved
 * from the service UUID discovered after connection. MG is a Gen5-protocol device
 * identifiable by device name containing " mg" (case-insensitive). GOOSE and MAVERICK
 * hardware variants share identical BLE service UUIDs — server-side disambiguation
 * is required for precise variant identification beyond Phase 104 scope.
 */
enum class WhoopGeneration { GEN4, GEN5, MG }

/**
 * BLE connection state machine — mirrors iOS CoreBluetoothBLETransport states:
 * not_requested → scanning → connecting → discovering_services → authenticating → connected
 *                                                                                      ↓
 *                                                              auto-reconnect ← disconnected
 */
sealed class BleConnectionState {
  /** BLE not yet requested — initial state. */
  object Idle : BleConnectionState()

  /** Scanning for WHOOP device via CompanionDeviceManager or BluetoothLeScanner. */
  object Scanning : BleConnectionState()

  /** connectGatt() called; awaiting STATE_CONNECTED callback. */
  data class Connecting(val deviceAddress: String) : BleConnectionState()

  /** STATE_CONNECTED; discoverServices() in progress. */
  data class DiscoveringServices(val deviceAddress: String) : BleConnectionState()

  /** Services discovered; auth command written, awaiting auth response notification. */
  data class Authenticating(val deviceAddress: String) : BleConnectionState()

  /** Auth confirmed; notifications subscribed; bridge calls active. */
  data class Connected(
    val deviceAddress: String,
    val generation: WhoopGeneration,
  ) : BleConnectionState()

  /** Disconnected from device. */
  data class Disconnected(
    val reason: String,
    val willReconnect: Boolean,
  ) : BleConnectionState()
}

/** True only when in the Connected state. */
val BleConnectionState.isConnected: Boolean
  get() = this is BleConnectionState.Connected

/** Device address if available (non-null for Connecting, DiscoveringServices, Authenticating, Connected). */
val BleConnectionState.deviceAddress: String?
  get() = when (this) {
    is BleConnectionState.Connecting -> deviceAddress
    is BleConnectionState.DiscoveringServices -> deviceAddress
    is BleConnectionState.Authenticating -> deviceAddress
    is BleConnectionState.Connected -> deviceAddress
    else -> null
  }
