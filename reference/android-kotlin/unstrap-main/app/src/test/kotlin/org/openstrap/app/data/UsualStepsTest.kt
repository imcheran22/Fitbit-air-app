package org.openstrap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Your usual steps by this hour (spec 2.7, compare by pace), from past days' steps hour by hour. */
class UsualStepsTest {
    private val today = LocalDate.of(2026, 10, 22)

    /** A day with [perHour] steps in each hour from 08:00 to 19:59, none at night. */
    private fun day(perHour: Float) = List(24) { h -> if (h in 8..19) perHour else 0f }

    private fun days(n: Int, perHour: (Int) -> Float = { 500f }) = (1..n).associate { today.minusDays(it.toLong()) to day(perHour(it)) }

    @Test fun `no usual before a week of worn days`() {
        assertNull(UsualSteps.byHour(days(UsualSteps.MIN_DAYS - 1), today))
        // A day with the strap off (under 500 steps) isn't worn, so it doesn't count toward the week.
        val withOff = days(UsualSteps.MIN_DAYS - 1) + (today.minusDays(20) to day(10f))
        assertNull(UsualSteps.byHour(withOff, today))
    }

    @Test fun `the usual is the median running total, hour by hour`() {
        // Six days at 500 an hour and one at 5,000: the median ignores the one long hike.
        val usual = UsualSteps.byHour(days(7) { if (it == 3) 5000f else 500f }, today)!!
        assertEquals(24, usual.size)
        assertEquals(0f, usual[7], 0f)
        assertEquals(500f, usual[8], 0f)
        assertEquals(6000f, usual[23], 0f)
        // It never goes down from one hour to the next.
        usual.zipWithNext().forEach { (a, b) -> assertTrue(b >= a) }
    }

    @Test fun `only the days before the day shown, the last 28 of them`() {
        val future = mapOf(today to day(9000f), today.plusDays(1) to day(9000f))
        val old = (29..40).associate { today.minusDays(it.toLong()) to day(9000f) }
        val usual = UsualSteps.byHour(days(7) + future + old, today)!!
        assertEquals(6000f, usual[23], 0f)
    }

    @Test fun `by a time inside an hour it's part of the way to that hour's end`() {
        val usual = UsualSteps.byHour(days(7), today)!!
        assertEquals(0f, UsualSteps.at(usual, 0, 0), 0f)
        assertEquals(250f, UsualSteps.at(usual, 8, 30), 0.01f)
        assertEquals(1000f, UsualSteps.at(usual, 10, 0), 0.01f)
    }

    @Test fun `pace is within a quarter either side, and quiet while the usual is small`() {
        assertEquals(UsualSteps.Pace.About, UsualSteps.pace(1000, 1000f))
        assertEquals(UsualSteps.Pace.About, UsualSteps.pace(1250, 1000f))
        assertEquals(UsualSteps.Pace.More, UsualSteps.pace(1300, 1000f))
        assertEquals(UsualSteps.Pace.Fewer, UsualSteps.pace(700, 1000f))
        assertNull(UsualSteps.pace(2000, UsualSteps.MIN_USUAL - 1f))
    }
}
