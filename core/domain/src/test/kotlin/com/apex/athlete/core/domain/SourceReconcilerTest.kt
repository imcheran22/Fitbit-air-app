package com.apex.athlete.core.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SourceReconcilerTest {

    private fun c(p: DataProvenance, res: Int? = null, at: Long = 0L) = SourceCandidate(p, res, at)

    @Test
    fun `empty slot always accepts the incoming value`() {
        assertTrue(SourceReconciler.shouldReplace(MetricType.STEPS, null, c(DataProvenance.ESTIMATED)))
    }

    @Test
    fun `finer resolution wins between automatic sources`() {
        val perMinuteApi = c(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, res = 60)
        val coarseHealthConnect = c(DataProvenance.IMPORTED_HEALTH_CONNECT, res = 900)
        assertFalse(SourceReconciler.shouldReplace(MetricType.STEPS, perMinuteApi, coarseHealthConnect))
        assertTrue(SourceReconciler.shouldReplace(MetricType.STEPS, coarseHealthConnect, perMinuteApi))
    }

    @Test
    fun `wearable metrics prefer the Google Health API when resolution is unknown`() {
        val api = c(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
        val hc = c(DataProvenance.IMPORTED_HEALTH_CONNECT)
        assertTrue(SourceReconciler.shouldReplace(MetricType.HRV_RMSSD, hc, api))
        assertFalse(SourceReconciler.shouldReplace(MetricType.HRV_RMSSD, api, hc))
    }

    @Test
    fun `third party device metrics prefer Health Connect`() {
        val api = c(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
        val hc = c(DataProvenance.IMPORTED_HEALTH_CONNECT)
        assertTrue(SourceReconciler.shouldReplace(MetricType.BLOOD_PRESSURE_SYSTOLIC, api, hc))
        assertFalse(SourceReconciler.shouldReplace(MetricType.BLOOD_PRESSURE_SYSTOLIC, hc, api))
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, SourceReconciler.preferredSource(MetricType.BLOOD_GLUCOSE))
    }

    @Test
    fun `body metrics prefer the Google Health API because Health Connect has no weight or body fat stream`() {
        // Health Connect never delivers WEIGHT or BODY_FAT (no stream reads them), so ranking it first pointed at a source that is never read.
        val api = c(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)
        val hc = c(DataProvenance.IMPORTED_HEALTH_CONNECT)
        for (m in listOf(MetricType.WEIGHT, MetricType.BODY_FAT)) {
            assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, SourceReconciler.preferredSource(m))
            assertTrue(SourceReconciler.shouldReplace(m, hc, api))
            assertFalse(SourceReconciler.shouldReplace(m, api, hc))
        }
    }

    @Test
    fun `sleep stage HRV is its own metric, GH-preferred and kept apart from nightly RMSSD`() {
        val m = MetricType.HRV_SLEEP_SAMPLES
        assertEquals("hrv_sleep_samples", m.storageKey)
        assertEquals(MetricType.HRV_SLEEP_SAMPLES, MetricType.fromStorageKey("hrv_sleep_samples"))
        assertTrue(m != MetricType.HRV_RMSSD && m.storageKey != MetricType.HRV_RMSSD.storageKey)
        assertEquals(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, SourceReconciler.preferredSource(m))
        assertFalse(m.isDerived)
    }

    @Test
    fun `observed data is never overwritten by an estimate`() {
        val measured = c(DataProvenance.IMPORTED_HEALTH_CONNECT, at = 1)
        val estimate = c(DataProvenance.ESTIMATED, at = 99)
        assertFalse(SourceReconciler.shouldReplace(MetricType.VO2_MAX, measured, estimate))
        assertTrue(SourceReconciler.shouldReplace(MetricType.VO2_MAX, estimate, measured))
    }

    @Test
    fun `user entry overrides an automatic reading and is not overwritten by a later sync`() {
        val auto = c(DataProvenance.IMPORTED_HEALTH_CONNECT, at = 50)
        val manual = c(DataProvenance.USER_REPORTED, at = 10)
        assertTrue(SourceReconciler.shouldReplace(MetricType.WEIGHT, auto, manual))
        assertFalse(SourceReconciler.shouldReplace(MetricType.WEIGHT, manual, auto))
    }

    @Test
    fun `same source keeps the newer write`() {
        val old = c(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, at = 10)
        val new = c(DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, at = 20)
        assertTrue(SourceReconciler.shouldReplace(MetricType.STEPS, old, new))
        assertFalse(SourceReconciler.shouldReplace(MetricType.STEPS, new, old))
    }

    @Test
    fun `storage keys are unique and round trip`() {
        assertEquals(MetricType.entries.size, MetricType.entries.map { it.storageKey }.toSet().size)
        MetricType.entries.forEach { assertEquals(it, MetricType.fromStorageKey(it.storageKey)) }
        DataProvenance.entries.forEach { assertEquals(it, DataProvenance.fromStorageKey(it.storageKey)) }
        SleepStage.entries.forEach { assertEquals(it, SleepStage.fromStorageKey(it.storageKey)) }
    }
}
