package com.apex.athlete.ui.detail

import android.content.Context
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.common.ApexFormatter
import java.time.ZoneOffset

/** Shared by the detail-route tests: a fixed clock (2027-01-15 08:00 UTC) and a trend built the way the repository builds one. */
internal const val TEST_NOW = 1_800_000_000_000L
internal const val TEST_TODAY = TEST_NOW / 86_400_000L

internal fun testFormatter(context: Context, units: UnitSystem = UnitSystem.METRIC) =
    ApexFormatter(context, units, true, { ZoneOffset.UTC }, { TEST_NOW })

/** [values] are the daily readings ending on [endDay] (null = no reading). */
internal fun testTrend(
    metric: MetricType,
    values: List<Double?>,
    endDay: Long = TEST_TODAY,
    provenance: DataProvenance? = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API,
): MetricTrend {
    val start = endDay - values.size + 1
    val points = values.mapIndexed { i, v -> TrendPoint(start + i, v) }
    val daily = points.mapNotNull { p -> p.value?.let { DailyValue(p.epochDay, it) } }
    return MetricTrend(metric, points, MetricTrendAnalyzer.analyze(daily, endDay, BaselineSpecs.GENERIC), provenance)
}
