package org.openstrap.app.data.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openstrap.app.ui.alarms.quietHoursSummary

class QuietHoursTest {
    private fun at(h: Int, m: Int = 0) = h * 60 + m

    @Test fun `hours past midnight cover the late evening and the early morning`() {
        val q = QuietHours(on = true, from = at(22), to = at(7))
        assertTrue(q.covers(at(22)))
        assertTrue(q.covers(at(23, 59)))
        assertTrue(q.covers(at(0)))
        assertTrue(q.covers(at(6, 59)))
        assertFalse(q.covers(at(7)))
        assertFalse(q.covers(at(12)))
        assertFalse(q.covers(at(21, 59)))
    }

    @Test fun `hours within a day cover only themselves`() {
        val q = QuietHours(on = true, from = at(13), to = at(15, 30))
        assertTrue(q.covers(at(13)))
        assertTrue(q.covers(at(15, 29)))
        assertFalse(q.covers(at(15, 30)))
        assertFalse(q.covers(at(12, 59)))
        assertFalse(q.covers(at(23)))
    }

    @Test fun `off or empty hours cover nothing`() {
        assertFalse(QuietHours(on = false).covers(at(23)))
        assertFalse(QuietHours(on = true, from = at(8), to = at(8)).covers(at(8)))
    }

    @Test fun `the summary says when, and whether calls are held back too`() {
        assertEquals("Pause the buzz at night or during set hours.", quietHoursSummary(QuietHours(), callsOn = true))
        assertEquals("No notification buzz from 22:00 to 07:00.", quietHoursSummary(QuietHours(on = true), callsOn = true))
        assertEquals("No buzz from 22:00 to 07:00, calls included.", quietHoursSummary(QuietHours(on = true, calls = true), callsOn = true))
        // With call buzzing off, muting calls has nothing to mute.
        assertEquals("No notification buzz from 22:00 to 07:00.", quietHoursSummary(QuietHours(on = true, calls = true), callsOn = false))
        assertEquals("Pick different start and end times.", quietHoursSummary(QuietHours(on = true, from = 60, to = 60), callsOn = false))
    }
}
