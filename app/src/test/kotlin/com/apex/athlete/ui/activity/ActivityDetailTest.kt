package com.apex.athlete.ui.activity

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.ReadingMissing
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import com.apex.athlete.ui.detail.testTrend
import com.apex.athlete.ui.health.TrendLoad
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertIs

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class ActivityDetailTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val sensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private fun reading(metric: MetricType, value: Double?) =
        MetricReading(metric, value, TEST_TODAY, value?.let { sensor }, if (value == null) ReadingMissing.NO_DATA else null)

    private fun readings(vararg pairs: Pair<MetricType, Double?>): Map<MetricType, MetricReading> =
        MetricType.entries.associateWith { reading(it, null) } + pairs.associate { (m, v) -> m to reading(m, v) }

    @Test fun totalsAndMinutesAreMappedInOrderWithTheirUnitsAndProvenance() {
        val ui = buildActivityDetail(
            TEST_TODAY, false,
            readings(
                MetricType.STEPS to 8_412.0, MetricType.CALORIES_TOTAL to 2_431.0, MetricType.CALORIES_ACTIVE to 512.0,
                MetricType.DISTANCE to 6_210.0, MetricType.FLOORS to 12.0, MetricType.ACTIVE_ZONE_MINUTES to 34.0,
                MetricType.LIGHTLY_ACTIVE_MINUTES to 180.0, MetricType.MODERATELY_ACTIVE_MINUTES to 24.0,
                MetricType.VERY_ACTIVE_MINUTES to 10.0, MetricType.SEDENTARY_MINUTES to 600.0,
            ),
            testFormatter(context),
        )
        assertEquals(MetricState.Value(8_412.0, 0, null, sensor), ui.steps.state)
        assertEquals(ACTIVITY_TOTAL_METRICS, ui.totals.map { it.metric })
        assertEquals(ACTIVITY_LEVEL_METRICS, ui.levels.map { it.metric })
        assertEquals(MetricState.Value(2_431.0, 0, "kcal", sensor), ui.totals[0].state)
        assertEquals(MetricState.Value(6.21, 2, "km", sensor), ui.totals[2].state)
        assertEquals(MetricState.Value(34.0, 0, "min", sensor), ui.totals[4].state)
        assertEquals(MetricState.Value(600.0, 0, "min", sensor), ui.levels[3].state)
    }

    @Test fun distanceFollowsTheUnitSystem() {
        val ui = buildActivityDetail(TEST_TODAY, false, readings(MetricType.DISTANCE to 1_609.344), testFormatter(context, UnitSystem.IMPERIAL))
        val distance = assertIs<MetricState.Value>(ui.totals.first { it.metric == MetricType.DISTANCE }.state)
        assertEquals(1.0, distance.value, 1e-9)
        assertEquals("mi", distance.unit)
    }

    @Test fun missingFiguresAreUnavailableNeverZero() {
        val ui = buildActivityDetail(TEST_TODAY, false, readings(), testFormatter(context))
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.steps.state)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.totals[3].state)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.levels[3].state)
    }

    @Test fun todayIsProvisionalAndSedentaryTimeSaysItWaitsForTheDayToEnd() {
        val ui = buildActivityDetail(TEST_TODAY, true, readings(MetricType.STEPS to 100.0), testFormatter(context))
        assertEquals(true, ui.isProvisional)
        assertEquals(true, assertIs<MetricState.Value>(ui.steps.state).isProvisional)
        val sedentary = assertIs<MetricState.Unavailable>(ui.levels.first { it.metric == MetricType.SEDENTARY_MINUTES }.state)
        assertEquals("Counted once the day has finished.", sedentary.detail)
    }

    @Test fun aFinishedDayWithoutSedentaryTimeKeepsTheGenericReason() {
        val ui = buildActivityDetail(TEST_TODAY - 1, false, readings(), testFormatter(context))
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.levels[3].state)
    }

    @Test fun rangesAndMetricsFallBackToTheDefaults() {
        assertEquals(listOf(7, 30, 90), ACTIVITY_RANGES)
        assertEquals(90, sanitizeActivityRange(90))
        assertEquals(30, sanitizeActivityRange(180))
        assertEquals(30, sanitizeActivityRange(null))
        assertEquals(MetricType.FLOORS, activityChartMetric("floors"))
        assertEquals(MetricType.STEPS, activityChartMetric("rhr"))
        assertEquals(MetricType.STEPS, activityChartMetric(null))
    }

    @Test fun theViewModelChartsTheChosenFigureOverTheChosenRangeAndKeepsBothInTheHandle() {
        val asked = ArrayList<Triple<MetricType, Long, Int>>()
        val handle = SavedStateHandle()
        val ready = MutableStateFlow(true)
        val vm = ActivityDetailViewModel(
            initialDay = TEST_TODAY,
            handle = handle,
            loadDay = { flowOf(null) },
            loadTrend = { m, d, r ->
                asked += Triple(m, d, r)
                flowOf<MetricTrend?>(testTrend(m, List(r) { 1.0 + it }, d))
            },
            storeReady = ready,
        )
        val job = CoroutineScope(Dispatchers.Main).launch { vm.chart.collect { } }
        val first = assertIs<TrendLoad.Loaded>(vm.chart.value)
        assertEquals(MetricType.STEPS, first.trend.metric)
        assertEquals(30, first.rangeDays)
        assertEquals(TEST_TODAY, first.endDay)

        vm.selectRange(90)
        vm.selectMetric(MetricType.FLOORS)
        val second = assertIs<TrendLoad.Loaded>(vm.chart.value)
        assertEquals(MetricType.FLOORS, second.trend.metric)
        assertEquals(90, second.rangeDays)
        assertEquals("floors", handle.get<String>("activity.metric"))
        assertEquals(90, handle.get<Int>("activity.range"))

        // An unsupported range falls back; the day the pill moves to is the end of the window.
        vm.selectRange(5)
        assertEquals(30, vm.range.value)
        vm.setDay(TEST_TODAY - 3)
        assertEquals(TEST_TODAY - 3, assertIs<TrendLoad.Loaded>(vm.chart.value).endDay)
        assertEquals(true, asked.any { it.second == TEST_TODAY - 3 })
        job.cancel()
    }

    @Test fun aMetricWithNoReadingsIsEmptyOnceTheStoreIsReadyAndLoadingBefore() {
        val ready = MutableStateFlow(false)
        val vm = ActivityDetailViewModel(TEST_TODAY, SavedStateHandle(), { flowOf(null) }, { _, _, _ -> flowOf<MetricTrend?>(null) }, ready)
        val job = CoroutineScope(Dispatchers.Main).launch { vm.chart.collect { } }
        assertEquals(TrendLoad.Loading, vm.chart.value)
        ready.value = true
        assertEquals(TrendLoad.Empty, vm.chart.value)
        job.cancel()
    }
}
