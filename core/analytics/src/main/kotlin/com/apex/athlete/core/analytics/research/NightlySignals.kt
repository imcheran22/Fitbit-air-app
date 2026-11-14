package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue

enum class ShiftSide { LOWER, HIGHER }

/**
 * RT04. Overnight SpO2 against the personal baseline.
 *
 * @property level deviation of the nightly average, in percentage points.
 * @property lowerBound deviation of the nightly lower bound.
 * @property side set only when the average and the lower bound both moved the same way by at
 *   least the z threshold; null otherwise.
 * @property reportable true when [side] is set and coverage was adequate. Otherwise the change
 *   is within what the sensor's noise produces and nothing should be said.
 */
data class Spo2Shift(
    val level: RobustDeviation,
    val lowerBound: RobustDeviation,
    val side: ShiftSide?,
    val coverageFraction: Double?,
    val reportable: Boolean,
)

/**
 * Night-level respiratory, oxygen and temperature signals. The deviations themselves come from
 * [RobustBaseline] with [RobustBaselineSpecs.RESPIRATORY_RATE], [RobustBaselineSpecs.SPO2] and
 * [RobustBaselineSpecs.SLEEP_TEMPERATURE_DELTA]; this object adds the rules particular to SpO2
 * and temperature.
 *
 * All of it is evidence class C: wearable breathing rate, SpO2 and skin temperature changed
 * around illness in cohort studies (Natarajan et al. 2020; Smarr et al. 2020, a ring device),
 * but no study validates the Fitbit values or any individual threshold. Pulse oximetry
 * overestimates saturation in people with darker skin (Sjoding et al. 2020), so an absolute
 * SpO2 value must never drive a decision. Not built, by design: desaturation counts, an oxygen
 * desaturation index, time below a saturation level, and any sleep-apnoea or fever statement.
 */
object NightlySignals {

    /** Plausible span of a nightly skin temperature in °C; outside it the pair is rejected. */
    private val SKIN_TEMPERATURE_C = 20.0..45.0

    /**
     * RT07. Sleeping-temperature deviation, `nightly − baseline`, exactly as the provider
     * defines its two fields (34.12 − 33.95 = +0.17 °C). The provider's baseline window is
     * undocumented. This is wrist skin temperature during sleep: not core temperature, and per
     * the provider's own documentation not for fever detection or any clinical use. Room
     * temperature, bedding, alcohol, late exercise and cycle phase all move it.
     */
    fun sleepTemperatureDelta(nightlyCelsius: Double?, baselineCelsius: Double?): Double? {
        if (nightlyCelsius == null || baselineCelsius == null) return null
        if (nightlyCelsius !in SKIN_TEMPERATURE_C || baselineCelsius !in SKIN_TEMPERATURE_C) return null
        return nightlyCelsius - baselineCelsius
    }

    /**
     * RT04 with the RT05 gate. Robust deviation (floor 0.5 percentage points) of the nightly
     * average and of the nightly lower bound; a shift is reportable only when both moved the
     * same way and the night's SpO2 coverage was adequate.
     *
     * The z threshold of 2 and the 50 % coverage gate are calibration choices; the research
     * gives the rule ("both level and lower bound shift together and data coverage is
     * adequate") without numbers. Differences are in percentage points, never relative percent.
     *
     * @param coverageFraction share of the sleep period with valid SpO2 samples
     *   ([DataQuality.coverage]); null = unknown, which is not treated as adequate.
     * @return null when either series lacks tonight's value or a mature baseline.
     */
    fun spo2Shift(
        averageHistory: List<DailyValue>,
        lowerBoundHistory: List<DailyValue>,
        asOfDay: Long,
        coverageFraction: Double?,
        zThreshold: Double = 2.0,
        minCoverage: Double = DataQuality.MINIMUM_COVERAGE,
    ): Spo2Shift? {
        require(zThreshold > 0.0) { "zThreshold must be > 0" }
        fun valid(history: List<DailyValue>) = history.filter { it.value in DataQuality.SPO2_PERCENT }
        val level = RobustBaseline.deviation(valid(averageHistory), asOfDay, RobustBaselineSpecs.SPO2) ?: return null
        val lower = RobustBaseline.deviation(valid(lowerBoundHistory), asOfDay, RobustBaselineSpecs.SPO2) ?: return null
        val side = when {
            level.robustZ <= -zThreshold && lower.robustZ <= -zThreshold -> ShiftSide.LOWER
            level.robustZ >= zThreshold && lower.robustZ >= zThreshold -> ShiftSide.HIGHER
            else -> null
        }
        val covered = coverageFraction != null && coverageFraction.isFinite() && coverageFraction >= minCoverage
        return Spo2Shift(level, lower, side, coverageFraction, reportable = side != null && covered)
    }
}
