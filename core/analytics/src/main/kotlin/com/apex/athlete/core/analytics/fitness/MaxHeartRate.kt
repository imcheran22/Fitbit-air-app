package com.apex.athlete.core.analytics.fitness

import com.apex.athlete.core.domain.DataProvenance

data class MaxHeartRateEstimate(val bpm: Double, val provenance: DataProvenance, val method: Method) {
    enum class Method { USER_SET, OBSERVED_PEAK, AGE_PREDICTED }
}

object MaxHeartRate {

    /** Fewer active minutes than this give no observed maximum (formula version 3). */
    const val MIN_PEAK_MINUTES: Int = 600

    /** Only one-minute averages from this heart rate up count towards the observed maximum: it describes effort, not rest. */
    const val MIN_PEAK_SAMPLE_BPM: Double = 100.0

    /** Impossible values (optical artefacts) are outside the sample. */
    const val MAX_PEAK_SAMPLE_BPM: Double = 240.0

    /** Share of the active minutes that may lie above the observed maximum (the 99.5th percentile). */
    const val PEAK_TAIL_FRACTION: Double = 0.005

    /**
     * Robust observed maximum, formula version 3 (B5 in docs/review/METRICS_ALIGNMENT.md): the
     * 99.5th percentile of the one-minute averages between [MIN_PEAK_SAMPLE_BPM] and
     * [MAX_PEAK_SAMPLE_BPM], needing at least [MIN_PEAK_MINUTES] of them; otherwise null, and the
     * age prediction alone is used. Taken as the value with `floor(n * 0.005)` minutes above it, so
     * a few artefact minutes never set it. The percentile rank, the 600-minute minimum and the
     * 100 bpm floor are *calibration* choices; the idea (a percentile of artefact-filtered exercise
     * heart rate that never falls below the age prediction) follows the reference app's scoring
     * code. [resolve] never lets the result fall below Tanaka.
     */
    fun robustPeak(minuteAverages: Collection<Double>): Double? {
        val sample = minuteAverages.filter { it.isFinite() && it >= MIN_PEAK_SAMPLE_BPM && it <= MAX_PEAK_SAMPLE_BPM }
        val offset = robustPeakOffset(sample.size) ?: return null
        return sample.sortedDescending()[offset]
    }

    /**
     * Number of active minutes to skip from the top to reach the robust maximum, given how many
     * active minutes there are (the same rank [robustPeak] uses, for a database query that cannot
     * load every minute). Null below [MIN_PEAK_MINUTES].
     */
    fun robustPeakOffset(activeMinutes: Int): Int? =
        if (activeMinutes < MIN_PEAK_MINUTES) null else (activeMinutes * PEAK_TAIL_FRACTION).toInt()

    /**
     * Tanaka, Monahan & Seals (2001, J Am Coll Cardiol 37(1):153–156): HRmax = 208 − 0.7 · age,
     * a meta-analysis of healthy adults confirmed in a laboratory sample (sample sizes in
     * docs/EVIDENCE.md, unverified). It predicts a group mean: an individual's true maximum is
     * commonly reported to lie roughly ±10 bpm away, so the result is always labelled ESTIMATED.
     */
    fun agePredicted(ageYears: Int): Double {
        require(ageYears in 5..110) { "age must be within 5..110" }
        return 208.0 - 0.7 * ageYears
    }

    /**
     * Picks the best available maximum heart rate.
     *
     * 1. A value the user entered (for example from a lab or field test) always wins.
     * 2. Otherwise the higher of the age prediction and the robust observed maximum: a heart cannot
     *    beat faster than its maximum, so a sustained peak above the prediction proves the
     *    prediction was too low. A peak below it proves nothing, because most people rarely
     *    reach their maximum.
     *
     * 3. Without an age, the recorded peak alone is used. It is a lower bound of the true maximum,
     *    so strain computed from it errs high; the UI should invite the user to enter age or HRmax.
     *
     * @param observedPeakBpm a robust observed maximum from [robustPeak] / [robustPeakOffset], never
     *   the single highest minute: one optical glitch would otherwise become HRmax for months.
     */
    fun resolve(ageYears: Int?, observedPeakBpm: Double?, userSetBpm: Double?): MaxHeartRateEstimate? {
        if (userSetBpm != null && userSetBpm in 100.0..240.0) {
            return MaxHeartRateEstimate(userSetBpm, DataProvenance.USER_REPORTED, MaxHeartRateEstimate.Method.USER_SET)
        }
        val predicted = ageYears?.takeIf { it in 5..110 }?.let(::agePredicted)
        val observed = observedPeakBpm?.takeIf { it in 100.0..240.0 }
        return when {
            predicted != null && (observed == null || observed <= predicted) ->
                MaxHeartRateEstimate(predicted, DataProvenance.ESTIMATED, MaxHeartRateEstimate.Method.AGE_PREDICTED)
            observed != null ->
                MaxHeartRateEstimate(observed, DataProvenance.MATHEMATICALLY_DERIVED, MaxHeartRateEstimate.Method.OBSERVED_PEAK)
            else -> null
        }
    }
}
