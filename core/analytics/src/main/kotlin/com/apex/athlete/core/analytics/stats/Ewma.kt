package com.apex.athlete.core.analytics.stats

/** How an exponentially weighted average treats a day that has no reading. */
enum class MissingValuePolicy {
    /** Keep the previous average unchanged. Right for physiological readings (HRV, RHR). */
    CARRY_FORWARD,

    /** Treat the gap as a zero. Right only when "no reading" genuinely means "nothing happened". */
    TREAT_AS_ZERO,
}

/**
 * Exponentially weighted moving average.
 *
 *   alpha  = 2 / (span + 1)
 *   EWMA_t = alpha * x_t + (1 - alpha) * EWMA_(t-1)
 *
 * A 7-day span gives alpha = 0.25, a 28-day span gives alpha = 2/29.
 */
object Ewma {

    fun alphaForSpan(span: Int): Double {
        require(span >= 1) { "span must be >= 1, was $span" }
        return 2.0 / (span + 1)
    }

    /**
     * Returns one average per input element, in the same order (oldest first).
     *
     * @param seed starting average before the first element. When null the series is seeded with
     *   its first available value, and elements before that value yield null.
     */
    fun series(
        values: List<Double?>,
        span: Int,
        missing: MissingValuePolicy = MissingValuePolicy.CARRY_FORWARD,
        seed: Double? = null,
    ): List<Double?> {
        val alpha = alphaForSpan(span)
        val out = ArrayList<Double?>(values.size)
        var current: Double? = seed
        for (raw in values) {
            val x: Double? = raw ?: if (missing == MissingValuePolicy.TREAT_AS_ZERO) 0.0 else null
            if (x != null) {
                val prev = current
                current = if (prev == null) x else alpha * x + (1 - alpha) * prev
            }
            out.add(current)
        }
        return out
    }

    fun last(
        values: List<Double?>,
        span: Int,
        missing: MissingValuePolicy = MissingValuePolicy.CARRY_FORWARD,
        seed: Double? = null,
    ): Double? = series(values, span, missing, seed).lastOrNull()
}
