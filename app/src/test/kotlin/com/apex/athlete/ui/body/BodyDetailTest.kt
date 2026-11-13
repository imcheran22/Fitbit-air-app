package com.apex.athlete.ui.body

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.data.repository.BodyState
import com.apex.athlete.core.data.repository.MetricReading
import com.apex.athlete.core.data.repository.MetricTrend
import com.apex.athlete.core.data.repository.ReadingMissing
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.detail.SeriesPanel
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import com.apex.athlete.ui.detail.testTrend
import com.apex.athlete.ui.health.TrendLoad
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
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class BodyDetailTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private fun reading(metric: MetricType, value: Double?, day: Long?, p: DataProvenance?, missing: ReadingMissing? = null) =
        MetricReading(metric, value, day, p, missing)

    private fun state(
        weight: MetricReading,
        bmi: MetricReading = MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_HEIGHT),
        bodyFat: MetricReading = MetricReading.absent(MetricType.BODY_FAT),
        weightHistory: List<TrendPoint> = emptyList(),
        heightCm: Double? = null,
        demo: Boolean = false,
    ) = BodyState(demo, TEST_TODAY, heightCm, weight, bodyFat, bmi, weightHistory, emptyList(), emptyList())

    @Test fun aWeighInIsStoredBodyDataAndKeepsItsProvenance() {
        val s = state(reading(MetricType.WEIGHT, 72.4, TEST_TODAY, DataProvenance.IMPORTED_FILE_ARCHIVE))
        assertTrue(bodyHasStoredReadings(s))
        val ui = buildBodyDetail(s, testFormatter(context))
        assertEquals(MetricState.Value(72.4, 1, "kg", DataProvenance.IMPORTED_FILE_ARCHIVE), ui.weight)
    }

    @Test fun aProfileWeightAloneIsNotStoredBodyDataSoTheEmptyStateExplainsTakeout() {
        val s = state(reading(MetricType.WEIGHT, 70.0, null, DataProvenance.USER_REPORTED))
        assertFalse(bodyHasStoredReadings(s))
        // The number itself is still shown, labelled self-reported.
        val weight = assertIs<MetricState.Value>(buildBodyDetail(s, testFormatter(context)).weight)
        assertEquals(DataProvenance.USER_REPORTED, weight.provenance)
    }

    @Test fun noBodyDataAtAllIsUnavailableNotZero() {
        val s = state(MetricReading.absent(MetricType.WEIGHT))
        val ui = buildBodyDetail(s, testFormatter(context))
        assertFalse(ui.hasStoredReadings)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.weight)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA), ui.bodyFat)
    }

    @Test fun bmiWithoutAHeightSaysSoAndOffersTheProfileLink() {
        val s = state(reading(MetricType.WEIGHT, 72.4, TEST_TODAY, DataProvenance.USER_REPORTED))
        val ui = buildBodyDetail(s, testFormatter(context))
        assertTrue(ui.bmiNeedsHeight)
        assertEquals(MetricState.Unavailable(MetricReason.NO_DATA, "Add your height in Profile to see BMI"), ui.bmi)
    }

    @Test fun aBodyFatReadingAloneCountsAsStored() {
        val s = state(
            MetricReading.absent(MetricType.WEIGHT),
            bodyFat = reading(MetricType.BODY_FAT, 18.5, TEST_TODAY - 2, DataProvenance.IMPORTED_FILE_ARCHIVE),
        )
        assertTrue(bodyHasStoredReadings(s))
        val fat = assertIs<MetricState.Value>(buildBodyDetail(s, testFormatter(context)).bodyFat)
        assertEquals("Wed, Jan 13", fat.asOf)
    }

    @Test fun bmiPointsAreComputedFromEachWeighInAndAreNullWithoutAHeight() {
        val weight = testTrend(MetricType.WEIGHT, listOf(80.0, null, 90.0))
        val withHeight = bmiPoints(weight, 200.0)
        assertEquals(listOf<Double?>(20.0, null, 22.5), withHeight.map { it.value })
        assertEquals(weight.points.map { it.epochDay }, withHeight.map { it.epochDay })
        assertTrue(bmiPoints(weight, null).all { it.value == null })
        assertTrue(bmiPoints(weight, 50.0).all { it.value == null })
    }

    @Test fun theBmiPanelIsDerivedAndEmptyWithoutAHeightOrWeighIns() {
        val f = testFormatter(context)
        val loaded = TrendLoad.Loaded(testTrend(MetricType.WEIGHT, listOf(80.0, 82.0)), 2, TEST_TODAY)
        val ready = assertIs<SeriesPanel.Ready>(bmiPanel(loaded, 200.0, "BMI", f))
        assertEquals("Calculated", ready.ui.provenance)
        assertEquals(listOf<Double?>(20.0, 20.5), ready.ui.series.points.map { it.y })
        assertEquals(SeriesPanel.Empty, bmiPanel(loaded, null, "BMI", f))
        assertEquals(SeriesPanel.Empty, bmiPanel(TrendLoad.Empty, 200.0, "BMI", f))
        assertEquals(SeriesPanel.Loading, bmiPanel(TrendLoad.Loading, 200.0, "BMI", f))
        val noWeighIns = TrendLoad.Loaded(testTrend(MetricType.WEIGHT, listOf(null, null)), 2, TEST_TODAY)
        assertEquals(SeriesPanel.Empty, bmiPanel(noWeighIns, 200.0, "BMI", f))
    }

    @Test fun rangesIncludeOneHundredEightyDays() {
        assertEquals(listOf(7, 30, 90, 180), BODY_RANGES)
        assertEquals(180, sanitizeBodyRange(180))
        assertEquals(90, sanitizeBodyRange(365))
        assertEquals(90, sanitizeBodyRange(null))
    }

    @Test fun theViewModelAsksForWeightAndBodyFatOverTheChosenRange() {
        val asked = ArrayList<Triple<MetricType, Long, Int>>()
        val handle = SavedStateHandle()
        val vm = BodyViewModel(
            initialDay = TEST_TODAY,
            handle = handle,
            loadBody = { flowOf(null) },
            loadTrend = { m, d, r ->
                asked += Triple(m, d, r)
                flowOf<MetricTrend?>(if (m == MetricType.WEIGHT) testTrend(m, List(r) { 70.0 + it % 3 }, d) else null)
            },
            storeReady = flowOf(true),
        )
        val job = CoroutineScope(Dispatchers.Main).launch {
            launch { vm.weight.collect { } }
            launch { vm.bodyFat.collect { } }
        }
        assertEquals(90, assertIs<TrendLoad.Loaded>(vm.weight.value).rangeDays)
        assertEquals(TrendLoad.Empty, vm.bodyFat.value)
        vm.selectRange(180)
        assertEquals(180, assertIs<TrendLoad.Loaded>(vm.weight.value).rangeDays)
        assertEquals(180, handle.get<Int>("body.range"))
        assertTrue(asked.contains(Triple(MetricType.BODY_FAT, TEST_TODAY, 180)))
        assertNull(handle.get<Long>("body.day"))
        vm.setDay(TEST_TODAY - 1)
        assertEquals(TEST_TODAY - 1, assertIs<TrendLoad.Loaded>(vm.weight.value).endDay)
        job.cancel()
    }
}
