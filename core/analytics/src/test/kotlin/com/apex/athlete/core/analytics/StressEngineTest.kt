package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import com.apex.athlete.core.analytics.stress.MinuteRange
import com.apex.athlete.core.analytics.stress.MinuteSteps
import com.apex.athlete.core.analytics.stress.StressBaseline
import com.apex.athlete.core.analytics.stress.StressDayInput
import com.apex.athlete.core.analytics.stress.StressEngine
import com.apex.athlete.core.analytics.stress.StressMissing
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Daytime stress: every expected value below is computed by hand (see the comments), not by the code under test. */
class StressEngineTest {

    private val eps = 1e-4
    private val baseline = StressBaseline(centerBpm = 60.0, sigmaBpm = 5.0, validDays = 14)

    private fun hr(range: IntRange, bpm: Double) = range.map { MinuteHeartRate(it.toLong(), bpm) }

    private fun day(
        heartRate: List<MinuteHeartRate>,
        steps: List<MinuteSteps> = emptyList(),
        excluded: List<MinuteRange> = emptyList(),
    ) = StressDayInput(0L, 1440L, heartRate, steps, excluded)

    // Hand: level(z) = 3 / (1 + e^(-1.5 (z - 1.5))).
    //   z = 0: 3 / (1 + e^2.25) = 3 / 10.487736 = 0.286048
    //   z = 1.5: 3 / (1 + 1) = 1.5 exactly
    //   z = 3: 3 - 0.286048 = 2.713952 (the curve is point-symmetric about (1.5, 1.5))
    //   z = 4: 3 / (1 + e^-3.75) = 2.931068
    @Test
    fun `logistic mapping hand values`() {
        assertEquals(0.286048, StressEngine.levelForZ(0.0), eps)
        assertEquals(1.5, StressEngine.levelForZ(1.5), 1e-12)
        assertEquals(2.713952, StressEngine.levelForZ(3.0), eps)
        assertEquals(2.931068, StressEngine.levelForZ(4.0), eps)
        assertTrue(StressEngine.levelForZ(-50.0) in 0.0..3.0 && StressEngine.levelForZ(50.0) in 0.0..3.0)
    }

    // Hand: HR present on minutes 0..20; steps at minute 10 gate 8..12 (+-2); an excluded range [15, 17) removes 15, 16.
    // 21 - 5 - 2 = 14 still minutes.
    @Test
    fun `motion gating removes minutes within two of a step and workout minutes`() {
        val input = day(hr(0..20, 80.0), steps = listOf(MinuteSteps(10, 12)), excluded = listOf(MinuteRange(15, 17)))
        val still = StressEngine.stillMinutes(input)
        assertEquals(14, still.size)
        assertTrue(listOf(8L, 9L, 10L, 11L, 12L, 15L, 16L).none { it in still })
        assertTrue(7L in still && 13L in still && 14L in still && 17L in still)
    }

    @Test
    fun `zero step minutes do not gate`() {
        val input = day(hr(0..20, 80.0), steps = listOf(MinuteSteps(10, 0)))
        assertEquals(21, StressEngine.stillMinutes(input).size)
    }

    @Test
    fun `two readings in one minute are averaged`() {
        val input = day(listOf(MinuteHeartRate(5, 60.0), MinuteHeartRate(5, 70.0)))
        assertEquals(65.0, StressEngine.stillMinutes(input).getValue(5L), 1e-12)
    }

    // Hand: hours 7, 8, 9, 10 (06:00-22:00 window) carry 60 still minutes at 60, 62, 64, 70 bpm.
    // Sorted [60, 62, 64, 70]; type-7 P10: h = 0.1 * 3 = 0.3 -> 60 + 0.3 * 2 = 60.6.
    // Hour 3 (asleep hours, outside the window) and hour 12 with 14 still minutes (< 15) are ignored.
    @Test
    fun `day aggregate is the tenth percentile of qualifying waking hour means`() {
        val hrs = hr(420..479, 60.0) + hr(480..539, 62.0) + hr(540..599, 64.0) + hr(600..659, 70.0) +
            hr(180..239, 40.0) + hr(720..733, 50.0)
        assertEquals(60.6, StressEngine.dayAggregate(day(hrs))!!, 1e-9)
    }

    @Test
    fun `day aggregate is null with no qualifying hour`() {
        assertNull(StressEngine.dayAggregate(day(hr(720..733, 50.0))))
    }

    // Hand: 7 valid days [58, 60, 62, 60, 58, 62, 60]: mean 60, squared deviations 4+0+4+0+4+4+0 = 16, var 16/6, SD 1.633
    // < sigma floor 5.0 -> sigma 5.0.
    @Test
    fun `baseline needs seven valid days and floors sigma`() {
        val b = StressEngine.baselineFrom(listOf(58.0, 60.0, 62.0, 60.0, 58.0, 62.0, 60.0))
        assertNotNull(b)
        assertEquals(60.0, b.centerBpm, 1e-9)
        assertEquals(5.0, b.sigmaBpm, 1e-9)
        assertEquals(7, b.validDays)
        // Missing days stay missing: 6 valid + 3 nulls is still calibrating.
        assertNull(StressEngine.baselineFrom(listOf(58.0, null, 60.0, 62.0, null, 60.0, 58.0, 62.0, null)))
    }

    // Hand: [50, 70, 50, 70, 50, 70, 60]: mean 60, deviations -10, 10, -10, 10, -10, 10, 0 -> ss 600, var 100, SD 10 > floor.
    @Test
    fun `baseline sigma follows the athlete's own spread above the floor`() {
        val b = StressEngine.baselineFrom(listOf(50.0, 70.0, 50.0, 70.0, 50.0, 70.0, 60.0))!!
        assertEquals(10.0, b.sigmaBpm, 1e-9)
    }

    // Hand: 120 still minutes at 60 (z 0 -> 0.286048, low), 30 at 67.5 (z 1.5 -> 1.5, medium),
    // 30 at 75 (z 3 -> 2.713952, high), plus a 6-minute spike at 80 (z 4 -> 2.931068, high) in slot 1002..1007.
    // Mean = (120*0.286048 + 30*1.5 + 30*2.713952 + 6*2.931068) / 186 = 178.3... see the pinned value below.
    @Test
    fun `day summary counts, mean and highest six minute slot`() {
        val hrs = hr(600..719, 60.0) + hr(900..929, 67.5) + hr(804..833, 75.0) + hr(1002..1007, 80.0)
        val r = StressEngine.evaluate(day(hrs), baseline)
        val s = assertNotNull(r.summary)
        assertNull(r.missing)
        assertEquals(186, s.scoredMinutes)
        assertEquals(120, s.lowMinutes)
        assertEquals(30, s.mediumMinutes)
        assertEquals(36, s.highMinutes)
        // (120*0.28604839 + 30*1.5 + 30*2.71395161 + 6*2.93106789) / 186 = 0.9587675
        assertEquals(0.958768, s.meanLevel, eps)
        assertEquals(1002L, s.highestSlot!!.startMinute)
        assertEquals(2.931068, s.highestSlot!!.meanLevel, eps)
        assertEquals(186, r.minuteLevels.size)
    }

    @Test
    fun `slot with fewer than three scored minutes is not a candidate`() {
        // Slot 1002..1007 holds only 2 scored minutes (very high); the 3-minute slot at 1008 is the best candidate.
        val hrs = hr(600..719, 60.0) + hr(1006..1007, 80.0) + hr(1008..1010, 70.0)
        val s = StressEngine.evaluate(day(hrs), baseline).summary!!
        assertEquals(1008L, s.highestSlot!!.startMinute)
    }

    @Test
    fun `calibrating baseline gives null with a reason, never zero`() {
        val r = StressEngine.evaluate(day(hr(600..719, 60.0)), baseline = null)
        assertNull(r.summary)
        assertEquals(StressMissing.BASELINE_CALIBRATING, r.missing)
        assertTrue(r.minuteLevels.isEmpty())
        // The day aggregate is still produced so the pipeline can keep building the baseline.
        assertEquals(60.0, r.dayAggregateBpm!!, 1e-9)
    }

    @Test
    fun `fewer than 120 scored minutes gives null with a reason`() {
        val r = StressEngine.evaluate(day(hr(600..718, 60.0)), baseline)
        assertNull(r.summary)
        assertEquals(StressMissing.TOO_FEW_MINUTES, r.missing)
        val ok = StressEngine.evaluate(day(hr(600..719, 60.0)), baseline)
        assertNotNull(ok.summary)
    }

    @Test
    fun `workout and sleep minutes never score`() {
        val hrs = hr(600..899, 90.0)
        val r = StressEngine.evaluate(day(hrs, excluded = listOf(MinuteRange(700, 900))), baseline)
        // Only minutes 600..699 are scored (100 < 120) -> too few.
        assertEquals(StressMissing.TOO_FEW_MINUTES, r.missing)
    }
}
