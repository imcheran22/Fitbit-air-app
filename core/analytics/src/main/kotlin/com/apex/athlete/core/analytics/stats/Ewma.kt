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
 * A 7-day span gives alpha = 0.25, a 28-day span gives alpha = 2/29 (Williams et al. 2017).
 *
 * A null or non-finite (NaN, ±Infinity) element counts as "no reading" and is handled by the
 * [MissingValuePolicy]; it can never poison the average.
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
            val x = reading(raw, missing)
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

    /**
     * EWMA with normalised weights, which removes the dependence on a seed value:
     *
     *   y_t = Σ (1 − alpha)^i · x_(t−i)  /  Σ (1 − alpha)^i      (sums over the readings so far)
     *
     * computed recursively as S_t = x_t + (1 − alpha)·S_(t−1), W_t = 1 + (1 − alpha)·W_(t−1),
     * y_t = S_t / W_t. Once the history is long, W_t → 1/alpha and y_t equals the recursive EWMA
     * of [series]; early on, the first reading does not get the outsized weight that seeding
     * with it would give (with a 28-day span the seed still carries 39 % of the weight after
     * 14 days). A constant input returns that constant (up to rounding) from the first reading on.
     * This is the "adjusted" EWMA of common statistics libraries; the choice of initialisation is
     * an Apex calibration choice, Williams et al. (2017) do not specify one.
     *
     * Missing readings leave S and W unchanged (the gap is skipped); elements before the first
     * reading yield null.
     */
    fun normalizedSeries(
        values: List<Double?>,
        span: Int,
        missing: MissingValuePolicy = MissingValuePolicy.CARRY_FORWARD,
    ): List<Double?> {
        val decay = 1 - alphaForSpan(span)
        val out = ArrayList<Double?>(values.size)
        var s = 0.0
        var w = 0.0
        for (raw in values) {
            val x = reading(raw, missing)
            if (x != null) {
                s = x + decay * s
                w = 1 + decay * w
            }
            out.add(if (w > 0.0) s / w else null)
        }
        return out
    }

    private fun reading(raw: Double?, missing: MissingValuePolicy): Double? = when {
        raw != null && raw.isFinite() -> raw
        missing == MissingValuePolicy.TREAT_AS_ZERO -> 0.0
        else -> null
    }
}
