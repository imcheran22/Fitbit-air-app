package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LongitudinalTest {

    private val eps = 1e-9

    private fun days(range: IntRange, v: Double) = range.map { DailyValue(it.toLong(), v) }

    // ------------------------------------------------------------------------------- LG01

    @Test
    fun `LG01 drift is fast median minus slow median`() {
        val h = days(1..62, 60.0) + days(63..90, 58.0)
        val d = Longitudinal.medianDrift(h, asOfDay = 91)!!
        assertEquals(58.0, d.fastMedian, eps)
        assertEquals(60.0, d.slowMedian, eps)
        assertEquals(-2.0, d.drift, eps)
        assertEquals(28, d.validFastDays)
        assertEquals(90, d.validSlowDays)
    }

    @Test
    fun `LG01 does not use the evaluated day and needs enough days in both windows`() {
        val h = days(1..90, 60.0) + DailyValue(91, 100.0)
        assertEquals(0.0, Longitudinal.medianDrift(h, 91)!!.drift, eps)
        assertNull(Longitudinal.medianDrift(days(51..90, 60.0), 91))          // 40 slow days
        assertNull(Longitudinal.medianDrift(days(1..60, 60.0), 91))           // no recent days
        assertNotNull(Longitudinal.medianDrift(days(35..90, 60.0), 91))       // 56 slow days
        assertFailsWith<IllegalArgumentException> { Longitudinal.medianDrift(h, 91, fastDays = 90, slowDays = 90) }
    }

    // ------------------------------------------------------------------------------- LG02

    private val lg02 = listOf(60, 60, 59, 59, 59, 58, 58, 58, 57, 57, 57, 56)

    @Test
    fun `T-LG02-a slope of weekly medians`() {
        val s = Longitudinal.trendSlope(lg02.mapIndexed { i, v -> i.toDouble() to v.toDouble() })!!
        assertEquals(-0.3427, s.olsSlope, 1e-4)
        assertEquals(-1.0 / 3, s.theilSenSlope, 1e-9)
        assertEquals(-0.4, s.theilSenLower95!!, 1e-9)
        assertEquals(-0.25, s.theilSenUpper95!!, 1e-9)
        assertEquals(true, s.intervalExcludesZero)
        assertEquals(12, s.points)
    }

    @Test
    fun `an exactly linear series gives equal slopes`() {
        val s = Longitudinal.trendSlope((0..9).map { it.toDouble() to 2.0 * it + 1 })!!
        assertEquals(2.0, s.olsSlope, eps)
        assertEquals(2.0, s.theilSenSlope, eps)
        assertEquals(2.0, s.theilSenLower95!!, eps)
        assertEquals(true, s.intervalExcludesZero)
    }

    @Test
    fun `Theil-Sen shrugs off one wild point where least squares does not`() {
        val pts = (0..9).map { it.toDouble() to it.toDouble() }.toMutableList()
        pts[9] = 9.0 to 100.0
        val s = Longitudinal.trendSlope(pts)!!
        assertEquals(1.0, s.theilSenSlope, eps)
        assertTrue(s.olsSlope > 5.0)
    }

    @Test
    fun `a flat noisy series has an interval that includes zero`() {
        val s = Longitudinal.trendSlope((0..11).map { it.toDouble() to if (it % 2 == 0) 60.0 else 61.0 })!!
        assertEquals(false, s.intervalExcludesZero)
    }

    @Test
    fun `too few points give no interval or no slope`() {
        val three = Longitudinal.trendSlope(listOf(0.0 to 1.0, 1.0 to 2.0, 2.0 to 3.0))!!
        assertNull(three.theilSenLower95)
        assertNull(three.intervalExcludesZero)
        assertNull(Longitudinal.trendSlope(listOf(0.0 to 1.0, 1.0 to 2.0)))
        assertNull(Longitudinal.trendSlope(listOf(1.0 to 1.0, 1.0 to 2.0, 1.0 to 3.0)))
        assertNull(Longitudinal.trendSlope(listOf(0.0 to 1.0, 1.0 to Double.NaN, 2.0 to 3.0)))
    }

    private fun weekly(medians: List<Int>, weekOffset: Int = 0): List<DailyValue> =
        medians.flatMapIndexed { w, m -> (0 until 7).map { d -> DailyValue(((w + weekOffset) * 7 + d).toLong(), m.toDouble()) } }

    @Test
    fun `weekly trend reproduces the 12-week example`() {
        val t = Longitudinal.weeklyTrend(weekly(lg02), asOfDay = 83)!!
        assertEquals(12, t.weeks.size)
        assertEquals(lg02.map { it.toDouble() }, t.weeks.map { it.median })
        assertEquals(-0.343, t.slopePerWeek.olsSlope, 1e-3)
        assertEquals(-1.37, t.olsSlopePerFourWeeks, 0.005)
        assertEquals(83L, t.weeks.last().weekEndDay)
        assertTrue(t.weeks.all { it.validDays == 7 })
    }

    @Test
    fun `a thin week is left out but keeps its place in time`() {
        val h = weekly(lg02).filter { it.epochDay !in 21L..25L }      // week 3 keeps only 2 days
        val t = Longitudinal.weeklyTrend(h, 83)!!
        assertEquals(11, t.weeks.size)
        assertFalse(3 in t.weeks.map { it.weekIndex })
        assertEquals(11, t.slopePerWeek.points)
    }

    @Test
    fun `fewer than eight usable weeks give no trend`() {
        assertNull(Longitudinal.weeklyTrend(weekly(lg02.takeLast(7), weekOffset = 5), 83))
        assertNotNull(Longitudinal.weeklyTrend(weekly(lg02.takeLast(8), weekOffset = 4), 83))
        assertFailsWith<IllegalArgumentException> { Longitudinal.weeklyTrend(emptyList(), 83, weeks = 12, minWeeks = 2) }
    }

    @Test
    fun `daily trend per day over the window`() {
        val h = (1..14).map { DailyValue(it.toLong(), 60.0 + 0.5 * it) }
        val s = Longitudinal.dailyTrend(h, asOfDay = 14)!!
        assertEquals(0.5, s.olsSlope, eps)
        assertEquals(0.5, s.theilSenSlope, eps)
        assertNull(Longitudinal.dailyTrend(h.take(13), 14))
        assertNull(Longitudinal.dailyTrend(emptyList(), 14))
    }

    // ------------------------------------------------------------------------------- LG03

    @Test
    fun `T-LG03-a CUSUM alarms from index 4`() {
        val r = Longitudinal.cusum((58..66).map { it.toDouble() }, target = 58.0, sigma = 1.5)
        assertEquals(4, r.firstAlarmIndex)
        assertEquals(listOf(4, 5, 6, 7, 8), r.alarmIndices)
        assertEquals(ShiftDirection.UP, r.direction)
        assertEquals(1, r.onsetIndex)
        assertEquals(0.0, r.upper[0], eps)
        assertEquals(1.0 / 6, r.upper[1], 1e-9)
        assertEquals(2.5, r.upper[3], 1e-9)
        assertEquals(9, r.upper.size)
        assertEquals(9, r.lower.size)
    }

    @Test
    fun `T-LG03-b CUSUM stays quiet on a stable series`() {
        val r = Longitudinal.cusum(listOf(58.0, 59.0, 58.0, 57.0, 59.0, 58.0, 60.0, 58.0), 58.0, 1.5)
        assertTrue(r.alarmIndices.isEmpty())
        assertNull(r.firstAlarmIndex)
        assertNull(r.direction)
        assertNull(r.onsetIndex)
    }

    @Test
    fun `a downward shift raises the lower sum`() {
        val r = Longitudinal.cusum(listOf(58.0, 57.0, 56.0, 55.0, 54.0, 53.0, 52.0), 58.0, 1.5)
        assertEquals(ShiftDirection.DOWN, r.direction)
        assertNotNull(r.firstAlarmIndex)
        assertTrue(r.upper.all { it == 0.0 })
    }

    @Test
    fun `a missing day neither alarms nor resets the sums`() {
        val r = Longitudinal.cusum(listOf(60.0, 60.0, null, 60.0), 58.0, 1.0)
        assertEquals(r.upper[1], r.upper[2], eps)
        assertEquals(1.5, r.upper[0], eps)
        assertEquals(3.0, r.upper[1], eps)
        assertEquals(4.5, r.upper[3], eps)
        assertEquals(listOf(3), r.alarmIndices)
    }

    @Test
    fun `CUSUM rejects invalid parameters`() {
        assertFailsWith<IllegalArgumentException> { Longitudinal.cusum(listOf(1.0), 0.0, 0.0) }
        assertFailsWith<IllegalArgumentException> { Longitudinal.cusum(listOf(1.0), 0.0, 1.0, k = -1.0) }
        assertFailsWith<IllegalArgumentException> { Longitudinal.cusum(listOf(1.0), 0.0, 1.0, h = 0.0) }
    }

    /** Days 1..28 alternate 58 and 59 (median 58.5), then [monitored] for days 29..60. */
    private fun shiftHistory(monitored: (Int) -> Double?): List<DailyValue> =
        (1..28).map { DailyValue(it.toLong(), if (it % 2 == 0) 58.0 else 59.0) } +
            (29..60).mapNotNull { d -> monitored(d)?.let { DailyValue(d.toLong(), it) } }

    @Test
    fun `level shift is detected and dated`() {
        val h = shiftHistory { if (it < 39) 58.5 else 62.0 }
        val s = Longitudinal.levelShift(h, asOfDay = 60, scaleFloor = 1.0)!!
        assertTrue(s.detected)
        assertEquals(ShiftDirection.UP, s.direction)
        assertEquals(58.5, s.referenceMedian, eps)
        assertEquals(1.0, s.sigma, eps)
        assertEquals(39L, s.estimatedOnsetDay)
        assertEquals(40L, s.firstAlarmDay)
        assertEquals(3.5, s.shift!!, eps)
        assertEquals(28, s.validReferenceDays)
        assertEquals(32, s.validMonitoredDays)
    }

    @Test
    fun `a downward level shift`() {
        val s = Longitudinal.levelShift(shiftHistory { if (it < 39) 58.5 else 55.0 }, 60, 1.0)!!
        assertTrue(s.detected)
        assertEquals(ShiftDirection.DOWN, s.direction)
        assertEquals(-3.5, s.shift!!, eps)
    }

    @Test
    fun `no shift means no onset and no shift size`() {
        val s = Longitudinal.levelShift(shiftHistory { 58.5 }, 60, 1.0)!!
        assertFalse(s.detected)
        assertNull(s.direction)
        assertNull(s.firstAlarmDay)
        assertNull(s.estimatedOnsetDay)
        assertNull(s.shift)
    }

    @Test
    fun `level shift is unknown when the window is thinly covered`() {
        assertNull(Longitudinal.levelShift(shiftHistory { null }, 60, 1.0))
        assertNull(Longitudinal.levelShift(shiftHistory { if (it < 35) 58.5 else null }, 60, 1.0))      // 6 monitored days
        assertNotNull(Longitudinal.levelShift(shiftHistory { if (it < 36) 58.5 else null }, 60, 1.0))   // 7 monitored days
    }

    @Test
    fun `level shift needs fourteen reference days`() {
        val thin = shiftHistory { 58.5 }.filter { it.epochDay > 15 }      // 13 reference days
        assertNull(Longitudinal.levelShift(thin, 60, 1.0))
        val enough = shiftHistory { 58.5 }.filter { it.epochDay > 14 }    // 14 reference days
        assertNotNull(Longitudinal.levelShift(enough, 60, 1.0))
    }

    @Test
    fun `level shift rejects invalid parameters`() {
        val h = shiftHistory { 58.5 }
        assertFailsWith<IllegalArgumentException> { Longitudinal.levelShift(h, 60, 0.0) }
        assertFailsWith<IllegalArgumentException> { Longitudinal.levelShift(h, 60, 1.0, windowDays = 60, referenceDays = 60) }
    }

    // ------------------------------------------------------------------------------- LG04

    @Test
    fun `work and free day split`() {
        val h = (0..27).map { d ->
            DailyValue(d.toLong(), if (SleepRegularity.isWeekendWakeDay(d.toLong())) 9000.0 + d else 7000.0)
        }
        val s = Longitudinal.workFreeSplit(h, asOfDay = 27, isFreeDay = SleepRegularity::isWeekendWakeDay)!!
        assertEquals(20, s.workDays)
        assertEquals(8, s.freeDays)
        assertEquals(7000.0, s.workMean, eps)
        assertEquals(0.0, s.workSd!!, eps)
        assertTrue(s.freeSd!! > 0.0)
        assertEquals(s.freeMean - 7000.0, s.gap, eps)
        assertTrue(s.gap > 2000.0)
    }

    @Test
    fun `work free split needs eight work and four free days`() {
        val h = (0..27).map { DailyValue(it.toLong(), 1.0) }
        assertNull(Longitudinal.workFreeSplit(h, 27, { false }))
        assertNull(Longitudinal.workFreeSplit(h, 27, { true }))
        assertNull(Longitudinal.workFreeSplit(h.filter { !SleepRegularity.isWeekendWakeDay(it.epochDay) }, 27, SleepRegularity::isWeekendWakeDay))
        assertNotNull(Longitudinal.workFreeSplit(h, 27, { it % 4 == 0L }))
    }
}
