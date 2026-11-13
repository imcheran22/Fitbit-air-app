package com.apex.athlete.core.analytics.fitness

import com.apex.athlete.core.analytics.strain.Sex

/**
 * A strictly decreasing population-mean VO2max curve over age, as knots (age years, ml/kg/min), ascending age.
 * [ageFor] inverts it exactly by linear interpolation between knots.
 */
class Vo2AgeCurve(val knots: List<Pair<Double, Double>>) {
    init {
        require(knots.size >= 2) { "a curve needs at least two knots" }
        require(knots.zipWithNext().all { (a, b) -> b.first > a.first && b.second < a.second }) {
            "ages must ascend and VO2max must strictly fall"
        }
    }

    val minAge: Double get() = knots.first().first
    val maxAge: Double get() = knots.last().first

    /** The age at which the curve equals [vo2max], or null outside the curve's span (caller clamps and flags). */
    fun ageFor(vo2max: Double): Double? {
        if (vo2max > knots.first().second || vo2max < knots.last().second) return null
        for (i in 1 until knots.size) {
            val (a0, v0) = knots[i - 1]
            val (a1, v1) = knots[i]
            if (vo2max >= v1) return a0 + (v0 - vo2max) / (v0 - v1) * (a1 - a0)
        }
        return knots.last().first
    }

    companion object {
        /** A straight-line population mean v = intercept + slopePerYear * age over [minAge, maxAge]; slope must be negative. */
        fun linear(intercept: Double, slopePerYear: Double, minAge: Double, maxAge: Double) = Vo2AgeCurve(
            listOf(minAge to intercept + slopePerYear * minAge, maxAge to intercept + slopePerYear * maxAge),
        )
    }
}

enum class FitnessAgeBound {
    WITHIN_RANGE,

    /** VO2max is above the curve at its youngest age: the fitness age is "[curve minimum] or younger". */
    YOUNGER_THAN_RANGE,

    /** VO2max is below the curve at its oldest age: the fitness age is "[curve maximum] or older". */
    OLDER_THAN_RANGE,
}

enum class FitnessAgeMissing { NO_VO2MAX, NO_AGE, SEX_UNSPECIFIED, AGE_OUT_OF_RANGE, INVALID_INPUT }

/**
 * @property fitnessAgeYears the age whose population-mean VO2max equals the athlete's; clamped to the curve span when
 *   [bound] is not WITHIN_RANGE.
 * @property differenceYears fitnessAge - chronological age; negative = fitter than the average person of that age.
 */
data class FitnessAgeResult(
    val fitnessAgeYears: Double?,
    val differenceYears: Double?,
    val bound: FitnessAgeBound?,
    val missing: FitnessAgeMissing?,
)

/**
 * Fitness age: the age at which the reference population's MEAN VO2max equals the athlete's VO2max.
 *
 * Source status, read before use:
 *  - The concept and the HUNT-based formula are from the Norwegian HUNT study (Nes BM et al.; the reference values
 *    from Loe H, Rognmo O, Saltin B, Wisloff U. PLoS ONE 2013;8(5):e64319, 3,816 healthy adults 20-90 y, directly
 *    measured VO2max). UNVERIFIED: this session could not open the paper, so its regression coefficients are NOT
 *    in this code. [Vo2AgeCurve.linear] accepts them once checked against the paper.
 *  - The default curve is therefore the FRIEND 50th-percentile line (Kaminsky 2015, see [FriendReference]; also UNVERIFIED
 *    transcription) at decade midpoints 25, 35, ..., 75, linear between them, with no extrapolation. A registry
 *    median of lab-tested healthy adults is higher than a general-population mean, so the result is "versus the FRIEND
 *    median" and tends to read older than a HUNT-mean-based fitness age would. Calibration choice, stated in the UI.
 *  - Accuracy is bounded by the VO2max input: a wearable estimate typically errs by several ml/kg/min, which is
 *    several years of fitness age. Show as "about", never as a health measure.
 *  - Sex is required (the norms differ by sex); UNSPECIFIED gives null rather than a pooled value.
 */
object FitnessAge {

    /** FRIEND 50th percentile at ages 25, 35, ..., 75 for each sex. */
    val FRIEND_MEDIAN_CURVES: Map<Sex, Vo2AgeCurve> = listOf(Sex.MALE, Sex.FEMALE).associateWith { sex ->
        Vo2AgeCurve(FriendReference.medians(sex)!!.mapIndexed { i, v -> (25.0 + 10.0 * i) to v })
    }

    fun estimate(
        vo2max: Double?,
        chronologicalAgeYears: Int?,
        sex: Sex,
        curves: Map<Sex, Vo2AgeCurve> = FRIEND_MEDIAN_CURVES,
    ): FitnessAgeResult {
        if (vo2max == null) return missing(FitnessAgeMissing.NO_VO2MAX)
        if (chronologicalAgeYears == null) return missing(FitnessAgeMissing.NO_AGE)
        if (!vo2max.isFinite() || vo2max <= 0.0) return missing(FitnessAgeMissing.INVALID_INPUT)
        if (sex == Sex.UNSPECIFIED) return missing(FitnessAgeMissing.SEX_UNSPECIFIED)
        if (chronologicalAgeYears !in FriendReference.MIN_AGE..FriendReference.MAX_AGE) return missing(FitnessAgeMissing.AGE_OUT_OF_RANGE)
        val curve = curves[sex] ?: return missing(FitnessAgeMissing.SEX_UNSPECIFIED)

        val exact = curve.ageFor(vo2max)
        val (age, bound) = when {
            exact != null -> exact to FitnessAgeBound.WITHIN_RANGE
            vo2max > curve.knots.first().second -> curve.minAge to FitnessAgeBound.YOUNGER_THAN_RANGE
            else -> curve.maxAge to FitnessAgeBound.OLDER_THAN_RANGE
        }
        return FitnessAgeResult(age, age - chronologicalAgeYears, bound, null)
    }

    private fun missing(r: FitnessAgeMissing) = FitnessAgeResult(null, null, null, r)
}
