package com.apex.athlete.recorder

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class SessionStoreTest {
    private fun tempFile(): File = File.createTempFile("session", ".json").also { it.delete(); it.deleteOnExit() }

    @Test fun roundTripsEveryPhase() {
        val running = RecorderSession.start(5_000).withHeartRate(120).withHeartRate(130)
        val paused = running.pause(65_000)
        val stopped = paused.stop(70_000)
        for (s in listOf(running, paused, stopped)) assertEquals(s, SessionStore.decode(SessionStore.encode(s)))
    }

    @Test fun savedSessionSurvivesANewStoreAndControllerLikeProcessDeath() {
        val f = tempFile()
        val c1 = RecorderController(SessionStore(f), clock = { 10_000 })
        c1.start()
        c1.heartRate(110)
        // "process death": new instances over the same file
        val c2 = RecorderController(SessionStore(f), clock = { 70_000 })
        val restored = c2.session.value!!
        assertEquals(RecorderPhase.RUNNING, restored.phase)
        assertEquals(60_000L, restored.elapsedMillis(70_000))
        assertEquals(110, restored.averageBpm)
        c2.stop()
        assertEquals(RecorderPhase.STOPPED, SessionStore(f).load()!!.phase)
        f.delete()
    }

    @Test fun clearDeletesTheFile() {
        val f = tempFile()
        val c = RecorderController(SessionStore(f), clock = { 1 })
        c.start()
        assertEquals(true, f.exists())
        c.clear()
        assertFalse(f.exists())
        assertNull(c.session.value)
    }

    @Test fun startWhileASessionExistsKeepsTheExistingOne() {
        val f = tempFile()
        var now = 100L
        val c = RecorderController(SessionStore(f), clock = { now })
        val first = c.start()
        now = 5_000
        assertEquals(first, c.start())
        f.delete()
    }

    @Test fun corruptOrUnknownFileReadsAsNoSessionAndIsRemoved() {
        val f = tempFile()
        f.writeText("{not json")
        assertNull(SessionStore(f).load())
        assertFalse(f.exists())
        f.writeText("""{"v":99,"phase":"RUNNING","start":1,"before":0,"segment":1}""")
        assertNull(SessionStore(f).load())
        f.delete()
    }

    @Test fun inconsistentPhaseAndSegmentIsRejected() {
        assertNull(SessionStore.decode("""{"v":1,"phase":"RUNNING","start":1,"before":0}"""))
        assertNull(SessionStore.decode("""{"v":1,"phase":"PAUSED","start":1,"before":0,"segment":5}"""))
        assertNull(SessionStore.decode("""{"v":1,"phase":"WHAT","start":1,"before":0}"""))
    }

    @Test fun unknownExtraFieldsAreIgnored() {
        val s = SessionStore.decode("""{"v":1,"phase":"STOPPED","start":1,"before":5000,"future":"x"}""")!!
        assertEquals(5000L, s.activeBeforeSegmentMillis)
    }
}
