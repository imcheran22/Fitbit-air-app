package app.fitdash.health

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration
import java.time.Instant

class PhoneStepsTest {
    private val boot = Instant.parse("2026-11-01T02:00:00Z")
    private val t0 = Instant.parse("2026-11-01T08:00:00Z")

    private fun sample(count: Long, at: Instant, bootAt: Instant = boot) = StepSample(count, at, bootAt)

    @Test fun `first sample is only a baseline`() {
        assertNull(stepDelta(null, sample(5000, t0)))
    }

    @Test fun `steps since the last sample`() {
        val delta = stepDelta(sample(5000, t0), sample(5400, t0.plusSeconds(3600)))!!
        assertEquals(StepDelta(t0, t0.plusSeconds(3600), 400), delta)
    }

    @Test fun `no new steps`() {
        assertNull(stepDelta(sample(5000, t0), sample(5000, t0.plusSeconds(600))))
    }

    @Test fun `counter below the last value means a reboot, steps count from boot`() {
        val rebootAt = t0.plusSeconds(1800)
        val now = rebootAt.plusSeconds(1200)
        assertEquals(StepDelta(rebootAt, now, 150), stepDelta(sample(5000, t0), sample(150, now, rebootAt)))
    }

    @Test fun `a reboot is spotted by the boot time even when the counter is higher`() {
        val rebootAt = t0.plusSeconds(1800)
        val now = rebootAt.plusSeconds(7200)
        assertEquals(StepDelta(rebootAt, now, 6000), stepDelta(sample(5000, t0), sample(6000, now, rebootAt)))
    }

    @Test fun `a small shift in the boot time is not a reboot`() {
        val now = t0.plusSeconds(3600)
        assertEquals(400L, stepDelta(sample(5000, t0), sample(5400, now, boot.plusSeconds(20)))!!.count)
    }

    @Test fun `a gap over a day starts the interval 24 hours back`() {
        val now = t0.plus(Duration.ofDays(3))
        val delta = stepDelta(sample(5000, t0), sample(9000, now))!!
        assertEquals(now.minus(Duration.ofHours(24)), delta.start)
        assertEquals(4000L, delta.count)
    }
}
