package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.sleep.SleepNightInput
import com.apex.athlete.core.analytics.sleep.SleepRegularityIndex
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.analytics.sleep.SleepSpan
import com.apex.athlete.core.analytics.sleep.SleepTiming
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Formula version 3: sleep consistency is the Sleep Regularity Index over consecutive-day minute pairs
 * (Phillips et al. 2017, Sci Rep 7:3216; docs/review/BEVEL_ALIGNMENT.md item 10).
 */
class SleepRegularityTest {

    private val d0 = 20_000L // first window: local noon of d0 to local noon of d0 + 1
    private val day = 1440L

    /** Asleep from [startHour] of day [d] to [endHour] of day [d]+[spanDays] (local wall clock, in minutes since the local epoch). */
    private fun span(d: Long, startMinute: Long, endMinute: Long, endDayOffset: Long = 0) =
        SleepSpan(d * day + startMinute, (d + endDayOffset) * day + endMinute)

    /** Night in window i: 22:00 on d0+i until 06:00 the next morning. */
    private fun regularNight(i: Int) = span(d0 + i, 22 * 60, 6 * 60, endDayOffset = 1)

    private val allCovered = List(7) { true }

    @Test
    fun `7 identical nights give exactly 100`() {
        val r = SleepRegularityIndex.compute((0 until 7).map(::regularNight), d0, allCovered)
        assertEquals(100.0, r.index!!, 1e-9)
        assertEquals(6 * 1440, r.minutePairs)
    }

    @Test
    fun `T-SL03-b research vector - nights alternating by two hours give 66_67`() {
        // Research golden vector (formerly tested against the removed research SRI): 23:00-07:00 and 01:00-09:00
        // alternate, so each consecutive pair disagrees on 2 x 120 = 240 of 1440 minutes:
        // SRI = 200 * (1 - 240/1440) - 100 = 66.667.
        val spans = (0 until 7).map { i ->
            if (i % 2 == 0) span(d0 + i, 23 * 60, 7 * 60, endDayOffset = 1) else span(d0 + i + 1, 60, 9 * 60)
        }
        val r = SleepRegularityIndex.compute(spans, d0, allCovered)
        assertEquals(200.0 * (1 - 240.0 / 1440.0) - 100.0, r.index!!, 1e-9)
        assertEquals(66.67, r.index!!, 0.005)
    }

    @Test
    fun `alternating 22-06 and 02-10 nights give 33_3`() {
        // Window i even: 22:00-06:00. Window i odd: 02:00-10:00 of the following morning (the night of window i).
        val spans = (0 until 7).map { i ->
            if (i % 2 == 0) regularNight(i) else span(d0 + i + 1, 2 * 60, 10 * 60)
        }
        val r = SleepRegularityIndex.compute(spans, d0, allCovered)
        // Consecutive windows disagree for 8 h + 8 h - 2 * 4 h overlap = 480 of 1440 minutes.
        // SRI = 200 * (1 - 480/1440) - 100 = 33.33
        assertEquals(200.0 * (1.0 - 480.0 / 1440.0) - 100.0, r.index!!, 1e-9)
        assertEquals(33.333, r.index!!, 0.001)
    }

    @Test
    fun `a day that was not recorded removes its pairs and is not counted as awake`() {
        val covered = listOf(true, true, false, true, true, true, true)
        // Window 2 has no data (band off). Even if junk sleep were present in it, its pairs are skipped.
        val spans = (0 until 7).filter { it != 2 }.map(::regularNight) + span(d0 + 2, 14 * 60, 18 * 60)
        val r = SleepRegularityIndex.compute(spans, d0, covered)
        assertEquals(100.0, r.index!!, 1e-9)
        // Pairs (0,1), (3,4), (4,5), (5,6) remain.
        assertEquals(4 * 1440, r.minutePairs)
        // Counting window 2 as covered-but-awake would not be 100.
        val asAwake = SleepRegularityIndex.compute((0 until 7).filter { it != 2 }.map(::regularNight), d0, allCovered)
        assertEquals(true, asAwake.index!! < 100.0)
    }

    @Test
    fun `a nap counts as sleep`() {
        // A 90 minute nap in window 3 only: pairs (2,3) and (3,4) each disagree for 90 of 1440 minutes.
        val spans = (0 until 7).map(::regularNight) + span(d0 + 3, 14 * 60, 14 * 60 + 90)
        val r = SleepRegularityIndex.compute(spans, d0, allCovered)
        // SRI = 100 - 200 * 180 / 8640 = 95.8333
        assertEquals(100.0 - 200.0 * 180.0 / 8640.0, r.index!!, 1e-9)
        // Daily naps at the same time keep it at 100.
        val daily = (0 until 7).map(::regularNight) + (0 until 7).map { span(d0 + it, 14 * 60, 14 * 60 + 90) }
        assertEquals(100.0, SleepRegularityIndex.compute(daily, d0, allCovered).index!!, 1e-9)
    }

    @Test
    fun `fewer than 2 pairs give no index`() {
        val oneGap = listOf(true, true, false, false, false, false, false)
        assertNull(SleepRegularityIndex.compute((0 until 2).map(::regularNight), d0, oneGap).index)
        val alternate = listOf(true, false, true, false, true, false, true)
        assertNull(SleepRegularityIndex.compute((0 until 7).map(::regularNight), d0, alternate).index)
        assertEquals(0, SleepRegularityIndex.compute(emptyList(), d0, List(7) { false }).minutePairs)
    }

    @Test
    fun `sleep outside the windows and invalid spans are ignored`() {
        val spans = (0 until 7).map(::regularNight) +
            span(d0 - 3, 22 * 60, 6 * 60, endDayOffset = 1) +      // before the first window
            span(d0 + 20, 22 * 60, 6 * 60, endDayOffset = 1) +     // after the last
            SleepSpan(d0 * day + 100, d0 * day + 50)               // end before start
        assertEquals(100.0, SleepRegularityIndex.compute(spans, d0, allCovered).index!!, 1e-9)
    }

    @Test
    fun `the sub-score is the index limited to 0-100`() {
        assertEquals(87.5, SleepRegularityIndex.subScore(87.5)!!, 1e-9)
        assertEquals(0.0, SleepRegularityIndex.subScore(-20.0)!!, 1e-9)
        assertEquals(100.0, SleepRegularityIndex.subScore(100.0)!!, 1e-9)
        assertNull(SleepRegularityIndex.subScore(null))
    }

    @Test
    fun `the engine scores consistency from the index when one is given`() {
        val night = SleepNightInput(asleepMinutes = 480.0, inBedMinutes = 480.0)
        val engine = SleepScoreEngine()
        // Formula version 5: duration 100 (0.35), efficiency 100 (0.15), consistency 60 (0.10); quality and
        // restoration absent: (35 + 15 + 6) / 0.60 = 93.333.
        val r = engine.evaluate(night, needMinutes = 480.0, regularityIndex = 60.0)
        assertEquals(56.0 / 0.60, r.score, 1e-9)
        assertEquals(60.0, r.regularityIndex!!, 1e-9)
    }

    @Test
    fun `with the spread rule switched off, timings never score consistency`() {
        val night = SleepNightInput(asleepMinutes = 480.0, inBedMinutes = 480.0)
        val steady = List(7) { SleepTiming(1380.0, 420.0) }
        val spreadOff = SleepScoreEngine(SleepScoreEngine.Config(useTimingSpreadForConsistency = false))
        val r = spreadOff.evaluate(night, 480.0, recentTimings = steady, regularityIndex = null)
        // Duration + efficiency only: 100. The spread is still reported for display.
        assertEquals(100.0, r.score, 1e-9)
        assertEquals(false, r.contributions.first { it.component.name == "CONSISTENCY" }.available)
        assertEquals(0.0, r.onsetStdDevMinutes!!, 1e-6)
        // The legacy path is unchanged when the rule is on and no index is given.
        val legacy = SleepScoreEngine().evaluate(night, 480.0, recentTimings = steady)
        assertEquals(true, legacy.contributions.first { it.component.name == "CONSISTENCY" }.available)
    }
}
