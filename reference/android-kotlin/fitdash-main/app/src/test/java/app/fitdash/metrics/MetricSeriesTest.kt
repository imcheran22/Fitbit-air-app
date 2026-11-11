package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.day
import app.fitdash.history
import app.fitdash.plus
import app.fitdash.health.DayActivity
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MetricSeriesTest {
    private val goals = Goals()
    private val snap = history(TODAY, 10, stages = true) +
        day(TODAY, hrv = 46.0, rhr = 58.0, sleepHours = 7.5, stages = true) +
        HealthSnapshot(
            spo2 = listOf(Sample(at(TODAY, 4), 95.0)),
            dailyActivity = listOf(
                DayActivity(TODAY.minusDays(1), 5760, 4300.0, 1820.0),
                DayActivity(TODAY, 8240, 6100.0, 2140.0),
            ),
        )

    private fun series(kind: MetricKind, s: HealthSnapshot = snap) = metricSeries(s, kind, TODAY, IST, goals)

    @Test fun `every series has 30 days ending on the date`() {
        MetricKind.entries.forEach { kind ->
            val s = series(kind)
            assertEquals(kind.name, 30, s.size)
            assertEquals(TODAY, s.last().date)
            assertEquals(TODAY.minusDays(29), s.first().date)
        }
    }

    @Test fun `missing days are null`() {
        assertNull(series(MetricKind.SLEEP_HOURS).first().value)
        assertNull(series(MetricKind.STEPS).first().value)
        assertNull(series(MetricKind.SPO2)[28].value)
        assertEquals(95.0, series(MetricKind.SPO2).last().value!!, 0.001)
    }

    @Test fun `sleep hours matches summarizeSleep`() {
        val expected = summarizeSleep(TODAY, snap.sleep, IST, goals.sleepHours)!!.asleep.seconds / 3600.0
        assertEquals(expected, series(MetricKind.SLEEP_HOURS).last().value!!, 0.0001)
    }

    @Test fun `steps matches stepsOn`() {
        val s = series(MetricKind.STEPS)
        assertEquals(stepsOn(snap, TODAY, IST)!!.toDouble(), s.last().value!!, 0.0)
        assertEquals(5760.0, s[28].value!!, 0.0)
    }

    @Test fun `distance and calories come from daily activity`() {
        assertEquals(6.1, series(MetricKind.DISTANCE).last().value!!, 0.0001)
        assertEquals(2140.0, series(MetricKind.CALORIES).last().value!!, 0.0)
    }

    @Test fun `resting hr includes estimated values`() {
        val hr = (0..2).flatMap { d -> (0..40).map { Sample(at(TODAY.minusDays(d.toLong()), 12, it), 60.0 + it % 5) } }
        val raw = HealthSnapshot(heartRate = hr)
        val augmented = withEstimatedRestingHr(raw, IST, TODAY)
        assertTrue(augmented.estimatedRestingHrDates.isNotEmpty())
        assertNotNull(series(MetricKind.RESTING_HR, augmented).last().value)
        assertNull(series(MetricKind.RESTING_HR, raw).last().value)
    }

    @Test fun `buildToday exposes series and generic daily`() {
        val t = buildToday(snap, TODAY.atTime(8, 0).atZone(IST))
        assertEquals(MetricKind.entries.toSet(), t.series.keys)
        assertTrue(t.genericDaily.isEmpty())
    }
}
