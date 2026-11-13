package com.apex.athlete.ui.strain

import com.apex.athlete.core.analytics.load.LoadPoint
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.StrainResult
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.charts.DailyBar
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** Pure mapping from engine output to what the Strain screen draws. No Android types, so it is unit tested on the JVM. */

/** Zones in the order ZoneBars draws them: hottest first, "below zone 1" last. */
internal val ZONE_DISPLAY_ORDER: List<HeartRateZone> = listOf(
    HeartRateZone.ZONE_5,
    HeartRateZone.ZONE_4,
    HeartRateZone.ZONE_3,
    HeartRateZone.ZONE_2,
    HeartRateZone.ZONE_1,
    HeartRateZone.BELOW_ZONES,
)

/**
 * One zone row. [seconds] is null when the engine reported nothing for the zone (shown as `--`, never zero).
 * [lowBpm] and [highBpm] are null when no zone model exists. [openEnded] marks zone 5, which has no upper limit
 * in the label. For [HeartRateZone.BELOW_ZONES] only [highBpm] is set: the lower limit of zone 1.
 */
internal data class ZoneRow(
    val zone: HeartRateZone,
    val seconds: Long?,
    val lowBpm: Int?,
    val highBpm: Int?,
    val openEnded: Boolean,
)

internal fun zoneRows(strain: StrainResult?, model: HeartRateZoneModel?): List<ZoneRow> {
    if (strain == null) return emptyList()
    return zoneRowsOf(strain.minutesByZone, model)
}

/**
 * Rows from minutes per zone (the day's `zoneMinutes`, or a workout's). A null map (no zone model or no heart rate) gives no
 * rows. A zone absent from the map stays unknown; a present zero is a measured zero.
 */
internal fun zoneRowsOf(minutesByZone: Map<HeartRateZone, Double>?, model: HeartRateZoneModel?): List<ZoneRow> {
    if (minutesByZone == null) return emptyList()
    return ZONE_DISPLAY_ORDER.map { zone ->
        val minutes = minutesByZone[zone]?.takeIf { it.isFinite() && it >= 0.0 }
        val seconds = minutes?.let { (it * 60.0).roundToLong() }
        when {
            model == null -> ZoneRow(zone, seconds, null, null, openEnded = false)
            zone == HeartRateZone.BELOW_ZONES ->
                ZoneRow(zone, seconds, null, model.lowerBounds.first().roundToInt(), openEnded = false)
            zone == HeartRateZone.ZONE_5 ->
                ZoneRow(zone, seconds, model.rangeOf(zone).start.roundToInt(), null, openEnded = true)
            else -> {
                val range = model.rangeOf(zone)
                ZoneRow(zone, seconds, range.start.roundToInt(), range.endInclusive.roundToInt(), openEnded = false)
            }
        }
    }
}

/** True when at least one zone has a measured duration. */
internal fun hasZoneData(rows: List<ZoneRow>): Boolean = rows.any { it.seconds != null }

/** The three series [com.apex.athlete.core.ui.charts.AcwrTrendChart] draws, with gaps kept as null. */
internal data class LoadChartData(
    val acute: List<ChartPoint>,
    val chronic: List<ChartPoint>,
    val acwr: List<ChartPoint>,
) {
    val isEmpty: Boolean get() = acute.none { it.y != null } && chronic.none { it.y != null }
}

/**
 * Last [maxDays] days of the load series. The ratio is the coupled ratio ATL / CTL, defined only where both loads
 * exist and CTL is above zero; a day without data stays a gap and is never interpolated.
 */
internal fun loadChartData(series: List<LoadPoint>, maxDays: Int = 56): LoadChartData {
    val recent = if (series.size > maxDays) series.subList(series.size - maxDays, series.size) else series
    return LoadChartData(
        acute = recent.map { ChartPoint(it.epochDay, it.acute?.takeIf(Double::isFinite)) },
        chronic = recent.map { ChartPoint(it.epochDay, it.chronic?.takeIf(Double::isFinite)) },
        acwr = recent.map {
            val a = it.acute
            val c = it.chronic
            val ratio = if (a != null && c != null && a.isFinite() && c.isFinite() && c > 0.0) a / c else null
            ChartPoint(it.epochDay, ratio)
        },
    )
}

/** Workouts of the day in time order. */
internal fun sortedWorkouts(workouts: List<WorkoutEntity>): List<WorkoutEntity> = workouts.sortedBy { it.startEpochMillis }

/** Fewest recorded days before the athlete's own strain base (and so the personal target) exists. */
internal const val MIN_PERSONAL_STRAIN_DAYS = 5

/**
 * The athlete's own usual strain, the base the target is built from. Null (fewer than [MIN_PERSONAL_STRAIN_DAYS] recorded
 * days) is Calibrating, never Unavailable and never a number.
 */
internal fun personalStrainBaseState(base: Double?): MetricState =
    if (base != null && base.isFinite()) {
        MetricState.Value(base, 1, null, DataProvenance.MATHEMATICALLY_DERIVED)
    } else {
        MetricState.Calibrating(null)
    }

/** Confidence in the training load as a percentage (0..100); not finite is Unavailable. */
internal fun loadConfidenceState(confidence: Double, calibrating: Boolean): MetricState = when {
    !confidence.isFinite() -> MetricState.Unavailable(MetricReason.NO_DATA)
    calibrating -> MetricState.Calibrating(null)
    else -> MetricState.Value((confidence * 100.0).coerceIn(0.0, 100.0), 0, "%", DataProvenance.MATHEMATICALLY_DERIVED)
}

/**
 * Bars of the steps history. A day without a reading stays an empty slot (a gap, never 0); the last day is provisional
 * when it is still accumulating.
 */
internal fun stepsBars(history: List<TrendPoint>, provisional: Boolean): List<DailyBar> {
    val lastDay = history.lastOrNull()?.epochDay
    return history.map { p ->
        DailyBar(
            epochDay = p.epochDay,
            value = p.value?.takeIf { it.isFinite() && it >= 0.0 },
            tone = ChartTone.STRAIN,
            provisional = provisional && p.epochDay == lastDay,
        )
    }
}
