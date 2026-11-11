package org.openstrap.app.device

import org.junit.Assert.assertEquals
import org.junit.Test
import org.openstrap.app.device.WearReminder.Action

/** Zepp's "Wear Reminders" (codemap 07 §4 N5): posted when the strap goes off-body, cleared when it's back on. */
class WearReminderTest {
    @Test
    fun offBodyPostsOnce() {
        assertEquals(Action.Post, WearReminder.decide(worn = false, enabled = true, shown = false))
        assertEquals(Action.None, WearReminder.decide(worn = false, enabled = true, shown = true))
    }

    @Test
    fun backOnClears() {
        assertEquals(Action.Clear, WearReminder.decide(worn = true, enabled = true, shown = true))
        assertEquals(Action.None, WearReminder.decide(worn = true, enabled = true, shown = false))
    }

    @Test
    fun unknownOrSwitchedOffClears() {
        // The link went down: whether the strap is still off isn't known.
        assertEquals(Action.Clear, WearReminder.decide(worn = null, enabled = true, shown = true))
        assertEquals(Action.None, WearReminder.decide(worn = null, enabled = true, shown = false))
        // The user turned the reminder off.
        assertEquals(Action.None, WearReminder.decide(worn = false, enabled = false, shown = false))
        assertEquals(Action.Clear, WearReminder.decide(worn = false, enabled = false, shown = true))
    }
}
