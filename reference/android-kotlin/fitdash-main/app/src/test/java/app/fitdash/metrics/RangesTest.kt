package app.fitdash.metrics

import app.fitdash.TODAY
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RangesTest {
    private val nine = (1..9).map { it.toDouble() }

    @Test fun `percentile interpolates`() {
        assertEquals(3.0, percentile(nine, 0.25), 1e-9)
        assertEquals(7.0, percentile(nine, 0.75), 1e-9)
        assertEquals(2.5, percentile(listOf(1.0, 2.0, 3.0, 4.0), 0.5), 1e-9)
    }

    @Test fun `normal range uses the previous 30 days only`() {
        val daily = nine.mapIndexed { i, v -> TODAY.minusDays(i + 1L) to v }.toMap() + (TODAY to 100.0)
        assertEquals(3.0..7.0, normalRange(daily, TODAY))
    }

    @Test fun `normal range needs 5 values`() {
        val daily = (1..4).associate { TODAY.minusDays(it.toLong()) to it.toDouble() }
        assertNull(normalRange(daily, TODAY))
    }

    @Test fun `identical values give a point range that counts as in range`() {
        val daily = (1..6).associate { TODAY.minusDays(it.toLong()) to 96.0 }
        val range = normalRange(daily, TODAY)!!
        assertEquals(96.0..96.0, range)
        assertEquals(RangeStatus.IN, rangeStatus(96.0, range, Good.HIGHER))
    }

    @Test fun `status follows the good direction`() {
        val r = 40.0..46.0
        assertEquals(RangeStatus.IN, rangeStatus(40.0, r, Good.HIGHER))
        assertEquals(RangeStatus.GOOD_SIDE, rangeStatus(48.0, r, Good.HIGHER))
        assertEquals(RangeStatus.BAD_SIDE, rangeStatus(38.0, r, Good.HIGHER))
        assertEquals(RangeStatus.GOOD_SIDE, rangeStatus(38.0, r, Good.LOWER))
        assertEquals(RangeStatus.BAD_SIDE, rangeStatus(48.0, r, Good.LOWER))
        assertEquals(RangeStatus.BAD_SIDE, rangeStatus(48.0, r, Good.MIDDLE))
        assertEquals(RangeStatus.BAD_SIDE, rangeStatus(38.0, r, Good.MIDDLE))
    }
}
