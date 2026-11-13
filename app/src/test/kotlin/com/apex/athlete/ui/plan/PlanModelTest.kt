package com.apex.athlete.ui.plan

import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.plan.NoPlanReason
import com.apex.athlete.core.analytics.plan.PlanAdjustment
import com.apex.athlete.core.analytics.plan.PlanLowConfidenceReason
import com.apex.athlete.core.analytics.plan.StrainBand
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PlanModelTest {
    private val today = 19_723L
    private fun ready(s: PlanSource) = assertIs<PlanUi.Ready>(buildPlanUi(s, today))

    @Test fun unknownSourceIsLoading() = assertEquals(PlanUi.Loading, buildPlanUi(null, today))

    @Test fun noStrainBaseMeansNoPlanAndNoInventedNumbers() {
        val ui = buildPlanUi(PlanSource(null, 70.0, WorkloadZone.SWEET_SPOT, false, 480.0), today)
        assertEquals(PlanUi.NoPlan(NoPlanReason.STRAIN_BASE_MISSING), ui)
    }

    @Test fun sevenDaysFromTodayWithDerivedProvenance() {
        val ui = ready(PlanSource(10.0, 75.0, WorkloadZone.SWEET_SPOT, false, 480.0))
        assertEquals((0L..6L).map { today + it }, ui.days.map { it.epochDay })
        assertFalse(ui.lowConfidence)
        ui.days.forEach {
            val v = assertIs<MetricState.Value>(it.strainCentre)
            assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, v.provenance)
            assertTrue(v.value in 0.0..21.0)
        }
        assertEquals(480.0, (ui.sleepTarget as MetricState.Value).value)
        // The default pattern has two hard days, never back to back, and at least one rest day.
        assertTrue(ui.days.any { it.band == StrainBand.REST })
        assertTrue(ui.days.zipWithNext().none { (a, b) -> a.band == StrainBand.HARD && b.band == StrainBand.HARD })
    }

    @Test fun lowRecoveryMakesTodayARestDayWithThatReason() {
        val ui = ready(PlanSource(10.0, 20.0, WorkloadZone.SWEET_SPOT, false, 480.0))
        assertEquals(StrainBand.REST, ui.days.first().band)
        assertEquals(PlanReason.Adjusted(PlanAdjustment.LOW_RECOVERY), ui.days.first().reason)
        assertEquals(PlanReason.Pattern(ui.days[1].band), ui.days[1].reason)
    }

    @Test fun missingInputsGiveLowConfidenceWithReasonsAndNoSleepNumber() {
        val ui = ready(PlanSource(10.0, null, null, true, null))
        assertTrue(ui.lowConfidence)
        assertTrue(PlanLowConfidenceReason.RECOVERY_MISSING in ui.lowConfidenceReasons)
        assertTrue(PlanLowConfidenceReason.SLEEP_NEED_MISSING in ui.lowConfidenceReasons)
        assertTrue(PlanLowConfidenceReason.LOAD_CALIBRATING in ui.lowConfidenceReasons)
        assertIs<MetricState.Unavailable>(ui.sleepTarget)
    }

    @Test fun everyReasonAndBandHasText() {
        PlanAdjustment.entries.forEach { reasonRes(PlanReason.Adjusted(it)) }
        StrainBand.entries.forEach { reasonRes(PlanReason.Pattern(it)); bandLabelRes(it) }
        PlanLowConfidenceReason.entries.forEach { lowConfidenceRes(it) }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test fun viewModelMapsTheSourceFlow() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        try {
            val source = MutableStateFlow<PlanSource?>(null)
            val vm = PlanViewModel(today, source)
            CoroutineScope(Dispatchers.Main).launch { vm.state.collect { } }
            assertEquals(PlanUi.Loading, vm.state.value)
            source.value = PlanSource(10.0, 70.0, WorkloadZone.SWEET_SPOT, false, 450.0)
            assertIs<PlanUi.Ready>(vm.state.value)
        } finally {
            Dispatchers.resetMain()
        }
    }
}
