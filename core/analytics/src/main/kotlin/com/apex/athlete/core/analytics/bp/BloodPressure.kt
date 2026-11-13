package com.apex.athlete.core.analytics.bp

import kotlin.math.floor

/** Names follow the 2017 ACC/AHA adult guideline. Order is ascending severity. */
enum class BloodPressureCategory { NORMAL, ELEVATED, STAGE_1, STAGE_2, CRISIS }

enum class BloodPressureMissingReason {
    /** Outside the plausibility range (see [BloodPressure.isPlausible]): treated as an entry error, never clamped. */
    IMPLAUSIBLE_READING,
    /** Fewer than [BloodPressure.MIN_READINGS_FOR_AVERAGE] valid readings. */
    INSUFFICIENT_READINGS,
}

/** A reading in mmHg, as entered by the user (Apex has no blood-pressure sensor). */
data class BloodPressureReading(val systolic: Int, val diastolic: Int)

data class BloodPressureEvaluation(
    val category: BloodPressureCategory?,
    val systolicCategory: BloodPressureCategory?,
    val diastolicCategory: BloodPressureCategory?,
    val missingReason: BloodPressureMissingReason?,
)

/**
 * @property meanSystolic / [meanDiastolic] unrounded means of the valid readings; null when the average is not computed.
 * @property category category of the means rounded to whole mmHg.
 */
data class BloodPressureAverage(
    val validReadings: Int,
    val rejectedReadings: Int,
    val meanSystolic: Double?,
    val meanDiastolic: Double?,
    val category: BloodPressureCategory?,
    val systolicCategory: BloodPressureCategory?,
    val diastolicCategory: BloodPressureCategory?,
    val missingReason: BloodPressureMissingReason?,
)

/**
 * Blood-pressure category of a reading or of the mean of several, and nothing else: no risk score, no advice, no trend reading.
 *
 * Thresholds (mmHg), the adult categories of the 2017 ACC/AHA guideline (Whelton PK et al., Hypertension 2018;71:e13-e115 and
 * J Am Coll Cardiol 2018;71:e127-e248; **UNVERIFIED**, recalled, not opened; the crisis cut-off in particular is the figure
 * used in AHA public material). With S = systolic and D = diastolic:
 *
 *  - NORMAL: S < 120 and D < 80
 *  - ELEVATED: 120 <= S < 130 and D < 80
 *  - STAGE_1: 130 <= S < 140 or 80 <= D < 90
 *  - STAGE_2: S >= 140 or D >= 90
 *  - CRISIS: S > 180 and/or D > 120
 *
 * The higher category of the systolic and the diastolic value applies (systolic: <120 Normal, <130 Elevated, <140 Stage 1,
 * <=180 Stage 2, else Crisis; diastolic: <80 Normal, <90 Stage 1, <=120 Stage 2, else Crisis; there is no diastolic Elevated).
 * The guideline defines these categories for the average of two or more careful office or home readings on separate occasions, not for
 * one reading. A single reading is therefore a data point, and a category here is a label, not a diagnosis. Apex requires at least
 * [MIN_READINGS_FOR_AVERAGE] = 3 readings for an average (calibration choice; the guideline's own rule is two or more on two occasions).
 * Means are rounded to whole mmHg (half up) before classification because the thresholds are whole numbers (calibration choice).
 * Plausibility limits (systolic 50-300, diastolic 30-200, systolic above diastolic) only catch typing errors and are calibration choices.
 */
object BloodPressure {
    const val MIN_READINGS_FOR_AVERAGE: Int = 3
    const val MIN_SYSTOLIC: Int = 50
    const val MAX_SYSTOLIC: Int = 300
    const val MIN_DIASTOLIC: Int = 30
    const val MAX_DIASTOLIC: Int = 200

    fun isPlausible(r: BloodPressureReading): Boolean =
        r.systolic in MIN_SYSTOLIC..MAX_SYSTOLIC && r.diastolic in MIN_DIASTOLIC..MAX_DIASTOLIC && r.systolic > r.diastolic

    fun evaluate(reading: BloodPressureReading): BloodPressureEvaluation {
        if (!isPlausible(reading)) return BloodPressureEvaluation(null, null, null, BloodPressureMissingReason.IMPLAUSIBLE_READING)
        val s = systolicCategory(reading.systolic.toDouble())
        val d = diastolicCategory(reading.diastolic.toDouble())
        return BloodPressureEvaluation(maxOf(s, d), s, d, null)
    }

    /** Average of the valid readings; implausible ones are dropped and counted, never repaired. */
    fun average(readings: List<BloodPressureReading>): BloodPressureAverage {
        val valid = readings.filter(::isPlausible)
        val rejected = readings.size - valid.size
        if (valid.size < MIN_READINGS_FOR_AVERAGE) {
            return BloodPressureAverage(valid.size, rejected, null, null, null, null, null, BloodPressureMissingReason.INSUFFICIENT_READINGS)
        }
        val ms = valid.map { it.systolic }.average()
        val md = valid.map { it.diastolic }.average()
        val s = systolicCategory(roundHalfUp(ms))
        val d = diastolicCategory(roundHalfUp(md))
        return BloodPressureAverage(valid.size, rejected, ms, md, maxOf(s, d), s, d, null)
    }

    private fun roundHalfUp(x: Double): Double = floor(x + 0.5)

    private fun systolicCategory(s: Double) = when {
        s > 180.0 -> BloodPressureCategory.CRISIS
        s >= 140.0 -> BloodPressureCategory.STAGE_2
        s >= 130.0 -> BloodPressureCategory.STAGE_1
        s >= 120.0 -> BloodPressureCategory.ELEVATED
        else -> BloodPressureCategory.NORMAL
    }

    private fun diastolicCategory(d: Double) = when {
        d > 120.0 -> BloodPressureCategory.CRISIS
        d >= 90.0 -> BloodPressureCategory.STAGE_2
        d >= 80.0 -> BloodPressureCategory.STAGE_1
        else -> BloodPressureCategory.NORMAL
    }
}
