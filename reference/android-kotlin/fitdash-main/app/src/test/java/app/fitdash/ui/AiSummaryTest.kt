package app.fitdash.ui

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.day
import app.fitdash.history
import app.fitdash.plus
import app.fitdash.health.DayActivity
import app.fitdash.health.GenericSeries
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.HourBucket
import app.fitdash.health.Sample
import app.fitdash.metrics.Gender
import app.fitdash.metrics.Goals
import app.fitdash.metrics.buildToday
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AiSummaryTest {
    private val now = TODAY.atTime(8, 10).atZone(IST)
    private val snap = history(TODAY, 10) + day(TODAY, hrv = 40.0, rhr = 60.0, sleepHours = 6.4) +
        HealthSnapshot(generic = listOf(GenericSeries("Weight", "kg", listOf(Sample(at(TODAY, 8), 72.4)))))
    private val text = aiSummary(snap, buildToday(snap, now), now)

    @Test fun `header and today line`() {
        assertTrue(text.startsWith("My health data from fitdash (Health Connect), generated 2026-10-11 08:10.\n"))
        assertTrue(
            text.contains(
                "Today: recovery 73 (Primed), sleep 6h 24m (score 80), HRV 40 ms (baseline 40), " +
                    "resting HR 60 bpm (baseline 60), steps so far no data.",
            ),
        )
    }

    @Test fun `AI rows keep empty days`() {
        assertEquals(30, text.lines().count { it.startsWith("2026-") })
        assertTrue(text.contains("\n2026-09-12, , , , , \n"))
        assertTrue(text.contains("\n2026-10-10, 79, 8.0, 40, 60, \n"))
        assertTrue(text.contains("\n2026-10-11, 73, 6.4, 40, 60, \n"))
    }

    @Test fun `hourly-only steps fill today's row`() {
        val s = HealthSnapshot(hourlySteps = listOf(HourBucket(at(TODAY, 9), 1000), HourBucket(at(TODAY, 10), 2000)))
        val t = aiSummary(s, buildToday(s, now), now)
        assertTrue(t.contains("steps so far 3,000."))
        assertTrue(t.contains("\n2026-10-11, , , , , 3000"))
    }

    @Test fun `past date header names the date and has no Today`() {
        val day = TODAY.minusDays(2)
        val t = aiSummary(snap, buildToday(snap, now, day), now)
        assertTrue(t.contains("\nFri 9 Oct: recovery "))
        assertTrue(!t.contains("Today"))
        assertTrue(!t.contains("steps so far"))
        assertTrue(t.contains("\n2026-10-09, "))
        assertTrue(!t.contains("\n2026-10-10, "))
    }

    @Test fun `other data line`() {
        assertTrue(text.endsWith("Other data (latest): Weight 72.4 kg"))
    }

    @Test fun `summary carries a fitness block`() {
        val goals = Goals(birthYear = TODAY.year - 40, gender = Gender.MALE)
        val snap = history(TODAY, 28, rhr = 60.0, sleepHours = 7.0) + HealthSnapshot(heightMeters = 1.75, weightKg = 70.0,
            dailyActivity = (1..28).map { DayActivity(TODAY.minusDays(it.toLong()), 8000, 6000.0, 2000.0) })
        val data = buildToday(snap, TODAY.atTime(9, 0).atZone(IST), goals = goals)
        val text = aiSummary(snap, data, TODAY.atTime(9, 0).atZone(IST))
        assertTrue(text.contains("Fitness (published formulas):"))
        assertTrue(text.contains("fitness age ${data.fitness.fitnessAge!!.value.years}"))
        assertTrue(text.contains("sleep debt 6.0 h"))
    }
}
