package com.apex.athlete.core.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class DialMathTest {
    private val eps = 0.001f

    @Test fun gapIsFourDegreesEachSideOfTwelveOClock() {
        assertEquals(-86f, DialMath.START_ANGLE, eps)
        assertEquals(352f, DialMath.TRACK_SWEEP, eps)
        // End of track is 4 degrees before 12 o'clock (-90 + 360 = 270).
        assertEquals(266f, DialMath.START_ANGLE + DialMath.TRACK_SWEEP, eps)
    }

    @Test fun sweepScalesAndClamps() {
        assertEquals(0f, DialMath.sweepFor(0f), eps)
        assertEquals(176f, DialMath.sweepFor(0.5f), eps)
        assertEquals(352f, DialMath.sweepFor(1f), eps)
        assertEquals(352f, DialMath.sweepFor(3f), eps)
        assertEquals(0f, DialMath.sweepFor(-1f), eps)
    }

    @Test fun strainSaturatesAt21() {
        assertEquals(1f, DialMath.strainFraction(21.0), eps)
        assertEquals(1f, DialMath.strainFraction(25.0), eps)
        assertEquals(0.5f, DialMath.strainFraction(10.5), eps)
        assertEquals(0f, DialMath.strainFraction(Double.NaN), eps)
        assertEquals(0f, DialMath.fraction(5.0, 0.0), eps)
    }

    @Test fun targetArcAngles() {
        val arc = DialMath.targetArc(10.5, 21.0)!!
        assertEquals(DialMath.START_ANGLE + 176f, arc.start, eps)
        assertEquals(176f, arc.sweep, eps)
        assertNull(DialMath.targetArc(14.0, 10.0))
        assertNull(DialMath.targetArc(10.0, 10.0))
        assertNull(DialMath.targetArc(Double.NaN, 10.0))
    }

    @Test fun tickSitsAtTargetMiddle() {
        val tick = DialMath.tickArc(10.0, 14.0)!!
        val centre = tick.start + tick.sweep / 2f
        assertEquals(DialMath.angleAt((12.0 / 21.0).toFloat()), centre, 0.01f)
        assertNotNull(tick)
        assertNull(DialMath.tickArc(14.0, 10.0))
    }

    @Test fun markerFraction() {
        assertEquals(0.5f, BandMath.markerFraction(55.0, 55.0, 8.0)!!, eps)
        assertEquals(1f, BandMath.markerFraction(200.0, 55.0, 8.0)!!, eps)
        assertEquals(0f, BandMath.markerFraction(-200.0, 55.0, 8.0)!!, eps)
        assertNull(BandMath.markerFraction(55.0, 55.0, 0.0))
    }
}
