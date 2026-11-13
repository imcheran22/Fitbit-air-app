package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.fitness.MaxHeartRate
import com.apex.athlete.core.analytics.fitness.MaxHeartRateEstimate
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateSample
import com.apex.athlete.core.analytics.strain.StrainEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Formula version 3, B5: the observed maximum is the 99.5th percentile of at least 600 active minutes, never one artefact. */
class MaxHeartRateRobustTest {

    @Test
    fun `the percentile rank is floor of n times 0_005 from the top, and needs 600 minutes`() {
        assertNull(MaxHeartRate.robustPeakOffset(0))
        assertNull(MaxHeartRate.robustPeakOffset(599))
        assertEquals(3, MaxHeartRate.robustPeakOffset(600))
        assertEquals(3, MaxHeartRate.robustPeakOffset(799))
        assertEquals(4, MaxHeartRate.robustPeakOffset(800))
        assertEquals(50, MaxHeartRate.robustPeakOffset(10_000))
        assertEquals(600, MaxHeartRate.MIN_PEAK_MINUTES)
        assertEquals(100.0, MaxHeartRate.MIN_PEAK_SAMPLE_BPM, 0.0)
    }

    @Test
    fun `one 212 bpm minute among 180 bpm minutes does not become the maximum`() {
        val minutes = List(700) { 180.0 } + 212.0
        assertEquals(180.0, MaxHeartRate.robustPeak(minutes)!!, 0.0)
        val est = MaxHeartRate.resolve(ageYears = 40, observedPeakBpm = MaxHeartRate.robustPeak(minutes), userSetBpm = null)!!
        // Tanaka at 40 is 208 - 28 = 180.
        assertEquals(180.0, est.bpm, 0.0)
        assertEquals(MaxHeartRateEstimate.Method.AGE_PREDICTED, est.method)
    }

    @Test
    fun `fewer than four spike minutes are ignored, four or more are accepted as real`() {
        val base = List(700) { 175.0 }
        // n = 703 -> offset 3: the 4th highest minute decides.
        assertEquals(175.0, MaxHeartRate.robustPeak(base + List(3) { 212.0 })!!, 0.0)
        assertEquals(212.0, MaxHeartRate.robustPeak(base + List(4) { 212.0 })!!, 0.0)
    }

    @Test
    fun `below 600 active minutes there is no observed maximum`() {
        assertNull(MaxHeartRate.robustPeak(List(599) { 170.0 }))
        val est = MaxHeartRate.resolve(40, MaxHeartRate.robustPeak(List(599) { 195.0 }), null)!!
        assertEquals(MaxHeartRateEstimate.Method.AGE_PREDICTED, est.method)
        assertEquals(180.0, est.bpm, 0.0)
    }

    @Test
    fun `only minutes from 100 to 240 bpm are the sample`() {
        // 1000 resting minutes do not count towards the 600.
        assertNull(MaxHeartRate.robustPeak(List(1000) { 70.0 } + List(599) { 150.0 }))
        // Impossible values are outside the sample, so they cannot be the percentile either.
        val withNoise = List(700) { 185.0 } + List(10) { 300.0 } + List(500) { 60.0 }
        assertEquals(185.0, MaxHeartRate.robustPeak(withNoise)!!, 0.0)
    }

    @Test
    fun `a real higher maximum still wins when it is sustained`() {
        // 5 % of 800 active minutes at 196: the 99.5th percentile is 196, above Tanaka's 180 at 40.
        val minutes = List(760) { 160.0 } + List(40) { 196.0 }
        val peak = MaxHeartRate.robustPeak(minutes)!!
        assertEquals(196.0, peak, 0.0)
        val est = MaxHeartRate.resolve(40, peak, null)!!
        assertEquals(MaxHeartRateEstimate.Method.OBSERVED_PEAK, est.method)
    }

    @Test
    fun `strain on the B5 vector stays 13_74 because the spike no longer sets the maximum`() {
        val spiky = List(700) { 180.0 } + 212.0
        val hrMax = MaxHeartRate.resolve(40, MaxHeartRate.robustPeak(spiky), null)!!.bpm
        val hour = List(60) { HeartRateSample(160.0) }
        val r = StrainEngine().evaluate(hour, CardioProfile(restingHeartRate = 55.0, maxHeartRate = hrMax))
        // Hand: TRIMP 169.05; strain = 21 * ln(1 + 169.05/20) / ln(31) = 21 * 2.2463 / 3.4340 = 13.74
        assertEquals(169.05, r.trimp, 0.1)
        assertEquals(13.74, r.strain, 0.01)
    }
}
