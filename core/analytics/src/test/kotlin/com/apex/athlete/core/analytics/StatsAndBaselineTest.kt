package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.baseline.BaselineEngine
import com.apex.athlete.core.analytics.baseline.BaselineSpec
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.BaselineStatus
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.baseline.ValueTransform
import com.apex.athlete.core.analytics.stats.CircularTime
import com.apex.athlete.core.analytics.stats.Ewma
import com.apex.athlete.core.analytics.stats.MissingValuePolicy
import com.apex.athlete.core.analytics.stats.Stats
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StatsAndBaselineTest {

    private val eps = 1e-9

    @Test
    fun `sample variance uses the n minus 1 denominator`() {
        val values = listOf(2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0)
        assertEquals(5.0, Stats.mean(values)!!, eps)
        assertEquals(32.0 / 7.0, Stats.sampleVariance(values)!!, eps)
        assertNull(Stats.sampleVariance(listOf(3.0)))
        assertNull(Stats.mean(emptyList()))
    }

    @Test
    fun `percentile interpolates between ranks`() {
        assertEquals(3.25, Stats.percentile(listOf(4.0, 1.0, 3.0, 2.0), 0.75)!!, eps)
        assertEquals(2.5, Stats.median(listOf(1.0, 2.0, 3.0, 4.0))!!, eps)
        assertEquals(7.0, Stats.percentile(listOf(7.0), 0.75)!!, eps)
    }

    @Test
    fun `linear slope recovers a known gradient`() {
        val xs = listOf(0.0, 1.0, 2.0, 3.0)
        assertEquals(2.0, Stats.linearSlope(xs, xs.map { 2 * it + 5 })!!, eps)
        assertNull(Stats.linearSlope(listOf(1.0, 1.0), listOf(2.0, 3.0)))
    }

    @Test
    fun `seven day ewma uses alpha one quarter`() {
        assertEquals(0.25, Ewma.alphaForSpan(7), eps)
        assertEquals(2.0 / 29.0, Ewma.alphaForSpan(28), eps)
        assertEquals(listOf(10.0, 12.5, 14.375), Ewma.series(listOf(10.0, 20.0, 20.0), 7))
    }

    @Test
    fun `ewma carries forward over gaps unless told a gap is zero`() {
        val gap = listOf(null, 10.0, null, 20.0)
        assertEquals(listOf(null, 10.0, 10.0, 12.5), Ewma.series(gap, 7))
        assertEquals(
            listOf(0.0, 2.5, 1.875, 6.40625),
            Ewma.series(gap, 7, MissingValuePolicy.TREAT_AS_ZERO),
        )
        assertEquals(2.5, Ewma.last(listOf(10.0), 7, seed = 0.0)!!, eps)
        assertNull(Ewma.last(listOf(null, null), 7))
    }

    @Test
    fun `non finite readings count as missing in every ewma`() {
        val withNaN = listOf(10.0, Double.NaN, Double.POSITIVE_INFINITY, 20.0)
        assertEquals(listOf(10.0, 10.0, 10.0, 12.5), Ewma.series(withNaN, 7))
        assertEquals(listOf(10.0, 7.5, 5.625, 9.21875), Ewma.series(withNaN, 7, MissingValuePolicy.TREAT_AS_ZERO))
        assertEquals(Ewma.normalizedSeries(listOf(10.0, null, null, 20.0), 7), Ewma.normalizedSeries(withNaN, 7))
    }

    @Test
    fun `normalised ewma does not depend on a seed and matches the explicit weighted mean`() {
        // y1 = (20 + 0.75·10) / 1.75; y2 = (20 + 0.75·20 + 0.5625·10) / 2.3125
        val y = Ewma.normalizedSeries(listOf(10.0, 20.0, 20.0), 7)
        assertEquals(10.0, y[0]!!, eps)
        assertEquals(27.5 / 1.75, y[1]!!, eps)
        assertEquals(40.625 / 2.3125, y[2]!!, eps)
        // Leading gaps yield null; later gaps are skipped, not counted as zero.
        assertEquals(listOf(null, 10.0, 10.0), Ewma.normalizedSeries(listOf(null, 10.0, null), 7))
        // Constant input is returned unchanged (up to floating-point rounding).
        assertTrue(Ewma.normalizedSeries(List(50) { 42.0 }, 28).all { kotlin.math.abs(it!! - 42.0) < 1e-9 })
        // On a long history it converges to the recursive EWMA (the seed's weight has decayed).
        val long = List(400) { i -> 30.0 + 20.0 * kotlin.math.sin(i / 5.0) }
        assertEquals(Ewma.last(long, 28)!!, Ewma.normalizedSeries(long, 28).last()!!, 1e-9)
    }

    @Test
    fun `clock times average across midnight`() {
        val mean = CircularTime.meanMinuteOfDay(listOf(1430.0, 10.0))!!
        assertTrue(mean < 1e-6 || mean > 1440 - 1e-6, "mean was $mean")
        assertEquals(sqrt(200.0), CircularTime.stdDevMinutes(listOf(1430.0, 10.0))!!, 1e-6)
        assertEquals(-20.0, CircularTime.signedDifference(1430.0, 10.0), eps)
    }

    private fun days(values: List<Double>, endExclusive: Long = 100) =
        values.mapIndexed { i, v -> DailyValue(endExclusive - values.size + i, v) }

    @Test
    fun `baseline stays calibrating below seven valid days`() {
        val b = BaselineEngine.baseline(days(List(6) { 50.0 + it }), 100, BaselineSpecs.GENERIC)
        assertEquals(BaselineStatus.CALIBRATING, b.status)
        assertEquals(6, b.validDays)
        assertEquals(1, b.daysUntilEstablished)
        assertNull(b.center)
        assertNull(BaselineEngine.zScore(55.0, b))
    }

    @Test
    fun `baseline mean and sd come from the thirty days before the evaluated day`() {
        val values = listOf(50.0, 52.0, 54.0, 56.0, 58.0, 60.0, 62.0)
        // A reading on the evaluated day and one older than the window must both be ignored.
        val history = days(values) + DailyValue(100, 999.0) + DailyValue(60, 999.0)
        val b = BaselineEngine.baseline(history, 100, BaselineSpecs.GENERIC)
        assertEquals(BaselineStatus.ESTABLISHED, b.status)
        assertEquals(7, b.validDays)
        assertEquals(56.0, b.center!!, eps)
        val sd = sqrt(112.0 / 6.0)
        assertEquals(sd, b.effectiveSd!!, eps)
        assertEquals(56.0 - sd, b.lowerNormal!!, eps)
        assertEquals(56.0 + sd, b.upperNormal!!, eps)
        assertEquals(1.0, BaselineEngine.zScore(56.0 + sd, b)!!, eps)
        assertEquals(4.0 / 56.0, BaselineEngine.fractionFromBaseline(60.0, b)!!, eps)
    }

    @Test
    fun `z scores are clamped to plus minus three`() {
        val b = BaselineEngine.baseline(days(listOf(50.0, 52.0, 54.0, 56.0, 58.0, 60.0, 62.0)), 100, BaselineSpecs.GENERIC)
        assertEquals(3.0, BaselineEngine.zScore(500.0, b)!!, eps)
        assertEquals(-3.0, BaselineEngine.zScore(-500.0, b)!!, eps)
    }

    @Test
    fun `hrv baseline is computed on the log scale`() {
        val values = listOf(40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 80.0)
        val b = BaselineEngine.baseline(days(values), 100, BaselineSpecs.HRV)
        val logs = values.map(::ln)
        val mean = logs.average()
        assertEquals(ValueTransform.NATURAL_LOG, b.transform)
        assertEquals(exp(mean), b.center!!, eps)
        val sd = Stats.sampleStdDev(logs)!!
        assertEquals((ln(48.0) - mean) / sd, BaselineEngine.zScore(48.0, b)!!, eps)
        // Normal range is asymmetric in milliseconds because it is symmetric in log units.
        assertTrue(b.upperNormal!! - b.center!! > b.center!! - b.lowerNormal!!)
        assertNull(BaselineEngine.zScore(0.0, b))
    }

    @Test
    fun `sd floor stops identical readings from producing extreme z scores`() {
        val flat = days(List(10) { 60.0 })
        val b = BaselineEngine.baseline(flat, 100, BaselineSpecs.RESTING_HEART_RATE)
        assertEquals(0.0, b.transformedSd!!, eps)
        assertEquals(1.2, b.effectiveSd!!, eps) // 2 % of 60 bpm
        assertEquals(1.0 / 1.2, BaselineEngine.zScore(61.0, b)!!, eps)

        val unfloored = BaselineEngine.baseline(flat, 100, BaselineSpec())
        assertNull(BaselineEngine.zScore(61.0, unfloored))
        assertNotNull(unfloored.center)
    }
}
