package app.fitdash.metrics

import app.fitdash.health.SleepSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class RemindersTest {
    private val zone = ZoneId.of("Asia/Kolkata")
    private val day = LocalDate.of(2026, 10, 26)
    private fun at(h: Int, m: Int = 0) = day.atTime(h, m).atZone(zone)
    private val night = SleepSession(at(0, 0).minusHours(1).toInstant(), at(7, 0).toInstant(), emptyList())
    private val window = wakingWindow(listOf(night), at(12), 8.0)

    @Test fun `window runs from half an hour after waking to an hour before bedtime`() {
        assertEquals(at(7, 30), window.start)
        assertEquals(at(22, 0), window.end)
    }

    @Test fun `no night today assumes an 8 AM wake-up`() {
        assertEquals(at(8, 30), wakingWindow(emptyList(), at(12), 8.0).start)
    }

    @Test fun `water reminds only when behind pace`() {
        // At 2:45 PM half the window has passed, so the pace is 1.25 of 2.5 L.
        assertTrue(waterDue(0.5, 2.5, at(14, 45), window, null))
        assertFalse(waterDue(1.1, 2.5, at(14, 45), window, null))
        assertFalse(waterDue(2.5, 2.5, at(21), window, null))
    }

    @Test fun `water waits two hours between reminders and stays quiet outside the window`() {
        assertFalse(waterDue(0.0, 2.5, at(14), window, at(13).toInstant()))
        assertTrue(waterDue(0.0, 2.5, at(14), window, at(12).toInstant()))
        assertFalse(waterDue(0.0, 2.5, at(23), window, null))
    }

    @Test fun `move nudges after a still hour with fresh data`() {
        assertTrue(moveDue(120, at(13, 50).toInstant(), at(14), window, null))
        assertFalse(moveDue(900, at(13, 50).toInstant(), at(14), window, null))
    }

    @Test fun `move stays quiet on stale data, early morning or a recent nudge`() {
        assertFalse(moveDue(0, at(12).toInstant(), at(14), window, null))
        assertFalse(moveDue(0, at(7, 50).toInstant(), at(8), window, null))
        assertFalse(moveDue(0, at(13, 50).toInstant(), at(14), window, at(13, 30).toInstant()))
    }
}
