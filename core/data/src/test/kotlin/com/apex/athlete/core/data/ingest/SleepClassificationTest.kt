package com.apex.athlete.core.data.ingest

import kotlin.test.Test
import kotlin.test.assertEquals

/** A source flag must not bypass the minimum-duration floor for a main sleep. */
class SleepClassificationTest {
    private fun c(asleep: Int, main: Boolean?, nap: Boolean?) = SleepClassification.classify(asleep, main, nap)

    @Test
    fun aTwentyMinuteSleepFlaggedMainIsNotMain() {
        val r = c(20, main = true, nap = null)
        assertEquals(false, r.isMain)
        assertEquals(true, r.isNap)
    }

    @Test
    fun aTwentyMinuteSleepFlaggedMainAndNotNapIsStillDemoted() {
        val r = c(20, main = true, nap = false)
        assertEquals(false, r.isMain)
        assertEquals(true, r.isNap)
    }

    @Test
    fun justBelowAndAtTheFloor() {
        assertEquals(false, c(179, main = true, nap = null).isMain)
        assertEquals(true, c(180, main = true, nap = null).isMain)
        assertEquals(false, c(180, main = true, nap = null).isNap)
    }

    @Test
    fun unflaggedSleepsFollowTheFloor() {
        assertEquals(SleepClassification.Result(isMain = true, isNap = false), c(420, null, null))
        assertEquals(SleepClassification.Result(isMain = false, isNap = true), c(90, null, null))
    }

    @Test
    fun explicitNapFlagOnALongSleepIsKept() {
        assertEquals(SleepClassification.Result(isMain = false, isNap = true), c(300, main = null, nap = true))
        assertEquals(SleepClassification.Result(isMain = false, isNap = false), c(300, main = false, nap = false))
    }
}
