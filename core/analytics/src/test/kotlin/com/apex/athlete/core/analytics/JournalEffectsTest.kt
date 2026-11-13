package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.journal.DailyOutcome
import com.apex.athlete.core.analytics.journal.JournalEffects
import com.apex.athlete.core.analytics.journal.JournalEntry
import com.apex.athlete.core.analytics.journal.JournalOutcomeKind
import com.apex.athlete.core.analytics.journal.JournalSkipReason
import kotlin.math.exp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class JournalEffectsTest {

    // Factor logged on days 1..10: true on 1..5, false on 6..10. Next-day recovery (days 2..11):
    // after-yes arm [70,72,74,76,78], after-no arm [60,62,64,66,68] -> the Welch hand example (diff 10, CI 5.388..14.612, p 0.00105).
    private val entries = (1L..10L).map { JournalEntry(it, mapOf("alcohol" to (it <= 5))) }
    private val recovery = (2L..11L).map { d ->
        val v = if (d <= 6) 70.0 + 2 * (d - 2) else 60.0 + 2 * (d - 7)
        DailyOutcome(d, recovery = v, rmssdMs = null)
    }

    @Test
    fun `recovery effect with 95 percent interval`() {
        val rep = JournalEffects.analyze(entries, recovery, asOfEpochDay = 11)
        val e = rep.effects.single { it.outcome == JournalOutcomeKind.RECOVERY_POINTS }
        assertEquals("alcohol", e.factor)
        assertEquals(5, e.nWith); assertEquals(5, e.nWithout)
        assertEquals(74.0, e.meanWith, 1e-9); assertEquals(64.0, e.meanWithout, 1e-9)
        assertEquals(10.0, e.effect, 1e-9)
        assertEquals(5.387992, e.ciLow, 1e-4)
        assertEquals(14.612008, e.ciHigh, 1e-4)
        assertEquals(8.0, e.degreesOfFreedom, 1e-9)
        assertEquals(0.0010528, e.pValue, 1e-6)
        assertTrue(e.intervalExcludesZero)
    }

    // Hand: ln RMSSD arms [4.0,4.1,4.2,4.3,4.4] / [3.8,3.9,4.0,4.1,4.2]: diff 0.2, var 0.025 each, SE 0.1, t 2, df 8.
    // Effect reported as percent: (e^0.2 - 1) = 22.1403 %; CI e^(0.2 +- 0.2306004) - 1 = [-3.0137 %, 53.8181 %]; p(t=2, df=8) = 0.080516.
    @Test
    fun `hrv effect is analysed on ln scale and reported as percent`() {
        val out = (2L..11L).map { d ->
            val ln = if (d <= 6) 4.0 + 0.1 * (d - 2) else 3.8 + 0.1 * (d - 7)
            DailyOutcome(d, recovery = null, rmssdMs = exp(ln))
        }
        val rep = JournalEffects.analyze(entries, out, asOfEpochDay = 11)
        assertEquals(1, rep.effects.size)
        val e = rep.effects.single()
        assertEquals(JournalOutcomeKind.HRV_PERCENT, e.outcome)
        assertEquals(22.1403, e.effect, 1e-3)
        assertEquals(-3.0137, e.ciLow, 1e-3)
        assertEquals(53.8181, e.ciHigh, 1e-3)
        assertEquals(0.080516, e.pValue, 1e-5)
        assertTrue(!e.intervalExcludesZero)
    }

    @Test
    fun `fewer than five per arm reports nothing`() {
        val rep = JournalEffects.analyze(entries.filter { it.epochDay != 3L }, recovery, asOfEpochDay = 11)
        assertTrue(rep.effects.isEmpty())
        val s = rep.skipped.single { it.outcome == JournalOutcomeKind.RECOVERY_POINTS }
        assertEquals(JournalSkipReason.TOO_FEW_PER_ARM, s.reason)
    }

    @Test
    fun `unlogged factor days and missing outcomes are excluded, not treated as no`() {
        // Day 3's factor is not logged (key absent) and day 8's outcome is null: 4 + 4 pairs remain -> skipped.
        val e2 = entries.map { if (it.epochDay == 3L) JournalEntry(3, emptyMap()) else it }
        val o2 = recovery.map { if (it.epochDay == 9L) it.copy(recovery = null) else it }
        val rep = JournalEffects.analyze(e2, o2, asOfEpochDay = 11)
        assertTrue(rep.effects.isEmpty())
    }

    @Test
    fun `only the last 90 days count`() {
        // Same data shifted 100 days earlier relative to asOf: nothing in the window.
        val rep = JournalEffects.analyze(entries, recovery, asOfEpochDay = 111)
        assertTrue(rep.effects.isEmpty())
        // As-of day 91 keeps outcome days 2..91 -> all 10 outcomes (window is asOf-89 .. asOf = 2..91).
        assertEquals(1, JournalEffects.analyze(entries, recovery, asOfEpochDay = 91).effects.size)
        // As-of day 92 drops outcome day 2 (4 + 5 pairs remain) -> skipped.
        assertTrue(JournalEffects.analyze(entries, recovery, asOfEpochDay = 92).effects.isEmpty())
    }

    @Test
    fun `zero variance in both arms is skipped`() {
        val flat = recovery.map { it.copy(recovery = 50.0) }
        val rep = JournalEffects.analyze(entries, flat, asOfEpochDay = 11)
        assertEquals(JournalSkipReason.NO_VARIANCE, rep.skipped.single().reason)
    }

    @Test
    fun `tests performed is reported so the caller can caveat multiplicity`() {
        val two = entries.map { JournalEntry(it.epochDay, it.factors + ("caffeine" to (it.epochDay % 2 == 0L))) }
        val rep = JournalEffects.analyze(two, recovery, asOfEpochDay = 11)
        assertNotNull(rep)
        assertEquals(2, rep.testsPerformed)
    }
}
