package com.apex.athlete.recorder

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RecorderMappingTest {
    private fun stopped(ms: Long) = RecorderSession.start(1_000).stop(1_000 + ms)

    @Test fun mapsStoppedSessionToManualWorkout() {
        val a = RecorderMapping.toManualWorkout(stopped(45 * 60_000L), 7, "  Run  ")!!
        assertEquals(ManualWorkoutArgs(1_000, 45, "Run", "OTHER_WORKOUT", 7), a)
    }

    @Test fun roundsMinutesAndCapsAtTenHours() {
        assertEquals(2, RecorderMapping.toManualWorkout(stopped(90_000), 5, "x")!!.durationMinutes)
        assertEquals(1, RecorderMapping.toManualWorkout(stopped(40_000), 5, "x")!!.durationMinutes)
        assertEquals(600, RecorderMapping.toManualWorkout(stopped(20 * 3_600_000L), 5, "x")!!.durationMinutes)
    }

    @Test fun refusesShortRunningOrBadRating() {
        assertNull(RecorderMapping.toManualWorkout(stopped(10_000), 5, "x"))
        assertNull(RecorderMapping.toManualWorkout(RecorderSession.start(0), 5, "x"))
        assertNull(RecorderMapping.toManualWorkout(stopped(600_000), 0, "x"))
        assertNull(RecorderMapping.toManualWorkout(stopped(600_000), 11, "x"))
    }

    @Test fun clockFormat() {
        assertEquals("0:00", RecorderFormat.clock(-5))
        assertEquals("1:05", RecorderFormat.clock(65_000))
        assertEquals("1:01:01", RecorderFormat.clock(3_661_000))
    }
}
