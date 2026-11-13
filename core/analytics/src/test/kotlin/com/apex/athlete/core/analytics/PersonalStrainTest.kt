package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.strain.StrainTargetCalculator
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Formula version 3: a personal strain target and a personal strain term in sleep need (BEVEL_ALIGNMENT item 11). */
class PersonalStrainTest {

    private val calc = StrainTargetCalculator()
    private val need = SleepNeedCalculator()
    private val eps = 1e-9

    // --- Target -------------------------------------------------------------------------------------------

    @Test
    fun `a steady personal base of 10 gives a centre of 10 at recovery 50 and 13 at recovery 100`() {
        val base = calc.personalBase(List(14) { 10.0 })!!
        assertEquals(10.0, base, eps)
        assertEquals(10.0, calc.targetFor(50.0, base)!!.center, eps)
        // 10 * (1 + 0.6 * (100 - 50) / 100) = 13
        assertEquals(13.0, calc.targetFor(100.0, base)!!.center, eps)
        // 10 * (1 + 0.6 * (0 - 50) / 100) = 7
        assertEquals(7.0, calc.targetFor(0.0, base)!!.center, eps)
        // The window stays centre +- 1.
        val t = calc.targetFor(100.0, base)!!
        assertEquals(12.0, t.low, eps)
        assertEquals(14.0, t.high, eps)
    }

    @Test
    fun `the target is limited to the 0-21 scale`() {
        val t = calc.targetFor(100.0, 20.0)!!
        assertEquals(21.0, t.center, eps)
        assertEquals(21.0, t.high, eps)
        assertEquals(20.0, t.low, eps)
    }

    @Test
    fun `base is a 14-day EWMA with alpha 0_25 that skips missing days`() {
        // Oldest first: 8, missing, 10, 12, missing, 10, 10 and seven more missing days (14 calendar days in all).
        val days = listOf(8.0, null, 10.0, 12.0, null, 10.0, 10.0) + List(7) { null }
        // Recorded newest first: 10, 10, 12, 10, 8 with decay d = 0.75.
        val num = 10.0 + 0.75 * 10.0 + 0.75 * 0.75 * 12.0 + 0.75 * 0.75 * 0.75 * 10.0 + 0.75 * 0.75 * 0.75 * 0.75 * 8.0
        val den = 1.0 + 0.75 + 0.75 * 0.75 + 0.75 * 0.75 * 0.75 + 0.75 * 0.75 * 0.75 * 0.75
        assertEquals(num / den, calc.personalBase(days)!!, eps)
    }

    @Test
    fun `only the last 14 days count, and fewer than 5 recorded days give no base`() {
        val old = List(10) { 18.0 }
        val last14 = List(14) { 6.0 }
        assertEquals(6.0, calc.personalBase(old + last14)!!, eps)
        assertNull(calc.personalBase(listOf(10.0, 10.0, 10.0, 10.0) + List(10) { null }))
        assertEquals(10.0, calc.personalBase(List(5) { 10.0 } + List(9) { null })!!, eps)
        assertNull(calc.personalBase(emptyList()))
    }

    @Test
    fun `no base means no target, never a population default`() {
        assertNull(calc.targetFor(80.0, null))
    }

    @Test
    fun `non finite strains are missing`() {
        assertEquals(10.0, calc.personalBase(List(6) { 10.0 } + Double.NaN + List(7) { null })!!, eps)
    }

    // --- Sleep need strain term ---------------------------------------------------------------------------

    @Test
    fun `strain one SD above the personal mean adds 2 percent of a 465 minute base, 9_3 minutes`() {
        val prior = listOf(8.0, 12.0, 8.0, 12.0, 8.0, 12.0, 8.0, 12.0) // mean 10, sample SD sqrt(32/7)
        val sd = sqrt(32.0 / 7.0)
        val yesterday = 10.0 + sd
        val z = need.strainZ(yesterday, prior)!!
        assertEquals(1.0, z, 1e-9)
        assertEquals(9.3, need.strainSurcharge(z, 465.0), 1e-9)
    }

    @Test
    fun `strain at or below the mean adds nothing`() {
        val prior = listOf(8.0, 12.0, 8.0, 12.0, 8.0, 12.0, 8.0, 12.0)
        assertEquals(0.0, need.strainSurcharge(need.strainZ(10.0, prior), 465.0), eps)
        assertEquals(0.0, need.strainSurcharge(need.strainZ(4.0, prior), 465.0), eps)
        assertEquals(0.0, need.strainSurcharge(null, 465.0), eps)
        assertEquals(0.0, need.strainSurcharge(Double.NaN, 465.0), eps)
    }

    @Test
    fun `fewer than 7 prior recorded days give no z, and the SD never falls below one strain point`() {
        assertNull(need.strainZ(15.0, List(6) { 10.0 }))
        assertNull(need.strainZ(null, List(10) { 10.0 }))
        assertNull(need.strainZ(Double.NaN, List(10) { 10.0 }))
        // Perfectly steady history: SD 0 -> floor 1.0, so +1 strain point is z = 1.
        assertEquals(1.0, need.strainZ(11.0, List(10) { 10.0 })!!, eps)
        // z is capped at 3: 6 % of the base at most.
        assertEquals(3.0, need.strainZ(21.0, List(10) { 10.0 })!!, eps)
        assertEquals(465.0 * 0.06, need.strainSurcharge(3.0, 465.0), eps)
    }

    @Test
    fun `only the latest 30 prior days are used`() {
        val prior = List(40) { 20.0 } + List(30) { 10.0 }
        assertEquals(1.0, need.strainZ(11.0, prior)!!, eps) // the 40 old days at 20 are ignored
    }

    @Test
    fun `total need adds the personal strain term to the base`() {
        val n = need.need(emptyList(), precedingDayStrainZ = 1.0, priorNights = emptyList(), asOfDay = 100)
        assertEquals(9.3, n.strainSurchargeMinutes, 1e-9)
        assertEquals(465.0 + 9.3, n.totalMinutes, 1e-9)
    }
}
