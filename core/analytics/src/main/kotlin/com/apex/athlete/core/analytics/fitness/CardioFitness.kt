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
     * Uth, Sørensen, Overgaard & Pedersen (2004, Eur J Appl Physiol 91(1):111–115):
     * VO2max ≈ 15.3 · HRmax / HRrest, derived in trained men with HRrest measured at rest under
     * controlled conditions. Apex applies one factor to everyone and does not adjust for sex.
     * The details of the derivation group were not re-checked against the paper in the v2 review
     * (see docs/EVIDENCE.md, "unverified").
     *
     * Expect an error of several ml/kg/min for anyone outside the derivation group, and more when
     * HRmax itself is age-predicted or HRrest is a wearable's daily resting value. Useful for
     * following a trend, not as an absolute value.
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
