package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.day
import app.fitdash.history
import app.fitdash.plus
import app.fitdash.health.DayActivity
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.HourBucket
import app.fitdash.health.Workout
import app.fitdash.health.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SummariesTest {
    private val activity = HealthSnapshot(
        dailyActivity = listOf(DayActivity(TODAY, 8240, 6100.0, 2140.0)),
        hourlySteps = listOf(
            HourBucket(at(TODAY.minusDays(1), 23), 500),
            HourBucket(at(TODAY, 9), 3000),
            HourBucket(at(TODAY, 18), 5240),
        ),
        workouts = listOf(Workout(at(TODAY, 18), at(TODAY, 18, 46), ExerciseType.RUNNING)),
    )

    @Test fun `activity summary for a day`() {
        val a = activitySummary(activity, TODAY, IST)!!
        assertEquals(8240L, a.steps)
        assertEquals(92, a.goalPercent)
        assertEquals(24, a.hourly.size)
        assertEquals(3000L, a.hourly[9])
        assertEquals(5240L, a.hourly[18])
        assertEquals(8240L, a.hourly.sum())
        assertEquals(46L, a.activeMinutes)
        assertEquals(6.1, a.distanceKm, 1e-9)
        assertEquals(2140.0, a.kcal, 1e-9)
    }

    @Test fun `no activity summary without data`() {
        assertNull(activitySummary(activity, TODAY.minusDays(3), IST))
    }

    @Test fun `heart summary with baselines and trend`() {
        val snap = history(TODAY, 10) + day(TODAY, hrv = 46.0, rhr = 58.0)
        val h = heartSummary(snap, TODAY, IST)!!
        assertEquals(46.0, h.hrv!!, 0.0)
        assertEquals(40.0, h.hrvBaseline!!, 0.0)
        assertEquals(58.0, h.restingHr!!, 0.0)
        assertEquals(60.0, h.restingHrBaseline!!, 0.0)
        assertEquals(11, h.hrvTrend.size)
        assertEquals(46.0, h.hrvTrend.last(), 0.0)
        assertEquals(11, h.restingHrTrend.size)
        assertEquals(58.0, h.restingHrTrend.last(), 0.0)
        assertEquals(40.0..40.0, h.hrvRange)
        assertEquals(60.0..60.0, h.restingHrRange)
    }

    @Test fun `no heart summary without HRV or resting HR`() {
        assertNull(heartSummary(HealthSnapshot(), TODAY, IST))
    }

    @Test fun `vitals show last night against baseline`() {
        val spo2 = (1..5).map { Sample(at(TODAY.minusDays(it.toLong()), 4), 96.0) } + Sample(at(TODAY, 4), 94.0)
        val v = vitals(HealthSnapshot(spo2 = spo2), TODAY, IST)
        assertEquals(listOf(VitalReading("SpO₂", "%", 94.0, 96.0, 96.0..96.0, Good.HIGHER, MetricKind.SPO2)), v)
    }

    @Test fun `vitals are empty when last night has none`() {
        val spo2 = listOf(Sample(at(TODAY.minusDays(1), 4), 96.0))
        assertTrue(vitals(HealthSnapshot(spo2 = spo2), TODAY, IST).isEmpty())
    }
}
