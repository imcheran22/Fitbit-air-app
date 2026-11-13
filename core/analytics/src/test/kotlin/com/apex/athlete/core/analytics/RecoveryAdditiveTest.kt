package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import com.apex.athlete.core.analytics.recovery.RecoveryCategory
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.analytics.recovery.RecoveryEngine
import com.apex.athlete.core.analytics.recovery.RecoveryInputs
import kotlin.math.exp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Formula version 3, recovery (docs/review/METRICS_ALIGNMENT.md B1 and B6): breathing rate, skin
 * temperature and the workload ratio can only subtract points; a missing one changes nothing.
 */
class RecoveryAdditiveTest {

    private val engine = RecoveryEngine()

    /** logistic(1.2 * 0.4) = 100 / (1 + e^-0.48) = 61.7747..., worked out by hand. */
    private val hrvAtPoint4 = 100.0 / (1.0 + exp(-0.48))

    @Test
    fun `golden vector - HRV z 0_4, RHR z 0, sleep 80 scores 63_57 with or without the penalty-only sensors`() {
        // Hand: (0.40*61.7747 + 0.25*50 + 0.25*80) / (0.40 + 0.25 + 0.25) = 57.2099 / 0.90 = 63.5665
        val expected = (0.40 * hrvAtPoint4 + 0.25 * 50.0 + 0.25 * 80.0) / 0.90
        assertEquals(63.57, expected, 0.005)

        val without = engine.evaluate(RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0))
        val atBaseline = engine.evaluate(
            RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, respiratoryRateZ = 0.0, skinTemperatureZ = 0.0),
        )
        assertEquals(63.57, without.score!!, 0.005)
        assertEquals(63.57, atBaseline.score!!, 0.005)
        assertEquals(without.score!!, atBaseline.score!!, 1e-9)
        assertEquals(RecoveryCategory.MODERATE, atBaseline.category)
        assertEquals(RecoveryCategory.MODERATE, without.category)
    }

    @Test
    fun `golden vector - breathing rate at z 2 takes exactly 2 points off`() {
        // Sub-score 100 - 40*(2 - 1) = 60; penalty = 0.05 * (100 - 60) = 2.0 -> 63.5665 - 2 = 61.5665
        val r = engine.evaluate(
            RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, respiratoryRateZ = 2.0, skinTemperatureZ = 0.0),
        )
        assertEquals(61.57, r.score!!, 0.005)
    }

    @Test
    fun `golden vector - skin temperature and a high workload ratio subtract w times 100 minus S`() {
        val base = (0.40 * hrvAtPoint4 + 0.25 * 50.0 + 0.25 * 80.0) / 0.90
        // Temperature z 3: sub-score 100 - 40*2 = 20, penalty 0.05*80 = 4.0
        val temp = engine.evaluate(RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, skinTemperatureZ = 3.0))
        assertEquals(base - 4.0, temp.score!!, 1e-9)
        // Lowered temperature z -2: sub-score 100 - 20*1 = 80, penalty 0.05*20 = 1.0
        val cold = engine.evaluate(RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, skinTemperatureZ = -2.0))
        assertEquals(base - 1.0, cold.score!!, 1e-9)
        // Workload ratio 2.0: sub-score 0, penalty 0.05*100 = 5.0
        val load = engine.evaluate(RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, acuteChronicRatio = 2.0))
        assertEquals(base - 5.0, load.score!!, 1e-9)
        // A benign ratio of 1.0 no longer lifts the score (it was 68.77 in version 2).
        val benign = engine.evaluate(RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, acuteChronicRatio = 1.0))
        assertEquals(base, benign.score!!, 1e-9)
    }

    @Test
    fun `property - a penalty-only input at its neutral value never changes the score`() {
        val hrvs = listOf<Double?>(null, -1.0, 0.0, 1.5)
        val rhrs = listOf<Double?>(null, -1.0, 2.0)
        val sleeps = listOf<Double?>(null, 40.0, 90.0)
        val fatigue = listOf<Int?>(null, 3, 9)
        for (h in hrvs) for (r in rhrs) for (s in sleeps) for (f in fatigue) {
            if (h == null && r == null) continue
            val base = RecoveryInputs(hrvZ = h, restingHeartRateZ = r, sleepScore = s, subjectiveFatigue = f)
            val reference = engine.evaluate(base).score!!
            // Neutral values: breathing z up to +1, temperature z within +-1, workload ratio up to 1.30.
            for (neutral in listOf(
                base.copy(respiratoryRateZ = 0.0), base.copy(respiratoryRateZ = -3.0), base.copy(respiratoryRateZ = 1.0),
                base.copy(skinTemperatureZ = 0.0), base.copy(skinTemperatureZ = 1.0), base.copy(skinTemperatureZ = -1.0),
                base.copy(acuteChronicRatio = 0.4), base.copy(acuteChronicRatio = 1.3),
                base.copy(respiratoryRateZ = 0.0, skinTemperatureZ = 0.0, acuteChronicRatio = 1.0),
            )) {
                assertEquals(reference, engine.evaluate(neutral).score!!, 1e-9, "inputs $neutral")
            }
        }
    }

    @Test
    fun `property - a penalty-only input can only lower the score and never by more than its weight times 100`() {
        val base = RecoveryInputs(hrvZ = 0.2, restingHeartRateZ = -0.3, sleepScore = 72.0)
        val reference = engine.evaluate(base).score!!
        for (z in listOf(-3.0, -1.0, 0.0, 1.5, 2.0, 3.0)) {
            val b = engine.evaluate(base.copy(respiratoryRateZ = z)).score!!
            val t = engine.evaluate(base.copy(skinTemperatureZ = z)).score!!
            assertTrue(b <= reference + 1e-9 && b >= reference - 5.0 - 1e-9, "breathing z=$z gave $b vs $reference")
            assertTrue(t <= reference + 1e-9 && t >= reference - 5.0 - 1e-9, "temperature z=$z gave $t vs $reference")
        }
        for (ratio in listOf(0.5, 1.3, 1.65, 2.0, 5.0)) {
            val l = engine.evaluate(base.copy(acuteChronicRatio = ratio)).score!!
            assertTrue(l <= reference + 1e-9 && l >= reference - 5.0 - 1e-9, "ratio $ratio gave $l vs $reference")
        }
        // All three at their worst: at most 0.05 * 100 each.
        val worst = engine.evaluate(base.copy(respiratoryRateZ = 10.0, skinTemperatureZ = 10.0, acuteChronicRatio = 9.0)).score!!
        assertEquals(reference - 15.0, worst, 1e-9)
    }

    @Test
    fun `contributions - renormalised weights cover only HRV, RHR, sleep and fatigue and points add up to the score`() {
        val r = engine.evaluate(
            RecoveryInputs(hrvZ = 0.4, restingHeartRateZ = 0.0, sleepScore = 80.0, respiratoryRateZ = 2.0, skinTemperatureZ = 0.0, subjectiveFatigue = 4),
        )
        val core = listOf(RecoveryComponent.HRV, RecoveryComponent.RESTING_HEART_RATE, RecoveryComponent.SLEEP, RecoveryComponent.SUBJECTIVE_FATIGUE)
        assertEquals(1.0, r.contributions.filter { it.component in core }.sumOf { it.effectiveWeight }, 1e-9)
        assertEquals(0.40 / 1.00, r.contributions.first { it.component == RecoveryComponent.HRV }.effectiveWeight, 1e-9)
        val breathing = r.contributions.first { it.component == RecoveryComponent.RESPIRATORY_RATE }
        assertEquals(60.0, breathing.subScore!!, 1e-9)
        assertEquals(-2.0, breathing.points, 1e-9)
        assertEquals(-2.0, breathing.impact, 1e-9)
        assertEquals(r.score!!, r.contributions.sumOf { it.points }, 1e-9)
    }

    @Test
    fun `B6 - a ratio flagged unreliable is not offered to recovery`() {
        // Chronic 6 TRIMP/day, acute 12: ratio 2.0 but LOW_CHRONIC_LOAD is set.
        val loads = (0L..27L).map { DailyLoad(it, if (it >= 21) 12.0 else 6.0) }
        val flagged = TrainingLoadEngine().analyze(loads, 27)
        assertEquals(2.0, flagged.acwrUncoupled!!, 1e-9)
        assertTrue(flagged.caveats.isNotEmpty())
        assertNull(flagged.reliableUncoupledRatio)
        // Without the filter the same ratio would cost recovery the full 5 points.
        val leaked = engine.evaluate(RecoveryInputs(hrvZ = 0.0, restingHeartRateZ = 0.0, sleepScore = 75.0, acuteChronicRatio = flagged.acwrUncoupled))
        val guarded = engine.evaluate(RecoveryInputs(hrvZ = 0.0, restingHeartRateZ = 0.0, sleepScore = 75.0, acuteChronicRatio = flagged.reliableUncoupledRatio))
        // Hand: (0.40*50 + 0.25*50 + 0.25*75) / 0.90 = 51.25 / 0.90 = 56.944
        assertEquals(56.944, guarded.score!!, 0.001)
        assertEquals(guarded.score!! - 5.0, leaked.score!!, 1e-9)

        val steady = TrainingLoadEngine().analyze((0L..40L).map { DailyLoad(it, 50.0) }, 40)
        assertTrue(steady.caveats.isEmpty())
        assertEquals(1.0, assertNotNull(steady.reliableUncoupledRatio), 1e-9)
    }
}
