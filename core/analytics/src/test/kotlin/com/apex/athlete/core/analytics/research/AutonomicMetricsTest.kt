package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.math.exp
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** T-AR01-a..d: a 60-night baseline with ln-mean 3.9013 and SD 0.05206. */
class AutonomicMetricsTest {

    private val eps = 1e-3
    private val mu = 3.9013
    private val sigma = 0.05206

    /** [n] nights whose ln RMSSD has mean [mu] and sample SD [sigma] exactly. */
    private fun baseline(n: Int = 60): List<Double> {
        val d = sigma * sqrt((n - 1.0) / n)
        return List(n) { exp(if (it % 2 == 0) mu + d else mu - d) }
    }

    private val low = listOf(41.0, 43.0, 39.0, 44.0, 42.0, 40.0, 38.0)
    private val normal = listOf(50.0, 49.0, 52.0, 48.0, 51.0, 50.0, 47.0)

    @Test
    fun `T-AR01-a a low week`() {
        val t = AutonomicMetrics.hrvTrend(low, baseline())!!
        assertEquals(3.7124, t.lnMean7, 1e-4)
        assertEquals(mu, t.lnBaselineMean, 1e-9)
        assertEquals(sigma, t.lnBaselineSd, 1e-9)
        assertEquals(-3.629, t.z!!, eps)
        assertEquals(-17.2, t.percentFromBaseline, 0.05)
        assertEquals(1.42, t.cv7LnPercent!!, 0.005)
        assertEquals(7, t.validNights7)
        assertEquals(60, t.validBaselineNights)
        assertEquals(0.5 * sigma, t.swcLn, 1e-9)
        assertEquals(SwcStatus.BELOW_BAND, t.swcStatus)
    }

    @Test
    fun `T-AR01-b a normal week`() {
        val t = AutonomicMetrics.hrvTrend(normal, baseline())!!
        assertEquals(0.030, t.z!!, eps)
        assertEquals(0.16, t.percentFromBaseline, 0.005)
        assertEquals(SwcStatus.WITHIN_BAND, t.swcStatus)
    }

    @Test
    fun `a high week is above the band`() {
        val t = AutonomicMetrics.hrvTrend(List(7) { 65.0 }, baseline())!!
        assertEquals(SwcStatus.ABOVE_BAND, t.swcStatus)
        assertTrue(t.z!! > 0)
    }

    @Test
    fun `geometric means are reported in milliseconds`() {
        val t = AutonomicMetrics.hrvTrend(low, baseline())!!
        assertEquals(exp(mu), t.baselineRmssdMs, 1e-9)
        assertEquals(exp(t.lnMean7), t.weeklyRmssdMs, 1e-9)
    }

    @Test
    fun `T-AR01-c three recent nights are too few`() {
        assertNull(AutonomicMetrics.hrvTrend(low.take(3), baseline()))
        assertTrue(AutonomicMetrics.hrvTrend(low.take(4), baseline()) != null)
    }

    @Test
    fun `T-AR01-d twenty baseline nights are too few`() {
        assertNull(AutonomicMetrics.hrvTrend(low, baseline(20)))
        assertTrue(AutonomicMetrics.hrvTrend(low, baseline(21)) != null)
    }

    @Test
    fun `missing and out-of-range nights are dropped not filled`() {
        val recent = listOf(41.0, null, 39.0, 0.5, 42.0, 250.0, 38.0, Double.NaN)
        val t = AutonomicMetrics.hrvTrend(recent, baseline())!!
        assertEquals(4, t.validNights7)
        val base = baseline(21) + listOf(null, 0.0, 300.0)
        assertEquals(21, AutonomicMetrics.hrvTrend(low, base)!!.validBaselineNights)
        assertNull(AutonomicMetrics.hrvTrend(low, baseline(20) + listOf(null, 0.0, 300.0)))
    }

    @Test
    fun `a flat baseline has no z but still reports the percentage`() {
        val t = AutonomicMetrics.hrvTrend(low, List(30) { 50.0 })!!
        assertNull(t.z)
        assertEquals(0.0, t.lnBaselineSd, 1e-12)
        assertTrue(t.percentFromBaseline < 0)
    }

    @Test
    fun `CV7 is unknown when the weekly ln mean is not positive`() {
        assertNull(AutonomicMetrics.hrvTrend(List(4) { 1.0 }, baseline())!!.cv7LnPercent)
    }

    @Test
    fun `dated history uses seven recent nights and the sixty before them`() {
        val base = baseline().mapIndexed { i, v -> DailyValue(1L + i, v) }       // days 1..60
        val recent = low.mapIndexed { i, v -> DailyValue(61L + i, v) }           // days 61..67
        val t = AutonomicMetrics.hrvTrend(base + recent, asOfDay = 67)!!
        assertEquals(7, t.validNights7)
        assertEquals(60, t.validBaselineNights)
        assertEquals(-3.629, t.z!!, eps)
        // The night before the baseline window is not used.
        val extra = DailyValue(0, 5.0)
        assertEquals(60, AutonomicMetrics.hrvTrend(listOf(extra) + base + recent, 67)!!.validBaselineNights)
    }

    @Test
    fun `dated history with gaps keeps them as gaps`() {
        val base = baseline().mapIndexed { i, v -> DailyValue(1L + i, v) }
        val recent = listOf(DailyValue(61, 41.0), DailyValue(63, 39.0), DailyValue(65, 42.0))
        assertNull(AutonomicMetrics.hrvTrend(base + recent, 67))
        assertEquals(4, AutonomicMetrics.hrvTrend(base + recent + DailyValue(67, 40.0), 67)!!.validNights7)
    }
}
