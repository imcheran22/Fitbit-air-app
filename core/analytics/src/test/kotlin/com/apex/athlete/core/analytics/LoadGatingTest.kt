package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.load.DailyLoadPolicy
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Formula version 3, training load (docs/review/METRICS_ALIGNMENT.md B2, B3, B4, B12 and the
 * density/recency confidence gate of docs/review/BEVEL_ALIGNMENT.md item 3).
 */
class LoadGatingTest {

    private val engine = TrainingLoadEngine()
    private val eps = 1e-9

    private fun history(loads: List<Double?>, lastDay: Long = 200) =
        loads.mapIndexed { i, v -> DailyLoad(lastDay - loads.size + 1 + i, v) }

    // --- Item 2: partly worn and provisional days stay out of load (B2, B3) --------------------------

    @Test
    fun `a finished day with 40 minutes of heart rate is not a load day`() {
        assertNull(DailyLoadPolicy.storedTrimp(trimp = 0.8, recordedMinutes = 40.0))
        assertNull(DailyLoadPolicy.historyEntry(epochDay = 150, todayEpochDay = 200, trimp = 0.8, recordedMinutes = 40.0).trimp)
        // Exactly the minimum counts; one minute fewer does not.
        assertEquals(12.5, DailyLoadPolicy.storedTrimp(12.5, DailyLoadPolicy.MIN_WEAR_MINUTES)!!, eps)
        assertNull(DailyLoadPolicy.storedTrimp(12.5, DailyLoadPolicy.MIN_WEAR_MINUTES - 1))
        assertEquals(600.0, DailyLoadPolicy.MIN_WEAR_MINUTES, 0.0)
    }

    @Test
    fun `a day with no strain or a non finite trimp stays missing`() {
        assertNull(DailyLoadPolicy.storedTrimp(null, null))
        assertNull(DailyLoadPolicy.storedTrimp(null, 1440.0))
        assertNull(DailyLoadPolicy.storedTrimp(Double.NaN, 1440.0))
        assertNull(DailyLoadPolicy.storedTrimp(Double.POSITIVE_INFINITY, 1440.0))
        assertNull(DailyLoadPolicy.storedTrimp(10.0, Double.NaN))
    }

    @Test
    fun `a well worn finished day is a recorded load, including a rest day`() {
        assertEquals(DailyLoad(150, 80.0), DailyLoadPolicy.historyEntry(150, todayEpochDay = 200, trimp = 80.0, recordedMinutes = 1200.0))
        // 0.0 is a recorded rest day, which is not the same as missing.
        assertEquals(DailyLoad(150, 0.0), DailyLoadPolicy.historyEntry(150, 200, 0.0, 1300.0))
    }

    @Test
    fun `today is provisional and never enters the load figures`() {
        assertNull(DailyLoadPolicy.historyEntry(epochDay = 200, todayEpochDay = 200, trimp = 5.0, recordedMinutes = 900.0).trimp)
        assertNull(DailyLoadPolicy.historyEntry(epochDay = 201, todayEpochDay = 200, trimp = 5.0, recordedMinutes = 900.0).trimp)
        // ... but its lower-bound TRIMP may be stored once the band has been worn long enough.
        assertEquals(5.0, DailyLoadPolicy.storedTrimp(5.0, 900.0)!!, eps)
    }

    @Test
    fun `28 steady days at 100 plus 5 TRIMP so far today gives an uncoupled ratio of exactly 1`() {
        val steady = (172L..199L).map { DailyLoad(it, 100.0) }
        // Version 2 passed today's 5.0 straight in: (6*100 + 5) / 7 / 100 = 0.864.
        val withMorning = engine.analyze(steady + DailyLoad(200, 5.0), 200)
        assertEquals(0.864, withMorning.acwrUncoupled!!, 0.001)
        // Version 3: today is a null entry; the averages carry forward.
        val today = DailyLoadPolicy.historyEntry(200, todayEpochDay = 200, trimp = 5.0, recordedMinutes = 420.0)
        val r = engine.analyze(steady + today, 200)
        assertEquals(1.0, r.acwrUncoupled!!, eps)
        assertEquals(100.0, r.acuteLoad!!, eps)
        assertEquals(10.0, r.monotony!!, eps)
    }

    @Test
    fun `a 40 minute day leaves ATL and CTL exactly as if the day had no data`() {
        val steady = (150L..198L).map { DailyLoad(it, 100.0) }
        val without = engine.analyze(steady + DailyLoad(199, null), 199)
        val partial = DailyLoadPolicy.historyEntry(199, todayEpochDay = 200, trimp = 0.8, recordedMinutes = 40.0)
        val withPartial = engine.analyze(steady + partial, 199)
        assertEquals(without.acuteLoad!!, withPartial.acuteLoad!!, eps)
        assertEquals(without.chronicLoad!!, withPartial.chronicLoad!!, eps)
        assertEquals(100.0, withPartial.acuteLoad!!, eps)
        // As a stored 0.8 it would have dragged the acute load down by about a quarter.
        val asStored = engine.analyze(steady + DailyLoad(199, 0.8), 199)
        assertTrue(asStored.acuteLoad!! < 80.0)
    }

    // --- Item 3: coupled-ratio gate, first wins, confidence (B4, B12) -----------------------------------

    @Test
    fun `B4 - two recorded days thirteen days apart give no coupled ratio and no zone`() {
        val r = engine.analyze(listOf(DailyLoad(0, 10.0), DailyLoad(13, 200.0)), asOfDay = 13)
        assertEquals(2, r.validDaysLast28)
        assertEquals(14, r.daysOfHistory)
        assertNull(r.acwrCoupled)
        assertNull(r.workloadZone)
    }

    @Test
    fun `the coupled ratio needs 14 recorded days in the last 28`() {
        val thirteen = (0L..12L).map { DailyLoad(it, 50.0) } + DailyLoad(13, null) + DailyLoad(14, null)
        assertNull(engine.analyze(thirteen, 14).acwrCoupled)
        val fourteen = (0L..13L).map { DailyLoad(it, 50.0) }
        assertEquals(1.0, engine.analyze(fourteen, 13).acwrCoupled!!, eps)
    }

    @Test
    fun `B12 - when a day is listed twice the first entry wins`() {
        val r = engine.analyze(listOf(DailyLoad(5, 100.0), DailyLoad(5, 0.0)), asOfDay = 5)
        assertEquals(100.0, r.acuteLoad!!, eps)
        assertEquals(100.0, r.series.single { it.epochDay == 5L }.trimp!!, eps)
        // A first entry that is missing does not shadow a later valid one.
        val skipped = engine.analyze(listOf(DailyLoad(5, null), DailyLoad(5, 60.0)), asOfDay = 5)
        assertEquals(60.0, skipped.acuteLoad!!, eps)
    }

    @Test
    fun `steady training has full confidence`() {
        // 28 active days: density min(1, 28/28) = 1. Recency: yesterday back 15 days all active, acc = 16 - 0.0625*120 = 8.5, x0.25 -> capped at 1.
        val r = engine.analyze(history(List(28) { 100.0 }), 200)
        assertEquals(1.0, r.loadDensity, eps)
        assertEquals(1.0, r.loadRecency, eps)
        assertEquals(1.0, r.loadConfidence, eps)
        assertFalse(r.isCalibrating)
        assertNotNull(r.acwrCoupled)
        assertNotNull(r.workloadZone)
    }

    @Test
    fun `fourteen recorded days of trivial load are calibrating, not a ratio`() {
        // Loads of 3 are not "active" (the active-day line is 5 TRIMP): density 0.
        val r = engine.analyze(history(List(14) { 3.0 }), 200)
        assertEquals(0.0, r.loadDensity, eps)
        assertEquals(0.0, r.loadConfidence, eps)
        assertTrue(r.isCalibrating)
        assertNull(r.acwrCoupled)
        assertNull(r.acwrUncoupled)
        assertNull(r.workloadZone)
        // ATL and CTL are still reported; only the ratios and the zone are withheld.
        assertEquals(3.0, r.acuteLoad!!, eps)
    }

    @Test
    fun `the density line sits at 0_35 - 10 active days pass, 9 do not`() {
        // 14 recorded days, today included; the low days come first so recency is not the limit.
        val tenActive = engine.analyze(history(List(4) { 3.0 } + List(10) { 50.0 }), 200)
        assertEquals(10.0 / 28.0, tenActive.loadDensity, eps)
        assertEquals(1.0, tenActive.loadRecency, eps)
        assertEquals(10.0 / 28.0, tenActive.loadConfidence, eps)
        assertFalse(tenActive.isCalibrating)
        assertNotNull(tenActive.acwrCoupled)

        val nineActive = engine.analyze(history(List(5) { 3.0 } + List(9) { 50.0 }), 200)
        assertEquals(9.0 / 28.0, nineActive.loadDensity, eps)
        assertTrue(nineActive.isCalibrating)
        assertNull(nineActive.acwrCoupled)
        assertNull(nineActive.workloadZone)
    }

    @Test
    fun `recency weighs yesterday fully and loses 0_0625 per day, today excluded`() {
        // 14 active days 41..20 days before the as-of day (density 16/28), then active days 3 and 1 days before it.
        val asOf = 300L
        val old = (asOf - 41..asOf - 28).map { DailyLoad(it, 80.0) }
        val recent = listOf(DailyLoad(asOf - 3, 80.0), DailyLoad(asOf - 1, 80.0))
        val r = engine.analyze(old + recent, asOf)
        assertEquals(16.0 / 28.0, r.loadDensity, eps)
        // Yesterday: ago 0 -> 1.0. Three days before today: ago 2 -> 1 - 0.0625*2 = 0.875. acc 1.875, x0.25.
        assertEquals(1.875 * 0.25, r.loadRecency, eps)
        assertEquals(0.46875, r.loadConfidence, eps)
        assertFalse(r.isCalibrating)
    }

    @Test
    fun `stale data is calibrating even when it is dense`() {
        // 30 active days, the latest of them 31 days before the as-of day.
        val asOf = 300L
        val r = engine.analyze((asOf - 60..asOf - 31).map { DailyLoad(it, 80.0) }, asOf)
        assertEquals(0.0, r.loadRecency, eps)
        assertEquals(0.0, r.loadConfidence, eps)
        assertTrue(r.isCalibrating)
        assertNull(r.acwrCoupled)
        assertNull(r.acwrUncoupled)
    }
}
