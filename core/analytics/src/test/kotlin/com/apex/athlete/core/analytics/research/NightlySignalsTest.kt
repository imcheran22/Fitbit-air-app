package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NightlySignalsTest {

    private fun days(range: IntRange, v: Double) = range.map { DailyValue(it.toLong(), v) }

    private val avgBase = days(1..28, 96.8)
    private val lowBase = days(1..28, 93.0)

    @Test
    fun `T-RT07-a temperature delta is nightly minus baseline`() {
        assertEquals(0.17, NightlySignals.sleepTemperatureDelta(34.12, 33.95)!!, 1e-9)
        assertEquals(-0.5, NightlySignals.sleepTemperatureDelta(33.0, 33.5)!!, 1e-9)
    }

    @Test
    fun `temperature delta is unknown when either value is missing or implausible`() {
        assertNull(NightlySignals.sleepTemperatureDelta(null, 33.95))
        assertNull(NightlySignals.sleepTemperatureDelta(34.12, null))
        assertNull(NightlySignals.sleepTemperatureDelta(50.0, 33.95))
        assertNull(NightlySignals.sleepTemperatureDelta(34.12, 5.0))
        assertNull(NightlySignals.sleepTemperatureDelta(Double.NaN, 33.95))
    }

    @Test
    fun `a level and lower bound both falling with adequate coverage is reportable`() {
        val s = NightlySignals.spo2Shift(avgBase + DailyValue(29, 95.0), lowBase + DailyValue(29, 91.0), 29, 0.8)!!
        assertEquals(ShiftSide.LOWER, s.side)
        assertTrue(s.reportable)
        assertEquals(-3.6, s.level.robustZ, 1e-9)
        assertEquals(-4.0, s.lowerBound.robustZ, 1e-9)
        assertEquals(0.8, s.coverageFraction)
    }

    @Test
    fun `both rising is a higher shift`() {
        val s = NightlySignals.spo2Shift(avgBase + DailyValue(29, 98.5), lowBase + DailyValue(29, 95.0), 29, 0.9)!!
        assertEquals(ShiftSide.HIGHER, s.side)
        assertTrue(s.reportable)
    }

    @Test
    fun `T-RT04 a small drop is inside the floor and says nothing`() {
        val s = NightlySignals.spo2Shift(avgBase + DailyValue(29, 96.4), lowBase + DailyValue(29, 92.8), 29, 0.9)!!
        assertEquals(-0.8, s.level.robustZ, 1e-9)
        assertNull(s.side)
        assertFalse(s.reportable)
    }

    @Test
    fun `only the level moving is not a shift`() {
        val s = NightlySignals.spo2Shift(avgBase + DailyValue(29, 95.0), lowBase + DailyValue(29, 93.0), 29, 0.9)!!
        assertNull(s.side)
        assertFalse(s.reportable)
    }

    @Test
    fun `thin or unknown coverage makes a shift unreportable`() {
        val avg = avgBase + DailyValue(29, 95.0)
        val low = lowBase + DailyValue(29, 91.0)
        assertFalse(NightlySignals.spo2Shift(avg, low, 29, 0.3)!!.reportable)
        assertFalse(NightlySignals.spo2Shift(avg, low, 29, null)!!.reportable)
        assertFalse(NightlySignals.spo2Shift(avg, low, 29, Double.NaN)!!.reportable)
        assertEquals(ShiftSide.LOWER, NightlySignals.spo2Shift(avg, low, 29, 0.3)!!.side)
        assertTrue(NightlySignals.spo2Shift(avg, low, 29, 0.5)!!.reportable)
    }

    @Test
    fun `missing tonight or an immature baseline gives nothing`() {
        assertNull(NightlySignals.spo2Shift(avgBase, lowBase + DailyValue(29, 91.0), 29, 0.9))
        assertNull(NightlySignals.spo2Shift(avgBase + DailyValue(29, 95.0), lowBase, 29, 0.9))
        assertNull(NightlySignals.spo2Shift(days(20..28, 96.8) + DailyValue(29, 95.0), lowBase + DailyValue(29, 91.0), 29, 0.9))
    }

    @Test
    fun `values outside 0 to 100 are not readings`() {
        assertNull(NightlySignals.spo2Shift(avgBase + DailyValue(29, 150.0), lowBase + DailyValue(29, 91.0), 29, 0.9))
        val noisy = avgBase + DailyValue(10, 999.0) + DailyValue(29, 95.0)
        assertEquals(-3.6, NightlySignals.spo2Shift(noisy, lowBase + DailyValue(29, 91.0), 29, 0.9)!!.level.robustZ, 1e-9)
    }
}
