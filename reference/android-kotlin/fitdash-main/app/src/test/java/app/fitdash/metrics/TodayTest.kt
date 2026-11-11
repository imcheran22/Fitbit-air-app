package app.fitdash.metrics

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
import app.fitdash.health.Workout
import app.fitdash.health.Sample
import app.fitdash.health.SleepSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZonedDateTime

class TodayTest {
    private fun time(h: Int, m: Int = 0): ZonedDateTime = TODAY.atTime(h, m).atZone(IST)

    private val full = history(TODAY, 10, stages = true) +
        day(TODAY, hrv = 46.0, rhr = 58.0, sleepHours = 7.5, stages = true) +
        HealthSnapshot(
            spo2 = listOf(Sample(at(TODAY, 4), 95.0)),
            dailyActivity = listOf(
                DayActivity(TODAY.minusDays(1), 5760, 4300.0, 1820.0),
                DayActivity(TODAY, 8240, 6100.0, 2140.0),
            ),
            generic = listOf(GenericSeries("Weight", "kg", listOf(Sample(at(TODAY, 8), 72.4)))),
        )

    @Test fun `activity is always today and movement is capped`() {
        val t = buildToday(full, time(8, 10))
        assertEquals(TODAY, t.activity!!.date)
        assertEquals(92, t.movementScore)
        val big = HealthSnapshot(dailyActivity = listOf(DayActivity(TODAY, 12000, 9000.0, 2500.0)))
        assertEquals(100, buildToday(big, time(8)).movementScore)
    }

    @Test fun `week series keep empty days`() {
        val t = buildToday(full, time(8))
        listOf(t.readinessWeek.map { it.date }, t.sleepWeek.map { it.date }, t.activityWeek.map { it.date }).forEach {
            assertEquals((6L downTo 0L).map { d -> TODAY.minusDays(d) }, it)
        }
        assertEquals((t.readiness as ReadinessResult.Ready).score, t.readinessWeek.last().score)
        assertEquals(7.125, t.sleepWeek.last().hours!!, 1e-9)
        assertEquals(5760L, t.activityWeek[5].steps)
        assertEquals(8240L, t.activityWeek[6].steps)
        assertEquals(6.1, t.activityWeek[6].distanceKm!!, 1e-9)
        assertNull(t.activityWeek[0].steps)
    }

    @Test fun `suggestions change through the day`() {
        assertEquals(listOf(Suggestion(SuggestionKind.HARD_WORKOUT)), buildToday(full, time(8, 10)).suggestions)
        assertEquals(
            listOf(Suggestion(SuggestionKind.HARD_WORKOUT), Suggestion(SuggestionKind.WALK, 760)),
            buildToday(full, time(21, 30)).suggestions,
        )
    }

    @Test fun `hourly-only steps reach the week series`() {
        val snap = HealthSnapshot(hourlySteps = listOf(HourBucket(at(TODAY, 9), 1000), HourBucket(at(TODAY, 10), 2000)))
        val t = buildToday(snap, time(12))
        assertEquals(3000L, t.activityWeek.last().steps)
        assertEquals(t.activity!!.steps, t.activityWeek.last().steps)
        assertEquals(33, t.movementScore)
    }

    @Test fun `empty snapshot`() {
        val t = buildToday(HealthSnapshot(), time(8))
        assertEquals(ReadinessResult.NoData, t.readiness)
        assertNull(t.movementScore)
        assertTrue(t.suggestions.isEmpty())
        assertTrue(t.readinessWeek.all { it.score == null })
        assertTrue(t.sleepWeek.all { it.hours == null })
        assertTrue(t.activityWeek.all { it.steps == null })
    }


    @Test fun `a past date shows that day without suggestions`() {
        val t = buildToday(full, time(21, 30), date = TODAY.minusDays(1))
        assertEquals(TODAY.minusDays(1), t.date)
        assertFalse(t.isToday)
        assertEquals(5760L, t.activity!!.steps)
        assertTrue(t.suggestions.isEmpty())
        assertEquals(TODAY.minusDays(1), t.trend.last().date)
    }

    @Test fun `previous day scores for deltas`() {
        val t = buildToday(full, time(8))
        assertEquals(64, t.previous.movement)
        assertEquals(t.trend[t.trend.size - 2].recovery, t.previous.readiness)
    }

    @Test fun `movement delta on today compares with yesterday at the same hour`() {
        val y = TODAY.minusDays(1)
        val hourly = listOf(HourBucket(at(y, 7), 1000), HourBucket(at(y, 8), 1000), HourBucket(at(y, 12), 3000), HourBucket(at(TODAY, 8), 2500))
        val snap = HealthSnapshot(hourlySteps = hourly, dailyActivity = listOf(DayActivity(y, 5000, 0.0, 0.0), DayActivity(TODAY, 2500, 0.0, 0.0)))
        assertEquals(22, buildToday(snap, time(8, 10)).previous.movement) // 2,000 of 9,000 by 08:xx yesterday
        assertEquals(56, buildToday(snap, time(23)).previous.movement) // all of yesterday by 23:xx
    }

    @Test fun `past day movement delta uses the full previous day`() {
        val y = TODAY.minusDays(1)
        val snap = HealthSnapshot(
            hourlySteps = listOf(HourBucket(at(y.minusDays(1), 7), 1000), HourBucket(at(y.minusDays(1), 20), 8000)),
            dailyActivity = listOf(DayActivity(y.minusDays(1), 9000, 0.0, 0.0), DayActivity(y, 5000, 0.0, 0.0)),
        )
        assertEquals(100, buildToday(snap, time(8), date = y).previous.movement)
    }

    @Test fun `workouts heart day and window reach TodayData`() {
        val w = Workout(at(TODAY, 18), at(TODAY, 18, 46), ExerciseType.RUNNING, distanceMeters = 5100.0)
        val hr = (0 until 60).map { Sample(at(TODAY, 9).plusSeconds(it * 60L), 70.0 + it % 5) }
        val t = buildToday(full + HealthSnapshot(workouts = listOf(w), heartRate = hr), time(20))
        assertEquals(listOf(w), t.workouts)
        assertEquals(46L, t.activity!!.activeMinutes)
        assertEquals(WeekWorkouts(1, 46), t.weekWorkouts)
        assertEquals(74, t.heartDay!!.max)
        assertEquals(29L, t.daysBack)
        val long = buildToday(full.copy(windowDays = 180), time(20))
        assertEquals(179L, long.daysBack)
        assertEquals(180, long.trend.size)
        assertEquals(180, long.series.getValue(MetricKind.STEPS).size)
    }

    @Test fun `goals feed movement`() {
        assertEquals(100, buildToday(full, time(8), goals = Goals(steps = 5000)).movementScore)
    }

    @Test fun `naps are listed and the trend covers 30 days`() {
        val nap = SleepSession(at(TODAY, 14), at(TODAY, 14, 40), emptyList())
        val t = buildToday(full + HealthSnapshot(sleep = listOf(nap)), time(18))
        assertEquals(listOf(nap), t.naps)
        assertEquals(30, t.trend.size)
        assertTrue(TODAY in t.daysWithData)
    }

    @Test fun `water is the total for the selected date`() {
        val snap = HealthSnapshot(waterDaily = mapOf(TODAY to 1.25, TODAY.minusDays(1) to 2.0))
        assertEquals(1.25, buildToday(snap, time(20)).waterLiters, 0.0001)
        assertEquals(2.0, buildToday(snap, time(20), TODAY.minusDays(1)).waterLiters, 0.0001)
        assertEquals(0.0, buildToday(snap, time(20), TODAY.minusDays(2)).waterLiters, 0.0001)
        assertEquals(2.5, buildToday(snap, time(20)).waterGoal, 0.0001)
        assertEquals(3.0, buildToday(snap, time(20), goals = Goals(waterLiters = 3.0)).waterGoal, 0.0001)
    }

    @Test fun `bmi needs both height and weight`() {
        assertNull(buildToday(HealthSnapshot(heightMeters = 1.75), time(20)).bmi)
        assertNull(buildToday(HealthSnapshot(weightKg = 70.0), time(20)).bmiBand)
        val t = buildToday(HealthSnapshot(heightMeters = 1.75, weightKg = 70.0), time(20))
        assertEquals(22.86, t.bmi!!, 0.005)
        assertEquals(BmiBand.HEALTHY, t.bmiBand)
    }

    @Test fun `goals expose age from birth year`() {
        assertEquals(36, Goals(birthYear = 1990).age(2026))
        assertNull(Goals().age(2026))
    }

    @Test fun `regularity is computed from the snapshot's sleep`() {
        val t = buildToday(history(TODAY, 14, sleepHours = 8.0) + day(TODAY, sleepHours = 8.0), time(8, 10))
        assertEquals(100, t.regularity!!.value.sri)
        assertNull(buildToday(history(TODAY, 3, sleepHours = 8.0), time(8, 10)).regularity)
    }

    @Test fun `bedtime falls back to the median of three nights before regularity calibrates`() {
        val nights = HealthSnapshot(sleep = listOf(
            SleepSession(at("2026-10-08", "23:00"), at("2026-10-09", "07:00"), emptyList()),
            SleepSession(at("2026-10-09", "23:30"), at("2026-10-10", "07:30"), emptyList()),
            SleepSession(at("2026-10-11", "01:00"), at("2026-10-11", "07:00"), emptyList()),
        ))
        val nap = HealthSnapshot(sleep = listOf(SleepSession(at("2026-10-10", "14:00"), at("2026-10-10", "14:40"), emptyList())))
        val later = HealthSnapshot(sleep = listOf(SleepSession(at("2026-10-11", "23:50"), at("2026-10-12", "07:00"), emptyList())))
        val t = buildToday(nights + nap + later, time(8, 10))
        assertNull(t.regularity)
        assertEquals(java.time.LocalTime.of(23, 30), t.bedtime)
        assertNull(buildToday(HealthSnapshot(sleep = nights.sleep.take(2)) + nap + later, time(8, 10)).bedtime)
    }
}
