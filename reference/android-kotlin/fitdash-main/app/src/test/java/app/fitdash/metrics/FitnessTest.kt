package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.roundToInt

class FitnessTest {
    @Test fun `PA-R from workouts and steps follows the table`() {
        assertEquals(0, paRating(0.0, 2000.0))
        assertEquals(1, paRating(0.0, 3000.0))
        assertEquals(1, paRating(0.0, 6999.0))
        assertEquals(2, paRating(0.0, 7000.0))
        assertEquals(2, paRating(30.0, 4000.0))
        assertEquals(3, paRating(60.0, 4000.0))
        assertEquals(3, paRating(89.9, 4000.0))
        assertEquals(4, paRating(90.0, 4000.0))
        assertEquals(4, paRating(30.0, 10000.0))
        assertEquals(5, paRating(150.0, 4000.0))
        assertEquals(6, paRating(240.0, 4000.0))
        assertEquals(7, paRating(420.0, 4000.0))
        assertEquals(7, paRating(900.0, 0.0))
    }

    @Test fun `Jackson 1990 worked example`() {
        // 56.363 + 1.921*3 - 0.381*40 - 0.754*25 + 10.987 = 39.023
        assertEquals(39.02, jacksonVo2(40, Gender.MALE, 25.0, 3), 0.01)
        assertEquals(28.04, jacksonVo2(40, Gender.FEMALE, 25.0, 3), 0.01)
    }

    @Test fun `fitness age is a fixed point at the reference inputs`() {
        for (age in 18..90) {
            for (g in Gender.entries) {
                assertEquals(age, fitnessAge(age, g, 25.0, 3).value.years)
            }
        }
    }

    @Test fun `fitter inputs give a younger fitness age and the sheet lists them`() {
        val r = fitnessAge(40, Gender.MALE, 22.0, 6)
        assertTrue(r.value.years < 40)
        assertEquals(40, r.value.realAge)
        assertEquals(listOf("Age" to "40", "Gender" to "Male", "BMI" to "22.0", "Activity rating" to "6 of 7"), r.explanation.inputs)
        assertEquals("Jackson et al. 1990", r.explanation.source.title)
    }

    @Test fun `fitness age clamps to 18 and 90`() {
        assertEquals(18, fitnessAge(20, Gender.MALE, 15.0, 7).value.years)
        assertEquals(90, fitnessAge(85, Gender.FEMALE, 45.0, 0).value.years)
    }

    @Test fun `Uth 2004 VO2 estimate`() {
        // max HR 208 - 0.7*30 = 187; 15.3 * 187/60 = 47.68
        val r = vo2Estimate(30, 60.0)
        assertEquals(47.7, r.value, 0.05)
        assertEquals(listOf("Age" to "30", "Max HR" to "187 bpm (208 − 0.7 × age)", "Resting HR" to "60 bpm"), r.explanation.inputs)
        assertEquals("Uth et al. 2004", r.explanation.source.title)
    }

    @Test fun `activity factor bands`() {
        assertEquals(1.2, activityFactor(4999.0), 0.0)
        assertEquals(1.375, activityFactor(5000.0), 0.0)
        assertEquals(1.55, activityFactor(7500.0), 0.0)
        assertEquals(1.725, activityFactor(10000.0), 0.0)
        assertEquals(1.9, activityFactor(12500.0), 0.0)
    }

    @Test fun `Mifflin-St Jeor worked example`() {
        // 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
        val m = calories(30, Gender.MALE, 70.0, 175.0, 8000.0)
        assertEquals(1649, m.value.resting)
        assertEquals((1648.75 * 1.55).roundToInt(), m.value.daily)
        // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
        assertEquals(1320, calories(30, Gender.FEMALE, 60.0, 165.0, 1000.0).value.resting)
        assertEquals("Mifflin et al. 1990", m.explanation.source.title)
    }

    @Test fun `sleep debt sums shortfall and ignores missing nights`() {
        val d = sleepDebt(listOf(6.0, 7.5, null, 9.0, 5.0, 8.0, 7.0), 8.0)
        assertEquals(2.0 + 0.5 + 0.0 + 0.0 + 3.0 + 0.0 + 1.0, d.value.hours, 1e-9)
        assertEquals(listOf(2.0, 0.5, 0.0, 0.0, 3.0, 0.0, 1.0), d.value.nights)
        assertEquals("Sleep goal" to "8.0 h", d.explanation.inputs.first())
    }

    @Test fun `training load needs four workouts in 28 days`() {
        val quiet = List(28) { 0L }
        assertEquals(null, trainingLoad(quiet))
        val three = quiet.toMutableList().also { it[27] = 30; it[20] = 30; it[10] = 30 }
        assertEquals(null, trainingLoad(three))
    }

    @Test fun `training load ratio and bands`() {
        // 4 weeks of one 60-minute workout a week: acute 60, chronic weekly 60, ratio 1.0
        val steady = List(28) { i -> if (i % 7 == 6) 60L else 0L }
        val s = trainingLoad(steady)!!
        assertEquals(1.0, s.value.ratio, 1e-9)
        assertEquals(LoadBand.STEADY, s.value.band)
        // last week doubled: acute 120, chronic (60*3+120)/4 = 75, ratio 1.6
        val ramp = steady.toMutableList().also { it[27] = 120 }
        assertEquals(LoadBand.RAMPING, trainingLoad(ramp)!!.value.band)
        // last week skipped but 4 earlier workouts: acute 0, ratio 0
        val ease = steady.toMutableList().also { it[27] = 0; it[0] = 60 }
        assertEquals(LoadBand.EASING, trainingLoad(ease)!!.value.band)
        assertEquals("Gabbett 2016", s.explanation.source.title)
    }
}
