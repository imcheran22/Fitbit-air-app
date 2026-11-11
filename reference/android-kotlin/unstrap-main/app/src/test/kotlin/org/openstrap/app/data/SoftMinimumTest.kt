package org.openstrap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.app.data.Recovery.Night
import org.openstrap.app.ui.dashboard.Narrative
import kotlin.random.Random

/** The soft-minimum fusion kept beside the shown score for the calibration backtest, and the Alert cap. */
class SoftMinimumTest {
    private val day = 86_400L

    private fun night(i: Int, hrv: Float = 50f, rhr: Float = 55f, temp: Float = 33.5f, breath: Float = 14f) = Night(
        day = i * day, start = i * day - 7 * 3600, end = i * day + 30 * 60, asleepMinutes = 480, awakeMinutes = 20,
        deepMinutes = 80, remMinutes = 95, hrv = hrv, restingHr = rhr, rhrMeanSleep = rhr + 4f, nadirTime = i * day - 4 * 3600,
        skinTemperature = temp, breathRate = breath, hrvSamples = 20, hrMinutes = 420,
    )

    private fun history(rnd: Random = Random(1)) = (1..30).map {
        night(it, hrv = 50f * (1 + 0.08f * (rnd.nextFloat() - 0.5f) * 2), rhr = 55f + rnd.nextInt(-2, 3), temp = 33.5f + 0.1f * (rnd.nextFloat() - 0.5f))
    }

    private fun equal(vararg scores: Int) = scores.map { 1f to it }

    @Test
    fun equalWeightsMatchZeppsWorkedCases() {
        assertEquals(73.3, Recovery.softMinimum(equal(40, 85, 85, 85, 85, 85)), 0.05)
        assertEquals(66.6, Recovery.softMinimum(equal(20, 85, 85, 85, 85, 85)), 0.05)
        // All equal: the score itself, whatever the weights.
        assertEquals(80.0, Recovery.softMinimum(equal(80, 80, 80)), 1e-9)
        // Zepp's strap record (native/06 §8): HRV 89, RHR 86, temperature 100 fuse to 91.
        assertEquals(91, Recovery.softMinimum(equal(89, 86, 100)).toInt())
        assertEquals(0.0, Recovery.softMinimum(emptyList()), 0.0)
    }

    @Test
    fun baseWeightsScaleEachPart() {
        // A low part with 3x the base weight pulls harder than with equal weights.
        val equal = Recovery.softMinimum(listOf(1f to 40, 1f to 85))
        val heavy = Recovery.softMinimum(listOf(3f to 40, 1f to 85))
        assertTrue("$heavy < $equal", heavy < equal)
        // By hand: w = base·e^(−(s/100)²); 3·0.8521 = 2.5564 at 40, 0.4855 at 85 → (102.26 + 41.27) / 3.0419 = 47.18.
        assertEquals(47.18, heavy, 0.02)
        // Only the ratio of base weights matters.
        assertEquals(heavy, Recovery.softMinimum(listOf(0.3f to 40, 0.1f to 85)), 1e-6)
        // A zero base weight drops the part.
        assertEquals(85.0, Recovery.softMinimum(listOf(0f to 10, 1f to 85)), 1e-9)
    }

    @Test
    fun readinessCarriesTheSoftMinimumWithoutShowingIt() {
        val r = Recovery.readiness(night(31), history())
        val soft = r.softMinScore
        assertNotNull(soft)
        assertEquals(Recovery.softMinimum(r.contributors.map { it.factor.weight to it.score }).toInt(), soft)
        assertTrue("SOFT_MIN_FUSION is a comparison switch; the app keeps the weighted mean", !Recovery.SOFT_MIN_FUSION)
        val weighted = (r.contributors.sumOf { it.factor.weight.toDouble() * it.score } / r.contributors.sumOf { it.factor.weight.toDouble() }).toInt()
        assertEquals(weighted, r.score)
    }

    @Test
    fun aCappedAlertDayRatesInTheLowestBand() {
        // Resting HR up 5 bpm two nights running raises an Alert while sleep and the other signals are normal, so the
        // Alert cap (not the red-flag cap) is what holds the score down.
        val r = Recovery.readiness(night(31, rhr = 60f), history().dropLast(1) + night(30, rhr = 60f))
        assertTrue(r.strainAlert)
        assertTrue(r.capped)
        assertEquals(Recovery.ALERT_CAP, r.score)
        assertEquals(Narrative.Rating.LOW, Narrative.ratingFor(r.score!!))
        // The soft minimum keeps the Alert cap too.
        assertTrue("soft ${r.softMinScore}", r.softMinScore!! <= Recovery.ALERT_CAP)
    }
}
