package com.apex.athlete.widget

import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The MetricState to stored-metric mapping: the widgets can only say what the app's own mapper said. */
class WidgetSnapshotBuilderTest {

    @Test
    fun aValueKeepsItsNumberSourceAndProvisionalFlag() {
        val m = WidgetSnapshotBuilder.metric(
            MetricState.Value(12.3, 1, null, DataProvenance.MATHEMATICALLY_DERIVED, isProvisional = true),
        )
        assertEquals(WidgetMetricStatus.VALUE, m.status)
        assertEquals(12.3, m.value)
        assertEquals("derived", m.provenance)
        assertEquals(true, m.provisional)
        assertNull(m.band)
    }

    @Test
    fun recoveryGetsItsBandFromTheRoundedScore() {
        fun band(score: Double) = WidgetSnapshotBuilder.metric(MetricState.Value(score, 0, "%", null), withBand = true).band
        assertEquals("RED", band(33.0))
        assertEquals("YELLOW", band(34.0))
        assertEquals("YELLOW", band(66.4))
        assertEquals("GREEN", band(66.5))
        assertEquals("GREEN", band(100.0))
    }

    @Test
    fun aValueWithoutASourceStaysWithoutOne() {
        assertNull(WidgetSnapshotBuilder.metric(MetricState.Value(50.0, 0, "%", null)).provenance)
    }

    @Test
    fun calibratingKeepsTheNightsLeftOnlyWhenPositive() {
        assertEquals(3, WidgetSnapshotBuilder.metric(MetricState.Calibrating(3)).calibrationDaysLeft)
        assertNull(WidgetSnapshotBuilder.metric(MetricState.Calibrating(0)).calibrationDaysLeft)
        assertNull(WidgetSnapshotBuilder.metric(MetricState.Calibrating(null)).calibrationDaysLeft)
        assertEquals(WidgetMetricStatus.CALIBRATING, WidgetSnapshotBuilder.metric(MetricState.Calibrating(null)).status)
    }

    @Test
    fun unavailableKeepsItsReason() {
        val m = WidgetSnapshotBuilder.metric(MetricState.Unavailable(MetricReason.NO_HRV_LAST_NIGHT))
        assertEquals(WidgetMetricStatus.UNAVAILABLE, m.status)
        assertEquals("NO_HRV_LAST_NIGHT", m.reason)
        assertNull(m.value)
    }

    @Test
    fun statesWithoutACurrentNumberNeverBecomeANumber() {
        for (state in listOf(MetricState.Loading, MetricState.Error("x"), MetricState.Stale(70.0, 0, "%", null, "2 days ago"))) {
            val m = WidgetSnapshotBuilder.metric(state)
            assertEquals(WidgetMetricStatus.UNAVAILABLE, m.status, state.toString())
            assertNull(m.value, state.toString())
            assertEquals("NO_DATA", m.reason)
        }
    }

    @Test
    fun aNonFiniteValueIsNoData() {
        assertEquals(WidgetMetric.NO_DATA, WidgetSnapshotBuilder.metric(MetricState.Value(Double.NaN, 0, null, null)))
        assertEquals(WidgetMetric.NO_DATA, WidgetSnapshotBuilder.metric(MetricState.Value(Double.POSITIVE_INFINITY, 0, null, null)))
    }
}
