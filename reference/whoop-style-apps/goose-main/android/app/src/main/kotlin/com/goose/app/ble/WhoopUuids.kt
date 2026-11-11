package com.goose.app.ble

import java.util.UUID

/**
 * WHOOP BLE service and characteristic UUID constants.
 *
 * Gen4 service prefix: 61080001; Gen5/MG service prefix: fd4b0001.
 * UUIDs match iOS CoreBluetoothBLETransport serviceDiscoveryIDs,
 * commandCharacteristicIDs, and notificationCharacteristicIDs arrays.
 */
object WhoopUuids {

  // Gen4 UUIDs
  val GEN4_SERVICE: UUID = UUID.fromString("61080001-8d6d-82b8-614a-1c8cb0f8dcc6")
  val GEN4_COMMAND: UUID = UUID.fromString("61080002-8d6d-82b8-614a-1c8cb0f8dcc6")
  val GEN4_NOTIFY_CHARS: List<UUID> = listOf(
    UUID.fromString("61080003-8d6d-82b8-614a-1c8cb0f8dcc6"),
    UUID.fromString("61080004-8d6d-82b8-614a-1c8cb0f8dcc6"),
    UUID.fromString("61080005-8d6d-82b8-614a-1c8cb0f8dcc6"),
    UUID.fromString("61080007-8d6d-82b8-614a-1c8cb0f8dcc6"),
  )

  // Gen5 / MG UUIDs (GOOSE and MAVERICK share identical service UUIDs; MG detection by device name)
  val GEN5_SERVICE: UUID = UUID.fromString("fd4b0001-cce1-4033-93ce-002d5875f58a")
  val GEN5_COMMAND: UUID = UUID.fromString("fd4b0002-cce1-4033-93ce-002d5875f58a")
  val GEN5_NOTIFY_CHARS: List<UUID> = listOf(
    UUID.fromString("fd4b0003-cce1-4033-93ce-002d5875f58a"),
    UUID.fromString("fd4b0004-cce1-4033-93ce-002d5875f58a"),
    UUID.fromString("fd4b0005-cce1-4033-93ce-002d5875f58a"),
    UUID.fromString("fd4b0007-cce1-4033-93ce-002d5875f58a"),
  )

  // Standard BLE Client Characteristic Configuration Descriptor (CCCD)
  val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

  // Helper: is this UUID a recognized WHOOP service?
  fun isWhoopService(uuid: UUID): Boolean = uuid == GEN4_SERVICE || uuid == GEN5_SERVICE

  // Helper: is this a Gen4 service UUID?
  fun isGen4(serviceUuid: UUID): Boolean = serviceUuid == GEN4_SERVICE

  // Helper: notification characteristics for a given service UUID
  fun notifyCharsFor(serviceUuid: UUID): List<UUID> = when (serviceUuid) {
    GEN4_SERVICE -> GEN4_NOTIFY_CHARS
    GEN5_SERVICE -> GEN5_NOTIFY_CHARS
    else -> emptyList()
  }

  // Helper: command characteristic for a given service UUID
  fun commandCharFor(serviceUuid: UUID): UUID = when (serviceUuid) {
    GEN4_SERVICE -> GEN4_COMMAND
    GEN5_SERVICE -> GEN5_COMMAND
    else -> GEN5_COMMAND
  }
}
