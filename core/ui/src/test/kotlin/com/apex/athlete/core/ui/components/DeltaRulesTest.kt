package com.apex.athlete.core.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class DeltaRulesTest {
    private fun arrow(v: Double?, avg: Double?, sd: Double?, g: GoodDirection) = DeltaRules.arrow(v, avg, sd, g)

    @Test fun equalOrMissingIsNeutralDot() {
        val dot = DeltaArrow(DeltaDirection.FLAT, DeltaTone.NEUTRAL)
        assertEquals(dot, arrow(55.0, 55.0, null, GoodDirection.DOWN))
        assertEquals(dot, arrow(null, 55.0, 5.0, GoodDirection.UP))
        assertEquals(dot, arrow(55.0, null, 5.0, GoodDirection.UP))
    }

    @Test fun insideOneSigmaIsNeutralDot() {
        assertEquals(DeltaArrow(DeltaDirection.FLAT, DeltaTone.NEUTRAL), arrow(58.0, 55.0, 4.0, GoodDirection.UP))
    }

    @Test fun hrvUpIsGoodDownIsBad() {
        assertEquals(DeltaArrow(DeltaDirection.UP, DeltaTone.GOOD), arrow(66.0, 55.0, 6.0, GoodDirection.UP))
        assertEquals(DeltaArrow(DeltaDirection.DOWN, DeltaTone.BAD), arrow(40.0, 55.0, 6.0, GoodDirection.UP))
    }

    @Test fun restingHrDownIsGood() {
        assertEquals(DeltaArrow(DeltaDirection.DOWN, DeltaTone.GOOD), arrow(50.0, 55.0, 2.0, GoodDirection.DOWN))
        assertEquals(DeltaArrow(DeltaDirection.UP, DeltaTone.BAD), arrow(60.0, 55.0, 2.0, GoodDirection.DOWN))
    }

    @Test fun neutralMetricKeepsDirectionButNeutralTone() {
        assertEquals(DeltaArrow(DeltaDirection.DOWN, DeltaTone.NEUTRAL), arrow(14.2, 14.7, 0.2, GoodDirection.NEUTRAL))
    }

    @Test fun towardZeroUsesMagnitude() {
        assertEquals(DeltaArrow(DeltaDirection.UP, DeltaTone.GOOD), arrow(-0.1, -0.8, 0.2, GoodDirection.TOWARD_ZERO))
        assertEquals(DeltaArrow(DeltaDirection.DOWN, DeltaTone.BAD), arrow(-0.9, -0.2, 0.1, GoodDirection.TOWARD_ZERO))
    }

    @Test fun noSdMeansAnyDifferenceCounts() {
        assertEquals(DeltaArrow(DeltaDirection.UP, DeltaTone.GOOD), arrow(56.0, 55.0, null, GoodDirection.UP))
    }

    @Test fun driversSortByMagnitude() {
        val sorted = sortedDrivers(listOf(DriverItem("a", "a", 3.0), DriverItem("b", "b", -9.0), DriverItem("c", "c", Double.NaN)))
        assertEquals(listOf("b", "a"), sorted.map { it.key })
    }
}
