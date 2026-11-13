package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.bp.BloodPressure
import com.apex.athlete.core.analytics.bp.BloodPressureCategory
import com.apex.athlete.core.analytics.bp.BloodPressureCategory.CRISIS
import com.apex.athlete.core.analytics.bp.BloodPressureCategory.ELEVATED
import com.apex.athlete.core.analytics.bp.BloodPressureCategory.NORMAL
import com.apex.athlete.core.analytics.bp.BloodPressureCategory.STAGE_1
import com.apex.athlete.core.analytics.bp.BloodPressureCategory.STAGE_2
import com.apex.athlete.core.analytics.bp.BloodPressureMissingReason
import com.apex.athlete.core.analytics.bp.BloodPressureReading
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Threshold table of the ACC/AHA 2017 adult categories (citation UNVERIFIED, see docs/EVIDENCE.md). */
class BloodPressureTest {

    private fun cat(sys: Int, dia: Int): BloodPressureCategory? = BloodPressure.evaluate(BloodPressureReading(sys, dia)).category

    @Test
    fun systolicEdgesWithNormalDiastolic() {
        assertEquals(NORMAL, cat(119, 79))
        assertEquals(ELEVATED, cat(120, 79))
        assertEquals(ELEVATED, cat(129, 79))
        assertEquals(STAGE_1, cat(130, 79))
        assertEquals(STAGE_1, cat(139, 79))
        assertEquals(STAGE_2, cat(140, 79))
        assertEquals(STAGE_2, cat(180, 79))
        assertEquals(CRISIS, cat(181, 79))
    }

    @Test
    fun diastolicEdgesWithNormalSystolic() {
        assertEquals(NORMAL, cat(110, 79))
        assertEquals(STAGE_1, cat(110, 80)) // diastolic 80-89 is Stage 1 (there is no diastolic "Elevated")
        assertEquals(STAGE_1, cat(110, 89))
        assertEquals(STAGE_2, cat(110, 90))
        assertEquals(STAGE_2, cat(130, 120))
        assertEquals(CRISIS, cat(130, 121))
    }

    @Test
    fun theHigherOfTheTwoCategoriesWins() {
        assertEquals(STAGE_1, cat(125, 85)) // systolic Elevated, diastolic Stage 1
        assertEquals(STAGE_1, cat(118, 82)) // systolic Normal, diastolic Stage 1
        assertEquals(STAGE_2, cat(135, 95)) // Stage 1 vs Stage 2
        assertEquals(CRISIS, cat(150, 125))
        val e = BloodPressure.evaluate(BloodPressureReading(125, 85))
        assertEquals(ELEVATED, e.systolicCategory)
        assertEquals(STAGE_1, e.diastolicCategory)
    }

    @Test
    fun implausibleReadingsAreRejectedNotClamped() {
        for ((s, d) in listOf(0 to 0, 80 to 120, 120 to 120, 400 to 80, 120 to 20, 49 to 40)) {
            val r = BloodPressure.evaluate(BloodPressureReading(s, d))
            assertNull(r.category, "$s/$d")
            assertEquals(BloodPressureMissingReason.IMPLAUSIBLE_READING, r.missingReason)
        }
    }

    @Test
    fun averageNeedsThreeValidReadings() {
        val two = BloodPressure.average(listOf(BloodPressureReading(120, 80), BloodPressureReading(130, 85)))
        assertNull(two.category)
        assertNull(two.meanSystolic)
        assertEquals(BloodPressureMissingReason.INSUFFICIENT_READINGS, two.missingReason)
        assertEquals(2, two.validReadings)
        val withBad = BloodPressure.average(
            listOf(BloodPressureReading(120, 80), BloodPressureReading(130, 85), BloodPressureReading(0, 0)),
        )
        assertNull(withBad.category)
        assertEquals(1, withBad.rejectedReadings)
        assertEquals(2, withBad.validReadings)
        assertEquals(BloodPressureMissingReason.INSUFFICIENT_READINGS, BloodPressure.average(emptyList()).missingReason)
    }

    @Test
    fun averageOfThreeReadings() {
        // sys (118+124+130)/3 = 124.0, dia (78+79+85)/3 = 80.667 -> rounds to 81: systolic Elevated, diastolic Stage 1 -> Stage 1
        val r = BloodPressure.average(listOf(BloodPressureReading(118, 78), BloodPressureReading(124, 79), BloodPressureReading(130, 85)))
        assertEquals(3, r.validReadings)
        assertEquals(124.0, r.meanSystolic!!, 1e-12)
        assertEquals(242.0 / 3.0, r.meanDiastolic!!, 1e-12)
        assertEquals(STAGE_1, r.category)
        assertEquals(ELEVATED, r.systolicCategory)
    }

    @Test
    fun meanIsRoundedToWholeMmHgBeforeClassifying() {
        // 119, 119, 121 -> 119.667 -> 120 -> Elevated
        val up = BloodPressure.average(List(3) { i -> BloodPressureReading(intArrayOf(119, 119, 121)[i], 70) })
        assertEquals(ELEVATED, up.category)
        // 118, 119, 120 -> 119.0 -> Normal
        val flat = BloodPressure.average(List(3) { i -> BloodPressureReading(intArrayOf(118, 119, 120)[i], 70) })
        assertEquals(NORMAL, flat.category)
        // 129, 129, 131 -> 129.667 -> 130 -> Stage 1
        val s1 = BloodPressure.average(List(3) { i -> BloodPressureReading(intArrayOf(129, 129, 131)[i], 70) })
        assertEquals(STAGE_1, s1.category)
    }
}
