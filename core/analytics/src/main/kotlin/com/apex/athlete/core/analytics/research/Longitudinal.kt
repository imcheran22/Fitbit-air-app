package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt

/**
 * LG01. The recent level of a signal against its longer-run level.
 *
 * @property drift fast median − slow median, in the signal's units.
 */
data class MedianDrift(
    val fastMedian: Double,
    val slowMedian: Double,
    val drift: Double,
    val validFastDays: Int,
    val validSlowDays: Int,
)

/**
 * A fitted trend.
 *
 * @property olsSlope ordinary least-squares slope per unit of x.
 * @property theilSenSlope median of all pairwise slopes; one or two wild points barely move it.
 * @property theilSenLower95 lower end of the 95 % interval of the Theil–Sen slope, null when
 *   there are too few points for one.
 */
data class TrendSlope(
    val olsSlope: Double,
    val theilSenSlope: Double,
    val theilSenLower95: Double?,
    val theilSenUpper95: Double?,
    val points: Int,
) {
    /** True when the 95 % interval excludes zero. A statement about the data, not about cause. */
    val intervalExcludesZero: Boolean?
        get() {
            val lo = theilSenLower95 ?: return null
            val hi = theilSenUpper95 ?: return null
            return lo > 0.0 || hi < 0.0
        }
}

/** Median of one 7-day block. [weekIndex] 0 is the oldest block of the window. */
data class WeeklyMedian(val weekIndex: Int, val weekEndDay: Long, val median: Double, val validDays: Int)

/** LG02. Weekly medians and the slope through them, per week. */
data class WeeklyTrend(val weeks: List<WeeklyMedian>, val slopePerWeek: TrendSlope) {
    /** OLS slope expressed per four weeks, the unit the research reports. */
    val olsSlopePerFourWeeks: Double get() = 4 * slopePerWeek.olsSlope
}

enum class ShiftDirection { UP, DOWN }

/**
 * Two-sided tabular CUSUM of a series.
 *
 * @property upper S⁺ after each element; [lower] S⁻.
 * @property alarmIndices indices at which either sum exceeded h.
 * @property onsetIndex estimated first index of the shift: the element after the alarming sum
 *   was last at zero. Null without an alarm.
 */
data class CusumResult(
    val upper: List<Double>,
    val lower: List<Double>,
    val alarmIndices: List<Int>,
    val direction: ShiftDirection?,
    val onsetIndex: Int?,
) {
    val firstAlarmIndex: Int? get() = alarmIndices.firstOrNull()
}

/**
 * LG03. Result of looking for a sustained change of level.
 *
 * @property referenceMedian level of the reference period the later days were compared with.
 * @property sigma robust spread of the reference period (after the floor).
 * @property shift median since the estimated onset − reference median; null when not detected.
 */
data class LevelShift(
    val detected: Boolean,
    val direction: ShiftDirection?,
    val firstAlarmDay: Long?,
    val estimatedOnsetDay: Long?,
    val referenceMedian: Double,
    val sigma: Double,
    val shift: Double?,
    val validReferenceDays: Int,
    val validMonitoredDays: Int,
)

/**
 * LG04 / BV01. The same metric on work days and on free days.
 *
 * @property gap mean on free days − mean on work days.
 */
data class WorkFreeSplit(
    val workMean: Double,
    val freeMean: Double,
    val gap: Double,
    val workSd: Double?,
    val freeSd: Double?,
    val workDays: Int,
    val freeDays: Int,
)

object Longitudinal {

    private const val WEEK = 7
    private const val Z_95 = 1.959963984540054

    // ------------------------------------------------------------------- LG01 baseline drift

    /**
     * LG01. Baseline drift: median of the last [fastDays] days minus the median of the last
     * [slowDays] days, both ending the day before [asOfDay]. Shows seasonal or behavioural
     * drift that a 28-day baseline absorbs silently. Evidence class B as a description; it
     * carries no health claim. The 28- and 90-day windows are the research's; the minimum
     * counts (14 and 56 valid days) are calibration choices.
     */
    fun medianDrift(
        history: List<DailyValue>,
        asOfDay: Long,
        fastDays: Int = 28,
        slowDays: Int = 90,
        minFastDays: Int = 14,
        minSlowDays: Int = 56,
    ): MedianDrift? {
        require(fastDays in 1 until slowDays) { "fastDays must be shorter than slowDays" }
        val fast = history.windowValues(asOfDay - fastDays, asOfDay)
        val slow = history.windowValues(asOfDay - slowDays, asOfDay)
        if (fast.size < maxOf(minFastDays, 1) || slow.size < maxOf(minSlowDays, 1)) return null
        val f = Stats.median(fast)!!
        val s = Stats.median(slow)!!
        return MedianDrift(f, s, f - s, fast.size, slow.size)
    }

    // ----------------------------------------------------------------------- LG02 trend

    /**
     * Slope of y on x by ordinary least squares and by the Theil–Sen estimator (Theil 1950;
     * Sen 1968): the median of the slopes `(y_j − y_i) / (x_j − x_i)` over all pairs of points.
     * The 95 % interval follows Sen 1968: with N pairwise slopes and
     * `C = 1.96 · √(n(n−1)(2n+5)/18)`, it runs from the slope of rank (N − C)/2 to the slope of
     * rank (N + C)/2 + 1, ranks rounded outwards. No correction for ties is made, which widens
     * the interval slightly. The interval assumes independent points; daily physiological
     * readings are autocorrelated, so on daily data it is too narrow and weekly medians are
     * the better input.
     *
     * Null for fewer than three points or when all x are equal.
     */
    fun trendSlope(points: List<Pair<Double, Double>>): TrendSlope? {
        val valid = points.filter { it.first.isFinite() && it.second.isFinite() }
        val n = valid.size
        if (n < 3) return null
        val ols = Stats.linearSlope(valid.map { it.first }, valid.map { it.second }) ?: return null

        val slopes = ArrayList<Double>(n * (n - 1) / 2)
        for (i in 0 until n) {
            for (j in i + 1 until n) {
                val dx = valid[j].first - valid[i].first
                if (dx != 0.0) slopes += (valid[j].second - valid[i].second) / dx
            }
        }
        if (slopes.isEmpty()) return null
        slopes.sort()
        val count = slopes.size
        val c = Z_95 * sqrt(n * (n - 1) * (2.0 * n + 5) / 18.0)
        val lowerRank = floor((count - c) / 2).toInt()
        val upperRank = ceil((count + c) / 2 + 1).toInt()
        val hasInterval = lowerRank >= 1 && upperRank <= count
        return TrendSlope(
            olsSlope = ols,
            theilSenSlope = Stats.median(slopes)!!,
            theilSenLower95 = if (hasInterval) slopes[lowerRank - 1] else null,
            theilSenUpper95 = if (hasInterval) slopes[upperRank - 1] else null,
            points = n,
        )
    }

    /**
     * LG02. Twelve-week trend: the median of each 7-day block ending on [asOfDay], and the
     * slope through those medians per week. Weekly RHR medians
     * `[60,60,59,59,59,58,58,58,57,57,57,56]` give an OLS slope of −0.343 bpm/week.
     *
     * A block needs [minValidDaysPerWeek] readings and the window [minWeeks] such blocks
     * (5 and 8 in the research); blocks that fall short are left out, keeping their place on
     * the time axis. Trend-based reading of training markers follows Plews et al. 2013; whether
     * a slope matters in practice is a separate question from whether it is detectable (Hopkins
     * et al. 2009). Evidence class B. The Theil–Sen slope is offered as the robust alternative;
     * the research documents it as an implementation choice.
     */
    fun weeklyTrend(
        history: List<DailyValue>,
        asOfDay: Long,
        weeks: Int = 12,
        minWeeks: Int = 8,
        minValidDaysPerWeek: Int = 5,
    ): WeeklyTrend? {
        require(weeks >= 3 && minWeeks in 3..weeks) { "minWeeks must be within 3..weeks" }
        val medians = (0 until weeks).mapNotNull { w ->
            val end = asOfDay - WEEK.toLong() * (weeks - 1 - w)
            val values = history.windowValues(end - WEEK + 1, end + 1)
            if (values.size < minValidDaysPerWeek) null
            else WeeklyMedian(w, end, Stats.median(values)!!, values.size)
        }
        if (medians.size < minWeeks) return null
        val slope = trendSlope(medians.map { it.weekIndex.toDouble() to it.median }) ?: return null
        return WeeklyTrend(medians, slope)
    }

    /**
     * Slope per day over the [windowDays] days ending on [asOfDay] (the research's "resting HR
     * trend slope", 14–28 days). Separates a gradual trend from one unusual day. The interval
     * is optimistic on daily data, see [trendSlope]. The 14-day minimum is a calibration choice.
     */
    fun dailyTrend(history: List<DailyValue>, asOfDay: Long, windowDays: Int = 28, minValidDays: Int = 14): TrendSlope? {
        val window = history.window(asOfDay - windowDays + 1, asOfDay + 1)
        if (window.size < maxOf(minValidDays, 3)) return null
        return trendSlope(window.map { it.epochDay.toDouble() to it.value })
    }

    // ------------------------------------------------------------------- LG03 level shift

    /**
     * Two-sided tabular CUSUM (Page 1954):
     *
     *   z_t = (x_t − target) / σ
     *   S⁺_t = max(0, S⁺_(t−1) + z_t − k)        S⁻_t = max(0, S⁻_(t−1) − z_t − k)
     *   alarm when S⁺_t > h or S⁻_t > h
     *
     * k = 0.5 and h = 4 are control-chart conventions and calibration choices here: they tune
     * the chart to shifts of about one σ and set how often it cries wolf. On independent data
     * a false alarm is then expected roughly every few months of daily readings, sooner when
     * the series is autocorrelated, as physiological series are.
     *
     * A null element is a day without a reading: both sums keep their value and no alarm is
     * raised for it.
     */
    fun cusum(series: List<Double?>, target: Double, sigma: Double, k: Double = 0.5, h: Double = 4.0): CusumResult {
        require(sigma > 0.0) { "sigma must be > 0" }
        require(k >= 0.0 && h > 0.0) { "k must be >= 0 and h > 0" }
        var sp = 0.0
        var sn = 0.0
        var lastZeroUpper = -1
        var lastZeroLower = -1
        val upper = ArrayList<Double>(series.size)
        val lower = ArrayList<Double>(series.size)
        val alarms = ArrayList<Int>()
        var direction: ShiftDirection? = null
        var onset: Int? = null
        for ((i, x) in series.withIndex()) {
            if (x != null && x.isFinite()) {
                val z = (x - target) / sigma
                sp = maxOf(0.0, sp + z - k)
                sn = maxOf(0.0, sn - z - k)
                if (sp == 0.0) lastZeroUpper = i
                if (sn == 0.0) lastZeroLower = i
                if (sp > h || sn > h) {
                    if (alarms.isEmpty()) {
                        direction = if (sp > h) ShiftDirection.UP else ShiftDirection.DOWN
                        onset = (if (sp > h) lastZeroUpper else lastZeroLower) + 1
                    }
                    alarms += i
                }
            }
            upper += sp
            lower += sn
        }
        return CusumResult(upper, lower, alarms, direction, onset)
    }

    /**
     * LG03. Looks for an abrupt, sustained change of level in the [windowDays] days ending on
     * [asOfDay]. The first [referenceDays] days set the target (their median) and σ
     * (1.4826 · MAD, not below [scaleFloor]); the remaining days run through [cusum].
     *
     * The purpose is to tell "I changed" from "the data source changed": the provider's
     * resting-heart-rate and HRV algorithms are undocumented and can change with firmware or a
     * new device. A detected shift only says that the level moved and stayed moved. It cannot
     * say why, and it is not a health finding; the app should ask the user for context and
     * start a fresh baseline segment. Evidence class B for the method (Page 1954), C for any
     * interpretation.
     *
     * The research asks for 60 days or more with at least 28 valid ones. Splitting the window
     * into a 28-day reference and a monitored remainder, and requiring 14 valid reference days
     * and 7 valid monitored days, are calibration choices.
     *
     * @return null when the window is too thinly covered to judge.
     */
    fun levelShift(
        history: List<DailyValue>,
        asOfDay: Long,
        scaleFloor: Double,
        windowDays: Int = 60,
        referenceDays: Int = 28,
        minValidDays: Int = 28,
        minReferenceDays: Int = 14,
        minMonitoredDays: Int = 7,
        k: Double = 0.5,
        h: Double = 4.0,
    ): LevelShift? {
        require(referenceDays in 2 until windowDays) { "referenceDays must be shorter than windowDays" }
        require(scaleFloor > 0.0) { "scaleFloor must be > 0" }
        val first = asOfDay - windowDays + 1
        val monitorFrom = first + referenceDays
        val reference = history.windowValues(first, monitorFrom)
        val byDay = history.window(monitorFrom, asOfDay + 1).associateBy({ it.epochDay }, { it.value })
        if (reference.size < minReferenceDays || byDay.size < minMonitoredDays) return null
        if (reference.size + byDay.size < minValidDays) return null

        val target = Stats.median(reference)!!
        val sigma = maxOf(RobustBaseline.MAD_TO_SD * InterpretationStats.medianAbsoluteDeviation(reference)!!, scaleFloor)
        val days = (monitorFrom..asOfDay).toList()
        val result = cusum(days.map { byDay[it] }, target, sigma, k, h)

        val onsetDay = result.onsetIndex?.let { days[it] }
        val sinceOnset = onsetDay?.let { from -> days.filter { it >= from }.mapNotNull { byDay[it] } }
        return LevelShift(
            detected = result.firstAlarmIndex != null,
            direction = result.direction,
            firstAlarmDay = result.firstAlarmIndex?.let { days[it] },
            estimatedOnsetDay = onsetDay,
            referenceMedian = target,
            sigma = sigma,
            shift = sinceOnset?.let { Stats.median(it) }?.let { it - target },
            validReferenceDays = reference.size,
            validMonitoredDays = byDay.size,
        )
    }

    // ------------------------------------------------------------ LG04 / BV01 work vs free

    /**
     * LG04 / BV01. Mean and spread of a metric on work days and on free days over the
     * [windowDays] days ending on [asOfDay], and the gap between the means (weekend sleep
     * extension, weekend step drop). Evidence class B as a description of the person's rhythm
     * (Roenneberg et al. 2012 for sleep timing); it proves neither deprivation nor harm.
     * Requiring 8 work days and 4 free days in 28 is a calibration choice.
     *
     * Not for clock times, which wrap at midnight; use [SleepRegularity.socialJetlag].
     *
     * @param isFreeDay which days are free, from the user's schedule.
     */
    fun workFreeSplit(
        history: List<DailyValue>,
        asOfDay: Long,
        isFreeDay: (Long) -> Boolean,
        windowDays: Int = 28,
        minWorkDays: Int = 8,
        minFreeDays: Int = 4,
    ): WorkFreeSplit? {
        val (free, work) = history.window(asOfDay - windowDays + 1, asOfDay + 1).partition { isFreeDay(it.epochDay) }
        if (work.size < maxOf(minWorkDays, 1) || free.size < maxOf(minFreeDays, 1)) return null
        val w = work.map { it.value }
        val f = free.map { it.value }
        val workMean = Stats.mean(w)!!
        val freeMean = Stats.mean(f)!!
        return WorkFreeSplit(
            workMean = workMean,
            freeMean = freeMean,
            gap = freeMean - workMean,
            workSd = Stats.sampleStdDev(w),
            freeSd = Stats.sampleStdDev(f),
            workDays = w.size,
            freeDays = f.size,
        )
    }
}
