package ai.synheart.wear.models

import org.junit.Assert.*
import org.junit.Test

class WearMetricsTest {

    @Test
    fun `test WearMetrics creation with builder`() {
        val timestamp = System.currentTimeMillis()
        val metrics = WearMetrics.builder()
            .timestamp(timestamp)
            .deviceId("test_device")
            .source("test_source")
            .metric(MetricType.HR, 75.0)
            .metric(MetricType.STEPS, 1000.0)
            .metaData("test_key", "test_value")
            .build()

        assertEquals(timestamp, metrics.timestamp)
        assertEquals("test_device", metrics.deviceId)
        assertEquals("test_source", metrics.source)
        assertEquals(75.0, metrics.getMetric(MetricType.HR)!!, 0.01)
        assertEquals(1000.0, metrics.getMetric(MetricType.STEPS)!!, 0.01)
        assertEquals("test_value", metrics.meta["test_key"])
    }

    @Test
    fun `test WearMetrics hasMetric returns correct values`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("test_device")
            .source("test_source")
            .metric(MetricType.HR, 75.0)
            .build()

        assertTrue(metrics.hasMetric(MetricType.HR))
        assertFalse(metrics.hasMetric(MetricType.STEPS))
    }

    @Test
    fun `test WearMetrics getMetric returns null for missing metric`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("test_device")
            .source("test_source")
            .build()

        assertNull(metrics.getMetric(MetricType.HR))
    }

    @Test
    fun `test WearMetrics with RR intervals`() {
        val rrIntervals = listOf(800.0, 820.0, 810.0, 815.0)
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("test_device")
            .source("test_source")
            .rrIntervals(rrIntervals)
            .build()

        assertNotNull(metrics.rrIntervals)
        assertEquals(4, metrics.rrIntervals?.size)
        assertEquals(800.0, metrics.rrIntervals?.get(0)!!, 0.01)
    }

    @Test
    fun `test WearMetrics toMap conversion`() {
        val timestamp = System.currentTimeMillis()
        val metrics = WearMetrics.builder()
            .timestamp(timestamp)
            .deviceId("test_device")
            .source("test_source")
            .metric(MetricType.HR, 75.0)
            .build()

        val map = metrics.toMap()

        assertTrue(map.containsKey("timestamp"))
        assertTrue(map.containsKey("device_id"))
        assertTrue(map.containsKey("source"))
        assertTrue(map.containsKey("metrics"))
        assertTrue(map.containsKey("meta"))
        assertEquals("test_device", map["device_id"])
        assertEquals("test_source", map["source"])
    }

    @Test
    fun `test WearMetrics builder with multiple metrics`() {
        val metricsMap = mapOf(
            MetricType.HR to 75.0,
            MetricType.STEPS to 1000.0,
            MetricType.CALORIES to 250.0
        )

        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("test_device")
            .source("test_source")
            .metrics(metricsMap)
            .build()

        assertEquals(75.0, metrics.getMetric(MetricType.HR)!!, 0.01)
        assertEquals(1000.0, metrics.getMetric(MetricType.STEPS)!!, 0.01)
        assertEquals(250.0, metrics.getMetric(MetricType.CALORIES)!!, 0.01)
    }

    @Test
    fun `test WearMetrics builder defaults`() {
        val metrics = WearMetrics.builder().build()

        assertEquals("unknown", metrics.deviceId)
        assertEquals("unknown", metrics.source)
        assertTrue(metrics.metrics.isEmpty())
        assertTrue(metrics.meta.isEmpty())
        assertNull(metrics.rrIntervals)
    }

}

