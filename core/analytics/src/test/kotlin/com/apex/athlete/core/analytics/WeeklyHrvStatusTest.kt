package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.recovery.FatigueSignal
import com.apex.athlete.core.analytics.recovery.FatigueSignalDetector
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.analytics.trend.WeeklyHrvState
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatusAnalyzer
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Formula version 3: weekly HRV status against a baseline that ends before the week (BEVEL_ALIGNMENT item 9). */
class WeeklyHrvStatusTest {

    private val mu = ln(60.0)
    private val s = 0.1

    /** 60 baseline nights alternating exp(mu + s) / exp(mu - s) on days 1..60, week on days 61..67 at [weekLn] (ln scale). */
    private fun history(weekLn: Double, weekNights: Int = 7, baselineNights: Int = 60): List<DailyValue> {
        val baseline = (1..baselineNights).map { i -> DailyValue((67 - 7 - baselineNights + i).toLong(), exp(mu + if (i % 2 == 0) s else -s)) }
        val week = (0 until weekNights).map { i -> DailyValue((67 - weekNights + 1 + i).toLong(), exp(weekLn)) }
        return baseline + week
    }

    // Hand: n nights alternating +-s, sample SD = s * sqrt(n / (n - 1)). Floors do not bind (0.1 > 0.05).
    private fun sd(n: Int) = s * sqrt(n.toDouble() / (n - 1))

    @Test
    fun `a week well below the baseline is markedly below range`() {
        val r = WeeklyHrvStatusAnalyzer.analyze(history(weekLn = mu - 0.2), asOfDay = 67)
        assertEquals(WeeklyHrvState.MARKEDLY_BELOW, r.state)
        assertEquals(7, r.weekNights)
        assertEquals(60, r.baselineNights)
        assertEquals(exp(mu - 0.2), r.weekAverage!!, 1e-9)
        assertEquals(exp(mu), r.baselineCenter!!, 1e-9)
        // z = -0.2 / (0.1 * sqrt(60 / 59)) = -1.9831
        assertEquals(-0.2 / sd(60), r.zScore!!, 1e-9)
        assertEquals(exp(mu - 0.75 * sd(60)), r.rangeLow!!, 1e-9)
        assertEquals(exp(mu + 0.75 * sd(60)), r.rangeHigh!!, 1e-9)
        assertEquals(exp(mu - 1.5 * sd(60)), r.markedlyLowLine!!, 1e-9)
    }

    @Test
    fun `the bands sit at plus or minus 0_75 and minus 1_5 standard deviations`() {
        val sd = sd(60)
        fun stateAt(zSd: Double) = WeeklyHrvStatusAnalyzer.analyze(history(mu + zSd * sd), 67).state
        assertEquals(WeeklyHrvState.WITHIN_RANGE, stateAt(0.0))
        assertEquals(WeeklyHrvState.WITHIN_RANGE, stateAt(-0.74))
        assertEquals(WeeklyHrvState.WITHIN_RANGE, stateAt(0.74))
        assertEquals(WeeklyHrvState.BELOW_RANGE, stateAt(-0.76))
        assertEquals(WeeklyHrvState.BELOW_RANGE, stateAt(-1.49))
        assertEquals(WeeklyHrvState.MARKEDLY_BELOW, stateAt(-1.51))
        assertEquals(WeeklyHrvState.ABOVE_RANGE, stateAt(0.76))
        assertEquals(WeeklyHrvState.ABOVE_RANGE, stateAt(3.0))
    }

    @Test
    fun `the baseline ends before the week so the week cannot dilute it`() {
        // Same 7 low nights; with a coupled baseline they would pull the centre down.
        val r = WeeklyHrvStatusAnalyzer.analyze(history(mu - 0.2), 67)
        assertEquals(exp(mu), r.baselineCenter!!, 1e-9)
    }

    @Test
    fun `at least 21 baseline nights and 4 week nights are needed`() {
        assertEquals(WeeklyHrvState.BASELINE_BUILDING, WeeklyHrvStatusAnalyzer.analyze(history(mu, baselineNights = 20), 67).state)
        assertNull(WeeklyHrvStatusAnalyzer.analyze(history(mu, baselineNights = 20), 67).weekAverage)
        assertEquals(20, WeeklyHrvStatusAnalyzer.analyze(history(mu, baselineNights = 20), 67).baselineNights)
        assertNotNull(WeeklyHrvStatusAnalyzer.analyze(history(mu, baselineNights = 21), 67).weekAverage)
        assertEquals(WeeklyHrvState.NO_RECENT_NIGHTS, WeeklyHrvStatusAnalyzer.analyze(history(mu, weekNights = 3), 67).state)
        assertEquals(3, WeeklyHrvStatusAnalyzer.analyze(history(mu, weekNights = 3), 67).weekNights)
        assertEquals(WeeklyHrvState.WITHIN_RANGE, WeeklyHrvStatusAnalyzer.analyze(history(mu, weekNights = 4), 67).state)
    }

    @Test
    fun `the spread never falls below 0_05 on the ln scale`() {
        // Baseline nights all identical: SD 0 -> floor 0.05. A week 0.06 lower is 1.2 sigma below: below range, not low.
        val flat = (1..60).map { DailyValue(it.toLong(), 60.0) } + (61..67).map { DailyValue(it.toLong(), 60.0 * exp(-0.06)) }
        val r = WeeklyHrvStatusAnalyzer.analyze(flat, 67)
        assertEquals(WeeklyHrvState.BELOW_RANGE, r.state)
        assertEquals(-0.06 / 0.05, r.zScore!!, 1e-9)
    }

    @Test
    fun `invalid readings are missing and the first reading of a day wins`() {
        val h = history(mu) + DailyValue(67, 5.0) + DailyValue(66, Double.NaN) + DailyValue(65, -3.0)
        val r = WeeklyHrvStatusAnalyzer.analyze(h, 67)
        assertEquals(exp(mu), r.weekAverage!!, 1e-9) // duplicates and bad values did not move it
        assertEquals(7, r.weekNights)
    }

    /** The G2 probe of docs/review/METRICS_ALIGNMENT.md: 30 nights at 57/63 ms, then a sustained fall to 47/53 ms. */
    private val g2 = (0L until 60L).map { d ->
        val base = if (d < 30) 60.0 else 50.0
        DailyValue(d, base + if (d % 2 == 0L) -3.0 else 3.0)
    }

    @Test
    fun `G2 - a sustained 17 percent fall is still flagged on day 30 of the fall`() {
        val fired = (30L until 60L).map { day ->
            val mi = MetricTrendAnalyzer.analyze(g2, day, BaselineSpecs.HRV)
            FatigueSignal.HRV_WEEKLY_AVERAGE_BELOW_RANGE in FatigueSignalDetector.assess(mi, null).signals
        }
        // Version 2 went silent after about 12 days (its baseline contained the fall).
        assertTrue(fired.last(), "signal at day 30 of the fall: $fired")
        assertTrue(fired.drop(2).all { it }, "signal from day 3 of the fall onwards: $fired")
    }

    @Test
    fun `a week of normal variation does not raise the weekly signal`() {
        val steady = (0L until 60L).map { d -> DailyValue(d, 60.0 + if (d % 2 == 0L) -3.0 else 3.0) }
        for (day in 35L until 60L) {
            val mi = MetricTrendAnalyzer.analyze(steady, day, BaselineSpecs.HRV)
            assertFalse(FatigueSignal.HRV_WEEKLY_AVERAGE_BELOW_RANGE in FatigueSignalDetector.assess(mi, null).signals, "day $day")
        }
    }

    @Test
    fun `the weekly status is only computed for the ln scale metric`() {
        val steady = (0L until 60L).map { d -> DailyValue(d, 60.0 + if (d % 2 == 0L) -3.0 else 3.0) }
        assertNotNull(MetricTrendAnalyzer.analyze(steady, 59, BaselineSpecs.HRV).weeklyStatus)
        assertNull(MetricTrendAnalyzer.analyze(steady, 59, BaselineSpecs.RESTING_HEART_RATE).weeklyStatus)
    }
}
