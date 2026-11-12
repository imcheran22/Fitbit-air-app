package com.apex.athlete.ui.health

import com.apex.athlete.core.domain.MetricType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HealthMathTest {
    private val c: (Double) -> Double = { it * 1.8 }

    @Test
    fun rangesAreTheOfferedFourAndAnythingElseFallsBack() {
        assertEquals(listOf(14, 30, 90, 365), TREND_RANGES)
        assertEquals(90, sanitizeRange(90))
        assertEquals(DEFAULT_TREND_RANGE, sanitizeRange(7))
        assertEquals(DEFAULT_TREND_RANGE, sanitizeRange(null))
    }

    @Test
    fun summaryIgnoresGapsAndNeverCountsThemAsZero() {
        val s = summarize(listOf(60.0, null, 70.0, null, 80.0))
        assertEquals(60.0, s.min)
        assertEquals(80.0, s.max)
        assertEquals(70.0, s.mean)
        assertEquals(3, s.readings)
        assertEquals(5, s.days)
    }

    @Test
    fun summaryOfNothingIsNullNotZero() {
        val s = summarize(listOf(null, null, Double.NaN))
        assertNull(s.min)
        assertNull(s.max)
        assertNull(s.mean)
        assertEquals(0, s.readings)
    }

    @Test
    fun heartRateExtremesSkipGaps() {
        val e = heartRateExtremes(listOf(null, 55.0, null, 130.0, 60.0))
        assertEquals(55.0, e.lowest)
        assertEquals(130.0, e.highest)
        val none = heartRateExtremes(listOf(null, null))
        assertNull(none.lowest)
        assertNull(none.highest)
    }

    @Test
    fun zSideFollowsPolarityOutsideOneSd() {
        assertEquals(ZSide.NEUTRAL, zSide(MetricType.HRV_RMSSD, 0.9))
        assertEquals(ZSide.NEUTRAL, zSide(MetricType.HRV_RMSSD, null))
        assertEquals(ZSide.GOOD, zSide(MetricType.HRV_RMSSD, 1.5))
        assertEquals(ZSide.BAD, zSide(MetricType.HRV_RMSSD, -1.5))
        assertEquals(ZSide.GOOD, zSide(MetricType.RESTING_HEART_RATE, -2.0))
        assertEquals(ZSide.BAD, zSide(MetricType.RESTING_HEART_RATE, 2.0))
        assertEquals(ZSide.NEUTRAL, zSide(MetricType.RESPIRATORY_RATE, 2.5))
        assertEquals(ZSide.NEUTRAL, zSide(MetricType.SKIN_TEMP_DEVIATION, -2.5))
    }

    @Test
    fun displayMatchesTheStateMapperTable() {
        val hrv = metricDisplay(MetricType.HRV_RMSSD, "°C", c)
        assertEquals(0, hrv.decimals)
        assertEquals("ms", hrv.unit)
        val sleep = metricDisplay(MetricType.SLEEP_DURATION, "°C", c)
        assertEquals(7.5, sleep.convert(450.0))
        assertEquals("h", sleep.unit)
        val skin = metricDisplay(MetricType.SKIN_TEMP_DEVIATION, "°F", c)
        assertEquals("°F", skin.unit)
        assertTrue(kotlin.math.abs(skin.convert(1.0) - 1.8) < 1e-9)
    }

    @Test
    fun zoneMinutesBecomeSecondsAndMissingStaysMissing() {
        assertEquals(90L, minutesToSeconds(1.5))
        assertEquals(0L, minutesToSeconds(0.0))
        assertNull(minutesToSeconds(null))
        assertNull(minutesToSeconds(-1.0))
    }
}
