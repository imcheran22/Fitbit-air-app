package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats

/**
 * How the robust personal baseline of one daily signal is built (the research's rule "BL-R").
 *
 * @property windowDays trailing calendar days before the evaluated day. Days without a reading
 *   simply do not count; they are never filled in.
 * @property minValidDays readings required inside the window before any deviation is reported.
 * @property scaleFloor lower limit for the robust spread, in the signal's own units. Wearable
 *   daily values are coarse (whole bpm, 0.1 br/min), so the MAD is often zero; without a floor a
 *   one-unit change would produce an infinite z. Every floor is a calibration choice.
 */
data class RobustBaselineSpec(
    val windowDays: Int = 28,
    val minValidDays: Int = 14,
    val scaleFloor: Double,
) {
    init {
        require(windowDays >= 2) { "windowDays must be >= 2" }
        require(minValidDays in 2..windowDays) { "minValidDays must be within 2..windowDays" }
        require(scaleFloor > 0.0) { "scaleFloor must be > 0" }
    }
}

/**
 * Defaults from the research's baseline table. Windows, minimum days and floors are all
 * "tunable app defaults — not clinical": calibration choices, none of them a validated cut-off.
 */
object RobustBaselineSpecs {
    /** CV01. Floor 1.0 bpm. */
    val RESTING_HEART_RATE = RobustBaselineSpec(scaleFloor = 1.0)
    /** RT01. Floor 0.3 breaths/min. */
    val RESPIRATORY_RATE = RobustBaselineSpec(scaleFloor = 0.3)
    /** RT04. Floor 0.5 percentage points. */
    val SPO2 = RobustBaselineSpec(scaleFloor = 0.5)
    /** RT07, applied to the provider's nightly − baseline delta. Floor 0.1 °C. */
    val SLEEP_TEMPERATURE_DELTA = RobustBaselineSpec(scaleFloor = 0.1)
    /** SL01. Floor 15 min. */
    val SLEEP_DURATION = RobustBaselineSpec(scaleFloor = 15.0)
    /** PA01. Floor 500 steps. */
    val STEPS = RobustBaselineSpec(scaleFloor = 500.0)
}

/**
 * One reading against the robust personal baseline.
 *
 * @property mad unscaled median absolute deviation of the baseline readings.
 * @property scale spread actually used: max(1.4826 · MAD, floor).
 * @property floorApplied true when the floor, not the data, set the scale; the z is then a
 *   conservative lower bound in magnitude.
 * @property robustZ (value − median) / scale. Unclamped. A statistic about this person's own
 *   recent readings; it is not a probability and not a clinical severity.
 * @property percentFromMedian 100 · delta / median; null when the median is zero.
 */
data class RobustDeviation(
    val value: Double,
    val median: Double,
    val mad: Double,
    val scale: Double,
    val floorApplied: Boolean,
    val validDays: Int,
    val delta: Double,
    val robustZ: Double,
    val percentFromMedian: Double?,
)

/**
 * Rolling median ± MAD baseline and robust z-score (Rousseeuw & Croux 1993; Leys et al. 2013).
 *
 *   delta = x − median(baseline)
 *   z     = delta / max(1.4826 · MAD(baseline), floor)
 *
 * The median and MAD tolerate outliers and a run of unusual days far better than the mean and
 * SD used by [com.apex.athlete.core.analytics.baseline.BaselineEngine], which is why the research
 * prefers them for daily deviation checks (CV01 resting heart rate, RT01 breathing rate, RT04
 * SpO2, RT07 sleeping temperature, PA01 steps, SL01 sleep duration). Evidence class B–C: the
 * statistic is standard, its use for individual health monitoring on a wrist device is not
 * validated. It supports "different from your usual", never a diagnosis.
 */
object RobustBaseline {

    /** Scales a MAD to a standard deviation under normality (Rousseeuw & Croux 1993). */
    const val MAD_TO_SD = 1.4826

    /**
     * Deviation of [value] from [baselineValues]. Nulls and non-finite entries are gaps and are
     * dropped, not filled. Null when fewer than [RobustBaselineSpec.minValidDays] readings remain.
     */
    fun deviation(value: Double, baselineValues: List<Double?>, spec: RobustBaselineSpec): RobustDeviation? {
        if (!value.isFinite()) return null
        val valid = baselineValues.filterNotNull().filter { it.isFinite() }
        if (valid.size < spec.minValidDays) return null
        val median = Stats.median(valid)!!
        val mad = InterpretationStats.medianAbsoluteDeviation(valid)!!
        val scaled = MAD_TO_SD * mad
        val scale = maxOf(scaled, spec.scaleFloor)
        val delta = value - median
        return RobustDeviation(
            value = value,
            median = median,
            mad = mad,
            scale = scale,
            floorApplied = scaled < spec.scaleFloor,
            validDays = valid.size,
            delta = delta,
            robustZ = delta / scale,
            percentFromMedian = if (median != 0.0) 100.0 * delta / median else null,
        )
    }

    /**
     * Deviation of the reading on [asOfDay] from the [RobustBaselineSpec.windowDays] days before
     * it. The evaluated day is never part of its own baseline.
     *
     * @param excludedDays days the user tagged as illness or travel; they are left out of the
     *   baseline so an unusual stretch does not become the new normal.
     * @return null when [asOfDay] has no reading or the baseline is still immature.
     */
    fun deviation(
        history: List<DailyValue>,
        asOfDay: Long,
        spec: RobustBaselineSpec,
        excludedDays: Set<Long> = emptySet(),
    ): RobustDeviation? {
        val today = history.firstOrNull { it.epochDay == asOfDay && it.value.isFinite() } ?: return null
        val base = history.window(asOfDay - spec.windowDays, asOfDay)
            .filter { it.epochDay !in excludedDays }
            .map { it.value }
        return deviation(today.value, base, spec)
    }

    /**
     * Like [deviation], but the baseline holds only the same weekday of the previous [weeks]
     * weeks (the research's method 10, "weekday-adjusted baseline"). Steps and sleep timing
     * differ systematically between work days and days off, so comparing a Sunday with the
     * preceding Sundays avoids flagging every weekend.
     *
     * [minValidWeeks] is a calibration choice; the research only states that about eight weeks
     * of history are needed.
     */
    fun sameWeekdayDeviation(
        history: List<DailyValue>,
        asOfDay: Long,
        scaleFloor: Double,
        weeks: Int = 8,
        minValidWeeks: Int = 4,
    ): RobustDeviation? {
        require(weeks >= 2 && minValidWeeks in 2..weeks) { "minValidWeeks must be within 2..weeks" }
        val byDay = history.filter { it.value.isFinite() }.associateBy({ it.epochDay }, { it.value })
        val today = byDay[asOfDay] ?: return null
        val base = (1..weeks).map { byDay[asOfDay - 7L * it] }
        return deviation(today, base, RobustBaselineSpec(windowDays = weeks, minValidDays = minValidWeeks, scaleFloor = scaleFloor))
    }

    /**
     * Number of consecutive days ending on [asOfDay] whose robust z met [zThreshold]: at or above
     * it for a positive threshold, at or below it for a negative one. Each day is judged against
     * its own trailing baseline. A day without a reading, or with an immature baseline, ends the
     * count: an unknown day is not assumed to be unusual, and not assumed to be normal either.
     *
     * The research asks for persistence ("z ≥ 2 for ≥ 2 consecutive days") before anything is
     * said, because one unusual night is mostly noise.
     */
    fun consecutiveDaysBeyond(
        history: List<DailyValue>,
        asOfDay: Long,
        spec: RobustBaselineSpec,
        zThreshold: Double,
        excludedDays: Set<Long> = emptySet(),
        maxDays: Int = 14,
    ): Int {
        require(zThreshold != 0.0) { "zThreshold must not be zero" }
        var count = 0
        var day = asOfDay
        while (count < maxDays) {
            val z = deviation(history, day, spec, excludedDays)?.robustZ ?: break
            val beyond = if (zThreshold > 0) z >= zThreshold else z <= zThreshold
            if (!beyond) break
            count++
            day--
        }
        return count
    }
}
