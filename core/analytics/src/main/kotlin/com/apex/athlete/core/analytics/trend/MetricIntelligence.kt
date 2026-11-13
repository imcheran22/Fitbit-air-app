package com.apex.athlete.core.analytics.trend

import com.apex.athlete.core.analytics.baseline.Baseline
import com.apex.athlete.core.analytics.baseline.BaselineEngine
import com.apex.athlete.core.analytics.baseline.BaselineSpec
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.baseline.ValueTransform
import com.apex.athlete.core.analytics.stats.Ewma
import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.abs

enum class TrendDirection { RISING, STABLE, FALLING, INSUFFICIENT_DATA }

enum class RangeStatus {
    /** No reading for the evaluated day. */
    NO_READING,
    /** A reading exists but the personal baseline is still being learned. */
    CALIBRATING,
    WITHIN_NORMAL,
    ABOVE_NORMAL,
    BELOW_NORMAL,
}

/**
 * Everything the app shows about one metric on one day: the reading, how it compares with the
 * previous reading and the personal baseline, and where it is heading.
 */
data class MetricIntelligence(
    val asOfDay: Long,
    val current: Double?,
    /** Most recent reading before [asOfDay], and the day it was taken. */
    val previous: Double?,
    val previousDay: Long?,
    val changeFromPrevious: Double?,
    /**
     * 7-day exponentially weighted average up to and including [asOfDay], in the metric's own
     * units. It is averaged on the baseline's scale and transformed back, so for HRV it is a
     * weighted geometric mean of RMSSD (the 7-day ln RMSSD average of Plews et al. 2013), directly
     * comparable with [Baseline.lowerNormal] and [Baseline.upperNormal]. Days without a reading are
     * skipped, so check [validDaysLast7] before treating it as current.
     */
    val ewma7: Double?,
    /** Plain mean of the readings in the last 7 days (including [asOfDay]). */
    val mean7: Double?,
    val validDaysLast7: Int,
    val baseline: Baseline,
    val zScore: Double?,
    /** (current − baseline center) / baseline center. */
    val fractionFromBaseline: Double?,
    val rangeStatus: RangeStatus,
    val trend: TrendDirection,
    /**
     * Number of consecutive days, ending on [asOfDay], whose readings fell outside the normal
     * range on the same side as today's. Zero when today is within range or has no reading.
     */
    val consecutiveDaysOutsideNormal: Int,
    /** Coefficient of variation of the last 7 days' readings (SD / mean). */
    val coefficientOfVariation7: Double?,
    /** Weekly status of the ln-scale metric (HRV) against a baseline that ends before the week; null for other metrics. */
    val weeklyStatus: WeeklyHrvStatus? = null,
)

object MetricTrendAnalyzer {

    /** Minimum readings inside the last 7 days before a trend direction is reported. */
    const val MIN_POINTS_FOR_TREND = 4

    /**
     * A 7-day change counts as a trend once the fitted line moves by more than this many baseline
     * standard deviations across the window.
     */
    const val TREND_THRESHOLD_SD = 0.75

    /** Fallback when no baseline exists yet: the fitted line must move by more than 5 % of the window mean. */
    const val TREND_THRESHOLD_FRACTION = 0.05

    fun analyze(history: List<DailyValue>, asOfDay: Long, spec: BaselineSpec): MetricIntelligence {
        // One reading per day; the first one listed wins, exactly as in BaselineEngine.
        val byDay = LinkedHashMap<Long, Double>()
        for (v in history) {
            if (v.epochDay <= asOfDay && spec.transform.isValid(v.value)) byDay.putIfAbsent(v.epochDay, v.value)
        }

        val current = byDay[asOfDay]
        val previousDay = byDay.keys.filter { it < asOfDay }.maxOrNull()
        val previous = previousDay?.let { byDay[it] }

        val baseline = BaselineEngine.baseline(history, asOfDay, spec)
        val z = current?.let { BaselineEngine.zScore(it, baseline) }

        // EWMA runs over the baseline window plus today so that it has settled by the last day.
        // It is taken on the baseline's scale (ln for HRV) so that it compares like with like
        // against the normal range, which is built on that scale too.
        val ewmaStart = asOfDay - spec.windowDays
        val ewmaInput = (ewmaStart..asOfDay).map { d -> byDay[d]?.let(spec.transform::apply) }
        val ewma7 = Ewma.last(ewmaInput, span = 7)?.let(spec.transform::invert)

        val last7 = ((asOfDay - 6)..asOfDay).mapNotNull { d -> byDay[d]?.let { d to it } }
        val last7Values = last7.map { it.second }
        val mean7 = Stats.mean(last7Values)
        val cv7 = if (last7Values.size >= 3 && mean7 != null && mean7 != 0.0) {
            Stats.sampleStdDev(last7Values)!! / abs(mean7)
        } else null

        return MetricIntelligence(
            asOfDay = asOfDay,
            current = current,
            previous = previous,
            previousDay = previousDay,
            changeFromPrevious = if (current != null && previous != null) current - previous else null,
            ewma7 = ewma7,
            mean7 = mean7,
            validDaysLast7 = last7Values.size,
            baseline = baseline,
            zScore = z,
            fractionFromBaseline = current?.let { BaselineEngine.fractionFromBaseline(it, baseline) },
            rangeStatus = rangeStatus(current, baseline),
            trend = trend(last7, baseline, spec),
            consecutiveDaysOutsideNormal = consecutiveOutside(byDay, asOfDay, baseline),
            coefficientOfVariation7 = cv7,
            weeklyStatus = if (spec.transform == ValueTransform.NATURAL_LOG) WeeklyHrvStatusAnalyzer.analyze(history, asOfDay) else null,
        )
    }

    private fun rangeStatus(current: Double?, baseline: Baseline): RangeStatus {
        if (current == null) return RangeStatus.NO_READING
        val lo = baseline.lowerNormal
        val hi = baseline.upperNormal
        if (!baseline.isEstablished || lo == null || hi == null) return RangeStatus.CALIBRATING
        return when {
            current > hi -> RangeStatus.ABOVE_NORMAL
            current < lo -> RangeStatus.BELOW_NORMAL
            else -> RangeStatus.WITHIN_NORMAL
        }
    }

    private fun trend(last7: List<Pair<Long, Double>>, baseline: Baseline, spec: BaselineSpec): TrendDirection {
        if (last7.size < MIN_POINTS_FOR_TREND) return TrendDirection.INSUFFICIENT_DATA
        val xs = last7.map { it.first.toDouble() }
        val ys = last7.map { spec.transform.apply(it.second) }
        val slope = Stats.linearSlope(xs, ys) ?: return TrendDirection.INSUFFICIENT_DATA
        val movement = slope * (xs.last() - xs.first())

        val sd = baseline.effectiveSd
        val threshold = if (baseline.isEstablished && sd != null && sd > 0) {
            TREND_THRESHOLD_SD * sd
        } else {
            // On the log scale a difference already is a relative change.
            val meanAbs = abs(Stats.mean(ys)!!)
            if (spec.transform == ValueTransform.NATURAL_LOG) {
                TREND_THRESHOLD_FRACTION
            } else {
                TREND_THRESHOLD_FRACTION * meanAbs
            }
        }
        return when {
            movement > threshold -> TrendDirection.RISING
            movement < -threshold -> TrendDirection.FALLING
            else -> TrendDirection.STABLE
        }
    }

    // Earlier days are judged against today's normal range; over a streak of a few days the
    // 30-day range moves too little for that to change the count.
    private fun consecutiveOutside(byDay: Map<Long, Double>, asOfDay: Long, baseline: Baseline): Int {
        val lo = baseline.lowerNormal ?: return 0
        val hi = baseline.upperNormal ?: return 0
        val today = byDay[asOfDay] ?: return 0
        val side = when {
            today > hi -> 1
            today < lo -> -1
            else -> return 0
        }
        var count = 0
        var day = asOfDay
        while (true) {
            val v = byDay[day] ?: break
            val sameSide = if (side > 0) v > hi else v < lo
            if (!sameSide) break
            count++
            day--
        }
        return count
    }
}
