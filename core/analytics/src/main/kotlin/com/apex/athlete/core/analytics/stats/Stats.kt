package com.apex.athlete.core.analytics.stats

import kotlin.math.floor
import kotlin.math.sqrt

/** Small, allocation-light descriptive statistics in double precision. */
object Stats {

    fun mean(values: Collection<Double>): Double? =
        if (values.isEmpty()) null else values.sum() / values.size

    /** Unbiased sample variance (n − 1 denominator). Null when fewer than two values. */
    fun sampleVariance(values: Collection<Double>): Double? {
        val n = values.size
        if (n < 2) return null
        val m = values.sum() / n
        var ss = 0.0
        for (v in values) {
            val d = v - m
            ss += d * d
        }
        return ss / (n - 1)
    }

    fun sampleStdDev(values: Collection<Double>): Double? = sampleVariance(values)?.let(::sqrt)

    fun median(values: Collection<Double>): Double? = percentile(values, 0.5)

    /**
     * Percentile with linear interpolation between closest ranks (the "type 7" definition used by
     * R, NumPy and spreadsheets). [p] is a fraction in 0..1.
     */
    fun percentile(values: Collection<Double>, p: Double): Double? {
        require(p in 0.0..1.0) { "p must be within 0..1, was $p" }
        if (values.isEmpty()) return null
        val sorted = values.sorted()
        val h = (sorted.size - 1) * p
        val lo = floor(h).toInt()
        val hi = minOf(lo + 1, sorted.size - 1)
        return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
    }

    /** Ordinary least-squares slope of y on x. Null when fewer than two points or x has no spread. */
    fun linearSlope(xs: List<Double>, ys: List<Double>): Double? {
        require(xs.size == ys.size) { "xs and ys must have the same length" }
        val n = xs.size
        if (n < 2) return null
        val mx = xs.sum() / n
        val my = ys.sum() / n
        var sxy = 0.0
        var sxx = 0.0
        for (i in 0 until n) {
            val dx = xs[i] - mx
            sxy += dx * (ys[i] - my)
            sxx += dx * dx
        }
        return if (sxx == 0.0) null else sxy / sxx
    }
}
