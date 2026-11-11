package org.openstrap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoachingTest {
    /** Feeds [zone] once a second for [seconds] from [from]; the cues that came, with when. */
    private fun Coach.run(from: Long, seconds: Int, zone: Int): List<Pair<Long, Cue>> =
        (0 until seconds).mapNotNull { i -> feed(from + i, zone, from + i)?.let { (from + i) to it } }

    @Test
    fun warmingUpBelowTheTargetIsNotADrift() {
        val c = Coach(WorkoutTarget.Zones(1, 2))
        assertEquals(emptyList<Pair<Long, Cue>>(), c.run(0, 120, 0))
        // Reaching the target from the warm-up does say so.
        assertEquals(listOf(15L to Cue.BackInTarget).map { (t, cue) -> 120 + t to cue }, c.run(120, 60, 1))
    }

    @Test
    fun driftingAboveBuzzesAfterFifteenSecondsAndBackInAgain() {
        val c = Coach(WorkoutTarget.Zones(1, 2))
        c.run(0, 60, 2)
        assertEquals(listOf(75L to Cue.AboveTarget), c.run(60, 60, 3))
        assertEquals(listOf(135L to Cue.BackInTarget), c.run(120, 60, 1))
    }

    @Test
    fun aShortSpikeNeverBuzzes() {
        val c = Coach(WorkoutTarget.Zones(1, 2))
        c.run(0, 60, 1)
        assertEquals(emptyList<Pair<Long, Cue>>(), c.run(60, 10, 4))
        assertEquals(emptyList<Pair<Long, Cue>>(), c.run(70, 60, 1))
    }

    @Test
    fun zoneCuesKeepFortySecondsApart() {
        val c = Coach(WorkoutTarget.Zones(1, 1))
        c.run(0, 30, 1)
        assertEquals(listOf(45L to Cue.BelowTarget), c.run(30, 20, 0))
        // Back in after 15 s at 65, but the last cue was at 45: it waits until 85.
        assertEquals(listOf(85L to Cue.BackInTarget), c.run(50, 60, 1))
    }

    @Test
    fun timeTargetHalfwayThenGoal() {
        val c = Coach(WorkoutTarget.Time(600))
        assertNull(c.feed(0, 1, 299))
        assertEquals(Cue.Halfway, c.feed(1, 1, 300))
        assertNull(c.feed(2, 1, 301))
        assertEquals(Cue.GoalReached, c.feed(3, 1, 600))
        assertNull(c.feed(4, 1, 700))
    }

    @Test
    fun targetCodesRoundTrip() {
        WorkoutTarget.presets.forEach { assertEquals(it, WorkoutTarget.parse(it.code)) }
        assertNull(WorkoutTarget.parse(null))
        assertNull(WorkoutTarget.parse("x:1"))
    }

    @Test
    fun kcalTargetCodeAndLabel() {
        assertEquals("k:300", WorkoutTarget.Kcal(300).code)
        assertEquals("300 kcal", WorkoutTarget.Kcal(300).label)
        assertEquals(WorkoutTarget.Kcal(500), WorkoutTarget.parse("k:500"))
        assertNull(WorkoutTarget.parse("k:0"))
        assertNull(WorkoutTarget.parse("k:abc"))
    }

    @Test
    fun kcalPresetsOnlyWithAProfile() {
        assertEquals(listOf(300, 500, 800), WorkoutTarget.offered(true).filterIsInstance<WorkoutTarget.Kcal>().map { it.kcal })
        // After the ones there were.
        assertEquals(WorkoutTarget.Time(60 * 60), WorkoutTarget.offered(true)[6])
        assertTrue(WorkoutTarget.offered(false).none { it is WorkoutTarget.Kcal })
        assertEquals(7, WorkoutTarget.offered(false).size)
    }

    @Test
    fun kcalTargetBuzzesOnceWhenReached() {
        val c = Coach(WorkoutTarget.Kcal(300))
        assertNull(c.kcal(100, 120f))
        assertNull(c.kcal(105, 299.9f))
        assertNull(c.reachedAt)
        assertEquals(Cue.GoalReached, c.kcal(110, 300f))
        assertEquals(110L, c.reachedAt)
        // The figure never goes down, and past the target it stays quiet.
        assertNull(c.kcal(115, 340f))
        assertNull(c.kcal(400, 900f))
        assertEquals(110L, c.reachedAt)
        // Readings don't buzz a kcal target: there's no time or zone to it.
        assertNull(c.feed(120, 4, 5000))
    }

    @Test
    fun kcalTargetReachedBeforeAPickUpNeverBuzzesAgain() {
        val c = Coach(WorkoutTarget.Kcal(300), reachedAt = 900)
        assertNull(c.kcal(1000, 320f))
        assertEquals(900L, c.reachedAt)
    }

    @Test
    fun otherTargetsIgnoreKcal() {
        assertNull(Coach(WorkoutTarget.Time(600)).kcal(10, 5000f))
        assertNull(Coach(WorkoutTarget.Zones(1, 2)).kcal(10, 5000f))
        assertNull(Coach(null).kcal(10, 5000f))
    }
}
