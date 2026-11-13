package com.apex.athlete.recorder

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame

class RecorderSessionTest {
    private val t0 = 1_000_000L

    @Test fun startsRunning() {
        val s = RecorderSession.start(t0)
        assertEquals(RecorderPhase.RUNNING, s.phase)
        assertEquals(90_000L, s.elapsedMillis(t0 + 90_000))
    }

    @Test fun pauseFreezesTimeAndResumeContinues() {
        val s = RecorderSession.start(t0).pause(t0 + 60_000)
        assertEquals(RecorderPhase.PAUSED, s.phase)
        assertEquals(60_000L, s.elapsedMillis(t0 + 600_000))
        val r = s.resume(t0 + 600_000)
        assertEquals(90_000L, r.elapsedMillis(t0 + 630_000))
    }

    @Test fun stopFromRunningAndFromPausedKeepsActiveTime() {
        assertEquals(10_000L, RecorderSession.start(t0).stop(t0 + 10_000).elapsedMillis(t0 + 99_000))
        assertEquals(5_000L, RecorderSession.start(t0).pause(t0 + 5_000).stop(t0 + 50_000).elapsedMillis(t0 + 99_000))
    }

    @Test fun invalidTransitionsAreNoOps() {
        val running = RecorderSession.start(t0)
        assertSame(running, running.resume(t0 + 1))
        val stopped = running.stop(t0 + 1)
        assertSame(stopped, stopped.pause(t0 + 2))
        assertSame(stopped, stopped.resume(t0 + 2))
        assertSame(stopped, stopped.stop(t0 + 2))
        assertSame(stopped, stopped.withHeartRate(120))
    }

    @Test fun clockGoingBackwardsNeverGivesNegativeTime() {
        assertEquals(0L, RecorderSession.start(t0).elapsedMillis(t0 - 5_000))
    }

    @Test fun heartRateStatsOnlyWhileRunningAndPlausible() {
        var s = RecorderSession.start(t0)
        assertNull(s.averageBpm)
        assertEquals(false, s.usedStrap)
        s = s.withHeartRate(100).withHeartRate(140).withHeartRate(0).withHeartRate(300)
        assertEquals(120, s.averageBpm)
        assertEquals(140, s.hrMaxBpm)
        assertEquals(true, s.usedStrap)
        val paused = s.pause(t0 + 1000)
        assertSame(paused, paused.withHeartRate(150))
    }

    @Test fun timeOnlyRecordingHasNoHeartRate() {
        val s = RecorderSession.start(t0).stop(t0 + 120_000)
        assertNull(s.averageBpm); assertNull(s.hrMaxBpm)
    }
}
