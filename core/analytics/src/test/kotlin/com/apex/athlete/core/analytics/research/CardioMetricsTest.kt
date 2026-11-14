package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.sleep.HeartRateDip
import com.apex.athlete.core.analytics.strain.HeartRateRecovery
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryInput
import com.apex.athlete.core.analytics.strain.HeartRateSample
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CardioMetricsTest {

    private val eps = 1e-9

    private fun hr(vararg pairs: Pair<Double, Double>) = pairs.map { TimedHeartRate(it.first, it.second) }

    // ------------------------------------------------------------------------------- CV02

    /** 14 values with mean 59 and sample SD 1.4. */
    private fun cv02Days(): List<DailyValue> {
        val d = 1.4 * sqrt(13.0 / 14.0)
        return (1..14).map { DailyValue(it.toLong(), if (it % 2 == 0) 59 + d else 59 - d) }
    }

    @Test
    fun `CV02 reproduces mean 59 SD 1_4 CV 2_4 percent`() {
        val s = CardioMetrics.restingHeartRateVariability(cv02Days(), asOfDay = 14)!!
        assertEquals(14, s.n)
        assertEquals(59.0, s.mean, 1e-9)
        assertEquals(1.4, s.sd!!, 1e-9)
        assertEquals(2.37, s.cvPercent!!, 0.005)
    }

    @Test
    fun `CV02 needs ten valid days and ignores implausible readings`() {
        val h = cv02Days()
        assertNull(CardioMetrics.restingHeartRateVariability(h.take(9), 14))
        assertEquals(10, CardioMetrics.restingHeartRateVariability(h.take(10), 14)!!.n)
        val withArtefact = h.take(9) + DailyValue(10, 300.0)
        assertNull(CardioMetrics.restingHeartRateVariability(withArtefact, 14))
    }

    @Test
    fun `CV02 only looks at the window ending on the evaluated day`() {
        val old = (-20..-1).map { DailyValue(it.toLong(), 80.0) }
        assertEquals(59.0, CardioMetrics.restingHeartRateVariability(old + cv02Days(), 14)!!.mean, 1e-9)
    }

    // ------------------------------------------------------------------------------- CV04

    @Test
    fun `T-CV04-a research vector through the app's own heart-rate recovery`() {
        // The research's duplicate HRR was removed; its golden vector (end 152, +60 s 128, +120 s 112 -> 24 and 40 bpm)
        // is checked against strain/HeartRateRecovery with minute means equal to the point values. That engine takes
        // the peak of the last three workout minutes (150, 151, 152) and the first two full minutes after the end.
        val end = 1_000L
        val minutes = listOf(end - 3 to 150.0, end - 2 to 151.0, end - 1 to 152.0, end to 128.0, end + 1 to 112.0)
            .map { (m, bpm) -> MinuteHeartRate(m, bpm) }
        val r = HeartRateRecovery.compute(HeartRateRecoveryInput(workoutEndMinuteExclusive = end, heartRate = minutes))
        assertEquals(152.0, r.peakBpm!!, eps)
        assertEquals(24.0, r.dropAt60!!, eps)
        assertEquals(40.0, r.dropAt120!!, eps)
    }

    @Test
    fun `comparison with recent sessions uses the median of the last five`() {
        val c = CardioMetrics.compareWithRecentSessions(24.0, listOf(10.0, 20.0, 22.0, 24.0, 26.0, 28.0, 30.0))!!
        assertEquals(26.0, c.medianOfPrevious, eps)
        assertEquals(-2.0, c.delta, eps)
        assertEquals(5, c.sessionsCompared)
    }

    @Test
    fun `comparison needs three comparable sessions`() {
        assertNull(CardioMetrics.compareWithRecentSessions(24.0, listOf(20.0, 22.0)))
        assertNull(CardioMetrics.compareWithRecentSessions(24.0, listOf(20.0, Double.NaN, 22.0)))
        assertEquals(3, CardioMetrics.compareWithRecentSessions(24.0, listOf(20.0, 22.0, 24.0))!!.sessionsCompared)
    }

    // ------------------------------------------------------------------------------- CV05

    @Test
    fun `CV05 drift 138 to 146 is 5_8 percent`() {
        assertEquals(5.8, CardioMetrics.heartRateDriftPercent(138.0, 146.0)!!, 0.05)
        assertEquals(-5.0, CardioMetrics.heartRateDriftPercent(140.0, 133.0)!!, eps)
        assertNull(CardioMetrics.heartRateDriftPercent(0.0, 146.0))
        assertNull(CardioMetrics.heartRateDriftPercent(138.0, 300.0))
    }

    private fun session(minutes: Int, firstBpm: Double, secondBpm: Double, stepSeconds: Int = 10) =
        (0 until minutes * 60 step stepSeconds).map {
            TimedHeartRate(it.toDouble(), if (it < minutes * 30) firstBpm else secondBpm)
        }

    @Test
    fun `drift of a recorded session compares the two halves`() {
        val d = CardioMetrics.heartRateDrift(session(30, 138.0, 146.0))!!
        assertEquals(138.0, d.firstHalfMeanBpm, eps)
        assertEquals(146.0, d.secondHalfMeanBpm, eps)
        assertEquals(5.797, d.driftPercent, 1e-3)
        assertTrue(d.durationMinutes in 29.0..30.0)
    }

    @Test
    fun `drift needs a long enough session and enough readings per half`() {
        assertNull(CardioMetrics.heartRateDrift(session(15, 138.0, 146.0)))
        assertNull(CardioMetrics.heartRateDrift(session(30, 138.0, 146.0, stepSeconds = 300)))
        assertNull(CardioMetrics.heartRateDrift(emptyList()))
    }

    @Test
    fun `aerobic decoupling compares efficiency of the halves`() {
        assertEquals(7.5, CardioMetrics.aerobicDecouplingPercent(8.0, 160.0, 7.4, 160.0)!!, 1e-9)
        // EF 0.050 falling to 0.0464 is 7.2 %.
        assertEquals(7.2, CardioMetrics.aerobicDecouplingPercent(8.0, 160.0, 8.0, 8.0 / 0.0464)!!, 0.01)
        assertEquals(0.0, CardioMetrics.aerobicDecouplingPercent(8.0, 150.0, 8.0, 150.0)!!, eps)
    }

    @Test
    fun `aerobic decoupling needs speed and plausible heart rates`() {
        assertNull(CardioMetrics.aerobicDecouplingPercent(0.0, 150.0, 8.0, 150.0))
        assertNull(CardioMetrics.aerobicDecouplingPercent(8.0, 150.0, Double.NaN, 150.0))
        assertNull(CardioMetrics.aerobicDecouplingPercent(8.0, 20.0, 8.0, 150.0))
    }

    // ------------------------------------------------------------------------------- CV07

    @Test
    fun `CV07 counts minutes above resting heart rate plus 20`() {
        val samples = listOf(
            HeartRateSample(70.0, 1.0), HeartRateSample(85.0, 1.0), HeartRateSample(90.0, 2.0),
            HeartRateSample(80.0, 1.0),               // exactly at the threshold: not above
            HeartRateSample(300.0, 5.0),              // implausible, dropped
            HeartRateSample(95.0, 0.0),               // no duration, dropped
        )
        val r = CardioMetrics.minutesAboveActiveThreshold(samples, restingHeartRate = 60.0)!!
        assertEquals(80.0, r.thresholdBpm, eps)
        assertEquals(3.0, r.minutesAbove, eps)
        assertEquals(5.0, r.recordedMinutes, eps)
    }

    @Test
    fun `CV07 zero means measured and never above, unknown means unknown`() {
        val calm = listOf(HeartRateSample(65.0, 10.0))
        assertEquals(0.0, CardioMetrics.minutesAboveActiveThreshold(calm, 60.0)!!.minutesAbove, eps)
        assertNull(CardioMetrics.minutesAboveActiveThreshold(calm, null))
        assertNull(CardioMetrics.minutesAboveActiveThreshold(calm, 10.0))
        assertNull(CardioMetrics.minutesAboveActiveThreshold(emptyList(), 60.0))
        assertNull(CardioMetrics.minutesAboveActiveThreshold(listOf(HeartRateSample(300.0, 5.0)), 60.0))
    }

    // ------------------------------------------------------------------------------- AR04

    @Test
    fun `AR04 research vectors through the app's own heart-rate dip`() {
        // The research's duplicate dip was removed; its formula vectors hold for sleep/HeartRateDip (fraction, not %).
        assertEquals(0.20, HeartRateDip.compute(75.0, 60.0).dipFraction!!, eps)
        assertEquals(-0.10, HeartRateDip.compute(60.0, 66.0).dipFraction!!, eps)
        assertNull(HeartRateDip.compute(0.0, 60.0).dipFraction)
    }
}
