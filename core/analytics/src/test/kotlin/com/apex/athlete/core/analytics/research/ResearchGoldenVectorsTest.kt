package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.Sex
import com.apex.athlete.core.analytics.strain.Trimp
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Golden vectors of the research (Part 3 section 8.1) that belong to engines outside the
 * `research` package: T-EX02-a/b (Banister TRIMP) and T-EX04-a (descriptive ACWR).
 */
class ResearchGoldenVectorsTest {

    @Test
    fun `T-EX02-a Banister TRIMP for a man`() {
        val profile = CardioProfile(restingHeartRate = 60.0, maxHeartRate = 185.0, sex = Sex.MALE)
        assertEquals(63.0, 45 * Trimp.perMinute(140.0, profile), 0.05)
    }

    @Test
    fun `T-EX02-b Banister TRIMP for a woman`() {
        val profile = CardioProfile(restingHeartRate = 60.0, maxHeartRate = 185.0, sex = Sex.FEMALE)
        assertEquals(72.1, 45 * Trimp.perMinute(140.0, profile), 0.05)
    }

    @Test
    fun `T-EX04-a descriptive EWMA ACWR`() {
        val daily = List(3) { listOf(200.0, 0.0, 300.0, 250.0, 0.0, 400.0, 100.0) }.flatten() +
            listOf(300.0, 0.0, 450.0, 500.0, 0.0, 600.0, 350.0)
        val r = TrainingLoadEngine().analyze(daily.mapIndexed { i, v -> DailyLoad(100L + i, v) }, 100L + daily.size - 1)
        assertEquals(1.363, r.acwrCoupled!!, 1e-3)
        // The research's "rolling" ratio: mean of the last 7 days over the mean of the last 28.
        assertEquals(1.479, daily.takeLast(7).average() / daily.average(), 1e-3)
    }
}
