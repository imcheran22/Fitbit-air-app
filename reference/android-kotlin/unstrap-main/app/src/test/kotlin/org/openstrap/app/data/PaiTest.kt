package org.openstrap.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.openstrap.app.data.Pai.Day
import org.openstrap.app.data.settings.UserProfile.Sex

/**
 * Records below are what the strap would store: each day's (daily, total) from running the ring of native 08 §3.4
 * over a longer history of raw slot scores, worked by hand from the doc's constants. The expected drop is
 * `ring(last 7) − ring(newest 6)` on those raw scores (native 08 §3.7).
 */
class PaiTest {
    @Test fun `curve and inverse`() {
        // 321.24 · (1 − e^−0.1) for set 0; the ceilings are A/B.
        assertEquals(30.5697, Pai.pai(0.1, Sex.Female), 1e-3)
        assertEquals(0.1, Pai.score(30.5697, Sex.Female), 1e-6)
        assertEquals(552.08, Pai.pai(50.0, Sex.Male), 0.01)
        assertEquals(321.24, Pai.pai(50.0, null), 0.01)
    }

    @Test fun `a day adds at most 75`() {
        // Male, slot 0.6 alone would be 249.1; capped at 75. Then 0.05 adds its marginal on top.
        assertEquals(75.0, Pai.total(listOf(0.6), Sex.Male), 1e-4)
        assertEquals(98.2677, Pai.total(listOf(0.6, 0.05), Sex.Male), 1e-3)
    }

    @Test fun `one workout in a fresh week drops off whole`() {
        val week = listOf(Day(30.5697f, 30.5697f)) + List(5) { null } + Day(0f, 30.5697f)
        assertEquals(30.5697, Pai.dropsOffTomorrow(week, Sex.Female), 0.01)
    }

    @Test fun `a steady week drops one day's worth`() {
        // Slot 0.05 every day for 13 days: each day's daily is 11.6063, and so is the drop.
        val week = List(7) { Day(11.6063f, 94.8651f) }
        assertEquals(11.6063, Pai.dropsOffTomorrow(week, Sex.Female), 0.01)
    }

    @Test fun `a small day recorded after a heavy week takes more with it than it earned`() {
        // Female slots: six days of 0.2, then 0.1 (recorded as +9.2 against the heavy week), then six of 0.02.
        val week = listOf(
            Day(9.2074f, 233.6896f), Day(2.1174f, 216.4238f), Day(2.5349f, 195.7528f), Day(3.0349f, 171.0052f),
            Day(3.6334f, 141.3769f), Day(4.35f, 105.9054f), Day(5.2079f, 63.4383f),
        )
        assertEquals(27.1129, Pai.dropsOffTomorrow(week, Sex.Female), 0.01)
    }

    @Test fun `a capped oldest day drops less than its stored 75`() {
        // Male slots: six of 0.05, then 0.6 (capped at +75), then six of 0.05.
        val week = listOf(
            Day(75f, 218.0902f), Day(17.3118f, 214.4324f), Day(17.4902f, 210.953f), Day(17.6599f, 207.6433f),
            Day(17.8213f, 204.495f), Day(17.9748f, 201.5002f), Day(18.1209f, 198.6515f),
        )
        assertEquals(55.5614, Pai.dropsOffTomorrow(week, Sex.Male), 0.01)
    }

    @Test fun `a capped day that stays still caps`() {
        // As above, but the third day is a raw 1.0, capped; its rebuilt slot is only the least that capped.
        val week = listOf(
            Day(75f, 218.0902f), Day(17.3118f, 214.4324f), Day(75f, 268.4628f), Day(14.9075f, 261.3256f),
            Day(15.2556f, 254.5365f), Day(15.5867f, 248.0785f), Day(15.9017f, 241.9355f),
        )
        assertEquals(58.4101, Pai.dropsOffTomorrow(week, Sex.Male), 0.01)
    }

    @Test fun `a capped first day of a fresh week`() {
        // Female slot 0.3 (83.3 alone, so +75), then six of 0.1.
        val week = listOf(
            Day(75f, 75f), Day(23.4325f, 98.4325f), Day(21.2026f, 119.6352f), Day(19.1849f, 138.8201f),
            Day(17.3593f, 156.1794f), Day(15.7073f, 171.8867f), Day(14.2126f, 186.0992f),
        )
        assertEquals(41.1609, Pai.dropsOffTomorrow(week, Sex.Female), 0.01)
    }

    @Test fun `the strap's projection gives the drop directly`() {
        // total − next[1] (native 08 §3.7): the capped-oldest-day week above, as the strap would project it.
        assertEquals(55.5614, Pai.dropsOffTomorrow(198.6515f, 143.0901f)!!, 0.01)
        // A projection above the total (it can't be) never shows as a negative drop.
        assertEquals(0.0, Pai.dropsOffTomorrow(40f, 41f)!!, 0.0)
        // No projection in the record: the caller falls back to re-summing the ring.
        assertNull(Pai.dropsOffTomorrow(40f, null))
    }
}
