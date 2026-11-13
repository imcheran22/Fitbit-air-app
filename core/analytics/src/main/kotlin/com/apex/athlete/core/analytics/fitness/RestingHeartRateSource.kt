package com.apex.athlete.core.analytics.fitness

import com.apex.athlete.core.analytics.baseline.DailyValue

/** Which stored series the resting heart rate is read from. */
enum class RestingHeartRateSeries { RESTING, SLEEPING }

/**
 * Resting-heart-rate bookkeeping that must not change from day to day (formula version 3, B10 in
 * docs/review/METRICS_ALIGNMENT.md).
 */
object RestingHeartRateSource {

    /**
     * Chooses one series for a whole window instead of letting each day pick for itself: the
     * series with more readings in the [windowDays] days before [asOfDay] (resting on a tie). Only
     * when neither has a reading in that window does the as-of day's own reading decide. A baseline
     * built from two definitions would mix their offsets into its spread and bias every z-score.
     */
    fun choose(
        resting: List<DailyValue>,
        sleeping: List<DailyValue>,
        asOfDay: Long,
        windowDays: Int = 30,
    ): RestingHeartRateSeries {
        fun priorCount(series: List<DailyValue>) =
            series.filter { it.value.isFinite() && it.epochDay in (asOfDay - windowDays) until asOfDay }
                .map { it.epochDay }.distinct().size
        val r = priorCount(resting)
        val s = priorCount(sleeping)
        if (r != s) return if (s > r) RestingHeartRateSeries.SLEEPING else RestingHeartRateSeries.RESTING
        if (r == 0) {
            val restingToday = resting.any { it.epochDay == asOfDay && it.value.isFinite() }
            val sleepingToday = sleeping.any { it.epochDay == asOfDay && it.value.isFinite() }
            if (!restingToday && sleepingToday) return RestingHeartRateSeries.SLEEPING
        }
        return RestingHeartRateSeries.RESTING
    }

    /**
     * The resting heart rate that anchors TRIMP: the personal baseline centre, so every day of a
     * replay is measured against the same zero. Today's own reading (a morning 8 bpm above usual)
     * only stands in while no baseline exists, and the latest earlier reading after that. Null when
     * nothing is known: strain is then missing, never computed from a population norm.
     */
    fun loadAnchor(baselineCenter: Double?, current: Double?, latest: Double?): Double? =
        listOf(baselineCenter, current, latest).firstOrNull { it != null && it.isFinite() }
}
