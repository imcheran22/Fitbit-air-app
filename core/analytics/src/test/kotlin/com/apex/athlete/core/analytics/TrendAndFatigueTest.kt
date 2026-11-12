package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.FatigueSignal
import com.apex.athlete.core.analytics.recovery.FatigueSignalDetector
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.analytics.trend.TrendDirection
import com.apex.athlete.core.analytics.stats.Ewma
import kotlin.math.exp
import kotlin.math.ln
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TrendAndFatigueTest {

    private val eps = 1e-9

    /** 30 days alternating around [center], then [tail] as the most recent days ending on day 100. */
    private fun series(center: Double, swing: Double, tail: List<Double>): List<DailyValue> {
        val base = List(30) { i -> center + if (i % 2 == 0) swing else -swing }
        val all = base + tail
        return all.mapIndexed { i, v -> DailyValue(100L - all.size + 1 + i, v) }
    }

    @Test
    fun `a stable metric is within range with a stable trend`() {
        val history = series(60.0, 2.0, listOf(60.0, 61.0, 59.0, 60.0))
        val m = MetricTrendAnalyzer.analyze(history, 100, BaselineSpecs.RESTING_HEART_RATE)
        assertEquals(60.0, m.current!!, eps)
        assertEquals(59.0, m.previous!!, eps)
        assertEquals(99L, m.previousDay)
        assertEquals(1.0, m.changeFromPrevious!!, eps)
        assertEquals(RangeStatus.WITHIN_NORMAL, m.rangeStatus)
        assertEquals(TrendDirection.STABLE, m.trend)
        assertEquals(0, m.consecutiveDaysOutsideNormal)
        assertEquals(7, m.validDaysLast7)
        assertTrue(m.baseline.isEstablished)
    }

    @Test
    fun `a climbing resting heart rate is flagged above range for consecutive days`() {
        val history = series(60.0, 2.0, listOf(61.0, 63.0, 65.0, 66.0, 67.0, 68.0, 69.0))
        val m = MetricTrendAnalyzer.analyze(history, 100, BaselineSpecs.RESTING_HEART_RATE)
        assertEquals(RangeStatus.ABOVE_NORMAL, m.rangeStatus)
        assertEquals(TrendDirection.RISING, m.trend)
        assertTrue(m.consecutiveDaysOutsideNormal >= 3, "streak was ${m.consecutiveDaysOutsideNormal}")
        assertTrue(m.zScore!! > 1.5)
        assertTrue(m.fractionFromBaseline!! > 0.05)
        assertTrue(m.ewma7!! > m.baseline.center!!)
    }

    @Test
    fun `missing reading and calibrating baseline are reported as such`() {
        val noToday = series(60.0, 2.0, emptyList()).filter { it.epochDay < 100 }
        val m = MetricTrendAnalyzer.analyze(noToday, 100, BaselineSpecs.RESTING_HEART_RATE)
        assertNull(m.current)
        assertNull(m.zScore)
        assertEquals(RangeStatus.NO_READING, m.rangeStatus)

        val fresh = listOf(DailyValue(98, 55.0), DailyValue(99, 57.0), DailyValue(100, 56.0))
        val c = MetricTrendAnalyzer.analyze(fresh, 100, BaselineSpecs.HRV)
        assertEquals(RangeStatus.CALIBRATING, c.rangeStatus)
        assertEquals(TrendDirection.INSUFFICIENT_DATA, c.trend)
        assertNull(c.zScore)
        assertEquals(5, c.baseline.daysUntilEstablished)
    }

    @Test
    fun `fatigue level rises as independent signals agree`() {
        val calmHrv = MetricTrendAnalyzer.analyze(series(60.0, 4.0, listOf(60.0, 62.0, 58.0, 61.0)), 100, BaselineSpecs.HRV)
        val calmRhr = MetricTrendAnalyzer.analyze(series(55.0, 1.5, listOf(55.0, 56.0, 54.0, 55.0)), 100, BaselineSpecs.RESTING_HEART_RATE)
        val calm = FatigueSignalDetector.assess(calmHrv, calmRhr)
        assertEquals(FatigueLevel.NONE, calm.level)
        assertTrue(calm.signals.isEmpty())

        val oneBadNight = MetricTrendAnalyzer.analyze(series(60.0, 4.0, listOf(60.0, 62.0, 58.0, 47.0)), 100, BaselineSpecs.HRV)
        val watch = FatigueSignalDetector.assess(oneBadNight, calmRhr)
        assertEquals(FatigueLevel.WATCH, watch.level)
        assertEquals(setOf(FatigueSignal.HRV_ACUTE_DROP), watch.signals)

        val lowHrv = MetricTrendAnalyzer.analyze(series(60.0, 4.0, listOf(50.0, 48.0, 47.0, 46.0, 45.0)), 100, BaselineSpecs.HRV)
        val highRhr = MetricTrendAnalyzer.analyze(series(55.0, 1.5, listOf(58.0, 59.0, 60.0, 61.0, 62.0)), 100, BaselineSpecs.RESTING_HEART_RATE)
        val high = FatigueSignalDetector.assess(lowHrv, highRhr)
        assertEquals(FatigueLevel.HIGH, high.level)
        assertTrue(FatigueSignal.HRV_SUSTAINED_SUPPRESSION in high.signals)
        assertTrue(FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION in high.signals)

        assertEquals(FatigueLevel.NONE, FatigueSignalDetector.assess(null, null).level)
    }

    @Test
    fun `hrv weekly average is taken on the ln scale like its normal range`() {
        val history = series(60.0, 4.0, listOf(70.0, 40.0, 75.0, 38.0, 80.0))
        val m = MetricTrendAnalyzer.analyze(history, 100, BaselineSpecs.HRV)
        // Independent derivation: EWMA (alpha 0.25, seeded with the first value) of ln RMSSD over
        // days 70..100, transformed back with exp.
        val byDay = history.associate { it.epochDay to it.value }
        val lnEwma = Ewma.last((70L..100L).map { byDay[it]?.let(::ln) }, 7)!!
        assertEquals(exp(lnEwma), m.ewma7!!, 1e-9)
        // Version 1 averaged raw milliseconds, which is higher than the geometric average for
        // a right-skewed metric and so hid real drops against the (geometric) normal range.
        val rawEwma = Ewma.last((70L..100L).map { byDay[it] }, 7)!!
        assertTrue(m.ewma7!! < rawEwma)
    }

    @Test
    fun `weekly hrv signal needs three readings in the last seven days`() {
        // 30 normal days (days 60..89), three low nights on days 90..92, then nothing until today.
        val normal = (60L..89L).map { DailyValue(it, if (it % 2 == 0L) 64.0 else 56.0) }
        val low = (90L..92L).map { DailyValue(it, 35.0) }
        val stale = MetricTrendAnalyzer.analyze(normal + low, 100, BaselineSpecs.HRV)
        assertEquals(0, stale.validDaysLast7)
        // The carried-forward average is below range, so only the coverage rule keeps it quiet.
        assertTrue(stale.ewma7!! < stale.baseline.lowerNormal!!, "ewma ${stale.ewma7} lower ${stale.baseline.lowerNormal}")
        val quiet = FatigueSignalDetector.assess(stale, null)
        assertFalse(FatigueSignal.HRV_WEEKLY_AVERAGE_BELOW_RANGE in quiet.signals)
        assertEquals(FatigueLevel.NONE, quiet.level)

        // The same three low nights ending today are recent enough to be judged.
        val recent = (68L..97L).map { DailyValue(it, if (it % 2 == 0L) 64.0 else 56.0) } +
            (98L..100L).map { DailyValue(it, 35.0) }
        val fresh = MetricTrendAnalyzer.analyze(recent, 100, BaselineSpecs.HRV)
        assertEquals(7, fresh.validDaysLast7) // 4 normal days (94..97) + 3 low ones
        assertTrue(FatigueSignal.HRV_WEEKLY_AVERAGE_BELOW_RANGE in FatigueSignalDetector.assess(fresh, null).signals)
    }

    @Test
    fun `duplicate readings for a day resolve to the first one everywhere`() {
        val history = series(60.0, 2.0, emptyList()).filter { it.epochDay < 100 } +
            DailyValue(100, 61.0) + DailyValue(100, 90.0)
        val m = MetricTrendAnalyzer.analyze(history, 100, BaselineSpecs.RESTING_HEART_RATE)
        assertEquals(61.0, m.current!!, eps)
        assertEquals(RangeStatus.WITHIN_NORMAL, m.rangeStatus)
    }
}
