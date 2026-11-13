package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.fitness.FitnessAge
import com.apex.athlete.core.analytics.fitness.FitnessAgeBound
import com.apex.athlete.core.analytics.fitness.FitnessAgeMissing
import com.apex.athlete.core.analytics.fitness.FitnessCategory
import com.apex.athlete.core.analytics.fitness.Vo2AgeCurve
import com.apex.athlete.core.analytics.fitness.Vo2Categories
import com.apex.athlete.core.analytics.fitness.Vo2CategoryMissing
import com.apex.athlete.core.analytics.strain.Sex
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** FRIEND (Kaminsky 2015) table rows used: male 20-29 [29.0 32.1 40.1 48.0 55.2 61.8 66.3], 40-49 [24.2 26.8 31.9 37.8 45.0 52.1 55.6]; female 30-39 [19.0 20.9 25.3 30.2 36.1 41.4 45.8]. */
class Vo2CategoryTest {

    @Test
    fun `percentile at a table column`() {
        val r = Vo2Categories.classify(48.0, 25, Sex.MALE)
        assertEquals(50.0, r.percentile!!, 1e-9)
        assertEquals(FitnessCategory.GOOD, r.category)
        assertFalse(r.atTableEdge)
    }

    // Hand: 44.05 between 40.1 (P25) and 48.0 (P50): 25 + (44.05 - 40.1) / 7.9 * 25 = 37.5.
    @Test
    fun `percentile interpolates linearly between columns`() {
        val r = Vo2Categories.classify(44.05, 29, Sex.MALE)
        assertEquals(37.5, r.percentile!!, 1e-9)
        assertEquals(FitnessCategory.FAIR, r.category)
    }

    // Hand: male 45, 41.4 between 37.8 (P50) and 45.0 (P75): 50 + 3.6 / 7.2 * 25 = 62.5 -> excellent (60..80).
    @Test
    fun `decade row follows the age`() {
        val r = Vo2Categories.classify(41.4, 45, Sex.MALE)
        assertEquals(62.5, r.percentile!!, 1e-9)
        assertEquals(FitnessCategory.EXCELLENT, r.category)
    }

    @Test
    fun `female row and sex matter`() {
        val f = Vo2Categories.classify(30.2, 35, Sex.FEMALE)
        assertEquals(50.0, f.percentile!!, 1e-9)
        val m = Vo2Categories.classify(30.2, 35, Sex.MALE)
        assertTrue(m.percentile!! < 50.0)
    }

    @Test
    fun `values beyond the table clamp and say so`() {
        val lo = Vo2Categories.classify(10.0, 25, Sex.MALE)
        assertEquals(5.0, lo.percentile!!, 1e-9); assertTrue(lo.atTableEdge); assertEquals(FitnessCategory.POOR, lo.category)
        val hi = Vo2Categories.classify(80.0, 25, Sex.MALE)
        assertEquals(95.0, hi.percentile!!, 1e-9); assertTrue(hi.atTableEdge); assertEquals(FitnessCategory.SUPERIOR, hi.category)
    }

    @Test
    fun `category floors are inclusive at 20 40 60 80`() {
        assertEquals(FitnessCategory.POOR, Vo2Categories.categoryOf(19.99))
        assertEquals(FitnessCategory.FAIR, Vo2Categories.categoryOf(20.0))
        assertEquals(FitnessCategory.GOOD, Vo2Categories.categoryOf(40.0))
        assertEquals(FitnessCategory.EXCELLENT, Vo2Categories.categoryOf(60.0))
        assertEquals(FitnessCategory.SUPERIOR, Vo2Categories.categoryOf(80.0))
    }

    @Test
    fun `missing inputs and out of range ages are null with a reason`() {
        assertEquals(Vo2CategoryMissing.NO_VO2MAX, Vo2Categories.classify(null, 30, Sex.MALE).missing)
        assertEquals(Vo2CategoryMissing.NO_AGE, Vo2Categories.classify(40.0, null, Sex.MALE).missing)
        assertEquals(Vo2CategoryMissing.SEX_UNSPECIFIED, Vo2Categories.classify(40.0, 30, Sex.UNSPECIFIED).missing)
        assertEquals(Vo2CategoryMissing.AGE_OUT_OF_RANGE, Vo2Categories.classify(40.0, 19, Sex.MALE).missing)
        assertEquals(Vo2CategoryMissing.AGE_OUT_OF_RANGE, Vo2Categories.classify(40.0, 80, Sex.MALE).missing)
        assertEquals(Vo2CategoryMissing.INVALID_INPUT, Vo2Categories.classify(-3.0, 30, Sex.MALE).missing)
        assertNull(Vo2Categories.classify(null, 30, Sex.MALE).percentile)
        assertEquals(FitnessCategory.POOR, Vo2Categories.classify(10.0, 79, Sex.FEMALE).category) // 70-79 row is used at 79
    }

    // ---- Fitness age (default curve: FRIEND 50th percentile at decade midpoints 25..75) ----
    // Male medians: 25:48.0 35:42.4 45:37.8 55:32.6 65:28.2 75:24.4. Female: 25:37.6 35:30.2 45:26.7 55:23.4 65:20.0 75:18.3.

    @Test
    fun `fitness age at a knot`() {
        val r = FitnessAge.estimate(42.4, 30, Sex.MALE)
        assertEquals(35.0, r.fitnessAgeYears!!, 1e-9)
        assertEquals(5.0, r.differenceYears!!, 1e-9) // fitness age minus chronological age: positive = older than calendar
        assertEquals(FitnessAgeBound.WITHIN_RANGE, r.bound)
    }

    // Hand: 40.1 between 35 (42.4) and 45 (37.8): 35 + (42.4 - 40.1) / (42.4 - 37.8) * 10 = 35 + 5 = 40.
    @Test
    fun `fitness age interpolates`() {
        assertEquals(40.0, FitnessAge.estimate(40.1, 40, Sex.MALE).fitnessAgeYears!!, 1e-9)
        assertEquals(45.0, FitnessAge.estimate(26.7, 50, Sex.FEMALE).fitnessAgeYears!!, 1e-9)
    }

    @Test
    fun `fitness age is clamped to the table span and flagged`() {
        val young = FitnessAge.estimate(55.0, 30, Sex.MALE)
        assertEquals(25.0, young.fitnessAgeYears!!, 1e-9); assertEquals(FitnessAgeBound.YOUNGER_THAN_RANGE, young.bound)
        val old = FitnessAge.estimate(20.0, 30, Sex.MALE)
        assertEquals(75.0, old.fitnessAgeYears!!, 1e-9); assertEquals(FitnessAgeBound.OLDER_THAN_RANGE, old.bound)
    }

    @Test
    fun `fitness age needs vo2max, age and a sex`() {
        assertEquals(FitnessAgeMissing.NO_VO2MAX, FitnessAge.estimate(null, 30, Sex.MALE).missing)
        assertEquals(FitnessAgeMissing.NO_AGE, FitnessAge.estimate(40.0, null, Sex.MALE).missing)
        assertEquals(FitnessAgeMissing.SEX_UNSPECIFIED, FitnessAge.estimate(40.0, 30, Sex.UNSPECIFIED).missing)
        assertEquals(FitnessAgeMissing.AGE_OUT_OF_RANGE, FitnessAge.estimate(40.0, 15, Sex.MALE).missing)
        assertNull(FitnessAge.estimate(null, null, Sex.MALE).fitnessAgeYears)
    }

    // A linear curve (e.g. a regression of mean VO2max on age) can be supplied: v = 60 - 0.5 * age; v = 45 -> age 30.
    @Test
    fun `a custom linear curve can replace the default`() {
        val curve = Vo2AgeCurve.linear(intercept = 60.0, slopePerYear = -0.5, minAge = 20.0, maxAge = 80.0)
        val r = FitnessAge.estimate(45.0, 40, Sex.MALE, curves = mapOf(Sex.MALE to curve))
        assertEquals(30.0, r.fitnessAgeYears!!, 1e-9)
        assertEquals(-10.0, r.differenceYears!!, 1e-9)
    }
}
