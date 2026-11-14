package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Version of the formulas in the `research` package. These metrics are additive: they change no
 * existing score, so `ANALYTICS_ALGORITHM_VERSION` is untouched. Bump this constant whenever a
 * formula or default constant in this package changes and record it in docs/RESEARCH_METRICS.md.
 */
const val RESEARCH_METRICS_VERSION: Int = 1

/**
 * Plain description of a set of readings.
 *
 * @property cvPercent coefficient of variation, 100 · SD / mean. Null when the mean is not
 *   positive (a relative spread is only meaningful on a positive scale) or fewer than two values.
 */
data class DescriptiveSummary(
    val n: Int,
    val mean: Double,
    val median: Double,
    val sd: Double?,
    val cvPercent: Double?,
)

/**
 * Statistics the research report uses to decide whether a change is worth mentioning. None of
 * them is a health metric; they only describe how much trust a number deserves.
 */
object InterpretationStats {

    /** 1.96 · √2, the multiplier of the minimal detectable change at 95 % (Weir 2005). */
    private val MDC95_FACTOR = 1.96 * sqrt(2.0)

    /** Mean, median, sample SD (n − 1) and CV of the finite values. Null when there are none. */
    fun describe(values: Collection<Double>): DescriptiveSummary? {
        val valid = values.filter { it.isFinite() }
        if (valid.isEmpty()) return null
        val mean = Stats.mean(valid)!!
        val sd = Stats.sampleStdDev(valid)
        return DescriptiveSummary(
            n = valid.size,
            mean = mean,
            median = Stats.median(valid)!!,
            sd = sd,
            cvPercent = if (sd != null && mean > 0.0) 100.0 * sd / mean else null,
        )
    }

    /**
     * Median absolute deviation, `median(|x − median(x)|)` (Rousseeuw & Croux 1993; Leys et al.
     * 2013). Unscaled: multiply by 1.4826 to estimate a standard deviation under normality.
     */
    fun medianAbsoluteDeviation(values: Collection<Double>): Double? {
        val valid = values.filter { it.isFinite() }
        val m = Stats.median(valid) ?: return null
        return Stats.median(valid.map { abs(it - m) })
    }

    /**
     * Lag-1 autocorrelation `Σ (x_i − m)(x_{i+1} − m) / Σ (x_i − m)²` of an evenly spaced series.
     * Null for fewer than three points or a constant series (judged with a tolerance, because the
     * mean of identical decimals such as seven 33.3s is not exactly 33.3 in binary and would
     * otherwise leave a rounding residue that is divided by itself). The caller must pass
     * consecutive days only; a gap silently treated as adjacent would bias the estimate.
     */
    fun lag1Autocorrelation(series: List<Double>): Double? {
        if (series.size < 3) return null
        val m = series.sum() / series.size
        var num = 0.0
        var den = 0.0
        for (i in series.indices) {
            val d = series[i] - m
            den += d * d
            if (i < series.size - 1) num += d * (series[i + 1] - m)
        }
        val noise = series.size * (1e-12 * maxOf(1.0, abs(m))).let { it * it }
        return if (den <= noise) null else num / den
    }

    /**
     * Effective sample size of an AR(1) series for inference on its mean:
     * `n_eff = n · (1 − ρ) / (1 + ρ)`. With n = 28 and ρ = 0.4 this is 12.0. Negative ρ is not
     * allowed to inflate the sample, so the result never exceeds n. Null unless −1 < ρ < 1.
     */
    fun effectiveSampleSize(n: Int, lag1Autocorrelation: Double): Double? {
        if (n < 1 || !(lag1Autocorrelation > -1.0 && lag1Autocorrelation < 1.0)) return null
        val rho = lag1Autocorrelation.coerceAtLeast(0.0)
        return n * (1 - rho) / (1 + rho)
    }

    /**
     * Minimal detectable change at 95 % confidence, `MDC95 = 1.96 · √2 · SD_within` (Weir 2005).
     * A difference between two readings smaller than this cannot be told apart from ordinary
     * day-to-day variation. Null for a negative or non-finite SD.
     */
    fun minimalDetectableChange95(sdWithin: Double): Double? =
        if (sdWithin.isFinite() && sdWithin >= 0.0) MDC95_FACTOR * sdWithin else null

    /**
     * Smallest worthwhile change band, `multiplier · SD` (Hopkins 2000; Buchheit 2014). The 0.5
     * multiplier is the convention the research adopts for ln RMSSD; it is a convention, not a
     * clinically validated cut-off.
     */
    fun smallestWorthwhileChange(sd: Double, multiplier: Double = 0.5): Double? =
        if (sd.isFinite() && sd >= 0.0 && multiplier > 0.0) multiplier * sd else null

    /**
     * Benjamini–Hochberg step-up procedure (Benjamini & Hochberg 1995). Returns the indices of
     * the hypotheses that survive at false-discovery rate [q], ascending. Used whenever several
     * signal pairs are scanned for associations, so that one in ten chance findings is not shown
     * as a discovery.
     */
    fun benjaminiHochberg(pValues: List<Double>, q: Double = 0.10): List<Int> {
        require(q > 0.0 && q < 1.0) { "q must be within (0, 1)" }
        require(pValues.all { it in 0.0..1.0 }) { "p-values must be within 0..1" }
        val order = pValues.indices.sortedBy { pValues[it] }
        val m = pValues.size
        var kMax = 0
        order.forEachIndexed { index, i ->
            val rank = index + 1
            if (pValues[i] <= q * rank / m) kMax = rank
        }
        return order.take(kMax).sorted()
    }
}

/** Finite readings of the days in `from until until`, one per day, oldest first. */
internal fun List<DailyValue>.window(from: Long, until: Long): List<DailyValue> =
    asSequence()
        .filter { it.epochDay in from until until && it.value.isFinite() }
        .distinctBy { it.epochDay }
        .sortedBy { it.epochDay }
        .toList()

internal fun List<DailyValue>.windowValues(from: Long, until: Long): List<Double> =
    window(from, until).map { it.value }
