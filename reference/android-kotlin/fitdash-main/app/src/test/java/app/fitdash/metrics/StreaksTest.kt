package app.fitdash.metrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class StreaksTest {
    private val start = LocalDate.of(2026, 10, 20)
    private fun days(vararg v: Double?) = v.mapIndexed { i, x -> DayValue(start.plusDays(i.toLong()), x) }

    @Test fun `counts the met days at the end`() {
        assertEquals(3, streakDays(days(9500.0, 4000.0, 9100.0, 9900.0, 12000.0), 9000.0))
    }

    @Test fun `today not met yet keeps yesterday's streak`() {
        assertEquals(2, streakDays(days(9500.0, 9900.0, 3000.0), 9000.0))
    }

    @Test fun `a day with no data breaks the streak`() {
        assertEquals(1, streakDays(days(9500.0, null, 9900.0), 9000.0))
        assertEquals(0, streakDays(emptyList(), 9000.0))
    }

    @Test fun `streaks keep two days or more, longest first, and flag milestones`() {
        val series = mapOf(
            MetricKind.STEPS to days(9500.0, 9900.0, 9100.0),
            MetricKind.SLEEP_HOURS to days(8.2, 6.0, 8.1, 8.3),
            MetricKind.WATER to days(1.0, 1.0, 1.0),
        )
        val s = streaks(series, Goals(steps = 9000, sleepHours = 8.0, waterLiters = 2.5))
        assertEquals(listOf(Streak(MetricKind.STEPS, 3), Streak(MetricKind.SLEEP_HOURS, 2)), s)
        assertTrue(s.first().milestone)
    }
}
