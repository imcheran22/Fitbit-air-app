package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.at
import app.fitdash.day
import app.fitdash.night
import app.fitdash.plus
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration

class RestingHrTest {
    @Test fun `lowest rolling mean picks the calmest 30 minutes`() {
        val s = (0 until 120 step 5).map { m -> Sample(at(TODAY, 2).plusSeconds(m * 60L), if (m in 40..70) 50.0 else 65.0) }
        assertEquals(50.0, lowestRollingMean(s, Duration.ofMinutes(30))!!, 1e-9)
    }

    @Test fun `too sparse returns null`() {
        assertNull(lowestRollingMean(listOf(Sample(at(TODAY, 2), 50.0), Sample(at(TODAY, 2, 5), 50.0)), Duration.ofMinutes(30)))
    }

    @Test fun `estimate uses the night window`() {
        val inside = (0 until 60 step 5).map { Sample(at(TODAY, 1).plusSeconds(it * 60L), 52.0) }
        val daytime = (0 until 60 step 5).map { Sample(at(TODAY, 14).plusSeconds(it * 60L), 45.0) }
        assertEquals(52.0, estimateRestingHr(inside + daytime, night(TODAY, 7.0), TODAY, IST)!!, 1e-9)
    }

    @Test fun `without sleep falls back to the 10th percentile with enough samples`() {
        val dayHr = (0 until 40).map { Sample(at(TODAY, 8).plusSeconds(it * 600L), 60.0 + it) }
        assertEquals(63.9, estimateRestingHr(dayHr, null, TODAY, IST)!!, 1e-9)
        assertNull(estimateRestingHr(dayHr.take(29), null, TODAY, IST))
    }

    @Test fun `recorded resting HR wins and estimates are flagged`() {
        val hrNight = (0 until 60 step 5).map { Sample(at(TODAY, 1).plusSeconds(it * 60L), 52.0) }
        val hrPrev = (0 until 60 step 5).map { Sample(at(TODAY.minusDays(1), 1).plusSeconds(it * 60L), 55.0) }
        val snap = day(TODAY, sleepHours = 7.0) + day(TODAY.minusDays(1), rhr = 61.0, sleepHours = 7.0) +
            HealthSnapshot(heartRate = hrNight + hrPrev)
        val out = withEstimatedRestingHr(snap, IST, TODAY)
        assertEquals(setOf(TODAY), out.estimatedRestingHrDates)
        val daily = dailyLast(out.restingHr, IST)
        assertEquals(52.0, daily[TODAY]!!, 1e-9)
        assertEquals(61.0, daily[TODAY.minusDays(1)]!!, 1e-9)
    }
}
