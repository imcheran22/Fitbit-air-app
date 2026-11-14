package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.sleep.SleepBand
import com.apex.athlete.core.analytics.sleep.SleepBands
import com.apex.athlete.core.analytics.sleep.SleepLatency
import com.apex.athlete.core.analytics.sleep.SleepLatencyNote
import com.apex.athlete.core.analytics.sleep.SleepNightInput
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.domain.DataProvenance
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SleepBandsTest {

    private val engine = SleepScoreEngine()
    private val night = SleepNightInput(asleepMinutes = 420.0, inBedMinutes = 440.0, deepMinutes = 75.0, remMinutes = 93.0)

    @Test
    fun `the owner's night is Optimal at baseline and Sufficient when strained`() {
        // 85.0 at the personal baselines (SleepEngineTest), 73.75 with sleeping HR +1.5 SD and HRV -1.5 SD.
        val usual = engine.evaluate(night, 465.0, restorativeZ = 0.0, regularityIndex = 100.0, sleepingHeartRateZ = 0.0, hrvZ = 0.0)
        val strained = engine.evaluate(night, 465.0, regularityIndex = 100.0, sleepingHeartRateZ = 1.5, hrvZ = -1.5)
        assertEquals(SleepBand.OPTIMAL, SleepBands.overall(usual))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.overall(strained))
        // 420 / 465 = 90.3 % of the target: Sufficient on the duration row.
        assertEquals(SleepBand.SUFFICIENT, SleepBands.duration(420.0, 465.0))
        assertEquals(SleepBand.POOR, SleepBands.restoration(strained.restorationZ))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.restoration(usual.restorationZ))
    }

    @Test
    fun `a short night is capped whatever its other parts score`() {
        fun ideal(asleep: Double) = engine.evaluate(
            SleepNightInput(asleepMinutes = asleep, inBedMinutes = asleep, deepMinutes = 0.2 * asleep, remMinutes = 0.25 * asleep),
            465.0, restorativeZ = 2.0, regularityIndex = 100.0, sleepingHeartRateZ = -1.0, hrvZ = 1.0,
        )
        // 89 % of 465 = 413.85 min: score 0.35*100*(413.85-240)/225 + 65 = 92.04 (Optimal by score) -> capped Sufficient.
        val nearly = ideal(413.85)
        assertEquals(0.35 * 100.0 * (413.85 - 240.0) / 225.0 + 65.0, nearly.score, 1e-9)
        assertEquals(SleepBand.OPTIMAL, SleepBands.ofScore(nearly.score))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.overall(nearly))
        // 69 % of 465 = 320.85 min: score 77.6 (Sufficient by score) -> Poor.
        val short = ideal(320.85)
        assertEquals(SleepBand.SUFFICIENT, SleepBands.ofScore(short.score))
        assertEquals(SleepBand.POOR, SleepBands.overall(short))
        assertEquals(SleepBand.OPTIMAL, SleepBands.overall(ideal(465.0)))
    }

    @Test
    fun `row thresholds`() {
        assertEquals(SleepBand.POOR, SleepBands.ofScore(69.999))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.ofScore(70.0))
        assertEquals(SleepBand.OPTIMAL, SleepBands.ofScore(85.0))
        assertNull(SleepBands.ofScore(Double.NaN))
        assertEquals(SleepBand.OPTIMAL, SleepBands.duration(465.0, 465.0))
        assertEquals(SleepBand.POOR, SleepBands.duration(418.0, 465.0)) // 89.9 %
        assertNull(SleepBands.duration(400.0, 0.0))
        assertEquals(SleepBand.POOR, SleepBands.efficiency(74.9))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.efficiency(75.0))
        assertEquals(SleepBand.OPTIMAL, SleepBands.efficiency(85.0))
        assertNull(SleepBands.efficiency(null))
        // Stage quality on the sub-score: the personal usual (80) is Sufficient, +0.5 SD (85) Optimal, -1 SD (70) Sufficient.
        assertEquals(SleepBand.SUFFICIENT, SleepBands.quality(engine.qualitySubScore(0.45, 0.0)))
        assertEquals(SleepBand.OPTIMAL, SleepBands.quality(engine.qualitySubScore(0.45, 0.5)))
        assertEquals(SleepBand.POOR, SleepBands.quality(engine.qualitySubScore(0.45, -1.5)))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.consistency(81.0))
        assertEquals(SleepBand.POOR, SleepBands.restoration(-1.0))
        assertEquals(SleepBand.SUFFICIENT, SleepBands.restoration(-0.99))
        assertEquals(SleepBand.OPTIMAL, SleepBands.restoration(0.5))
        assertNull(SleepBands.restoration(null))
    }

    @Test
    fun `provider latency is kept as reported and a zero carries a note`() {
        assertNull(SleepLatency.reading(null, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API))
        assertNull(SleepLatency.reading(-3, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API))
        val zero = SleepLatency.reading(0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)!!
        assertEquals(0, zero.minutes)
        assertEquals(SleepLatencyNote.ZERO_LIKELY_NOT_MEASURED, zero.note)
        val twelve = SleepLatency.reading(12, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API)!!
        assertEquals(12, twelve.minutes)
        assertNull(twelve.note)
    }
}
