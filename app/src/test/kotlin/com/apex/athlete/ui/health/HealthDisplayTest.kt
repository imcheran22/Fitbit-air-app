package com.apex.athlete.ui.health

import com.apex.athlete.R
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.MetricType
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HealthDisplayTest {
    private val c: (Double) -> Double = { it * 1.8 }
    private fun near(expected: Double, actual: Double) = assertTrue(abs(expected - actual) < 1e-9, "expected $expected but was $actual")

    @Test
    fun everyTrendMetricHasItsOwnTitleAndOpensADetail() {
        val metrics = AthleteRepository.TREND_METRICS.map { it.first }
        metrics.forEach { assertNotEquals(R.string.health_metric_other, metricTitleRes(it), "no title for $it") }
        assertEquals(metrics.size, metrics.map { metricTitleRes(it) }.distinct().size, "two trend metrics share a title")
        assertEquals(metrics.toSet(), TREND_OPENABLE)
    }

    @Test
    fun bmiHasNoTrendOfItsOwn() {
        assertFalse(MetricType.BMI in TREND_OPENABLE)
        assertTrue(MetricType.WEIGHT in TREND_OPENABLE)
        assertTrue(MetricType.BODY_FAT in TREND_OPENABLE)
        assertTrue(MetricType.VO2_MAX in TREND_OPENABLE)
    }

    @Test
    fun distanceFollowsTheUnitSystem() {
        val km = metricDisplay(MetricType.DISTANCE, "°C", c, UnitSystem.METRIC)
        assertEquals("km", km.unit)
        assertEquals(2, km.decimals)
        near(5.2, km.convert(5_200.0))
        val mi = metricDisplay(MetricType.DISTANCE, "°C", c, UnitSystem.IMPERIAL)
        assertEquals("mi", mi.unit)
        near(1.0, mi.convert(1_609.344))
    }

    @Test
    fun weightFollowsTheUnitSystem() {
        val kg = metricDisplay(MetricType.WEIGHT, "°C", c, UnitSystem.METRIC)
        assertEquals("kg", kg.unit)
        assertEquals(1, kg.decimals)
        near(72.4, kg.convert(72.4))
        val lb = metricDisplay(MetricType.WEIGHT, "°F", c, UnitSystem.IMPERIAL, UnitLabels(lb = "lb"))
        assertEquals("lb", lb.unit)
        near(100.0 * 2.2046226218, lb.convert(100.0))
    }

    @Test
    fun nightlySkinTemperatureIsAbsoluteWhileTheDeviationIsADifference() {
        val metric = metricDisplay(MetricType.SKIN_TEMP_NIGHTLY, "°C", c, UnitSystem.METRIC)
        near(33.8, metric.convert(33.8))
        val imperial = metricDisplay(MetricType.SKIN_TEMP_NIGHTLY, "°F", c, UnitSystem.IMPERIAL)
        near(33.8 * 1.8 + 32.0, imperial.convert(33.8))
        assertEquals("°F", imperial.unit)
        // The deviation keeps using the difference conversion (no 32 degree offset).
        near(1.8, metricDisplay(MetricType.SKIN_TEMP_DEVIATION, "°F", c, UnitSystem.IMPERIAL).convert(1.0))
    }

    @Test
    fun bodyAndVitalsUnits() {
        assertEquals("%", metricDisplay(MetricType.BODY_FAT, "°C", c).unit)
        assertEquals("kg/m²", metricDisplay(MetricType.BMI, "°C", c).unit)
        assertEquals("ms", metricDisplay(MetricType.HRV_SLEEP_SAMPLES, "°C", c).unit)
        assertEquals("ms²", metricDisplay(MetricType.HRV_LOW_FREQUENCY, "°C", c).unit)
        assertEquals("%", metricDisplay(MetricType.SPO2_LOWER_BOUND, "°C", c).unit)
        assertEquals("bpm", metricDisplay(MetricType.SLEEPING_HEART_RATE, "°C", c).unit)
        assertNull(metricDisplay(MetricType.STRESS_SCORE, "°C", c).unit)
    }
}
