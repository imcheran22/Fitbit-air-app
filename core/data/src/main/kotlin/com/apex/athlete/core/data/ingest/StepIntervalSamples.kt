package com.apex.athlete.core.data.ingest

import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.domain.MetricType

/**
 * Turns live step intervals (Google Health `steps` points, Health Connect `StepsRecord`) into step
 * samples for the stress engine's movement gate. These are a separate store from the STEPS day totals
 * and are never summed into them.
 *
 * Resolution is at most one minute: an interval shorter than a minute is folded into its minute and
 * the counts of one start are added, so the (metric, start) key stays unique and a re-sync overwrites
 * the same rows. Longer intervals keep their own start and end. Zero counts are dropped.
 */
object StepIntervalSamples {
    private const val MINUTE_MS = 60_000L

    data class Interval(val startMillis: Long, val endMillis: Long?, val count: Double)

    fun build(intervals: List<Interval>): List<SampleObservation> {
        class Acc(var end: Long, var sum: Double)
        val byStart = java.util.TreeMap<Long, Acc>()
        for (i in intervals) {
            if (!i.count.isFinite() || i.count <= 0.0) continue
            val end = i.endMillis
            val short = end == null || end - i.startMillis < MINUTE_MS
            val start = if (short) Math.floorDiv(i.startMillis, MINUTE_MS) * MINUTE_MS else i.startMillis
            val e = if (short) start + MINUTE_MS else end!!
            val acc = byStart.getOrPut(start) { Acc(e, 0.0) }
            acc.sum += i.count
            if (e > acc.end) acc.end = e
        }
        return byStart.map { (start, a) -> SampleObservation(MetricType.STEPS, start, a.sum, a.end) }
    }
}
