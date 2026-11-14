package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.sleep.BaseNeedSource
import com.apex.athlete.core.analytics.sleep.NightBalance
import com.apex.athlete.core.analytics.sleep.SleepComponent
import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.sleep.SleepNightInput
import com.apex.athlete.core.analytics.sleep.SleepScoreConfidence
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.analytics.sleep.SleepScoreResult
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

    // ---------------------------------------------------------------------------------------
    // Sleep score (formula version 5). Weights: duration 0.35, restoration 0.25, quality 0.15,
    // efficiency 0.15, consistency 0.10. Every expected value below is worked out by hand.
    // ---------------------------------------------------------------------------------------

    private val steady = List(7) { SleepTiming(onsetMinuteOfDay = 1380.0, wakeMinuteOfDay = 420.0) }

    private fun sub(r: SleepScoreResult, c: SleepComponent) = r.contributions.first { it.component == c }

    /** The owner's reported night: 7 h asleep of 7 h 20 min in bed, deep + REM 40 %, steady bedtimes. */
    private val reportedNight = SleepNightInput(
        asleepMinutes = 420.0, inBedMinutes = 440.0,
        deepMinutes = 75.0, remMinutes = 93.0, lightMinutes = 252.0, // (75 + 93) / 420 = 0.40
        wakeBoutsOverThreeMinutes = 1,
    )

    @Test
    fun `component weights sum to one`() {
        assertEquals(1.0, SleepComponent.entries.sumOf { it.nominalWeight }, eps)
        assertEquals(0.75, SleepComponent.entries.filter { it.isBehavioural }.sumOf { it.nominalWeight }, eps)
        assertEquals(listOf(SleepComponent.RESTORATION), SleepComponent.entries.filter { !it.isBehavioural })
    }

    @Test
    fun `regression - an ordinary seven hour night no longer scores in the nineties`() {
        // Formula version 4 gave this night 0.40·90.3 + 0.25·100 + 0.20·100 + 0.15·100 = 96 (the owner saw 96;
        // the provider's own score was 70). No overnight physiology (baselines calibrating), stage baseline calibrating:
        //   duration     100·(420 − (465 − 225)) / 225 = 100·180/225      = 80
        //   quality      share 0.40 inside the provisional 38–50 % band    = 80
        //   efficiency   420/440 = 95.45 % ≥ 95 %, 1 long awakening (free) = 100
        //   consistency  Sleep Regularity Index 100 (identical nights)     = 100
        //   restoration  unavailable → weights rescaled by 1/0.75
        //   score = (0.35·80 + 0.15·80 + 0.15·100 + 0.10·100) / 0.75 = (28 + 12 + 15 + 10) / 0.75 = 86.667
        val r = score.evaluate(reportedNight, needMinutes = 465.0, regularityIndex = 100.0)
        assertEquals(65.0 / 0.75, r.score, eps)
        assertEquals(87, r.scorePercent)
        assertEquals(80.0, sub(r, SleepComponent.DURATION).subScore!!, eps)
        assertEquals(80.0, sub(r, SleepComponent.QUALITY).subScore!!, eps)
        assertEquals(100.0, sub(r, SleepComponent.EFFICIENCY).subScore!!, eps)
        assertEquals(100.0, sub(r, SleepComponent.CONSISTENCY).subScore!!, eps)
        assertFalse(sub(r, SleepComponent.RESTORATION).available)
        assertNull(r.restorationZ)
        // The missing part is reported, not hidden: the score is flagged as partial.
        assertEquals(0.75, r.availableWeight, eps)
        assertEquals(SleepScoreConfidence.MEDIUM, r.confidence)
        assertEquals(r.score, r.behaviouralScore, eps)
        assertTrue(r.sufficientForRecovery) // 420 ≥ 0.9 · 465 = 418.5
        assertEquals(45.0, r.deficitMinutes, eps)
    }

    @Test
    fun `regression - the same night with a strained body overnight scores seventy five or less`() {
        // Sleeping heart rate 1.5 SD above and HRV 1.5 SD below the personal baselines:
        //   combined z   mean(−(+1.5), −1.5) = −1.5
        //   restoration  80 + 30·(−1.5) = 35
        //   score = 0.35·80 + 0.25·35 + 0.15·80 + 0.15·100 + 0.10·100 = 28 + 8.75 + 12 + 15 + 10 = 73.75
        val r = score.evaluate(reportedNight, needMinutes = 465.0, regularityIndex = 100.0, sleepingHeartRateZ = 1.5, hrvZ = -1.5)
        assertEquals(73.75, r.score, eps)
        assertEquals(-1.5, r.restorationZ!!, eps)
        assertEquals(35.0, sub(r, SleepComponent.RESTORATION).subScore!!, eps)
        assertEquals(0.25, sub(r, SleepComponent.RESTORATION).effectiveWeight, eps)
        assertEquals(1.0, r.availableWeight, eps)
        // Stage baseline still calibrating is not a missing part, so confidence is high.
        assertEquals(SleepScoreConfidence.HIGH, r.confidence)
        // The behavioural score is untouched by physiology: 65 / 0.75.
        assertEquals(65.0 / 0.75, r.behaviouralScore, eps)
    }

    @Test
    fun `the same night at the personal baselines scores eighty five`() {
        // restoration 80 (z = 0), quality 80 (z = 0):
        //   0.35·80 + 0.25·80 + 0.15·80 + 0.15·100 + 0.10·100 = 28 + 20 + 12 + 15 + 10 = 85
        val r = score.evaluate(
            reportedNight, needMinutes = 465.0, restorativeZ = 0.0, regularityIndex = 100.0,
            sleepingHeartRateZ = 0.0, hrvZ = 0.0, respiratoryRateZ = 0.0,
        )
        assertEquals(85.0, r.score, eps)
        assertEquals(SleepScoreConfidence.HIGH, r.confidence)
    }

    @Test
    fun `a typical regularity index keeps an ordinary night in the high seventies`() {
        // SRI 81 (about the UK Biobank median reported by Windred et al. 2024; calibration context only),
        // all z = 0: 0.35·80 + 0.25·80 + 0.15·80 + 0.15·100 + 0.10·81 = 28 + 20 + 12 + 15 + 8.1 = 83.1
        val r = score.evaluate(
            reportedNight, needMinutes = 465.0, restorativeZ = 0.0, regularityIndex = 81.0, sleepingHeartRateZ = 0.0, hrvZ = 0.0,
        )
        assertEquals(83.1, r.score, eps)
        assertEquals(81.0, r.regularityIndex!!, eps)
        // A negative index scores 0, never below: 28 + 20 + 12 + 15 + 0 = 75.
        val irregular = score.evaluate(
            reportedNight, needMinutes = 465.0, restorativeZ = 0.0, regularityIndex = -20.0, sleepingHeartRateZ = 0.0, hrvZ = 0.0,
        )
        assertEquals(75.0, irregular.score, eps)
    }

    @Test
    fun `only a long, calm, deep, continuous and regular night scores one hundred`() {
        val night = SleepNightInput(
            asleepMinutes = 480.0, inBedMinutes = 500.0, // 96 % efficiency
            deepMinutes = 90.0, remMinutes = 110.0, lightMinutes = 280.0,
            wakeBoutsOverThreeMinutes = 2,
        )
        // duration 100 (480 ≥ 465) · restoration 80 + 20·mean(1, 1) = 100 · quality 80 + 10·2 = 100
        // · efficiency 100 · consistency 100.
        val ideal = score.evaluate(
            night, needMinutes = 465.0, recentTimings = steady,
            restorativeZ = 2.0, sleepingHeartRateZ = -1.0, hrvZ = 1.0,
        )
        assertEquals(100.0, ideal.score, eps)
        assertEquals(100, ideal.scorePercent)
        assertEquals(100.0, ideal.behaviouralScore, eps)
        assertEquals(SleepScoreConfidence.HIGH, ideal.confidence)
        assertEquals(200.0 / 480.0, ideal.restorativeFraction!!, eps)
        assertEquals(0.0, ideal.onsetStdDevMinutes!!, 1e-6)
        assertTrue(ideal.sufficientForRecovery)
        assertEquals(0.0, ideal.deficitMinutes, eps)

        // The same night at the personal baselines (all z = 0) is very good, not perfect:
        //   0.35·100 + 0.25·80 + 0.15·80 + 0.15·100 + 0.10·100 = 35 + 20 + 12 + 15 + 10 = 92
        val usual = score.evaluate(night, needMinutes = 465.0, recentTimings = steady, restorativeZ = 0.0, sleepingHeartRateZ = 0.0, hrvZ = 0.0)
        assertEquals(92.0, usual.score, eps)

        // In the first week (no baselines at all) the stage part is capped at 80 and restoration
        // is missing: (0.35·100 + 0.15·80 + 0.15·100 + 0.10·100) / 0.75 = 72 / 0.75 = 96, flagged partial.
        val firstWeek = score.evaluate(night, needMinutes = 465.0, recentTimings = steady)
        assertEquals(96.0, firstWeek.score, eps)
        assertEquals(SleepScoreConfidence.MEDIUM, firstWeek.confidence)
    }

    @Test
    fun `a short night lands between fifty five and seventy even when everything else is usual`() {
        // 5 h 15 min asleep of 5 h 50 min in bed (90 %), need 465, all z = 0, steady bedtimes:
        //   duration    100·(315 − 240)/225 = 33.333
        //   efficiency  75 + 25·(90 − 85)/10 = 87.5
        //   score = 0.35·33.333 + 0.25·80 + 0.15·80 + 0.15·87.5 + 0.10·100
        //         = 11.6667 + 20 + 12 + 13.125 + 10 = 66.7917
        val night = SleepNightInput(asleepMinutes = 315.0, inBedMinutes = 350.0, deepMinutes = 56.0, remMinutes = 70.0)
        val r = score.evaluate(night, needMinutes = 465.0, recentTimings = steady, restorativeZ = 0.0, sleepingHeartRateZ = 0.0, hrvZ = 0.0)
        assertEquals(0.35 * (100.0 * 75.0 / 225.0) + 20.0 + 12.0 + 13.125 + 10.0, r.score, eps)
        assertEquals(66.79166666666667, r.score, 1e-9)
        assertFalse(r.sufficientForRecovery)
        assertEquals(150.0, r.deficitMinutes, eps)
    }

    @Test
    fun `duration carries 35 percent and a very short night can no longer reach the top band`() {
        // Characterisation for docs/FORMULAS.md (sleep bands): every other part at 100 (restoration z +1, quality z +2,
        // efficiency 100 %, regularity 100), only the duration varies: score = 0.35·duration + 65, hand-computed.
        fun scoreFor(asleep: Double): Double = score.evaluate(
            SleepNightInput(asleepMinutes = asleep, inBedMinutes = asleep, deepMinutes = 0.20 * asleep, remMinutes = 0.25 * asleep),
            needMinutes = 465.0, restorativeZ = 2.0, regularityIndex = 100.0, sleepingHeartRateZ = -1.0, hrvZ = 1.0,
        ).score
        assertEquals(0.35 * 100.0 * (325.5 - 240.0) / 225.0 + 65.0, scoreFor(325.5), eps) // 70 % of need: 78.3 (version 4: 88)
        assertEquals(65.0, scoreFor(232.5), eps)                                            // 50 % of need (version 4: 80)
        assertEquals(100.0, scoreFor(465.0), eps)
    }

    @Test
    fun `duration falls linearly from the target to zero at 225 minutes short`() {
        assertEquals(100.0, score.durationSubScore(465.0, 465.0), eps)
        assertEquals(100.0, score.durationSubScore(600.0, 465.0), eps)
        assertEquals(80.0, score.durationSubScore(420.0, 465.0), eps)             // 180 / 225
        assertEquals(100.0 * 120.0 / 225.0, score.durationSubScore(360.0, 465.0), eps) // 6 h → 53.3
        assertEquals(0.0, score.durationSubScore(240.0, 465.0), eps)
        assertEquals(0.0, score.durationSubScore(120.0, 465.0), eps)

        // A larger need (strain or debt surcharge) moves the whole ramp with it.
        val night = SleepNightInput(asleepMinutes = 370.0, inBedMinutes = 400.0, deepMinutes = 70.0, remMinutes = 80.0)
        val r = score.evaluate(night, needMinutes = 470.0, recentTimings = steady)
        assertEquals(100.0 * (370.0 - 245.0) / 225.0, sub(r, SleepComponent.DURATION).subScore!!, eps) // 55.56
        assertEquals(470.0, r.durationTargetMinutes, eps)
        assertEquals(100.0, r.deficitMinutes, eps)
        assertFalse(r.sufficientForRecovery)

        // More sleep never lowers the duration part.
        var previous = -1.0
        for (asleep in 0..720 step 5) {
            val s = score.durationSubScore(asleep.toDouble(), 465.0)
            assertTrue(s >= previous && s in 0.0..100.0)
            previous = s
        }
    }

    @Test
    fun `the duration target never drops below the seven hour guideline`() {
        // A personal need under 7 h cannot earn full marks for less than 7 h asleep (Watson 2015).
        assertEquals(420.0, score.durationTarget(400.0), eps)
        assertEquals(100.0 * (400.0 - 195.0) / 225.0, score.durationSubScore(400.0, 400.0), eps) // 91.1
        assertEquals(100.0, score.durationSubScore(420.0, 400.0), eps)
        assertEquals(465.0, score.durationTarget(465.0), eps)
    }

    @Test
    fun `restoration follows overnight heart rate and hrv against the personal baselines`() {
        // At baseline → 80. One SD calmer (heart rate lower, HRV higher) → 100, and no more than 100.
        assertEquals(80.0, score.restorationSubScore(0.0, 0.0)!!, eps)
        assertEquals(100.0, score.restorationSubScore(-1.0, 1.0)!!, eps)
        assertEquals(90.0, score.restorationSubScore(-0.5, 0.5)!!, eps)
        assertEquals(100.0, score.restorationSubScore(-3.0, 3.0)!!, eps)
        // More strained than usual: 30 points per SD.
        assertEquals(50.0, score.restorationSubScore(1.0, -1.0)!!, eps)
        assertEquals(35.0, score.restorationSubScore(1.5, -1.5)!!, eps)
        assertEquals(20.0, score.restorationSubScore(2.0, -2.0)!!, eps)
        assertEquals(0.0, score.restorationSubScore(3.0, -3.0)!!, eps) // 80 − 90 → floor 0
        // One signal alone carries the part.
        assertEquals(50.0, score.restorationSubScore(null, -1.0)!!, eps)
        assertEquals(20.0, score.restorationSubScore(2.0, null)!!, eps)
        // Signals that disagree cancel: mean(−(−2), −2) = 0.
        assertEquals(80.0, score.restorationSubScore(-2.0, -2.0)!!, eps)
        // Inputs beyond ±3 SD are limited to ±3 before averaging: mean(−3, 0) = −1.5.
        assertEquals(35.0, score.restorationSubScore(9.0, 0.0)!!, eps)
        assertEquals(-1.5, score.restorationZ(9.0, 0.0, null)!!, eps)
    }

    @Test
    fun `a raised breathing rate only ever takes restoration points away`() {
        // Up to +1 SD it changes nothing; beyond that 0.5 combined-z per SD.
        assertEquals(80.0, score.restorationSubScore(0.0, 0.0, 1.0)!!, eps)
        assertEquals(65.0, score.restorationSubScore(0.0, 0.0, 2.0)!!, eps) // z = −0.5 → 80 − 15
        assertEquals(50.0, score.restorationSubScore(0.0, 0.0, 3.0)!!, eps) // z = −1.0 → 80 − 30
        assertEquals(80.0, score.restorationSubScore(-1.0, 1.0, 3.0)!!, eps) // z = 1 − 1 = 0
        // A lower breathing rate than usual earns nothing.
        assertEquals(80.0, score.restorationSubScore(0.0, 0.0, -3.0)!!, eps)
        assertEquals(100.0, score.restorationSubScore(-1.0, 1.0, -3.0)!!, eps)
    }

    @Test
    fun `restoration is missing without heart rate or hrv, never assumed typical`() {
        assertNull(score.restorationSubScore(null, null, null))
        // Breathing rate alone cannot stand in for the part.
        assertNull(score.restorationSubScore(null, null, 0.2))
        assertNull(score.restorationSubScore(null, null, 3.0))
        assertNull(score.restorationSubScore(Double.NaN, null, null))

        val r = score.evaluate(reportedNight, 465.0, steady, respiratoryRateZ = 2.5)
        assertFalse(sub(r, SleepComponent.RESTORATION).available)
        assertNull(sub(r, SleepComponent.RESTORATION).subScore)
        assertEquals(0.0, sub(r, SleepComponent.RESTORATION).points, eps)
        assertEquals(0.75, r.availableWeight, eps)
    }

    @Test
    fun `restoration never rewards a worse reading`() {
        val grid = listOf(-3.0, -2.0, -1.2, -1.0, -0.5, 0.0, 0.5, 1.0, 1.2, 2.0, 3.0)
        val optional = listOf<Double?>(null) + grid
        for (hr in optional) for (hrv in optional) {
            if (hr == null && hrv == null) continue
            // Faster breathing never raises the part, whatever heart rate and HRV say.
            var previous = score.restorationSubScore(hr, hrv, null)!!
            for (rr in grid) {
                val s = score.restorationSubScore(hr, hrv, rr)!!
                assertTrue(s <= previous + eps, "hr=$hr hrv=$hrv rr=$rr: $s > $previous")
                assertTrue(s in 0.0..100.0)
                previous = s
            }
        }
        for (rr in optional) for (fixed in grid) {
            // A faster sleeping heart rate never raises it; a higher HRV never lowers it.
            val byHr = grid.map { score.restorationSubScore(it, fixed, rr)!! }
            assertEquals(byHr.sortedDescending(), byHr, "hrv=$fixed rr=$rr")
            val byHrv = grid.map { score.restorationSubScore(fixed, it, rr)!! }
            assertEquals(byHrv.sorted(), byHrv, "hr=$fixed rr=$rr")
        }
    }

    @Test
    fun `stage quality is scored against the personal usual once a baseline exists`() {
        // 80 at the user's own usual share, ±10 per SD; the absolute share plays no part.
        assertEquals(80.0, score.qualitySubScore(0.19, 0.0), eps)
        assertEquals(80.0, score.qualitySubScore(0.45, 0.0), eps)
        assertEquals(90.0, score.qualitySubScore(0.45, 1.0), eps)
        assertEquals(100.0, score.qualitySubScore(0.45, 2.0), eps)
        assertEquals(100.0, score.qualitySubScore(0.45, 3.0), eps)
        assertEquals(65.0, score.qualitySubScore(0.45, -1.5), eps)
        assertEquals(50.0, score.qualitySubScore(0.45, -3.0), eps)
    }

    @Test
    fun `stage quality uses a provisional band capped at eighty while calibrating`() {
        assertEquals(40.0, score.qualitySubScore(0.19, null), eps)  // 80 · 0.19 / 0.38
        assertEquals(80.0, score.qualitySubScore(0.38, null), eps)
        assertEquals(80.0, score.qualitySubScore(0.44, null), eps)
        assertEquals(80.0, score.qualitySubScore(0.50, null), eps)
        assertEquals(75.0, score.qualitySubScore(0.55, null), 1e-6) // 1 point per percentage point above
        assertEquals(70.0, score.qualitySubScore(0.80, null), eps)  // at most 10 points
        // No share can score above 80 without a personal baseline.
        for (share in 0..100) assertTrue(score.qualitySubScore(share / 100.0, null) <= 80.0 + eps)
    }

    @Test
    fun `nights without usable stage data leave the quality part out`() {
        // Movement-only ("classic") night, no timing history, no physiology:
        //   duration 100 · efficiency 465/500 = 93 % → 75 + 25·(93 − 85)/10 = 95
        //   score = (0.35·100 + 0.15·95) / 0.50 = 49.25 / 0.50 = 98.5, on half the weight → low confidence
        val classic = score.evaluate(SleepNightInput(asleepMinutes = 465.0, inBedMinutes = 500.0), needMinutes = 465.0)
        assertNull(classic.restorativeFraction)
        assertFalse(sub(classic, SleepComponent.QUALITY).available)
        assertFalse(sub(classic, SleepComponent.CONSISTENCY).available)
        assertFalse(sub(classic, SleepComponent.RESTORATION).available)
        assertEquals(1.0, classic.contributions.sumOf { it.effectiveWeight }, eps)
        assertEquals(0.35 / 0.50, sub(classic, SleepComponent.DURATION).effectiveWeight, eps)
        assertEquals(98.5, classic.score, eps)
        assertEquals(0.50, classic.availableWeight, eps)
        assertEquals(SleepScoreConfidence.LOW, classic.confidence)

        // A "staged" night with neither deep nor REM is a staging failure, not zero restorative
        // sleep: the part is left out instead of scoring 0, even if a z-score is supplied.
        val lightOnly = score.evaluate(
            SleepNightInput(asleepMinutes = 465.0, inBedMinutes = 500.0, deepMinutes = 0.0, remMinutes = 0.0, lightMinutes = 465.0),
            needMinutes = 465.0, restorativeZ = -3.0,
        )
        assertFalse(sub(lightOnly, SleepComponent.QUALITY).available)
        assertEquals(98.5, lightOnly.score, eps)
        assertEquals(0.0, lightOnly.restorativeFraction!!, eps) // the reading itself is still reported
    }

    @Test
    fun `efficiency is piecewise linear with a penalty for long awakenings`() {
        assertEquals(0.0, score.efficiencySubScore(60.0, 0), eps)
        assertEquals(0.0, score.efficiencySubScore(65.0, null), eps)
        assertEquals(37.5, score.efficiencySubScore(75.0, null), eps)  // 75 · 10/20
        assertEquals(75.0, score.efficiencySubScore(85.0, null), eps)
        assertEquals(87.5, score.efficiencySubScore(90.0, null), eps)  // 75 + 25 · 5/10
        assertEquals(92.5, score.efficiencySubScore(92.0, null), eps)  // version 4 gave 100 here
        assertEquals(100.0, score.efficiencySubScore(95.0, null), eps)
        assertEquals(100.0, score.efficiencySubScore(99.0, null), eps)
        // Two long awakenings are free, then 3 points each, at most 25.
        assertEquals(75.0, score.efficiencySubScore(85.0, 2), eps)
        assertEquals(66.0, score.efficiencySubScore(85.0, 5), eps)
        assertEquals(50.0, score.efficiencySubScore(85.0, 40), eps)
        assertEquals(0.0, score.efficiencySubScore(70.0, 40), eps)     // 18.75 − 25 → floor 0
    }

    @Test
    fun `fallback consistency is free up to 45 minutes of spread and zero at 150`() {
        // Only for direct callers without a regularity index; the pipeline switches this path off.
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
        assertTrue(sub(r, SleepComponent.CONSISTENCY).available)
    }

    @Test
    fun `confidence reports how much of the weight was backed by data`() {
        val staged = SleepNightInput(asleepMinutes = 450.0, inBedMinutes = 490.0, deepMinutes = 80.0, remMinutes = 100.0)
        val classic = SleepNightInput(asleepMinutes = 450.0, inBedMinutes = 490.0)

        fun check(expectedWeight: Double, expected: SleepScoreConfidence, r: SleepScoreResult) {
            assertEquals(expectedWeight, r.availableWeight, eps)
            assertEquals(expected, r.confidence)
        }
        // Everything present.
        check(1.00, SleepScoreConfidence.HIGH, score.evaluate(staged, 465.0, regularityIndex = 80.0, sleepingHeartRateZ = 0.0, hrvZ = 0.0))
        // No regularity index (0.90), or a classic night with physiology (0.85): still high.
        check(0.90, SleepScoreConfidence.HIGH, score.evaluate(staged, 465.0, hrvZ = 0.0))
        check(0.85, SleepScoreConfidence.HIGH, score.evaluate(classic, 465.0, regularityIndex = 80.0, hrvZ = 0.0))
        // No overnight physiology: a partial score.
        check(0.75, SleepScoreConfidence.MEDIUM, score.evaluate(staged, 465.0, regularityIndex = 80.0))
        check(0.65, SleepScoreConfidence.MEDIUM, score.evaluate(staged, 465.0))
        check(0.60, SleepScoreConfidence.MEDIUM, score.evaluate(classic, 465.0, regularityIndex = 80.0))
        // Duration and efficiency only.
        check(0.50, SleepScoreConfidence.LOW, score.evaluate(classic, 465.0))
        // No time in bed either: duration alone.
        check(0.35, SleepScoreConfidence.LOW, score.evaluate(SleepNightInput(asleepMinutes = 450.0, inBedMinutes = 0.0), 465.0))
    }

    @Test
    fun `weights sum to one and points add up for any combination of missing parts`() {
        val options = listOf<Double?>(null, -1.0)
        for (stages in listOf(true, false)) for (index in listOf<Double?>(85.0, null)) for (inBed in listOf(480.0, 0.0))
            for (hr in options) for (hrv in options) for (rr in options) for (stageZ in options) {
                val night = SleepNightInput(
                    asleepMinutes = 400.0, inBedMinutes = inBed,
                    deepMinutes = if (stages) 60.0 else null, remMinutes = if (stages) 80.0 else null,
                )
                val r = score.evaluate(
                    night, 465.0, restorativeZ = stageZ, regularityIndex = index,
                    sleepingHeartRateZ = hr, hrvZ = hrv, respiratoryRateZ = rr,
                )
                assertEquals(1.0, r.contributions.sumOf { it.effectiveWeight }, eps)
                assertEquals(r.score, r.contributions.sumOf { it.points }, eps)
                assertTrue(r.score in 0.0..100.0 && r.behaviouralScore in 0.0..100.0)
                assertEquals(r.contributions.filter { it.available }.sumOf { it.component.nominalWeight }, r.availableWeight, eps)
                // Unavailable parts carry no sub-score, weight or points: nothing is filled in.
                for (c in r.contributions.filter { !it.available }) {
                    assertNull(c.subScore)
                    assertEquals(0.0, c.effectiveWeight, eps)
                    assertEquals(0.0, c.points, eps)
                }
            }
    }

    @Test
    fun `the behavioural score leaves the physiological part out`() {
        // Duration 80, quality 80 (z = 0), efficiency 100, consistency 100 → (28 + 12 + 15 + 10) / 0.75.
        val expected = 65.0 / 0.75
        val results = listOf(
            score.evaluate(reportedNight, 465.0, restorativeZ = 0.0, regularityIndex = 100.0),
            score.evaluate(reportedNight, 465.0, restorativeZ = 0.0, regularityIndex = 100.0, sleepingHeartRateZ = 3.0, hrvZ = -3.0, respiratoryRateZ = 3.0),
            score.evaluate(reportedNight, 465.0, restorativeZ = 0.0, regularityIndex = 100.0, sleepingHeartRateZ = -3.0, hrvZ = 3.0),
        )
        for (r in results) assertEquals(expected, r.behaviouralScore, eps)
        // The full score does move with physiology: worst 0.75·86.67 + 0.25·0 = 65, best 65 + 0.25·100 = 90.
        assertEquals(65.0, results[1].score, eps)
        assertEquals(90.0, results[2].score, eps)
        // With every part present: score = 0.75 · behavioural + 0.25 · restoration.
        for (r in results.drop(1)) {
            val restoration = sub(r, SleepComponent.RESTORATION).subScore!!
            assertEquals(0.75 * r.behaviouralScore + 0.25 * restoration, r.score, eps)
        }
    }

    @Test
    fun `nothing scores on the provider reported time to fall asleep`() {
        // Owner decision D17: latency is shown as reported; the score input has no field for it.
        val fields = SleepNightInput::class.java.declaredFields.map { it.name.lowercase() }
        assertTrue(fields.none { "latency" in it || "fallasleep" in it || "onsetdelay" in it }, fields.toString())
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
