package ai.synheart.wear.normalization

import ai.synheart.wear.models.MetricType
import ai.synheart.wear.models.WearMetrics
import kotlinx.serialization.InternalSerializationApi

/**
 * Normalizes biometric data from multiple sources into the unified
 * `WearMetrics` shape consumed by every wear adapter.
 */
@OptIn(InternalSerializationApi::class)
internal class Normalizer {

    /**
     * Merge snapshots from multiple adapters into a single unified snapshot
     *
     * @param snapshots List of WearMetrics from different adapters
     * @return Merged WearMetrics with prioritized data sources
     */
    fun mergeSnapshots(snapshots: List<WearMetrics>): WearMetrics {
        if (snapshots.isEmpty()) {
            return WearMetrics.builder()
                .timestamp(System.currentTimeMillis())
                .deviceId("unknown")
                .source("none")
                .build()
        }

        // If only one snapshot, return it
        if (snapshots.size == 1) {
            return snapshots.first()
        }

        // Merge multiple snapshots
        val mergedMetrics = mutableMapOf<String, Double>()
        val mergedMeta = mutableMapOf<String, String>()
        var latestTimestamp = 0L
        var primarySource = ""
        var primaryDeviceId = ""

        snapshots.forEach { snapshot ->
            // Use latest timestamp
            if (snapshot.timestamp > latestTimestamp) {
                latestTimestamp = snapshot.timestamp
                primarySource = snapshot.source
                primaryDeviceId = snapshot.deviceId
            }

            // Merge metrics (newer values override older)
            mergedMetrics.putAll(snapshot.metrics)
            mergedMeta.putAll(snapshot.meta)
        }

        return WearMetrics(
            timestamp = latestTimestamp,
            deviceId = primaryDeviceId,
            source = "merged_${primarySource}",
            metrics = mergedMetrics,
            meta = mergedMeta
        )
    }

    /**
     * Validate that metrics meet quality requirements
     *
     * @param metrics WearMetrics to validate
     * @return True if metrics are valid
     */
    fun validateMetrics(metrics: WearMetrics): Boolean {
        // Basic validation rules
        if (metrics.timestamp <= 0) return false
        if (metrics.deviceId.isBlank()) return false
        if (metrics.source.isBlank()) return false

        // Validate HR if present
        metrics.getMetric(MetricType.HR)?.let { hr ->
            if (hr < 30 || hr > 220) return false
        }

        // Validate HRV if present
        metrics.getMetric(MetricType.HRV_RMSSD)?.let { hrv ->
            if (hrv < 0 || hrv > 500) return false
        }

        // Validate steps if present
        metrics.getMetric(MetricType.STEPS)?.let { steps ->
            if (steps < 0) return false
        }

        return true
    }

    /**
     * Normalize HR value to standard range
     *
     * @param hr Raw heart rate value
     * @return Normalized heart rate
     */
    fun normalizeHR(hr: Double): Double {
        return hr.coerceIn(30.0, 220.0)
    }

    /**
     * Normalize HRV value to standard range
     *
     * @param hrv Raw HRV value
     * @return Normalized HRV
     */
    fun normalizeHRV(hrv: Double): Double {
        return hrv.coerceIn(0.0, 500.0)
    }
}
