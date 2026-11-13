package com.apex.athlete.ui.strain

import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StrainActivityModelsTest {

    @Test fun noZoneMinutesGivesNoRows() {
        assertTrue(zoneRowsOf(null, null).isEmpty())
    }

    @Test fun zoneMinutesBecomeSecondsInDisplayOrderAndAbsentStaysUnknown() {
        val rows = zoneRowsOf(mapOf(HeartRateZone.ZONE_2 to 12.5, HeartRateZone.BELOW_ZONES to 0.0, HeartRateZone.ZONE_4 to 0.25), null)
        assertEquals(6, rows.size)
        assertEquals(HeartRateZone.ZONE_5, rows.first().zone)
        assertNull(rows.first { it.zone == HeartRateZone.ZONE_5 }.seconds)
        assertEquals(15L, rows.first { it.zone == HeartRateZone.ZONE_4 }.seconds)
        assertEquals(750L, rows.first { it.zone == HeartRateZone.ZONE_2 }.seconds)
        assertEquals(0L, rows.first { it.zone == HeartRateZone.BELOW_ZONES }.seconds)
        assertTrue(hasZoneData(rows))
    }

    @Test fun negativeAndNonFiniteMinutesAreUnknown() {
        val rows = zoneRowsOf(mapOf(HeartRateZone.ZONE_1 to -1.0, HeartRateZone.ZONE_3 to Double.NaN), null)
        assertNull(rows.first { it.zone == HeartRateZone.ZONE_1 }.seconds)
        assertNull(rows.first { it.zone == HeartRateZone.ZONE_3 }.seconds)
    }

    @Test fun personalStrainBaseBelowFiveDaysIsCalibrating() {
        assertEquals(MetricState.Calibrating(null), personalStrainBaseState(null))
        assertEquals(MetricState.Calibrating(null), personalStrainBaseState(Double.NaN))
        assertEquals(
            MetricState.Value(11.3, 1, null, DataProvenance.MATHEMATICALLY_DERIVED),
            personalStrainBaseState(11.3),
        )
        assertEquals(5, MIN_PERSONAL_STRAIN_DAYS)
    }

    @Test fun loadConfidenceIsAPercentageOrCalibrating() {
        assertEquals(MetricState.Calibrating(null), loadConfidenceState(0.2, calibrating = true))
        assertEquals(
            MetricState.Value(62.0, 0, "%", DataProvenance.MATHEMATICALLY_DERIVED),
            loadConfidenceState(0.62, calibrating = false),
        )
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), loadConfidenceState(Double.NaN, calibrating = false))
    }

    @Test fun stepsGapsStayEmptyAndOnlyTheLastDayIsProvisional() {
        val history = listOf(TrendPoint(100L, 5_000.0), TrendPoint(101L, null), TrendPoint(102L, 7_200.0))
        val bars = stepsBars(history, provisional = true)
        assertEquals(listOf(100L, 101L, 102L), bars.map { it.epochDay })
        assertEquals(listOf<Double?>(5_000.0, null, 7_200.0), bars.map { it.value })
        assertEquals(listOf(false, false, true), bars.map { it.provisional })
        assertTrue(bars.all { it.tone == ChartTone.STRAIN })
        assertEquals(listOf(false, false, false), stepsBars(history, provisional = false).map { it.provisional })
    }
}
