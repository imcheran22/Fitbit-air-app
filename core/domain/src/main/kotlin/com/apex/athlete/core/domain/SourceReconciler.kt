package com.apex.athlete.core.domain

/** What the reconciler needs to know about one candidate value for a (metric, time) slot. */
data class SourceCandidate(
    val provenance: DataProvenance,
    /** Sampling resolution of the underlying stream in seconds; null when not applicable or unknown. */
    val resolutionSeconds: Int? = null,
    val updatedAtEpochMillis: Long = 0L,
)

/**
 * Decides which value survives when two sources describe the same metric for the same time slot.
 * Applied on every write so steps, calories and other totals are never counted twice.
 *
 * Rules, in order:
 * 1. Observed data always beats [DataProvenance.ESTIMATED] and [DataProvenance.UNAVAILABLE].
 * 2. A value the user typed in beats an automatic reading of the same metric (explicit correction).
 * 3. Between two automatic sources, the finer sampling resolution wins when both are known.
 * 4. Otherwise a file archive the user imported wins for the days and metrics it covers (it is the
 *    full-resolution export of the same account). After that the source preferred for the metric's category wins: Health Connect for
 *    measurements that come from third-party devices (cuffs, glucose meters, food logs),
 *    the Google Health API for everything the wearable itself records.
 * 5. Same source: the newer write wins, so re-syncing a day refreshes it.
 */
object SourceReconciler {

    fun shouldReplace(metric: MetricType, existing: SourceCandidate?, incoming: SourceCandidate): Boolean {
        if (existing == null) return true
        if (existing.provenance == incoming.provenance) {
            return incoming.updatedAtEpochMillis >= existing.updatedAtEpochMillis
        }

        val existingTier = tier(existing.provenance)
        val incomingTier = tier(incoming.provenance)
        if (existingTier != incomingTier) return incomingTier > existingTier

        if (incomingTier == TIER_AUTOMATIC) {
            val a = existing.resolutionSeconds
            val b = incoming.resolutionSeconds
            if (a != null && b != null && a != b) return b < a
            return rank(metric, incoming.provenance) > rank(metric, existing.provenance)
        }
        return incoming.updatedAtEpochMillis >= existing.updatedAtEpochMillis
    }

    /** The source expected to hold the best copy of [metric] when resolution does not decide. */
    fun preferredSource(metric: MetricType): DataProvenance = when (metric.category) {
        // BODY (weight, body fat) is read only from the Google Health API: Health Connect has no stream for it.
        MetricCategory.EXTERNAL_HEALTH -> DataProvenance.IMPORTED_HEALTH_CONNECT
        MetricCategory.SUBJECTIVE -> DataProvenance.USER_REPORTED
        MetricCategory.SCORE, MetricCategory.TRAINING_LOAD -> DataProvenance.MATHEMATICALLY_DERIVED
        else -> DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    }

    private const val TIER_NONE = 0
    private const val TIER_MODELLED = 1
    private const val TIER_AUTOMATIC = 2
    private const val TIER_USER = 3

    private fun tier(p: DataProvenance): Int = when (p) {
        DataProvenance.UNAVAILABLE -> TIER_NONE
        DataProvenance.ESTIMATED, DataProvenance.AI_INTERPRETED, DataProvenance.MATHEMATICALLY_DERIVED -> TIER_MODELLED
        DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
        DataProvenance.IMPORTED_HEALTH_CONNECT,
        DataProvenance.IMPORTED_FILE_ARCHIVE,
        DataProvenance.SYNTHETIC_DEMO -> TIER_AUTOMATIC
        DataProvenance.USER_REPORTED -> TIER_USER
    }

    private fun rank(metric: MetricType, p: DataProvenance): Int = when {
        // The archive only covers the days and metrics its files contain, so ranking it first
        // cannot delete or shadow anything outside that range.
        p == DataProvenance.IMPORTED_FILE_ARCHIVE -> 4
        p == preferredSource(metric) -> 3
        p == DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API || p == DataProvenance.IMPORTED_HEALTH_CONNECT -> 2
        else -> 1
    }
}
