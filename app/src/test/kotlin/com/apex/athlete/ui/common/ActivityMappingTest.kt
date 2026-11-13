package com.apex.athlete.ui.common

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertIs

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class ActivityMappingTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

    private fun formatter(units: UnitSystem) = ApexFormatter(context, units, true, { ZoneOffset.UTC }, { 1_800_000_000_000L })

    private fun reading(metric: MetricType, value: Double?) =
        MetricReading(metric, value, 20_000L, value?.let { sensor }, if (value == null) com.apex.athlete.core.data.repository.ReadingMissing.NO_DATA else null)

    @Test fun distanceFollowsTheUnitSystem() {
        val km = activityState(reading(MetricType.DISTANCE, 5_000.0), formatter(UnitSystem.METRIC), provisional = false)
        assertEquals(MetricState.Value(5.0, 2, "km", sensor), km)
        val mi = assertIs<MetricState.Value>(activityState(reading(MetricType.DISTANCE, 1_609.344), formatter(UnitSystem.IMPERIAL), false))
        assertEquals(1.0, mi.value, 1e-9)
        assertEquals("mi", mi.unit)
        assertEquals(2, mi.decimals)
    }

    @Test fun caloriesMinutesAndStepsCarryTheirUnits() {
        val f = formatter(UnitSystem.METRIC)
        assertEquals(MetricState.Value(512.0, 0, "kcal", sensor), activityState(reading(MetricType.CALORIES_ACTIVE, 512.0), f, false))
        assertEquals(MetricState.Value(38.0, 0, "min", sensor), activityState(reading(MetricType.ACTIVE_ZONE_MINUTES, 38.0), f, false))
        assertEquals(MetricState.Value(8_412.0, 0, null, sensor), activityState(reading(MetricType.STEPS, 8_412.0), f, false))
    }

    @Test fun todayIsProvisional() {
        val s = assertIs<MetricState.Value>(activityState(reading(MetricType.STEPS, 100.0), formatter(UnitSystem.METRIC), provisional = true))
        assertEquals(true, s.isProvisional)
    }

    @Test fun aMissingOrNonFiniteReadingIsUnavailableNeverZero() {
        val f = formatter(UnitSystem.METRIC)
        val none = MetricState.Unavailable(MetricReason.NO_DATA)
        assertEquals(none, activityState(null, f, false))
        assertEquals(none, activityState(reading(MetricType.STEPS, null), f, false))
        assertEquals(none, activityState(reading(MetricType.STEPS, Double.NaN), f, false))
    }

    @Test fun rowsKeepTheRequestedOrderAndFillMissingMetrics() {
        val rows = activityRows(
            readings = mapOf(MetricType.STEPS to reading(MetricType.STEPS, 1_000.0)),
            metrics = listOf(MetricType.STEPS, MetricType.DISTANCE),
            formatter = formatter(UnitSystem.METRIC),
            provisional = false,
        )
        assertEquals(listOf(MetricType.STEPS, MetricType.DISTANCE), rows.map { it.metric })
        assertEquals(MetricState.Value(1_000.0, 0, null, sensor), rows[0].state)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), rows[1].state)
    }

    @Test fun elevationAndDistanceConversions() {
        assertEquals(328.0839895, elevationInUnits(100.0, UnitSystem.IMPERIAL), 1e-6)
        assertEquals(100.0, elevationInUnits(100.0, UnitSystem.METRIC), 0.0)
        assertEquals(2.5, distanceInUnits(2_500.0, UnitSystem.METRIC), 0.0)
    }
}
