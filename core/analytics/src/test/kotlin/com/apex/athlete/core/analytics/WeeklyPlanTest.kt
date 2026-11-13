package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.plan.NoPlanReason
import com.apex.athlete.core.analytics.plan.PlanAdjustment
import com.apex.athlete.core.analytics.plan.PlanConfidence
import com.apex.athlete.core.analytics.plan.PlanLowConfidenceReason
import com.apex.athlete.core.analytics.plan.StrainBand
import com.apex.athlete.core.analytics.plan.StrainBand.HARD
import com.apex.athlete.core.analytics.plan.StrainBand.LIGHT
import com.apex.athlete.core.analytics.plan.StrainBand.MODERATE
import com.apex.athlete.core.analytics.plan.StrainBand.REST
import com.apex.athlete.core.analytics.plan.WeeklyPlanEngine
import com.apex.athlete.core.analytics.plan.WeeklyPlanInput
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Hand-computed expectations for the weekly plan (docs/FORMULAS.md, "Pulse parity engines", P2). */
class WeeklyPlanTest {

    private val start = 20_000L

    private fun input(
        base: Double? = 10.0,
        recovery: Double? = 70.0,
        zone: WorkloadZone? = WorkloadZone.SWEET_SPOT,
        calibrating: Boolean = false,
        need: Double? = 480.0,
        unavailable: Set<Long> = emptySet(),
    ) = WeeklyPlanInput(start, base, recovery, zone, calibrating, need, unavailable)

    private fun bands(r: com.apex.athlete.core.analytics.plan.WeeklyPlanResult) = assertNotNull(r.plan).days.map { it.band }

    @Test
    fun fullInputsGiveTheDefaultPatternWithPersonalStrainCentres() {
        val plan = assertNotNull(WeeklyPlanEngine().plan(input()).plan)
        assertEquals(listOf(MODERATE, HARD, LIGHT, HARD, MODERATE, LIGHT, REST), plan.days.map { it.band })
        assertEquals((0L..6L).map { start + it }, plan.days.map { it.epochDay })
        // base 10: MODERATE 1.0x = 10, HARD 1.3x = 13, LIGHT 0.7x = 7, REST 0.4x = 4
        listOf(10.0, 13.0, 7.0, 13.0, 10.0, 7.0, 4.0).zip(plan.days.map { it.strainCentre }).forEach { (e, a) -> assertEquals(e, a, 1e-9) }
        assertTrue(plan.days.all { it.sleepTargetMinutes == 480.0 })
        assertEquals(PlanConfidence.NORMAL, plan.confidence)
        assertTrue(plan.lowConfidenceReasons.isEmpty())
        assertTrue(plan.suggestionOnly)
    }

    @Test
    fun strainCentreIsCappedAtTheScaleMaximum() {
        val plan = assertNotNull(WeeklyPlanEngine().plan(input(base = 20.0)).plan)
        assertEquals(21.0, plan.days[1].strainCentre, 0.0) // 1.3 x 20 = 26 -> 21
    }

    @Test
    fun recoveryBelow34MakesTheFirstDayRest() {
        val low = bands(WeeklyPlanEngine().plan(input(recovery = 33.0)))
        assertEquals(REST, low[0])
        assertEquals(MODERATE, bands(WeeklyPlanEngine().plan(input(recovery = 34.0)))[0])
        val plan = assertNotNull(WeeklyPlanEngine().plan(input(recovery = 33.9)).plan)
        assertEquals(PlanAdjustment.LOW_RECOVERY, plan.days[0].adjustment)
        assertEquals(PlanConfidence.NORMAL, plan.confidence) // a low score is information, not low confidence
    }

    @Test
    fun highLoadZoneMakesTheFirstDayRestAndOverreachingMakesItLight() {
        assertEquals(REST, bands(WeeklyPlanEngine().plan(input(zone = WorkloadZone.HIGH_RISK)))[0])
        val over = assertNotNull(WeeklyPlanEngine().plan(input(zone = WorkloadZone.OVERREACHING)).plan)
        assertEquals(LIGHT, over.days[0].band)
        assertEquals(PlanAdjustment.ELEVATED_LOAD_RATIO, over.days[0].adjustment)
        // Detraining and sweet spot change nothing.
        assertEquals(MODERATE, bands(WeeklyPlanEngine().plan(input(zone = WorkloadZone.DETRAINING)))[0])
    }

    @Test
    fun overreachingNeverRaisesAnAlreadyRestDay() {
        // Recovery 10 asks for REST; the milder load rule must not lift it to LIGHT.
        assertEquals(REST, bands(WeeklyPlanEngine().plan(input(recovery = 10.0, zone = WorkloadZone.OVERREACHING)))[0])
    }

    @Test
    fun calibratingLoadIsLowConfidenceAndItsZoneIsIgnored() {
        val r = WeeklyPlanEngine().plan(input(zone = WorkloadZone.HIGH_RISK, calibrating = true))
        val plan = assertNotNull(r.plan)
        assertEquals(PlanConfidence.LOW, plan.confidence)
        assertEquals(setOf(PlanLowConfidenceReason.LOAD_CALIBRATING), plan.lowConfidenceReasons)
        assertEquals(MODERATE, plan.days[0].band) // not forced to REST by a ratio that is still calibrating
    }

    @Test
    fun missingInputsAreLowConfidenceWithEachReasonAndNoSleepTargetIsInvented() {
        val plan = assertNotNull(WeeklyPlanEngine().plan(input(recovery = null, zone = null, need = null)).plan)
        assertEquals(PlanConfidence.LOW, plan.confidence)
        assertEquals(
            setOf(PlanLowConfidenceReason.RECOVERY_MISSING, PlanLowConfidenceReason.LOAD_MISSING, PlanLowConfidenceReason.SLEEP_NEED_MISSING),
            plan.lowConfidenceReasons,
        )
        assertTrue(plan.days.all { it.sleepTargetMinutes == null })
        assertTrue(plan.suggestionOnly)
        assertEquals(listOf(MODERATE, HARD, LIGHT, HARD, MODERATE, LIGHT, REST), plan.days.map { it.band })
    }

    @Test
    fun noStrainBaseMeansNoPlan() {
        for (b in listOf(null, Double.NaN, Double.NEGATIVE_INFINITY)) {
            val r = WeeklyPlanEngine().plan(input(base = b))
            assertNull(r.plan)
            assertEquals(NoPlanReason.STRAIN_BASE_MISSING, r.noPlanReason)
        }
        assertNull(WeeklyPlanEngine().plan(input()).noPlanReason)
    }

    @Test
    fun unavailableDaysAreRestAndFlagged() {
        val plan = assertNotNull(WeeklyPlanEngine().plan(input(unavailable = setOf(start + 1, start + 3, start + 99))).plan)
        assertEquals(listOf(MODERATE, REST, LIGHT, REST, MODERATE, LIGHT, REST), plan.days.map { it.band })
        assertEquals(listOf(false, true, false, true, false, false, false), plan.days.map { it.unavailable })
        assertEquals(PlanAdjustment.ATHLETE_UNAVAILABLE, plan.days[1].adjustment)
    }

    @Test
    fun allDaysUnavailableIsAllRest() {
        val plan = assertNotNull(WeeklyPlanEngine().plan(input(unavailable = (0L..6L).map { start + it }.toSet())).plan)
        assertTrue(plan.days.all { it.band == REST })
    }

    @Test
    fun constraintsRepairAnAllHardTemplateExactly() {
        // H H H H H H H: adjacency demotes days 1,3,5 -> H M H M H M H; the cap of 3 demotes the last HARD (day 6) -> M;
        // no REST left, so the latest least-demanding day (day 6, MODERATE; all others are >= MODERATE) becomes REST.
        val plan = assertNotNull(WeeklyPlanEngine(WeeklyPlanEngine.Config(template = List(7) { HARD })).plan(input()).plan)
        assertEquals(listOf(HARD, MODERATE, HARD, MODERATE, HARD, MODERATE, REST), plan.days.map { it.band })
    }

    @Test
    fun everyPossibleTemplateSatisfiesTheInvariants() {
        val all = StrainBand.entries
        var n = 0
        fun walk(prefix: List<StrainBand>) {
            if (prefix.size == 7) {
                n++
                for (unavail in listOf(emptySet(), setOf(start + 2), setOf(start, start + 6))) {
                    val plan = assertNotNull(
                        WeeklyPlanEngine(WeeklyPlanEngine.Config(template = prefix)).plan(input(unavailable = unavail)).plan,
                    )
                    val b = plan.days.map { it.band }
                    assertTrue(b.count { it == HARD } <= 3, "max 3 HARD: $prefix -> $b")
                    assertTrue(b.zipWithNext().none { (x, y) -> x == HARD && y == HARD }, "no back-to-back HARD: $prefix -> $b")
                    assertTrue(b.any { it == REST }, "at least one REST: $prefix -> $b")
                    assertEquals(7, b.size)
                }
                return
            }
            all.forEach { walk(prefix + it) }
        }
        walk(emptyList())
        assertEquals(16_384, n)
    }

    @Test
    fun nonSevenDayTemplateIsRejected() {
        var threw = false
        try { WeeklyPlanEngine.Config(template = listOf(REST)) } catch (e: IllegalArgumentException) { threw = true }
        assertTrue(threw)
        assertFalse(WeeklyPlanEngine.Config().template.isEmpty())
    }
}
