package com.apex.athlete.widget

import com.apex.athlete.core.ui.state.MetricReason

/** How one widget metric is known: a number, still calibrating, or without a number. Same vocabulary as `MetricState`. */
enum class WidgetMetricStatus(val key: String) {
    VALUE("value"),
    CALIBRATING("calibrating"),
    UNAVAILABLE("unavailable"),
    ;

    companion object {
        fun fromKey(key: String?): WidgetMetricStatus? = entries.firstOrNull { it.key == key }
    }
}

/**
 * One metric as the publisher saw it. Numbers and enum keys only: no free text, no names, no journal data.
 *
 * @property value the score (percent for recovery and sleep, 0-21 for strain); only meaningful for [WidgetMetricStatus.VALUE].
 * @property provenance a `DataProvenance.storageKey` (observed or derived marker), or null when unknown.
 * @property provisional the day is still accumulating (today's strain).
 * @property calibrationDaysLeft nights still needed while calibrating, when known.
 * @property reason a `MetricReason` name for the missing-value wording; null reads as "no data".
 * @property band a `RecoveryBand` name; recovery only.
 */
data class WidgetMetric(
    val status: WidgetMetricStatus,
    val value: Double? = null,
    val provenance: String? = null,
    val provisional: Boolean = false,
    val calibrationDaysLeft: Int? = null,
    val reason: String? = null,
    val band: String? = null,
) {
    companion object {
        val NO_DATA = WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = MetricReason.NO_DATA.name)
    }
}

/**
 * Everything the home-screen widgets draw, written by [WidgetPublisher] and read by the widgets. The widgets never
 * open the database. The heart rate carries its own timestamp so its age is computed at draw time.
 *
 * @property epochDay the local day the scores belong to; scores of another day are not shown as today's.
 * @property isDemo always false in a published file (the publisher refuses demo data); kept so a reader can refuse it too.
 */
data class WidgetSnapshot(
    val updatedAtMillis: Long,
    val epochDay: Long,
    val isDemo: Boolean,
    val recovery: WidgetMetric,
    val sleep: WidgetMetric,
    val strain: WidgetMetric,
    val heartRateBpm: Int?,
    val heartRateAtMillis: Long?,
    val heartRateProvenance: String?,
    val version: Int = CURRENT_VERSION,
) {
    companion object {
        const val CURRENT_VERSION = 1
    }
}
