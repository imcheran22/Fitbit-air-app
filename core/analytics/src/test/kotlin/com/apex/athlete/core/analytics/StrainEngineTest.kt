package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.fitness.CardioFitness
import com.apex.athlete.core.analytics.fitness.MaxHeartRate
import com.apex.athlete.core.analytics.fitness.MaxHeartRateEstimate
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateSample
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.StrainEngine
import com.apex.athlete.core.analytics.strain.StrainTargetCalculator
import com.apex.athlete.core.analytics.strain.Trimp
import com.apex.athlete.core.analytics.strain.ZoneMethod
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.exp
import kotlin.math.ln
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StrainEngineTest {

    private val eps = 1e-9
    private val male = CardioProfile(restingHeartRate = 60.0, maxHeartRate = 180.0, sex = Sex.MALE)
    private val engine = StrainEngine()

    @Test
    fun `banister trimp per minute matches the published weighting`() {
        // 150 bpm uses (150 − 60) / 120 = 0.75 of the reserve.
        assertEquals(0.75, Trimp.reserveFraction(150.0, male), eps)
        assertEquals(0.75 * 0.64 * exp(1.92 * 0.75), Trimp.perMinute(150.0, male), eps)
        val female = male.copy(sex = Sex.FEMALE)
        assertEquals(0.75 * 0.86 * exp(1.67 * 0.75), Trimp.perMinute(150.0, female), eps)
        val unspecified = male.copy(sex = Sex.UNSPECIFIED)
        assertEquals(
            (Trimp.perMinute(150.0, male) + Trimp.perMinute(150.0, female)) / 2,
            Trimp.perMinute(150.0, unspecified), eps,
        )
    }

    @Test
    fun `minutes below thirty percent of reserve earn nothing`() {
        assertEquals(0.0, Trimp.perMinute(95.0, male), eps)   // 29 % of reserve
        assertTrue(Trimp.perMinute(96.0, male) > 0.0)         // exactly 30 %
        assertEquals(0.0, Trimp.total(List(900) { HeartRateSample(70.0) }, male), eps)
        assertEquals(1.0, Trimp.reserveFraction(250.0, male), eps)
        assertEquals(0.0, Trimp.reserveFraction(40.0, male), eps)
    }

    @Test
    fun `strain is logarithmic and bounded by twenty one`() {
        assertEquals(0.0, engine.strainFromTrimp(0.0), eps)
        assertEquals(21.0 * ln(6.0) / ln(31.0), engine.strainFromTrimp(100.0), eps)
        assertEquals(21.0, engine.strainFromTrimp(600.0), eps)
        assertEquals(21.0, engine.strainFromTrimp(5000.0), eps)
        // Each extra 100 TRIMP is worth less than the previous 100.
        val first = engine.strainFromTrimp(100.0) - engine.strainFromTrimp(0.0)
        val second = engine.strainFromTrimp(200.0) - engine.strainFromTrimp(100.0)
        val third = engine.strainFromTrimp(300.0) - engine.strainFromTrimp(200.0)
        assertTrue(first > second && second > third)
        for (t in listOf(1.0, 37.0, 150.0, 480.0)) {
            assertEquals(t, engine.trimpFromStrain(engine.strainFromTrimp(t)), 1e-6)
        }
    }

    @Test
    fun `daily evaluation accumulates trimp and zone minutes`() {
        val day = List(600) { HeartRateSample(65.0) } +      // resting: below zones, no load
            List(40) { HeartRateSample(120.0) } +            // 67 % max → zone 2, 50 % reserve
            List(20) { HeartRateSample(165.0) }              // 92 % max → zone 5
        val r = engine.evaluate(day, male)
        assertEquals(660.0, r.recordedMinutes, eps)
        assertEquals(60.0, r.loadMinutes, eps)
        assertEquals(600.0, r.minutesByZone.getValue(HeartRateZone.BELOW_ZONES), eps)
        assertEquals(40.0, r.minutesByZone.getValue(HeartRateZone.ZONE_2), eps)
        assertEquals(20.0, r.minutesByZone.getValue(HeartRateZone.ZONE_5), eps)
        val expected = 40 * Trimp.perMinute(120.0, male) + 20 * Trimp.perMinute(165.0, male)
        assertEquals(expected, r.trimp, eps)
        assertEquals(engine.strainFromTrimp(expected), r.strain, eps)
        assertEquals(2.0 / 3.0, r.intensityDistribution.getValue(HeartRateZone.ZONE_2), eps)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, r.provenance)
    }

    @Test
    fun `a day without heart rate data scores zero with zero recorded minutes`() {
        val r = engine.evaluate(emptyList(), male)
        assertEquals(0.0, r.strain, eps)
        assertEquals(0.0, r.recordedMinutes, eps)
        assertTrue(r.intensityDistribution.values.all { it == 0.0 })
    }

    @Test
    fun `zone models use percent of max or heart rate reserve`() {
        val byMax = HeartRateZoneModel.of(male)
        assertBounds(listOf(90.0, 108.0, 126.0, 144.0, 162.0), byMax.lowerBounds)
        assertEquals(HeartRateZone.ZONE_3, byMax.zoneFor(127.0))
        assertEquals(HeartRateZone.BELOW_ZONES, byMax.zoneFor(89.9))
        assertEquals(171.0, byMax.midpointOf(HeartRateZone.ZONE_5), eps)
        val byReserve = HeartRateZoneModel.of(male, ZoneMethod.HEART_RATE_RESERVE)
        assertBounds(listOf(120.0, 132.0, 144.0, 156.0, 168.0), byReserve.lowerBounds)
    }

    private fun assertBounds(expected: List<Double>, actual: List<Double>) {
        assertEquals(expected.size, actual.size)
        expected.indices.forEach { assertEquals(expected[it], actual[it], 1e-9) }
    }

    @Test
    fun `strain target scales with recovery and converts the remainder into minutes`() {
        val calc = StrainTargetCalculator(engine)
        assertEquals(12.0, calc.targetFor(50.0).center, eps)
        assertEquals(6.0, calc.targetFor(0.0).center, eps)
        assertEquals(18.0, calc.targetFor(100.0).center, eps)
        assertEquals(19.0, calc.targetFor(140.0).high, eps)

        val target = calc.targetFor(50.0)
        val remaining = calc.remaining(currentTrimp = 30.0, target = target, profile = male)
        assertEquals(engine.trimpFromStrain(13.0) - 30.0, remaining.trimpRemaining, 1e-6)
        assertEquals(13.0 - engine.strainFromTrimp(30.0), remaining.strainRemaining, 1e-6)
        // Harder zones use the remaining capacity up faster.
        assertTrue(remaining.minutesByZone.getValue(HeartRateZone.ZONE_5) < remaining.minutesByZone.getValue(HeartRateZone.ZONE_3))
        // Zone 1's midpoint (99 bpm) is 32.5 % of reserve, just above the floor, so it is listed.
        assertTrue(HeartRateZone.ZONE_1 in remaining.minutesByZone)

        val spent = calc.remaining(currentTrimp = 500.0, target = target, profile = male)
        assertEquals(0.0, spent.strainRemaining, eps)
        assertEquals(0.0, spent.trimpRemaining, eps)
    }

    @Test
    fun `cardio profile rejects impossible anchors`() {
        assertFailsWith<IllegalArgumentException> { CardioProfile(restingHeartRate = 70.0, maxHeartRate = 70.0) }
    }

    @Test
    fun `max heart rate prefers user value then the higher of prediction and observation`() {
        assertEquals(187.0, MaxHeartRate.agePredicted(30), eps)
        val user = MaxHeartRate.resolve(30, 195.0, 192.0)!!
        assertEquals(192.0, user.bpm, eps)
        assertEquals(DataProvenance.USER_REPORTED, user.provenance)

        val predicted = MaxHeartRate.resolve(30, 170.0, null)!!
        assertEquals(187.0, predicted.bpm, eps)
        assertEquals(DataProvenance.ESTIMATED, predicted.provenance)

        val observed = MaxHeartRate.resolve(30, 195.0, null)!!
        assertEquals(MaxHeartRateEstimate.Method.OBSERVED_PEAK, observed.method)
        assertEquals(195.0, observed.bpm, eps)

        assertNull(MaxHeartRate.resolve(null, null, null))
    }

    @Test
    fun `vo2 max fallback is labelled as an estimate`() {
        val e = CardioFitness.estimateFromHeartRateRatio(maxHeartRate = 190.0, restingHeartRate = 50.0)!!
        assertEquals(15.3 * 190.0 / 50.0, e.mlPerKgPerMin, eps)
        assertEquals(DataProvenance.ESTIMATED, e.provenance)
        assertNull(CardioFitness.estimateFromHeartRateRatio(maxHeartRate = 190.0, restingHeartRate = 10.0))
    }

    @Test
    fun `calibration anchors quoted in FORMULAS md hold`() {
        // HRrest 50, HRmax 190, sex unspecified (the two weightings averaged). Derivation:
        // TRIMP = minutes · x · (0.64·e^(1.92x) + 0.86·e^(1.67x)) / 2, strain = 21·ln(1 + T/20)/ln(31).
        val p = CardioProfile(restingHeartRate = 50.0, maxHeartRate = 190.0)
        fun strainOf(bpm: Double, minutes: Int) = engine.evaluate(List(minutes) { HeartRateSample(bpm) }, p)
        val jog = strainOf(134.0, 30)       // 60 % of reserve
        val hard = strainOf(169.0, 60)      // 85 % of reserve
        val marathon = strainOf(162.0, 210) // 80 % of reserve, 3.5 h
        assertEquals(39.309, jog.trimp, 1e-3)
        assertEquals(6.648, jog.strain, 1e-3)
        assertEquals(174.144, hard.trimp, 1e-3)
        assertEquals(13.899, hard.strain, 1e-3)
        assertEquals(524.554, marathon.trimp, 1e-3)
        assertEquals(20.207, marathon.strain, 1e-3)
    }

    @Test
    fun `strain never decreases with more or harder minutes and stays within zero to twenty one`() {
        var previous = 0.0
        for (bpm in 40..220 step 5) {
            val s = engine.evaluate(List(60) { HeartRateSample(bpm.toDouble()) }, male).strain
            assertTrue(s >= previous && s in 0.0..21.0, "bpm $bpm gave $s after $previous")
            previous = s
        }
        previous = 0.0
        for (minutes in listOf(0, 1, 10, 60, 240, 1440)) {
            val s = engine.evaluate(List(minutes) { HeartRateSample(150.0) }, male).strain
            assertTrue(s >= previous && s <= 21.0)
            previous = s
        }
    }

    @Test
    fun `remaining minutes use the engine's zone method and reserve floor`() {
        val hrrEngine = StrainEngine(StrainEngine.Config(zoneMethod = ZoneMethod.HEART_RATE_RESERVE))
        val calc = StrainTargetCalculator(hrrEngine)
        val target = calc.targetFor(50.0)
        val r = calc.remaining(currentTrimp = 30.0, target = target, profile = male)
        // Karvonen zone 5 for 60/180 runs 168..180, midpoint 174 bpm (v1 used 171, the %HRmax zone).
        assertEquals(r.trimpRemaining / Trimp.perMinute(174.0, male), r.minutesByZone.getValue(HeartRateZone.ZONE_5), 1e-9)

        // With a 40 % reserve floor, zone 1's midpoint (99 bpm = 32.5 % of reserve) earns nothing.
        val strict = StrainTargetCalculator(StrainEngine(StrainEngine.Config(reserveFloor = 0.40)))
        val s = strict.remaining(currentTrimp = 30.0, target = target, profile = male)
        assertTrue(HeartRateZone.ZONE_1 !in s.minutesByZone)
        assertTrue(HeartRateZone.ZONE_2 in s.minutesByZone)
    }

    @Test
    fun `non finite sample durations are ignored`() {
        val r = engine.evaluate(listOf(HeartRateSample(150.0, Double.NaN), HeartRateSample(150.0, Double.POSITIVE_INFINITY), HeartRateSample(150.0)), male)
        assertEquals(1.0, r.recordedMinutes, eps)
        assertEquals(Trimp.perMinute(150.0, male), r.trimp, eps)
        assertEquals(0.0, engine.strainFromTrimp(Double.NaN), eps)
    }
}
