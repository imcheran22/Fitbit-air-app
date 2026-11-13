package com.apex.athlete.ui.trends

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.detail.DetailLoad
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class TrendsBrowserViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private fun vm(
        handle: SavedStateHandle = SavedStateHandle(),
        first: MetricType? = null,
        asked: MutableList<Pair<Long, Int>> = ArrayList(),
    ) = TrendsBrowserViewModel(
        initialFirst = first,
        handle = handle,
        loadTrends = { d, r -> asked += d to r; flowOf(TrendIntelligenceState(false, d, r, emptyList())) },
        today = { 20_833L },
    )

    @Test fun theRouteArgumentPreselectsTheFirstFigureOnlyTheFirstTime() {
        val handle = SavedStateHandle()
        val a = vm(handle, MetricType.HRV_RMSSD)
        assertEquals(MetricType.HRV_RMSSD, a.first.value)
        a.selectFirst(MetricType.STEPS)
        // A recreated ViewModel with the same saved state keeps what the owner chose, not the route argument.
        val b = vm(handle, MetricType.HRV_RMSSD)
        assertEquals(MetricType.STEPS, b.first.value)
    }

    @Test fun aMetricThatIsNotBrowsableIsIgnored() {
        assertNull(vm(first = MetricType.BMI).first.value)
    }

    @Test fun theSecondFigureCannotBeTheFirstAndChoosingTheFirstClearsAMatchingSecond() {
        val v = vm()
        v.selectFirst(MetricType.HRV_RMSSD)
        v.selectSecond(MetricType.HRV_RMSSD)
        assertNull(v.second.value)
        v.selectSecond(MetricType.STEPS)
        assertEquals(MetricType.STEPS, v.second.value)
        v.selectFirst(MetricType.STEPS)
        assertEquals(MetricType.STEPS, v.first.value)
        assertNull(v.second.value)
        v.selectFirst(null)
        assertNull(v.first.value)
    }

    @Test fun theRangeSurvivesAndFallsBackToThirtyDays() {
        val handle = SavedStateHandle()
        val v = vm(handle)
        assertEquals(30, v.range.value)
        v.selectRange(180)
        assertEquals(180, handle.get<Int>("trends.range"))
        v.selectRange(45)
        assertEquals(30, v.range.value)
    }

    @Test fun theBrowserLoadsEndingTodayOverTheChosenRange() {
        val asked = ArrayList<Pair<Long, Int>>()
        val v = vm(asked = asked)
        val job = CoroutineScope(Dispatchers.Main).launch { v.state.collect { } }
        assertIs<DetailLoad.Ready<*>>(v.state.value)
        v.selectRange(90)
        assertEquals(20_833L to 90, asked.last())
        job.cancel()
    }
}
