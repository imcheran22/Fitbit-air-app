package com.apex.athlete.ui.overview

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.energy.EnergyPoint
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.analytics.stress.StressConfig
import com.apex.athlete.core.data.pipeline.EnergyMissingReason
import com.apex.athlete.core.data.pipeline.StressMissingReason
import com.apex.athlete.core.data.repository.ActivityDayState
import com.apex.athlete.core.data.repository.StressEnergyState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.ActivityRowUi
import com.apex.athlete.ui.common.activityRows
import java.time.LocalDate

/*
 * The Overview's Stress, Energy and Activity cards. Stress and energy are Apex's own estimates (heart rate while still
 * against the owner's baseline; a bank model that starts at the morning recovery), so every number here carries the
 * calculated provenance and the cards say "estimate". Missing is a MetricState with its reason, never 0.
 */

/** Stress tier of a 0..3 level; the cut-offs are the engine's (1 and 2). */
enum class StressTier { Low, Medium, High }

private const val MEDIUM_FROM = 1.0
private const val HIGH_FROM = 2.0
private const val MINUTE_MS = 60_000L

fun stressTierOf(level: Double): StressTier = when {
    level >= HIGH_FROM -> StressTier.High
    level >= MEDIUM_FROM -> StressTier.Medium
    else -> StressTier.Low
}

/** Minute levels as chart points (x = epoch milliseconds). A non-finite level is a gap. */
fun stressStripPoints(levels: List<MinuteStress>): List<ChartPoint> =
    levels.map { ChartPoint(it.minute * MINUTE_MS, it.level.takeIf { v -> v.isFinite() }) }

/** Energy curve as chart points (x = epoch milliseconds, y = 0..100). A non-finite level is a gap. */
fun energyCurvePoints(curve: List<EnergyPoint>): List<ChartPoint> =
    curve.map { ChartPoint(it.minute * MINUTE_MS, it.level.takeIf { v -> v.isFinite() }) }

@Immutable
data class StressCardUi(
    /** The day's mean level 0..3 (an estimate). */
    val level: MetricState,
    val tier: StressTier?,
    val lowMinutes: MetricState,
    val mediumMinutes: MetricState,
    val highMinutes: MetricState,
    val points: List<ChartPoint>,
    val windowStartMillis: Long,
    val windowEndMillis: Long,
)

@Immutable
data class EnergyCardUi(
    /** The bank now, 0..100 (an estimate). */
    val bank: MetricState,
    val lowest: MetricState,
    val points: List<ChartPoint>,
    val windowStartMillis: Long,
    val windowEndMillis: Long,
)

@Immutable
data class OverviewExtrasUi(
    val stress: StressCardUi,
    val energy: EnergyCardUi,
    val activity: List<ActivityRowUi>,
) {
    companion object {
        val Loading = OverviewExtrasUi(
            stress = StressCardUi(
                MetricState.Loading, null, MetricState.Loading, MetricState.Loading, MetricState.Loading, emptyList(), 0L, 0L,
            ),
            energy = EnergyCardUi(MetricState.Loading, MetricState.Loading, emptyList(), 0L, 0L),
            activity = OVERVIEW_ACTIVITY_METRICS.map { ActivityRowUi(it, MetricState.Loading) },
        )
    }
}

/** The four figures of the compact activity row, in order. */
val OVERVIEW_ACTIVITY_METRICS: List<MetricType> = listOf(
    MetricType.STEPS,
    MetricType.CALORIES_ACTIVE,
    MetricType.DISTANCE,
    MetricType.ACTIVE_ZONE_MINUTES,
)

/** Reason a stress figure is missing: calibrating shows the nights still needed, the rest say why in words. */
fun stressMissingState(reason: StressMissingReason?, validBaselineDays: Int?, formatter: ApexFormatter): MetricState = when (reason) {
    StressMissingReason.BASELINE_CALIBRATING ->
        MetricState.Calibrating(validBaselineDays?.let { (StressConfig().minBaselineDays - it).coerceAtLeast(0) }?.takeIf { it > 0 })
    StressMissingReason.NO_HEART_RATE_DATA -> MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA)
    StressMissingReason.NO_MOTION_DATA ->
        MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.overview_stress_no_motion))
    StressMissingReason.TOO_FEW_MINUTES ->
        MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.overview_stress_too_few))
    null -> MetricState.Unavailable(MetricReason.NO_DATA)
}

fun energyMissingState(reason: EnergyMissingReason?, formatter: ApexFormatter): MetricState = when (reason) {
    EnergyMissingReason.NO_RECOVERY ->
        MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.overview_energy_no_recovery))
    EnergyMissingReason.NO_WAKE_TIME ->
        MetricState.Unavailable(MetricReason.AWAITING_SLEEP_SYNC, formatter.string(R.string.overview_energy_no_wake))
    EnergyMissingReason.NEEDS_ZONES ->
        MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.overview_energy_needs_zones))
    EnergyMissingReason.NO_HEART_RATE_DATA -> MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA)
    EnergyMissingReason.EMPTY_SPAN ->
        MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.overview_energy_empty_span))
    null -> MetricState.Unavailable(MetricReason.NO_DATA)
}

private fun stressCard(s: StressEnergyState, formatter: ApexFormatter): StressCardUi {
    val summary = s.stress
    val derived = s.provenance
    if (summary == null) {
        val missing = stressMissingState(s.stressMissing, s.stressBaseline?.validDays, formatter)
        return StressCardUi(missing, null, missing, missing, missing, emptyList(), 0L, 0L)
    }
    val points = stressStripPoints(s.stressMinuteLevels)
    val mean = summary.meanLevel
    fun minutes(n: Int) = MetricState.Value(n.toDouble(), 0, formatter.string(R.string.overview_unit_min), derived, isProvisional = s.isProvisional)
    return StressCardUi(
        level = if (mean.isFinite()) MetricState.Value(mean, 1, formatter.string(R.string.overview_stress_unit), derived, isProvisional = s.isProvisional)
        else MetricState.Unavailable(MetricReason.NO_DATA),
        tier = mean.takeIf { it.isFinite() }?.let(::stressTierOf),
        lowMinutes = minutes(summary.lowMinutes),
        mediumMinutes = minutes(summary.mediumMinutes),
        highMinutes = minutes(summary.highMinutes),
        points = points,
        windowStartMillis = points.firstOrNull()?.x ?: 0L,
        windowEndMillis = points.lastOrNull()?.x ?: 0L,
    )
}

private fun energyCard(s: StressEnergyState, formatter: ApexFormatter): EnergyCardUi {
    val energy = s.energy ?: return energyMissingState(s.energyMissing, formatter).let {
        EnergyCardUi(it, it, emptyList(), 0L, 0L)
    }
    val points = energyCurvePoints(energy.curve)
    val derived = s.provenance
    val unit = formatter.string(R.string.overview_energy_unit)
    fun level(v: Double) = if (v.isFinite()) {
        MetricState.Value(v, 0, unit, derived, isProvisional = s.isProvisional)
    } else {
        MetricState.Unavailable(MetricReason.NO_DATA)
    }
    return EnergyCardUi(
        bank = level(energy.currentLevel),
        lowest = level(energy.lowestLevel),
        points = points,
        windowStartMillis = points.firstOrNull()?.x ?: 0L,
        windowEndMillis = points.lastOrNull()?.x ?: 0L,
    )
}

/**
 * Maps the repository results for [day] to the three cards. A null result, or one for another day (the previous day's, still held while
 * the new one computes), is Loading, so a number from one day never sits under another day's date.
 */
fun buildOverviewExtras(
    stressEnergy: StressEnergyState?,
    activity: ActivityDayState?,
    day: LocalDate,
    formatter: ApexFormatter,
): OverviewExtrasUi {
    val epochDay = day.toEpochDay()
    val se = stressEnergy?.takeIf { it.epochDay == epochDay }
    val act = activity?.takeIf { it.epochDay == epochDay }
    val loading = OverviewExtrasUi.Loading
    return OverviewExtrasUi(
        stress = se?.let { stressCard(it, formatter) } ?: loading.stress,
        energy = se?.let { energyCard(it, formatter) } ?: loading.energy,
        activity = act?.let { activityRows(it.readings, OVERVIEW_ACTIVITY_METRICS, formatter, it.isProvisional) } ?: loading.activity,
    )
}
