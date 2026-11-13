package com.apex.athlete.ui.body

import androidx.compose.runtime.Immutable
import com.apex.athlete.core.data.pipeline.BodyMassIndex
import com.apex.athlete.core.data.repository.BodyState
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.detail.SeriesPanel
import com.apex.athlete.ui.detail.seriesUiOf
import com.apex.athlete.ui.health.TrendLoad
import com.apex.athlete.ui.health.buildBodyUi

/*
 * Body detail: the latest weight, body fat and BMI as MetricState, and the BMI history derived from the weigh-ins and the
 * profile height. Pure mapping, no Compose. Nothing is guessed: BMI without a height is Unavailable with the reason.
 */

/** Ranges offered for the history charts, in days. */
val BODY_RANGES: List<Int> = listOf(7, 30, 90, 180)

const val DEFAULT_BODY_RANGE = 90

fun sanitizeBodyRange(days: Int?): Int = if (days != null && days in BODY_RANGES) days else DEFAULT_BODY_RANGE

@Immutable
data class BodyDetailUi(
    val weight: MetricState,
    val bodyFat: MetricState,
    val bmi: MetricState,
    /** True when a weigh-in or a body-fat reading is stored. False means the screen explains where body data comes from. */
    val hasStoredReadings: Boolean,
    /** True when BMI is missing only because the profile has no height. */
    val bmiNeedsHeight: Boolean,
    val isDemo: Boolean,
    val heightCm: Double?,
    val epochDay: Long,
) {
    companion object {
        val Loading = BodyDetailUi(
            MetricState.Loading, MetricState.Loading, MetricState.Loading,
            hasStoredReadings = true, bmiNeedsHeight = false, isDemo = false, heightCm = null, epochDay = 0L,
        )
    }
}

/**
 * A profile weight has no day ([com.apex.athlete.core.data.repository.MetricReading.epochDay] null), so only a real weigh-in
 * or a body-fat reading counts as stored body data.
 */
fun bodyHasStoredReadings(s: BodyState): Boolean =
    s.weight.epochDay != null || s.bodyFat.value != null || s.weightHistory.any { it.value != null } || s.bodyFatHistory.any { it.value != null }

fun buildBodyDetail(s: BodyState, f: ApexFormatter): BodyDetailUi {
    val ui = buildBodyUi(s, f)
    return BodyDetailUi(
        weight = ui.weight.state,
        bodyFat = ui.bodyFat.state,
        bmi = ui.bmi.state,
        hasStoredReadings = bodyHasStoredReadings(s),
        bmiNeedsHeight = ui.bmiNeedsHeight,
        isDemo = s.isDemo,
        heightCm = s.heightCm,
        epochDay = s.epochDay,
    )
}

/** The BMI of each weigh-in in [weight] (kg points) at [heightCm]; every point is null without a plausible height. */
fun bmiPoints(weight: MetricTrend, heightCm: Double?): List<TrendPoint> =
    weight.points.map { TrendPoint(it.epochDay, BodyMassIndex.compute(it.value, heightCm)) }

/** The BMI chart panel: derived from the weight history, Empty without a height or without any weigh-in in the window. */
fun bmiPanel(weight: TrendLoad, heightCm: Double?, label: String, f: ApexFormatter): SeriesPanel = when (weight) {
    TrendLoad.Loading -> SeriesPanel.Loading
    TrendLoad.Empty -> SeriesPanel.Empty
    is TrendLoad.Loaded -> {
        val points = bmiPoints(weight.trend, heightCm)
        if (points.all { it.value == null }) {
            SeriesPanel.Empty
        } else {
            SeriesPanel.Ready(
                seriesUiOf(MetricType.BMI, points, weight.endDay, weight.rangeDays, label, DataProvenance.MATHEMATICALLY_DERIVED, f),
            )
        }
    }
}
