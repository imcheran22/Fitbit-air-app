package com.apex.athlete.ui.strain

import com.apex.athlete.core.analytics.load.LoadPoint
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.StrainResult
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.ui.charts.ChartPoint
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
    return ZONE_DISPLAY_ORDER.map { zone ->
        val minutes = strain.minutesByZone[zone]?.takeIf { it.isFinite() && it >= 0.0 }
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
