package com.apex.athlete.core.analytics.strain

import com.apex.athlete.core.domain.DataProvenance

enum class Sex { MALE, FEMALE, UNSPECIFIED }

/**
 * The two anchors every heart-rate-based load calculation needs.
 *
 * @property restingHeartRate bpm; today's measured resting heart rate, or the 30-day baseline.
 * @property maxHeartRate bpm; see [com.apex.athlete.core.analytics.fitness.MaxHeartRate].
 * @property maxHeartRateProvenance how [maxHeartRate] was obtained, so the UI can label an
 *   age-predicted value as an estimate.
 */
data class CardioProfile(
    val restingHeartRate: Double,
    val maxHeartRate: Double,
    val sex: Sex = Sex.UNSPECIFIED,
    val maxHeartRateProvenance: DataProvenance = DataProvenance.ESTIMATED,
) {
    init {
        require(restingHeartRate > 0) { "restingHeartRate must be > 0" }
        require(maxHeartRate > restingHeartRate) { "maxHeartRate must exceed restingHeartRate" }
    }

    /** Heart-rate reserve in bpm (HRmax − HRrest). */
    val heartRateReserve: Double get() = maxHeartRate - restingHeartRate
}

/** One heart-rate reading and how long it stands for (1.0 for a one-minute bucket). */
data class HeartRateSample(val bpm: Double, val durationMinutes: Double = 1.0)
