package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.energy.EnergyEngine
import com.apex.athlete.core.analytics.energy.EnergyInput
import com.apex.athlete.core.analytics.energy.EnergyMissing
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import com.apex.athlete.core.analytics.stress.MinuteRange
import com.apex.athlete.core.analytics.stress.MinuteStress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Energy bank: constants are calibration choices (basal 0.04, 0.08 per zone, stress 0.08, rest 0.01, nap 0.25 per minute). */
class EnergyEngineTest {

    private val eps = 1e-9

    // Zone lower bounds at 50/60/70/80/90 % of 190: 95, 114, 133, 152, 171.
    private val zones = HeartRateZoneModel.of(CardioProfile(restingHeartRate = 50.0, maxHeartRate = 190.0))

    private fun input(
        recovery: Double? = 80.0,
        wake: Long = 0,
        until: Long = 10,
        stress: List<MinuteStress> = emptyList(),
        hr: List<MinuteHeartRate> = emptyList(),
        naps: List<MinuteRange> = emptyList(),
    ) = EnergyInput(recovery, wake, until, stress, hr, zones, naps)

    @Test
    fun `no recovery means no energy bank`() {
        val r = EnergyEngine.evaluate(input(recovery = null))
        assertNull(r.result)
        assertEquals(EnergyMissing.NO_RECOVERY, r.missing)
    }

    @Test
    fun `empty span is reported`() {
        assertEquals(EnergyMissing.EMPTY_SPAN, EnergyEngine.evaluate(input(wake = 10, until = 10)).missing)
    }

    // Hand: 10 awake minutes, no stress or HR data: 80 - 10 * 0.04 = 79.6.
    @Test
    fun `basal drain only`() {
        val res = EnergyEngine.evaluate(input()).result!!
        assertEquals(80.0, res.startLevel, eps)
        assertEquals(10, res.curve.size)
        assertEquals(79.96, res.curve.first().level, eps)
        assertEquals(79.6, res.currentLevel, eps)
        assertEquals(10, res.unscoredStressMinutes)
    }

    // Hand, minutes 0..3 from 80:
    //  m0 stress 2.5 (>= 2): -0.04 -0.08 = -0.12 -> 79.88
    //  m1 stress 0.5 (< 1):  -0.04 +0.01 = -0.03 -> 79.85
    //  m2 nap:               +0.25 (no basal)    -> 80.10
    //  m3 HR 140 = zone 3 (133..152): -0.04 - 3*0.08 = -0.28 -> 79.82
    @Test
    fun `charge and drain per minute`() {
        val r = EnergyEngine.evaluate(
            input(
                until = 4,
                stress = listOf(MinuteStress(0, 2.5), MinuteStress(1, 0.5), MinuteStress(2, 0.5)),
                hr = listOf(MinuteHeartRate(3, 140.0), MinuteHeartRate(2, 180.0)),
                naps = listOf(MinuteRange(2, 3)),
            ),
        ).result!!
        val expected = listOf(79.88, 79.85, 80.10, 79.82)
        assertEquals(4, r.curve.size)
        expected.forEachIndexed { i, e -> assertEquals(e, r.curve[i].level, eps) }
        assertEquals(listOf(0L, 1L, 2L, 3L), r.curve.map { it.minute })
    }

    @Test
    fun `breakdown adds up to the net change`() {
        val r = EnergyEngine.evaluate(
            input(
                until = 4,
                stress = listOf(MinuteStress(0, 2.5), MinuteStress(1, 0.5)),
                hr = listOf(MinuteHeartRate(3, 140.0)),
                naps = listOf(MinuteRange(2, 3)),
            ),
        ).result!!
        assertEquals(0.12, r.drainedBasal, eps)
        assertEquals(0.24, r.drainedActivity, eps)
        assertEquals(0.08, r.drainedStress, eps)
        assertEquals(0.01, r.chargedRest, eps)
        assertEquals(0.25, r.chargedNap, eps)
        assertEquals(80.0 - 0.12 - 0.24 - 0.08 + 0.01 + 0.25, r.currentLevel, eps)
    }

    @Test
    fun `resting heart rate below zone 1 does not drain extra`() {
        val r = EnergyEngine.evaluate(input(until = 1, hr = listOf(MinuteHeartRate(0, 70.0)))).result!!
        assertEquals(79.96, r.currentLevel, eps)
    }

    @Test
    fun `level is clamped to 0 and 100`() {
        val up = EnergyEngine.evaluate(input(recovery = 99.9, until = 10, naps = listOf(MinuteRange(0, 10)))).result!!
        assertEquals(100.0, up.currentLevel, eps)
        val down = EnergyEngine.evaluate(input(recovery = 0.05, until = 10)).result!!
        assertEquals(0.0, down.currentLevel, eps)
        assertEquals(0.0, down.lowestLevel, eps)
    }

    @Test
    fun `out of range recovery is rejected not clamped`() {
        assertEquals(EnergyMissing.NO_RECOVERY, EnergyEngine.evaluate(input(recovery = 140.0)).missing)
        assertEquals(EnergyMissing.NO_RECOVERY, EnergyEngine.evaluate(input(recovery = Double.NaN)).missing)
    }
}
