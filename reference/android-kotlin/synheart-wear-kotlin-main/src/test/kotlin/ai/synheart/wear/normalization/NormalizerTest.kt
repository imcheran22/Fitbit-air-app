package ai.synheart.wear.normalization

import ai.synheart.wear.models.MetricType
import ai.synheart.wear.models.WearMetrics
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class NormalizerTest {

    private lateinit var normalizer: Normalizer

    @Before
    fun setup() {
        normalizer = Normalizer()
    }

    @Test
    fun `test mergeSnapshots with empty list returns default metrics`() {
        val result = normalizer.mergeSnapshots(emptyList())

        assertEquals("unknown", result.deviceId)
        assertEquals("none", result.source)
        assertTrue(result.metrics.isEmpty())
    }

    @Test
    fun `test mergeSnapshots with single snapshot returns same snapshot`() {
        val timestamp = System.currentTimeMillis()
        val snapshot = WearMetrics.builder()
            .timestamp(timestamp)
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 75.0)
            .build()

        val result = normalizer.mergeSnapshots(listOf(snapshot))

        assertEquals(snapshot.timestamp, result.timestamp)
        assertEquals(snapshot.deviceId, result.deviceId)
        assertEquals(snapshot.source, result.source)
        assertEquals(75.0, result.getMetric(MetricType.HR)!!, 0.01)
    }

    @Test
    fun `test mergeSnapshots with multiple snapshots uses latest timestamp`() {
        val timestamp1 = System.currentTimeMillis()
        val timestamp2 = timestamp1 + 1000

        val snapshot1 = WearMetrics.builder()
            .timestamp(timestamp1)
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 70.0)
            .build()

        val snapshot2 = WearMetrics.builder()
            .timestamp(timestamp2)
            .deviceId("device2")
            .source("source2")
            .metric(MetricType.STEPS, 1000.0)
            .build()

        val result = normalizer.mergeSnapshots(listOf(snapshot1, snapshot2))

        assertEquals(timestamp2, result.timestamp)
        assertEquals("device2", result.deviceId)
        assertTrue(result.source.contains("source2"))
    }

    @Test
    fun `test mergeSnapshots merges metrics from multiple sources`() {
        val timestamp = System.currentTimeMillis()

        val snapshot1 = WearMetrics.builder()
            .timestamp(timestamp)
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 75.0)
            .build()

        val snapshot2 = WearMetrics.builder()
            .timestamp(timestamp + 100)
            .deviceId("device2")
            .source("source2")
            .metric(MetricType.STEPS, 1000.0)
            .build()

        val result = normalizer.mergeSnapshots(listOf(snapshot1, snapshot2))

        assertEquals(75.0, result.getMetric(MetricType.HR)!!, 0.01)
        assertEquals(1000.0, result.getMetric(MetricType.STEPS)!!, 0.01)
    }

    @Test
    fun `test validateMetrics with valid heart rate`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 75.0)
            .build()

        assertTrue(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects invalid heart rate too low`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 20.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects invalid heart rate too high`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 250.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics with valid HRV`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HRV_RMSSD, 50.0)
            .build()

        assertTrue(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects negative HRV`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HRV_RMSSD, -10.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects HRV too high`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HRV_RMSSD, 600.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects negative steps`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.STEPS, -100.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects invalid timestamp`() {
        val metrics = WearMetrics.builder()
            .timestamp(0)
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 75.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects blank device id`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("")
            .source("source1")
            .metric(MetricType.HR, 75.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test validateMetrics rejects blank source`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("")
            .metric(MetricType.HR, 75.0)
            .build()

        assertFalse(normalizer.validateMetrics(metrics))
    }

    @Test
    fun `test normalizeHR clamps to valid range`() {
        assertEquals(30.0, normalizer.normalizeHR(20.0), 0.01)
        assertEquals(75.0, normalizer.normalizeHR(75.0), 0.01)
        assertEquals(220.0, normalizer.normalizeHR(250.0), 0.01)
    }

    @Test
    fun `test normalizeHRV clamps to valid range`() {
        assertEquals(0.0, normalizer.normalizeHRV(-10.0), 0.01)
        assertEquals(50.0, normalizer.normalizeHRV(50.0), 0.01)
        assertEquals(500.0, normalizer.normalizeHRV(600.0), 0.01)
    }

    @Test
    fun `test validateMetrics with multiple valid metrics`() {
        val metrics = WearMetrics.builder()
            .timestamp(System.currentTimeMillis())
            .deviceId("device1")
            .source("source1")
            .metric(MetricType.HR, 75.0)
            .metric(MetricType.STEPS, 1000.0)
            .metric(MetricType.HRV_RMSSD, 50.0)
            .build()

        assertTrue(normalizer.validateMetrics(metrics))
    }
}

