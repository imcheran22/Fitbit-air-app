package com.apex.athlete.ui.trends

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.MetricCategory
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.hasReadings
import com.apex.athlete.ui.detail.seriesUi
import com.apex.athlete.ui.health.chartPoints
import com.apex.athlete.ui.health.displayOf
import com.apex.athlete.ui.health.metricTitleRes
import com.apex.athlete.ui.health.provenanceText
import com.apex.athlete.ui.health.rangeStatusText
import java.time.LocalDate

/*
 * Trends browser and overlay. Pure mapping, no Compose. The overlay puts two figures on separate scales and says nothing
 * about how they relate: no correlation is computed anywhere in this file.
 */

/** Ranges offered by the browser, in days. */
val TRENDS_RANGES: List<Int> = listOf(7, 30, 90, 180)

const val DEFAULT_TRENDS_RANGE = 30

fun sanitizeTrendsRange(days: Int?): Int = if (days != null && days in TRENDS_RANGES) days else DEFAULT_TRENDS_RANGE

/** The figures that can be browsed or overlaid: the repository's trend list. */
val BROWSABLE_METRICS: List<MetricType> = AthleteRepository.TREND_METRICS.map { it.first }

/** A browsable metric from its storage key, or null (absent, blank or unknown). */
fun browsableMetric(storageKey: String?): MetricType? = BROWSABLE_METRICS.firstOrNull { it.storageKey == storageKey }

/** Category order on the browser. */
val TREND_GROUP_ORDER: List<MetricCategory> = listOf(
    MetricCategory.CARDIOVASCULAR,
    MetricCategory.RESPIRATORY,
    MetricCategory.TEMPERATURE,
    MetricCategory.SLEEP,
    MetricCategory.ACTIVITY,
    MetricCategory.BODY,
    MetricCategory.SCORE,
    MetricCategory.TRAINING_LOAD,
    MetricCategory.EXTERNAL_HEALTH,
    MetricCategory.SUBJECTIVE,
)

@StringRes
fun groupTitleRes(category: MetricCategory): Int = when (category) {
    MetricCategory.CARDIOVASCULAR -> R.string.trends_group_cardio
    MetricCategory.RESPIRATORY -> R.string.trends_group_respiratory
    MetricCategory.TEMPERATURE -> R.string.trends_group_temperature
    MetricCategory.SLEEP -> R.string.trends_group_sleep
    MetricCategory.ACTIVITY -> R.string.trends_group_activity
    MetricCategory.BODY -> R.string.trends_group_body
    MetricCategory.SCORE -> R.string.trends_group_scores
    MetricCategory.TRAINING_LOAD -> R.string.trends_group_training
    MetricCategory.EXTERNAL_HEALTH -> R.string.trends_group_external
    MetricCategory.SUBJECTIVE -> R.string.trends_group_subjective
}

@Immutable
data class TrendRowUi(
    val metric: MetricType,
    @StringRes val titleRes: Int,
    /** The newest reading in the range (with its date when it is not the end day), or Unavailable when the range holds none. */
    val state: MetricState,
    /** "Within your usual range" and the like; null without a reading. */
    val statusLabel: String?,
)

@Immutable
data class TrendGroupUi(val category: MetricCategory, @StringRes val titleRes: Int, val rows: List<TrendRowUi>)

private fun row(t: MetricTrend, endDay: Long, f: ApexFormatter): TrendRowUi {
    val display = displayOf(t.metric, f)
    val latest = chartPoints(t.points, display).lastOrNull { it.y != null }
    val y = latest?.y
    val state: MetricState = if (latest == null || y == null) {
        MetricState.Unavailable(MetricReason.NO_DATA)
    } else {
        MetricState.Value(
            value = y,
            decimals = display.decimals,
            unit = display.unit,
            provenance = t.provenance,
            asOf = latest.x.takeIf { it != endDay }?.let { f.dayLabel(LocalDate.ofEpochDay(it)) },
        )
    }
    return TrendRowUi(
        metric = t.metric,
        titleRes = metricTitleRes(t.metric),
        state = state,
        statusLabel = if (state is MetricState.Value) rangeStatusText(t.intelligence.rangeStatus, f) else null,
    )
}

/** Metrics that have readings, grouped by category in [TREND_GROUP_ORDER]; a group with no metric is left out. */
fun buildTrendGroups(state: TrendIntelligenceState, f: ApexFormatter): List<TrendGroupUi> {
    val byCategory = state.trends.groupBy { it.metric.category }
    return TREND_GROUP_ORDER.mapNotNull { category ->
        val rows = byCategory[category].orEmpty().map { row(it, state.asOfDay, f) }
        if (rows.isEmpty()) null else TrendGroupUi(category, groupTitleRes(category), rows)
    }
}

/** What the overlay card shows. */
sealed interface OverlayState {
    data object NeedsTwo : OverlayState
    data object Loading : OverlayState

    /** [missing] lists the chosen figures that have no reading in the range; their line is simply absent. */
    data class Ready(val primary: SeriesUi, val secondary: SeriesUi, val missing: List<MetricType>, val provenance: String) : OverlayState
}

private fun overlaySeries(metric: MetricType, state: TrendIntelligenceState, f: ApexFormatter): SeriesUi {
    val label = f.string(metricTitleRes(metric))
    val trend = state.trends.firstOrNull { it.metric == metric }
    if (trend != null) return seriesUi(trend, state.rangeDays, state.asOfDay, label, f)
    val display = displayOf(metric, f)
    return SeriesUi(
        metric = metric,
        series = DaySeries(label, emptyList(), display.unit?.takeIf { it.isNotBlank() }?.let { " $it" }.orEmpty(), display.decimals),
        startDay = state.asOfDay - (state.rangeDays - 1),
        endDay = state.asOfDay,
        provenance = provenanceText(null, f),
    )
}

/** Both figures on separate scales over the state's range. [state] null is Loading; fewer than two choices is [OverlayState.NeedsTwo]. */
fun buildOverlay(first: MetricType?, second: MetricType?, state: TrendIntelligenceState?, f: ApexFormatter): OverlayState {
    if (first == null || second == null) return OverlayState.NeedsTwo
    if (state == null) return OverlayState.Loading
    val a = overlaySeries(first, state, f)
    val b = overlaySeries(second, state, f)
    val provenance = listOf(a, b).filter { it.hasReadings() }.joinToString(". ") { ui ->
        f.string(R.string.trends_overlay_provenance, ui.series.label, ui.provenance)
    }
    return OverlayState.Ready(a, b, listOf(a, b).filter { !it.hasReadings() }.map { it.metric }, provenance)
}

/** The screen that shows a metric's days. */
enum class DayTarget { RECOVERY, SLEEP, STRAIN, ACTIVITY, BODY, STRESS, MONITOR, FITNESS }

fun dayTargetOf(metric: MetricType): DayTarget = when (metric) {
    MetricType.RECOVERY_SCORE, MetricType.HRV_RMSSD, MetricType.RESTING_HEART_RATE, MetricType.HRV_CV7_LN,
    MetricType.HRV_ROBUST_Z, MetricType.RHR_ROBUST_Z, MetricType.RESP_RATE_ROBUST_Z -> DayTarget.RECOVERY
    MetricType.SLEEP_SCORE, MetricType.SLEEP_DURATION, MetricType.SLEEPING_HEART_RATE, MetricType.HR_DIP,
    MetricType.SLEEP_REGULARITY_INDEX, MetricType.SLEEP_MIDPOINT_SD_7D,
    MetricType.GUIDELINE_SHORTFALL_CLIPPED_7D, MetricType.GUIDELINE_SHORTFALL_SIGNED_7D, MetricType.SLEEP_WASO,
    MetricType.AWAKENINGS_PER_HOUR -> DayTarget.SLEEP
    MetricType.STRAIN_SCORE, MetricType.DAILY_TRIMP -> DayTarget.STRAIN
    MetricType.STEPS, MetricType.DISTANCE, MetricType.FLOORS, MetricType.CALORIES_TOTAL, MetricType.CALORIES_ACTIVE,
    MetricType.ACTIVE_ZONE_MINUTES, MetricType.LIGHTLY_ACTIVE_MINUTES, MetricType.MODERATELY_ACTIVE_MINUTES,
    MetricType.VERY_ACTIVE_MINUTES, MetricType.SEDENTARY_MINUTES, MetricType.SEDENTARY_PROLONGED_BOUTS,
    MetricType.SEDENTARY_LONGEST_BOUT, MetricType.SEDENTARY_BREAKS_PER_HOUR, MetricType.PEAK_CADENCE_30 -> DayTarget.ACTIVITY
    MetricType.WEIGHT, MetricType.BODY_FAT, MetricType.BMI -> DayTarget.BODY
    MetricType.STRESS_SCORE, MetricType.STRESS_DAY_AGGREGATE_BPM, MetricType.STRESS_HIGH_MINUTES -> DayTarget.STRESS
    MetricType.VO2_MAX -> DayTarget.FITNESS
    else -> DayTarget.MONITOR
}

/** Opens [target] on [day]. */
fun ApexNavigator.openDayTarget(target: DayTarget, day: LocalDate) = when (target) {
    DayTarget.RECOVERY -> openRecovery(day)
    DayTarget.SLEEP -> openSleep(day)
    DayTarget.STRAIN -> openStrain(day)
    DayTarget.ACTIVITY -> openActivity(day)
    DayTarget.BODY -> openBody(day)
    DayTarget.STRESS -> openStress(day)
    DayTarget.MONITOR -> openMonitor(day)
    DayTarget.FITNESS -> openFitness(day)
}
