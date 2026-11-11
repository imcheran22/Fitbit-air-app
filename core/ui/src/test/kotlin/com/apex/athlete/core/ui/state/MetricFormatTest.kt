package com.apex.athlete.core.ui.state

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class MetricFormatTest {
    private val us = Locale.US

    @Test fun missingShowsDashes() {
        assertEquals("--", MetricFormat.number(null, 0, us))
        assertEquals("--", MetricFormat.number(Double.NaN, 1, us))
        assertEquals("--", MetricFormat.number(Double.POSITIVE_INFINITY, 1, us))
        assertEquals("--", MetricFormat.delta(null, 0, us))
    }

    @Test fun realMinusSign() {
        assertEquals("−3", MetricFormat.number(-3.0, 0, us))
        assertEquals("−2.5", MetricFormat.delta(-2.5, 1, us))
    }

    @Test fun negativeZeroHasNoSign() {
        assertEquals("0.0", MetricFormat.number(-0.04, 1, us))
        assertEquals("0.0", MetricFormat.delta(-0.04, 1, us))
        assertEquals("0", MetricFormat.delta(0.0, 0, us))
    }

    @Test fun plusOnPositiveDeltas() {
        assertEquals("+2", MetricFormat.delta(2.0, 0, us))
        assertEquals("+0.5", MetricFormat.delta(0.5, 1, us))
    }

    @Test fun decimalsAndUnit() {
        assertEquals("72", MetricFormat.number(72.4, 0, us))
        assertEquals("14.2", MetricFormat.number(14.2, 1, us))
        assertEquals("72 %", MetricFormat.withUnit(72.0, 0, "%", us))
        assertEquals("--", MetricFormat.withUnit(null, 0, "%", us))
    }

    @Test fun stateNumberText() {
        val v = MetricState.Value(9.44, 1, null, null)
        assertEquals("9.4", v.numberText(us))
        assertEquals(9.44, v.numberOrNull()!!, 0.0)
        assertEquals(null, MetricState.Calibrating(3).numberOrNull())
        assertEquals(null, MetricState.Value(Double.NaN, 0, null, null).numberOrNull())
    }
}
