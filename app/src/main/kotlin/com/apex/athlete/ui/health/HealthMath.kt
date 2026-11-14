package com.apex.athlete.ui.health

import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.Polarity
import kotlin.math.abs

/*
 * Pure helpers for the Health area: no Compose, no Android. They are unit tested on the JVM.
 */

/** The ranges offered on the trend detail screen, in days. */
val TREND_RANGES: List<Int> = listOf(14, 30, 90, 365)

const val DEFAULT_TREND_RANGE = 30

/** Days shown in the sparkline cards on the Health tab. */
const val SPARKLINE_DAYS = 14

/** The metrics shown as sparkline cards on the Health tab, in order. */
val HEALTH_TREND_METRICS: List<MetricType> = listOf(
    MetricType.HRV_RMSSD,
    MetricType.RESTING_HEART_RATE,
    MetricType.SLEEPING_HEART_RATE,
    MetricType.RESPIRATORY_RATE,
    MetricType.SPO2_AVG,
    MetricType.SKIN_TEMP_DEVIATION,
)

/** Anything that is not one of the offered ranges falls back to the default. */
fun sanitizeRange(days: Int?): Int = if (days != null && days in TREND_RANGES) days else DEFAULT_TREND_RANGE

/**
 * How a metric is shown: decimals, unit and the conversion from the stored unit. Mirrors the display
 * table in `MetricStateMapper` so chart axes, baselines and the headline value agree.
 * Skin temperature is a difference, so it only follows the owner's temperature unit.
 */
class MetricDisplay(val decimals: Int, val unit: String?, val convert: (Double) -> Double)

private val identity: (Double) -> Double = { it }
private val minutesToHours: (Double) -> Double = { it / 60.0 }

/** The unit words for distance and weight; the screens read them from resources, tests use the defaults. */
data class UnitLabels(val km: String = "km", val mi: String = "mi", val kg: String = "kg", val lb: String = "lb")

private const val METERS_PER_MILE = 1609.344
private const val POUNDS_PER_KG = 2.2046226218
private const val FAHRENHEIT_PER_CELSIUS = 1.8

/**
 * [skinUnit] and [skinConvert] describe a temperature DIFFERENCE (no offset). An absolute skin temperature
 * (SKIN_TEMP_NIGHTLY) uses the same unit word but adds the 32 degree offset when [units] is imperial.
 * Distance is stored in metres and weight in kilograms; both follow [units].
 */
fun metricDisplay(
    metric: MetricType,
    skinUnit: String,
    skinConvert: (Double) -> Double,
    units: UnitSystem = UnitSystem.METRIC,
    labels: UnitLabels = UnitLabels(),
): MetricDisplay = when (metric) {
    MetricType.HRV_RMSSD, MetricType.HRV_DEEP_SLEEP_RMSSD, MetricType.HRV_SLEEP_SAMPLES -> MetricDisplay(0, "ms", identity)
    MetricType.HRV_LOW_FREQUENCY, MetricType.HRV_HIGH_FREQUENCY -> MetricDisplay(0, "ms²", identity)
    MetricType.RESTING_HEART_RATE, MetricType.SLEEPING_HEART_RATE, MetricType.STRESS_DAY_AGGREGATE_BPM -> MetricDisplay(0, "bpm", identity)
    MetricType.RESPIRATORY_RATE -> MetricDisplay(1, "br/min", identity)
    MetricType.SPO2_AVG, MetricType.SPO2_LOWER_BOUND, MetricType.SPO2_UPPER_BOUND -> MetricDisplay(1, "%", identity)
    MetricType.SKIN_TEMP_DEVIATION -> MetricDisplay(1, skinUnit, skinConvert)
    MetricType.SKIN_TEMP_NIGHTLY -> MetricDisplay(
        1,
        skinUnit,
        if (units == UnitSystem.IMPERIAL) { c: Double -> c * FAHRENHEIT_PER_CELSIUS + 32.0 } else identity,
    )
    MetricType.VO2_MAX -> MetricDisplay(1, "ml/kg/min", identity)
    MetricType.SLEEP_DURATION, MetricType.TIME_IN_BED -> MetricDisplay(1, "h", minutesToHours)
    MetricType.RECOVERY_SCORE, MetricType.SLEEP_SCORE -> MetricDisplay(0, "%", identity)
    MetricType.STRAIN_SCORE, MetricType.STRAIN_TARGET -> MetricDisplay(1, null, identity)
    MetricType.STEPS, MetricType.DAILY_TRIMP -> MetricDisplay(0, null, identity)
    MetricType.DISTANCE ->
        if (units == UnitSystem.IMPERIAL) MetricDisplay(2, labels.mi) { it / METERS_PER_MILE } else MetricDisplay(2, labels.km) { it / 1000.0 }
    MetricType.WEIGHT ->
        if (units == UnitSystem.IMPERIAL) MetricDisplay(1, labels.lb) { it * POUNDS_PER_KG } else MetricDisplay(1, labels.kg, identity)
    MetricType.BODY_FAT, MetricType.HR_DIP -> MetricDisplay(1, "%", identity)
    MetricType.BMI -> MetricDisplay(1, "kg/m²", identity)
    MetricType.HRV_CV7_LN -> MetricDisplay(1, "%", identity)
    MetricType.GUIDELINE_SHORTFALL_CLIPPED_7D, MetricType.GUIDELINE_SHORTFALL_SIGNED_7D -> MetricDisplay(1, "h", minutesToHours)
    MetricType.AWAKENINGS_PER_HOUR, MetricType.SEDENTARY_BREAKS_PER_HOUR -> MetricDisplay(1, "/h", identity)
    MetricType.SLEEP_REGULARITY_INDEX, MetricType.SEDENTARY_PROLONGED_BOUTS -> MetricDisplay(0, null, identity)
    MetricType.PEAK_CADENCE_30 -> MetricDisplay(0, "steps/min", identity)
    MetricType.HRV_ROBUST_Z, MetricType.RHR_ROBUST_Z, MetricType.RESP_RATE_ROBUST_Z -> MetricDisplay(1, null, identity)
    MetricType.STRESS_SCORE -> MetricDisplay(1, null, identity)
    else -> MetricDisplay(0, metric.unit.takeIf { it.isNotBlank() }, identity)
}

/** Which side of the usual range is good for a metric. */
enum class ZSide { NEUTRAL, GOOD, BAD }

/**
 * Colour meaning of a Z-score badge: neutral inside one standard deviation, otherwise good or bad by the
 * metric's polarity. Metrics with no good direction (breathing rate, skin temperature) stay neutral.
 */
fun zSide(metric: MetricType, z: Double?): ZSide {
    if (z == null || !z.isFinite() || abs(z) <= 1.0) return ZSide.NEUTRAL
    return when (metric.polarity) {
        Polarity.HIGHER_IS_BETTER -> if (z > 0) ZSide.GOOD else ZSide.BAD
        Polarity.LOWER_IS_BETTER -> if (z < 0) ZSide.GOOD else ZSide.BAD
        Polarity.NEUTRAL -> ZSide.NEUTRAL
    }
}

/** Min, max and mean of the readings that exist. Gaps are skipped, never counted as zero. */
data class SeriesSummary(val min: Double?, val max: Double?, val mean: Double?, val readings: Int, val days: Int)

fun summarize(values: List<Double?>): SeriesSummary {
    var min = Double.POSITIVE_INFINITY
    var max = Double.NEGATIVE_INFINITY
    var sum = 0.0
    var n = 0
    for (v in values) {
        if (v == null || !v.isFinite()) continue
        if (v < min) min = v
        if (v > max) max = v
        sum += v
        n++
    }
    return if (n == 0) SeriesSummary(null, null, null, 0, values.size) else SeriesSummary(min, max, sum / n, n, values.size)
}

/** Lowest and highest of the heart-rate values that exist (null gaps are skipped). */
data class HeartRateExtremes(val lowest: Double?, val highest: Double?)

fun heartRateExtremes(bpm: List<Double?>): HeartRateExtremes {
    val s = summarize(bpm)
    return HeartRateExtremes(s.min, s.max)
}

/** Minutes in a zone as whole seconds for the zone bars; null stays unknown. */
fun minutesToSeconds(minutes: Double?): Long? =
    if (minutes == null || !minutes.isFinite() || minutes < 0) null else Math.round(minutes * 60.0)
