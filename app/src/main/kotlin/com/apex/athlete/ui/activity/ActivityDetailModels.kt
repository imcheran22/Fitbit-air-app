package com.apex.athlete.ui.activity

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.ACTIVITY_METRICS
import com.apex.athlete.core.data.repository.ActivityDayState
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ActivityRowUi
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.activityRows

/*
 * Activity detail: the day's totals and active minutes as MetricState rows. Pure mapping, no Compose. A missing figure is
 * Unavailable with a reason, never 0; today's figures are provisional (still counting).
 */

/** Ranges offered for the history chart, in days. */
val ACTIVITY_RANGES: List<Int> = listOf(7, 30, 90)

const val DEFAULT_ACTIVITY_RANGE = 30

fun sanitizeActivityRange(days: Int?): Int = if (days != null && days in ACTIVITY_RANGES) days else DEFAULT_ACTIVITY_RANGE

/** The figures that can be charted: every activity metric, steps first. */
val ACTIVITY_CHART_METRICS: List<MetricType> = ACTIVITY_METRICS

fun activityChartMetric(storageKey: String?): MetricType =
    ACTIVITY_CHART_METRICS.firstOrNull { it.storageKey == storageKey } ?: MetricType.STEPS

val ACTIVITY_TOTAL_METRICS: List<MetricType> = listOf(
    MetricType.CALORIES_TOTAL,
    MetricType.CALORIES_ACTIVE,
    MetricType.DISTANCE,
    MetricType.FLOORS,
    MetricType.ACTIVE_ZONE_MINUTES,
)

val ACTIVITY_LEVEL_METRICS: List<MetricType> = listOf(
    MetricType.LIGHTLY_ACTIVE_MINUTES,
    MetricType.MODERATELY_ACTIVE_MINUTES,
    MetricType.VERY_ACTIVE_MINUTES,
    MetricType.SEDENTARY_MINUTES,
)

@Immutable
data class ActivityDetailUi(
    val epochDay: Long,
    val steps: ActivityRowUi,
    val totals: List<ActivityRowUi>,
    val levels: List<ActivityRowUi>,
    val isProvisional: Boolean,
) {
    companion object {
        /** Skeletons in the final shape while the day loads. */
        val Loading = ActivityDetailUi(
            epochDay = 0L,
            steps = ActivityRowUi(MetricType.STEPS, MetricState.Loading),
            totals = ACTIVITY_TOTAL_METRICS.map { ActivityRowUi(it, MetricState.Loading) },
            levels = ACTIVITY_LEVEL_METRICS.map { ActivityRowUi(it, MetricState.Loading) },
            isProvisional = false,
        )
    }
}

fun buildActivityDetail(s: ActivityDayState, f: ApexFormatter): ActivityDetailUi =
    buildActivityDetail(s.epochDay, s.isProvisional, s.readings, f)

/** The same mapping from the three fields it reads, so it can be tested without a full day analysis. */
fun buildActivityDetail(
    epochDay: Long,
    isProvisional: Boolean,
    readings: Map<MetricType, MetricReading>,
    f: ApexFormatter,
): ActivityDetailUi {
    fun rows(metrics: List<MetricType>) = activityRows(readings, metrics, f, isProvisional).map { row ->
        // Sedentary time is only reported for a finished day: say so instead of a bare "no data" while today is still counting.
        if (row.metric == MetricType.SEDENTARY_MINUTES && isProvisional && row.state is MetricState.Unavailable) {
            row.copy(state = MetricState.Unavailable(detail = f.string(R.string.activitydetail_sedentary_pending)))
        } else {
            row
        }
    }
    return ActivityDetailUi(
        epochDay = epochDay,
        steps = rows(listOf(MetricType.STEPS)).single(),
        totals = rows(ACTIVITY_TOTAL_METRICS),
        levels = rows(ACTIVITY_LEVEL_METRICS),
        isProvisional = isProvisional,
    )
}
