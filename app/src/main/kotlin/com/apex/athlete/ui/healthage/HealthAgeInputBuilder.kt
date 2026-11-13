package com.apex.athlete.ui.healthage

import com.apex.athlete.core.analytics.healthage.FactorInput
import com.apex.athlete.core.analytics.healthage.HealthAgeInput
import com.apex.athlete.core.analytics.strain.Sex

/** A VO2 max used only when the 30-day device series is empty. [derivedFromRestingHr] marks the heart-rate-ratio estimate. */
data class Vo2Fallback(val value: Double, val derivedFromRestingHr: Boolean)

/**
 * Everything the health-age input is built from, already read from the repository. Daily series are the last 30 complete days,
 * with `null` for a day without a reading (a gap, never 0).
 */
data class HealthAgeSources(
    val isDemo: Boolean,
    val ageYears: Int?,
    val sex: Sex,
    val vo2MaxDays: List<Double?>,
    val vo2Fallback: Vo2Fallback?,
    val restingHeartRateDays: List<Double?>,
    val sleepMinutesDays: List<Double?>,
    val stepsDays: List<Double?>,
    val sleepRegularityIndex: Double?,
    val sleepRegularityNights: Int,
    val bmi: Double?,
)

/** Median of the finite values, or null when there are none. */
internal fun median(values: List<Double>): Double? {
    if (values.isEmpty()) return null
    val s = values.sorted()
    val mid = s.size / 2
    return if (s.size % 2 == 1) s[mid] else (s[mid - 1] + s[mid]) / 2.0
}

private fun List<Double?>.present(): List<Double> = filterNotNull().filter { it.isFinite() }

/**
 * Maps repository reads to the engine input; pure. Missing stays missing: an empty series gives a null factor, never a default.
 *  - VO2 max: median of the device values with the number of days; else the fallback with 1 day (flagged when it came from resting HR).
 *  - Resting HR: median over recorded days. Sleep: mean of main-sleep minutes. Steps: mean over days with steps above 0 (worn days).
 *  - Sleep Regularity Index and BMI as given (BMI is one point value: 1 day). HRV is never supplied (the engine withholds it).
 */
fun buildHealthAgeInput(s: HealthAgeSources): HealthAgeInput {
    val vo2 = s.vo2MaxDays.present().filter { it > 0.0 }
    val vo2Input: FactorInput?
    val derived: Boolean
    if (vo2.isNotEmpty()) {
        vo2Input = FactorInput(median(vo2)!!, vo2.size)
        derived = false
    } else {
        vo2Input = s.vo2Fallback?.takeIf { it.value.isFinite() }?.let { FactorInput(it.value, 1) }
        derived = s.vo2Fallback?.derivedFromRestingHr == true
    }
    val rhr = s.restingHeartRateDays.present()
    val sleep = s.sleepMinutesDays.present().filter { it > 0.0 }
    val steps = s.stepsDays.present().filter { it > 0.0 }
    return HealthAgeInput(
        chronologicalAgeYears = s.ageYears,
        sex = s.sex,
        vo2Max = vo2Input,
        vo2MaxDerivedFromRestingHr = derived,
        restingHeartRateBpm = median(rhr)?.let { FactorInput(it, rhr.size) },
        hrvRmssdMs = null,
        sleepDurationMinutes = sleep.takeIf { it.isNotEmpty() }?.let { FactorInput(it.average(), it.size) },
        sleepRegularityIndex = s.sleepRegularityIndex?.takeIf { it.isFinite() && s.sleepRegularityNights > 0 }
            ?.let { FactorInput(it, s.sleepRegularityNights) },
        dailySteps = steps.takeIf { it.isNotEmpty() }?.let { FactorInput(it.average(), it.size) },
        bmi = s.bmi?.takeIf { it.isFinite() }?.let { FactorInput(it, 1) },
    )
}
