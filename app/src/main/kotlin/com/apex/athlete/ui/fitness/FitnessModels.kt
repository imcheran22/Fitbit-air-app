package com.apex.athlete.ui.fitness

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.FitnessState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.hasReadings
import com.apex.athlete.ui.detail.seriesUiOf
import com.apex.athlete.ui.health.CardioUi
import com.apex.athlete.ui.health.buildCardioUi

/** VO2 history length, in days, as the repository returns it. */
const val FITNESS_TREND_DAYS = 90

@Immutable
data class FitnessDetailUi(
    /** VO2 max, category and fitness age, built by the same mapper as the Health tab so both always agree. */
    val cardio: CardioUi,
    /** The VO2 history; null when the window holds no reading. */
    val trend: SeriesUi?,
    val epochDay: Long,
)

fun buildFitnessDetail(s: FitnessState, f: ApexFormatter): FitnessDetailUi =
    FitnessDetailUi(
        cardio = buildCardioUi(s, f),
        trend = seriesUiOf(
            MetricType.VO2_MAX, s.vo2History, s.epochDay, FITNESS_TREND_DAYS,
            f.string(R.string.health_metric_vo2), s.vo2Max?.provenance, f,
        ).takeIf { it.hasReadings() },
        epochDay = s.epochDay,
    )
