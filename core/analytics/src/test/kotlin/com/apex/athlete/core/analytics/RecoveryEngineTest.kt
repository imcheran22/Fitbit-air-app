package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.recovery.RecoveryCategory
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.analytics.recovery.RecoveryEngine
import com.apex.athlete.core.analytics.recovery.RecoveryInputs
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.recovery.TrainingRecommendation
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.exp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RecoveryEngineTest {

    private val engine = RecoveryEngine()
    private val eps = 1e-9

    @Test
    fun `default weights sum to one`() {
        assertEquals(1.0, RecoveryComponent.entries.filter { !it.isOptional }.sumOf { it.nominalWeight }, eps)
    }

    @Test
    fun `everything at baseline with a good night scores in the moderate band`() {
        val r = engine.evaluate(
            RecoveryInputs(hrvZ = 0.0, restingHeartRateZ = 0.0, sleepScore = 80.0, respiratoryRateZ = 0.0, skinTemperatureZ = 0.0),
        )
        assertEquals(RecoveryStatus.SCORED, r.status)
        // 0.40·50 + 0.25·50 + 0.25·80 + 0.05·100 + 0.05·100
        assertEquals(62.5, r.score!!, eps)
        assertEquals(RecoveryCategory.MODERATE, r.category)
        assertEquals(TrainingRecommendation.TRAIN_MODERATE, r.recommendation)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, r.provenance)
        assertTrue(r.missingComponents.isEmpty())
    }

    @Test
    fun `missing skin temperature redistributes its weight instead of capping the score`() {
        val r = engine.evaluate(
            RecoveryInputs(hrvZ = 0.0, restingHeartRateZ = 0.0, sleepScore = 80.0, respiratoryRateZ = 0.0),
        )
        assertEquals(listOf(RecoveryComponent.SKIN_TEMPERATURE), r.missingComponents)
        assertEquals(1.0, r.contributions.sumOf { it.effectiveWeight }, eps)
        assertEquals(0.40 / 0.95, r.contributions.first { it.component == RecoveryComponent.HRV }.effectiveWeight, eps)
        assertEquals((20.0 + 12.5 + 20.0 + 5.0) / 0.95, r.score!!, eps)

        // With every remaining input at its best the score still approaches 100.
        val best = engine.evaluate(
            RecoveryInputs(hrvZ = 3.0, restingHeartRateZ = -3.0, sleepScore = 100.0, respiratoryRateZ = -1.0),
        )
        assertTrue(best.score!! > 95.0, "score was ${best.score}")
        assertEquals(RecoveryCategory.PEAK, best.category)
    }

    @Test
    fun `weights always sum to one for any combination of missing sensors`() {
        val options = listOf<Double?>(null, 0.5)
        for (hrv in options) for (rhr in options) for (sleep in options) for (br in options) for (temp in options) {
            if (hrv == null && rhr == null) continue
            val r = engine.evaluate(
                RecoveryInputs(
                    hrvZ = hrv, restingHeartRateZ = rhr, sleepScore = sleep?.let { 70.0 },
                    respiratoryRateZ = br, skinTemperatureZ = temp, subjectiveFatigue = 4,
                ),
            )
            assertEquals(1.0, r.contributions.sumOf { it.effectiveWeight }, eps)
            assertTrue(r.score!! in 0.0..100.0)
            assertEquals(r.score!!, r.contributions.sumOf { it.points }, eps)
        }
    }

    @Test
    fun `sub scores follow the documented curves`() {
        assertEquals(50.0, engine.hrvSubScore(0.0), eps)
        assertEquals(100.0 / (1 + exp(-1.2)), engine.hrvSubScore(1.0), eps)
        assertEquals(100.0 / (1 + exp(1.2)), engine.restingHeartRateSubScore(1.0), eps)
        // Benefit of a low resting heart rate stops growing at −2 SD.
        assertEquals(engine.restingHeartRateSubScore(-2.0), engine.restingHeartRateSubScore(-3.0), eps)
        assertEquals(100.0, engine.respiratoryRateSubScore(1.0), eps)
        assertEquals(60.0, engine.respiratoryRateSubScore(2.0), eps)
        assertEquals(20.0, engine.respiratoryRateSubScore(3.0), eps)
        assertEquals(60.0, engine.skinTemperatureSubScore(2.0), eps)
        assertEquals(80.0, engine.skinTemperatureSubScore(-2.0), eps)
        assertEquals(100.0, engine.subjectiveFatigueSubScore(1), eps)
        assertEquals(0.0, engine.subjectiveFatigueSubScore(10), eps)
        assertEquals(100.0, engine.trainingLoadSubScore(1.1), eps)
        assertEquals(50.0, engine.trainingLoadSubScore(1.65), 1e-6)
        assertEquals(0.0, engine.trainingLoadSubScore(2.4), eps)
    }

    @Test
    fun `suppressed hrv and raised resting heart rate land in the restorative band`() {
        val r = engine.evaluate(
            RecoveryInputs(hrvZ = -2.0, restingHeartRateZ = 2.0, sleepScore = 55.0, respiratoryRateZ = 2.5, skinTemperatureZ = 2.0),
        )
        assertEquals(RecoveryCategory.RESTORATIVE, r.category)
        assertEquals(TrainingRecommendation.PRIORITIZE_RECOVERY, r.recommendation)
        assertEquals(RecoveryComponent.HRV, r.negativeContributors.first().component)
        assertTrue(r.positiveContributors.isEmpty())
    }

    @Test
    fun `extreme z scores keep the score inside zero to one hundred`() {
        val low = engine.evaluate(RecoveryInputs(hrvZ = -3.0, restingHeartRateZ = 3.0, sleepScore = 0.0, respiratoryRateZ = 3.0, skinTemperatureZ = 3.0))
        val high = engine.evaluate(RecoveryInputs(hrvZ = 3.0, restingHeartRateZ = -3.0, sleepScore = 100.0, respiratoryRateZ = 0.0, skinTemperatureZ = 0.0))
        assertTrue(low.score!! in 0.0..10.0, "low was ${low.score}")
        assertTrue(high.score!! in 90.0..100.0, "high was ${high.score}")
    }

    @Test
    fun `optional fatigue rating joins the weighting without changing the scale`() {
        val base = RecoveryInputs(hrvZ = 0.0, restingHeartRateZ = 0.0, sleepScore = 80.0, respiratoryRateZ = 0.0, skinTemperatureZ = 0.0)
        val tired = engine.evaluate(base.copy(subjectiveFatigue = 9))
        assertEquals(1.0, tired.contributions.sumOf { it.effectiveWeight }, eps)
        assertEquals((62.5 + 0.10 * (100.0 / 9.0)) / 1.10, tired.score!!, eps)
        assertTrue(tired.score!! < engine.evaluate(base).score!!)
    }

    @Test
    fun `no autonomic marker means no score rather than a guess`() {
        val calibrating = engine.evaluate(
            RecoveryInputs(sleepScore = 90.0, autonomicBaselineCalibrating = true, calibrationDaysRemaining = 4),
        )
        assertEquals(RecoveryStatus.CALIBRATING, calibrating.status)
        assertNull(calibrating.score)
        assertEquals(4, calibrating.calibrationDaysRemaining)

        val unavailable = engine.evaluate(RecoveryInputs(sleepScore = 90.0))
        assertEquals(RecoveryStatus.UNAVAILABLE, unavailable.status)
        assertEquals(DataProvenance.UNAVAILABLE, unavailable.provenance)
        assertNull(unavailable.category)
    }

    @Test
    fun `category boundaries sit at 34 and 67`() {
        fun categoryAt(target: Double): RecoveryCategory? {
            // Sleep is the only input, alongside HRV at baseline, so the score is easy to steer.
            val sleep = (target - 0.40 / 0.65 * 50.0) / (0.25 / 0.65)
            return engine.evaluate(RecoveryInputs(hrvZ = 0.0, sleepScore = sleep)).category
        }
        assertEquals(RecoveryCategory.PEAK, categoryAt(67.0))
        assertEquals(RecoveryCategory.MODERATE, categoryAt(66.0))
        assertEquals(RecoveryCategory.MODERATE, categoryAt(34.0))
        assertEquals(RecoveryCategory.RESTORATIVE, categoryAt(33.0))
    }
}
