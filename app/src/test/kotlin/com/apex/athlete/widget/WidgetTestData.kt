package com.apex.athlete.widget

import java.time.ZoneId

/** Shared fixtures. 2026-11-13 12:00 UTC, so "today" in UTC is day [DAY]. */
internal object WidgetTestData {
    val UTC: ZoneId = ZoneId.of("UTC")
    const val NOW: Long = 1_794_571_200_000L
    val DAY: Long = java.time.Instant.ofEpochMilli(NOW).atZone(UTC).toLocalDate().toEpochDay()

    fun value(v: Double, prov: String? = "derived", provisional: Boolean = false, band: String? = null) =
        WidgetMetric(WidgetMetricStatus.VALUE, value = v, provenance = prov, provisional = provisional, band = band)

    fun snapshot(
        recovery: WidgetMetric = value(74.0, band = "GREEN"),
        sleep: WidgetMetric = value(81.0),
        strain: WidgetMetric = value(12.3, provisional = true),
        heartRateBpm: Int? = 72,
        heartRateAtMillis: Long? = NOW - 12 * 60_000L,
        heartRateProvenance: String? = "ghealth_api",
        epochDay: Long = DAY,
        isDemo: Boolean = false,
        updatedAtMillis: Long = NOW - 60_000L,
    ) = WidgetSnapshot(
        updatedAtMillis = updatedAtMillis,
        epochDay = epochDay,
        isDemo = isDemo,
        recovery = recovery,
        sleep = sleep,
        strain = strain,
        heartRateBpm = heartRateBpm,
        heartRateAtMillis = heartRateAtMillis,
        heartRateProvenance = heartRateProvenance,
    )
}
