package ai.synheart.wear.adapters

import ai.synheart.wear.models.MetricType
import ai.synheart.wear.models.WearMetrics

/**
 * A single heart rate measurement from a BLE HRM device
 */
data class HeartRateSample(
    val tsMs: Long = System.currentTimeMillis(),
    val bpm: Int,
    val source: String = "ble_hrm",
    val deviceId: String,
    val deviceName: String? = null,
    val sessionId: String? = null,
    val rrIntervalsMs: List<Double>? = null
) {
    /**
     * Convert to unified WearMetrics format
     */
    fun toWearMetrics(): WearMetrics {
        val metrics = mutableMapOf<String, Double>(
            MetricType.HR.name.lowercase() to bpm.toDouble()
        )

        val meta = mutableMapOf<String, String>(
            "source_type" to source
        )
        deviceName?.let { meta["device_name"] = it }
        sessionId?.let { meta["session_id"] = it }

        return WearMetrics(
            timestamp = tsMs,
            deviceId = deviceId,
            source = source,
            metrics = metrics,
            meta = meta,
            rrIntervals = rrIntervalsMs
        )
    }
}

/**
 * A discovered BLE heart rate monitor device
 */
data class BleHrmDevice(
    val deviceId: String,
    val name: String?,
    val rssi: Int
)

/**
 * BLE HRM specific error codes matching RFC specification
 */
enum class BleHrmErrorCode(val code: String) {
    PERMISSION_DENIED("PERMISSION_DENIED"),
    BLUETOOTH_OFF("BLUETOOTH_OFF"),
    DEVICE_NOT_FOUND("DEVICE_NOT_FOUND"),
    SUBSCRIBE_FAILED("SUBSCRIBE_FAILED"),
    DISCONNECTED("DISCONNECTED")
}

/**
 * Exception thrown by BLE HRM operations
 */
class BleHrmException(
    val errorCode: BleHrmErrorCode,
    message: String
) : Exception(message)

/**
 * Parses BLE Heart Rate Measurement characteristic data per Bluetooth SIG spec
 *
 * Flags byte (bit field):
 * - Bit 0: HR format — 0 = uint8, 1 = uint16
 * - Bit 4: RR-Interval present — 0 = no, 1 = yes
 */
internal object HeartRateParser {

    /**
     * Parse raw heart rate measurement data
     *
     * @param data Raw characteristic value from 0x2A37
     * @return Pair of (bpm, rrIntervalsMs) — bpm is 0 for invalid data
     */
    fun parse(data: ByteArray): Pair<Int, List<Double>?> {
        if (data.size < 2) {
            return Pair(0, null)
        }

        val flags = data[0].toInt() and 0xFF
        val isUint16 = (flags and 0x01) != 0
        val hasRR = (flags and 0x10) != 0

        var offset: Int
        val bpm: Int

        if (isUint16) {
            if (data.size < 3) {
                return Pair(0, null)
            }
            bpm = (data[1].toInt() and 0xFF) or ((data[2].toInt() and 0xFF) shl 8)
            offset = 3
        } else {
            bpm = data[1].toInt() and 0xFF
            offset = 2
        }

        // Skip Energy Expended field if present (bit 3)
        val hasEnergyExpended = (flags and 0x08) != 0
        if (hasEnergyExpended) {
            offset += 2
        }

        var rrIntervals: List<Double>? = null
        if (hasRR && offset + 1 < data.size) {
            val intervals = mutableListOf<Double>()
            while (offset + 1 < data.size) {
                val rawRR = (data[offset].toInt() and 0xFF) or ((data[offset + 1].toInt() and 0xFF) shl 8)
                // RR values are in 1/1024 seconds, convert to milliseconds
                val rrMs = rawRR.toDouble() / 1024.0 * 1000.0
                intervals.add(rrMs)
                offset += 2
            }
            if (intervals.isNotEmpty()) {
                rrIntervals = intervals
            }
        }

        return Pair(bpm, rrIntervals)
    }
}
