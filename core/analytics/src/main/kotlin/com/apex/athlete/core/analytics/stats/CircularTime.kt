package com.apex.athlete.core.analytics.stats

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Statistics for clock times. Times of day wrap at midnight, so 23:50 and 00:10 are twenty
 * minutes apart, not 23 hours 40 minutes; ordinary means and standard deviations get this wrong.
 */
object CircularTime {

    const val MINUTES_PER_DAY: Double = 1440.0

    /** Circular mean of clock times given as minutes after midnight. Result is in 0 until 1440. */
    fun meanMinuteOfDay(minutes: Collection<Double>): Double? {
        if (minutes.isEmpty()) return null
        var s = 0.0
        var c = 0.0
        for (m in minutes) {
            val angle = 2 * PI * (m / MINUTES_PER_DAY)
            s += sin(angle)
            c += cos(angle)
        }
        if (s == 0.0 && c == 0.0) return null
        val mean = atan2(s, c) / (2 * PI) * MINUTES_PER_DAY
        return ((mean % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    }

    /** Signed shortest distance from [reference] to [minute] in minutes, in -720 until 720. */
    fun signedDifference(minute: Double, reference: Double): Double {
        val d = ((minute - reference) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
        return if (d >= MINUTES_PER_DAY / 2) d - MINUTES_PER_DAY else d
    }

    /**
     * Sample standard deviation (minutes) of clock times around their circular mean.
     * Null when fewer than two times are given.
     */
    fun stdDevMinutes(minutes: Collection<Double>): Double? {
        if (minutes.size < 2) return null
        val mean = meanMinuteOfDay(minutes) ?: return null
        var ss = 0.0
        for (m in minutes) {
            val d = signedDifference(m, mean)
            ss += d * d
        }
        return sqrt(ss / (minutes.size - 1))
    }
}
