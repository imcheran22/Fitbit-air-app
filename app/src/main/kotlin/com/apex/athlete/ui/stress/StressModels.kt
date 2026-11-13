package com.apex.athlete.ui.stress

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.StressEnergyState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.hasReadings
import com.apex.athlete.ui.detail.seriesUiOf
import com.apex.athlete.ui.overview.StressTier
import com.apex.athlete.ui.overview.stressMissingState
import com.apex.athlete.ui.overview.stressStripPoints
import com.apex.athlete.ui.overview.stressTierOf

/*
 * Stress detail. Stress is Apex's own estimate (heart rate while still against the owner's baseline), so every number here
 * carries the calculated provenance and the screen says "estimate". Missing is a MetricState with its reason, never 0.
 * The tier cut-offs, the missing reasons and the strip points are the Overview's, so both screens always agree.
 */

@Immutable
data class StressDetailUi(
    val epochDay: Long,
    /** The day's mean level 0..3. */
    val level: MetricState,
    val tier: StressTier?,
    val lowMinutes: MetricState,
    val mediumMinutes: MetricState,
    val highMinutes: MetricState,
    val points: List<ChartPoint>,
    val windowStartMillis: Long,
    val windowEndMillis: Long,
    /** The owner's usual calm daytime heart rate (the baseline centre) and how many days it is built from. */
    val baselineBpm: MetricState,
    val baselineDays: Int?,
    /** The calm daytime heart rate of this day (the day aggregate). */
    val dayBpm: MetricState,
    /** The last 14 daily levels; null when none exists. */
    val history: SeriesUi?,
    val isProvisional: Boolean,
) {
    companion object {
        val Loading = StressDetailUi(
            0L, MetricState.Loading, null, MetricState.Loading, MetricState.Loading, MetricState.Loading,
            emptyList(), 0L, 0L, MetricState.Loading, null, MetricState.Loading, null, false,
        )
    }
}

private fun bpm(value: Double?, f: ApexFormatter, provenance: com.apex.athlete.core.domain.DataProvenance, missing: MetricState): MetricState =
    if (value != null && value.isFinite()) {
        MetricState.Value(value, 0, f.string(R.string.detail_unit_bpm), provenance)
    } else {
        missing
    }

fun buildStressDetail(s: StressEnergyState, f: ApexFormatter): StressDetailUi {
    val derived = s.provenance
    val summary = s.stress
    val missing = stressMissingState(s.stressMissing, s.stressBaseline?.validDays, f)
    val history = seriesUiOf(
        MetricType.STRESS_SCORE, s.stressHistory, s.epochDay, s.stressHistory.size.coerceAtLeast(1),
        f.string(R.string.stress_hero_label), derived, f,
    ).takeIf { it.hasReadings() }
    val noReading = MetricState.Unavailable(MetricReason.NO_DATA)
    val baseline = bpm(s.stressBaseline?.centerBpm, f, derived, if (s.stressBaseline == null) missing else noReading)
    val dayBpm = bpm(s.stressDayAggregateBpm, f, derived, noReading)
    if (summary == null) {
        return StressDetailUi(
            s.epochDay, missing, null, missing, missing, missing, emptyList(), 0L, 0L,
            baseline, s.stressBaseline?.validDays, dayBpm, history, s.isProvisional,
        )
    }
    val points = stressStripPoints(s.stressMinuteLevels)
    val mean = summary.meanLevel
    fun minutes(n: Int) = MetricState.Value(n.toDouble(), 0, f.string(R.string.stress_unit_min), derived, isProvisional = s.isProvisional)
    return StressDetailUi(
        epochDay = s.epochDay,
        level = if (mean.isFinite()) {
            MetricState.Value(mean, 1, f.string(R.string.stress_unit), derived, isProvisional = s.isProvisional)
        } else {
            noReading
        },
        tier = mean.takeIf { it.isFinite() }?.let(::stressTierOf),
        lowMinutes = minutes(summary.lowMinutes),
        mediumMinutes = minutes(summary.mediumMinutes),
        highMinutes = minutes(summary.highMinutes),
        points = points,
        windowStartMillis = points.firstOrNull()?.x ?: 0L,
        windowEndMillis = points.lastOrNull()?.x ?: 0L,
        baselineBpm = baseline,
        baselineDays = s.stressBaseline?.validDays,
        dayBpm = dayBpm,
        history = history,
        isProvisional = s.isProvisional,
    )
}
