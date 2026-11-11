package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.history
import app.fitdash.plus
import app.fitdash.health.DayActivity
import app.fitdash.health.GenericSeries
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import app.fitdash.health.Workout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FitnessDataTest {
    private val year = TODAY.year
    private val goals = Goals(sleepHours = 8.0, birthYear = year - 40, gender = Gender.MALE)

    private fun base(workoutDays: Int = 0): HealthSnapshot {
        val workouts = (0 until workoutDays).map { i ->
            val d = TODAY.minusDays((i * 7 + 1).toLong())
            Workout(at(d, 18), at(d, 19), 56, app = "app")
        }
        return history(TODAY, 28, rhr = 60.0, sleepHours = 7.0) + HealthSnapshot(
            heightMeters = 1.75, weightKg = 70.0,
            dailyActivity = (1..28).map { DayActivity(TODAY.minusDays(it.toLong()), 8000, 6000.0, 2000.0) },
            workouts = workouts,
        )
    }

    @Test fun `all cards compute with full inputs`() {
        val f = fitness(base(4), TODAY, IST, goals)
        assertNotNull(f.fitnessAge)
        assertNotNull(f.vo2Estimate)
        assertNotNull(f.calories)
        assertNotNull(f.trainingLoad)
        // The fixture has no night ending today, so six of the seven nights are an hour short.
        assertEquals(6.0, f.sleepDebt.value.hours, 1e-9)
        assertTrue(f.missing.isEmpty())
        assertEquals(30, f.fitnessAgeSeries.size) // one point per day of the snapshot window
        assertEquals(f.fitnessAge!!.value.years.toDouble(), f.fitnessAgeSeries.last().value!!, 0.0)
    }

    @Test fun `no gender hides fitness age and calories but not the rest`() {
        val f = fitness(base(4), TODAY, IST, goals.copy(gender = null))
        assertNull(f.fitnessAge)
        assertNull(f.calories)
        assertNotNull(f.vo2Estimate)
        assertNotNull(f.trainingLoad)
        assertEquals(MissingInput.GENDER, f.missing[FitnessCard.FITNESS_AGE])
        assertEquals(MissingInput.GENDER, f.missing[FitnessCard.CALORIES])
        assertFalse(f.missing.containsKey(FitnessCard.VO2))
    }

    @Test fun `no birth year reports BIRTH_YEAR first`() {
        val f = fitness(base(), TODAY, IST, goals.copy(birthYear = null, gender = null))
        assertEquals(MissingInput.BIRTH_YEAR, f.missing[FitnessCard.FITNESS_AGE])
        assertEquals(MissingInput.BIRTH_YEAR, f.missing[FitnessCard.VO2])
        assertNull(f.vo2Estimate)
    }

    @Test fun `missing weight or height reports it and no resting HR hides the estimate`() {
        val noWeight = base().copy(weightKg = null)
        assertEquals(MissingInput.WEIGHT, fitness(noWeight, TODAY, IST, goals).missing[FitnessCard.FITNESS_AGE])
        val noRhr = base().copy(restingHr = emptyList())
        val f = fitness(noRhr, TODAY, IST, goals)
        assertNull(f.vo2Estimate)
        assertEquals(MissingInput.RESTING_HR, f.missing[FitnessCard.VO2])
    }

    @Test fun `a watch-written VO2 max suppresses the estimate`() {
        val snap = base() + HealthSnapshot(generic = listOf(GenericSeries("VO₂ max", "ml/kg/min", listOf(Sample(at(TODAY, 8), 45.0)))))
        val f = fitness(snap, TODAY, IST, goals)
        assertTrue(f.watchVo2)
        assertNull(f.vo2Estimate)
    }

    @Test fun `fewer than four workout days gives no training load`() {
        assertNull(fitness(base(3), TODAY, IST, goals).trainingLoad)
    }

    @Test fun `buildToday carries fitness`() {
        val t = buildToday(base(4), TODAY.atTime(9, 0).atZone(IST), goals = goals)
        assertNotNull(t.fitness.fitnessAge)
    }
}
