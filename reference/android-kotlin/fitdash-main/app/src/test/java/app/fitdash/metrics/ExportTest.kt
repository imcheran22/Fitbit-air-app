package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import app.fitdash.health.Workout
import app.fitdash.history
import app.fitdash.at
import app.fitdash.settings.DayJournal
import app.fitdash.settings.Tag
import org.junit.Assert.assertEquals
import org.junit.Test

class ExportTest {
    private val now = TODAY.atTime(8, 0).atZone(IST)
    private val snap = history(TODAY, 5)

    @Test fun `daily header is exact`() {
        assertEquals(
            "date,recovery,sleep_score,hours_asleep,efficiency,awakenings,hrv_ms,resting_hr,steps,distance_km,calories,active_minutes,water_l,tags",
            dailyCsv(snap, now, Goals(), emptyMap()).lines().first(),
        )
    }

    @Test fun `tags are joined in the last column`() {
        val yesterday = TODAY.minusDays(1)
        val csv = dailyCsv(snap, now, Goals(), mapOf(yesterday to DayJournal(tags = setOf(Tag.ALCOHOL, Tag.STRESS))))
        assertEquals(true, csv.lines().first { it.startsWith("$yesterday,") }.endsWith(",alcohol|stress"))
    }

    @Test fun `missing values are empty fields`() {
        val csv = dailyCsv(snap, now, Goals(), emptyMap())
        assertEquals(false, csv.contains("null"))
        val empty = TODAY.minusDays(20)
        assertEquals("$empty,,,,,,,,,,,,,", csv.lines().first { it.startsWith("$empty,") })
    }

    @Test fun `rows run from the window start to today`() {
        val rows = dailyCsv(snap, now, Goals(), emptyMap()).lines().drop(1).filter { it.isNotEmpty() }
        assertEquals(30, rows.size)
        assertEquals(true, rows.first().startsWith("${TODAY.minusDays(29)},"))
        assertEquals(true, rows.last().startsWith("$TODAY,"))
    }

    @Test fun `journal has one row per tag`() {
        val csv = journalCsv(mapOf(TODAY to DayJournal(tags = setOf(Tag.ALCOHOL, Tag.NAP))))
        assertEquals(listOf("date,tag", "$TODAY,alcohol", "$TODAY,nap"), csv.lines().filter { it.isNotEmpty() })
    }

    @Test fun `heart rate rows carry the local offset`() {
        val snap = HealthSnapshot(heartRate = listOf(Sample(at(TODAY, 8), 61.5)))
        assertEquals(listOf("time,bpm", "${TODAY}T08:00:00+05:30,61.5"), heartRateCsv(snap, IST).lines().filter { it.isNotEmpty() })
    }

    @Test fun `workout with no distance leaves the field empty`() {
        val snap = HealthSnapshot(workouts = listOf(Workout(at(TODAY, 7), at(TODAY, 8), 56, title = "Run, easy")))
        val row = workoutsCsv(snap, IST).lines()[1]
        assertEquals("${TODAY}T07:00:00+05:30,${TODAY}T08:00:00+05:30,56,\"Run, easy\",,,,,,", row)
    }

    @Test fun `quotes and newlines are escaped`() {
        val snap = HealthSnapshot(workouts = listOf(Workout(at(TODAY, 7), at(TODAY, 8), 56, title = "The \"big\" one", app = "a\nb")))
        val row = workoutsCsv(snap, IST).substringAfter("max_hr,app\n")
        assertEquals(true, row.contains(",\"The \"\"big\"\" one\","))
        assertEquals(true, row.endsWith(",\"a\nb\"\n"))
    }

    @Test fun `a day with steps but no recovery still has a row`() {
        val d = TODAY.minusDays(25)
        val snap = HealthSnapshot(dailyActivity = listOf(app.fitdash.health.DayActivity(d, 4321, 0.0, 0.0)))
        val csv = dailyCsv(snap, now, Goals(), emptyMap())
        assertEquals(true, csv.lines().any { it.startsWith("$d,") && it.contains("4321") })
    }
}
