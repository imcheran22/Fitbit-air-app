package ai.synheart.wear.models

import java.util.Date

/**
 * Connection state for wearable devices
 */
enum class DeviceConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED,
    UNKNOWN
}

/**
 * A discovered wearable device during scanning
 *
 * @property identifier Platform BLE identifier (UUID on iOS, MAC on Android)
 * @property name Device name
 * @property modelName Model name if available
 * @property rssi Received signal strength indicator (RSSI)
 * @property isPaired Whether this device is already paired
 * @property adapter Which adapter discovered this device
 * @property discoveredAt Timestamp when device was discovered
 */
data class ScannedDevice(
    val identifier: String,
    val name: String,
    val modelName: String? = null,
    val rssi: Int? = null,
    val isPaired: Boolean = false,
    val adapter: DeviceAdapter,
    val discoveredAt: Date = Date()
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ScannedDevice) return false
        return identifier == other.identifier
    }

    override fun hashCode(): Int = identifier.hashCode()
}

/**
 * A paired wearable device
 *
 * @property deviceId Adapter-specific device ID (e.g., Garmin unitId as string)
 * @property identifier Platform BLE identifier
 * @property name Device name
 * @property modelName Model name if available
 * @property connectionState Current connection state
 * @property batteryLevel Battery level (0-100)
 * @property lastSyncTime Last sync timestamp
 * @property supportsStreaming Whether the device supports real-time streaming
 * @property adapter Which adapter manages this device
 */
data class PairedDevice(
    val deviceId: String,
    val identifier: String,
    val name: String,
    val modelName: String? = null,
    val connectionState: DeviceConnectionState = DeviceConnectionState.DISCONNECTED,
    val batteryLevel: Int? = null,
    val lastSyncTime: Date? = null,
    val supportsStreaming: Boolean = false,
    val adapter: DeviceAdapter
) {
    /** Whether the device is currently connected */
    val isConnected: Boolean get() = connectionState == DeviceConnectionState.CONNECTED

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PairedDevice) return false
        return deviceId == other.deviceId
    }

    override fun hashCode(): Int = deviceId.hashCode()
}

/**
 * Connection state change event
 *
 * @property state The current connection state
 * @property deviceId The device ID if applicable
 * @property error Error message if state is failed
 * @property timestamp Timestamp of the event
 */
data class DeviceConnectionEvent(
    val state: DeviceConnectionState,
    val deviceId: String? = null,
    val error: String? = null,
    val timestamp: Date = Date()
)
