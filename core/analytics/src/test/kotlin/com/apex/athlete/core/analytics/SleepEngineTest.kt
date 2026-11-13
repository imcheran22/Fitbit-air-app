package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.sleep.BaseNeedSource
import com.apex.athlete.core.analytics.sleep.NightBalance
import com.apex.athlete.core.analytics.sleep.SleepComponent
import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.sleep.SleepNightInput
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.analytics.sleep.SleepTiming
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SleepEngineTest {

    private val eps = 1e-9
    private val need = SleepNeedCalculator()
    private val score = SleepScoreEngine()

    @Test
    fun `base need defaults to 7h45 until fourteen nights exist`() {
        assertEquals(465.0 to BaseNeedSource.DEFAULT, need.baseNeed(List(13) { 500.0 }))
        assertEquals(500.0 to BaseNeedSource.PERSONAL_HISTORY, need.baseNeed(List(14) { 500.0 }))
    }

    @Test
    fun `personal base need is the 75th percentile kept within seven to nine hours`() {
        val nights = (1..20).map { 400.0 + it * 5 } // 405..500, 75th percentile = 476.25
        assertEquals(476.25, need.baseNeed(nights).first, eps)
        assertEquals(420.0, need.baseNeed(List(20) { 330.0 }).first, eps)
        assertEquals(540.0, need.baseNeed(List(20) { 620.0 }).first, eps)
    }

    @Test
    fun `strain adds two percent of the base per SD above the personal mean`() {
        // Version 2 added 3 minutes per strain point above 10 (12 minutes at strain 14).
        assertEquals(0.0, need.strainSurcharge(null, 465.0), eps)
        assertEquals(0.0, need.strainSurcharge(-0.5, 465.0), eps)
        assertEquals(9.3, need.strainSurcharge(1.0, 465.0), eps)
        assertEquals(18.6, need.strainSurcharge(2.0, 465.0), eps)
    }

    @Test
    fun `debt sums the trailing seven nights and never goes negative`() {
        val short = (93L..99L).map { NightBalance(it, needMinutes = 465.0, asleepMinutes = 405.0) }
        assertEquals(420.0, need.accumulatedDebt(short, asOfDay = 100)!!, eps)
        // A night on the evaluated day or older than the window does not count.
        val extra = short + NightBalance(100, 465.0, 0.0) + NightBalance(92, 465.0, 0.0)
        assertEquals(420.0, need.accumulatedDebt(extra, asOfDay = 100)!!, eps)

        val long = (93L..99L).map { NightBalance(it, 465.0, 600.0) }
        assertEquals(0.0, need.accumulatedDebt(long, asOfDay = 100)!!, eps)

        // One long night repays at most 60 minutes of the other nights' shortfall.
        // (Four recorded nights are needed in version 3; two level nights were added to the original pair.)
        val mixed = listOf(NightBalance(96, 465.0, 465.0), NightBalance(97, 465.0, 465.0), NightBalance(98, 465.0, 345.0), NightBalance(99, 465.0, 700.0))
        assertEquals(60.0, need.accumulatedDebt(mixed, asOfDay = 100)!!, eps)
    }

    @Test
    fun `total need adds surcharges and caps the debt repayment at ninety minutes`() {
        val short = (93L..99L).map { NightBalance(it, 465.0, 405.0) }
        // Strain z of 1 on the 465 minute base adds 9.3 minutes (version 2: 12 minutes for strain 14).
        val n = need.need(emptyList(), precedingDayStrainZ = 1.0, priorNights = short, asOfDay = 100)
        assertEquals(465.0, n.baseMinutes, eps)
        assertEquals(9.3, n.strainSurchargeMinutes, eps)
        assertEquals(420.0, n.accumulatedDebtMinutes!!, eps)
        assertEquals(90.0, n.debtSurchargeMinutes, eps)
        assertEquals(564.3, n.totalMinutes, eps)

        // Three level nights and one 40 minutes short: debt 40, surcharge 20 (one lone night gives no debt in version 3).
        val smallNights = (96L..98L).map { NightBalance(it, 465.0, 465.0) } + NightBalance(99, 465.0, 425.0)
        val small = need.need(emptyList(), null, smallNights, 100)
        assertEquals(20.0, small.debtSurchargeMinutes, eps)
        assertEquals(485.0, small.totalMinutes, eps)
    }

    private val steady = List(7) { SleepTiming(onsetMinuteOfDay = 1380.0, wakeMinuteOfDay = 420.0) }

    @Test
    fun `a long, efficient, well staged and regular night scores one hundred`() {
        val night = SleepNightInput(
            asleepMinutes = 480.0, inBedMinutes = 515.0,
            deepMinutes = 90.0, remMinutes = 110.0, lightMinutes = 280.0,
            wakeBoutsOverThreeMinutes = 2,
        )
        val r = score.evaluate(night, needMinutes = 465.0, recentTimings = steady)
        assertEquals(100.0, r.score, eps)
        assertEquals(100, r.scorePercent)
        assertEquals(200.0 / 480.0, r.restorativeFraction!!, eps)
        assertEquals(0.0, r.onsetStdDevMinutes!!, 1e-6)
        assertTrue(r.sufficientForRecovery)
        assertEquals(0.0, r.deficitMinutes, eps)
    }

    @Test
    fun `short sleep loses duration points in proportion to the shortfall`() {
        val night = SleepNightInput(asleepMinutes = 370.0, inBedMinutes = 400.0, deepMinutes = 70.0, remMinutes = 80.0)
        val r = score.evaluate(night, needMinutes = 470.0, recentTimings = steady)
        val duration = r.contributions.first { it.component == SleepComponent.DURATION }
        assertEquals(100.0 * 370.0 / 470.0, duration.subScore!!, eps)
        assertEquals(100.0, r.deficitMinutes, eps)
        assertFalse(r.sufficientForRecovery)
    }

    @Test
    fun `duration carries 40 percent so a short night can still reach the top bands`() {
        // Characterisation for docs/FORMULAS.md (sleep bands): every other component perfect
        // (restorative 100, efficiency 100, consistency 100), only the duration varies.
        // score = 0.40 * duration + 0.60 * 100, hand-computed.
        fun scoreFor(asleep: Double): Double = score.evaluate(
            SleepNightInput(asleepMinutes = asleep, inBedMinutes = asleep, deepMinutes = 0.20 * asleep, remMinutes = 0.25 * asleep),
            needMinutes = 465.0, recentTimings = steady,
        ).score
        assertEquals(88.0, scoreFor(0.70 * 465.0), eps)  // 5 h 25 min: 28 + 60
        assertEquals(80.0, scoreFor(0.50 * 465.0), eps)  // 3 h 53 min: 20 + 60
        assertEquals(100.0, scoreFor(465.0), eps)
    }

    @Test
    fun `nights without stage data are scored on the remaining components`() {
        val night = SleepNightInput(asleepMinutes = 465.0, inBedMinutes = 500.0)
        val r = score.evaluate(night, needMinutes = 465.0)
        assertNull(r.restorativeFraction)
        assertEquals(1.0, r.contributions.sumOf { it.effectiveWeight }, eps)
        assertEquals(0.40 / 0.60, r.contributions.first { it.component == SleepComponent.DURATION }.effectiveWeight, eps)
        assertFalse(r.contributions.first { it.component == SleepComponent.CONSISTENCY }.available)
        // 93 % efficiency is above the 92 % ceiling, so both remaining components are at 100.
        assertEquals(100.0, r.score, eps)
    }

    @Test
    fun `restorative sub score follows the benchmark with a personal nudge`() {
        assertEquals(50.0, score.restorativeSubScore(0.19, null), eps)
        assertEquals(100.0, score.restorativeSubScore(0.38, null), eps)
        assertEquals(100.0, score.restorativeSubScore(0.50, null), eps)
        assertEquals(95.0, score.restorativeSubScore(0.55, null), 1e-6)
        assertEquals(90.0, score.restorativeSubScore(0.80, null), eps)
        assertEquals(40.0, score.restorativeSubScore(0.19, -2.0), eps)
        assertEquals(40.0, score.restorativeSubScore(0.19, -3.0), eps)
        assertEquals(100.0, score.restorativeSubScore(0.45, 2.0), eps)
    }

    @Test
    fun `efficiency sub score subtracts a penalty for long awakenings`() {
        assertEquals(100.0, score.efficiencySubScore(92.0, null), eps)
        assertEquals(0.0, score.efficiencySubScore(60.0, 0), eps)
        val base = 100.0 * (85.0 - 65.0) / 27.0
        assertEquals(base, score.efficiencySubScore(85.0, 2), eps)
        assertEquals(base - 9.0, score.efficiencySubScore(85.0, 5), eps)
        assertEquals(base - 25.0, score.efficiencySubScore(85.0, 40), eps)
    }

    @Test
    fun `consistency is free up to 45 minutes of spread and zero at 150`() {
        assertEquals(100.0, score.consistencySubScore(45.0), eps)
        assertEquals(50.0, score.consistencySubScore(97.5), eps)
        assertEquals(0.0, score.consistencySubScore(150.0), eps)
        assertEquals(0.0, score.consistencySubScore(400.0), eps)
    }

    @Test
    fun `irregular bedtimes around midnight are measured on the clock face`() {
        // 23:30, 00:30, 23:30, 00:30 … one hour apart across midnight, not 23 hours.
        val timings = List(6) { i ->
            SleepTiming(onsetMinuteOfDay = if (i % 2 == 0) 1410.0 else 30.0, wakeMinuteOfDay = 420.0)
        }
        val night = SleepNightInput(asleepMinutes = 465.0, inBedMinutes = 500.0)
        val r = score.evaluate(night, 465.0, timings)
        assertEquals(32.863353450309965, r.onsetStdDevMinutes!!, 1e-6) // sqrt(6·30² / 5)
        assertEquals(0.0, r.wakeStdDevMinutes!!, 1e-6)
        assertTrue(r.contributions.first { it.component == SleepComponent.CONSISTENCY }.available)
    }

    @Test
    fun `non finite optional sleep values are absent, not zero`() {
        val night = SleepNightInput(
            asleepMinutes = 465.0, inBedMinutes = Double.NaN,
            deepMinutes = Double.NaN, remMinutes = 100.0, lightMinutes = 300.0,
        )
        val timings = steady.take(3) + SleepTiming(Double.NaN, 420.0)
        val r = score.evaluate(night, needMinutes = 465.0, recentTimings = timings, restorativeZ = Double.NaN)
        assertNull(r.restorativeFraction)
        assertNull(r.deepFraction)
        assertNull(r.efficiencyPercent)
        assertEquals(0.0, r.onsetStdDevMinutes!!, 1e-6) // the NaN night is dropped, three valid remain
        assertEquals(100.0, r.score, eps)               // duration 100 and consistency 100
        assertFailsWith<IllegalArgumentException> {
            score.evaluate(night.copy(asleepMinutes = Double.NaN), needMinutes = 465.0)
        }
    }

    @Test
    fun `non finite nights and strain are skipped by the need model`() {
        // The NaN night is not recorded; the other four are (version 3 needs four recorded nights).
        val nights = listOf(NightBalance(95, 465.0, Double.NaN)) + (96L..98L).map { NightBalance(it, 465.0, 465.0) } + NightBalance(99, 465.0, 405.0)
        assertEquals(60.0, need.accumulatedDebt(nights, asOfDay = 100)!!, eps)
        assertEquals(0.0, need.strainSurcharge(Double.NaN, 465.0), eps)
        val n = need.need(emptyList(), Double.NaN, nights, 100)
        assertEquals(465.0 + 30.0, n.totalMinutes, eps)
    }
}
