package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.load.LoadCaveat
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.domain.DataProvenance
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TrainingLoadEngineTest {

    private val eps = 1e-9
    private val engine = TrainingLoadEngine()

    private fun history(loads: List<Double?>, lastDay: Long = 200) =
        loads.mapIndexed { i, v -> DailyLoad(lastDay - loads.size + 1 + i, v) }

    @Test
    fun `steady training gives equal acute and chronic load and a ratio of one`() {
        val r = engine.analyze(history(List(40) { 50.0 }), 200)
        assertEquals(50.0, r.acuteLoad!!, eps)
        assertEquals(50.0, r.chronicLoad!!, eps)
        assertEquals(1.0, r.acwrCoupled!!, eps)
        assertEquals(1.0, r.acwrUncoupled!!, eps)
        assertEquals(WorkloadZone.SWEET_SPOT, r.workloadZone)
        assertTrue(r.caveats.isEmpty())
        assertEquals(350.0, r.weeklyLoad!!, eps)
        assertEquals(0.0, r.weekOverWeekChange!!, eps)
        assertEquals(1400.0, r.load28d!!, eps)
        assertEquals(0.0, r.trainingBalance!!, eps)
        // Identical days: monotony is capped rather than infinite.
        assertEquals(10.0, r.monotony!!, eps)
        assertEquals(3500.0, r.fosterStrain!!, eps)
    }

    @Test
    fun `a doubled week shows up fully in the uncoupled ratio and is diluted in the coupled one`() {
        val r = engine.analyze(history(List(28) { 40.0 } + List(7) { 80.0 }), 200)
        assertEquals(2.0, r.acwrUncoupled!!, eps)
        val atl = 80 - 40 * 0.75.pow(7)
        val ctl = 80 - 40 * (27.0 / 29.0).pow(7)
        assertEquals(atl, r.acuteLoad!!, 1e-9)
        assertEquals(ctl, r.chronicLoad!!, 1e-9)
        assertEquals(atl / ctl, r.acwrCoupled!!, 1e-9)
        assertTrue(r.acwrCoupled!! < r.acwrUncoupled!!)
        assertEquals(WorkloadZone.HIGH_RISK, r.workloadZone)
        assertEquals(1.0, r.weekOverWeekChange!!, eps)
        assertTrue(r.trainingBalance!! < 0)
        assertTrue(r.chronicLoadChange7d!! > 0)
    }

    @Test
    fun `workload zones follow the documented bands`() {
        assertEquals(WorkloadZone.DETRAINING, engine.zoneFor(0.79))
        assertEquals(WorkloadZone.SWEET_SPOT, engine.zoneFor(0.80))
        assertEquals(WorkloadZone.SWEET_SPOT, engine.zoneFor(1.30))
        assertEquals(WorkloadZone.OVERREACHING, engine.zoneFor(1.31))
        assertEquals(WorkloadZone.OVERREACHING, engine.zoneFor(1.49))
        assertEquals(WorkloadZone.HIGH_RISK, engine.zoneFor(1.50))
    }

    @Test
    fun `foster monotony is mean over sd and strain is weekly load times monotony`() {
        val week = listOf(30.0, 60.0, 0.0, 90.0, 45.0, 0.0, 120.0)
        val r = engine.analyze(history(List(30) { 40.0 } + week), 200)
        val mean = week.average()
        val sd = sqrt(week.sumOf { (it - mean).pow(2) } / 6)
        assertEquals(mean / sd, r.monotony!!, eps)
        assertEquals(week.sum() * mean / sd, r.fosterStrain!!, eps)
    }

    @Test
    fun `short history withholds the ratios and says why`() {
        val tenDays = engine.analyze(history(List(10) { 50.0 }), 200)
        assertNull(tenDays.acwrCoupled)
        assertNull(tenDays.acwrUncoupled)
        assertNull(tenDays.workloadZone)
        assertTrue(LoadCaveat.SHORT_HISTORY in tenDays.caveats)
        assertNotNull(tenDays.acuteLoad)

        val twentyDays = engine.analyze(history(List(20) { 50.0 }), 200)
        assertEquals(1.0, twentyDays.acwrCoupled!!, eps)
        assertNull(twentyDays.acwrUncoupled)
        assertTrue(LoadCaveat.SHORT_HISTORY in twentyDays.caveats)
    }

    @Test
    fun `very low chronic load is flagged as an unreliable denominator`() {
        val r = engine.analyze(history(List(40) { 4.0 }), 200)
        assertTrue(LoadCaveat.LOW_CHRONIC_LOAD in r.caveats)
    }

    @Test
    fun `days without data are skipped while recorded rest days count as zero`() {
        val withGap = engine.analyze(history(List(30) { 50.0 } + listOf(null, null, 50.0)), 200)
        assertEquals(50.0, withGap.acuteLoad!!, eps)
        assertEquals(5, withGap.series.takeLast(7).count { it.trimp != null })

        val withRest = engine.analyze(history(List(30) { 50.0 } + listOf(0.0, 0.0, 50.0)), 200)
        assertTrue(withRest.acuteLoad!! < 50.0)
    }

    @Test
    fun `sparse coverage is flagged`() {
        val sparse = List(40) { i -> if (i % 2 == 0) 50.0 else null }
        val r = engine.analyze(history(sparse), 200)
        assertTrue(LoadCaveat.SPARSE_DATA in r.caveats)
        assertNull(r.acwrUncoupled)
    }

    @Test
    fun `no history yields an explicit unavailable result`() {
        val r = engine.analyze(emptyList(), 200)
        assertNull(r.acuteLoad)
        assertEquals(0, r.daysOfHistory)
        assertEquals(DataProvenance.UNAVAILABLE, r.provenance)
    }
}
