package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Workout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WorkoutsTest {
    private fun w(startH: Int, startM: Int, endH: Int, endM: Int, type: Int = ExerciseType.RUNNING, distance: Double? = null) =
        Workout(at(TODAY, startH, startM), at(TODAY, endH, endM), type, distanceMeters = distance)

    @Test fun `active minutes merge overlapping sessions`() {
        assertEquals(46L, activeMinutes(listOf(w(18, 0, 18, 46))))
        assertEquals(60L, activeMinutes(listOf(w(18, 0, 18, 46), w(18, 30, 19, 0))))
        assertEquals(76L, activeMinutes(listOf(w(18, 0, 18, 46), w(19, 0, 19, 30))))
        assertEquals(46L, activeMinutes(listOf(w(18, 0, 18, 46), w(18, 10, 18, 20))))
        assertEquals(0L, activeMinutes(emptyList()))
    }

    @Test fun `workouts on a day are sorted by start`() {
        val snap = HealthSnapshot(workouts = listOf(w(18, 0, 18, 46), w(7, 0, 7, 30), Workout(at(TODAY.minusDays(1), 9), at(TODAY.minusDays(1), 10), ExerciseType.YOGA)))
        assertEquals(listOf(at(TODAY, 7), at(TODAY, 18)), workoutsOn(snap, TODAY, IST).map { it.start })
        assertEquals(WeekWorkouts(3, 136), weekWorkouts(snap, TODAY, IST))
        assertEquals(WeekWorkouts(0, 0), weekWorkouts(snap, TODAY.minusDays(10), IST))
    }

    @Test fun `overlap fraction`() {
        val s = at(TODAY, 10)
        val e = at(TODAY, 11)
        assertEquals(1.0, overlapFraction(at(TODAY, 10, 10), at(TODAY, 10, 50), s, e), 1e-9)
        assertEquals(0.5, overlapFraction(at(TODAY, 9, 30), at(TODAY, 10, 30), s, e), 1e-9)
        assertEquals(0.0, overlapFraction(at(TODAY, 8), at(TODAY, 9), s, e), 1e-9)
        assertEquals(1.0, overlapFraction(at(TODAY, 10, 30), at(TODAY, 10, 30), s, e), 1e-9)
        assertEquals(0.0, overlapFraction(at(TODAY, 12), at(TODAY, 12), s, e), 1e-9)
    }

    @Test fun `pace only for foot sports with a distance`() {
        assertEquals(360.0, paceSecondsPerKm(w(7, 0, 7, 30, distance = 5000.0))!!, 1e-9)
        assertNull(paceSecondsPerKm(w(7, 0, 7, 30, type = ExerciseType.BIKING, distance = 5000.0)))
        assertNull(paceSecondsPerKm(w(7, 0, 7, 30)))
        assertNull(paceSecondsPerKm(w(7, 0, 7, 30, distance = 50.0)))
    }

    @Test fun `icons by type`() {
        assertEquals(WorkoutIcon.RUN, workoutIcon(ExerciseType.RUNNING_TREADMILL))
        assertEquals(WorkoutIcon.WALK, workoutIcon(ExerciseType.HIKING))
        assertEquals(WorkoutIcon.STRENGTH, workoutIcon(ExerciseType.HIIT))
        assertEquals(WorkoutIcon.GENERIC, workoutIcon(ExerciseType.GOLF))
        assertEquals(WorkoutIcon.GENERIC, workoutIcon(999))
    }
}
