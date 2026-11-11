package app.fitdash.metrics

import app.fitdash.IST
import app.fitdash.TODAY
import app.fitdash.health.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class BaselinesTest {
    @Test fun `median of odd, even and empty lists`() {
        assertEquals(2.0, median(listOf(3.0, 1.0, 2.0))!!, 0.0)
        assertEquals(2.5, median(listOf(4.0, 1.0, 3.0, 2.0))!!, 0.0)
        assertNull(median(emptyList()))
    }

    @Test fun `dailyMean buckets by local date not UTC`() {
        val samples = listOf(
            Sample(Instant.parse("2026-10-10T20:00:00Z"), 40.0), // 01:30 IST on 11 Oct
            Sample(Instant.parse("2026-10-11T01:00:00Z"), 50.0), // 06:30 IST on 11 Oct
        )
        assertEquals(mapOf(TODAY to 45.0), dailyMean(samples, IST))
    }

    @Test fun `dailyLast keeps the latest sample of the day`() {
        val samples = listOf(
            Sample(Instant.parse("2026-10-11T03:00:00Z"), 61.0),
            Sample(Instant.parse("2026-10-11T01:00:00Z"), 58.0),
        )
        assertEquals(mapOf(TODAY to 61.0), dailyLast(samples, IST))
    }

    @Test fun `baseline excludes today and anything older than 30 days`() {
        val daily = mapOf(
            TODAY to 100.0,
            TODAY.minusDays(1) to 40.0,
            TODAY.minusDays(30) to 50.0,
            TODAY.minusDays(31) to 1000.0,
        )
        assertEquals(45.0, baseline(daily, TODAY)!!, 0.0)
    }

    @Test fun `baseline is null without history`() {
        assertNull(baseline(mapOf(TODAY to 40.0), TODAY))
    }
}
