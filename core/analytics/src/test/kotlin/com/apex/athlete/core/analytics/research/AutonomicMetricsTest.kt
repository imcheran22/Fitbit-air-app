package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.trend.WeeklyHrvState
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatusAnalyzer
import kotlin.math.exp
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * T-AR01-a..d: a 60-night baseline with ln-mean 3.9013 and SD 0.05206 (above the analyzer's 0.05 floor, so the
 * research's z and the app's weekly-status z are identical). The research's duplicate weekly calculation was removed;
 * its golden vectors now run through [WeeklyHrvStatusAnalyzer], the app's single implementation.
 */
class AutonomicMetricsTest {

    private val eps = 1e-3
    private val mu = 3.9013
    private val sigma = 0.05206

    /** Days 1..[n] whose ln RMSSD has mean [mu] and sample SD [sigma] exactly. */
    private fun baseline(n: Int = 60): List<DailyValue> {
        val d = sigma * sqrt((n - 1.0) / n)
        return List(n) { DailyValue(61L - n + it, exp(if (it % 2 == 0) mu + d else mu - d)) }
    }

    private fun week(values: List<Double>) = values.mapIndexed { i, v -> DailyValue(61L + i, v) } // days 61..67

    private val low = listOf(41.0, 43.0, 39.0, 44.0, 42.0, 40.0, 38.0)
    private val normal = listOf(50.0, 49.0, 52.0, 48.0, 51.0, 50.0, 47.0)

    @Test
    fun `T-AR01-a a low week`() {
        val history = baseline() + week(low)
        val s = WeeklyHrvStatusAnalyzer.analyze(history, asOfDay = 67)
        assertEquals(-3.629, s.zScore!!, eps)
        assertEquals(exp(3.7124), s.weekAverage!!, 0.01)
        assertEquals(exp(mu), s.baselineCenter!!, 1e-9)
        assertEquals(7, s.weekNights)
        assertEquals(60, s.baselineNights)
        assertEquals(WeeklyHrvState.MARKEDLY_BELOW, s.state)
        assertEquals(-17.2, AutonomicMetrics.percentFromBaseline(s)!!, 0.05)
        assertEquals(SwcStatus.BELOW_BAND, AutonomicMetrics.swcStatus(s))
        assertEquals(1.42, AutonomicMetrics.cv7LnPercent(history, 67)!!, 0.005)
    }

    @Test
    fun `T-AR01-b a normal week`() {
        val s = WeeklyHrvStatusAnalyzer.analyze(baseline() + week(normal), 67)
        assertEquals(0.030, s.zScore!!, eps)
        assertEquals(0.16, AutonomicMetrics.percentFromBaseline(s)!!, 0.005)
        assertEquals(SwcStatus.WITHIN_BAND, AutonomicMetrics.swcStatus(s))
    }

    @Test
    fun `a high week is above the band`() {
        val s = WeeklyHrvStatusAnalyzer.analyze(baseline() + week(List(7) { 65.0 }), 67)
        assertEquals(SwcStatus.ABOVE_BAND, AutonomicMetrics.swcStatus(s))
    }

    @Test
    fun `T-AR01-c and d too few nights give no band and no percentage`() {
        val fewRecent = WeeklyHrvStatusAnalyzer.analyze(baseline() + week(low.take(3)), 67)
        assertNull(AutonomicMetrics.swcStatus(fewRecent))
        assertNull(AutonomicMetrics.percentFromBaseline(fewRecent))
        val shortBaseline = WeeklyHrvStatusAnalyzer.analyze(baseline(20) + week(low), 67)
        assertNull(AutonomicMetrics.swcStatus(shortBaseline))
        assertEquals(SwcStatus.BELOW_BAND, AutonomicMetrics.swcStatus(WeeklyHrvStatusAnalyzer.analyze(baseline(21) + week(low), 67)))
    }

    @Test
    fun `CV7 needs four nights, keeps gaps as gaps and is unknown for a non-positive ln mean`() {
        val gaps = listOf(DailyValue(61, 41.0), DailyValue(63, 39.0), DailyValue(65, 42.0))
        assertNull(AutonomicMetrics.cv7LnPercent(gaps, 67))
        assertEquals(true, AutonomicMetrics.cv7LnPercent(gaps + DailyValue(67, 40.0), 67) != null)
        assertNull(AutonomicMetrics.cv7LnPercent(List(4) { DailyValue(64L + it, 1.0) }, 67))
        assertNull(AutonomicMetrics.cv7LnPercent(listOf(DailyValue(61, Double.NaN), DailyValue(62, -3.0)) + gaps, 67))
    }
}
