package com.apex.athlete.core.analytics.journal

import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Student's t distribution via the regularised incomplete beta function (continued fraction, modified Lentz;
 * Press et al., Numerical Recipes, "betacf"; log-gamma by the Lanczos approximation g = 7, n = 9).
 * Accuracy is about 1e-10 for the degrees of freedom this app uses (UNVERIFIED against a reference library in
 * this repo; pinned in tests against standard t-table critical values and a numerically integrated p-value).
 */
object StudentT {

    /** P(T <= t) for [df] degrees of freedom (df may be fractional). */
    fun cdf(t: Double, df: Double): Double {
        require(df > 0.0) { "df must be > 0" }
        val x = df / (df + t * t)
        val tail = 0.5 * regularizedIncompleteBeta(x, df / 2.0, 0.5)
        return if (t >= 0.0) 1.0 - tail else tail
    }

    /** Two-sided p-value for |t|. */
    fun twoSidedP(t: Double, df: Double): Double = regularizedIncompleteBeta(df / (df + t * t), df / 2.0, 0.5).coerceIn(0.0, 1.0)

    /** The p-quantile (0.5 < p < 1) by bisection on the monotone [cdf]. */
    fun quantile(p: Double, df: Double): Double {
        require(p > 0.5 && p < 1.0) { "p must be in (0.5, 1)" }
        var lo = 0.0
        var hi = 1.0
        while (cdf(hi, df) < p && hi < 1e12) hi *= 2.0
        repeat(200) {
            val mid = (lo + hi) / 2.0
            if (cdf(mid, df) < p) lo = mid else hi = mid
        }
        return (lo + hi) / 2.0
    }

    private val lanczos = doubleArrayOf(
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    )

    private fun lnGamma(x: Double): Double {
        if (x < 0.5) return ln(PI / abs(sin(PI * x))) - lnGamma(1.0 - x)
        val xm = x - 1.0
        var a = lanczos[0]
        val t = xm + 7.5
        for (i in 1 until 9) a += lanczos[i] / (xm + i)
        return 0.5 * ln(2.0 * PI) + (xm + 0.5) * ln(t) - t + ln(a)
    }

    private fun regularizedIncompleteBeta(x: Double, a: Double, b: Double): Double {
        if (x <= 0.0) return 0.0
        if (x >= 1.0) return 1.0
        val front = exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * ln(x) + b * ln(1.0 - x))
        return if (x < (a + 1.0) / (a + b + 2.0)) front * betaCf(x, a, b) / a else 1.0 - front * betaCf(1.0 - x, b, a) / b
    }

    private fun betaCf(x: Double, a: Double, b: Double): Double {
        val tiny = 1e-300
        val qab = a + b; val qap = a + 1.0; val qam = a - 1.0
        var c = 1.0
        var d = 1.0 - qab * x / qap
        if (abs(d) < tiny) d = tiny
        d = 1.0 / d
        var h = d
        for (m in 1..500) {
            val m2 = 2 * m
            var aa = m * (b - m) * x / ((qam + m2) * (a + m2))
            d = 1.0 + aa * d; if (abs(d) < tiny) d = tiny
            c = 1.0 + aa / c; if (abs(c) < tiny) c = tiny
            d = 1.0 / d
            h *= d * c
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
            d = 1.0 + aa * d; if (abs(d) < tiny) d = tiny
            c = 1.0 + aa / c; if (abs(c) < tiny) c = tiny
            d = 1.0 / d
            val del = d * c
            h *= del
            if (abs(del - 1.0) < 1e-14) break
        }
        return h
    }
}

/** Result of [WelchTTest.test]: difference = mean(first arm) - mean(second arm). */
data class WelchResult(
    val meanFirst: Double,
    val meanSecond: Double,
    val difference: Double,
    val standardError: Double,
    val t: Double,
    val degreesOfFreedom: Double,
    val ciLow: Double,
    val ciHigh: Double,
    val pValue: Double,
)

/**
 * Welch's unequal-variance t-test (Welch 1947, Biometrika 34:28-35; unverified citation, standard textbook method):
 *   SE = sqrt(s1^2/n1 + s2^2/n2), t = (m1 - m2) / SE,
 *   df = (s1^2/n1 + s2^2/n2)^2 / ((s1^2/n1)^2/(n1-1) + (s2^2/n2)^2/(n2-1))   (Satterthwaite),
 *   95 % CI = (m1 - m2) +- t(0.975, df) * SE, two-sided p from the t distribution with df degrees of freedom.
 * Null when an arm has fewer than 2 values or both arms have zero variance (SE = 0).
 */
object WelchTTest {
    const val CONFIDENCE = 0.95

    fun test(first: List<Double>, second: List<Double>): WelchResult? {
        if (first.size < 2 || second.size < 2) return null
        val v1 = Stats.sampleVariance(first) ?: return null
        val v2 = Stats.sampleVariance(second) ?: return null
        val a = v1 / first.size
        val b = v2 / second.size
        val se2 = a + b
        if (!(se2 > 0.0)) return null
        val se = sqrt(se2)
        val m1 = first.sum() / first.size
        val m2 = second.sum() / second.size
        val df = se2 * se2 / ((a * a) / (first.size - 1) + (b * b) / (second.size - 1))
        val t = (m1 - m2) / se
        val crit = StudentT.quantile(1.0 - (1.0 - CONFIDENCE) / 2.0, df)
        return WelchResult(m1, m2, m1 - m2, se, t, df, (m1 - m2) - crit * se, (m1 - m2) + crit * se, StudentT.twoSidedP(t, df))
    }
}
