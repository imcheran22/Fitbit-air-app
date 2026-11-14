package com.apex.athlete.core.analytics.research

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** SL01, SL04, SL05, SL07, SL08, SL10 against the research's worked examples. */
class SleepRegularityTest {

    private val eps = 1e-9
    private val sl01 = listOf(400.0, 420.0, 380.0, 470.0, 450.0, 300.0, 480.0)

    /** Asleep from 23:00 the evening before until 07:00 on [wakeDay]. */
    private fun night(
        wakeDay: Long,
        edited: Boolean = false,
        offsetDiffers: Boolean = false,
        awake: List<MinuteSpan> = emptyList(),
        startOffset: Long = -60,
        endOffset: Long = 420,
    ) = SleepNight(
        wakeEpochDay = wakeDay,
        period = MinuteSpan(wakeDay * 1440 + startOffset, wakeDay * 1440 + endOffset),
        awake = awake,
        manuallyEdited = edited,
        offsetDiffersFromUsual = offsetDiffers,
    )


    // --------------------------------------------------------------------------- MinuteSpan

    @Test
    fun `a span must end after it starts`() {
        assertFailsWith<IllegalArgumentException> { MinuteSpan(10, 10) }
        assertEquals(30L, MinuteSpan(10, 40).minutes)
    }

    // SL03 (Sleep Regularity Index) is tested against the app's own engine in ../SleepRegularityTest.kt;
    // the research's duplicate SRI implementation was removed (docs/RESEARCH_GAP_MATRIX.md).

    @Test
    fun `usable for regularity follows the flags`() {
        assertTrue(night(1).usableForRegularity)
        assertFalse(night(1, edited = true).usableForRegularity)
        assertFalse(night(1, offsetDiffers = true).usableForRegularity)
    }

    // ------------------------------------------------------------------- SL04 / SL10 timing

    @Test
    fun `midpoint onset and wake minutes of a 23_00 to 07_00 night`() {
        val p = MinuteSpan(10 * 1440L - 60, 10 * 1440L + 420)
        assertEquals(180.0, SleepRegularity.midpointMinuteOfDay(p), eps)
        assertEquals(1380.0, SleepRegularity.onsetMinuteOfDay(p), eps)
        assertEquals(420.0, SleepRegularity.wakeMinuteOfDay(p), eps)
    }

    @Test
    fun `midpoint of an odd length period keeps the half minute`() {
        assertEquals(30.5, SleepRegularity.midpointMinuteOfDay(MinuteSpan(1440L * 3 + 1, 1440L * 3 + 60)), eps)
    }

    @Test
    fun `clock times before the epoch are handled`() {
        val p = MinuteSpan(-100, 380)
        assertEquals(1340.0, SleepRegularity.onsetMinuteOfDay(p), eps)
        assertEquals(140.0, SleepRegularity.midpointMinuteOfDay(p), eps)
    }

    @Test
    fun `T-SL04-a midpoint spread`() {
        val v = SleepRegularity.clockVariability(listOf(180.0, 175.0, 200.0, 190.0, 260.0, 250.0, 185.0))!!
        assertEquals(205.714, v.meanMinuteOfDay, 1e-3)
        assertEquals(34.69, v.sdMinutes, 0.01)
        assertEquals(7, v.nights)
    }

    @Test
    fun `spread is computed across midnight`() {
        val v = SleepRegularity.clockVariability(listOf(1430.0, 10.0, 1420.0, 20.0, 0.0))!!
        assertEquals(Math.sqrt(250.0), v.sdMinutes, 1e-6)
        val toMidnight = minOf(v.meanMinuteOfDay, 1440 - v.meanMinuteOfDay)
        assertTrue(toMidnight < 1e-6, "mean was ${v.meanMinuteOfDay}")
    }

    @Test
    fun `too few nights or non-finite values give no spread`() {
        assertNull(SleepRegularity.clockVariability(listOf(180.0, 175.0, 200.0, 190.0)))
        assertNull(SleepRegularity.clockVariability(listOf(180.0, 175.0, 200.0, 190.0, Double.NaN)))
        assertEquals(4, SleepRegularity.clockVariability(listOf(180.0, 175.0, 200.0, 190.0), minNights = 3)!!.nights)
        assertNull(SleepRegularity.clockVariability(emptyList(), minNights = 0))
    }

    @Test
    fun `the 14-night window can demand ten nights`() {
        assertNull(SleepRegularity.clockVariability(List(9) { 180.0 + it }, minNights = 10))
        assertEquals(10, SleepRegularity.clockVariability(List(10) { 180.0 + it }, minNights = 10)!!.nights)
    }

    // -------------------------------------------------------------------------- SL05

    @Test
    fun `T-SL05-a social jetlag`() {
        val s = SleepRegularity.socialJetlag(
            workMidpoints = listOf(180.0, 175.0, 185.0, 182.0, 178.0),
            freeMidpoints = listOf(270.0, 262.0),
        )!!
        assertEquals(1.4333, s.signedHours, 1e-3)
        assertEquals(1.43, s.signedHours, 0.005)
        assertEquals(180.0, s.workMidpointMinuteOfDay, 1e-9)
        assertEquals(266.0, s.freeMidpointMinuteOfDay, 1e-9)
        assertEquals(5, s.workNights)
        assertEquals(2, s.freeNights)
    }

    @Test
    fun `earlier free-day sleep gives a negative value and an absolute value`() {
        val s = SleepRegularity.socialJetlag(listOf(300.0, 300.0, 300.0), listOf(240.0, 240.0))!!
        assertEquals(-1.0, s.signedHours, 1e-9)
        assertEquals(1.0, s.absoluteHours, 1e-9)
    }

    @Test
    fun `social jetlag across midnight`() {
        val s = SleepRegularity.socialJetlag(listOf(1420.0, 1430.0, 10.0), listOf(50.0, 70.0))!!
        assertEquals(66.667 / 60, s.signedHours, 1e-3)
        assertEquals(1433.333, s.workMidpointMinuteOfDay, 1e-3)
        assertEquals(60.0, s.freeMidpointMinuteOfDay, 1e-6)
    }

    @Test
    fun `social jetlag needs three work and two free nights`() {
        assertNull(SleepRegularity.socialJetlag(listOf(180.0, 175.0), listOf(270.0, 262.0)))
        assertNull(SleepRegularity.socialJetlag(listOf(180.0, 175.0, 185.0), listOf(270.0)))
        assertNull(SleepRegularity.socialJetlag(listOf(180.0, 175.0, Double.NaN), listOf(270.0, 262.0)))
    }

    @Test
    fun `weekend rule matches the calendar`() {
        assertFalse(SleepRegularity.isWeekendWakeDay(0))   // Thursday 1970-01-01
        assertFalse(SleepRegularity.isWeekendWakeDay(1))
        assertTrue(SleepRegularity.isWeekendWakeDay(2))    // Saturday
        assertTrue(SleepRegularity.isWeekendWakeDay(3))    // Sunday
        assertFalse(SleepRegularity.isWeekendWakeDay(4))   // Monday
        assertTrue(SleepRegularity.isWeekendWakeDay(-4))   // Sunday 1969-12-28
        assertTrue(SleepRegularity.isWeekendWakeDay(-5))   // Saturday
        assertFalse(SleepRegularity.isWeekendWakeDay(-3))  // Monday
        assertTrue(SleepRegularity.isWeekendWakeDay(20771)) // Saturday 2026-11-14
    }

    // ------------------------------------------------------------------- SL01 / SL08

    @Test
    fun `T-SL01-a duration summary`() {
        val s = SleepRegularity.durationSummary(sl01)!!
        assertEquals(414.2857, s.stats.mean, 1e-3)
        assertEquals(420.0, s.stats.median, eps)
        assertEquals(62.144, s.stats.sd!!, 1e-3)
        assertEquals(15.0, s.stats.cvPercent!!, 0.01)
        assertEquals(4, s.nightsAtOrAboveGuideline)
        assertEquals(0, s.missingNights)
        assertEquals(420.0, s.guidelineMinutes, eps)
    }

    @Test
    fun `missing nights are counted and never filled`() {
        val s = SleepRegularity.durationSummary(listOf(400.0, null, 380.0, 470.0, 450.0, null, 480.0))!!
        assertEquals(2, s.missingNights)
        assertEquals(5, s.stats.n)
        assertEquals((400 + 380 + 470 + 450 + 480) / 5.0, s.stats.mean, eps)
        assertNull(SleepRegularity.durationSummary(listOf(400.0, null, 380.0, 470.0, null, null, 480.0)))
        assertNull(SleepRegularity.durationSummary(emptyList()))
    }

    @Test
    fun `a zero or negative duration is not a night`() {
        assertNull(SleepRegularity.durationSummary(listOf(0.0, 400.0, 400.0, 400.0, 400.0)))
        assertEquals(1, SleepRegularity.durationSummary(listOf(0.0, 400.0, 400.0, 400.0, 400.0, 400.0))!!.missingNights)
    }

    @Test
    fun `a personal guideline replaces the default`() {
        assertEquals(5, SleepRegularity.durationSummary(sl01, guidelineMinutes = 400.0)!!.nightsAtOrAboveGuideline)
    }

    @Test
    fun `T-SL08-a guideline shortfall against a 450 minute target`() {
        val s = SleepRegularity.guidelineShortfall(sl01, targetMinutes = 450.0)!!
        assertEquals(300.0, s.clippedMinutes, eps)
        assertEquals(250.0, s.signedMinutes, eps)
        assertEquals(7, s.validNights)
        assertEquals(300.0 / 7, s.meanClippedPerNight, eps)
    }

    @Test
    fun `T-SL08-b guideline shortfall against the 420 minute guideline`() {
        val s = SleepRegularity.guidelineShortfall(sl01)!!
        assertEquals(420.0, s.targetMinutes, eps)
        assertEquals(180.0, s.clippedMinutes, eps)
        assertEquals(40.0, s.signedMinutes, eps)
    }

    @Test
    fun `shortfall skips missing nights and says how many`() {
        val s = SleepRegularity.guidelineShortfall(listOf(400.0, null, 380.0, 470.0, 450.0, 300.0, null), 450.0)!!
        assertEquals(5, s.validNights)
        assertEquals(2, s.missingNights)
        assertEquals(50.0 + 70.0 + 0.0 + 0.0 + 150.0, s.clippedMinutes, eps)
        assertNull(SleepRegularity.guidelineShortfall(listOf(400.0, null, 380.0, null, 450.0, 300.0, null)))
    }

    @Test
    fun `shortfall needs a positive target`() {
        assertFailsWith<IllegalArgumentException> { SleepRegularity.guidelineShortfall(sl01, 0.0) }
    }

    // --------------------------------------------------------------------------- SL07

    @Test
    fun `WASO is the union of awake stretches inside the period`() {
        val day = 1000L * 1440
        val n = night(1000, awake = listOf(MinuteSpan(day + 120, day + 135), MinuteSpan(day + 200, day + 210)))
        assertEquals(25.0, SleepRegularity.wasoMinutes(n, hasStageData = true)!!, eps)
    }

    @Test
    fun `overlapping and outside awake stretches are not double counted`() {
        val day = 1000L * 1440
        val overlapping = night(1000, awake = listOf(MinuteSpan(day + 10, day + 30), MinuteSpan(day + 20, day + 40)))
        assertEquals(30.0, SleepRegularity.wasoMinutes(overlapping, true)!!, eps)
        val outside = night(1000, awake = listOf(MinuteSpan(day - 300, day - 200), MinuteSpan(day + 500, day + 600)))
        assertEquals(0.0, SleepRegularity.wasoMinutes(outside, true)!!, eps)
    }

    @Test
    fun `no stage data means WASO is unknown not zero`() {
        assertNull(SleepRegularity.wasoMinutes(night(1000), hasStageData = false))
        assertEquals(0.0, SleepRegularity.wasoMinutes(night(1000), hasStageData = true)!!, eps)
    }

    @Test
    fun `T-SL07-a awakenings per hour`() {
        assertEquals(1.31, SleepRegularity.awakeningsPerHour(9, 6.87 * 60)!!, 0.005)
    }

    @Test
    fun `awakenings per hour needs both inputs`() {
        assertNull(SleepRegularity.awakeningsPerHour(null, 400.0))
        assertNull(SleepRegularity.awakeningsPerHour(9, null))
        assertNull(SleepRegularity.awakeningsPerHour(9, 0.0))
        assertNull(SleepRegularity.awakeningsPerHour(-1, 400.0))
        assertNull(SleepRegularity.awakeningsPerHour(9, Double.NaN))
        assertEquals(0.0, SleepRegularity.awakeningsPerHour(0, 400.0)!!, eps)
        assertTrue(abs(SleepRegularity.awakeningsPerHour(3, 180.0)!! - 1.0) < eps)
    }
}
