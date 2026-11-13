package com.apex.athlete.core.analytics.fitness

import com.apex.athlete.core.analytics.strain.Sex

enum class FitnessCategory { POOR, FAIR, GOOD, EXCELLENT, SUPERIOR }

enum class Vo2CategoryMissing { NO_VO2MAX, NO_AGE, SEX_UNSPECIFIED, AGE_OUT_OF_RANGE, INVALID_INPUT }

/**
 * @property percentile 5..95, linear between the published columns.
 * @property atTableEdge true when the value lies at or beyond the 5th or 95th percentile column, so the true
 *   percentile is "at most 5" or "at least 95" and the number is only a bound.
 */
data class Vo2CategoryResult(
    val percentile: Double?,
    val category: FitnessCategory?,
    val atTableEdge: Boolean,
    val missing: Vo2CategoryMissing?,
)

/**
 * Reference VO2max norms from the FRIEND (Fitness Registry and the Importance of Exercise National Database)
 * treadmill table, as transcribed in the Pulse reference (algorithms/fitnessLevel.ts): Kaminsky LA, Arena R,
 * Myers J. Reference standards for cardiorespiratory fitness measured with cardiopulmonary exercise testing:
 * data from the FRIEND registry. Mayo Clin Proc 2015;90(11):1515-1523. UNVERIFIED: the paper could not be opened in
 * this session (host not reachable), so the numbers are a transcription of the reference repo, not checked against the table.
 * Population: 7,783 treadmill tests of apparently healthy US adults, maximal effort (RER >= 1.0), 20-79 years.
 * Norms of a lab-tested, mostly healthy registry; a wearable's estimated VO2max (often a few ml/kg/min off) is
 * compared against them as context only.
 */
object FriendReference {
    /** Column percentiles. */
    val PERCENTILES: List<Double> = listOf(5.0, 10.0, 25.0, 50.0, 75.0, 90.0, 95.0)

    /** Index of the 50th percentile column. */
    const val MEDIAN_COLUMN = 3

    /** VO2max (ml/kg/min), rows for ages 20-29, 30-39, ... 70-79. */
    private val male = listOf(
        listOf(29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3),
        listOf(27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8),
        listOf(24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6),
        listOf(20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7),
        listOf(17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0),
        listOf(16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7),
    )
    private val female = listOf(
        listOf(21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0),
        listOf(19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8),
        listOf(17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7),
        listOf(16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9),
        listOf(13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4),
        listOf(13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1),
    )

    const val MIN_AGE = 20
    const val MAX_AGE = 79

    /** The percentile columns for the decade containing [ageYears] (20..79), or null for UNSPECIFIED sex or an age outside the table. */
    fun row(ageYears: Int, sex: Sex): List<Double>? {
        if (ageYears !in MIN_AGE..MAX_AGE) return null
        val table = when (sex) { Sex.MALE -> male; Sex.FEMALE -> female; Sex.UNSPECIFIED -> return null }
        return table[ageYears / 10 - 2]
    }

    /** Medians of the six decades, for decade midpoints 25, 35, ..., 75. */
    fun medians(sex: Sex): List<Double>? = when (sex) {
        Sex.MALE -> male.map { it[MEDIAN_COLUMN] }
        Sex.FEMALE -> female.map { it[MEDIAN_COLUMN] }
        Sex.UNSPECIFIED -> null
    }
}

/**
 * VO2max category against FRIEND norms for the athlete's decade and sex. Display context only.
 *  - Percentile: piecewise-linear between the 5/10/25/50/75/90/95 columns, clamped to [5, 95] (no extrapolation).
 *  - Category floors at percentiles 20 / 40 / 60 / 80 -> fair / good / excellent / superior (below 20 = poor).
 *    The floors and the labels are a calibration choice taken from the Pulse reference, not a published
 *    classification (FRIEND publishes percentiles, not named categories).
 *  - Ages outside 20..79 and an unspecified sex give null: the table has no row, and pooling sexes would be a guess.
 *  - Row selection is by decade, so the percentile jumps at a decade birthday; it is a population comparison, not a trend.
 */
object Vo2Categories {

    private const val FLOOR_FAIR = 20.0
    private const val FLOOR_GOOD = 40.0
    private const val FLOOR_EXCELLENT = 60.0
    private const val FLOOR_SUPERIOR = 80.0

    fun categoryOf(percentile: Double): FitnessCategory = when {
        percentile >= FLOOR_SUPERIOR -> FitnessCategory.SUPERIOR
        percentile >= FLOOR_EXCELLENT -> FitnessCategory.EXCELLENT
        percentile >= FLOOR_GOOD -> FitnessCategory.GOOD
        percentile >= FLOOR_FAIR -> FitnessCategory.FAIR
        else -> FitnessCategory.POOR
    }

    fun classify(vo2max: Double?, ageYears: Int?, sex: Sex): Vo2CategoryResult {
        if (vo2max == null) return missing(Vo2CategoryMissing.NO_VO2MAX)
        if (ageYears == null) return missing(Vo2CategoryMissing.NO_AGE)
        if (!vo2max.isFinite() || vo2max <= 0.0) return missing(Vo2CategoryMissing.INVALID_INPUT)
        if (sex == Sex.UNSPECIFIED) return missing(Vo2CategoryMissing.SEX_UNSPECIFIED)
        val row = FriendReference.row(ageYears, sex) ?: return missing(Vo2CategoryMissing.AGE_OUT_OF_RANGE)
        val pct = FriendReference.PERCENTILES
        val (percentile, edge) = when {
            vo2max <= row.first() -> pct.first() to true
            vo2max >= row.last() -> pct.last() to true
            else -> {
                val i = (1 until row.size).first { vo2max <= row[it] }
                (pct[i - 1] + (pct[i] - pct[i - 1]) * (vo2max - row[i - 1]) / (row[i] - row[i - 1])) to false
            }
        }
        return Vo2CategoryResult(percentile, categoryOf(percentile), edge, null)
    }

    private fun missing(r: Vo2CategoryMissing) = Vo2CategoryResult(null, null, false, r)
}
