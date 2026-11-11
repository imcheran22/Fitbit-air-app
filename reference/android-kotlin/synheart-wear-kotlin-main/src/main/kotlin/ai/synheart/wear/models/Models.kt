package ai.synheart.wear.models

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Device adapter types
 */
enum class DeviceAdapter {
    HEALTH_CONNECT,
    SAMSUNG_HEALTH,
    FITBIT,
    GARMIN,
    OURA,
    WHOOP,
    BLE_HRM
}

/**
 * Permission types for biometric data access
 */
enum class PermissionType {
    HEART_RATE,
    HRV,
    STEPS,
    CALORIES,
    DISTANCE,
    EXERCISE,
    SLEEP,
    STRESS
}

/**
 * Metric types available from wearable devices
 */
enum class MetricType {
    HR,                 // Heart rate (bpm)
    HRV_RMSSD,         // HRV RMSSD (ms)
    HRV_SDNN,          // HRV SDNN (ms)
    STEPS,             // Step count
    CALORIES,          // Calories burned
    DISTANCE,          // Distance (meters)
    STRESS,            // Stress level (0-1)
    BATTERY,           // Device battery level (0-1)
    FIRMWARE_VERSION   // Device firmware version
}

/**
 * Unified biometric data structure emitted by every wear adapter.
 *
 * @property timestamp Timestamp when the metrics were captured
 * @property deviceId Anonymized device identifier
 * @property source Data source adapter
 * @property metrics Map of metric types to values
 * @property meta Metadata about the reading
 * @property rrIntervals Raw RR intervals for HRV calculation (optional)
 */
@Serializable
data class WearMetrics(
    val timestamp: Long,
    val deviceId: String,
    val source: String,
    val metrics: Map<String, Double>,
    val meta: Map<String, String> = emptyMap(),
    val rrIntervals: List<Double>? = null
) {
    /**
     * Get a specific metric value
     *
     * @param type Metric type to retrieve
     * @return Metric value or null if not available
     */
    fun getMetric(type: MetricType): Double? {
        return metrics[type.name.lowercase()]
    }

    /**
     * Check if a metric is available
     *
     * @param type Metric type to check
     * @return True if metric is available
     */
    fun hasMetric(type: MetricType): Boolean {
        return metrics.containsKey(type.name.lowercase())
    }

    /**
     * Convert to JSON-compatible map
     */
    fun toMap(): Map<String, Any> {
        val iso = DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC)
        return mapOf(
            "timestamp" to iso.format(Instant.ofEpochMilli(timestamp)),
            "device_id" to deviceId,
            "source" to source,
            "metrics" to metrics,
            "meta" to meta
        ).let { base ->
            if (rrIntervals != null) {
                base + ("rr_ms" to rrIntervals)
            } else {
                base
            }
        }
    }

    companion object {
        /**
         * Create WearMetrics from builder pattern
         */
        fun builder() = WearMetricsBuilder()
    }
}

/**
 * Builder for WearMetrics
 */
class WearMetricsBuilder {
    private var timestamp: Long = System.currentTimeMillis()
    private var deviceId: String = "unknown"
    private var source: String = "unknown"
    private val metrics: MutableMap<String, Double> = mutableMapOf()
    private val meta: MutableMap<String, String> = mutableMapOf()
    private var rrIntervals: List<Double>? = null

    fun timestamp(value: Long) = apply { this.timestamp = value }
    fun deviceId(value: String) = apply { this.deviceId = value }
    fun source(value: String) = apply { this.source = value }

    fun metric(type: MetricType, value: Double) = apply {
        metrics[type.name.lowercase()] = value
    }

    fun metrics(values: Map<MetricType, Double>) = apply {
        values.forEach { (type, value) ->
            metrics[type.name.lowercase()] = value
        }
    }

    fun metaData(key: String, value: String) = apply {
        meta[key] = value
    }

    fun rrIntervals(intervals: List<Double>) = apply {
        this.rrIntervals = intervals
    }

    fun build() = WearMetrics(
        timestamp = timestamp,
        deviceId = deviceId,
        source = source,
        metrics = metrics.toMap(),
        meta = meta.toMap(),
        rrIntervals = rrIntervals
    )
}

