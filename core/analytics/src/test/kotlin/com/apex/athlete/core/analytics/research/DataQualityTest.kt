package com.apex.athlete.core.analytics.research

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DataQualityTest {

    private val eps = 1e-9

    @Test
    fun `coverage is valid over expected`() {
        val c = DataQuality.coverage(45, 50)!!
        assertEquals(0.9, c.fraction, eps)
        assertEquals(1.0, DataQuality.coverage(60, 50)!!.fraction, eps)
        assertEquals(0.0, DataQuality.coverage(0, 50)!!.fraction, eps)
    }

    @Test
    fun `nothing expected means coverage is unknown not zero or full`() {
        assertNull(DataQuality.coverage(0, 0))
        assertNull(DataQuality.coverage(5, 0))
        assertNull(DataQuality.coverage(-1, 10))
    }

    @Test
    fun `T-DH-5 implausible heart rates are rejected and counted`() {
        val r = DataQuality.filterPlausible(listOf(60.0, 300.0, Double.NaN, 24.9, 25.0, 250.0, 250.1), DataQuality.HEART_RATE_BPM)
        assertEquals(listOf(60.0, 25.0, 250.0), r.valid)
        assertEquals(4, r.rejected)
    }

    @Test
    fun `ranges for RMSSD and SpO2`() {
        assertEquals(listOf(1.0, 200.0), DataQuality.filterPlausible(listOf(0.9, 1.0, 200.0, 200.1), DataQuality.RMSSD_MS).valid)
        assertEquals(listOf(0.0, 100.0), DataQuality.filterPlausible(listOf(-1.0, 0.0, 100.0, 101.0), DataQuality.SPO2_PERCENT).valid)
        assertEquals(0, DataQuality.filterPlausible(emptyList(), DataQuality.SPO2_PERCENT).rejected)
    }

    @Test
    fun `T-DH-4 a day without data is missing not zero`() {
        assertEquals(DayCompleteness.MISSING, DataQuality.dayCompleteness(null))
        assertEquals(DayCompleteness.MISSING, DataQuality.dayCompleteness(0))
        assertEquals(DayCompleteness.PARTIAL, DataQuality.dayCompleteness(599))
        assertEquals(DayCompleteness.COMPLETE, DataQuality.dayCompleteness(600))
        assertEquals(DayCompleteness.COMPLETE, DataQuality.dayCompleteness(1440))
        assertEquals(DayCompleteness.PARTIAL, DataQuality.dayCompleteness(400, minWornMinutes = 500))
    }

    // -------------------------------------------------------------------------- confidence

    private fun inputs(
        reading: Boolean = true,
        baseline: Int = 28,
        coverage: Double? = 0.9,
        sync: Double? = 2.0,
        implausible: Boolean = false,
        confounders: Int = 0,
    ) = ConfidenceInputs(reading, baseline, coverage, sync, implausible, confounders)

    @Test
    fun `everything in order is high`() {
        val c = DataQuality.confidence(inputs())
        assertEquals(ConfidenceLevel.HIGH, c.level)
        assertTrue(c.reasons.isEmpty())
        assertTrue(c.alertAllowed)
    }

    @Test
    fun `coverage that does not apply is ignored`() {
        assertEquals(ConfidenceLevel.HIGH, DataQuality.confidence(inputs(coverage = null)).level)
    }

    @Test
    fun `a provisional baseline or partial coverage or a confounder is moderate`() {
        val provisional = DataQuality.confidence(inputs(baseline = 17))
        assertEquals(ConfidenceLevel.MODERATE, provisional.level)
        assertEquals(setOf(ConfidenceReason.BASELINE_PROVISIONAL), provisional.reasons)
        assertEquals(ConfidenceLevel.HIGH, DataQuality.confidence(inputs(baseline = 21)).level)
        assertEquals(ConfidenceLevel.MODERATE, DataQuality.confidence(inputs(baseline = 14)).level)

        val partial = DataQuality.confidence(inputs(coverage = 0.7))
        assertEquals(setOf(ConfidenceReason.PARTIAL_COVERAGE), partial.reasons)
        assertEquals(ConfidenceLevel.HIGH, DataQuality.confidence(inputs(coverage = 0.8)).level)

        val tagged = DataQuality.confidence(inputs(confounders = 1))
        assertEquals(setOf(ConfidenceReason.KNOWN_CONFOUNDER), tagged.reasons)
        assertTrue(tagged.alertAllowed)
    }

    @Test
    fun `each low condition removes the alert`() {
        fun low(i: ConfidenceInputs, reason: ConfidenceReason) {
            val c = DataQuality.confidence(i)
            assertEquals(ConfidenceLevel.LOW, c.level)
            assertTrue(reason in c.reasons, "expected $reason in ${c.reasons}")
            assertFalse(c.alertAllowed)
        }
        low(inputs(reading = false), ConfidenceReason.NO_CURRENT_READING)
        low(inputs(sync = 25.0), ConfidenceReason.STALE_DATA)
        low(inputs(sync = null), ConfidenceReason.STALE_DATA)
        low(inputs(baseline = 13), ConfidenceReason.BASELINE_NOT_ESTABLISHED)
        low(inputs(coverage = 0.49), ConfidenceReason.SPARSE_COVERAGE)
        low(inputs(coverage = Double.NaN), ConfidenceReason.SPARSE_COVERAGE)
        low(inputs(implausible = true), ConfidenceReason.IMPLAUSIBLE_VALUES)
    }

    @Test
    fun `stale means older than 24 hours`() {
        assertEquals(ConfidenceLevel.HIGH, DataQuality.confidence(inputs(sync = 24.0)).level)
        assertEquals(ConfidenceLevel.LOW, DataQuality.confidence(inputs(sync = 24.1)).level)
    }

    @Test
    fun `low outranks moderate and all reasons are kept`() {
        val c = DataQuality.confidence(inputs(baseline = 17, sync = 30.0, confounders = 2))
        assertEquals(ConfidenceLevel.LOW, c.level)
        assertEquals(
            setOf(ConfidenceReason.STALE_DATA, ConfidenceReason.BASELINE_PROVISIONAL, ConfidenceReason.KNOWN_CONFOUNDER),
            c.reasons,
        )
    }

    // -------------------------------------------------------------------- unusual offsets

    @Test
    fun `a night recorded on another offset is flagged while the usual one holds`() {
        val offsets = (1L..7L).associateWith { 60 } + (7L to 120)
        assertEquals(setOf(7L), DataQuality.daysWithUnusualOffset(offsets))
    }

    @Test
    fun `a trip is flagged until it becomes the majority`() {
        val offsets = (1L..7L).associateWith { 60 } + (8L to 120) + (9L to 120) + (10L to 120) + (11L to 120)
        val flagged = DataQuality.daysWithUnusualOffset(offsets)
        assertEquals(setOf(8L, 9L, 10L), flagged)
    }

    @Test
    fun `a tie flags nothing and a single night flags nothing`() {
        assertEquals(emptySet(), DataQuality.daysWithUnusualOffset(mapOf(1L to 60, 2L to 120)))
        assertEquals(emptySet(), DataQuality.daysWithUnusualOffset(mapOf(1L to 60)))
        assertEquals(emptySet(), DataQuality.daysWithUnusualOffset(emptyMap()))
        assertFailsWith<IllegalArgumentException> { DataQuality.daysWithUnusualOffset(emptyMap(), 1) }
    }

    @Test
    fun `a missing night does not break the window`() {
        val offsets = mapOf(1L to 60, 2L to 60, 4L to 60, 5L to 60, 6L to 120)
        assertEquals(setOf(6L), DataQuality.daysWithUnusualOffset(offsets))
    }
}
