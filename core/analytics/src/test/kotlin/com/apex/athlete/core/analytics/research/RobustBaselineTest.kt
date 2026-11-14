package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** T-CV01-a..f and T-RT01-a/b of the research, plus the history-based entry points. */
class RobustBaselineTest {

    private val eps = 1e-3
    private val rhr = RobustBaselineSpecs.RESTING_HEART_RATE

    /** 28 values: median 59, MAD 1. */
    private val base59 = List(9) { 58.0 } + List(10) { 59.0 } + List(9) { 60.0 }

    @Test
    fun `T-CV01-a elevated resting heart rate`() {
        val d = RobustBaseline.deviation(64.0, base59, rhr)!!
        assertEquals(59.0, d.median, 1e-12)
        assertEquals(1.0, d.mad, 1e-12)
        assertEquals(5.0, d.delta, 1e-12)
        assertEquals(3.372, d.robustZ, eps)
        assertFalse(d.floorApplied)
        assertEquals(28, d.validDays)
        assertEquals(100.0 * 5 / 59, d.percentFromMedian!!, 1e-9)
    }

    @Test
    fun `T-CV01-b lower reading gives a negative z`() {
        assertEquals(-0.674, RobustBaseline.deviation(58.0, base59, rhr)!!.robustZ, eps)
    }

    @Test
    fun `T-CV01-c ten valid days is too few`() {
        assertNull(RobustBaseline.deviation(64.0, base59.take(10), rhr))
    }

    @Test
    fun `T-CV01-d gaps are dropped not filled`() {
        val base = List(7) { 58.0 } + List(7) { 59.0 } + List(14) { null }
        val d = RobustBaseline.deviation(64.0, base, rhr)!!
        assertEquals(14, d.validDays)
        assertEquals(58.5, d.median, 1e-12)
        assertEquals(5.5, d.delta, 1e-12)
        assertEquals(5.5, d.robustZ, eps)
        assertTrue(d.floorApplied)
    }

    @Test
    fun `T-CV01-e zero MAD falls back to the floor`() {
        val d = RobustBaseline.deviation(61.0, List(14) { 58.0 }, rhr)!!
        assertEquals(0.0, d.mad, 1e-12)
        assertEquals(1.0, d.scale, 1e-12)
        assertEquals(3.0, d.robustZ, eps)
        assertTrue(d.floorApplied)
    }

    @Test
    fun `T-CV01-f thirteen valid days is too few`() {
        assertNull(RobustBaseline.deviation(61.0, List(13) { 58.0 }, rhr))
    }

    @Test
    fun `T-RT01 breathing rate with the 0_3 floor`() {
        val base = List(6) { 14.5 } + List(6) { 14.6 } + List(6) { 14.7 }
        val spec = RobustBaselineSpecs.RESPIRATORY_RATE
        assertEquals(5.0, RobustBaseline.deviation(16.1, base, spec)!!.robustZ, eps)
        assertEquals(1.0, RobustBaseline.deviation(14.9, base, spec)!!.robustZ, eps)
    }

    @Test
    fun `a non-finite reading gives no deviation`() {
        assertNull(RobustBaseline.deviation(Double.NaN, base59, rhr))
    }

    @Test
    fun `a zero median gives no percentage`() {
        val d = RobustBaseline.deviation(2.0, List(14) { 0.0 }, RobustBaselineSpecs.SPO2)!!
        assertNull(d.percentFromMedian)
    }

    @Test
    fun `spec defaults follow the research table`() {
        assertEquals(1.0, RobustBaselineSpecs.RESTING_HEART_RATE.scaleFloor)
        assertEquals(0.3, RobustBaselineSpecs.RESPIRATORY_RATE.scaleFloor)
        assertEquals(0.5, RobustBaselineSpecs.SPO2.scaleFloor)
        assertEquals(0.1, RobustBaselineSpecs.SLEEP_TEMPERATURE_DELTA.scaleFloor)
        assertEquals(15.0, RobustBaselineSpecs.SLEEP_DURATION.scaleFloor)
        assertEquals(500.0, RobustBaselineSpecs.STEPS.scaleFloor)
        assertEquals(28, rhr.windowDays)
        assertEquals(14, rhr.minValidDays)
    }

    @Test
    fun `invalid specs are rejected`() {
        assertFailsWith<IllegalArgumentException> { RobustBaselineSpec(scaleFloor = 0.0) }
        assertFailsWith<IllegalArgumentException> { RobustBaselineSpec(windowDays = 10, minValidDays = 11, scaleFloor = 1.0) }
        assertFailsWith<IllegalArgumentException> { RobustBaselineSpec(windowDays = 1, minValidDays = 1, scaleFloor = 1.0) }
    }

    // ----------------------------------------------------------------- history entry point

    private fun days(range: IntRange, value: Double) = range.map { DailyValue(it.toLong(), value) }

    @Test
    fun `the evaluated day is not part of its own baseline`() {
        val history = days(0..27, 58.0) + DailyValue(28, 70.0)
        val d = RobustBaseline.deviation(history, 28, rhr)!!
        assertEquals(58.0, d.median, 1e-12)
        assertEquals(12.0, d.robustZ, eps)
    }

    @Test
    fun `no reading on the evaluated day gives nothing`() {
        assertNull(RobustBaseline.deviation(days(0..27, 58.0), 28, rhr))
    }

    @Test
    fun `an immature baseline gives nothing`() {
        assertNull(RobustBaseline.deviation(days(20..27, 58.0) + DailyValue(28, 70.0), 28, rhr))
    }

    @Test
    fun `excluded days leave the baseline`() {
        val history = days(0..13, 58.0) + days(14..27, 70.0) + DailyValue(28, 64.0)
        val raw = RobustBaseline.deviation(history, 28, rhr)!!
        assertEquals(0.0, raw.delta, 1e-12)
        val cleaned = RobustBaseline.deviation(history, 28, rhr, excludedDays = (14L..27L).toSet())!!
        assertEquals(58.0, cleaned.median, 1e-12)
        assertEquals(14, cleaned.validDays)
        assertEquals(6.0, cleaned.robustZ, eps)
    }

    @Test
    fun `same-weekday baseline uses only the same weekday`() {
        val history = (1..8).map { DailyValue(100L - 7 * it, 10_000.0 + it) } +
            (1..8).map { DailyValue(100L - 7 * it + 1, 2_000.0) } + DailyValue(100, 4_000.0)
        val d = RobustBaseline.sameWeekdayDeviation(history, 100, scaleFloor = 500.0)!!
        assertEquals(8, d.validDays)
        assertEquals(10_004.5, d.median, 1e-9)
        assertTrue(d.robustZ < -5)
    }

    @Test
    fun `same-weekday baseline needs enough weeks`() {
        val history = (1..3).map { DailyValue(100L - 7 * it, 8_000.0) } + DailyValue(100, 4_000.0)
        assertNull(RobustBaseline.sameWeekdayDeviation(history, 100, 500.0))
        assertNotNull(RobustBaseline.sameWeekdayDeviation(history, 100, 500.0, minValidWeeks = 3))
    }

    // -------------------------------------------------------------------------- persistence

    /** Days 0..35 at 58, then elevated days 36 and 37. */
    private val elevated = days(0..35, 58.0) + DailyValue(36, 61.0) + DailyValue(37, 61.0)

    @Test
    fun `consecutive days beyond a positive threshold are counted back from the evaluated day`() {
        assertEquals(2, RobustBaseline.consecutiveDaysBeyond(elevated, 37, rhr, 2.0))
        assertEquals(1, RobustBaseline.consecutiveDaysBeyond(elevated, 36, rhr, 2.0))
        assertEquals(0, RobustBaseline.consecutiveDaysBeyond(elevated, 35, rhr, 2.0))
    }

    @Test
    fun `a missing day ends the count`() {
        val gap = elevated.filter { it.epochDay != 36L }
        assertEquals(1, RobustBaseline.consecutiveDaysBeyond(gap, 37, rhr, 2.0))
    }

    @Test
    fun `a negative threshold counts low days`() {
        val low = days(0..35, 58.0) + DailyValue(36, 55.0) + DailyValue(37, 55.0)
        assertEquals(2, RobustBaseline.consecutiveDaysBeyond(low, 37, rhr, -2.0))
        assertEquals(0, RobustBaseline.consecutiveDaysBeyond(low, 37, rhr, 2.0))
    }

    @Test
    fun `the count is capped and a zero threshold is rejected`() {
        val three = days(0..35, 58.0) + days(36..38, 61.0)
        assertEquals(3, RobustBaseline.consecutiveDaysBeyond(three, 38, rhr, 2.0))
        assertEquals(2, RobustBaseline.consecutiveDaysBeyond(three, 38, rhr, 2.0, maxDays = 2))
        assertFailsWith<IllegalArgumentException> { RobustBaseline.consecutiveDaysBeyond(elevated, 37, rhr, 0.0) }
    }
}
