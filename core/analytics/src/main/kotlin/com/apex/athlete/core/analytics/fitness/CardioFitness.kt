package com.apex.athlete.core.analytics.fitness

import com.apex.athlete.core.domain.DataProvenance

data class Vo2MaxEstimate(val mlPerKgPerMin: Double, val provenance: DataProvenance, val method: String)

/**
 * Fallback aerobic-fitness estimate for when the wearable has not reported a VO2 max.
 * A VO2 max imported from the device always takes precedence; this is never shown as a measurement.
 */
object CardioFitness {

    const val METHOD_HEART_RATE_RATIO = "Heart-rate ratio (Uth et al. 2004)"

    /**
     * Uth, Sørensen, Overgaard & Pedersen (2004): VO2max ≈ 15.3 · HRmax / HRrest.
     *
     * Validated on trained men; expect an error of several ml/kg/min for anyone else, and more
     * when HRmax itself is age-predicted. Useful for following a trend, not as an absolute value.
     */
    fun estimateFromHeartRateRatio(maxHeartRate: Double, restingHeartRate: Double): Vo2MaxEstimate? {
        if (restingHeartRate !in 25.0..120.0 || maxHeartRate !in 100.0..240.0) return null
        if (maxHeartRate <= restingHeartRate) return null
        return Vo2MaxEstimate(
            mlPerKgPerMin = 15.3 * maxHeartRate / restingHeartRate,
            provenance = DataProvenance.ESTIMATED,
            method = METHOD_HEART_RATE_RATIO,
        )
    }
}
