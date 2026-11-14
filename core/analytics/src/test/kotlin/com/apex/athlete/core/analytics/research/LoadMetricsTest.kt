package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.strain.HeartRateZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class LoadMetricsTest {

    private val eps = 1e-9
    private val week = listOf(300.0, 0.0, 450.0, 200.0, 0.0, 500.0, 150.0)

    @Test
    fun `T-EX02-c Edwards TRIMP of zone minutes`() {
        assertEquals(95.0, LoadMetrics.edwardsTrimp(listOf(10.0, 20.0, 15.0, 0.0, 0.0)), eps)
        assertEquals(0.0, LoadMetrics.edwardsTrimp(List(5) { 0.0 }), eps)
        assertEquals(15.0, LoadMetrics.edwardsTrimp(listOf(0.0, 0.0, 0.0, 0.0, 3.0)), eps)
    }

    @Test
    fun `Edwards TRIMP rejects the wrong shape or negative minutes`() {
        assertFailsWith<IllegalArgumentException> { LoadMetrics.edwardsTrimp(listOf(1.0, 2.0)) }
        assertFailsWith<IllegalArgumentException> { LoadMetrics.edwardsTrimp(listOf(1.0, 2.0, 3.0, 4.0, -5.0)) }
        assertFailsWith<IllegalArgumentException> { LoadMetrics.edwardsTrimp(listOf(1.0, 2.0, 3.0, 4.0, Double.NaN)) }
    }

    @Test
    fun `Edwards TRIMP from a zone map ignores time below zone 1 and absent zones`() {
        val m = mapOf(
            HeartRateZone.BELOW_ZONES to 500.0,
            HeartRateZone.ZONE_1 to 10.0,
            HeartRateZone.ZONE_2 to 20.0,
            HeartRateZone.ZONE_3 to 15.0,
        )
        assertEquals(95.0, LoadMetrics.edwardsTrimp(m), eps)
        assertEquals(0.0, LoadMetrics.edwardsTrimp(emptyMap<HeartRateZone, Double>()), eps)
    }

    @Test
    fun `session RPE load is RPE times minutes`() {
        assertEquals(240.0, LoadMetrics.sessionRpeLoad(6.0, 40.0)!!, eps)
        assertEquals(0.0, LoadMetrics.sessionRpeLoad(0.0, 40.0)!!, eps)
    }

    @Test
    fun `session RPE load needs a valid rating and duration`() {
        assertNull(LoadMetrics.sessionRpeLoad(null, 40.0))
        assertNull(LoadMetrics.sessionRpeLoad(6.0, null))
        assertNull(LoadMetrics.sessionRpeLoad(11.0, 40.0))
        assertNull(LoadMetrics.sessionRpeLoad(-1.0, 40.0))
        assertNull(LoadMetrics.sessionRpeLoad(6.0, 0.0))
        assertNull(LoadMetrics.sessionRpeLoad(Double.NaN, 40.0))
    }

    @Test
    fun `T-EX03-a monotony and strain`() {
        val w = LoadMetrics.fosterWeek(week)!!
        assertEquals(1600.0, w.weeklyLoad, eps)
        assertEquals(228.571, w.meanDailyLoad, 1e-3)
        assertEquals(199.702, w.sdDailyLoad, 1e-3)
        assertEquals(1.1446, w.monotony!!, 1e-4)
        assertEquals(1831.3, w.strain!!, 0.05)
    }

    @Test
    fun `a week with an unknown day is not a Foster week`() {
        assertNull(LoadMetrics.fosterWeek(week.toMutableList<Double?>().also { it[3] = null }))
        assertNull(LoadMetrics.fosterWeek(week.take(6)))
        assertNull(LoadMetrics.fosterWeek(week + 100.0))
    }

    @Test
    fun `invalid loads are rejected`() {
        assertNull(LoadMetrics.fosterWeek(week.toMutableList().also { it[0] = -5.0 }))
        assertNull(LoadMetrics.fosterWeek(week.toMutableList().also { it[0] = Double.NaN }))
    }

    @Test
    fun `identical daily loads leave monotony undefined not infinite`() {
        val w = LoadMetrics.fosterWeek(List(7) { 100.0 })!!
        assertEquals(700.0, w.weeklyLoad, eps)
        assertNull(w.monotony)
        assertNull(w.strain)
        assertNull(LoadMetrics.fosterWeek(List(7) { 0.0 })!!.monotony)
    }

    @Test
    fun `identical loads that are not exact in binary still leave monotony undefined`() {
        // The mean of seven 33.3s differs from 33.3 in the last bit; that must not become a huge ratio.
        for (v in listOf(33.3, 0.1, 100.1, 1234.567)) {
            val w = LoadMetrics.fosterWeek(List(7) { v })!!
            assertNull(w.monotony, "monotony for $v was ${w.monotony}")
            assertNull(w.strain)
        }
    }

    @Test
    fun `Foster week from a dated history`() {
        val history = week.mapIndexed { i, v -> DailyLoad(10L + i, v) }
        assertEquals(1.1446, LoadMetrics.fosterWeek(history, 16)!!.monotony!!, 1e-4)
        assertNull(LoadMetrics.fosterWeek(history, 17))
        assertNull(LoadMetrics.fosterWeek(history.filter { it.epochDay != 12L }, 16))
        assertNull(LoadMetrics.fosterWeek(history.map { if (it.epochDay == 12L) DailyLoad(12, null) else it }, 16))
        assertNotNull(LoadMetrics.fosterWeek(history + DailyLoad(5, 1.0), 16))
    }

    @Test
    fun `weekly exercise volume counts sessions and days in the window`() {
        val s = listOf(
            ExerciseSessionSummary(10, 30.0), ExerciseSessionSummary(10, 20.0),
            ExerciseSessionSummary(12, 45.0), ExerciseSessionSummary(16, 60.0),
            ExerciseSessionSummary(9, 99.0),                      // before the window
            ExerciseSessionSummary(17, 99.0),                     // after it
            ExerciseSessionSummary(13, 0.0),                      // empty session
            ExerciseSessionSummary(14, Double.NaN),
        )
        val v = LoadMetrics.weeklyExerciseVolume(s, 16)
        assertEquals(155.0, v.activeMinutes, eps)
        assertEquals(4, v.sessions)
        assertEquals(3, v.exerciseDays)
    }

    @Test
    fun `no sessions gives a zero volume the caller must interpret`() {
        val v = LoadMetrics.weeklyExerciseVolume(emptyList(), 16)
        assertEquals(0, v.sessions)
        assertEquals(0.0, v.activeMinutes, eps)
    }
}
