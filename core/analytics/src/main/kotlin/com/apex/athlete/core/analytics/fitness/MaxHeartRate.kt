package com.apex.athlete.core.analytics.fitness

import com.apex.athlete.core.domain.DataProvenance

data class MaxHeartRateEstimate(val bpm: Double, val provenance: DataProvenance, val method: Method) {
    enum class Method { USER_SET, OBSERVED_PEAK, AGE_PREDICTED }
}

object MaxHeartRate {

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
     * 2. Otherwise the higher of the age prediction and the highest heart rate the wearable has
     *    actually recorded: a heart cannot beat faster than its maximum, so a recorded peak above
     *    the prediction proves the prediction was too low. A recorded peak below it proves nothing,
     *    because most people rarely reach their maximum.
     *
     * 3. Without an age, the recorded peak alone is used. It is a lower bound of the true maximum,
     *    so strain computed from it errs high; the UI should invite the user to enter age or HRmax.
     *
     * @param observedPeakBpm highest sustained heart rate in the stored history (the caller should
     *   pass a robust peak, e.g. the highest one-minute average, to ignore optical glitches).
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
