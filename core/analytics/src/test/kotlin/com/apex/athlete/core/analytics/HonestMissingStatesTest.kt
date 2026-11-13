package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.FatigueSignalDetector
import com.apex.athlete.core.analytics.sleep.NightBalance
import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Formula version 3: honest missing states (docs/review/METRICS_ALIGNMENT.md B7 and B8). */
class HonestMissingStatesTest {

    private val eps = 1e-9
    private val need = SleepNeedCalculator()

    // --- B7: no "no fatigue signals" while the baselines are still calibrating -----------------------------

    @Test
    fun `B7 - day 3 of use with a reading today is not evaluable, and says so instead of none`() {
        // Baseline on 2 of the 7 days needed; a reading exists today, so the card used to show a green "none".
        val history = listOf(DailyValue(98, 60.0), DailyValue(99, 62.0), DailyValue(100, 58.0))
        val hrv = MetricTrendAnalyzer.analyze(history, 100, BaselineSpecs.HRV)
        val rhr = MetricTrendAnalyzer.analyze(history, 100, BaselineSpecs.RESTING_HEART_RATE)
        assertNotNull(hrv.current)
        assertNull(hrv.zScore)
        assertNull(rhr.zScore)
        val a = FatigueSignalDetector.assess(hrv, rhr)
        assertEquals(FatigueLevel.NONE, a.level)
        assertTrue(a.signals.isEmpty())
        assertFalse(a.evaluable)
    }

    @Test
    fun `B7 - nothing at all is not evaluable either`() {
        assertFalse(FatigueSignalDetector.assess(null, null).evaluable)
    }

    @Test
    fun `B7 - an established baseline with a calm reading is a real none`() {
        val base = List(30) { i -> DailyValue(70L + i, 60.0 + if (i % 2 == 0) 4.0 else -4.0) }
        val hrv = MetricTrendAnalyzer.analyze(base + DailyValue(100, 61.0), 100, BaselineSpecs.HRV)
        val a = FatigueSignalDetector.assess(hrv, null)
        assertNotNull(hrv.zScore)
        assertEquals(FatigueLevel.NONE, a.level)
        assertTrue(a.evaluable)
    }

    @Test
    fun `B7 - one marker with a z score is enough to evaluate`() {
        val base = List(30) { i -> DailyValue(70L + i, 55.0 + if (i % 2 == 0) 1.5 else -1.5) }
        val calibrating = MetricTrendAnalyzer.analyze(listOf(DailyValue(100, 55.0)), 100, BaselineSpecs.HRV)
        val rhr = MetricTrendAnalyzer.analyze(base + DailyValue(100, 55.0), 100, BaselineSpecs.RESTING_HEART_RATE)
        assertTrue(FatigueSignalDetector.assess(calibrating, rhr).evaluable)
    }

    // --- B8: sleep debt is null until enough nights exist, and naps are in the bank -------------------------

    private fun nights(days: IntRange, need: Double = 465.0, asleep: Double = 405.0, nap: Double = 0.0) =
        days.map { NightBalance(it.toLong(), need, asleep, nap) }

    @Test
    fun `B8 - no night recorded means no debt figure, not zero debt`() {
        assertNull(need.accumulatedDebt(emptyList(), asOfDay = 100))
        val n = need.need(emptyList(), null, emptyList(), 100)
        assertNull(n.accumulatedDebtMinutes)
        assertEquals(0.0, n.debtSurchargeMinutes, eps)
        assertEquals(465.0, n.totalMinutes, eps)
    }

    @Test
    fun `B8 - fewer than 4 recorded nights in the window give no debt, 4 do`() {
        assertNull(need.accumulatedDebt(nights(97..99), asOfDay = 100))
        // 4 nights, each 60 minutes short.
        assertEquals(240.0, need.accumulatedDebt(nights(96..99), asOfDay = 100)!!, eps)
        // Nights outside the 7-day window do not count towards the 4.
        assertNull(need.accumulatedDebt(nights(90..92) + nights(99..99), asOfDay = 100))
        // A duplicate day is one night, and a night with a non-finite value is not recorded.
        assertNull(need.accumulatedDebt(nights(97..99) + nights(99..99), asOfDay = 100))
        assertNull(need.accumulatedDebt(nights(97..99) + NightBalance(96, 465.0, Double.NaN), asOfDay = 100))
    }

    @Test
    fun `B8 - naps count as sleep in the bank`() {
        // Four nights 60 minutes short, but each day also had a 60 minute nap: no shortfall left.
        assertEquals(0.0, need.accumulatedDebt(nights(96..99, nap = 60.0), asOfDay = 100)!!, eps)
        // A 30 minute nap halves the shortfall.
        assertEquals(120.0, need.accumulatedDebt(nights(96..99, nap = 30.0), asOfDay = 100)!!, eps)
        // The 60 minute surplus cap applies to the night plus its nap: 465 need, 405 + 200 asleep = +140 -> credit 60.
        val mixed = nights(96..98) + NightBalance(99, 465.0, 405.0, napMinutes = 200.0)
        assertEquals(3 * 60.0 - 60.0, need.accumulatedDebt(mixed, asOfDay = 100)!!, eps)
        // A non-finite nap is ignored, it does not remove the night.
        assertEquals(240.0, need.accumulatedDebt(nights(96..99, nap = Double.NaN), asOfDay = 100)!!, eps)
    }

    @Test
    fun `B8 - the debt surcharge only applies once the debt is known`() {
        val four = need.need(emptyList(), null, nights(96..99), 100)
        assertEquals(240.0, four.accumulatedDebtMinutes!!, eps)
        assertEquals(90.0, four.debtSurchargeMinutes, eps) // 50 % of 240 = 120, capped at 90
        assertEquals(465.0 + 90.0, four.totalMinutes, eps)
        val one = need.need(emptyList(), null, nights(99..99), 100)
        assertNull(one.accumulatedDebtMinutes)
        assertEquals(465.0, one.totalMinutes, eps)
    }
}
