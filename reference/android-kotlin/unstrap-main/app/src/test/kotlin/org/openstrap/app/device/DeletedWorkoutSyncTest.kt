package org.openstrap.app.device

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import org.openstrap.app.data.db.DeletedWorkout
import org.openstrap.protocol.history.RecoveryHeartRate
import org.openstrap.protocol.history.SpotHeartRate
import org.openstrap.protocol.history.SportEffect
import org.openstrap.protocol.history.WorkoutDetail
import org.openstrap.protocol.history.WorkoutSummary

/** A sync leaves out what belongs to strap workouts deleted in OpenStrap, and only that. */
class DeletedWorkoutSyncTest {
    private val gone = 1_760_000_000L
    private val kept = gone + 4 * 3600

    private fun summary(start: Long) = WorkoutSummary(start, 16, 1, 1800, 1800, null, 110, 130, 80, null, null, 10, null, null)
    private fun effect(end: Long) = SportEffect(end, null, null, null, null, null, 60, null, null, null, null, null)

    private val records = listOf(
        summary(gone), WorkoutDetail(gone, listOf(gone * 1000 to 100), emptyList()), RecoveryHeartRate(gone, listOf(100, 90)), effect(gone + 1800),
        summary(kept), WorkoutDetail(kept, listOf(kept * 1000 to 140), emptyList()), RecoveryHeartRate(kept, listOf(120)), effect(kept + 2400),
        SpotHeartRate(gone + 60, 0, 100),
    )

    @Test
    fun skipsTheDeletedWorkoutsRecords() {
        val left = withoutDeletedWorkouts(records, listOf(DeletedWorkout(gone, gone + 1800, 1)))
        assertEquals(records.drop(4), left)
    }

    @Test
    fun keepsAnEffectNotDeletedWithIt() {
        // Its effect was the next workout's, so it stayed and may still arrive.
        val left = withoutDeletedWorkouts(records, listOf(DeletedWorkout(gone, null, 1)))
        assertEquals(listOf(effect(gone + 1800)) + records.drop(4), left)
    }

    @Test
    fun nothingDeletedKeepsEverything() {
        assertSame(records, withoutDeletedWorkouts(records, emptyList()))
    }
}
