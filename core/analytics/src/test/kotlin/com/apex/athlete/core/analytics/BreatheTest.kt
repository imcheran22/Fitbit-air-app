package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.breathe.BreathePattern
import com.apex.athlete.core.analytics.breathe.BreathePhaseType
import com.apex.athlete.core.analytics.breathe.BreathePhaseType.EXHALE
import com.apex.athlete.core.analytics.breathe.BreathePhaseType.HOLD_AFTER_EXHALE
import com.apex.athlete.core.analytics.breathe.BreathePhaseType.HOLD_AFTER_INHALE
import com.apex.athlete.core.analytics.breathe.BreathePhaseType.INHALE
import com.apex.athlete.core.analytics.breathe.BreathePhaseType.TOP_UP_INHALE
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class BreatheTest {

    @Test
    fun catalogueHasTheFivePatternsWithTheirCycleLengths() {
        assertEquals(5, BreathePattern.entries.size)
        assertEquals(16_000L, BreathePattern.BOX.cycleMillis)
        assertEquals(19_000L, BreathePattern.FOUR_SEVEN_EIGHT.cycleMillis)
        assertEquals(11_000L, BreathePattern.COHERENT.cycleMillis)
        assertEquals(10_000L, BreathePattern.EXTENDED_EXHALE.cycleMillis)
        assertEquals(9_000L, BreathePattern.PHYSIOLOGICAL_SIGH.cycleMillis)
    }

    @Test
    fun boxPhasesAndBoundaries() {
        val p = BreathePattern.BOX
        p.phaseAt(0).let { assertEquals(INHALE, it.type); assertEquals(0.0, it.phaseProgress, 0.0); assertEquals(0, it.completedCycles) }
        p.phaseAt(2_000).let { assertEquals(INHALE, it.type); assertEquals(0.5, it.phaseProgress, 1e-12) }
        p.phaseAt(4_000).let { assertEquals(HOLD_AFTER_INHALE, it.type); assertEquals(0.0, it.phaseProgress, 0.0); assertEquals(1, it.phaseIndex) }
        p.phaseAt(8_000).let { assertEquals(EXHALE, it.type) }
        p.phaseAt(12_000).let { assertEquals(HOLD_AFTER_EXHALE, it.type) }
        p.phaseAt(15_999).let { assertEquals(HOLD_AFTER_EXHALE, it.type); assertEquals(3_999.0 / 4_000.0, it.phaseProgress, 1e-12); assertEquals(0, it.completedCycles) }
        p.phaseAt(16_000).let { assertEquals(INHALE, it.type); assertEquals(0.0, it.phaseProgress, 0.0); assertEquals(1, it.completedCycles) }
        p.phaseAt(34_000).let { assertEquals(INHALE, it.type); assertEquals(0.5, it.phaseProgress, 1e-12); assertEquals(2, it.completedCycles) }
    }

    @Test
    fun fourSevenEightHoldsForSevenSeconds() {
        val p = BreathePattern.FOUR_SEVEN_EIGHT
        p.phaseAt(5_500).let { assertEquals(HOLD_AFTER_INHALE, it.type); assertEquals(1_500.0 / 7_000.0, it.phaseProgress, 1e-12) }
        p.phaseAt(11_000).let { assertEquals(EXHALE, it.type); assertEquals(0.0, it.phaseProgress, 0.0) }
        p.phaseAt(18_999).let { assertEquals(EXHALE, it.type); assertEquals(0, it.completedCycles) }
    }

    @Test
    fun coherentIsFiveAndAHalfSecondsEachWay() {
        val p = BreathePattern.COHERENT
        assertEquals(listOf(INHALE, EXHALE), p.phases.map { it.type })
        assertEquals(listOf(5_500L, 5_500L), p.phases.map { it.durationMillis })
        p.phaseAt(5_499).let { assertEquals(INHALE, it.type) }
        p.phaseAt(5_500).let { assertEquals(EXHALE, it.type); assertEquals(0.0, it.phaseProgress, 0.0) }
    }

    @Test
    fun extendedExhaleIsFourInSixOut() {
        val p = BreathePattern.EXTENDED_EXHALE
        assertEquals(listOf(4_000L, 6_000L), p.phases.map { it.durationMillis })
        p.phaseAt(7_000).let { assertEquals(EXHALE, it.type); assertEquals(0.5, it.phaseProgress, 1e-12) }
    }

    @Test
    fun physiologicalSighIsADoubleInhaleThenALongExhale() {
        val p = BreathePattern.PHYSIOLOGICAL_SIGH
        assertEquals(listOf(INHALE, TOP_UP_INHALE, EXHALE), p.phases.map { it.type })
        assertTrue(p.phases[2].durationMillis > p.phases[0].durationMillis + p.phases[1].durationMillis - 1)
        p.phaseAt(2_500).let { assertEquals(TOP_UP_INHALE, it.type); assertEquals(0.5, it.phaseProgress, 1e-12) }
        p.phaseAt(3_000).let { assertEquals(EXHALE, it.type); assertEquals(0.0, it.phaseProgress, 0.0) }
    }

    @Test
    fun cyclesForCountsWholeCycles() {
        assertEquals(18, BreathePattern.BOX.cyclesFor(300))            // 300 / 16 = 18.75
        assertEquals(15, BreathePattern.FOUR_SEVEN_EIGHT.cyclesFor(300)) // 300 / 19 = 15.79
        assertEquals(27, BreathePattern.COHERENT.cyclesFor(300))       // 300 / 11 = 27.27
        assertEquals(6, BreathePattern.EXTENDED_EXHALE.cyclesFor(60))
        assertEquals(6, BreathePattern.PHYSIOLOGICAL_SIGH.cyclesFor(60)) // 60 / 9 = 6.67
        assertEquals(0, BreathePattern.COHERENT.cyclesFor(10))
        assertEquals(0, BreathePattern.BOX.cyclesFor(0))
        assertFailsWith<IllegalArgumentException> { BreathePattern.BOX.cyclesFor(-1) }
    }

    @Test
    fun negativeElapsedTimeIsRejected() {
        assertFailsWith<IllegalArgumentException> { BreathePattern.BOX.phaseAt(-1) }
    }

    @Test
    fun progressIsAlwaysInUnitIntervalAndMatchesTheCycleArithmetic() {
        for (p in BreathePattern.entries) {
            var t = 0L
            while (t <= p.cycleMillis * 3) {
                val s = p.phaseAt(t)
                assertTrue(s.phaseProgress >= 0.0 && s.phaseProgress < 1.0, "${p.name} t=$t")
                assertEquals((t / p.cycleMillis).toInt(), s.completedCycles)
                // Sum of earlier phases plus elapsed-in-phase reproduces the position inside the cycle.
                val before = p.phases.take(s.phaseIndex).sumOf { it.durationMillis }
                assertEquals(t % p.cycleMillis, before + s.elapsedInPhaseMillis)
                t += 250
            }
        }
        val allTypes: Set<BreathePhaseType> = BreathePattern.entries.flatMap { it.phases.map { ph -> ph.type } }.toSet()
        assertEquals(BreathePhaseType.entries.toSet(), allTypes)
    }
}
