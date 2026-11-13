package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.fitness.RestingHeartRateSeries
import com.apex.athlete.core.analytics.fitness.RestingHeartRateSource
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateSample
import com.apex.athlete.core.analytics.strain.StrainEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

/** Formula version 3, B10: the TRIMP anchor is the resting-heart-rate baseline, and the series is chosen once per window. */
class RestingAnchorTest {

    private val engine = StrainEngine()

    @Test
    fun `the load anchor is the baseline centre, then today's reading, then the latest one`() {
        assertEquals(55.0, RestingHeartRateSource.loadAnchor(baselineCenter = 55.0, current = 63.0, latest = 54.0)!!, 0.0)
        assertEquals(63.0, RestingHeartRateSource.loadAnchor(null, 63.0, 54.0)!!, 0.0)
        assertEquals(54.0, RestingHeartRateSource.loadAnchor(null, null, 54.0)!!, 0.0)
        assertNull(RestingHeartRateSource.loadAnchor(null, null, null))
    }

    @Test
    fun `the same heart rate minutes give identical TRIMP when today's resting heart rate is 8 bpm higher`() {
        val hour = List(60) { HeartRateSample(160.0) }
        fun trimpFor(todaysRhr: Double): Double {
            val anchor = RestingHeartRateSource.loadAnchor(baselineCenter = 55.0, current = todaysRhr, latest = null)!!
            return engine.evaluate(hour, CardioProfile(anchor, 180.0)).trimp
        }
        assertEquals(trimpFor(55.0), trimpFor(63.0), 0.0)
        // Hand: dHR = (160 - 55) / (180 - 55) = 0.84; mean of the two sexes' per-minute values
        // (0.84*0.64*e^(1.92*0.84) = 2.6972 and 0.84*0.86*e^(1.67*0.84) = 2.9378) = 2.8175; x 60 = 169.05.
        assertEquals(169.05, trimpFor(63.0), 0.1)
        // Anchoring on today's raw reading, as version 2 did, moves it.
        assertNotEquals(169.05, engine.evaluate(hour, CardioProfile(63.0, 180.0)).trimp, 5.0)
    }

    private fun days(range: LongRange) = range.map { DailyValue(it, 55.0) }

    @Test
    fun `one series is chosen from the 30 days before the day, by how many readings each has`() {
        val day = 100L
        val resting = days(80L..99L)          // 20 readings in the window
        val sleeping = days(70L..99L)         // 30 readings in the window
        assertEquals(RestingHeartRateSeries.SLEEPING, RestingHeartRateSource.choose(resting, sleeping, day))
        assertEquals(RestingHeartRateSeries.RESTING, RestingHeartRateSource.choose(sleeping, resting, day))
        // Equal counts prefer the resting series.
        assertEquals(RestingHeartRateSeries.RESTING, RestingHeartRateSource.choose(resting, resting, day))
    }

    @Test
    fun `today's reading does not flip an established choice`() {
        val day = 100L
        val resting = days(85L..99L)          // 15 prior readings
        val sleeping = days(70L..99L)         // 30 prior readings
        val withTodayResting = resting + DailyValue(day, 55.0)
        assertEquals(
            RestingHeartRateSource.choose(resting, sleeping, day),
            RestingHeartRateSource.choose(withTodayResting, sleeping, day),
        )
        // Readings older than the 30-day window are ignored (here they would make the resting series longer)...
        val farBack = days(0L..60L)
        assertEquals(
            RestingHeartRateSeries.SLEEPING,
            RestingHeartRateSource.choose(resting + farBack, sleeping, day),
        )
        // ...and so are readings after the day (a replay of an old day must not see the future).
        assertEquals(RestingHeartRateSeries.SLEEPING, RestingHeartRateSource.choose(resting + days(101L..140L), sleeping, day))
    }

    @Test
    fun `with no prior readings in either series, today's reading decides, defaulting to resting`() {
        val day = 100L
        assertEquals(RestingHeartRateSeries.RESTING, RestingHeartRateSource.choose(emptyList(), emptyList(), day))
        assertEquals(RestingHeartRateSeries.SLEEPING, RestingHeartRateSource.choose(emptyList(), listOf(DailyValue(day, 52.0)), day))
        assertEquals(RestingHeartRateSeries.RESTING, RestingHeartRateSource.choose(listOf(DailyValue(day, 52.0)), emptyList(), day))
    }
}
