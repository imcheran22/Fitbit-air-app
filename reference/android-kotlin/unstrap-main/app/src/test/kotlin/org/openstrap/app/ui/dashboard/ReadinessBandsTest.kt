package org.openstrap.app.ui.dashboard

import org.junit.Assert.assertEquals
import org.junit.Test
import org.openstrap.app.data.Recovery
import org.openstrap.app.ui.dashboard.Narrative.Rating

/** OpenStrap's four readiness bands and the Alert cap's place in them. */
class ReadinessBandsTest {
    @Test
    fun alertCapSitsInTheLowestBand() {
        assertEquals(Recovery.FAIR_FROM - 1, Recovery.ALERT_CAP)
        assertEquals(Rating.LOW, Narrative.ratingFor(Recovery.ALERT_CAP))
        // One point higher is Fair, so the cap is as high as it can be and still stay out of it.
        assertEquals(Rating.FAIR, Narrative.ratingFor(Recovery.ALERT_CAP + 1))
        assertEquals(Rating.FAIR, Narrative.ratingFor(60))
    }
}
