package com.apex.athlete.ui.monitor

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.repository.MonitorItem
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.data.repository.VITALS_METRICS
import com.apex.athlete.core.data.repository.VitalsState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.health.TREND_OPENABLE
import com.apex.athlete.ui.health.baselineBand
import com.apex.athlete.ui.health.displayOf
import com.apex.athlete.ui.health.goodDirectionOf
import com.apex.athlete.ui.health.metricTitleRes
import com.apex.athlete.ui.health.readingState
import com.apex.athlete.core.analytics.trend.MetricIntelligence

/*
 * Health monitor: every vital with its 30 day personal range and an out-of-range flag. Pure mapping, no Compose.
 * A flag exists only for a reading that exists and a range that is established; otherwise the row says so, never a guess.
 */

/** Days of readings the personal range is built from (the repository's baseline window). */
const val MONITOR_BASELINE_DAYS = 30

enum class RangeFlag(@StringRes val labelRes: Int?) {
    ABOVE(R.string.monitor_flag_above),
    BELOW(R.string.monitor_flag_below),
    INSIDE(R.string.monitor_flag_inside),

    /** No reading, or no established range: nothing is flagged. */
    NONE(null),
}

/** The flag for a metric's range status; a missing reading or a baseline still being learned has none. */
fun rangeFlagOf(status: RangeStatus): RangeFlag = when (status) {
    RangeStatus.ABOVE_NORMAL -> RangeFlag.ABOVE
    RangeStatus.BELOW_NORMAL -> RangeFlag.BELOW
    RangeStatus.WITHIN_NORMAL -> RangeFlag.INSIDE
    RangeStatus.NO_READING, RangeStatus.CALIBRATING -> RangeFlag.NONE
}

@Immutable
data class VitalCardUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    val state: MetricState,
    /** The personal range centre and half-width on the display scale; null until the baseline exists. */
    val average: Double?,
    val sd: Double?,
    val decimals: Int,
    val good: GoodDirection,
    /** "Your 30-day range: 55 to 66 bpm", or null without a range. */
    val bandText: String?,
    val flag: RangeFlag,
    val sampleNote: String?,
    val opensTrend: Boolean,
)

private fun bandText(low: Double, high: Double, unit: String?, decimals: Int, f: ApexFormatter): String =
    f.string(R.string.monitor_band_caption, f.number(low, decimals), f.number(high, decimals), unit.orEmpty()).trim()

private fun card(
    metric: MetricType,
    state: MetricState,
    intelligence: MetricIntelligence?,
    sampleNote: String?,
    f: ApexFormatter,
): VitalCardUi {
    val display = displayOf(metric, f)
    val band = intelligence?.let { baselineBand(it.baseline, display) }
    val centre = intelligence?.baseline?.center?.takeIf { band != null && it.isFinite() }?.let(display.convert)
    val hasValue = state is MetricState.Value || state is MetricState.Stale
    return VitalCardUi(
        metric = metric,
        titleRes = metricTitleRes(metric),
        state = state,
        average = centre,
        sd = band?.let { (it.high - it.low) / 2.0 },
        decimals = display.decimals,
        good = goodDirectionOf(metric),
        bandText = band?.let { bandText(it.low, it.high, display.unit, display.decimals, f) },
        flag = if (band != null && hasValue && intelligence != null) rangeFlagOf(intelligence.rangeStatus) else RangeFlag.NONE,
        sampleNote = sampleNote,
        opensTrend = metric in TREND_OPENABLE,
    )
}

/** The five monitor readings of the day (HRV, resting heart rate, breathing, SpO2, skin temperature) with their flags. */
fun buildNightCards(items: List<MonitorItem>, mapper: MetricStateMapper, f: ApexFormatter): List<VitalCardUi> =
    items.map { item ->
        var state = mapper.intelligence(item.intelligence, item.metric, item.provenance)
        if (state is MetricState.Unavailable) {
            mapper.calibrationDaysLeft(item.intelligence)?.let { state = MetricState.Calibrating(it) }
        }
        card(item.metric, state, item.intelligence, null, f)
    }

/** Every overnight vital in repository order. The range and flag come from [trends] when the metric has one. */
fun buildMoreCards(vitals: VitalsState, trends: TrendIntelligenceState?, f: ApexFormatter): List<VitalCardUi> =
    VITALS_METRICS.map { metric ->
        val reading = vitals.readings[metric] ?: MetricReading.absent(metric)
        val state = readingState(reading, displayOf(metric, f), vitals.epochDay, f)
        val note = reading.sampleCount?.takeIf { reading.value != null && it > 0 }?.let { f.string(R.string.health_vitals_samples, it) }
        card(metric, state, trends?.trends?.firstOrNull { it.metric == metric }?.intelligence, note, f)
    }

/** The headline over the whole screen. */
sealed interface MonitorSummary {
    data object Loading : MonitorSummary

    /** No reading has an established range yet. */
    data object Learning : MonitorSummary

    data object AllInside : MonitorSummary
    data class Outside(val count: Int) : MonitorSummary
}

fun monitorSummary(night: List<VitalCardUi>?, more: List<VitalCardUi>?): MonitorSummary {
    if (night == null && more == null) return MonitorSummary.Loading
    val all = night.orEmpty() + more.orEmpty()
    val outside = all.count { it.flag == RangeFlag.ABOVE || it.flag == RangeFlag.BELOW }
    return when {
        outside > 0 -> MonitorSummary.Outside(outside)
        all.any { it.flag == RangeFlag.INSIDE } -> MonitorSummary.AllInside
        else -> MonitorSummary.Learning
    }
}
