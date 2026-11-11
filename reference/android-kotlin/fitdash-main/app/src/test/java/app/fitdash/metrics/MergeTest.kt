package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.health.GenericSeries
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.HourBucket
import app.fitdash.health.Sample
import app.fitdash.health.SleepSession
import app.fitdash.health.SourceStatus
import app.fitdash.health.Workout
import app.fitdash.health.latestDataTime
import app.fitdash.health.mergedWith
import app.fitdash.health.syncApp
import app.fitdash.night
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MergeTest {
    private val now = TODAY.atTime(9, 0).atZone(IST)
    private val cutoff = TODAY.minusDays(2).atStartOfDay(IST).toInstant()

    @Test fun `samples before the cutoff come from the cache, after it from the fresh read`() {
        val old = HealthSnapshot(hrv = listOf(Sample(at(TODAY.minusDays(5), 5), 40.0), Sample(at(TODAY.minusDays(1), 5), 41.0)))
        val fresh = HealthSnapshot(hrv = listOf(Sample(at(TODAY.minusDays(1), 5), 45.0), Sample(at(TODAY, 5), 46.0)))
        val merged = old.mergedWith(fresh, cutoff, now)
        assertEquals(listOf(40.0, 45.0, 46.0), merged.hrv.map { it.value })
    }

    @Test fun `cached data older than the window is dropped`() {
        val old = HealthSnapshot(hrv = listOf(Sample(at(TODAY.minusDays(40), 5), 1.0), Sample(at(TODAY.minusDays(10), 5), 2.0)))
        val merged = old.mergedWith(HealthSnapshot(), cutoff, now)
        assertEquals(listOf(2.0), merged.hrv.map { it.value })
    }

    @Test fun `sessions are kept by their end and aggregates are replaced`() {
        val oldNight = night(TODAY.minusDays(4), 7.0)
        val overlap = night(TODAY.minusDays(1), 6.0)
        val old = HealthSnapshot(
            sleep = listOf(oldNight, overlap),
            hourlySteps = listOf(HourBucket(at(TODAY.minusDays(3), 9), 100)),
            workouts = listOf(Workout(at(TODAY.minusDays(3), 7), at(TODAY.minusDays(3), 8), ExerciseType.RUNNING)),
        )
        val freshNight = night(TODAY.minusDays(1), 6.5)
        val fresh = HealthSnapshot(
            sleep = listOf(freshNight),
            hourlySteps = listOf(HourBucket(at(TODAY, 9), 200)),
            workouts = listOf(Workout(at(TODAY, 7), at(TODAY, 8), ExerciseType.WALKING)),
        )
        val merged = old.mergedWith(fresh, cutoff, now)
        assertEquals(listOf(oldNight, freshNight), merged.sleep)
        assertEquals(listOf(200L), merged.hourlySteps.map { it.steps })
        assertEquals(2, merged.workouts.size)
    }

    @Test fun `generic series merge per label and sources keep hasData`() {
        val old = HealthSnapshot(
            generic = listOf(GenericSeries("Weight", "kg", listOf(Sample(at(TODAY.minusDays(5), 8), 72.0)))),
            sources = listOf(SourceStatus("Weight", true, true, setOf("app.a"))),
        )
        val fresh = HealthSnapshot(
            generic = listOf(GenericSeries("Weight", "kg", listOf(Sample(at(TODAY, 8), 71.5))), GenericSeries("VO₂ max", "ml/kg/min", listOf(Sample(at(TODAY, 8), 40.0)))),
            sources = listOf(SourceStatus("Weight", true, false, emptySet())),
        )
        val merged = old.mergedWith(fresh, cutoff, now)
        assertEquals(listOf(72.0, 71.5), merged.generic.first { it.label == "Weight" }.points.map { it.value })
        assertEquals(1, merged.generic.count { it.label == "VO₂ max" })
        assertEquals(SourceStatus("Weight", true, true, setOf("app.a")), merged.sources.first())
    }

    @Test fun `latest data time and sync app`() {
        val snap = HealthSnapshot(
            heartRate = listOf(Sample(at(TODAY, 8), 60.0)),
            hourlySteps = listOf(HourBucket(at(TODAY, 9), 50), HourBucket(at(TODAY, 10), 0)),
            sleep = listOf(SleepSession(at(TODAY.minusDays(1), 23), at(TODAY, 7), emptyList())),
            sources = listOf(
                SourceStatus("Steps", true, true, setOf("com.google.android.apps.fitness", "com.fitbit.FitbitMobile")),
                SourceStatus("Sleep", true, true, setOf("com.fitbit.FitbitMobile")),
            ),
        )
        assertEquals(at(TODAY, 9), snap.latestDataTime())
        assertEquals("com.fitbit.FitbitMobile", snap.syncApp())
        assertNull(HealthSnapshot().latestDataTime())
        assertNull(HealthSnapshot().syncApp())
    }
}
