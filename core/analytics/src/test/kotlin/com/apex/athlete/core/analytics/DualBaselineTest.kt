package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.baseline.DualBaselines
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Owner decision D16: mean/SD for composite scores, median/MAD for anomaly and multi-signal checks. Hand-computed. */
class DualBaselineTest {

    @Test
    fun `one outlier night moves the average but not the usual value`() {
        // Days 1..29 resting HR 50, day 30 an outlier 80, today (day 31) 53.
        // Mean window days 1..30: mean (29*50 + 80)/30 = 51, sample SD sqrt((29*1 + 29^2)/29) = sqrt(30).
        // Robust window days 3..30: median 50, MAD 0 -> scale = floor 1.0 bpm -> robust z (53 - 50)/1 = 3.
        val history = (1L..29L).map { DailyValue(it, 50.0) } + DailyValue(30, 80.0) + DailyValue(31, 53.0)
        val d = DualBaselines.restingHeartRate(history, asOfDay = 31)
        assertEquals(51.0, d.average!!, 1e-9)
        assertEquals(sqrt(30.0), d.mean.transformedSd!!, 1e-9)
        assertEquals(50.0, d.usual!!, 1e-9)
        assertEquals(0.0, d.robust!!.mad, 1e-12)
        assertEquals(1.0, d.robust!!.scale, 1e-12)
        assertTrue(d.robust!!.floorApplied)
        assertEquals(28, d.robust!!.validDays)
        assertEquals(3.0, d.robustZ!!, 1e-9)
        assertEquals(28, d.robustWindowDays)
    }

    @Test
    fun `hrv is handled on the ln scale and the usual value is in milliseconds`() {
        // Days 4..30: 13 nights at 40 ms, 13 at 60 ms, one at 50 ms (27 readings, odd). Today 30 ms.
        // ln median = ln 50 -> usual 50 ms. MAD of ln values: deviations 0, 13 x ln(1.2), 13 x ln(1.25); the 14th of 27
        // sorted is ln(1.2) = 0.18232. Scale 1.4826 * ln(1.2). Robust z = (ln 30 - ln 50) / scale = -1.8898.
        val nights = (4L..16L).map { DailyValue(it, 40.0) } + (17L..29L).map { DailyValue(it, 60.0) } + DailyValue(30, 50.0)
        val d = DualBaselines.hrv(nights + DailyValue(31, 30.0), asOfDay = 31)
        assertEquals(50.0, d.usual!!, 1e-9)
        assertEquals(ln(1.2), d.robust!!.mad, 1e-12)
        val z = (ln(30.0) - ln(50.0)) / (1.4826 * ln(1.2))
        assertEquals(z, d.robustZ!!, 1e-9)
        assertEquals(-1.8898, d.robustZ!!, 1e-4)
        // The average is the geometric mean of the mean/SD baseline (unchanged formula).
        assertEquals(exp((13 * ln(40.0) + 13 * ln(60.0) + ln(50.0)) / 27), d.average!!, 1e-9)
    }

    @Test
    fun `each baseline reports its own calibration and missing stays missing`() {
        // 10 readings: the mean/SD baseline (7 needed) is established, the robust one (14 needed) is not.
        val history = (21L..30L).map { DailyValue(it, 60.0 + it % 3) }
        val d = DualBaselines.restingHeartRate(history, asOfDay = 31)
        assertTrue(d.mean.isEstablished)
        assertNull(d.robust)
        assertNull(d.usual)
        assertNull(d.robustZ) // no reading on day 31 and no mature robust baseline
        // Non-finite readings are gaps, never zeros.
        val withGaps = (1L..30L).map { DailyValue(it, if (it % 2 == 0L) Double.NaN else 55.0) }
        val g = DualBaselines.restingHeartRate(withGaps, 31)
        assertEquals(14, g.robust!!.validDays)
        assertEquals(55.0, g.usual!!, 1e-12)
    }
}
