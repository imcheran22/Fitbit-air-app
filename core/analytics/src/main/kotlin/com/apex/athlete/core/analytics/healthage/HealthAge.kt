package com.apex.athlete.core.analytics.healthage

import com.apex.athlete.core.analytics.fitness.FitnessAge
import com.apex.athlete.core.analytics.fitness.FitnessAgeMissing
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.abs

/** One input factor: its value (a window mean or baseline) and how many distinct days of data it rests on. */
data class FactorInput(val value: Double, val daysOfData: Int)

/**
 * Factors of the health-age estimate. There is deliberately no separate "fitness age" factor: fitness age is derived from
 * [VO2_MAX] inside the engine (via [FitnessAge]), so the same fitness evidence can never be counted twice.
 */
enum class HealthAgeFactor { VO2_MAX, RESTING_HEART_RATE, HRV, SLEEP_DURATION, SLEEP_REGULARITY, DAILY_STEPS, BMI }

/**
 * @property chronologicalAgeYears from the profile; required.
 * @property sex optional; only the VO2 max factor needs it (the norms differ by sex). UNSPECIFIED withholds that factor.
 * @property vo2Max ml/kg/min, the best available value (a device estimate or a test), with the days it was reported.
 * @property vo2MaxDerivedFromRestingHr true when [vo2Max] is itself computed from resting HR (for example the
 *   Uth heart-rate-ratio fallback in CardioFitness); the factor is then withheld so resting HR is not counted twice.
 * @property restingHeartRateBpm 30-day resting-HR baseline (median), bpm.
 * @property hrvRmssdMs ln-scale or plain baseline RMSSD in ms. Accepted but never scored: the codebase has no validated
 *   age/sex reference table, so the factor is always withheld (NO_VALIDATED_NORM).
 * @property sleepDurationMinutes mean nightly sleep (main sleeps) in minutes.
 * @property sleepRegularityIndex Sleep Regularity Index, -100..100.
 * @property dailySteps mean steps per day over recorded (worn) days.
 * @property bmi kg/m2 from the user's latest weight and height (body data); a single point value, so its days only need to be >= 1.
 */
data class HealthAgeInput(
    val chronologicalAgeYears: Int?,
    val sex: Sex = Sex.UNSPECIFIED,
    val vo2Max: FactorInput? = null,
    val vo2MaxDerivedFromRestingHr: Boolean = false,
    val restingHeartRateBpm: FactorInput? = null,
    val hrvRmssdMs: FactorInput? = null,
    val sleepDurationMinutes: FactorInput? = null,
    val sleepRegularityIndex: FactorInput? = null,
    val dailySteps: FactorInput? = null,
    val bmi: FactorInput? = null,
)

enum class WithheldReason {
    /** The caller supplied nothing for this factor. */
    MISSING,

    /** Fewer than [HealthAge.MIN_DAYS] days of data (a point factor, VO2 max or BMI, needs only [HealthAge.MIN_POINT_DAYS]). */
    INSUFFICIENT_DAYS,

    /** Non-finite or physiologically implausible value. */
    INVALID_VALUE,

    /** VO2 max needs a sex (the reference tables differ by sex); never pooled. */
    SEX_UNSPECIFIED,

    /** The VO2 reference table covers ages 20-79. */
    AGE_OUT_OF_RANGE,

    /** The VO2 max value is computed from resting HR, which is its own factor; counting both would double count. */
    DERIVED_FROM_RESTING_HR,

    /** No validated age/sex reference exists in the codebase, so the factor is never scored. */
    NO_VALIDATED_NORM,
}

data class WithheldFactor(val factor: HealthAgeFactor, val reason: WithheldReason)

enum class ContributionDirection { OLDER, YOUNGER, NEUTRAL }

/**
 * @property years signed years added to the chronological age, after the per-factor cap (positive = older).
 * @property uncappedYears the same before the per-factor cap.
 * @property capped true when the cap changed the value.
 */
data class FactorContribution(
    val factor: HealthAgeFactor,
    val value: Double,
    val daysOfData: Int,
    val years: Double,
    val uncappedYears: Double,
    val capped: Boolean,
    val direction: ContributionDirection,
)

/** How many of the scorable factors contributed. Describes data coverage, never accuracy. */
enum class HealthAgeConfidence { LOW, MODERATE, HIGH }

enum class HealthAgeNoDataReason { NO_AGE, AGE_OUT_OF_RANGE }

enum class NotEnoughDataReason {
    /** No usable VO2 max and fewer than [HealthAge.MIN_OTHER_FACTORS] usable day-series factors. */
    NEED_VO2_MAX_OR_THREE_FACTORS,
}

sealed interface HealthAgeResult {
    /** Chronological age missing or outside 18..100. */
    data class NoData(val reason: HealthAgeNoDataReason) : HealthAgeResult

    /** Gate not met. [scoredDaySeriesFactors] is how many of the day-series factors qualified (0..4). */
    data class NotEnoughData(
        val reasons: List<NotEnoughDataReason>,
        val scoredDaySeriesFactors: Int,
        val withheld: List<WithheldFactor>,
    ) : HealthAgeResult

    /**
     * @property deltaYears estimated minus chronological age, after the total cap; positive = older than calendar.
     * @property uncappedDeltaYears sum of the factor contributions before the total cap.
     */
    data class Estimate(
        val chronologicalAgeYears: Int,
        val estimatedAgeYears: Double,
        val deltaYears: Double,
        val uncappedDeltaYears: Double,
        val totalCapped: Boolean,
        val contributions: List<FactorContribution>,
        val withheld: List<WithheldFactor>,
        val confidence: HealthAgeConfidence,
        val provenance: DataProvenance = DataProvenance.ESTIMATED,
        val disclaimer: String = HealthAge.DISCLAIMER,
    ) : HealthAgeResult
}

/**
 * EXPERIMENTAL health-age estimate (docs/DECISIONS.md D13: off by default). Not a medical measure, not diagnostic.
 *
 * Method: estimated age = chronological age + sum of bounded per-factor adjustments in years, total bounded to
 * +/- [TOTAL_CAP_YEARS]. Each factor's slope is anchored on the DIRECTION and rough size of a published population
 * association with all-cause mortality, converted to "years" with a Gompertz mortality-rate doubling time of about 8 years
 * (years = ln(hazard ratio) / ln 2 * 8, i.e. a 9 % higher hazard is about 1 year), then set by hand ("calibration"). Those
 * associations are observational (reverse causation and confounding are likely), measured in other populations, and
 * none was validated as a way to estimate an individual's age. Every constant below is a calibration choice;
 * sources and their verification status are in docs/EVIDENCE.md ("Health age"). Google Research's coachable
 * health-age (CKM) blog publishes no formula; it was only a design inspiration and nothing from it is implemented.
 *
 * Missing, too-short or invalid factors are withheld, never assumed or filled with a norm.
 */
object HealthAge {
    const val DISCLAIMER = "Experimental estimate from your own recorded data and population associations. Not a medical measure."

    // ---- Gating (calibration) ----
    /** Days of data a day-series factor needs (the 14-day window also used for the personal baselines). */
    const val MIN_DAYS = 14

    /** Days a point factor (VO2 max, BMI) needs. */
    const val MIN_POINT_DAYS = 1

    /** Usable day-series factors (resting HR, sleep duration, sleep regularity, steps) needed when there is no VO2 max. */
    const val MIN_OTHER_FACTORS = 3

    const val MIN_AGE = 18
    const val MAX_AGE = 100

    // ---- Caps (calibration), years ----
    const val TOTAL_CAP_YEARS = 10.0
    const val VO2_CAP = 5.0
    const val RHR_CAP = 3.0
    const val SLEEP_DURATION_CAP = 3.0
    const val SLEEP_SHORT_CAP = 2.0
    const val SLEEP_REGULARITY_CAP = 2.5
    const val STEPS_OLDER_CAP = 3.0
    const val STEPS_YOUNGER_CAP = 1.5
    const val BMI_CAP = 4.0

    // ---- Slopes and references (calibration) ----
    /** Years of health age per year of fitness age (fitness age minus chronological age). */
    const val VO2_WEIGHT = 0.25
    const val RHR_REFERENCE_BPM = 65.0
    const val RHR_YEARS_PER_10_BPM = 1.0
    const val SLEEP_OPTIMAL_MIN_HOURS = 7.0
    const val SLEEP_OPTIMAL_MAX_HOURS = 9.0
    const val SLEEP_SHORT_YEARS_PER_HOUR = 0.65
    const val SLEEP_LONG_YEARS_PER_HOUR = 1.0
    const val SRI_REFERENCE = 75.0
    const val SRI_YEARS_PER_10_POINTS = 1.0
    const val STEPS_REFERENCE = 7000.0
    const val STEPS_OLDER_YEARS_PER_1000 = 0.75
    const val STEPS_YOUNGER_YEARS_PER_1000 = 0.5
    const val BMI_UPPER_REFERENCE = 25.0
    const val BMI_YEARS_PER_UNIT = 0.5

    private const val EPS = 1e-9
    private val DAY_SERIES = listOf(
        HealthAgeFactor.RESTING_HEART_RATE,
        HealthAgeFactor.SLEEP_DURATION,
        HealthAgeFactor.SLEEP_REGULARITY,
        HealthAgeFactor.DAILY_STEPS,
    )
    private val SCORABLE_FACTORS = 6 // VO2 max + the four day-series factors + BMI; HRV is never scored

    /** Years from a mean resting HR (bpm); positive above the reference. */
    fun restingHeartRateYears(bpm: Double): Pair<Double, Double> = bound(
        (bpm - RHR_REFERENCE_BPM) / 10.0 * RHR_YEARS_PER_10_BPM, -RHR_CAP, RHR_CAP,
    )

    /** Years from mean nightly sleep in hours: zero inside 7-9 h, older outside (U-shaped association). */
    fun sleepDurationYears(hours: Double): Pair<Double, Double> = when {
        hours < SLEEP_OPTIMAL_MIN_HOURS ->
            bound((SLEEP_OPTIMAL_MIN_HOURS - hours) * SLEEP_SHORT_YEARS_PER_HOUR, 0.0, SLEEP_SHORT_CAP)
        hours > SLEEP_OPTIMAL_MAX_HOURS ->
            bound((hours - SLEEP_OPTIMAL_MAX_HOURS) * SLEEP_LONG_YEARS_PER_HOUR, 0.0, SLEEP_DURATION_CAP)
        else -> 0.0 to 0.0
    }

    /** Years from the Sleep Regularity Index: older below the reference, younger above. */
    fun sleepRegularityYears(sri: Double): Pair<Double, Double> = bound(
        (SRI_REFERENCE - sri) / 10.0 * SRI_YEARS_PER_10_POINTS, -SLEEP_REGULARITY_CAP, SLEEP_REGULARITY_CAP,
    )

    /** Years from mean daily steps: older below 7,000, younger above (smaller, saturating effect). */
    fun stepsYears(steps: Double): Pair<Double, Double> = when {
        steps < STEPS_REFERENCE ->
            bound((STEPS_REFERENCE - steps) / 1000.0 * STEPS_OLDER_YEARS_PER_1000, 0.0, STEPS_OLDER_CAP)
        else ->
            bound(-(steps - STEPS_REFERENCE) / 1000.0 * STEPS_YOUNGER_YEARS_PER_1000, -STEPS_YOUNGER_CAP, 0.0)
    }

    /** Years from BMI: only above 25 kg/m2; no adjustment at or below it (the underweight side is not modelled). */
    fun bmiYears(bmi: Double): Pair<Double, Double> =
        if (bmi > BMI_UPPER_REFERENCE) bound((bmi - BMI_UPPER_REFERENCE) * BMI_YEARS_PER_UNIT, 0.0, BMI_CAP) else 0.0 to 0.0

    /** Returns (capped, uncapped). */
    private fun bound(raw: Double, lo: Double, hi: Double): Pair<Double, Double> = raw.coerceIn(lo, hi) to raw

    fun estimate(input: HealthAgeInput): HealthAgeResult {
        val age = input.chronologicalAgeYears ?: return HealthAgeResult.NoData(HealthAgeNoDataReason.NO_AGE)
        if (age !in MIN_AGE..MAX_AGE) return HealthAgeResult.NoData(HealthAgeNoDataReason.AGE_OUT_OF_RANGE)

        val contributions = mutableListOf<FactorContribution>()
        val withheld = mutableListOf<WithheldFactor>()

        fun withhold(f: HealthAgeFactor, r: WithheldReason) { withheld += WithheldFactor(f, r) }

        /** Common gates; returns the input when it may be scored. */
        fun usable(f: HealthAgeFactor, x: FactorInput?, minDays: Int, plausible: (Double) -> Boolean): FactorInput? {
            if (x == null) { withhold(f, WithheldReason.MISSING); return null }
            if (!x.value.isFinite() || !plausible(x.value)) { withhold(f, WithheldReason.INVALID_VALUE); return null }
            if (x.daysOfData < minDays) { withhold(f, WithheldReason.INSUFFICIENT_DAYS); return null }
            return x
        }

        fun add(f: HealthAgeFactor, x: FactorInput, years: Pair<Double, Double>) {
            val (capped, raw) = years
            contributions += FactorContribution(
                factor = f,
                value = x.value,
                daysOfData = x.daysOfData,
                years = capped,
                uncappedYears = raw,
                capped = abs(capped - raw) > EPS,
                direction = when {
                    capped > EPS -> ContributionDirection.OLDER
                    capped < -EPS -> ContributionDirection.YOUNGER
                    else -> ContributionDirection.NEUTRAL
                },
            )
        }

        // VO2 max, through the existing fitness-age logic (single place, so fitness age is never a second factor).
        if (input.vo2Max != null && input.vo2MaxDerivedFromRestingHr) {
            withhold(HealthAgeFactor.VO2_MAX, WithheldReason.DERIVED_FROM_RESTING_HR)
        } else {
            usable(HealthAgeFactor.VO2_MAX, input.vo2Max, MIN_POINT_DAYS) { it > 0.0 }?.let { x ->
                val fa = FitnessAge.estimate(x.value, age, input.sex)
                val diff = fa.differenceYears
                if (diff == null) {
                    withhold(
                        HealthAgeFactor.VO2_MAX,
                        when (fa.missing) {
                            FitnessAgeMissing.SEX_UNSPECIFIED -> WithheldReason.SEX_UNSPECIFIED
                            FitnessAgeMissing.AGE_OUT_OF_RANGE -> WithheldReason.AGE_OUT_OF_RANGE
                            else -> WithheldReason.INVALID_VALUE
                        },
                    )
                } else {
                    add(HealthAgeFactor.VO2_MAX, x, bound(diff * VO2_WEIGHT, -VO2_CAP, VO2_CAP))
                }
            }
        }

        usable(HealthAgeFactor.RESTING_HEART_RATE, input.restingHeartRateBpm, MIN_DAYS) { it in 30.0..120.0 }
            ?.let { add(HealthAgeFactor.RESTING_HEART_RATE, it, restingHeartRateYears(it.value)) }

        if (input.hrvRmssdMs != null) withhold(HealthAgeFactor.HRV, WithheldReason.NO_VALIDATED_NORM)
        else withhold(HealthAgeFactor.HRV, WithheldReason.MISSING)

        usable(HealthAgeFactor.SLEEP_DURATION, input.sleepDurationMinutes, MIN_DAYS) { it in 120.0..960.0 }
            ?.let { add(HealthAgeFactor.SLEEP_DURATION, it, sleepDurationYears(it.value / 60.0)) }

        usable(HealthAgeFactor.SLEEP_REGULARITY, input.sleepRegularityIndex, MIN_DAYS) { it in -100.0..100.0 }
            ?.let { add(HealthAgeFactor.SLEEP_REGULARITY, it, sleepRegularityYears(it.value)) }

        usable(HealthAgeFactor.DAILY_STEPS, input.dailySteps, MIN_DAYS) { it > 0.0 && it <= 100_000.0 }
            ?.let { add(HealthAgeFactor.DAILY_STEPS, it, stepsYears(it.value)) }

        usable(HealthAgeFactor.BMI, input.bmi, MIN_POINT_DAYS) { it in 12.0..70.0 }
            ?.let { add(HealthAgeFactor.BMI, it, bmiYears(it.value)) }

        val hasVo2 = contributions.any { it.factor == HealthAgeFactor.VO2_MAX }
        val daySeries = contributions.count { it.factor in DAY_SERIES }
        if (!hasVo2 && daySeries < MIN_OTHER_FACTORS) {
            return HealthAgeResult.NotEnoughData(
                reasons = listOf(NotEnoughDataReason.NEED_VO2_MAX_OR_THREE_FACTORS),
                scoredDaySeriesFactors = daySeries,
                withheld = withheld,
            )
        }

        val uncapped = contributions.sumOf { it.years }
        val total = uncapped.coerceIn(-TOTAL_CAP_YEARS, TOTAL_CAP_YEARS)
        val confidence = when {
            contributions.size >= 5 -> HealthAgeConfidence.HIGH
            contributions.size == 4 -> HealthAgeConfidence.MODERATE
            else -> HealthAgeConfidence.LOW
        }
        check(contributions.size <= SCORABLE_FACTORS)
        return HealthAgeResult.Estimate(
            chronologicalAgeYears = age,
            estimatedAgeYears = age + total,
            deltaYears = total,
            uncappedDeltaYears = uncapped,
            totalCapped = abs(total - uncapped) > EPS,
            contributions = contributions,
            withheld = withheld,
            confidence = confidence,
        )
    }
}
