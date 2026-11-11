package org.openstrap.app.data.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class UnitsTest {
    @Test
    fun weightRoundTrips() {
        assertEquals(165.3f, Units.kgToLb(75f), 0.1f)
        assertEquals(75f, Units.lbToKg(Units.kgToLb(75f)), 0.001f)
        assertEquals("165 lb", Units.formatWeight(75f, imperial = true))
        assertEquals("75 kg", Units.formatWeight(75f, imperial = false))
    }

    @Test
    fun heightUsesWholeInches() {
        assertEquals(5 to 10, Units.cmToFeetInches(178))
        assertEquals(178, Units.feetInchesToCm(5, 10))
        // 182.6 cm is 71.9 in: rounds to 6 ft 0 in, never 5 ft 12 in.
        assertEquals(6 to 0, Units.cmToFeetInches(183))
        assertEquals("5′10″", Units.formatHeight(178, imperial = true))
    }
}
