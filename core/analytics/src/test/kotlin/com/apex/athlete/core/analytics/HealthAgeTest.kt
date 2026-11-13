package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.fitness.FitnessAge
import com.apex.athlete.core.analytics.healthage.ContributionDirection
import com.apex.athlete.core.analytics.healthage.FactorInput
import com.apex.athlete.core.analytics.healthage.HealthAge
import com.apex.athlete.core.analytics.healthage.HealthAgeConfidence
import com.apex.athlete.core.analytics.healthage.HealthAgeFactor
import com.apex.athlete.core.analytics.healthage.HealthAgeInput
import com.apex.athlete.core.analytics.healthage.HealthAgeNoDataReason
import com.apex.athlete.core.analytics.healthage.HealthAgeResult
import com.apex.athlete.core.analytics.healthage.NotEnoughDataReason
import com.apex.athlete.core.analytics.healthage.WithheldReason
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.domain.DataProvenance
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Hand-computed expectations. FRIEND male medians at 25/35/45/.../75: 48.0 42.4 37.8 32.6 28.2 24.4 (see Vo2CategoryTest).
 * Constants under test are calibration choices (docs/FORMULAS.md, P8), so these tests pin the arithmetic, not a clinical truth.
 */
class HealthAgeTest {
    private fun d(v: Double, days: Int = 14) = FactorInput(v, days)
    private fun estimate(i: HealthAgeInput) = assertIs<HealthAgeResult.Estimate>(HealthAge.estimate(i))
    private fun HealthAgeResult.Estimate.years(f: HealthAgeFactor) = contributions.single { it.factor == f }.years
    private fun HealthAgeResult.Estimate.withheldReason(f: HealthAgeFactor) = withheld.single { it.factor == f }.reason

    // Hand, age 40 male:
    //  VO2 37.8 -> fitness age 45, diff +5, x0.25 = +1.25
    //  RHR 55 -> (55-65)/10*1 = -1.0
    //  sleep 360 min = 6 h -> (7-6)*0.65 = +0.65
    //  SRI 85 -> (75-85)/10*1 = -1.0
    //  steps 10,000 -> -(10000-7000)/1000*0.5 = -1.5 (exactly the floor, not capped)
    //  BMI 30 -> (30-25)*0.5 = +2.5
    //  sum = 1.25 - 1 + 0.65 - 1 - 1.5 + 2.5 = 0.9 -> 40.9
    private val full = HealthAgeInput(
        chronologicalAgeYears = 40, sex = Sex.MALE,
        vo2Max = d(37.8, 3), restingHeartRateBpm = d(55.0), sleepDurationMinutes = d(360.0),
        sleepRegularityIndex = d(85.0), dailySteps = d(10_000.0), bmi = d(30.0, 1),
    )

    @Test
    fun `full input hand computed`() {
        val r = estimate(full)
        assertEquals(1.25, r.years(HealthAgeFactor.VO2_MAX), 1e-9)
        assertEquals(-1.0, r.years(HealthAgeFactor.RESTING_HEART_RATE), 1e-9)
        assertEquals(0.65, r.years(HealthAgeFactor.SLEEP_DURATION), 1e-9)
        assertEquals(-1.0, r.years(HealthAgeFactor.SLEEP_REGULARITY), 1e-9)
        assertEquals(-1.5, r.years(HealthAgeFactor.DAILY_STEPS), 1e-9)
        assertEquals(2.5, r.years(HealthAgeFactor.BMI), 1e-9)
        assertEquals(0.9, r.deltaYears, 1e-9)
        assertEquals(40.9, r.estimatedAgeYears, 1e-9)
        assertEquals(40, r.chronologicalAgeYears)
        assertFalse(r.totalCapped)
        assertTrue(r.contributions.none { it.capped })
        assertEquals(HealthAgeConfidence.HIGH, r.confidence)
        assertEquals(DataProvenance.ESTIMATED, r.provenance)
        assertEquals(ContributionDirection.OLDER, r.contributions.single { it.factor == HealthAgeFactor.BMI }.direction)
        assertEquals(ContributionDirection.YOUNGER, r.contributions.single { it.factor == HealthAgeFactor.DAILY_STEPS }.direction)
        // HRV was not supplied: withheld as missing, never assumed.
        assertEquals(WithheldReason.MISSING, r.withheldReason(HealthAgeFactor.HRV))
    }

    @Test
    fun `reference values give a neutral contribution`() {
        val r = estimate(
            HealthAgeInput(
                50, restingHeartRateBpm = d(65.0), sleepDurationMinutes = d(480.0),
                sleepRegularityIndex = d(75.0), dailySteps = d(7000.0), bmi = d(22.0, 1),
            ),
        )
        assertTrue(r.contributions.all { it.direction == ContributionDirection.NEUTRAL && it.years == 0.0 })
        assertEquals(50.0, r.estimatedAgeYears, 1e-9)
    }

    // ---- per-factor formulas and caps ----

    @Test
    fun `resting heart rate formula and cap`() {
        assertEquals(1.5, HealthAge.restingHeartRateYears(80.0).first, 1e-9)       // (80-65)/10
        assertEquals(-2.5, HealthAge.restingHeartRateYears(40.0).first, 1e-9)
        assertEquals(3.0, HealthAge.restingHeartRateYears(120.0).first, 1e-9)      // raw 5.5
        assertEquals(5.5, HealthAge.restingHeartRateYears(120.0).second, 1e-9)
        assertEquals(-3.0, HealthAge.restingHeartRateYears(30.0).first, 1e-9)      // raw -3.5
    }

    @Test
    fun `sleep duration is U shaped with separate caps`() {
        assertEquals(0.0, HealthAge.sleepDurationYears(7.0).first, 1e-9)
        assertEquals(0.0, HealthAge.sleepDurationYears(9.0).first, 1e-9)
        assertEquals(1.3, HealthAge.sleepDurationYears(5.0).first, 1e-9)           // 2 h short x 0.65
        assertEquals(2.0, HealthAge.sleepDurationYears(3.0).first, 1e-9)           // raw 2.6, short cap 2
        assertEquals(1.5, HealthAge.sleepDurationYears(10.5).first, 1e-9)          // 1.5 h long x 1.0
        assertEquals(3.0, HealthAge.sleepDurationYears(13.0).first, 1e-9)          // raw 4, cap 3
    }

    @Test
    fun `sleep regularity formula and cap`() {
        assertEquals(1.5, HealthAge.sleepRegularityYears(60.0).first, 1e-9)
        assertEquals(-2.5, HealthAge.sleepRegularityYears(100.0).first, 1e-9)      // raw -2.5 exactly
        assertEquals(2.5, HealthAge.sleepRegularityYears(-40.0).first, 1e-9)       // raw 11.5
    }

    @Test
    fun `steps formula is asymmetric and capped`() {
        assertEquals(2.25, HealthAge.stepsYears(4000.0).first, 1e-9)               // 3 x 0.75
        assertEquals(3.0, HealthAge.stepsYears(500.0).first, 1e-9)                 // raw 4.875
        assertEquals(-0.5, HealthAge.stepsYears(8000.0).first, 1e-9)
        assertEquals(-1.5, HealthAge.stepsYears(20_000.0).first, 1e-9)             // raw -6.5
        assertEquals(0.0, HealthAge.stepsYears(7000.0).first, 1e-9)
    }

    @Test
    fun `bmi only adds years above 25 and is capped`() {
        assertEquals(0.0, HealthAge.bmiYears(17.0).first, 1e-9)                    // underweight side not modelled
        assertEquals(0.0, HealthAge.bmiYears(25.0).first, 1e-9)
        assertEquals(1.25, HealthAge.bmiYears(27.5).first, 1e-9)
        assertEquals(4.0, HealthAge.bmiYears(45.0).first, 1e-9)                    // raw 10
    }

    // ---- total cap ----

    // Age 40 male, everything adverse. VO2 20.0 -> clamped fitness age 75, diff +35, x0.25 = 8.75 -> cap 5; RHR 120 -> 3;
    // sleep 13 h -> 3; SRI 20 -> raw 5.5 -> 2.5; steps 500 -> 3; BMI 45 -> 4. Sum 20.5 -> total cap +10.
    @Test
    fun `total is capped at plus 10`() {
        val r = estimate(
            HealthAgeInput(
                40, Sex.MALE, vo2Max = d(20.0, 1), restingHeartRateBpm = d(120.0), sleepDurationMinutes = d(780.0),
                sleepRegularityIndex = d(20.0), dailySteps = d(500.0), bmi = d(45.0, 1),
            ),
        )
        assertEquals(5.0, r.years(HealthAgeFactor.VO2_MAX), 1e-9)
        assertEquals(20.5, r.uncappedDeltaYears, 1e-9)
        assertEquals(10.0, r.deltaYears, 1e-9)
        assertEquals(50.0, r.estimatedAgeYears, 1e-9)
        assertTrue(r.totalCapped)
        assertTrue(r.contributions.single { it.factor == HealthAgeFactor.VO2_MAX }.capped)
        assertEquals(8.75, r.contributions.single { it.factor == HealthAgeFactor.VO2_MAX }.uncappedYears, 1e-9)
    }

    // Age 79 male VO2 55 -> fitness age 25, diff -54 -> -13.5 -> -5; RHR 30 -> -3; SRI 100 -> -2.5; steps 20,000 -> -1.5. Sum -12 -> -10.
    @Test
    fun `total is capped at minus 10`() {
        val r = estimate(
            HealthAgeInput(
                79, Sex.MALE, vo2Max = d(55.0, 1), restingHeartRateBpm = d(30.0),
                sleepRegularityIndex = d(100.0), dailySteps = d(20_000.0),
            ),
        )
        assertEquals(-12.0, r.uncappedDeltaYears, 1e-9)
        assertEquals(-10.0, r.deltaYears, 1e-9)
        assertEquals(69.0, r.estimatedAgeYears, 1e-9)
        assertTrue(r.totalCapped)
    }

    // ---- gating ----

    @Test
    fun `age is required and bounded`() {
        assertEquals(HealthAgeResult.NoData(HealthAgeNoDataReason.NO_AGE), HealthAge.estimate(full.copy(chronologicalAgeYears = null)))
        assertEquals(HealthAgeResult.NoData(HealthAgeNoDataReason.AGE_OUT_OF_RANGE), HealthAge.estimate(full.copy(chronologicalAgeYears = 17)))
        assertEquals(HealthAgeResult.NoData(HealthAgeNoDataReason.AGE_OUT_OF_RANGE), HealthAge.estimate(full.copy(chronologicalAgeYears = 101)))
    }

    private fun threeDaySeries() = HealthAgeInput(
        45, restingHeartRateBpm = d(65.0), sleepDurationMinutes = d(420.0), dailySteps = d(7000.0),
    )

    @Test
    fun `three day-series factors with 14 days are enough without VO2 max`() {
        val r = estimate(threeDaySeries())
        assertEquals(3, r.contributions.size)
        assertEquals(HealthAgeConfidence.LOW, r.confidence)
    }

    @Test
    fun `two day-series factors are not enough`() {
        val r = assertIs<HealthAgeResult.NotEnoughData>(HealthAge.estimate(threeDaySeries().copy(dailySteps = null)))
        assertEquals(listOf(NotEnoughDataReason.NEED_VO2_MAX_OR_THREE_FACTORS), r.reasons)
        assertEquals(2, r.scoredDaySeriesFactors)
        assertEquals(WithheldReason.MISSING, r.withheld.single { it.factor == HealthAgeFactor.DAILY_STEPS }.reason)
    }

    @Test
    fun `13 days is insufficient and 14 days is enough`() {
        val short = HealthAge.estimate(threeDaySeries().copy(dailySteps = d(7000.0, 13)))
        val r = assertIs<HealthAgeResult.NotEnoughData>(short)
        assertEquals(WithheldReason.INSUFFICIENT_DAYS, r.withheld.single { it.factor == HealthAgeFactor.DAILY_STEPS }.reason)
        assertIs<HealthAgeResult.Estimate>(HealthAge.estimate(threeDaySeries().copy(dailySteps = d(7000.0, 14))))
    }

    @Test
    fun `bmi does not unlock the estimate on its own`() {
        val i = threeDaySeries().copy(dailySteps = null, bmi = d(24.0, 1))
        assertIs<HealthAgeResult.NotEnoughData>(HealthAge.estimate(i))
    }

    @Test
    fun `vo2 max alone is enough but low confidence`() {
        val r = estimate(HealthAgeInput(40, Sex.MALE, vo2Max = d(37.8, 1)))
        assertEquals(1, r.contributions.size)
        assertEquals(1.25, r.deltaYears, 1e-9)
        assertEquals(HealthAgeConfidence.LOW, r.confidence)
        // Everything else is listed as withheld, none imputed.
        assertEquals(6, r.withheld.size)
        assertTrue(r.withheld.all { it.reason == WithheldReason.MISSING })
    }

    @Test
    fun `vo2 max needs a sex and an in-range age`() {
        val noSex = HealthAge.estimate(HealthAgeInput(40, Sex.UNSPECIFIED, vo2Max = d(37.8, 1)))
        val r = assertIs<HealthAgeResult.NotEnoughData>(noSex)
        assertEquals(WithheldReason.SEX_UNSPECIFIED, r.withheld.single { it.factor == HealthAgeFactor.VO2_MAX }.reason)

        val old = HealthAge.estimate(HealthAgeInput(85, Sex.MALE, vo2Max = d(25.0, 1)))
        val r2 = assertIs<HealthAgeResult.NotEnoughData>(old)
        assertEquals(WithheldReason.AGE_OUT_OF_RANGE, r2.withheld.single { it.factor == HealthAgeFactor.VO2_MAX }.reason)
    }

    @Test
    fun `unspecified sex still scores the other factors`() {
        val r = estimate(threeDaySeries().copy(vo2Max = d(40.0, 5)))
        assertEquals(3, r.contributions.size)
        assertEquals(WithheldReason.SEX_UNSPECIFIED, r.withheldReason(HealthAgeFactor.VO2_MAX))
    }

    @Test
    fun `invalid values are withheld not clamped`() {
        val i = threeDaySeries().copy(
            restingHeartRateBpm = d(200.0), sleepDurationMinutes = d(Double.NaN), dailySteps = d(-5.0),
            sleepRegularityIndex = d(140.0), bmi = d(5.0, 1),
        )
        val r = assertIs<HealthAgeResult.NotEnoughData>(HealthAge.estimate(i))
        assertTrue(r.withheld.filter { it.factor != HealthAgeFactor.HRV && it.factor != HealthAgeFactor.VO2_MAX }
            .all { it.reason == WithheldReason.INVALID_VALUE })
    }

    // ---- no double counting ----

    @Test
    fun `fitness age is not a separate factor and vo2 is counted once`() {
        assertEquals(
            listOf("VO2_MAX", "RESTING_HEART_RATE", "HRV", "SLEEP_DURATION", "SLEEP_REGULARITY", "DAILY_STEPS", "BMI"),
            HealthAgeFactor.entries.map { it.name },
        )
        val r = estimate(full)
        assertEquals(1, r.contributions.count { it.factor == HealthAgeFactor.VO2_MAX })
        // The factor is exactly the existing FitnessAge difference scaled by the single weight.
        val diff = FitnessAge.estimate(37.8, 40, Sex.MALE).differenceYears!!
        assertEquals(diff * HealthAge.VO2_WEIGHT, r.years(HealthAgeFactor.VO2_MAX), 1e-12)
        // Contributions and withheld together cover each factor exactly once.
        val all = r.contributions.map { it.factor } + r.withheld.map { it.factor }
        assertEquals(HealthAgeFactor.entries.toSet(), all.toSet())
        assertEquals(all.size, all.toSet().size)
    }

    @Test
    fun `a vo2 max derived from resting hr is withheld so resting hr is not counted twice`() {
        val r = estimate(threeDaySeries().copy(sex = Sex.MALE, vo2Max = d(45.0, 10), vo2MaxDerivedFromRestingHr = true))
        assertEquals(WithheldReason.DERIVED_FROM_RESTING_HR, r.withheldReason(HealthAgeFactor.VO2_MAX))
        assertEquals(3, r.contributions.size)
        // And it cannot unlock the gate on its own.
        val alone = HealthAge.estimate(HealthAgeInput(40, Sex.MALE, vo2Max = d(45.0, 10), vo2MaxDerivedFromRestingHr = true))
        assertIs<HealthAgeResult.NotEnoughData>(alone)
    }

    @Test
    fun `hrv is never scored`() {
        val base = threeDaySeries()
        val with = estimate(base.copy(hrvRmssdMs = d(80.0, 30)))
        val without = estimate(base)
        assertEquals(WithheldReason.NO_VALIDATED_NORM, with.withheldReason(HealthAgeFactor.HRV))
        assertEquals(without.deltaYears, with.deltaYears, 0.0)
        assertTrue(with.contributions.none { it.factor == HealthAgeFactor.HRV })
        // HRV cannot count toward the three-factor gate either.
        val two = base.copy(dailySteps = null, hrvRmssdMs = d(80.0, 30))
        assertIs<HealthAgeResult.NotEnoughData>(HealthAge.estimate(two))
    }

    // ---- missing data stays missing ----

    @Test
    fun `withheld factors do not move the estimate`() {
        val r = estimate(threeDaySeries())
        // 65 bpm -> 0, 7 h -> 0, 7000 steps -> 0
        assertEquals(45.0, r.estimatedAgeYears, 1e-9)
        val worse = estimate(threeDaySeries().copy(restingHeartRateBpm = d(75.0)))
        assertEquals(46.0, worse.estimatedAgeYears, 1e-9)
        assertNotNull(worse.withheld.firstOrNull { it.factor == HealthAgeFactor.BMI })
    }

    @Test
    fun `confidence grows with the number of scored factors`() {
        val four = estimate(threeDaySeries().copy(bmi = d(22.0, 1)))
        assertEquals(HealthAgeConfidence.MODERATE, four.confidence)
        val five = estimate(threeDaySeries().copy(bmi = d(22.0, 1), sleepRegularityIndex = d(80.0)))
        assertEquals(HealthAgeConfidence.HIGH, five.confidence)
    }
}
