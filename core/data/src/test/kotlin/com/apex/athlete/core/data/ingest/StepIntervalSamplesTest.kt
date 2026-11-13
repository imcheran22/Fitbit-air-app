package com.apex.athlete.core.data.ingest

import com.apex.athlete.core.domain.MetricType
import kotlin.test.Test
import kotlin.test.assertEquals

class StepIntervalSamplesTest {
    private val m = 60_000L

    @Test
    fun subMinuteIntervalsFoldIntoTheirMinuteAndLongerOnesKeepTheirSpan() {
        val out = StepIntervalSamples.build(
            listOf(
                StepIntervalSamples.Interval(10 * m + 5_000, 10 * m + 15_000, 4.0),
                StepIntervalSamples.Interval(10 * m + 20_000, 10 * m + 30_000, 6.0),
                StepIntervalSamples.Interval(20 * m, 35 * m, 500.0),
                StepIntervalSamples.Interval(40 * m, 41 * m, 0.0),
                StepIntervalSamples.Interval(50 * m, null, 7.0),
            ),
        )
        assertEquals(
            listOf(
                Triple(10 * m, 11 * m, 10.0),
                Triple(20 * m, 35 * m, 500.0),
                Triple(50 * m, 51 * m, 7.0),
            ),
            out.map { Triple(it.epochMillis, it.endEpochMillis, it.value) },
        )
        assertEquals(setOf(MetricType.STEPS), out.map { it.metric }.toSet())
    }
}
