package com.apex.athlete.ui.reports

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testTrend
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class ReportsViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val trends = MutableStateFlow<TrendIntelligenceState?>(null)

    private fun vm(handle: SavedStateHandle = SavedStateHandle()) = ReportsViewModel(
        today = TEST_TODAY, trends = trends, workouts = flowOf(emptyList()), goals = flowOf(emptyList()),
        loadAt = { flowOf(LoadSnapshot(WorkloadZone.SWEET_SPOT, false)) }, handle = handle,
    ).also { v ->
        CoroutineScope(Dispatchers.Main).launch { v.list.collect { } }
        CoroutineScope(Dispatchers.Main).launch { v.detail.collect { } }
    }

    private fun ready() = TrendIntelligenceState(false, TEST_TODAY, 230, listOf(testTrend(MetricType.RECOVERY_SCORE, List(20) { 60.0 + it })))

    @Test fun listIsLoadingThenHasTwelveWeeksNewestFirst() {
        val v = vm()
        assertEquals(ReportsUi.Loading, v.list.value)
        trends.value = ready()
        val list = assertIs<ReportsUi.Ready>(v.list.value)
        assertEquals(WEEKS_LISTED, list.items.size)
        assertEquals(true, list.items.first().partial)
        assertEquals(false, list.items.last().partial)
    }

    @Test fun switchingToMonthsListsSixAndClosesTheDetail() {
        val v = vm()
        trends.value = ready()
        v.open(123L)
        v.setType(ReportPeriodType.MONTH)
        assertNull(v.selected.value)
        assertEquals(MONTHS_LISTED, assertIs<ReportsUi.Ready>(v.list.value).items.size)
    }

    @Test fun detailCarriesTheLoadZoneOfTheLastDay() {
        val v = vm()
        trends.value = ready()
        val start = (v.list.value as ReportsUi.Ready).items.first().startEpochDay
        v.open(start)
        assertEquals(WorkloadZone.SWEET_SPOT, v.detail.value!!.loadAtEnd.zone)
    }

    @Test fun selectionSurvivesProcessDeath() {
        val handle = SavedStateHandle()
        vm(handle).open(555L)
        assertEquals(555L, vm(handle).selected.value)
    }
}
