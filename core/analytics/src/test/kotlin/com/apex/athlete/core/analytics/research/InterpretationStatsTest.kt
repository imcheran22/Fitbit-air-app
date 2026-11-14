package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Golden vectors are the research's Part 3 section 8 (hypothetical data run through its reference code). */
class InterpretationStatsTest {

    private val sl01 = listOf(400.0, 420.0, 380.0, 470.0, 450.0, 300.0, 480.0)

    @Test
    fun `describe reproduces the SL01 week`() {
        val s = InterpretationStats.describe(sl01)!!
        assertEquals(7, s.n)
        assertEquals(414.2857, s.mean, 1e-3)
        assertEquals(420.0, s.median, 1e-9)
        assertEquals(62.144, s.sd!!, 1e-3)
        assertEquals(15.0, s.cvPercent!!, 0.01)
    }

    @Test
    fun `describe reproduces the PA01 week`() {
        val s = InterpretationStats.describe(listOf(5200.0, 6100.0, 4800.0, 7300.0, 5900.0, 3100.0, 4500.0))!!
        assertEquals(5200.0, s.median, 1e-9)
        assertEquals(5271.4, s.mean, 0.05)
        assertEquals(1337.6, s.sd!!, 0.05)
        assertEquals(25.4, s.cvPercent!!, 0.05)
    }

    @Test
    fun `describe with nothing or one value does not invent a spread`() {
        assertNull(InterpretationStats.describe(emptyList()))
        assertNull(InterpretationStats.describe(listOf(Double.NaN)))
        val one = InterpretationStats.describe(listOf(5.0))!!
        assertNull(one.sd)
        assertNull(one.cvPercent)
    }

    @Test
    fun `describe ignores non-finite values and gives no CV for a mean that is not positive`() {
        assertEquals(2, InterpretationStats.describe(listOf(1.0, Double.NaN, 3.0, Double.POSITIVE_INFINITY))!!.n)
        assertNull(InterpretationStats.describe(listOf(-2.0, 2.0))!!.cvPercent)
    }

    @Test
    fun `median absolute deviation is robust to an outlier`() {
        assertEquals(1.0, InterpretationStats.medianAbsoluteDeviation(listOf(1.0, 2.0, 3.0, 4.0, 100.0))!!, 1e-12)
        assertEquals(0.0, InterpretationStats.medianAbsoluteDeviation(listOf(5.0, 5.0, 5.0))!!, 1e-12)
        assertNull(InterpretationStats.medianAbsoluteDeviation(emptyList()))
    }

    @Test
    fun `lag-1 autocorrelation reproduces T-ST-d`() {
        val x = listOf(59.0, 60.0, 60.0, 61.0, 62.0, 62.0, 63.0, 63.0, 62.0, 61.0, 60.0, 60.0)
        assertEquals(0.669, InterpretationStats.lag1Autocorrelation(x)!!, 1e-3)
    }

    @Test
    fun `lag-1 autocorrelation is undefined for a constant or very short series`() {
        assertNull(InterpretationStats.lag1Autocorrelation(listOf(4.0, 4.0, 4.0, 4.0)))
        assertNull(InterpretationStats.lag1Autocorrelation(listOf(1.0, 2.0)))
        for (v in listOf(0.1, 33.3, 59.7)) {
            assertNull(InterpretationStats.lag1Autocorrelation(List(12) { v }), "constant $v")
        }
    }

    @Test
    fun `an alternating series has strongly negative autocorrelation`() {
        assertTrue(InterpretationStats.lag1Autocorrelation(listOf(1.0, -1.0, 1.0, -1.0, 1.0, -1.0))!! < -0.5)
    }

    @Test
    fun `effective sample size reproduces T-ST-c and never exceeds n`() {
        assertEquals(12.0, InterpretationStats.effectiveSampleSize(28, 0.4)!!, 1e-9)
        assertEquals(28.0, InterpretationStats.effectiveSampleSize(28, -0.5)!!, 1e-9)
        assertEquals(28.0, InterpretationStats.effectiveSampleSize(28, 0.0)!!, 1e-9)
        assertNull(InterpretationStats.effectiveSampleSize(28, 1.0))
        assertNull(InterpretationStats.effectiveSampleSize(28, Double.NaN))
        assertNull(InterpretationStats.effectiveSampleSize(0, 0.2))
    }

    @Test
    fun `minimal detectable change reproduces T-ST-a and T-ST-b`() {
        assertEquals(5.54, InterpretationStats.minimalDetectableChange95(2.0)!!, 0.005)
        assertEquals(2.77, InterpretationStats.minimalDetectableChange95(1.0)!!, 0.005)
        assertEquals(0.0, InterpretationStats.minimalDetectableChange95(0.0)!!, 0.0)
        assertNull(InterpretationStats.minimalDetectableChange95(-1.0))
        assertNull(InterpretationStats.minimalDetectableChange95(Double.NaN))
    }

    @Test
    fun `smallest worthwhile change is half an SD by default`() {
        assertEquals(1.0, InterpretationStats.smallestWorthwhileChange(2.0)!!, 1e-12)
        assertEquals(0.6, InterpretationStats.smallestWorthwhileChange(2.0, 0.3)!!, 1e-12)
        assertNull(InterpretationStats.smallestWorthwhileChange(-1.0))
        assertNull(InterpretationStats.smallestWorthwhileChange(1.0, 0.0))
    }

    @Test
    fun `Benjamini-Hochberg reproduces T-ST-e and T-ST-f`() {
        val p = listOf(0.001, 0.008, 0.02, 0.04, 0.30, 0.6, 0.9, 0.003)
        assertEquals(listOf(0, 1, 2, 3, 7), InterpretationStats.benjaminiHochberg(p, 0.10))
        assertEquals(listOf(0, 1, 2, 7), InterpretationStats.benjaminiHochberg(p, 0.05))
    }

    @Test
    fun `Benjamini-Hochberg with nothing significant or nothing at all returns nothing`() {
        assertEquals(emptyList(), InterpretationStats.benjaminiHochberg(listOf(0.5, 0.7, 0.9)))
        assertEquals(emptyList(), InterpretationStats.benjaminiHochberg(emptyList()))
    }

    @Test
    fun `Benjamini-Hochberg rejects invalid input`() {
        assertFailsWith<IllegalArgumentException> { InterpretationStats.benjaminiHochberg(listOf(1.2)) }
        assertFailsWith<IllegalArgumentException> { InterpretationStats.benjaminiHochberg(listOf(0.1), 0.0) }
        assertFailsWith<IllegalArgumentException> { InterpretationStats.benjaminiHochberg(listOf(0.1), 1.0) }
    }

    @Test
    fun `window keeps finite values of the half-open range once per day in date order`() {
        val h = listOf(
            DailyValue(5, 1.0), DailyValue(3, 2.0), DailyValue(4, Double.NaN), DailyValue(3, 9.0), DailyValue(6, 7.0),
        )
        val w = h.window(3, 6)
        assertEquals(listOf(3L, 5L), w.map { it.epochDay })
        assertEquals(listOf(2.0, 1.0), h.windowValues(3, 6))
        assertNotNull(w)
    }
}
