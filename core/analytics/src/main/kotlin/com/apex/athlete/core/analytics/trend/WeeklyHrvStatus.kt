package com.apex.athlete.core.analytics.trend

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.exp
import kotlin.math.ln

enum class WeeklyHrvState {
    WITHIN_RANGE,
    ABOVE_RANGE,
    /** The week's average is below the balanced range (more than 0.75 SD under the baseline). */
    BELOW_RANGE,
    /** The week's average is more than 1.5 SD under the baseline. */
    MARKEDLY_BELOW,
    /** Fewer than [WeeklyHrvStatusAnalyzer.MIN_BASELINE_NIGHTS] baseline nights: no judgement. */
    BASELINE_BUILDING,
    /** Fewer than [WeeklyHrvStatusAnalyzer.MIN_WEEK_NIGHTS] nights in the last 7: no judgement. */
    NO_RECENT_NIGHTS,
}

/**
 * @property weekAverage geometric mean (back-transformed mean of ln) of the week's nightly HRV, in ms.
 * @property baselineCenter geometric mean of the baseline nights, in ms.
 * @property rangeLow lower edge of the balanced range (centre - 0.75 SD, back-transformed), ms.
 * @property markedlyLowLine centre - 1.5 SD, back-transformed, ms.
 * @property zScore (week mean ln - baseline mean ln) / SD, not clamped.
 */
data class WeeklyHrvStatus(
    val state: WeeklyHrvState,
    val weekNights: Int,
    val baselineNights: Int,
    val weekAverage: Double? = null,
    val baselineCenter: Double? = null,
    val rangeLow: Double? = null,
    val rangeHigh: Double? = null,
    val markedlyLowLine: Double? = null,
    val zScore: Double? = null,
)

/**
 * Weekly HRV status (formula version 3): the mean of the last 7 nights' ln RMSSD against a
 * baseline of earlier nights that **ends before the week starts**, so a sustained fall cannot
 * pull its own reference down (probe G2 in docs/review/METRICS_ALIGNMENT.md: a baseline that
 * contained the week stopped flagging a 17 % fall after about 12 days).
 *
 * Rules (all *calibration* except the use of ln RMSSD, Plews et al. 2013, unverified):
 * - week = the 7 days ending on the as-of day, at least 4 nights with a reading;
 * - baseline = the 60 days before the week, at least 21 nights with a reading, mean and sample SD on the ln scale;
 * - SD never below 0.05 (about 5 % of RMSSD);
 * - balanced within 0.75 SD of the baseline mean, markedly below under -1.5 SD.
 * The form follows the reference app's weekly status, whose published baseline length (60 nights) is
 * used here; a 30-night baseline absorbed a sustained fall after about 25 days.
 */
object WeeklyHrvStatusAnalyzer {
    const val WEEK_NIGHTS = 7
    const val MIN_WEEK_NIGHTS = 4
    const val BASELINE_NIGHTS = 60
    const val MIN_BASELINE_NIGHTS = 21
    const val BALANCED_SD = 0.75
    const val MARKEDLY_LOW_SD = 1.5
    const val MIN_SD = 0.05

    fun analyze(history: List<DailyValue>, asOfDay: Long): WeeklyHrvStatus {
        // One reading per day, first listed wins; invalid values are missing.
        val byDay = LinkedHashMap<Long, Double>()
        for (v in history) if (v.epochDay <= asOfDay && v.value.isFinite() && v.value > 0.0) byDay.putIfAbsent(v.epochDay, v.value)

        val weekStart = asOfDay - WEEK_NIGHTS + 1
        val week = (weekStart..asOfDay).mapNotNull { byDay[it]?.let(::ln) }
        val baseline = ((weekStart - BASELINE_NIGHTS) until weekStart).mapNotNull { byDay[it]?.let(::ln) }

        if (baseline.size < MIN_BASELINE_NIGHTS) {
            return WeeklyHrvStatus(WeeklyHrvState.BASELINE_BUILDING, week.size, baseline.size)
        }
        if (week.size < MIN_WEEK_NIGHTS) {
            return WeeklyHrvStatus(WeeklyHrvState.NO_RECENT_NIGHTS, week.size, baseline.size)
        }
        val mu = Stats.mean(baseline)!!
        val sd = maxOf(Stats.sampleStdDev(baseline)!!, MIN_SD)
        val m7 = Stats.mean(week)!!
        val z = (m7 - mu) / sd
        val state = when {
            m7 < mu - MARKEDLY_LOW_SD * sd -> WeeklyHrvState.MARKEDLY_BELOW
            m7 < mu - BALANCED_SD * sd -> WeeklyHrvState.BELOW_RANGE
            m7 > mu + BALANCED_SD * sd -> WeeklyHrvState.ABOVE_RANGE
            else -> WeeklyHrvState.WITHIN_RANGE
        }
        return WeeklyHrvStatus(
            state = state,
            weekNights = week.size,
            baselineNights = baseline.size,
            weekAverage = exp(m7),
            baselineCenter = exp(mu),
            rangeLow = exp(mu - BALANCED_SD * sd),
            rangeHigh = exp(mu + BALANCED_SD * sd),
            markedlyLowLine = exp(mu - MARKEDLY_LOW_SD * sd),
            zScore = z,
        )
    }
}
