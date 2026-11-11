package org.openstrap.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Which tick a scrub plays (spec 3.6): a step per new point, a mark at your normal's edge and at the extremes. */
class ScrubTicksTest {
    private val values = listOf(50f, 52f, 61f, 55f, null, 40f, 53f)
    private val band = 45f..58f

    @Test fun `a new point steps, the same point stays quiet, a release resets`() {
        val t = ScrubTicks()
        assertEquals(HapticEvent.ScrubStep, t.next(0, values, band))
        assertNull(t.next(0, values, band))
        assertEquals(HapticEvent.ScrubStep, t.next(1, values, band))
        assertNull(t.next(null, values, band))
        assertEquals(HapticEvent.ScrubStep, t.next(1, values, band))
    }

    @Test fun `crossing out of or back into your normal marks, as do the highest and lowest`() {
        val t = ScrubTicks()
        t.next(1, values, band)
        // 61 is outside the band and the highest.
        assertEquals(HapticEvent.ScrubMark, t.next(2, values, band))
        // Back inside.
        assertEquals(HapticEvent.ScrubMark, t.next(3, values, band))
        // A gap is a point too, a plain step.
        assertEquals(HapticEvent.ScrubStep, t.next(4, values, band))
        // 40 is the lowest.
        assertEquals(HapticEvent.ScrubMark, t.next(5, values, band))
    }

    @Test fun `bars can leave the lowest unmarked`() {
        val hours = listOf(0f, 0f, 120f, 0f, 300f)
        val t = ScrubTicks()
        assertEquals(HapticEvent.ScrubStep, t.next(0, hours, null, lowMarks = false))
        assertEquals(HapticEvent.ScrubStep, t.next(1, hours, null, lowMarks = false))
        assertEquals(HapticEvent.ScrubMark, t.next(4, hours, null, lowMarks = false))
    }
}
